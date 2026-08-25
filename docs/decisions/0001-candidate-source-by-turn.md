# 0001 — Where the candidate set comes from, and in what order

Status: accepted
Date: 25.08.2026

## The decision

The set of games the app is allowed to recommend from grows across three turns:

1. **Turn 1** — a static list of well-known games kept in the repository.
2. **Turn 2** — a game database API ([IGDB](https://api-docs.igdb.com/) or
   [RAWG](https://rawg.io/apidocs)), narrowed by filters derived from the motifs.
3. **Turn 3** — the user's Steam library, where owned games with zero playtime
   are the backlog.

## Why a candidate set exists at all

The matching call must return a title that exists. Without a fixed set to choose
from, a model will eventually name a game that does not exist, or name one that
does and describe it as something it is not. Requiring the answer to come from a
supplied set is what makes that checkable in code rather than by reading.

This is the same arrangement used everywhere else in this project: something
outside the model decides the facts, and the model decides nothing factual.

## Why an API beats a hand-written list, and why it is not turn 1

An API is the better long-term answer. It is the authority on which games exist,
so nothing can be invented; and it resolves "Civ VI", "Civilization VI" and "Sid
Meier's Civilization VI" to one identifier, which fixes a title-matching problem
that turn 1 will certainly hit.

It is not turn 1 because it brings a problem of its own. A catalogue of hundreds
of thousands of titles cannot go into a prompt, so a narrowing step has to exist
before the matching call. Designing that step is real work, and doing it before
anything runs would mean another week without a deployed application.

A static list of about fifty games takes half an hour and unblocks everything
downstream.

## Why Steam moved from turn 2 to turn 3

Steam was originally the second turn, on the grounds that a user's own backlog is
the most useful candidate set and the thing a chat model cannot replicate.

It moved because the API turn also fixes title matching, and turn 1 will break on
title matching. Doing the API second means the known defect from turn 1 gets
repaired by the next turn rather than the one after.

Steam remains the strongest version of the product. It is third because the two
turns before it make it easier, not because it matters less.

## The tension this creates, recorded rather than resolved

This project exists because genre labels are a poor guide to how a game feels.
The narrowing step in turn 2 leans on genre and tag labels.

The intended division is that the API narrows crudely to a plausible pool of
roughly fifty, and the model does the subtle matching inside that pool. That is
defensible, but it is a real tension and not a solved problem. Pitfall 5 in the
specification exists because of it: a candidate set assembled by crude tags can
exclude the game that actually fits, and that failure is invisible unless the
filters used are logged with every recommendation.

## What would change this

If the narrowing step turns out to discard good answers often enough to matter,
the alternative is a much smaller hand-curated catalogue with richer descriptions
— fewer games, better matched. That trades coverage for quality and would be a
different product.
