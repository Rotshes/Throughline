# Turn 013 — the front page

Date: 2026-09-12 to 2026-09-13
Local only; nothing deployed.

> **Written retrospectively on 2026-09-13.** See the notice in turn 010.

## 1. Intent

Give the site something to be when nobody has asked it anything yet.

The user supplied videogamescritic.com as the shape: rows of games under
headings — what is popular, what is on offer, what is out.

## 2. Specification

`docs/spec.md` v2.1. No criterion covers the front page, because no model call
happens on it. That absence is the interesting part and is recorded below.

## 3. Context supplied

The specification, `CLAUDE.md`, `src/catalogue.js`, and the reference screenshot.

## 4. Plan

1. Three rows, each stating where it came from.
2. No model call anywhere on the page.
3. Rows the catalogue cannot honestly support are not built.

## 5. Execution

**Two rows from the reference site were refused rather than approximated.**

"Popular right now" needs live player counts. That is Steam's API, not a
catalogue's. The nearest available thing is "most added to collections", which is
a different claim wearing the same label — and labelling it the first would be
the exact failure this project keeps writing down.

"Best deals" was a paid catalogue tier. (Turn 016 built it from a different
service instead.)

**Every row states its own source under its heading.** "Out in the last ninety
days, ordered by how many people added it" and "popular" are different sentences
and only one of them is true of the data.

**The third row is ours.** "Recently suggested here" reads `requests.picks` —
this project's own record — and costs no catalogue request at all. It carries the
angle each game was given, which is the part no other site could show.

Files: `src/home.js`, `netlify/functions/home.js`, `web/src/Home.jsx`,
`web/src/styles.css`, `netlify.toml`.

## 6. Verification

Checked by looking at the page, which is how both defects below were found.

| Claim | Method | Result |
|---|---|---|
| rows state their source | read the page | pass |
| no model call on this page | no `model_calls` row after loading it | pass |
| cost | two catalogue requests per uncached build | as designed |

**What I did not verify:** the page under a catalogue outage. The failure path is
written and has not been exercised.

## 7. Outcome

Three rows, two of them honest about being narrower than the site they were
modelled on.

### Corrections issued this turn

**A threshold carried into a context where its reason does not hold is not a
safeguard, it is a bug with a good name.** The row builder used `usable()`, which
enforces the rating floor. That floor exists for exactly one reason: keeping the
shortlist to games the *model* can write about truthfully. Nothing on the front
page goes near a model, and a game released last month has had no time to collect
ratings. The result was one game in a row of forty and the next row empty.

**Two caches, and restarting the server clears only one.** After the fix the page
looked identical. The module-scope TTL inside the function is one cache; the
`Cache-Control: public, max-age=600` header is another, and it makes the browser
serve its own copy without asking. The restart had worked and there was no way to
tell. Local development now sends `no-store` — removing the trap rather than
leaving the user to remember it.

**An empty row is a failure, not a state.** `games: []` renders the same words a
working row would show if the catalogue genuinely held nothing. Forty records
came back, all forty were discarded two lines later, and nothing said so. When
code throws away everything it was handed, that is the most interesting thing
that happened in the request.

The warning's wording changed with it. It said "could not be loaded from the
catalogue", which would have been a lie here — the catalogue answered fine and
this code threw the answer away. Sending someone to debug the wrong service is
worse than saying nothing.

### Open questions raised this turn, not answered

**"Best reviewed this year" was empty and stayed empty.** Two probes established
why: RAWG holds no Metacritic score for *any* 2026 release. Not a sort problem,
not a dropped parameter. That is what turn 015 exists because of.
