/**
 * Resolving a request from the pinned vocabularies, for the reference cases.
 *
 * WHY THIS IS NOT INLINE IN THE TWO CASE SCRIPTS
 *
 *   The first draft of both hardcoded `categorySlug: "shooter"` and
 *   `machineSlugs: ["win"]` — slugs I had not read out of the pinned files and
 *   could not check, because those files are not in my workspace. Every one of
 *   them was a guess.
 *
 *   That is the exact failure this project has recorded twice under a different
 *   name: two platform slugs written from memory (`ps4` for `ps4--1`, `segacd`
 *   for `sega-cd`) were caught only because a resolver refused to write. A guess
 *   that happens to be wrong here costs a run and real money; a guess that
 *   happens to be RIGHT is worse, because it teaches that guessing works.
 *
 *   So nothing here accepts a slug that is not in `data/*.igdb.json`, and a bad
 *   one prints what is actually available instead of failing somewhere deeper.
 */

import { readData } from "../src/paths.js";

let cache = null;

function load() {
  if (cache) return cache;
  const categories = JSON.parse(readData("data/categories.igdb.json"));
  const platforms = JSON.parse(readData("data/platforms.igdb.json"));
  cache = {
    categorySlugs: categories.categories.map(c => c.slug),
    families: platforms.platforms.map(p => ({
      slug: p.slug,
      children: (p.platforms || []).map(c => c.slug),
    })),
  };
  return cache;
}

/**
 * Turn a category slug and a platform family slug into the request object
 * `runRequest` and `shortlist` both take.
 *
 * Refuses rather than guesses. `null` for the category is a real request
 * meaning "any kind", the same as an empty box in the form.
 */
export function buildRequest({ category, family }) {
  const v = load();

  if (category !== null && !v.categorySlugs.includes(category)) {
    throw new Error(
      `"${category}" is not a category in data/categories.igdb.json.\n` +
      `  available: ${v.categorySlugs.join(", ")}`
    );
  }

  const fam = v.families.find(f => f.slug === family);
  if (!fam) {
    throw new Error(
      `"${family}" is not a platform family in data/platforms.igdb.json.\n` +
      `  available: ${v.families.map(f => f.slug).join(", ")}`
    );
  }
  if (fam.children.length === 0) {
    throw new Error(`Family "${family}" lists no machines, so it cannot be queried.`);
  }

  return {
    categorySlug: category,
    // Families resolve to their machines. IGDB games carry machines, never
    // families — see src/platforms.js and decision 0006.
    platformSlugs: [family],
    machineSlugs: fam.children,
    // What a person ticked, which is what the prompt describes. Keeping these
    // apart is why "on playstation" does not read as seven console names.
    selectionSlugs: [family],
    specific: false,
    tagSlugs: [],
    playedIds: [],
  };
}

/** Everything that could be asked for, for a usage message. */
export function describeVocabulary() {
  const v = load();
  return [
    `categories: ${v.categorySlugs.join(", ")}`,
    `families:   ${v.families.map(f => `${f.slug} (${f.children.length})`).join(", ")}`,
  ].join("\n");
}
