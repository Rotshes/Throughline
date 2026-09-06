# 0003 — Filters and a persuasive shortlist, replacing motifs

Date: 2026-09-06
Status: accepted
Supersedes: the motif pipeline in `docs/spec.md` v1.5. Resolves the open
question left by decision 0002 and restated in `docs/turns/003`.

## The decision

The user picks a category and one or more platforms. Code filters a game
catalogue by those. The model picks three titles from what is left and writes a
case for each, one distinct angle per title. Screenshots come from the catalogue.

Recommendations are no longer derived from games the user has played. A played
library still exists, but only as an exclusion list.

## What this replaces

Turn 1's spine was: motifs derived from two to five played games, stage 1 blind
to the candidate set, one recommendation justified by which motifs it satisfied.

That design is not being repaired. It is being replaced.

Turn 1's records stay as written. They describe something that existed, was
deployed, and was verified against the specification on the deployed artifact.
Editing them to read as though this design was always intended would destroy the
audit trail, which is the thing this repository exists to hold.

## Why

**The motif route asks for a lot before it gives anything.** The user must name
two to five games they have played and enjoyed, and if those games share nothing
identifiable the correct answer is zero motifs and no recommendation. Three of
the five reference cases run against production returned exactly that. The
behaviour was correct every time and the experience was still an empty page.

**The thing being built does not need a theory of the user's taste.** Showing
someone games with pictures and arguing for them is a smaller claim than
inferring what they want from what they have played, and it is a claim that can
be delivered every time rather than sometimes.

**It resolves decision 0002 rather than working around it.** 0002 fixed the
candidate `feel` lines as hand-written, on the grounds that a model writing them
would be reasoning about its own recommendation. That held for twenty games and
was impossible for a catalogue. Under this design the model writing the case for
a game is the product, so there is nothing to reverse.

## What it costs

Stated plainly, because these are real and none of them are recovered later.

**The output is no longer personal.** Two people who pick the same category and
platform get the same three games and the same arguments. The project stops being
a recommender and becomes a filtered catalogue with a writer attached.

**Criterion 3 goes and nothing replaces it directly.** "Every motif names at
least two input games and a specific detail from each" was the strongest gate in
the project — a gate that could fail, did fail, and was caught by code rather
than judgement. The new gates are good but none of them constrain the *quality*
of the model's output the way that one did.

**The answer to "why not just ask ChatGPT" has to be rewritten.** The reverse
interview answered it with the blindness rule. That answer no longer applies. The
replacement is below, and it is a narrower claim.

## The new spine

**The model may only choose from the set it was given.**

Code sends a filtered candidate set with stable ids. Code then verifies that
every id returned appears in the set that was sent, that every returned game
satisfies the platform and category the user selected, and that no returned game
is in the user's played library. A title the model produced from training rather
than from the set is a failure, and it is detectable without judgement.

This is what makes the tool worth using over a chat window. A general assistant
will state confidently that a game is available on a platform it never shipped
on, because nothing checks it. Here the model writes the argument and code
decides what it is permitted to argue about.

## What survives from turn 1

`src/paths.js`, `src/config.js`, `src/budget.js`, `src/callLog.js`, most of
`src/store.js`, and `parseJsonStrict` in `src/validate.js`. The recording
discipline — every call logged including failures, `accepted` null until clicked.
The reference-set practice. Every turn record.

The three prompts, both schemas, the shape validators, `data/candidates.json`
and its hand-written lines do not survive.

## What is smaller now

Free-text game titles were attacker-controlled input, and criterion 13 existed
because of it. Category and platform are chosen from fixed lists, so there is no
free text reaching a prompt in the first version of this design. That surface
mostly disappears rather than being defended. It returns the moment a search box
does.
