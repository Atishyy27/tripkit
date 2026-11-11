/*
 * DOM tests for the Now view. Seeds a saved trip into localStorage, resumes it in a
 * real browser and drives the Now tab with a pinned clock. No network: the page is
 * served from docs/ and every request outside it is aborted.
 *
 *   node tests/now-dom.js
 *
 * Needs playwright, like tests/browser.js, and skips when it is missing.
 */
const path = require("path");
const http = require("http");
const fs = require("fs");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  console.log("\n  playwright not installed, skipping Now DOM tests\n");
  process.exit(0);
}

const DOCS = path.join(__dirname, "..", "docs");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".json": "application/json", ".webmanifest": "application/manifest+json",
               ".svg": "image/svg+xml", ".png": "image/png" };

function serve() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(DOCS, p);
      if (!f.startsWith(DOCS) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(0, "127.0.0.1", () => resolve({ server: s, port: s.address().port }));
  });
}

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) { pass++; console.log("    \x1b[32m✓\x1b[0m " + what); }
  else { fail++; console.log("    \x1b[31m✗\x1b[0m " + what); }
};

const place = (id, name, i, extra) => Object.assign({
  id, name, cat: "temple", town: "Testville", lat: 26.487 + i * 0.001, lng: 74.551,
  dur: 30, tags: [], best: ["10:00"], open: "07:00", close: "22:00", why: "a real place", lo: i,
}, extra || {});

function trip(day) {
  return {
    v: 1, built: 0,
    place: { name: "Testville", label: "Testville", lat: 26.487, lng: 74.551, country: "", countryCode: "", bbox: null },
    config: { arrive: 540, depart: 1260, hopMinutes: 0, exitBufferMinutes: 45, tzOffsetMinutes: 0 },
    conditions: { sunrise: 372, sunset: 1128 },
    places: [
      place("a", "Alpha Temple", 0), place("b", "Bravo Ghat", 1), place("c", "Charlie Market", 2),
      place("n", "No Hours Shrine", 3, { open: null, close: null }),
    ],
    days: [Object.assign({ label: "Day 1", plan: ["a", "b", "c"], start: null,
                           manualOrder: true, autoPace: null, autoNotes: [] }, day || {})],
    day: 0,
  };
}

(async () => {
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}/`;
  console.log("\n  Now view DOM tests against " + base);
  const browser = await chromium.launch();
  const errors = [];

  async function fresh(seed, iso) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.route(u => !u.href.startsWith(base), r => r.abort());
    page.on("pageerror", e => errors.push(String(e.message)));
    await page.clock.setFixedTime(new Date(iso || "2026-09-16T10:00:00Z"));
    await page.addInitScript(t => { if (!localStorage.getItem("tripkit.trip")) localStorage.setItem("tripkit.trip", t); }, JSON.stringify(seed));
    await page.goto(base, { waitUntil: "load" });
    await page.click("#resumeBtn");
    return { ctx, page };
  }
  const nowText = page => page.locator("#vNow").innerText();
  const head = page => page.locator("#vNow h3").first().innerText();
  const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem("tripkit.trip")).days[0]);

  try {
    console.log("\n  a planned trip opens on Now and names the next stop");
    let { ctx, page } = await fresh(trip());
    ok(await page.locator("#vNow").isVisible(), "the Now view is showing");
    ok(await page.locator('#views [data-v="now"]').getAttribute("aria-pressed") === "true", "the Now chip is pressed");
    ok(/Alpha Temple/.test(await head(page)), "the headline is the first planned stop");
    ok(/Then\s+Bravo Ghat/.test(await nowText(page)), "the stop after it is named");

    console.log("\n  done moves on, skip moves on, and both persist");
    await page.click("#vNow [data-done]");
    ok(/Bravo Ghat/.test(await head(page)), "marking done advances the headline");
    await page.click("#vNow [data-skip]");
    ok(/Charlie Market/.test(await head(page)), "skipping advances the headline");
    let d = await saved(page);
    ok(d.done.join() === "a" && d.skipped.join() === "b", `marks are saved on the day (${d.done} / ${d.skipped})`);
    ok(/1 done, 1 skipped/.test(await nowText(page)), "the tally reads 1 done, 1 skipped");
    await page.reload({ waitUntil: "load" });
    await page.click("#resumeBtn");
    ok(/Charlie Market/.test(await head(page)), "marks survive a reload");

    console.log("\n  finishing the day, then starting it over");
    await page.click("#vNow [data-done]");
    ok(/That is the day/.test(await nowText(page)), "the closing card shows when nothing is left");
    await page.click("#nowReset");
    d = await saved(page);
    ok(d.done.length === 0 && d.skipped.length === 0, "start over clears both lists");
    ok(/Alpha Temple/.test(await head(page)), "the day is back from the top");
    await ctx.close();

    console.log("\n  marks expire when the trip day passes");
    ({ ctx, page } = await fresh(trip({ done: ["a", "b"], skipped: ["c"], markedOn: "2026-09-15" })));
    ok(/Alpha Temple/.test(await head(page)), "yesterday's marks no longer hide today's stops");
    d = await saved(page);
    ok(d.done.length === 0 && d.skipped.length === 0, "the expired marks are cleared from storage");
    await ctx.close();

    ({ ctx, page } = await fresh(trip({ done: ["a"], skipped: [], markedOn: "2026-09-16" })));
    ok(/Bravo Ghat/.test(await head(page)), "marks made today are kept");
    await ctx.close();

    const ist = trip();
    ist.config.tzOffsetMinutes = 330;
    ({ ctx, page } = await fresh(ist, "2026-09-16T23:30:00Z"));
    await page.click("#vNow [data-done]");
    d = await saved(page);
    ok(d.markedOn === "2026-09-17", `a mark is stamped with the trip-local date, not UTC (${d.markedOn})`);
    await ctx.close();

    console.log("\n  a session past midnight still belongs to the evening before");
    ({ ctx, page } = await fresh(trip({ done: ["a"], skipped: [], markedOn: "2026-09-16" }), "2026-09-17T01:30:00Z"));
    ok(/Bravo Ghat/.test(await head(page)), "marks from before midnight are kept at 01:30");
    await page.click("#vNow [data-done]");
    d = await saved(page);
    ok(d.markedOn === "2026-09-16", `a mark at 01:30 is stamped with the evening's date (${d.markedOn})`);
    ok(d.done.join() === "a,b", `earlier marks survive a new one (${d.done})`);
    await ctx.close();

    ({ ctx, page } = await fresh(trip({ done: ["a", "b"], skipped: ["c"], markedOn: "2026-09-16" }), "2026-09-17T04:30:00Z"));
    ok(/Alpha Temple/.test(await head(page)), "from 04:00 the new day starts clean");
    await ctx.close();

    console.log("\n  removing a marked stop from the plan drops its mark");
    ({ ctx, page } = await fresh(trip({ done: ["a"], skipped: ["b"], markedOn: "2026-09-16" })));
    await page.evaluate(() => { togglePick("a"); togglePick("b"); });
    d = await saved(page);
    ok(d.done.length === 0 && d.skipped.length === 0, "dropped stops leave no marks behind");
    await page.evaluate(() => { togglePick("a"); drawNow(); });
    ok(/Alpha Temple/.test(await nowText(page)), "re-adding a stop does not resurrect it as done");
    await ctx.close();

    console.log("\n  ask-locals: a stop with no recorded hours says to ask a local");
    ({ ctx, page } = await fresh(trip({ plan: ["n", "a"] })));
    ok(/Ask a local/.test(await nowText(page)), "the headline stop with no hours points at asking a local");
    await ctx.close();

    console.log("\n  an empty day points at the day builder");
    ({ ctx, page } = await fresh(trip({ plan: [] })));
    await page.click('#views [data-v="now"]');
    ok(/Nothing planned/.test(await nowText(page)), "the empty state is shown");
    ok(await page.locator("#nowToPlan").count() === 1, "it offers Build my day");
    await ctx.close();

    ok(errors.length === 0, "no javascript exceptions" + (errors.length ? ": " + errors.slice(0, 2).join(" | ") : ""));
  } catch (e) {
    fail++;
    console.log("    \x1b[31m✗\x1b[0m " + e.message.split("\n")[0]);
  } finally {
    await browser.close();
    server.close();
  }

  console.log("");
  console.log(fail ? `  \x1b[31m${fail} failed\x1b[0m, ${pass} passed\n` : `  \x1b[32mall ${pass} passed\x1b[0m\n`);
  process.exit(fail ? 1 : 0);
})();
