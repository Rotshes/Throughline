# Reverse interview — questions and assumptions

Module 6. The record of what was asked, what was answered, and what had to be
assumed where nothing was said.

---

## Part 1 — The questions asked

1. Anyone can type "I like Stardew Valley and Civilization VI, what should I play
   next" into a chat model and get an answer in eight seconds, free. What does
   this app give someone that they do not get from doing that?
2. Someone uses the app and it recommends a game. How would anyone — you, them,
   the instructor — know whether that recommendation was any good?
3. Your answer to question 2 introduced "the provided backlog array", which your
   original sketch did not contain. Did you mean the recommendation must come
   from a list the user supplies, or did that slip in?
4. Your three criteria measure output format and one proxy for persuasion. None
   measures whether the recommendation was good. Is that the honest limit you
   are accepting?
5. What should the app do when someone enters two games with nothing meaningful
   in common, given that a schema demanding exactly two motifs leaves the model
   no way to say so?

## Part 2 — The answers, and what they settled

**On what this does that a chat model does not.** The first answer — that it goes
deeper into feelings and vibes — does not hold up, since a chat model does that
too when asked. The second answer, arrived at through question 3, does: the app
knows what the user actually owns and has played, and picks from that. A chat
model cannot know a person's library unless told.

**On the backlog.** Confirmed and expanded. The intended source is the user's
Steam library through the Steam Web API, which returns owned games together with
playtime per game. That single call supplies both halves of the product: high
playtime indicates what the person loves, and owned-but-unplayed titles form the
candidate set.

**Deferred to turn 2.** Steam login and API integration is several days of work.
Turn 1 takes the game list as manual entry so that building can start now.

**On the schema forcing invention.** Accepted as a real flaw. Resolved by
splitting the work into two model calls (option C), allowing a variable number of
motifs including zero (option A), and adding a negative reference case that
asserts zero motifs (option D). Each motif must also name which input games it
was drawn from (option B, reduced form).

**On measurement.** Accepted that no criterion measures whether a recommendation
was good, and that this is the honest limit. Three things are measurable and will
be measured instead: schema conformance, whether the recommended title actually
exists in the candidate list, and whether the same input produces consistent
motifs across repeated runs.

## Part 3 — Assumptions, where nothing was said

These are decisions made in the absence of an answer. Each is a decision to be
made on purpose rather than left silent.

1. **Hours per week available.** Never stated across a long conversation.
   Everything scoped here assumes a few hours weekly.
2. **The deadline.** Not known in writing. Turn 3 may not fit.
3. **How many games the user enters.** Assumed 2 to 5 played games, and a
   candidate list of any length up to a cap.
4. **What counts as a "played" game in turn 1.** Assumed the user names them
   honestly. In turn 2, Steam playtime replaces this judgement.
5. **Whether one recommendation is enough.** Assumed exactly one, because a list
   of five returns the user to the choosing problem the app exists to solve.
6. **Whether the app remembers a user between visits.** Assumed not in turn 1.
   No accounts, no history.
7. **What happens after "Commit to Play".** Assumed the click is logged and
   nothing else happens. No follow-up, no "did you enjoy it" later.
8. **Model choice.** Assumed one model for both calls initially, with the split
   allowing different models per call later if the logs justify it.
9. **Title matching.** Assumed exact string match against the candidate list in
   turn 1, with normalisation added when it fails — which it will.
10. **Whether the instructor approves this direction.** This project replaces two
    earlier ones and he has not seen any of them.

## Part 4 — Two earlier project ideas, and why they were dropped

**A SOC detection-rule tuner.** Read a rule's false positives, propose a filter,
replay it against labelled history before showing it. Dropped because it needed
labelled alert data that did not exist and would have had to be invented, which
means only cases already understood.

**A SOC triage training game.** Framed in some detail, including a set of benign
scenarios and a citation-based answer key. Dropped for a better reason than the
first: directing an agent well requires being able to judge what it produces, and
that judgement does not exist here yet. Building a security tool while learning
security means approving work that cannot be evaluated.

The domain moved to one where that judgement already exists. The security
learning continues separately, where it is not also the thing being graded.
