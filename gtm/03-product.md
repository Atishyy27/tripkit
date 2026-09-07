# tripkit, competitive research and product direction

Compiled 2026-09-07. Scope: 16 named competitors + 5 design questions (no-backend group
planning, PDF export, multi-location data model, field usefulness, next 5 features).

**Method note, stated up front rather than buried:** research ran as 6 parallel agents doing
live WebFetch against official product pages, App Store customer-review RSS feeds,
Trustpilot, and Capterra. WebSearch quota was exhausted early (200/200, shared across the
session) so Reddit (WebFetch is blocked on reddit.com in this environment entirely) and G2
(returned 403 on every attempt) could **not** be used, despite being asked for. Every claim
below is tagged with its actual source; anything not independently confirmed says so instead
of being filled in. Star ratings from Trustpilot in particular come from small samples
(5-90 reviews) and Trustpilot self-selects for angry customers, treat the numbers as
directional, not representative.

---

## Competitor table

| Product | Most praised (source) | Top complaint (source) | Account required? | Group planning | PDF / calendar export |
|---|---|---|---|---|---|
| **Wanderlog** | Real-time collaborative map+itinerary in one view; "polished and capable" maps [wanderlog.com; trustpilot.com/review/wanderlog.com] | Free-trial-to-paid billing surprise, refund refused; inaccurate place data (a "free" museum that charged €10) [Trustpilot, 1.9/5, 51 reviews] | Yes, for save/collaborate | Advertised core feature: real-time co-editing + expense splitting [wanderlog.com]. No review confirms or denies quality, complaints are billing/data, not collab | Not found advertised (checked marketing page; no PDF/.ics claim) |
| **TripIt** | Auto-builds itinerary from forwarded confirmation emails, when parsing works [tripit.com/web] | Parser failures ("a 5-day tour became one hour"), outages, billing auto-renewal with no warning [Trustpilot, 1.7/5, 47 reviews] | Yes | Not a group-planning product, individual itinerary aggregation only; no group feature found | .ics referenced by reviewers as a sync point that breaks (implies it exists, unreliable); no PDF claim found. Pro tier $49/yr adds flight alerts [tripit.com/pro] |
| **Google Travel / Trips** | (legacy) Auto-built day plans from Gmail scanning + 200+ city guides [en.wikipedia.org/wiki/Google_Trips] | Could not verify, standalone app shut down Aug 2019, folded into Google Travel/Maps; no live review corpus reachable | Yes (Gmail-native) | Could not verify | Could not verify |
| **Roadtrippers** | "Ease of organizing our trip" for road-trip/camping discovery [Trustpilot] | Billing dominates: auto-renewal with no notice, charged post-cancellation, and a corroborated bait-and-switch, marketed 4 tiers, free tier only really offers the bottom rung [Trustpilot; confirmed structurally against live roadtrippers.com/plus] | No for basic use; required for save/collaborate | "Trip collaboration" gated to Basic ($35.99/yr) and up, free tier capped at 2 stops (down from 60 pre-2019) [roadtrippers.com/plus] | "Trip export" gated to Pro ($49.99/yr)+; format (PDF vs .ics) not specified on pricing page |
| **Sygic Travel (Tripomatic)** | Offline maps + auto day-by-day routing with per-mode travel-time estimates [App Store review] | 2023 redesign broke UX for long-time users; paywall confusion (paid, features didn't unlock) [App Store reviews] | Not to browse; yes to subscribe/sync | Shareable links w/ editor/viewer roles, real-time sync, documented [tripomatic.com/en/premium]; one review says shared trips don't always appear on mobile | **PDF confirmed and praised** ("great... includes the travel guides"), plus GPX/KML. No .ics found |
| **Layla (ex-Roam Around)** | AI-chat handoff to a human agent who actually books ["directed to a lovely human... helped book"] [App Store, Trustpilot 4.2/5] | AI routes to wrong locations, recommends permanently-closed places; app crashes lose the whole itinerary mid-session ["vibe coded garbage app"] [App Store] | Unclear, not stated; support-chat login referenced | Marketing shows multi-person trip examples but no documented collaborative-editing mechanism; zero review evidence found | Not found on site or in reviews |
| **Mindtrip** | Breadth of free functionality ("insane value... usually behind a paywall") [App Store] | Login expires constantly; factual/booking errors (wrong "cheapest" airline repeatedly); "great for planning, not great for using on your trip" [App Store] | Yes | Homepage claims group chat + shared itinerary building with real-time comments [mindtrip.ai]; no review confirms quality either way | Not found; one reviewer explicitly asks for calendar features |
| **Kayak Trips** | Auto-consolidates bookings from confirmation emails + real-time flight-delay alerts [kayak.com/trips] | Trip-forwarding/sharing bugs paired with unresponsive support | Yes | Page claims "shared itineraries and editing permissions"; only 1 Trips-specific review found (a sharing bug) | Not found |
| **Polarsteps** | GPS trail + social sharing of a live trip with family/friends [App Store] | Heavy GPS battery drain; misclassifies travel mode (driving vs walking); invasive contacts-permission ask | Yes | **Not true group editing**, one 1★ review explicitly: "would not allow both to contribute to same trip album." Real strength is asymmetric "follow" (others watch, don't edit); free tier caps followers at 5 | No PDF/.ics, export path is a paid physical photo book or a "Trip Reel" video |
| **Journi** | Private/selective trip sharing vs. posting to social media [App Store] | Slow photo loading; failed autosave losing a day's work; shared-album access broken across years of review history | Yes, for sync/shared journals, one 1★ user deleted the app entirely when Facebook sign-in was removed | Supports invited/shared journals but execution is inconsistent per reviews; invitees need their own account | Physical photo books/prints only; no digital PDF/.ics found |
| **Rome2Rio** | Breadth/accuracy of multi-modal route discovery, long-time users crediting real savings [App Store] | Fare/time estimates sometimes badly wrong (quoted 15 min/$3 taxi, actually 4 hrs/$16), "CANNOT be trusted"; ads take over half the screen [Trustpilot 3.2/5 vs App Store ~4.65: a real split, not averaged] | Not required for search | None, one Trustpilot review names the gap directly: no shareable-trip URL | None found; it's a route search/comparison tool that hands off to booking partners |
| **Inspirock** | Automated, customizable day-by-day itinerary with drag-and-drop + time-conflict alerts [Trustpilot 4.6/5, 3,079 reviews] | Over-fills every time slot with tour ideas, "fundamental oversight," no room for personal notes; rigid 30-min blocks; web-only, no native app | Appears yes (from review evidence only, own site was unreachable) | No evidence of real-time co-editing found | Not established, own site unreachable, both major review aggregators blocked or wrong-product |
| **TripScout** |, |, |, |, | **Effectively not a live consumer competitor.** Live site now reads "Performance Social Media Partner for DMOs" (B2B tourism-board marketing): a pivot away from the consumer app. Current App Store "TripScout" results are unrelated 0-review apps reusing the name |
| **Bindle** |, |, |, |, | **Domain has lapsed** (redirects to a parked-domain page). No app found under that name in the App Store. Not a live product |
| **Umapped** (B2B, advisor↔client) | Output quality of client-facing itineraries called "unmatched"; easy client sharing [Capterra 4.3/5, 3 reviews] | No invoicing, one-way integrations, slow photo upload | Advisor-side yes | Advisor builds, client views/comments, reviews describe it working well | **PDF export explicitly a strength**, not a weakness, but **platform was discontinued 8 Oct 2025** per its own site notice. Cite as a former benchmark only |
| **Travefy** (B2B, advisor↔client) | Drag-and-drop builder speed; reusable "library" feature [Capterra 4.5/5, 20 reviews] | Trustpilot (2.6/5, 5 reviews): price jumped $15→$49 with no new features, locked annual contracts, **PDF hotel vouchers "import incorrectly," costing hours to fix by hand** | Advisor-side yes | Client gets a link with live-tracking + in-app messaging, liked by reviewers | Mixed: PDF exists and is used daily by advisors, but has a confirmed real bug (voucher import) and one reviewer says the PDF view lags the in-app view in polish |

Three products above (TripScout, Bindle, Umapped) turned out not to be live consumer
products at all as of Sept 2026: that is itself a finding: the no-login, local-first
niche tripkit sits in has weak current incumbents, not strong ones.

---

## 1. Group planning without a backend

Investigated: plain URL query string, lz-string-compressed URL fragment, CRDTs over WebRTC
(Yjs/y-webrtc, Automerge), PeerJS, GitHub Gist as a store, jsonbin.io-style JSON stores, IPFS.

| Approach | Survives refresh | Works on mobile | Free forever, no cost to tripkit's owner | State ceiling | Verdict |
|---|---|---|---|---|---|
| Plain URL query string | Yes, via the link itself | Yes | Yes | ~2000 chars is the safe cross-app/QR/share-preview limit | Superseded by the fragment version below |
| **lz-string-compressed URL fragment** | Yes, via the link | Yes | Yes | Fragment is stripped before the HTTP request is built, so it never even hits GitHub Pages' access logs (query strings do); lz-string's ~40-60% reduction on repetitive JSON pushes the practical stop count well past a plain query string | **Recommended baseline** |
| CRDT over WebRTC (Yjs + y-webrtc) | No, needs a live peer or a locally-persisted copy; closing the last open tab loses the live document | Yes, but mobile Safari/background tab throttling regularly kills held-open `RTCPeerConnection`s | Free, but the public signaling servers y-webrtc's own README lists (`wss://signaling.yjs.dev`, two `.herokuapp.com` URLs) have no uptime guarantee, and the README itself says it's "not suited for a large amount of collaborators" | Handles rich state fine: the bottleneck is peer discovery, not size | Viable as an **optional live layer**, not the primary mechanism |
| Automerge | Same limits as Yjs, but core `automerge-repo` ships no WebRTC adapter (WebSocket, BroadcastChannel, MessageChannel only), needs a self-hosted sync server for anything beyond same-tab | Same | No zero-infra public option confirmed | Fine in principle | Not recommended, strictly worse than Yjs for this constraint |
| PeerJS | No persistence of its own | Yes, same live-both-online constraint as any WebRTC approach | Uses a shared "PeerJS Cloud" broker with no published SLA | N/A, it's transport only, not a data model | Insufficient alone; would need Yjs/Automerge layered on top anyway |
| GitHub Gist as a store | Yes, if the gist persists | Yes | **No**, creating a gist currently requires being signed into GitHub; anonymous gist creation was removed. A shared gist means either every friend needs a GitHub account, or the owner's personal token sits in client-side JS as a leaked secret | 1MB/file, 300 files/gist | Ruled out, breaks the no-account requirement for anyone but the owner |
| jsonbin.io / npoint.io / jsonstorage.net | Yes, while the service is up | Yes | Free tiers are small and finite (jsonbin.io: 10,000 requests total, 100KB/record) and require an API key to write, same leaked-secret problem as the gist option, plus these are small third-party services with no confirmed shutdown-history track record either way | 100KB/record | Ruled out, reintroduces a secret in the client and a single point of failure tripkit doesn't control |
| IPFS | Effectively no, content is addressed by hash, so every edit is a new CID; there's no native "update this record" primitive without IPNS plus a pinning service (itself a hosted third party) | Yes, technically | Pinning for availability past your own browser tab is generally not free forever | Fine for static content, wrong shape for a frequently-edited list | Ruled out, solves durable distribution, not live co-editing |

**Recommendation:** ship the lz-string-compressed URL fragment as the actual "group planner": it survives everything, needs no account, no server, and no third party's uptime. Be
honest in the UI about what it actually is: **asynchronous relay-by-link, not live
co-editing.** If two people edit independently, whoever shares their link last silently
wins; the fix is a visible "last edited by you / this may be older than a version a friend
has" indicator, not pretending it's real-time. A Yjs + y-webrtc layer is a legitimate later
addition for people who happen to be online at the same time, but it should be optional and
should fail silently back to the link-based flow, since its own maintainers admit the public
signaling servers aren't guaranteed to stay up.

## 2. PDF export from a static site with no backend

Compared: `window.print()` + print stylesheet, jsPDF, pdf-lib, html2pdf.js, Paged.js.

| Approach | Text quality | File size | Fully offline | Effort on a vanilla-JS site | Verdict |
|---|---|---|---|---|---|
| **`window.print()` + `@media print`** | Real, selectable, searchable text, native browser rendering | Smallest (tens-low hundreds of KB) | Yes, zero dependency | Lowest, it's CSS the site benefits from having anyway | **Recommended** |
| jsPDF (direct-draw API) | Real vector text, but every line/wrap must be hand-coded, no HTML reflow | Small | Yes, once bundled | Moderate-to-high for a multi-page itinerary; also ASCII-only in the 14 standard fonts, needs a custom font for non-Latin text | Not worth it as the primary path; narrow use only |
| jsPDF `html()` plugin / html2pdf.js | **Rasterized**, text becomes an image, not selectable or searchable | Largest: a bitmap per page | Yes if self-bundled, but adds real dependency weight | Low to wire up, hardest to control output | **Ruled out**, fails the "readable, searchable, printable" requirement outright; html2pdf.js's own GitHub issues confirm page-break splitting mid-element, blank space after breaks, and an iOS canvas pixel-cap (3-5 megapixels) that specifically threatens a long multi-day itinerary rendered as one tall canvas |
| pdf-lib | Real vector text, but **does not render HTML/CSS at all**, its own README states this plainly | Small | Yes | Highest, means reimplementing a text-flow/pagination engine from scratch | **Ruled out** for this use case |
| Paged.js | Same fidelity as `window.print()` (it also ends in a browser print step), adds real CSS Paged Media features (running headers, page numbers, named pages) | Same as option 1 | Achievable if self-hosted rather than CDN-loaded (not explicitly confirmed in its own docs) | Moderate, one new dependency plus a CSS syntax to learn | Good **progressive enhancement**, not a replacement for option 1 |

**Recommendation:** `window.print()` with a dedicated `@media print` stylesheet. It wins on
every axis that matters here, real selectable text, zero added dependency, zero network
call, smallest output, least code. Layer Paged.js in later, self-hosted, only if repeating
day headers/page numbers become worth the extra weight; keep plain print as the guaranteed
fallback since Paged.js still has real open issues.

## 3. Multi-location trips: data model and small-screen UI

**Data model.** tripkit's own Python-side spec (`demo/lisbon.yaml`) already has a `places`
list under `trip:` with a `role` field (currently just `destination`). The natural,
minimal extension is to keep that shape and widen it: a trip becomes an **ordered list of
stops**, each stop carrying its own `arrive`/`depart` (today those live only at the trip
level) and an optional `lodging: {name, address, checkin, checkout}` block. A "this hotel,
then that one" trip is just N stops where each stop's lodging differs, no new top-level
concept is needed, just per-stop dates and an optional lodging sub-object on the existing
place entry.

**How competitors present this on a small screen**, from what the research above actually
confirmed: Roadtrippers and Sygic both use a **vertical, reorderable stop list** with
per-stop travel-time/mode shown between entries (Sygic: praised for exactly this); neither
was found using per-stop full-screen tabs. Inspirock's complaint, every 30-minute slot
pre-filled, no breathing room, is a warning against over-structuring the timeline.
Wanderlog pairs a persistent map with the list rather than hiding the map behind a tab.

**Minimal interface that doesn't become a mess:** a single vertical scroll, one card per
stop showing name, date range, and lodging if set, tap to expand into tripkit's existing
single-place day view, plus a thin horizontal strip of stop-name pills pinned above it for
quick jumping, and the existing map with a route line connecting stops in order. This reuses
the current per-place UI almost unchanged; it does not need a new day-by-day grid, tabs per
day, or a calendar widget, all of which is where competitors' UIs get cluttered past 4-5
stops.

## 4. What makes an itinerary useful on the day, not just while planning

Complaints found above that specifically describe **field failure**, not planning-time
annoyance: Mindtrip, "great for planning, not great for using on your trip"; Inspirock, fills every moment with no room for spontaneity, and is web-only so it has to be reloaded
and re-scrolled every time on the move; Journi, photo/sync loading "excessive despite
high-speed connection"; Layla and Mindtrip, AI recommends permanently-closed places and
mis-routes to the wrong location; TripIt, parser turns a 5-day tour into "one hour," an
error that only surfaces when you're actually checking the plan in the field.

**What tripkit should borrow:** offline-first is not a nice-to-have, it's the direct
antidote to the Inspirock "have to log in, click, and scroll every time" and Journi
loading-lag complaints, tripkit already has this and should never trade it away for a
richer online-only view. The "what's open right now" clock-driven ranking is structurally
immune to the Layla/Mindtrip failure mode (AI suggesting a place that's closed or gone) since
it's reading real hours data rather than generating a plausible-sounding answer.

**What tripkit should refuse to copy:** rigid, fully-pre-filled schedules (Inspirock's exact
complaint): the day timeline should show what fits, not force every slot; AI-generated
place suggestions with no ground truth behind them (the specific, repeated failure mode
across Layla and Mindtrip); anything that requires a live connection to show the plan a
group already agreed on (the WebRTC-only approach's fatal flaw in question 1); and forced
accounts or auto-renewal billing: the single most common complaint across Wanderlog, TripIt,
Roadtrippers, and Travefy was not a feature gap, it was being charged without clear warning.
tripkit's no-account model is a direct answer to that pattern, not just a minimalism choice.

## 5. Top five features, in build order

Ordered by dependency and effort, not just by what was asked for first, sharing and export
only become valuable once there's a real multi-stop trip object worth sharing or printing.

1. **Multi-stop / multi-hotel trip model** (Q3). *Why:* foundational, nothing else on this
   list has anything to act on without it; today tripkit only ever shows one place at a time.
   *Effort:* medium, extends the existing `places`/`role` shape with per-stop dates and an
   optional lodging block, no new concept. *Minimal shape:* a vertical stop list reusing the
   current single-place view per stop, no calendar grid.

2. **Shareable link via a compressed URL fragment** (Q1). *Why:* this is the actual answer
   to "group planner without a backend", turns a private trip into something a friend can
   open and edit. *Effort:* medium, one encode/decode pass plus lz-string. *Minimal shape:*
   a "share" button that copies a link; a visible "last edited [time]" stamp so an overwrite
   is seen, not silently lost.

3. **PDF export via `window.print()` + a print stylesheet** (Q2). *Why:* cheapest real win
   technically, it's mostly CSS the readability of the page already wants. *Effort:* low.
   *Minimal shape:* one `@media print` block hiding chrome (nav, buttons) and laying out the
   day timeline for paper.

4. **Calendar (.ics) export of the day timeline.** *Why:* small additive step once stops
   have real dates from feature 1, puts the plan on a phone's own calendar app, which is
   exactly where TripIt's reviewers wanted reliability and didn't get it. *Effort:*
   low-to-medium, .ics is a plain text format, generatable client-side with no library.
   *Minimal shape:* one "add to calendar" link per stop or for the whole trip.

5. **Optional live co-editing layer (Yjs + y-webrtc) on top of feature 2.** *Why:* real-time
   planning is the one thing the link-based approach in feature 2 can't do, worth adding
   once it's clear people actually want it, not before. *Effort:* high, and its own
   dependency (public signaling servers) has unconfirmed uptime, treat as a stretch feature
   that degrades gracefully back to plain link-sharing, never a requirement.
