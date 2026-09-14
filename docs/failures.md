# Failures seen before

One line each, added as they happen. Written once, permanently. These stay even
where the code they refer to is gone — the lesson outlived the design.

**Read this before writing code.** It was part of `CLAUDE.md` until turn 016,
when that file passed 250 lines against the 200 the course asks for. Nothing was
cut; it moved. This is where most of the value in that file was.

* **A prompt cannot reference a file the model cannot read.** All three v1
  prompts said "conforming to `schemas/motifs.schema.json`" and the model guessed
  the shape wrong. Any shape a model must produce goes in the prompt text in
  full, with the exact field names and the keys that will be rejected. (Turn 001)
* **Model identifiers go stale.** A retired or misspelled id returns HTTP 404
  "no endpoints found". The id lives in the environment, never in code. Current
  list: https://openrouter.ai/api/v1/models (Turn 001)
* **A gate can pass for the wrong reason.** The injection test paired the
  malicious title with one unrelated game, so a null result was correct whether
  or not the instruction was resisted. Before trusting a gate, ask what result
  would look like a pass while the thing being tested had failed. (Turn 001)
* **Writing that rule down did not make it apply.** The same case was rewritten
  to fix exactly that flaw, kept the shape that caused it, and failed the same
  way in production four turns later. A rule in this file is a prompt for a
  check, not the check. (Turn 004)
* **A stale result looks exactly like a fresh one.** A repeated run was caught
  only because its logged latency matched the previous one to the millisecond.
  Read the per-call figures, not just the output. (Turn 001)
* **A rule too obvious to write down is a rule the model does not have.** Nothing
  said "do not recommend a game they already named", so it did, twice, while
  passing every gate. Where a rule can be made structurally impossible in code,
  it belongs there rather than in a prompt. (Turn 002)
* **A numeric limit in a prompt is a request, not a constraint.** "3 to 60
  characters" produced 61 twice in a row. Retrying could not help: it was the
  model's natural output length, not a transient failure. (Turn 002)
* **Local green says nothing about a deployed artifact.** Six failures appeared
  only outside local development while 37 offline checks passed through all of
  them. Bundling, environment variables and host settings are all part of the
  program. (Turn 003)
* **An ignored query parameter looks exactly like a working one.** A filter the
  service silently drops returns a full list and a plausible result. Confirm
  every filter by comparing a filtered count against an unfiltered one before
  building on it. (Turn 005)
* **A search endpoint is not a membership test.** `/tags?search=open-world`
  returned `open-world-2` with 6 games while `open-world` with 9,338 existed.
  Fuzzy ranking gives false negatives. Resolve by the call the app makes, pin the
  result, check against the pin. (Turn 005)
* **A documented shape is not a verified one.** `src/catalogue.js` was written
  against a field list that could not be read anywhere, so it shipped with an
  inspection script that printed the real response. It happened to be right. The
  script is why that is known rather than assumed. (Turn 005)
* **An assumption about someone else's ordering is still an assumption.** The
  platform list was reversed on the belief that the catalogue sorted oldest
  first. It sorts newest first, so the reverse buried the Nintendo Switch
  thirteenth of thirteen. No test could fail: the code did exactly what it was
  told. Only reading the output caught it. (Turn 009)
* **Check the artifact before suspecting the source.** A pinned file regenerated
  after a fix came out byte-identical to the version before it. The source was
  correct and the file on disk was old. Two commands settled it — grep the
  source, read the artifact — against an afternoon of looking for a bug that was
  not there. This is the turn-001 stale-result rule wearing different clothes.
  (Turn 009)

* **A single source of truth is not the same as a correct one.** A mixed platform
  selection was fixed by deriving the query and the gate from one list; the next
  request returned Breath of the Wild for a Game Boy Advance, because that one
  list was built by a rule written for an interface that no longer existed.
  Removing a disagreement is not the same as being right. (Turn 010)
* **Logic that no offline check can reach will eventually be wrong.** Platform
  resolution lived inside a Netlify handler for two turns and was broken for both
  of them. Moving it to `src/` was not tidying, it was the only way to test it.
  (Turn 010)
* **A threshold carried into a context where its reason does not hold is not a
  safeguard, it is a bug with a good name.** The rating floor exists to keep the
  shortlist to games the *model* can write about. Applied to a front page that
  makes no model call, it left one game in a row of forty. (Turn 013)
* **An empty result is a failure, not a state.** Forty records came back, all
  forty were discarded two lines later, and the page said the same words it would
  have said if the catalogue held nothing. When code throws away everything it was
  handed, that is the most interesting thing that happened in the request. (Turn
  013)
* **A query you wrote returning nothing is not a finding about the world.** A
  probe reported "0 of 0 games carry a Steam app id" because it filtered on a
  field IGDB had renamed. The correct field answers 175,517; the stale one
  answers 753, which is small enough to look like a real absence. Read the field
  names before filtering on them. (Turn 016)
* **A mutation test is code and fails silently like any other.** An edit that did
  not apply produced a green suite and read exactly like a check that cannot
  fail. Verify the mutation landed before trusting the result. (Turn 016)
* **Nothing reaches a query language except integers from a pinned file.** The one
  exception is the deals search box, which filters rather than escapes: quotes,
  backslashes, semicolons and brackets are removed, because a character that is
  never present cannot be mishandled by a later change to an encoder. (Turn 016)

* **An undocumented absence is not a measurement.** "The docs do not mention it"
  and "I asked and it is not there" are different claims. IGDB's news endpoints
  were declared gone on the strength of a migration blog post that named no
  endpoint, and that inference was one step from buying a fourth external service
  and an XML dependency. Fourteen requests settled it properly. The conclusion
  was right; the reason was not, and that is worth as little as being wrong.
  (Turn 017)
* **A probe's summary line is code and gets the same suspicion as its body.** It
  is the part a reader trusts most and the part least likely to have been tested.
  One counted four unrelated endpoints answering as evidence that news existed,
  because it treated "something answered" as "the thing I asked about exists".
  (Turn 017, and the fourth appearance of turn 001's rule.)

* **A renamed field makes a feature vanish rather than break.** `websites.category`
  became `websites.type`. Nothing threw: `w.category` was `undefined` for every
  website of every game, the official-site link returned null every time, and the
  button was simply absent — indistinguishable from a catalogue where no game has
  a website. It survived the whole IGDB migration and was found by accident while
  probing for something else. **A check written against the same wrong field name
  agrees with the code**, which is why 21 offline checks covered this file and
  none of them caught it. Third rename hit in this project, after `game_type` and
  `external_game_source`. (Turn 018)
* **"It parsed" is not "it works", and a permissive tool says nothing.** A comment
  closed early in `styles.css` left five lines of English loose inside a
  declaration block, and the browser discarded everything from the stray text to
  the end of the rule — so `animation:` never applied, the tab simply sat there,
  and every other declaration in the rule survived. It was verified with
  `esbuild styles.css --outfile=/dev/null`, which exits 0, prints nothing, and
  emits the wreckage as one mangled declaration. esbuild was not wrong; it was
  never asked the question that mattered. "Does this parse" and "is the
  declaration still inside the rule" are different claims, and only the second
  one was the claim being made. Fifth appearance of turn 001's rule, and the
  first in a file this project had not been treating as code — `scripts/check-css.js`
  exists because a stylesheet fails silently by construction. (Turn 018)

* **An unrun test case can be wrong indefinitely, and nothing about it looks
  wrong.** Reference case 5 tested catalogue descriptions for prompt injection.
  Descriptions never enter a prompt in this design and never did, under either
  catalogue. The case survived being written, reviewed and carried through a
  whole migration because executing it was the one thing nobody did. A test is a
  sentence until it runs. (Turn 019)
* **A check on the separator count tests the separator, not the format.** Three
  checks were written against titles carrying control characters and two of them
  could not fail: they asserted `split("\n").length`, and a carriage return does
  not produce a newline. A mutation stripping only `\n` passed all sixty-seven.
  Written one hour after failure 24, by the same author. Counting the separators
  tested the separators; testing the format meant looking for the characters.
  (Turn 019)
* **A mutation that changes nothing looks exactly like a check that cannot
  fail.** A harness reported a false pass; the two regexes turned out to be
  equivalent, because JavaScript's `\s` already matches `\r`, U+2028 and U+2029.
  The two readings point opposite ways — fix the checks, or note the redundancy —
  and only a direct behavioural comparison separates them. Label a known no-op,
  or the harness cries wolf every run and is not believed on the run that
  matters. (Turn 019)
* **A harness that edits a source file must be safe at every line.** The mutation
  runner hardcoded `/tmp`, which is not a path on Windows, and died. It was
  harmless only because the failing copy was its first statement; as its last, it
  would have left a mutated source on disk under a success message. Restores are
  verified byte for byte, not announced. (Turn 019)
