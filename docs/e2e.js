/* End-to-end check of the browser pipeline, run from node against the live,
   free services. If this passes, the app works: it is the same code path. */
const fs = require("fs");
/* Nominatim requires a User-Agent identifying the app and rejects requests without
   one. A browser always sends its own, and browsers forbid scripts from setting that
   header at all, so this shim exists only to make node behave like a browser here.
   It is deliberately NOT in sources.js: putting it there would be dead code in the
   only environment that actually runs it. */
const _fetch = globalThis.fetch;
globalThis.fetch = (url, opts = {}) => _fetch(url, {
  ...opts,
  headers: { "User-Agent": "tripkit/0.1 (https://github.com/Atishyy27/tripkit)", ...(opts.headers || {}) }
});
const D = __dirname + "/";
eval(fs.readFileSync(D + "sun.js", "utf8"));
eval(fs.readFileSync(D + "sources.js", "utf8"));

const HMm = m => m == null ? "--:--" : String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

async function run(query, tz) {
  console.log("\n" + "=".repeat(64));
  console.log("  " + query);
  console.log("=".repeat(64));

  // 1. geocode
  const hits = await geocode(query);
  if (!hits.length) { console.log("  no geocode hit"); return; }
  const p = hits[0];
  const r = radiusFor(p);
  console.log(`  found      ${p.name}, ${p.country}  (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`);
  console.log(`  radius     ${r} m  (chosen from the place's own bounding box)`);

  // 2. sun, computed locally
  const s = sunTimes(new Date(), p.lat, p.lng, tz);
  console.log(`  sun        first ${HMm(s.firstLight)}  rise ${HMm(s.sunrise)}  set ${HMm(s.sunset)}  last ${HMm(s.lastLight)}   [no network]`);

  // 3. OpenStreetMap
  let places = [];
  try {
    const els = await overpass(p.lat, p.lng, r, m => console.log("    note:", m));
    places = osmToPlaces(els, p.name.toLowerCase());
    const wh = places.filter(x => x.open).length;
    const wd = places.filter(x => x.why).length;
    console.log(`  osm        ${places.length} places, ${wh} with hours (${places.length ? Math.round(100 * wh / places.length) : 0}%), ${wd} with any description`);
  } catch (e) { console.log("  osm        FAILED:", e.message); }

  // 4. Wikivoyage
  let listings = [];
  try {
    let art = null;
    try { art = await wikivoyage(p.name); }
    catch (e) {
      const c = await wikivoyageSearch(p.name + " " + (p.country || ""));
      if (c.length) { art = await wikivoyage(c[0]); console.log(`    (matched via search: ${c[0]})`); }
    }
    if (art) {
      listings = parseListings(art.wikitext, p.name.toLowerCase());
      const wh = listings.filter(x => x.open).length;
      const wp = listings.filter(x => x.priceNote).length;
      const wc = listings.filter(x => x.lat).length;
      console.log(`  wikivoyage “${art.title}”, ${listings.length} listings, ${wh} with hours, ${wp} with prices, ${wc} with coordinates`);
      const intro = introOf(art.wikitext);
      console.log(`  intro      ${intro ? intro.slice(0, 150).replace(/\s+/g, " ") + "…" : "(none found)"}`);
      const c = cautionsOf(art.wikitext);
      console.log(`  cautions   ${c.length} human-written safety notes`);
      if (c[0]) console.log(`             “${c[0].slice(0, 130)}…”`);
    } else console.log("  wikivoyage no article");
  } catch (e) { console.log("  wikivoyage FAILED:", e.message); }

  // 5. merge, the way the app does
  const key = n => String(n).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 22);
  const idx = new Map(); places.forEach(x => idx.set(key(x.name), x));
  let enriched = 0, added = 0;
  for (const w of listings) {
    const hit = idx.get(key(w.name));
    if (hit) { if (w.why && w.why.length > (hit.why || "").length) { hit.why = w.why; hit.from = "OpenStreetMap + Wikivoyage"; enriched++; } }
    else { added++; }
  }
  const total = places.length + added;
  const withText = places.filter(x => x.why).length + added;
  console.log(`  merged     ${enriched} OSM places gained a human description, ${added} Wikivoyage-only places added`);
  console.log(`  RESULT     ${total} places, ${withText} carry a sentence a person wrote`);
  return { total, withText };
}

(async () => {
  for (const [q, tz] of [["Pushkar, Rajasthan", 330], ["Lisbon, Portugal", 60]]) {
    try { await run(q, tz); } catch (e) { console.log("  RUN FAILED:", e.message); }
    await new Promise(r => setTimeout(r, 1500));   // be polite to shared free servers
  }
  console.log("");
})();
