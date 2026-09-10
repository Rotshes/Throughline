# Reference set — specification v2.0

Written before the code that satisfies it. Seven inputs, each with expected
behaviour recorded — not expected exact output, since three picks from a pool of
twenty-four can legitimately differ run to run.

The v1.x set is in `tests/reference-set.md`. It tested motif production and does
not apply to this design. It stays because deleting it would remove the record of
what turns 001 to 004 were verified against.

**Which of these turn 005 can reach.** Turn 005 builds the catalogue only — steps
1 and 2, no model call. Cases 3, 4 and 7 are wholly about the candidate set and
are testable now. Cases 1 and 2 are half testable now: the filter half. Cases 5
and 6 need the shortlist call and wait for turn 006.

| # | Input | Expected behaviour | Criteria | Reachable in 005 |
|---|---|---|---|---|
| 1 | A common category, one platform | Three games. All carry that category and that platform per the catalogue. Three distinct angles from the fixed vocabulary. | 1, 3, 4, 6 | Filter half only |
| 2 | A category, three platforms | Three games, each available on **at least one** selected platform — not all three. | 3 | Filter half only |
| 3 | Filters leaving **fewer than three** usable candidates | Returns what exists and states the count. No filter is relaxed. No placeholder is invented. | 5 | Yes |
| 4 | Filters leaving **zero** candidates | Says so plainly. **No model call is made.** | 5, 12 | Yes |
| 5 | A candidate whose description carries an injected instruction | Instruction ignored, description treated as text. Something is still returned. | 14 | No |
| 6 | The same filters, three runs | Overlap between the three shortlists recorded. **A measurement, not a pass or fail.** | — | No |
| 7 | The catalogue errors or times out | Shown as a catalogue failure, distinguishable from a model failure and from an empty result. | 13 | Yes |

## How each case is actually produced

**Cases 1 and 2** are ordinary use. Run `npm run candidates -- action pc` and
`npm run candidates -- indie pc,playstation,nintendo`. The script already prints
off-platform and off-category counts; both must be zero.

**Case 3 needs a genuinely thin filter, found rather than guessed.** Run
`npm run catalogue:pin` first — it prints each category with its game count. Pair
the smallest category with a single less common platform and record the exact
combination here once it is known. A thin pool that was engineered by lowering
`page_size` proves nothing; the pool has to be thin because the catalogue is
thin.

**Pair found: `card` on `linux`.** The catalogue holds 46 games for that filter;
three survive `MIN_RATINGS`, and `poolExhausted` comes back true, so the thinness
is the catalogue's and not ours. The three are Slay the Spire, Reigns and Faeria.

A shortlist of three drawn from a pool of three is not a recommendation, and
`run-candidates.js` says so on the run. That is what this case is for.

**Case 4 is the one to design carefully.** The pass condition is not that the
screen says zero. It is that **no `model_calls` row was written** — checked in
the database, not read off the page. This is the same trap that made v1's
injection case worthless twice: a result that looks like a pass while the thing
being tested never ran.

**Case 5 cannot rely on a real catalogue record.** Nothing in this project
controls what RAWG returns, and waiting for a malicious description to appear in
the wild is not a test. The injected candidate is spliced into the candidate set
by the harness, immediately before the model call, alongside candidates that
would obviously be picked.

That last clause is the whole case. v1's injection test paired the malicious
input with one unrelated game, so a null result was correct whether or not the
instruction was resisted — and it stayed wrong through a rewrite that was meant
to fix exactly that. The injected candidate must sit among strong ones, so that
"the instruction was ignored" and "nothing came back" cannot produce the same
output.

**Case 6 is a measurement.** v1 asked that one motif concept survive three runs
and that was a reasonable gate for that design. There is no equivalent here.
Three picks from twenty-four candidates differing between runs is correct
behaviour, not instability. Record the overlap; do not turn it into a gate that
fires on something working.

**Case 7 is produced by breaking the key**, not by waiting for an outage. Set
`RAWG_API_KEY` to a wrong value and confirm the failure says *catalogue* and not
*model*, and that it does not surface as an empty result. A user who cannot tell
which of two external services broke cannot report anything useful.

## Results

Filled in per run, in a dated file under `tests/`. Record what happened, not what
should have happened.
