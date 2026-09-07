# tripkit, channels, community rules, and a sequenced launch plan

Compiled 2026-09-07. Research only, nothing posted. Companion to `LAUNCH.md` (which already
has draft copy for r/openstreetmap, Show HN, r/solotravel/backpacking, and Product Hunt) and
`gtm/03-product.md` (competitor research, same session-environment constraints).

**Method note, stated up front rather than buried.** This pass used WebFetch against
official rule/guideline/submission pages directly. Two hard blockers hit immediately and
shaped everything below:

1. **`reddit.com` (and `old.reddit.com`, and a `r.jina.ai` proxy in front of it) is fully
   unfetchable in this environment**, every attempt returned "Claude Code is unable to
   fetch from www.reddit.com" or a 403 from Reddit's own edge. This is a repo-wide
   constraint already logged in `gtm/03-product.md`, not new to this pass.
2. **WebSearch had already used its full session budget (200/200) before this task started**: it is a shared, cross-task quota, and every WebSearch call in this session returned
   "search budget... continue with information already gathered instead."

Net effect: **every Reddit subscriber count and every Reddit self-promotion rule in
Section 1 is unverified this session**, not guessed, not filled from memory, explicitly
marked. Per the standing rule ("he searches, I do not scrape"), the fix is that you open
each subreddit's "About Community" / rules wiki yourself and paste it back, it's a
30-second look for you and an impossible fetch for me right now. Section 1 gives you
exactly what to check per subreddit so that look is fast. Everything in Sections 2-4 that
does NOT carry an "unverified" tag was read from the actual live page this session, with
the page named.

---

## 1. Reddit

**Could not verify: subscriber counts, exact self-promotion rule text, for all 14 subs.**
Reason: Reddit is unfetchable from this environment (see method note). Do not treat any
number below as real, there are none, deliberately. What follows is topical fit only
(does this audience plausibly want tripkit, regardless of the exact rule) plus the exact
thing to go check before posting.

| Subreddit | Subscribers | Self-promo rule | Topical fit | What to check before posting |
|---|---|---|---|---|
| r/openstreetmap | not verified | not verified | **Best fit.** Already the lead pick in `LAUNCH.md`, OSM contributors care about `opening_hours` coverage and rarely see it used in a consumer-facing tool | Open r/openstreetmap → About Community → Rules. This is a small, technical, low-traffic sub; self-promo is usually tolerated if it's substantive and you engage in comments, but confirm before posting |
| r/solotravel | not verified | not verified | Good fit for the traveller-facing pitch (already drafted in `LAUNCH.md` #3) but large travel subs are the most likely to have a strict "self-promo Saturday only" or outright ban | Check the sidebar/rules wiki for a dedicated self-promo thread or day; posting outside it on a large sub is the single most common way to get banned rather than just removed |
| r/backpacking | not verified | not verified | Same audience as r/solotravel, smaller and more gear/logistics-focused | Same check; likely a near-duplicate audience so post one or the other first, not both same week |
| r/travel | not verified | not verified | Largest, most general, most heavily moderated against self-promo of any travel sub, general reputation, not confirmed this session | Verify explicitly; this is the one most likely to auto-remove or ban on a first post with no history |
| r/digitalnomad | not verified | not verified | Weak fit: the audience skews toward long-stay/remote-work logistics, not a single day in a town | Low priority; check rules only if you decide to pursue it |
| r/onebag | not verified | not verified | Weak fit, packing/gear community, tangential to itinerary planning at best | Low priority |
| r/webdev | not verified | not verified | Fit is on the build, not the product, "I built X" show-and-tell is common on this sub | Check for a dedicated "Showoff Saturday" style thread; many dev subs gate self-promo to one weekly thread |
| r/SideProject | not verified | not verified | **By reputation, this subreddit's entire purpose is showcasing side projects**, but that reputation is not re-confirmed this session, verify the current rules text still says that before assuming it | Should be close to zero-risk if the reputation holds; confirm current rules first anyway |
| r/InternetIsBeautiful | not verified | not verified | High audience size, but by longstanding general reputation this sub has historically restricted or banned poster-submitted self-promotion (rule commonly phrased as no submissions from the creator), again, not confirmed this session | Do not post here without reading the current rules first; this is the sub most likely to have a rule that directly forbids what you'd be doing |
| r/opensource | not verified | not verified | Good fit, MIT license, no backend, no AI in the data path are exactly the values this audience cares about | Check rules; generally more tolerant of "I built this, it's open source" posts than general subs |
| r/selfhosted | not verified | not verified | Partial fit, tripkit isn't self-hosted (it's client-only, no server), so the framing has to be "no backend to host at all" rather than "here's my self-hosted app," which may or may not match what this sub wants | Check rules; also reconsider whether this is actually on-topic given tripkit has nothing to self-host |
| r/privacy | not verified | not verified | Fit is narrow and honest: no telemetry, nothing sent anywhere, works offline. Privacy subs are typically strict about promotional posts unless privacy is the central feature, which it genuinely is here | Check rules closely; lead with the privacy architecture (client-only, no account, no analytics) not the travel pitch |
| r/degoogle | not verified | not verified | Narrow fit: relevant only insofar as tripkit doesn't need a Google account or Google Maps | Lower priority than r/privacy; same caution on promo rules |
| r/india | not verified | not verified | Fit via "built by an Indian developer" and the Rajasthan coverage numbers already in `LAUNCH.md`, but very large general-interest subs are usually the strictest on self-promo | Check rules; likely needs a non-promotional framing (e.g. post as a build story, not a link drop) |
| r/indiatravel | not verified | not verified | Better fit than r/india for the actual product (India-specific travel use case, the Pushkar/Ajmer coverage numbers are directly relevant) | Check rules; smaller sub, moderation style unknown without a live check |

**What r/openstreetmap and r/SideProject have going for them regardless of the unverified
rule text:** both are the kind of niche, low-traffic community where a single thoughtful
post from a first-time poster is normal, not suspicious. The large general subs (r/travel,
r/india, r/InternetIsBeautiful) are where an unverified rule is the highest-risk gap,
because those are exactly the subs with automod karma/account-age gates and strict
promo-ratio enforcement that silently removes or shadow-bans a post with no warning.

---

## 2. Hacker News, Show HN

Confirmed from `news.ycombinator.com/showhn.html`, fetched live this session.

- **What it's for:** "something you've made that other people can play with", interactive
  projects only. tripkit qualifies directly: it's a live, no-signup web app.
- **Disallowed:** blog posts, sign-up pages, newsletters, lists, and other non-interactive
  reading material; landing pages; fundraising campaigns; trivial incremental version bumps.
- **Requirement:** you must be the creator and be present to discuss it in the comments.
- **Minimize friction:** "make it easy for users to try your thing out, ideally without
  barriers such as signups or emails", tripkit already meets this (no account, opens
  straight into the app).
- **Community norm:** commenters are expected to be constructive rather than adversarial;
  the community leans toward offering alternatives over pure criticism.

Not found on the official guidelines page (title conventions, exact best posting
day/time): the page doesn't state them. `LAUNCH.md` already has a working title ("Show HN:
A travel guide that reads the clock, with no AI in it") and a Tuesday-Thursday, 09:00-11:00
ET timing recommendation: that timing convention is general HN community folklore (higher
US traffic mid-week, mid-morning ET), not something on the official guidelines page, so
treat it as reasonable practice rather than an official rule.

**What kills a Show HN launch, per the guidelines text itself:** posting something
non-interactive, not being the creator, or not showing up to answer questions. tripkit's
own repo already has the honest failure mode ready to state if asked: the negative-gap
scheduler bug logged in `gtm/05-review.md` (`docs/engine.js`, `schedule()`), if it's still
unfixed at launch time, know that HN will find exactly that kind of edge case, because
that's what this crowd does.

---

## 3. The OpenStreetMap community

This is the audience most likely to engage substantively rather than just upvote, because
tripkit's honest coverage-gap framing (`LAUNCH.md`'s Lisbon/Munich/Pushkar/Ajmer table) is
exactly their subject matter.

**Community forum, community.openstreetmap.org (redirects to c.osm.org).** Confirmed live
via `community.openstreetmap.org/faq`: the only self-promotion-relevant rule found is the
general "Keep It Tidy, don't post spam or otherwise vandalize the forum," with a note that
individual categories may set their own additional rules. I could not load the specific
category listing (two attempts at category URLs both 404'd, my guessed URLs were wrong,
not a fetch block), so **I did not confirm which exact category is right for an
announcement post.** Practical fix: open the forum yourself, it has a visible category list
in the left sidebar, and the right one is almost certainly something like "Announcements"
or "Software/Community", paste back the category name and its description before posting.

**Talk mailing list, talk@openstreetmap.org.** Confirmed via `lists.openstreetmap.org`:
this is the general OpenStreetMap contributor/user discussion list, posted to by emailing
the address after subscribing. No specific posting etiquette is published on the listinfo
page itself. From general knowledge of this list (not fetched, flagged as such): `talk@` is
high-traffic, skews toward mapping process and governance debate, and a bare software
announcement with no mapping-community angle can read as off-topic there. A better-targeted
option, not independently confirmed this session, is a country/regional list (e.g.
`talk-in@` for India) where a locally-relevant tool announcement is more clearly on-topic.

**Chat, confirmed via `wiki.openstreetmap.org/wiki/Contact_channels`:**
- Discord: OpenStreetMap World Discord Server, `discord.gg/openstreetmap`, described as a
  general community space with dedicated channels for tagging, imagery, and development
  discussion.
- Matrix, IRC, XMPP, Telegram, Signal, Slack are all also listed as active channels on the
  same page, without individual invite links extracted this session.

**weeklyOSM.** Confirmed to be a real, ongoing OSM-ecosystem news roundup (referenced from
the OSM wiki). **Could not confirm the submission mechanism**: `wiki.openstreetmap.org/wiki/WeeklyOSM/Contribute`
and `wiki.openstreetmap.org/wiki/WeeklyOSM` both 404'd, and `weeklyosm.eu/contribute/`
returned an anti-bot block page ("Anubis") rather than content. Do not guess the process, ask him to open weeklyosm.eu and look for a "suggest a link" or contribute page, or check
their diary posts on osm.org, which historically is how they solicit items (unverified this
session).

**Wiki: "List of OSM-based services."** Confirmed real and live, at
`wiki.openstreetmap.org/wiki/List_of_OSM-based_services`: an actual alphabetical catalog
of OSM-powered software (routing engines, offline map apps, data exporters, etc.). Adding
tripkit is a standard wiki edit: create an account, add an entry following the existing
formatting for other entries (name, coverage, languages, description, license/open-source
status). This is the lowest-friction, close-to-zero-spam-risk item in this whole document, it's a directory edit, not a promotional post, and it puts tripkit in front of exactly the
people building routing/offline-map tools who might reuse pieces of it.

**Etiquette, synthesized from the above rather than one single page:** the OSM community
consistently rewards showing your work on the data, not just the app: the coverage numbers
in `LAUNCH.md` (Lisbon 33%, Munich 86%, Pushkar 7%, Ajmer 3% `opening_hours` coverage) are
precisely the right currency here, more so than anywhere else on this list. Lead with what
the data revealed, not with a request for stars.

---

## 4. Newsletters and aggregators

| Outlet | Confirmed process | Fit |
|---|---|---|
| **Console.dev** | Confirmed via `console.dev/selection-criteria`: evaluates on developer focus, self-service signup (no sales calls), fit into a regular dev workflow, quality/maintenance/docs/speed, and whether beta tools are clearly labeled beta. Confirmed contact: `hello@console.dev` (no separate public submission form found; footer links to a Criteria page, not a form) | Real fit is the **Python CLI**, not the web app, Console.dev's criteria (API/CLI support, power-user features, self-service) describe a developer tool, and tripkit's consumer web app isn't really "a developer tool," but `tripkit doctor` / `tripkit run` on PyPI is |
| **TLDR** | Could not confirm an organic/free submission path. `tldr.tech/submit` 404'd; the only submission-adjacent link found on the live homepage was "Advertise" → `advertise.tldr.tech`, which is paid sponsorship, not editorial submission | Do not plan on this as a channel without more research; do not assume it's reachable for free |
| **Changelog** (News) | Confirmed via `changelog.com/news/submit`: sign in, submit URL + title + a short note on why it's interesting (markdown supported); reviewed before publishing, email notification if it runs. Guidelines explicitly exclude how-tos and commercial products (unless sponsoring), and ask for a case for newsworthiness given high submission volume. A separate, different form exists for podcast episode suggestions | Good fit for the CLI/open-source engineering story, weaker fit for the plain consumer pitch, lead with the architecture decision (Wikivoyage over paying an LLM to invent facts, `LAUNCH.md` #2) |
| **Hacker Newsletter** | Could not confirm a submission process. `hackernewsletter.com/submit` and `/about` both 404'd; the live homepage has no visible submit/contact link, only a subscribe box, press mentions, and a Buttondown-powered footer | Do not treat as a submittable channel without further research; general reputation (not confirmed this session) is that it's hand-curated from what's already trending on HN/Reddit, which argues for getting picked up organically after Show HN rather than pitching it directly |
| **Indie Hackers** | Confirmed `/new-post` and `/products/new` exist as live pages, but the actual community guidelines on self-promotion were not retrievable from the fetched content (needs a signed-in view) | Plausible low-effort channel (post as a "I shipped" story + add the product listing) but rules unverified, read the FAQ/guidelines once logged in before posting |
| **BetaList** | Confirmed via `betalist.com/faq`: **paid, no free tier**, requires your own domain (rejects `*.vercel.app`/`*.netlify.app`/`*.herokuapp.com`, not an issue for tripkit, which is on GitHub Pages under a custom-looking path already), pricing shown at end of submission form, full refund if not selected, minimum 24-hour gap between feature and newsletter inclusion | Costs money for a pre-revenue open-source hobby project; weigh against free channels above before spending on it |
| **Peerlist** | **Could not access.** `peerlist.io` and `peerlist.io/launchpeer` both returned 403 Forbidden on every attempt | No verified information; would need him to check it directly |
| **Product Hunt** | Confirmed via `producthunt.com/launch`: free to use, requires a personal (not company) account, submit via "New Product" + URL, explicit rule against directly asking people to upvote, best practice is engaging in comments rather than campaigning, and, per the page, best launch time is 12:01am Pacific for makers planning ahead | Good fit, zero cost, but note the account nudge in `LAUNCH.md`'s pre-launch checklist about the private `atishyy278/tripkit` repo, same identity hygiene applies to which account launches on PH |

---

## 5. The hostile questions

Grounded in the actual repo (`README.md`, `CONTRIBUTING.md`, `PRIOR-ART.md`,
`gtm/05-review.md`, and the live GitHub repo metadata pulled this session), not
speculation.

**"Why not Google Maps?"** Because a static, no-backend, no-API-key site cannot legally
redistribute Google Places/Maps data the way it uses OSM's, Google's terms require an API
key, billing, and displaying results on a Google-branded map, and restrict how long you may
cache results. This is standard, well-known Google Maps Platform ToS territory; **not
re-verified against Google's current terms text this session**, flagged as such rather than
cited as fact. OSM's ODbL data, by contrast, can be fetched, cached client-side, and shipped
in a static build with attribution, which is the entire reason the "no backend, no API
key" claim in the README is true at all.

**"The data is thin in my town."** True, and the app already says so rather than hiding it: this is the app's own stated design principle in `CONTRIBUTING.md` ("Never make the tool
invent a fact to fill a field... `null` is a correct answer here and a guess is not") and
is directly evidenced by the coverage numbers already published in `LAUNCH.md` (Pushkar 9 of
129 places with hours, 7%; Ajmer 3 of 104, 3%). The honest answer is: this is a genuine,
named limitation, and the fix is adding `opening_hours` tags to OSM for that town, which
`CONTRIBUTING.md` names as "the single highest-impact contribution to this project."

**"No AI is a gimmick."** The counter-evidence is architectural, not defensive:
`PRIOR-ART.md`'s stated design finding is that Wikivoyage listing templates already carry
name, hours, price, and a human-written worth-it sentence per place, for one small Indian
town, OSM gave 0 descriptions and Wikivoyage gave 44, with 20 prices and 4 safety notes.
Paying a model to invent that data was, per that same document, "the wrong architecture,
not just a slow one." The honest answer isn't "AI is bad," it's "the data already existed
and a model would have been guessing over a source that already tells the truth."

**"This is just an OSM wrapper."** Partially fair, and the honest response should concede
the base layer while naming the actual work on top of it: the ranking-by-hour engine, the
departure-deadline day planner, and the on-device sunrise/sunset math are original logic,
not a repackaging of Overpass output. The concession that should ship alongside this
answer, not be hidden from it: `gtm/05-review.md` documents a real, currently-unfixed
scheduler bug (`docs/engine.js`, `schedule()`, minute clock never wraps modulo 1440) where
a 24/7 place can be reported "shut" with a negative reopen time on a long single day, if
that's still live at launch, "just a wrapper" critics will find it before anyone volunteers
it, so it's better raised first.

**"The same repo has an LLM CLI, so the no-AI claim is misleading."** Confirmed real and
already disclosed: `README.md` lines 13-18 state plainly, in a `<sub>` note right under the
"No AI" line, that the web app has zero AI in it and a separate Python CLI (`tripkit run`,
described further down the README, backed by `tripkit/llm.py` and `tripkit/cli.py`)
optionally uses Claude to research facts open data can't hold, like whether a place is
overrated. `LAUNCH.md` already names this as "the hardest question, and it is a fair one,"
with the instruction to say it plainly before someone else does. The honest position: two
different programs, one link, and the one the public link opens has no AI in its data path
at all: the disclosure already exists, so the job at launch time is repeating it plainly
in the launch post itself, not just leaving it in the README for someone to dig up.

**"Who maintains this in a year?"** The honest, unpadded answer, pulled from live GitHub
metadata this session (`gh api repos/Atishyy27/tripkit`): the repo was created 2026-09-06,
has 0 stars, 0 forks, 0 watchers, and one contributor: it has no track record yet, because
it does not exist yet in public. There is no credible answer here beyond "one developer,
MIT-licensed, and CONTRIBUTING.md explicitly redirects the highest-value contributions
(adding `opening_hours` data) to OpenStreetMap itself rather than this repo", meaning even
if the repo goes fully unmaintained, the data it depends on keeps improving independently.
That's a real, defensible answer; a promise of long-term personal maintenance is not one.

---

## 6. Sequenced plan

Fix-before column states what should be true before that post goes out, not busywork.

| Order | Channel | Fix before posting | Why this position |
|---|---|---|---|
| 1 | **OSM wiki: add tripkit to "List of OSM-based services"** | Nothing functional: this is a directory edit, near-zero downside, and confirmed to exist and be editable | Lowest risk in the entire list, and it seeds discoverability among exactly the people who'll show up later on the forum/Discord if you lead with this first |
| 2 | **r/openstreetmap** | Confirm current subreddit rules yourself (blocked here); otherwise `LAUNCH.md`'s draft is ready | Best-aligned audience, already scoped in `LAUNCH.md`, and their likely first finding (the `opening_hours` parser's deliberate refusal of seasonal/sunset rules) is something you can defend today |
| 3 | **OSM community forum / Discord** | Confirm the right forum category yourself (couldn't fetch the category list); mention the same coverage numbers as the Reddit post | Same audience as #2 by a different door; running it a day or two later lets any bug the Reddit crowd finds get fixed first |
| 4 | **Show HN** | Fix the negative-gap scheduler bug in `gtm/05-review.md` if it's still open, HN is the audience most likely to construct that exact failing input and post it publicly | Largest, most technically adversarial audience on this list; go after the OSM crowd has had a shot at the data-layer bugs, not before |
| 5 | **r/SideProject, r/opensource** | Confirm current self-promo rules yourself (blocked here); by reputation both are low-friction for a genuine "I built this" post | Different, less specialist audience, post after HN so the "hostile questions" answers above are already rehearsed from real comments, not hypothetical |
| 6 | **Product Hunt** | Decide which GitHub/PH identity launches it (same identity-hygiene note as `LAUNCH.md`'s pre-launch checklist); confirmed free, no account restrictions beyond personal-not-company | Benefits from momentum/screenshots from the earlier posts; the "don't ask for upvotes" rule matters more when you already have an audience to genuinely share it with, not cold |
| 7 | **r/solotravel or r/backpacking, r/indiatravel** | Confirm current self-promo rules yourself (blocked here); use the non-technical pitch already drafted in `LAUNCH.md` #3 | Non-technical travel audience, best reached once the product has already survived the harsher technical crowds and any embarrassing bug is fixed |
| 8 | **Changelog News** | Have the Wikivoyage-vs-LLM architecture story (Section 5, "no AI is a gimmick") ready as the submission's "why it's interesting" text | Editorial outlet, benefits from the story being already refined by then; low cost to attempt, no reason to rush it early |
|, | **TLDR, Hacker Newsletter, Peerlist** | N/A, no confirmed submission path found for any of the three this session | Not sequenced; don't spend effort chasing an unconfirmed inbound path. Revisit only if he independently finds and pastes back a real submission process |
|, | **BetaList** | N/A, paid, no free tier | Deprioritized purely on cost for a free/OSS project; only worth it if he decides the paid reach is worth it later |
|, | **r/travel, r/india, r/digitalnomad, r/onebag, r/webdev, r/privacy, r/degoogle** | Confirm rules yourself first in every case | Weaker topical fit or higher promo-rule risk than the channels above; not worth sequencing ahead of the stronger sub-list until the first wave's results are in |

---

## What could not be completed, stated plainly

- **All 14 Reddit subscriber counts and rule texts**, Reddit is unfetchable from this
  environment on every URL form tried (`www.reddit.com`, `old.reddit.com`, a `r.jina.ai`
  proxy in front of it), and WebSearch had already exhausted its shared 200-call session
  budget before this task began.
- **The exact OSM community forum category** for an announcement post, two guessed
  category URLs 404'd; the forum's own category list was not retrieved.
- **weeklyOSM's submission mechanism**, both wiki pages tried 404'd, and the live site
  blocked the fetch with an anti-bot challenge page.
- **TLDR's and Hacker Newsletter's submission processes**, no working submission page
  found on either site; stated as "not found," not assumed absent.
- **Peerlist entirely**, every fetch attempt returned 403.
- **Indie Hackers' actual community/self-promotion guidelines**: the posting pages exist,
  but the guidelines text needs a signed-in view this tool doesn't have.

None of the above were filled in with a plausible-sounding guess. Where a general
reputation is stated instead (e.g. r/SideProject's purpose, r/InternetIsBeautiful's
historical self-promo stance, Hacker Newsletter being editor-curated), it is explicitly
marked as reputation/general knowledge, not something read this session, and each one is
flagged for him to confirm before it's relied on.
