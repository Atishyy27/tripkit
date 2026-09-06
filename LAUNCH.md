# Launch drafts

Nothing here has been posted. Every one needs your go before it goes anywhere.

Ordered by what I would actually do first.

---

## 1. r/openstreetmap  (do this one first)

Best audience by a distance. They care about `opening_hours` coverage, most of them
have never seen it used for anything a normal person opens, and the honest coverage
numbers are the interesting part rather than an apology.

**Title:** I built a travel guide that only shows you what is open right now, and it made OSM opening_hours coverage very visible

**Body:**

I made a small web app that takes a town and shows what is open at this exact minute,
ranked by whether it suits the hour. It is all client side, no key, no account, no
backend. Places and hours come from Overpass, descriptions from Wikivoyage, and
sunrise is computed locally from the NOAA equations.

https://atishyy27.github.io/tripkit/

Building it turned into an accidental coverage survey. Same query, same day:

| | places | with opening_hours |
|---|---|---|
| Lisbon centre | 811 | 270 (33%) |
| Munich restaurants | 2,249 | 1,924 (86%) |
| Pushkar, Rajasthan | 129 | 9 (7%) |
| Ajmer, Rajasthan | 104 | 3 (3%) |

So the app is genuinely useful in Munich and thin in Rajasthan, and it says so on the
page rather than hiding it. Places with no recorded hours show as "hours unknown"
instead of being dropped or guessed at.

Two things I would like input on:

1. My `opening_hours` parser only flattens the simple shapes and deliberately refuses
   seasonal and sunset-relative rules, handing the raw string to the reader instead.
   Is that the right call, or should I lean on opening_hours.js?
2. Is there a better way to pick a search radius than the Nominatim bounding box? It
   is crude and it shows on sprawling cities.

Code is MIT: https://github.com/Atishyy27/tripkit

---

## 2. Hacker News, Show HN

Post Tuesday to Thursday, roughly 09:00 to 11:00 ET. Do not post the same day as the
Reddit one; if OSM people find a bug you want it fixed before this crowd arrives.

**Title:** Show HN: A travel guide that reads the clock, with no AI in it

**Body:**

https://atishyy27.github.io/tripkit/

A friend was on an overnight bus, landing at 06:00 with a 19:00 bus back and one day
in a town she did not know. Every guide I found listed two hundred things with no
sense of time. Half were shut, some were an hour away, a few took longer than she had.

So this answers a narrower question: it is 3pm and I leave at 7, what is open, what is
worth it, and what no longer fits.

Everything runs in the tab. Places and opening hours from OpenStreetMap via Overpass,
descriptions and safety notes from Wikivoyage, sunrise and sunset computed on device
from the NOAA solar equations so the clock works with no signal. No account, no API
key, no backend, no model.

I did start with an LLM researching each town, and measuring it changed my mind.
Wikivoyage listing templates already carry name, hours, price and a human sentence
about whether a place is worth going to. For one small Indian town, OSM gave 0
descriptions and Wikivoyage gave 44, with 20 prices and 4 safety notes. Paying a model
to invent that was the wrong architecture, not just a slow one.

The honest limitation is coverage: 86% of Munich restaurants carry opening hours,
against 9% in Jaipur. The app says which it is rather than papering over it, and
points you at OSM to fix it, since that helps everyone rather than one app.

MIT: https://github.com/Atishyy27/tripkit

---

## 3. r/solotravel or r/backpacking

Different audience entirely. They do not care how it is built, they care that it is
free and works offline. Lead with the bus.

**Title:** Made a free offline guide that shows what is actually open right now, no app to install

**Body:**

A friend landed somewhere at 6am with one day and no plan, so I built her a page that
reads the clock instead of listing everything. Then I made it work for any town.

https://atishyy27.github.io/tripkit/

Type where you are. It shows what is open this minute, what suits the hour, and hides
anything that will not fit before you have to leave. Add it to your home screen and it
works with no signal.

Free, no account, no ads, nothing collected. It is built on OpenStreetMap and
Wikivoyage, so the descriptions are written by travellers rather than generated.

It is better in well-mapped cities than in small towns, and it tells you which one you
are in rather than pretending.

---

## 4. Product Hunt

**Tagline:** A travel guide that reads the clock

**Description:**

Most guides list two hundred things with no sense of time. tripkit answers one
question instead: it is 3pm and I leave at 7, so what now?

It shows what is open this minute, ranks by whether this is genuinely a place's hour,
and hides anything that no longer fits before you leave. Sunrise and sunset are
computed for your exact date and coordinates, so "golden morning" means something
different in Lisbon and Rajasthan and it knows the difference.

No install, no account, no API key, no AI. Places and opening hours come from
OpenStreetMap, descriptions from Wikivoyage. It runs entirely in your browser, installs
to a home screen, and keeps working with no signal.

---

## Before any of it goes out

- [ ] Delete `atishyy278/tripkit`, it is private but it exists
- [ ] Open the live app on a real phone and walk one town end to end
- [ ] Try a town with no Wikivoyage article and check the failure reads well
- [ ] Try somewhere with a half-hour timezone and confirm the guess is right
- [ ] Decide whether your name goes on it publicly

## What to expect

The OSM crowd will push hardest on the `opening_hours` parser, so know why you flatten
only the simple shapes. Someone will ask why not Google Places: the licence forbids
redistributing their data in a static site, and it needs a key.

The hardest question, and it is a fair one: **"no AI" is true of the web app and not of
the CLI in the same repo.** Say that plainly before someone else does.
