# tripkit — prior art scan

Date: 2026-09-06. Method: GitHub search pages + Hacker News Algolia API + Wikipedia,
fetched directly via WebFetch (session's WebSearch quota was already exhausted by other
work before this task started, so this is fetch-based, not search-engine-based — noted
per row where that matters). Nothing below is invented; every row was actually pulled.
Two searches (Google, DuckDuckGo HTML) returned CAPTCHA/JS shells and are marked failed,
not silently skipped.

## What tripkit is, restated for comparison

CLI, YAML trip spec in → static, multi-page, mobile-first site out. Research done by
parallel LLM agents emitting structured JSON (places, hours, prices, coords, warnings).
The one differentiating claim under test: it reads the **current clock** and ranks
options by what's open **right now**, against a **hard departure deadline**, factoring
daylight/heat. Everything below is judged against that specific claim, not against
"travel planner" in general.

## Comparison table

| # | Name | URL | Stars | License | What it actually does | Data source | Maintained? | Overlap / difference (one sentence) |
|---|------|-----|-------|---------|------------------------|--------------|-------------|--------------------------------------|
| 1 | zinedkaloc/ai-travel-planner | github.com/zinedkaloc/ai-travel-planner | 81 | not confirmed in fetch | Web app, OpenAI Chat Completion generates an itinerary from preferences | LLM only, no live POI hours data mentioned | not verified (not checked past search snippet) | Same "LLM generates itinerary" idea, but no evidence of clock-driven ranking or a static-site output — it's a live web app, not a generated artifact. |
| 2 | shaheennabi/Production-Ready-TripPlanner-Multi-AI-Agents-Project | github.com | 78 | not confirmed | Multi-agent (discovery + booking) travel planning pipeline | LLM agents, presumably web tools | not verified | Closer in architecture (parallel/multi agents emitting structured data) than in output — no mention of deadline-aware ranking or static-site generation. |
| 3 | AdritPal08/TravelPlanner-CrewAi-Agents-Streamlit | github.com | 61 | not confirmed | CrewAI + Groq agents generate itineraries, Streamlit UI | LLM agents | not verified | Same "agents research, then assemble itinerary" shape as tripkit's research step; output is an interactive Streamlit app, not a static site, and no time-of-day ranking found. |
| 4 | kbhujbal/Multi-Agent-AI-Travel-Advisor | github.com | 57 | not confirmed | 7 specialized agents + RAG + tool-calling travel advisor | LLM + RAG | not verified | Most agent-count overlap with tripkit's "parallel LLM agents emit structured JSON" design, but it's a chat-style advisor, not a generated site, and nothing found about a departure-deadline constraint. |
| 5 | aws-samples/personalized-travel-itinerary-planner | github.com | 55 | not confirmed (AWS sample, typically MIT-0) | Genrative AI chatbot over Redshift + Bedrock | Amazon Redshift travel dataset + Bedrock LLM | AWS sample repo, unclear active maintenance | Enterprise reference architecture, not a personal CLI; no time-driven ranking. |
| 6 | YihongT/ITINERA | github.com/YihongT/ITINERA | 67 | GPL-3.0 (commercial use requires contacting authors) | Academic system: spatial optimization + LLM for open-domain **urban** itinerary planning; natural-language request in, ordered POI route out with map visualization | Custom POI dataset + LLM, spatial clustering | Last commit Nov 8 2024 — stalled ~10 months as of today | Closest **academic** match on "optimize a route of POIs from a request," EMNLP 2024 Industry Track + KDD UrbComp 2024 Best Paper — but confirmed it does NOT use current time, opening hours, or a departure deadline as a ranking factor. This is the single most important negative finding: the most-awarded nearby research project explicitly does not do the thing tripkit is built around. |
| 7 | FloatTrip | github topic listing | 67 | not confirmed | LangGraph agent + Amap POI + route clustering + LLM itinerary generation | Amap (China) POI API | not verified | Same agent-pipeline shape, China-market POI source; no evidence of clock/deadline ranking. |
| 8 | Triposo | triposo.com (via Wikipedia) | commercial, not GitHub | proprietary, defunct | Offline-downloadable travel guides with personalized recommendations, once integrated Facebook data | Own crawled/curated content | **Dead** — shut down completely March 1, 2023, acquired by Musement 2017 first | Direct product ancestor of "generate a self-contained trip guide," but no evidence it was ever clock-driven; it's gone, so it's not a competing live alternative today. |
| 9 | Wanderlog | wanderlog.com | commercial, not GitHub | proprietary | Collaborative itinerary builder, imports flight/hotel emails, "optimize route" between a start/end point, expense splitting | User input + Google-style places data | Actively marketed/maintained | The strongest **commercial** competitor by feature surface (route optimization, personalized recommendations) but the fetched page gives no evidence of live-clock ranking or a departure-deadline constraint, and it outputs an app view/PDF, not a static site. |
| 10 | Organic Maps | github.com/organicmaps/organicmaps | 15.3k | Apache-2.0 (map data separately licensed) | Offline maps + navigation, bookmarks, track import | OpenStreetMap | Actively maintained (44.8k commits, recent activity) | Real overlap only at "offline-capable, OSM-sourced" — it is a maps/nav app, not an itinerary generator; confirmed no "open now" or itinerary ranking feature in the fetched feature list. |
| 11 | mapsme/travelguide ("GuideWithMe") | github.com/mapsme/travelguide | 48 | not confirmed | Generates offline travel guides from Wikivoyage articles | Wikivoyage | Stale — last updated 2018 | Closest match to "generate a static offline guide from structured place data," but source data is Wikivoyage prose, not live-researched JSON, and it is not time-driven. Effectively abandoned. |
| 12 | nicolas-raoul/OxygenGuide (+ -Android) | github.com/nicolas-raoul/OxygenGuide | 9 / 8 | not confirmed | Offline world travel guide app built from Wikivoyage | Wikivoyage | Stale — last updated 2016/2017 | Same category as #11, older and smaller; also dead. |
| 13 | BestTime.app | besttime.app | commercial API, not open source | proprietary | API that predicts/serves hourly foot-traffic percentages per venue and live busyness vs. forecast; can filter/rank venues by predicted busyness | Aggregated anonymized location signals (source not disclosed) | Actively marketed | This is the closest thing found anywhere to "rank a place by whether now is a good hour to go" — but it ranks by **crowd level**, not by open/closed-plus-deadline-fit, and it's a data API for other apps to build on, not a trip-site generator. Worth studying even though it's not a direct competitor. |
| 14 | Sygic Travel (formerly Tripomatic) | sygic.com/travel | commercial | proprietary | Trip planning app, acquired by Sygic 2016 | not established from source fetched | current status not established — Wikipedia gave no operational detail; **unverified**, flagged rather than guessed | Named in the brief as a "to check" item; I could not confirm from the two sources fetched whether it is still live or what its current feature set is. Reporting the gap rather than guessing. |
| 15 | "open now" filter apps on GitHub | github search | 0 stars each (rynmull/open-now-app, sreerajpunnoli/GetGoing) | not confirmed | Toy/student apps wrapping Google Places API to show nearby open businesses | Google Places API | not maintained (0-star, low activity) | Confirms the "what's open right now" idea exists as a trivial wrapper feature elsewhere, but nobody found is combining it with ranking-against-a-deadline or generating a shippable site. |

### Named items from the brief I could not verify

- **TripIt, Roadtrippers, Maps.me/OsmAnd, GuruMaps, Pocket Earth, Wikivoyage-based apps
  generally** — well-known commercial products from general knowledge, but I did not get
  a successful fetch confirming current feature sets, so I am not scoring them in the
  table above. What's known generically: TripIt aggregates confirmation emails into a
  timeline (no clock-driven ranking); Roadtrippers plans road-trip routes with POIs along
  the way (no deadline-ranking). Neither claim is backed by a fetch this session —
  flagged as **unverified**, not stated as fact.
- **Google Maps "Popular Times"/live busyness** — I know this feature exists from general
  knowledge (per-place histogram of busy hours plus a live "how busy right now" reading),
  but two fetch attempts this session (Google support page: 404; Wikipedia Google Maps
  article: feature not covered in the retrieved text) failed to produce a citable source.
  Reporting this as **unverified this session**, not as a confirmed citation, even though
  I'm confident it's real — the rule here is cite-or-flag, not cite-from-memory.
- Two general web searches (Google, DuckDuckGo HTML) hit a CAPTCHA/JS wall and returned
  zero usable content — genuinely failed, not a silent skip. WebSearch tool itself
  reported the session's search quota was already exhausted before I made my first call,
  so all search-engine-style queries in this scan went through WebFetch against
  GitHub/HN/Wikipedia/product pages directly instead.

## Direct answers

**Does something essentially identical to tripkit already exist?** No. Nothing found
combines all three of: (a) LLM-agent research into structured place JSON, (b) a
generated static multi-page site as the output artifact, and (c) ranking driven by the
actual current clock against a hard departure deadline. Every close match is missing at
least one of those three.

**What is the closest existing thing?** Two different "closest," for two different axes:
- On **architecture** (parallel LLM agents → structured data → assembled itinerary):
  kbhujbal/Multi-Agent-AI-Travel-Advisor (#4) and shaheennabi's multi-agent project (#2).
- On **the time-awareness claim specifically**: nothing in the itinerary-planner space.
  The nearest adjacent idea is BestTime.app (#13), which ranks a venue by predicted crowd
  level per hour — a genuinely different axis (busyness, not open/closed-vs-deadline) but
  the same instinct that "not all open hours are equally good hours."

**What do the good ones do that tripkit has not thought of, concretely?**
- Wanderlog's route optimization between a fixed start and end point (not just "what's
  open," but "what order minimizes backtracking given the day's stops") — tripkit's brief
  as described ranks "what to do next," which is a greedy/local decision; a real route
  optimizer solves the whole day's ordering at once.
- BestTime.app's crowd-level forecasting as a second axis alongside open/closed — a place
  can be open and still be the wrong hour to go (queue length), which "open now" alone
  misses entirely.
- The multi-agent advisors (#4) use RAG over a real knowledge base in addition to LLM
  generation, which is a mitigation tripkit's brief doesn't mention — it reduces
  hallucinated hours/prices, which is exactly the failure mode surfaced below.
- ITINERA (#6) treats the whole trip as a spatial optimization problem (clustering POIs
  geographically before ordering them), not just a time filter — worth a look for how it
  avoids zig-zagging across a city.

**What do they all get wrong, worth doing differently?**
- The one concrete, sourced failure mode (from the Hacker News/Substack piece fetched,
  "The Unreliability of LLMs and What Lies Ahead"): LLM travel planners are fine for
  vague brainstorming but "fabricate hotel names and pricing information" once asked for
  specifics, requiring manual re-verification against a source like TripAdvisor. This is
  the exact failure surface tripkit's "structured JSON with warnings" field is presumably
  meant to catch — worth confirming the warnings field actually gets populated when an
  agent is uncertain about a fact, rather than only when it detects a hard error.
- Every GitHub project found outputs either a live web app or a chat interface, never a
  static, shippable, offline-viewable artifact — the "generates a static site you can
  actually hand someone" angle is one nobody else in this scan does, which is a genuine
  differentiator, not just a stylistic choice.
- The Wikivoyage-offline-guide lineage (#11, #12) is a dead end technically (both stale
  since 2016-2018) but validates the appetite for "one generated artifact per trip" — it
  died from being tied to Wikivoyage's slow-moving prose corpus, not from the idea being
  bad. tripkit's LLM-research step is the fix for that specific cause of death.

**Is "time-driven ranking against a departure deadline" genuinely novel, or standard and
just not seen?** Based on what was actually found: **no direct prior art for the specific
combination**, but the constituent ideas are not new individually — "is it open now" is a
trivial wrapper feature (#15), "which hour is best" exists commercially as a crowd-level
product (#13), and deadline-constrained routing is a known operations-research shape
(vehicle routing with time windows) that ITINERA-style academic work is adjacent to but
doesn't implement here. Calling it novel would overstate a genuinely thin search; the
honest claim is: **the specific combination was not found anywhere in this scan**, most
searches here were fetch-based rather than full search-engine coverage, and a person
should not present this as a verified-unique claim without a deeper, search-engine-backed
pass (Google/DDG were both blocked this session).
