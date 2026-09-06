# Contributing

Thanks for looking. Issues and pull requests are both welcome.

## The one rule

**Never make the tool invent a fact to fill a field.**

A missing opening time sends someone to a locked door. A made-up price makes them
confident at exactly the wrong moment. `null` is a correct answer here and a guess
is not.

If a change makes the output look more complete without making it more true, it
will not be merged. That includes changes that quietly widen a match, fill a gap
with an average, or drop a "not found" marker to tidy up the interface.

## Adding data, rather than code

Most of what makes this good is not in this repository.

If a place is missing, wrong, or has no opening hours, the fix is in
[OpenStreetMap](https://www.openstreetmap.org). If a place has no description, the
fix is in [Wikivoyage](https://en.wikivoyage.org). Both are more valuable than a
patch here, because everyone gets them, not just people using this.

The single highest-impact contribution to this project is adding `opening_hours`
tags in a town you know well.

## Running it

```bash
pip install -e .
./tests/run.sh "$(cat tests/fixtures/single-day.json)"
./tests/run.sh "$(cat tests/fixtures/multi-day.json)"
python3 -m tripkit build examples/pushkar-arya.yaml
node docs/e2e.js
git config core.hooksPath .githooks
```

The web app is static. Serve `docs/` with anything:

```bash
python3 -m http.server -d docs 8000
```

## Style

- No em dashes. Commas, colons, semicolons, full stops, brackets.
- Comments explain why, not what. If a line of code needs explaining, the comment
  should say what would break without it.
- Numbers over adjectives. "9 of 129 places carry hours" beats "coverage is patchy".
- When you state a limit, state how you measured it.

## Pull requests

- One idea per PR.
- Say what you tested and what you did not.
- If you found a bug by running it rather than reading it, say so in the message.
  That is useful signal for everyone.
