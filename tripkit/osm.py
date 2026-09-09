"""
OpenStreetMap as a first-class source, via Overpass.

Measured on 2026-09-06 with the query below, and the numbers decide the design:

    Munich  amenity=restaurant   1,924 / 2,249 carry opening_hours   85.5%
    Jaipur  amenity=restaurant      15 /   168 carry opening_hours    8.9%

So OSM cannot be the only source for a tool aimed at places like Jaipur. It is
excellent for name, coordinates, category, website and phone everywhere, good for
hours in dense Western cities, and thin for hours elsewhere.

That asymmetry is useful rather than annoying. Where OSM does have hours, they are
a free, mechanical check on what the model claimed: if the two disagree, something
is wrong and a human should look. See `crosscheck`.
"""
from __future__ import annotations
import json, time, urllib.parse, urllib.request

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# OSM tag -> our category. Only tags a visitor would actually seek out.
TOURISM = {"attraction": "view", "museum": "museum", "artwork": "view",
           "viewpoint": "view", "gallery": "museum", "zoo": "do",
           "theme_park": "do", "aquarium": "do", "picnic_site": "park"}
AMENITY = {"restaurant": "food", "cafe": "cafe", "fast_food": "street",
           "food_court": "food", "ice_cream": "sweet", "bar": "bar", "pub": "bar",
           "marketplace": "shop", "place_of_worship": "temple", "theatre": "do",
           "cinema": "do", "library": "practical", "pharmacy": "practical",
           "hospital": "practical", "bank": "practical", "atm": "practical",
           "bus_station": "move", "ferry_terminal": "move"}
HISTORIC = {"monument": "view", "memorial": "view", "castle": "view",
            "ruins": "view", "fort": "view", "archaeological_site": "view",
            "city_gate": "view", "tomb": "view"}
LEISURE = {"park": "park", "garden": "park", "nature_reserve": "outdoor",
           "swimming_pool": "do", "water_park": "do"}
SHOP_OK = {"gift", "craft", "jewelry", "clothes", "books", "antiques",
           "art", "bakery", "confectionery", "spices", "supermarket"}

SKIP_NAMELESS = True


def build_query(lat: float, lng: float, radius_m: int, timeout: int = 90) -> str:
    """Real, working Overpass QL. `out center tags` gives ways a usable point."""
    sel = []
    for k, vals in (("tourism", TOURISM), ("amenity", AMENITY),
                    ("historic", HISTORIC), ("leisure", LEISURE)):
        v = "|".join(sorted(vals))
        for t in ("node", "way"):
            sel.append(f'  {t}["{k}"~"^({v})$"](around:{radius_m},{lat},{lng});')
    v = "|".join(sorted(SHOP_OK))
    for t in ("node", "way"):
        sel.append(f'  {t}["shop"~"^({v})$"](around:{radius_m},{lat},{lng});')
    return (f"[out:json][timeout:{timeout}];\n(\n" + "\n".join(sel) +
            "\n);\nout center tags;")


def fetch(lat: float, lng: float, radius_m: int = 4000, retries: int = 2,
          log=lambda m: None) -> list[dict]:
    q = build_query(lat, lng, radius_m)
    last = ""
    for attempt in range(retries + 1):
        for url in ENDPOINTS:
            try:
                data = urllib.parse.urlencode({"data": q}).encode()
                req = urllib.request.Request(
                    url, data=data,
                    headers={"User-Agent": "tripkit/0.1 (+https://github.com/Atishyy27/tripkit)"})
                with urllib.request.urlopen(req, timeout=150) as r:
                    return json.loads(r.read().decode("utf-8", "replace")).get("elements", [])
            except Exception as e:  # noqa: BLE001
                last = f"{url.split('/')[2]}: {e}"
                log(f"    overpass {last}")
        # the public instances ask for a 30s backoff on 429/504, and honouring it
        # is the difference between being a good citizen and being blocked
        if attempt < retries:
            time.sleep(30)
    raise RuntimeError(f"Overpass failed on every endpoint: {last}")


OSM_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]


def _days(sel: str | None):
    """
    Expand a day selector ("Mo-Fr", "Mo,We,Fr", "Tu-Su") into indices, Monday 0.

    Returns None when the selector is not purely days, which is the load-bearing
    case: a month range like "Apr-Oct" lands here, and None makes the caller refuse
    the value outright instead of flattening a summer rule into year-round hours.
    """
    import re
    if not sel:
        return list(range(7))
    cleaned = re.sub(r"\b(PH|SH)\b", "", sel, flags=re.I).strip(" ,\t")
    if not cleaned:
        return list(range(7))
    out: set[int] = set()
    for tok in [t.strip() for t in cleaned.split(",") if t.strip()]:
        rng = re.fullmatch(r"(Mo|Tu|We|Th|Fr|Sa|Su)\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su)", tok)
        if rng:
            i, end = OSM_DAYS.index(rng.group(1)), OSM_DAYS.index(rng.group(2))
            while True:
                out.add(i)
                if i == end:
                    break
                i = (i + 1) % 7
        elif tok in OSM_DAYS:
            out.add(OSM_DAYS.index(tok))
        else:
            return None          # a month, a week number, something we do not model
    return sorted(out) if out else list(range(7))


def _hours(oh: str | None):
    """
    Translate the common, simple shapes of the opening_hours grammar into the fields
    the engine uses, and return which weekdays they apply to.

    The docstring here used to claim that anything it could not flatten was returned
    unparsed rather than guessed at. That was not true. The day selector was matched
    and discarded, so "Mo-Fr 09:00-17:00" became 09:00 to 17:00 on every day of the
    week and a place shut on Sunday was reported open. Measured against 1,026 live
    OpenStreetMap values, 300 of the 513 this flattened (58%) were shut on at least
    one day it called them open. Keeping the days brings that to zero and costs eight
    of those places their confident hours, which is the right trade: "hours unknown"
    is a worse answer than the truth and a far better one than a locked door.
    """
    if not oh or not isinstance(oh, str):
        return None, None, None, None, None
    s = oh.strip()
    if s in ("24/7", "24/7; PH open", "Mo-Su 00:00-24:00"):
        return "00:00", "23:59", None, None, None
    import re
    # Public/school-holiday clauses are extremely common and orthogonal to the normal
    # week. Dropping the whole entry over "; PH off" throws away real, usable hours,
    # so peel those off and keep them as a note instead of failing the parse. A clause
    # only counts as a holiday aside if it is ONLY about holidays: "PH,Sa,Su 11:30-23:30"
    # also opens the place at the weekend, and treating it as a footnote would report a
    # Saturday as shut when it is open.
    ph_note = None
    parts = [x.strip() for x in s.split(";") if x.strip()]
    if len(parts) > 1:
        def is_holiday(x: str) -> bool:
            # "SH Mo-Su 09:00-18:00" qualifies its days BY the holiday: it is an
            # alternative schedule and a fair footnote. "PH,Sa,Su 11:30-23:30" lists
            # the holiday ALONGSIDE ordinary weekend days, so it opens the place on a
            # real Saturday and is not a footnote at all. The comma is the tell.
            return bool(re.match(r"^(PH|SH)\b", x, re.I)) and not re.match(
                r"^(PH|SH)\s*,", x, re.I)
        main = [x for x in parts if not is_holiday(x)]
        hol  = [x for x in parts if is_holiday(x)]
        if len(main) == 1 and hol:
            s, ph_note = main[0], "; ".join(hol)
        elif len(main) > 1:
            return None, None, None, None, oh

    # a single day-range with one or two time spans, which is the bulk of real data
    m = re.fullmatch(
        r"(?:([A-Za-z,\-\s]+)\s+)?(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"
        r"(?:\s*,\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2}))?\s*;?", s)
    if not m:
        return None, None, None, None, s    # keep the raw string, flag as unparsed
    sel, a, b, c, d = m.groups()
    days = _days(sel)
    if days is None:
        return None, None, None, None, oh   # seasonal or otherwise not just days
    days = None if len(days) == 7 else days
    pad = lambda t: f"{int(t.split(':')[0]):02d}:{t.split(':')[1]}"
    if c and d:                              # two spans = a midday closure
        return pad(a), pad(d), [pad(b), pad(c)], days, ph_note
    return pad(a), pad(b), None, days, ph_note


def to_places(elements: list[dict], town: str) -> list[dict]:
    out = []
    for e in elements:
        t = e.get("tags") or {}
        name = t.get("name:en") or t.get("name")
        if not name and SKIP_NAMELESS:
            continue
        cat = (TOURISM.get(t.get("tourism")) or AMENITY.get(t.get("amenity"))
               or HISTORIC.get(t.get("historic")) or LEISURE.get(t.get("leisure"))
               or ("shop" if t.get("shop") in SHOP_OK else None))
        if not cat:
            continue
        lat = e.get("lat") or (e.get("center") or {}).get("lat")
        lng = e.get("lon") or (e.get("center") or {}).get("lon")
        if lat is None or lng is None:
            continue
        op, cl, shut, open_days, unparsed = _hours(t.get("opening_hours"))
        fee = t.get("fee")
        lo = 0 if fee == "no" else None
        hi = 0 if fee == "no" else None
        why = []
        if t.get("description"):
            why.append(t["description"][:240])
        note = []
        if unparsed and not op:
            note.append(f"OSM lists hours as “{unparsed}”, a pattern too complex to "
                        f"flatten safely - read it as written")
        elif unparsed:
            note.append(f"holiday rule from OSM: {unparsed}")
        if t.get("wheelchair") == "yes":
            note.append("step-free access per OSM")
        out.append({
            "id": f"osm-{e.get('type', 'n')}{e.get('id', '')}",
            "name": name, "cat": cat, "town": town,
            "lat": round(float(lat), 6), "lng": round(float(lng), 6), "loose": False,
            "open": op, "close": cl, "shut": shut, "openDays": open_days,
            "lo": lo, "hi": hi, "priceNote": None, "dur": 30,
            "why": " ".join(why), "warn": ("; ".join(note) or None),
            "best": [], "tags": (["free"] if fee == "no" else []),
            "src": f"https://www.openstreetmap.org/{e.get('type', 'node')}/{e.get('id', '')}",
            "_osm": True,
            "_raw_hours": t.get("opening_hours"),
            "website": t.get("website") or t.get("contact:website"),
            "phone": t.get("phone") or t.get("contact:phone"),
        })
    return out


def coverage(places: list[dict]) -> dict:
    n = len(places)
    h = sum(1 for p in places if p.get("_raw_hours"))
    parsed = sum(1 for p in places if p.get("open"))
    return {"total": n, "with_hours_tag": h, "parsed_into_fields": parsed,
            "pct": round(100.0 * h / n, 1) if n else 0.0}


def crosscheck(llm_places: list[dict], osm_places: list[dict]) -> list[dict]:
    """
    Where OSM has real hours and the model also claimed hours for the same place,
    disagreement is a free hallucination signal. This does not decide who is right -
    OSM goes stale too - it just refuses to let the two quietly differ.
    """
    import re
    def key(n):
        return "".join(w for w in re.split(r"[^a-z0-9]+", n.lower()) if w)[:24]
    idx = {key(p["name"]): p for p in osm_places if p.get("open")}
    hits = []
    for p in llm_places:
        k = key(p.get("name", ""))
        o = idx.get(k)
        if not o or not p.get("open"):
            continue
        if p["open"] != o["open"] or (p.get("close") and p["close"] != o.get("close")):
            hits.append({"name": p["name"],
                         "llm": f'{p.get("open")}-{p.get("close")}',
                         "osm": f'{o.get("open")}-{o.get("close")}',
                         "osm_raw": o.get("_raw_hours"), "osm_url": o.get("src")})
    return hits
