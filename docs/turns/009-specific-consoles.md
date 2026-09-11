# Turn 009 — specific consoles

Date: 2026-09-11
Spiral turn 3. Local only; nothing deployed, no Netlify credit spent.

**How the agent was directed.** Claude via the desktop app, with read and write
access to this repository folder. Every live command was run by hand on the
Windows machine and its output read back; the agent holds no key.

## 1. Intent

Let someone say which console they actually own.

"PlayStation" is how a person describes their shelf, but it is not what they can
play. Someone with a PS5 was being offered PS2 games, and someone with a PS2 was
being offered God of War Ragnarök.

## 2. Specification

`docs/spec.md` v2.1, criteria 1, 3 and 5. Criterion 3 is the one that changes
meaning: "available on at least one platform the user selected" has to mean the
machine when a machine was named, or the feature is a filter with no gate behind
it.

## 3. Context supplied

The specification, `CLAUDE.md`, decision 0004 on how tag parameters combine, and
turns 005–008.

## 4. Plan

1. Measure how the catalogue combines several machine ids before building on it.
2. Pin the platform tree, families with their machines.
3. Two query parameters, never both in one request.
4. Make the gate follow whichever granularity was asked for.
5. Say plainly in the interface that naming a console is a narrow request.

## 5. Execution

`/platforms/lists/parents` returns the children inline, so the whole tree is one
request: **14 families, 51 machines**.

**Two parameters, never together.** `parent_platforms` takes family ids —
2 is every PlayStation ever made — and `platforms` takes machine ids, where 187
is a PS5 and nothing else. Sending both would raise a question this project has
not measured: whether the catalogue ANDs or ORs them. Tags turned out to be OR
when every reader expects AND (decision 0004), so no second interaction gets
assumed. Naming any machine resolves the whole request to machine ids — a
selected family becomes its children — and one parameter goes out.

**The gate follows the granularity.** `checkShortlist` tests `candidate.machines`
when machines were named and `candidate.platforms` otherwise. Without that, a
PS4-only game would satisfy a request for PS5 and the feature would narrow the
filter while the check stayed where it was.

**The interface** gives each family a chip and a `▸`. The chip means the whole
family; expanding and picking a console means that machine only, and the two
clear each other. Selecting a console shows a line saying so, and a thin or empty
result now advises widening to the family rather than giving generic advice.

## 6. Verification

**101 offline checks** — 52 catalogue, 49 shortlist. Nine are new, including one
asserting that a PS3-only game *still passes* a request for "PlayStation", so
narrowing the check cannot silently break every request that named no console.

**Measured before building, three requests:**

| filter | games |
|---|---|
| `platforms=187` (PS5) | 1,373 |
| `platforms=187,18` (+ PS4) | 6,740 |
| `parent_platforms=2` (all PlayStation) | 14,703 |

Machine ids combine with **OR**, as tags do. The family holding far more than any
two of its machines is the sanity check that the two parameters mean what this
code assumes; had it held fewer, the assumption would have been wrong.

**Live, `action` on each granularity:**

- `playstation5` — 885 games in the catalogue, 24 candidates, **0 off-platform,
  0 off-category**. Every pick carries `playstation5` in its machine list.
  *Astro's Playroom* comes back with that one machine and no other, which is the
  case the whole feature exists for.
- `playstation` — 6,655 games, 24 candidates, same zero violations.

### Corrections issued this turn

**An assumption about someone else's ordering.** `fetchParentPlatforms` reversed
the catalogue's child order, on the belief that it listed oldest first. It does
not. The reverse put PSP at the head of PlayStation and left the Switch
thirteenth of thirteen under Nintendo — the two machines most people actually
own, buried. Caught by reading the pinned output rather than by any check; no
test could have failed, because the code did exactly what it was told.

**A stale file that looked exactly like a fresh one.** The first run after the
fix produced output identical to the run before it, down to the request counts.
The temptation was to conclude the fix had not worked and go looking in the code.
`CLAUDE.md` has carried "a stale result looks exactly like a fresh one" since
turn 001, and the check it implies took two commands: grep the source for
`.reverse()` (absent) and read the first Nintendo entry in the pinned file (NES).
The source was right and the artifact was old.

Both of these are the same shape. Neither was a bug in logic, and neither would
have been found by a test. One was an unverified belief about an external
service, the other an unverified belief about what was on disk.

## 7. Outcome

Someone can now ask for games on the console in front of them, and the check that
guarantees it is the machine list rather than the family.

### What I did not verify

- **The interface has not been exercised with this.** Every claim above comes
  from the command line and the offline checks. The expander, the
  family-clears-machine behaviour and the narrowed messaging have not been
  clicked.
- **Nothing is deployed**, and no gate has yet fired on live data across turns
  006–009.
- **Whether a mixed request behaves sensibly.** Selecting "PC" and a PS5 resolves
  to PC's children plus 187, which should be right, and has not been run.
- **Xbox's order is odd** — Xbox One before Xbox Series S/X. That is the
  catalogue's own ordering and it was left alone rather than hand-sorted, because
  hand-sorting is another assumption about data this project does not own.

### Open questions raised this turn, not answered

**Console selection makes thin pools much more likely**, which was known before
building it and is now real: a narrow category plus two tags plus one machine
will return nothing often. The interface warns and the result explains, but
nothing has been done about the underlying cause. That remains the open question
from turn 007.

**Five families are hidden from the interface** — Atari, SEGA, 3DO, Neo Geo,
Commodore/Amiga — on the grounds that they make the form longer and the results
emptier. That is a product judgement made in code, and someone who wants a
Dreamcast game cannot ask for one.
