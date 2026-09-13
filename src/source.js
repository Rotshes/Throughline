/**
 * Which catalogue this app is using. THE SWITCH IS THIS FILE.
 *
 * `src/catalogue.js` (RAWG) and `src/igdb-catalogue.js` (IGDB) export the same
 * surface: `assembleCandidates`, `countFor`, `toCandidate`, `usable`,
 * `excludePlayed`, `rankByTagMatch`, `dominanceReport`, `fetchDescription`,
 * `SOURCE`. Everything else in the project imports from here rather than from
 * either of them, so changing catalogues is one line and one decision record,
 * which is what turn 005 put every catalogue call in one file to buy.
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
