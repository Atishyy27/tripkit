/* ============================================================
   Data sources. Every one is free, keyless, CORS-open, and made
   by people who are not us. No AI anywhere in this file.
   ============================================================ */

const UA = "tripkit-web/0.1 (https://github.com/Atishyy27/tripkit)";

async function jget(url, opts) {
  const r = await fetch(url, Object.assign({ headers: { "Accept": "application/json" } }, opts || {}));
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
  add("tourism", TOURISM); add("amenity", AMENITY);
  add("historic", HISTORIC); add("leisure", LEISURE);
  sel.push(`node["shop"~"^(${SHOPS.join("|")})$"](around:${r},${lat},${lng});`);
  sel.push(`way["shop"~"^(${SHOPS.join("|")})$"](around:${r},${lat},${lng});`);
  return `[out:json][timeout:60];(${sel.join("")});out center tags;`;
}

async function overpass(lat, lng, r, onNote) {
  let lastErr;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(overpassQL(lat, lng, r)),
        headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (!res.ok) throw new Error(res.status + "");
      return (await res.json()).elements || [];
    } catch (e) { lastErr = e; onNote && onNote(`${url.split("/")[2]} failed (${e.message}), trying another mirror`); }
  }
  throw new Error("every OpenStreetMap mirror refused: " + (lastErr && lastErr.message));
}

/* opening_hours -> the fields the engine needs. Refuses to flatten what it cannot. */
function parseHours(oh) {
  if (!oh || typeof oh !== "string") return { open: null, close: null, shut: null, note: null };
  let s = oh.trim();
  if (/^24\/7/.test(s)) return { open: "00:00", close: "23:59", shut: null, note: null };
  let note = null;
  const parts = s.split(";").map(x => x.trim()).filter(Boolean);
  if (parts.length > 1) {
    const main = parts.filter(x => !/^(PH|SH)\b/i.test(x));
    const hol  = parts.filter(x =>  /^(PH|SH)\b/i.test(x));
    if (main.length === 1 && hol.length) { s = main[0]; note = hol.join("; "); }
  }
  const m = s.match(/^(?:[A-Za-z,\-\s]+\s)?(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})(?:\s*,\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2}))?\s*$/);
  if (!m) return { open: null, close: null, shut: null, note: oh };
  const pad = t => String(+t.split(":")[0]).padStart(2, "0") + ":" + t.split(":")[1];
  if (m[3] && m[4]) return { open: pad(m[1]), close: pad(m[4]), shut: [pad(m[2]), pad(m[3])], note };
  return { open: pad(m[1]), close: pad(m[2]), shut: null, note };
}

/* A big city returns thousands of rows. A phone does not need every bank branch,
   and a 6 MB blob in localStorage will simply fail to save. Rank by usefulness and
   keep a workable slice, saying so rather than silently truncating. */
function capPlaces(list, max) {
  if (list.length <= max) return { kept: list, dropped: 0 };
  const worth = p => (p.why ? 40 : 0) + (p.open ? 25 : 0)
    + ({ view: 30, museum: 28, park: 20, temple: 18, do: 16, shop: 8,
         food: 10, cafe: 8, sweet: 6, bar: 6, street: 6 }[p.cat] || 0)
    - (["practical", "move", "stay"].includes(p.cat) ? 40 : 0);
  const sorted = list.slice().sort((a, b) => worth(b) - worth(a));
  return { kept: sorted.slice(0, max), dropped: list.length - max };
}

function osmToPlaces(elements, town) {
  const out = [];
  for (const e of elements) {
    const t = e.tags || {};
    const name = t["name:en"] || t.name;
    if (!name) continue;
    const cat = TOURISM[t.tourism] || AMENITY[t.amenity] || HISTORIC[t.historic]
             || LEISURE[t.leisure] || (SHOPS.includes(t.shop) ? "shop" : null);
    if (!cat) continue;
    const lat = e.lat != null ? e.lat : (e.center && e.center.lat);
    const lng = e.lon != null ? e.lon : (e.center && e.center.lon);
    if (lat == null || lng == null) continue;
    const h = parseHours(t.opening_hours);
    out.push({
      id: "osm-" + e.type + e.id, name, cat, town,
      lat: +lat.toFixed(6), lng: +lng.toFixed(6), loose: false,
      open: h.open, close: h.close, shut: h.shut, days: null,
      lo: t.fee === "no" ? 0 : null, hi: t.fee === "no" ? 0 : null,
      priceNote: null, dur: 30,
      why: t.description || "",
      warn: h.note ? (h.open ? "holiday rule: " + h.note : "hours listed as “" + h.note + "”, too complex to flatten safely") : null,
      best: [], tags: t.fee === "no" ? ["free"] : [],
      website: t.website || t["contact:website"] || null,
      phone: t.phone || t["contact:phone"] || null,
      wikidata: t.wikidata || null,
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
      open: h.open, close: h.close, shut: h.shut, days: null,
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
