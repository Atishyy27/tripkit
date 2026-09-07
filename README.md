# tripkit

**A travel guide that reads the clock.**

### → [Open it](https://atishyy27.github.io/tripkit/)

[![ci](https://github.com/Atishyy27/tripkit/actions/workflows/ci.yml/badge.svg)](https://github.com/Atishyy27/tripkit/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/Atishyy27/tripkit?color=ff8a4c)](https://github.com/Atishyy27/tripkit/releases)
[![licence](https://img.shields.io/badge/licence-MIT-7ee0a8)](LICENSE)
[![data](https://img.shields.io/badge/data-OpenStreetMap%20%2B%20Wikivoyage-8ab8ff)](https://www.openstreetmap.org/copyright)

No install. No account. No API key. No AI.

<sub>To be exact about that last one: **the web app has no AI in it at all**, and every
sentence it shows you was written by a person. This repository also contains a separate
Python CLI, described further down, which does optionally use Claude to research a
destination. They are different programs and only the first one is what the link above
opens.</sub>

Type a town. You get a guide that answers one question a normal guide never does:

> It's 3pm and I leave at 7. What's open, what's worth it, and what no longer fits?

Add it to your home screen and it behaves like an app. It keeps working with no signal.

---

## Why this is different

Most travel guides hand you two hundred things with no sense of time. Half are shut, some
are an hour away, a few take longer than you've got left. You end up reading instead of
going.

tripkit sorts by the clock. It knows what time it is where you are, when the sun rises and
sets there today, when each place opens and closes, and how long you have before you need
to leave. Then it puts the useful thing first.

**Nothing here was written by a model.** Every sentence about a place came from a person:

| what | where it comes from |
|---|---|
| Places, coordinates, opening hours | [OpenStreetMap](https://www.openstreetmap.org/copyright) via Overpass, ODbL |
| Descriptions, prices, safety warnings | [Wikivoyage](https://en.wikivoyage.org), CC BY-SA 4.0 |
| Sunrise, sunset, twilight | NOAA solar equations, computed on your device |
| Place search | Nominatim |

Nothing is sent to us, because there is no us. It all happens in your browser tab, and the
trip is saved on your phone.

## What it does

**Ranks by the hour, not by rating.** A place scores highest when this is genuinely its
hour: a viewpoint at sunset, a shaded restaurant at the hottest part of the day, a market
in the evening when it wakes up.

**Refuses to waste your time.** If something takes 90 minutes and you have 40, it isn't
shown. When nothing fits, it says so plainly instead of padding the screen.

**Derives the day from the sun.** "Golden morning" means something different in Lisbon in
October and Rajasthan in September. It's calculated for your date and coordinates, so it's
right in both.

**Runs on the destination's clock.** You often land with your phone still on the old
timezone. A guide that's silently five hours out is worse than one with no clock at all.

**Says what it doesn't know.** Hours nobody has recorded show as *hours unknown*, not as a
guess. Coordinates that were inferred are marked *pin approx*. Every place links to its
source so you can check.

## The honest limitation

Opening-hours coverage in OpenStreetMap varies enormously, and the guide is only as good as
what's been mapped. Measured with the same query on the same day:

| | places found | with opening hours |
|---|---|---|
| Lisbon | 811 | 270 (33%) |
| Munich restaurants | 2,249 | 1,924 (86%) |
| Pushkar | 129 | 9 (7%) |
| Ajmer | 104 | 3 (3%) |

Dense European cities are well covered. Small Indian towns are not. Wikivoyage fills a
different part of the gap, and where a place is thin the guide shows fewer confident answers
rather than inventing them.

If somewhere you know is missing or wrong, the fix is to
[edit OpenStreetMap](https://www.openstreetmap.org) or
[Wikivoyage](https://en.wikivoyage.org). It's the same data everyone gets, and your fix
helps everyone.

---

## For developers

There's also a Python CLI that builds a bigger, richer, twelve-page site for one specific
trip, optionally using Claude to research the things open data can't hold: whether a place
is overrated, how the local scam opens, which hour is genuinely best.

```bash
pip install tripkit
tripkit doctor              # check credentials and tools
tripkit new Jaipur          # write a starter spec, then edit the dates
tripkit run jaipur.yaml     # openstreetmap + research + build
tripkit run jaipur.yaml --deploy
```

Credentials are resolved at runtime and never stored: `ANTHROPIC_API_KEY` if set, otherwise
your existing Claude Code CLI session. A tool that never holds a secret cannot lose one.

Search is pluggable and optional: set `BRAVE_API_KEY`, `TAVILY_API_KEY`, `SERPER_API_KEY`
or `EXA_API_KEY`. Without one, research still works but is slower and can hit a per-session
cap partway through.

### Commands

| command | does |
|---|---|
| `tripkit doctor` | check credentials, search backend, tooling |
| `tripkit new <name>` | write a starter spec |
| `tripkit osm <spec>` | pull OpenStreetMap places into `research/osm.json` |
| `tripkit research <spec>` | run the research fan-out |
| `tripkit verify <spec>` | cross-check researched hours against OpenStreetMap |
| `tripkit build <spec>` | merge everything and render the site |
| `tripkit deploy <spec>` | push to GitHub Pages |
| `tripkit run <spec>` | all of the above, `--deploy` to publish |

Research output is plain JSON on disk. Editing it by hand and re-running `build` is a
supported workflow, not a hack.

### The spec

```yaml
trip:
  title: "Pushkar in one day"
  country: India
  places:
    - { name: Pushkar, role: destination, lat: 26.4869, lng: 74.5511 }
    - { name: Ajmer,   role: hub,         lat: 26.4562, lng: 74.6280 }
  hub: Ajmer
  arrive: 2026-09-06T06:00
  depart: 2026-09-06T19:00
  hub_to_dest_minutes: 35
  exit_buffer_minutes: 75
  tz_offset_minutes: 330
  currency_symbol: "₹"
  profile: [solo, backpacker]
  languages: [Hindi]

research:
  slices: [sights, food, transport, safety, shopping,
           experiences, offbeat, phrases, conditions, help]
  parallel: 10

site:
  out: site
  repo: youruser/your-trip
```

Leave more than about 26 hours between `arrive` and `depart` and it switches to multi-day
mode: no departure countdown, no deadline filtering.

### How the ranking works

- **Is this its hour** (+42), from a `best` array on each place
- **Does it suit the light and heat** (+13 per matching tag, +20 for shade during the heat, −24 for exposed outdoors at noon)
- **Is it open** (+12 open, −6 closing soon, −9 hours unknown)
- **Was it written about by a person** (+8, and +10 if Wikivoyage)
- **Is it a chore** (−34 for banks, bus stops, pharmacies)
- **Does it fit before you leave**, which is a hard filter rather than a penalty

That first weight is the largest and deserves scepticism: `best` hours are judgement, not
measurement. Lower it if you want the ranking more conservative.

### Development

```bash
pip install -e . pytest
./tests/all.sh                       # everything, one command
git config core.hooksPath .githooks  # blocks pushing as the wrong GitHub account
```

**137 Python and 58 JavaScript tests**, none of which need a network or a model.

| suite | covers |
|---|---|
| `tests/js/` | the ranking engine, the sun maths, the OpenStreetMap and Wikivoyage parsers |
| `tests/test_llm.py` | JSON recovery, including the truncation case that once silently discarded a whole slice |
| `tests/test_merge.py` | normalising and deduplicating, including the bracketed-name traps |
| `tests/test_spec.py` | spec loading, and that every bad input fails with a message rather than a traceback |
| `tests/test_osm.py` | the Overpass query, `opening_hours` parsing, and the cross-check |
| `tests/test_smoke.py` | builds a real site and inspects the output, plus house style |
| `tests/browser.js` | loads the real page in a real browser, searches, builds a guide and uses it |
| `tests/test_live.py` | the real services. Opt in with `TRIPKIT_LIVE=1`, deliberately not in CI |

The browser suite is the one that matters most. The app shipped completely dead twice in a
single day while every asset returned 200, every file parsed, and every other test passed.
Nothing was loading the page assembled, so nothing noticed.

The JS runner concatenates the shipped browser scripts the way a page loads them, so the
tests exercise the real files rather than a copy. Two of those tests exist because the thing
they check has already broken: a regex quantifier that a cosmetic sweep silently widened, and
a truncated array that parsed cleanly into one entry and reported success.

## Prior art

Checked before publishing, written up in [PRIOR-ART.md](PRIOR-ART.md). Plenty of LLM
itinerary generators exist, several with the same shape. None found combine open-data
research, a generated static site, and clock-driven ranking against a departure deadline.
[ITINERA](https://github.com/YihongT/ITINERA) (EMNLP 2024), the most credentialed nearby
academic work, does spatial optimisation and explicitly ignores time.

Two caveats. That scan was fetch-based, with two search engines blocked, so it is "nothing
found" rather than "nothing exists". And [BestTime.app](https://besttime.app) ranks venues by
predicted hourly crowd level, which is a different and arguably better axis. *Open* and *good
hour to go* are not the same question.

The instructive prior art is the dead kind: Triposo shut down in 2023, and the
Wikivoyage-offline-guide lineage went stale around 2016. They died of data going stale, not
of the idea being wrong. Which is the argument for generating a guide per trip instead of
maintaining one forever.

Full data-source research, including live coverage measurements, is in
[DATA-SOURCES.md](DATA-SOURCES.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). One rule is not negotiable, because the whole thing
rests on it: **never make the tool invent a fact to fill a field.** A change that makes
output look more complete without making it more true will not be merged.

## Licence

MIT. See [LICENSE](LICENSE).

Data from OpenStreetMap contributors (ODbL) and Wikivoyage (CC BY-SA 4.0). Those licences
apply to the data, not to this code, and the app credits both in the interface.
