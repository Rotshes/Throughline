# Turn 020 — migration residue, and three crashes in one file

Date: 2026-09-14
Branch `igdb`. Nothing deployed.

Written during the turn.

## 1. Intent

Two pieces of leftover from the IGDB migration, grouped because they are the
same kind of thing:

1. `scripts/run-shortlist.js` and `scripts/run-candidates.js` still called RAWG.
2. `MIN_GAMES = 1000` in `scripts/pin-igdb-tags.js` excluded `battle-royale`
   (708) and `4x` (686).

Both were found in turn 019 and deferred here so that turn could stay on the
reference cases.

## 2. Specification

`docs/spec.md` v3.1. No criterion covers the command-line runners. Criteria 3, 4
and 4a are what they exist to verify — that the candidate set is on the requested
platforms, in the requested category, and carries the requested tags — so a
runner answering from the wrong catalogue is a verification tool verifying
something else.

Pitfall 24 covers the threshold: *a threshold carried into a context where its
reason does not hold is a bug with a good name.*

## 3. Context supplied

`CLAUDE.md`, `docs/failures.md`, `docs/spec.md`, and the source of both runners,
`src/source.js`, `src/catalogue.js` and `src/igdb-catalogue.js` — the last three
read specifically to find out whether "the same surface" was true.

## 4. Plan

1. Point both runners at `src/source.js` and the IGDB vocabularies.
2. Lower the threshold, repin, read what falls out.
3. Verify by running both, on the real catalogue.

Step 3 is where the turn actually happened.

## 5. Execution

### What the runners were really doing

They imported `src/catalogue.js` directly and read `data/platforms.json` and
`data/tags.json` — the RAWG module and the RAWG vocabularies — while the app went
through `src/source.js` to IGDB. Since the migration. Five turns.

**They did not fail.** With a RAWG key in the environment they ran, and printed a
plausible candidate set drawn from a catalogue this product no longer uses. A
tool that is quietly wrong survives longer than one that is loudly broken,
because only the second kind gets fixed.

`scripts/case-vocab.js` from turn 019 was generalised to `scripts/vocab.js` and
given tag validation and machine-level requests; both runners and both reference
cases now share it.

### "The same surface" was two claims, and one of them was false

`src/source.js` said the two modules export the same surface and that everything
in the project imports through it.

The nine names do match. **The contract does not:** `assembleCandidates` takes
`platformIds`, `specific` and `vocabulary` in RAWG and `machineSlugs` and
`libraryEntries` in IGDB. So the swap is one line *plus its caller* —
`src/pipeline.js` was rewritten in the same commit, and going back would need it
rewritten again. `CLAUDE.md` said "one line" on the strength of turn 015.

I expected worse and checked instead of asserting. **Both modules validate:**
RAWG's `buildPoolQuery` throws on a missing `platformIds`, and an empty
`machineSlugs` here resolves to no platform ids and hits the same refusal. A
mis-shaped call crashes rather than silently returning games filtered by nothing.
That is the good answer, and it was worth the two minutes to have it rather than
the dramatic version.

Corrected in `src/source.js` and `CLAUDE.md`. **Decision 0006 does not make the
claim** — I said it did when raising this and was wrong; it was in turn 015's
record and in `CLAUDE.md`, and turn records are not edited.

### Three crashes, one file, one class

Rewriting the head of `run-candidates.js` broke it three times, each time by
removing a name that was still in use further down:

| | name | used by |
|---|---|---|
| 1 | `specific` | the platform verification, sixty lines below the edit |
| 2 | `metacritic` | a RAWG field, fixed in the sibling file and not this one |
| 3 | `vocabulary` | a guard for a loader that no longer exists |

Every one parsed. `node --check` reports such a file as fine, because it is
syntactically fine — the failure is a `ReferenceError` when the line runs, which
for these scripts is after a live catalogue request. **Each bug cost a real run
on a machine that is not mine.**

After the second I wrote down the rule — grep for every identifier you remove —
and broke it on the very next edit, checking the other file instead. That is the
sixth time in this project that recording a rule has failed to prevent its next
occurrence, against a much better record for guards that run: the platform
resolver in turn 015, `vocab.js` in turn 019, and now this.

`scripts/check-undefined.js` parses every module with acorn, collects every
declared name and every name read, and reports the difference. Registered in
`npm run check`. **Adding acorn was a stop-and-ask and was asked** — two packages,
no transitive dependencies, MIT, dev-only, chosen over ESLint's hundred-package
tree and a config whose `no-undef` needs environment tuning to avoid exactly the
`setTimeout`/`__dirname` false positives seen on the first run.

Scope-agnostic on purpose. It under-reports and never produces a false positive
from a string, a comment or a template literal — an earlier regex version emitted
sixty false hits and was useless. **A linter's false positives are its running
cost: enough of them and the output is skimmed, which is the same as not running
it.**

### The threshold excludes nothing

Lowered to 600. The repin kept 34 tags and dropped exactly one, `erotic`, which
goes by decision rather than by count. `battle-royale`, `4x` and
`4x-explore-expand-exploit-and-exterminate` are all in.

**So `MIN_GAMES` now excludes nothing at all** — every term in
`data/tag-candidates.json` clears it. By this project's own standard, *a gate is
good when it can actually fail*, it is currently decoration. Kept as a guard
against future count shifts and recorded as inert rather than left looking load-
bearing.

Reading the old justification back was the sharper finding. It defended 1,000 by
naming the 4X entry at 686 as "a genuine niche somebody might want" and then drew
the line above it. **It disagreed with itself on the day it was written.** Pitfall
24 describes a threshold carried somewhere its reason stopped holding; this one's
reason never held.

### My working copy had drifted from the repository

The new check reported 75 files here and 67 on the user's machine. Eight `.js`
files I still held had been deleted from the repo when the motif pipeline went:
`src/analysis.js`, `src/matching.js`, `src/recommend.js`,
`netlify/functions/recommend.js`, three v1.x scripts, and `case-vocab.js`.

Nothing broke, and that is the uncomfortable part — they parse, they are clean,
they would pass every check. The risk was never a crash. It is that I could have
opened `src/recommend.js`, read a two-call motif pipeline, and described the
current design from a module that has not existed since turn 005.

**A stale working copy looks exactly like a current one**, and the device bridge
cannot delete, so my copy accumulates whatever the repository drops and nothing
reconciles it. Caught only because two counts disagreed and the smaller one was
not assumed to be wrong.

Files: `scripts/run-shortlist.js`, `scripts/run-candidates.js`, `scripts/vocab.js`,
`scripts/pin-igdb-tags.js`, `scripts/check-undefined.js`,
`scripts/mutate-undefined.js`, `scripts/case-5-injection.js`,
`scripts/case-6-repeatability.js`, `src/source.js`, `CLAUDE.md`, `package.json`,
`data/tags.igdb.json`.

## 6. Verification

| Criterion | Method | Result |
|---|---|---|
| 3, 4 — the filter filters | `run-candidates.js shooter pc`, live | 0 off-platform, 0 off-category |
| 4a — tags | `any nintendo --machines switch --tags co-operative` | 24 candidates, 0 missing the tag |
| machine mode | the same run, `--machines` | `switch` on all 24, `ps4--1` and `switch-2` resolving |
| the runners use IGDB | critic scores, trailers, machine slugs in output | all IGDB-shaped |
| undefined names | 67 files parsed | 0 problems |
| that check can fail | 5 mutations | 4 caught, 1 missed as documented |
| the forgery guard still holds | `mutate-oneline.js` | every behavioural mutation caught |
| suite | 292 checks, eleven suites, plus the scan | pass |

The missed mutation is a cross-scope rename: `vocab.js` declares `const v` in two
functions, so renaming one leaves the other's declaration standing and a
scope-agnostic check cannot see it. **Verified by reading the file rather than
inferred from the result**, and kept in the harness labelled as a documented
blind spot — a limit stated in prose is a claim; a limit with a failing example
beside it is a measurement.

**What I did not verify:**

- **Nothing is deployed.** Still true, fifteen turns running.
- **`run-shortlist.js` has not been run since the rewrite.** It costs a model
  call, and the three crashes were all in its sibling. Its head was changed the
  same way and it is clean under the new check — which is exactly the evidence
  that was not enough for `run-candidates.js` twice.
- **The repin was not diffed.** `data/tags.igdb.json` was rewritten and the
  dropped list read, but the previous file was not compared line by line.
- **`web/src/*.jsx` is not covered** by the undefined check. Acorn needs a JSX
  parser and does not have one here.
- **`MIN_GAMES = 600` is not a measured number.** It was chosen to admit two
  specific tags and is recorded as that.

## 7. Outcome

Two verification tools now verify the catalogue the product actually uses. Two
tags people search for are in the vocabulary. A class of bug that cost three live
runs in one afternoon now fails offline in under a second.

The turn's real content was none of those. It was three claims that had been true
when written and had quietly stopped being true — that everything imports through
the switch, that the swap is one line, that my copy of the repository is the
repository. None of them announced itself. Two were found by reading the code
they described; the third by a number being eight larger than it should be.

### Corrections issued this turn

**A tool that is quietly wrong outlives one that is loudly broken.** The runners
survived five turns answering from the wrong catalogue precisely because they
never failed.

**A claim about what every file does has to be checked against every file.**
`src/source.js` asserted it was the only import path and nothing tested that.

**Matching names are not a matching contract.** Nine identical exports, two
different parameter shapes.

**A stale working copy looks exactly like a current one.** Compare file lists
when a count surprises you.

All four are drafted for `docs/failures.md` in section 8, **awaiting the user's
go-ahead**, since `docs/` outside `docs/turns/` is his.

### Open, carried forward

- Reference cases 1, 2, 3, 4, 7, 8, 9. Case 4 is the one the specification says
  to design most carefully.
- `docs/spec.md` criterion 13 still says "there are now two external services".
  There are three. Raised, not changed.
- No rate limiting on `/api/shortlist`, `/api/deals`, `/api/event`.
- The single deploy. Five Netlify credits, cycle resets 29 September.
- `src/catalogue.js` and the RAWG vocabularies go when the branch is deployed
  and proven. The RAWG key can come out of the local `.env` now; Netlify's copy
  stays while `main` is the deployable build.

## 8. Proposed additions to `docs/failures.md` — awaiting approval

> * **A tool that is quietly wrong outlives one that is loudly broken.** Two
>   command-line runners kept importing the RAWG module and the RAWG vocabularies
>   through a catalogue migration and four turns after it. They never failed —
>   with a key in the environment they printed a plausible candidate set from a
>   catalogue the product no longer used. Nothing gets fixed while it still
>   works. (Turn 020)
> * **A claim about what every file does has to be checked against every file.**
>   `src/source.js` said everything in the project imported through it. Two files
>   never had. The sentence sat in the file it was wrong about for five turns.
>   (Turn 020)
> * **Matching names are not a matching contract.** Both catalogue modules export
>   the same nine names; `assembleCandidates` takes different parameters in each,
>   so "the swap is one line" was true only in the direction taken. Both throw on
>   a mis-shaped call, so this one fails loudly — which was measured, not assumed.
>   (Turn 020)
> * **A stale working copy looks exactly like a current one.** Eight modules
>   deleted from the repository with the motif pipeline were still present in the
>   agent's workspace, clean and parseable, ready to be read as the current
>   design. Found because a file count was eight larger than the repository's.
>   Compare the lists when a number surprises you. (Turn 020)
