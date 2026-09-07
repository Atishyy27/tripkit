# Hostile review, tripkit

Read in full: `docs/app.js`, `docs/engine.js`, `docs/sources.js`, `docs/sun.js`, `docs/index.html`,
`tripkit/*.py`, `tests/`. Ranked worst first. Every item has a file, a line, and a concrete
failing input.

**Note on repo state.** The working tree changed twice, live, while this review was running:
`docs/app.js` gained a `safeUrl()` guard against `javascript:` URLs (uncommitted). The findings
below reflect the code as it stands after that change, and item 4 documents what I actually
watched happen, because it's evidence, not a hypothetical.

---

## 1. The scheduler goes negative and confidently lies about 24-hour places (worst)

`docs/engine.js`, `openState()` (65-81) and `schedule()` (216-291).

`schedule()` keeps a running clock `t` that only ever increases and is never wrapped modulo
1440, then hands that raw value straight to `openState(p, t)`, which assumes `t` is a same-day
minute in `[0, 1440)`.

Concrete failing input: build any guide, set arrive late (23:30), pick three stops with modest
walk/stay times so the third stop's arrival lands at absolute minute 1465 (00:25 the next day).
Make that third place 24/7 (`open:"00:00", close:"23:59"`, i.e. any OSM node tagged `24/7`).
`openState(p, 1465)`: `overnight` is false (`c=1439 <= o=0` is false), so
`inside = (1465>=0 && 1465<1439)` is **false**: a place that is *never* shut gets reported
`shut`. Then `opensIn = (1440-1465)+0 = -25`. Back in `schedule()` (255-258):

```
if (shutNow.state === "shut" && shutNow.opensIn && shutNow.opensIn <= 180) {
  ...
  if (t + shutNow.opensIn + remaining <= hardEnd) { gap += shutNow.opensIn; t += shutNow.opensIn; }
}
```

`-25` is truthy and `<= 180`, so the code adds a **negative** 25 minutes to the clock, the
plan's next arrival time moves backward relative to the stop that was just scheduled, and the
UI prints "shut till 00:00" for a place that is open right now. This is exactly the "negative
gap" and "confidently wrong claim" the brief asked me to construct, and it reproduces on any
long single day, not only a multi-day trip.

No test exercises it: `tests/js/spec.js`'s exhaustive per-minute loops (lines ~196, ~242) only
ever iterate `t` from 0 to 1439, by construction excluding the input class that `schedule()`
itself produces. `schedule()`, `orderPlan()` and `fillGap()` have no unit test at all (see #9).

---

## 2. The town filter is a no-op

`docs/app.js` `render()` (~437): `rankNow(t, { cat, q, town: GUIDE.townFilter ... })`.
`docs/engine.js` `rankNow()` (131-142): reads `opts.cat` and `opts.q`. It never reads
`opts.town`.

Concrete failing input: build a guide for Pushkar, tap "+ another town" and add Ajmer, then tap
the "Ajmer" chip in the towns row (`drawTowns()`, app.js ~596-600). The chip highlights and
`render()` runs, but the list still shows every Pushkar place too: the filter does literally
nothing. This is a shipped regression, not a hypothetical: the sibling engine used by the
Python CLI's generated sites, `templates/assets/core.js` `rankNow()` (line 164,
`const town = opts.town || effectiveTown(t)`), implements this correctly. The web engine lost
it. `tests/js/spec.js` never calls `rankNow` with a `town` option, so this shipped invisibly.

---

## 3. Zero HTML escaping anywhere in the CLI-generated sites, real XSS, not theoretical

`templates/assets/core.js` `placeCard()` (203-232) and every page script in `tripkit/render.py`
(`page_shop`, `page_move`, `page_safe`, `page_say`, `page_help`, `page_now`) build `innerHTML`
by directly concatenating `p.name`, `p.why`, `p.warn`, `r.why[0]`, `x.opener`, `x.how`, `x.say`,
`x.addr`, etc. `grep -n "esc" templates/assets/core.js` returns **nothing**, there is no
escaping function in this file at all, unlike `docs/app.js` which has `esc()` and uses it
almost everywhere.

That data comes from OpenStreetMap (`tripkit/osm.py` `to_places()`, tags anyone can edit) and
from LLM research that is explicitly allowed live web access
(`tripkit/llm.py` `_via_cli()`, line ~135: `--allowed-tools WebSearch,WebFetch`). A vandalized
OSM `name`/`description`, or a scam-listing page the research step pulls in, containing
`<img src=x onerror=alert(document.cookie)>` as a `why`/`opener` field becomes live, executing
HTML the moment `tripkit build && tripkit deploy` publishes to GitHub Pages, against every
visitor. Reproduce: put that string in `research/sights.json`'s `why` field, run
`tripkit build examples/pushkar-arya.yaml`, open the generated `see.html`. `test_smoke.py`
checks page sizes, page count, JSON shape, key presence, nothing checks content safety.

---

## 4. The same bug class, live-patched in `docs/app.js` during this review, incompletely at first

Before an uncommitted change landed in the working tree while I was reading this file,
`docs/app.js` put `p.photo`, `p.website`, and Wikimedia Commons URLs straight into `href=`/
`src=` through `esc()` alone. `esc()` neutralizes `<`/`>`/`"` and does nothing about the URL
*scheme*: an OSM `website` tag set to `javascript:...` produced a working, clickable link on
the destination card. A `safeUrl()` allowlist (http/https only) has since been added
(app.js:24-51) plus a new `tests/js/security.js`. I ran it mid-fix and it **failed**:

```
✗ no href or src interpolates a value without checking its scheme
  expected: []
  got: ["app.js:939  href=\"${esc(p.full)}\"","app.js:941  src=\"${esc(p.thumb)}\""]
```: the Commons photo gallery in `drawLocal()` was still unguarded at that point. By the time I
re-ran it, that spot had also been patched and all 92 JS tests passed. I'm recording this
because a reviewer who only reads `docs/app.js` today will conclude the class of bug is fixed;
it is fixed *there*, uncommitted, and only there, #3 above is the same hole, worse (no
escaping at all, not just no scheme check), completely untouched.

---

## 5. Fuzzy name-matching merges unrelated places, attaching the wrong hours/price to the wrong pin

`docs/app.js` `mergePlaces()` / `mergeInto()`, and `tripkit/merge.py` `_match()` (36-47), both
treat two different place names as the same place whenever their normalized keys are >= 9
characters and one is a substring of the other (`k2.includes(k) || k.includes(k2)`,
`MIN_SUBSTR = 9`).

Concrete failing input: OSM has a node "Grand Heritage Hotel" (category `stay`), and Wikivoyage
separately lists "Grand Heritage Hotel Restaurant" (category `food`) at a different address.
Their normalized keys satisfy the substring test, so the restaurant's hours/price/warning text
get written onto the hotel's card (`hit.open = w.open`, `hit.priceNote = w.priceNote`, etc.),
while the "Walk there" link still points at the hotel's real coordinates. The result: a card
titled "Grand Heritage Hotel" confidently shows the restaurant's closing time and price. This
is structural, not a one-off, any temple/market/hotel with a shared name prefix ("Ganesh
Temple" / "Ganesh Temple Market", "St. Mary's Church" / "St. Mary's Church School") trips it,
and it exists twice, independently, in both the JS and Python merge paths.

---

## 6. `guessTz`'s half-hour table is dead code for Australia and Canada

`docs/app.js` `guessTz()` (current lines 52-56):

```js
const HALF = { IN: 330, LK: 330, NP: 345, IR: 210, AF: 270, MM: 390, AU: 570, CA: -210 };
if (HALF[cc] !== undefined && ["IN", "LK", "NP", "IR", "AF", "MM"].includes(cc)) return HALF[cc];
```

`AU` and `CA` are in the data table but not in the guard array, so they can never be returned.
Concrete failing input: search "Adelaide" (real UTC+9:30/+10:30), falls through to
`Math.round(138.6/15)*60 = 540` (UTC+9:00), 30-90 minutes wrong. "St. John's, Newfoundland"
(real UTC-3:30) falls through to `Math.round(-52.7/15)*60 = -240` (UTC-4:00), 30 minutes wrong.
Every sunrise/sunset/heat-window/open-state computation for that guide runs on a clock that's
silently off, with the UI's own "Guessed UTC+9.00" label giving no indication anything is
wrong, precisely the failure mode the surrounding comment (line ~47-51) says this code exists
to avoid.

---

## 7. The build log states the wrong photo-matching radius

`docs/sources.js` enforces 40 m for attaching a "nearby" Commons photo (line 754,
`if (best && bestD < 40)`), with a comment (750-753) explaining it was tightened from 120 m
after it once attached a photo of a monkey to a pizzeria. The user-facing note on line 760 was
never updated: `` `Photos: ${named} matched exactly ..., ${near} from a picture taken within 120 m` ``.
Every guide built today under-promises accuracy it doesn't need to: the code is fine, the
string it prints about itself is stale and wrong.

---

## 8. A five-minute walk between two "towns" gets rewritten as a fake taxi ride

`docs/engine.js` `schedule()` (227-238): the instant two consecutive picks carry different
non-empty `p.town` values, the code treats the hop as a "journey", bus/train/taxi, regardless
of actual distance, with a floor of `Math.max(30, Math.round(raw/4))` minutes. Concrete input:
add a second "town" that's actually 900 m from the first (a common pattern for adjacent
temple towns, e.g. Pushkar/Ajmer's outer edges), `walkMinutes` computes ~12 minutes, well
under the 60-minute same-town cutoff used elsewhere, but because the `sameTown` check only
compares the `town` string (not distance), the plan inserts "Pushkar → Ajmer, about 30 minutes.
Too far to walk, so this is a bus, a train or a taxi" for a stop that's a twelve-minute walk.

---

## 9. Test theatre: the scheduler has no tests, and the tests that exist can't catch this

`grep -n "schedule(" tests/js/spec.js` returns nothing. `schedule()`, `orderPlan()` and
`fillGap()` (`engine.js` 216-311): the single function that produces the literal itinerary a
person follows, have zero unit tests, despite README.md:176-180 claiming "137 Python and 58
JavaScript tests" and crediting `tests/js/` with covering "the ranking engine". The only place
scheduling is touched at all is `tests/browser.js` (~162-201), a live end-to-end run that only
asserts stop times are non-decreasing and that print/share buttons exist, using whatever real
wall-clock time CI happens to run at, which will essentially never cross midnight or land on
a 24-hour place, so it structurally cannot catch #1. Separately, `tests/test_smoke.py::
test_no_place_claims_hours_it_cannot_support` (line 108) only regex-checks the shape
`\d{2}:\d{2}`, `"23:99"` or `"31:61"` both pass: a formatting check wearing a correctness
check's name.

---

## 10. "No AI" is stated before the caveat that makes it false for half the project

`README.md`:12 and the `application/ld+json` block in `docs/index.html`:31 both state flatly
"No install. No account. No API key. No AI" / "No AI in the data path" with zero qualifier. The
CLI half of the same project explicitly runs Claude for research (`README.md`:90-91,
`tripkit/llm.py` throughout), disclosed, but 80 lines later under "For developers". True of the
hosted web app; not true of "tripkit" as the README's own header describes it. Separately, the
opening-hours coverage table (`README.md`:69-74: "Lisbon 811/270, Pushkar 129/9...") is
presented as measured fact with no script or fixture in the repo that reproduces those exact
numbers, `tests/test_live.py` hits live services opt-in only and asserts nothing about these
specific counts, so there's no way to verify them from what's shipped.

---

## What's actually fine

`docs/sun.js`'s NOAA solar math is solid and honestly tested, `tests/js/spec.js` checks it
against an almanac within 4 minutes across four latitudes including a Reykjavik December case.
`docs/app.js`'s `esc()` is correct and used almost everywhere in the web app (the CLI side is
the problem, see #3). Every network call in `sources.js` gets a real timeout
(`withTimeout`/`DEADLINE`, line 14-26), the "hung forever" failure mode the code's own comment
warns about is actually closed off. `capPlaces()`'s per-category floor-and-trim logic (sources.js
132-169) is more careful than it needed to be and I could not construct an input where it drops
a whole category or overshoots the cap.
