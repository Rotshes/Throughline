# Turn 010 — mixed platform selections

Date: 2026-09-11 to 2026-09-12
Local only; nothing deployed, no Netlify credit spent.

> **This record was written retrospectively, on 2026-09-13.** `CLAUDE.md` says a
> turn record is written during the turn and never reconstructed afterwards, and
> this one breaks that rule. It is marked rather than disguised: the sequence of
> events is from the session transcript and the diffs, and anything that depends
> on what was in my head at the time is omitted rather than invented. Turns 010
> to 016 all carry this notice. That gap is itself the most useful thing in them.
>
> There is no `008-*.md`. Turn 009 cites "turns 005–008" as context, so a turn 008
> happened; no record of it exists and this turn does not invent one.

**How the agent was directed.** Claude via the desktop app, writing into this
repository folder through the device bridge. Every live command was run by hand
on the Windows machine and its output pasted back; the agent holds no key.

## 1. Intent

Close the open question turn 009 left: *"Whether a mixed request behaves
sensibly. Selecting PC and a PS5 resolves to PC's children plus 187, which
should be right, and has not been run."*

It was not right. It was wrong twice, in two different ways, and both reached
the browser.

## 2. Specification

`docs/spec.md` v2.1, criterion 3. Unchanged from turn 009 — the criterion was
already correct, and the code did not implement it.

## 3. Context supplied

The specification, `CLAUDE.md`, turn 009 including its open questions, and the
screenshots showing the failures.

## 4. Plan

Written after the first failure rather than before the turn, which is itself a
departure: this turn began as a bug report, not as a plan.

1. Find why a mixed selection rejects every possible answer.
2. Derive the query and the gate from one list rather than two.
3. When that does not fix it, find out why.

## 5. Execution

**First failure: PC plus a Game Boy Advance returned nothing at all.** The query
expanded PC into its children and asked for PC-or-GBA games; the gate demanded
GBA alone. Every possible answer was rejected. The gate was right and the request
was impossible.

This is the first time a gate fired on live data and caught a real defect in this
project's own code — a thing worth recording, because the argument for gates is
that they eventually do this.

**The fix was to derive both from one list.** A filter and the check on its
result are the same statement said twice, so they are now computed once.

**Second failure, after the fix: Nintendo plus a Game Boy Advance returned
Breath of the Wild.** One source stops a disagreement. It does not make the
source correct. The single list was built by a rule written for the previous
interface, where picking a console *deselected* its family — a model that no
longer existed after turn 009's expander.

**Extracted to `src/platforms.js` with 14 offline checks.** The logic had been
wrong twice with no test coverage at all, because it lived inside the Netlify
handler where nothing offline could reach it.

**The interface was reworked as well.** The `▸` expander from turn 009 was
replaced: consoles now appear for a family once that family is chosen, rather
than behind a control small enough to miss. The selection is said back in
words — "Searching PlayStation 5, Game Boy Advance" — because reading "1" on a
collapsed Nintendo chip was not enough to notice the bug that produced it.

Files: `src/platforms.js` (new), `scripts/check-platforms.js` (new),
`netlify/functions/shortlist.js`, `web/src/App.jsx`, `web/src/styles.css`.

## 6. Verification

| Criterion | Method | Result |
|---|---|---|
| 3 — platform | 14 offline checks on `resolvePlatforms` | pass |
| 3 — platform | PC + GBA, live | candidates returned, all on one of the two |
| 3 — platform | Nintendo + GBA, live | GBA games only; no Switch titles |
| 1, 5 | existing suites still green | 115 checks |

**What I did not verify:** every combination of the nine families. Three were
run by hand. The checks cover the resolution rule rather than the catalogue's
response to each pairing.

## 7. Outcome

Platform resolution is pure, exported, and covered. It has not been wrong since.

### Corrections issued this turn

**A single source of truth is not the same as a correct one.** Both failures
looked identical from the outside — a request that returned the wrong games — and
the first fix was aimed at the symptom the second shared. Deriving two things
from one list removes the possibility that they disagree; it says nothing about
whether the list is right.

**Logic that cannot be reached by an offline check will eventually be wrong.**
This code lived in a Netlify handler for two turns and was wrong for both of
them. Moving it to `src/` was not tidying; it was the only way to test it.

Neither of these reached `CLAUDE.md` at the time. The first belongs there and is
added in turn 016's documentation pass.

### Open questions raised this turn, not answered

**The interface still had not been exercised** — turn 009's first unverified
item was only partly closed here, by the two screenshots the user sent.
