"""
Pluggable web search.

Why this exists: the first run of this pipeline leaned on the coding agent's own
built-in search, hit a 200-query session cap partway through, and five of twelve
research slices silently degraded to blind URL guessing. Search that can run out
without telling you is worse than no search. So it is a real dependency now, with
a named provider, an explicit key, and a visible quota error.
"""
from __future__ import annotations
import json, os, urllib.parse, urllib.request
from dataclasses import dataclass, asdict


class SearchError(RuntimeError):
    pass


@dataclass
class Hit:
    title: str
    url: str
    snippet: str = ""
    published: str | None = None

    def as_prompt_line(self) -> str:
        d = f" ({self.published})" if self.published else ""
        return f"- {self.title}{d}\n  {self.url}\n  {self.snippet}".rstrip()


def _get(url: str, headers: dict, timeout: int = 25) -> dict:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _post(url: str, headers: dict, body: dict, timeout: int = 30) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data,
                                 headers={**headers, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


# ---------------- providers ----------------

def _brave(q: str, n: int) -> list[Hit]:
    key = os.environ["BRAVE_API_KEY"]
    url = "https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode(
        {"q": q, "count": min(n, 20)})
    d = _get(url, {"Accept": "application/json", "X-Subscription-Token": key})
    return [Hit(r.get("title", ""), r.get("url", ""),
                r.get("description", ""), r.get("age"))
            for r in (d.get("web", {}).get("results") or [])][:n]


def _tavily(q: str, n: int) -> list[Hit]:
    d = _post("https://api.tavily.com/search", {},
              {"api_key": os.environ["TAVILY_API_KEY"], "query": q,
               "max_results": min(n, 20), "search_depth": "advanced"})
    return [Hit(r.get("title", ""), r.get("url", ""), r.get("content", ""))
            for r in d.get("results", [])][:n]


def _serper(q: str, n: int) -> list[Hit]:
    d = _post("https://google.serper.dev/search",
              {"X-API-KEY": os.environ["SERPER_API_KEY"]},
              {"q": q, "num": min(n, 20)})
    return [Hit(r.get("title", ""), r.get("link", ""),
                r.get("snippet", ""), r.get("date"))
            for r in d.get("organic", [])][:n]


def _exa(q: str, n: int) -> list[Hit]:
    d = _post("https://api.exa.ai/search",
              {"x-api-key": os.environ["EXA_API_KEY"]},
              {"query": q, "numResults": min(n, 20), "contents": {"text": True}})
    return [Hit(r.get("title", ""), r.get("url", ""),
                (r.get("text") or "")[:600], r.get("publishedDate"))
            for r in d.get("results", [])][:n]


PROVIDERS = {
    "brave":  ("BRAVE_API_KEY",  _brave),
    "tavily": ("TAVILY_API_KEY", _tavily),
    "serper": ("SERPER_API_KEY", _serper),
    "exa":    ("EXA_API_KEY",    _exa),
}


def available() -> list[str]:
    return [n for n, (env, _) in PROVIDERS.items() if os.environ.get(env)]


def pick(prefer: str | None = None) -> str | None:
    """Return a provider name, or None meaning 'let the agent search for itself'."""
    if prefer in ("none", "claude"):
        return None
    if prefer:
        if prefer not in PROVIDERS:
            raise SearchError(f"unknown search provider {prefer!r}. "
                              f"Known: {', '.join(PROVIDERS)}, or 'claude'.")
        env = PROVIDERS[prefer][0]
        if not os.environ.get(env):
            raise SearchError(f"--search {prefer} needs {env} in your environment.")
        return prefer
    a = available()
    return a[0] if a else None


def run(queries: list[str], provider: str, per_query: int = 8) -> list[Hit]:
    """Run every query, dedupe on URL, keep first-seen order."""
    fn = PROVIDERS[provider][1]
    seen, out, failures = set(), [], []
    for q in queries:
        try:
            hits = fn(q, per_query)
        except KeyError as e:
            raise SearchError(f"{provider} needs {e} set") from None
        except Exception as e:  # noqa: BLE001
            failures.append(f"{q!r}: {e}")
            continue
        for h in hits:
            if h.url and h.url not in seen:
                seen.add(h.url)
                out.append(h)
    if failures and not out:
        raise SearchError(f"every {provider} query failed:\n  " + "\n  ".join(failures))
    return out


def as_context(hits: list[Hit], limit: int = 60) -> str:
    if not hits:
        return "(no search results were retrieved for this slice)"
    return "\n".join(h.as_prompt_line() for h in hits[:limit])
