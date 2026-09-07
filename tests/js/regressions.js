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

describe("building a day automatically", () => {
  /* The auto planner is the difference between a list you curate and an itinerary
     creator. It is greedy on purpose: an optimal day is a hard problem and an
     unexplainable answer, and a person has to trust this enough to follow it. */

  function world(n) {
    const cats = [["view", ["17:30"]], ["temple", ["09:00"]], ["food", ["13:00"]],
                  ["cafe", ["10:00"]], ["shop", ["17:00"]], ["museum", ["11:00"]],
                  ["street", ["08:00"]], ["do", ["15:00"]], ["food", ["19:30"]],
                  ["view", ["06:30"]], ["temple", ["10:30"]], ["cafe", ["16:00"]]];
    const P = [];
    for (let i = 0; i < n; i++) {
      const [c, b] = cats[i % cats.length];
      // Tags matter here. Every earlier fixture had none, and an empty array means
      // .filter never runs its callback, which hid a crash for as long as the tests
      // stayed synthetic. Real OpenStreetMap data tags fee=no places "free".
      const TAGS = [["free"], ["outdoor"], ["indoor", "shade"], [], ["free", "photo"], ["evening"]];
      P.push({ id: "p" + i, name: c + " " + i, cat: c, town: "t",
               lat: 26.487 + (i % 5) * 0.002, lng: 74.551 + (i % 4) * 0.002,
               dur: c === "food" ? 60 : c === "view" ? 45 : 30,
               tags: TAGS[i % TAGS.length],
               best: b, open: "07:00", close: "22:00", why: "a real place", lo: i * 10 });
    }
    init({ config: { arrive: M("09:00"), depart: M("21:00"), hopMinutes: 0,
                     exitBufferMinutes: 45, tzOffsetMinutes: 330 },
           conditions: { sunrise: M("06:12"), sunset: M("18:48") }, places: P });
    return P;
  }

  it("produces a day with no scheduling problems in it", () => {
    world(24);
    for (const pace of ["easy", "steady", "packed"]) {
      const a = autoPlan({ start: M("09:00"), end: M("20:00"), pace });
      ok(a.picks.length > 0, `${pace} produced nothing`);
      const s = schedule(a.picks, M("09:00"));
      eq(s.problems, 0, `${pace} produced ${s.problems} problems`);
    }
  });

  it("does not give you four temples in a row", () => {
    world(24);
    const a = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "steady" });
    const counts = {};
    a.picks.forEach(p => counts[p.cat] = (counts[p.cat] || 0) + 1);
    const worst = Math.max(...Object.values(counts));
    ok(worst <= Math.ceil(a.picks.length / 2),
       `one category took ${worst} of ${a.picks.length} stops: ${JSON.stringify(counts)}`);
    ok(Object.keys(counts).length >= 3, `only ${Object.keys(counts).length} kinds of thing`);
  });

  it("puts a meal at a meal time, not at four in the afternoon", () => {
    world(24);
    const a = autoPlan({ start: M("09:00"), end: M("21:00"), pace: "steady" });
    const s = schedule(a.picks, M("09:00"));
    const meals = s.rows.filter(r => !r.journey &&
      ["food", "cafe", "street", "sweet"].includes(r.p.cat));
    ok(meals.length > 0, "a twelve hour day with no meal in it");
    const lunch = meals.some(r => r.arrive >= M("11:30") && r.arrive <= M("15:00"));
    ok(lunch, `nothing to eat at lunchtime: ${meals.map(r => HM(r.arrive)).join(", ")}`);
  });

  it("packed gives you more than easy", () => {
    world(24);
    const easy = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "easy" }).picks.length;
    const packed = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "packed" }).picks.length;
    ok(packed >= easy, `packed ${packed} should not be fewer than easy ${easy}`);
  });

  it("never picks the same place twice", () => {
    world(24);
    const a = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "packed" });
    eq(a.picks.length, new Set(a.picks.map(p => p.id)).size);
  });

  it("never offers somewhere to sleep or a bus stop as a thing to do", () => {
    const P = world(12);
    P.push({ id: "h1", name: "A hotel", cat: "stay", town: "t", lat: 26.487, lng: 74.551,
             dur: 30, open: "00:00", close: "23:59" });
    P.push({ id: "b1", name: "A bus stop", cat: "move", town: "t", lat: 26.487, lng: 74.551,
             dur: 5, open: "00:00", close: "23:59" });
    init({ config: { arrive: M("09:00"), depart: M("21:00"), tzOffsetMinutes: 330 },
           conditions: { sunrise: M("06:12"), sunset: M("18:48") }, places: P });
    const a = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "packed" });
    eq(a.picks.filter(p => ["stay", "move", "practical", "hub"].includes(p.cat)), []);
  });

  it("returns empty and says why, rather than inventing a day", () => {
    init({ config: { arrive: M("09:00"), depart: M("21:00"), tzOffsetMinutes: 330 },
           conditions: { sunrise: M("06:12"), sunset: M("18:48") },
           places: [{ id: "x", name: "shut all day", cat: "view", town: "t",
                      lat: 26.487, lng: 74.551, dur: 30, open: "23:00", close: "23:30" }] });
    const a = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "steady" });
    eq(a.picks.length, 0);
    ok(a.notes.length > 0, "an empty day must explain itself");
  });

  it("terminates on a large dataset rather than looping", () => {
    world(600);
    const t0 = Date.now();
    const a = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "packed" });
    const ms = Date.now() - t0;
    ok(ms < 4000, `took ${ms}ms, which a phone would feel`);
    ok(a.picks.length > 0 && a.picks.length < 40, `returned ${a.picks.length} stops`);
  });

  it("leaves no scratch fields on the places it hands back", () => {
    /* The picker stamps a temporary arrival time on each candidate. Leaving that
       behind would put a stale field into saved trips and into shared links. */
    world(24);
    const a = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "steady" });
    for (const p of a.picks) eq(p._at, undefined, `${p.name} still carries a scratch field`);
  });
});

describe("regression: a missing opening time is not a broken plan", () => {
  /* An automatically built day reported "5 things to look at" and looked faulty.
     All five were "nobody has recorded its hours", which is a gap in OpenStreetMap
     rather than a collision in the plan. Conflating the two made a good day look
     broken and buried the warnings that actually matter. */

  it("counts a place with no hours as unknown, not as a problem", () => {
    init({ config: { arrive: M("09:00"), depart: M("21:00"), tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: [] });
    const s = schedule([
      { name: "Unmapped temple", lat: 26.487, lng: 74.551, dur: 30, open: null, close: null },
      { name: "Known cafe", lat: 26.488, lng: 74.552, dur: 30, open: "08:00", close: "20:00" },
    ], M("10:00"));
    eq(s.problems, 0, "neither of these collides with anything");
    eq(s.unknowns, 1, "one of them has no hours recorded");
    ok(s.rows[0].unknowns.length === 1 || s.rows[1].unknowns.length === 1);
  });

  it("still counts a genuine collision as a problem", () => {
    init({ config: { arrive: M("09:00"), depart: M("21:00"), tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: [] });
    const s = schedule([
      { name: "Shut place", lat: 26.487, lng: 74.551, dur: 30, open: "20:00", close: "22:00" },
    ], M("10:00"));
    ok(s.problems > 0, "arriving while somewhere is shut is a real problem");
  });

  it("a day built automatically from real shaped data reports no problems", () => {
    const P = [];
    const cats = ["view", "temple", "food", "cafe", "shop", "museum"];
    for (let i = 0; i < 30; i++) {
      const c = cats[i % cats.length];
      P.push({ id: "p" + i, name: c + i, cat: c, town: "t",
               lat: 26.487 + (i % 5) * 0.002, lng: 74.551 + (i % 4) * 0.002,
               dur: 30, why: "x",
               // half of them have no hours, which is what a real town looks like
               open: i % 2 ? "08:00" : null, close: i % 2 ? "21:00" : null,
               best: [HM(480 + (i * 37) % 700)] });
    }
    init({ config: { arrive: M("09:00"), depart: M("21:00"), exitBufferMinutes: 45, tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: P });
    const a = autoPlan({ start: M("10:00"), end: M("19:00"), pace: "steady" });
    const s = schedule(a.picks, M("10:00"));
    eq(s.problems, 0, "the builder should not produce a day with collisions in it");
    ok(a.picks.length > 0);
  });
});

describe("more than one day", () => {
  /* A trip is rarely one day. The risk with adding days is losing somebody's
     existing plan to the refactor, so migration is tested first. */

  function stub(nDays) {
    const P = [];
    for (let i = 0; i < 40; i++) {
      const c = ["view", "temple", "food", "cafe", "shop", "museum"][i % 6];
      P.push({ id: "p" + i, name: c + i, cat: c, town: "t",
               lat: 26.487 + (i % 5) * 0.002, lng: 74.551 + (i % 4) * 0.002,
               dur: 30, why: "x", open: "08:00", close: "21:00",
               tags: [["free"], ["outdoor"], ["indoor", "shade"], []][i % 4],
               best: [HM(480 + (i * 41) % 700)] });
    }
    init({ config: { arrive: M("09:00"), depart: M("21:00"), exitBufferMinutes: 45,
                     tzOffsetMinutes: 0 },
           conditions: { sunrise: M("06:00"), sunset: M("18:00") }, places: P });
    return P;
  }

  it("a second day does not repeat the first", () => {
    stub();
    const one = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "steady" });
    const two = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "steady",
                           exclude: new Set(one.picks.map(p => p.id)) });
    ok(two.picks.length > 0, "the second day came out empty");
    const overlap = two.picks.filter(p => one.picks.some(q => q.id === p.id));
    eq(overlap.map(p => p.name), [], "the second day repeats the first");
  });

  it("accepts an array as well as a set, since callers differ", () => {
    stub();
    const one = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "steady" });
    const two = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "steady",
                           exclude: one.picks.map(p => p.id) });
    eq(two.picks.filter(p => one.picks.some(q => q.id === p.id)).length, 0);
  });

  it("excluding everything gives an empty day that explains itself", () => {
    const P = stub();
    const a = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "steady",
                         exclude: new Set(P.map(p => p.id)) });
    eq(a.picks.length, 0);
    ok(a.notes.length > 0);
  });

  it("each day schedules independently and none of them collide", () => {
    stub();
    const days = [];
    const used = new Set();
    for (let d = 0; d < 3; d++) {
      const a = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "steady", exclude: used });
      a.picks.forEach(p => used.add(p.id));
      days.push(a.picks);
    }
    ok(days.every(d => d.length > 0), "one of the three days came out empty");
    days.forEach((picks, i) => {
      const s = schedule(picks, M("09:00"));
      eq(s.problems, 0, `day ${i + 1} has ${s.problems} problems`);
    });
    const all = days.flat().map(p => p.id);
    eq(all.length, new Set(all).size, "a place appears on more than one day");
  });
});


describe("regression: the day builder crashed on any tagged place", () => {
  /* autoPlan called score(place, time, town, phase). score takes three arguments,
     so `phase` was silently receiving a town name. Two consequences, and the quiet
     one was worse:

       the hour based scoring did nothing at all, so a day "built for the clock"
       was ignoring the clock entirely;

       and the moment a candidate carried any tag, phase.tags threw and the button
       hung with no error at all.

     Every test fixture happened to have no tags, and an empty array never runs its
     filter callback, so the suite sailed past it. OpenStreetMap tags every fee=no
     place "free", so this would have hit almost immediately in the wild. */

  const tagged = (id, cat, tags, best) => ({
    id, name: cat + " " + id, cat, town: "t",
    lat: 26.487 + id.length * 0.001, lng: 74.551,
    dur: 30, why: "x", open: "08:00", close: "21:00", best: [best], tags });

  function boot(places) {
    init({ config: { arrive: M("09:00"), depart: M("21:00"), exitBufferMinutes: 45,
                     tzOffsetMinutes: 330 },
           conditions: { sunrise: M("06:12"), sunset: M("18:48"),
                         heatWindow: [M("11:30"), M("15:30")] }, places });
  }

  it("builds a day from places that carry tags", () => {
    boot([tagged("a", "view", ["free"], "17:30"),
          tagged("b", "food", ["indoor", "shade"], "13:00"),
          tagged("c", "temple", ["free", "outdoor"], "09:00"),
          tagged("d", "cafe", [], "10:00"),
          tagged("e", "museum", ["free"], "11:00")]);
    const a = autoPlan({ start: M("09:00"), end: M("20:00"), pace: "steady" });
    ok(a.picks.length >= 3, `only ${a.picks.length} stops from five tagged places`);
  });

  it("scores differently at different hours, which is the whole point", () => {
    boot([]);
    const outdoors = tagged("z", "view", ["outdoor"], "09:00");
    const morning = score(outdoors, M("09:00"), phaseAt(M("09:00")));
    const heat = score(outdoors, M("13:00"), phaseAt(M("13:00")));
    ok(morning.s > heat.s,
       `an exposed viewpoint should score worse in the heat: ${morning.s} vs ${heat.s}`);
  });

  it("survives being called with the wrong arguments rather than throwing", () => {
    boot([]);
    const p = tagged("y", "view", ["outdoor", "free"], "09:00");
    let threw = null;
    try { score(p, M("09:00"), "a town name, which is not a phase"); }
    catch (e) { threw = e.message; }
    eq(threw, null, "a wrong argument should cost accuracy, never the feature");
  });

  it("every tag shape is safe", () => {
    boot([]);
    const p = tagged("x", "view", ["outdoor"], "09:00");
    for (const tags of [[], ["free"], ["a", "b", "c"], undefined, null]) {
      let threw = null;
      try { score(Object.assign({}, p, { tags }), M("12:00"), phaseAt(M("12:00"))); }
      catch (e) { threw = e.message; }
      eq(threw, null, `tags ${JSON.stringify(tags)} threw`);
    }
  });
});

describe("regression: findings from the second review", () => {
  const mk = (id, cat, best, open, close) => ({
    id: "m" + id, name: cat + id, cat, town: "t",
    lat: 26.487 + id * 0.001, lng: 74.551, dur: cat === "food" ? 60 : 30,
    why: "x", open: open || "08:00", close: close || "21:00",
    best: [best], tags: ["free"] });

  function boot(places) {
    init({ config: { arrive: M("08:00"), depart: M("21:00"), exitBufferMinutes: 45,
                     tzOffsetMinutes: 330 },
           conditions: { sunrise: M("06:12"), sunset: M("18:48") }, places });
  }

  it("a cafe is not a meal, so a day of only coffee says so", () => {
    /* EATING lumped cafes in with restaurants, which meant the "nothing to eat"
       warning could never fire and a day whose only food was a coffee looked fed. */
    boot([mk(1, "view", "10:00"), mk(2, "cafe", "11:00"), mk(3, "temple", "09:00"),
          mk(4, "cafe", "14:00"), mk(5, "museum", "15:00")]);
    const a = autoPlan({ start: M("08:00"), end: M("20:00"), pace: "steady" });
    ok(a.notes.some(n => /eat/i.test(n)),
       `a day with no meal in it should say so, got: ${JSON.stringify(a.notes)}`);
  });

  it("and a town with real food gets lunch at lunchtime and no warning", () => {
    boot([mk(1, "view", "10:00"), mk(2, "cafe", "11:00"), mk(3, "temple", "09:00"),
          mk(6, "food", "13:00"), mk(7, "food", "19:30"), mk(5, "museum", "15:00")]);
    const a = autoPlan({ start: M("08:00"), end: M("20:00"), pace: "steady" });
    eq(a.notes, []);
    const s = schedule(a.picks, M("08:00"));
    ok(s.rows.some(r => !r.journey && ["food", "street"].includes(r.p.cat) &&
                        r.arrive >= M("11:30") && r.arrive <= M("15:00")),
       "no meal landed at lunchtime");
  });

  it("a place with an invented pin is offered as a search, not as directions", () => {
    /* Wikivoyage listings with no coordinates are pinned at the town centre. A
       "walk there" link to a pin we made up sends somebody confidently to the
       wrong doorway. */
    const fs = require("fs"), path = require("path");
    const app = fs.readFileSync(path.join(DOCS_DIR, "app.js"), "utf8");
    ok(/p\.loose\s*\n?\s*\?\s*`https:\/\/www\.google\.com\/maps\/search/.test(app) ||
       /p\.loose[\s\S]{0,120}maps\/search/.test(app),
       "the card still offers directions to a pin that was never recorded");
    ok(/p\.loose \? \[\] : \[`GEO:/.test(app),
       "the calendar still exports GEO coordinates it invented");
  });

  it("the calendar is anchored to the trip's date, not to the day you pressed export", () => {
    const fs = require("fs"), path = require("path");
    const app = fs.readFileSync(path.join(DOCS_DIR, "app.js"), "utf8");
    ok(/GUIDE && GUIDE\.startDate/.test(app),
       "icsTime still starts from today rather than from the trip date");
    ok(/id="planDate"/.test(app), "there is no way to set the trip date");
  });

  it("calendar lines fold on octets, not characters", () => {
    const fs = require("fs"), path = require("path");
    const app = fs.readFileSync(path.join(DOCS_DIR, "app.js"), "utf8");
    ok(/TextEncoder/.test(app),
       "folding still counts characters, so a Devanagari name overruns the spec by 2x");
  });

  it("the active trip is protected before the cache is", () => {
    /* The disposable cache had stronger quota handling than the trip somebody is
       actually on, which is exactly backwards. */
    const fs = require("fs"), path = require("path");
    const app = fs.readFileSync(path.join(DOCS_DIR, "app.js"), "utf8");
    const save = app.slice(app.indexOf("function save(trip)"), app.indexOf("function load()"));
    ok(/removeItem\(CACHE\)/.test(save),
       "a full device should sacrifice the cache to keep the current trip");
    ok(/truncated: true/.test(save),
       "there is no last resort that keeps the plan when nothing else fits");
  });

  it("one photograph is never pinned to several different places", () => {
    const fs = require("fs"), path = require("path");
    const src = fs.readFileSync(path.join(DOCS_DIR, "sources.js"), "utf8");
    const fn = src.slice(src.indexOf("async function attachPhotos"));
    ok(/taken\.has\(/.test(fn) && /taken\.add\(/.test(fn),
       "a street of cafes would all show the same picture, each implying it was theirs");
    ok(/p\.loose && !\(p\.wikidata/.test(fn),
       "a place pinned at the town centre would take a photo of the town centre");
  });
});
