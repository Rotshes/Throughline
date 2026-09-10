# Turn 006 — the shortlist

Date: 2026-09-10
Spiral turn 2, second of three. Step 3 of the pipeline. Command line only —
nothing here was deployed and no Netlify credit was spent.

**How the agent was directed.** Claude via the desktop app, with read and write
access to this repository folder. Every live run was executed by hand on the
Windows machine and its output read back into the session; the agent holds no key
and made no model call itself.

## 1. Intent

One model call: candidate set in, three picks out, each with an angle and a
written case. Then code checks all of it.

This is the last piece of logic in the product. Everything after it is interface.

## 2. Specification

`docs/spec.md` v2.1. Criteria 2, 3, 4, 4a, 5, 6, 10, 11 and 12.

## 3. Context supplied

The specification, `CLAUDE.md`, decisions 0003 and 0004, `src/catalogue.js` from
turn 005, and the turn 001–005 records — particularly 001's account of how the
motif prompts failed, which shaped three decisions in this one.

## 4. Plan

Written before any code and read by Roy before it was executed.

1. The angle vocabulary as a pinned file, split into checkable and judgement.
2. Schema, then prompt, then the gates, then the runner.
3. Remove the v1 motif files in the same commit — the shortlist *is* the
   replacement for matching, so this is one change rather than two.
4. Run it live and read the cases, not just whether it ran.

## 5. Execution

**Added.** `prompts/shortlist.md` (v1.0, then v1.1),
`schemas/shortlist.schema.json`, `data/angles.json`, `src/shortlist.js`,
`scripts/run-shortlist.js`, `scripts/check-shortlist.js` with 30 offline checks.
`src/validate.js` rewritten down to `parseJsonStrict`, `errorsToText` and the
shortlist schema.

**Removed.** All three v1 prompts, both v1 schemas, `src/analysis.js`,
`src/matching.js`, `src/recommend.js`, `data/candidates.json`,
`data/questions.json`, and the three v1 scripts including the 37 checks that
tested motif code.

**The nine gates**, in the order they run:

| gate | criterion |
|---|---|
| parses as JSON, fences tolerated | 12 |
| schema: three entries of id/angle/case | — |
| **every id was in the set we sent** | **2** |
| no id twice | 5 |
| on a selected platform | 3 |
| carries the selected category | 4 |
| catalogue lists a selected tag | 4a |
| angle is in the vocabulary, used once | 6 |
| constrained angle supported by the data | 6 |

The third is the spine. An id that did not come from the candidate set is a
failure, never an interesting suggestion.

**Three decisions worth naming.**

*The angle vocabulary is split.* `safe-pick`, `deep-cut` and `beautiful-one` are
judgements with nothing to test. `with-someone`, `hard-one` and `short-one` name
conditions the catalogue can answer, and code answers them. Without the split,
criterion 6 would only assert that three strings differ, which passes on
"atmospheric" and "very atmospheric".

*An unrecorded playtime fails the `short-one` constraint rather than passing it.*
The catalogue writes 0 when it does not know. Reading that as "very short" would
label every obscure game the short one.

*An unknown constraint kind fails loudly.* A typo in `angles.json` must break, not
silently pass everything. A gate that does nothing is worse than no gate, because
it is trusted.

## 6. Verification

**78 offline checks**, all against fixtures — 48 catalogue, 30 shortlist. Several
assert that a *good* response passes, because a gate that rejects everything looks
exactly like a gate that works until someone reads the output.

**Three live runs.**

*`action pc --tags roguelike,difficult`* — 24 candidates, one call, every gate
passed first attempt. Dead Cells as the safe pick, Returnal as the hard one, Noita
as the deep cut. All three carry both requested tags; Noita has 299 ratings against
Dead Cells' 1,753, so the deep cut is apt rather than decorative.

*`card linux`* — three candidates, **three picks, no complaint about the count**.
Criterion 5's "fewer than three only when the set held fewer" holds. Both
constrained angles fired and passed honestly: `short-one` on Reigns, which has a
recorded playtime under twelve hours, and `with-someone` on Faeria, which the
catalogue tags `multiplayer` and which is genuinely a player-versus-player card
game. Before this run it was an open question whether `short-one` could ever pass,
given how rarely playtime is recorded.

*`board-games web`* — the catalogue holds 13, none cleared `MIN_RATINGS`, so the
candidate set was empty and **no model call was made**. Confirmed by reading
`logs/model-calls.jsonl` and finding no row, not by the message on screen. That
distinction is the whole point: the equivalent case in v1 passed twice for the
wrong reason before anyone noticed.

**The instruction that mattered most held.** The prompt forbids claims nothing
checks — length, multiplayer, endings, price, inspirations — and pushes toward
what a person could see in ten minutes. Across nine cases in three runs it was
obeyed: "a blur of slashing, rolling, and mid-air recovery", "dense walls of
glowing projectiles", "a stray spark can trigger disastrous chain reactions".
This is a prompt and therefore a request, not a constraint. It held on three runs.

### Corrections issued this turn

**The prompt contradicted the angle vocabulary.** v1.0 forbade stating how long a
game is or whether it can be played with others, while offering two angles whose
entire meaning is those two claims. Reigns is *the short one* and its case says
"runs are brisk and punchy"; Faeria is *the one to play with someone* and its case
says "facing an opponent". Both broke the rule and both were right to.

The model resolved the contradiction sensibly on its own, which is exactly the
problem: a rule the model must reinterpret is one that will be reinterpreted
differently next time. v1.1 carves out those two claims for those two angles,
because they are the two the catalogue verifies before the answer is accepted.

**Two messages described work that never happened.** The runner printed
`asking google/gemini-3.7-flash for 0...` before a call it then did not make, and
the failure said "no candidates matched those filters" when thirteen matched and
none cleared the rating threshold. Same defect as turn 005's `excluded 1` line:
output narrating something that did not occur. Both now say what actually
happened, and the empty case points the reader at the log rather than at itself.

## 7. Outcome

The pipeline runs end to end from the command line. Filters, candidate set,
one model call, nine gates, three games with images and an argument for each.

**Open:** the interface, the RAWG attribution link and one deploy — turn 007.

### What I did not verify

- **Not one gate has fired on live data.** All nine have only ever failed against
  fixtures. Three runs passed cleanly, which is a good sign about the prompt and
  says nothing about whether the checks would catch a real violation. A gate that
  has never caught anything is a claim, not a fact.
- **The injection case has not been run.** Reference case 5 needs a malicious
  candidate spliced into the set by the harness, alongside candidates that would
  obviously be picked. Not built.
- **Repeatability is unmeasured.** Reference case 6 — the same filters three
  times, overlap recorded. One run per filter proves nothing about variance.
- **Criterion 11 has still never fired.** Every run used 1 of 4 calls. The cap has
  been in the code since turn 001 and no run has approached it.
- **Criteria 14 and 15 are untouched.** No interface, so no click-through and no
  catalogue text has yet reached a prompt through a browser.
- **Three of six angles are unexercised.** `beautiful-one` has never been chosen.

### Open questions raised this turn, not answered

**Output tokens are five to nine times the visible text.** 2,127 completion
tokens for about 180 words; 987 for about 190. Gemini 3.7 Flash bills reasoning
as completion, and latency follows — 16.1s and 7.8s for single calls. Real cost
is **$0.005 to $0.011 a request**, roughly double the estimate this turn was
planned against.

That number matters beyond accounting. Turn 005 recorded two unbounded cost holes
on a public endpoint; this doubles one of them, and nothing yet counts requests.

**The three cases share a voice.** Second person, present tense, "you [verb]
through [adjective] [noun]", twice per case. The prompt says not to begin every
case the same way and technically they do not, but the rhythm is identical. Three
runs is not evidence and no change was made. Worth watching once there are more.
