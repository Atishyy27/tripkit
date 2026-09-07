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

  // A thrown exception is a bug. A third party image or map tile returning 503 is
  // the internet, and the app already handles it by swapping in a category glyph.
  // Counting them as the same thing makes the suite fail for reasons nobody can fix.
  const errors = [];     // real exceptions
  const subres = [];     // failed downloads
  page.on("pageerror", e => errors.push(String(e.message)));
  page.on("console", m => {
    if (m.type() !== "error") return;
    (/(Failed to load resource|net::ERR_)/.test(m.text()) ? subres : errors).push(m.text());
  });

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
    const n = await page.locator("#list .pc").count();
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

    console.log("\n  it can build a day for you");
    await page.click('#views .chip[data-v="plan"]');
    await page.waitForTimeout(500);
    const hasAuto = await page.evaluate(() => !!document.querySelector('#vPlan [data-auto]'));
    ok(hasAuto, "an empty plan offers to build one");
    await page.evaluate(() => {
      const b = document.querySelector('#vPlan [data-auto="steady"]');
      if (b) b.click();
    });
    await page.waitForTimeout(1200);
    const auto = await page.evaluate(() => {
      const el = document.getElementById("vPlan");
      return { picked: (GUIDE.plan || []).length,
               rows: el.querySelectorAll(".prow").length,
               cats: [...new Set((GUIDE.plan || []).map(id =>
                 (GUIDE.places.find(p => p.id === id) || {}).cat))],
               times: [...el.querySelectorAll(".ptime")].map(t => t.textContent.slice(0, 5)),
               summary: (el.querySelector(".card h3") || {}).textContent || "" };
    });
    ok(auto.picked >= 3, `it built a day of ${auto.picked} stops`);
    ok(auto.rows === auto.picked, "every stop it chose has a row");
    ok(auto.cats.length >= 2, `it mixed ${auto.cats.length} kinds of thing: ${auto.cats.join(", ")}`);
    const autoOrdered = auto.times.every((t, i, a) => i === 0 || t >= a[i - 1]);
    ok(autoOrdered, `the built day is in order: ${auto.times.join(" ")}`);
    ok(!/does not fit/i.test(auto.summary),
       `the day it built should fit inside the time available, summary said: ${auto.summary}`);

    console.log("\n  and it can be cleared and done by hand");
    await page.evaluate(() => { const b = document.getElementById("clearPlan"); if (b) b.click(); });
    await page.waitForTimeout(400);
    ok((await page.evaluate(() => (GUIDE.plan || []).length)) === 0, "clearing empties the day");
    await page.click('#views .chip[data-v="list"]');
    await page.waitForTimeout(300);

    console.log("\n  you can actually plan a day");
    const nAdd = await page.locator('#list [data-pick]').count();
    ok(nAdd > 0, `${nAdd} places can be added to a day`);
    // Every click re-renders the list, which detaches the handles. Re-query each
    // time and always take the first unpicked one.
    // Every click rebuilds the whole list, so a handle taken before the click is
    // detached by the time Playwright tries to act on it. Dispatch on the element
    // instead: it still runs the real handler, it just does not wait for a node
    // that is about to be replaced anyway.
    const added = await page.evaluate(async () => {
      let n = 0;
      for (let k = 0; k < 4; k++) {
        const b = document.querySelector("#list [data-pick]:not(.picked)");
        if (!b) break;
        b.click();
        n++;
        await new Promise(r => setTimeout(r, 60));
      }
      return n;
    });
    ok(added > 0, `added ${added} places by clicking`);
    await page.click('#views .chip[data-v="plan"]');
    await page.waitForTimeout(700);
    const plan = await page.evaluate(() => {
      const el = document.getElementById("vPlan");
      return { picked: (GUIDE.plan || []).length,
               rows: el.querySelectorAll(".prow").length,
               gaps: el.querySelectorAll(".gap").length,
               hasPrint: !!document.getElementById("printPlan"),
               hasShare: !!document.getElementById("sharePlan"),
               summary: (el.querySelector(".card h3") || {}).textContent || "",
               times: [...el.querySelectorAll(".ptime")].map(t => t.textContent.slice(0, 5)) };
    });
    ok(plan.picked >= 1, `${plan.picked} places picked`);
    ok(plan.rows === plan.picked, `every pick has a row in the plan (${plan.rows})`);
    ok(plan.hasPrint && plan.hasShare, "the plan can be printed and shared");
    ok(/^\d\d:\d\d$/.test(plan.times[0] || ""), `stops carry clock times (${plan.times.join(" ")})`);
    const ordered = plan.times.every((t, i, a) => i === 0 || t >= a[i - 1]);
    ok(ordered, "the stops are in chronological order");
    if (plan.gaps) console.log(`      (${plan.gaps} gaps offered something to fill them)`);

    console.log("\n  removing a stop works");
    await page.evaluate(() => {
      const b = document.querySelector("#vPlan .drop");
      if (b) b.click();
    });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => (GUIDE.plan || []).length);
    ok(after === plan.picked - 1, `dropping a stop removed it (${plan.picked} to ${after})`);

    console.log("\n  stops can be reordered by hand");
    const before = await page.evaluate(() => (GUIDE.plan || []).slice());
    await page.evaluate(() => {
      const rows = document.querySelectorAll("#vPlan .prow");
      const b = rows[1] && rows[1].querySelector("[data-up]");
      if (b) b.click();
    });
    await page.waitForTimeout(300);
    const after2 = await page.evaluate(() => ({ plan: (GUIDE.plan || []).slice(), manual: !!GUIDE.manualOrder }));
    ok(after2.plan.length === before.length, "reordering does not lose a stop");
    ok(JSON.stringify(after2.plan) !== JSON.stringify(before) || before.length < 2,
       "moving a stop up actually changed the order");
    ok(after2.manual, "a hand made order is remembered, so the scheduler stops re-sorting it");

    console.log("\n  the day can start at a chosen time");
    const started = await page.evaluate(() => {
      const el = document.getElementById("planStart");
      if (!el) return null;
      el.value = "07:30"; el.dispatchEvent(new Event("change"));
      return true;
    });
    ok(started, "there is a start time control");
    await page.waitForTimeout(300);
    const firstTime = await page.evaluate(() =>
      (document.querySelector("#vPlan .ptime") || {}).textContent || "");
    ok(firstTime.startsWith("07:3") || firstTime.startsWith("07:"),
       `the day now starts around 07:30 (${firstTime.slice(0, 5)})`);

    console.log("\n  it looks like a product");
    const look = await page.evaluate(() => ({
      hero: !!document.querySelector(".dhero"),
      heroImg: !!document.querySelector(".dhero img"),
      heroTitle: (document.querySelector(".dhero h1") || {}).textContent || "",
      meta: document.querySelectorAll(".dhero .m").length,
      cardsWithPhotos: document.querySelectorAll("#list .pc-img img").length,
      cardsWithGlyph: document.querySelectorAll("#list .pc-glyph").length,
      totalCards: document.querySelectorAll("#list .pc").length,
    }));
    ok(look.hero, "there is a destination header");
    ok(look.heroTitle.length > 0, `the header names the place (${look.heroTitle})`);
    ok(look.meta >= 2, `the header carries live facts (${look.meta} of them)`);
    ok(look.cardsWithPhotos + look.cardsWithGlyph === look.totalCards,
       `every card has an image or a proper fallback (${look.cardsWithPhotos} photos, ${look.cardsWithGlyph} glyphs, ${look.totalCards} cards)`);
    ok(look.cardsWithPhotos > 0, `${look.cardsWithPhotos} cards carry a real photograph`);

    console.log("\n  the search radius is adjustable");
    const rad = await page.evaluate(() => ({
      widen: !!document.getElementById("widerBtn"),
      saved: GUIDE.radius,
    }));
    ok(rad.widen, "there is a way to look further out");
    ok(rad.saved > 0, `the chosen radius was remembered (${rad.saved} m)`);

    console.log("\n  places to sleep are there");
    const stay = await page.evaluate(() => {
      const s = (GUIDE.places || []).filter(p => p.cat === "stay");
      const chips = [...document.querySelectorAll("#cats .chip")].map(c => c.dataset.c);
      return { count: s.length, hasChip: chips.includes("stay"),
               named: s.slice(0, 3).map(x => x.name) };
    });
    ok(stay.count > 0, `${stay.count} places to sleep in the dataset`);
    ok(stay.hasChip, "a stay filter appears in the category chips");

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

    console.log("\n  a place looked at before comes back instantly");
    // Go back to the search and pick the same town again. The second time it must
    // offer what is already on the device rather than refetching everything.
    await page.evaluate(() => { const b = document.getElementById("newBtn"); if (b) b.click(); });
    await page.waitForTimeout(400);
    await page.fill("#q", "Pushkar");
    await page.waitForSelector("#hits .hit", { timeout: 45000 });
    await page.locator("#hits .hit").first().click();
    await page.waitForSelector("#s2.on", { timeout: 15000 });
    await page.waitForTimeout(400);
    const cached = await page.evaluate(() => {
      const box = document.getElementById("cached");
      return { shown: box && !box.hidden,
               text: (box && box.textContent || "").slice(0, 160),
               hasUse: !!document.getElementById("useCached"),
               hasFresh: !!document.getElementById("freshBuild") };
    });
    ok(cached.shown, "a second visit offers the copy already on the device");
    ok(cached.hasUse && cached.hasFresh, "both reuse and a fresh fetch are offered");
    ok(/looked at/i.test(cached.text), `it should say when: ${cached.text.slice(0, 70)}`);

    const t0 = Date.now();
    await page.evaluate(() => { const b = document.getElementById("useCached"); if (b) b.click(); });
    await page.waitForSelector("#s4.on", { timeout: 30000 });
    const reopen = Date.now() - t0;
    ok(reopen < 12000, `reopening from cache took ${reopen}ms, it should be near instant`);
    const reopened = await page.evaluate(() => ({
      places: (GUIDE.places || []).length,
      cachedAt: !!GUIDE.cachedAt,
      sunrise: GUIDE.conditions.sunrise,
      note: [...document.querySelectorAll(".dcredit")].map(e => e.textContent).join(" "),
    }));
    ok(reopened.places > 0, "the cached guide has its places");
    ok(reopened.cachedAt, "it knows it came from the cache");
    ok(reopened.sunrise > 0, "the sun is recomputed rather than trusted from storage");
    ok(/loaded/i.test(reopened.note), `the age should be visible: ${reopened.note.slice(0, 60)}`);

    console.log("\n  it survives a reload from storage");
    await page.reload({ waitUntil: "networkidle" });
    ok(await page.locator("#resume").isVisible(), "the saved trip is offered on return");

    console.log("\n  the cache leaves room for the trip you are actually on");
    /* localStorage is about 5 MB and the current trip saves separately from the
       cache. A cache that fills the ceiling breaks the thing it exists to help:
       the active trip silently stops saving, which is the worst way to fail. */
    const quota = await page.evaluate(() => {
      // Snapshot first. This test deliberately overfills the cache, and without
      // restoring it afterwards it silently breaks whatever runs next, which is
      // exactly the kind of order dependency that makes a suite untrustworthy.
      const before = { cache: localStorage.getItem("tripkit.cache"),
                       trip: localStorage.getItem("tripkit.trip") };
      const big = n => ({ v: 1, built: Date.now(),
        place: { name: "Town" + n, lat: 1 + n / 100, lng: 1, country: "X" },
        notes: [], intro: "", cautions: [],
        config: { tzOffsetMinutes: 0, arrive: 540, depart: 1260 },
        conditions: { sunrise: 400, sunset: 1100 },
        days: [{ label: "Day 1", plan: [], start: null }], day: 0,
        places: Array.from({ length: 1400 }, (_, i) => ({
          id: "t" + n + "-" + i, name: "Place " + i + " ".repeat(12), cat: "view",
          town: "town" + n, lat: 1, lng: 1, dur: 30,
          why: "a description long enough to matter ".repeat(6),
          open: "09:00", close: "18:00", tags: ["free"], best: ["12:00"],
          src: "https://www.openstreetmap.org/node/" + i })) });
      for (let n = 0; n < 14; n++) cachePut(big(n));
      const raw = (localStorage.getItem("tripkit.cache") || "").length;
      let activeSaved = false;
      try { localStorage.setItem("tripkit.trip", JSON.stringify(big(99))); activeSaved = true; }
      catch (e) {}
      let readable = false;
      try { readable = cacheList().length > 0; } catch (e) {}
      const out = { kb: Math.round(raw / 1024), activeSaved, readable, kept: cacheList().length };
      try {
        if (before.cache) localStorage.setItem("tripkit.cache", before.cache);
        else localStorage.removeItem("tripkit.cache");
        if (before.trip) localStorage.setItem("tripkit.trip", before.trip);
      } catch (e) { /* restoring is best effort */ }
      return out;
    });
    ok(quota.kb < 3400, `the cache stays inside its budget (${quota.kb}KB)`);
    ok(quota.activeSaved, "the trip you are on can still be saved after the cache fills");
    ok(quota.readable, `the cache is still readable, holding ${quota.kept} towns`);
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload({ waitUntil: "networkidle" });

    ok(errors.length === 0, "no javascript exceptions after using it" +
       (errors.length ? "\n        " + errors.slice(0, 3).join("\n        ") : ""));
    if (subres.length)
      console.log(`      (${subres.length} third party downloads failed, handled by fallbacks)`);
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll("#list img")].filter(i => i.complete && i.naturalWidth === 0).length);
    ok(broken === 0, `no broken image is left visible (${broken})`);
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
