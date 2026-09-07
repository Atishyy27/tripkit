# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-09-07

### Added
- **It builds the day for you.** One tap and it puts a day together: the right
  things at the right hours, a meal when it is a meal time, and enough variety
  that it is not four temples in a row. Three paces, from take-it-easy to
  see-everything. Everything it chooses can then be moved, dropped or added to.

  Deliberately greedy rather than optimal. An optimal day is a hard problem and an
  unexplainable answer, and a person has to trust this enough to actually follow
  it, so it can be read straight down and argued with.

  Nothing is fetched to do it. It works from the places already loaded, which is
  why it is instant and why it works with no signal.

  On real Pushkar data it produces nine stops across six kinds of place, in order,
  with lunch in the middle and no scheduling problems.

### Tests
- Nine tests on the day builder alone, including that it never serves four of one
  thing, always finds a meal at a meal time in a long day, never offers a hotel or
  a bus stop as something to do, terminates on 600 places rather than looping, and
  leaves no scratch fields on the places it hands back.

## [0.5.0] - 2026-09-07

An adversarial review, and everything it found.

### Security
- **An editable data source could inject script through a link.** esc() makes a
  string safe as text and does nothing about a URL scheme, so a place whose
  OpenStreetMap website tag read "javascript:..." produced a working href and ran
  the editor's script on every visitor who tapped it. safeUrl() now refuses
  anything that is not http or https, in both the web app and the CLI engine.
- **The CLI engine escaped nothing at all.** Place names, descriptions and warnings
  from OpenStreetMap, Wikivoyage and the research layer went straight into
  innerHTML. All of it is escaped now, and a test builds a site from a place named
  with a script tag and checks the payload never reaches the markup.

### Fixed
- **The scheduler ran time backwards past midnight.** It keeps an absolute clock,
  so a late plan passes minute 1439, and openState() then did its arithmetic
  outside a day and returned a negative wait. "Opens in -30 minutes" in the
  interface, and a negative added to the clock in the scheduler.
- **The town filter did nothing.** A multi town trip showed town chips and the
  engine never read the filter, so tapping one changed the label and nothing else.
- **A five minute walk was announced as a taxi.** Journeys were inserted whenever
  two stops carried different town labels, so places either side of a boundary got
  an invented vehicle. Distance decides now.
- The timezone table listed two countries and then excluded them again below, so
  those entries could never be reached.
- A message still quoted the old 120 m photo radius after it became 40 m.

### Added
- Choose when the day starts, rather than always laying it out from this minute.
- Move a stop earlier or later. Once a day is arranged by hand the scheduler stops
  re-sorting it, while still reporting every collision the new order creates.
- 41 regression tests, one per defect above, plus a property sweep that generates
  120 random days and asserts none of them overlap, run backwards or go negative.
- 28 security tests covering every dangerous URL scheme, including ones hidden
  behind whitespace, and a static check that no href in the app is built without a
  scheme check.

## [0.4.0] - 2026-09-07

It plans a day now, rather than only describing one.

### Added
- **A plan.** Every place has an add control, and picked places become an ordered
  day with times on it. The scheduler puts time first and walking second, waits
  rather than arriving somewhere hours before it is worth seeing, and names every
  collision it finds instead of quietly resolving it. On six stops that produced
  five problems when packed back to back, it now produces none, with lunch landing
  at exactly 13:00 and the bazaar at exactly 17:00.
- **Gaps suggest what could fill them.** The engine already knows what is open,
  close by and short enough, so a wait offers three or four options rather than
  being dead time.
- **Print, which is the PDF export.** A print stylesheet, no library, no network.
- **Calendar export**, hand written iCalendar with floating local times so a stop
  at 13:00 reads 13:00 whatever your phone thinks the timezone is.
- **More than one town in a trip.** Another town appends its places to the same
  guide rather than introducing a second concept, so the filters, the map and the
  plan all keep working. A plan crossing towns gets a journey row, because one
  that silently teleports you between two cities is worse than no plan.
- **Places to sleep** included in the picture, with star ratings and room counts.
- `llms.txt` and schema.org structured data, so the thing is legible to crawlers
  and retrieval systems rather than only to people who already know it exists.
- A weekly workflow snapshotting GitHub traffic, since the API only keeps 14 days
  and history is the only part worth having.

### Changed
- Photographs on every card, with a tinted category glyph where there is none, so
  a card is never an empty rectangle. Nearby photographs are matched within 40 m
  rather than 120 m, after 120 m attached a picture of a monkey to a pizzeria.
- The search radius is adjustable before a build and appendable afterwards.
- Analytics groundwork, switched off. When it is ever turned on it will be a
  cookieless counter of which screens are opened, never what was typed, and the
  page says so in plain language with a link to the source.

### Fixed
- **Every "walk there" link was broken.** The cosmetic dash sweep had put a space
  inside a coordinate pair, so the destination read "26.48, 74.55" and pointed
  nowhere. Live for a day. A test now rejects a space inside any coordinate.
- The dataset cap deleted every hotel in a large city.
- Summarising a plan crashed the moment it crossed a town boundary, because the
  journey rows carry no place and every reducer assumed one.

## [0.3.1] - 2026-09-07

### Added
- **Places to sleep.** Hotels, hostels, guest houses, apartments and campsites,
  with star ratings and room counts where OpenStreetMap has them. Not scope creep:
  Wikivoyage's sleep listings were already being parsed into this category and then
  discarded, because nothing was asking OpenStreetMap for the matching places.
  Pushkar went from 129 places to 219, Lisbon from 3,195 to 3,667.
- Share cards, so a pasted link previews properly rather than as a bare URL.

### Fixed
- **The cap was deleting every hotel in a large city.** Somewhere to sleep was
  classed as a chore alongside bus stops, which is right for "what should I do
  next" and wrong for "what should exist in the dataset". One number was answering
  two different questions. The cap is now per category with a floor, so no category
  is ever wiped out, and it trims by quality rather than by category order.

## [0.3.0] - 2026-09-07

More data, from more places, and a real answer when one of them is down.

### Added
- **Live weather**, hourly, from Open-Meteo with MET Norway behind it. Current
  conditions, feels-like, the next fourteen hours, rain probability and UV.
- **The heat window is now measured rather than guessed.** It used to be a fixed
  midday assumption. It is now read off today's actual forecast: Pushkar came back
  11:00 to 18:00 and Lisbon 12:00 to 17:00 on the same day. The ranking already
  pushed shade up during it, so this makes an existing behaviour correct rather
  than plausible.
- **Air quality** from Open-Meteo, with a plain sentence about whether it is worth
  planning around instead of a bare number.
- **Photos** of the area from Wikimedia Commons, credited and licensed.
- **Getting around**, every station, stop, taxi rank and bike hire near the centre,
  grouped by kind, from OpenStreetMap.
- **Country facts**: currency, dialling code, which side traffic drives on,
  languages, and emergency numbers as tappable links.
- Two new screens, Weather and Local, and place search now falls back across
  Nominatim, Photon and Open-Meteo rather than failing on the first refusal.

### Changed
- **Every source is now a chain, not a single provider.** If the first is down,
  rate limited or simply does not know a place, the next is tried and the app says
  which one answered. "Unable to fetch" is a useless thing to show someone standing
  in a street.
- Country facts ship with the app rather than being fetched. Currency and driving
  side do not change week to week, so a network dependency for them is pure risk.
  REST Countries proved the point during this work by deprecating itself and then
  answering HTTP 200 with an error body.

### Fixed
- The heat window silently returned nothing whenever the destination's local date
  differed from UTC, which near midnight in India is most of the time.
- **No network request had a deadline.** A provider that accepted a connection and
  then never answered hung the app indefinitely, which presents to a user as a
  frozen screen with no way to tell whether it is still working. Every request now
  has one, and a slow source becomes a failed source so the chain can move past it.
  Found because a CI runner got 504 from both Overpass mirrors, which is the
  behaviour the fallbacks exist for and the app still stalled.

## [0.2.0] - 2026-09-07

The release where the useful thing stopped requiring a terminal.

### Added
- **A web app that needs no install, no account, no key and no AI.**
  Type a town, get a clock-driven guide. Installs to a home screen and works
  offline. Live at https://atishyy27.github.io/tripkit/
- **Wikivoyage as a source of human judgement.** Its listing templates already
  carry name, hours, price and a written opinion about whether a place is worth
  going to. For Pushkar it supplied 44 described places and 4 safety notes where
  OpenStreetMap supplied none.
- **OpenStreetMap as the primary source of fact**, via Overpass, with an
  `opening_hours` parser that flattens the common shapes and refuses to guess at
  seasonal or sunset-relative rules.
- **Sunrise and sunset computed on device** from the NOAA solar equations, so the
  clock works with no network. Accurate to 1-2 minutes from Ajmer to Reykjavik in
  midwinter.
- `tripkit osm` and `tripkit verify`. Where both OpenStreetMap and the research
  layer hold hours for the same place, they now check each other, which is a free
  mechanical signal that something is wrong.
- Map, day-timeline and share views in the web app, with Leaflet vendored locally
  so the map survives going offline.
- A pre-push hook that blocks pushing under the wrong GitHub account.

### Changed
- The README leads with the thing you can open, not the thing you have to install.
- Research slices split into sub-topics and run as several smaller calls, because
  one response cannot carry thirty detailed sourced entries intact.
- Ranking now pushes infrastructure down. Left alone, an open pharmacy outranked a
  shut cathedral, which is true and useless.
- Every em dash and en dash removed from the codebase and docs.

### Fixed
- **Truncated responses were silently becoming a single entry.** A cut-off array
  failed to bracket-match, fell through to matching one object, and returned the
  first element as if it were the whole list. It parsed, it logged success, and it
  discarded most of the work. It now fails loudly.
- A build whose conditions slice produced nothing omitted the key entirely rather
  than emitting an empty one.
- Wikivoyage image markup leaked into city descriptions, so Lisbon opened with
  "thumb|right|Central Lisbon seen from a plane".
- Duplicate places survived when one name was bracketed and the other was not.
- The engine returned nothing at all once the departure deadline passed, instead of
  saying that leaving is the only remaining option.
- A large city returned thousands of rows, more than a phone can store. The set is
  now ranked by usefulness and capped, and says what it dropped.

### Known limitations
- Opening-hours coverage in OpenStreetMap is uneven: 86% for Munich restaurants,
  9% for Jaipur restaurants, measured the same day with the same query.
- The timezone is estimated from longitude with a small table of half-hour
  countries. It is user-editable, and everything on the page depends on it.
- The "best hour" score is the largest term in the ranking and is judgement rather
  than measurement.

## [0.1.0] - 2026-09-06

### Added
- First release. A Python CLI that turns a YAML trip spec into a twelve-page
  static site, researching the destination with parallel Claude agents.
- Time-driven engine: phases derived from the day's real sunrise and sunset,
  midday-closure handling, deadline filtering, and openness states that
  distinguish "shut" from "hours never found".
- Bring-your-own credentials, resolved at runtime and never stored.
- Pluggable search across Brave, Tavily, Serper and Exa.
- GitHub Pages deployment.

[0.6.0]: https://github.com/Atishyy27/tripkit/releases/tag/v0.6.0
[0.5.0]: https://github.com/Atishyy27/tripkit/releases/tag/v0.5.0
[0.4.0]: https://github.com/Atishyy27/tripkit/releases/tag/v0.4.0
[0.3.1]: https://github.com/Atishyy27/tripkit/releases/tag/v0.3.1
[0.3.0]: https://github.com/Atishyy27/tripkit/releases/tag/v0.3.0
[0.2.0]: https://github.com/Atishyy27/tripkit/releases/tag/v0.2.0
[0.1.0]: https://github.com/Atishyy27/tripkit/releases/tag/v0.1.0
