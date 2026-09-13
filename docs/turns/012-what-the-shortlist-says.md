# Turn 012 — what the shortlist says

Date: 2026-09-12
Local only; nothing deployed.

> **Written retrospectively on 2026-09-13.** See the notice in turn 010.

## 1. Intent

The shortlist returned three games and a paragraph each. Four separate
complaints from the user turned out to be the same complaint: *the page does not
say why*.

- Why this angle for this game.
- What the word I ticked actually amounts to here.
- Why the same filters keep giving me the same game.
- Why this returned one result when I asked for something obvious.

## 2. Specification

`docs/spec.md` v2.1, criteria 4a, 5, 6 and 12. Criterion 4a — tag notes — was
added to the specification during this turn at the user's request, which is the
correct order: the criterion before the code.

## 3. Context supplied

The specification, `CLAUDE.md`, decision 0004 on OR semantics, and the user's
own report that GameCube plus split-screen returned Sonic and nothing else.

## 4. Plan

1. Angle reasons written by **code from the catalogue record**, never asked of
   the model.
2. Tag notes written by the model, gated on the tag being one the user requested
   and one the catalogue actually lists.
3. Recently shown games step aside, softly.
4. Thin results diagnosed from measured counts rather than guessed at.

## 5. Execution

**Angle reasons are code, not a second model call.** Five of the six angles rest
on something already on the candidate: how many people rated it, what the
catalogue labels it, how much of the request it matched. Asking the model to
justify a label it had just applied would spend tokens producing a sentence
nothing can check — and it is the model reviewing its own choice, which agents do
badly because they defend themselves.

`beautiful-one` returns null and gets no line. Nothing on a catalogue record says
a game is beautiful, and inventing a number to stand in for it would be worse
than leaving the line off.

**Tag notes carry four gates**: the tag was requested, the catalogue lists the
game under it, no tag repeats within a pick, and a note exists for every tag
carried. Three existing checks broke when this landed — they had picks with no
`tagNotes` while requesting `difficult`. The checks were correct and the fixtures
were stale.

**Variety is deliberately soft.** Games from the last few shortlists step aside
*only when the pool can spare them*. Criterion 5 forbids padding a thin result
and it would be absurd to manufacture one — a filter with four candidates should
keep returning those four rather than run out because they were shown a minute
ago.

What this deliberately does not do: sample deeper into the catalogue. That would
give more variety and drag in games below the rating floor, which the model
cannot write about truthfully — trading a visible repetition for an invisible
fabrication.

**The thin-result diagnosis replaced advice that was wrong.** A request for
split-screen GameCube games returned one, and the page suggested widening to the
whole Nintendo family. The catalogue held 662 GameCube games and six carried the
tag. The console was never the problem. The page now asks the catalogue the same
question with one filter removed and reports the two numbers.

Files: `prompts/shortlist.md` (v1.1 → v1.2), `schemas/shortlist.schema.json`,
`src/shortlist.js`, `src/pipeline.js`, `src/store.js`, `data/angles.json`,
`netlify/functions/shortlist.js`, and both check suites.

## 6. Verification

| Criterion | Method | Result |
|---|---|---|
| 4a — tag notes | offline checks: requested, carried, unique, present | pass |
| 6 — angles | membership and no-repeat unchanged | pass |
| 5 — no padding | thin pool keeps its games; variety yields | pass |
| 12 — failure shown | diagnosis appears only on thin/empty | pass |

**What I did not verify:** whether a tag note is *true*. The gate proves the
catalogue lists the game under that tag and that the model wrote one sentence
about it. Nothing checks the sentence. This is pitfall 1 with a new surface, and
it is now larger than it was.

## 7. Outcome

The page explains itself from data rather than from assertion, in four places
where it previously did not explain itself at all.

### Corrections issued this turn

**Advice given confidently and wrongly is worse than no advice.** The old thin-
result message sent people to change the one filter that was not the problem.
Measured counts replaced a guess.

**A tag is a claim and a tag note inherits that.** "The catalogue lists this game
under split-screen" is provable. "This game has split screen" is not, and the
interface must never upgrade one into the other.

### Open questions raised this turn, not answered

**The user asked why a GameCube split-screen search finds one game**, and the
answer — six of 662 carry the tag — was a fact about RAWG's tag coverage rather
than about GameCube. That finding is what eventually justified turn 015: IGDB
records split-screen as a structured field and 302 of 713 GameCube games carry
it.
