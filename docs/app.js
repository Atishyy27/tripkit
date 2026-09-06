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
let PLACE = null, TRIP = null;

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
    const rows = await geocode(q);
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
  const now = new Date();
  $("#arrive").value = "09:00";
  $("#depart").value = "21:00";
  show("s2");
}

/* ---------- screen 2: the clock ---------- */
function wireTimes() {
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
  el.querySelector("i").textContent = state === "done" ? "✓" : state === "fail" ? "✗" : state === "now" ? "◐" : "○";
  if (text) el.querySelector("span").textContent = text;
}
function progress(pct) { $("#bar>div").style.width = pct + "%"; }

async function build() {
  show("s3");
  ["stGeo", "stOsm", "stWv", "stSun", "stDone"].forEach(i => step(i, "", null));
  const notes = [];

  const tz = +$("#tz").value;
  const arrive = $("#arrive").value || "09:00";
  const depart = $("#depart").value || "21:00";

  step("stGeo", "done", `${PLACE.name} — ${PLACE.lat.toFixed(4)}, ${PLACE.lng.toFixed(4)}`);
  progress(10);

  /* --- OpenStreetMap --- */
  let places = [];
  const r = radiusFor(PLACE);
  step("stOsm", "now", `asking OpenStreetMap, ${(r / 1000).toFixed(1)} km around the centre…`);
  try {
    const els = await overpass(PLACE.lat, PLACE.lng, r, m => notes.push(m));
    const all = osmToPlaces(els, PLACE.name.toLowerCase());
    const cap = capPlaces(all, 1200);
    places = cap.kept;
    const withHours = places.filter(p => p.open).length;
    step("stOsm", "done",
      `${all.length} places found, keeping ${places.length}${cap.dropped ? ` (dropped ${cap.dropped} least useful — mostly banks and bus stops)` : ""}, ${withHours} with opening hours`);
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
      step("stWv", "done", `“${art.title}” — ${listings.length} listings written by travellers`);
    } else {
      step("stWv", "fail", "no Wikivoyage article for this place");
      notes.push("No Wikivoyage guide exists here, so descriptions come only from map data.");
    }
  } catch (e) {
    step("stWv", "fail", "Wikivoyage unavailable: " + e.message);
  }
  progress(80);

  /* --- sun, computed here --- */
  step("stSun", "now", "computing the sun…");
  const s = sunTimes(new Date(), PLACE.lat, PLACE.lng, tz);
  step("stSun", "done", `sunrise ${HM(s.sunrise)}, sunset ${HM(s.sunset)} — calculated on this device, not fetched`);
  progress(95);

  TRIP = {
    v: 1, built: Date.now(),
    place: PLACE, notes, intro, cautions, wvTitle,
    config: {
      dest: PLACE.name, country: PLACE.country,
      arrive: M(arrive), depart: M(depart),
      hopMinutes: 0, exitBufferMinutes: 45,
      tzOffsetMinutes: tz, multiDay: false
    },
    conditions: {
      sunrise: s.sunrise, sunset: s.sunset,
      firstLight: s.firstLight, lastLight: s.lastLight,
      heatWindow: null
    },
    places
  };
  save(TRIP);
  step("stDone", "done", `${places.length} places ready — saved to this device`);
  progress(100);
  setTimeout(() => open(TRIP), 500);
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
  TRIP = trip;
  init({ config: trip.config, conditions: trip.conditions, places: trip.places });
  show("s4");
  $("#gName").textContent = trip.place.name;
  buildCats();
  render();
  clearInterval(window._tick);
  window._tick = setInterval(render, 30000);
}

function buildCats() {
  const cats = Array.from(new Set(TRIP.places.map(p => p.cat))).sort();
  $("#cats").innerHTML = ['<button class="chip" data-c="all" aria-pressed="true">Anything</button>']
    .concat(cats.map(c => `<button class="chip" data-c="${c}" aria-pressed="false">${c}</button>`)).join("");
  $$("#cats .chip").forEach(b => b.onclick = () => {
    $$("#cats .chip").forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true"); render();
  });
}

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
  const g = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
  const o = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`;
  return `<div class="card${i === 0 ? " hi" : ""}">
    <h3>${esc(p.name)}${price ? `<span class="money">${price}</span>` : ""}</h3>
    <div>${badge}${p.dur ? `<span class="tag t-info">${dur(p.dur)}</span>` : ""}${p.loose ? '<span class="tag t-unv">pin approx</span>' : ""}${src}</div>
    ${p.why ? `<p class="sub" style="margin:6px 0 0">${esc(p.why).slice(0, 320)}</p>` : ""}
    ${p.warn ? `<p class="tiny" style="color:#ff9aa2;margin:5px 0 0">⚠ ${esc(p.warn)}</p>` : ""}
    ${r.why && r.why.length ? `<div class="why">→ ${esc(r.why[0])}</div>` : ""}
    <div class="btns">
      <a class="btn g" target="_blank" rel="noopener" href="${g}">Walk there</a>
      <a class="btn" target="_blank" rel="noopener" href="${o}">Map</a>
      ${p.website ? `<a class="btn b" target="_blank" rel="noopener" href="${esc(p.website)}">Website</a>` : ""}
    </div></div>`;
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

  const sr = TRIP.conditions.sunrise, ss = TRIP.conditions.sunset;
  $("#sun").textContent = t < sr ? `🌑 sunrise ${HM(sr)}, ${sr - t} min away`
    : t < ss ? `☀️ sunset ${HM(ss)}, ${Math.floor((ss - t) / 60)}h ${(ss - t) % 60}m of light left`
    : `🌙 sun set at ${HM(ss)}`;

  let alerts = "";
  if (ex.msg) alerts += `<div class="card ${ex.level === "soon" ? "cool" : "warn"}"><h3>${ex.level === "soon" ? "Start heading back" : "Time to go"}</h3><p class="sub" style="margin:6px 0 0">${esc(ex.msg)}</p></div>`;
  const cs = closingSoon(t);
  if (cs.length) alerts += `<div class="card warn"><h3>Closing soon</h3>${cs.slice(0, 4).map(x => `<p class="sub" style="margin:4px 0"><b>${esc(x.p.name)}</b> — ${esc(x.st.label)}</p>`).join("")}</div>`;
  $("#alerts").innerHTML = alerts;

  const top = r.list.slice(0, 40);
  $("#list").innerHTML = top.length ? top.map(card).join("")
    : `<div class="empty">Nothing in this filter is open and still fits.</div>`;
  $("#count").textContent = `${r.list.length} of ${TRIP.places.length} places fit right now`;
}

/* ---------- extras ---------- */
function wireGuide() {
  $("#filter").addEventListener("input", render);
  $("#aboutBtn").onclick = () => {
    const t = TRIP;
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
      Search: Nominatim. No AI wrote any of the text about these places — people did.</p>
      <p class="tiny">Nothing here is sent anywhere. This trip is stored only on this device and disappears if you clear your browser data.</p>`;
    $("#about").showModal();
  };
  $("#closeAbout").onclick = () => $("#about").close();
  $("#newBtn").onclick = () => { show("s1"); $("#q").value = ""; $("#hits").innerHTML = ""; $("#q").focus(); };
}

/* ---------- boot ---------- */
window.addEventListener("DOMContentLoaded", () => {
  wireSearch(); wireTimes(); wireGuide();
  const saved = load();
  if (saved && saved.v === 1) {
    $("#resume").style.display = "block";
    $("#resumeName").textContent = saved.place.name;
    $("#resumeBtn").onclick = () => open(saved);
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
});
