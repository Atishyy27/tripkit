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

function save(trip) { try { localStorage.setItem(STORE, JSON.stringify(trip)); } catch (e) {} }
function load() { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; } }

/* A timezone offset without shipping a timezone database.
   Longitude gives the solar offset; most of the world rounds that to a whole
   hour, and a handful of places sit on a half hour. It is an estimate and the
   UI says so, because a guide that is silently an hour out is worse than one
   that admits it does not know. */
function guessTz(lat, lng, cc) {
  const HALF = { IN: 330, LK: 330, NP: 345, IR: 210, AF: 270, MM: 390, AU: 570, CA: -210 };
  if (HALF[cc] !== undefined && ["IN", "LK", "NP", "IR", "AF", "MM"].includes(cc)) return HALF[cc];
  return Math.round(lng / 15) * 60;
}

/* ---------- state ---------- */
/* GUIDE is the whole saved trip. The engine separately owns TRIP, its derived
   timing config. Two top level `let` of the same name across script tags is a
   SyntaxError that kills the page before a line of it runs. */
let PLACE = null, GUIDE = null;

/* ---------- screen 1: search ---------- */
let searchTimer = null;
function wireSearch() {
  const box = $("#q");
  box.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const v = box.value.trim();
    if (v.length < 2) { $("#hits").innerHTML = ""; return; }
    $("#hits").innerHTML = '<p class="tiny">searching…</p>';
    searchTimer = setTimeout(() => doSearch(v), 450);
  });
}

async function doSearch(q) {
  try {
    const found = await findPlace(q, m => console.info(m));
    const rows = found.value || [];
    if (!rows.length) { $("#hits").innerHTML = '<p class="tiny">Nothing found. Try the plain name of the town.</p>'; return; }
    $("#hits").innerHTML = rows.map((r, i) =>
      `<div class="hit" data-i="${i}"><b>${esc(r.name)}</b><span>${esc(r.label)}</span></div>`).join("");
    $$("#hits .hit").forEach(el => el.onclick = () => pick(rows[+el.dataset.i]));
  } catch (e) {
    $("#hits").innerHTML = `<div class="card warn"><p class="sub">Could not reach OpenStreetMap's search: ${esc(e.message)}. That service is free and sometimes rate-limits. Wait a moment and try again.</p></div>`;
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
  step("stSun", "done",
       `sunrise ${HM(s.sunrise)}, sunset ${HM(s.sunset)}` +
       (heat ? `, hottest ${heat[0]} to ${heat[1]} from today's forecast` : "") +
       ", calculated on this device");
  progress(95);

  GUIDE = {
    v: 1, built: Date.now(),
    place: PLACE, notes, intro, cautions, wvTitle,
    radius: r,
    config: {
      dest: PLACE.name, country: PLACE.country,
      arrive: M(arrive), depart: M(depart),
      hopMinutes: 0, exitBufferMinutes: 45,
      tzOffsetMinutes: tz, multiDay: false
    },
    conditions: {
      sunrise: s.sunrise, sunset: s.sunset,
      firstLight: s.firstLight, lastLight: s.lastLight,
      heatWindow: heat ? [M(heat[0]), M(heat[1])] : null
    },
    weather: wx.value, weatherSource: wx.source,
    air: air.value, country: country.value,
    transit: transit.value || [], photos: (photos.value || []).slice(0, 24),
    places
  };
  save(GUIDE);
  step("stDone", "done", `${places.length} places ready, saved to this device`);
  progress(100);
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
  show("s4");
  drawHero();
  buildCats();
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
  const badge = { open: '<span class="tag t-open">open now</span>',
    closing: `<span class="tag t-soon">${esc(st.label)}</span>`,
    soon: `<span class="tag t-soon">${esc(st.label)}</span>`,
    shut: `<span class="tag t-shut">${esc(st.label)}</span>`,
    unknown: '<span class="tag t-unv">hours unknown</span>' }[st.state] || "";
  const src = p.from === "Wikivoyage" ? '<span class="src-badge src-wv">Wikivoyage</span>'
    : p.from === "OpenStreetMap + Wikivoyage" ? '<span class="src-badge src-wv">OSM + Wikivoyage</span>'
    : '<span class="src-badge src-osm">OpenStreetMap</span>';
  const price = p.priceNote ? esc(p.priceNote) : ((p.lo === 0 && p.hi === 0) ? "free" : "");
  // No spaces inside a coordinate pair. A cosmetic sweep once put one here and every
  // "walk there" link silently pointed nowhere.
  const g = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
  const o = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`;
  const tint = CAT_TINT[p.cat] || "#a99fc4";
  const icon = CAT_ICON[p.cat] || "\u{1F4CD}";
  const dim = st.state === "shut";

  const media = p.photo
    ? `<div class="pc-img"><img src="${esc(p.photo)}" loading="lazy" decoding="async"
         alt="${esc(p.name)}" onerror="this.closest('.pc-img').classList.add('pc-glyph');this.remove()">
       ${p.photoExact ? "" : '<span class="pc-near">nearby</span>'}</div>`
    : `<div class="pc-img pc-glyph"><span>${icon}</span></div>`;

  return `<article class="pc${i === 0 ? " pc-top" : ""}${dim ? " pc-dim" : ""}" style="--tint:${tint}">
    ${media}
    <div class="pc-body">
      <div class="pc-head">
        <h3>${esc(p.name)}</h3>
        ${price ? `<span class="pc-price">${price}</span>` : ""}
      </div>
      <div class="pc-tags">${badge}${p.dur ? `<span class="tag t-info">${dur(p.dur)}</span>` : ""}${p.loose ? '<span class="tag t-unv">pin approx</span>' : ""}${src}</div>
      ${p.why ? `<p class="pc-why">${esc(p.why).slice(0, 260)}</p>` : ""}
      ${p.warn ? `<p class="pc-warn">\u26A0 ${esc(p.warn)}</p>` : ""}
      ${r.why && r.why.length ? `<div class="why">\u2192 ${esc(r.why[0])}</div>` : ""}
      <div class="btns">
        <a class="btn g" target="_blank" rel="noopener" href="${g}">Walk there</a>
        <a class="btn" target="_blank" rel="noopener" href="${o}">Map</a>
        ${p.website ? `<a class="btn b" target="_blank" rel="noopener" href="${esc(p.website)}">Website</a>` : ""}
      </div>
    </div>
  </article>`;
}

function render() {
  const t = localMins();
  const cat = ($("#cats .chip[aria-pressed=true]") || { dataset: { c: "all" } }).dataset.c;
  const q = $("#filter").value.trim();
  const r = rankNow(t, { cat, q });
  const ex = exitState(t);

  $("#clock").textContent = HM(t);
  $("#phase").textContent = r.phase.name;
  $("#phaseLine").textContent = r.phase.line;

  const sr = GUIDE.conditions.sunrise, ss = GUIDE.conditions.sunset;
  $("#sun").textContent = t < sr ? `🌑 sunrise ${HM(sr)}, ${sr - t} min away`
    : t < ss ? `☀️ sunset ${HM(ss)}, ${Math.floor((ss - t) / 60)}h ${(ss - t) % 60}m of light left`
    : `🌙 sun set at ${HM(ss)}`;

  let alerts = "";
  if (ex.msg) alerts += `<div class="card ${ex.level === "soon" ? "cool" : "warn"}"><h3>${ex.level === "soon" ? "Start heading back" : "Time to go"}</h3><p class="sub" style="margin:6px 0 0">${esc(ex.msg)}</p></div>`;
  const cs = closingSoon(t);
  if (cs.length) alerts += `<div class="card warn"><h3>Closing soon</h3>${cs.slice(0, 4).map(x => `<p class="sub" style="margin:4px 0"><b>${esc(x.p.name)}</b>, ${esc(x.st.label)}</p>`).join("")}</div>`;
  $("#alerts").innerHTML = alerts;

  const top = r.list.slice(0, 40);
  $("#list").innerHTML = top.length ? top.map(card).join("")
    : `<div class="empty">Nothing in this filter is open and still fits.</div>`;
  $("#count").textContent = `${r.list.length} of ${GUIDE.places.length} places fit right now`;
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
      `<br><a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking" target="_blank" rel="noopener">Walk there</a>`));
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

/* ---------- the destination header ---------- */
function drawHero() {
  const g = GUIDE, ph = (g.photos || []).filter(p => p.thumb);
  const shot = ph[0];
  const open = (g.places || []).filter(p => ["open", "closing"].includes(openState(p, localMins()).state)).length;
  const w = g.weather && g.weather.now;
  const el = $("#hero");
  el.innerHTML = `
    <div class="dhero">
      ${shot ? `<img src="${esc(shot.thumb)}" alt="${esc(g.place.name)}" loading="eager">` : ""}
      <div class="in">
        <h1>${esc(g.place.name)}</h1>
        <p class="sub" style="margin:0;color:#cfc6e6" data-liveline></p>
        <div class="meta">
          ${w ? `<span class="m">${wmo(w.code)[1]} <b>${w.temp}\u00B0</b></span>` : ""}
          <span class="m"><b>${open}</b> open now</span>
          <span class="m"><b>${(g.places || []).length}</b> places</span>
          ${g.country && g.country.currency ? `<span class="m">${esc(g.country.flag || "")} ${esc(g.country.currency.code)}</span>` : ""}
        </div>
      </div>
    </div>
    ${shot ? `<p class="dcredit">photo: ${esc(shot.title).slice(0, 54)}${shot.licence ? ", " + esc(shot.licence) : ""}, via Wikimedia Commons</p>` : ""}`;
}

/* ---------- weather ---------- */
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
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">` +
      ph.map(p => `<a href="${esc(p.full)}" target="_blank" rel="noopener"
        style="display:block;border-radius:11px;overflow:hidden;border:1px solid var(--line);background:var(--bg2)">
        <img src="${esc(p.thumb)}" loading="lazy" alt="${esc(p.title)}"
             style="width:100%;height:120px;object-fit:cover;display:block">
        <div class="tiny" style="padding:6px 8px">${esc(p.title).slice(0, 60)}</div></a>`).join("") +
      `</div><p class="tiny" style="margin-top:8px">Images are licensed by their photographers,
       follow a photo for the terms.</p>`;
  }

  if (!html) html = '<div class="empty">Nothing extra was available for this place.</div>';
  el.innerHTML = html;
}

/* ---------- views ---------- */
function setView(v) {
  const map = { list: "#vList", map: "#vMap", day: "#vDay", weather: "#vWeather", local: "#vLocal" };
  for (const [k, sel] of Object.entries(map)) { const n = $(sel); if (n) n.hidden = k !== v; }
  if (v === "map") drawMap();
  if (v === "day") drawDay();
  if (v === "weather") drawWeather();
  if (v === "local") drawLocal();
}

/* ---------- extras ---------- */
function wireGuide() {
  $("#filter").addEventListener("input", render);
  $$("#views .chip").forEach(b => b.onclick = () => {
    $$("#views .chip").forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true");
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

/* ---------- boot ---------- */
window.addEventListener("DOMContentLoaded", () => {
  wireSearch(); wireTimes(); wireGuide();
  const u = new URLSearchParams(location.search);
  if (u.get("lat") && u.get("lng")) {
    PLACE = { name: u.get("q") || "there", label: u.get("q") || "", lat: +u.get("lat"),
              lng: +u.get("lng"), country: "", countryCode: "", bbox: null };
    $("#tz").value = u.get("tz") || guessTz(PLACE.lat, PLACE.lng, "");
    $("#arrive").value = u.get("a") || "09:00";
    $("#depart").value = u.get("d") || "21:00";
    build();
    return;
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
