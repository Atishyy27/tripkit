/*
 * Loads the real page in a real browser and uses it.
 *
 * This exists because the app shipped completely dead twice in one day, and both
 * times every asset returned 200, every file parsed, and every other test passed.
 * Nothing was loading the page assembled. This does.
 *
 *   node tests/browser.js                    against the local files
 *   node tests/browser.js https://...        against a deployed URL
 *
 * Needs playwright. It is not a project dependency and CI installs it in its own
 * job, so a missing browser skips rather than fails.
 */
const path = require("path");
const http = require("http");
const fs = require("fs");

const TARGET = process.argv[2] || null;
const DOCS = path.join(__dirname, "..", "docs");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  console.log("\n  playwright not installed, skipping browser tests");
  console.log("  install with: npm i -D playwright && npx playwright install chromium\n");
  process.exit(0);
}

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

(async () => {
  const local = TARGET ? null : await serve();
  const base = TARGET || `http://127.0.0.1:${local.port}/`;
  console.log("\n  browser tests against " + base);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  try {
    console.log("\n  the page loads");
    await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
    ok(errors.length === 0, "no javascript errors on load" +
       (errors.length ? "\n        " + errors.slice(0, 3).join("\n        ") : ""));
    ok(await page.locator("#q").isVisible(), "the search box is visible");
    ok((await page.title()).length > 0, "the page has a title");

    console.log("\n  the engine is actually wired up");
    const wired = await page.evaluate(() => ({
      engine: typeof rankNow === "function" && typeof openState === "function",
      sun: typeof sunTimes === "function",
      sources: typeof parseListings === "function" && typeof osmToPlaces === "function",
      leaflet: typeof L !== "undefined",
      noClash: typeof GUIDE !== "undefined" || GUIDE === null,
    }));
    ok(wired.engine, "the ranking engine is defined");
    ok(wired.sun, "the sun maths is defined");
    ok(wired.sources, "the parsers are defined");
    ok(wired.leaflet, "Leaflet loaded");

    console.log("\n  searching finds a place");
    await page.fill("#q", "Pushkar");
    await page.waitForSelector("#hits .hit", { timeout: 45000 });
    const hits = await page.locator("#hits .hit").count();
    ok(hits > 0, `search returned ${hits} results`);

    console.log("\n  choosing one moves to the clock screen");
    await page.locator("#hits .hit").first().click();
    await page.waitForSelector("#s2.on", { timeout: 15000 });
    ok(await page.locator("#arrive").isVisible(), "the arrival time input is shown");
    const tz = await page.inputValue("#tz");
    ok(tz === "330", `the India timezone was guessed correctly (${tz})`);

    console.log("\n  building actually progresses past the first step");
    await page.click("#goBtn");
    await page.waitForSelector("#s3.on", { timeout: 15000 });
    // This is the assertion that would have caught both outages.
    await page.waitForFunction(
      () => document.querySelector("#stOsm") &&
            document.querySelector("#stOsm").className.match(/now|done|fail/),
      null, { timeout: 30000 });
    ok(true, "the OpenStreetMap step started, so build() did not die on step one");

    // Reaching the guide must not depend on any single upstream being healthy.
    // A CI runner hit 504 from both Overpass mirrors, and the correct behaviour is
    // a thinner guide, not a frozen screen. This asserts exactly that.
    await page.waitForSelector("#s4.on", { timeout: 240000 });
    ok(true, "the guide screen was reached");

    const degraded = await page.evaluate(() => ({
      places: (GUIDE.places || []).length,
      notes: GUIDE.notes || [],
      steps: [...document.querySelectorAll("#s3 .step")]
        .map(e => e.className.replace("step ", "").trim()),
    }));
    ok(!degraded.steps.includes(""),
       "every build step reached a terminal state, none left hanging");
    if (degraded.notes.length)
      console.log("      upstreams that fell back: " + degraded.notes.length);

    console.log("\n  the guide is usable");
    const n = await page.locator("#list .card").count();
    const empty = await page.locator("#list .empty").count();
    ok(n > 0 || empty > 0,
       `${n} place cards rendered` + (n === 0 ? " (or an honest empty state, if upstreams were down)" : ""));
    ok((await page.textContent("#clock")).match(/\d\d:\d\d/) !== null, "the clock shows a time");
    ok((await page.textContent("#count")).includes("places"), "the count line is populated");

    console.log("\n  the map view works");
    await page.click('#views .chip[data-v="map"]');
    await page.waitForTimeout(2500);
    // Leaflet puts its class on the container itself, not on a child. Asserting a
    // descendant here failed while the map was working perfectly, which is a good
    // reminder that a red test is not automatically a red product.
    const map = await page.evaluate(() => {
      const m = document.getElementById("map");
      return { init: m.classList.contains("leaflet-container"),
               height: m.getBoundingClientRect().height,
               tiles: document.querySelectorAll(".leaflet-tile").length,
               pins: document.querySelectorAll("#map path.leaflet-interactive").length,
               note: (document.getElementById("mapNote") || {}).textContent || "" };
    });
    ok(map.init, "the map initialised");
    ok(map.height > 200, `the map has real height (${Math.round(map.height)}px)`);
    ok(map.tiles > 0, `map tiles loaded (${map.tiles})`);
    ok(map.pins > 0, `pins were drawn (${map.pins})`);
    ok(map.note.includes("real pin"), "the map explains what it is showing");

    console.log("\n  the weather view works");
    await page.click('#views .chip[data-v="weather"]');
    await page.waitForTimeout(600);
    const wx = await page.evaluate(() => {
      const t = document.getElementById("vWeather").textContent || "";
      return { hasTemp: /-?\d+\u00B0C/.test(t), hasSun: t.includes("sunrise"),
               len: t.length, noFetchError: !t.includes("unable to fetch") };
    });
    ok(wx.len > 200, `the weather screen has content (${wx.len} chars)`);
    ok(wx.hasTemp, "a temperature is shown");
    ok(wx.hasSun, "sunrise and sunset are shown");
    ok(wx.noFetchError, "no bare 'unable to fetch' anywhere");

    console.log("\n  the local view works");
    await page.click('#views .chip[data-v="local"]');
    await page.waitForTimeout(600);
    const loc = await page.evaluate(() => {
      const el = document.getElementById("vLocal");
      // Check the thing a user actually taps. Matching the digits in textContent
      // failed while the numbers were rendering fine, because the markup puts a
      // label straight after them and "112all" has no word boundary at the seam.
      const tels = [...el.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute("href"));
      return { len: (el.textContent || "").length,
               tels, currency: (el.textContent || "").includes("INR"),
               photos: el.querySelectorAll("img").length };
    });
    ok(loc.len > 100, `the local screen has content (${loc.len} chars)`);
    ok(loc.tels.length > 0, `emergency numbers are tappable (${loc.tels.join(", ")})`);
    ok(loc.currency, "the local currency is shown");
    ok(loc.photos > 0, `photos rendered (${loc.photos})`);

    console.log("\n  the day view works");
    await page.click('#views .chip[data-v="day"]');
    await page.waitForTimeout(400);
    ok(await page.locator("#tl .tlrow").count() > 0, "the day timeline rendered");

    console.log("\n  it survives a reload from storage");
    await page.reload({ waitUntil: "networkidle" });
    ok(await page.locator("#resume").isVisible(), "the saved trip is offered on return");

    ok(errors.length === 0, "still no javascript errors after using it" +
       (errors.length ? "\n        " + errors.slice(0, 3).join("\n        ") : ""));
  } catch (e) {
    fail++;
    console.log("    \x1b[31m✗\x1b[0m " + e.message.split("\n")[0]);
    if (errors.length) console.log("      page errors: " + errors.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    if (local) local.server.close();
  }

  console.log("");
  console.log(fail ? `  \x1b[31m${fail} failed\x1b[0m, ${pass} passed\n`
                   : `  \x1b[32mall ${pass} passed\x1b[0m\n`);
  process.exit(fail ? 1 : 0);
})();
