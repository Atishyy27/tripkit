"""The trip spec: everything that makes one trip different from another."""
from __future__ import annotations
import datetime as dt, re
from dataclasses import dataclass, field, asdict
from typing import Any

try:
    import yaml
except ImportError:  # keep the import error actionable
    yaml = None


class SpecError(ValueError):
    """Raised with a message a human can act on, never a stack trace."""


@dataclass
class Place:
    name: str
    role: str = "destination"      # destination | hub | side-trip
    lat: float | None = None
    lng: float | None = None

    @property
    def slug(self) -> str:
        return re.sub(r"[^a-z0-9]+", "-", self.name.lower()).strip("-")


@dataclass
class Spec:
    # identity
    title: str
    traveller: str | None = None
    favicon: str = "🧭"

    # geography
    places: list[Place] = field(default_factory=list)
    hub: str | None = None                # where they arrive and leave from
    country: str = ""
    timezone: str = "Asia/Kolkata"
    tz_offset_minutes: int = 330          # used by the browser engine, no tz db needed
    currency: str = "INR"
    currency_symbol: str = "₹"

    # the clock, which is the whole point
    arrive: dt.datetime | None = None
    depart: dt.datetime | None = None
    hub_to_dest_minutes: int = 30         # travel time between hub and main destination
    exit_buffer_minutes: int = 75         # leave the destination this early for a calm exit

    # who is travelling
    profile: list[str] = field(default_factory=list)   # solo, female, backpacker, family...
    languages: list[str] = field(default_factory=list) # phrases get generated in these
    interests: list[str] = field(default_factory=list)

    # research
    slices: list[str] = field(default_factory=list)
    parallel: int = 8
    model: str = "sonnet"

    # output
    out: str = "site"
    repo: str | None = None               # owner/name for gh pages deploy

    # ---------- derived ----------
    @property
    def dest(self) -> Place:
        for p in self.places:
            if p.role == "destination":
                return p
        if not self.places:
            raise SpecError("spec has no places; add at least one under `places:`")
        return self.places[0]

    @property
    def hub_place(self) -> Place | None:
        if self.hub:
            for p in self.places:
                if p.name.lower() == self.hub.lower():
                    return p
        for p in self.places:
            if p.role == "hub":
                return p
        return None

    @property
    def is_single_day(self) -> bool:
        if not (self.arrive and self.depart):
            return False
        return (self.depart - self.arrive) <= dt.timedelta(hours=26)

    @property
    def window_hours(self) -> float | None:
        if not (self.arrive and self.depart):
            return None
        return round((self.depart - self.arrive).total_seconds() / 3600, 1)

    def minutes(self, when: dt.datetime | None) -> int | None:
        return None if when is None else when.hour * 60 + when.minute

    def place_names(self) -> list[str]:
        return [p.name for p in self.places]

    def describe(self) -> str:
        """One paragraph the research prompts can paste in verbatim."""
        head = f"A trip to {', '.join(self.place_names())}"
        if self.country:
            head += f", {self.country}"
        clauses = []
        if self.arrive and self.depart:
            same = self.arrive.date() == self.depart.date()
            clauses.append(
                f"arriving {self.arrive:%A %d %B %Y} at {self.arrive:%H:%M} and leaving "
                + (f"the same day at {self.depart:%H:%M}" if same
                   else f"on {self.depart:%A %d %B} at {self.depart:%H:%M}")
                + f", a window of {self.window_hours} hours")
        if self.hub:
            clauses.append(f"arriving and departing through {self.hub}")
        if self.profile:
            clauses.append("travelling " + ", ".join(self.profile))
        if self.interests:
            clauses.append("interested in " + ", ".join(self.interests))
        if not clauses:
            return head + "."
        return head + ", " + "; ".join(clauses) + "."

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["arrive"] = self.arrive.isoformat() if self.arrive else None
        d["depart"] = self.depart.isoformat() if self.depart else None
        return d


DEFAULT_SLICES = [
    "sights", "food", "transport", "safety", "shopping",
    "experiences", "offbeat", "phrases", "conditions", "help",
]


def _dt(v: Any, field_name: str) -> dt.datetime | None:
    if v is None:
        return None
    if isinstance(v, dt.datetime):
        return v
    if isinstance(v, dt.date):
        return dt.datetime.combine(v, dt.time())
    s = str(v).strip().replace("Z", "").replace("/", "-")
    for f in ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(s, f)
        except ValueError:
            continue
    raise SpecError(
        f"could not read `{field_name}: {v}`. Use 2026-09-06T06:00 or 2026-09-06 06:00.")


def load(path: str) -> Spec:
    if yaml is None:
        raise SpecError("pyyaml is not installed. Run: pip install pyyaml")
    with open(path, encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    if not isinstance(raw, dict):
        raise SpecError(f"{path} should be a YAML mapping, got {type(raw).__name__}")

    trip = raw.get("trip", raw)
    places: list[Place] = []
    for p in trip.get("places", []):
        if isinstance(p, str):
            places.append(Place(name=p))
        elif isinstance(p, dict):
            if "name" not in p:
                raise SpecError(f"a place entry is missing `name`: {p}")
            places.append(Place(**{k: v for k, v in p.items()
                                   if k in ("name", "role", "lat", "lng")}))
        else:
            raise SpecError(f"cannot read place entry: {p!r}")
    if not places:
        raise SpecError("spec needs at least one entry under `trip.places`")

    hub = trip.get("hub")
    if hub and not any(p.name.lower() == str(hub).lower() for p in places):
        places.append(Place(name=str(hub), role="hub"))

    research = raw.get("research", {}) or {}
    site = raw.get("site", {}) or {}

    spec = Spec(
        title=site.get("title") or trip.get("title") or f"{places[0].name} trip",
        traveller=trip.get("traveller"),
        favicon=site.get("favicon", "🧭"),
        places=places,
        hub=hub,
        country=trip.get("country", ""),
        timezone=trip.get("timezone", "Asia/Kolkata"),
        tz_offset_minutes=int(trip.get("tz_offset_minutes", 330)),
        currency=trip.get("currency", "INR"),
        currency_symbol=trip.get("currency_symbol", "₹"),
        arrive=_dt(trip.get("arrive"), "arrive"),
        depart=_dt(trip.get("depart"), "depart"),
        hub_to_dest_minutes=int(trip.get("hub_to_dest_minutes", 30)),
        exit_buffer_minutes=int(trip.get("exit_buffer_minutes", 75)),
        profile=list(trip.get("profile", [])),
        languages=list(trip.get("languages", [])),
        interests=list(trip.get("interests", [])),
        slices=list(research.get("slices", DEFAULT_SLICES)),
        parallel=int(research.get("parallel", 8)),
        model=research.get("model", "sonnet"),
        out=site.get("out", "site"),
        repo=site.get("repo"),
    )
    if spec.arrive and spec.depart and spec.depart <= spec.arrive:
        raise SpecError(
            f"depart ({spec.depart}) is not after arrive ({spec.arrive}). "
            "If the trip crosses midnight, give full dates on both.")
    bad = [s for s in spec.slices if not re.fullmatch(r"[a-z0-9_-]+", s)]
    if bad:
        raise SpecError(f"slice names must be lowercase slugs; bad: {bad}")
    return spec
