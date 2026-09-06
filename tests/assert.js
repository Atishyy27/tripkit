let fails = 0;
const ok = (cond, msg) => { if(!cond){ fails++; console.log("   FAIL " + msg); } };

ok(DATA.conditions !== undefined, "DATA.conditions key missing entirely from the build");
const _c = DATA.conditions || {};
console.log("phases derived from sunrise " + (_c.sunrise || HM(SUNRISE) + " (default)") +
            " / sunset " + (_c.sunset || HM(SUNSET) + " (default)") + ":");
PHASES.forEach(p => console.log("   " + HM(p.from) + " - " + HM(p.to) + "  " + p.name));

// phases must tile the day with no gap and no overlap
for(let i = 1; i < PHASES.length; i++)
  ok(PHASES[i].from === PHASES[i-1].to,
     "gap/overlap between " + PHASES[i-1].name + " and " + PHASES[i].name);
ok(PHASES[0].from === 0, "day does not start at 00:00");
ok(PHASES[PHASES.length-1].to === 1440, "day does not end at 24:00");
// every minute must resolve to exactly one phase
for(let t = 0; t < 1440; t += 7) ok(!!phaseAt(t), "no phase at " + HM(t));

if(!TRIP.multiDay)
  console.log("set-off deadline " + HM(TRIP.lastExit) + ", hard deadline " + HM(TRIP.hardExit));

if(DATA.places && DATA.places.length){
  console.log("ranking:");
  ["06:15","09:00","13:00","17:30","18:50"].forEach(hh => {
    const t = M(hh), r = rankNow(t, {}), e = exitState(t);
    console.log("   " + hh + "  " + phaseAt(t).name.padEnd(16) +
      String(r.list.length).padStart(3) + " fit [" + e.level + "]  " +
      r.list.slice(0,3).map(x => x.p.name.slice(0,26)).join(" | "));
  });
  // an open place must never be reported shut, and vice versa
  const t = M("13:00");
  DATA.places.forEach(p => {
    const st = openState(p, t);
    // an overnight venue (close <= open) cannot be checked with a simple range,
    // which is the whole reason openState handles it separately
    if(p.open && p.close && !p.shut && M(p.close) > M(p.open)){
      const inside = M(p.open) <= t && t < M(p.close);
      ok(inside === (st.state !== "shut" && st.state !== "soon"),
         p.name + " openState disagrees with its own hours at 13:00");
    }
  });
}
// A genuinely overnight venue (closes strictly after midnight, e.g. 02:00) must be
// open shortly BEFORE its closing time. Two things are deliberately excluded:
//   close == "00:00"  -> that is midnight as end-of-day, not an overnight venue
//   the exact closing minute -> a place shutting at 01:00 is shut AT 01:00
DATA.places.filter(p => p.open && p.close && M(p.close) > 0 && M(p.close) <= M(p.open))
  .forEach(p => {
    const probe = M(p.close) - 30;
    if(probe < 0) return;
    ok(openState(p, probe).state !== "shut",
       p.name + " (" + p.open + "-" + p.close + ") reports shut at " + HM(probe) +
       ", 30 min before its own closing time");
  });
console.log(fails ? "\n" + fails + " ASSERTION(S) FAILED" : "\nall assertions passed");
if(fails) process.exit(1);
