# Turn 003 — the database, the interface, and the deploy

Date: 2026-09-06
Still spiral turn 1. Covers steps 5 to 7 of eight; steps 1–3 are in turn 001,
step 4 in turn 002.

Live at https://lively-sunshine-79672b.netlify.app/

**How the agent was directed.** Claude via the desktop app, with read and write
access to this repository folder. No local agent session log; the record is these
files and the commits.

## 1. Intent

Get it in front of a person.

Everything before this turn ran from a terminal on one machine. Criterion 1 asks
for a deployed web address, and until something is deployed there is no evidence
about whether any of it works anywhere but here.

## 2. Specification

`docs/spec.md`, criteria 1, 10 and 14, and part 3's four layers: browser,
backend, database, deployment.

## 3. Context supplied

The specification, `CLAUDE.md`, the existing pipeline in `src/`, and decision
0002 on where the candidate `feel` lines come from.

## 4. Plan

Three steps, in this order and for this reason:

5. **Supabase first.** Netlify functions have no persistent filesystem, so the
   JSONL log stops existing the moment a function returns. Deploying before the
   database meant criterion 10 would keep passing locally while silently failing
   in production — the worst kind of failure, because nothing reports it.
6. The React interface.
7. Deploy.

## 5. Execution

**Step 5.** `db/schema.sql` — two tables, `sessions` and `model_calls`, with
Row Level Security enabled and no policies. Deliberate: the backend uses the
service key, which bypasses RLS, and without it enabled the publishable key
(public by design in any frontend) could read every row.

`src/store.js` writes both. `src/recommend.js` gained `recommendAndRecord`.
Recording failures are returned, never thrown — a user waiting on a
recommendation should not lose it because an insert failed, but a silent
recording failure would make criterion 10 a fiction, so it comes back in the
response and the interface shows it.

`accepted` is null until someone clicks; `false` is never written. "Did not
click" and "actively rejected" are different, and only one of them means
anything with a single button.

**Step 6.** `web/` — Vite and React, per the specification. Four decisions came
from the spec rather than from taste:

- A decline uses a different heading, a different accent, and offers no Commit
  to Play control. Criterion 7a says a decline is shown as a decline; the risk
  was rendering both in the same card and letting people read past the
  difference.
- The waiting state says two calls, 15–25 seconds, with a live elapsed counter.
  Nothing streams, so a progress bar would be inventing information it does not
  have.
- The page says which of the input games the motifs actually drew on. That is
  the silent-third-game finding from turn 001, and it costs one line.
- Recording failures are shown in the meta line rather than swallowed.

**Step 7.** `netlify/functions/recommend.js`, `netlify.toml`, deployed from the
GitHub repository.

## 6. Verification

**37 offline checks** throughout, unchanged and passing.

**Live, through the deployed site:** a recommendation returned, and rows written
to `sessions` and `model_calls` in Supabase.

**One thing the database answered that memory could not.** Two sessions had
produced three model calls, which looked wrong. The rows showed the first
session had a single `analysis` call at 198 output tokens — `{"motifs": []}` —
so `recommend.js` stopped at criterion 5 and never called matching. Not a bug: no
recommendation made, and no money spent matching against nothing. That question
was answered from the record rather than by remembering, which is the first time
criterion 10 has paid for itself rather than merely existing.

**An accident worth more than a planned test.** Someone typed "alo" and "sd"
into the form. The model returned zero motifs and refused to connect two things
that are not games — robustness under input nothing was designed for, and better
evidence than any reference case, none of which tested garbage. Added as
reference case 7, along with the gap it exposed: unrecognised input and unrelated
input produce the same message.

**What I did not verify.**

- **The reference set has not been run against the deployed version.** That is
  step 8 and it is outstanding. Everything above says the deployment works; it
  does not yet say the deployment behaves as specified.
- Path B and reference case 6 — not built.
- Reference case 4 in its intended single-candidate form — still unrun.
- **There is no rate limiting.** The endpoint spends OpenRouter credit for
  anyone who finds the URL. `MAX_CALLS_PER_REQUEST` bounds one request; nothing
  bounds requests. The only real limit is the prepaid balance. Module 9 calls
  this the economic blast radius and this one is open on purpose, recorded rather
  than fixed.

## 7. Outcome

Path A works end to end at a public address, with an audit trail in a database.

**Open:** step 8; path B; the game database API, which brings screenshots,
autocomplete and title matching together; rate limiting.

### Corrections issued this turn

Six failures. **Every one appeared only outside local development, and the 37
checks passed through all of them.** That is the finding of this turn, and it is
worth more than any individual fix: green tests say nothing about a deployed
artifact until the deployed artifact has run.

**`netlify dev` ran the production build instead of a dev server.** The `dev`
script in `package.json` was set to `netlify dev`, so the tool looked for a dev
command, found itself, and fell back to `build`. Fixed by pointing `dev` at
`vite` and pinning the `[dev]` block in `netlify.toml` so nothing is auto-detected.

**`import.meta.url` was undefined in the deployed function.** Netlify bundles
these ES modules into CommonJS with esbuild, and `src/paths.js` called
`fileURLToPath(import.meta.url)` at the top level. It threw on load, before any
of its own fallbacks could run, and returned a 500 about `path` being undefined.
Now guarded, with `__dirname` as the fallback and the working directory as the
root that actually matches. The error message names every path tried.

**Ajv failed the same way.** It ships as CommonJS; imported into ESM directly
Node hands back the constructor, but bundled by esbuild the same import can
arrive as `{ default: Ajv }`. Fixed before it bit, then confirmed by the
`import.meta` failure sharing the mechanism. This is one category, not two bugs:
anything ESM-only behaves differently once bundled.

**`SUPABASE_URL` had `/rest/v1/` on the end**, producing `//rest/v1/` and
PostgREST's `PGRST125` — a 404 that reads like a missing table rather than a
malformed URL. The base URL is now normalised, and the error names the URL it
actually tried.

**Environment variables added to a live Netlify site do not apply until the next
deploy.** The OpenRouter key was set correctly and the function still returned
401, because the running deploy had been built without it. Nothing to fix in
code; worth knowing before spending an hour on a key that was fine.

**Netlify access protection covers `/api/*`, not only the page.** A private site
returns 401 for the function too, which looks identical to a rejected API key.

Two of these — the Supabase URL and the environment variables — cost time
because the symptom pointed somewhere other than the cause. `src/config.js` now
trims and unquotes secrets, and `src/store.js` normalises the URL. Both make
diagnosis better rather than correctness better, which is the honest description
of what they are.

### Open questions raised this turn, not answered

**Where the candidate set comes from once it is an API.** Recommendation quality
currently rests on `feel` lines written by hand, per decision 0002. An API
supplies titles, genres and marketing blurbs, not "the terrain itself is the main
antagonist". So a database of 100,000 games forces a choice: let the model write
the feel lines, reversing decision 0002, or match against the genre metadata this
project exists to avoid. This is the real design problem of turn 2.

**Autocomplete would be better than validating input afterwards.** Typing
"metroid" and picking from a list means unrecognised titles cannot be entered,
"Civ VI" and "Civilization VI" resolve to one entity, exclusion can match on id
rather than normalised text, and prompt injection through a game title largely
stops being an attack surface — which would change what criterion 13 means rather
than merely how it is tested.

**Commit to Play records only agreement.** It writes `accepted = true` and
nothing else, so the number counts only people who liked the answer. A second
button for "not for me" would make the ratio mean something, and would change
what `accepted = false` signifies. Not yet decided.
