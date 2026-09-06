"""tripkit command line."""
from __future__ import annotations
import argparse, json, os, subprocess, sys, time

from . import auth as A, llm, merge, osm as OSM, search as S, slices as SL
from .render import Site
from .spec import load, SpecError, DEFAULT_SLICES

C = dict(dim="\033[2m", b="\033[1m", g="\033[32m", y="\033[33m",
         r="\033[31m", c="\033[36m", x="\033[0m")
if not sys.stderr.isatty() or os.environ.get("NO_COLOR"):
    C = {k: "" for k in C}


def say(msg=""): sys.stderr.write(msg + "\n"); sys.stderr.flush()
def ok(m):   say(f"  {C['g']}✓{C['x']} {m}")
def bad(m):  say(f"  {C['r']}✗{C['x']} {m}")
def warn(m): say(f"  {C['y']}!{C['x']} {m}")
def dim(m):  say(f"  {C['dim']}{m}{C['x']}")


def data_dir(spec, out): return os.path.join(out, "..", "research") if False else \
    os.path.join(os.path.dirname(os.path.abspath(out)) or ".", "research")


# ---------------------------------------------------------------- doctor
def cmd_doctor(args):
    say(f"\n{C['b']}tripkit doctor{C['x']}\n")
    a = A.resolve(args.auth)
    (ok if a.ok else bad)(f"Claude access: {a.mode} — {a.detail}")
    prov = None
    try:
        prov = S.pick(args.search)
    except S.SearchError as e:
        bad(str(e))
    if prov:
        ok(f"Search: {prov} (key found)")
    else:
        warn("Search: none configured. Research will ask the agent to search for "
             "itself, which is slower and can hit a per-session cap mid-run.")
        dim("set BRAVE_API_KEY (or TAVILY/SERPER/EXA) to fix that")
    for tool, why in (("git", "needed for deploy"), ("gh", "needed for deploy")):
        import shutil
        (ok if shutil.which(tool) else warn)(
            f"{tool}: {'found' if shutil.which(tool) else 'not found, ' + why}")
    if not a.ok:
        say("\n" + A.HELP + "\n")
        return 1
    say("")
    return 0


# ---------------------------------------------------------------- new
TEMPLATE = """trip:
  title: "A day in {name}"
  traveller: null            # a first name, or null. Goes on the page.
  country: ""
  places:
    - name: {name}
      role: destination
    # - name: Somewhere        # the airport/station town you arrive through
    #   role: hub
  # hub: Somewhere
  arrive: 2026-01-01T09:00
  depart: 2026-01-01T21:00
  hub_to_dest_minutes: 30    # travel time between hub and destination
  exit_buffer_minutes: 75    # leave the destination this early for a calm exit
  timezone: Asia/Kolkata
  tz_offset_minutes: 330     # the site renders in DESTINATION time, not the phone's
  currency: INR
  currency_symbol: "₹"
  profile: []                # solo, female, backpacker, family, first-time...
  languages: []              # phrases are generated in these
  interests: []

research:
  slices: [{slices}]
  parallel: 8
  model: sonnet

site:
  out: site
  favicon: "🧭"
  # repo: youruser/your-repo    # for `tripkit deploy`
"""


def cmd_new(args):
    path = args.path or f"{args.name.lower().replace(' ', '-')}.yaml"
    if os.path.exists(path) and not args.force:
        bad(f"{path} exists. Pass --force to overwrite."); return 1
    with open(path, "w", encoding="utf-8") as f:
        f.write(TEMPLATE.format(name=args.name, slices=", ".join(DEFAULT_SLICES)))
    ok(f"wrote {path}")
    dim("edit the dates and places, then: tripkit run " + path)
    return 0


# ---------------------------------------------------------------- research
def cmd_research(args):
    spec = load(args.spec)
    a = A.resolve(args.auth)
    if not a.ok:
        bad(f"no Claude access: {a.detail}"); say("\n" + A.HELP + "\n"); return 1

    try:
        prov = S.pick(args.search)
    except S.SearchError as e:
        bad(str(e)); return 1

    outdir = os.path.join(os.path.dirname(os.path.abspath(args.spec)), args.research_dir)
    os.makedirs(outdir, exist_ok=True)

    names = args.only.split(",") if args.only else spec.slices
    unknown = [n for n in names if n not in SL.ALL]
    if unknown:
        bad(f"unknown slice(s): {', '.join(unknown)}")
        dim("known: " + ", ".join(sorted(SL.ALL))); return 1

    say(f"\n{C['b']}{spec.title}{C['x']}")
    dim(spec.describe())
    dim(f"auth {a.mode} · search {prov or 'agent-side'} · model {spec.model} "
        f"· {len(names)} slices · {spec.parallel} at a time\n")

    # ---- search first, so the agent never has to ----
    contexts: dict[str, str | None] = {}
    if prov:
        for n in names:
            if args.skip_existing and os.path.exists(os.path.join(outdir, n + ".json")):
                continue
            qs = SL.queries_for(n, spec)
            try:
                hits = S.run(qs, prov, per_query=args.per_query)
                contexts[n] = S.as_context(hits)
                dim(f"search {n:<12} {len(qs)} queries → {len(hits)} unique sources")
            except S.SearchError as e:
                warn(f"search {n}: {e}")
                contexts[n] = None
    else:
        contexts = {n: None for n in names}

    jobs, skipped = {}, []
    for n in names:
        p = os.path.join(outdir, n + ".json")
        if args.skip_existing and os.path.exists(p):
            skipped.append(n); continue
        jobs[n] = SL.prompt_for(n, spec, contexts.get(n))
    for n in skipped:
        dim(f"skip {n} (already in {args.research_dir}/)")
    if not jobs:
        ok("nothing to research"); return 0

    say("")
    t0 = time.time()
    done = {"n": 0}

    def on_done(r: llm.Result):
        done["n"] += 1
        tag = f"[{done['n']}/{len(jobs)}]"
        if r.ok:
            size = len(r.data) if isinstance(r.data, list) else 1
            ok(f"{tag} {r.name:<12} {size:>3} entries  {r.seconds}s")
            with open(os.path.join(outdir, r.name + ".json"), "w", encoding="utf-8") as f:
                json.dump(r.data, f, ensure_ascii=False, indent=1)
        else:
            bad(f"{tag} {r.name:<12} {r.error[:90]}")

    res = llm.fanout(jobs, a, model=spec.model, parallel=spec.parallel,
                     on_done=on_done, allow_tools=(prov is None),
                     timeout=args.timeout)
    good = sum(1 for r in res.values() if r.ok)
    say(f"\n  {good}/{len(jobs)} slices in {round(time.time()-t0)}s "
        f"→ {args.research_dir}/\n")
    return 0 if good else 1


# ---------------------------------------------------------------- osm
def cmd_osm(args):
    """
    Pull OpenStreetMap first, because it is free, structured and verifiable.

    It will not carry the day on its own. Measured 2026-09-06 with this exact query:
    Munich restaurants 85.5% have opening_hours, Jaipur restaurants 8.9%. So OSM is
    the spine for name/coords/category everywhere, good for hours in dense Western
    cities, thin for hours elsewhere - and, wherever it does have hours, a free
    mechanical check on whatever the model claimed.
    """
    spec = load(args.spec)
    base = os.path.dirname(os.path.abspath(args.spec))
    outdir = os.path.join(base, args.research_dir)
    os.makedirs(outdir, exist_ok=True)

    say(f"\n{C['b']}OpenStreetMap{C['x']}")
    all_places = []
    for pl in spec.places:
        if pl.lat is None or pl.lng is None:
            warn(f"{pl.name}: no lat/lng in the spec, skipping "
                 f"(Overpass needs a point to search around)")
            continue
        dim(f"querying {pl.name} within {args.radius}m ...")
        try:
            els = OSM.fetch(pl.lat, pl.lng, args.radius, log=dim)
        except RuntimeError as e:
            bad(f"{pl.name}: {e}"); continue
        got = OSM.to_places(els, pl.name.lower())
        cov = OSM.coverage(got)
        all_places += got
        (ok if cov["pct"] >= 20 else warn)(
            f"{pl.name:<14} {cov['total']:>4} places, "
            f"{cov['with_hours_tag']:>3} carry opening_hours ({cov['pct']}%), "
            f"{cov['parsed_into_fields']} parsed into usable fields")

    if not all_places:
        bad("nothing returned. Add lat/lng to your places, or widen --radius."); return 1

    path = os.path.join(outdir, "osm.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(all_places, f, ensure_ascii=False, indent=1)
    ok(f"{len(all_places)} places -> {args.research_dir}/osm.json")

    cov = OSM.coverage(all_places)
    if cov["pct"] < 25:
        dim(f"only {cov['pct']}% carry hours here, so the research slices still have to "
            f"find most of them. That is expected outside dense Western cities.")
    say("")
    return 0


# ---------------------------------------------------------------- verify
def cmd_verify(args):
    """Cross-check model-claimed hours against OSM's, where both exist."""
    spec = load(args.spec)
    base = os.path.dirname(os.path.abspath(args.spec))
    rdir = os.path.join(base, args.research_dir)
    op = os.path.join(rdir, "osm.json")
    if not os.path.exists(op):
        bad("no osm.json. Run `tripkit osm` first."); return 1
    with open(op, encoding="utf-8") as f:
        osm_places = json.load(f)

    llm_places = []
    for fn in sorted(os.listdir(rdir)):
        if not fn.endswith(".json") or fn == "osm.json":
            continue
        try:
            with open(os.path.join(rdir, fn), encoding="utf-8") as f:
                v = json.load(f)
            if isinstance(v, list):
                llm_places += [x for x in v if isinstance(x, dict) and x.get("name")]
        except json.JSONDecodeError:
            continue

    hits = OSM.crosscheck(llm_places, osm_places)
    say(f"\n{C['b']}hours cross-check{C['x']}")
    dim(f"{len(llm_places)} researched entries vs {sum(1 for p in osm_places if p.get('open'))} "
        f"OSM entries that carry parsed hours")
    if not hits:
        ok("no disagreements found")
        dim("that is weaker evidence than it looks: it mostly means few places appear in "
            "both sets with hours on both sides.")
        say(""); return 0
    for h in hits:
        warn(f"{h['name']}")
        dim(f"    researched {h['llm']}   osm {h['osm']}   ({h['osm_raw']})")
        dim(f"    {h['osm_url']}")
    say(f"\n  {len(hits)} disagreement(s). Neither side is automatically right - OSM goes "
        f"stale too - but each of these is worth a human look.\n")
    return 0


# ---------------------------------------------------------------- build
SHAPE_OF = {n: d.get("shape", "places") for n, d in SL.ALL.items()}
KEYS = {"move": ("mode", "from", "to"), "say": ("situation", "say"),
        "help": ("name", "phone"), "scams": ("name", "opener"), "buy": ("item",)}


def cmd_build(args):
    spec = load(args.spec)
    base = os.path.dirname(os.path.abspath(args.spec))
    rdir = os.path.join(base, args.research_dir)
    out = os.path.join(base, args.out or spec.out)
    os.makedirs(out, exist_ok=True)

    if not os.path.isdir(rdir):
        bad(f"no {args.research_dir}/ next to {args.spec}. Run `tripkit research` first.")
        return 1

    place_batches, extras, missing = {}, {}, []
    for name in spec.slices:
        p = os.path.join(rdir, name + ".json")
        if not os.path.exists(p):
            missing.append(name); continue
        try:
            with open(p, encoding="utf-8") as f:
                raw = json.load(f)
        except json.JSONDecodeError as e:
            bad(f"{name}.json is not valid JSON: {e}"); continue
        shape = SHAPE_OF.get(name, "places")
        if shape == "places":
            place_batches[name] = raw
        elif shape == "conditions":
            extras["conditions"] = raw if isinstance(raw, dict) else {}
        else:
            extras[shape] = merge.keep_list(raw, KEYS.get(shape, ("name",)))

    # a file named after a data shape loads as that shape, whatever the slice was called
    for shape in ("buy", "scams", "move", "say", "help"):
        p = os.path.join(rdir, shape + ".json")
        if shape not in extras and os.path.exists(p):
            try:
                with open(p, encoding="utf-8") as f:
                    extras[shape] = merge.keep_list(json.load(f), KEYS.get(shape, ("name",)))
                dim(f"loaded {shape}.json as {shape}")
            except json.JSONDecodeError as e:
                bad(f"{shape}.json is not valid JSON: {e}")

    # also fold in any hand-written file the user dropped in
    for fn in sorted(os.listdir(rdir)):
        n = fn[:-5]
        if fn.endswith(".json") and n not in spec.slices and n not in extras \
                and n not in ("buy", "scams", "move", "say", "help"):
            try:
                with open(os.path.join(rdir, fn), encoding="utf-8") as f:
                    v = json.load(f)
                if isinstance(v, list) and v and isinstance(v[0], dict) and "name" in v[0]:
                    place_batches[n] = v
                    dim(f"picked up extra file {fn}")
            except Exception:
                pass

    towns = [p.name.lower() for p in spec.places]
    centre = (spec.dest.lat or 0.0, spec.dest.lng or 0.0)
    if centre == (0.0, 0.0):
        pts = [(p.get("lat"), p.get("lng")) for b in place_batches.values()
               if isinstance(b, list) for p in b
               if isinstance(p, dict) and isinstance(p.get("lat"), (int, float))
               and isinstance(p.get("lng"), (int, float))]
        if pts:
            centre = (sum(x for x, _ in pts)/len(pts), sum(y for _, y in pts)/len(pts))

    places, rep = merge.merge_places(place_batches, towns, spec.dest.name.lower(), centre)
    data = {"places": places, **extras}

    pages = Site(spec, data, out).build()
    st = merge.stats(places)

    say(f"\n{C['b']}built {spec.title}{C['x']}")
    still = [m for m in missing if SHAPE_OF.get(m, "places") not in extras]
    if still:
        warn(f"no research for: {', '.join(still)}")
    ok(f"{st['total']} places  ({st['with_hours']} with hours, {st['with_src']} sourced, "
       f"{st['exact_coords']} exact coords)")
    if rep.merged or rep.dropped:
        dim(f"merged {rep.merged} duplicates, dropped {rep.dropped} unusable")
    for k in ("move", "say", "help", "scams", "buy"):
        if extras.get(k):
            ok(f"{len(extras[k])} {k}")
    dim("by category: " + ", ".join(f"{k} {v}" for k, v in
        sorted(st["by_cat"].items(), key=lambda x: -x[1])))
    size = os.path.getsize(os.path.join(out, "assets", "data.js")) // 1024
    ok(f"{len(pages)} pages → {out}/  (data.js {size} KB)")
    dim("preview: python3 -m http.server -d " + out + " 8000\n")
    return 0


# ---------------------------------------------------------------- deploy
def sh(cmd, cwd, check=True):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(" ".join(cmd) + "\n" + (p.stderr or p.stdout)[:400])
    return p


def cmd_deploy(args):
    spec = load(args.spec)
    base = os.path.dirname(os.path.abspath(args.spec))
    out = os.path.join(base, args.out or spec.out)
    repo = args.repo or spec.repo
    if not os.path.isdir(out):
        bad(f"{out} does not exist. Run `tripkit build` first."); return 1
    if not repo:
        bad("no repo. Pass --repo owner/name or set site.repo in the spec."); return 1

    import shutil
    if not shutil.which("gh"):
        bad("the GitHub CLI `gh` is not installed."); return 1

    if not os.path.isdir(os.path.join(out, ".git")):
        sh(["git", "init", "-q", "-b", "main"], out)
    if args.author_name:
        sh(["git", "config", "user.name", args.author_name], out)
    if args.author_email:
        sh(["git", "config", "user.email", args.author_email], out)
    sh(["git", "add", "-A"], out)
    p = sh(["git", "commit", "-q", "-m", args.message], out, check=False)
    if p.returncode != 0 and "nothing to commit" not in (p.stdout + p.stderr):
        bad((p.stderr or p.stdout)[:300]); return 1

    exists = sh(["gh", "repo", "view", repo], out, check=False).returncode == 0
    if not exists:
        sh(["gh", "repo", "create", repo,
            "--public" if args.public else "--private",
            "--source=.", "--remote=origin", "--push"], out)
        ok(f"created {repo}")
    else:
        if sh(["git", "remote"], out).stdout.find("origin") < 0:
            sh(["git", "remote", "add", "origin",
                f"https://github.com/{repo}.git"], out)
        sh(["git", "push", "-q", "origin", "main"], out)
    sh(["gh", "api", "-X", "POST", f"repos/{repo}/pages",
        "-f", "source[branch]=main", "-f", "source[path]=/"], out, check=False)
    info = sh(["gh", "api", f"repos/{repo}/pages", "--jq", ".html_url"], out, check=False)
    url = (info.stdout or "").strip() or \
        f"https://{repo.split('/')[0].lower()}.github.io/{repo.split('/')[1]}/"
    ok("pushed")
    say(f"\n  {C['c']}{url}{C['x']}")
    dim("GitHub Pages takes a minute or two to go green on a first deploy.\n")
    return 0


def cmd_run(args):
    if getattr(args, "osm", True):
        args.radius = getattr(args, "radius", 4000)
        cmd_osm(args)          # advisory: a failure here must not stop the run
    for fn in (cmd_research, cmd_build):
        rc = fn(args)
        if rc:
            return rc
    return cmd_deploy(args) if args.deploy else 0


# ---------------------------------------------------------------- main
def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="tripkit",
        description="Turn a trip spec into a time-driven static travel site.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p, spec=True):
        if spec:
            p.add_argument("spec", help="path to the trip yaml")
        p.add_argument("--auth", choices=["api", "cli"], default=None,
                       help="force a credential source")
        p.add_argument("--search", default=None,
                       help="brave|tavily|serper|exa|claude|none")
        p.add_argument("--research-dir", default="research")
        p.add_argument("--out", default=None)

    d = sub.add_parser("doctor", help="check credentials and tools")
    common(d, spec=False); d.set_defaults(fn=cmd_doctor)

    n = sub.add_parser("new", help="write a starter spec")
    n.add_argument("name"); n.add_argument("--path", default=None)
    n.add_argument("--force", action="store_true"); n.set_defaults(fn=cmd_new)

    r = sub.add_parser("research", help="run the research fan-out")
    common(r); r.add_argument("--only", default=None, help="comma-separated slice names")
    r.add_argument("--skip-existing", action="store_true",
                   help="do not re-run slices already on disk")
    r.add_argument("--per-query", type=int, default=8)
    r.add_argument("--timeout", type=int, default=900)
    r.set_defaults(fn=cmd_research)

    o = sub.add_parser("osm", help="pull places from OpenStreetMap into research/osm.json")
    common(o); o.add_argument("--radius", type=int, default=4000,
                              help="metres around each place's lat/lng (default 4000)")
    o.set_defaults(fn=cmd_osm)

    v = sub.add_parser("verify", help="cross-check researched hours against OpenStreetMap")
    common(v); v.set_defaults(fn=cmd_verify)

    b = sub.add_parser("build", help="merge research and render the site")
    common(b); b.set_defaults(fn=cmd_build)

    p = sub.add_parser("deploy", help="push the site to GitHub Pages")
    common(p); p.add_argument("--repo", default=None)
    p.add_argument("--message", default="update trip site")
    p.add_argument("--public", action="store_true", default=True)
    p.add_argument("--private", dest="public", action="store_false")
    p.add_argument("--author-name", default=None)
    p.add_argument("--author-email", default=None)
    p.set_defaults(fn=cmd_deploy)

    u = sub.add_parser("run", help="research, build, and optionally deploy")
    common(u)
    u.add_argument("--only", default=None); u.add_argument("--skip-existing", action="store_true")
    u.add_argument("--per-query", type=int, default=8)
    u.add_argument("--timeout", type=int, default=900)
    u.add_argument("--deploy", action="store_true")
    u.add_argument("--radius", type=int, default=4000)
    u.add_argument("--no-osm", dest="osm", action="store_false", default=True,
                   help="skip the OpenStreetMap pass")
    u.add_argument("--repo", default=None); u.add_argument("--message", default="update trip site")
    u.add_argument("--public", action="store_true", default=True)
    u.add_argument("--private", dest="public", action="store_false")
    u.add_argument("--author-name", default=None); u.add_argument("--author-email", default=None)
    u.set_defaults(fn=cmd_run)

    args = ap.parse_args(argv)
    try:
        return args.fn(args)
    except SpecError as e:
        bad(f"spec problem: {e}"); return 2
    except KeyboardInterrupt:
        say("\ninterrupted"); return 130
    except Exception as e:  # noqa: BLE001
        bad(f"{type(e).__name__}: {e}")
        if os.environ.get("TRIPKIT_DEBUG"):
            raise
        dim("set TRIPKIT_DEBUG=1 for the traceback")
        return 1


if __name__ == "__main__":
    sys.exit(main())
