# AI-agent / LLM discoverability research, tripkit

Research pass, 2026-09-07. Scope: how to make tripkit findable by AI agents, LLM tool-recommendation
answers, and retrieval systems, not human-facing marketing. Nothing was posted or submitted anywhere;
this is research and ready-to-paste artifacts only.

**Search budget note:** this session's WebSearch quota was already exhausted (0 of 200 remaining) before
this task started, so every finding below came from direct WebFetch of specific URLs, not from search.
That means: anything I didn't already have a candidate URL for, I could not discover: I could only
confirm or refute URLs I already suspected existed. Failed/inconclusive fetches are listed per section.
Where a claim rests on pre-2026 general knowledge I could not re-verify this session (search dead,
fetch blocked by anti-bot walls), it's marked **unverified** explicitly, per standing rule.

---

## 1. The llms.txt convention

**Real, verified.** Fetched `https://llmstxt.org/` directly.

- Proposed by **Jeremy Howard** (Answer.AI), first published **3 September 2024**, with a v2 revision
  10 August 2026. Not a W3C/IETF standard: a convention one person proposed that gained voluntary
  adoption.
- **Exact format** (this is the whole spec, it's short): a markdown file at the site root (or a subpath),
  structured as:
  1. Optional byte-order mark.
  2. One `# H1` with the project/site name, **the only mandatory part.**
  3. One blockquote (`>`) immediately after, with a short summary carrying the key facts.
  4. Optional plain paragraphs with more detail (no headings inside these).
  5. Any number of `## H2` sections, each a markdown list of `[name](url): notes` links, these are
     "file lists," meant to tell an LLM what to fetch next and why.
- **llms-full.txt is NOT part of the core spec.** The llmstxt.org proposal text doesn't define it.
  It's a de facto companion convention some doc platforms (Mintlify, GitBook, and Anthropic's, OpenAI's
  and Google's own published llms.txt files) generate alongside llms.txt: same content, but every
  linked page's full text concatenated into one file instead of just links. I'm including one below,
  labelled clearly as the de facto pattern, not spec.
- **Who actually consumes it, verified:** the llmstxt.org page itself states "Chrome's Lighthouse audits
  sites for one as part of its agentic browsing checks," and that OpenAI, Anthropic and Gemini publish
  their own llms.txt files. That is real but narrow: it confirms *publisher-side* adoption and one
  Chrome tooling integration.
- **What I could NOT verify this session:** whether ChatGPT, Claude, Perplexity, or any major crawler
  (GPTBot, ClaudeBot, PerplexityBot) actually *fetches and prioritizes* a third-party site's llms.txt
  when answering a live user question, or during training-data collection. I know from general
  knowledge (unverified this session, search was dead) that this is the actual point of public dispute
  around llms.txt, several practitioners have argued it does nothing measurable for retrieval today
  because no major LLM vendor documents consuming it. Treat llms.txt as "cheap, harmless, and one
  real tooling integration (Lighthouse) confirmed", not as a proven traffic or citation lever.

### Ready-to-paste `llms.txt`

Verified against tripkit's actual README.md, DATA-SOURCES.md, and docs/index.html (paths and license
confirmed on disk, not invented).

```markdown
# tripkit

> A travel guide that reads the clock. Type a town and see what is open right now, ranked by
> whether this is genuinely that place's hour, with anything that will not fit before you have
> to leave hidden. Built entirely from OpenStreetMap and Wikivoyage; sunrise and sunset are
> computed on-device. No account, no API key, no backend, no AI in the data path. Installs to a
> home screen and works offline. MIT licensed.

Tripkit runs entirely in the browser tab. When someone searches a town, the browser asks
OpenStreetMap (via the Overpass API) what places exist nearby and their opening hours, asks
Wikivoyage what travellers have written about them, and computes sunrise, sunset and twilight
from NOAA solar equations on the user's own device. Results are ranked by whether the current
moment is genuinely that place's hour: a viewpoint at sunset, a market in the evening, and
anything that will not fit in the time the user has left before they must leave is hidden rather
than listed. Every sentence of description text comes from a human-written OpenStreetMap or
Wikivoyage source; none of it is model-generated. There is no account, no server operated by the
project, no API key, and no tracking. It installs as a Progressive Web App and keeps working
offline once loaded.

## Docs
- [README](https://github.com/Atishyy27/tripkit/blob/main/README.md): what it does, why it
  differs from a normal guide, and the exact data sources it reads.
- [DATA-SOURCES.md](https://github.com/Atishyy27/tripkit/blob/main/DATA-SOURCES.md): field-by-field
  data provenance and licensing (OpenStreetMap/ODbL, Wikivoyage/CC BY-SA 4.0, Nominatim).
- [PRIOR-ART.md](https://github.com/Atishyy27/tripkit/blob/main/PRIOR-ART.md): how tripkit differs
  from existing travel-guide apps and prior OSM/Wikivoyage tools.
- [CHANGELOG.md](https://github.com/Atishyy27/tripkit/blob/main/CHANGELOG.md): version history.
- [LICENSE](https://github.com/Atishyy27/tripkit/blob/main/LICENSE): MIT.

## App
- [Open tripkit](https://atishyy27.github.io/tripkit/): the live app. No signup, no install
  required to try it.

## Optional
- [CONTRIBUTING.md](https://github.com/Atishyy27/tripkit/blob/main/CONTRIBUTING.md): how to
  contribute code or data fixes.
```

Place at `https://atishyy27.github.io/tripkit/llms.txt` (GitHub Pages serves whatever's in
`docs/`, so drop this file at `docs/llms.txt`).

### llms-full.txt, de facto pattern, not spec

Don't hand-type this one. It's meant to be the full text of README + DATA-SOURCES + PRIOR-ART
concatenated verbatim, and hand-copying 667 lines into a doc that goes stale the next time any of
those files change is the exact stale-doc problem worth avoiding. Generate it at publish time:

```bash
cd /Users/atishay/Desktop/codes_masti/tripkit
{
  echo "# tripkit, full reference text for LLMs"
  echo
  cat README.md
  echo
  echo "---"
  echo
  cat DATA-SOURCES.md
  echo
  echo "---"
  echo
  cat PRIOR-ART.md
} > docs/llms-full.txt
```

---

## 2. Structured data (JSON-LD)

Checked schema.org directly (`schema.org/WebApplication`, `schema.org/applicationCategory`).
**Correction to a common assumption:** `applicationCategory` has no schema.org-enumerated value
list: the property page only gives the free-text example `"Game, Multimedia"` and accepts
Text or URL. `TravelApplication` is a string convention that circulates from Google's own
structured-data guidance for software/app listings, not something schema.org itself validates: I could not re-confirm the Google page this session (search was dead), so that string is
**unverified as an "official" value**, though it will still validate fine as plain Text since the
property accepts arbitrary text.

`WebApplication` (a subtype of `SoftwareApplication`) fits tripkit correctly: it's a thing you use
in a browser, not something with an app-store SKU (`SoftwareApplication` alone) and not a curated
day-plan document (`TouristTrip`, which describes an itinerary, not a piece of software).
`TravelAction` is an action type (recording that a person traveled somewhere): it doesn't
describe the product and doesn't belong here.

One deliberate omission: **no `SearchAction`.** I checked `docs/app.js` before writing this, the
boot handler (`app.js:839`) only loads a shared place when both `lat` and `lng` are present in
the URL; `?q=<name>` alone does nothing, because place resolution happens through Nominatim
autocomplete before any URL is built. A `SearchAction` with `urlTemplate:
"...?q={search_term_string}"` would validate as JSON-LD but would not actually work, exactly the
kind of claim that looks right until someone clicks it. Not including it until/unless a real
name-only deep link exists.

### Ready-to-paste JSON-LD

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "tripkit",
  "alternateName": "tripkit, what's open right now",
  "url": "https://atishyy27.github.io/tripkit/",
  "description": "A travel guide that reads the clock. Type a town and see what is open right now, ranked by whether this is genuinely that place's hour, with anything that will not fit before you have to leave hidden. Built from OpenStreetMap and Wikivoyage; sunrise and sunset are computed on-device. No account, no API key, no backend, no AI in the data path.",
  "applicationCategory": "TravelApplication",
  "operatingSystem": "Any (runs in a web browser; installable as a Progressive Web App)",
  "browserRequirements": "Requires JavaScript. Works fully offline once loaded.",
  "softwareVersion": "0.3.1",
  "isAccessibleForFree": true,
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "license": "https://github.com/Atishyy27/tripkit/blob/main/LICENSE",
  "codeRepository": "https://github.com/Atishyy27/tripkit",
  "sameAs": ["https://github.com/Atishyy27/tripkit"],
  "author": {
    "@type": "Person",
    "name": "Atishay Jain",
    "url": "https://github.com/Atishyy27"
  },
  "image": "https://atishyy27.github.io/tripkit/og.svg",
  "featureList": [
    "Ranks nearby places by whether the current moment is genuinely their hour",
    "Hides anything that will not fit in the time left before you must leave",
    "Computes sunrise, sunset and twilight on-device from NOAA solar equations",
    "Works fully offline once loaded; installable to a home screen",
    "No account, no API key, no backend, no tracking, no AI-generated text"
  ]
}
</script>
```

Paste into `docs/index.html` `<head>`, after the existing meta tags (verified those exist at
`docs/index.html:1-25`, so this doesn't duplicate anything already there). Version string (`0.3.1`)
is sourced from `pyproject.toml:7` and `CHANGELOG.md:7`, update it there when it changes, not just
here, or this block silently goes stale.

---

## 3. AI tool directories

Mixed results, several are real but not free, one confirmed dead, several timed out against
anti-bot walls (can't submit invented URLs I couldn't independently load).

| Directory | Submission URL | Free? | Account? | Approval time | No-signup free tool eligible? |
|---|---|---|---|---|---|
| **Futurepedia** | `futurepedia.io/submit-tool` (verified, fetched directly) | **No**, $247 (basic, sold out at fetch time) or $497 (verified, one-time) | Not explicit on the page, but has login/registration | Basic: within 7 days · Verified: within 2 business days | Editorial discretion clause exists ("may be denied... if deemed inappropriate for our audience"); site explicitly brands as "the #1 collection of AI tools", tripkit has **zero AI in its data path**, which is a real positioning mismatch, not just a fee problem |
| **There's An AI For That** | `theresanaiforthat.com/submit` | **Unverified**, page timed out twice (60s) against what's likely anti-bot protection, same class of block hit on weeklyOSM. Not confirming cost/process from memory. | Unverified | Unverified | Unverified, and same mismatch concern as Futurepedia: tripkit isn't an AI tool, it's explicitly anti-AI-in-the-data-path |
| **Openbase** | `openbase.com` | N/A | N/A | N/A | **Confirmed gone**, `www.openbase.com` fails DNS resolution (`ENOTFOUND`) as of this fetch. Don't pursue it. |
| **AlternativeTo** | tried `alternativeto.net/software/new/` | Inconclusive, fetch returned only the sign-in page, not the submission form | Requires an account (sign-in page confirmed) | Unverified | Plausible fit (it lists free/OSS software generally), but I couldn't load the actual submission page to confirm rules |
| **SaaSHub** | tried `saashub.com/add` | 404, wrong path, real submission URL not found this session | Unverified | Unverified | Unverified |
| **Product Hunt** | `producthunt.com/posts/new` (redirects through login) | Free to launch (from the visible page: no listed launch fee, "Advertise" is a separate paid product) | **Yes**, account required (LinkedIn/GitHub/X login) | Not a review queue, it's a scheduled daily launch, live same-day once scheduled | Yes, Product Hunt has no AI requirement and regularly features free/no-signup tools; best fit of the ones checked, but I could not load the actual maker-launch form, only the login gate |
| **AI Valley, ToolFinder, Slant, StackShare** | not fetched this session |, |, |, | Couldn't check, no confirmed candidate URL fetched, and WebSearch to find one is exhausted. Not reporting anything on these; don't guess. |

**Bottom line for this section:** the "AI tool directory" category is a poor structural fit for
tripkit specifically because tripkit's entire pitch is *no AI in the data path*, listing it
alongside AI-generated-content tools either gets rejected on relevance grounds or requires
positioning it dishonestly. The better-fit channels are the privacy/self-hosted/open-source
directories in section 4, and Product Hunt (general launch platform, not AI-specific) if a
directory push is wanted at all.

---

## 4. Awesome lists on GitHub

Fetched raw READMEs directly where possible.

| List | Repo URL | Contribution rules | Fit | Exact entry line |
|---|---|---|---|---|
| **awesome-openstreetmap** | `github.com/osmlab/awesome-openstreetmap` (confirmed real, the `awesome-openstreetmap` GitHub *topic* has zero tagged repos, but this specific repo exists and is linked from `sindresorhus/awesome`'s own README under "Miscellaneous") | No explicit CONTRIBUTING.md rules found in the fetched README; standard is a PR adding one line to the right section | Strong fit, has a **Maps > Web Maps** section with a directly comparable existing entry ("Visit Sights, self-guided sightseeing tours") | `* [tripkit](https://atishyy27.github.io/tripkit/) - Ranks nearby OSM places by whether this is genuinely their hour and hides what won't fit before you leave. No account, no AI.` |
| **awesome-privacy** | `github.com/pluja/awesome-privacy` (confirmed real, 19.7k stars at fetch time; note: this is the actual maintained one, not a repo literally named "Igglybuff/awesome-privacy," which returned 404) | Contributing guide at `misc/Contributing.md` (linked from README header); PRs against category sections | Strong fit, has a dedicated **Maps and Navigation** category, and OpenStreetMap itself is already listed there as a reference entry, which is direct evidence this category is the right one | `- [tripkit](https://atishyy27.github.io/tripkit/) - Offline-capable travel guide from OpenStreetMap and Wikivoyage; no account, no tracking, nothing sent to a server.` |
| **awesome-selfhosted** | `github.com/awesome-selfhosted/awesome-selfhosted` (real, ~317k stars) | Data lives in a companion repo, `awesome-selfhosted/awesome-selfhosted-data`, as **YAML files** in `software/`, kebab-case filenames, built from `.github/ISSUE_TEMPLATES/addition.md`. Explicit exclusion: **"software that acts as a platform to build and deploy arbitrary applications (PaaS/serverless)"** and cloud-provider-dependent software. Also requires the project to have been **first released more than 4 months ago with tagged releases**, and gets removed after 6-12 months of inactivity. | **Genuinely uncertain, don't force it.** There's a "Travel Organization" and a "Maps and GPS" section in the TOC, so category-wise it fits, but the list's actual premise is software *you deploy on your own server*, and tripkit has no server component to deploy at all; it's a static client-side app already hosted on GitHub Pages. Whether maintainers would accept a "nothing to self-host, just open the URL or clone the static files" submission is a real judgment call I can't resolve without asking them. | Not drafted, resolve the eligibility question first, in an issue on that repo, before writing an entry |
| **awesome-pwa** | tried `github.com/sindresorhus/awesome-pwa` | **404, does not exist at that path.** I had the wrong owner guessed; couldn't find the real one without search. | Not confirmed to exist |, |
| **awesome-offline-first** | searched via GitHub topic page | **No repo with this exact name found.** Closest real matches: `gdamdam/awesome-offline-knowledge` (knowledge/content focus, not apps) and `Nickersoft/awesome-offline` (privacy-first offline *alternatives* to web software, plausible fit but not verified in detail this session) | Unconfirmed |, |
| **awesome-travel** | checked via `sindresorhus/awesome` README | **No dedicated awesome-travel list found.** The master list's closest adjacent entries are `MobilityData/awesome-transit` (transit data/APIs, not trip guides) and `joewdavies/awesome-frontend-gis` (GIS dev tooling, not end-user apps), neither is a real fit | Not applicable |, |
| **awesome-no-login** | not found | No such list located |, |, |

---

## 5. OpenStreetMap's own channels

- **`wiki.openstreetmap.org/wiki/List_of_OSM-based_services`**, confirmed real and the right
  page. It's a hand-maintained, alphabetically-sorted table of "ready and free to use projects
  using OpenStreetMap data," with columns for Genre, Covered region, Languages, Description, and
  a "Free materials" (open-source) flag. Anyone can edit the OSM wiki (standard MediaWiki account,
  no special approval). This is the correct, low-effort listing target.
- **OSM Apps Catalog** (referenced from that page): this is a separate, automatically-generated
  catalog site that pulls from the OSM wiki, Wikidata, GitHub topics, and Taginfo. Confirmed: the
  actual way in is **not a submission form**, it's (a) create a wiki page for tripkit using the
  wiki's "Software" template, which the catalog picks up within about a day, and/or (b) tag the
  GitHub repo with the `openstreetmap` topic. Both are things I can hand over as concrete next
  actions rather than a form URL, because there is no form.
- **`wiki.openstreetmap.org/wiki/Category:Software`**, confirmed real, has 66 listed software
  entries across subcategories (routing, games, processing, etc.). Tourism/travel-guide apps are
  thin here, most entries are mapping/routing/data tools, so tripkit would be a somewhat novel
  category member rather than joining a crowded peer group, which is arguably good (less
  competition for attention) or bad (no existing "travel guide app" category to slot into cleanly)
  depending on how you read it.
- **OSM community forum** (`community.openstreetmap.org`), confirmed real (official OSM Discourse
  forum). Confirmed: no dedicated "Software" or "Announcements" category visible; the closest fit
  is **"General talk."** I could not confirm signup requirements from the fetched page, standard
  Discourse forums require an account to post, this just wasn't stated on the page I could load.
- **weeklyOSM**, could NOT verify. `weeklyosm.eu/about/` is behind **Anubis**, an anti-bot
  challenge page, so I got zero content back. I know from general knowledge (unverified this
  session) that weeklyOSM is a volunteer-run roundup with a public "suggest a link" submission
  process, but I'm not going to hand over a submission URL I couldn't load and confirm still
  exists.
- **OSM Foundation blog** (`blog.openstreetmap.org`), confirmed real. No guest-post policy stated
  on the page I fetched. The only concrete contact surfaced was `communication@osmfoundation.org`
  (for translation help specifically, not tool announcements) and a link to
  `osmfoundation.org/wiki/Contact` for anything else, which I did not fetch separately this
  session.

---

## 6. Wikivoyage's own channels

**Genuine negative finding, not a search failure to hide.** I checked two direct candidates:
`en.wikivoyage.org/wiki/Wikivoyage:Tools` (404) and `en.wikivoyage.org/wiki/Wikivoyage:Welcome,_Wikitravellers`
(404), then the Meta-Wikimedia project page for Wikivoyage, which loaded. That page mentions two
specific third-party tools that already consume Wikivoyage data, a "Wikivoyage Listings" analysis
tool and a bot called **Transvoyage** that adds listings via Wikidata, but there is **no dedicated
page listing third-party apps/tools that reuse Wikivoyage content**, comparable to what OSM has.
Scope of this negative: checked the two most likely Wikivoyage-namespace page names plus the
Meta-Wikimedia project page; did not check Wikidata's own project pages or the Wikimedia API
mailing list/Phabricator, which is where Wikivoyage's actual developer community coordinates.
**Conclusion: there is no clear listing channel on Wikivoyage's side to submit to.** The realistic
move for Wikivoyage-side discoverability is attribution quality on tripkit's own pages (CC BY-SA
4.0 requires it anyway) rather than trying to get listed by them.

---

## 7. What makes an LLM likely to recommend a tool

This is the section most at risk of turning into speculation, so here's what's actually grounded
versus what I'm flagging as inference from how retrieval and training work, not from a source I
fetched this session (WebSearch was dead the whole session, so I have no live citations for GEO
studies specifically, treat this section's claims as reasoned from known retrieval-system
mechanics, not verified against a fetched source).

**Grounded in what I confirmed elsewhere in this doc, not speculation:**
- A live web-search-augmented assistant (Perplexity-style, or Claude/ChatGPT with browsing) surfaces
  whatever a real web search returns at answer time, so ranking in ordinary search (backlinks,
  domain authority, matching query intent) still matters directly, because these tools are
  literally running a search and reading the results.
- Structured data (section 2) helps the *search* layer, not the model layer directly: Google and
  Bing both use JSON-LD to build rich understanding of a page for their own indexes, and
  browsing-enabled assistants ride on top of that same index. This is a real, if indirect, lever.
- Being listed in a **curated, high-trust aggregator** (an awesome-list, the OSM wiki's own
  services page) matters more than being listed in a low-trust content-farm directory, because
  those aggregators are exactly the kind of page that (a) gets crawled repeatedly, (b) gets linked
  to from other high-authority pages, and (c) is the kind of source a retrieval system or a
  training-data curation pipeline is more likely to weight: this is inference, not something I
  fetched a source confirming, but it follows directly from how PageRank-style authority and
  training-data curation (deduplication against high-quality sources) are known to work.

**Explicitly inference, not verified this session, and flagged as such:**
- A model trained on data through some cutoff can only "know" about tripkit if it appeared in
  training data before that cutoff, no amount of post-hoc SEO changes that. The only lever that
  works *immediately* for a chat tool is one with live web search or retrieval turned on.
- Consistency of the same facts (name, one-line description, URL, "no account, no AI, MIT
  license") repeated verbatim across every surface (GitHub README, llms.txt, JSON-LD, any
  directory listing) is plausibly what reduces the chance an LLM hallucinates a wrong URL or wrong
  description when recommending it: this is a reasonable inference from how retrieval-augmented
  answers work (they quote from whatever the retrieved chunk says), not something I have a
  benchmark for.
- I cannot state a verified ranking of "which single signal matters most": I don't have a source
  I fetched this session that measures this, and I'm not going to manufacture a confident-sounding
  order to fill the section.

---

## What failed or went unverified (full list, per the task's own rule)

- All further **WebSearch** calls after the very first batch (search quota was already at 0/200
  for this session before this task began, every finding above came from direct WebFetch of
  URLs I already had reason to try, not from search).
- `theresanaiforthat.com/submit` and `/submit/`, timed out twice (60s), likely anti-bot.
- `saashub.com/add`, 404, wrong path.
- `alternativeto.net/software/new/`, loaded only a login wall, not the submission form.
- `weeklyosm.eu/about/`, blocked by an Anubis anti-bot challenge page.
- `github.com/sindresorhus/awesome-pwa`, 404, wrong owner guess, real repo not found this session.
- No repo found for `awesome-offline-first`, `awesome-travel`, or `awesome-no-login` as literal
  names.
- `en.wikivoyage.org/wiki/Wikivoyage:Tools` and `.../Wikivoyage:Welcome,_Wikitravellers`, both 404.
- `raw.githubusercontent.com/.../CONTRIBUTING.md` for awesome-selfhosted's *main* repo, 404 (the
  actual contribution rules live in the separate `-data` repo, which I did successfully fetch).
