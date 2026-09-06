# Throughline - Video Game Recommendation App

ASE-26 independent project.

**Live: https://lively-sunshine-79672b.netlify.app/**

Works out what you actually want from a game — from games you've played and
enjoyed, or from what you say you're after if you're new to this — and picks one
title from a set of candidates, with an explanation of why it fits.

## The design in one line

Three stages: work out what the person wants (from games they've played, or from
what they say they want), assemble a set of candidate games, then pick one from
that set. The stage that works out what they want never sees the candidates.

## What is in here

|Path|What it holds|
|-|-|
|`CLAUDE.md`|The agent's standing brief. Read first.|
|`docs/spec.md`|The specification. The authority on what gets built.|
|`docs/01-interview.md`|The reverse interview, and the assumptions list.|
|`docs/decisions/`|One file per decision that could have gone another way.|
|`docs/turns/`|One record per turn of work, on the seven-part frame.|
|`prompts/`|The three model prompts, versioned like code.|
|`schemas/`|What the model is allowed to return.|
|`data/`|The candidate games and their hand-written `feel` lines, and path B's questions.|
|`src/`|The pipeline. Runs only on the server; holds the keys.|
|`netlify/functions/`|The one HTTP endpoint.|
|`web/`|The React interface.|
|`db/schema.sql`|The Supabase tables. Run once.|
|`tests/reference-set.md`|The seven reference inputs and their expected behaviour.|
|`tests/results-turn-1.md`|What the deployed site actually did when they were run.|
|`logs/model-calls.jsonl`|Local call log. The durable copy is in Supabase.|

## Running it

```
npm install
cp .env.example .env      # then fill it in
npm run check             # 37 offline checks, no key needed, no cost
npx netlify dev           # Vite and the function together, on :8888
```

Command line, without the interface:

```
node scripts/run-analysis.js "Animal Crossing" "Stardew Valley"
node scripts/run-recommend.js "Dark Souls" "Sekiro"
```

## State

**Turn 1 complete.** Path A works end to end, is deployed, and has been run
against the reference set on the deployed artifact rather than locally —
`tests/results-turn-1.md`.

Not built yet: path B (the preference questions, for someone with no games to
name) — the prompt and questions exist, the stage does not. The candidate set is
still a static list of 20 games; turn 2 replaces it with a game database API,
which also brings screenshots and fixes title matching. That run is the evidence
for turn 2: every correct answer the pipeline could give was a decline, because
with twenty games the closest match keeps turning out to be one of the inputs.

Known and unfixed: there is no rate limiting, so the deployed endpoint spends
OpenRouter credit for anyone who finds it. Exposure is bounded only by the
prepaid balance. Reference case 5 is a bad test — it can pass while the thing it
tests has failed — and needs rewriting before it is trusted again.
