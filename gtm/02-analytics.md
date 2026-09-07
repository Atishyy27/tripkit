# Analytics for tripkit, without betraying the pitch

Checked 2026-09-07, against each vendor's own pricing/docs pages (fetched live this session)
unless marked otherwise. tripkit is a static GitHub Pages site with no backend, no CSP header
blocking third-party scripts, and it already stores the current trip in `localStorage`
(`docs/app.js:15-16`). Any analytics choice sits next to a front page that says "nothing is
sent to us, because there is no us", so the bar is not "is this GDPR-legal", it is "does
this remain true after we ship it."

**Recommendation up front: GoatCounter, hosted, free tier, self-host later if traffic
outgrows the "reasonable public usage" ceiling.** Reasoning is in section 8.

---

## 1. Privacy-first analytics, comparison table

| Tool | Free tier (real) | Cheapest paid | Cookies | GDPR, no banner needed | Self-host | Script size | Works on GitHub Pages | Verified |
|---|---|---|---|---|---|---|---|---|
| **Plausible** | No, 30-day trial only, then paid | $9/mo (Starter, ~10k pageviews) | None | Yes, no cookies, no persistent identifiers, IP/UA never stored | Yes, AGPL-3.0, free | ~1-2 KB | Yes, any static host | Fetched plausible.io + plausible.io/data-policy today |
| **Fathom** | No, 7-day trial only | $45/mo (up to 500k pageviews) | None (stated privacy-first) | Yes, by design | No, closed source, hosted only | Small (~KB range) | Yes | Fetched usefathom.com/pricing today; no-free-tier statement is direct quote |
| **Umami** | Cloud: free tier exists at low volume in Umami's own marketing, self-host is always free | Cloud paid tiers scale with events; exact current cloud numbers could not be pulled, Umami's pricing page renders client-side and returned no text to WebFetch | None by default | Yes, daily-rotating salted hash, no persistent ID | **Yes, MIT licence, fully free, unlimited** | Small (~2 KB) | Yes | **Self-host/licence: confirmed from prior knowledge, not independently re-verified this session, flagging per the no-fabrication rule.** Cloud pricing: unverified, page did not render |
| **Counter.dev** | Yes, genuinely free, "pay whenever you want," no forced tier | Donation-based, no fixed price | **None**, "No Cookies. No logging. No IP address fingerprinting" | Yes | Yes, open source on GitHub | Small | Yes | Fetched counter.dev today |
| **GoatCounter** | Yes, hosted service free for "reasonable public usage" (their words); no card, no signup limit stated | N/A, no paid tier, donation-supported (GitHub Sponsors) | **None** | Yes, own GDPR help page argues no banner needed (see §2) | Yes, EUPL-licensed, free, single Go binary | ~3-4 KB | Yes | Fetched goatcounter.com + goatcounter.com/help/gdpr today |
| **Simple Analytics** | Yes, "free forever," but capped: 30-day history, 1 user, 5 websites, unlimited pageviews | $20/mo (Self-serve) | None (cookieless is their core pitch) | Yes | No, hosted only | Small | Yes | Fetched simpleanalytics.com/pricing today |
| **Cloudflare Web Analytics** | Yes, free on all Cloudflare plans, including the free plan, and does **not** require moving DNS to Cloudflare | N/A, free | None | Yes, no cross-site tracking, no fingerprinting | No | Beacon script, documented as lightweight | Yes, it's a JS snippet, works on any origin | Fetched developers.cloudflare.com/web-analytics today |
| **Vercel Web Analytics** | 50k events/month free (stated on Hobby) | $3 per 100k events beyond that, or $10/mo add-on for 24-month retention | None (cookieless) | Yes | No | Small (`@vercel/analytics` npm package) | **Weak fit**, it's built around a project deployed on Vercel's platform; using it against a GitHub Pages origin is not how it's designed to be wired | Fetched vercel.com/pricing today |
| **Matomo Cloud** | No, trial only, no card needed | €29/mo (Starter, 50k hits/mo) | **Yes, by default**, first-party visitor-ID cookie unless explicitly disabled | **No, not out of the box**, needs either the cookieless config or a banner | **Yes, Community edition, self-hosted, free forever, unlimited hits/users** (GPL) | Larger (~20-45 KB depending on config) | Yes, as a JS snippet | Fetched matomo.org/pricing today |
| **Pirsch** | No, 30-day trial only | $6/mo (Standard, 10k pageviews) | None (cookieless) | Yes | Enterprise-tier only in their own pricing copy; a community OSS edition (`pirsch-analytics/pirsch`, AGPL) exists per prior knowledge but **could not be re-confirmed this session**, oss.pirsch.io returned no readable content to WebFetch | Small | Yes | Pricing tiers fetched from pirsch.io/pricing today; OSS claim unverified this session |
| **Tinylytics** | No, explicitly "we cannot compete on free" | $7/mo (Zen, 2 sites) | None | Yes | No | Small | Yes | Fetched tinylytics.app today |

**Read the free-tier column literally.** Only four of these are usable at zero cost indefinitely
for a hobby OSS project with unpredictable traffic: **Umami self-hosted, Counter.dev, GoatCounter,
Cloudflare Web Analytics.** Simple Analytics is free but throttles to 30-day history, which kills
the "does it work, does it hold up over months" question this task is actually asking. Vercel's
free tier is real money-wise but the product isn't shaped for a GitHub Pages origin.

---

## 2. The cookie-banner question, actual reasoning, not vibes

**EU (GDPR + ePrivacy Directive, transposed differently per member state but same core rule):**
The consent trigger is not GDPR itself, it's Article 5(3) of the **ePrivacy Directive**, which
requires consent before "storing information, or gaining access to information already
stored, in the terminal equipment of a subscriber or user," *unless* that storage/access is
"strictly necessary" for a service the user explicitly requested. A cookie is one way to store
that information; a `localStorage` key, a fingerprint, or a tracking pixel with a persistent ID
can trigger the same rule even with zero literal cookies. The exemption most privacy analytics
tools rely on is simpler: they set **nothing** on the device. No cookie, no localStorage write,
no persistent identifier synced across days. If nothing is stored or accessed on the visitor's
device, Article 5(3) never engages, so the consent requirement it creates never triggers.

That leaves the separate GDPR question: is the data itself "personal data"? Tools like Plausible,
GoatCounter and Umami compute a **daily-rotating salted hash** of IP + User-Agent + site, use it
only to de-duplicate a "visit" within one day, and never store the raw IP or the hash itself
beyond that window, only the aggregate counts survive. Regulators and these vendors' own legal
opinions treat that as anonymous or, at worst, pseudonymous-and-not-identifying, which does not
require consent under GDPR's Article 6 lawful-basis test, "legitimate interest" (knowing how
many people use your own site) covers it without a banner.

**Matomo is the one exception on this list that flips the answer**, and it's worth stating
plainly: out of the box, hosted Matomo Cloud sets a first-party cookie to track return visits
across sessions, which is exactly the "stored on device, not strictly necessary" case Article
5(3) targets, so a banner is required unless it's explicitly reconfigured into cookieless mode
(Matomo supports this, but it's an opt-in setting, not the default).

**India: the Digital Personal Data Protection Act, 2023 (DPDP), rules notified 2025:** DPDP
has no direct ePrivacy-style "device storage" trigger the way the EU does. Its consent
requirement is anchored to processing of "personal data," defined as data about an identifiable
individual. A daily-rotating hash that is never stored raw and cannot be reversed to a person
does not meet that bar any more than it does under GDPR, so the same tools that clear GDPR
without a banner clear DPDP's current text too. **Flag: DPDP enforcement rules and case law are
far less mature than GDPR's**: this is a reasoned inference from the statute's own definition
of personal data, not a court-tested position, and it should be treated as lower-confidence than
the EU answer.

**Practical verdict for tripkit:** GoatCounter, Umami (self-hosted, default config), Counter.dev,
Plausible, Fathom, Cloudflare Web Analytics, Pirsch, Tinylytics, Simple Analytics, none require
a banner in the EU or under DPDP, by design. Matomo does, unless reconfigured. Vercel is
cookieless too but doesn't fit the hosting model here regardless.

---

## 3. Custom events, real code, against tripkit's actual DOM

Picking **GoatCounter** for these examples since it's the recommendation (section 8); the same
`goatcounter.count()` call pattern is what you'd swap for Umami's `umami.track()` or Plausible's
`plausible()` if the recommendation changes later: the event names and trigger points below
don't change.

Base snippet, added once near the end of `docs/index.html`, before `</body>`:

```html
<script data-goatcounter="https://tripkit.goatcounter.com/count"
        async src="//gc.zgo.at/count.js"></script>
```

This alone gives pageviews with zero code. Custom events need explicit calls. All of these go
in `docs/app.js`, wrapped so a blocked script (ad-blockers strip GoatCounter's script routinely)
never breaks the app:

```js
// docs/app.js, add near the top, after existing helper functions
function track(path, title, event) {
  try {
    if (window.goatcounter && typeof goatcounter.count === "function") {
      goatcounter.count({ path, title, event: !!event });
    }
  } catch (e) { /* analytics must never break the app */ }
}
```

**A town being searched**, hook into the existing `#q` input handler around `docs/app.js:38-39`.
Town names themselves are not sent, only that a search happened, to avoid turning "which towns"
into a de-facto location log of individual users:

```js
const box = $("#q");
box.addEventListener("input", () => {
  // ...existing suggestion logic...
});

// Debounced, fires once per completed search rather than per keystroke:
let searchTimer;
box.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (box.value.trim().length >= 3) track("/event/search", "town searched", true);
  }, 800);
});
```

**Which view is opened** (List vs Map): the chip toggle at `docs/app.js:635-636`:

```js
$$("#views .chip").forEach(b => b.onclick = () => {
  $$("#views .chip").forEach(x => x.setAttribute("aria-pressed", "false"));
  b.setAttribute("aria-pressed", "true");
  const view = b.dataset.v; // "list" or "map"
  track(`/event/view-${view}`, `opened ${view} view`, true);
  // ...existing view-switch logic...
});
```

**Radius being widened**, the "nothing fits, try a wider radius" path around
`docs/app.js:657-672`:

```js
const from = GUIDE.radius || 2500, to = Math.min(from + 2500, 15000);
track("/event/widen-radius", `widened ${from}m to ${to}m`, true);
GUIDE.radius = to;
```

**A share happening**, `#shareBtn` handler at `docs/app.js:641-651`:

```js
$("#shareBtn").onclick = async () => {
  track("/event/share", "share tapped", true);
  // ...existing navigator.share / clipboard fallback logic...
};
```

**Install to home screen**, tripkit doesn't currently listen for `beforeinstallprompt`
(confirmed: no match in `docs/app.js` or `docs/sw.js`). To measure this at all, add the listener:

```js
window.addEventListener("beforeinstallprompt", (e) => {
  track("/event/install-prompt-shown", "install prompt shown", true);
});
window.addEventListener("appinstalled", () => {
  track("/event/installed", "app installed", true);
});
```

`appinstalled` is the one that actually answers "did they install it", `beforeinstallprompt`
only proves the browser considered it installable.

---

## 4. Self-hosted, zero-cost, no third party at all

**GitHub itself, via a repo-as-database trick:** possible but genuinely bad for this. The common
pattern is a GitHub Actions workflow that appends a line to a file in the repo (or a separate
"stats" branch) on every visit, triggered by a `repository_dispatch` or a `workflow_dispatch`
called from client JS hitting the GitHub API. This does not work for tripkit: it requires the
visitor's browser to carry a **GitHub personal access token** to authenticate the API call
(GitHub's API has no anonymous write path), which means shipping a secret in client-side JS, exactly the kind of "no key" promise tripkit's whole pitch rests on breaking. The alternative,
routing through a serverless proxy to hide the token, reintroduces the backend tripkit doesn't
have. Verdict: **not viable without breaking a hard constraint**, not just impractical.

**Cloudflare Workers free tier:** genuinely viable and stays zero-cost at tripkit's likely
scale. Free tier is 100,000 requests/day (this is Cloudflare's long-standing published Workers
Free plan figure; **not independently re-verified against Cloudflare's pricing page this
session**, flagging per the no-fabrication rule, verify before relying on it). A minimal
Worker can accept a `fetch()` beacon from the page, increment a counter in Workers KV (also
free-tier eligible), and expose a read endpoint. Downsides: this is you building and
maintaining an analytics backend, however small, schema, abuse handling (rate limiting a
public write endpoint you don't control), and it recreates exactly the maintenance burden the
managed tools exist to avoid. For a solo maintainer this is worse than GoatCounter unless the
goal is specifically "zero third party," not "zero cost."

**A static badge/counter service** (e.g. a GitHub profile-view counter pattern): these exist
but only count raw hits to an image URL, give no breakdown by page/event, are trivially inflated
by crawlers and CDNs prefetching, and several popular ones have shut down or gone unmaintained.
Not a real analytics substitute, flagging as evaluated and rejected, not omitted.

**Verdict:** no truly-third-party-free option is honestly good here. Cloudflare Workers is the
only one that doesn't violate a stated constraint, and it trades "no third party" for "you now
own an analytics backend." GoatCounter (hosted, but reads no client secret and stores no PII)
is the better trade for a one-person project.

---

## 5. What to actually measure, signal over vanity

**Needs real analytics (can't be inferred from GitHub):**
- Towns searched per week, and the top 20, tells the owner what to prioritise for OSM/Wikivoyage
  coverage (README already shows Lisbon 33% vs Pushkar 7% hours coverage, search volume tells
  him *which* gaps matter).
- List vs Map view share, settles the actual question asked ("does the map or list get used
  more") instead of guessing from feature requests.
- Radius-widen rate: a proxy for "the default radius under-delivers here"; high widen-rate on
  a town is a direct signal the ranking or coverage is thin there.
- Share-tap rate: the only real proxy for "would you recommend this," since there's no
  account/ratings system to ask directly.
- Install rate (`appinstalled` / prompt-shown), tells him if the PWA pitch is landing or just
  present.
- Return visits: this is the one metric that's hard to get *without* some form of client-side
  ID, even a privacy-respecting one; GoatCounter's own dedup hash is daily-only by design, so
  "returns after N days" isn't something these tools give you for free. Honest gap: measuring
  return usage properly would need a self-set, non-cross-site, first-party `localStorage` flag
  ("has this browser opened tripkit before"), technically defensible as not-a-tracking-cookie,
  but a judgement call worth deciding deliberately, not by default.

**Can be inferred from GitHub / existing signals, no analytics needed:**
- Overall interest and momentum, stars, forks, watcher count over time (GitHub API, free,
  see §6).
- Where traffic originates (referrer sites, search vs direct): the repo Traffic API gives this
  natively for the GitHub Pages domain, no analytics vendor needed.
- Whether the product actually works for people, issues opened, their content, PR contributions.
- Whether developers are adopting the CLI, PyPI download counts (`pypistats.org`, free, no
  account) for the `tripkit` package, separate from the static site's own web analytics.

**Vanity to avoid leading with:** raw pageview counts with no context, "total visitors ever"
without weekly/monthly framing, any number that can't be tied to a decision the owner would
actually make differently once he sees it.

---

## 6. GitHub's own traffic API

Confirmed today from GitHub's own docs (`docs.github.com/en/rest/metrics/traffic`):

- **Endpoints:** `GET /repos/{owner}/{repo}/traffic/views`, `.../traffic/clones`,
  `.../traffic/popular/referrers`, `.../traffic/popular/paths`.
- **Retention: 14 days**, hard limit, data older than that is gone from the API regardless of
  when you query it. Views/clones can be grouped by day or week.
- **Auth:** requires a token with **write access to the repo** (a fine-grained PAT scoped to
  this repo, or a classic PAT with `repo` scope): this is a repo-admin-only endpoint, not public.
- Referrers/paths endpoints return only the **top 10** each period: this is a real limitation,
  not a bug: long-tail referrers are invisible.

Because of the 14-day window, history is lost forever unless something snapshots it more often
than that. A scheduled Action that runs weekly and commits the JSON response into the repo
solves this cheaply and matches the "fewer docs, one growing file" instinct, here it's one
growing data file instead of many.

```yaml
# .github/workflows/traffic-snapshot.yml
name: Snapshot GitHub traffic stats
on:
  schedule:
    - cron: "0 6 * * 1"   # every Monday 06:00 UTC, well inside the 14-day window
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Fetch traffic views
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          mkdir -p gtm/traffic-history
          DATE=$(date -u +%Y-%m-%d)
          gh api repos/${{ github.repository }}/traffic/views > "gtm/traffic-history/views-$DATE.json"
          gh api repos/${{ github.repository }}/traffic/clones > "gtm/traffic-history/clones-$DATE.json"
          gh api repos/${{ github.repository }}/traffic/popular/referrers > "gtm/traffic-history/referrers-$DATE.json"
          gh api repos/${{ github.repository }}/traffic/popular/paths > "gtm/traffic-history/paths-$DATE.json"

      - name: Commit snapshot
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add gtm/traffic-history/
          git diff --staged --quiet || git commit -m "chore: weekly traffic snapshot"
          git push
```

**Note on `GITHUB_TOKEN`:** the default Actions token has write access to its own repo, which
is exactly what the traffic endpoint requires, no extra PAT needed for a workflow running
inside the same repo it's snapshotting. `permissions: contents: write` must be set explicitly
(2026 default for new repos is read-only tokens). Pass/fail: a pass looks like new files
appearing under `gtm/traffic-history/` each Monday; a fail is a workflow run with a red X,
usually a permissions error if `contents: write` is missing.

---

## 7. Honest disclosure, exact wording

**For the site itself**, add one card to the existing "How this works" section
(`docs/index.html`, near line 42, same tone as the current copy) rather than a separate privacy
page nobody reads:

> **What we count.** This page uses GoatCounter, a privacy analytics tool that doesn't use
> cookies and can't identify you. It logs that a search happened, which view you opened, and
> whether you tapped share, never what town you searched or where the pin on your map was.
> Your trip itself still never leaves this device: that part hasn't changed. We do this because
> we'd rather know the map is unused than guess, and because the counting is public, see
> [tripkit's own analytics dashboard](#) if you want to check we're telling the truth.

**For the README**, append to the existing "Nothing is sent to us" paragraph rather than adding
a new section:

> **On analytics.** As of [date], tripkit's hosted site uses GoatCounter to count anonymous
> page and event views, no cookies, no persistent visitor ID, no IP address stored past the
> request. It cannot tell one visitor from another across two days. It cannot see which town
> you searched, only that a search happened. It does not touch the trip data in your
> `localStorage`, which still never leaves your device. If that changes, this line changes with
> it.

The load-bearing phrase in both is **"we'd rather know X is unused than guess"**: it reframes
analytics as a build decision serving the reader, not surveillance serving the owner, and it's
true.

---

## 8. The recommendation

**GoatCounter, hosted at goatcounter.com, free.** Reasoning, weighed against the alternatives:

- It's the only tool on this list that is simultaneously **free with no time limit, no cookies,
  open source (so the "no tracking" claim is auditable, matching tripkit's own MIT ethos), and
  self-hostable later** if usage ever exceeds "reasonable public usage", which for a hobby
  travel app is a very high bar to hit.
- Counter.dev is a close second and equally free/cookieless, but it's a smaller, less
  documented project with no defined path to self-host at scale if traffic grows, and its own
  pricing page gives no clarity beyond "pay when you want", harder to plan around long-term
  even though it costs nothing today.
- Umami self-hosted is arguably *more* private (data never leaves infrastructure the owner
  controls) but that means running and paying for a database and a host, real, if small,
  recurring cost and maintenance that GoatCounter's hosted free tier avoids entirely for a
  one-person project.
- Plausible/Fathom/Pirsch/Tinylytics/Matomo Cloud are all real products but none are free
  indefinitely, and Matomo additionally needs reconfiguration to avoid the cookie banner tripkit
  is trying to avoid by design.
- Cloudflare Web Analytics is free and cookieless too, and is a legitimate second choice, but it
  gives less flexibility for named custom events tied to specific UI actions (search, view
  toggle, share) compared to GoatCounter's simple `path`/`event` model, which maps directly onto
  section 3's code.

**What this does not solve:** return-visit measurement (see §5's honest gap), and the fact that
any hosted analytics vendor is still a third party receiving a beacon request: the disclosure
in §7 exists specifically because "no third party at all" and "real numbers" are not
simultaneously achievable, and pretending otherwise would be the actual betrayal of the pitch,
not the analytics tool itself.
