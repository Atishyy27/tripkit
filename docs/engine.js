/* ============================================================
   Time-driven ranking. Same rules as the CLI engine, but the data
   arrives at runtime instead of being baked in, so everything that
   depends on it is recomputed by init().
   ============================================================ */
let DATA = { places: [], config: {}, conditions: {} };
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

function init(data) {
  DATA = data;
  CFG  = data.config || {};
  COND = data.conditions || {};
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

function buildPhases() {
  const heat = (COND.heatWindow && COND.heatWindow.length === 2)
    ? COND.heatWindow : [Math.max(SUNRISE + 300, 690), Math.min(SUNSET - 150, 960)];
  const p = [], add = (from, to, id, name, tags, line) => { if (to > from) p.push({ id, from, to, name, tags, line }); };
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

function openState(p, t) {
  if (!p.open) return { state: "unknown", label: "hours unknown" };
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
  if (!a || !b || a.lat == null || b.lat == null) return 10;
  const R = 6371000, p = Math.PI / 180;
  const dx = (b.lat - a.lat) * p, dy = (b.lng - a.lng) * p;
  const h = Math.sin(dx / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dy / 2) ** 2;
  const m = 2 * R * Math.asin(Math.sqrt(h));
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
function schedule(picks, startMins) {
  const order = orderPlan(picks);
  const start = startMins != null ? startMins
    : Math.max(localMins(), TRIP.arrive != null ? TRIP.arrive : 0);
  const hardEnd = TRIP.multiDay ? 22 * 60 : TRIP.hardExit;

  let t = start;
  const rows = [];
  for (let i = 0; i < order.length; i++) {
    const p = order[i];
    const walk = i === 0 ? 0 : walkMinutes(order[i - 1], p);
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
      if (wait > 20 && t + wait + remaining <= hardEnd) { gap = wait; t += wait; }
    }
    // and never arrive while the place is shut for the middle of the day
    const shutNow = openState(p, t);
    if (shutNow.state === "shut" && shutNow.opensIn && shutNow.opensIn <= 180) {
      const remaining = order.slice(i).reduce((a, x) => a + (x.dur || 30) + 8, 0);
      if (t + shutNow.opensIn + remaining <= hardEnd) { gap += shutNow.opensIn; t += shutNow.opensIn; }
    }

    const arrive = t;
    const stay = p.dur || 30;
    const leave = arrive + stay;
    const st = openState(p, arrive);
    const issues = [];
    if (st.state === "shut") issues.push(`shut at ${HM(arrive)}, ${st.label}`);
    if (st.state === "soon") issues.push(`does not open until ${p.open}`);
    if (st.state === "unknown") issues.push("nobody has recorded its hours");
    if (p.close && M(p.close) > M(p.open || "00:00") && leave > M(p.close))
      issues.push(`you would still be there after it closes at ${p.close}`);
    if (leave > hardEnd) issues.push("this runs past when you have to leave");
    if (p.best && p.best.length) {
      const d = Math.min.apply(null, p.best.map(b => Math.abs(M(b) - arrive)));
      if (d > 150) issues.push(`its best hour is ${p.best[0]}, this is well off it`);
    }
    rows.push({ p, walk, gap, arrive, leave, stay, issues, state: st.state });
    t = leave;
  }
  return {
    rows, start, end: t,
    overruns: t > hardEnd,
    minutes: t - start,
    walking: rows.reduce((a, r) => a + r.walk, 0),
    waiting: rows.reduce((a, r) => a + (r.gap || 0), 0),
    problems: rows.reduce((a, r) => a + r.issues.length, 0),
    cost: rows.reduce((a, r) => a + (r.p.lo || 0), 0),
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
