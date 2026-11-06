# tripkit, product vision and RICE-scored build order

Compiled 2026-11-07. Source: Instinct's Mumbai/Navi-Mumbai product review (6 Nov 2026),
the existing competitive research in `03-product.md`, and a working session on measurement
and priorities. This doc sits above `03-product.md`, whose 5-feature roadmap is now largely
shipped (multi-town, multi-day, share, PDF, .ics). It sets what to build next and why.

## 1. The north star

tripkit is **the travel tool that does not lie to you**: honest, offline, zero running cost,
and sharpened by the clock. It answers "what is open now, what fits before I leave, what is
worth it", and it says "hours unknown" rather than inventing an answer.

The one strategic call: **do not chase the WhatsApp-AI product** that Instinct's review sketches.
That is a different product, it breaks the no-backend and zero-cost identity, and the tools that
own it (m-Indicator for transit, GuideGeek for the AI layer) are already better at it. The review
itself is the argument for staying honest: ChatGPT invented a nonexistent train in a real plan,
and GuideGeek's "98% accurate" is its own self-report. tripkit wins exactly where they fail.

## 2. The moat, stated for defending it

Two sentences, not a slogan: **no invented facts, and nothing to pay for.** "No AI" was never the
principle; it was the cheap way to get both (zero investment, and no model hallucinating a place or
a train). The door stays open to a free, non-fact-touching AI use later without eating those words.

## 3. Product decisions (settled this session)

1. **Flow over spots.** Every place should show what is open within a short walk of it, and a
   place with no onward options is flagged as a dead end before you spend a ride on it. This is the
   flagship, and it is pure client-side logic on data already in hand.
2. **Plan-first, not cart-first.** Hand a built day to the departure time, then let the user trim or
   extend, with an "extend past 8?" prompt when the auto-plan underfills the window. The empty cart
   made people unsure when to stop; a default plan is itself a stopping point.
3. **Breadth by distance-paging.** Show the nearest ring first, load the next ring on demand, so
   "10 to 15" never becomes "10 to 50".
4. **Ask-locals pointers, not a people layer.** Where data is thin, say "ask locals about X" rather
   than building a social graph. Same honesty as "hours unknown".
5. **Subtraction is the differentiator.** The test for every feature: does it make the answer
   narrower and more decisive? If it only adds more pins, it is Google Maps and it is out.
6. **Transit pointers, not timetables.** Upgrade the cross-town journey row to "nearest station A to
   station B, take the local or metro, then last-mile", using the OSM stations already fetched. No
   timetables or fares; that is m-Indicator's job and needs data we do not have.
7. **Measure before building more.** A micro in-app survey and a privacy-safe counter, not PostHog,
   at this stage. See section 7.

## 4. RICE scoring

RICE = (Reach x Impact x Confidence) / Effort (Sean McBride, Intercom). Scales used here:

- Reach: share of trip-sessions a feature touches, 1 to 10. At near-zero users this is an estimate,
  stated as a proxy, not a measurement.
- Impact: 0.25 minimal, 0.5 low, 1 medium, 2 high, 3 massive.
- Confidence: 0.5, 0.8, 1.0.
- Effort: person-days.

### Pre-traffic list (build now)

| Feature | Reach | Impact | Conf | Effort | RICE |
|---|---|---|---|---|---|
| Now as default tab when a plan exists | 7 | 1 | 1.0 | 0.25 | 28.0 |
| Ask-locals pointers | 6 | 1 | 1.0 | 0.5 | 12.0 |
| In-app micro-survey (one question) | 5 | 2 | 0.8 | 1 | 8.0 |
| Flow graph / dead-end flag | 9 | 2 | 0.8 | 2 | 7.2 |
| Transit pointers on the journey row | 4 | 2 | 0.8 | 1.5 | 4.3 |
| Plan-first + distance-paging + extend | 8 | 2 | 0.5 | 4 | 4.0 |
| Local travel map (from the cache) | 3 | 1 | 0.5 | 3 | 0.5 |

### Post-traffic list (do not build yet)

A/B testing, PostHog behavioral analytics, and bounce/drop-off analysis all need traffic to produce
any signal. Their Reach today is near zero, so they cannot be scored honestly yet. **A/B is the
number-one item on this list the moment there is steady traffic**, which reconciles the instinct that
it is a top feature with the fact that it is premature now. Building the harness before there are users
is a telescope before there are stars.

### Reading the scores honestly

RICE ranks the two near-free wins (Now-default, ask-locals) above the flagship, because dividing by a
tiny effort inflates the score. That is RICE's known failure, not a real verdict that a tab default
matters more than the core differentiator. So the flow graph leads on strategy while the sub-day wins
ride alongside it in the same release.

## 5. Build order

1. Flagship: the flow graph / dead-end flag.
2. Bundled sub-day wins in the same release: Now-as-default, ask-locals pointers, the micro-survey.
3. Transit pointers on the journey row.
4. Plan-first plus distance-paging plus the extend prompt (bigger, carries real UX risk, validate
   with users first).
5. Known-gap fixes from the WIP review threaded through: schedule past-midnight (blocks Now's main
   late-evening case), done/skipped expiry, Now tests.

Deferred: local travel map, PostHog, A/B testing, any auth or cross-device sync. The last is where
tripkit would stop being free and offline, so it stays off until there is a reason the identity cannot
meet.

## 6. Flow graph, the first build (spec)

The question it answers: standing at a place, is this a hub with things to do next nearby, or a dead
end you should not spend a ride reaching.

- Engine: a pure function `onwardFlow(place, t)` returning the count and a short list of other places
  that are open (or openable) at time `t` and within a short walk, reusing `walkMinutes`, `openState`
  and the existing ranking. No new data, no network.
- Threshold: a dead end is a place with zero onward options inside roughly 15 walking minutes; a hub
  is three or more. Both numbers live in one place so they are tunable.
- Surfacing: a small tag on the card, extending the existing `t-info` tag pattern rather than new UI,
  so this needs no fresh design pass. "3 open nearby" or "dead end after". In the plan and the Now
  view it warns before a stop that leads nowhere.
- Honesty: a loose pin (no real coordinates) cannot be measured, so it reads "flow unknown", never a
  false dead end.

## 7. Measurement plan (measure like a business)

Defined numbers, each with a denominator, versioned, append-only. Starting set:

- DEF-1 Activation: sessions that build a day / sessions that open a guide.
- DEF-2 Now adoption: sessions that open the Now tab / sessions that have a plan.
- DEF-3 Usefulness: survey "yes" responses / survey responses.
- DEF-4 Return proxy: cache-reuse opens / total opens.

Instrument with the existing cookieless counter plus the one-question survey, both privacy-safe so the
"nothing collected" promise holds. PostHog is deferred because it needs traffic to mean anything and
would force rewriting that promise. The survey works at low N and answers "what is missing", which is
the real pre-fit question; it cannot explain bounces, and that is the one thing analytics is for, later.

## 8. GTM

The launch is already written in `LAUNCH.md` (OSM wiki first, then r/openstreetmap, the OSM forum,
Show HN, and the rest). Do that before any analytics: the first job is users and conversations, and
Reddit doubles as feature discovery. PostHog and A/B are tools for after there is traffic to read.

## 9. The honest counter-case

On his own Mumbai days, the author did not open tripkit; he used ChatGPT, Reddit and m-Indicator. That
is a louder signal than any missing feature. tripkit's values are right, but a web app you have to
remember to open may be the wrong surface for the mid-walk moment. The working position: tripkit owns
pre-trip planning and the offline day-card you carry, where a web app is genuinely right; the Now view
is the on-trip bonus; it does not pretend to be the WhatsApp companion. Which moment it is for is the
question to keep testing, because it drives both the features and any UI work.
