"""
Normalise, validate and dedupe research output into one dataset.

The dedupe rule is worth explaining, because the naive version has a bug that is
easy to ship and hard to notice. Matching on the exact name leaves "Pushkar Lake
and the 52 ghats" and "Pushkar Lake (and the 52 ghats)" as two rows. Stripping
bracketed text before matching fixes that pair but breaks the opposite case:
"Ajmer Sharif Dargah" and "Ajmer Sharif Dargah (Khwaja Moinuddin Chishti)"
collapse to a four-character key that then collides with everything.

So: keep bracketed words, drop generic filler and the place name itself, and only
allow substring matching above a length floor where a shared prefix is real
evidence rather than coincidence.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field

FILLER = {
    "the", "a", "an", "and", "of", "at", "in", "on", "de", "la", "le", "el",
    "temple", "mandir", "church", "mosque", "masjid", "museum", "cafe", "café",
    "restaurant", "hotel", "shop", "store", "market", "bazaar", "bazar",
    "shri", "sri", "ji", "sh", "st", "saint",
}
TIME_RE = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")
MIN_KEY, MIN_SUBSTR = 7, 9


def norm_name(name: str, place_words: set[str]) -> str:
    n = name.replace("(", " ").replace(")", " ").replace("&", " and ")
    words = [w for w in re.split(r"[^a-z0-9]+", n.lower()) if w]
    kept = [w for w in words if w not in FILLER and w not in place_words]
    return "".join(kept or words)


def _match(key: str, index: dict) -> str | None:
    if key in index:
        return key
    if len(key) < MIN_KEY:
        return None
    for other in index:
        if len(other) < MIN_KEY:
            continue
        if (len(key) >= MIN_SUBSTR and key in other) or \
           (len(other) >= MIN_SUBSTR and other in key):
            return other
    return None


def _clean_time(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() in ("null", "none", "n/a", "-"):
        return None
    m = re.match(r"^(\d{1,2})[:.](\d{2})", s)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 24 and 0 <= mi < 60:
            return f"{min(h,23):02d}:{mi:02d}"
    m = re.match(r"^(\d{1,2})\s*(am|pm)$", s, re.I)
    if m:
        h = int(m.group(1)) % 12 + (12 if m.group(2).lower() == "pm" else 0)
        return f"{h:02d}:00"
    return None


def _num(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    m = re.search(r"\d+(?:\.\d+)?", str(v).replace(",", ""))
    return round(float(m.group()), 2) if m else None


@dataclass
class Report:
    kept: int = 0
    merged: int = 0
    dropped: int = 0
    reasons: list[str] = field(default_factory=list)

    def note(self, why: str):
        if len(self.reasons) < 40:
            self.reasons.append(why)


def normalise_place(p: dict, towns: list[str], default_town: str,
                    centre: tuple[float, float], rep: Report) -> dict | None:
    if not isinstance(p, dict) or not str(p.get("name", "")).strip():
        rep.dropped += 1
        rep.note("entry with no name")
        return None

    o = dict(p)
    o["name"] = str(o["name"]).strip()

    town = str(o.get("town", "") or "").strip().lower()
    o["town"] = town if town in towns else default_town

    lat, lng = _num(o.get("lat")), _num(o.get("lng"))
    if lat is None or lng is None or not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        lat, lng = centre
        o["loose"] = True
    o["lat"], o["lng"] = lat, lng
    o["loose"] = bool(o.get("loose", False))

    o["open"], o["close"] = _clean_time(o.get("open")), _clean_time(o.get("close"))
    shut = o.get("shut")
    o["shut"] = ([_clean_time(shut[0]), _clean_time(shut[1])]
                 if isinstance(shut, list) and len(shut) == 2
                 and _clean_time(shut[0]) and _clean_time(shut[1]) else None)

    best = o.get("best") or []
    o["best"] = [t for t in (_clean_time(b) for b in best if b) if t] \
        if isinstance(best, list) else []

    lo, hi = _num(o.get("lo")), _num(o.get("hi"))
    if lo is not None and hi is not None and hi < lo:
        lo, hi = hi, lo
    o["lo"], o["hi"] = lo, hi

    d = _num(o.get("dur"))
    o["dur"] = int(d) if d and 1 <= d <= 1440 else 30

    o["tags"] = [str(t).strip().lower() for t in (o.get("tags") or [])
                 if isinstance(t, (str, int))]
    for k in ("why", "warn", "priceNote", "days", "src", "cat"):
        v = o.get(k)
        o[k] = str(v).strip() if isinstance(v, str) and v.strip() else None
    o["cat"] = o["cat"] or "do"
    o["why"] = o["why"] or ""

    src = o.get("src")
    if src and not str(src).startswith("http"):
        o["src"] = None

    o["id"] = re.sub(r"[^a-z0-9]+", "-", str(o.get("id") or o["name"]).lower()).strip("-")[:48]
    return o


def merge_places(batches: dict[str, list], towns: list[str], default_town: str,
                 centre: tuple[float, float]) -> tuple[list[dict], Report]:
    rep, index, out = Report(), {}, []
    place_words = {w for t in towns for w in re.split(r"[^a-z]+", t) if w}

    for slice_name, rows in batches.items():
        if not isinstance(rows, list):
            rep.note(f"{slice_name}: expected a list, got {type(rows).__name__}")
            continue
        for raw in rows:
            p = normalise_place(raw, towns, default_town, centre, rep)
            if not p:
                continue
            p.setdefault("_from", slice_name)
            key = norm_name(p["name"], place_words)
            hit = _match(key, index)
            if hit:
                tgt = index[hit]
                for k, v in p.items():
                    if k.startswith("_"):
                        continue
                    if v not in (None, "", []) and tgt.get(k) in (None, "", []):
                        tgt[k] = v
                # union the tags rather than letting the first writer win
                tgt["tags"] = sorted(set(tgt.get("tags", [])) | set(p.get("tags", [])))
                rep.merged += 1
                continue
            index[key] = p
            out.append(p)
            rep.kept += 1

    seen_ids = set()
    for p in out:
        base, i = p["id"] or "x", 2
        while p["id"] in seen_ids:
            p["id"] = f"{base}-{i}"
            i += 1
        seen_ids.add(p["id"])
    return out, rep


def keep_list(rows, required: tuple[str, ...]) -> list[dict]:
    """Generic keeper for the non-place shapes; drops rows missing their key field."""
    if not isinstance(rows, list):
        return []
    out = []
    for r in rows:
        if isinstance(r, dict) and any(str(r.get(k, "")).strip() for k in required):
            out.append(r)
    return out


def stats(places: list[dict]) -> dict:
    return {
        "total": len(places),
        "with_hours": sum(1 for p in places if p.get("open")),
        "with_src": sum(1 for p in places if p.get("src")),
        "exact_coords": sum(1 for p in places if not p.get("loose")),
        "by_cat": {c: sum(1 for p in places if p.get("cat") == c)
                   for c in sorted({p.get("cat") for p in places if p.get("cat")})},
    }
