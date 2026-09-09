/* ============================================================
   Data sources. Every one is free, keyless, CORS-open, and made
   by people who are not us. No AI anywhere in this file.
   ============================================================ */

const UA = "tripkit-web/0.1 (https://github.com/Atishyy27/tripkit)";

/* Every request gets a deadline.

   Without one, a provider that accepts the connection and then never answers
   hangs the whole app forever, and the user sees a screen frozen mid step with no
   way to tell whether it is working. A slow source has to become a failed source
   so the fallback chain can move on. */
const DEADLINE = 20000;

function withTimeout(url, opts, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms || DEADLINE);
  return fetch(url, Object.assign({ signal: ac.signal }, opts || {}))
    .finally(() => clearTimeout(timer))
    .catch(e => {
      if (e && e.name === "AbortError")
        throw new Error(`no answer within ${Math.round((ms || DEADLINE) / 1000)}s`);
      throw e;
    });
}

async function jget(url, opts, ms) {
  const r = await withTimeout(url, Object.assign({ headers: { "Accept": "application/json" } }, opts || {}), ms);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

/* ---------------- 1. Find the place (Nominatim) ---------------- */
async function geocode(q) {
  const u = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
    q, format: "jsonv2", limit: "6", addressdetails: "1", "accept-language": "en"
  });
  const rows = await jget(u);
  return rows.map(r => ({
    name: (r.name || r.display_name.split(",")[0]).trim(),
    label: r.display_name,
    lat: +r.lat, lng: +r.lon,
    country: (r.address && (r.address.country || "")) || "",
    countryCode: (r.address && (r.address.country_code || "")).toUpperCase(),
    kind: r.addresstype || r.type,
    // bbox tells us how big the place is, which sets a sensible search radius
    bbox: r.boundingbox ? r.boundingbox.map(Number) : null
  }));
}

/* radius that suits the place rather than a fixed guess */
function radiusFor(p) {
  if (!p.bbox) return 2000;
  const [s, n, w, e] = p.bbox;
  const km = Math.max((n - s) * 111, (e - w) * 111 * Math.cos(p.lat * Math.PI / 180));
  return Math.round(Math.min(Math.max(km * 380, 900), 6000));
}

/* ---------------- 2. Places (Overpass / OpenStreetMap) ---------------- */
const TOURISM = { attraction:"view", museum:"museum", artwork:"view", viewpoint:"view",
                  gallery:"museum", zoo:"do", theme_park:"do", aquarium:"do" };
const AMENITY = { restaurant:"food", cafe:"cafe", fast_food:"street", ice_cream:"sweet",
                  bar:"bar", pub:"bar", marketplace:"shop", place_of_worship:"temple",
                  theatre:"do", cinema:"do", library:"practical", pharmacy:"practical",
                  hospital:"practical", bank:"practical", bus_station:"move" };
const HISTORIC = { monument:"view", memorial:"view", castle:"view", ruins:"view",
                   fort:"view", archaeological_site:"view", city_gate:"view" };
const LEISURE  = { park:"park", garden:"park", nature_reserve:"outdoor" };
/* Somewhere to sleep. Not scope creep: Wikivoyage's {{sleep}} listings were already
   being parsed into this category and then thrown away because nothing asked OSM
   for the matching places. This is three tags, not a feature. */
const TOURISM_STAY = { hotel:"stay", hostel:"stay", guest_house:"stay",
                       apartment:"stay", motel:"stay", chalet:"stay",
                       camp_site:"stay", caravan_site:"stay", alpine_hut:"stay" };
const SHOPS    = ["gift","craft","jewelry","books","antiques","art","bakery",
                  "confectionery","spices","department_store"];

const OVERPASS = ["https://overpass-api.de/api/interpreter",
                  "https://overpass.kumi.systems/api/interpreter"];

function overpassQL(lat, lng, r) {
  const sel = [];
  const add = (k, vals) => {
    const v = Object.keys(vals).join("|");
    sel.push(`node["${k}"~"^(${v})$"](around:${r},${lat},${lng});`);
    sel.push(`way["${k}"~"^(${v})$"](around:${r},${lat},${lng});`);
  };
  add("tourism", TOURISM); add("tourism", TOURISM_STAY); add("amenity", AMENITY);
  add("historic", HISTORIC); add("leisure", LEISURE);
  sel.push(`node["shop"~"^(${SHOPS.join("|")})$"](around:${r},${lat},${lng});`);
  sel.push(`way["shop"~"^(${SHOPS.join("|")})$"](around:${r},${lat},${lng});`);
  return `[out:json][timeout:60];(${sel.join("")});out center tags;`;
}

async function overpass(lat, lng, r, onNote) {
  let lastErr;
  for (const url of OVERPASS) {
    try {
      const res = await withTimeout(url, { method: "POST",
        body: "data=" + encodeURIComponent(overpassQL(lat, lng, r)),
        headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 45000);
      if (!res.ok) throw new Error(res.status + "");
      return (await res.json()).elements || [];
    } catch (e) { lastErr = e; onNote && onNote(`${url.split("/")[2]} failed (${e.message}), trying another mirror`); }
  }
  throw new Error("every OpenStreetMap mirror refused: " + (lastErr && lastErr.message));
}

const OSM_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/* Expand a day selector ("Mo-Fr", "Mo,We,Fr", "Tu-Su") into day indices, Monday 0.

   Returns null when the selector is not purely days, which is the important case:
   a month range like "Apr-Oct" lands here, and null makes the caller refuse the
   whole value rather than flatten it into year round hours. */
function parseDays(sel) {
  if (!sel) return OSM_DAYS.map((_, i) => i);
  const cleaned = sel.replace(/\b(PH|SH)\b/gi, "").trim().replace(/^[,\s]+|[,\s]+$/g, "");
  if (!cleaned) return OSM_DAYS.map((_, i) => i);
  const out = new Set();
  for (const tok of cleaned.split(",").map(x => x.trim()).filter(Boolean)) {
    const range = tok.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su)$/);
    if (range) {
      let i = OSM_DAYS.indexOf(range[1]);
      const end = OSM_DAYS.indexOf(range[2]);
      for (;;) { out.add(i); if (i === end) break; i = (i + 1) % 7; }
    } else if (OSM_DAYS.includes(tok)) {
      out.add(OSM_DAYS.indexOf(tok));
    } else {
      return null;   // a month, a week number, a nesting we do not understand
    }
  }
  return out.size ? [...out].sort((a, b) => a - b) : OSM_DAYS.map((_, i) => i);
}

/* opening_hours -> the fields the engine needs. Refuses to flatten what it cannot.

   The day selector used to be matched and thrown away, so "Mo-Fr 09:00-17:00" was
   reported as open at ten o'clock on a Sunday: the app's one job, said confidently
   and wrong, sending somebody to a locked door. Measured on live OpenStreetMap data,
   the great majority of values this parser flattens carry a day restriction. It is
   kept now, and anything that is not purely a day selector is refused outright
   rather than flattened, which is also what finally makes the seasonal case safe. */
function parseHours(oh) {
  if (!oh || typeof oh !== "string") return { open: null, close: null, shut: null, days: null, note: null };
  let s = oh.trim();
  if (/^24\/7/.test(s)) return { open: "00:00", close: "23:59", shut: null, days: null, note: null };
  let note = null;
  const parts = s.split(";").map(x => x.trim()).filter(Boolean);
  if (parts.length > 1) {
    // A clause only counts as a holiday aside if it is ONLY about holidays. The
    // test used to be "starts with PH", which swallowed "PH,Sa,Su 11:30-23:30":
    // that clause also opens the place at the weekend, so treating it as a footnote
    // and keeping "Mo-Fr" as the truth would report a Saturday as shut when it is
    // open. Anything carrying a weekday goes back to the main pile, where a second
    // main clause makes the whole value refuse to flatten, which is the honest end.
    // "SH Mo-Su 09:00-18:00" qualifies its days BY the holiday: an alternative
    // schedule, and a fair footnote. "PH,Sa,Su 11:30-23:30" lists the holiday
    // ALONGSIDE ordinary weekend days, so it opens the place on a real Saturday and
    // is not a footnote at all. The comma is the tell.
    const isHoliday = x => /^(PH|SH)\b/i.test(x) && !/^(PH|SH)\s*,/i.test(x);
    const main = parts.filter(x => !isHoliday(x));
    const hol  = parts.filter(isHoliday);
    if (main.length === 1 && hol.length) { s = main[0]; note = hol.join("; "); }
    else if (main.length > 1) return { open: null, close: null, shut: null, days: null, note: oh };
  }
  const m = s.match(/^(?:([A-Za-z,\-\s]+)\s)?(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})(?:\s*,\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2}))?\s*$/);
  if (!m) return { open: null, close: null, shut: null, days: null, note: oh };
  const days = parseDays(m[1]);
  if (days === null) return { open: null, close: null, shut: null, days: null, note: oh };
  const all = days.length === 7 ? null : days;   // no restriction is cheaper to carry as null
  const pad = t => String(+t.split(":")[0]).padStart(2, "0") + ":" + t.split(":")[1];
  if (m[4] && m[5]) return { open: pad(m[2]), close: pad(m[5]), shut: [pad(m[3]), pad(m[4])], days: all, note };
  return { open: pad(m[2]), close: pad(m[3]), shut: null, days: all, note };
}

/* A big city returns thousands of rows. A phone does not need every bank branch,
   and a 6 MB blob in localStorage will simply fail to save. Rank by usefulness and
   keep a workable slice, saying so rather than silently truncating. */
function capPlaces(list, max) {
  if (list.length <= max) return { kept: list, dropped: 0 };

  // Two different questions were being answered by one number. "Should a hotel be
  // suggested as the next thing to do" is no, and the ranking handles that. "Should
  // hotels exist in the dataset at all" is obviously yes, and a flat penalty here
  // deleted every one of them from a big city before the user could filter to them.
  //
  // So cap per category with a floor, and no category is ever wiped out entirely.
  const SHARE = {
    view: 0.16, museum: 0.05, temple: 0.07, park: 0.04, do: 0.10, wellness: 0.03,
    food: 0.14, cafe: 0.09, street: 0.05, sweet: 0.02, bar: 0.04,
    shop: 0.07, stay: 0.10, outdoor: 0.02, practical: 0.01, move: 0.01, ghat: 0.03,
  };
  const worth = p => (p.why ? 40 : 0) + (p.open ? 25 : 0) + (p.stars ? p.stars * 4 : 0);
  const byCat = {};
  for (const p of list) (byCat[p.cat] = byCat[p.cat] || []).push(p);

  const kept = [];
  const leftovers = [];
  for (const [cat, rows] of Object.entries(byCat)) {
    rows.sort((a, b) => worth(b) - worth(a));
    // The floor stops a small category vanishing, but it must never exceed what
    // this category could fairly claim, or the quotas overshoot the cap and the
    // final trim ends up cutting by category order instead of by quality.
    const fair = Math.round(max * (SHARE[cat] || 0.02));
    const quota = Math.min(rows.length, Math.max(Math.min(12, Math.floor(max / 4)), fair));
    kept.push(...rows.slice(0, quota));
    leftovers.push(...rows.slice(quota));
  }
  // spend whatever room is left on the best of the rest, whatever category
  leftovers.sort((a, b) => worth(b) - worth(a));
  if (kept.length < max) kept.push(...leftovers.slice(0, max - kept.length));
  // and if the floors still overshot, cut by quality rather than by category order
  kept.sort((a, b) => worth(b) - worth(a));
  const final = kept.slice(0, max);
  return { kept: final, dropped: list.length - final.length };
}

function osmToPlaces(elements, town) {
  const out = [];
  for (const e of elements) {
    const t = e.tags || {};
    const name = t["name:en"] || t.name;
    if (!name) continue;
    const cat = TOURISM[t.tourism] || TOURISM_STAY[t.tourism] || AMENITY[t.amenity] || HISTORIC[t.historic]
             || LEISURE[t.leisure] || (SHOPS.includes(t.shop) ? "shop" : null);
    if (!cat) continue;
    const lat = e.lat != null ? e.lat : (e.center && e.center.lat);
    const lng = e.lon != null ? e.lon : (e.center && e.center.lon);
    if (lat == null || lng == null) continue;
    const h = parseHours(t.opening_hours);
    out.push({
      id: "osm-" + e.type + e.id, name, cat, town,
      lat: +lat.toFixed(6), lng: +lng.toFixed(6), loose: false,
      open: h.open, close: h.close, shut: h.shut, openDays: h.days,
      lo: t.fee === "no" ? 0 : null, hi: t.fee === "no" ? 0 : null,
      priceNote: null, dur: 30,
      why: t.description ||
           (TOURISM_STAY[t.tourism]
             ? [t.tourism === "guest_house" ? "Guest house" :
                t.tourism === "camp_site" ? "Campsite" :
                t.tourism.charAt(0).toUpperCase() + t.tourism.slice(1),
                t.stars ? t.stars + " star" : null,
                t.rooms ? t.rooms + " rooms" : null].filter(Boolean).join(", ")
             : ""),
      warn: h.note ? (h.open ? "holiday rule: " + h.note : "hours listed as “" + h.note + "”, too complex to flatten safely") : null,
      best: [], tags: t.fee === "no" ? ["free"] : [],
      website: t.website || t["contact:website"] || null,
      phone: t.phone || t["contact:phone"] || null,
      wikidata: t.wikidata || null,
      stars: t.stars ? Number(t.stars) : null,
      rooms: t.rooms ? Number(t.rooms) : null,
      src: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      from: "OpenStreetMap"
    });
  }
  return out;
}

/* ---------------- 3. Human judgement (Wikivoyage) ---------------- */
/* Wikivoyage listings are written by travellers, CC BY-SA, and already contain
   the "what this is and whether it is worth it" text an LLM would otherwise invent. */

async function wikivoyage(title) {
  const u = "https://en.wikivoyage.org/w/api.php?" + new URLSearchParams({
    action: "parse", page: title, prop: "wikitext", format: "json",
    formatversion: "2", origin: "*", redirects: "1"
  });
  const d = await jget(u);
  if (d.error) throw new Error(d.error.info || "no Wikivoyage article");
  return { title: d.parse.title, wikitext: d.parse.wikitext };
}

async function wikivoyageSearch(q) {
  const u = "https://en.wikivoyage.org/w/api.php?" + new URLSearchParams({
    action: "query", list: "search", srsearch: q, srlimit: "5",
    format: "json", formatversion: "2", origin: "*"
  });
  const d = await jget(u);
  return (d.query && d.query.search || []).map(r => r.title);
}

const LISTING_CAT = { see:"view", do:"do", eat:"food", drink:"bar", buy:"shop",
                      sleep:"stay", listing:"do", go:"move" };

/* pull {{see|name=..|hours=..|price=..|content=..}} templates out of the wikitext */
function parseListings(wikitext, town) {
  const out = [];
  const re = /\{\{\s*(see|do|eat|drink|buy|sleep|listing|go)\b/gi;
  let m;
  while ((m = re.exec(wikitext)) !== null) {
    // walk forward, tracking brace depth, to find this template's end
    let i = m.index, depth = 0, end = -1;
    for (; i < wikitext.length - 1; i++) {
      if (wikitext[i] === "{" && wikitext[i + 1] === "{") { depth++; i++; }
      else if (wikitext[i] === "}" && wikitext[i + 1] === "}") { depth--; i++; if (!depth) { end = i + 1; break; } }
    }
    if (end < 0) continue;
    const body = wikitext.slice(m.index + 2, end - 2);
    const f = {};
    // split on | at depth 0 so nested templates and [[links]] survive
    let d2 = 0, cur = "";
    for (let j = 0; j < body.length; j++) {
      const c = body[j];
      if (c === "{" && body[j + 1] === "{") { d2++; cur += c; }
      else if (c === "}" && body[j + 1] === "}") { d2--; cur += c; }
      else if (c === "[" && body[j + 1] === "[") { d2++; cur += c; }
      else if (c === "]" && body[j + 1] === "]") { d2--; cur += c; }
      else if (c === "|" && d2 <= 0) { const k = cur.indexOf("="); if (k > 0) f[cur.slice(0, k).trim().toLowerCase()] = cur.slice(k + 1).trim(); cur = ""; }
      else cur += c;
    }
    const k = cur.indexOf("="); if (k > 0) f[cur.slice(0, k).trim().toLowerCase()] = cur.slice(k + 1).trim();

    const name = clean(f.name || "");
    if (!name) continue;
    const h = parseHours(f.hours || "");
    out.push({
      id: "wv-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40),
      name, cat: LISTING_CAT[m[1].toLowerCase()] || "do", town,
      lat: f.lat ? +f.lat : null, lng: f.long ? +f.long : (f.lon ? +f.lon : null),
      loose: !(f.lat && (f.long || f.lon)),
      open: h.open, close: h.close, shut: h.shut, openDays: h.days,
      lo: null, hi: null, priceNote: clean(f.price || "") || null, dur: 30,
      why: clean(f.content || ""),
      warn: (!h.open && f.hours) ? "hours listed as “" + clean(f.hours) + "”" : null,
      best: [], tags: [],
      website: f.url || null, phone: clean(f.phone || "") || null,
      src: f.url || null, from: "Wikivoyage"
    });
  }
  return out;
}

/* wikitext -> readable prose */
function clean(s) {
  let t = String(s);
  // Image and file links carry positioning junk ("thumb|right|300px|") before the
  // caption. Stripping them whole is right: a caption without its picture reads as
  // a non-sequitur, which is how "thumb|right|Central Lisbon seen from a plane"
  // ended up as the opening line of a city description.
  for (let i = 0; i < 4; i++)
    t = t.replace(/\[\[\s*(?:File|Image|Media)\s*:[^\[\]]*(?:\[\[[^\]]*\]\][^\[\]]*)*\]\]/gi, "");
  t = t.replace(/^\s*(?:thumb|right|left|center|frame|frameless|upright|\d+px)\s*\|/gi, "");
  return t
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/'''?/g, "")
    .replace(/<ref[^>]*>.*?<\/ref>/gs, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* the "Understand" section: why this place is the way it is, written by a human */
function introOf(wikitext) {
  const m = wikitext.match(/==\s*Understand\s*==([\s\S]*?)(?:\n==[^=]|$)/i);
  const body = m ? m[1] : wikitext.slice(0, 2500);
  const paras = body.split("\n").map(clean)
    .filter(p => p.length > 120)
    .filter(p => !/^(thumb|right|left|\d+px)\b/i.test(p))
    .filter(p => !/^[{|!]/.test(p));
  return paras.slice(0, 3).join("\n\n");
}

/* warnings boxes are real, human-written safety notes */
function cautionsOf(wikitext) {
  const out = [];
  const re = /\{\{(warningbox|cautionbox|infobox)\s*\|([\s\S]*?)\}\}/gi;
  let m;
  while ((m = re.exec(wikitext)) !== null) {
    const t = clean(m[2]);
    if (t.length > 40) out.push(t.slice(0, 700));
  }
  const stay = wikitext.match(/==\s*Stay safe\s*==([\s\S]*?)(?:\n==[^=]|$)/i);
  if (stay) {
    const paras = stay[1].split("\n").map(clean).filter(p => p.length > 80);
    out.push(...paras.slice(0, 4));
  }
  return out;
}

/* ============================================================
   Fallbacks.

   "Unable to fetch" is a useless thing to show someone standing in a street.
   Every source below is a CHAIN: if the first provider is down, rate limited or
   simply does not know this place, the next one is tried, and the app reports
   which one answered rather than pretending there was only ever one.
   ============================================================ */

async function firstThatWorks(label, attempts, onNote) {
  const tried = [];
  for (const [name, fn] of attempts) {
    try {
      const v = await fn();
      if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) {
        if (tried.length && onNote) onNote(`${label}: ${tried.join(" and ")} did not answer, used ${name}`);
        return { value: v, source: name, tried };
      }
      tried.push(`${name} (nothing)`);
    } catch (e) {
      tried.push(`${name} (${(e && e.message ? e.message : e).toString().slice(0, 40)})`);
    }
  }
  if (onNote) onNote(`${label}: every source failed. Tried ${tried.join(", ")}.`);
  return { value: null, source: null, tried };
}

/* ---------------- geocoding, three providers ---------------- */

async function geocodePhoton(q) {
  const d = await jget("https://photon.komoot.io/api/?" +
    new URLSearchParams({ q, limit: "6", lang: "en" }));
  return (d.features || []).map(f => {
    const p = f.properties || {}, c = (f.geometry || {}).coordinates || [];
    return {
      name: p.name || q,
      label: [p.name, p.city, p.state, p.country].filter(Boolean).join(", "),
      lat: c[1], lng: c[0],
      country: p.country || "", countryCode: (p.countrycode || "").toUpperCase(),
      kind: p.osm_value || p.type, bbox: p.extent
        ? [p.extent[1], p.extent[3], p.extent[0], p.extent[2]] : null
    };
  }).filter(r => r.lat != null && r.lng != null);
}

async function geocodeOpenMeteo(q) {
  const d = await jget("https://geocoding-api.open-meteo.com/v1/search?" +
    new URLSearchParams({ name: q, count: "6", language: "en", format: "json" }));
  return (d.results || []).map(r => ({
    name: r.name,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude, lng: r.longitude,
    country: r.country || "", countryCode: (r.country_code || "").toUpperCase(),
    kind: r.feature_code, bbox: null,
    tz: r.timezone || null, population: r.population || null
  }));
}

async function findPlace(q, onNote) {
  return firstThatWorks("Place search", [
    ["OpenStreetMap Nominatim", () => geocode(q)],
    ["Photon", () => geocodePhoton(q)],
    ["Open-Meteo", () => geocodeOpenMeteo(q)],
  ], onNote);
}

/* ---------------- weather, hourly, no key ---------------- */

const WMO = {
  0: ["Clear", "☀️"], 1: ["Mostly clear", "\u{1F324}️"], 2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"], 45: ["Fog", "\u{1F32B}️"], 48: ["Freezing fog", "\u{1F32B}️"],
  51: ["Light drizzle", "\u{1F326}️"], 53: ["Drizzle", "\u{1F326}️"], 55: ["Heavy drizzle", "\u{1F326}️"],
  61: ["Light rain", "\u{1F327}️"], 63: ["Rain", "\u{1F327}️"], 65: ["Heavy rain", "⛈️"],
  66: ["Freezing rain", "\u{1F327}️"], 67: ["Freezing rain", "\u{1F327}️"],
  71: ["Light snow", "\u{1F328}️"], 73: ["Snow", "\u{1F328}️"], 75: ["Heavy snow", "❄️"],
  80: ["Showers", "\u{1F326}️"], 81: ["Showers", "\u{1F327}️"], 82: ["Violent showers", "⛈️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm with hail", "⛈️"], 99: ["Thunderstorm with hail", "⛈️"]
};
const wmo = c => WMO[c] || ["Unknown", "\u{1F321}️"];

async function weatherOpenMeteo(lat, lng) {
  const d = await jget("https://api.open-meteo.com/v1/forecast?" + new URLSearchParams({
    latitude: lat, longitude: lng, timezone: "auto", forecast_days: "2",
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day",
    hourly: "temperature_2m,apparent_temperature,precipitation_probability,weather_code,uv_index",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code"
  }));
  const c = d.current || {}, h = d.hourly || {}, dy = d.daily || {};
  const hours = (h.time || []).map((t, i) => ({
    time: t.slice(11, 16), day: t.slice(0, 10),
    temp: h.temperature_2m ? Math.round(h.temperature_2m[i]) : null,
    feels: h.apparent_temperature ? Math.round(h.apparent_temperature[i]) : null,
    rain: h.precipitation_probability ? h.precipitation_probability[i] : null,
    code: h.weather_code ? h.weather_code[i] : null,
    uv: h.uv_index ? Math.round(h.uv_index[i]) : null
  }));
  return {
    now: {
      temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature),
      humidity: c.relative_humidity_2m, rain: c.precipitation,
      code: c.weather_code, wind: Math.round(c.wind_speed_10m), isDay: c.is_day === 1
    },
    hours,
    today: {
      max: dy.temperature_2m_max ? Math.round(dy.temperature_2m_max[0]) : null,
      min: dy.temperature_2m_min ? Math.round(dy.temperature_2m_min[0]) : null,
      rain: dy.precipitation_probability_max ? dy.precipitation_probability_max[0] : null,
      code: dy.weather_code ? dy.weather_code[0] : null
    },
    tzFromApi: d.timezone || null,
    tzOffsetSeconds: d.utc_offset_seconds
  };
}

async function weatherMetNo(lat, lng) {
  const d = await jget(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`);
  const series = ((d.properties || {}).timeseries || []);
  if (!series.length) return null;
  const first = series[0].data.instant.details;
  return {
    now: { temp: Math.round(first.air_temperature), feels: Math.round(first.air_temperature),
           humidity: Math.round(first.relative_humidity), rain: null, code: null,
           wind: Math.round(first.wind_speed), isDay: null },
    hours: series.slice(0, 24).map(s => ({
      time: s.time.slice(11, 16), day: s.time.slice(0, 10),
      temp: Math.round(s.data.instant.details.air_temperature),
      feels: Math.round(s.data.instant.details.air_temperature),
      rain: null, code: null, uv: null
    })),
    today: { max: null, min: null, rain: null, code: null },
    approximate: true
  };
}

async function getWeather(lat, lng, onNote) {
  return firstThatWorks("Weather", [
    ["Open-Meteo", () => weatherOpenMeteo(lat, lng)],
    ["MET Norway", () => weatherMetNo(lat, lng)],
  ], onNote);
}

/* The heat window was a guess. With a real hourly forecast it becomes a
   measurement: the stretch where it actually feels hottest today. */
function heatWindowFrom(hours, todayISO) {
  // Open-Meteo returns timestamps already in the destination's timezone, so the
  // day to match is its first one, not the caller's UTC date. Using UTC here
  // silently returned nothing whenever the two disagreed, which near midnight in
  // India is most of the time.
  const days = [...new Set(hours.map(h => h.day))];
  const day = days.includes(todayISO) ? todayISO : days[0];
  const t = hours.filter(h => h.day === day && h.feels != null);
  if (t.length < 6) return null;
  const peak = Math.max(...t.map(h => h.feels));
  if (peak < 26) return null;                       // nowhere near hot enough to matter
  const hot = t.filter(h => h.feels >= peak - 3);
  if (!hot.length) return null;
  return [hot[0].time, hot[hot.length - 1].time];
}

/* ---------------- air quality ---------------- */

async function getAir(lat, lng, onNote) {
  return firstThatWorks("Air quality", [
    ["Open-Meteo", async () => {
      const d = await jget("https://air-quality-api.open-meteo.com/v1/air-quality?" +
        new URLSearchParams({ latitude: lat, longitude: lng, timezone: "auto",
                              current: "pm2_5,pm10,european_aqi,us_aqi" }));
      const c = d.current || {};
      if (c.us_aqi == null && c.pm2_5 == null) return null;
      return { aqi: c.us_aqi, euAqi: c.european_aqi,
               pm25: c.pm2_5 == null ? null : Math.round(c.pm2_5),
               pm10: c.pm10 == null ? null : Math.round(c.pm10) };
    }],
  ], onNote);
}

function aqiBand(aqi) {
  if (aqi == null) return null;
  if (aqi <= 50) return ["Good", "#7ee0a8"];
  if (aqi <= 100) return ["Moderate", "#ffc857"];
  if (aqi <= 150) return ["Unhealthy for sensitive groups", "#ff8a4c"];
  if (aqi <= 200) return ["Unhealthy", "#ff5f6d"];
  if (aqi <= 300) return ["Very unhealthy", "#b98cff"];
  return ["Hazardous", "#ff5f6d"];
}

/* ---------------- country facts ---------------- */

/* Currency, driving side, dial code and emergency numbers do not change from one
   week to the next. Fetching them over a network is the wrong design: it adds a
   dependency that can fail, for data that is effectively static. REST Countries
   proved the point by deprecating itself mid-project and answering HTTP 200 with
   an error body, which is the nastiest failure shape an API has.

   So these ship with the app, work offline, and cannot go down. */
const COUNTRY = {
  IN: ["India", "\u{1F1EE}\u{1F1F3}", "INR", "\u20B9", "+91", "left", ["Hindi", "English"]],
  GB: ["United Kingdom", "\u{1F1EC}\u{1F1E7}", "GBP", "\u00A3", "+44", "left", ["English"]],
  US: ["United States", "\u{1F1FA}\u{1F1F8}", "USD", "$", "+1", "right", ["English"]],
  PT: ["Portugal", "\u{1F1F5}\u{1F1F9}", "EUR", "\u20AC", "+351", "right", ["Portuguese"]],
  ES: ["Spain", "\u{1F1EA}\u{1F1F8}", "EUR", "\u20AC", "+34", "right", ["Spanish"]],
  FR: ["France", "\u{1F1EB}\u{1F1F7}", "EUR", "\u20AC", "+33", "right", ["French"]],
  DE: ["Germany", "\u{1F1E9}\u{1F1EA}", "EUR", "\u20AC", "+49", "right", ["German"]],
  IT: ["Italy", "\u{1F1EE}\u{1F1F9}", "EUR", "\u20AC", "+39", "right", ["Italian"]],
  NL: ["Netherlands", "\u{1F1F3}\u{1F1F1}", "EUR", "\u20AC", "+31", "right", ["Dutch"]],
  GR: ["Greece", "\u{1F1EC}\u{1F1F7}", "EUR", "\u20AC", "+30", "right", ["Greek"]],
  TR: ["Turkey", "\u{1F1F9}\u{1F1F7}", "TRY", "\u20BA", "+90", "right", ["Turkish"]],
  JP: ["Japan", "\u{1F1EF}\u{1F1F5}", "JPY", "\u00A5", "+81", "left", ["Japanese"]],
  TH: ["Thailand", "\u{1F1F9}\u{1F1ED}", "THB", "\u0E3F", "+66", "left", ["Thai"]],
  ID: ["Indonesia", "\u{1F1EE}\u{1F1E9}", "IDR", "Rp", "+62", "left", ["Indonesian"]],
  VN: ["Vietnam", "\u{1F1FB}\u{1F1F3}", "VND", "\u20AB", "+84", "right", ["Vietnamese"]],
  LK: ["Sri Lanka", "\u{1F1F1}\u{1F1F0}", "LKR", "Rs", "+94", "left", ["Sinhala", "Tamil"]],
  NP: ["Nepal", "\u{1F1F3}\u{1F1F5}", "NPR", "Rs", "+977", "left", ["Nepali"]],
  AE: ["United Arab Emirates", "\u{1F1E6}\u{1F1EA}", "AED", "\u062F.\u0625", "+971", "right", ["Arabic"]],
  SG: ["Singapore", "\u{1F1F8}\u{1F1EC}", "SGD", "$", "+65", "left", ["English", "Malay"]],
  MY: ["Malaysia", "\u{1F1F2}\u{1F1FE}", "MYR", "RM", "+60", "left", ["Malay"]],
  AU: ["Australia", "\u{1F1E6}\u{1F1FA}", "AUD", "$", "+61", "left", ["English"]],
  NZ: ["New Zealand", "\u{1F1F3}\u{1F1FF}", "NZD", "$", "+64", "left", ["English"]],
  CA: ["Canada", "\u{1F1E8}\u{1F1E6}", "CAD", "$", "+1", "right", ["English", "French"]],
  MX: ["Mexico", "\u{1F1F2}\u{1F1FD}", "MXN", "$", "+52", "right", ["Spanish"]],
  BR: ["Brazil", "\u{1F1E7}\u{1F1F7}", "BRL", "R$", "+55", "right", ["Portuguese"]],
  AR: ["Argentina", "\u{1F1E6}\u{1F1F7}", "ARS", "$", "+54", "right", ["Spanish"]],
  ZA: ["South Africa", "\u{1F1FF}\u{1F1E6}", "ZAR", "R", "+27", "left", ["English"]],
  EG: ["Egypt", "\u{1F1EA}\u{1F1EC}", "EGP", "\u00A3", "+20", "right", ["Arabic"]],
  MA: ["Morocco", "\u{1F1F2}\u{1F1E6}", "MAD", "DH", "+212", "right", ["Arabic", "French"]],
  CH: ["Switzerland", "\u{1F1E8}\u{1F1ED}", "CHF", "Fr", "+41", "right", ["German", "French"]],
  AT: ["Austria", "\u{1F1E6}\u{1F1F9}", "EUR", "\u20AC", "+43", "right", ["German"]],
  BE: ["Belgium", "\u{1F1E7}\u{1F1EA}", "EUR", "\u20AC", "+32", "right", ["Dutch", "French"]],
  CZ: ["Czechia", "\u{1F1E8}\u{1F1FF}", "CZK", "K\u010D", "+420", "right", ["Czech"]],
  PL: ["Poland", "\u{1F1F5}\u{1F1F1}", "PLN", "z\u0142", "+48", "right", ["Polish"]],
  SE: ["Sweden", "\u{1F1F8}\u{1F1EA}", "SEK", "kr", "+46", "right", ["Swedish"]],
  NO: ["Norway", "\u{1F1F3}\u{1F1F4}", "NOK", "kr", "+47", "right", ["Norwegian"]],
  DK: ["Denmark", "\u{1F1E9}\u{1F1F0}", "DKK", "kr", "+45", "right", ["Danish"]],
  FI: ["Finland", "\u{1F1EB}\u{1F1EE}", "EUR", "\u20AC", "+358", "right", ["Finnish"]],
  IE: ["Ireland", "\u{1F1EE}\u{1F1EA}", "EUR", "\u20AC", "+353", "left", ["English", "Irish"]],
  IS: ["Iceland", "\u{1F1EE}\u{1F1F8}", "ISK", "kr", "+354", "right", ["Icelandic"]],
  HR: ["Croatia", "\u{1F1ED}\u{1F1F7}", "EUR", "\u20AC", "+385", "right", ["Croatian"]],
  HU: ["Hungary", "\u{1F1ED}\u{1F1FA}", "HUF", "Ft", "+36", "right", ["Hungarian"]],
  KR: ["South Korea", "\u{1F1F0}\u{1F1F7}", "KRW", "\u20A9", "+82", "right", ["Korean"]],
  PH: ["Philippines", "\u{1F1F5}\u{1F1ED}", "PHP", "\u20B1", "+63", "right", ["Filipino", "English"]],
  KH: ["Cambodia", "\u{1F1F0}\u{1F1ED}", "KHR", "\u17DB", "+855", "right", ["Khmer"]],
  BD: ["Bangladesh", "\u{1F1E7}\u{1F1E9}", "BDT", "\u09F3", "+880", "left", ["Bengali"]],
  PK: ["Pakistan", "\u{1F1F5}\u{1F1F0}", "PKR", "Rs", "+92", "left", ["Urdu", "English"]],
  BT: ["Bhutan", "\u{1F1E7}\u{1F1F9}", "BTN", "Nu.", "+975", "left", ["Dzongkha"]],
};

const EMERGENCY = {
  IN: { all: "112", police: "100", ambulance: "108", fire: "101", women: "1091" },
  GB: { all: "999", alt: "112" }, US: { all: "911" }, CA: { all: "911" },
  AU: { all: "000" }, NZ: { all: "111" }, PT: { all: "112" }, ES: { all: "112" },
  FR: { all: "112", police: "17", ambulance: "15" }, DE: { all: "112", police: "110" },
  IT: { all: "112" }, NL: { all: "112" }, JP: { all: "110", ambulance: "119" },
  TH: { all: "191", ambulance: "1669", tourist: "1155" },
  ID: { all: "112" }, VN: { all: "113", ambulance: "115" },
  LK: { all: "119", ambulance: "1990" }, NP: { all: "100", ambulance: "102" },
  AE: { all: "999", ambulance: "998" }, SG: { all: "999", ambulance: "995" },
  MY: { all: "999" }, TR: { all: "112" }, EG: { all: "122", ambulance: "123" },
  ZA: { all: "10111", ambulance: "10177" }, BR: { all: "190", ambulance: "192" },
  MX: { all: "911" }, AR: { all: "911" },
};

async function getCountry(code, onNote) {
  if (!code) return { value: null, source: null, tried: [] };
  return firstThatWorks("Country facts", [
    ["built in", async () => {
      const c = COUNTRY[code];
      if (!c) return null;
      return { name: c[0], flag: c[1],
               currency: { code: c[2], symbol: c[3] },
               dialCode: c[4], drivingSide: c[5], languages: c[6],
               emergency: EMERGENCY[code] || null };
    }],
    ["Wikidata", async () => {
      // For anywhere the table does not cover. Slower and thinner, but it knows
      // every country rather than the fifty a traveller usually visits.
      const d = await jget("https://www.wikidata.org/w/api.php?" + new URLSearchParams({
        action: "wbsearchentities", search: code, type: "item",
        language: "en", limit: "1", format: "json", origin: "*" }));
      const hit = (d.search || [])[0];
      if (!hit) return null;
      return { name: hit.label, partial: true, emergency: EMERGENCY[code] || null };
    }],
    ["emergency numbers only", async () =>
      EMERGENCY[code] ? { emergency: EMERGENCY[code], partial: true } : null],
  ], onNote);
}

/* ---------------- photos, from Wikimedia Commons ---------------- */

async function getPhotos(lat, lng, radius, onNote) {
  return firstThatWorks("Photos", [
    ["Wikimedia Commons", async () => {
      const d = await jget("https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
        action: "query", generator: "geosearch", ggscoord: `${lat}|${lng}`,
        ggsradius: String(Math.min(radius, 10000)), ggslimit: "300", ggsnamespace: "6",
        prop: "imageinfo|coordinates", iiprop: "url|extmetadata", iiurlwidth: "480",
        colimit: "max", format: "json", formatversion: "2", origin: "*"
      }));
      const pages = (d.query || {}).pages || [];
      return pages.map(p => {
        const ii = (p.imageinfo || [])[0] || {};
        const meta = ii.extmetadata || {};
        const co = (p.coordinates || [])[0] || {};
        return {
          title: (p.title || "").replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
          thumb: ii.thumburl, full: ii.descriptionurl,
          lat: co.lat != null ? co.lat : null, lng: co.lon != null ? co.lon : null,
          author: clean((meta.Artist || {}).value || ""),
          licence: (meta.LicenseShortName || {}).value || ""
        };
      }).filter(p => p.thumb);
    }],
  ], onNote);
}

/* ---------------- getting around, from OSM ---------------- */

async function getTransit(lat, lng, radius, onNote) {
  const q = `[out:json][timeout:45];(` +
    `node["railway"~"^(station|halt|tram_stop|subway_entrance)$"](around:${radius},${lat},${lng});` +
    `node["highway"="bus_stop"](around:${Math.min(radius, 2000)},${lat},${lng});` +
    `node["amenity"~"^(bus_station|taxi|bicycle_rental|car_rental|ferry_terminal)$"](around:${radius},${lat},${lng});` +
    `);out tags center 200;`;
  return firstThatWorks("Getting around", [
    ["Overpass", async () => {
      let last;
      for (const url of OVERPASS) {
        try {
          const r = await withTimeout(url, { method: "POST", body: "data=" + encodeURIComponent(q),
            headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 30000);
          if (!r.ok) throw new Error(String(r.status));
          const els = (await r.json()).elements || [];
          const KIND = { station: "Train station", halt: "Train halt", tram_stop: "Tram stop",
                         subway_entrance: "Metro entrance", bus_stop: "Bus stop",
                         bus_station: "Bus station", taxi: "Taxi rank",
                         bicycle_rental: "Bike hire", car_rental: "Car hire",
                         ferry_terminal: "Ferry" };
          return els.map(e => {
            const t = e.tags || {};
            const k = t.railway || t.highway || t.amenity;
            return { name: t["name:en"] || t.name || KIND[k] || "Stop",
                     kind: KIND[k] || k, lat: e.lat, lng: e.lon,
                     network: t.network || t.operator || null };
          }).filter(x => x.lat != null);
        } catch (e) { last = e; }
      }
      throw last || new Error("no mirror answered");
    }],
  ], onNote);
}

/* ============================================================
   Pictures, attached to individual places.

   Two routes, because they cover different things:
     Wikidata  a place OSM has tagged with a wikidata id usually has a canonical
               photograph on Commons. Exact, and it is a picture OF that place.
     Geosearch everything else gets the nearest Commons photograph taken within a
               short distance, which is usually of it and occasionally of the
               street outside. Marked as nearby rather than presented as certain.
   ============================================================ */

async function imagesForWikidata(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 45) {
    const batch = ids.slice(i, i + 45);
    try {
      const d = await jget("https://www.wikidata.org/w/api.php?" + new URLSearchParams({
        action: "wbgetentities", ids: batch.join("|"), props: "claims",
        format: "json", formatversion: "2", origin: "*"
      }), {}, 25000);
      for (const [id, ent] of Object.entries(d.entities || {})) {
        const claim = ((ent.claims || {}).P18 || [])[0];
        const file = claim && claim.mainsnak && claim.mainsnak.datavalue &&
                     claim.mainsnak.datavalue.value;
        if (file) out[id] = commonsThumb(file, 480);
      }
    } catch (e) { /* a batch failing must not lose the batches that worked */ }
  }
  return out;
}

/* Commons serves a thumbnail straight from the file name, no API call needed. */
function commonsThumb(file, w) {
  const n = String(file).replace(/ /g, "_");
  return "https://commons.wikimedia.org/wiki/Special:FilePath/" +
         encodeURIComponent(n) + "?width=" + (w || 480);
}

const R_EARTH = 6371000;
function metres(a, b, c, d) {
  const p = Math.PI / 180, x = (c - a) * p, y = (d - b) * p;
  const h = Math.sin(x / 2) ** 2 +
            Math.cos(a * p) * Math.cos(c * p) * Math.sin(y / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

/* Give each place its best available picture, without inventing one. */
async function attachPhotos(places, commons, onNote) {
  const withId = places.filter(p => p.wikidata).slice(0, 180);
  let exact = {};
  if (withId.length) {
    try { exact = await imagesForWikidata(withId.map(p => p.wikidata)); }
    catch (e) { onNote && onNote("Photos: Wikidata declined, falling back to nearby ones"); }
  }
  let named = 0, near = 0;
  const pool = (commons || []).filter(c => c.lat != null && c.lng != null);
  // One photograph could be attached to several different places, so a street full
  // of cafes all showed the same picture and each of them implied it was theirs.
  // A nearby photo is used once.
  const taken = new Set();
  for (const p of places) {
    // A place pinned at the town centre because nothing recorded its position must
    // not take "the nearest photo", which would be a photo of the town centre.
    if (p.loose && !(p.wikidata && exact[p.wikidata])) continue;
    if (p.wikidata && exact[p.wikidata]) { p.photo = exact[p.wikidata]; p.photoExact = true; named++; continue; }
    let best = null, bestD = 1e9;
    for (const c of pool) {
      if (taken.has(c.thumb)) continue;
      const d = metres(p.lat, p.lng, c.lat, c.lng);
      if (d < bestD) { bestD = d; best = c; }
    }
    // 120 m was far too generous. It attached a photograph of a monkey to a pizzeria,
    // which is the fabrication problem in visual form: a confidently wrong picture is
    // worse than an honest blank. Inside 40 m a Commons photo is usually of the thing
    // itself, and it is still labelled as nearby rather than claimed as certain.
    if (best && bestD < 40) {
      p.photo = best.thumb; p.photoExact = false;
      p.photoTitle = best.title; p.photoDist = Math.round(bestD); near++;
      taken.add(best.thumb);
    }
  }
  if (onNote && (named || near))
    onNote(`Photos: ${named} matched exactly through Wikidata, ${near} from a picture taken within 40 m`);
  return { named, near };
}
