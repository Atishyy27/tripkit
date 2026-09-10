# Data sources for tripkit, can the core dataset be built without an LLM?

Research pass, 2026-09-06. Every number below was measured live against the actual
API/endpoint on this date (taginfo API, Overpass API, PyPI JSON API, GitHub API, or a direct
HTTP fetch), not recalled from training data. Where a claim could not be verified live it is
marked `UNVERIFIED` explicitly rather than stated as fact.

---

## 1. OpenStreetMap + Overpass API

### 1.1 `opening_hours` syntax, what it can actually express

Spec page: https://wiki.openstreetmap.org/wiki/Key:opening_hours, full grammar at
https://wiki.openstreetmap.org/wiki/Key:opening_hours/specification. Live evaluator/tester:
https://openingh.openstreetmap.de/evaluation_tool. Simplified visual editor: YoHours
(https://projets.pavie.info/yohours).

Confirmed expressible (verified from the wiki page content, fetched live):

| Need | Syntax | Example |
|---|---|---|
| Basic weekday range | `Mo-Fr 08:00-17:00` | |
| **Midday closure** | comma-separated intervals | `Mo-Fr 08:00-12:00, 13:00-17:30` |
| Different hours per day group | `;`-separated rules | `Mo-Fr 08:00-17:00; Sa 08:00-12:00` |
| Public holidays | `PH off` or `PH 09:00-12:00` | |
| School holidays | `SH off` | |
| **Sunrise/sunset-relative** | `sunrise`, `sunset`, `dawn`, `dusk`, with offsets | `(sunrise+02:00)-(sunset-02:00)` |
| **Seasonal** | month ranges, even movable-feast dates | `Jun-Aug: Su 10:30-16:00`, `easter-7days - Nov 01: Tu-Sa 10:00-12:00` |
| 24-hour | `24/7` | |
| Open-ended | `Su 10:00+` | |

This is a genuinely rich grammar: it covers every field the tool needs, including the two
hardest cases named in the brief (midday closure, sunset-relative). The gap is never
expressiveness; it's coverage (below).

### 1.2 Other tags that matter (confirmed to exist and be in active use)

`tourism=*` (museum, attraction, viewpoint, zoo, gallery, artwork, hotel, information),
`amenity=*` (restaurant, cafe, bank, pharmacy, place_of_worship), `historic=*` (monument,
castle, ruins, memorial), `shop=*`, `fee` (yes/no), `charge` (freeform fee text, used
alongside `fee=yes`), `website`, `phone`, `wheelchair` (yes/no/limited), `name:en`. These are
all real, wiki-documented OSM keys, same tagging system as `opening_hours`.

### 1.3 A real, working Overpass QL query

Tested live against `https://overpass-api.de/api/interpreter`: this exact query returns real
results (used for the Jaipur/Munich counts below):

```
[out:json][timeout:60];
(
  node["tourism"]["opening_hours"](26.80, 75.75, 26.95, 75.87);
  way["tourism"]["opening_hours"](26.80, 75.75, 26.95, 75.87);
  node["historic"]["opening_hours"](26.80, 75.75, 26.95, 75.87);
  way["historic"]["opening_hours"](26.80, 75.75, 26.95, 75.87);
);
out center tags;
```

Swap `out center tags;` for `out count;` to get a total instead of full records (used below to
avoid downloading full geometry while counting). For a point-radius query instead of a bbox,
replace the bbox filters with `(around:2000, 26.9239, 75.8267)`.

### 1.4 Coverage: the honest numbers, and they are the whole finding

**Global, all OSM (taginfo API, `taginfo.openstreetmap.org/api/4/...`, live 2026-09-06):**

- `opening_hours` exists on 4, 798, 291 objects worldwide, of all ~34.7M `amenity=*` objects
  and ~4.07M `tourism=*` objects in the entire planet file.
- Of all objects carrying `opening_hours`, 45.35% are on an `amenity=*` object and 2.2% on a
  `tourism=*` object (`key/combinations` endpoint, `from_fraction`).
- Coverage **within** a tag value (the number that actually matters, "of all restaurants, what
  fraction have hours"), from `tag/combinations`:

| Tag=value | Global count | Have `opening_hours` | Coverage |
|---|---|---|---|
| `shop=supermarket` | 493, 890 | 201, 986 | **40.9%** |
| `amenity=pharmacy` | 439, 941 | 120, 505 (+7, 835 tagged `24/7`) | **27.4%** (+1.8%) |
| `amenity=cafe` | 648, 094 | 163, 412 | **25.2%** |
| `amenity=bank` | 412, 018 | 102, 353 | **24.8%** |
| `amenity=restaurant` | 1, 615, 125 | 374, 441 | **23.2%** |
| `tourism=museum` | 111, 037 | 32, 302 | **29.1%** |
| `tourism=attraction` | 254, 222 | 11, 265 | **4.4%** |

These are **global averages**, dominated by Western Europe's mapping density. They already
say coverage is patchy even at best (roughly 1 in 4 restaurants, 1 in 3 museums, worldwide).

**India vs Germany, measured directly with the Overpass query above (live, 2026-09-06):**

| City / bbox | Category | Total POIs | With `opening_hours` | Coverage |
|---|---|---|---|---|
| Jaipur, India (26.80-26.95N, 75.75-75.87E) | `tourism`+`historic` (all values) | 347 | 17 | **4.9%** |
| Munich, Germany (48.06-48.25N, 11.45-11.72E) | `tourism`+`historic` (all values) | 5, 570 | 291 | **5.2%** |
| Jaipur, India | `amenity=restaurant` | 168 | 15 | **8.9%** |
| Munich, Germany | `amenity=restaurant` | 2, 249 | 1, 924 | **85.5%** |

Two things fall out of this, and both are load-bearing for the decision:

1. The broad `tourism`+`historic` category is a bad proxy in both cities, it's swamped by
   things that structurally never carry hours (`tourism=information` signs, `historic=memorial`
   plaques, `tourism=artwork`), so Jaipur and Munich look deceptively similar (4.9% vs 5.2%).
2. The moment you narrow to a category that actually has real business hours, restaurants: the true gap appears: **Munich is 85.5% covered, Jaipur is 8.9% covered.** That's a
   ~10x gap, measured on the same tag, same category, same day, same tool. This is the single
   most important number in this document: OSM opening_hours for India-scale tourist content is
   not "a bit worse than Europe, " it is close to absent.

**What this means for the tool, plainly, without hedging:** for a European city, OSM alone can
plausibly supply hours for a majority of restaurants and a meaningful minority of sights. For an
Indian town, OSM will supply almost nothing for hours specifically: an LLM (or manual research,
or a scraped source) is still required for that field in the Indian case, which is presumably
the market this tool actually needs to work in first (per the brief's own framing). This should
be treated as a per-market feature flag, not a universal "OSM handles opening hours" assumption.

### 1.5 Overpass usage policy (verified from the OSM wiki, live fetch)

Main public instance `overpass-api.de`: casual/one-off use should stay under **10, 000 queries
and 1 GB/day**; a *regular application* (which this tool is) should target **1/100th of that, roughly 100 queries and 10 MB/day**. Must send a `User-Agent` or `Referer` identifying the app.
No parallel scripts. On HTTP 429/406, back off 30 seconds before retrying. Commercial or
high-volume use should self-host Overpass or use region extracts from Geofabrik
(https://download.geofabrik.de) rather than hammering the public instance. The wiki also names
two alternative public instances with higher stated capacity (VK Maps, Private.coffee) that ask
for a heads-up on large-scale use.

**Practical implication for tripkit:** a per-place-generation live Overpass call is fine at low
volume; a bulk-generate-every-city-nightly workflow should switch to nightly Geofabrik regional
extracts processed offline, not repeated live queries.

### 1.6 Existing parsers for the `opening_hours` string, confirmed to exist

- **`opening_hours.js`**: the reference implementation. Repo:
  https://github.com/opening-hours/opening_hours.js (confirmed via GitHub API: 256 stars,
  license **LGPL-3.0-only**, npm package name `opening_hours`). This is the library the
  evaluation tool above is built on.
- **Python**: the actively maintained option is **`opening_hours_py`**
  (PyPI: https://pypi.org/project/opening-hours-py/, confirmed via PyPI JSON API: version
  2.1.4, license **MIT OR Apache-2.0**). It's a PyO3 binding over the Rust crate
  `opening-hours-rs` (https://github.com/remi-dupre/opening-hours-rs): a real, evaluator-grade
  implementation (not a toy regex parser), actively released as of this check.
  Two other Python attempts exist but are much thinner: `osm_opening_hours` on PyPI
  (https://github.com/k-nut/osm-opening-hours, unlicensed) and `martinfilliau/osm-opening-hours`
  (17 GitHub stars): the latter is oriented at *contributing* hours back to OSM, not parsing
  for display.

So: parsing is a solved problem once you have the string. The problem is never "can we read
`opening_hours`, " it's "does the record have one at all" (1.4 above).

---

## 2. Wikivoyage

Structured via the **`listing`** wikitext template (confirmed by fetching
https://en.wikivoyage.org/wiki/Wikivoyage:Listings live). Real field set: `name`, `alt`,
`address`, `directions`, `lat`, `long`, `phone`, `tollfree`, `email`, `fax`, `url`, **`hours`**,
`price`, `checkin`/`checkout` (accommodation only), `image`, `content`, `wikidata`,
`wikipedia`, `lastedit`. `hours` and `price` are free text, not the strict OSM grammar, no
machine-checkable syntax, so this is a **display/citation source**, not something you can run
`opening_hours_py` against.

Access: standard MediaWiki API (tested live: `https://en.wikivoyage.org/w/api.php?action=parse
&page=Jaipur&prop=wikitext&section=1&format=json` returns real wikitext, HTTP 200), plus full
XML dumps at https://dumps.wikimedia.org/enwikivoyage/. No existing off-the-shelf "listing
template parser" library was found confirmed to exist and be maintained: this would need to be
a small custom wikitext-template extractor (mwparserfromhell in Python handles the parsing
primitive).

Licence: **CC BY-SA 4.0** (confirmed from the page's own footer), attribution required,
derivatives must stay share-alike: this is a real constraint if any Wikivoyage text is
displayed verbatim rather than only used to seed facts.

Coverage, honestly: not separately measured with a count in this pass (would need a scripted
crawl of many articles), flagging this as **UNVERIFIED at the number level**, but qualitatively
well known and consistent with what a spot-check of the Jaipur article shows: large world
capitals and well-touristed cities have deep `listing`-tagged sections (many `eat`/`sleep`/`see`
entries with hours and price), while small towns frequently have a stub article or no dedicated
`listing` entries at all: the same pattern as OSM's coverage skew, for the same underlying
reason (editor density follows tourist/expat traffic).

---

## 3. Wikidata / Wikipedia

SPARQL endpoint confirmed live and working:
`https://query.wikidata.org/sparql` (tested with a real query, got HTTP 200 and a valid
though empty result set: the endpoint itself is functioning; note it is aggressively rate
limited, a second query in the same minute returned HTTP 429, so production use needs caching
and backoff, not a serial batch of queries).

Relevant properties that exist and are usable for a travel tool: coordinates (`P625`),
heritage/protection status (`P1435`), inception/date built (`P571`), official website
(`P856`), instance-of (`P31`) to classify a place (museum = `Q33506`, etc.), administrative
location (`P131`). Wikidata does **not** carry a structured opening-hours property in general
use: this is not something to rely on for hours; it's a good source for the static facts
(what it is, when it was built, heritage status, official site) that don't change day to day.

---

## 4. Places APIs, free tier, hours coverage, and licence risk

| Provider | Free tier (verified where marked) | Opening hours included? | Redistribution/caching allowed? |
|---|---|---|---|
| **OpenTripMap** | **5, 000 req/day, 10 req/sec, $0/mo** (verified live at dev.opentripmap.org/price), explicitly **non-commercial only** on the free plan | UNVERIFIED, could not confirm the field exists in the `places/xid` response schema in this pass; do not assume it | Verified live (dev.opentripmap.org/product): explicitly **permits** pre-fetch/index/store/cache and modifying data before display |
| **Geoapify Places** | **3, 000 credits/day** (1 credit/request + 1 per 20 results), verified live | UNVERIFIED, not shown in the fetched sample response | Must attribute **OpenStreetMap** (it's an OSM-data wrapper) and, on the free plan, also **Geoapify**, verified live from their terms |
| Foursquare Places, HERE, Google Places | Not checked live this pass (would need account/key-gated docs) | UNVERIFIED | UNVERIFIED, **flag explicitly**: Google Places' terms are well known to forbid caching/storing place data beyond a short TTL and forbid displaying results off a Google base map; this needs a fresh terms read before any redistribution decision, not an assumption either way |

**Important domain-health finding, verified live:** `opentripmap.io`: the domain used in a lot
of older tutorials and blog posts, **no longer belongs to OpenTripMap**. A live HTTP check
(2026-09-06) shows it 302-redirecting to `survey-smiles.com`, a parked/survey-spam domain. The
real, current service lives at **`opentripmap.com`** (site) and **`dev.opentripmap.org`**
(API docs/pricing), confirmed both live and serving real content. Any existing code, doc, or
bookmark pointing at `opentripmap.io` needs to be corrected; it is not merely outdated; it is a
live spam redirect for a domain reused after presumed expiry.

**Net read on this tier of APIs:** these are useful for POI discovery and photos, but none was
confirmed in this pass to reliably carry opening hours, and at least one (OpenTripMap free) is
explicitly non-commercial, and at least one major one (Google) is known to restrict
redistribution. None of these should be assumed as an opening-hours source without a fresh,
field-level check of a real response.

---

## 5. Sunrise/sunset, weather, holidays, no API key needed

- **Open-Meteo**, confirmed live, no key required. Test call:
  `https://api.open-meteo.com/v1/forecast?latitude=26.9&longitude=75.8&daily=sunrise, sunset, temperature_2m_max&timezone=auto`
  returned a real 7-day forecast with sunrise/sunset in local time (`Asia/Kolkata`,
  `+05:30`, e.g. sunrise `2026-09-06T06:08`). Free, no key, generous rate limits for
  non-commercial/low-volume use per their published terms.
- **sunrise-sunset.org API**, confirmed live, no key required:
  `https://api.sunrise-sunset.org/json?lat=26.9&lng=75.8&date=today&formatted=0` returned real
  sunrise/sunset/solar-noon/twilight times in UTC.
- **NOAA solar position equations**, yes, sunrise/sunset can be computed fully offline from
  lat/lng/date with no network call at all, using the standard NOAA/Meeus solar equations
  (fractional year → equation of time + solar declination → hour angle → sunrise/sunset UTC
  offset by longitude). This is a well-known, closed-form calculation (not verified by a fresh
  fetch in this pass since it's pure trigonometry rather than a fact that can go stale, flagging
  as **from prior knowledge, not re-derived here**), worth doing only if you want zero network
  dependency; Open-Meteo already gives the same answer for free with less code to maintain.
- **Nager.Date public holidays**, confirmed live: **does NOT cover India.**
  `https://date.nager.at/api/v3/AvailableCountries` returns 204 countries and `IN` is not among
  them (verified by direct check); `https://date.nager.at/api/v3/publicholidays/2026/IN` and the
  2025 equivalent both return **HTTP 204 No Content**. Nager.Date works fine for the US, EU,
  etc. (US 2026 returned 17 real holidays) but is **not usable for the Indian holiday calendar
  the "PH off" opening_hours logic would need there**. Calendarific
  (https://calendarific.com) is the usual fallback with India coverage, but it is API-key-gated
  with a metered free tier, not checked live in this pass, flagged **UNVERIFIED**.

---

## 6. Transport (GTFS / India)

- **Transitland** (`transit.land`), confirmed live: the REST API (`/api/v2/rest/operators`)
  returns **HTTP 401 Unauthorized** without an API key; it is not a keyless/anonymous source.
  It does maintain a global feed catalog including some Indian operators once you have a (free
  signup) key, not independently re-verified for India coverage specifically in this pass.
- **India-specific**: Delhi's official **Open Transit Data** portal
  (`https://otd.delhi.gov.in`) is confirmed **live** (HTTP 200, real Django-backed site with a
  static-data directory serving a real response) and publishes GTFS for Delhi's bus network.
  Coverage nationally is fragmented and UNVERIFIED beyond this, city transit GTFS in India
  exists per-city (Delhi, and known-but-not-reverified-here feeds for Chennai MTC and a few
  metro operators) rather than as one unified national feed the way many EU countries now
  require by law. Do not assume a bus/GTFS layer is available for an arbitrary Indian town; it
  needs a per-city check, and for most small towns the honest answer is "no open transit data
  exists."

---

## 7. ohsome, OSM's edit history API (added 2026-09-10, unit U12)

Everything in sections 1 to 6 above is a snapshot of OSM right now, from Overpass. Overpass
has no memory: it cannot say whether a town's `opening_hours` coverage is getting better or
worse over time, only what it looks like today. **ohsome** (https://ohsome.org,
`https://api.ohsome.org`) is built on the full OSM edit history and can answer exactly that
question. Confirmed live, no key required (2026-09-10):

- Endpoint used: `GET /v1/elements/count/ratio`, with `bboxes`, a `time` range
  (`2018-01-01/2026-01-01/P2Y` gives 5 evenly spaced snapshots), and two filters, `filter`
  (the denominator, `amenity=restaurant`) and `filter2` (the numerator,
  `amenity=restaurant and opening_hours=*`). ohsome divides them into a `ratio` field itself,
  per timestamp, from the real historical state of OSM at each snapshot, not a live-only
  count.
- **Latency is real and must never be asked for during a page load.** The five towns this
  ships with each answered in 4.5 to 12 seconds; ohsome's own operators warn much longer waits
  are realistic under load. This is why the trend is a **build-time artifact**:
  `tools/build_coverage_trend.py` runs it once, by hand, and writes
  `docs/data/coverage-trend.json`, which the browser reads as a plain static file. The browser
  never calls ohsome.
- **A real response quirk, caught by testing against a live capture rather than a guessed
  shape:** when the denominator is zero at a snapshot (an empty bbox, or a category that did
  not exist yet), ohsome does not send `-1` or a bare JSON `NaN`, it sends the **JSON string**
  `"NaN"` for `ratio`. A parser that assumes a number and compares it numerically raises a
  `TypeError` in Python the first time it hits a genuinely thin town. `shape_years()` in the
  script checks the type before comparing, and `tests/test_coverage_trend.py` pins this case
  against a fixture captured from a real empty-ocean bbox query.
- **The numbers reproduce the claim this unit exists to demonstrate.** Munich centre
  (`amenity=restaurant`): 58.7% in 2018 to 86.2% in 2026, a real rise. Jaipur (same category,
  same method): 11.5% in 2018 to 8.7% in 2026, a real fall, while the restaurant count mapped
  there roughly tripled (52 to 161). Both are quoted straight from the live JSON this script
  wrote on 2026-09-10, in `docs/data/coverage-trend.json`; neither number was adjusted to fit
  the brief.
- **To add a town:** add one entry to the `TOWNS` list in `tools/build_coverage_trend.py`
  (a `match` key, the plain lowercase town name the browser compares `GUIDE.place.name`
  against; a `label` for the card; and a bbox in `minLon,minLat,maxLon,maxLat` order, ohsome's
  own order), then run `python3 tools/build_coverage_trend.py` and commit the regenerated
  `docs/data/coverage-trend.json`. A town that fails the live call is skipped, not
  fabricated; the towns that did succeed are still written.
- **Politeness and scope:** the script runs sequentially with a short pause between towns, and
  it is explicitly documented as maintainer-run, never wired into CI and never reachable from
  the browser. This mirrors the Overpass usage policy in section 1.5: a shared, free, keyless
  API earns a light touch, not a bulk crawl.

---

## Direct answers

**Could the core dataset be built with NO LLM at all?**
Only for name, coordinates, category, and (with real work) website/phone, genuinely yes, from
OSM (name/coords/category tags), Wikidata (canonical facts, official site), and Wikivoyage
(text description, licensed CC-BY-SA, needs attribution). **Opening hours cannot be**, except in
already-well-mapped Western/urban markets, and even there only for a minority of places (23-41%
by category, worldwide average; 85.5% for Munich restaurants specifically, the best case found).
For an Indian town the measured number is 8.9% for restaurants and it gets worse for less
commercial categories. Price/fee has a real OSM tag (`fee`, `charge`) but coverage was not
separately measured this pass and is very likely worse than opening_hours since it's a less
commonly filled field, flagged as a gap in this research, not asserted either way.

**The honest split, open data vs judgement:**

| Field | Source | Confidence |
|---|---|---|
| Name, coordinates, category | OSM / Wikidata | High, no LLM needed |
| Website, phone | OSM `website`/`phone`, Wikidata `P856` | Moderate, present often enough to be a first-choice source, LLM as fallback only |
| Description (factual) | Wikivoyage / Wikipedia extract, quoted with CC-BY-SA attribution | High for well-covered places, needs LLM/manual fallback for stubs |
| **Opening hours** | OSM `opening_hours` where present; LLM/manual/scrape otherwise | **Low** in India-scale markets: this is the field that actually needs the fallback plan, not a nice-to-have one |
| Price/fee | OSM `fee`/`charge` where present | Unverified coverage this pass, treat as LLM-dependent until measured |
| Judgement fields ("is this overrated, " "how the scam opens, " "best hour to visit") | No open-data source exists for these by definition, these are opinion, not fact | Always LLM or human, and should be labeled as opinion in the UI rather than presented with the same confidence as a sourced fact |

**Single highest-leverage change**, stated plainly: stop asking the LLM for facts that a free
API can supply and verify (name, coordinates, category, website, and hours *where OSM has
them*, check `opening_hours` first, fall back to LLM only when the tag is absent), and
**narrow the LLM's job to exactly the fields that are inherently judgement**, the "why visit, "
"best time, " "how the common scam/overcharge works" style content, plus hours specifically for
the (currently the majority of, in India) places where OSM has nothing. That single reframe
turns the LLM from "the source of every field, including ones it will hallucinate" into "the
source of the fields nothing else can supply, plus a named, honest fallback for the one field
(hours) where open data is real but incomplete." It also gives you a free, mechanical
hallucination check for free: if the LLM states hours for a place that has a real
`opening_hours` tag and the two disagree, that disagreement is itself worth surfacing rather
than silently trusting the LLM.

---

## What was NOT verified in this pass (name the gaps)

- Whether OpenTripMap's or Geoapify's actual JSON response schema includes an hours/opening
  field, checked their marketing/docs pages, not a real authenticated API response.
- Foursquare Places, HERE, and Google Places free-tier limits and redistribution terms, not
  checked live at all (would need key signup); Google's caching restriction is stated here from
  general knowledge, not re-verified against their current ToS this session.
- `fee`/`charge` tag coverage on taginfo, not queried; flagged as a real gap above.
- Wikivoyage coverage as a measured percentage (small Indian town vs European capital), only
  qualitatively described from one spot-check (Jaipur), not counted.
- NOAA solar-position formula was not independently re-derived/tested against a reference this
  session; Open-Meteo's live sunrise/sunset numbers were used as the verified figure instead.
- Calendarific's actual free-tier limit and India coverage, not checked live.
- Transitland's India feed coverage behind its API key, not checked (blocked on the key).
