# 0002 — Candidates carry a written line, and one evidence schema serves both paths

Status: accepted
Date: 2026-09-01

Two decisions taken together in turn 1, step 1. Both had real alternatives and
both are now baked into code, so they are recorded before the reasoning is lost.

---

## Decision one — a candidate is a title *and* a line I wrote

Each entry in `data/candidates.json` is `{title, feel}`, where `feel` is one
sentence, written by hand, saying what playing that game is actually like.

### The alternative

Store titles only, and let the matching call rely on what the model already
knows about each game. Smaller prompt, no writing to do, and for well-known
games the model's knowledge is mostly fine.

### Why it was rejected

The match would rest entirely on the model's recollection, which cannot be
inspected, corrected, or version-controlled. When a recommendation is wrong
there would be nothing to fix — no line to rewrite, only a hope that a different
model remembers better.

It also breaks the arrangement the rest of this project runs on: something
outside the model decides the facts, and the model does the reasoning. Titles
alone put the facts inside the model.

There is a second reason, and it is the more important one. The `feel` lines are
where the judgement in this project lives. "The terrain itself is the main
antagonist" is a claim about Death Stranding that a person makes; a model
producing that sentence would be describing the game, not deciding what matters
about it. If the lines were generated, the product would be a wrapper around a
chat box with extra steps.

### What it costs

Twenty lines of writing to start, and more for every game added. The candidate
set can only grow as fast as someone can think about games. Turn 2 replaces this
source with a game database API, and that tension will have to be faced then:
an API supplies titles and tags but not this.

### The rule that follows

`feel` lines are written by a person. If a future turn generates them, this
decision has been reversed and needs a record saying so.

---

## Decision two — one motif schema for both paths, with the path A rule in code

`schemas/motifs.schema.json` is used unchanged by path A (played games) and
path B (preference answers). Evidence items are `{source, detail}`, where
`source` is a game title on path A and a question id on path B.

The rule that each motif must cite **at least two distinct input games** applies
only to path A, and lives in `src/validate.js` rather than in the schema.

### The alternative

Two schemas, one per path, each expressing its own rules completely. The
two-games rule could then be enforced declaratively rather than in code.

### Why it was rejected

Criterion 2 requires motifs from either path to conform to the same schema, and
`CLAUDE.md` makes motifs the interface between the halves of the system: stage 3
takes motifs and must not know which path produced them. Two schemas would make
that difference visible downstream, and the first piece of code to branch on
"which kind of motifs are these" would end the separation the design depends on.

Path B has no games to cite. A schema demanding two game sources cannot be
shared with it, so the rule has to live somewhere else.

### What it costs

A reader of the schema alone does not see the whole contract. The schema accepts
a path A motif citing only one game; only `checkPathAEvidence` rejects it.

Mitigated by a `$comment` in the schema saying exactly this and naming where the
rule lives, and by the code comment pointing back. Both were written at the time
rather than left implicit.

### What would change this

If path B ever needs its own structural rules — a minimum number of questions
cited, say — the shared schema stops paying for itself and two schemas plus an
explicit conversion step become the honest arrangement. Note it would then be a
conversion, not a fork: stage 3 must still receive one shape.
