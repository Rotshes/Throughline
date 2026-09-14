/**
 * Which catalogue this app is using. THE SWITCH IS THIS FILE.
 *
 * `src/catalogue.js` (RAWG) and `src/igdb-catalogue.js` (IGDB) export the same
 * NINE NAMES: `assembleCandidates`, `countFor`, `toCandidate`, `usable`,
 * `excludePlayed`, `rankByTagMatch`, `dominanceReport`, `fetchDescription`,
 * `SOURCE`.
 *
 * TWO CORRECTIONS, BOTH FROM TURN 020.
 *
 * **"Everything else imports from here" was false for five turns.**
 * `scripts/run-shortlist.js` and `scripts/run-candidates.js` imported
 * `src/catalogue.js` directly and read the RAWG vocabularies, through the
 * migration and four turns after it. They did not break. With a RAWG key in the
 * environment they answered cheerfully from a catalogue the product no longer
 * uses, which is how the sentence above stayed in this file while being untrue.
 * A claim about what every file does is a claim that has to be checked against
 * every file, and nothing was checking.
 *
 * **The same nine names are not the same contract.** `assembleCandidates` takes
 * `platformIds`, `specific` and `vocabulary` in the RAWG module, and
 * `machineSlugs` and `libraryEntries` here. So the swap is one line only in the
 * direction it was taken: `src/pipeline.js` was rewritten to this contract in
 * the same commit, and flipping the line back would need it rewritten again.
 *
 * The saving grace, and it was measured rather than assumed: both modules
 * validate. RAWG's `buildPoolQuery` throws on a missing `platformIds`, and an
 * empty `machineSlugs` here resolves to no platform ids and hits the same
 * refusal. A mis-shaped call fails loudly instead of quietly returning games
 * filtered by nothing.
 *
 * What turn 005 actually bought, stated honestly: every catalogue call lives in
 * one file, the diff for a swap is legible, and the caller changes with it.
 *
 * The point of routing through a file that does nothing is that the diff for a
 * catalogue swap is legible. A commit that changes this line says what happened;
 * a commit that rewrites the imports of nine files does not.
 *
 * To switch, change the line below and nothing else:
 *
 *     export * from "./catalogue.js";        // RAWG
 *     export * from "./igdb-catalogue.js";   // IGDB — decision 0006
 *
 * What does NOT come through here, deliberately:
 *
 *   The two modules are not interchangeable in every respect and pretending
 *   otherwise would hide the migration's real cost. IGDB carries no playtime, so
 *   the `short-one` angle goes; its review score is not Metacritic, so the field
 *   is `criticScore` and the sentence quoting it changes. Those are edits to
 *   `data/angles.json` and `src/shortlist.js` that happen in the same commit as
 *   the line below, not things this file can paper over.
 */

// export * from "./catalogue.js";      // RAWG, until turn 013
export * from "./igdb-catalogue.js";    // IGDB — decision 0006
