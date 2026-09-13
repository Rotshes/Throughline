# Turn 016 — prices

Date: 2026-09-13
Branch `igdb`. Nothing deployed.

> **Written retrospectively on 2026-09-13, within the hour.** See the notice in
> turn 010.

## 1. Intent

Build the row turn 013 refused.

"Best deals" was one of the two rows the front page could not honestly carry,
because RAWG sold prices at a tier this project does not pay for. The user asked
again after seeing videogamescritic.com showing store prices.

## 2. Specification

`docs/spec.md`, criteria 5 and 13. Decision 0007 records the service, the terms
it arrives under, and the two designs that were rejected.

The rule that decided this turn is in `CLAUDE.md` rather than the specification:
*the model may only choose from the set it was given*, and beneath it, the reason
v1 died — nothing is matched by title.

## 3. Context supplied

The specification, `CLAUDE.md`, decision 0006, and the finding that IGDB's
`external_games` carries Steam app ids.

## 4. Plan

Adding a service is a stop-and-ask. The user was given three options with the
costs of each and chose IsThereAnyDeal over the keyless alternative, on the
grounds that the keyless one could not be verified to support an id-based join
and title matching is not acceptable here.

1. Probe whether the join holds at all.
2. Only then build.

## 5. Execution

**The join is id to id.** IGDB `external_games` → Steam app id → ITAD lookup.
Nothing is matched on a name. This is why prices were allowed where critic scores
from OpenCritic were refused three turns earlier: the same feature is acceptable
or not depending entirely on whether an id bridge exists.

**The obvious design was killed by its own probe, twice.** Asking ITAD for the
biggest discounts and showing them is two requests for a whole row. But a deal
carries no app id and its url is an affiliate redirect rather than a store
address, so there is nothing to join on and nothing to parse. And sorted by
discount, the top of the list was two Epic giveaways, a demo, and six Fanatical
certification bundles — AWS, Kali Linux, cybersecurity courses.

**The biggest discount on the internet is rarely on a game.** That sentence cost
twenty requests and would have cost a front page row reading "AWS Certification
Bundle, −99%".

So the row is built **from games rather than from discounts**: take games this
app would recommend anyway, ask what they cost. That is a different claim, and
the heading says so — "Well reviewed, and cheaper than usual" rather than "best
deals".

**Measured before building:** 46% of well-reviewed games carry a Steam id, 11 of
11 resolved on ITAD, and 8 of 11 were discounted at that moment. The row is
viable because of the last number, not the first two.

**Two things the terms require and the code enforces.** Attribution is in the
footer. The buy link is ITAD's URL passed through untouched — stripping the
affiliate tag is forbidden, and rebuilding it as a direct store link is the same
breach wearing a disguise. There is a check that fails if anything does.

**Then two additions at the user's request.** Eighteen games instead of twelve,
and a refresh button — which required changing the *sampling*, not adding a
button: "the forty highest-rated games" is a fixed list, so a refresh on it
returns the identical row and makes the page look broken rather than finished.
The sample now walks a window through the pool and wraps.

A price search followed. It is title **search** — the person types and sees five
matches with covers and years and picks — not title **matching**, where code
silently decides two names are the same game. A search also keeps games that are
*not* discounted, because somebody asking whether a game is on sale is owed "no,
it is $59.99" rather than an empty result that reads as "we have never heard of
it".

Files: `src/deals.js`, `src/config.js`, `src/home.js`,
`netlify/functions/deals.js`, `netlify.toml`, `web/src/api.js`,
`web/src/Home.jsx`, `web/src/App.jsx`, `web/src/styles.css`,
`scripts/probe-deals.js`, `scripts/probe-deals-2.js`, `scripts/check-deals.js`.

## 6. Verification

| Criterion | Method | Result |
|---|---|---|
| the join | probe: 11 of 11 app ids resolved | pass |
| the row exists | probe: 8 of 11 discounted | viable |
| 5 — no padding | full-price games refused from the browse row | 27 checks |
| terms | buy URL byte-identical to the one given | pass |
| 13 — which service | a price failure is `stage: "prices"`, not catalogue | pass |
| offline total | eight suites | 247 |

**Mutation-tested:** removing the discount guard lets full-price games into a row
headed "cheaper than usual"; swapping `Number.isFinite` for truthiness silently
drops **free** games; stripping the query string breaches the licence; removing
the search sanitiser's punctuation filter lets a quote close the query literal.

The first attempt at that last mutation produced a **false pass** — shell
escaping mangled the edit, the source never changed, and the suite went green.
A mutation that does not apply looks exactly like a check that cannot fail.

**What I did not verify:**

- **Nothing about this is deployed**, and `ITAD_API_KEY` is not in Netlify's
  environment.
- **Whether the search sanitiser is sufficient** rather than merely effective
  against the payloads tried. It filters rather than escapes, which is the
  stronger of the two approaches, and it has not been reviewed by anyone else.
- **Prices are US only** and stated as such on the row. Not verified against any
  other country.

## 7. Outcome

Four rows. Three external services and four secrets.

### Corrections issued this turn

**A feature that needs a join is acceptable or not depending on whether an id
exists — not on how useful the feature is.** OpenCritic was refused and ITAD
allowed for exactly that reason, and the two decisions are three turns apart.

**The mutation test is code and can fail silently like any other.** Verify that a
mutation applied before reading the result.

### Open questions raised this turn, not answered

**No rate limiting, on a third endpoint.** `/api/deals` costs two catalogue
requests and a batch of price lookups per press, and holding the button down is
the cheapest way anyone will find that out. This was already a recorded gap for
`/api/shortlist`; it now has three doors.

**`indie` and the review floor are both product judgements made in code.** The
first excludes IGDB's largest genre; the second decides what "well reviewed"
means. Both are written down and neither was discussed.
