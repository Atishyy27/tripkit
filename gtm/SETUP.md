# Things waiting on you

Four items. Everything else is done and shipped. Each of these needs an account or a
browser login that a script cannot do on your behalf.

**Already done since this was written**, so you do not need to: the first listing is
live as a pull request to `osmlab/awesome-openstreetmap` (#224), and the claims it makes
were audited before it went out. Two did not survive and are now corrected everywhere,
including on the live site: the app does not "work fully offline", only the shell and
towns you have already opened do, and the coverage table was comparing restaurants in
Munich against everything in Pushkar. See CHANGELOG 0.8.1.

---

## 1. Delete the stray repo (2 minutes)

I published to the wrong GitHub account once before catching it. The repository is now
private, archived, renamed, and its code force-removed, so nothing of yours is exposed.
It still exists though, and deleting it needs a token scope only an interactive login
can grant.

```bash
gh auth switch -u atishyy278
gh auth refresh -h github.com -s delete_repo   # opens a browser, this is the bit only you can do
gh repo delete atishyy278/deleted-placeholder --yes
gh auth switch -u Atishyy27                    # not optional, do not skip this line
```

I tested this on 8 September 2026 rather than guessing at it. Two things came out of
that. The version written here before was wrong: `gh auth refresh` has no `-u` flag at
all (gh 2.97.0 answers `unknown shorthand flag: 'u'`), and it only ever acts on the
*active* account, which is why the switch has to come first. And the repository is
genuinely still there, private and archived; deleting it returns
`403 Must have admin rights to Repository`, which is what GitHub says when the token
lacks `delete_repo`. Granting that scope needs an interactive browser sign-in, so this
is not something I can do for you, only hand you.

That last line matters. The active account flipped on its own four times during this
work, which is why there is now a pre-push hook that blocks a push under the wrong
identity. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

---

## 2. Turn on the numbers (10 minutes)

Analytics is written and switched off. It sends a screen path and nothing else: no
cookie, no identifier, and never the town somebody typed. You can read the whole of it
in `docs/app.js`, which is the only kind of privacy claim worth anything.

**GoatCounter**, chosen because it is free with no expiry, sets no cookies, needs no
consent banner in the EU, and is open source so you could self-host later.

1. Sign up at <https://www.goatcounter.com/signup>. Pick a site code, `tripkit` is free.
2. In `docs/app.js`, find this line near the top:

   ```js
   const ANALYTICS = null;
   ```

   and change it to:

   ```js
   const ANALYTICS = "https://tripkit.goatcounter.com/count";
   ```

3. In `docs/index.html`, change the disclosure text under *What this knows about you*.
   It currently says counting is off entirely. Leaving that there once it is on would
   be a lie on your own front page, and that is worth more than the numbers.
4. Commit and push. Your dashboard is at `https://tripkit.goatcounter.com`.

**What you will be able to see**: how many people arrive, which towns get searched,
which of the six screens actually get used, how many build a day versus browsing, how
many widen the radius, how many share, how many install to a home screen.

**What you will not see, deliberately**: who anyone is, where they are, or what they
typed. If you later want the towns, that is a decision to make openly and to write on
the page, not to slip in.

### The traffic snapshot, which I got wrong

`.github/workflows/traffic-snapshot.yml` runs every Monday and commits GitHub's own
traffic figures into `gtm/traffic-history/`. GitHub throws that data away after 14 days,
so without this the history is simply lost.

I wrote here that it needed nothing from you. That was wrong, and it had been failing
every run with `403 Resource not accessible by integration`. The traffic API requires the
Administration permission, and `administration` is not one of the scopes a workflow can
grant `GITHUB_TOKEN`; GitHub's own list of grantable scopes does not contain it. So the
default token can never read those endpoints, and no amount of `permissions:` tuning
fixes it.

It now skips cleanly instead of failing, so you are not trained to ignore a red mark. To
actually collect the data, once:

1. Create a fine-grained personal access token with **read** access to this repository's
   **Administration** permission.
2. Save it as the repository secret `TRAFFIC_TOKEN`.

It starts collecting the following Monday. If you would rather not mint a token for this,
the alternative is to accept that traffic history is lost after 14 days, which is a
defensible choice; just delete the workflow rather than leaving it skipping forever.

---

## 3. The launch (a morning, when you choose)

Drafts are in `LAUNCH.md`, in the order I would post them. The research behind that
order is in `gtm/04-channels.md`.

**Start with r/openstreetmap.** They are the most aligned audience, the coverage
numbers are genuinely interesting to them rather than an apology, and they will find
real bugs before a larger crowd arrives.

Before posting anywhere:

- [ ] Open the live app on your own phone and walk one town end to end
- [ ] Try a town with no Wikivoyage article and check the failure reads well
- [ ] Try somewhere in a half-hour timezone and confirm the guess is right
- [ ] Decide whether your name goes on it publicly

**The hardest question you will be asked**, so have the answer ready rather than
discovering it in a comment thread: *"no AI" is true of the web app and not of the CLI
in the same repository.* The README now says so explicitly. Say it yourself before
somebody else says it for you.

---

## 4. Make the data better (ongoing, and the highest leverage thing here)

The single most useful contribution to this project is not code.

Opening-hours coverage is 33% in central Lisbon and 7% in Pushkar. That gap is the
whole limitation of the product, and it is fixed in OpenStreetMap rather than here. An
hour spent adding `opening_hours` to places in a town you know well improves this app,
every other app built on that data, and the map itself.

<https://www.openstreetmap.org>

The issue templates already point people there first, for the same reason.
