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


try:
    import tomllib as _toml
except ModuleNotFoundError:          # stdlib only from 3.11, and we support 3.10
    try:
        import tomli as _toml
    except ModuleNotFoundError:
        _toml = None


@pytest.mark.skipif(_toml is None,
                    reason="needs tomllib (Python 3.11+) or tomli installed")
class TestPackaging:
    """
    A malformed pyproject still parses as TOML and still passes every syntax
    check. It only fails at install time, which in this project meant three CI
    jobs going red after the change had already been pushed.
    """

    @staticmethod
    def _meta():
        with open(os.path.join(ROOT, "pyproject.toml"), "rb") as f:
            return _toml.load(f)

    def test_pyproject_is_valid_toml(self):
        assert self._meta()["project"]["name"] == "tripkit"

    def test_optional_dependencies_are_lists_of_strings(self):
        extras = self._meta()["project"].get("optional-dependencies", {})
        for name, deps in extras.items():
            assert isinstance(deps, list), (
                f"extra {name!r} is a {type(deps).__name__}; a nested table here is "
                f"valid TOML and invalid package metadata")
            assert all(isinstance(d, str) for d in deps), name

    def test_dependencies_are_a_list_of_strings(self):
        deps = self._meta()["project"]["dependencies"]
        assert isinstance(deps, list) and all(isinstance(d, str) for d in deps)

    def test_the_entry_point_names_something_importable(self):
        script = self._meta()["project"]["scripts"]["tripkit"]
        mod, _, fn = script.partition(":")
        import importlib
        assert hasattr(importlib.import_module(mod), fn), script

    def test_the_version_matches_the_package(self):
        import tripkit
        assert self._meta()["project"]["version"] == tripkit.__version__

    def test_the_changelog_documents_the_current_version(self):
        import tripkit
        text = open(os.path.join(ROOT, "CHANGELOG.md"), encoding="utf-8").read()
        assert f"[{tripkit.__version__}]" in text, (
            f"CHANGELOG.md has no entry for {tripkit.__version__}")


class TestGeneratedSiteEscaping:
    """
    The CLI writes place data into a JSON file and a JavaScript engine renders it
    into innerHTML. That data came from OpenStreetMap, Wikivoyage or a language
    model, none of which this program controls, and for a while the engine escaped
    none of it. A place named with a script tag would have run.
    """

    ENGINE = os.path.join(ROOT, "templates", "assets", "core.js")

    def _engine(self):
        return open(self.ENGINE, encoding="utf-8").read()

    def test_the_engine_has_an_escaper(self):
        src = self._engine()
        assert "const esc =" in src, "no escaping function at all"
        for entity in ("&amp;", "&lt;", "&gt;", "&quot;"):
            assert entity in src, f"the escaper does not produce {entity}"

    def test_every_untrusted_field_is_escaped_where_it_is_rendered(self):
        src = self._engine()
        i = src.index("function placeCard")
        depth, j = 0, i
        while j < len(src):
            if src[j] == "{":
                depth += 1
            elif src[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        card = src[i:j + 1]
        for field in ("p.name", "p.why", "p.warn", "st.label"):
            assert f"esc({field})" in card, f"{field} reaches innerHTML unescaped"

    def test_a_source_link_cannot_carry_a_javascript_scheme(self):
        src = self._engine()
        assert "function safeUrl" in src, "no url scheme check"
        assert "safeUrl(p.src)" in src, "the source link bypasses the scheme check"
        assert 'protocol === "http:"' in src and 'protocol === "https:"' in src

    def test_a_hostile_place_name_reaches_the_data_but_not_the_markup(self, tmp_path):
        """End to end: build a site from a place named with a script tag."""
        import json, shutil
        work = tmp_path / "hostile"
        (work / "research").mkdir(parents=True)
        json.dump([{
            "name": "<img src=x onerror=alert(1)>", "cat": "view", "town": "pushkar",
            "lat": 26.48, "lng": 74.55, "dur": 30,
            "why": "</script><script>alert(2)</script>",
            "warn": '" onmouseover="alert(3)',
            "src": "javascript:alert(4)",
        }], open(work / "research" / "sights.json", "w"))
        spec = open(SPEC, encoding="utf-8").read().replace(
            "slices: [sights, food, transport, safety, shopping, experiences, offbeat, phrases, conditions, help]",
            "slices: [sights]")
        (work / "t.yaml").write_text(spec, encoding="utf-8")
        run("build", str(work / "t.yaml"))

        out = work / "site"
        data = (out / "assets" / "data.js").read_text(encoding="utf-8")
        assert "onerror" in data, "the payload should be present as data"

        # every page is a template; none of them may contain the payload inline
        for f in out.glob("*.html"):
            html = f.read_text(encoding="utf-8")
            assert "onerror=alert" not in html, f"{f.name} contains the payload inline"

        engine = (out / "assets" / "core.js").read_text(encoding="utf-8")
        assert "esc(p.name)" in engine and "safeUrl(p.src)" in engine
