"""Resolve credentials at runtime. This module never stores or writes a secret."""
from __future__ import annotations
import os, shutil, subprocess
from dataclasses import dataclass


@dataclass
class Auth:
    mode: str          # "api" | "cli"
    detail: str        # human-readable, never the secret itself

    @property
    def ok(self) -> bool:
        return self.mode in ("api", "cli")


def _cli_available() -> tuple[bool, str]:
    exe = shutil.which("claude")
    if not exe:
        return False, "the `claude` CLI is not on PATH"
    try:
        out = subprocess.run([exe, "--version"], capture_output=True,
                             text=True, timeout=20)
        if out.returncode != 0:
            return False, f"`claude --version` exited {out.returncode}"
        return True, out.stdout.strip() or "claude CLI"
    except Exception as e:  # noqa: BLE001 - want the message, not the type
        return False, f"could not run `claude --version`: {e}"


def resolve(prefer: str | None = None) -> Auth:
    """
    Order of preference, and the reasoning:

    1. ANTHROPIC_API_KEY  - explicit, scriptable, works in CI with no browser.
    2. the local `claude` CLI - lets someone with a Claude subscription run this
       without ever creating an API key. The CLI owns the credential; we only
       shell out to it.

    Nothing is ever written to disk by tripkit, so there is no secret for this
    tool to leak. If both are present, the API key wins because it is explicit.
    """
    if prefer in ("api", "cli"):
        order = [prefer]
    else:
        order = ["api", "cli"]

    problems = []
    for mode in order:
        if mode == "api":
            key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
            if key:
                return Auth("api", f"ANTHROPIC_API_KEY ending …{key[-4:]}")
            problems.append("ANTHROPIC_API_KEY is not set")
        else:
            ok, detail = _cli_available()
            if ok:
                return Auth("cli", detail)
            problems.append(detail)

    return Auth("none", "; ".join(problems))


HELP = """
tripkit needs a way to talk to Claude. Either works:

  A. An API key
       export ANTHROPIC_API_KEY=sk-ant-...
     Best for CI and for running unattended.

  B. The Claude Code CLI you already have
       npm install -g @anthropic-ai/claude-code   # if you do not have it
       claude                                     # log in once, interactively
     tripkit then shells out to `claude -p`, and your existing session does the
     work. No API key needs to exist. This is the default for a reason: a tool
     that never holds a credential cannot lose one.

Search is separate and optional. Without a search key, research falls back to
whatever the CLI's own tools can reach, which is slower and rate-limited:

       export BRAVE_API_KEY=...      # or TAVILY_API_KEY / SERPER_API_KEY / EXA_API_KEY
""".strip()
