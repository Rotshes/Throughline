# Turn 002 — the matching stage: from motifs to a recommendation, or an honest refusal

Date: 2026-09-01 to 2026-09-06
Still spiral turn 1. This covers step 4 of eight; steps 1–3 are in turn 001.
Record numbering follows work sessions, not spiral turns.

**How the agent was directed.** Claude via the desktop app, with read and write
access to this repository folder. Same as turn 001, and the same caveat applies:
there is no local agent session log, only these files and the commits.

## 1. Intent

Stage 1 was known to work. The question this turn answers is whether the
pipeline end to end produces something worth showing a person — a recommendation
grounded in the candidate's own description, or a refusal that says what is
missing.

The refusal mattered more than the recommendation going in. A recommender that
cannot say "nothing here" will always say something, and everything it says
becomes worthless.

## 2. Specification

`docs/spec.md`, criteria 7, 7a and 11. Criterion 7c was added during the turn.
Reference case 4 from `tests/reference-set.md`.

Two rules from `CLAUDE.md` governed the shape: stage 1 never receives the
candidate set, and stage 3 must not know which path produced the motifs.

## 3. Context supplied

The specification, `CLAUDE.md`, both schemas, `prompts/matching.md`, and
`data/candidates.json` — 20 games with `feel` lines written by hand, per
decision 0002.

## 4. Plan

Build the matching stage, a call budget shared across both stages, and the
cross-reference checks the schema cannot express. Then run the reference cases
and read the results.

## 5. Execution

`src/matching.js`, `src/recommend.js`, `src/budget.js`,
`scripts/run-recommend.js`, plus `checkRecommendation` in `src/validate.js`.

**The budget is shared across the request, not per stage.** Two stages retrying
once each is four calls, and per-stage counters would never notice. Criterion 11
says "a request exceeding the cap", so the counter belongs to the request.

**A cross-check failure retries; an evidence-check failure does not.** A title
that is not in the candidate set is an invented game and must never reach a
user, so it fails the attempt. The path A evidence rule is about quality, not
correctness, so it is reported alongside a successful result. Conflating the two
would make the log useless for judging reliability.

**Stage 1 runs before the candidate list is loaded** in `recommend.js`.
Functionally irrelevant — it could not see the list either way. It makes the rule
the design rests on visible to the next person editing that file.

## 6. Verification

**Offline: 37 checks, all behaving as expected**, up from 16. The new ones cover
the budget cap, candidate well-formedness, the recommendation cross-checks in
both directions, and the exclusion rule.

**Live: nine runs.** Every one of them changed what I believed.

| # | Input | Result | Latency | Cost |
|---|---|---|---|---|
| 1 | Super Metroid, Hollow Knight | Recommended **Hollow Knight** — an input game | 16.5s | $0.009593 |
| 2 | Animal Crossing, Stardew Valley | Recommended **Stardew Valley** — an input game | 12.3s | $0.007610 |
| | *criterion 7c added: input games excluded* | | | |
| 3 | Super Metroid, Hollow Knight | Failed: 61-character motif name, twice | — | see log |
| 4 | Animal Crossing, Stardew Valley | **Declined**, correctly | 15.8s | $0.008545 |
| | *motif name cap raised 60 → 80* | | | |
| 5 | Super Metroid, Hollow Knight | **Declined**, correctly | 18.7s | $0.011318 |
| 6 | Dark Souls, Sekiro | **Declined** — wrongly; named Bloodborne as "adjacent" | 18.0s | $0.009359 |
| | *matching prompt v1.1 → v1.2* | | | |
| 7 | Dark Souls, Sekiro | **Recommended Hollow Knight** | 14.2s | $0.007775 |
| 8 | Super Metroid, Hollow Knight | **Declined** — control held | 20.7s | $0.011684 |
| 9 | Animal Crossing, Stardew Valley | **Declined** — control held | 18.5s | $0.010051 |

About $0.076 this turn.

**Runs 7, 8 and 9 are one experiment, not three results.** One variable changed —
the matching prompt. Run 7 is the outcome being tested; 8 and 9 are controls that
had to *not* move. Loosening a refusal threshold can trade over-refusal for
over-forcing, and that swap looks exactly like a fix if you only rerun the case
that was broken.

**Run 7 is worth reading closely.** The motifs were "rhythmic defence and
committed animation timing" and "punishing checkpoint loops". Bloodborne is the
genre-adjacent answer, but its line says it rewards abandoning defensive habits —
which contradicts the first motif. Hollow Knight's line says precise, unforgiving
combat, and it has benches that repopulate enemies. It chose the second and said
why. The "must not contradict the line" rule was doing real discriminating work,
not just permitting a looser match.

| Criterion | How checked | Result |
|---|---|---|
| 7 | `checkRecommendation` on every run, plus 8 offline cases | Passed |
| 7a | Declines observed live in runs 4, 5, 8, 9 | Passed |
| 7c | 5 offline cases against a fixture, plus runs 4–9 | Passed |
| 11 | 2 offline cases; every live run reported 2 of 4 used | Passed |
| 12 | Run 3 failed on schema, retried, reported as failure | Passed |

**What I did not verify.**

- **Reference case 4 in its intended form.** It specifies a candidate set of
  exactly one mismatched game. Every run had 19 or 20 options. A single bad
  option is where the pull to force a match is strongest, and that pressure
  remains untested.
- Whether declining is still too eager on inputs other than the three used here.
  Three inputs is not a sample.
- Path B, and reference case 6.
- Whether the recommendation is any *good*. Run 7 looks right to me, and I am
  the person who wrote the feel lines, so my judgement of it is not independent.

## 7. Outcome

The pipeline works end to end. Both outcomes are proven with real calls.

**Locked:** the shared budget, cross-reference checks in code, criterion 7c,
matching prompt v1.2.

**Open:** reference case 4 proper; the analysis prompt drifting toward mechanics;
path B.

**Next:** step 5, Supabase, where the call log moves from a file to a table.

### Corrections issued this turn

**It recommended a game the user had just named.** Twice. Given Super Metroid and
Hollow Knight it returned Hollow Knight; given Animal Crossing and Stardew Valley
it returned Stardew Valley.

Every gate passed: valid schema, real title, real motifs, evidence check green.
The cross-check confirmed the game existed and never asked whether it should be
offered. Nobody had written the rule down because it is too obvious to state —
which is exactly why it needed stating.

Fixed in code, not in the prompt: input games are removed from the candidate set
before stage 3 is called. A prompt instruction would hold most of the time.
Removing the entries makes it impossible. Criterion 7c, pitfall 14.

**Two of my own checks depended on `data/candidates.json`** and broke as soon as
the file differed. A check that fails when a data file is edited is not testing
the code. Rewritten against a fixed fixture, with the data file getting its own
separate well-formedness check. Pitfall 15.

**A 60-character cap on motif names rejected a good 61-character name, twice.**
The cap was arbitrary and protected nothing — a long name breaks no code and
harms no user. The prompt *did* state the limit and the model exceeded it anyway,
which is the more useful half: a numeric bound stated in a prompt is a request,
not a constraint. Retrying could not help, because this was the model's natural
output length rather than a transient failure. Cap raised to 80. Pitfall 16.

**The matching prompt was one-sided, and it cost a false refusal.** v1.1 said "a
forced match is the worst outcome this system can produce" and never named
over-refusal as a failure at all. Given one stated risk, the model minimised that
risk: run 6 declined while explicitly naming Bloodborne as "genre adjacent".

Two further faults in the same prompt. It demanded the match be "defensible from
the line itself", which a one-sentence feel line can never support for a
mechanically specific motif. And it framed the task as pass/fail rather than
best-of-set, when the job is picking the best of twenty.

v1.2 states both failures as equally bad, names the specific behaviour observed
(calling a candidate "adjacent" and declining anyway is the failure, not
caution), makes the feel line a veto rather than the sole evidence, and says
partial matches are recommendations.

### Design finding

Stage 1 is drifting toward mechanics. "Sparse safe havens that replenish
resources while reviving the zone" is a bonfire, not a feeling, and this project
exists because of how games feel rather than what they contain. The two stages
are speaking different languages: mechanically specific motifs against
impressionistic feel lines, with nothing guaranteeing they are commensurable.

Left alone deliberately. The system works now and runs 7–9 are a baseline;
changing the analysis prompt immediately would discard it. Carried to turn 2.
