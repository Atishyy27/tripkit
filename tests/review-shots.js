/* Before and after screenshots for the 25 Nov 2026 review, taken in CI.
   BEFORE_DIR is a checkout of docs/ from origin/main; AFTER_DIR is this branch.
   Every outside call is answered from tests/fixtures, with a delay so the
   difference between one-after-another and together can be seen and timed.
     node tests/review-shots.js
   Writes docs/review-2026-11-25/shots/*.jpg and timing.json. Needs playwright. */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..");
const AFTER = path.join(ROOT, "docs");
const BEFORE = process.env.BEFORE_DIR || path.join(ROOT, "before-docs");
const OUT = path.join(ROOT, "docs", "review-2026-11-25", "shots");
const FIX = n => JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", n + ".json"), "utf8"));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".txt": "text/plain" };
const DELAY = 2000;

function serve(dir) {
  return new Promise(res => {
    const s = http.createServer((rq, rs) => {
      let p = decodeURIComponent(rq.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(dir, p);
      if (!f.startsWith(dir) || !fs.existsSync(f)) { rs.writeHead(404); return rs.end(); }
      rs.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rs);
    });
    s.listen(0, "127.0.0.1", () => res({ s, base: `http://127.0.0.1:${s.address().port}/` }));
  });
}

// Weather for a synthetic Bali stop: the real captured Lisbon shape, offset +8.
const weather = FIX("weather-lisbon");
weather.utc_offset_seconds = 28800; weather.timezone = "Asia/Makassar";
const BODY = { overpass: FIX("overpass-lisbon"), wikivoyage: FIX("wikivoyage-lisbon"), weather };

async function wire(page, base, delay) {
  const serveJson = (body, ms) => async route => {
    if (ms) await new Promise(r => setTimeout(r, ms));
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  };
  await page.route(u => !u.href.startsWith(base), r => r.abort());
  await page.route("**/api/interpreter", serveJson(BODY.overpass, delay));
  await page.route("**en.wikivoyage.org/w/api.php**", serveJson(BODY.wikivoyage, delay));
  await page.route("**api.open-meteo.com/v1/forecast**", serveJson(BODY.weather, delay));
}

const UBUD = { name: "Ubud", label: "Ubud, Bali, Indonesia", lat: -8.5069, lng: 115.2625,
               country: "Indonesia", countryCode: "ID", bbox: null };

const place = (id, name, i, extra) => Object.assign({
  id, name, cat: "temple", town: "Testville", lat: 26.487 + i * 0.001, lng: 74.551,
  dur: 30, tags: [], best: ["10:00"], open: "07:00", close: "22:00", why: "a real place", lo: i }, extra || {});
const trip = day => ({
  v: 1, built: 0,
  place: { name: "Testville", label: "Testville", lat: 26.487, lng: 74.551, country: "", countryCode: "", bbox: null },
  config: { arrive: 540, depart: 1260, hopMinutes: 0, exitBufferMinutes: 45, tzOffsetMinutes: 0 },
  conditions: { sunrise: 372, sunset: 1128 },
  places: [place("a", "Alpha Temple", 0), place("b", "Bravo Ghat", 1), place("c", "Charlie Market", 2)],
  days: [Object.assign({ label: "Day 1", plan: ["a", "b", "c"], start: null, manualOrder: true, autoPace: null, autoNotes: [] }, day || {})],
  day: 0 });

const VIEWS = { desktop: { width: 1280, height: 800 }, "360": { width: 360, height: 740 } };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const timing = { delay_ms_per_source: DELAY };
  const browser = await chromium.launch();
  const side = { before: await serve(BEFORE), after: await serve(AFTER) };

  async function shot(page, name, v, side_) {
    const f = path.join(OUT, `${side_}-${name}-${v}.jpg`);
    await page.screenshot({ path: f, type: "jpeg", quality: 70 });
    const kb = Math.round(fs.statSync(f).size / 1024);
    if (kb > 300) throw new Error(f + " is " + kb + " KB");
    console.log("  " + path.basename(f) + " " + kb + " KB");
  }

  for (const sideName of ["before", "after"]) {
    const { base } = side[sideName];
    for (const [v, size] of Object.entries(VIEWS)) {
      // A: the timezone box for a Bali stop
      let ctx = await browser.newContext({ viewport: size });
      let page = await ctx.newPage();
      await wire(page, base, 0);
      await page.goto(base, { waitUntil: "load" });
      await page.evaluate(p => pick(p), UBUD);
      await page.waitForTimeout(800);
      await page.locator("#tz").scrollIntoViewIfNeeded();
      await shot(page, "timezone", v, sideName);
      if (v === "desktop") timing[sideName + "_tz_box"] = await page.inputValue("#tz");
      await ctx.close();

      // B: the build screen a moment in, and the whole build timed
      ctx = await browser.newContext({ viewport: size });
      page = await ctx.newPage();
      await wire(page, base, DELAY);
      await page.goto(base, { waitUntil: "load" });
      const t0 = Date.now();
      await page.evaluate(p => { PLACE = p; build(); }, UBUD);
      await page.waitForTimeout(900);
      await shot(page, "build-progress", v, sideName);
      if (v === "desktop") {
        await page.waitForSelector("#s4.on", { timeout: 60000 });
        timing[sideName + "_build_ms"] = Date.now() - t0;
      }
      await ctx.close();

      // C and D: Now view, with a pinned clock
      const fresh = async (seed, iso) => {
        const c = await browser.newContext({ viewport: size });
        const pg = await c.newPage();
        await pg.route(u => !u.href.startsWith(base), r => r.abort());
        await pg.clock.setFixedTime(new Date(iso));
        await pg.addInitScript(t => { if (!localStorage.getItem("tripkit.trip")) localStorage.setItem("tripkit.trip", t); }, JSON.stringify(seed));
        await pg.goto(base, { waitUntil: "load" });
        await pg.click("#resumeBtn");
        return { c, pg };
      };
      let r = await fresh(trip(), "2026-09-16T10:00:00Z");
      await r.pg.click("#vNow [data-done]");
      await r.pg.waitForTimeout(400);
      await shot(r.pg, "survey-after-done", v, sideName);
      await r.c.close();

      r = await fresh(trip({ done: ["a"], skipped: [], markedOn: "2026-09-16" }), "2026-09-17T01:30:00Z");
      await r.pg.waitForTimeout(300);
      await shot(r.pg, "now-past-midnight", v, sideName);
      if (v === "desktop") timing[sideName + "_0130_headline"] = (await r.pg.locator("#vNow h3").first().innerText()).trim();
      await r.c.close();
    }
  }
  fs.writeFileSync(path.join(OUT, "..", "timing.json"), JSON.stringify(timing, null, 2) + "\n");
  console.log(JSON.stringify(timing, null, 2));
  await browser.close();
  side.before.s.close(); side.after.s.close();
})().catch(e => { console.error(e); process.exit(1); });
