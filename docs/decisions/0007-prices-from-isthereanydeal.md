# 0007 — prices from IsThereAnyDeal

Status: accepted. Branch `igdb`, turn 016.

The third external service, and the last one this project adds without a reason
better than any so far.

## What forced the question

Turn 013 refused to build a "best deals" row because RAWG sold prices at a tier
this project does not pay for, and approximating a price is not a thing that can
be done honestly. The user asked again after seeing a reference site showing
store prices beside review scores.

## Why this join is allowed when OpenCritic's was not

Three turns before this, attaching critic scores from OpenCritic was rejected in
one sentence: their ids are not the catalogue's, so a score could only be
attached by matching titles, and title matching is what v1 of this project died
of (decision 0003).

Prices are the same feature shape and the opposite answer, for one reason:

    IGDB external_games  ->  Steam app id  ->  ITAD /games/lookup/v1

Nothing is matched on a name at any point. The decision turns entirely on whether
an id bridge exists, not on how useful the feature is.

Measured before any code was written (`scripts/probe-deals-2.js`):

    well-reviewed games sampled            24
    ... carrying a Steam app id            11   (46%)
    ... resolving on ITAD                  11   (100%)
    ... discounted at that moment           8   (73%)

The last number is what makes a row possible. The first two only make it
addressable.

## What was rejected

**Metacritic directly.** No public API exists and never has; every service
claiming to be one is a scraper, and Metacritic's terms — Fandom's since the
acquisition — prohibit it. Not something to put in submitted coursework.

**CheapShark.** Keyless, which would have meant no fourth secret and no
registration. Its own documentation would not render, and the aggregator that
did made no mention of lookup by Steam app id. A join that might turn out to be
by title is not a join this project can start building.

**Deals first.** The obvious design: ask ITAD for the biggest discounts, show
them. Two requests for a whole row. Killed twice by one probe.

First, a deal carries no Steam app id and its `url` is an `itad.link` affiliate
redirect rather than a store address — so there is no id to join on and nothing
to parse out of a URL either.

Second, and worse. Sorted by discount, the top twenty were:

    -100%  Epic giveaway
    -100%  Epic giveaway
    -100%  a demo
    - 99%  AWS Certification Bundle
    - 99%  Business Certification Bundle
    - 99%  Data Certification Bundle
    - 98%  Complete Linux eLearning Bundle
    ...

**The biggest discount on the internet is rarely on a game.** A row built that
way would have led with a cybersecurity course. That is the kind of thing that
only appears when the output is printed.

## Decision

Build the row **from games rather than from discounts**. Take games this app
would recommend anyway — critic score 82 or better from at least five reviewers,
not a re-release — and ask what they cost.

This is a different claim from the one the reference site makes, and the heading
says so: *"Well reviewed, and cheaper than usual"*, not "best deals". For a
recommender that happens to mention prices, it is also the better row.

## What it costs, and what is given up

**PC only.** ITAD covers Steam, GOG, Epic, Humble, Fanatical and similar. The
PlayStation, Xbox and Nintendo prices on the reference site come from somewhere
else and this project does not know where. Console owners see no price at all,
which is stated rather than implied.

**One country.** Prices are per-region and there is no neutral one. The row shows
US figures and says `US` in its source line, because somebody in Europe will see
a different number in their own store and should not have to discover that at a
checkout.

**Two licence conditions, enforced in code rather than remembered.** Attribution
sits in the footer. The buy link is ITAD's URL passed through byte-for-byte —
stripping the affiliate tag is forbidden, and rebuilding it as a direct store
link is the same breach wearing a disguise. A check fails if anything alters it.

**A fourth secret.** `ITAD_API_KEY`, required in Netlify's environment before the
next build. A missing key costs this row and nothing else: it reports itself as
missing rather than taking the page down.

**One lookup per game that cannot be batched.** ITAD's app-id lookup takes one id
at a time; prices are batched afterwards. Cached per instance, because the
mapping is permanent and the same games recur.

## Known, open, deliberately unresolved

- **No rate limiting on `/api/deals`.** Each refresh costs two catalogue requests
  and a batch of price lookups. This was already a recorded gap for
  `/api/shortlist`; there are now three doors into it.
- **The floor of 82 and the exclusion of `indie`** are product judgements made in
  code. The first decides what "well reviewed" means; the second removes IGDB's
  largest genre on the grounds that it describes who made a game rather than what
  it is.
- **The search sanitiser filters rather than escapes**, which is the stronger of
  the two approaches and has been tested against the payloads it exists to stop.
  It has not been reviewed by anyone other than its author.
- **Historical lows are available and unused.** ITAD returns `historyLow` on a
  deal; the row shows only the current price against the regular one.
