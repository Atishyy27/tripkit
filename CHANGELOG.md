# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.3.0]: https://github.com/Atishyy27/tripkit/releases/tag/v0.3.0
[0.2.0]: https://github.com/Atishyy27/tripkit/releases/tag/v0.2.0
[0.1.0]: https://github.com/Atishyy27/tripkit/releases/tag/v0.1.0
