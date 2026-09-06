/* The test body. Concatenated after the shipped browser scripts by run.js, which
   is exactly how a browser loads them, so these tests exercise the real files in
   the real scope rather than a copy in an eval sandbox. */
const HMs = m => m == null ? null : String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

/* =========================================================================
   sun.js  -  the only maths in the project, and everything keys off it
   ========================================================================= */
describe("sun: local sunrise and sunset", () => {
  // Reference values derived independently from the solar geometry rather than
  // copied from the code's own output, which would make this test tautological.
  // Lisbon 21 Jun: solar noon 13:38 WEST, half-day 7h26m, so sunset 21:04.
  // Sydney 21 Dec: solar noon 12:53 AEDT, half-day 7h12m, so sunset 20:05.
  const cases = [
    ["Ajmer, 6 Sep",      2026, 8,  6,  26.4499,  74.6399, 330, 373, 1127],
    ["Lisbon, 21 Jun",    2026, 5,  21, 38.7223,  -9.1393, 60,  371, 1264],
    ["Munich, 21 Jun",    2026, 5,  21, 48.1372,  11.5756, 120, 313, 1277],
    ["Reykjavik, 21 Dec", 2026, 11, 21, 64.1466, -21.9426, 0,   682, 930],
    ["Sydney, 21 Dec",    2026, 11, 21, -33.8688, 151.2093, 660, 341, 1205],
  ];
  for (const [name, y, mo, d, lat, lng, tz, wantRise, wantSet] of cases) {
    it(`${name} is within 4 minutes of the almanac`, () => {
      const s = sunTimes(new Date(Date.UTC(y, mo, d)), lat, lng, tz);
      near(s.sunrise, wantRise, 4, `sunrise ${HMs(s.sunrise)}, expected about ${HMs(wantRise)}`);
      near(s.sunset, wantSet, 4, `sunset ${HMs(s.sunset)}, expected about ${HMs(wantSet)}`);
    });
  }

  it("first light comes before sunrise, last light after sunset", () => {
    const s = sunTimes(new Date(Date.UTC(2026, 8, 6)), 26.45, 74.64, 330);
    ok(s.firstLight < s.sunrise, "civil dawn should precede sunrise");
    ok(s.lastLight > s.sunset, "civil dusk should follow sunset");
  });

  it("southern hemisphere gets a long December day, not a short one", () => {
    const s = sunTimes(new Date(Date.UTC(2026, 11, 21)), -33.87, 151.21, 660);
    ok(s.sunset - s.sunrise > 800, `Sydney in December should have a long day, got ${s.sunset - s.sunrise} min`);
  });

  it("polar night returns null rather than a wrong number", () => {
    const s = sunTimes(new Date(Date.UTC(2026, 11, 21)), 78.22, 15.65, 60);  // Svalbard
    eq(s.sunrise, null, "the sun does not rise over Svalbard in December, so this must be null");
  });
});

/* =========================================================================
   sources.js  -  parsing other people's data
   ========================================================================= */
describe("opening_hours parsing", () => {
  const h = s => parseHours(s);

  it("a simple range", () => {
    eq(h("Mo-Su 09:00-22:00"), { open: "09:00", close: "22:00", shut: null, note: null });
  });
  it("24/7", () => {
    eq(h("24/7").open, "00:00"); eq(h("24/7").close, "23:59");
  });
  it("a midday closure becomes a shut window", () => {
    eq(h("Mo-Fr 05:30-13:30,15:00-21:00"),
       { open: "05:30", close: "21:00", shut: ["13:30", "15:00"], note: null });
  });
  it("a public holiday clause is kept as a note, not thrown away", () => {
    const r = h("Mo-Sa 10:00-18:00; PH off");
    eq(r.open, "10:00"); eq(r.close, "18:00"); eq(r.note, "PH off");
  });
  it("single digit hours are padded", () => {
    eq(h("Mo-Su 9:00-17:00").open, "09:00");
  });
  it("refuses to flatten a seasonal rule", () => {
    const r = h("Apr-Sep: Mo-Su sunrise-sunset");
    eq(r.open, null, "must not invent clock times from a sunrise-relative rule");
    ok(r.note, "and must hand back the original string so a human can read it");
  });
  it("empty and rubbish input give null, never a guess", () => {
    eq(h("").open, null); eq(h(null).open, null); eq(h("whenever").open, null);
  });
});

describe("Wikivoyage listing parsing", () => {
  const WT = `
{{see|name=Jerónimos Monastery|lat=38.6979|long=-9.2065|hours=Tu-Su 10:00-17:30|price=€10|content=A vast [[Manueline]] monastery. Queues are long; go early.}}
{{eat|name=Pastéis de Belém|hours=Mo-Su 08:00-23:00|price=€1.30 each|content=The original custard tart shop, open since 1837.}}
{{do|name=Tram 28|content=The classic yellow tram. Pickpockets are a genuine problem.}}
{{buy|name=Feira da Ladra|content=Flea market with {{nested|template}} inside it and a [http://example.com link].}}
{{see|content=no name so this one must be dropped}}
`;
  const l = parseListings(WT, "lisbon");

  it("finds every named listing and drops the nameless one", () => {
    eq(l.length, 4);
    eq(l.map(x => x.name), ["Jerónimos Monastery", "Pastéis de Belém", "Tram 28", "Feira da Ladra"]);
  });
  it("maps the template type to a category", () => {
    eq(l.map(x => x.cat), ["view", "food", "do", "shop"]);
  });
  it("keeps hours, price and coordinates when present", () => {
    eq(l[0].open, "10:00"); eq(l[0].close, "17:30");
    eq(l[0].priceNote, "€10");
    near(l[0].lat, 38.6979, 0.001);
    no(l[0].loose, "a listing with real coordinates must not be marked approximate");
  });
  it("marks a listing with no coordinates as approximate", () => {
    ok(l[1].loose);
  });
  it("carries the human sentence through, which is the whole point", () => {
    ok(l[2].why.includes("Pickpockets"), "got: " + l[2].why);
  });
  it("survives nested templates and external links without losing the text", () => {
    ok(l[3].why.includes("Flea market"), "got: " + l[3].why);
    no(l[3].why.includes("{{"), "template syntax leaked into the description");
    no(l[3].why.includes("http"), "raw url leaked into the description");
  });
});

describe("wikitext cleaning", () => {
  it("strips image markup entirely rather than leaving its positioning junk", () => {
    const out = clean("[[File:Lisbon.jpg|thumb|right|300px|Central Lisbon from a plane]] Lisbon is built on seven hills.");
    no(out.includes("thumb"), "got: " + out);
    no(out.includes("File:"), "got: " + out);
    ok(out.startsWith("Lisbon is built"), "got: " + out);
  });
  it("keeps the visible half of a piped link", () => {
    eq(clean("the [[Manueline|Manueline style]] monastery"), "the Manueline style monastery");
  });
  it("removes bold markers and collapses whitespace", () => {
    eq(clean("'''Very'''   good"), "Very good");
  });
});

describe("osm element mapping", () => {
  const els = [
    { type: "node", id: 1, lat: 26.48, lon: 74.55, tags: { name: "Brahma Temple", amenity: "place_of_worship", opening_hours: "Mo-Su 05:30-13:30,15:00-21:00" } },
    { type: "way", id: 2, center: { lat: 26.49, lon: 74.56 }, tags: { name: "Big Park", leisure: "park", fee: "no" } },
    { type: "node", id: 3, lat: 26.47, lon: 74.54, tags: { amenity: "cafe" } },                 // no name
    { type: "node", id: 4, lat: 26.47, lon: 74.54, tags: { name: "A Postbox", amenity: "post_box" } }, // uninteresting
    { type: "node", id: 5, tags: { name: "No Coords", tourism: "museum" } },                     // no position
  ];
  const p = osmToPlaces(els, "pushkar");

  it("keeps only named, positioned, visitor-relevant things", () => {
    eq(p.map(x => x.name), ["Brahma Temple", "Big Park"]);
  });
  it("reads a way's centre as its position", () => {
    near(p[1].lat, 26.49, 0.001);
  });
  it("carries the midday closure through", () => {
    eq(p[0].shut, ["13:30", "15:00"]);
  });
  it("fee=no becomes free rather than unknown", () => {
    eq(p[1].lo, 0); eq(p[1].hi, 0); ok(p[1].tags.includes("free"));
  });
  it("links back to the exact OSM object so a claim can be checked", () => {
    ok(p[0].src.includes("openstreetmap.org/node/1"), p[0].src);
  });
});

describe("capPlaces", () => {
  const mk = (n, cat, why, open) => ({ name: n, cat, why: why || "", open: open || null });
  it("keeps everything when under the cap", () => {
    const r = capPlaces([mk("a", "view"), mk("b", "food")], 10);
    eq(r.kept.length, 2); eq(r.dropped, 0);
  });
  it("drops chores before it drops anything a person described", () => {
    const list = [];
    for (let i = 0; i < 20; i++) list.push(mk("bank" + i, "practical"));
    list.push(mk("described", "view", "a real description", "09:00"));
    const r = capPlaces(list, 5);
    eq(r.dropped, 16);
    ok(r.kept.some(x => x.name === "described"), "the one described place must survive the cap");
    eq(r.kept.filter(x => x.cat === "practical").length, 4);
  });
});

/* =========================================================================
   engine.js  -  the ranking, which is the product
   ========================================================================= */
function boot(over) {
  const cfg = Object.assign({
    arrive: M("06:00"), depart: M("19:00"), hopMinutes: 30,
    exitBufferMinutes: 60, tzOffsetMinutes: 330, multiDay: false
  }, (over && over.config) || {});
  const cond = Object.assign({ sunrise: M("06:12"), sunset: M("18:48") }, (over && over.conditions) || {});
  return init({ config: cfg, conditions: cond, places: (over && over.places) || [] });
}

describe("engine: day phases", () => {
  it("tile the whole day with no gap and no overlap", () => {
    boot();
    eq(PHASES[0].from, 0, "the day must start at 00:00");
    eq(PHASES[PHASES.length - 1].to, 1440, "the day must end at 24:00");
    for (let i = 1; i < PHASES.length; i++)
      eq(PHASES[i].from, PHASES[i - 1].to, `gap or overlap before ${PHASES[i].name}`);
  });
  it("every minute of the day resolves to exactly one phase", () => {
    boot();
    for (let t = 0; t < 1440; t++) {
      const hits = PHASES.filter(p => t >= p.from && t < p.to);
      eq(hits.length, 1, `minute ${HMs(t)} matched ${hits.length} phases`);
    }
  });
  it("shift with the sun, so a Nordic winter is not an Indian summer", () => {
    boot({ conditions: { sunrise: M("11:22"), sunset: M("15:30") } });
    const dark = PHASES.find(p => p.id === "night");
    ok(dark.to > M("09:00"), "a 11:22 sunrise should leave the morning dark, got " + HMs(dark.to));
  });
});

describe("engine: openState", () => {
  const P = (o, c, shut) => ({ name: "x", open: o, close: c, shut: shut || null });

  it("open inside its hours", () => eq(openState(P("09:00", "17:00"), M("12:00")).state, "open"));
  it("shut before opening", () => eq(openState(P("09:00", "17:00"), M("08:00")).state, "soon"));
  it("shut long before opening is shut, not soon", () => eq(openState(P("09:00", "17:00"), M("03:00")).state, "shut"));
  it("shut after closing", () => eq(openState(P("09:00", "17:00"), M("18:00")).state, "shut"));
  it("warns when closing within 50 minutes", () => eq(openState(P("09:00", "17:00"), M("16:30")).state, "closing"));

  it("respects a midday closure", () => {
    const p = P("05:30", "21:00", ["13:30", "15:00"]);
    eq(openState(p, M("13:00")).state, "open");
    eq(openState(p, M("14:00")).state, "shut");
    eq(openState(p, M("15:30")).state, "open");
  });

  it("handles a venue that closes after midnight", () => {
    const p = P("18:00", "02:00");
    eq(openState(p, M("20:00")).state, "open", "should be open in the evening");
    eq(openState(p, M("01:00")).state, "open", "should still be open at 01:00");
    eq(openState(p, M("03:00")).state, "shut", "should be shut at 03:00");
  });

  it("treats close 00:00 as end of day, not as overnight", () => {
    eq(openState(P("12:00", "00:00"), M("01:00")).state, "shut",
       "a place closing at midnight is not open at 1am");
  });

  it("reports unknown hours as unknown rather than assuming shut", () => {
    eq(openState({ name: "x", open: null, close: null }, M("12:00")).state, "unknown");
  });

  it("never contradicts a venue's own hours, across every minute", () => {
    const p = P("09:00", "17:00");
    for (let t = 0; t < 1440; t += 7) {
      const inside = t >= M("09:00") && t < M("17:00");
      const st = openState(p, t).state;
      const saysOpen = st === "open" || st === "closing";
      eq(saysOpen, inside, `at ${HMs(t)} hours say ${inside ? "open" : "shut"} but engine says ${st}`);
    }
  });
});

describe("engine: the departure deadline", () => {
  const long = { name: "Long thing", cat: "view", open: "00:00", close: "23:59", dur: 120, tags: [], why: "x" };
  const quick = { name: "Quick thing", cat: "view", open: "00:00", close: "23:59", dur: 10, tags: [], why: "x" };

  it("hides what cannot fit before you must leave", () => {
    boot({ places: [long, quick] });
    const names = rankNow(M("17:40"), {}).list.map(r => r.p.name);
    no(names.includes("Long thing"), "a two hour thing must not be offered 20 minutes before the deadline");
    ok(names.includes("Quick thing"));
  });

  it("returns nothing at all once leaving is the only option", () => {
    boot({ places: [long, quick] });
    eq(rankNow(M("18:55"), {}).list.length, 0,
       "an empty result is the honest answer here, not a padded one");
  });

  it("escalates its warning as the deadline approaches", () => {
    boot();
    eq(exitState(M("12:00")).level, "ok");
    eq(exitState(M("17:30")).level, "soon");
    eq(exitState(M("18:10")).level, "urgent");
    eq(exitState(M("18:45")).level, "now");
    eq(exitState(M("19:30")).level, "gone");
  });

  it("switches all of that off for a multi-day trip", () => {
    boot({ config: { multiDay: true }, places: [long] });
    eq(exitState(M("18:55")).level, "ok");
    ok(rankNow(M("18:55"), {}).list.length > 0, "a multi-day trip has no deadline to fail");
  });
});

describe("engine: ranking", () => {
  // A late departure, so these tests measure ranking and nothing else. The
  // deadline has its own suite; mixing the two hid a real result behind a filter.
  const at = (t, places) => {
    boot({ places, config: { depart: M("23:30") } });
    return rankNow(M(t), {}).list.map(r => r.p.name);
  };

  const view = { name: "Viewpoint", cat: "view", open: "00:00", close: "23:59", dur: 30,
                 best: ["17:45"], tags: ["outdoor", "sunset", "view"], why: "the view", from: "Wikivoyage" };
  const lunch = { name: "Shaded restaurant", cat: "food", open: "11:00", close: "22:00", dur: 45,
                  best: ["13:00"], tags: ["indoor", "shade", "food"], why: "lunch", from: "Wikivoyage" };
  const bank = { name: "A Bank", cat: "practical", open: "00:00", close: "23:59", dur: 10, tags: [], why: "" };

  it("puts the right thing first at the right hour", () => {
    eq(at("13:00", [view, lunch, bank])[0], "Shaded restaurant");
    eq(at("17:45", [view, lunch, bank])[0], "Viewpoint");
  });

  it("never lets an open bank outrank a described place", () => {
    const order = at("13:00", [bank, view, lunch]);
    ok(order.indexOf("A Bank") > order.indexOf("Viewpoint"),
       "this exact failure shipped once: open infrastructure beat everything worth seeing");
  });

  it("penalises exposed outdoor things during the hot hours", () => {
    boot({ places: [view, lunch], config: { depart: M("23:30") } });
    const noon = rankNow(M("13:00"), {}).list;
    const v = noon.find(r => r.p.name === "Viewpoint"), l = noon.find(r => r.p.name === "Shaded restaurant");
    ok(l.s > v.s, "shade should win at the hottest part of the day");
  });

  it("filters by category without changing the order within it", () => {
    boot({ places: [view, lunch, bank], config: { depart: M("23:30") } });
    const f = rankNow(M("13:00"), { cat: "food" }).list;
    eq(f.length, 1); eq(f[0].p.name, "Shaded restaurant");
  });

  it("searches names and descriptions", () => {
    boot({ places: [view, lunch, bank], config: { depart: M("23:30") } });
    eq(rankNow(M("13:00"), { q: "lunch" }).list.length, 1);
    eq(rankNow(M("13:00"), { q: "zzzz" }).list.length, 0);
  });

  it("still hides a thing that cannot fit, even when it is the best thing", () => {
    // 17:45 is the viewpoint's own hour, but with a 19:00 departure and a 30 minute
    // journey there is no room for a 30 minute stop. Correctly showing nothing here
    // is more useful than showing the best thing you cannot do.
    boot({ places: [view] });
    eq(rankNow(M("17:45"), {}).list.length, 0);
  });

  it("gives a reason when it promotes something", () => {
    boot({ places: [view], config: { depart: M("23:30") } });
    const r = rankNow(M("17:45"), {}).list[0];
    ok(r.why.length > 0 && r.why[0].includes("hour"), "got: " + JSON.stringify(r.why));
  });
});

describe("engine: robustness against thin data", () => {
  it("survives a build with no conditions at all", () => {
    init({ config: { arrive: 0, depart: 1439 }, places: [], conditions: undefined });
    ok(PHASES.length > 0, "phases must still be built from defaults");
    ok(SUNRISE > 0);
  });
  it("survives places missing nearly every field", () => {
    boot({ places: [{ name: "Bare" }, { name: "Half", cat: "view" }] });
    const l = rankNow(M("12:00"), {}).list;
    ok(l.length >= 1, "a place with only a name should still be rankable, just poorly");
  });
  it("does not crash on an empty dataset", () => {
    boot({ places: [] });
    eq(rankNow(M("12:00"), {}).list.length, 0);
    eq(closingSoon(M("12:00")).length, 0);
    eq(openingSoon(M("12:00")).length, 0);
  });
});



/* =========================================================================
   The whole page, loaded the way a browser loads it.

   This suite exists because the app shipped completely dead: engine.js and
   app.js both declared `let TRIP` at top level, which across two script tags is
   a SyntaxError that kills the page before a single line runs. Every other test
   passed, because every other test loaded the files individually.
   ========================================================================= */
describe("the page loads as a browser would", () => {
  const fs = require("fs"), path = require("path");
  const DOCS = DOCS_DIR;
  const FILES = ["sun.js", "sources.js", "engine.js", "app.js"];

  it("has no duplicate top level declaration across the scripts", () => {
    const seen = new Map();
    const dupes = [];
    for (const f of FILES) {
      const src = fs.readFileSync(path.join(DOCS, f), "utf8");
      const names = new Set();
      const re = /^(?:const|let|var)\s+([^=;\n]+?)(?:=|;|$)/gm;
      let m;
      while ((m = re.exec(src)) !== null)
        for (const part of m[1].split(","))
          if (/^[A-Za-z_$][\w$]*$/.test(part.trim())) names.add(part.trim());
      let fm; const fre = /^function\s+([A-Za-z_$][\w$]*)/gm;
      while ((fm = fre.exec(src)) !== null) names.add(fm[1]);
      for (const n of names) {
        if (seen.has(n)) dupes.push(`${n} in both ${seen.get(n)} and ${f}`);
        else seen.set(n, f);
      }
    }
    eq(dupes, [], "a name declared twice across script tags is a SyntaxError, not a warning");
  });

  it("evaluates end to end without throwing", () => {
    const mk = () => ({ value: "", textContent: "", innerHTML: "", style: {},
      classList: { add() {}, remove() {} }, addEventListener() {}, onclick: null,
      hidden: false, querySelector: () => mk(), setAttribute() {}, dataset: {},
      showModal() {}, close() {} });
    const sandbox = {
      window: { addEventListener() {} },
      location: { pathname: "/", search: "", origin: "x" },
      navigator: {}, L: { map: () => ({}), tileLayer: () => ({ addTo() {} }) },
      localStorage: { getItem: () => null, setItem() {} },
      document: { querySelector: () => mk(), querySelectorAll: () => [],
                  body: { insertAdjacentHTML() {} }, getElementById: () => mk(),
                  addEventListener() {} },
    };
    const src = FILES.map(f => fs.readFileSync(path.join(DOCS, f), "utf8")).join("\n;\n");
    const vm = require("vm");
    const ctx = vm.createContext(Object.assign({ console, setInterval, clearInterval,
                                                 setTimeout, require }, sandbox));
    vm.runInContext(src, ctx);   // throws on any load time error
  });

  it("every element the code reaches for actually exists in the markup", () => {
    // The app shipped frozen on its first step because progress() looked for
    // "#bar>div" while the markup said class="bar". The selector returned null,
    // reading .style threw, and the whole build aborted with no message.
    const app = fs.readFileSync(path.join(DOCS, "app.js"), "utf8");
    const html = fs.readFileSync(path.join(DOCS, "index.html"), "utf8");
    const wanted = new Set();
    for (const m of app.matchAll(/\$\("#([A-Za-z0-9_-]+)/g)) wanted.add(m[1]);
    for (const m of app.matchAll(/getElementById\("([A-Za-z0-9_-]+)"/g)) wanted.add(m[1]);
    // Some elements are rendered by the app itself rather than sitting in the
    // static markup, so an id counts as defined if either the page or the code
    // creates it. What must never happen is reaching for one that nothing makes.
    const have = new Set([
      ...[...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]),
      ...[...app.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]),
    ]);
    const missing = [...wanted].filter(id => !have.has(id)).sort();
    eq(missing, [], "the code reaches for ids that nothing ever creates");
  });

  it("no network call is made without a deadline", () => {
    // A provider that accepts a connection and never answers used to hang the app
    // forever, which presents as "it is broken" with no way to tell.
    const src = fs.readFileSync(path.join(DOCS, "sources.js"), "utf8");
    const bare = src.split("\n")
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /(?<!with)[^A-Za-z]fetch\(/.test(l))
      // withTimeout itself is the one legitimate raw fetch: it is the wrapper that
      // attaches the abort signal. Recognised by that signal rather than by name,
      // so renaming the function cannot quietly disable this check.
      .filter(([, l]) => !l.includes("withTimeout") && !l.includes("globalThis.fetch")
                      && !l.includes("signal: ac.signal")
                      && !/^\s*(\*|\/\/)/.test(l));
    eq(bare.map(([n]) => n), [], "these lines call fetch directly, with no timeout");
    ok(src.includes("AbortController"), "there is no timeout mechanism at all");
  });

  it("no url template has a space inside a coordinate pair", () => {
    // A cosmetic sweep put a space after every comma, including inside
    // "destination=${lat},${lng}". It stayed valid JavaScript, every test passed,
    // and every "walk there" link in the app pointed nowhere for a day.
    const bad = [];
    for (const f of ["app.js", "sources.js", "engine.js"]) {
      const src = fs.readFileSync(path.join(DOCS, f), "utf8");
      src.split("\n").forEach((line, n) => {
        if (!/https?:\/\//.test(line)) return;
        if (/(?:destination|query|mlat|pickup|dropoff|ggscoord|around)[^"'`\n]*,\s+/.test(line))
          bad.push(`${f}:${n + 1}`);
      });
    }
    eq(bad, [], "a space inside a coordinate pair breaks the link silently");
  });

  it("index.html loads every script the app needs, in an order that works", () => {
    const html = fs.readFileSync(path.join(DOCS, "index.html"), "utf8");
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    for (const f of FILES) ok(order.includes(f), `${f} is never loaded by index.html`);
    ok(order.indexOf("vendor/leaflet.js") < order.indexOf("app.js"),
       "Leaflet must load before the code that calls it");
    ok(order.indexOf("engine.js") < order.indexOf("app.js"),
       "the engine must load before the app that uses it");
  });
});

report();
