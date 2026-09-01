# Throughline - Video Game Recommendation App

ASE-26 independent project.

Works out what you actually want from a game — from games you've played and
enjoyed, or from what you say you're after if you're new to this — and picks one
title from a set of candidates, with an explanation of why it fits.

|Path|What it holds|
|-|-|
|`CLAUDE.md`|The agent's standing brief. Read first.|
|`docs/spec.md`|The specification. The authority on what gets built.|
|`docs/01-interview.md`|The reverse interview, and the assumptions list.|
|`docs/decisions/`|One file per decision that could have gone another way.|
|`docs/turns/`|One record per turn of work, on the seven-part frame.|
|`prompts/`|The three model prompts, versioned like code.|
|`tests/reference-set.md`|The six reference inputs and their expected behaviour.|

## The design in one line

Three stages: work out what the person wants (from games they've played, or from
what they say they want), assemble a set of candidate games, then pick one from
that set. The stage that works out what they want never sees the candidates.

