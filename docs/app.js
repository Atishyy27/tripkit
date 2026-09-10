/* ============================================================
   tripkit web. Everything happens in this browser tab.
   No server of ours, no account, no key, no AI.
   ============================================================ */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const show = id => { $$(".screen").forEach(e => e.classList.remove("on")); $("#" + id).classList.add("on"); };
const STORE = "tripkit.trip";

/* ---------- tiny helpers ---------- */
const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* esc() makes a string safe as TEXT. It does not make it safe as a URL, and the
   difference is a real hole: OpenStreetMap and Wikivoyage are edited by anyone, so
   a place's website tag is untrusted input. Set it to "javascript:..." and esc()
   passes it through unchanged into an href, and every visitor who taps that place
   runs the attacker's script on this origin.

   Only http and https get through here. Anything else, including a scheme hidden
   behind whitespace or odd casing, becomes nothing and the link is simply not
   rendered. */
function safeUrl(u) {
  if (!u) return null;
  const t = String(u).trim().replace(/[\u0000-\u001F\u007F]/g, "");
  if (!t) return null;
  const base = (typeof location !== "undefined" && location.href) ? location.href : undefined;
  try {
    // absolute first, so this works anywhere, including in tests and in a worker
    const parsed = base ? new URL(t, base) : new URL(t);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") ? parsed.href : null;
  } catch (e) {
    if (!base) {
      try {
        const parsed = new URL(t, "https://example.invalid/");
        return (parsed.protocol === "http:" || parsed.protocol === "https:") ? parsed.href : null;
      } catch (e2) { return null; }
    }
    return null;
  }
}

function save(trip) {
  try {
    localStorage.setItem(STORE, JSON.stringify(trip));
  } catch (e) {
    // The active trip is the one thing that must survive. It had weaker quota
    // handling than the disposable cache, which is backwards: on a full device it
    // would silently stop saving while the cache carried on. Drop the cache and
    // try again, and if it still will not fit, drop the heavy optional parts.
    try { localStorage.removeItem(CACHE); } catch (e2) {}
    try { localStorage.setItem(STORE, JSON.stringify(trip)); return; } catch (e3) {}
    try {
      const lean = Object.assign({}, trip, { photos: [], transit: [] });
      localStorage.setItem(STORE, JSON.stringify(lean));
      return;                                  // plan and places kept, extras dropped
    } catch (e4) {}
    // Last resort: the plan itself, which is the only thing a person authored.
    try {
      localStorage.setItem(STORE, JSON.stringify({
        v: 1, built: trip.built, place: trip.place, config: trip.config,
        conditions: trip.conditions, days: trip.days, day: trip.day,
        places: (trip.places || []).filter(p => (trip.days || [])
          .some(d => (d.plan || []).includes(p.id))),
        photos: [], transit: [], truncated: true }));
    } catch (e5) { /* nothing more can be done, and the session still works */ }
  }
  cachePut(trip);
}
function load() { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; } }

/* ---------- remembering places you have already looked up ----------

   Rebuilding a guide means several slow calls to volunteer run servers. Doing that
   again for a town you looked at this morning is rude to them and slow for you.

   The reason a cache is safe here is worth stating, because normally caching a
   travel guide would be a way to show people stale information. Nothing
   time-dependent is stored. Opening hours do not change between breakfast and
   lunch, and "open now" is computed from them against your clock every time the
   screen redraws. So a guide from this morning is still exactly right this evening.

   Two things genuinely age: the weather, and the map itself as people edit it. The
   weather is refetched on reopening, which is one fast call. The places are shown
   with their age and a one tap refresh, rather than silently pretending to be new. */
const CACHE = "tripkit.cache";
const CACHE_KEEP = 8;                       // towns, newest first
const CACHE_MAX_AGE = 21 * 24 * 3600 * 1000;
/* localStorage is about 5 MB in most browsers and the CURRENT trip is saved
   separately from this cache. Filling the cache to the ceiling therefore breaks the
   thing it exists to help: the active trip silently stops saving. Budget the cache
   at roughly 3 MB and leave the rest alone. */
const CACHE_BUDGET = 3 * 1024 * 1024;

const cacheKey = p => `${p.name.toLowerCase()}|${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;

function cacheRead() {
  try { return JSON.parse(localStorage.getItem(CACHE) || "{}") || {}; }
  catch (e) { return {}; }
}

function cachePut(trip) {
  if (!trip || !trip.place) return;
  try {
    const all = cacheRead();
    all[cacheKey(trip.place)] = { at: Date.now(), trip };
    // Newest few only. A large city is over a megabyte, and localStorage is small,
    // so an unbounded cache would start silently failing to save anything at all.
    const keys = Object.keys(all)
      .filter(k => Date.now() - all[k].at < CACHE_MAX_AGE)
      .sort((a, b) => all[b].at - all[a].at)
      .slice(0, CACHE_KEEP);
    // Drop the oldest until the whole cache fits the budget, so the active trip
    // always has room. Count alone is not enough: one large city is bigger than
    // six small towns.
    const kept = {};
    let budget = CACHE_BUDGET;
    for (const k of keys) {
      const size = JSON.stringify(all[k]).length;
      if (size > budget) continue;
      kept[k] = all[k];
      budget -= size;
    }
    try { localStorage.setItem(CACHE, JSON.stringify(kept)); }
    catch (e) {
      // over quota: drop the oldest until it fits, rather than losing the lot
      const shrink = Object.keys(kept);
      while (shrink.length > 1) {
        shrink.pop();
        const smaller = {};
        shrink.forEach(k => smaller[k] = all[k]);
        try { localStorage.setItem(CACHE, JSON.stringify(smaller)); return; }
        catch (e2) { /* keep shrinking */ }
      }
      try { localStorage.removeItem(CACHE); } catch (e3) {}
    }
  } catch (e) { /* caching must never break the thing it is caching */ }
}

function cacheGet(place) {
  const hit = cacheRead()[cacheKey(place)];
  if (!hit || !hit.trip || Date.now() - hit.at > CACHE_MAX_AGE) return null;
  return hit;
}

function cacheList() {
  const all = cacheRead();
  return Object.keys(all)
    .map(k => ({ key: k, at: all[k].at, trip: all[k].trip }))
    .filter(x => x.trip && x.trip.place && Date.now() - x.at < CACHE_MAX_AGE)
    .sort((a, b) => b.at - a.at);
}

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 2) return "just now";
  if (m < 60) return m + " minutes ago";
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "an hour ago" : h + " hours ago";
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : d + " days ago";
}

/* A timezone offset without shipping a timezone database.
   Longitude gives the solar offset; most of the world rounds that to a whole
   hour, and a handful of places sit on a half hour. It is an estimate and the
   UI says so, because a guide that is silently an hour out is worse than one
   that admits it does not know. */
function guessTz(lat, lng, cc) {
  // Whole country offsets, for the places where a longitude guess is simply wrong.
  // An earlier version listed AU and CA here and then excluded them again in the
  // condition below, so those two entries could never be reached: dead code that
  // looked like coverage. Both are dropped, because neither has one offset anyway,
  // and a longitude guess is at least honest about being a guess.
  const HALF = { IN: 330, LK: 330, NP: 345, IR: 210, AF: 270, MM: 390 };
  if (HALF[cc] !== undefined) return HALF[cc];
  return Math.round(lng / 15) * 60;
}

/* ---------- counting, without following anyone ----------

   Off unless ANALYTICS is given an endpoint. When it is on, what leaves this
   device is a page path and nothing else: no cookie, no identifier, no location,
   never the town you typed. The point is to know whether anyone uses this, not
   who they are, and a product whose front page promises not to track people has
   to be able to prove that from its own source.

   Turn it on by setting ANALYTICS to a GoatCounter count endpoint. */
const ANALYTICS = null;

function track(path, title) {
  if (!ANALYTICS) return;
  try {
    const u = new URL(ANALYTICS);
    u.searchParams.set("p", path);
    if (title) u.searchParams.set("t", title);
    u.searchParams.set("r", "");        // deliberately no referrer
    u.searchParams.set("rnd", String(Math.random()).slice(2, 10));
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.src = u.toString();
  } catch (e) { /* counting must never break the thing being counted */ }
}

/* ---------- state ---------- */
/* GUIDE is the whole saved trip. The engine separately owns TRIP, its derived
   timing config. Two top level `let` of the same name across script tags is a
   SyntaxError that kills the page before a line of it runs. */
let PLACE = null, GUIDE = null, SHARED_PLAN = null;

/* ---------- screen 1: search ---------- */
let searchTimer = null;
function wireSearch() {
  const box = $("#q");
  $$(".land-eg .chip").forEach(b => b.onclick = () => {
    box.value = b.dataset.eg;
    box.dispatchEvent(new Event("input"));
  });
  box.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const v = box.value.trim();
    if (v.length < 2) { $("#hits").innerHTML = ""; return; }
    $("#hits").innerHTML = '<div class="state state-loading"><span class="state-icon">⟳</span>searching…</div>';
    searchTimer = setTimeout(() => doSearch(v), 450);
  });
}

async function doSearch(q) {
  try {
    const found = await findPlace(q, m => console.info(m));
    const rows = found.value || [];
    if (!rows.length) {
      $("#hits").innerHTML = '<div class="state state-empty"><span class="state-icon">🔍</span>' +
        'Nothing found. Try the plain name of the town.</div>';
      return;
    }
    $("#hits").innerHTML = rows.map((r, i) =>
      `<div class="hit" data-i="${i}"><b>${esc(r.name)}</b><span>${esc(r.label)}</span></div>`).join("");
    $$("#hits .hit").forEach(el => el.onclick = () => pick(rows[+el.dataset.i]));
  } catch (e) {
    $("#hits").innerHTML = `<div class="state state-error"><span class="state-icon">⚠</span>` +
      `Could not reach OpenStreetMap's search: ${esc(e.message)}. That service is free and ` +
      `sometimes rate-limits. Wait a moment and try again.</div>`;
  }
}

function pick(p) {
  PLACE = p;
  const tz = guessTz(p.lat, p.lng, p.countryCode);
  $("#destName").textContent = p.name;
  $("#destSub").textContent = p.label;
  $("#tzGuess").textContent = (tz >= 0 ? "+" : "") + (tz / 60).toFixed(2).replace(/\.00$/, "").replace(/\.50$/, ".5");
  $("#tz").value = tz;
  $("#arrive").value = "09:00";
  $("#depart").value = "21:00";
  const suggested = radiusFor(p);
  $("#radius").value = suggested;
  updateRadius();

  const hit = cacheGet(p);
  const box = $("#cached");
  if (hit) {
    const t = hit.trip;
    const hrs = (t.places || []).filter(x => x.open).length;
    box.innerHTML = `<div class="card cool">
      <h3>You looked at ${esc(p.name)} ${esc(ago(hit.at))}</h3>
      <p class="sub" style="margin:6px 0 0">${(t.places || []).length} places are still saved
      on this device, ${hrs} of them with opening hours. Opening times do not change during a
      day, and what is open <i>now</i> is worked out fresh every time, so this is not stale
      in the way it sounds.</p>
      <p class="tiny" style="margin:6px 0 0">The weather will be refetched. Only the map data
      itself is from ${esc(ago(hit.at))}.</p>
      <button class="big" id="useCached" style="margin-top:10px">Open it, instantly</button>
      <button class="big ghost" id="freshBuild" style="margin-top:6px">Fetch it again</button>
    </div>`;
    box.hidden = false;
    $("#useCached").onclick = () => openCached(hit);
    $("#freshBuild").onclick = () => build();
  } else {
    box.innerHTML = ""; box.hidden = true;
  }
  show("s2");
}

/* ---------- screen 2: the clock ---------- */
function updateRadius() {
  const r = +$("#radius").value;
  $("#radiusV").textContent = r >= 1000 ? (r / 1000).toFixed(1).replace(/\.0$/, "") + " km" : r + " m";
  const walk = Math.round(r / 80);   // roughly 4.8 km/h
  $("#radiusNote").textContent =
    `About ${walk} minutes' walk from the centre to the edge. ` +
    (r <= 1200 ? "Tight: an old town or a single district."
     : r <= 3500 ? "A town, or the middle of a city."
     : r <= 7000 ? "A spread out city. Expect more places than you can use."
     : "Very wide. Slow to fetch, and much of it will be too far to reach.");
}

function wireTimes() {
  $("#radius").addEventListener("input", updateRadius);
  $("#nowBtn").onclick = () => {
    const off = +$("#tz").value;
    const d = new Date();
    const l = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + off * 60000);
    $("#arrive").value = String(l.getHours()).padStart(2, "0") + ":" + String(l.getMinutes()).padStart(2, "0");
  };
  $("#goBtn").onclick = () => build();
  $("#backBtn").onclick = () => show("s1");
}

async function openCached(hit) {
  track("/cache/reused");
  const t = hit.trip;
  // The hours the user just chose win over the ones saved with the cached trip.
  const tz = +$("#tz").value;
  t.config.tzOffsetMinutes = tz;
  t.config.arrive = M($("#arrive").value || "09:00");
  t.config.depart = M($("#depart").value || "21:00");

  // The sun is cheap and exact, so recompute rather than trusting a saved value.
  const sun = sunTimes(new Date(), t.place.lat, t.place.lng, tz);
  t.conditions = Object.assign({}, t.conditions, {
    sunrise: sun.sunrise, sunset: sun.sunset,
    firstLight: sun.firstLight, lastLight: sun.lastLight,
    polar: sun.polar });

  t.cachedAt = hit.at;
  open(t);

  // and the one thing that genuinely goes stale, refreshed in the background so
  // the guide is usable immediately rather than after another wait
  try {
    const wx = await getWeather(t.place.lat, t.place.lng, () => {});
    if (wx.value) {
      t.weather = wx.value; t.weatherSource = wx.source;
      const heat = heatWindowFrom(wx.value.hours, new Date().toISOString().slice(0, 10));
      if (heat) t.conditions.heatWindow = [M(heat[0]), M(heat[1])];
      init({ config: t.config, conditions: t.conditions, places: t.places });
      save(t); drawHero(); render();
    }
  } catch (e) { /* an old forecast is better than no guide */ }
}

/* ---------- screen 3: build ---------- */
function step(id, state, text) {
  const el = $("#" + id);
  if (!el) return;
  el.className = "step " + state;
  const icon = el.querySelector("i"), label = el.querySelector("span");
  if (icon) icon.textContent =
    state === "done" ? "\u2713" : state === "fail" ? "\u2717" : state === "now" ? "\u25D0" : "\u25CB";
  if (label && text) label.textContent = text;
}
function progress(pct) {
  // A missing node here used to throw and abort the whole build, leaving the user
  // staring at a step list frozen on the first tick. Progress reporting must never
  // be able to stop the thing it is reporting on.
  const el = $("#bar>div");
  if (el) el.style.width = pct + "%";
}

async function build() {
  try {
    await runBuild();
  } catch (e) {
    // Anything unhandled in here used to leave the step list frozen with no
    // explanation, which reads as "the app is broken" and gives nobody a clue.
    step("stDone", "fail", "Build failed: " + (e && e.message ? e.message : e));
    const el = $("#alerts") || $("#hits");
    if (el) el.innerHTML =
      '<div class="card warn"><h3>That did not work</h3><p class="sub">' +
      esc(String((e && e.message) || e)) +
      '</p><p class="tiny">OpenStreetMap and Wikivoyage are free shared services and ' +
      'sometimes rate limit. Waiting a minute and trying again usually fixes it.</p></div>';
    throw e;
  }
}

async function runBuild() {
  show("s3");
  ["stGeo", "stOsm", "stWv", "stLive", "stSun", "stDone"].forEach(i => step(i, "", null));
  const notes = [];

  const tz = +$("#tz").value;
  const arrive = $("#arrive").value || "09:00";
  const depart = $("#depart").value || "21:00";

  step("stGeo", "done", `${PLACE.name}, ${PLACE.lat.toFixed(4)}, ${PLACE.lng.toFixed(4)}`);
  progress(10);

  /* --- OpenStreetMap --- */
  let places = [];
  const r = (+($("#radius") || {}).value) || radiusFor(PLACE);
  step("stOsm", "now", `asking OpenStreetMap, ${(r / 1000).toFixed(1)} km around the centre…`);
  try {
    const els = await overpass(PLACE.lat, PLACE.lng, r, m => notes.push(m));
    const all = osmToPlaces(els, PLACE.name.toLowerCase());
    const cap = capPlaces(all, 1200);
    places = cap.kept;
    const withHours = places.filter(p => p.open).length;
    step("stOsm", "done",
      `${all.length} places found, keeping ${places.length}${cap.dropped ? ` (dropped ${cap.dropped} least useful, mostly banks and bus stops)` : ""}, ${withHours} with opening hours`);
    if (cap.dropped) notes.push(`${PLACE.name} is big: ${all.length} mapped places came back and the ${cap.dropped} least useful were dropped so this fits on a phone. Nothing with a description or opening hours was removed first.`);
  } catch (e) {
    step("stOsm", "fail", `OpenStreetMap unavailable: ${e.message}`);
    notes.push("No OpenStreetMap data. The guide will be thin.");
  }
  progress(50);

  /* --- Wikivoyage --- */
  step("stWv", "now", "looking for a Wikivoyage guide…");
  let intro = "", cautions = [], wvTitle = null, wvCount = 0;
  try {
    let art = null;
    try { art = await wikivoyage(PLACE.name); }
    catch (e) {
      const cands = await wikivoyageSearch(PLACE.name + (PLACE.country ? " " + PLACE.country : ""));
      if (cands.length) art = await wikivoyage(cands[0]);
    }
    if (art) {
      wvTitle = art.title;
      const listings = parseListings(art.wikitext, PLACE.name.toLowerCase());
      wvCount = listings.length;
      intro = introOf(art.wikitext);
      cautions = cautionsOf(art.wikitext);
      places = mergePlaces(places, listings);
      step("stWv", "done", `“${art.title}”, ${listings.length} listings written by travellers`);
    } else {
      step("stWv", "fail", "no Wikivoyage article for this place");
      notes.push("No Wikivoyage guide exists here, so descriptions come only from map data.");
    }
  } catch (e) {
    step("stWv", "fail", "Wikivoyage unavailable: " + e.message);
  }
  progress(80);

  /* --- everything else, in parallel, each with its own fallback chain --- */
  step("stLive", "now", "weather, air, transport, photos…");
  const R = r;
  const [wx, air, country, transit, photos] = await Promise.all([
    getWeather(PLACE.lat, PLACE.lng, m => notes.push(m)),
    getAir(PLACE.lat, PLACE.lng, m => notes.push(m)),
    getCountry(PLACE.countryCode, m => notes.push(m)),
    getTransit(PLACE.lat, PLACE.lng, Math.min(R, 4000), m => notes.push(m)),
    getPhotos(PLACE.lat, PLACE.lng, Math.min(R, 6000), m => notes.push(m)),
  ]);
  if (photos.value && photos.value.length) {
    await attachPhotos(places, photos.value, m => notes.push(m));
  }
  const got = [
    wx.value && `weather (${wx.source})`,
    air.value && "air quality",
    country.value && "country facts",
    transit.value && `${transit.value.length} transport stops`,
    photos.value && `${photos.value.length} photos`,
  ].filter(Boolean);
  step("stLive", got.length ? "done" : "fail",
       got.length ? got.join(", ") : "none of these answered, the guide still works without them");
  progress(88);

  /* --- sun, computed here --- */
  step("stSun", "now", "computing the sun…");
  const s = sunTimes(new Date(), PLACE.lat, PLACE.lng, tz);
  // The heat window used to be a guess. With a real hourly forecast it is measured.
  const heat = wx.value ? heatWindowFrom(wx.value.hours, new Date().toISOString().slice(0, 10)) : null;
  // HM wraps its input, so HM(null) is "00:00": a polar day used to report
  // "sunrise 00:00, sunset 00:00" and look like an ordinary answer.
  const sunLine = s.polar === "day" ? "the sun does not set here today"
    : s.polar === "night" ? "the sun does not rise here today"
    : (s.sunrise == null || s.sunset == null) ? "sunrise and sunset unavailable here"
    : `sunrise ${HM(s.sunrise)}, sunset ${HM(s.sunset)}`;
  step("stSun", "done", sunLine +
       (heat ? `, hottest ${heat[0]} to ${heat[1]} from today's forecast` : "") +
       ", calculated on this device");
  progress(95);

  GUIDE = {
    v: 1, built: Date.now(),
    place: PLACE, notes, intro, cautions, wvTitle,
    radius: r,
    plan: [],
    config: {
      dest: PLACE.name, country: PLACE.country,
      arrive: M(arrive), depart: M(depart),
      hopMinutes: 0, exitBufferMinutes: 45,
      tzOffsetMinutes: tz, multiDay: false
    },
    conditions: {
      sunrise: s.sunrise, sunset: s.sunset,
      firstLight: s.firstLight, lastLight: s.lastLight,
      polar: s.polar,
      heatWindow: heat ? [M(heat[0]), M(heat[1])] : null
    },
    weather: wx.value, weatherSource: wx.source,
    air: air.value, country: country.value,
    transit: transit.value || [], photos: (photos.value || []).slice(0, 24),
    places
  };
  if (SHARED_PLAN && SHARED_PLAN.length) {
    const have = new Set(places.map(p => p.id));
    GUIDE.plan = SHARED_PLAN.filter(id => have.has(id));
    SHARED_PLAN = null;
  }
  save(GUIDE);
  step("stDone", "done", `${places.length} places ready, saved to this device`);
  progress(100);
  track("/built", `${places.length} places`);
  setTimeout(() => open(GUIDE), 500);
}

/* Merge Wikivoyage listings onto OSM places. OSM has the exact pin, Wikivoyage
   has the human sentence about whether it is worth going. Neither alone is enough. */
function mergePlaces(osm, wv) {
  const key = n => String(n).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 22);
  const idx = new Map();
  osm.forEach(p => idx.set(key(p.name), p));
  const out = osm.slice();
  for (const w of wv) {
    const k = key(w.name);
    let hit = idx.get(k);
    if (!hit && k.length >= 9) {
      for (const [k2, p] of idx) {
        if (k2.length >= 9 && (k2.includes(k) || k.includes(k2))) { hit = p; break; }
      }
    }
    if (hit) {
      if (w.why && (!hit.why || w.why.length > hit.why.length)) { hit.why = w.why; hit.from = "OpenStreetMap + Wikivoyage"; }
      if (!hit.open && w.open) { hit.open = w.open; hit.close = w.close; hit.shut = w.shut; }
      if (!hit.priceNote && w.priceNote) hit.priceNote = w.priceNote;
      if (!hit.warn && w.warn) hit.warn = w.warn;
    } else {
      if (w.lat == null) { w.lat = PLACE.lat; w.lng = PLACE.lng; w.loose = true; }
      out.push(w);
      idx.set(k, w);
    }
  }
  return out;
}

/* ---------- screen 4: the guide ---------- */
function open(trip) {
  GUIDE = trip;
  init({ config: trip.config, conditions: trip.conditions, places: trip.places });
  ensureDays();
  show("s4");
  drawHero();
  drawTowns();
  buildCats();
  buildSort();
  buildListMode();
  render();
  setView("list");
  clearInterval(window._tick);
  window._tick = setInterval(() => {
    render();
    if (!$("#vMap").hidden) drawMap();
    if (!$("#vDay").hidden) drawDay();
    if (!$("#vWeather").hidden) drawWeather();
  }, 30000);
}

/* "Best now" (score order) stays the default: it is the whole point of the app,
   an open museum belongs above a closed shop next door even when the shop is
   nearer. "Nearest" is opt-in, for the moment someone genuinely just wants
   whatever is closest, still filtered to what is realistically open and fits. */
function buildSort() {
  const mode = GUIDE.sortMode || "best";
  $("#sortMode").innerHTML =
    `<button class="chip" data-sort="best" aria-pressed="${mode === "best"}">Best now</button>` +
    `<button class="chip" data-sort="near" aria-pressed="${mode === "near"}">Nearest</button>`;
  $$("#sortMode .chip").forEach(b => b.onclick = () => {
    GUIDE.sortMode = b.dataset.sort; save(GUIDE); buildSort(); render();
  });
}

/* Guide is the default whenever a town actually has curated places, because a
   well-documented town leads with the human-written guide, not the raw live
   list. A thin town where Wikivoyage wrote nothing falls back to All on its
   own, so the guide screen is never just empty. Once he picks a mode by hand
   that choice sticks (GUIDE.listMode) and stops recomputing off the count. */
function activeListMode() {
  if (GUIDE.listMode) return GUIDE.listMode;
  return GUIDE.places.some(isCurated) ? "guide" : "all";
}

function buildListMode() {
  const mode = activeListMode();
  $("#listMode").innerHTML =
    `<button class="chip" data-mode="guide" aria-pressed="${mode === "guide"}">Guide</button>` +
    `<button class="chip" data-mode="all" aria-pressed="${mode === "all"}">All</button>`;
  $$("#listMode .chip").forEach(b => b.onclick = () => {
    GUIDE.listMode = b.dataset.mode; save(GUIDE); buildListMode(); render();
  });
}

function buildCats() {
  const cats = Array.from(new Set(GUIDE.places.map(p => p.cat))).sort();
  $("#cats").innerHTML = ['<button class="chip" data-c="all" aria-pressed="true">Anything</button>']
    .concat(cats.map(c => `<button class="chip" data-c="${c}" aria-pressed="false">${c}</button>`)).join("");
  $$("#cats .chip").forEach(b => b.onclick = () => {
    $$("#cats .chip").forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true"); render();
  });
}

const CAT_ICON = {
  view: "\u{1F304}", museum: "\u{1F5BC}\uFE0F", temple: "\u{1F6D5}", ghat: "\u{1F6B6}",
  park: "\u{1F333}", outdoor: "\u26F0\uFE0F", food: "\u{1F37D}\uFE0F", cafe: "\u2615",
  sweet: "\u{1F368}", street: "\u{1F32E}", bar: "\u{1F378}", shop: "\u{1F6CD}\uFE0F",
  do: "\u{1F3AA}", wellness: "\u{1F9D8}", stay: "\u{1F6CF}\uFE0F", move: "\u{1F68C}",
  practical: "\u2139\uFE0F", hub: "\u{1F6A9}"
};
const CAT_TINT = {
  view: "#b98cff", museum: "#8ab8ff", temple: "#ffc857", ghat: "#8ab8ff",
  park: "#7ee0a8", outdoor: "#7ee0a8", food: "#6ee7d0", cafe: "#6ee7d0",
  sweet: "#ff7ab8", street: "#6ee7d0", bar: "#ff7ab8", shop: "#ff7ab8",
  do: "#ff8a4c", wellness: "#b98cff", stay: "#ffc857", move: "#ff5f6d",
  practical: "#a99fc4", hub: "#a99fc4"
};

function card(r, i) {
  const p = r.p, st = r.st;
  // The open/closed read is the one thing that has to land at a glance, so it
  // rides on the photo itself as a fixed dark-glass chip (see .pc-badge in
  // style.css), not in the quieter tag row with everything else below.
  const badge = { open: '<span class="pc-badge b-open">open now</span>',
    closing: `<span class="pc-badge b-soon">${esc(st.label)}</span>`,
    soon: `<span class="pc-badge b-soon">${esc(st.label)}</span>`,
    shut: `<span class="pc-badge b-shut">${esc(st.label)}</span>`,
    unknown: '<span class="pc-badge">hours unknown</span>' }[st.state] || "";
  const src = p.from === "Wikivoyage" ? '<span class="src-badge src-wv">Wikivoyage</span>'
    : p.from === "OpenStreetMap + Wikivoyage" ? '<span class="src-badge src-wv">OSM + Wikivoyage</span>'
    : '<span class="src-badge src-osm">OpenStreetMap</span>';
  const price = p.priceNote ? esc(p.priceNote) : ((p.lo === 0 && p.hi === 0) ? "free" : "");
  // r.dist is only ever null for a loose pin (see withDistance in engine.js), which
  // already carries its own "pin approx" tag below, so this never claims a false
  // precise distance for a place we only guessed the location of.
  const distTag = r.dist != null ? `<span class="tag t-info pc-dist">${fmtDist(r.dist)}</span>` : "";
  // No spaces inside a coordinate pair. A cosmetic sweep once put one here and every
  // "walk there" link silently pointed nowhere.
  // A place whose coordinates were never recorded sits on the town centre. Offering
  // "walk there" to a pin we invented sends people to the wrong doorway with full
  // confidence, so those get a search instead.
  const g = p.loose
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ", " + (p.town || GUIDE.place.name))}`
    : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
  // OpenStreetMap can route on foot, not just drop a pin, so this is a real
  // alternative to the Google link rather than a lesser one. It leads in the card
  // for that reason; the Google link stays because some people want it and it is
  // only ever followed deliberately.
  const o = p.loose
    ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(p.name + ", " + (p.town || GUIDE.place.name))}`
    : `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=%3B${p.lat}%2C${p.lng}`;
  const tint = CAT_TINT[p.cat] || "#a99fc4";
  const icon = CAT_ICON[p.cat] || "\u{1F4CD}";
  const dim = st.state === "shut";

  const media = safeUrl(p.photo)
    ? `<div class="pc-img">${badge}<img src="${esc(safeUrl(p.photo))}" loading="lazy" decoding="async"
         alt="${esc(p.name)}" onerror="this.closest('.pc-img').classList.add('pc-glyph');this.remove()">
       ${p.photoExact ? "" : '<span class="pc-near">nearby</span>'}</div>`
    : `<div class="pc-img pc-glyph">${badge}<span class="pc-icon">${icon}</span></div>`;

  return `<article class="pc${i === 0 ? " pc-top" : ""}${dim ? " pc-dim" : ""}" style="--tint:${tint}">
    ${media}
    <div class="pc-body">
      <div class="pc-head">
        <h3>${esc(p.name)}</h3>
        ${price ? `<span class="pc-price">${price}</span>` : ""}
      </div>
      <div class="pc-tags">${distTag}${p.dur ? `<span class="tag t-info">${dur(p.dur)}</span>` : ""}${p.loose ? '<span class="tag t-unv">pin approx</span>' : ""}${src}</div>
      ${p.why ? `<p class="pc-why">${esc(p.why).slice(0, 260)}</p>` : ""}
      ${p.warn ? `<p class="pc-warn">\u26A0 ${esc(p.warn)}</p>` : ""}
      ${r.why && r.why.length ? `<div class="why">\u2192 ${esc(r.why[0])}</div>` : ""}
      <div class="btns">
        <button class="btn ${inPlan(p.id) ? "picked" : "o"}" data-pick="${esc(p.id)}">${inPlan(p.id) ? "\u2713 in your day" : "+ add to day"}</button>
        <a class="btn g" target="_blank" rel="noopener" href="${o}">${p.loose ? "Find it" : "Walk there"}</a>
        <a class="btn" target="_blank" rel="noopener" href="${g}">Google</a>
        ${safeUrl(p.website) ? `<a class="btn b" target="_blank" rel="noopener noreferrer" href="${esc(safeUrl(p.website))}">Website</a>` : ""}
      </div>
    </div>
  </article>`;
}

/* Sunrise and sunset are both null at high latitude, and HM wraps null to "00:00",
   so the old single expression fell through to "sun set at 00:00" under the midnight
   sun. Each abnormal day gets said out loud instead of dressed up as an ordinary one. */
function sunHeadline(cd, sr, ss, t) {
  if (cd.polar === "day") return "☀️ the sun does not set here today";
  if (cd.polar === "night") {
    return (cd.firstLight != null && cd.lastLight != null)
      ? `🌑 no sunrise today; twilight ${HM(cd.firstLight)} to ${HM(cd.lastLight)}`
      : "🌑 the sun does not rise here today";
  }
  if (sr == null || ss == null) return "🌫 sunrise and sunset unavailable here";
  if (ss < sr) {   // sets after midnight: a very long northern day
    if (t < ss) return `☀️ sunset ${HM(ss)}, the sun is still setting from yesterday`;
    if (t < sr) return `🌑 sunrise ${HM(sr)}, ${sr - t} min away`;
    return `☀️ sunset ${HM(ss)}, after midnight. Light for hours yet`;
  }
  if (t < sr) return `🌑 sunrise ${HM(sr)}, ${sr - t} min away`;
  if (t < ss) return `☀️ sunset ${HM(ss)}, ${Math.floor((ss - t) / 60)}h ${(ss - t) % 60}m of light left`;
  return `🌙 sun set at ${HM(ss)}`;
}

function render() {
  const t = localMins();
  const cat = ($("#cats .chip[aria-pressed=true]") || { dataset: { c: "all" } }).dataset.c;
  const q = $("#filter").value.trim();
  const r = rankNow(t, { cat, q, town: (GUIDE.townFilter && GUIDE.townFilter !== "all") ? GUIDE.townFilter : undefined });
  const ex = exitState(t);

  $("#clock").textContent = HM(t);
  $("#phase").textContent = r.phase.name;
  $("#phaseLine").textContent = r.phase.line;

  const cd = GUIDE.conditions, sr = cd.sunrise, ss = cd.sunset;
  $("#sun").textContent = sunHeadline(cd, sr, ss, t);

  let alerts = "";
  if (ex.msg) alerts += `<div class="card ${ex.level === "soon" ? "cool" : "warn"}"><h3>${ex.level === "soon" ? "Start heading back" : "Time to go"}</h3><p class="sub" style="margin:6px 0 0">${esc(ex.msg)}</p></div>`;
  const cs = closingSoon(t);
  if (cs.length) alerts += `<div class="card warn"><h3>Closing soon</h3>${cs.slice(0, 4).map(x => `<p class="sub" style="margin:4px 0"><b>${esc(x.p.name)}</b>, ${esc(x.st.label)}</p>`).join("")}</div>`;
  $("#alerts").innerHTML = alerts;

  // Best now (score) stays the list order that ships by default; distance is
  // annotated either way so it is always visible on the card, and only actually
  // reorders the list when "Nearest" is the chosen mode.
  let ranked = withDistance(r.list, GUIDE.place);
  if ((GUIDE.sortMode || "best") === "near") ranked = sortByDistance(ranked);

  // Guide mode narrows to the human-written places (Wikivoyage, or an OSM
  // description carried through as why); All keeps every ranked place,
  // Overpass included. Pure filter over data already in memory, no fetch.
  const mode = activeListMode();
  const curatedTotal = GUIDE.places.filter(isCurated).length;
  if (mode === "guide") ranked = ranked.filter(x => isCurated(x.p));

  const top = ranked.slice(0, 40);
  // Two very different reasons the list can be empty get two very different
  // messages: a curated-only guide with nothing written yet points at the All
  // toggle already sitting right there; a town that genuinely has almost
  // nothing mapped points at OpenStreetMap itself, same honesty framing as the
  // "hours unknown" tags on individual cards. Only when there IS enough mapped
  // data and a filter or search term is just excluding all of it do we say so.
  const scopeTotal = (GUIDE.townFilter && GUIDE.townFilter !== "all")
    ? GUIDE.places.filter(p => p.town === GUIDE.townFilter).length
    : GUIDE.places.length;
  const emptyState = (mode === "guide" && curatedTotal === 0)
    ? { icon: "📝", msg: "This town has no written guide yet. Switch to All to see everything nearby." }
    : scopeTotal < 5
    ? { icon: "🗺", msg: "This town has very few places mapped yet. Add some on OpenStreetMap and " +
        "they will show up here next time this guide is built." }
    : { icon: "🔍", msg: "Nothing in this filter is open and still fits." };
  $("#list").innerHTML = top.length ? top.map(card).join("")
    : `<div class="state state-empty"><span class="state-icon">${emptyState.icon}</span>${emptyState.msg}</div>`;
  $("#count").textContent = mode === "guide"
    ? `${ranked.length} of ${curatedTotal} places in the guide fit right now`
    : `${ranked.length} of ${GUIDE.places.length} places nearby fit right now`;
  $$("#list [data-pick]").forEach(b => b.onclick = () => togglePick(b.dataset.pick));
  paintPlanCount();
}

/* ---------- map ---------- */
let MAP = null, LAYER = null;
const PAL = ["#ffc857", "#6ee7d0", "#ff7ab8", "#8ab8ff", "#b98cff", "#ff8a4c", "#7ee0a8", "#ff5f6d", "#a99fc4"];

function drawMap() {
  if (typeof L === "undefined") { $("#mapNote").textContent = "The map library did not load."; return; }
  const pts = GUIDE.places.filter(p => p.lat && p.lng && !p.loose);
  if (!MAP) {
    MAP = L.map("map", { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(MAP);
    if (pts.length) MAP.fitBounds(pts.map(p => [p.lat, p.lng]), { padding: [26, 26], maxZoom: 16 });
    else MAP.setView([GUIDE.place.lat, GUIDE.place.lng], 14);
  }
  if (LAYER) MAP.removeLayer(LAYER);
  const cats = Array.from(new Set(GUIDE.places.map(p => p.cat))).sort();
  const col = {}; cats.forEach((c, i) => col[c] = PAL[i % PAL.length]);
  const t = localMins();
  const markers = [];
  for (const p of pts) {
    const st = openState(p, t), shut = st.state === "shut";
    markers.push(L.circleMarker([p.lat, p.lng], {
      radius: shut ? 5 : 8, color: col[p.cat] || "#a99fc4", fillColor: col[p.cat] || "#a99fc4",
      fillOpacity: shut ? 0.25 : 0.85, weight: shut ? 1 : 2
    }).bindPopup(
      `<b>${esc(p.name)}</b><br><span style="color:#a99fc4">${esc(st.label)}${p.priceNote ? " · " + esc(p.priceNote) : ""}</span>` +
      (p.why ? `<br><span style="color:#a99fc4">${esc(p.why).slice(0, 140)}</span>` : "") +
      `<br><a href="https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=%3B${p.lat}%2C${p.lng}" target="_blank" rel="noopener">Walk there</a>` +
      ` &middot; <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking" target="_blank" rel="noopener">Google</a>`));
  }
  LAYER = L.layerGroup(markers).addTo(MAP);
  const openNow = pts.filter(p => ["open", "closing"].includes(openState(p, t).state)).length;
  $("#mapNote").innerHTML = `<b>${pts.length}</b> places with a real pin, <b>${openNow}</b> open right now (faded ones are shut). ` +
    `${GUIDE.places.length - pts.length} more have no exact coordinates and are list-only. ` +
    cats.map(c => `<span style="color:${col[c]}">&#9632; ${esc(c)}</span>`).join(" &nbsp; ");
  setTimeout(() => MAP.invalidateSize(), 60);
}

/* ---------- the day ---------- */
function drawDay() {
  const t = localMins();
  $("#tl").innerHTML = PHASES.map(p => {
    const on = t >= p.from && t < p.to, past = t >= p.to;
    const fits = rankNow(Math.floor((p.from + p.to) / 2), {}).list.length;
    return `<div class="tlrow${on ? " on" : past ? " past" : ""}">
      <div class="h">${HM(p.from)} - ${HM(p.to)}${on ? ' &nbsp;<span class="tag t-open">now</span>' : ""}</div>
      <div style="font-weight:700;font-size:14px;margin:1px 0 2px">${esc(p.name)}</div>
      <div class="sub" style="font-size:12.5px">${esc(p.line)}</div>
      <div class="tiny" style="margin-top:3px">${fits} places suit this stretch</div></div>`;
  }).join("");
  const hrs = GUIDE.places.filter(p => p.open).length;
  const txt = GUIDE.places.filter(p => p.why).length;
  const c = GUIDE.conditions;
  $("#dayStats").innerHTML = `
    <div class="grid2">
      <div class="stat"><div class="v">${HM(c.sunrise)}</div><div class="k">sunrise</div></div>
      <div class="stat"><div class="v">${HM(c.sunset)}</div><div class="k">sunset</div></div>
      <div class="stat"><div class="v">${hrs}</div><div class="k">with real opening hours</div></div>
      <div class="stat"><div class="v">${txt}</div><div class="k">with a human description</div></div>
    </div>
    <p class="tiny" style="margin:10px 0 0">Sunrise and sunset were calculated on this device
    from the date and your coordinates. Nothing was fetched to work them out, so they are right
    even with no signal.</p>`;
}

/* ---------- more than one day ----------

   A trip is rarely one day. Rather than a second kind of plan, a trip simply holds
   a list of days and every existing plan operation acts on whichever is current.
   Trips saved before this existed are migrated on load rather than discarded,
   because losing somebody's plan to a refactor is unforgivable. */
function ensureDays() {
  if (!GUIDE) return;
  if (!Array.isArray(GUIDE.days) || !GUIDE.days.length) {
    GUIDE.days = [{
      label: "Day 1",
      plan: Array.isArray(GUIDE.plan) ? GUIDE.plan : [],
      start: GUIDE.planStart != null ? GUIDE.planStart : null,
      manualOrder: !!GUIDE.manualOrder,
      autoPace: GUIDE.autoPace || null,
      autoNotes: GUIDE.autoNotes || [],
    }];
    GUIDE.day = 0;
  }
  if (GUIDE.day == null || GUIDE.day < 0 || GUIDE.day >= GUIDE.days.length) GUIDE.day = 0;
  // the flat fields stay as a view onto the current day, so nothing else changes
  const d = GUIDE.days[GUIDE.day];
  GUIDE.plan = d.plan;
  GUIDE.planStart = d.start;
  GUIDE.manualOrder = d.manualOrder;
  GUIDE.autoPace = d.autoPace;
  GUIDE.autoNotes = d.autoNotes;
}

function syncDay() {
  if (!GUIDE || !GUIDE.days) return;
  const d = GUIDE.days[GUIDE.day];
  if (!d) return;
  d.plan = GUIDE.plan || [];
  d.start = GUIDE.planStart != null ? GUIDE.planStart : null;
  d.manualOrder = !!GUIDE.manualOrder;
  d.autoPace = GUIDE.autoPace || null;
  d.autoNotes = GUIDE.autoNotes || [];
}

function addDay() {
  ensureDays(); syncDay();
  GUIDE.days.push({ label: `Day ${GUIDE.days.length + 1}`, plan: [], start: null,
                    manualOrder: false, autoPace: null, autoNotes: [] });
  GUIDE.day = GUIDE.days.length - 1;
  ensureDays(); save(GUIDE); drawPlan(); render();
}

function removeDay(i) {
  ensureDays(); syncDay();
  if (GUIDE.days.length <= 1) { GUIDE.days[0].plan = []; }
  else GUIDE.days.splice(i, 1);
  GUIDE.days.forEach((d, n) => { if (/^Day \d+$/.test(d.label)) d.label = `Day ${n + 1}`; });
  GUIDE.day = Math.min(GUIDE.day, GUIDE.days.length - 1);
  ensureDays(); save(GUIDE); drawPlan(); render();
}

function switchDay(i) {
  ensureDays(); syncDay();
  GUIDE.day = i;
  ensureDays(); save(GUIDE); drawPlan(); render();
}

/* everything already chosen on another day, so a second day does not repeat the first */
function pickedOnOtherDays() {
  ensureDays();
  const out = new Set();
  GUIDE.days.forEach((d, i) => { if (i !== GUIDE.day) (d.plan || []).forEach(id => out.add(id)); });
  return out;
}

function dayTabs() {
  ensureDays();
  return `<div class="chips daytabs">` +
    GUIDE.days.map((d, i) =>
      `<button class="chip" data-day="${i}" aria-pressed="${i === GUIDE.day}">${esc(d.label)}${
        (d.plan || []).length ? ` <span class="tiny">${d.plan.length}</span>` : ""}</button>`).join("") +
    `<button class="chip" data-addday="1">+ day</button>` +
    (GUIDE.days.length > 1 ? `<button class="chip" data-rmday="${GUIDE.day}">remove this day</button>` : "") +
    `</div>`;
}

/* ---------- more than one town ----------

   A trip is often several places: a night here, two nights there. Rather than
   inventing a second concept, another town simply appends its places to the same
   guide, tagged with where they are. Everything downstream already understands
   towns, so the filters, the map and the plan all keep working.

   The scheduler adds the journey between towns as its own row, because a plan that
   silently teleports you between two cities is worse than no plan. */
async function addTown(q) {
  const found = await findPlace(q, () => {});
  const rows = found.value || [];
  if (!rows.length) throw new Error(`Could not find "${q}"`);
  const p = rows[0];

  const key = p.name.toLowerCase();
  if ((GUIDE.towns || []).some(t => t.key === key)) throw new Error(`${p.name} is already here`);

  const r = Math.min(radiusFor(p), 4000);
  const els = await overpass(p.lat, p.lng, r, () => {});
  let fresh = capPlaces(osmToPlaces(els, key), 700).kept;

  try {
    let art = null;
    try { art = await wikivoyage(p.name); }
    catch (e) {
      const c = await wikivoyageSearch(p.name + " " + (p.country || ""));
      if (c.length) art = await wikivoyage(c[0]);
    }
    if (art) fresh = mergeInto(fresh, parseListings(art.wikitext, key), p);
  } catch (e) { /* a town without a Wikivoyage article is still a town */ }

  try {
    const ph = await getPhotos(p.lat, p.lng, Math.min(r, 6000), () => {});
    if (ph.value && ph.value.length) await attachPhotos(fresh, ph.value, () => {});
  } catch (e) {}

  const have = new Set(GUIDE.places.map(x => x.id));
  const added = fresh.filter(x => !have.has(x.id));
  GUIDE.places = GUIDE.places.concat(added);
  GUIDE.towns = (GUIDE.towns || []).concat([{
    key, name: p.name, lat: p.lat, lng: p.lng, country: p.country, added: added.length
  }]);
  save(GUIDE);
  init({ config: GUIDE.config, conditions: GUIDE.conditions, places: GUIDE.places });
  return { name: p.name, added: added.length };
}

/* the same merge the first town gets, factored out so a second one behaves identically */
function mergeInto(base, listings, place) {
  const key = n => String(n).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 22);
  const idx = new Map(); base.forEach(p => idx.set(key(p.name), p));
  const out = base.slice();
  for (const w of listings) {
    const hit = idx.get(key(w.name));
    if (hit) {
      if (w.why && w.why.length > (hit.why || "").length) { hit.why = w.why; hit.from = "OpenStreetMap + Wikivoyage"; }
      if (!hit.open && w.open) { hit.open = w.open; hit.close = w.close; hit.shut = w.shut; }
      if (!hit.priceNote && w.priceNote) hit.priceNote = w.priceNote;
    } else {
      if (w.lat == null) { w.lat = place.lat; w.lng = place.lng; w.loose = true; }
      out.push(w); idx.set(key(w.name), w);
    }
  }
  return out;
}

function drawTowns() {
  const towns = [{ key: (GUIDE.place.name || "").toLowerCase(), name: GUIDE.place.name, first: true }]
    .concat(GUIDE.towns || []);
  const el = $("#towns");
  if (!el) return;
  if (towns.length < 2) { el.innerHTML = ""; return; }
  const active = (GUIDE.townFilter || "all");
  el.innerHTML = `<button class="chip" data-town="all" aria-pressed="${active === "all"}">Everywhere</button>` +
    towns.map(t => {
      const n = (GUIDE.places || []).filter(p => p.town === t.key).length;
      return `<button class="chip" data-town="${esc(t.key)}" aria-pressed="${active === t.key}">${esc(t.name)} <span class="tiny">${n}</span></button>`;
    }).join("");
  $$("#towns .chip").forEach(b => b.onclick = () => {
    GUIDE.townFilter = b.dataset.town; save(GUIDE); drawTowns(); render();
  });
}

/* ---------- the plan ---------- */
const inPlan = id => (GUIDE && GUIDE.plan || []).indexOf(id) >= 0;

function togglePick(id) {
  GUIDE.plan = GUIDE.plan || [];
  const i = GUIDE.plan.indexOf(id);
  track(i >= 0 ? "/plan/removed" : "/plan/added");
  if (i >= 0) GUIDE.plan.splice(i, 1); else GUIDE.plan.push(id);
  syncDay();
  save(GUIDE);
  render();
  paintPlanCount();
  if (!$("#vPlan").hidden) drawPlan();
}

function movePick(id, dir) {
  const a = GUIDE.plan || [];
  const i = a.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= a.length) return;
  a.splice(j, 0, a.splice(i, 1)[0]);
  GUIDE.manualOrder = true;       // stop reordering it underneath them
  syncDay(); save(GUIDE); drawPlan();
}

function planPlaces() {
  const byId = {};
  (GUIDE.places || []).forEach(p => byId[p.id] = p);
  return (GUIDE.plan || []).map(id => byId[id]).filter(Boolean);
}

function paintPlanCount() {
  ensureDays();
  const total = GUIDE.days.reduce((a, d) => a + (d.plan || []).length, 0);
  const chip = $('#views .chip[data-v="plan"]');
  if (!chip) return;
  chip.textContent = !total ? "Your trip"
    : GUIDE.days.length > 1 ? `Your trip (${total} over ${GUIDE.days.length})`
    : `Your day (${total})`;
}

function drawPlan() {
  const el = $("#vPlan");
  const picks = planPlaces();
  if (!picks.length) {
    el.innerHTML = dayTabs() + `<div class="card hi">
        <h3>Build me a day</h3>
        <p class="sub">One tap and it puts a day together: the right things at the right
        hours, a meal when it is a meal time, and enough variety that it is not four
        temples in a row. You can change any of it afterwards.</p>
        <div class="btns" style="margin-top:10px">
          <button class="btn o" data-auto="easy">Take it easy</button>
          <button class="btn o" data-auto="steady">A normal day</button>
          <button class="btn o" data-auto="packed">See everything</button>
        </div>
        <p class="tiny" style="margin:9px 0 0">Nothing is fetched. It is working from the
        places already loaded, which is why it is instant.</p>
      </div>
      <div class="card">
        <h3>Or pick your own</h3>
        <p class="sub">Add places from the list and this builds an order for them: when to
        be where, how long the walk is, and whether any of it collides with opening hours
        or with the time you have to leave. It says when a plan does not fit rather than
        quietly dropping something.</p>
      </div>`;
    $$("#vPlan [data-day]").forEach(b => b.onclick = () => switchDay(+b.dataset.day));
  $$("#vPlan [data-addday]").forEach(b => b.onclick = () => addDay());
  $$("#vPlan [data-rmday]").forEach(b => b.onclick = () => removeDay(+b.dataset.rmday));
  $$("#vPlan [data-auto]").forEach(b => b.onclick = () => buildDayFor(b.dataset.auto, b));
    return;
  }
  // A day being planned for tomorrow should not be laid out from this minute.
  const startAt = GUIDE.planStart != null ? GUIDE.planStart : null;
  const s = schedule(picks, startAt, { keepOrder: !!GUIDE.manualOrder });
  const used = new Set(GUIDE.plan);

  const rows = s.rows.map((r, i) => {
    if (r.journey) return `<div class="prow journey">
      <div class="ptime">${HM(r.arrive)}<span>${HM(r.leave)}</span></div>
      <div class="pbody">
        <div class="pname">${esc(r.from.town || "there")} \u2192 ${esc(r.to.town || "there")}</div>
        <div class="tiny">About ${r.mins} minutes between towns. Too far to walk, so this is a
        bus, a train or a taxi, and the estimate is rough.</div>
      </div></div>`;
    const gapBlock = r.gap > 20 ? (() => {
      const opts = fillGap(i > 0 ? s.rows[i - 1].p : r.p, r.arrive - r.gap, r.gap, [...used]);
      return `<div class="gap">
        <div class="gap-h">${r.gap} minutes free here</div>
        ${opts.length ? `<p class="tiny" style="margin:4px 0 6px">Open now, close by, and short enough to fit:</p>
          <div class="gap-opts">${opts.map(o =>
            `<button class="btn" data-pick="${esc(o.p.id)}">+ ${esc(o.p.name)} <span class="tiny">${o.walk}m away</span></button>`
          ).join("")}</div>`
          : '<p class="tiny">Nothing nearby is open and short enough. A coffee, then.</p>'}
      </div>`;
    })() : "";

    return gapBlock + `<div class="prow${r.issues.length ? " prow-bad" : ""}">
      <div class="ptime">${HM(r.arrive)}<span>${HM(r.leave)}</span></div>
      <div class="pbody">
        <div class="pname">${esc(r.p.name)}
          <span style="display:flex;gap:2px;flex:0 0 auto">
            <button class="btn nudge" data-up="${esc(r.p.id)}" title="earlier">\u2191</button>
            <button class="btn nudge" data-down="${esc(r.p.id)}" title="later">\u2193</button>
            <button class="btn drop" data-pick="${esc(r.p.id)}" title="remove">\u00D7</button>
          </span></div>
        <div class="tiny">${r.walk ? `${r.walk} min walk. ` : ""}${dur(r.stay)} here.${r.p.lo ? ` About ${inr(r.p.lo)}.` : ""}</div>
        ${r.issues.map(x => `<div class="pissue">\u26A0 ${esc(x)}</div>`).join("")}
        ${(r.unknowns || []).map(x => `<div class="punknown">${esc(x)}</div>`).join("")}
      </div>
    </div>`;
  }).join("");

  el.innerHTML = dayTabs() + `
    <div class="card ${s.overruns ? "warn" : "ok"}">
      <h3>${s.overruns ? "This does not fit" : "Your day"}</h3>
      <div class="sumrow">
        <div><b>${HM(s.start)} to ${HM(s.end)}</b><span>the day</span></div>
        <div><b>${picks.length}</b><span>stops</span></div>
        <div><b>${s.walking}m</b><span>walking${s.travelling ? ` +${s.travelling} travel` : ""}</span></div>
        <div><b>${s.cost ? inr(s.cost) : "free"}</b><span>to spend</span></div>
      </div>
      ${s.overruns ? `<p class="sub" style="margin:10px 0 0">It runs past when you have to
        leave. Drop a stop, or start earlier.</p>` : s.problems === 0
        ? `<p class="sub" style="margin:10px 0 0">Everything lands inside the opening hours we
           know about, and each stop is at or near its best time of day.</p>`
        : `<p class="sub" style="margin:10px 0 0">${s.problems} thing${s.problems > 1 ? "s" : ""} to look at, marked below.</p>`}
      ${s.unknowns ? `<p class="tiny" style="margin:8px 0 0">${s.unknowns} of these have no
        opening hours recorded in OpenStreetMap, so they might be shut. That is a gap in the
        map rather than a fault in the plan.</p>` : ""}
    </div>
    <div class="card flat" style="margin:10px 0">
      <div class="rangerow">
        <label class="tiny" for="planDate" style="flex:0 0 auto">Date</label>
        <input id="planDate" type="date" value="${esc(GUIDE.startDate || todayISO())}"
               style="background:var(--bg2);border:1px solid var(--line);color:var(--ink);
                      border-radius:9px;padding:8px;font-family:inherit;font-size:15px">
      </div>
      <div class="rangerow">
        <label class="tiny" for="planStart" style="flex:0 0 auto">Start the day at</label>
        <input id="planStart" type="time" value="${HM(s.start)}"
               style="background:var(--bg2);border:1px solid var(--line);color:var(--ink);
                      border-radius:9px;padding:8px;font-family:inherit;font-size:15px">
        <button class="btn" id="startNow">now</button>
      </div>
      ${GUIDE.manualOrder ? `<p class="tiny" style="margin:6px 0 0">You have reordered this by
        hand, so it is left alone. <button class="btn" id="reorder"
        style="padding:3px 8px">let it re-sort by time</button></p>` : ""}
    </div>
    ${GUIDE.autoNotes && GUIDE.autoNotes.length ? `<div class="card warn">
      <h3>While building this</h3>
      ${GUIDE.autoNotes.map(n => `<p class="sub" style="margin:4px 0">${esc(n)}</p>`).join("")}
    </div>` : ""}
    <div class="chips" style="margin:10px 0 2px">
      <span class="tiny" style="align-self:center;padding-right:4px">Rebuild</span>
      <button class="chip" data-auto="easy" aria-pressed="${GUIDE.autoPace === "easy"}">Easy</button>
      <button class="chip" data-auto="steady" aria-pressed="${GUIDE.autoPace === "steady"}">Normal</button>
      <button class="chip" data-auto="packed" aria-pressed="${GUIDE.autoPace === "packed"}">Packed</button>
    </div>
    <div class="btns" style="margin:10px 0 14px">
      <button class="btn o" id="printPlan">Print or save as PDF</button>
      <button class="btn b" id="icsPlan">Add to calendar</button>
      <button class="btn b" id="sharePlan">Share this day</button>
      <button class="btn r" id="clearPlan">Clear</button>
    </div>
    <div class="plan">${rows}</div>
    <p class="tiny" style="margin-top:12px">Walking times assume 75 metres a minute with a
    third added for real streets, which is a realistic pace in a place you do not know.</p>`;

  $$("#vPlan [data-pick]").forEach(b => b.onclick = () => togglePick(b.dataset.pick));
  $$("#vPlan [data-day]").forEach(b => b.onclick = () => switchDay(+b.dataset.day));
  $$("#vPlan [data-addday]").forEach(b => b.onclick = () => addDay());
  $$("#vPlan [data-rmday]").forEach(b => b.onclick = () => removeDay(+b.dataset.rmday));
  $$("#vPlan [data-auto]").forEach(b => b.onclick = () => buildDayFor(b.dataset.auto, b));
  $$("#vPlan [data-up]").forEach(b => b.onclick = () => movePick(b.dataset.up, -1));
  $$("#vPlan [data-down]").forEach(b => b.onclick = () => movePick(b.dataset.down, 1));
  const pd = $("#planDate");
  if (pd) pd.onchange = () => { GUIDE.startDate = pd.value || null; save(GUIDE); drawPlan(); };
  const ps = $("#planStart");
  if (ps) ps.onchange = () => { GUIDE.planStart = M(ps.value); syncDay(); save(GUIDE); drawPlan(); };
  const sn = $("#startNow");
  if (sn) sn.onclick = () => { GUIDE.planStart = null; syncDay(); save(GUIDE); drawPlan(); };
  const ro = $("#reorder");
  if (ro) ro.onclick = () => { GUIDE.manualOrder = false; syncDay(); save(GUIDE); drawPlan(); };
  $("#printPlan").onclick = () => {
    track("/plan/printed");
    // Printing rendered only the day on screen, so a three day trip printed one day
    // and looked complete. Render them all, print, then put the view back.
    if (GUIDE.days && GUIDE.days.length > 1) {
      const keep = GUIDE.day;
      const holder = $("#printAll");
      holder.innerHTML = GUIDE.days.map((d, i) => {
        const byId = {}; (GUIDE.places || []).forEach(x => byId[x.id] = x);
        const picks = (d.plan || []).map(id => byId[id]).filter(Boolean);
        if (!picks.length) return "";
        const sc = schedule(picks, d.start != null ? d.start : null,
                            { keepOrder: !!d.manualOrder });
        return `<h2 class="printday">${esc(d.label)}</h2>` + sc.rows.map(r => r.journey
          ? `<div class="prow journey"><div class="ptime">${HM(r.arrive)}<span>${HM(r.leave)}</span></div>
             <div class="pbody"><div class="pname">${esc(r.from.town || "")} to ${esc(r.to.town || "")}</div></div></div>`
          : `<div class="prow"><div class="ptime">${HM(r.arrive)}<span>${HM(r.leave)}</span></div>
             <div class="pbody"><div class="pname">${esc(r.p.name)}</div>
             <div class="tiny">${r.walk ? r.walk + " min walk. " : ""}${dur(r.stay)} here.</div>
             ${(r.issues || []).map(x => `<div class="pissue">${esc(x)}</div>`).join("")}</div></div>`
        ).join("");
      }).join("");
      holder.hidden = false;
      document.body.classList.add("printing-all");
      window.print();
      setTimeout(() => {
        document.body.classList.remove("printing-all");
        holder.hidden = true; holder.innerHTML = "";
        GUIDE.day = keep; ensureDays();
      }, 500);
    } else {
      window.print();
    }
  };
  $("#icsPlan").onclick = () => { track("/plan/calendar"); downloadIcs(); };
  $("#clearPlan").onclick = () => { GUIDE.plan = []; syncDay(); save(GUIDE); render(); paintPlanCount(); drawPlan(); };
  $("#sharePlan").onclick = async () => {
    const u = location.origin + location.pathname + "?" + new URLSearchParams({
      q: GUIDE.place.name, lat: GUIDE.place.lat.toFixed(5), lng: GUIDE.place.lng.toFixed(5),
      tz: GUIDE.config.tzOffsetMinutes, a: HM(GUIDE.config.arrive), d: HM(GUIDE.config.depart),
      plan: (GUIDE.plan || []).join(","),
    });
    const btn = $("#sharePlan");
    try {
      if (navigator.share) await navigator.share({ title: `A day in ${GUIDE.place.name}`, url: u });
      else { await navigator.clipboard.writeText(u); btn.textContent = "Link copied"; setTimeout(() => btn.textContent = "Share this day", 1800); }
    } catch (e) {}
  };
}

/* Calendar export. Written by hand rather than with a library: the format is a
   dozen lines, and a dependency here would be more code than the feature.

   Times are written as local wall clock with no timezone, which is deliberate.
   A stop at 13:00 in Pushkar should read 13:00 in your calendar whatever your
   phone thinks the timezone is, and floating times are how the format says that. */
function todayISO() {
  const d = new Date(), off = CFG.tzOffsetMinutes || 0;
  const l = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + off * 60000);
  return `${l.getFullYear()}-${String(l.getMonth() + 1).padStart(2, "0")}-${String(l.getDate()).padStart(2, "0")}`;
}

function icsTime(mins, dayOffset) {
  // Anchored to the trip's own date, not to whatever day the export button was
  // pressed. Without that, exporting a trip for next week put every event on this
  // week, and re-exporting later quietly moved them all again.
  const iso = (GUIDE && GUIDE.startDate) || todayISO();
  const [Y, Mo, D] = iso.split("-").map(Number);
  const y = Y, m = Mo, day = D;
  const roll = Math.floor(mins / 1440) + (dayOffset || 0);
  const base = new Date(y, m - 1, day + roll);
  const hh = Math.floor((mins % 1440) / 60), mm = mins % 60;
  const p = n => String(n).padStart(2, "0");
  return `${base.getFullYear()}${p(base.getMonth() + 1)}${p(base.getDate())}T${p(hh)}${p(mm)}00`;
}

function icsEscape(t) {
  return String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;")
    .replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function downloadIcs() {
  ensureDays(); syncDay();
  const byId = {};
  (GUIDE.places || []).forEach(p => byId[p.id] = p);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//tripkit//EN",
                 "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
                 `X-WR-CALNAME:${icsEscape(GUIDE.place.name)}`];

  // Every day of the trip, each one a day later on the calendar.
  const rows = [];
  GUIDE.days.forEach((d, dayIndex) => {
    const picks = (d.plan || []).map(id => byId[id]).filter(Boolean);
    if (!picks.length) return;
    const sched = schedule(picks, d.start != null ? d.start : null,
                           { keepOrder: !!d.manualOrder });
    sched.rows.filter(r => !r.journey).forEach(r => rows.push({ r, dayIndex }));
  });

  rows.forEach(({ r, dayIndex }, i) => {
    const p = r.p;
    const where = [p.name, p.town ? p.town.charAt(0).toUpperCase() + p.town.slice(1) : null,
                   GUIDE.place.country].filter(Boolean).join(", ");
    // Wikivoyage listings without coordinates are pinned at the town centre. Sending
    // someone driving directions to the middle of town, labelled as a specific place,
    // is worse than sending them a search.
    const mapLink = p.loose
      ? `Search: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ", " + (p.town || GUIDE.place.name))}`
      : `Map: https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
    const desc = [p.why || "", p.warn ? "Note: " + p.warn : "",
                  p.loose ? "The exact location of this one is not recorded, so this is a search rather than directions." : "",
                  mapLink,
                  ...(r.issues || []).map(x => "Watch out: " + x)].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT",
      `UID:tripkit-${Date.now()}-${i}@atishyy27.github.io`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(r.arrive, dayIndex)}`,
      `DTEND:${icsTime(r.leave, dayIndex)}`,
      `SUMMARY:${icsEscape(p.name)}`,
      `LOCATION:${icsEscape(where)}`,
      ...(p.loose ? [] : [`GEO:${p.lat};${p.lng}`]),
      `DESCRIPTION:${icsEscape(desc)}`,
      "END:VEVENT");
  });
  lines.push("END:VCALENDAR");

  // fold at 75 octets, which the spec requires and most parsers quietly rely on
  // The spec folds at 75 OCTETS, not characters. Counting characters meant a
  // Devanagari or Chinese name produced lines two to three times over the limit,
  // which some parsers reject outright. Split on octets and never mid character.
  const enc = new TextEncoder();
  const foldLine = (l) => {
    if (enc.encode(l).length <= 74) return l;
    const out = [];
    let cur = "", curBytes = 0, limit = 74;
    for (const ch of l) {                       // iterates code points, not units
      const n = enc.encode(ch).length;
      if (curBytes + n > limit) {
        out.push(cur); cur = " " + ch; curBytes = 1 + n; limit = 73;
      } else { cur += ch; curBytes += n; }
    }
    if (cur) out.push(cur);
    return out.join("\r\n");
  };
  const folded = lines.map(foldLine).join("\r\n") + "\r\n";

  const blob = new Blob([folded], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${GUIDE.place.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-trip.ics`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function buildDayFor(pace, btn) {
  const label = btn ? btn.textContent : "";
  if (btn) { btn.textContent = "Working\u2026"; btn.disabled = true; }
  // Deliberately deferred a frame so the button actually repaints before a
  // synchronous pass over a few thousand places.
  setTimeout(() => {
    track("/plan/auto/" + pace);
    const start = GUIDE.planStart != null ? GUIDE.planStart : null;
    const res = autoPlan({ pace, start: start == null ? undefined : start,
                           exclude: pickedOnOtherDays() });
    GUIDE.plan = res.picks.map(p => p.id);
    GUIDE.manualOrder = false;
    GUIDE.autoNotes = res.notes;
    GUIDE.autoPace = pace;
    syncDay(); save(GUIDE);
    render(); paintPlanCount(); drawPlan();
    if (btn) { btn.textContent = label; btn.disabled = false; }
  }, 20);
}

/* ---------- the destination header ---------- */
function drawHero() {
  const g = GUIDE, ph = (g.photos || []).filter(p => p.thumb);
  const shot = ph[0];
  const open = (g.places || []).filter(p => ["open", "closing"].includes(openState(p, localMins()).state)).length;
  const w = g.weather && g.weather.now;
  const el = $("#hero");
  el.innerHTML = `
    <div class="dhero">
      ${safeUrl(shot && shot.thumb) ? `<img src="${esc(safeUrl(shot.thumb))}" alt="${esc(g.place.name)}" loading="eager">` : ""}
      <div class="in">
        <h1>${esc(g.place.name)}</h1>
        <p class="sub" style="margin:0;color:var(--hero-dim)" data-liveline></p>
        <div class="meta">
          ${w ? `<span class="m">${wmo(w.code)[1]} <b>${w.temp}\u00B0</b></span>` : ""}
          <span class="m"><b>${open}</b> open now</span>
          <span class="m"><b>${(g.places || []).length}</b> places</span>
          ${g.country && g.country.currency ? `<span class="m">${esc(g.country.flag || "")} ${esc(g.country.currency.code)}</span>` : ""}
        </div>
      </div>
    </div>
    ${g.cachedAt ? `<p class="dcredit">Places loaded ${esc(ago(g.cachedAt))}.
      <a href="#" id="refreshData">fetch them again</a></p>` : ""}
    ${shot ? `<p class="dcredit">photo: ${esc(shot.title).slice(0, 54)}${shot.licence ? ", " + esc(shot.licence) : ""}, via Wikimedia Commons</p>` : ""}`;
  wireHeroRefresh();
}

/* ---------- weather ---------- */
function wireHeroRefresh() {
  const a = $("#refreshData");
  if (a) a.onclick = (e) => {
    e.preventDefault();
    PLACE = GUIDE.place;
    $("#tz").value = GUIDE.config.tzOffsetMinutes;
    $("#arrive").value = HM(GUIDE.config.arrive);
    $("#depart").value = HM(GUIDE.config.depart);
    $("#radius").value = GUIDE.radius || 2500;
    build();
  };
}

function drawWeather() {
  const el = $("#vWeather");
  const w = GUIDE.weather, air = GUIDE.air, c = GUIDE.conditions;
  if (!w) {
    el.innerHTML = '<div class="card warn"><h3>No forecast</h3><p class="sub">' +
      'Every weather source declined. Sunrise and sunset below are still exact, ' +
      'because they are calculated here rather than fetched.</p></div>' + sunCard();
    return;
  }
  const n = w.now, [label, icon] = wmo(n.code);
  const today = new Date().toISOString().slice(0, 10);
  const days = [...new Set(w.hours.map(h => h.day))];
  const day = days.includes(today) ? today : days[0];
  const t = localMins();
  const rest = w.hours.filter(h => h.day === day && M(h.time) >= t - 60).slice(0, 14);
  const band = air && aqiBand(air.aqi);

  const bars = rest.map(h => {
    const hot = c.heatWindow && M(h.time) >= c.heatWindow[0] && M(h.time) <= c.heatWindow[1];
    const now = Math.abs(M(h.time) - t) < 30;
    return `<div style="flex:0 0 54px;text-align:center;padding:8px 0;border-radius:9px;
      background:${now ? "var(--card2)" : "transparent"};border:1px solid ${now ? "var(--hot)" : "transparent"}">
      <div class="tiny" style="color:${now ? "var(--hot)" : "var(--dimmer)"}">${h.time}</div>
      <div style="font-size:17px;margin:2px 0">${wmo(h.code)[1]}</div>
      <div style="font-weight:800;font-size:14px;color:${hot ? "var(--hot)" : "var(--ink)"}">${h.temp}\u00B0</div>
      ${h.rain != null && h.rain > 15 ? `<div class="tiny" style="color:var(--blue)">${h.rain}%</div>` : '<div class="tiny">&nbsp;</div>'}
      ${h.uv != null && h.uv >= 8 ? `<div class="tiny" style="color:var(--red)">UV${h.uv}</div>` : ""}
    </div>`;
  }).join("");

  el.innerHTML = `
    <div class="card hi">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="font-size:44px;line-height:1">${icon}</div>
        <div style="flex:1">
          <div style="font-size:30px;font-weight:800;letter-spacing:-1px">${n.temp}\u00B0C</div>
          <div class="sub" style="margin:0">${esc(label)}, feels like ${n.feels}\u00B0</div>
        </div>
      </div>
      <div class="grid2" style="margin-top:12px">
        <div class="stat"><div class="v">${w.today.max}\u00B0 / ${w.today.min}\u00B0</div><div class="k">today high and low</div></div>
        <div class="stat"><div class="v">${w.today.rain == null ? "?" : w.today.rain + "%"}</div><div class="k">chance of rain</div></div>
        <div class="stat"><div class="v">${n.humidity}%</div><div class="k">humidity</div></div>
        <div class="stat"><div class="v">${n.wind} km/h</div><div class="k">wind</div></div>
      </div>
      <p class="tiny" style="margin:10px 0 0">Forecast from ${esc(GUIDE.weatherSource || "unknown")}.</p>
    </div>

    <h2><span class="n">01</span> The next few hours</h2>
    <div style="display:flex;gap:4px;overflow-x:auto;padding:4px 0" class="chips">${bars || '<p class="tiny">no more hours today</p>'}</div>
    ${c.heatWindow ? `<p class="tiny">Orange marks the hottest stretch, ${HM(c.heatWindow[0])} to ${HM(c.heatWindow[1])},
      measured from today's forecast rather than assumed. The ranking already pushes shade up during it.</p>` : ""}

    ${band ? `<h2><span class="n">02</span> Air</h2>
    <div class="card">
      <h3>${esc(band[0])}<span class="money" style="color:${band[1]}">US AQI ${air.aqi}</span></h3>
      <p class="sub" style="margin:6px 0 0">PM2.5 ${air.pm25} and PM10 ${air.pm10} micrograms per cubic metre.
      ${air.aqi > 150 ? "Worth a mask if you are outside for long, and worth doing indoor things at the peak."
        : air.aqi > 100 ? "Fine for most people, noticeable if you are asthmatic or running."
        : "Nothing to plan around."}</p>
    </div>` : ""}

    <h2><span class="n">${band ? "03" : "02"}</span> Light</h2>
    ${sunCard()}`;
}

function sunCard() {
  const c = GUIDE.conditions;
  return `<div class="card cool">
    <div class="grid2">
      <div class="stat"><div class="v">${HM(c.sunrise)}</div><div class="k">sunrise</div></div>
      <div class="stat"><div class="v">${HM(c.sunset)}</div><div class="k">sunset</div></div>
      <div class="stat"><div class="v">${HM(c.firstLight)}</div><div class="k">first light</div></div>
      <div class="stat"><div class="v">${HM(c.lastLight)}</div><div class="k">last light</div></div>
    </div>
    <p class="tiny" style="margin:10px 0 0">Computed on this device from the date and your
    coordinates, so these are right even with no signal.</p></div>`;
}

/* ---------- local: country facts, getting around, photos ---------- */
function drawLocal() {
  const el = $("#vLocal");
  const c = GUIDE.country, tr = GUIDE.transit || [], ph = GUIDE.photos || [];
  let html = "";

  if (c) {
    const e = c.emergency || {};
    html += `<div class="card">
      <h3>${esc(c.flag || "")} ${esc(c.name || GUIDE.place.country || "")}</h3>
      <div class="grid2" style="margin-top:10px">
        ${c.currency ? `<div class="stat"><div class="v">${esc(c.currency.symbol)} ${esc(c.currency.code)}</div><div class="k">currency</div></div>` : ""}
        ${c.drivingSide ? `<div class="stat"><div class="v">${esc(c.drivingSide)}</div><div class="k">traffic drives on the</div></div>` : ""}
        ${c.dialCode ? `<div class="stat"><div class="v">${esc(c.dialCode)}</div><div class="k">dialling code</div></div>` : ""}
        ${c.languages ? `<div class="stat"><div class="v" style="font-size:14px">${esc(c.languages.slice(0, 2).join(", "))}</div><div class="k">languages</div></div>` : ""}
      </div></div>`;
    if (e.all) {
      html += `<div class="card warn"><h3>If something goes wrong</h3><div class="sos">` +
        Object.entries(e).map(([k, v]) =>
          `<a href="tel:${String(v).replace(/[^0-9+]/g, "")}">${esc(v)}<br><span class="tiny">${esc(k)}</span></a>`
        ).join("") + `</div></div>`;
    }
  }

  if (tr.length) {
    const byKind = {};
    tr.forEach(x => (byKind[x.kind] = byKind[x.kind] || []).push(x));
    html += `<h2><span class="n">01</span> Getting around</h2>
      <p class="sub">${tr.length} stops and stations near the centre, from OpenStreetMap.</p>`;
    for (const [kind, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
      html += `<details><summary>${esc(kind)} (${list.length})</summary>` +
        list.slice(0, 20).map(x =>
          `<p class="sub" style="margin:5px 0"><a href="https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}&travelmode=walking" target="_blank" rel="noopener">${esc(x.name)}</a>${x.network ? ` <span class="tiny">${esc(x.network)}</span>` : ""}</p>`
        ).join("") + `</details>`;
    }
  }

  if (ph.length) {
    html += `<h2><span class="n">0${tr.length ? 2 : 1}</span> What it looks like</h2>
      <p class="sub">Photographed near here, from Wikimedia Commons.</p>
      <div class="gal">` +
      ph.filter(p => safeUrl(p.thumb)).map(p => `<a href="${esc(safeUrl(p.full) || safeUrl(p.thumb))}" target="_blank" rel="noopener noreferrer">
        <img src="${esc(safeUrl(p.thumb))}" loading="lazy" alt="${esc(p.title)}">
        <div class="cap">${esc(p.title).slice(0, 42)}</div></a>`).join("") +
      `</div><p class="tiny" style="margin-top:8px">Each image is licensed by whoever took it,
       follow one for the terms.</p>`;
  }

  if (!html) html = '<div class="state state-empty"><span class="state-icon">🗺</span>' +
    'Nothing extra was available for this place.</div>';
  el.innerHTML = html;
}

/* ---------- views ---------- */
function setView(v) {
  const map = { list: "#vList", plan: "#vPlan", map: "#vMap", day: "#vDay",
                weather: "#vWeather", local: "#vLocal" };
  for (const [k, sel] of Object.entries(map)) { const n = $(sel); if (n) n.hidden = k !== v; }
  if (v === "map") drawMap();
  if (v === "day") drawDay();
  if (v === "weather") drawWeather();
  if (v === "local") drawLocal();
  if (v === "plan") drawPlan();
}

/* ---------- extras ---------- */
function wireGuide() {
  $("#filter").addEventListener("input", render);
  $$("#views .chip").forEach(b => b.onclick = () => {
    $$("#views .chip").forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true");
    track("/view/" + b.dataset.v);
    setView(b.dataset.v);
  });

  $("#shareBtn").onclick = async () => {
    const p = GUIDE.place;
    const url = location.origin + location.pathname + "?" + new URLSearchParams({
      q: p.name, lat: p.lat.toFixed(5), lng: p.lng.toFixed(5),
      tz: GUIDE.config.tzOffsetMinutes,
      a: HM(GUIDE.config.arrive), d: HM(GUIDE.config.depart)
    });
    const text = `${p.name}: what is open right now`;
    try {
      if (navigator.share) await navigator.share({ title: text, url });
      else { await navigator.clipboard.writeText(url); $("#shareBtn").textContent = "Link copied"; setTimeout(() => $("#shareBtn").textContent = "Share this guide", 1800); }
    } catch (e) { /* the user closed the sheet; nothing to report */ }
  };

  $("#widerBtn").onclick = async () => {
    const btn = $("#widerBtn");
    track("/widened");
    const from = GUIDE.radius || 2500, to = Math.min(from + 2500, 15000);
    if (to <= from) { btn.textContent = "Already as wide as it goes"; return; }
    btn.textContent = `Looking out to ${(to / 1000).toFixed(1)} km…`;
    btn.disabled = true;
    try {
      const els = await overpass(GUIDE.place.lat, GUIDE.place.lng, to, () => {});
      const fresh = osmToPlaces(els, GUIDE.place.name.toLowerCase());
      // append rather than replace: nothing already on screen should disappear
      // because someone asked to see more
      const have = new Set(GUIDE.places.map(p => p.id));
      const added = fresh.filter(p => !have.has(p.id));
      const room = Math.max(0, 2400 - GUIDE.places.length);
      const keep = capPlaces(added, room || 400).kept;
      if (GUIDE.photos && GUIDE.photos.length) await attachPhotos(keep, GUIDE.photos, () => {});
      GUIDE.places = GUIDE.places.concat(keep);
      GUIDE.radius = to;
      save(GUIDE);
      init({ config: GUIDE.config, conditions: GUIDE.conditions, places: GUIDE.places });
      buildCats(); render(); drawHero();
      btn.textContent = `Added ${keep.length}, now ${(to / 1000).toFixed(1)} km`;
    } catch (e) {
      btn.textContent = "Could not reach the map service";
    } finally {
      btn.disabled = false;
      setTimeout(() => { btn.textContent = "Look further out"; }, 4000);
    }
  };

  $("#addTownBtn").onclick = async () => {
    const q = prompt("Which other town or city is on this trip?");
    if (!q || !q.trim()) return;
    const btn = $("#addTownBtn");
    btn.textContent = `Looking up ${q.trim()}\u2026`; btn.disabled = true;
    try {
      track("/town/added");
      const res = await addTown(q.trim());
      drawTowns(); buildCats(); render(); drawHero();
      btn.textContent = `Added ${res.name}, ${res.added} places`;
    } catch (e) {
      btn.textContent = e.message.slice(0, 40);
    } finally {
      btn.disabled = false;
      setTimeout(() => { btn.textContent = "+ another town"; }, 4000);
    }
  };

  $("#rebuildBtn").onclick = () => {
    PLACE = GUIDE.place;
    $("#tz").value = GUIDE.config.tzOffsetMinutes;
    $("#arrive").value = HM(GUIDE.config.arrive);
    $("#depart").value = HM(GUIDE.config.depart);
    build();
  };
  $("#aboutBtn").onclick = () => {
    const t = GUIDE;
    const osm = t.places.filter(p => p.from === "OpenStreetMap").length;
    const wv = t.places.filter(p => String(p.from).includes("Wikivoyage")).length;
    const hrs = t.places.filter(p => p.open).length;
    $("#aboutBody").innerHTML = `
      <p class="sub"><b>${esc(t.place.name)}</b>${t.place.country ? ", " + esc(t.place.country) : ""}. Built ${new Date(t.built).toLocaleString()}, entirely in this browser.</p>
      <div class="grid2" style="margin:10px 0">
        <div class="stat"><div class="v">${t.places.length}</div><div class="k">places</div></div>
        <div class="stat"><div class="v">${hrs}</div><div class="k">with real opening hours</div></div>
        <div class="stat"><div class="v">${osm}</div><div class="k">from OpenStreetMap</div></div>
        <div class="stat"><div class="v">${wv}</div><div class="k">touched by Wikivoyage</div></div>
      </div>
      <p class="sub">Sunrise ${HM(t.conditions.sunrise)} and sunset ${HM(t.conditions.sunset)} were calculated on this device from orbital maths, not fetched from anywhere.</p>
      ${t.intro ? `<h3 style="margin-top:14px">About ${esc(t.place.name)}</h3><p class="sub">${esc(t.intro).slice(0, 1400)}</p>` : ""}
      ${t.cautions && t.cautions.length ? `<h3 style="margin-top:14px">Stay safe, per Wikivoyage</h3>${t.cautions.slice(0, 5).map(c => `<p class="sub">${esc(c)}</p>`).join("")}` : ""}
      ${t.notes && t.notes.length ? `<h3 style="margin-top:14px">What went wrong while building this</h3>${t.notes.map(n => `<p class="tiny">${esc(n)}</p>`).join("")}` : ""}
      <h3 style="margin-top:14px">Where this comes from</h3>
      <p class="tiny">Places and opening hours: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, ODbL.
      Descriptions and safety notes: <a href="https://en.wikivoyage.org/wiki/${encodeURIComponent(t.wvTitle || t.place.name)}" target="_blank" rel="noopener">Wikivoyage</a>, CC BY-SA 4.0.
      Search: Nominatim. No AI wrote any of the text about these places, people did.</p>
      <p class="tiny">Nothing here is sent anywhere. This trip is stored only on this device and disappears if you clear your browser data.</p>`;
    $("#about").showModal();
  };
  $("#closeAbout").onclick = () => $("#about").close();
  $("#newBtn").onclick = () => { show("s1"); $("#q").value = ""; $("#hits").innerHTML = ""; $("#q").focus(); };
}

/* ---------- landing: rotating photo hero ----------
   HEROES/HERO_LQIP come from hero/heroes.js, loaded before this file. Guarded
   with typeof checks because the unit test sandbox runs this script alone,
   without heroes.js, and calling a function is fine there as long as nothing
   at the top level of this file assumes those globals exist. */
function wireLandingHero() {
  if (typeof HEROES === "undefined" || !HEROES.length) return;
  const imgs = $$(".land-hero-img");
  if (!imgs.length) return;
  const link = $("#landCreditLink");

  function paintCredit(i) {
    const h = HEROES[i];
    if (!link || !h) return;
    link.textContent = `${h.town} · ${h.by}, ${h.lic}`;
    link.href = h.src;
  }

  // All three load right away rather than one-then-lazy: the set is small
  // (under 400KB together) and loading them up front means the first
  // cross-fade a few seconds later is instant, not a second load waiting on
  // the network.
  imgs.forEach((img, i) => { if (HEROES[i]) img.src = HEROES[i].file; });
  paintCredit(0);

  let reduced = false;
  try { reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  // A held first photo instead of a slideshow, for anyone who asked their
  // system to cut motion. The hero itself, and the search over it, stay.
  if (reduced || imgs.length < 2) return;

  let cur = 0;
  setInterval(() => {
    const next = (cur + 1) % imgs.length;
    if (!HEROES[next]) return;
    imgs[cur].classList.remove("on");
    imgs[next].classList.add("on");
    paintCredit(next);
    cur = next;
  }, 7000);
}

/* ---------- boot ---------- */
window.addEventListener("DOMContentLoaded", () => {
  wireLandingHero();
  wireSearch(); wireTimes(); wireGuide();
  const u = new URLSearchParams(location.search);
  if (u.get("lat") && u.get("lng")) {
    PLACE = { name: u.get("q") || "there", label: u.get("q") || "", lat: +u.get("lat"),
              lng: +u.get("lng"), country: "", countryCode: "", bbox: null };
    $("#tz").value = u.get("tz") || guessTz(PLACE.lat, PLACE.lng, "");
    $("#arrive").value = u.get("a") || "09:00";
    $("#depart").value = u.get("d") || "21:00";
    SHARED_PLAN = (u.get("plan") || "").split(",").filter(Boolean);
    build();
    return;
  }

  const recent = cacheList();
  if (recent.length) {
    const box = $("#recent");
    if (box) {
      box.innerHTML = `<p class="tiny" style="margin:14px 0 6px">Already on this device,
        opens with no signal</p><div class="chips">` +
        recent.slice(0, 6).map((r, i) =>
          `<button class="chip" data-recent="${i}">${esc(r.trip.place.name)}
            <span class="tiny">${esc(ago(r.at))}</span></button>`).join("") + `</div>`;
      $$("#recent [data-recent]").forEach(b => b.onclick = () => {
        const r = recent[+b.dataset.recent];
        PLACE = r.trip.place;
        $("#tz").value = r.trip.config.tzOffsetMinutes;
        $("#arrive").value = HM(r.trip.config.arrive);
        $("#depart").value = HM(r.trip.config.depart);
        openCached(r);
      });
    }
  }

  const saved = load();
  if (saved && saved.v === 1) {
    $("#resume").style.display = "block";
    $("#resumeName").textContent = saved.place.name;
    $("#resumeBtn").onclick = () => open(saved);
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").then(reg => {
      // A user who opened a broken build should not be stuck with it. When a new
      // worker is waiting, take it and reload once, guarded so this can never loop.
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            try {
              if (sessionStorage.getItem("tk_reloaded")) return;
              sessionStorage.setItem("tk_reloaded", "1");
            } catch (e) { return; }
            sw.postMessage("skipWaiting");
            location.reload();
          }
        });
      });
      reg.update();
    }).catch(() => {});
  }
});
