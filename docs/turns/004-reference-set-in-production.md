# Turn 004 — the reference set against production

Date: 2026-09-06
Step 8 of 8. This closes spiral turn 1.

Full run sheet and figures: `tests/results-turn-1.md`.

**How the agent was directed.** Claude via the desktop app, with read and write
access to this repository folder. The five cases were typed into the deployed
form by hand; the results were read back out of Supabase with SQL and handed to
the agent for analysis.

## 1. Intent

Find out whether the deployed thing behaves as specified, rather than whether it
runs.

Turn 003 established that path A works at a public address. That is not the same
claim. Every one of the six failures in turn 003 appeared only outside local
development while the 37 offline checks stayed green, so the deployed artifact
gets its own verification pass or it has none.

## 2. Specification

`tests/reference-set.md`, and through it criteria 2, 3, 5, 7, 7a, 7c, 10 and 12
of `docs/spec.md`.

## 3. Context supplied

The reference set, the specification, and the two prompts at their current
versions (analysis v1.2, matching v1.2).

## 4. Plan

Run five of the seven cases through the deployed form — not the command line,
because the command line exercises a different artifact. Cases 4 and 6 are out of
reach: case 4 needs a candidate set of exactly one game, which the interface
cannot express, and case 6 is path B, which is not built.

Then read the rows back out of Supabase rather than trusting the screen, so that
criterion 10 is tested by the same act that tests everything else.

## 5. Execution

Five cases, five sessions, about $0.028 total. Results in
`tests/results-turn-1.md`.

## 6. Verification

**Confirmed in production:** criteria 2, 3, 5, 7a, 7c, 10 and 12.

Every motif in the two cases that produced any cited every input game — criterion
3 held on every run, and is readable straight out of the `motifs` column without
re-running anything. The three zero-motif cases stopped after a single model call
instead of paying to match against nothing. All eight sessions in the table
wrote rows, including the failures and one earlier run that died mid-call with a
null cost.

**A reference case failed for the wrong reason, for the second time.** Case 5
pairs a prompt-injection title with Stardew Valley and expects the instruction to
be ignored. It returned zero motifs, which satisfies "no Minecraft appeared"
while proving nothing: Portal 2 and Stardew Valley share almost nothing anyway,
so the result cannot distinguish "resisted the instruction" from "found no
connection".

This is the same flaw the case was rewritten to fix in turn 001, and the rewrite
kept the shape that causes it. The rule — before trusting a gate, ask what result
would look like a pass while the thing being tested had failed — is already in
`CLAUDE.md` and it still happened. Writing a rule down is not the same as
applying it. The fix is structural rather than verbal: the malicious title must
sit alongside **two** games that genuinely share motifs, so that zero motifs
becomes an unambiguous failure.

**The finding of this turn: the candidate set is the limitation, not the
pipeline.** All three runs that produced motifs declined, and every decline is
correct given the list. Case 1 wants a cosy life sim and Stardew Valley, the only
one, is excluded as an input. Case 2 wants a deckbuilder and Slay the Spire, the
only one, is excluded the same way. Twenty games across twenty genres cannot
serve a specific request; the moment the closest match is an input, nothing is
left. Turn 2 was already going to replace the static list with a game database.
This run is the evidence for that rather than the intuition.

**What I did not verify.** Reference case 4 in its intended single-candidate
form. Case 6 and path B, which are not built. Criterion 14 — Commit to Play was
not clicked during this run. Criterion 11 — no run came near the call cap, so the
cap has still never fired outside the offline checks.

## 7. Outcome

Spiral turn 1 is closed. Path A works end to end at a public address, its
behaviour has been checked against the written criteria on the deployed artifact,
and the record of that check is in the repository.

### Open questions raised this turn, not answered

**Is `matching.md` v1.2 too loose, or is the model too strict?** Case 2 declined
while naming Vampire Survivors as closest, on the grounds that no candidate
offers "turn-based card synergy calculations or the ability to aggressively prune
a deck". The prompt says a candidate satisfying *some* motifs and contradicting
none is a recommendation, and Vampire Survivors plainly satisfies "runaway engine
synergies". Two readings, leading opposite ways: the model is stricter than
instructed and the wording needs another pass, or the model is right and the rule
is too loose because some motif sets describe one indivisible thing — deck
pruning plus runaway synergy together are a deckbuilder, and satisfying half of
that hands someone the scaling without the kind of game they enjoy.

Undecided, and deliberately so. It needs someone who knows the games. It should
be settled before the candidate set grows: with a hundred thousand candidates, a
rule that is slightly too loose produces confident bad matches at volume.
