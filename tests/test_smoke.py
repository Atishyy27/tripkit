"""
Smoke tests. No network, no model. These build a real site from committed research
and assert the things a user would notice within ten seconds of it being broken.

A page that renders empty still exits zero, so "the command succeeded" is not a
test. These check the output.
"""
import json
import os
import re
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(ROOT, "examples", "pushkar-arya.yaml")

pytestmark = pytest.mark.skipif(
    not os.path.isdir(os.path.join(ROOT, "examples", "research")),
    reason="the committed example research is not present")


def run(*args, expect_ok=True):
    p = subprocess.run([sys.executable, "-m", "tripkit", *args],
                       cwd=ROOT, capture_output=True, text=True, timeout=300)
    if expect_ok:
        assert p.returncode == 0, f"exit {p.returncode}\nstdout:\n{p.stdout}\nstderr:\n{p.stderr}"
    return p


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("site")
    run("build", SPEC, "--out", str(out))
    return str(out)


class TestCli:
    def test_help_lists_every_command(self):
        p = run("--help")
        for cmd in ("doctor", "new", "osm", "research", "verify", "build", "deploy", "run"):
            assert cmd in p.stdout

    def test_doctor_runs_without_credentials_and_says_what_is_missing(self):
        p = run("doctor", expect_ok=False)
        combined = p.stdout + p.stderr
        assert "Claude access" in combined
        assert "Search" in combined

    def test_a_missing_spec_fails_with_a_message_not_a_traceback(self):
        p = run("build", "does-not-exist.yaml", expect_ok=False)
        assert p.returncode != 0
        assert "Traceback" not in p.stderr, "users should never see a raw traceback"

    def test_new_writes_a_spec_that_loads(self, tmp_path):
        target = tmp_path / "x.yaml"
        run("new", "Jaipur", "--path", str(target))
        assert target.exists()
        sys.path.insert(0, ROOT)
        from tripkit.spec import load
        s = load(str(target))
        assert s.dest.name == "Jaipur"


class TestBuiltSite:
    def test_produces_pages(self, built):
        pages = [f for f in os.listdir(built) if f.endswith(".html")]
        assert len(pages) >= 8, f"only got {pages}"
        assert "index.html" in pages

    def test_no_page_is_a_stub(self, built):
        for f in sorted(os.listdir(built)):
            if not f.endswith(".html"):
                continue
            n = os.path.getsize(os.path.join(built, f))
            assert n > 900, f"{f} is {n} bytes, which is not a page"

    def test_every_page_loads_the_data_and_the_engine(self, built):
        for f in os.listdir(built):
            if not f.endswith(".html"):
                continue
            html = open(os.path.join(built, f), encoding="utf-8").read()
            assert "assets/data.js" in html, f"{f} does not load the data"
            assert "assets/core.js" in html, f"{f} does not load the engine"
            assert "mountChrome" in html, f"{f} never mounts its navigation"

    def test_assets_are_present(self, built):
        for a in ("style.css", "core.js", "data.js"):
            p = os.path.join(built, "assets", a)
            assert os.path.exists(p) and os.path.getsize(p) > 500, a

    def test_data_is_valid_json_with_every_key(self, built):
        raw = open(os.path.join(built, "assets", "data.js"), encoding="utf-8").read()
        data = json.loads(raw[raw.index("=") + 1:].strip().rstrip(";"))
        for key in ("places", "config", "conditions", "move", "say", "help", "buy", "scams"):
            assert key in data, f"{key} missing entirely; an empty value is fine, a missing key is not"
        assert isinstance(data["places"], list) and data["places"]

    def test_config_carries_what_the_engine_needs(self, built):
        raw = open(os.path.join(built, "assets", "data.js"), encoding="utf-8").read()
        cfg = json.loads(raw[raw.index("=") + 1:].strip().rstrip(";"))["config"]
        for key in ("dest", "arrive", "depart", "tzOffsetMinutes", "currencySymbol", "nav"):
            assert key in cfg, key
        assert re.fullmatch(r"\d{2}:\d{2}", cfg["arrive"])
        assert cfg["nav"], "navigation must not be empty or every page is a dead end"

    def test_no_place_claims_hours_it_cannot_support(self, built):
        raw = open(os.path.join(built, "assets", "data.js"), encoding="utf-8").read()
        places = json.loads(raw[raw.index("=") + 1:].strip().rstrip(";"))["places"]
        for p in places:
            if p.get("open"):
                assert re.fullmatch(r"\d{2}:\d{2}", p["open"]), (p["name"], p["open"])
            if p.get("shut"):
                assert len(p["shut"]) == 2, (p["name"], p["shut"])

    def test_every_place_has_a_usable_position(self, built):
        raw = open(os.path.join(built, "assets", "data.js"), encoding="utf-8").read()
        for p in json.loads(raw[raw.index("=") + 1:].strip().rstrip(";"))["places"]:
            assert -90 <= p["lat"] <= 90 and -180 <= p["lng"] <= 180, p["name"]

    def test_ids_are_unique(self, built):
        raw = open(os.path.join(built, "assets", "data.js"), encoding="utf-8").read()
        ids = [p["id"] for p in json.loads(raw[raw.index("=") + 1:].strip().rstrip(";"))["places"]]
        assert len(ids) == len(set(ids))

    def test_the_build_is_deterministic(self, tmp_path):
        a, b = tmp_path / "a", tmp_path / "b"
        run("build", SPEC, "--out", str(a))
        run("build", SPEC, "--out", str(b))
        ra = open(a / "assets" / "data.js", encoding="utf-8").read()
        rb = open(b / "assets" / "data.js", encoding="utf-8").read()
        da = json.loads(ra[ra.index("=") + 1:].strip().rstrip(";"))
        db = json.loads(rb[rb.index("=") + 1:].strip().rstrip(";"))
        assert [p["id"] for p in da["places"]] == [p["id"] for p in db["places"]]


class TestWebApp:
    DOCS = os.path.join(ROOT, "docs")

    def test_the_shell_exists(self):
        for f in ("index.html", "app.js", "engine.js", "sources.js", "sun.js",
                  "style.css", "sw.js", "manifest.webmanifest", "icon.svg"):
            assert os.path.exists(os.path.join(self.DOCS, f)), f

    def test_leaflet_is_vendored_rather_than_hotlinked(self):
        assert os.path.getsize(os.path.join(self.DOCS, "vendor", "leaflet.js")) > 100000
        html = open(os.path.join(self.DOCS, "index.html"), encoding="utf-8").read()
        assert "vendor/leaflet.js" in html
        assert "unpkg.com" not in html, "a CDN tag would break the app offline"

    def test_the_service_worker_caches_everything_the_shell_needs(self):
        sw = open(os.path.join(self.DOCS, "sw.js"), encoding="utf-8").read()
        for f in ("index.html", "app.js", "engine.js", "sources.js", "sun.js",
                  "style.css", "vendor/leaflet.js"):
            assert f in sw, f"{f} is not cached, so the app breaks offline"

    def test_the_service_worker_refuses_to_cache_other_peoples_apis(self):
        sw = open(os.path.join(self.DOCS, "sw.js"), encoding="utf-8").read()
        assert "origin !== location.origin" in sw, (
            "caching OpenStreetMap or Wikivoyage responses would serve stale opening "
            "hours as though they were current")

    def test_the_manifest_is_valid_and_installable(self):
        m = json.load(open(os.path.join(self.DOCS, "manifest.webmanifest"), encoding="utf-8"))
        assert m["display"] == "standalone"
        assert m["start_url"] and m["icons"]

    def test_the_page_credits_both_data_sources(self):
        html = open(os.path.join(self.DOCS, "index.html"), encoding="utf-8").read()
        assert "OpenStreetMap" in html and "Wikivoyage" in html


class TestHouseStyle:
    def test_no_em_dashes_in_shipped_code_or_docs(self):
        # Built from its codepoint, not typed, so this file does not flag itself.
        EM = chr(0x2014)
        bad = []
        for root, dirs, files in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in
                       {".git", "__pycache__", "demo", "examples", "node_modules",
                        ".pytest_cache", "vendor"}]
            for f in files:
                if not f.endswith((".py", ".js", ".md", ".html", ".css")):
                    continue
                p = os.path.join(root, f)
                if EM in open(p, encoding="utf-8", errors="ignore").read():
                    bad.append(os.path.relpath(p, ROOT))
        assert not bad, f"em dashes found in: {bad}"

    def test_no_broken_regex_quantifiers(self):
        """
        A cosmetic sweep once inserted a space after every comma, including the
        ones inside regex quantifiers. The result stayed valid Python, kept passing
        every syntax check, and silently stopped matching anything. Only a
        behaviour test caught it.

        The offending pattern is built here rather than written out, because a file
        that spells out what it forbids will always flag itself.
        """
        bad = []
        for root, dirs, files in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in
                       {".git", "__pycache__", "demo", "node_modules", ".pytest_cache", "vendor"}]
            for f in files:
                if not f.endswith((".py", ".js")):
                    continue
                p = os.path.join(root, f)
                if re.search(r"\{" + r"\d+,\s+\d+" + r"\}", open(p, encoding="utf-8", errors="ignore").read()):
                    bad.append(os.path.relpath(p, ROOT))
        assert not bad, f"a regex quantifier contains a space in: {bad}"
