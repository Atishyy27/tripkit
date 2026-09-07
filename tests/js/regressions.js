/* Regressions.

   Every test here corresponds to a defect that was actually in the shipped code,
   found by an adversarial review rather than by the suite. Each says what broke,
   because a test whose purpose is forgotten gets deleted by whoever finds it
   inconvenient. */

describe("regression: the clock past midnight", () => {
  /* schedule() keeps an absolute running clock, so a plan that starts late runs
     past minute 1439. openState() then did its "opens in" arithmetic on a value
     outside a day and returned a NEGATIVE wait. That is nonsense in the interface
     ("opens in -30 minutes") and poison in the scheduler, which added it straight
     to the clock and ran time backwards. */

  const SHAPES = [
    ["00:30", "05:00"],   // opens just after midnight, the case that produced -30
    ["20:00", "03:00"],   // genuinely overnight
    ["00:00", "23:59"],   // effectively always open
    ["09:00", "17:00"],   // ordinary
    ["23:00", "01:00"],   // opens just before midnight
  ];

  it("never reports a negative wait, at any clock value", () => {
    const bad = [];
    for (const [open, close] of SHAPES) {
      const p = { name: "x", open, close };
      for (let t = -300; t < 2880; t += 3) {
        const st = openState(p, t);
        if (st.opensIn !== undefined && st.opensIn < 0)
          bad.push(`${open}-${close} at t=${t}: opensIn ${st.opensIn}`);
        if (st.closesIn !== undefined && st.closesIn < 0)
          bad.push(`${open}-${close} at t=${t}: closesIn ${st.closesIn}`);
      }
    }
    eq(bad.slice(0, 5), [], `${bad.length} negative waits`);
  });

  it("treats a clock past midnight as the same minute of the next day", () => {
    const p = { name: "x", open: "09:00", close: "17:00" };
    for (const t of [720, 720 + 1440, 720 + 2880, 720 - 1440]) {
      eq(openState(p, t).state, openState(p, 720).state,
         `t=${t} should behave exactly like 12:00`);
    }
  });

  it("a plan crossing midnight never runs time backwards", () => {
    init({ config: { arrive: M("22:00"), depart: M("23:59"), multiDay: true, tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: [] });
    const P = [
      { name: "Late bar", lat: 26.489, lng: 74.553, dur: 150, open: "20:00", close: "03:00" },
      { name: "Early bakery", lat: 26.487, lng: 74.551, dur: 45, open: "00:30", close: "05:00" },
      { name: "All night diner", lat: 26.488, lng: 74.552, dur: 60, open: "00:00", close: "23:59" },
    ];
    const s = schedule(P, M("23:00"));
    s.rows.forEach((r, i) => {
      ok(r.leave >= r.arrive, `${r.p.name} leaves before it arrives`);
      ok((r.gap || 0) >= 0, `${r.p.name} has a negative wait of ${r.gap}`);
      if (i > 0) ok(r.arrive >= s.rows[i - 1].leave,
        `${r.p.name} starts before the stop before it finished`);
    });
  });
});

describe("regression: the town filter did nothing", () => {
  /* A multi town trip showed a row of town chips. Tapping one changed the label
     and nothing else, because rankNow() never read opts.town. The interface was
     offering a control the engine did not implement. */

  const P = [
    { name: "A", town: "pushkar", cat: "view", open: "00:00", close: "23:59", dur: 20, why: "x", lat: 26.4, lng: 74.5 },
    { name: "B", town: "pushkar", cat: "view", open: "00:00", close: "23:59", dur: 20, why: "x", lat: 26.4, lng: 74.5 },
    { name: "C", town: "ajmer", cat: "view", open: "00:00", close: "23:59", dur: 20, why: "x", lat: 26.4, lng: 74.6 },
  ];

  it("filters to one town when asked", () => {
    init({ config: { arrive: 0, depart: 1439, multiDay: true, tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: P });
    eq(rankNow(M("12:00"), { town: "pushkar" }).list.map(r => r.p.name), ["A", "B"]);
    eq(rankNow(M("12:00"), { town: "ajmer" }).list.map(r => r.p.name), ["C"]);
  });

  it("returns everything when no town is given", () => {
    init({ config: { arrive: 0, depart: 1439, multiDay: true, tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: P });
    eq(rankNow(M("12:00"), {}).list.length, 3);
  });

  it("combines with the category filter rather than replacing it", () => {
    const mixed = P.concat([{ name: "D", town: "pushkar", cat: "food", open: "00:00",
                              close: "23:59", dur: 20, why: "x", lat: 26.4, lng: 74.5 }]);
    init({ config: { arrive: 0, depart: 1439, multiDay: true, tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: mixed });
    eq(rankNow(M("12:00"), { town: "pushkar", cat: "food" }).list.map(r => r.p.name), ["D"]);
  });
});

describe("regression: a five minute walk announced as a taxi", () => {
  /* Journey rows were inserted whenever two consecutive stops carried different
     town labels. Two places can sit either side of a boundary and be a few minutes
     apart, so the plan invented a vehicle for a stroll. Distance decides now. */

  it("does not invent a journey between adjacent places in different towns", () => {
    init({ config: { arrive: 0, depart: 1439, multiDay: true, tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: [] });
    const s = schedule([
      { name: "Edge of town A", town: "a", lat: 26.4800, lng: 74.5500, dur: 30 },
      { name: "Edge of town B", town: "b", lat: 26.4805, lng: 74.5505, dur: 30 },
    ], M("10:00"));
    eq(s.journeys, 0, "these are a few hundred metres apart");
  });

  it("still inserts one when the towns really are far apart", () => {
    init({ config: { arrive: 0, depart: 1439, multiDay: true, tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: [] });
    const s = schedule([
      { name: "Pushkar thing", town: "pushkar", lat: 26.4869, lng: 74.5511, dur: 30 },
      { name: "Ajmer thing", town: "ajmer", lat: 26.4562, lng: 74.6280, dur: 30 },
    ], M("10:00"));
    eq(s.journeys, 1, "15 km is not a walk");
  });

  it("a journey row never breaks the summary", () => {
    /* Every reducer assumed each row carries a place. Journey rows do not, so
       summarising a cross town plan threw on r.p.lo the moment one appeared. */
    init({ config: { arrive: 0, depart: 1439, multiDay: true, tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: [] });
    const s = schedule([
      { name: "A", town: "pushkar", lat: 26.4869, lng: 74.5511, dur: 30, lo: 100 },
      { name: "B", town: "ajmer", lat: 26.4562, lng: 74.6280, dur: 30, lo: 50 },
    ], M("10:00"));
    eq(s.cost, 150, "journey rows must be skipped, not counted as free places");
    ok(typeof s.walking === "number" && s.walking >= 0);
    ok(typeof s.travelling === "number" && s.travelling > 0);
  });
});

describe("regression: schedule invariants, whatever it is given", () => {
  /* A property style sweep rather than named cases. The scheduler is the part most
     likely to produce something that merely looks plausible, so this asserts the
     things that must be true of any day it produces, over many random inputs. */

  function randomPlaces(n, seed) {
    let x = seed;
    const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
    const shapes = [["09:00", "17:00"], ["00:00", "23:59"], ["18:00", "02:00"],
                    ["05:30", "21:00"], [null, null], ["10:00", "16:00"]];
    const out = [];
    for (let i = 0; i < n; i++) {
      const sh = shapes[Math.floor(rnd() * shapes.length)];
      out.push({
        name: "p" + i, id: "p" + i,
        lat: 26.45 + rnd() * 0.06, lng: 74.52 + rnd() * 0.12,
        dur: 15 + Math.floor(rnd() * 90),
        open: sh[0], close: sh[1],
        best: rnd() > 0.5 ? [HM(Math.floor(rnd() * 1440))] : [],
        town: rnd() > 0.8 ? "other" : "main",
        lo: Math.floor(rnd() * 300),
      });
    }
    return out;
  }

  it("never produces overlapping, backwards or negative times", () => {
    init({ config: { arrive: M("08:00"), depart: M("21:00"), hopMinutes: 0,
                     exitBufferMinutes: 45, tzOffsetMinutes: 330 },
           conditions: { sunrise: M("06:12"), sunset: M("18:48") }, places: [] });
    const problems = [];
    for (let seed = 1; seed <= 120; seed++) {
      const picks = randomPlaces(1 + (seed % 7), seed);
      const start = (seed * 37) % 1440;
      let s;
      try { s = schedule(picks, start); }
      catch (e) { problems.push(`seed ${seed} threw: ${e.message}`); continue; }

      s.rows.forEach((r, i) => {
        if (r.leave < r.arrive) problems.push(`seed ${seed}: row ${i} leaves before arriving`);
        if ((r.gap || 0) < 0) problems.push(`seed ${seed}: row ${i} has gap ${r.gap}`);
        if (r.walk < 0) problems.push(`seed ${seed}: row ${i} has walk ${r.walk}`);
        if (i > 0 && r.arrive < s.rows[i - 1].leave)
          problems.push(`seed ${seed}: row ${i} starts before row ${i - 1} ends`);
      });
      if (s.end < s.start) problems.push(`seed ${seed}: the day ends before it starts`);
      if (s.cost < 0) problems.push(`seed ${seed}: negative cost`);
      if (!Number.isFinite(s.end)) problems.push(`seed ${seed}: end is not a number`);
    }
    eq(problems.slice(0, 6), [], `${problems.length} invariant violations across 120 random days`);
  });

  it("keeps a hand made order when asked to", () => {
    init({ config: { arrive: M("08:00"), depart: M("23:00"), tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: [] });
    const picks = randomPlaces(5, 42);
    const s = schedule(picks, M("09:00"), { keepOrder: true });
    eq(s.rows.filter(r => !r.journey).map(r => r.p.name), picks.map(p => p.name),
       "keepOrder must not reorder anything");
  });

  it("an empty plan is an empty plan, not a crash", () => {
    init({ config: { arrive: 0, depart: 1439, tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: [] });
    const s = schedule([], M("09:00"));
    eq(s.rows.length, 0); eq(s.problems, 0); eq(s.cost, 0);
    eq(s.start, s.end, "an empty day takes no time");
  });
});

describe("regression: timezone guessing has no unreachable entries", () => {
  /* The half hour table listed AU and CA and then excluded them again in the
     condition below it, so those entries could never be reached. Dead code that
     looked like coverage. */

  it("every country in the table is actually returned", () => {
    const fs = require("fs"), path = require("path");
    const app = fs.readFileSync(path.join(DOCS_DIR, "app.js"), "utf8");
    const m = app.match(/const HALF = \{([^}]*)\}/);
    ok(m, "the offsets table has moved or been renamed");
    const codes = [...m[1].matchAll(/([A-Z]{2}):/g)].map(x => x[1]);
    ok(codes.length > 0);
    for (const cc of codes) {
      const got = guessTz(0, 0, cc);
      ok(got !== 0, `${cc} is in the table but guessTz returns a longitude guess for it`);
    }
  });
});
