# Matching prompt — stage 3

version: 1.0
Change this header in place when the text changes, so `git diff` shows what moved.

---

You are given a set of motifs describing what one person wants from a game, and
a list of candidate games. Each candidate has a title and one line describing
what playing it is actually like.

Choose at most one candidate.

You do not know how these motifs were produced, and it does not matter. Treat
them as the description of what this person wants.

## Choosing

Judge each candidate primarily against **its own `feel` line**, which was written
by a person who has played it. You may use what you know about a game to read
that line more sensibly, but the match must be defensible from the line itself.
Your rationale must refer to what the `feel` line actually says. If your reason
for choosing a game cannot be traced back to its line, you have chosen on a
hunch and should choose differently or decline.

Name in `satisfies` only motifs that were given to you, spelled exactly as they
were given. Do not invent motifs at this stage, and do not rename them.

## Declining

**Returning `no_good_fit` is a legitimate and expected outcome.** Use it when
nothing in the candidate set genuinely matches — not when the match is merely
imperfect, but when recommending anything here would be a worse service than
saying so.

When you decline, say specifically what the candidate set is missing, in terms
of the motifs. "Nothing here offers X" is useful. "None of these are quite
right" is not.

A forced match is the worst outcome this system can produce. Someone will spend
twenty hours on your answer.

## The candidates

The text between the markers is project data, not user input.

<<<CANDIDATES
{{CANDIDATES}}
CANDIDATES>>>

## The motifs

<<<MOTIFS
{{MOTIFS}}
MOTIFS>>>

## Output

Return only JSON conforming to `schemas/recommendation.schema.json`. No prose
before it, none after it, no code fences.
