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
  const ohsomeCalls = [];   // U12: the coverage trend is a static file, this must stay empty for the whole run
  page.on("pageerror", e => errors.push(String(e.message)));
  page.on("console", m => {
    if (m.type() !== "error") return;
    (/(Failed to load resource|net::ERR_)/.test(m.text()) ? subres : errors).push(m.text());
  });
  page.on("request", req => { if (req.url().includes("ohsome")) ohsomeCalls.push(req.url()); });

  try {
    console.log("\n  the page loads");
    await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
    ok(errors.length === 0, "no javascript errors on load" +
       (errors.length ? "\n        " + errors.slice(0, 3).join("\n        ") : ""));
    ok(await page.locator("#q").isVisible(), "the search box is visible");
    ok((await page.title()).length > 0, "the page has a title");

    console.log("\n  the landing is a full-bleed photo hero, not the old dark gradient");
    // None of this depends on live data: the landing shows before any search, so
    // it must hold regardless of whatever Overpass gives back tonight.
    const heroLook = await page.evaluate(() => {
      const land = document.querySelector(".land");
      const heroLayer = document.querySelector(".land-hero");
      const imgs = document.querySelectorAll(".land-hero-img");
      const q = document.getElementById("q");
      const rect = q ? q.getBoundingClientRect() : null;
      const topEl = rect
        ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        : null;
      return {
        hasLand: !!land,
        heroImgCount: imgs.length,
        inlineBg: heroLayer ? heroLayer.getAttribute("style") || "" : "",
        qInsideLand: !!(land && q && land.contains(q)),
        qOnTop: !!(topEl && (topEl === q || q.contains(topEl))),
        heroesLoaded: typeof HEROES !== "undefined" && Array.isArray(HEROES) && HEROES.length === 3,
        lqipLoaded: typeof HERO_LQIP === "string" && HERO_LQIP.startsWith("data:image/webp;base64,"),
      };
    });
    ok(heroLook.hasLand, "the landing hero band exists");
    ok(heroLook.heroImgCount === 3, `the hero rotates through ${heroLook.heroImgCount} photo elements`);
    // The blurred placeholder is a literal inline style attribute, not something
    // JS paints in later, so it is there the instant the HTML parses, offline
    // included, before any of the three real photos can possibly have loaded.
    ok(/^data:image\/webp;base64,/.test(heroLook.inlineBg.replace(/^background-image:\s*url\(['"]?/, "")) ||
       /data:image\/webp;base64/.test(heroLook.inlineBg),
       "a blurred placeholder paints instantly, inline, before any network image can load");
    ok(heroLook.heroesLoaded, "hero/heroes.js loaded HEROES with all 3 destinations");
    ok(heroLook.lqipLoaded, "hero/heroes.js loaded HERO_LQIP as an inline webp data uri");
    ok(heroLook.qInsideLand, "the search box sits inside the photo hero band");
    ok(heroLook.qOnTop, "the search box is on top of the photo and actually clickable");

    console.log("\n  the hero photo credit is present and links to the Commons source");
    const credit = await page.evaluate(() => {
      const a = document.getElementById("landCreditLink");
      return { text: a ? a.textContent : "", href: a ? a.getAttribute("href") : "" };
    });
    ok(credit.text.length > 0, `the hero photo credit is shown (${credit.text})`);
    ok(/^https:\/\/commons\.wikimedia\.org\//.test(credit.href || ""),
       `the credit links to the Commons source (${credit.href})`);

    console.log("\n  theming: light-first tokens, system preference, and the toggle");
    // Token values, read straight from the light and dark blocks in style.css so
    // this test breaks if those values drift, not just if theming breaks outright.
    const cssPath = path.join(DOCS, "style.css");
    const css = fs.readFileSync(cssPath, "utf8");
    const rootBlock = css.match(/:root\{([^}]*)\}/);
    const darkBlock = css.match(
      /@media\(prefers-color-scheme:dark\)\{[\s\S]*?:root:not\(\[data-theme="light"\]\)\{([^}]*)\}/);
    const propNames = block => (block ? block[1] : "").match(/--[a-z0-9-]+(?=:)/gi) || [];
    const propValue = (block, name) => {
      const m = new RegExp(name.replace(/[-]/g, "\\-") + ":\\s*(#[0-9a-fA-F]{3,8})").exec(block ? block[1] : "");
      return m ? m[1] : null;
    };
    const hexToRgb = hex => {
      const h = hex.replace("#", "");
      const n = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
      const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
      return `rgb(${r}, ${g}, ${b})`;
    };
    const lightBg = hexToRgb(propValue(rootBlock, "--bg"));
    const darkBg = hexToRgb(propValue(darkBlock, "--bg"));

    // 1. light OS scheme, nothing stored yet, should render the light token.
    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => { try { localStorage.removeItem("tripkit.theme"); } catch (e) {} });
    await page.reload({ waitUntil: "networkidle" });
    const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok(bgLight === lightBg, `light OS scheme with no stored choice renders the light token (${bgLight})`);

    // 2. dark OS scheme, nothing stored, should render the dark token.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => { try { localStorage.removeItem("tripkit.theme"); } catch (e) {} });
    await page.reload({ waitUntil: "networkidle" });
    const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok(bgDark === darkBg, `dark OS scheme with no stored choice renders the dark token (${bgDark})`);

    // 3. clicking the toggle flips data-theme and overrides the OS preference,
    // which is still emulated as dark here.
    await page.click("#themeToggle");
    const toggled = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute("data-theme"),
      bg: getComputedStyle(document.body).backgroundColor,
    }));
    ok(toggled.theme === "light", `the toggle set data-theme to light over a dark OS scheme (${toggled.theme})`);
    ok(toggled.bg === lightBg && toggled.bg !== bgDark,
       `the body actually re-themed to the light token after the click (${bgDark} to ${toggled.bg})`);

    // 4. the choice is written to storage and survives a reload, still against a
    // dark OS scheme, proving the explicit choice keeps winning.
    const stored = await page.evaluate(() => { try { return localStorage.getItem("tripkit.theme"); } catch (e) { return null; } });
    ok(stored === "light", `the choice was persisted to localStorage (${stored})`);
    await page.reload({ waitUntil: "networkidle" });
    const afterReload = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute("data-theme"),
      bg: getComputedStyle(document.body).backgroundColor,
    }));
    ok(afterReload.theme === "light", "the stored choice survived a reload");
    ok(afterReload.bg === lightBg, `the light theme still renders after reload (${afterReload.bg})`);
    await page.evaluate(() => { try { localStorage.removeItem("tripkit.theme"); } catch (e) {} });

    // 5. nothing in the dark block may exist only there; every one of its custom
    // properties must also have a bare :root (light) definition.
    const darkProps = propNames(darkBlock);
    const rootProps = new Set(propNames(rootBlock));
    const orphaned = darkProps.filter(p => !rootProps.has(p));
    ok(darkProps.length > 0, `found ${darkProps.length} custom properties in the dark media block`);
    ok(orphaned.length === 0, orphaned.length === 0
       ? "every dark-mode token also has a bare :root (light) definition"
       : `these tokens exist only inside the dark media block: ${orphaned.join(", ")}`);

    // 5b. same check against the explicit [data-theme="dark"] block, which is a
    // separate rule from the @media one above and could drift from it on its own.
    // Applies to every token added in U2 (--warn-bg, --hero-ink, --fs-4, etc), not
    // just the ones U1 shipped.
    const darkAttrBlock = css.match(/:root\[data-theme="dark"\]\{([^}]*)\}/);
    const darkAttrProps = propNames(darkAttrBlock);
    const orphanedAttr = darkAttrProps.filter(p => !rootProps.has(p));
    ok(darkAttrProps.length > 0, `found ${darkAttrProps.length} custom properties in the [data-theme="dark"] block`);
    ok(orphanedAttr.length === 0, orphanedAttr.length === 0
       ? "every explicit dark-theme token also has a bare :root (light) definition"
       : `these tokens exist only inside [data-theme="dark"]: ${orphanedAttr.join(", ")}`);

    console.log("\n  the toggle still flips data-theme, and the landing scrim text stays legible either way");
    // The landing headline sits on a photo, not on the page background, so it
    // must use the fixed --hero-ink token rather than the themed --ink one: if
    // it ever regressed to --ink, this would catch it as a color that suddenly
    // changes with the theme, which is exactly the dark-text-on-a-dark-photo bug
    // this redesign had to avoid.
    const landHeadlineColor = theme => page.evaluate(t => {
      document.documentElement.setAttribute("data-theme", t);
      const h = document.querySelector(".land-h");
      return h ? getComputedStyle(h).color : null;
    }, theme);
    const landColorLight = await landHeadlineColor("light");
    const landColorDark = await landHeadlineColor("dark");
    ok(!!landColorLight && !!landColorDark, "the landing headline has a computed color in both themes");
    ok(landColorLight === landColorDark,
       `the landing headline stays the fixed light-on-photo color regardless of site theme (${landColorLight})`);
    await page.click("#themeToggle");
    const toggledTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    ok(toggledTheme === "light" || toggledTheme === "dark",
       `the toggle still flips data-theme after the redesign (now ${toggledTheme})`);

    console.log("\n  U2: light-mode coherence on the tinted card/tag/button surfaces");
    // The hardcoded-hex offenders U1 left behind: .card.warn shipped with a dark
    // hex background regardless of theme, which is unreadable once the page can
    // actually be light. --warn-bg/--warn-border replace it; this proves both
    // directions rather than trusting the CSS source alone.
    const warnBgLight = hexToRgb(propValue(rootBlock, "--warn-bg"));
    const warnBgDark = hexToRgb(propValue(darkBlock, "--warn-bg"));
    const oldHardcodedDarkWarn = "rgb(35, 26, 28)"; // the literal #231a1c this replaced

    const themedSurface = async theme => {
      return page.evaluate(t => {
        document.documentElement.setAttribute("data-theme", t);
        const el = document.createElement("div");
        el.className = "card warn";
        el.id = "u2-warn-probe";
        el.textContent = "probe";
        document.body.appendChild(el);
        const bg = getComputedStyle(el).backgroundColor;
        el.remove();
        return bg;
      }, theme);
    };
    const warnLight = await themedSurface("light");
    ok(warnLight === warnBgLight, `a .card.warn in light theme uses the light warn token (${warnLight})`);
    ok(warnLight !== oldHardcodedDarkWarn,
       `a .card.warn in light theme is not stuck on the old hardcoded dark hex (${warnLight})`);

    const warnDark = await themedSurface("dark");
    ok(warnDark === warnBgDark, `a .card.warn in dark theme still uses the dark warn token (${warnDark})`);
    ok(warnDark === oldHardcodedDarkWarn,
       `dark theme still renders the same value the old hardcoded hex gave (${warnDark})`);

    // The sticky top bar used a hardcoded rgba(13,11,18,...) regardless of theme,
    // which is the .top / .nav class of bug: chrome that stayed dark even when
    // the page went light, with themed text drawn on top of it. It now reads
    // color-mix(in srgb,var(--bg) 94%,transparent), which Chromium serializes as
    // color(srgb r g b / a) rather than rgb(...), so parse channels numerically
    // instead of doing a string compare.
    const parseChannels = str => {
      const m = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\)/.exec(str) ||
                /rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, ]+([\d.]+))?\)/.exec(str);
      if (!m) return null;
      const scale = str.startsWith("color(") ? 255 : 1;
      return { r: Math.round(parseFloat(m[1]) * scale), g: Math.round(parseFloat(m[2]) * scale),
               b: Math.round(parseFloat(m[3]) * scale), a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
    };
    const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
    const expectLightBg = hexToRgb(propValue(rootBlock, "--bg")).match(/\d+/g).map(Number);
    const expectDarkBg = hexToRgb(propValue(darkBlock, "--bg")).match(/\d+/g).map(Number);

    const chromeSurface = async theme => {
      return page.evaluate(t => {
        document.documentElement.setAttribute("data-theme", t);
        const top = document.querySelector(".top");
        return top ? getComputedStyle(top).backgroundColor : null;
      }, theme);
    };
    const topLight = parseChannels(await chromeSurface("light"));
    ok(!!topLight, `the sticky top bar's background is a readable color value in light theme`);
    if (topLight) {
      ok(near(topLight.r, expectLightBg[0]) && near(topLight.g, expectLightBg[1]) && near(topLight.b, expectLightBg[2]),
         `the top bar tracks the light --bg token in light theme (got ${topLight.r},${topLight.g},${topLight.b}, expected ~${expectLightBg.join(",")})`);
    }
    const topDark = parseChannels(await chromeSurface("dark"));
    if (topDark) {
      ok(near(topDark.r, expectDarkBg[0]) && near(topDark.g, expectDarkBg[1]) && near(topDark.b, expectDarkBg[2]),
         `the top bar tracks the dark --bg token in dark theme (got ${topDark.r},${topDark.g},${topDark.b}, expected ~${expectDarkBg.join(",")})`);
    }
    ok(topLight && topDark && (topLight.r !== topDark.r || topLight.g !== topDark.g || topLight.b !== topDark.b),
       "the top bar actually differs between the two themes, it is not a fixed dark bar with themed text drawn on it");

    console.log("\n  U2: new primitives (.list-row, .section-head, .state) at 360px");
    // 360px is the hard mobile-first floor for this project; a primitive that
    // overflows here forces horizontal body scroll, which is the one thing a
    // mobile guide can never do.
    await page.setViewportSize({ width: 360, height: 780 });
    const overflowCheck = await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "u2-primitive-probe";
      host.className = "wrap";
      host.innerHTML = `
        <div class="section-head">
          <h2>A section heading that is deliberately long enough to be a risk<span class="sh-count">12</span></h2>
          <button class="sh-action">See all</button>
        </div>
        <div class="list-row">
          <div class="lr-thumb"><span>&#128205;</span></div>
          <div class="lr-body">
            <div class="lr-title">A place name long enough to force ellipsis handling on a 360px screen</div>
            <div class="lr-meta">0.4 km &middot; open now &middot; a fairly long meta string too</div>
          </div>
          <div class="lr-end">4 min</div>
        </div>
        <div class="state state-loading"><span class="state-icon">&#8635;</span>Loading the guide&#8230;</div>
        <div class="state state-empty"><span class="state-icon">&#128269;</span>Nothing matched that filter.</div>
        <div class="state state-error"><span class="state-icon">&#9888;</span>Could not reach OpenStreetMap.</div>
      `;
      document.body.appendChild(host);
      const before = { docScroll: document.documentElement.scrollWidth,
                        docClient: document.documentElement.clientWidth };
      const rows = [...host.querySelectorAll(".list-row, .section-head, .state")]
        .map(el => ({ cls: el.className, w: el.getBoundingClientRect().width }));
      host.remove();
      return { ...before, rows };
    });
    ok(overflowCheck.docScroll <= overflowCheck.docClient,
       `no horizontal overflow at 360px with all three new primitives rendered (scrollWidth ${overflowCheck.docScroll} vs clientWidth ${overflowCheck.docClient})`);
    ok(overflowCheck.rows.length === 5, `all three primitives rendered, including all 3 .state variants (${overflowCheck.rows.map(r => r.cls).join(" | ")})`);
    ok(overflowCheck.rows.every(r => r.w <= 360),
       `every rendered primitive itself stays within 360px (${overflowCheck.rows.map(r => Math.round(r.w)).join(", ")})`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));

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

    console.log("\n  U6: search loading/empty states use the .state primitive");
    // A gibberish query is deterministic where a live-data check would not be:
    // Nominatim will never match it, so the "nothing found" branch always
    // fires, regardless of how thin or rich the actual town data is tonight.
    await page.fill("#q", "zzzqqqxxxnonexistentplacenobodytypes");
    // The loading indicator is set synchronously in the input handler, before
    // the 450ms debounce even starts, so it must already be there.
    const loadingNow = await page.locator("#hits .state.state-loading").count();
    ok(loadingNow > 0, "the searching indicator uses .state.state-loading, not bare text");
    await page.waitForSelector("#hits .state.state-empty", { timeout: 45000 });
    const notFoundHtml = await page.evaluate(() => document.getElementById("hits").innerHTML);
    ok(notFoundHtml.includes("state-icon"), "the nothing-found state carries an icon");
    ok(/Nothing found/.test(notFoundHtml),
       "the nothing-found state keeps the specific message, an icon alone is not enough");

    // The search-error branch (Nominatim unreachable) can't be forced without
    // actually breaking the network mid-test, so it is checked at the source:
    // the same file this suite is already exercising must render the .state
    // .state-error markup on that catch path, with the real message intact.
    const appSrc = fs.readFileSync(path.join(DOCS, "app.js"), "utf8");
    ok(/class="state state-error"/.test(appSrc),
       "the search-error catch path renders .state.state-error");
    ok(/Could not reach OpenStreetMap's search/.test(appSrc),
       "the search-error message stays specific (free service, rate-limits, retry)");

    console.log("\n  searching finds a place");
    await page.fill("#q", "Pushkar");
    await page.waitForSelector("#hits .hit", { timeout: 45000 });
    const hits = await page.locator("#hits .hit").count();
    ok(hits > 0, `search returned ${hits} results`);

    console.log("\n  U9: Photon typeahead is wired, additive, and never a bypass");
    const wired9 = await page.evaluate(() => ({
      photonSuggest: typeof photonSuggest === "function",
      mapper: typeof mapPhotonFeatures === "function",
      suggestEl: !!document.getElementById("suggest"),
    }));
    ok(wired9.photonSuggest, "photonSuggest() is defined");
    ok(wired9.mapper, "the pure Photon mapper (mapPhotonFeatures) is defined");
    ok(wired9.suggestEl, "a dedicated suggestion container exists, separate from #hits");

    // A fresh, distinct query so the ~180ms typeahead debounce reacts to a real
    // keystroke rather than to state left over from "Pushkar" above.
    await page.fill("#q", "");
    await page.fill("#q", "Jaip");
    await page.waitForTimeout(1500);
    const suggestCount = await page.locator("#suggest .suggest-item").count();
    if (suggestCount > 0) {
      console.log("      choosing a suggestion runs the authoritative resolve, not a Photon-only geocode");
      await page.locator("#suggest .suggest-item").first().click();
      await page.waitForSelector("#hits .hit, #hits .state-empty, #hits .state-error", { timeout: 45000 });
      ok(await page.locator("#suggest").isHidden(),
         "the suggestion list is torn down once the authoritative search takes over, so it never competes with #hits");
    } else {
      console.log("      (Photon returned no live suggestions for this query just now, that is Photon, not this app)");
    }

    console.log("\n  U9: a Photon outage leaves the search box fully usable");
    await page.route("**photon.komoot.io/**", route => route.abort("failed"));
    await page.fill("#q", "");
    await page.fill("#q", "Lisbon");
    await page.waitForSelector("#hits .hit", { timeout: 45000 });
    const hitsWithPhotonDown = await page.locator("#hits .hit").count();
    ok(hitsWithPhotonDown > 0,
       `the 450ms findPlace search still resolves with Photon unreachable (${hitsWithPhotonDown} hits)`);
    const suggestWithPhotonDown = await page.locator("#suggest .suggest-item").count();
    ok(suggestWithPhotonDown === 0, "no suggestion list is left showing while Photon is down");
    ok(errors.length === 0,
       "a Photon failure produced no uncaught exception" +
       (errors.length ? "\n        " + errors.slice(0, 3).join("\n        ") : ""));
    await page.unroute("**photon.komoot.io/**");

    // Leave #hits holding a real hit again, which is the state the next test expects.
    await page.fill("#q", "");
    await page.fill("#q", "Pushkar");
    await page.waitForSelector("#hits .hit", { timeout: 45000 });

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
    const empty = await page.locator("#list .state.state-empty").count();
    ok(n > 0 || empty > 0,
       `${n} place cards rendered` + (n === 0 ? " (or an honest empty state, if upstreams were down)" : ""));
    ok((await page.textContent("#clock")).match(/\d\d:\d\d/) !== null, "the clock shows a time");
    ok((await page.textContent("#count")).includes("places"), "the count line is populated");

    console.log("\n  U6: list empty state uses the .state primitive");
    // A nonsense name filter matches nothing regardless of how thin or rich
    // tonight's live town data is, so this stays deterministic where relying
    // on a genuinely thin town would not.
    await page.fill("#filter", "zzzqqqxxxnonexistentplacenobodytypes");
    await page.waitForTimeout(200);
    const listEmptyHtml = await page.evaluate(() => document.getElementById("list").innerHTML);
    ok(listEmptyHtml.includes('class="state state-empty"'),
       "an unmatched filter renders .state.state-empty, not the old bare .empty div");
    ok(listEmptyHtml.includes("state-icon"), "the empty list state carries an icon");
    ok(!/class="empty"/.test(listEmptyHtml), "the old bare .empty class is gone from the output");
    await page.fill("#filter", "");
    await page.waitForTimeout(200);

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
               hasGeo: !!document.getElementById("geoPlan"),
               hasKml: !!document.getElementById("kmlPlan"),
               hasGpx: !!document.getElementById("gpxPlan"),
               summary: (el.querySelector(".card h3") || {}).textContent || "",
               times: [...el.querySelectorAll(".ptime")].map(t => t.textContent.slice(0, 5)) };
    });
    ok(plan.picked >= 1, `${plan.picked} places picked`);
    ok(plan.rows === plan.picked, `every pick has a row in the plan (${plan.rows})`);
    ok(plan.hasPrint && plan.hasShare, "the plan can be printed and shared");
    ok(plan.hasGeo && plan.hasKml && plan.hasGpx,
       "the plan offers GeoJSON, KML and GPX export (U10), a true peer of Add to calendar");
    ok(/^\d\d:\d\d$/.test(plan.times[0] || ""), `stops carry clock times (${plan.times.join(" ")})`);
    const ordered = plan.times.every((t, i, a) => i === 0 || t >= a[i - 1]);
    ok(ordered, "the stops are in chronological order");

    console.log("\n  U10: the exported GeoJSON, KML and GPX actually parse");
    // Note: this does not click the export buttons and check a real file landed
    // on disk. A script-triggered download is blocked in this sandboxed browser
    // context, which the task itself calls out as expected and unrelated to
    // correctness. Instead the serializers (already globals on the page, exactly
    // like icsEscape/downloadIcs) are called directly and the documents are
    // parsed for real with the browser's own DOMParser, which node does not have.
    const exported = await page.evaluate(() => {
      const angry = { id: "zz1", name: `Rana's "Rooftop" <Cafe> & Bar`, cat: "food",
                       lat: 26.47, lng: 74.55, why: "Tom & Jerry's favourite" };
      const loose = { id: "zz2", name: "Unmapped Shrine", cat: "temple", loose: true,
                       lat: 26.47, lng: 74.55, why: "no coordinate on record" };
      const geo = toGeoJSON([angry, loose], { title: "Pushkar" });
      const kmlText = toKML([angry, loose], { title: "Pushkar" });
      const gpxText = toGPX([angry, loose], { title: "Pushkar" });
      const dp = new DOMParser();
      const kmlDoc = dp.parseFromString(kmlText, "application/xml");
      const gpxDoc = dp.parseFromString(gpxText, "application/xml");
      return {
        geoFeatures: geo.features.length,
        geoCoords: geo.features[0].geometry.coordinates,
        geoName: geo.features[0].properties.name,
        kmlParseError: !!kmlDoc.querySelector("parsererror"),
        kmlPlacemarks: kmlDoc.getElementsByTagName("Placemark").length,
        kmlName: kmlDoc.getElementsByTagName("name")[1]
          ? kmlDoc.getElementsByTagName("name")[1].textContent : null,
        gpxParseError: !!gpxDoc.querySelector("parsererror"),
        gpxWpts: gpxDoc.getElementsByTagName("wpt").length,
        gpxLat: gpxDoc.getElementsByTagName("wpt")[0]
          ? gpxDoc.getElementsByTagName("wpt")[0].getAttribute("lat") : null,
        gpxLon: gpxDoc.getElementsByTagName("wpt")[0]
          ? gpxDoc.getElementsByTagName("wpt")[0].getAttribute("lon") : null,
      };
    });
    ok(exported.geoFeatures === 1, "GeoJSON drops the loose pin, keeps the real place");
    ok(exported.geoCoords[0] === 74.55 && exported.geoCoords[1] === 26.47,
       `GeoJSON coordinates are [lng, lat] (${JSON.stringify(exported.geoCoords)})`);
    ok(exported.geoName.includes("<Cafe>"),
       "GeoJSON kept the literal angry name (JSON needs no XML escaping)");
    ok(!exported.kmlParseError, "the KML parses as well formed XML via DOMParser");
    ok(exported.kmlPlacemarks === 1, "KML drops the loose pin, keeps the real place");
    ok(exported.kmlName && exported.kmlName.includes("<Cafe>"),
       `KML escaped the name and DOMParser decoded it back to the original (${exported.kmlName})`);
    ok(!exported.gpxParseError, "the GPX parses as well formed XML via DOMParser");
    ok(exported.gpxWpts === 1, "GPX drops the loose pin, keeps the real place");
    ok(exported.gpxLat === "26.47" && exported.gpxLon === "74.55",
       `GPX wpt carries lat/lon matching the input, not swapped (lat=${exported.gpxLat} lon=${exported.gpxLon})`);
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

    console.log("\n  place cards form a 2-column grid at 560px+, single column at 360px");
    // #list itself is the grid container regardless of how many cards live
    // inside it (even the empty state renders inside the same element), so
    // this holds independent of tonight's live Overpass data.
    const gridColumns = async width => {
      await page.setViewportSize({ width, height: 900 });
      const tracks = await page.evaluate(() => getComputedStyle(document.getElementById("list")).gridTemplateColumns);
      return tracks.trim().split(/\s+/).filter(Boolean).length;
    };
    const cols360 = await gridColumns(360);
    ok(cols360 === 1, `#list is a single column at the 360px mobile floor (${cols360} track(s))`);
    const cols700 = await gridColumns(700);
    ok(cols700 === 2, `#list becomes a 2-column grid at 700px (${cols700} track(s))`);
    await page.setViewportSize({ width: 390, height: 844 });

    console.log("\n  the near-me list has a sort control, and Best now leads");
    await page.click('#views .chip[data-v="list"]');
    await page.waitForTimeout(300);
    const sortInit = await page.evaluate(() => {
      const best = document.querySelector('#sortMode [data-sort="best"]');
      const nr = document.querySelector('#sortMode [data-sort="near"]');
      return {
        hasControl: !!best && !!nr,
        bestPressed: best && best.getAttribute("aria-pressed"),
        nearPressed: nr && nr.getAttribute("aria-pressed"),
      };
    });
    ok(sortInit.hasControl, "a Best now / Nearest sort control is on the list view");
    ok(sortInit.bestPressed === "true", `Best now (score order) is the default (${sortInit.bestPressed})`);
    ok(sortInit.nearPressed === "false", "Nearest starts unselected");

    const beforeOrder = await page.evaluate(() =>
      [...document.querySelectorAll("#list .pc h3")].map(h => h.textContent));

    console.log("\n  toggling to Nearest reorders the list, and shows a distance");
    await page.click('#sortMode [data-sort="near"]');
    await page.waitForTimeout(300);
    const afterSort = await page.evaluate(() => ({
      nearPressed: document.querySelector('#sortMode [data-sort="near"]').getAttribute("aria-pressed"),
      order: [...document.querySelectorAll("#list .pc h3")].map(h => h.textContent),
      rows: [...document.querySelectorAll("#list .pc")].map(c => ({
        dist: (c.querySelector(".pc-dist") || {}).textContent || null,
        approx: !!c.querySelector('.tag.t-unv') && (c.querySelector('.tag.t-unv').textContent || "").includes("approx"),
      })),
    }));
    ok(afterSort.nearPressed === "true", "the Nearest chip becomes pressed once chosen");
    ok(JSON.stringify(afterSort.order) !== JSON.stringify(beforeOrder) || beforeOrder.length < 2,
       "choosing Nearest actually changed the row order, not just the chip");
    const labelled = afterSort.rows.filter(r => r.dist || r.approx);
    ok(labelled.length === afterSort.rows.length,
       `every row shows a distance or an approximate label (${labelled.length} of ${afterSort.rows.length})`);
    // Guard on rows existing: when live OSM returns a thin town (evening, quiet
    // place) there are no cards to carry a distance, which is a data condition,
    // not a distance-logic defect. The 7 fixture-based unit tests prove the
    // computation; this only asserts the real distance shows WHEN a row exists.
    if (afterSort.rows.length) {
      ok(afterSort.rows.some(r => r.dist && /\d/.test(r.dist)),
         `at least one row shows a real distance (e.g. "${(afterSort.rows.find(r => r.dist) || {}).dist}")`);
    } else {
      ok(true, "no rows rendered from live data this run, distance shown only when a row exists");
    }

    console.log("\n  Best now still works after Nearest has been used");
    await page.click('#sortMode [data-sort="best"]');
    await page.waitForTimeout(300);
    const backToBest = await page.evaluate(() => ({
      bestPressed: document.querySelector('#sortMode [data-sort="best"]').getAttribute("aria-pressed"),
      order: [...document.querySelectorAll("#list .pc h3")].map(h => h.textContent),
    }));
    ok(backToBest.bestPressed === "true", "Best now can be reselected");
    ok(JSON.stringify(backToBest.order) === JSON.stringify(beforeOrder),
       "switching back to Best now restores the original score order");

    console.log("\n  Guide / All splits curated places from the live list, offline");
    const modeInit = await page.evaluate(() => {
      const guide = document.querySelector('#listMode [data-mode="guide"]');
      const all = document.querySelector('#listMode [data-mode="all"]');
      return {
        hasControl: !!guide && !!all,
        guidePressed: guide && guide.getAttribute("aria-pressed"),
        allPressed: all && all.getAttribute("aria-pressed"),
        cards: document.querySelectorAll("#list .pc").length,
        countText: (document.getElementById("count") || {}).textContent || "",
      };
    });
    ok(modeInit.hasControl, "a Guide / All mode control is on the list view");
    ok((modeInit.guidePressed === "true") !== (modeInit.allPressed === "true"),
       `exactly one of Guide/All starts pressed (guide=${modeInit.guidePressed}, all=${modeInit.allPressed})`);

    // A mode switch only re-filters GUIDE.places, already in memory from the
    // build. If it ever regresses into a fetch, this catches it immediately
    // rather than as a mystery slow toggle later.
    let netDuringToggle = 0;
    const countReq = () => { netDuringToggle++; };
    page.on("request", countReq);
    await page.click('#listMode [data-mode="all"]');
    await page.waitForTimeout(300);
    const modeAll = await page.evaluate(() => ({
      allPressed: document.querySelector('#listMode [data-mode="all"]').getAttribute("aria-pressed"),
      cards: document.querySelectorAll("#list .pc").length,
      countText: (document.getElementById("count") || {}).textContent || "",
    }));
    ok(modeAll.allPressed === "true", "All becomes pressed once chosen");
    ok(modeAll.countText !== modeInit.countText || modeInit.guidePressed === "true" && modeAll.cards === modeInit.cards,
       `the count line reflects the active mode ("${modeInit.countText}" -> "${modeAll.countText}")`);

    await page.click('#listMode [data-mode="guide"]');
    await page.waitForTimeout(300);
    page.off("request", countReq);
    const modeGuide = await page.evaluate(() => ({
      guidePressed: document.querySelector('#listMode [data-mode="guide"]').getAttribute("aria-pressed"),
      cards: document.querySelectorAll("#list .pc").length,
    }));
    ok(modeGuide.guidePressed === "true", "Guide can be reselected");
    ok(netDuringToggle === 0,
       `switching list mode fired ${netDuringToggle} network request(s) across the round trip, expected 0`);

    // Guarded on cards actually existing: live Overpass can hand back a thin
    // town (few or zero cards) which is a data condition, not a filter defect.
    // Guide is always a subset of the same underlying ranked list, so when
    // there is anything to compare, All must never show fewer places.
    if (modeAll.cards > 0 || modeGuide.cards > 0) {
      ok(modeAll.cards >= modeGuide.cards,
         `All shows at least as many places as Guide (${modeAll.cards} vs ${modeGuide.cards})`);
    } else {
      ok(true, "no cards rendered from live data this run, Guide/All comparison skipped");
    }

    console.log("\n  a point-in-time preview lets you look at a different time and day (U7)");
    // Control-only assertions: none of this depends on a place card existing,
    // so unlike the sort/mode checks above there is nothing here to guard on
    // live data being thin.
    const whenInit = await page.evaluate(() => {
      const now = document.querySelector('#whenMode [data-when="now"]');
      const preview = document.querySelector('#whenMode [data-when="preview"]');
      return {
        hasControl: !!now && !!preview,
        nowPressed: now && now.getAttribute("aria-pressed"),
        previewPressed: preview && preview.getAttribute("aria-pressed"),
        pickerHidden: document.getElementById("whenPicker").hidden,
        noteHidden: document.getElementById("whenNote").hidden,
      };
    });
    ok(whenInit.hasControl, "a Now / Preview a time control is on the list view");
    ok(whenInit.nowPressed === "true", `Now is the default (${whenInit.nowPressed})`);
    ok(whenInit.previewPressed === "false", "Preview starts unselected");
    ok(whenInit.pickerHidden, "the time/day picker stays hidden until Preview is chosen");
    ok(whenInit.noteHidden, "no preview marker is shown while on Now");

    await page.click('#whenMode [data-when="preview"]');
    await page.waitForTimeout(300);
    const previewOn = await page.evaluate(() => ({
      previewPressed: document.querySelector('#whenMode [data-when="preview"]').getAttribute("aria-pressed"),
      pickerHidden: document.getElementById("whenPicker").hidden,
      noteHidden: document.getElementById("whenNote").hidden,
      noteText: document.getElementById("whenNote").textContent,
      dayChips: [...document.querySelectorAll("#whenDays .chip")].length,
    }));
    ok(previewOn.previewPressed === "true", "Preview becomes pressed once chosen");
    ok(!previewOn.pickerHidden, "choosing Preview reveals the time and day picker");
    ok(!previewOn.noteHidden, "a marker appears the moment a hypothetical time is active");
    ok(/previewing/i.test(previewOn.noteText),
       `the marker says outright it is a preview, not the real clock ("${previewOn.noteText}")`);
    ok(previewOn.dayChips === 7, `all 7 weekdays are offered to preview (${previewOn.dayChips})`);

    console.log("\n  the picker does not cause horizontal body scroll at the 360px mobile floor");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(150);
    const noHscroll = await page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    ok(noHscroll, "the page stays within its own width with the preview picker open at 360px");
    await page.setViewportSize({ width: 390, height: 844 });

    console.log("\n  choosing a time moves the clock line to that hypothetical time, not the real one");
    await page.fill("#whenTime", "18:00");
    await page.dispatchEvent("#whenTime", "change");
    await page.waitForTimeout(300);
    const at1800 = await page.evaluate(() => ({
      clock: document.getElementById("clock").textContent,
      noteText: document.getElementById("whenNote").textContent,
    }));
    ok(at1800.clock === "18:00", `the clock line reads the previewed time (got "${at1800.clock}")`);
    ok(at1800.noteText.includes("18:00"), `the marker names the previewed time ("${at1800.noteText}")`);

    console.log("\n  choosing a day previews that weekday's opening hours");
    await page.click('#whenDays [data-dow="6"]');   // Sunday
    await page.waitForTimeout(300);
    const sunday = await page.evaluate(() => ({
      dowPressed: document.querySelector('#whenDays [data-dow="6"]').getAttribute("aria-pressed"),
      noteText: document.getElementById("whenNote").textContent,
    }));
    ok(sunday.dowPressed === "true", "the chosen day chip becomes pressed");
    ok(/Sunday/.test(sunday.noteText), `the marker names the previewed day ("${sunday.noteText}")`);

    console.log("\n  returning to Now clears the preview entirely");
    await page.click('#whenMode [data-when="now"]');
    await page.waitForTimeout(300);
    const backToNow = await page.evaluate(() => ({
      nowPressed: document.querySelector('#whenMode [data-when="now"]').getAttribute("aria-pressed"),
      pickerHidden: document.getElementById("whenPicker").hidden,
      noteHidden: document.getElementById("whenNote").hidden,
    }));
    ok(backToNow.nowPressed === "true", "Now can be reselected");
    ok(backToNow.pickerHidden, "the picker hides again once back on Now");
    ok(backToNow.noteHidden, "the preview marker disappears once back on Now, so live time is unambiguous again");

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

    console.log("\n  U12: opening_hours coverage trend, static data only");
    // Pushkar is the town this whole run just built, and it is one of the five
    // towns shipped in docs/data/coverage-trend.json, so the trend section
    // must be showing already, from the committed JSON, with no ohsome call.
    const trendOn = await page.evaluate(() => ({
      hasCard: !!document.getElementById("coverageTrend"),
      loaded: !!(typeof COVERAGE_TREND !== "undefined" && COVERAGE_TREND),
      text: (document.getElementById("coverageTrend") || {}).textContent || "",
    }));
    ok(trendOn.loaded, "the static coverage-trend.json loaded");
    ok(trendOn.hasCard, "the trend card renders for Pushkar, a town with a real entry");
    ok(/%/.test(trendOn.text), `the card shows a coverage percentage ("${trendOn.text.slice(0, 60)}")`);

    // A town with no entry in the JSON must render nothing and never touch the
    // network. Swap the town name in place (no rebuild, no live call needed)
    // and redraw the same view, then put it back exactly as it was.
    const trendOff = await page.evaluate(() => {
      const real = GUIDE.place.name;
      GUIDE.place.name = "Nowhereistan, a town with no ohsome entry";
      drawLocal();
      const gone = !document.getElementById("coverageTrend");
      GUIDE.place.name = real;
      drawLocal();
      const back = !!document.getElementById("coverageTrend");
      return { gone, back };
    });
    ok(trendOff.gone, "an unmapped town shows no trend section at all");
    ok(trendOff.back, "restoring the real town brings the card back");
    ok(ohsomeCalls.length === 0,
       `zero requests to ohsome across the whole run (${ohsomeCalls.length}: ${ohsomeCalls.join(", ")})`);

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
    ok(ohsomeCalls.length === 0, `U12: still zero ohsome requests after reload (${ohsomeCalls.length})`);
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
