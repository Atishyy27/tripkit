/* ============================================================
   Time-driven ranking. Same rules as the CLI engine, but the data
   arrives at runtime instead of being baked in, so everything that
   depends on it is recomputed by init().
   ============================================================ */
let DATA = { places: [], config: {}, conditions: {} };
let BASE_DOW = 0;
// A point-in-time preview (U7) needs weekday-restricted hours to resolve against
// a chosen day rather than the trip's real one, without touching BASE_DOW itself:
// the day builder and every other view still read BASE_DOW for their own
// dayOffset math, and a preview must never bleed into that. null means no
// preview is active, which is the ordinary "now" path and must stay identical
// to the pre-U7 behaviour.
let DOW_OVERRIDE = null;
let CFG = {}, COND = {}, TRIP = {}, PHASES = [], SUNRISE = 390, SUNSET = 1110;

const M  = s => { if (!s) return null; const p = String(s).split(":"); return (+p[0]) * 60 + (+p[1] || 0); };
const HM = n => { n = ((Math.round(n) % 1440) + 1440) % 1440;
  return String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0"); };
const dur = n => n < 60 ? n + " min" : (n % 60 === 0 ? (n / 60) + " hr" : Math.floor(n / 60) + "h " + (n % 60) + "m");

function localMins() {
  const d = new Date(), off = CFG.tzOffsetMinutes || 0;
  const t = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + off * 60000);
  return t.getHours() * 60 + t.getMinutes();
}

/* Which weekday the trip's day zero falls on, Monday 0 to match OpenStreetMap's
   selectors. JavaScript counts Sunday as 0, hence the shift. */
function baseDow() {
  if (CFG.startDate) {
    const d = new Date(CFG.startDate + "T12:00:00Z");
    if (!isNaN(d)) return (d.getUTCDay() + 6) % 7;
  }
  const now = new Date();
  const local = new Date(now.getTime() + now.getTimezoneOffset() * 60000
                         + (CFG.tzOffsetMinutes || 0) * 60000);
  return (local.getDay() + 6) % 7;
}

function init(data) {
  DATA = data;
  CFG  = data.config || {};
  COND = data.conditions || {};
  BASE_DOW = baseDow();
  SUNRISE = COND.sunrise != null ? COND.sunrise : 390;
  SUNSET  = COND.sunset  != null ? COND.sunset  : 1110;
  TRIP = {
    arrive: CFG.arrive != null ? CFG.arrive : 0,
    depart: CFG.depart != null ? CFG.depart : 1439,
    hop:    CFG.hopMinutes || 0,
    buffer: CFG.exitBufferMinutes || 45,
    multiDay: !!CFG.multiDay
  };
  TRIP.lastExit = TRIP.depart - TRIP.buffer;
  TRIP.hardExit = TRIP.depart - TRIP.hop - 10;
  PHASES = buildPhases();
  return DATA;
}

/* Fold segments built in a space that may run past midnight back into [0,1440).
   phaseAt does a plain from/to comparison, so it can never match a negative or a
   past-1440 bound; a phase crossing midnight has to become two. */
function foldPhases(list) {
  const out = [];
  for (const s of list) {
    let from = Math.round(s.from), to = Math.round(s.to);
    if (!(to > from)) continue;
    if (to - from > 1440) to = from + 1440;
    const len = to - from;
    const a = ((from % 1440) + 1440) % 1440, b = a + len;
    if (b <= 1440) out.push(Object.assign({}, s, { from: a, to: b }));
    else {
      out.push(Object.assign({}, s, { from: a, to: 1440 }));
      out.push(Object.assign({}, s, { from: 0, to: b - 1440 }));
    }
  }
  return out;
}

/* The sun never sets. There is no golden hour, no dusk and no dark, so anchoring
   phases to a sunrise that did not happen produces a table that is wrong all day.
   Rank by crowds and opening hours instead, and say why. */
function polarDayPhases() {
  const why = "The sun does not set here today.";
  return foldPhases([
    { id: "smallhours", from: 0, to: 300, name: "Daylight, and nobody about",
      tags: ["quiet", "photo", "outdoor", "walk"],
      line: why + " Full light in the small hours, with almost nothing open. That is the appeal." },
    { id: "morning", from: 300, to: 690, name: "Morning",
      tags: ["outdoor", "quiet", "photo", "walk"],
      line: "Things start opening. " + why + " Pick by opening hours, not by light." },
    { id: "heat", from: 690, to: 960, name: "Middle of the day",
      tags: ["indoor", "shade", "food", "rest"],
      line: "The busiest and warmest stretch, such as warmth goes this far north." },
    { id: "afternoon", from: 960, to: 1200, name: "Afternoon",
      tags: ["outdoor", "shop", "walk", "view"],
      line: "Still broad daylight. Markets and shops are at their best now." },
    { id: "evening", from: 1200, to: 1440, name: "Evening, still bright",
      tags: ["food", "evening", "bar", "view"],
      line: "Kitchens open and the sun stays up. " + why },
  ]);
}

/* The sun never rises. Civil twilight may still happen, and when it does that band
   is the entire day's usable light, which is the one thing worth ranking around. */
function polarNightPhases() {
  const why = "The sun does not rise here today.";
  const fl = COND.firstLight, ll = COND.lastLight;
  const dark = { tags: ["indoor", "food", "bar", "transit"] };
  if (fl == null || ll == null || !(ll > fl)) {
    return [{ id: "night", from: 0, to: 1440, name: "Dark all day", tags: dark.tags,
      line: why + " There is no usable daylight at all, so treat it as an indoors day." }];
  }
  return foldPhases([
    { id: "night", from: 0, to: fl, name: "Dark", tags: dark.tags, line: why },
    { id: "twilight", from: fl, to: ll, name: "Twilight, all the light there is",
      tags: ["outdoor", "photo", "walk", "view"],
      line: why + " This blue band is the whole of today's light, so spend it outside." },
    { id: "late", from: ll, to: 1440, name: "Dark", tags: dark.tags, line: why },
  ]);
}

/* Sunset falls after midnight, so it sorts BEFORE sunrise on the clock and every
   sunset-anchored bound in the ordinary table goes negative. Unwrap the sunset into
   the next day, build there, and fold back. Left unfixed this put Reykjavik in June
   into a single "Dusk, kitchens open" phase from 00:14 to 21:00. */
function longDayPhases() {
  const R = SUNRISE, S2 = SUNSET + 1440;
  const hw = (COND.heatWindow && COND.heatWindow.length === 2) ? COND.heatWindow : null;
  const h0 = hw ? hw[0] : Math.max(R + 300, 690);
  const h1 = hw ? hw[1] : Math.min(S2 - 150, 960);
  const raw = [
    { id: "sunrise", from: R, to: R + 40, name: "Sunrise",
      tags: ["sunrise", "quiet", "photo", "outdoor"],
      line: "It is barely dark before it returns. Soft, empty and cool." },
    { id: "morning", from: R + 40, to: h0, name: "Golden morning",
      tags: ["outdoor", "quiet", "photo", "walk"],
      line: "Cool, well lit, not yet crowded. Spend these hours outside." },
    { id: "heat", from: h0, to: h1, name: "The warm hours",
      tags: ["indoor", "shade", "food", "rest"],
      line: "The brightest and busiest stretch of a very long day." },
    { id: "afternoon", from: h1, to: S2 - 80, name: "Cooling off",
      tags: ["outdoor", "shop", "walk", "view"],
      line: "Hours of light still to come. Markets are better now than at midday." },
    { id: "golden", from: S2 - 80, to: S2 + 10, name: "Golden evening",
      tags: ["view", "sunset", "photo", "outdoor"],
      line: "Second best light of the day, and up here it lasts. Get somewhere with a view." },
    { id: "night", from: S2 + 10, to: R + 1440, name: "The short dark",
      tags: ["indoor", "food", "bar", "transit"],
      line: "A short northern night. Dark late, and light again quickly." },
  ];
  return foldPhases(raw.filter(x => x.to > x.from));
}

function buildPhases() {
  if (COND.polar === "day")   return polarDayPhases();
  if (COND.polar === "night") return polarNightPhases();
  // Both real, but sunset sorts before sunrise: the sun set after midnight.
  if (COND.sunrise != null && COND.sunset != null && SUNSET <= SUNRISE) return longDayPhases();

  const heat = (COND.heatWindow && COND.heatWindow.length === 2)
    ? COND.heatWindow : [Math.max(SUNRISE + 300, 690), Math.min(SUNSET - 150, 960)];
  // from >= 0 is a guard, not decoration: a negative bound is unreachable by
  // phaseAt and silently drops that stretch of the day into whatever matches next.
  const p = [], add = (from, to, id, name, tags, line) => {
    if (to > from && from >= 0 && to <= 1440) p.push({ id, from, to, name, tags, line });
  };
  add(0, Math.max(0, SUNRISE - 70), "night", "Before dawn", ["indoor", "transit"],
      "Dark. A get-somewhere hour, not a look-at-things hour.");
  add(Math.max(0, SUNRISE - 70), SUNRISE - 20, "predawn", "First light", ["quiet", "sunrise", "transit"],
      "The sky is going. Cold light, empty streets, almost nothing open yet.");
  add(SUNRISE - 20, SUNRISE + 40, "sunrise", "Sunrise", ["sunrise", "quiet", "photo", "outdoor"],
      "The best forty minutes of the day. Soft, empty and cool.");
  add(SUNRISE + 40, heat[0], "morning", "Golden morning", ["outdoor", "quiet", "photo", "walk"],
      "Cool, well lit, not yet crowded. Spend these hours outside.");
  add(heat[0], heat[1], "heat", "The hot hours", ["indoor", "shade", "aircon", "food", "rest"],
      "The hottest, brightest, busiest stretch. Eat, sit somewhere shaded, wait it out.");
  add(heat[1], SUNSET - 80, "afternoon", "Cooling off", ["outdoor", "shop", "walk", "view"],
      "It comes back to life. Markets are better now than at midday.");
  add(SUNSET - 80, SUNSET + 10, "golden", "Golden evening", ["view", "sunset", "photo", "outdoor"],
      "Second best light of the day. Get somewhere high or with a view.");
  add(SUNSET + 10, 1260, "dusk", "Dusk", ["food", "evening", "bar", "shop"],
      "Evening proper. Streets light up, kitchens open.");
  add(1260, 1440, "late", "Late", ["food", "indoor", "bar"],
      "Late. Fewer options, better atmosphere in what is left.");
  return p;
}
const phaseAt = t => PHASES.find(p => t >= p.from && t < p.to) || PHASES[PHASES.length - 1];

/* Set or clear the weekday openState resolves openDays against. Pass a
   Monday-0 index to preview that day, or null/undefined to go back to the
   trip's real weekday. The caller (app.js render(), for the point-in-time
   preview) is expected to clear this again in the same synchronous pass that
   set it, the way a lock is released, so it can never leak into a later
   render of the map, the day view, or the day builder. */
function previewDow(dow) {
  DOW_OVERRIDE = (dow == null) ? null : (((dow % 7) + 7) % 7);
}

const DOW_NAME = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/* Turn a run of weekday indices into "Mon to Fri" rather than "Mon, Tue, Wed...". */
function daysLabel(days) {
  if (!days || !days.length) return "";
  if (days.length === 1) return DOW_NAME[days[0]];
  let run = true;
  for (let i = 1; i < days.length; i++) if (days[i] !== days[i - 1] + 1) { run = false; break; }
  return run ? DOW_NAME[days[0]] + " to " + DOW_NAME[days[days.length - 1]]
             : days.map(d => DOW_NAME[d]).join(", ");
}

function openState(p, t) {
  // The day offset has to be read BEFORE the wrap below, because a plan running
  // past midnight is a different weekday and that is exactly when this matters.
  const dayOffset = Math.floor(Math.round(t) / 1440);
  // A plan running past midnight hands this a minute above 1439. Left unwrapped
  // the "opens in" arithmetic goes negative, which reads as nonsense in the
  // interface and, worse, gets added to the scheduler's clock and runs time
  // backwards. Wrap once here rather than at every call site.
  t = ((Math.round(t) % 1440) + 1440) % 1440;
  if (!p.open) return { state: "unknown", label: "hours unknown" };
  // "Mo-Fr 09:00-17:00" used to be flattened to 09:00-17:00 on every day of the
  // week, so a place shut on Sunday was reported open, confidently, which is the
  // single worst thing this app can do.
  if (Array.isArray(p.openDays) && p.openDays.length && p.openDays.length < 7) {
    const base = DOW_OVERRIDE != null ? DOW_OVERRIDE : BASE_DOW;
    const dow = (((base + dayOffset) % 7) + 7) % 7;
    if (!p.openDays.includes(dow))
      return { state: "shut", label: "shut on " + DOW_FULL[dow] + "s, open " + daysLabel(p.openDays) };
  }
  const o = M(p.open), c = M(p.close) || 1440, overnight = c <= o;
  if (p.shut && p.shut.length === 2) {
    const s0 = M(p.shut[0]), s1 = M(p.shut[1]);
    if (s0 != null && s1 != null && t >= s0 && t < s1)
      return { state: "shut", label: "shut till " + p.shut[1], opensIn: s1 - t };
  }
  const inside = overnight ? (t >= o || t < c) : (t >= o && t < c);
  if (!inside) {
    const opensIn = t < o ? o - t : (1440 - t) + o;
    return { state: opensIn <= 75 ? "soon" : "shut", label: "opens " + p.open, opensIn };
  }
  const closesIn = overnight ? (((c + 1440) - t) % 1440) : c - t;
  if (closesIn <= 50) return { state: "closing", label: "closes " + p.close + ", " + closesIn + " min", closesIn };
  return { state: "open", label: "open till " + p.close, closesIn };
}

function exitState(t) {
  if (TRIP.multiDay) return { level: "ok", msg: null };
  const soft = TRIP.lastExit - t, hard = TRIP.hardExit - t, out = TRIP.depart - t;
  if (out <= 0)  return { level: "gone",   msg: "Your departure time has passed." };
  if (hard <= 0) return { level: "now",    msg: "Past the last safe moment to set off. " + out + " minutes left and the journey takes about " + TRIP.hop + "." };
  if (soft <= 0) return { level: "urgent", msg: "Past the comfortable departure. " + hard + " minutes before you have no margin." };
  if (soft <= 45) return { level: "soon",  msg: "Set off in " + soft + " minutes for a calm departure." };
  return { level: "ok", msg: null };
}

function score(p, t, phase) {
  // Defensive because it has already been called wrongly once: an argument slip
  // passed a string here, which disabled the hour based scoring silently and then
  // threw the moment a place carried a tag. Missing context should cost accuracy,
  // never the whole feature.
  if (!phase || !Array.isArray(phase.tags)) phase = phaseAt(t);
  const st = openState(p, t);
  let s = 0; const why = [];
  if (st.state === "shut") return null;
  if (st.state === "soon") s -= 14;
  if (st.state === "unknown") s -= 9;
  if (st.state === "open") s += 12;
  if (st.state === "closing") { s -= 6; why.push("closing in " + st.closesIn + " min"); }

  if (p.best && p.best.length) {
    const d = Math.min.apply(null, p.best.map(b => Math.abs(M(b) - t)));
    if (d <= 35) { s += 42; why.push("this is exactly its hour"); }
    else if (d <= 75) { s += 22; why.push("close to its best time"); }
  }
  const tg = p.tags || [];
  s += tg.filter(x => phase.tags.indexOf(x) >= 0).length * 13;
  const sheltered = tg.indexOf("indoor") >= 0 || tg.indexOf("shade") >= 0;
  if (phase.id === "heat") { if (sheltered) { s += 20; why.push("shade, which is what matters right now"); }
                             else if (tg.indexOf("outdoor") >= 0) s -= 24; }
  if ((phase.id === "night" || phase.id === "predawn") && tg.indexOf("outdoor") >= 0) s -= 20;

  const need = (p.dur || 30) + 15;
  let budget = TRIP.multiDay ? 1440 : (TRIP.hardExit - t);
  if (!TRIP.multiDay && budget <= 0) budget = TRIP.depart - TRIP.hop - 15 - t;
  if (budget < need) return null;
  if (budget < need + 30) { s -= 15; why.push("tight against your departure"); }

  if ((p.lo === 0 || p.lo === null) && (p.hi === 0 || p.hi === null)) s += 6;

  // Open data has no opinion in it. Without that guard an open pharmacy outranks a
  // shut cathedral, which is true and useless.
  if (["practical", "move", "hub", "stay"].indexOf(p.cat) >= 0) s -= 34;
  if (!p.why && !(p.best || []).length) s -= 12; else if (p.why) s += 8;
  if (p.from === "Wikivoyage") s += 10;   // a human chose to write about it

  return { p, s, st, why };
}

function rankNow(t, opts) {
  opts = opts || {};
  const phase = phaseAt(t);
  let out = (DATA.places || []).map(p => score(p, t, phase)).filter(Boolean);
  // This was a no-op. The interface offered a town filter and the engine ignored
  // it, so on a multi town trip the chip changed nothing and looked broken.
  if (opts.town) out = out.filter(r => r.p.town === opts.town);
  if (opts.cat && opts.cat !== "all") out = out.filter(r => r.p.cat === opts.cat);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    out = out.filter(r => (r.p.name + " " + (r.p.why || "")).toLowerCase().indexOf(q) >= 0);
  }
  out.sort((a, b) => b.s - a.s || (a.p.dur || 30) - (b.p.dur || 30));
  return { phase, list: out };
}
const closingSoon = t => (DATA.places || []).map(p => ({ p, st: openState(p, t) }))
  .filter(r => r.st.state === "closing").sort((a, b) => a.st.closesIn - b.st.closesIn);
const openingSoon = t => (DATA.places || []).map(p => ({ p, st: openState(p, t) }))
  .filter(r => r.st.state === "soon").sort((a, b) => a.st.opensIn - b.st.opensIn);

/* Straight-line distance in metres between two {lat, lng} points. Pure and
   shared: walkMinutes() below turns this into a walking time, and the near-me
   sort turns it into a label. Returns null rather than a number for anything
   that is not two real coordinates, so a caller can never mistake "unknown"
   for "zero metres away". */
function haversineMeters(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371000, p = Math.PI / 180;
  const dx = (b.lat - a.lat) * p, dy = (b.lng - a.lng) * p;
  const h = Math.sin(dx / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dy / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const fmtDist = m => m == null ? null : (m < 950 ? Math.round(m) + " m" : (m / 1000).toFixed(1) + " km");

/* Attach a `dist` (metres from ref, or null) to a rankNow-shaped list, without
   touching score or order. A place pinned at the town centre because its real
   coordinate was never recorded (p.loose) gets null here rather than a distance
   that only measures how close it is to itself. */
function withDistance(list, ref) {
  return list.map(r => Object.assign({}, r, {
    dist: r.p.loose ? null : haversineMeters(ref, r.p)
  }));
}

/* Reorder a withDistance()-annotated list nearest first. Rank ("Best now") is
   what decides relevance; this only decides the order within an already
   relevant set, so an open museum still beats a closed shop next door unless
   the caller explicitly asked for Nearest. A place with no distance (null,
   always a loose pin) sinks to the end rather than sorting as "0 m away".
   Array.prototype.sort is stable, so a genuine tie in distance keeps whatever
   order the list arrived in, which is the score order rankNow already applied. */
function sortByDistance(list) {
  return list.slice().sort((a, b) => {
    if (a.dist == null && b.dist == null) return 0;
    if (a.dist == null) return 1;
    if (b.dist == null) return -1;
    return a.dist - b.dist;
  });
}

/* A "guide" is the set of places a human actually wrote a sentence about:
   Wikivoyage text, or (for a bare Overpass pin) an OSM description tag carried
   through as p.why during the merge. Everything else is a live map pin with a
   name and nothing else; real, but not what a guide leads a traveller with. */
function isCurated(p) {
  return p.from === "Wikivoyage" || !!(p.why && String(p.why).trim());
}

/* ============================================================
   Planning.

   Everything above answers "what now". This answers "what today", which is a
   different question: an order, with times attached, that a person can follow.

   The scheduler is deliberately simple and deliberately honest. It will tell you
   a plan does not fit rather than quietly dropping a stop, and it will say when a
   stop lands outside that place's opening hours instead of pretending.
   ============================================================ */

const WALK_METRES_PER_MIN = 75;      // a real walking pace in a strange town, with stops

function walkMinutes(a, b) {
  const m = haversineMeters(a, b);
  if (m == null) return 10;
  // straight line underestimates real streets, so add a third
  return Math.max(3, Math.round((m * 1.35) / WALK_METRES_PER_MIN));
}

/* Order the picks so the day flows.

   Time leads, walking follows. A first attempt used nearest neighbour with a mild
   time nudge and produced a tidy walk that put a sunset viewpoint at one in the
   afternoon, which is precisely the mistake this whole app exists to avoid. So:
   anything with a best hour is placed by that hour, and anything without one is
   slotted wherever it costs the least walking. A slightly longer walk is a much
   smaller loss than arriving somewhere at the wrong time. */
function orderPlan(picks) {
  if (picks.length < 2) return picks.slice();

  const timed = picks.filter(p => p.best && p.best.length)
    .map(p => ({ p, at: M(p.best[0]) }))
    .sort((a, b) => a.at - b.at)
    .map(x => x.p);
  const loose = picks.filter(p => !(p.best && p.best.length));

  if (!timed.length) {
    // nothing has an hour of its own, so just keep the walk short
    const rest = loose.slice(), out = [rest.shift()];
    while (rest.length) {
      let bi = 0, bd = Infinity;
      rest.forEach((p, i) => { const d = walkMinutes(out[out.length - 1], p); if (d < bd) { bd = d; bi = i; } });
      out.push(rest.splice(bi, 1)[0]);
    }
    return out;
  }

  // insert each untimed stop at whichever gap it lengthens the walk least
  const out = timed.slice();
  for (const p of loose) {
    let bestAt = out.length, bestCost = Infinity;
    for (let i = 0; i <= out.length; i++) {
      const before = out[i - 1], after = out[i];
      const cost = (before ? walkMinutes(before, p) : 0)
                 + (after ? walkMinutes(p, after) : 0)
                 - (before && after ? walkMinutes(before, after) : 0);
      if (cost < bestCost) { bestCost = cost; bestAt = i; }
    }
    out.splice(bestAt, 0, p);
  }
  return out;
}

/* Lay the ordered stops onto the clock and report every problem found. */
function schedule(picks, startMins, opts) {
  // Once somebody has dragged their day into the order they want, re-sorting it
  // underneath them is the rudest thing this could do. keepOrder respects that and
  // still reports every collision the new order creates.
  const order = (opts && opts.keepOrder) ? picks.slice() : orderPlan(picks);
  const start = startMins != null ? startMins
    : Math.max(localMins(), TRIP.arrive != null ? TRIP.arrive : 0);
  const hardEnd = TRIP.multiDay ? 22 * 60 : TRIP.hardExit;

  let t = start;
  const rows = [];
  for (let i = 0; i < order.length; i++) {
    const p = order[i];
    const prev = i === 0 ? null : order[i - 1];
    // A plan spanning two towns must not pretend you can walk between them. Anything
    // over an hour on foot is a journey, and it gets its own row rather than being
    // buried inside a walking time nobody would believe.
    // Two places can sit in different towns and still be a short walk apart, at a
    // boundary or where a village adjoins a city. Announcing a taxi for a five
    // minute stroll is a fabricated journey, so distance decides, not the label.
    const sameTown = !prev || !prev.town || !p.town || prev.town === p.town;
    const raw = prev ? walkMinutes(prev, p) : 0;
    const travel = raw <= 25 || (sameTown && raw <= 60);
    const walk = travel ? raw : 0;
    if (prev && !travel) {
      const est = Math.max(30, Math.round(raw / 4));   // a vehicle, roughly
      rows.push({ journey: true, from: prev, to: p, arrive: t, leave: t + est,
                  mins: est, issues: [] });
      t += est;
    }
    t += walk;

    // A person would wait rather than turn up four hours before a sunset viewpoint
    // is worth seeing. Packing stops back to back is what produced exactly that.
    // So hold, if the day still has room for it, and show the gap honestly rather
    // than hiding it inside the previous stop.
    let gap = 0;
    if (p.best && p.best.length) {
      const target = p.best.reduce((a, b) => Math.abs(M(b) - t) < Math.abs(M(a) - t) ? b : a);
      const wait = M(target) - t;
      const remaining = order.slice(i).reduce((a, x) => a + (x.dur || 30) + 8, 0);
      if (wait > 20 && wait < 1440 && t + wait + remaining <= hardEnd) { gap = wait; t += wait; }
    }
    // and never arrive while the place is shut for the middle of the day
    const shutNow = openState(p, t);
    if (shutNow.state === "shut" && shutNow.opensIn > 0 && shutNow.opensIn <= 180) {
      const remaining = order.slice(i).reduce((a, x) => a + (x.dur || 30) + 8, 0);
      if (t + shutNow.opensIn + remaining <= hardEnd) { gap += shutNow.opensIn; t += shutNow.opensIn; }
    }

    const arrive = t;
    const stay = p.dur || 30;
    const leave = arrive + stay;
    const st = openState(p, arrive);
    // A collision is a problem with the plan. A missing opening time is a gap in
    // the map. Counting both as problems made a perfectly good day report five
    // faults and look broken, when the day was fine and OpenStreetMap was thin.
    const issues = [];
    const unknowns = [];
    if (st.state === "shut") issues.push(`shut at ${HM(arrive)}, ${st.label}`);
    if (st.state === "soon") issues.push(`does not open until ${p.open}`);
    if (st.state === "unknown") unknowns.push("nobody has recorded its hours, so this could be shut");
    if (p.close && M(p.close) > M(p.open || "00:00") && leave > M(p.close))
      issues.push(`you would still be there after it closes at ${p.close}`);
    if (leave > hardEnd) issues.push("this runs past when you have to leave");
    if (p.best && p.best.length) {
      const d = Math.min.apply(null, p.best.map(b => Math.abs(M(b) - arrive)));
      if (d > 150) issues.push(`its best hour is ${p.best[0]}, this is well off it`);
    }
    rows.push({ p, walk, gap, arrive, leave, stay, issues, unknowns, state: st.state });
    t = leave;
  }
  return {
    rows, start, end: t,
    journeys: rows.filter(r => r.journey).length,
    overruns: t > hardEnd,
    minutes: t - start,
    // Journey rows carry no place, so every summary has to step over them. Reading
    // r.p.lo across all rows threw the moment a plan crossed a town boundary.
    walking: rows.reduce((a, r) => a + (r.journey ? 0 : r.walk), 0),
    waiting: rows.reduce((a, r) => a + (r.gap || 0), 0),
    travelling: rows.reduce((a, r) => a + (r.journey ? r.mins : 0), 0),
    problems: rows.reduce((a, r) => a + (r.issues || []).length, 0),
    unknowns: rows.reduce((a, r) => a + (r.unknowns || []).length, 0),
    cost: rows.reduce((a, r) => a + (r.journey ? 0 : (r.p.lo || 0)), 0),
  };
}

/* What could fill a gap in the plan: open now, close by, and short enough to fit. */
function fillGap(afterPlace, gapStart, gapMins, exclude) {
  const skip = new Set(exclude || []);
  const pool = (DATA.places || []).filter(p => !skip.has(p.id));
  const out = [];
  for (const p of pool) {
    const walk = walkMinutes(afterPlace, p);
    const need = walk * 2 + (p.dur || 30);
    if (need > gapMins - 5) continue;
    const st = openState(p, gapStart + walk);
    if (st.state === "shut" || st.state === "soon") continue;
    if (["practical", "move", "stay", "hub"].includes(p.cat)) continue;
    let s = (p.why ? 20 : 0) + (st.state === "open" ? 10 : 0) - walk;
    if (p.best && p.best.length)
      s += Math.max(0, 30 - Math.min.apply(null, p.best.map(b => Math.abs(M(b) - gapStart))) / 4);
    out.push({ p, walk, score: s });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

/* ============================================================
   Building a day for someone.

   Picking stops by hand works, and most people will not do it. This walks the
   available window in time order and, at each point, takes the best thing that is
   open, reachable, fits, and does not make the day monotonous.

   Deliberately greedy rather than optimal. An optimal day is a hard problem and
   an unexplainable answer; a greedy one can be read straight down and argued with,
   which matters more when a person has to trust it enough to follow it.
   ============================================================ */

const MEAL_WINDOWS = [
  [M("07:00"), M("10:00"), "breakfast"],
  [M("12:00"), M("15:00"), "lunch"],
  [M("18:30"), M("21:30"), "dinner"],
];
/* A cafe is somewhere to sit, not lunch. Counting one as a meal meant the "no meal
   fitted" warning could never fire, and a day whose only food was a coffee looked
   fed. Meals and snacks are separate now: a meal window wants a meal, and a snack
   is a pleasant thing to find in a gap. */
const MEALS = ["food", "street"];
const SNACKS = ["cafe", "sweet", "bar"];
const EATING = MEALS.concat(SNACKS);

function autoPlan(opts) {
  opts = opts || {};
  // Anything already chosen on another day of the same trip, so a second day is a
  // second day rather than a repeat of the first.
  const skip = opts.exclude instanceof Set ? opts.exclude : new Set(opts.exclude || []);
  const pool = (DATA.places || []).filter(p =>
    !["practical", "move", "stay", "hub"].includes(p.cat) && !skip.has(p.id));
  if (!pool.length) return { picks: [], notes: ["nothing to work with"] };

  const start = opts.start != null ? opts.start
    : Math.max(localMins(), TRIP.arrive != null ? TRIP.arrive : 0);
  const end = opts.end != null ? opts.end
    : (TRIP.multiDay ? M("21:00") : TRIP.hardExit);
  const pace = opts.pace || "steady";                 // easy | steady | packed
  const slack = { easy: 55, steady: 30, packed: 12 }[pace];

  const picks = [];
  const used = new Set();
  const catCount = {};
  const notes = [];
  let t = start;
  let here = null;
  let guard = 0;

  while (t < end && guard++ < 40) {
    const mealNow = MEAL_WINDOWS.find(([a, b]) => t >= a && t <= b);
    const eatenThisWindow = mealNow && picks.some(p =>
      MEALS.includes(p.cat) && p._at >= mealNow[0] && p._at <= mealNow[1]);
    const wantFood = !!mealNow && !eatenThisWindow;

    let best = null, bestScore = -Infinity;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const walk = here ? walkMinutes(here, p) : 0;
      if (walk > 35) continue;                        // do not send anyone across town
      const arrive = t + walk;
      if (arrive >= end) continue;
      const st = openState(p, arrive);
      if (st.state === "shut" || st.state === "soon") continue;
      const leave = arrive + (p.dur || 30);
      if (leave > end) continue;

      const phase = phaseAt(arrive);
      // score takes (place, time, phase). Passing a town here shifted every
      // argument along, so `phase` was silently receiving a string: the hour based
      // scoring did nothing, and the moment a candidate carried any tag at all
      // (OpenStreetMap tags every fee=no place "free") it threw and the day builder
      // hung with no error.
      const s = score(p, arrive, phase);
      if (!s) continue;
      let v = s.s - walk * 1.4;

      // a day of nothing but temples, or nothing but cafes, is a bad day
      const seen = catCount[p.cat] || 0;
      v -= seen * seen * 9;

      // eat at meal times, and do not eat at other times
      if (wantFood) v += MEALS.includes(p.cat) ? 55 : (SNACKS.includes(p.cat) ? 18 : -25);
      else if (MEALS.includes(p.cat)) v -= 30;

      if (v > bestScore) { bestScore = v; best = { p, walk, arrive, leave }; }
    }

    if (!best) break;
    best.p._at = best.arrive;
    picks.push(best.p);
    used.add(best.p.id);
    catCount[best.p.cat] = (catCount[best.p.cat] || 0) + 1;
    here = best.p;
    t = best.leave + slack;
  }

  if (!picks.length) notes.push("nothing was open and close enough to build a day from");
  const meals = picks.filter(p => MEALS.includes(p.cat)).length;
  if (!meals && (end - start) > 300)
    notes.push("nothing to eat fitted into this day. Nowhere serving a meal was open at the right hours, so plan food separately.");
  picks.forEach(p => { delete p._at; });
  return { picks, notes, pace, from: start, to: end };
}
