# Turn 018 — polish, and the stylesheet becoming code

Date: 2026-09-13
Branch `igdb`. Nothing deployed.

Written during the turn, like 017.

## 0. A deviation to record first

**This turn did not do one thing.** `CLAUDE.md` says a turn touching several
areas cannot be reviewed, and this one touched copy, layout, an animation, a
catalogue probe, a renamed field, a licence credit, a product disclosure and a
new check suite. It ran as a sequence of small user requests across one sitting
rather than as a planned unit of work.

Recording it rather than quietly splitting it into tidy fictional turns: the
record is the deliverable, and a clean history that did not happen is worth less
than a messy one that did. The cost was real — the stylesheet bug in section 5
is the kind of thing a narrower turn catches, because a narrower turn has a
verification step aimed at what changed.

## 1. Intent

Nine requests, in order:

1. Rename two headings; remove links to IGDB.
2. Move the recently-suggested strip to the find page, with cover banners.
3. Rework the masthead: one lockup, a shine, no taglines.
4. Rename the find tab and two more headings; colour the discount figures;
   ask whether a review can be opened and read.
5. Align the Add buttons on the rail cards.
6. Delete the duplicated attribution line above the footer.
7. Delete the coursework-and-disclosure line below it.
8. Highlight the find tab with an animation.
9. Twice more on that animation: it was invisible, then it was too frequent.

## 2. Specification

`docs/spec.md` v3.0. No criterion covers any of this directly. Three constrain
it:

- **Criterion 13** — a failure names its service. Unchanged here.
- **Criterion 15** — a click is recorded against the case *as it was shown*. It
  is why the suggested strip keeps the recorded title rather than a fresher one.
- **Pitfall 22** — no criterion, prompt or line of interface copy may claim more
  than "the catalogue says so". Request 4 asked for something the catalogue
  cannot support, and section 5 says what happened instead.

Request 7 is the one with a specification consequence, in section 7.

## 3. Context supplied

The specification, `CLAUDE.md`, `docs/failures.md`, decisions 0006 to 0008, and
six screenshots from the user — which carried more than the text did in at least
three cases, including the misaligned buttons and the invisible pulse.

## 4. Plan

There was not one, and that is the honest entry. Each request was small enough
to act on directly, and the turn accumulated rather than being planned. See
section 0.

## 5. Execution

### The renamed field, found by accident

`scripts/probe-reviews.js` asked whether a review could be opened and read.
Fourteen requests: `reviews`, `review`, `game_reviews`, `external_reviews`,
`review_videos`, `critic_reviews`, `aggregated_ratings` and `rating_sources` all
404. Twenty-six website types, none review-shaped. The answer to request 4 is no,
and the row keeps saying "91 from 6 critics", which is the most it can support.

The probe also printed `category undefined` on every website row it sampled.
**`websites.category` had become `websites.type`.** `firstOfficialSite` had
returned null for every game since the migration — the button was absent, not
broken, and absent is indistinguishable from a catalogue where no game has a
website.

**Twenty-one offline checks covered that file and none caught it, because the
fixtures used `category` too.** A check written against the same wrong field name
agrees with the code. Third rename hit in this project after `game_type` and
`external_game_source`, and the first found by accident.

### The stylesheet bug

Request 8 added `.tab.primary`: an accent tint, plus a ring blooming out of the
pill. The user reported no animation. Two causes, both mine:

1. **The ring was invisible.** Drawn in `--accent-soft` (`#eceefc`) against
   `--paper` (`#f7f7fa`). Contrast ratio **1.08** — four values per channel, and
   less than that while fading. Replaced with `--accent-ring`, an accent at 45%
   alpha, which composites to ratio **1.92**. The colours are now computed and
   asserted rather than eyeballed.
2. **It had already finished.** Three iterations at 2.6s ended eight seconds
   after load. `infinite`, paused on the find page by `.tab.on.primary`.

Request 9 asked for less frequency. The duration went 2.9s → 7s **with the rest
moved to the front of the cycle and grown to five seconds**, so the beat keeps
its ~2s shape. Stretching the whole animation would have made each beat syrupy
and no less frequent, which is the opposite of what was asked.

**Then the fix broke it completely, and the verification said it was fine.**

The edit closed a comment early. Five lines of English were left loose inside the
declaration block:

```
   ... points at — below. */
   2.9s was a heartbeat. 7s is a signpost. ...        <- parsed as CSS
   opposite of what was asked for. */
animation: tab-pulse 7s var(--ease) infinite;
```

A browser discards from the stray text to the end of that declaration. The
animation never applied. Every other declaration in the rule survived, so the tab
looked right and simply sat there.

**The verification was `esbuild styles.css --outfile=/dev/null`, and it passed.**
Checked afterwards against a minimal reproduction: esbuild exits 0, prints
nothing, and emits the wreckage as one declaration —
`stray text here */ animation: pulse 7s infinite;`. It never claimed the CSS was
valid. The question asked was "does this parse"; the question that mattered was
"is the declaration still inside the rule". **A gate that passes for the wrong
reason, in a file this project had never treated as code.** Turn 001's rule, and
its fifth appearance.

`scripts/check-css.js` is the answer. Nine checks: no comment closes early, no
opener survives stripping, braces balance, named rules keep the declarations
that matter, every `animation:` has a `@keyframes`, every `var()` resolves, and
the pulse colours exist in both themes. Comments are stripped the way a browser
strips them — first `*/` closes, no nesting — because that is the mechanism of
the bug.

**Its first run produced a false positive**, flagging `--i` as undefined. `--i`
is set per card from JSX as an inline style to stagger the entrance. Real
property, naive check. A check that cries wolf on correct code gets deleted, and
then it is not there for the real one — so it now reads the components too, and a
genuine typo was confirmed to still fail.

### The rest

- Headings renamed; IGDB outbound links removed while the **text** credit stayed,
  because a link is a navigation choice and attribution is a licence term.
- The suggested strip moved to the find page with covers — one extra batched
  request, `src/suggested.js`, ten checks. The recorded title wins over a fresher
  catalogue title, per criterion 15.
- Masthead: one lockup, a 7s shine, taglines gone.
- Discount figures banded by colour.
- Add buttons aligned with `margin-top: auto` and two-line clamps; the cause was
  titles wrapping to different heights, not the buttons.
- The duplicated credit above the footer deleted, keeping the cache age, which
  was the only thing on that line not repeated below.

Files: `web/src/App.jsx`, `web/src/Home.jsx`, `web/src/styles.css`,
`src/suggested.js`, `src/detail.js`, `src/home.js`, `netlify/functions/suggested.js`,
`web/src/api.js`, `scripts/probe-reviews.js`, `scripts/check-suggested.js`,
`scripts/check-css.js`, `package.json`.

## 6. Verification

| Criterion | Method | Result |
|---|---|---|
| can a review be read | 14 requests, 8 endpoints + website types | no — feature dropped |
| `websites.type` | field read from a live row | fixed, checks updated |
| ring is visible | contrast computed against `--paper` | 1.08 → 1.92 |
| pulse cadence | timings derived from duration × keyframe % | 20.7 → 8.6 per minute |
| stylesheet integrity | 9 offline checks | pass |
| mutation | three deliberate breakages | each failed exactly one check |

The three mutations: the comment-closed-early bug reintroduced structurally,
`--accent-ring` typoed to `--accent-rong`, and `animation: none` deleted from the
pause rule.

**284 offline checks across eleven suites.**

**What I did not verify:**

- **Nothing is deployed.** None of this has run anywhere but locally.
- **The pulse has not been seen by me.** Every claim about how it looks is
  derived from numbers and from the user's reports. The contrast ratio is
  computed; "apparent enough" is not.
- **`check-css.js` covers three rules by name.** Every other rule in ~1,500 lines
  is covered only by the structural checks. That is deliberate — a check over
  everything would fail on every legitimate edit — but it is a real limit.
- **The reduced-motion path is reasoned, not observed.** The global rule should
  collapse the pulse to its final frame and leave the tint; nobody has run it.

## 7. Outcome

The front page and the find page read as a product rather than a set of rows. One
feature was asked for and could not be built, and the reason is measured rather
than asserted.

### A disclosure was removed at the user's request

The footer used to say the three arguments are written by a language model and
that nothing checks whether they are true. It was the only place in the running
app where **pitfall 1 — the largest known gap in this project** — was visible to
the person reading a shortlist.

It is gone at the user's explicit instruction, which is his call to make. The
specification is unchanged and still states the gap in full, in part 3 and in the
note after criterion 15. What changed is who knows: the marker, and not the
reader. A comment at the deletion site records it, because a disclosure that
vanishes with no trace is the kind of change nobody can review later.

### Corrections issued this turn

**A renamed field makes a feature vanish rather than break**, and a check written
against the same wrong name agrees with the code. Already added to
`docs/failures.md`.

**"It parsed" is not "it works", and a permissive tool will tell you so by saying
nothing.** esbuild accepting broken CSS is not a bug in esbuild; it is the wrong
question asked of the right tool. Proposed for `docs/failures.md` as entry 24 —
**awaiting the user's go-ahead, since `docs/` outside `docs/turns/` is his.**

**A file is code if breaking it changes behaviour.** The stylesheet had no check
suite for eighteen turns, and the one class of bug it is most prone to — silent
loss of a declaration — is invisible by construction.

### Open, carried forward

- `MIN_GAMES = 1000` in `scripts/pin-igdb-tags.js` drops `battle-royale` (708)
  and `4x` (686). A threshold applied past its reason. Unanswered.
- Reference cases 5 and 6 have never been run.
- No rate limiting on `/api/shortlist`, `/api/deals`, `/api/event`.
- `scripts/probe-news.js` written, never run.
- `event_networks` unused; `network_type` vocabulary unread.
- The single deploy, with three secrets that must reach Netlify before the build.
