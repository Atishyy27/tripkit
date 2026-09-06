"""
Research slices: one prompt per subject area, generated from the spec.

The rules below are not decoration. Every one of them exists because its absence
produced a concrete failure in the run this tool was extracted from:

  * "null, never a guess"        - an agent invented an opening hour, and an
                                   invented hour sends someone to a locked door.
  * "hours are the product"      - the first pass collected prices and no hours,
                                   which made a clock-driven site impossible.
  * "report disagreement"        - two sources gave a bus fare thirty times apart;
                                   averaging them would have produced a confident
                                   number that was wrong in both directions.
  * "flag closed venues"         - omitting a dead cafe silently is worse than
                                   listing it as dead; the traveller walks there.
  * "state the scope of a null"  - "not found" is a fact about the search, not
                                   about the world, and must read as one.
"""
from __future__ import annotations
from .spec import Spec

PLACE_SCHEMA = """
Emit a JSON ARRAY of objects with EXACTLY these keys:

{
 "id":       "kebab-case-unique",
 "name":     "Display name as a person would say it",
 "cat":      "temple|ghat|view|museum|park|food|cafe|sweet|street|bar|shop|do|
              wellness|outdoor|nightlife|hub|move|stay|practical",
 "town":     "<one of the towns named above, lowercase>",
 "lat": 0.0, "lng": 0.0,
 "loose":    true,            // true if you inferred the coordinates
 "open":     "HH:MM" | null,  // 24h local time
 "close":    "HH:MM" | null,
 "shut":     ["HH:MM","HH:MM"] | null,   // a midday/afternoon closure, if any
 "days":     "closed Mon" | null,
 "lo": 0, "hi": 0,            // price per person, low and high; 0/0 means free
 "priceNote":"per plate" | null,
 "dur":      30,              // typical minutes a visitor spends
 "why":      "One or two honest sentences. What it actually is. Say plainly if
              it is overrated or if reviews complain.",
 "warn":     "One line, or null. Scam, closure risk, dress code, safety, access.",
 "best":     ["HH:MM"],       // the hours this is genuinely at its best
 "tags":     ["free","sunrise","sunset","indoor","shade","aircon","quiet","walk",
              "photo","view","rainy-day","solo-ok","cheap","evening"],
 "src":      "https://..." | null
}
""".strip()

RULES = """
NON-NEGOTIABLE RULES

1. null is a correct answer. A fabricated one is not. If you cannot source an
   opening hour, a price or a phone number, write null. Never approximate a
   number into existence.
2. Every hour and every price needs a real "src" URL. No URL means the field is
   null.
3. Where sources contradict each other, say so in "warn" and leave the field
   null. Do not average two numbers that cannot both be true.
4. Include places that are CLOSED or DEFUNCT, marked clearly in "warn". Omitting
   a dead venue makes someone walk across town to a shutter.
5. Mark a business you cannot independently confirm exists with
   "warn": "UNVERIFIED - could not confirm this business exists".
6. Opening hours are the single most valuable field here. An entry with sourced
   hours is worth more than five entries without them.
7. Write "why" for a tired human reading a phone screen, not for a brochure.
   Plain, specific, honest. Say when something is not worth the trip.

OUTPUT: only the JSON array. No prose, no code fence, no trailing commas.
""".strip()


def _ctx(spec: Spec) -> str:
    towns = ", ".join(f'"{p.name.lower()}"' for p in spec.places)
    lines = [spec.describe(), f"Valid values for the \"town\" field: {towns}."]
    if spec.currency:
        lines.append(f"All prices in {spec.currency} ({spec.currency_symbol}).")
    if spec.arrive and spec.depart:
        lines.append(
            f"The traveller is on a hard clock: they arrive {spec.arrive:%H:%M} and "
            f"must leave by {spec.depart:%H:%M}. Anything that cannot fit inside that "
            f"window, or that opens after they have gone, is useless to them - but "
            f"still include it and let the times speak.")
    if spec.profile:
        lines.append(
            f"Traveller profile: {', '.join(spec.profile)}. Where this changes the "
            f"advice - safety, dress, whether a place is comfortable alone, whether "
            f"a female practitioner is available - say so specifically rather than "
            f"generically.")
    return "\n".join(lines)


BRIEFS: dict[str, dict] = {
"sights": dict(
  shape="places", title="sights, landmarks and viewpoints",
  brief="""Every temple, monument, museum, park, viewpoint, waterfront and
  landmark. Hunt hardest for exact opening hours, any MIDDAY CLOSURE (routinely
  omitted by tourist pages and routinely real), entry fees, camera fees, dress
  codes, and the hour each place is genuinely best at. Include free things and
  slow things, not only the ticketed highlights. Where a famous claim about a
  place is repeated everywhere, check whether it is actually true and correct it
  in "why" - travellers get charged for facts that are wrong.""",
  queries=["{dest} opening hours temple monument", "{dest} entry fee timings 2026",
           "{dest} top sights what to see", "{dest} best time of day to visit",
           "{dest} viewpoint sunrise sunset spot"], target=30),

"food": dict(
  shape="places", title="food, cafes and street eating",
  brief="""Every named place to eat, with OPENING HOURS as the priority field.
  Cover the dawn slot specifically - what is genuinely open early is the hardest
  and most valuable thing to establish. Cover street stalls and sweet shops, not
  only sit-down restaurants. Note any local rule that shapes eating: vegetarian-
  only areas, dry towns, fasting days. Give a real price band per person. Flag
  every venue that reviews suggest has closed, and flag names that appear on food
  lists but that you cannot confirm exist at all.""",
  queries=["{dest} best restaurants cafes", "{dest} street food what to eat",
           "{dest} open early breakfast", "{dest} restaurant opening hours",
           "{dest} local speciality dish where to eat"], target=40),

"shopping": dict(
  shape="places", title="markets and shops",
  brief="""Markets, bazaars, streets and named shops, with the hours the market
  itself comes alive and winds down. Say what the place is actually known for and
  which of those things are commonly counterfeited.""",
  queries=["{dest} market bazaar shopping street", "{dest} what to buy souvenirs",
           "{dest} market timings"], target=20),

"experiences": dict(
  shape="places", title="classes, tours and activities",
  brief="""Everything that is neither a sight nor a meal: classes, workshops,
  guided walks, wellness, sport, water, nightlife, live music, volunteering, day
  passes. The critical fields are the TIMES the thing actually happens and whether
  it can be booked SAME DAY - a traveller on one day cannot use anything requiring
  notice. Where a profile field above matters (a solo traveller, a woman looking
  for a female practitioner), state what you could and could not confirm.""",
  queries=["{dest} things to do activities booking", "{dest} classes workshops tours",
           "{dest} yoga massage spa class timings", "{dest} day tour price"],
  target=30),

"offbeat": dict(
  shape="places", title="quiet, offbeat and photogenic",
  brief="""What the standard guides miss. Quiet corners and the hour they are
  quiet. Walking routes. Free rooftops and public seating. Photography spots with
  the specific hour the light works, and places where photography is FORBIDDEN,
  which matters as much. Local rhythms a visitor can watch without paying or
  participating. Anything genuinely strange. Also: one honest paragraph on why
  this place exists and how it is shaped, as a "practical" entry - it makes
  everything else make sense.""",
  queries=["{dest} offbeat hidden gems locals", "{dest} photography spots best light",
           "{dest} quiet peaceful avoid crowds", "{dest} walking route old town"],
  target=25),
}

MOVE_SCHEMA = """
JSON ARRAY of:
{"id":"...","mode":"walk|bus|shared|auto|taxi|app|rental|train|ferry|package",
 "from":"...","to":"...","lo":0,"hi":0,"priceNote":"...",
 "first":"HH:MM"|null,"last":"HH:MM"|null,"freq":"..."|null,"dur":"..."|null,
 "where":"the exact pickup point"|null,"why":"honest read","warn":"..."|null,
 "phone":"..."|null,"confidence":"official|reported|estimate","src":"url"|null}
"""

SAY_SCHEMA = """
JSON ARRAY of:
{"situation":"what is happening to you at this moment",
 "say":"the exact line in the local script",
 "roman":"the same line romanised",
 "means":"literal English",
 "why":"why this phrasing beats the obvious alternative",
 "cat":"scam|price|transport|temple|food|help|exit|basics",
 "verify":true|false,"src":"url"|null}
"""

HELP_SCHEMA = """
JSON ARRAY of:
{"name":"...","cat":"police|medical|women|money|luggage|toilet|tourist|misc",
 "town":"...","phone":"..."|null,"addr":"..."|null,"hours":"..."|null,
 "note":"why it is or is not verified, and what to do instead",
 "verified":true|false,"src":"url"|null}
"""

SCAM_SCHEMA = """
JSON ARRAY of:
{"name":"short name for the routine","opener":"the exact opening line you will hear",
 "how":"the mechanic, step by step, so it is recognisable in five seconds",
 "cost":"what people report losing","counter":"what actually ends it",
 "confidence":"corroborated|single-source|unverified","src":"url"|null}
"""

COND_SCHEMA = """
A single JSON OBJECT (not an array):
{"date":"YYYY-MM-DD","sunrise":"HH:MM","sunset":"HH:MM","firstLight":"HH:MM",
 "lastLight":"HH:MM","goldenAM":["HH:MM","HH:MM"],"goldenPM":["HH:MM","HH:MM"],
 "temp":{"06":25,"09":28,"12":31,"15":33,"18":30,"21":27},
 "humidity":"...","weather":"...","rainChance":"...",
 "heatWindow":["HH:MM","HH:MM"],"moon":"...",
 "festivals":[{"name":"...","date":"...","effect":"how it changes crowds, hours or transport","src":"..."}],
 "sources":["url"],"unverified":["anything you could not confirm"]}
"""

SPECIAL: dict[str, dict] = {
"transport": dict(shape="move", schema=MOVE_SCHEMA, title="getting there, around and out",
  brief="""Every way to move, with TIMES and real fares. Priorities, in order:
  (1) the arrival leg from the exact arrival point, at the exact arrival hour -
  what is actually running then, not what runs at noon; (2) getting around
  locally, including whether walking is simply the answer; (3) THE DEPARTURE,
  which is the leg that strands people. Establish whether ride-hailing is
  genuinely available in the destination itself for the return, or only in the
  hub. If nobody documents it, say that plainly - an assumed cab is how a
  traveller misses a bus. Mark every row official / reported / estimate honestly,
  and give real operator phone numbers where a page actually resolves.""",
  queries=["{hub} to {dest} bus taxi fare", "{dest} to {hub} last bus time",
           "{dest} local transport getting around", "{hub} {dest} taxi price",
           "{dest} uber ola cab available"], target=20),

"phrases": dict(shape="say", schema=SAY_SCHEMA, title="the lines that work",
  brief="""Not a tourist phrasebook. The specific scripts for specific
  confrontations: being overcharged, being followed, refusing a ritual or a
  guide, agreeing a fare out loud before boarding, asking whether food contains
  something, asking a stranger for help, and a three-step escalation from polite
  to loud - including the line that recruits bystanders, because in most public
  places bystanders are the actual safety mechanism. Include market numbers,
  since prices are spoken not written. Include the local register or dialect
  words a visitor will actually hear and how they differ from the standard
  language. Mark any word you are not certain of with "verify": true.""",
  queries=["{dest} common scams tourists phrases", "{country} bargaining phrases market",
           "{country} basic phrases travellers"], target=45),

"help": dict(shape="help", schema=HELP_SCHEMA, title="emergency and practical numbers",
  brief="""Police, hospitals and 24h clinics, pharmacies, women's helplines,
  ambulance, tourist police, tourist office, ATMs and which banks, left-luggage
  and its current fee, paid toilets and showers, mobile coverage. ACCURACY OVER
  COVERAGE, absolutely: set "verified": false and say why in "note" for anything
  not confirmed from an official or highly credible source, and name the fallback
  to use instead. A wrong number in an emergency is worse than no number. A short
  verified list beats a long speculative one.""",
  queries=["{dest} police station phone number", "{dest} hospital emergency 24 hours",
           "{country} emergency number women helpline", "{dest} ATM bank luggage storage"],
  target=25),

"safety": dict(shape="scams", schema=SCAM_SCHEMA, title="scams and how they open",
  brief="""The specific routines run on visitors here. For each, the literal
  OPENING LINE, the mechanic step by step, what people report losing, and what
  actually ends it. Then, separately in the same array, any local rule that is
  simply true and catches people out (dress, footwear, photography bans, dry
  areas, restricted zones). Report what solo travellers and women actually say,
  including where accounts DISAGREE - disagreement is the finding, do not average
  it. Do not exaggerate risk and do not sanitise it.""",
  queries=["{dest} tourist scams warning", "{dest} solo female traveller safety",
           "{dest} rip off avoid tourist trap", "{dest} rules dress code visitors"],
  target=15),

"conditions": dict(shape="conditions", schema=COND_SCHEMA, title="light, heat and the calendar",
  brief="""Precise conditions for the exact date of this trip. Sunrise, sunset,
  first and last light, golden hours - cross-check against two independent sources
  and say if they disagree, because these drive the whole day. The hourly
  temperature curve and the hours being outside is genuinely unpleasant. Weather
  and rain likelihood for that specific date, not just climate averages. And
  critically: ANY festival, holiday or religious date on or near that date that
  would change crowds, opening hours or transport. Nobody checks this and it can
  reshape a whole day.""",
  queries=["{dest} sunrise sunset {date}", "{dest} weather {month} temperature",
           "{country} festivals holidays {month} {year}", "{dest} best time of day heat"],
  target=1),
}

ALL = {**BRIEFS, **SPECIAL}


def queries_for(name: str, spec: Spec) -> list[str]:
    d = ALL.get(name)
    if not d:
        return [f"{spec.dest.name} {name}"]
    hub = (spec.hub_place.name if spec.hub_place else spec.dest.name)
    when = spec.arrive or spec.depart
    fmt = dict(dest=spec.dest.name, hub=hub, country=spec.country or spec.dest.name,
               date=f"{when:%d %B %Y}" if when else "",
               month=f"{when:%B}" if when else "", year=f"{when:%Y}" if when else "")
    out = []
    for q in d.get("queries", []):
        try:
            out.append(q.format(**fmt).strip())
        except KeyError:
            continue
    for p in spec.places:
        if p.name != spec.dest.name:
            out.append(f"{p.name} {name} guide")
    return out


def prompt_for(name: str, spec: Spec, context: str | None) -> str:
    d = ALL.get(name)
    if not d:
        raise KeyError(f"unknown slice {name!r}. Known: {', '.join(sorted(ALL))}")
    schema = d.get("schema") or PLACE_SCHEMA
    target = d.get("target", 20)
    parts = [
        f"You are researching {d['title']} for a real traveller. Be specific, be "
        f"honest, and never invent anything.",
        "",
        "THE TRIP", "--------", _ctx(spec), "",
        "YOUR SLICE", "----------", d["brief"], "",
        f"Aim for around {target} entries if the material genuinely supports it. "
        f"Fewer well-sourced entries beat more padded ones - never invent an entry "
        f"to reach a count." if target > 1 else "",
        "", "SCHEMA", "------", schema, "", RULES,
    ]
    if context:
        parts += ["", "SEARCH RESULTS", "--------------",
                  "These were retrieved for you. Use them as your primary evidence, "
                  "cite their URLs in \"src\", and rely on your own knowledge only to "
                  "fill gaps they leave - marking anything so filled as null-sourced.",
                  "", context]
    else:
        parts += ["", "Search the web yourself for this. Prefer primary sources: the "
                  "venue's own page, an operator's booking page, an official tourism or "
                  "government site. Treat aggregators and AI summaries as weak evidence."]
    return "\n".join(x for x in parts if x is not None)
