# Hostile review 2, tripkit, autoPlan, plan view, multi-town, ICS, print, photos, service worker

Scope per brief: `autoPlan()` in `docs/engine.js`, the plan view/reorder/gap-fill in
`docs/app.js`, multi-town (`addTown`/`mergeInto`/`drawTowns`), the ICS export
(`downloadIcs`/`icsTime`/`icsEscape`), the print stylesheet, the landing page,
`attachPhotos()` in `docs/sources.js`, and the service worker's network-first/reload path.
The seven items in the brief marked already-fixed are not repeated. Ranked worst first.
Every item below was either executed with Node against the real source or traced with exact
line citations against the file as it stands (`docs/engine.js` md5 `1ddec45d`, `docs/app.js`
md5 `6ee2d0f6`, `docs/sources.js` md5 `6af76875`).

---

## 1. autoPlan() throws on every single call. The button is dead. (worst)

`docs/engine.js:394` inside `autoPlan()`:

```
const s = score(p, arrive, p.town, phase);
```

`score(p, t, phase)` takes three parameters (`engine.js:98`). This call passes four
(`p, arrive, p.town, phase`); JavaScript silently drops the extra argument, so inside
`score()`, the parameter named `phase` is bound to `p.town`: a string like `"udaipur"`, or
`undefined` for a place with no town. `score()` then does `phase.tags.indexOf(...)`
(`engine.js:113`), and `"udaipur".tags` is `undefined`, so `.indexOf` throws.

Verified by running it: I wrapped `engine.js`, called `init()` with three ordinary places
(temple, cafe, lake, all with `town:"Udaipur"`) and called `autoPlan({pace:"steady",
start:540})`. Result:

```
CRASHED: Cannot read properties of undefined (reading 'indexOf')
    at score (engine.js:113:11)
    at Object.autoPlan (engine.js:394:17)
```

This throws on the very first place scored, for any dataset, every time. In the browser,
`buildDayFor()` (`docs/app.js:1130-1141`) calls `autoPlan()` inside a bare `setTimeout` with
no `try/catch`. The exception is unhandled: the button's label stays stuck on "Working…",
`btn.disabled` never gets reset because the re-enable line never runs, and nothing appears in
the plan. There is no console visible to a phone user, so this reads as the app simply hanging
forever. "Build me a day": the feature the plan view leads with when your trip is empty
(`docs/app.js` `drawPlan()`, the "Build me a day" card), cannot produce a single result on
the current `docs/engine.js`.

Fix is one line: `score(p, arrive, phase)`.

---

## 2. The calendar export has no concept of a trip date, so it is wrong every time except by accident

`docs/app.js:1053-1063` (`icsTime`) and the whole app: there is no date input anywhere.
`docs/index.html:189-190` only has `type="time"` fields for arrive/leave. `GUIDE.days`
(`docs/app.js` `ensureDays()`) stores `label`, `plan`, `start`, never a calendar date.

`icsTime(mins, dayOffset)` builds "day 1" from `new Date()`: the real-world date at the
moment `downloadIcs()` is clicked, then adds `dayOffset` days for later days in a multi-day
trip. Concrete failing input: plan a 3-day Udaipur trip today for a trip that actually starts
in three weeks (there is no way to tell the app that). Click "add to calendar." Every event
lands on today, tomorrow and the day after, not on the real trip dates. Equally: build the
plan today, come back and re-download the same plan two days later: the exported calendar
now starts two days later than the first export, because each export re-anchors to "now."
The `.ics` file imports cleanly into Google/Apple Calendar with perfectly formed times, it
looks completely right, and is simply on the wrong dates for any trip that isn't happening
literally today.

This is the single most damaging bug for the ICS feature specifically (brief item 2): line
folding and escaping are secondary if the event lands on the wrong day outright.

---

## 3. Wikivoyage-only places get a fabricated pin, and the ICS/scheduler treat it as real

`docs/app.js:496` and `:831` (`mergeInto`, used both for the first town and by `addTown`):

```
if (w.lat == null) { w.lat = PLACE.lat; w.lng = PLACE.lng; w.loose = true; }
```

Any Wikivoyage-listed place that doesn't match an OSM node (very common, Wikivoyage lists
restaurants and shops OSM hasn't mapped) gets `lat/lng` set to the **town's own coordinate**
and `loose:true`. The map view already knows this is fake and excludes it:
`docs/app.js:631`, `const pts = GUIDE.places.filter(p => p.lat && p.lng && !p.loose)`. The
list card shows a "pin approx" badge for it (`app.js:597` area).

Nothing else checks `.loose`. `walkMinutes()` (`engine.js:169`), `orderPlan()`, `schedule()`
and `autoPlan()` all use the raw `lat/lng` as if it were the real location, so a loose
place's walking time to/from every other stop is computed against the town centroid, not
where it actually is. And `downloadIcs()` (`app.js:1103`) emits `GEO:${p.lat};${p.lng}` and a
Google Maps "Map:" deep link (`app.js:1099`) built from the same fake coordinate, with
nothing in the calendar event saying it's approximate. Concrete failing input: add a town
whose Wikivoyage article names a restaurant OSM hasn't geocoded, put it in the plan, export
the calendar, tap "Map" in the event description in Google Calendar on your phone: you are
navigated to the exact center of town, not the restaurant, with no warning at all that this
was a guess.

---

## 4. autoPlan can strand the whole day on one bad early pick, verified, not hypothetical

`docs/engine.js:107-131`: a place with a `best` array is exempt from the "-12, no curation"
penalty regardless of how far the current time is from that best hour. Combined with the
greedy walk in `autoPlan()` (`engine.js:351-420`, `walk > 35` hard cutoff at line ~384), this
produces a real failure mode, which I ran:

4 places: a temple, a market and a lunch spot clustered within ~150m of the 8am start, and a
"Far Shrine" 2.3km away (real walk ≈40 min) whose only distinguishing feature is a `best`
array (`["15:30"]`) nowhere near 8am. At `t=480` the scorer gives Far Shrine **25** points and
the close temple only **13**, purely because Far Shrine has a `best` array at all (exempting
it from the -12 penalty) while the temple doesn't, even though 8am is 7.5 hours from Far
Shrine's stated best hour. `autoPlan` greedily takes Far Shrine first. `here` is now 2.3km
from the temple/market/lunch cluster, all three now exceed the 35-minute walk cutoff forever
(the algorithm never returns to the start), and the loop exits.

Actual output for an 8:00am-9:00pm day (13 hours): **one 15-minute stop**, and the temple,
market and lunch place, all real, all open, all a few hundred metres from where the day
started, never get visited. This is exactly brief item 3's "empty day when a good one was
available," reproduced with real numbers, not a guess about the algorithm.

---

## 5. "No meal fitted" never fires because cafes count as meals

`docs/engine.js:349`: `const EATING = ["food", "cafe", "street", "sweet"];`, and
`engine.js:416-417` only warns `"no meal fitted"` when `meals === 0`, where `meals` counts
anything in `EATING`. Verified: with 3 cafes and one real restaurant too far to reach, I got
picks `[Cafe A, Cafe B, Cafe C]` and `notes: []`, no warning, even though the day contains
three 20-minute pastry stops and not one actual meal. `wantFood` at `engine.js:376` treats
"a cafe is nearby" as satisfying lunch, so the meal-window logic marks lunch "handled" the
moment any cafe is visited, which is brief item 3's "three cafes, nothing to eat," reproduced
directly.

---

## 6. Multi-town trips keep the first town's timezone and sun times for every later town

`docs/app.js:780-810` (`addTown`): after fetching the new town's places, it calls
`init({ config: GUIDE.config, conditions: GUIDE.conditions, places: GUIDE.places })`, the
same `config` and `conditions` object from the *first* town. `tzOffsetMinutes` is set exactly
twice in the whole file (`app.js:287` and one other, both only during the initial single-town
pick flow) and never touched by `addTown`. Same for `conditions.sunrise`/`sunset`
(`app.js:279-280`, set once at initial pick).

Concrete failing input: pick a first town, then add a second town in a genuinely different
timezone (e.g. a Nepal-India border trip, real UTC+5:45 vs UTC+5:30) or just far enough east/
west that sunrise/sunset differ meaningfully. Every open/shut/closing-soon calculation, every
"golden hour"/"heat"/"sunrise" phase tag used by the scorer and by `autoPlan`, for every place
in the second town, is computed against the first town's clock offset and sun times. This is
silent, no error, no note, and it is exactly the "wrong output that looks right" category:
the UI shows a perfectly formatted "closes in 40 min" that is off by however far the two
towns' real clocks or sun times actually differ.

---

## 7. Trip data has weaker quota protection than the disposable cache that backs it up

`docs/app.js:44-46`:

```
function save(trip) {
  try { localStorage.setItem(STORE, JSON.stringify(trip)); } catch (e) { /* quota */ }
  cachePut(trip);
}
```

If `localStorage.setItem` throws `QuotaExceededError`, the entire live trip, plan, manual
order, added towns, everything, silently fails to persist, with zero user-facing indication.
Compare `cachePut()` a few lines below (`app.js:~75-95`), which has real handling: it shrinks
the cache entry-by-entry until a write succeeds, or clears it as a last resort. The important
data (the trip you're actively editing) got the weak path; the disposable convenience cache
(past towns you might revisit) got the careful one. Worse: `cachePut()` stores a **full copy**
of the same trip object inside `tripkit.cache` alongside the raw `tripkit.trip` key, so total
storage pressure from one trip is roughly double what `save()` alone would suggest, and a
multi-town trip (up to 700 places per town, per `capPlaces`) with Wikivoyage-merged
descriptions is a realistic way to hit the ~5MB per-origin ceiling on iOS Safari. Concrete
failing input: add three or four towns to one trip, keep editing the plan; once the quota is
hit, every subsequent click "saves" with no error, and a refresh silently reverts to
whatever last fit.

---

## 8. attachPhotos() can assign the same photo to several different places

`docs/sources.js:743-758`, the nearest-Commons-photo fallback: for each place, it scans the
whole `pool` of nearby Commons photos and keeps whichever is closest under 40m
(`bestD < 40`), but never removes that photo from `pool` once assigned. Concrete failing
input: a dense cluster: a bazaar, an old-town block, with three or four distinct POIs
(a shop, a temple, a cafe) all within 40m of each other and only one Commons photo taken
nearby. All of them get the exact same photo attached. On the card view this reads as "this
shop and this temple are the same building," or a photo of neither, displayed twice with
full confidence and no indication it was shared.

---

## 9. ICS line folding counts JS characters, not the octets RFC 5545 actually requires

`docs/app.js:1112-1118` folds at `l.length <= 74`, `String.length` counts UTF-16 code units,
not bytes. Verified: a realistic 65-character Devanagari place name
(`श्री एकलिंगजी मंदिर, उदयपुर - एक प्राचीन शिव मंदिर परिसर`) produces a `SUMMARY:` line of 65
JS characters and **155 UTF-8 octets**, more than double the spec's 75-octet line limit, and the fold condition (`l.length <= 74`) never triggers because 65 ≤ 74. This is a travel
app built specifically to hold non-English place names; any Hindi, Thai, Arabic, or accented
European name of normal length will produce an unfolded line at 2-4x the RFC limit. Most
consumer parsers (current Google/Apple Calendar) are lenient about this in practice; stricter
CalDAV validators are not required to be, and the code's own comment ("fold at 75 octets,
which the spec requires") states an intent it does not implement.

---

## 10. Printing a multi-day trip silently prints only the currently open day

`docs/style.css:275-295` (`@media print`) forces `#vPlan{display:block!important}`
regardless of which tab was open, reasonable, so printing always shows the plan rather than
whatever tab happened to be active. But `drawPlan()` (`docs/app.js`) only ever renders
`GUIDE.days[GUIDE.day]`, the single currently-selected day, and the day-tab chip bar
(`dayTabs()`) is not in the print stylesheet's hidden list. Concrete failing input: build a
4-day trip, switch to Day 3, print. The printout shows a "Day 1 / Day 2 / Day 3 / Day 4" tab
row (dead on paper) but only Day 3's stops: the other three days of the itinerary are simply
absent from the printed page, with nothing on the page suggesting anything is missing.

---

## What looks fine

- The service worker's network-first strategy (`docs/sw.js:20-30`) is sound and does what its
  comment claims: same-origin requests always try the network first, cache is the offline
  fallback only. The `skip Waiting`/reload dance in `docs/app.js:1466-1483` races
  `postMessage("skipWaiting")` against an immediate `location.reload()` with no
  `controllerchange` wait, which is a real correctness smell, but because every asset is
  network-first anyway, the practical effect of the update most likely happens through the
  network-first fetch regardless of which service worker instance answers the reload, did not
  find a way to make this visibly fail, so it's noted but not ranked.
- The landing page markup and schema.org block read clean; nothing crashed on inspection.

---

## What I did not check

- Did not test on an actual iOS Safari private-window session against the real 5MB quota
  ceiling for item 7: the size math is derived from `capPlaces(...,700)` and typical
  Wikivoyage description lengths, not from an observed `QuotaExceededError` in a real browser.
- Did not attempt to actually import a generated `.ics` file into live Google Calendar or
  Apple Calendar; findings 2, 3 and 9 are derived from reading the generated content and RFC
  5545 against it, not from watching an import fail in a real calendar client.
