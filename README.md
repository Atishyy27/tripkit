# tripkit

Turn a trip into a website that knows what time it is.

You give it a YAML file: where you are going, when you arrive, when you leave, who is
travelling. It researches the place, then builds a static, mobile-first site whose
defining feature is that **time is the primary axis**. It does not ask what kind of day
you want and hand you an itinerary. It reads the clock and answers a narrower, more
useful question:

> It is 13:40, you are here, you leave at 19:00. What is open, what is worth doing,
> and what no longer fits?

```bash
pip install tripkit
tripkit doctor                       # check credentials
tripkit new Pushkar                  # write a starter spec
tripkit run pushkar.yaml --deploy    # research, build, publish
```

---

## Why this exists

It was extracted from a real one-off. A friend was on an overnight bus to Ajmer, landing
at 06:00 with a 19:00 bus back, one day in Pushkar, and no plan. The site built for that
trip is still live. Generalising it turned up a set of problems that every AI travel tool
has and most of them hide, so those problems are what this README is mostly about.

## What makes it different

**Opening hours are the product.** Most travel guides list places. This one needs to know
whether a place's doors are open at 13:40, so the dataset is built around `open`, `close`,
and a `shut` window for the midday closure that most tourist pages omit and that is very
real in a lot of the world. A place with sourced hours is worth more here than five
without.

**Everything is scored against a deadline.** If a thing takes 110 minutes and you have 45
before you must set off, it is not shown. When nothing fits, the site says *"there is
nothing to do but go"* rather than relaxing the filter to fill the screen. An empty result
that is true beats a full one that is not.

**The day is derived from the sun, not from a clock.** Phases come from the actual sunrise
and sunset for that date and latitude, so "golden morning" means something different in
Lisbon in October than in Rajasthan in September, and the site knows it.

**It renders in destination time.** A traveller often lands with their phone still on the
old timezone. A guide that silently shifts by five hours is worse than one with no clock.

**Nulls stay null.** Every research prompt says the same thing: a fabricated opening hour
sends a real person to a locked door, so `null` is a correct answer and a guess is not.
Where sources disagree, the disagreement is reported rather than averaged. Where a venue
looks closed, it is listed as closed rather than quietly dropped, because dropping it makes
someone walk across town to a shutter.

---

## Install

```bash
pip install tripkit          # from PyPI
# or, from source:
git clone https://github.com/Atishyy27/tripkit && cd tripkit && pip install -e .
```

Python 3.10+. The only hard dependency is `pyyaml`.

## Credentials

tripkit never stores a secret. It resolves one at runtime and forgets it.

**Either** an API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pip install "tripkit[api]"
```

**Or** the Claude Code CLI you may already have, in which case no API key needs to exist:

```bash
npm install -g @anthropic-ai/claude-code
claude          # log in once
```

tripkit shells out to `claude -p` and your existing session does the work. This is the
default for a reason: a tool that never holds a credential cannot lose one, which matters
more than usual for something people will fork and run.

Run `tripkit doctor` to see what it found.

## Search

Research is much better with a real search backend, and it is the difference between a
tool that degrades loudly and one that degrades silently. Any one of these:

```bash
export BRAVE_API_KEY=...      # free tier available
export TAVILY_API_KEY=...
export SERPER_API_KEY=...
export EXA_API_KEY=...
```

With a key set, tripkit runs the searches itself and hands the results to the model as
context, so the model needs no tools at all. Without one, it asks the agent to search for
itself, which is slower and can hit a per-session cap partway through a run. That is not
hypothetical: it is exactly what happened on the first build this was extracted from, and
five of twelve research slices quietly degraded to guessing URLs before anyone noticed.

---

## The spec

```yaml
trip:
  title: "Pushkar in one day"
  traveller: Arya               # optional, goes on the page
  country: India
  places:
    - name: Pushkar
      role: destination
      lat: 26.4869
      lng: 74.5511
    - name: Ajmer
      role: hub                 # where you arrive and leave from
  hub: Ajmer
  arrive: 2026-09-06T06:00
  depart: 2026-09-06T19:00
  hub_to_dest_minutes: 35       # drives the departure countdown
  exit_buffer_minutes: 75       # how early to leave for a calm exit
  timezone: Asia/Kolkata
  tz_offset_minutes: 330        # the site renders in this, not the phone's zone
  currency: INR
  currency_symbol: "₹"
  profile: [solo, female, backpacker]
  languages: [Hindi, Marwari]
  interests: [temples, street food, photography]

research:
  slices: [sights, food, transport, safety, shopping,
           experiences, offbeat, phrases, conditions, help]
  parallel: 10
  model: sonnet

site:
  out: site
  favicon: "🐪"
  repo: youruser/your-repo      # for `tripkit deploy`
```

Multi-day trips work: leave more than ~26 hours between `arrive` and `depart` and the
departure pressure, the countdown and the deadline filtering all switch off.

## Commands

| command | does |
|---|---|
| `tripkit doctor` | check credentials, search backend and tooling |
| `tripkit new <name>` | write a starter spec |
| `tripkit research spec.yaml` | run the research fan-out into `research/*.json` |
| `tripkit build spec.yaml` | merge the research and render the site |
| `tripkit deploy spec.yaml` | push to GitHub Pages |
| `tripkit run spec.yaml` | all three, `--deploy` to publish |

Useful flags: `--only food,transport` to re-run one slice, `--skip-existing` to resume a
run that partly failed, `--search brave` to force a backend, `--auth cli` to force one.

Research output is plain JSON on disk. Edit it by hand and re-run `build` — that is a
supported workflow, not a hack. Anything you drop into `research/` shaped like the schema
gets picked up.

## Research slices

| slice | produces |
|---|---|
| `sights` | temples, monuments, museums, viewpoints, parks |
| `food` | restaurants, cafés, street stalls, sweet shops |
| `shopping` | markets and a what-to-buy guide with price anchors |
| `experiences` | classes, tours, wellness, activities, nightlife |
| `offbeat` | quiet corners, photo spots, walks, local rhythm |
| `transport` | every way in, around and out, with fares marked official/reported/estimate |
| `safety` | scams with their literal opening lines, and local rules |
| `phrases` | lines for specific confrontations, in the local language |
| `conditions` | sunrise, sunset, heat window, festivals on that date |
| `help` | police, medical, women's helplines, ATMs, luggage — verified or explicitly not |

Each is a prompt in `tripkit/slices.py`. Adding one is a dict entry.

---

## The engine

`templates/assets/core.js` is the whole thing, and it is trip-agnostic — every parameter
comes from `DATA.config`, so the same file ships to every site.

Ranking, in order of weight:

- **is this its hour** (+42) — a `best` array on each place, hit within 35 minutes
- **does it suit the light and heat** (+13 per matching tag, +20 for shade during the heat
  window, −24 for an exposed outdoor thing at noon)
- **is it open** (+12 open, −6 closing soon, −9 hours unknown)
- **is it in the right town** (−26 if not, and an outright cut once returning is absurd)
- **does it fit before you must leave** — a hard filter, not a penalty

That first weight is the largest term and it deserves scepticism: `best` hours come from
model judgement, not measurement. If you want the ranking to be more conservative, lower it.

## Honesty features, since they are the point

- Every price and hour carries a `src` URL, or the field is null.
- The UI distinguishes *shut*, *opening soon*, *closing soon*, and *hours never found*.
  The fourth is a real state, shown as such, not hidden.
- Coordinates the model inferred are marked `pin approx` on the card and faded on the map.
- Transport fares are labelled **official**, **reported** or **estimate**.
- Emergency contacts show **verified** or **unverified**, and an unverified entry says what
  to use instead. A wrong number in an emergency is worse than no number.
- Where a build could not source something, the page says so instead of omitting it.

## Deploy

```bash
tripkit deploy spec.yaml --repo youruser/trip-site
```

Needs the `gh` CLI, authenticated. Creates the repo if it does not exist, pushes, enables
Pages, prints the URL. `--private` if you would rather. `--author-name` / `--author-email`
if you have more than one git identity and do not trust your global config, which is a
mistake worth avoiding once.

The output is plain static files. Any host works — Netlify, Cloudflare Pages, S3, a folder.

---

## Development

```bash
pip install -e .
./tests/run.sh "$(cat tests/fixtures/single-day.json)"   # engine assertions
python3 -m tripkit build examples/pushkar-arya.yaml      # render from real research
```

`tests/run.sh` concatenates the shims, the data and the engine exactly the way a browser
loads them, then asserts the invariants: phases tile the whole day with no gap or overlap,
every minute resolves to exactly one phase, and `openState` never contradicts a venue's own
hours, including venues that close after midnight.

## Contributing

Issues and PRs welcome. The one rule that is not negotiable is the one the whole thing
rests on: **never make the tool invent a fact to fill a field.** If a change makes output
look more complete without making it more true, it will not be merged.

## Licence

MIT.
