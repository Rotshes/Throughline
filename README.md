# Throughline — a video game recommendation app

ASE-26 independent project. Roy Rotshes.

The deployed address is not published here. This repository is public, the
endpoints behind that address have no rate limiting, and each shortlist spends
real credit — so advertising the URL in the one file every visitor opens would
be publishing a way to spend somebody else's money. It is sent directly to the
people who need it.

**The repository is the deliverable.** The course grades how well the agent was
directed, not how good the app is. `docs/` is where the work is; `src/` is what
came out of it.

## What it does

You pick a kind of game and the platforms you own. You get three specific titles,
each with a picture, a trailer, and a written case for why you might want it.

## The rule the whole design rests on

**The model may only choose from the set it was given, and code verifies every id
came back from that set.**

Three steps:

1. **Filter.** Your selections become a catalogue query. No model call. Pure
   code, testable with no key and no cost.
2. **Candidate set.** The catalogue returns a pool; code reduces it to about
   twenty-four candidates with stable ids, removes anything already in the
   library, and logs the whole set.
3. **Shortlist.** One model call returns three ids, each with an angle label and
   a written case. Code checks every id against the set, every platform against
   the catalogue, and every angle against a fixed vocabulary.

This is why the app is worth using instead of asking an assistant directly. A
model answering from memory will tell you a game is on a platform it never
shipped on, and nothing catches it. Here the model writes the argument and code
decides what it is allowed to argue about.

**The catalogue is the authority on facts** — platforms, dates, images,
classification. The model is never asked for any of them.

## What is in here

| Path | What it holds |
|---|---|
| `CLAUDE.md` | The agent's standing brief. Read first. |
| `docs/spec.md` | The specification, v3.1. The authority on what gets built. |
| `docs/failures.md` | Thirty-two failures seen in this project, one line each. |
| `docs/architecture.md` | How the parts fit together, with diagrams. Start here after the spec. |
| `docs/decisions/` | One file per decision that could have gone another way. |
| `docs/turns/` | One record per turn of work. 001 to 020, and [there is no 008](#the-missing-008). |
| `docs/01-interview.md` | The reverse interview and the assumptions list. |
| `prompts/shortlist.md` | The one live prompt, versioned like code. |
| `schemas/shortlist.schema.json` | What the model is allowed to return. |
| `data/*.igdb.json` | The pinned vocabularies. Whatever is in them is the entire vocabulary this product understands. |
| `src/` | The pipeline. Server only; holds the keys. |
| `netlify/functions/` | Seven HTTP endpoints. |
| `web/` | The React interface. |
| `db/` | `schema.sql`, then three migrations, run in order. |
| `scripts/check-*.js` | Offline checks. No key, no network, no cost. |
| `scripts/probe-*.js` | Measurements against live services. These cost requests. |
| `scripts/case-*.js` | Reference cases from `docs/spec.md` part 4. These cost model calls. |
| `logs/model-calls.jsonl` | Local call log. The durable copy is in Supabase. |

### Files kept because they were true when written

`prompts/analysis.md`, `prompts/matching.md`, `prompts/preferences.md`,
`schemas/motifs.schema.json`, `schemas/recommendation.schema.json`,
`tests/reference-set.md` and `tests/results-turn-1.md` belong to v1.x, which
built a different product — a two-call motif pipeline that was deployed and
verified before `docs/decisions/0003` replaced it.

Turn records 001 to 004 describe that product. **They are not edited to match the
current one.** A record of a design that no longer exists is still a true record.

`src/catalogue.js` is the RAWG module, replaced by IGDB in
`docs/decisions/0006`. It still exists and still passes its checks; it goes when
the IGDB build has been deployed and proven.

## Running it

```
npm install
cp .env.example .env      # then fill in all six values
npm run check             # 292 offline checks + 67 files scanned. No key, no cost.
npx netlify dev           # Vite and the functions together, on :8888
```

Without the interface:

```
node scripts/run-candidates.js shooter pc            # steps 1 and 2, no model call
node scripts/run-shortlist.js shooter pc             # all three steps, one model call
node scripts/run-candidates.js any nintendo --machines switch --tags co-operative
```

Both refuse any slug that is not in the pinned vocabularies and print the whole
list when you get one wrong. That guard exists because three slugs in this
project were typed from memory and all three were wrong.

## The measurements this project rests on

Every number below was produced by a script in `scripts/`, not by reasoning.

- IGDB allows **4 requests per second** per client id, 500 rows per request.
- **5 platform families** exist and **PC is in none of them**, which is why the
  platform tree in `data/platforms.igdb.json` is hand-built.
- 2026 had **294 games with five or more critic reviews**; RAWG had **0**. That
  measurement is what moved the project off RAWG.
- GameCube: **302 of 713** games carry split-screen on IGDB, against **6 of 662**
  on RAWG.
- Given one fixed candidate set, the model returned **the same three games three
  times out of three** while its prose varied **40% in length**. The variability
  lives entirely in the part nothing checks.
- Five prompt-injection attacks through a candidate title: **zero compliance**.
  One of them forged two catalogue fields into the prompt anyway, via a newline.
  That is fixed in code, not in the prompt.
