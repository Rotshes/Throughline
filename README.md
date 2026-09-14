# Throughline — a video game recommendation app

ASE-26 independent project. Roy Rotshes.

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

## The honest limitation

**Nothing checks whether the written case is true.** The model can say a game has
co-op or a twenty-hour campaign and no gate in this project will catch it if it
does not. Every success criterion can pass on three eloquent falsehoods. The only
mitigation is keeping the prompt off checkable specifics and onto what a person
can judge from a screenshot.

This is pitfall 1 in `docs/spec.md`, it is deliberate, and it is the largest
known gap in the project. It is written down rather than disguised.

## What is in here

| Path | What it holds |
|---|---|
| `CLAUDE.md` | The agent's standing brief. Read first. |
| `docs/spec.md` | The specification, v3.1. The authority on what gets built. |
| `docs/failures.md` | Twenty-eight failures seen in this project, one line each. |
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

### The missing 008

There is no `docs/turns/008`. The number was skipped, not the record.

`git log --all --diff-filter=A -- "docs/turns/008*"` returns nothing: no file by
that name has ever been committed. Turn 007 closes "spiral turn 2, third of
three" and turn 009 opens "spiral turn 3", both dated 2026-09-11, with no work
between them.

Stated here because a gap in a numbered sequence invites the question, and the
answer is duller than the gap looks. Writing a turn 008 after the fact would have
been the wrong fix twice over: `CLAUDE.md` requires records to be written during
the turn, and a backdated record in a repository graded on its record is worse
than a skipped integer.

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

## State

**Turn 20.** IGDB as the catalogue, IsThereAnyDeal for prices, one model call per
request, a shared library, and a front page of four rows.

Three external services and six secrets. Each service has its own failure `kind`,
so a user can tell which one broke.

### Known and unfixed, all recorded

- **No rate limiting** on `/api/shortlist`, `/api/deals` or `/api/event`. The
  deployed endpoints spend OpenRouter credit for anyone who finds them. Exposure
  is bounded only by the prepaid balance.
- **Seven of nine reference cases have never been run.** Cases 5 and 6 were run
  in turn 019 and both turned out to be wrong about the software — case 5 tested
  catalogue descriptions, which never enter a prompt. Case 4 is the one the
  specification says to design most carefully and it is still unrun.
- **`MIN_GAMES = 600`** in `scripts/pin-igdb-tags.js` currently excludes nothing.
  Kept as a guard; recorded as inert rather than left looking load-bearing.
- **Nothing checks whether the written case is true.** See above.

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
