# Turn 021 — the parts a marker sees, and four bugs in the browser

Date: 2026-09-14
Branch `main`. Still nothing deployed.

Written during the turn.

## 0. What kind of turn this was

Turns 019 and 020 were measurement: run the reference cases, fix what running
them exposed. This one is presentation and interface — the two files somebody
opens first, a page that shows how the thing is built, and a run of changes to
the recommendation card.

It is also the turn with the worst ratio of bugs introduced to features added,
and every one of them was in the browser, where this project's 292 checks cannot
see. That is section 6 and it is the part worth reading.

## 1. Intent

Six requests, in order:

1. Anything to remove from `.gitignore` so the evidence is visible?
2. Is there anything describing the architecture?
3. Write turn 008.
4. A check over the project before deploying.
5. An AI marker by the find button, "so people understand this uses AI".
6. The recommendation card's pictures: cover first, trailer second with a play
   badge, an option to open a picture full size, and a strip with no scrollbar.

## 2. Specification

`docs/spec.md` v3.1. Criterion 1 — a deployed address — is the one this turn
touches and does not satisfy. Criterion 12 governs the interface work: a failure
is shown as a failure, and polish must never make a refusal read as a weak
result. Nothing here changed a gate, a prompt or the pipeline.

## 3. Context supplied

`CLAUDE.md`, the specification, `docs/failures.md`, and — for the first time —
the running application, through screenshots. Four of this turn's six bugs were
found by the user looking at the page, not by anything in the repository.

## 4. Plan

None written. Six small requests handled in sequence, which is the same
deviation turn 018 recorded and the same reason: each was small enough to act on
directly, so the turn accumulated rather than being planned.

## 5. Execution — what was added

### Nothing needed removing from `.gitignore`

It lists `.env`, `node_modules/`, `dist/`, `web/dist/`, `.netlify/`,
`.DS_Store`. Every entry is a live secret or a build artifact. **The question
had the right instinct and the wrong target.**

What was actually hurting the evidence was two committed files that described a
product deleted at turn 005. `README.md` said the app "picks one title", named a
three-stage pipeline with a stage removed by decision 0003, told the reader to
run two deleted scripts, claimed 37 offline checks against 292, one HTTP endpoint
against seven, three prompts against one, and ended with **"Turn 1 complete."**
`.env.example` listed `RAWG_API_KEY` and neither `TWITCH_*` nor `ITAD_API_KEY`,
so anybody following it could not start the app.

Both rewritten from the code rather than from memory.

### There was no architecture document

The design existed across the specification, `CLAUDE.md` and eight decision
records. A reader could reconstruct the shape; nowhere could they see it.
`docs/architecture.md` now holds the request end to end, the nine gates against
their criteria, the module list, the trust boundaries, and a section on what the
architecture deliberately does not do. Two Mermaid diagrams, which GitHub renders
inline.

It also answers "why not RAG" — in one paragraph in the architecture, not as a
decision record. **RAG was never a fork in this project's road.** A decision
record for a decision nobody made is the same failure as a turn record written
after the fact.

### Turn 008 was not written, and that is the point

Asked for a turn 008 to fill the gap in the sequence. Refused: `CLAUDE.md`
requires records written during the turn, and a backdated record in a repository
graded on its record is worse than a skipped integer.

`git log --all --diff-filter=A -- "docs/turns/008*"` returns nothing — no file by
that name has ever been committed. Turn 007 closes "spiral turn 2, third of
three" and 009 opens "spiral turn 3", both dated 2026-09-11. **The number was
skipped, not the work.** The README now says so, because a gap in a numbered
sequence invites a question and the true answer is duller than the gap looks.

### The pre-deploy audit found two things

**The Node version was not pinned.** `package.json` said `engines: >=18`, a floor
rather than a choice, and `netlify.toml` set nothing — so the build inherited
whatever major Netlify defaults to that week. Pinned to 22. A runtime that
changes between deploys without anyone choosing it is not a variable to discover
with five build credits left.

**The live address had been dropped from the README** by my own rewrite, and
criterion 1 asks for a deployed address. Restored — then removed again at the
end of the turn, deliberately, for the reason in section 7.

Eleven things were checked and clean: all eight redirects resolve, every
request-time file read is covered by `included_files`, `src/paths.js` already
handles the ESM-to-CJS bundling trap with a message naming every path it tried,
no hardcoded secrets, nothing logging a key, no `VITE_` near a secret, RAWG
appears in `web/src` only in comments, both licence attributions present, every
function returns JSON on error, the front page degrades per row, and `acorn` is
unreachable from any bundled function.

### An AI marker, without a vendor logo

Asked for "the little gemini icon". Declined the logo for two reasons, and the
second is the one that matters: it is Google's trademark and implies a
partnership that does not exist, **and `OPENROUTER_MODEL` is an environment
variable precisely because model ids go stale.** A logo naming one model becomes
a false claim in the most visible place in the app the moment that variable
changes.

A generic sparkle glyph instead, by the submit button, with the meaning on hover
and in an `aria-label` since the user chose icon-only. Contrast checked rather
than assumed: 4.65:1 light, 5.87:1 dark, against WCAG's 3:1 for a non-text
graphic.

### The gallery

Cover art first, then the trailer, then screenshots — with a play badge on the
video tile. The trailer still comes from YouTube's own thumbnail for the video
id rather than a borrowed screenshot, because a screenshot wearing a play badge
promises a video of something it is not a frame of. The id is re-validated
against YouTube's alphabet on the way out of the embed URL even though the server
already checked it: that string starts at IGDB and is about to enter an
`<img src>`.

Box art is portrait in a 16:9 frame, so it sat between two dead slabs of
background. Filled with a blurred, darkened copy of the cover itself — the colour
comes from the artwork, nothing is cropped, and the frame never changes shape, so
the card does not jump when a thumbnail is clicked.

A lightbox opens any picture full size: native `<dialog>`, arrow keys, a counter,
Escape. Trailers do not zoom — their slide already has an action, and enlarging a
still of a video is the wrong answer to clicking it.

## 6. Four bugs, all mine, none visible to the suite

This is the turn's real content.

**1. The play button disappeared.** Adding the blurred fill made the frame a
stack, so the picture needed `z-index: 1` to paint over the wash. `.sheet-play`
was absolutely positioned with no `z-index` — which is `auto`, and `auto` loses
to `1`. The picture painted over the button, hiding it and taking its clicks.

> A stacking bug reports itself as "the button does nothing", which is exactly
> what a dead click handler reports. The first place I would have looked is the
> handler.

**2. The thumbnail outline looked misaligned.** It was not. Box art is portrait
in a 16:9 tile, so `contain` left transparent bars either side while
`.thumb.on`'s outline traced the **tile**. I had fixed exactly this in the big
frame one step earlier and had not carried it to the thumbnail.

**3. The outline was also clipped, and the strip had a scrollbar.** One cause:
`overflow-x: auto`. Nothing caps screenshots — a game can carry eighteen — so the
row ran off the side; and `overflow` clips at the element's box while the
selection outline is drawn 2px outside it. Replaced with a wrapping grid.
`auto-fill` rather than `auto-fit`, so tile size does not depend on how many
pictures a game happens to have.

**4. `useRef` was not imported.** Caught by reading, not by tooling —
`check-undefined.js` is blind to `web/src/*.jsx`, because acorn cannot parse JSX
without a plugin. **Turn 020 built that check after three identical crashes, and
it does not cover the directory where this turn had all four of its bugs.**

### The pattern

Four bugs, four found by the user looking at a screenshot. 292 checks saw none of
them, and could not have: they verify that declarations survive parsing and that
identifiers resolve, not that three positioned elements stack in the right order
or that an outline is inside its container.

`check-css.js` exists because turn 018 lost an animation to a broken comment. It
was the right response to that bug and it does not generalise: **the browser
layer needs a rendered page, and the only thing rendering pages in this project
is the user.** That gap has now produced five bugs across two turns.

## 7. Removing the live address, deliberately

Put back during the audit, then taken out again at the user's request once the
exposure was clear: the repository is public, the endpoints have no rate
limiting, and each shortlist spends real credit. Publishing the URL in the file
every visitor opens is publishing a way to spend somebody else's money.

**Said plainly in the README rather than deleted silently**, so a marker looking
for the address gets an answer rather than an absence.

**It reduces visibility and not exposure.** The URL remains in
`docs/turns/003-database-interface-deploy.md`, which recorded the first deploy,
and in `tests/results-turn-1.md`, which ran against that site. Those are
historical records and are not edited — a record of a design that no longer
exists is still a true record. It is also in the git history permanently, because
it has already been pushed to a public repository. Removing it from `HEAD` does
not unpublish it.

**The only real bound is a spend cap on the OpenRouter key**, which is a field in
their dashboard and costs nothing. That is the recommendation; rate limiting
stays unbuilt and recorded, rather than half-solved by obscurity.

## 8. Verification

| Criterion | Method | Result |
|---|---|---|
| 12 — a failure still reads as a failure | nothing in the failure path touched | unchanged |
| the marker is visible | contrast computed, both themes | 4.65:1 and 5.87:1 |
| classes exist on both sides | every new class grepped against the stylesheet | all matched |
| the frame's stacking | z-index read back out of the file | 0 wash, 1 picture, 2 button |
| two overlays never collide | render conditions compared | mutually exclusive |
| every README path | existence-checked against the tree | all present |
| `.env.example` completeness | diffed against every `required()` in the code | all ten named |
| the redirect table | each target matched to a function file | all eight |
| suite | 292 checks, eleven suites, plus the scan | pass |

**What I did not verify:**

- **Nothing is deployed.** Sixteen turns running.
- **No rendered page was checked by me.** Every visual claim in this turn came
  from the user's screenshots or from arithmetic. I have not seen this interface.
- **The trailer still's aspect ratio is a belief, not a measurement.**
  `img.youtube.com` is unreachable from the environment this was written in. The
  comment in `styles.css` says so rather than claiming otherwise — a first draft
  of it claimed "measured by looking at the file", which was false and was caught
  before it shipped.
- **`web/src/*.jsx` has no static analysis at all.**
- **Seven of nine reference cases remain unrun**, case 4 among them.

## 9. Outcome

The two entry points now describe the product that exists. There is a page that
shows how it is built. The recommendation card presents a game the way a store
page does, and a picture can be opened full size.

The turn's honest summary is less flattering than that: a presentation turn
introduced four bugs in a layer nothing in this repository can check, and the
user found all four by looking.

### Corrections issued this turn

**A gap in a sequence is answered, not filled.** Writing turn 008 after the fact
would have been fabricating evidence in a project graded on its record.

**A stacking bug and a dead handler report identically.** Both present as "the
button does nothing".

**A fix applied to one element is not applied to its twin.** The cover was fixed
in the frame and not in the thumbnail, one step apart, by the same author.

**Removing something from `HEAD` does not unpublish it.** Obscurity is not a
bound; a spend cap is.

All four are drafted for `docs/failures.md` below, **awaiting the user's
go-ahead**, since `docs/` outside `docs/turns/` is his.

### Open, carried forward

- **The deploy.** Six environment variables before the build, and a spend cap on
  the OpenRouter key before the address is shared.
- Reference cases 1, 2, 3, 4, 7, 8, 9.
- No rate limiting on three endpoints — recorded, not built, by decision.
- `web/src/*.jsx` is outside every check in this project.
- `src/catalogue.js` and the RAWG vocabularies go once the IGDB build is deployed
  and proven.

## 10. Proposed additions to `docs/failures.md` — awaiting approval

> * **A gap in the record is answered, not filled.** Asked to write the missing
>   turn 008, the right move was to establish that no such file had ever been
>   committed and say so in the README. A backdated record in a repository graded
>   on its record is worse than a skipped integer. (Turn 021)
> * **A stacking bug and a dead click handler report identically.** Adding a
>   `z-index` to a picture put it over a button that had none, hiding the control
>   and swallowing its clicks. Nothing threw, the layout was fine, and the symptom
>   was "the button does nothing" — which sends you to the handler. When a control
>   stops working after a purely visual change, check the stack before the code.
>   (Turn 021)
> * **A fix applied to one element is not applied to its twin.** Box art was
>   letterboxed in both the frame and the thumbnail; the frame was fixed and the
>   thumbnail was not, one step apart, by the same author. After fixing a shape
>   problem, grep for every other place that shape appears. (Turn 021)
> * **Removing something from HEAD does not unpublish it.** A URL taken out of
>   the README remained in two turn records and in the git history of a public
>   repository. Obscurity is not a bound. Where the risk is spend, the bound is a
>   spend cap. (Turn 021)
