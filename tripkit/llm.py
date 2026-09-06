"""
Talk to Claude, get JSON back, in parallel.

Two backends behind one function. The API backend uses the anthropic SDK; the CLI
backend shells out to `claude -p`, which means someone with a Claude subscription
can run this without ever creating an API key.
"""
from __future__ import annotations
import json, os, re, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from .auth import Auth

MODELS = {
    "opus":   "claude-opus-5",
    "sonnet": "claude-sonnet-5",
    "haiku":  "claude-haiku-4-5-20251001",
    "fable":  "claude-fable-5-1",
}
_print_lock = threading.Lock()


def log(msg: str) -> None:
    with _print_lock:
        sys.stderr.write(msg + "\n")
        sys.stderr.flush()


class LLMError(RuntimeError):
    pass


@dataclass
class Result:
    name: str
    ok: bool
    data: object = None
    raw: str = ""
    error: str = ""
    seconds: float = 0.0


# ---------------- JSON recovery ----------------

def extract_json(text: str):
    """
    Models wrap JSON in prose and fences no matter how firmly you ask them not to.
    Try the cheap paths first, then bracket-match, and only then give up. Returning
    a partial parse would be worse than failing, so this raises rather than guesses.
    """
    if not text or not text.strip():
        raise LLMError("empty response")
    s = text.strip()

    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass

    fence = re.search(r"```(?:json)?\s*\n(.*?)```", s, re.S)
    if fence:
        try:
            return json.loads(fence.group(1).strip())
        except json.JSONDecodeError:
            s = fence.group(1).strip()

    # Which structure did the model actually intend? Whichever bracket comes first.
    # This matters more than it looks: a TRUNCATED array fails to bracket-match, and
    # falling through to "{" then returns the first complete object inside it. That
    # looks like a clean parse, reports success, and silently discards every other
    # entry. Observed live: a 30-place slice arrived as 1 place and was logged "ok".
    first_arr, first_obj = s.find("["), s.find("{")
    intended = "[" if (first_arr >= 0 and (first_obj < 0 or first_arr < first_obj)) else "{"

    for opener, closer in (("[", "]"), ("{", "}")):
        start = s.find(opener)
        if start < 0:
            continue
        if opener != intended:
            continue
        depth, in_str, esc = 0, False, False
        for i in range(start, len(s)):
            c = s[i]
            if in_str:
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == '"':
                    in_str = False
                continue
            if c == '"':
                in_str = True
            elif c == opener:
                depth += 1
            elif c == closer:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(s[start:i + 1])
                    except json.JSONDecodeError:
                        break
    if intended == "[":
        raise LLMError(
            f"the response opens an array but never closes it - almost certainly "
            f"truncated at {len(text)} chars. Refusing to return the first element as "
            f"if it were the whole list.")
    raise LLMError(f"no parseable JSON in {len(text)} chars; starts: {text[:160]!r}")


# ---------------- backends ----------------

def _via_api(prompt: str, model: str, max_tokens: int, timeout: int) -> str:
    try:
        import anthropic
    except ImportError:
        raise LLMError("pip install anthropic, or use the CLI backend "
                       "(unset ANTHROPIC_API_KEY and log in with `claude`)") from None
    client = anthropic.Anthropic(timeout=timeout)
    msg = client.messages.create(
        model=MODELS.get(model, model),
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")


def _via_cli(prompt: str, model: str, max_tokens: int, timeout: int,
             allow_tools: bool) -> str:
    cmd = ["claude", "-p", "--output-format", "json", "--model",
           MODELS.get(model, model)]
    # When we supply search context ourselves the agent needs no tools at all,
    # which is both faster and immune to the tool quota that broke the first run.
    cmd += ["--allowed-tools", "WebSearch,WebFetch"] if allow_tools \
        else ["--allowed-tools", ""]
    try:
        p = subprocess.run(cmd, input=prompt, capture_output=True,
                           text=True, timeout=timeout)
    except FileNotFoundError:
        raise LLMError("`claude` is not on PATH. Install the Claude Code CLI "
                       "or set ANTHROPIC_API_KEY.") from None
    except subprocess.TimeoutExpired:
        raise LLMError(f"claude CLI timed out after {timeout}s") from None
    if p.returncode != 0:
        raise LLMError(f"claude CLI exited {p.returncode}: "
                       f"{(p.stderr or p.stdout or '')[:400]}")
    out = p.stdout.strip()
    try:                       # the CLI wraps the answer in an envelope
        env = json.loads(out)
        if isinstance(env, dict):
            if env.get("is_error"):
                raise LLMError(f"claude CLI reported an error: {str(env)[:300]}")
            return env.get("result") or env.get("text") or out
    except json.JSONDecodeError:
        pass
    return out


def ask(prompt: str, auth: Auth, model: str = "sonnet", max_tokens: int = 32000,
        timeout: int = 900, allow_tools: bool = False) -> str:
    if auth.mode == "api":
        return _via_api(prompt, model, max_tokens, timeout)
    if auth.mode == "cli":
        return _via_cli(prompt, model, max_tokens, timeout, allow_tools)
    raise LLMError("no usable credentials; run `tripkit doctor`")


def ask_json(prompt: str, auth: Auth, model: str = "sonnet", retries: int = 2,
             **kw):
    """
    One retry rule, learned the hard way: a deterministic failure does not get a
    second identical attempt. If the first parse fails we CHANGE the request by
    appending the parser's own complaint, rather than re-rolling the same dice.
    """
    last = ""
    for attempt in range(retries + 1):
        p = prompt if attempt == 0 else (
            prompt + f"\n\n---\nYour previous reply could not be parsed: {last}\n"
            "Reply with ONLY the JSON. No prose, no code fence, no trailing commas.")
        raw = ask(p, auth, model=model, **kw)
        try:
            return extract_json(raw), raw
        except LLMError as e:
            last = str(e)[:300]
    raise LLMError(f"could not get JSON after {retries + 1} attempts: {last}")


def fanout(jobs: dict[str, str], auth: Auth, model: str = "sonnet",
           parallel: int = 8, on_done=None, **kw) -> dict[str, Result]:
    """Run named prompts concurrently. One failure never kills the others."""
    out: dict[str, Result] = {}
    with ThreadPoolExecutor(max_workers=max(1, parallel)) as ex:
        futs = {ex.submit(_one, n, p, auth, model, kw): n for n, p in jobs.items()}
        for f in as_completed(futs):
            r = f.result()
            out[r.name] = r
            if on_done:
                on_done(r)
    return out


def _one(name: str, prompt: str, auth: Auth, model: str, kw) -> Result:
    t0 = time.time()
    try:
        data, raw = ask_json(prompt, auth, model=model, **kw)
        return Result(name, True, data, raw, "", round(time.time() - t0, 1))
    except Exception as e:  # noqa: BLE001 - a slice failing must not stop the run
        return Result(name, False, None, "", str(e)[:400], round(time.time() - t0, 1))
