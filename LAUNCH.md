# Launch drafts

Nothing here has been posted. Every one needs your go.

The order below comes from the research in `gtm/04-channels.md`, and it is not the
order I would have guessed. It starts with a directory edit rather than a post,
because that one has no downside at all and feeds several other places automatically.

---

## Before anything

- [ ] Open the live app on your own phone and walk one town end to end
- [ ] Try a town with no Wikivoyage article, check the failure reads well
- [ ] Try somewhere in a half-hour timezone, confirm the guess is right
- [ ] Decide whether your name goes on it publicly
- [ ] **Read the actual rules of each subreddit before posting.** I could not fetch
      Reddit at all, so every self-promotion rule below is unverified. It is a
      thirty second look for you and an impossible one for me, and getting it wrong
      means a ban rather than a correction.

## The disclosure that goes in every post

Say this yourself, in the post, rather than leaving it in the README for someone to
find and announce on your behalf:

> The web app has no AI in it at all and every sentence about a place was written by
> a person. The same repository also has a separate Python CLI that can optionally
> use a model to research a town. They are different programs; the link is the first
> one.

It is the hardest fair question this will get. Answering it before it is asked costs
nothing and buys the rest of the thread.

---

## 1. The OpenStreetMap wiki  (do this first, it is not a post)

<https://wiki.openstreetmap.org/wiki/List_of_OSM-based_services>

Anyone can edit, there is no form and no approval, and it feeds the auto-generated
OSM Apps Catalog within about a day. Zero risk and it compounds.

Entry, matching the surrounding format:

> **tripkit** ([site](https://atishyy27.github.io/tripkit/), [source](https://github.com/Atishyy27/tripkit)) - browser-based travel guide that ranks nearby places by whether they are open now and whether the current hour suits them; builds a printable day plan. Uses Overpass and Nominatim, plus Wikivoyage listings. No account, works offline. MIT.

Add the `openstreetmap` topic to the GitHub repo at the same time.

---

## 2. r/openstreetmap

The most aligned audience by a distance. They care about `opening_hours` coverage,
most have never seen it used for something a non-mapper opens, and the coverage
numbers are genuinely interesting to them rather than an apology.

**Title:** I built a guide that only shows what is open right now, and it made OSM opening_hours coverage very visible

**Body:**

I made a small web app that takes a town and shows what is open at this exact minute,
ranked by whether now suits that place. It is all client side: Overpass for places and
hours, Wikivoyage for descriptions, sunrise computed locally from the NOAA equations.
No key, no account, no backend.

https://atishyy27.github.io/tripkit/

Building it turned into an accidental coverage survey. Same query, same day:

| | places | with opening_hours |
|---|---|---|
| Lisbon centre | 811 | 270 (33%) |
| Munich restaurants | 2,249 | 1,924 (86%) |
| Pushkar, Rajasthan | 129 | 9 (7%) |
| Ajmer, Rajasthan | 104 | 3 (3%) |

So it is genuinely useful in Munich and thin in Rajasthan, and it says which one you
are in rather than hiding it. Places with no recorded hours show as *hours unknown*,
never as a guess, and the app points at OSM if you want to fix your own town.

Two things I would value your view on:

1. My `opening_hours` parser only flattens the simple shapes and deliberately refuses
   seasonal and sunset-relative rules, handing the raw string to the reader instead.
   Right call, or should I lean on opening_hours.js?
2. Is there a better way to choose a search radius than the Nominatim bounding box?
   It is crude and it shows on sprawling cities.

MIT: https://github.com/Atishyy27/tripkit

*(no AI disclosure here)*

---

## 3. The OSM community forum and chat

<https://community.openstreetmap.org> and the OSM Discord/Matrix. Same content as
above, shortened. Post after the subreddit so you can fold in whatever they find.

weeklyOSM often picks items up from the forum on its own, which is a better route in
than submitting.

---

## 4. Show HN

Only after the OSM crowd has been through it. They will find real bugs, and you want
those fixed before a larger and less forgiving audience arrives.

Tuesday to Thursday, roughly 09:00 to 11:00 ET.

**Title:** Show HN: A travel guide that reads the clock

**Body:**

https://atishyy27.github.io/tripkit/

A friend was on an overnight bus, landing at 06:00 with a 19:00 bus back and one day
in a town she did not know. Every guide I found listed two hundred things with no sense
of time. Half were shut, some were an hour away, a few took longer than she had.

So this answers a narrower question: it is 3pm and I leave at 7, what is open, what is
worth it, and what no longer fits. Pick places and it builds an ordered day with times
on it, waits rather than sending you somewhere four hours early, and tells you when
something collides with opening hours instead of quietly moving it.

Everything runs in the tab. Places and hours from OpenStreetMap via Overpass,
descriptions and safety notes from Wikivoyage, sunrise and sunset computed on device
from the NOAA solar equations so the clock works with no signal. No account, no API
key, no backend.

The web app has no AI in it and every sentence about a place was written by a person.
The same repo has a separate Python CLI that can optionally use a model to research a
town; they are different programs and the link above is the first one.

I did start by having a model research each town, and measuring it changed my mind.
Wikivoyage listing templates already carry name, hours, price and a human sentence
about whether somewhere is worth going. For one small Indian town, OSM gave 0
descriptions and Wikivoyage gave 44, with 20 prices and 4 safety notes. Paying a model
to invent that was the wrong architecture, not just a slow one.

The honest limitation is coverage: 86% of Munich restaurants carry opening hours
against 9% in Jaipur. The app says which it is rather than papering over it.

MIT: https://github.com/Atishyy27/tripkit

---

## 5. r/SideProject, r/opensource

Shorter, builder-focused. Lead with the constraint rather than the feature: no backend,
no account, no key, works offline, and what that cost.

---

## 6. Product Hunt

**Tagline:** A travel guide that reads the clock

**Description:**

Most guides hand you two hundred things with no sense of time. tripkit answers one
question instead: it is 3pm and I leave at 7, so what now?

It shows what is open this minute, ranks by whether now genuinely suits a place, and
hides what will not fit before you go. One tap builds the whole day, with a meal at a
meal time and enough variety that it is not four temples in a row. Print it or send it
to your calendar.

No install, no account, no API key, no AI. Built from OpenStreetMap and Wikivoyage. It
installs to a home screen and works with no signal.

---

## 7. r/solotravel, r/backpacking, r/indiatravel

Different audience entirely. They do not care how it is built. Lead with the bus.

**Title:** Made a free offline guide that shows what is actually open right now, no app to install

A friend landed somewhere at 6am with one day and no plan, so I built her a page that
reads the clock instead of listing everything. Then I made it work for any town.

https://atishyy27.github.io/tripkit/

Type where you are. It shows what is open this minute, hides anything that will not fit
before you leave, and one tap builds a whole day you can print. Add it to your home
screen and it works with no signal.

Free, no account, no ads, nothing collected. Built on OpenStreetMap and Wikivoyage, so
the descriptions are written by travellers rather than generated.

It is better in well mapped cities than small towns, and it tells you which one you are
in rather than pretending.

---

## 8. Changelog News

<https://changelog.com/news> takes submissions. Open source angle, after the above.

Not sequenced, because no submission path could be confirmed: TLDR, Hacker Newsletter,
Peerlist. BetaList is paid.

---

## What people will attack, and the honest answer

**"Why not Google Maps?"** Their licence forbids storing or redistributing their data
outside a Google map, and it needs a paid key. That would break both the offline
promise and the no-key promise. This is a real constraint, not a preference.

**"The data is thin in my town."** Correct, and the app says so rather than hiding it.
The fix is in OpenStreetMap, and an hour spent adding opening hours there improves every
app built on it, not just this one.

**"No AI is a gimmick."** It is a description, not a boast. It means every sentence you
read was written by a person, which is checkable in the source.

**"This is just an OSM wrapper."** It is a wrapper plus a clock, and the clock is the
product. Nothing else asks whether now is genuinely this place's hour.

**"The repo has an LLM CLI, so no-AI is misleading."** The strongest fair criticism.
Answer it in the post before anyone asks.

**"Who maintains this in a year?"** Honest answer: unknown. It is MIT, has no server to
pay for and no account system to run, so it keeps working whether or not anyone
maintains it. That is a deliberate property, not an accident.
