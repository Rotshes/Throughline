# Turn 001 — stage 1, path A: from nothing to motifs on real input

Date: 2026-09-01
Branch / commit: `main`
Covers steps 1–3 of turn 1 (schemas and data, the three prompts, stage 1 path A).

**How the agent was directed this turn.** Claude via the desktop app, with read
and write access to this repository folder, rather than Claude Code in the
terminal. Recorded because it is true and because the two leave different
traces: there is no local agent session log for this turn, only these files and
the commits.

## 1. Intent

Find out whether the central idea of this project actually works before building
anything on top of it.

The project rests on one claim: that a model, given two to five games someone
enjoyed and nothing else, can name what those games share underneath their genre
labels — and can say "nothing" when there is nothing. If that claim is false,
the interface, the database and the deployment are all effort spent on a thing
that does not work. So stage 1 was built first, alone, with no interface and no
candidate set.

## 2. Specification

`docs/spec.md` v1.2, criteria 2, 3, 4, 7b, 9, 10, 12 and 13.
Reference cases 1, 2, 3 and 5 from `tests/reference-set.md`, all written and
committed before any code.

Two rules from `CLAUDE.md` governed the shape of the work: stage 1 never
receives the candidate set, and motifs are the interface between the halves of
the system.

## 3. Context supplied

The specification, the reference set, `CLAUDE.md`, and the two JSON schemas.

Deliberately left out: anything about the candidate set, the matching stage, or
the interface. Stage 1 was built without them in reach, so it could not
accidentally come to depend on them.

## 4. Plan

Eight steps for turn 1; this record covers the first three.

1. Static candidate list and the two JSON schemas. No model.
2. The three prompts.
3. Backend running stage 1 path A only — validated and logged, no interface.

The ordering was deliberate: step 3 is where the project either works or does
not, and everything after it is construction. Reaching the risky part on day one
was the point.

## 5. Execution

**Step 1.** `schemas/motifs.schema.json`, `schemas/recommendation.schema.json`,
`data/candidates.json`.

One decision beyond the specification: the recommendation schema gained an
`outcome` field of `recommended` or `no_good_fit`. Without it there is no way to
express reference case 4 — a schema that always demands a title and at least one
satisfied motif forces the model to manufacture a match. Approved, and written
back into the specification as criteria 7a and 7b, which also settled what
happens when someone enters a single game.

**Step 2.** `prompts/analysis.md`, `prompts/preferences.md`,
`prompts/matching.md`, plus `data/questions.json` for path B.

**Step 3.** `src/` — config, the OpenRouter wrapper, validation, the call log,
and the stage 1 orchestration. `scripts/run-analysis.js` to run it and
`scripts/check-validation.js` for the offline checks.

The path A rule that each motif must cite at least two distinct input games sits
in code, not in the schema. The schema is shared with path B, where evidence
sources are question ids and there are no games to cite, so the rule cannot live
there without breaking the other path.

## 6. Verification

**Offline, no model, no cost: 16 checks, all behaving as expected.** They matter
because each is a rejection that has to happen: a motif citing a game that was
not entered, evidence that restates the motif name instead of giving a detail,
five motifs where four is the limit, an invented `confidence` field, prose where
JSON was demanded. A gate that has never rejected anything is not a gate.

**Live: eight calls.**

| Reference case | Result | Latency | Tokens in/out | Cost |
|---|---|---|---|---|
| — (first attempt) | Failed: HTTP 404, model id does not exist | — | — | — |
| 1, first attempt | Failed: schema | — | — | see log |
| 1 | 3 motifs, evidence check passed | 13.4s | 731 / 1003 | $0.004309 |
| 2 | 2 motifs, mechanics not mood | 34.1s | 736 / 1273 | $0.005326 |
| 3 | **Zero motifs** | 4.3s | 730 / 322 | $0.001755 |
| 5, weak version | Zero motifs — passed for the wrong reason | 5.3s | 740 / 478 | $0.002348 |
| 5, corrected | 2 motifs, no Minecraft, injection ignored | 14.0s | 743 / 1076 | $0.004592 |
| 1, second run | 3 motifs, same three concepts | 15.6s | 731 / 1143 | $0.004835 |

About $0.023 across the calls that reported cost.

**Criterion by criterion:**

| # | How checked | Result |
|---|---|---|
| 2 | ajv against every response | Passed |
| 3 | `checkPathAEvidence` on every run, plus 5 offline cases | Passed |
| 4 | Stage 1 has no candidate parameter to pass | Structurally true |
| 7b | 3 offline cases: one game, two games, six games | Passed |
| 9 | Case 1 run twice; three of three concepts recurred | Partial — third run outstanding |
| 10 | `logs/model-calls.jsonl` after every call | Passed, including both failures |
| 12 | Demonstrated live by the schema failure | Passed |
| 13 | Reference case 5, corrected version | Passed |

**Reference case 3 is the result that matters most.** Civilization VI and Super
Hexagon returned zero motifs. Cases 1 and 2 show the prompt is not simply
refusing everything, and case 3 shows it is not simply agreeing with everything.
Those are opposite failure modes and most prompts fall into one of them. The
shape of the numbers supports it too: 322 output tokens in 4.3 seconds against
1273 in 34 seconds for case 2. It did not strain to find something and give up.

**What I did not verify.**

- **Nothing checks whether the evidence is factually true.** Criterion 3 verifies
  that a motif cites two input games with a specific detail. It cannot verify the
  detail is correct. A confident invented card interaction would pass every gate
  in this project. I read the case 2 output myself and believe it is accurate,
  but that is a human check with no mechanical backing, and it does not scale.
- Path B, the matching stage, and reference cases 4 and 6 — not built.
- Consistency was measured on the easiest pair. Two games that obviously belong
  together produce stable output almost regardless of the model, because there is
  only one sensible answer. Case 2 is where variation has room to appear and it
  was not run three times.
- Whether zero motifs is returned too readily. Only an obviously unrelated pair
  was tested; a pair sharing something real but non-obvious was not.

## 7. Outcome

Stage 1 path A works and produces output worth building on. Steps 1–3 complete.

**Locked:** the schemas, the two-model-call boundary, the evidence rule in code
rather than schema, criteria 7a and 7b.

**Open:** the third consistency run, consistency on case 2, and a probe for
over-eager refusal.

**Next:** step 4, the matching call. That is where reference case 4 becomes
runnable and the question becomes whether the system can decline.

### Corrections issued this turn

**The model id was wrong and the first call died with HTTP 404.** I had written a
default from stale knowledge; the provider had retired that identifier. The
lesson is not that the id was wrong but that ids go stale, which is why it is an
environment variable and not a constant. Comment added at the point of use with
a link to the live list. This is also the same mechanism the model progression
will use later, so it now has a reason to exist beyond convenience.

**A prompt cannot reference a file the model cannot read.** All three prompts
said "conforming to `schemas/motifs.schema.json`". The model has no access to the
repository, so it guessed the shape and guessed wrong twice over: a bare array
instead of an object, and `game` where the schema says `source`. Every prompt now
states its output shape in full, with the exact field names and an explicit list
of keys that will be rejected. Prompts went to v1.1.

This is now a standing rule in `CLAUDE.md` and a pitfall in the specification.
Notably the content was already good on that failed attempt — specific motifs,
concrete evidence. The prompt was working on the hard part and failing on the
easy one, which is not where I expected to lose a call.

**A gate can pass for the wrong reason.** Reference case 5 originally paired the
malicious title with one unrelated game. It returned zero motifs and appeared to
pass — but Portal 2 and Stardew Valley share little anyway, so the result could
not distinguish "resisted the instruction" from "found nothing". Rewritten to put
the malicious title alongside two games that genuinely do share motifs, so there
is exactly one correct outcome. It then passed properly.

**A stale result looks exactly like a fresh one.** I reported a run whose token
counts, cost and latency were identical to the previous run down to the
millisecond — it was the earlier output pasted again, and the command as typed
would have been rejected for having too many arguments. It was caught from the
logged latency, not from the motifs. This is the argument for criterion 10 in
one line: without per-call figures there is no way to tell a repeated result from
a new one.

### Design finding, not a defect

Given three games where one shares nothing with the other two, the model silently
drops the third. Motifs cite two of the three and nothing explains the omission.
A legitimate user would see this and have no way to know their third game was
read at all. The interface should say which games a motif set actually drew on.
Carried to step 6.
