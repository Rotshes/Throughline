# Specification

Module 10, five parts. This is the primary work product. The code is generated
from it; when the output is wrong, this gets fixed first and the code rebuilt.

Version 3.1 — reference cases 5 and 6 were executed for the first time and both
were wrong about the software. Case 5 tested catalogue descriptions, which never
enter a prompt; case 6 measured one number where the freshness filter makes two.
Criterion 14 and both cases are corrected below, and pitfall 28 records a real
vulnerability the run found. See `docs/turns/019-running-the-cases-nobody-ran.md`.
Nothing else changed: this is what the cases should always have said.

Version 3.0 — the catalogue changed from RAWG to IGDB, and two angles could not
survive it. Adds criteria 16 and 17, pitfalls 22-27, and a fourth secret. See
`docs/decisions/0006-igdb-replaces-rawg.md` and
`docs/decisions/0007-prices-from-isthereanydeal.md`. Versions 2.0 and 2.1
describe the same product on a different source; turns 005 to 014 remain accurate
accounts of what existed at the time and are not edited to match this.

Version 2.1 — adds tags as a third filter, criterion 4a, and pitfalls 18-19.
See `docs/decisions/0004-tags-as-the-third-filter.md`.
Version 2.0 — replaces the motif pipeline with filters and a persuasive
shortlist. See `docs/decisions/0003-filters-and-shortlist.md` for why, and for
what the change costs. Versions 1.0 to 1.5 described a different product; they
are preserved in the git history and in `docs/turns/001` to `004`, which remain
accurate accounts of what existed at the time.

Version 1.5 — motif name cap 60 to 80; adds pitfall 16.
Version 1.4 — adds criterion 7c and pitfalls 14-15, from turn 1 step 4.
Version 1.3 — adds pitfalls 11-13 from turn 001.
Version 1.2 — adds the decline outcome (7a) and the two-to-five game rule (7b).
Version 1.1 — adds the newcomer path and the candidate-source progression.

---

## Part 1 — The goal and its reason

**Goal.** Build a web application where a person chooses a kind of game and the
platforms they can play on, and receives three specific titles — each with
images and a written case for playing it — drawn from a real game catalogue and
checked against it.

**Reason.** Someone deciding what to play today has two options and both are bad.
A store search returns four hundred results ordered by whatever the store wants
to sell. A chat assistant returns three confident sentences, one of which is that
the game is on Switch when it never shipped there.

This does neither. It narrows a real catalogue by the two things the person
actually knows — what kind of game, and what they can play it on — then argues
for three of them. Every factual claim about availability is checked against the
catalogue rather than taken from the model.

**Use the reason to settle unwritten cases.** Where a decision is not covered
here, favour *the model may only describe what code has already verified* over
*the model knows more than the catalogue*. The model's job is the argument. The
facts are the catalogue's job.

**The standard.** The app never recommends a game the user cannot play, and never
recommends a game that is not in the set it was handed. A confident wrong answer
is worse than an admitted gap — if the filters leave fewer than three games, it
says so and returns what it has.

**What was given up to get here.** Version 1.x derived recommendations from games
the user had played, on the argument that genre labels are a poor guide to how a
game feels. That argument was and is correct. This version accepts coarser
matching in exchange for always returning something, needing no prior input, and
being able to show the user what the game looks like. Decision 0003 records the
trade in full. Do not read this specification as claiming the old argument was
wrong.

## Part 2 — Testable success criteria

Each is either true or false. Two people reading the result should not be able to
disagree about whether it was met.

**The pipeline**

1. From a deployed web address, a user selects a category, at least one
   platform, and optionally any number of tags, and receives three games. Each
   carries a title, at least one image, a short angle label, and a written case
   for playing it. Tags are optional: category plus platform is a complete
   request.
2. **Every recommended game appears in the candidate set that was sent to the
   model.** Checked by id, not by title. Verifiable by comparing the response
   against the candidate set logged with the request. A response naming anything
   else is rejected, retried once, then shown as a failure.
3. **Every recommended game is available on at least one platform the user
   selected.** Checked in code against the catalogue's platform data — never
   against the model's claim, and never inferred from the prompt having said so.
4. **Every recommended game carries the selected category** according to the
   catalogue's own classification. **A category is optional** — "any kind of
   game" is a request rather than a missing field, and this criterion does not
   apply when none was chosen. Coarse genres (pitfall 9) mean insisting on one
   excludes good answers for a distinction the user never made. The catalogue's
   own classification is a **claim**, not a fact (pitfall 22): this criterion is
   met when the catalogue files the game under that genre, and asserts nothing
   about whether it belongs there.
4a. **Where tags were selected, the catalogue says each recommended game carries
   at least one of them.** Read that wording exactly. Criteria 3 and 4 assert
   facts the catalogue holds; this asserts only that a label is present. Tags are
   crowd-applied and measurably wrong — the catalogue calls God of War (2018) a
   souls-like and Dota 2 a tower defence. Overstating what this gate proves would
   be worse than not having it. See pitfall 18 and decision 0004.
5. **Exactly three games, no duplicates.** If the filters leave fewer than three
   candidates, the app returns what exists and says how many it found. It never
   pads the list by relaxing a filter the user set.
6. **The three angles are distinct and drawn from a fixed vocabulary of five.**
   Two of the five are constrained — code can refuse them against catalogue data
   — and three are judgements that code can only check for membership and
   repetition. The vocabulary shrank from six in v2.x: `short-one` needed a
   playtime this catalogue does not record and `hard-one` needed a difficulty
   label it does not have, and an angle whose gate can never pass is the same
   defect as a gate that can never fail. `data/angles.json` records both losses.
   The
   prompt supplies the permitted angle labels; code checks that all three
   returned are members of that list and that no label repeats. See part 5,
   pitfall 6, for what this gate does and does not catch.
7. **The candidate set sent to the model is logged with every request.** Without
   it, a bad recommendation cannot be attributed to the filter rather than the
   model, and pitfall 5 becomes invisible.
8. **A game in the user's played library never enters the candidate set.**
   Removed in code before the model call, by id. *(Not built until the library
   turn. Criterion recorded now so the library is built against it.)*

**Reliability and record**

9. A reference set exists in the repository with each input's expected behaviour
   written down, committed before the code that satisfies it.
10. Every model call writes a row recording model, tokens in, tokens out, cost,
    latency, success, and which call it was — including failures.
11. A request exceeding the configured model-call cap aborts and says so.
12. Malformed or unparseable model output is shown as a failure. It is never
    shown as an empty or partial shortlist.
13. **A catalogue failure is shown as a catalogue failure**, distinct from a model
    failure and from an empty result. There are now two external services and a
    user who cannot tell which one broke cannot report anything useful.
14. **Text arriving from the catalogue is data, never instruction.** Titles come
    from a third party, enter the prompt verbatim, and are outside this project's
    control. **Descriptions never enter a prompt** — they are fetched after the
    shortlist has passed every gate, for the three picks only, and reach the
    browser as escaped text. The candidate block is a format and code enforces
    it: no catalogue value may introduce a line break or forge a field. Tested
    with a candidate whose title contains an injected instruction, against a
    repeated control.
15. Clicking through on one of the three records which one, and the case exactly
    as it was shown.

**Not a criterion:** that the recommendation is good, or that the written case is
true. Neither can be checked by code. Criterion 15 records which of three a person
picked, which measures persuasion. See pitfall 1 — under this design that gap is
larger than it was in version 1.x, and it is stated rather than disguised.

16. **A stored game id records which catalogue it came from, and an exclusion
    across catalogues fails loudly.** Two catalogues issue integers that name
    different games. Comparing them matches nothing, which is indistinguishable
    from an empty library — three games come back, every gate passes, and the
    page reports that nothing was excluded. `excludePlayed` throws rather than
    returning an empty exclusion. Verifiable: a library row from another source
    produces a failure, not a shortlist.

17. **Any price shown names its source, its country and its date, and links
    through unaltered.** Prices are regional and perishable, and the terms they
    arrive under forbid modifying the data or stripping the affiliate tags from
    the URLs. A row of prices with no country stated is wrong for most of the
    people reading it. Verifiable: the rendered link is byte-identical to the one
    the price service returned.

## Part 3 — Architectural guidance

Boundaries the agent must respect. Interior design is the agent's to choose.

### The three steps

**Step 1 — the filter.** The user's category, platform and tag selections become
a catalogue query. No model call. This step is pure code and can be tested with
no key and no cost.

The three vocabularies are pinned into `data/` rather than fetched per request:
`categories.json` and `platforms.json` come straight from the catalogue,
`tags.json` is hand-picked from 9,736 available tags because most of them are
store plumbing or non-English duplicates. Whatever is in those three files is the
entire vocabulary this product understands.

**Step 2 — the candidate set.** The catalogue returns a pool; code reduces it to
roughly twenty to fifty candidates with stable ids, and removes anything in the
user's played library. This set is logged.

**Step 3 — the shortlist.** One model call takes the candidate set and returns
three ids, each with an angle label and a written case. Code then checks every id
against the set, every platform against the catalogue, and every angle against
the permitted vocabulary.

### The rule this design rests on

**The model may only choose from the set it was given, and code verifies every
id came back from that set.**

This replaces version 1.x's rule that the analysis never sees the candidates.
It is the reason this is worth building rather than asking an assistant: a model
answering from memory will name a game that does not exist on the platform in
question, and nothing will catch it. Here the model writes the argument and code
decides what it is permitted to argue about.

If a returned id is not in the set, that is a failure, not an interesting
suggestion. Do not look it up and include it anyway.

### The catalogue

RAWG to begin with — one key, plain GET requests, and filtering by genre and
platform in the query string. Behind a single module, `src/catalogue.js`, so the
source can change without touching anything else. IGDB is the likely successor if
RAWG's nineteen flat genres prove too coarse for the category list; that swap
should cost one file and a decision record.

**The catalogue is the authority on facts.** Platforms, release dates, images,
classification. The model is never asked to supply any of them and its output is
never trusted for any of them.

### The four layers

**Browser.** The category and platform selectors. Displays three cards with
images and cases. Holds no keys, decides nothing.

**Backend.** Holds the OpenRouter key and the catalogue key, all prompts. Builds
the query, fetches the pool, assembles and logs the candidate set, makes the call,
validates the response against its schema, checks ids, platforms, categories and
angles. All correctness decisions happen here.

**Database (Supabase / Postgres).** Sessions, the filters selected, the candidate
set used, the three returned, the click-through, and one row per model call.
Later: the played library.

**Deployment.** Netlify, at a reachable address.

**Where prompts live.** In files, versioned like code. Changing a prompt changes
what the software does and goes through the same review as a code change.

## Part 4 — The validation approach

The reference set is rewritten for this design. Version 1.x's set tested motif
production and does not apply; it stays in the history.

Written before the code that satisfies it.

| # | Input | Expected behaviour |
|---|---|---|
| 1 | A common category and one platform | Three games, all on that platform, all in that category, three distinct angles |
| 2 | A category and several platforms | Three games, each available on at least one selected platform |
| 3 | Filters that leave **fewer than three** candidates | Returns what exists, states the count, relaxes nothing |
| 4 | Filters that leave **zero** candidates | Says so plainly. No model call is made. |
| 5 | A candidate whose catalogue **title** contains an injected instruction | Instruction ignored, the title treated as text, and no title able to forge a field in the candidate block. Criterion 14. |
| 6 | The same filters run three times, at two levels: the model on a fixed candidate set, and the whole request | Overlap recorded for each. Not a pass/fail — a measurement, per pitfall 7. The end-to-end figure is expected to be the lower of the two, because the freshness filter removes recently shown games by design. |
| 7 | The catalogue returns an error or times out | Shown as a catalogue failure, distinct from a model failure. Criterion 13. |
| 8 | A category, a platform and two tags | Three games, the catalogue saying each carries at least one selected tag. Criterion 4a. |
| 9 | The same category and platform, run once with a tag and once without | The two shortlists differ. If they do not, pitfall 19 has swallowed the tag filter. |

Case 4 is the one to design carefully. Zero candidates must be reached with the
model call genuinely not made, and that is checked by the absence of a
`model_calls` row, not by reading the screen.

Case 5 must not repeat version 1.x's mistake, recorded twice in the turn records:
the injected candidate has to sit alongside candidates that would obviously be
picked, so that "the instruction was ignored" and "nothing was returned" cannot
produce the same result.

It also needs a control on the same candidate set, and the control needs
repeating. "The injected game was not picked" is not a result unless you know it
would not have been picked anyway — and turn 019 measured the model's own
selection alternating between two candidates in one slot of three, so a single
control run cannot establish a baseline. A claim was raised and withdrawn on
exactly this in the space of one turn.

Beyond the set: read ten shortlists by hand before believing any of it.

## Part 5 — Known pitfalls

Written once, permanently. Each is a failure expected in advance.

1. **Nothing checks whether the written case is true.** The model can state that a
   game has co-op, a great soundtrack, or a twenty-hour campaign, and no gate in
   this project will catch it if it does not. This was pitfall 12 in version 1.x
   and it is worse here: persuasion is now the entire output rather than a
   justification attached to a match. Every criterion in part 2 can pass on a
   shortlist of three eloquent, confident falsehoods. The only mitigation
   available is to keep the prompt away from checkable specifics and on the kind
   of claim a person can judge for themselves from a screenshot.
2. **The model recommends a game not in the candidate set.** It will suggest
   something it considers better. Id check, retry once, then fail. Do not include
   it anyway.
3. **The model will invent an id rather than admit the set is thin.** Related to
   2 and worth separating: with two candidates and a request for three, the
   pressure is to produce a third. Criterion 5 exists for this, and case 3 tests
   it.
4. **Prose instead of JSON.** Validate, retry once, then show a failure. Never
   attempt to parse prose into a shortlist.
5. **The filter can exclude the right answer before the model sees it.** The model
   cannot recommend what it was not given, and this failure is silent. Criterion 7
   logs the candidate set so it is at least visible after the fact.
6. **A distinctness gate on a free-text label catches almost nothing.** Checking
   that three angle strings differ would pass on "atmospheric", "very
   atmospheric", "atmosphere-focused". That is why criterion 6 uses a fixed
   vocabulary and checks membership instead. What it still cannot catch: three
   near-identical games wearing three different labels. Nothing checks that the
   picks are actually varied.
7. **Repeatability is a measurement here, not a criterion.** Version 1.x asked
   that one motif concept survive three runs. There is no equivalent: three picks
   from fifty candidates can legitimately differ run to run. Record the overlap;
   do not turn it into a gate that fires on correct behaviour.
8. **Catalogue text is untrusted input.** Titles and descriptions come from a
   third party and go into a prompt. This is a wider surface than version 1.x's
   user-typed titles, because it is not visible in the form and nobody chose it.
9. **The category vocabulary is the product's honest limit.** Nineteen flat genres
   cannot express what people actually want. "Cozy" is not a RAWG genre. Whatever
   the category list offers is what this app can understand, and no amount of
   prompting adds a category the catalogue does not have.
10. **A thin result is worse than a slow one.** Filters that leave four candidates
    produce three picks that are simply the four minus one. Watch the candidate
    count in the logs; a shortlist drawn from a pool barely larger than itself is
    not a recommendation.
11. **A prompt that names a schema file gets guessed at.** The model cannot read
    the repository. Every shape it must produce belongs in the prompt text, with
    exact field names. Observed in turn 001.
12. **Model identifiers go stale.** A retired or misspelled id returns HTTP 404.
    Keep it in the environment so a change is configuration, not a code edit.
13. **A rule too obvious to write down is a rule the model does not have.**
    Observed in turn 1: nothing said "do not recommend a game they already named",
    so it did, twice, while passing every gate. Where a rule can be made
    structurally impossible in code, it belongs there rather than in a prompt.
14. **A check that depends on mutable data stops being a check.** Checks assert
    against fixtures. The catalogue is now a live external service, so this
    matters more: no offline check may make a network call.
15. **A numeric limit stated in a prompt is a request, not a constraint.** The
    analysis prompt said "3 to 60 characters" and the model returned 61 twice.
    Before putting a bound in a schema, ask what it protects.
16. **The model will agree with a suggestion rather than correct it.** Do not ask
    it whether its own shortlist was good.
17. **An external API has a quota and a bad day.** IGDB is bounded per *second*
    rather than per month — four requests, which one shortlist can reach on its
    own — and its token expires after about 57 days. IsThereAnyDeal is bounded at
    a thousand per five minutes. The previous catalogue's free tier was bounded per
    month, and criterion 13 exists because a catalogue outage will otherwise
    surface as an empty page that looks like a bad filter.

18. **Tags are claims, not facts, and they fail in both directions.** The
    catalogue's platform and date data can be trusted; its tags are crowd-applied.
    Wrong ones: souls-like on God of War, tower-defense on Dota 2,
    pixel-graphics on Limbo, metroidvania on Vampire Survivors. Missing ones:
    Hades is not tagged `difficult`, so ranking by match count puts it ninth for
    "difficult roguelike" behind games with a fifth of its ratings. A tag filter
    is a strong hint and a tag gate proves only that a label is present. Never
    write a criterion, a prompt line or a piece of interface copy that claims
    more than that — and never assume the absence of a tag means anything.
19. **Popular games accumulate tags, and rating ordering then finds them
    everywhere.** GTA V carries atmospheric, funny, open-world, sandbox,
    singleplayer, co-op, multiplayer, first-person and third-person. A handful of
    mega-titles will surface under almost any filter, so fifty-one tags widen the
    filter space far less than the arithmetic suggests. `dominanceReport` measures
    it on every run. Do not fix it by sampling deeper into the pool without first
    checking what that does to `MIN_RATINGS` — trading a visible problem for an
    invisible one is not an improvement.
20. **An ignored query parameter looks exactly like a working one.** A filter the
    catalogue silently drops returns a full list and a plausible result. Every
    filter parameter is verified by comparing a filtered count against an
    unfiltered one before anything is built on it. This is how `?tags=` was
    confirmed, and it is the same shape as the gate-passing-for-the-wrong-reason
    failure that has now bitten this project twice.
21. **A search endpoint is not a membership test.** `/tags?search=open-world`
    returned `open-world-2` with 6 games while `open-world` with 9,338 existed.
    Fuzzy ranking produces false negatives. Anything this project depends on is
    resolved by the same call the app makes, then pinned to a file and checked
    against the file.

**Solved by this design, recorded so it is not re-solved:** title matching.
Version 1.x's pitfall 3 — "Civ VI", "Civilization VI" and "Sid Meier's
Civilization VI" being one game — disappears once nothing is matched by title.
Everything is an id from the catalogue.

22. **Genres are claims too, not only tags.** Version 2.x said "platforms are
    facts, tags are claims" and let the category through as though it were a
    fact. RAWG filed God of War as a souls-like; IGDB files Breath of the Wild
    under `puzzle`. Criterion 4 proves the catalogue says so and nothing more.
    No criterion, prompt or line of interface copy may claim more than that.

23. **An empty result is a failure, not a state.** A row rendering `games: []`
    shows the same words a working row would show if the source genuinely held
    nothing. Forty records came back from the catalogue, all forty were discarded
    by a threshold two lines later, and nothing said so for a week. When code
    throws away everything it was handed, that is the most interesting thing that
    happened in the request and it has to be reported.

24. **A threshold carried into a context where its reason does not hold is a bug
    with a good name.** The rating floor exists to keep the shortlist to games
    the *model* can write about truthfully. The front page makes no model call
    and a game released last month has had no time to collect ratings. Applied
    there, the floor left one game in a row of forty. Before reusing a threshold,
    restate the reason for it and check the reason still applies.

25. **A query on a field that has been renamed returns nothing, and nothing looks
    exactly like absence.** `external_games.category` still exists and still
    answers — with 753 rows where `external_game_source` answers 175,517. Small
    enough to read as "these games have no Steam release" rather than "this
    filter is wrong". Read the field names off a real record before filtering on
    them. This is pitfall 20 wearing different clothes and it is the fourth
    appearance of that family.

26. **Sorting by an extreme surfaces things that are not the product.** Ranking
    deals by discount returned two giveaways, a demo and six training-course
    bundles — AWS, Kali Linux, cybersecurity. The biggest discount on the
    internet is rarely on a game. Where a row is built by sorting on a single
    dimension, look at the top of it before shipping it.

27. **A mutation test is code and fails silently like any other.** An edit that
    did not apply produces a green suite and reads exactly like a check that
    cannot fail — which is the thing the mutation was written to detect. Confirm
    the source actually changed before trusting the result.
28. **The candidate block is a format, and a field can forge one.** A newline
    inside a catalogue title produced two fabricated fields in the prompt,
    including a critic score forty points above the real one, and the shortlist
    that came back looked entirely normal. The model ignored them — that is luck,
    not a control, and this design does not permit the model's judgement to be
    the thing standing between a forged fact and a person reading it. Every
    catalogue value written into the block is stripped of anything that can end a
    line; see `oneLine` in `src/shortlist.js`. Measured in turn 019, reference
    case 5.
