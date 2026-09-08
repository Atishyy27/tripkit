"""
Live tests against the real, free, shared services.

Opt in, because these depend on somebody else's servers being up and on you not
hammering them:

    TRIPKIT_LIVE=1 pytest tests/test_live.py -v

They are not in CI. A red build caused by Overpass being busy teaches nobody
anything, and a CI job that retries against a volunteer-run API is rude.

What they are for: catching the day an upstream API changes shape underneath us,
which no amount of mocking will ever notice.
"""
import json
import os
import time
import urllib.parse
import urllib.request

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("TRIPKIT_LIVE") != "1",
    reason="set TRIPKIT_LIVE=1 to run tests that hit real services")

UA = {"User-Agent": "tripkit-tests/0.2 (https://github.com/Atishyy27/tripkit)"}


def get(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


@pytest.fixture(autouse=True)
def be_polite():
    """These are volunteer-run services. Space the calls out."""
    yield
    time.sleep(1.5)


class TestNominatim:
    def test_finds_a_small_town_and_returns_what_we_rely_on(self):
        rows = get("https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": "Pushkar, Rajasthan", "format": "jsonv2", "limit": "3",
             "addressdetails": "1"}))
        assert rows, "no result for a town that definitely exists"
        r = rows[0]
        for key in ("lat", "lon", "display_name", "boundingbox"):
            assert key in r, f"Nominatim stopped returning {key}, the app depends on it"
        assert 20 < float(r["lat"]) < 30 and 70 < float(r["lon"]) < 80


class TestOverpass:
    def test_returns_places_with_the_tags_we_parse(self):
        import sys
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from tripkit.osm import build_query, to_places

        q = build_query(38.7078, -9.1366, 700)          # central Lisbon, dense and well mapped
        data = urllib.parse.urlencode({"data": q}).encode()
        req = urllib.request.Request("https://overpass-api.de/api/interpreter",
                                     data=data, headers=UA)
        with urllib.request.urlopen(req, timeout=180) as r:
            els = json.loads(r.read().decode("utf-8", "replace")).get("elements", [])

        assert len(els) > 50, f"only {len(els)} elements from central Lisbon, query may be wrong"
        places = to_places(els, "lisbon")
        assert places, "elements came back but none survived mapping"
        assert any(p["open"] for p in places), "not one place had parseable opening hours"
        assert all(p["src"].startswith("https://www.openstreetmap.org/") for p in places)


class TestWikivoyage:
    def test_article_wikitext_still_contains_listing_templates(self):
        d = get("https://en.wikivoyage.org/w/api.php?" + urllib.parse.urlencode(
            {"action": "parse", "page": "Pushkar", "prop": "wikitext",
             "format": "json", "formatversion": "2", "redirects": "1"}))
        assert "parse" in d, f"unexpected shape: {list(d)[:5]}"
        wt = d["parse"]["wikitext"]
        assert "{{see" in wt or "{{listing" in wt, (
            "Wikivoyage listing templates are how descriptions are extracted; if these "
            "are gone the parser needs rewriting")

    def test_search_finds_an_article_for_a_place_named_indirectly(self):
        d = get("https://en.wikivoyage.org/w/api.php?" + urllib.parse.urlencode(
            {"action": "query", "list": "search", "srsearch": "Ajmer India",
             "srlimit": "3", "format": "json", "formatversion": "2"}))
        titles = [r["title"] for r in d["query"]["search"]]
        assert titles


class TestEndToEnd:
    def test_the_browser_pipeline_produces_a_usable_guide(self):
        """Runs docs/e2e.js, which is the same code path the web app uses."""
        import subprocess
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        p = subprocess.run(["node", os.path.join(root, "docs", "e2e.js")],
                           capture_output=True, text=True, timeout=600, cwd=root)
        assert p.returncode == 0, p.stderr[-2000:]
        out = p.stdout
        assert "RESULT" in out, out[-1500:]
        # every run must end with places that carry a sentence a person wrote,
        # which is the whole claim the project makes
        for line in out.splitlines():
            if "RESULT" in line:
                assert "places" in line


class TestCoverageClaim:
    """
    Reproduces the opening_hours coverage table in README.md.

    The table used to be a bare set of numbers with nothing in the repo that could
    regenerate them, which meant nobody could check it and a stale figure could sit
    there for months. It did: the published table compared restaurants-only in Munich
    against all POIs elsewhere, which inflated the contrast, and its counts came from a
    superseded version of the query.

    This does not assert the exact integers. OpenStreetMap changes daily and a test that
    pins a live count is a test that fails for no reason. It asserts the claim the README
    actually makes: measured with ONE query at ONE radius, a well mapped European centre
    has dramatically better opening_hours coverage than a small Rajasthani town.
    """

    RADIUS_M = 700
    AREAS = {
        "Munich centre": (48.1372, 11.5756),
        "Lisbon centre": (38.7078, -9.1366),
        "Pushkar": (26.4899, 74.5511),
        "Ajmer": (26.4499, 74.6399),
    }

    def _measure(self, lat, lng):
        import sys
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from tripkit.osm import build_query

        q = build_query(lat, lng, self.RADIUS_M)
        data = urllib.parse.urlencode({"data": q}).encode()
        req = urllib.request.Request("https://overpass-api.de/api/interpreter",
                                     data=data, headers=UA)
        with urllib.request.urlopen(req, timeout=180) as r:
            els = json.loads(r.read().decode("utf-8", "replace")).get("elements", [])
        total = len(els)
        with_oh = sum(1 for e in els if (e.get("tags") or {}).get("opening_hours"))
        return total, with_oh

    def test_the_regional_gap_survives_an_identical_query(self):
        pct = {}
        for name, (lat, lng) in self.AREAS.items():
            total, with_oh = self._measure(lat, lng)
            pct[name] = (100.0 * with_oh / total) if total else 0.0
            print(f"{name}: {with_oh}/{total} = {pct[name]:.0f}% "
                  f"(around:{self.RADIUS_M}m at {lat},{lng})")
            time.sleep(20)   # the public instance is volunteer run; do not hammer it

        assert pct["Munich centre"] > 40, (
            f"Munich centre fell to {pct['Munich centre']:.0f}%; the README claims dense "
            "European centres are well covered, so either that is no longer true or the "
            "query changed shape")
        assert pct["Pushkar"] < 20, (
            f"Pushkar rose to {pct['Pushkar']:.0f}%; good news for the map, but the "
            "README's 'honest limitation' section now overstates the gap and needs rewriting")
        assert pct["Munich centre"] > 3 * pct["Pushkar"], (
            "the gap the README is built on has closed; rewrite that section rather than "
            "loosening this test")
