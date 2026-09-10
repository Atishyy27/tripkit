#!/usr/bin/env python3
"""
Build-time precompute for the opening_hours coverage trend, U12.

Overpass only ever answers "what does OSM look like right now." It cannot say
whether a town's opening_hours coverage is getting better or worse, because it
has no memory of the past. The ohsome API (https://ohsome.org) is built on the
full OSM edit history and can answer exactly that question, but a single
ratio query against it took 4.5 to 12 seconds against the towns below and the
ohsome docs themselves warn of much longer waits under load (19 to 250 seconds
is realistic for a busy period or a larger bbox). A page load can never afford
that, so the trend is computed here, once, offline, and shipped as a small
JSON file the browser reads instantly. The browser never calls ohsome.

Run this by hand, occasionally, as a maintainer:

    python3 tools/build_coverage_trend.py

It writes docs/data/coverage-trend.json. Commit that file; the web app reads
only the JSON, never the network call that produced it.

To add a town: add one entry to TOWNS below with `match` (lowercase, this is
what the browser compares against GUIDE.place.name), `label` (what a human
reads on the card), and a bbox in "minLon,minLat,maxLon,maxLat" order
(ohsome's order, not lat/lon), then re-run the script. A town that fails
(ohsome down, timeout, malformed response) is skipped, not fabricated, and
the towns that did succeed still get written.
"""
from __future__ import annotations
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ENDPOINT = "https://api.ohsome.org/v1/elements/count/ratio"

# Two ohsome filters over the same bbox and time range: the denominator (every
# restaurant that ever existed at each snapshot) and the numerator (the subset
# that also carries opening_hours). ohsome divides them into `ratio` itself,
# per timestamp, from the real edit history, not a live-only Overpass count.
FILTER_TOTAL = "amenity=restaurant"
FILTER_WITH_HOURS = "amenity=restaurant and opening_hours=*"

# Eight years, one snapshot every two years, five points per town: enough to
# see a real direction without asking ohsome for more granularity than this
# tool needs.
TIME_RANGE = "2018-01-01/2026-01-01/P2Y"

# bbox is "minLon,minLat,maxLon,maxLat", ohsome's own order. Keep this list
# short and deliberate; each town costs one real, slow network call.
#
# `match` is the key the browser looks GUIDE.place.name up by, lowercased. It
# is the plain town name, not the bbox description, because Nominatim hands
# the app back "Jaipur" or "Munich", never "Munich centre". `label` is what a
# human reads on the card; it keeps the "centre" honesty for the two towns
# where the bbox is deliberately a small downtown box, not the whole city.
TOWNS = [
    {"match": "munich", "label": "Munich centre", "bbox": "11.5556,48.1300,11.5956,48.1500"},
    {"match": "lisbon", "label": "Lisbon centre", "bbox": "-9.1500,38.7050,-9.1200,38.7250"},
    {"match": "pushkar", "label": "Pushkar", "bbox": "74.5378,26.4739,74.5744,26.5029"},
    {"match": "ajmer", "label": "Ajmer", "bbox": "74.6100,26.4300,74.6600,26.4750"},
    {"match": "jaipur", "label": "Jaipur", "bbox": "75.7500,26.8000,75.8700,26.9500"},
]

# ohsome itself can take a long time to answer under load; this is a generous
# ceiling, not the expected duration, so a slow-but-live ohsome still finishes
# rather than getting cut off right before it would have answered.
TIMEOUT_S = 300

# Politeness: this script runs occasionally by hand, never in CI and never
# from the browser, but sequential calls with a pause are still the right
# default against someone else's free, keyless, shared API.
PAUSE_BETWEEN_TOWNS_S = 2

OUT_PATH = "docs/data/coverage-trend.json"


def fetch_ratio(bbox: str, timeout_s: int = TIMEOUT_S) -> list[dict]:
    """One ohsome ratio call for one bbox. Returns the raw ratioResult list.

    Raises on any network or shape failure; the caller decides whether to
    skip the town rather than abort the whole run.
    """
    params = {
        "bboxes": bbox,
        "time": TIME_RANGE,
        "filter": FILTER_TOTAL,
        "filter2": FILTER_WITH_HOURS,
    }
    url = ENDPOINT + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Accept": "application/json",
                                                "User-Agent": "tripkit-build/0.1 (+https://github.com/Atishyy27/tripkit)"})
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        body = resp.read()
    data = json.loads(body)
    result = data.get("ratioResult")
    if not isinstance(result, list) or not result:
        raise ValueError(f"no ratioResult in response: {json.dumps(data)[:300]}")
    return result


def shape_years(ratio_result: list[dict]) -> list[dict]:
    """Turn ohsome's ratioResult into the small per-year shape the browser reads.

    ohsome's `value` is the denominator count (filter1: all restaurants that
    existed at that snapshot), `value2` is the numerator (filter2: the subset
    with opening_hours), and `ratio` is value2/value already computed by
    ohsome. This is pulled apart into a plain {year, total, withHours, pct}
    dict per snapshot so the browser never has to know ohsome's field names.
    """
    years = []
    for point in ratio_result:
        ts = point.get("timestamp", "")
        year = int(ts[:4]) if len(ts) >= 4 and ts[:4].isdigit() else None
        total = point.get("value")
        with_hours = point.get("value2")
        ratio = point.get("ratio")
        if year is None or total is None or with_hours is None or ratio is None:
            continue
        # Verified live against a real empty bbox (2026-09-10): ohsome sends the
        # JSON STRING "NaN" for `ratio`, not a number, when the denominator was
        # zero at that snapshot. A naive numeric comparison against a string
        # throws in Python, and treating it as 0 would plot a real "no data"
        # as a real "no coverage", which is a different claim. Both are wrong;
        # this snapshot's pct is genuinely unknown, so it becomes None.
        is_number = isinstance(ratio, (int, float)) and not isinstance(ratio, bool)
        pct = round(ratio * 100, 1) if is_number and ratio >= 0 else None
        years.append({"year": year, "total": int(total), "withHours": int(with_hours), "pct": pct})
    return years


def build_town(label: str, bbox: str) -> dict | None:
    print(f"  {label} ... ", end="", flush=True)
    try:
        raw = fetch_ratio(bbox)
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as e:
        print(f"skipped, {e}")
        return None
    years = shape_years(raw)
    if not years:
        print("skipped, no usable years in the response")
        return None
    print(f"ok, {len(years)} snapshots, "
          f"{years[0]['pct']}% ({years[0]['year']}) to {years[-1]['pct']}% ({years[-1]['year']})")
    return {"label": label, "bbox": bbox, "category": "amenity=restaurant", "years": years}


def main() -> int:
    print(f"Building {OUT_PATH} from ohsome, {len(TOWNS)} towns.")
    print("Each call is slow (ohsome reads full edit history); be patient.\n")
    out: dict = {}
    failed: list[str] = []
    for i, t in enumerate(TOWNS):
        entry = build_town(t["label"], t["bbox"])
        if entry:
            out[t["match"]] = entry
        else:
            failed.append(t["label"])
        if i < len(TOWNS) - 1:
            time.sleep(PAUSE_BETWEEN_TOWNS_S)

    with open(OUT_PATH, "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")

    print(f"\nWrote {OUT_PATH} with {len(out)} of {len(TOWNS)} towns.")
    if failed:
        print(f"Skipped (not fabricated): {', '.join(failed)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
