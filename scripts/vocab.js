/**
 * Turning slugs a person typed into the request object the pipeline takes.
 *
 * Was `scripts/case-vocab.js`, written for the two reference cases in turn 019
 * and generalised here because the command-line runners need exactly the same
 * thing — and were getting it wrong.
 *
 * WHAT IT REFUSES, AND WHY THAT IS THE POINT
 *
 *   Nothing here accepts a slug that is not in `data/*.igdb.json`. A bad one
 *   prints the whole vocabulary rather than failing somewhere deeper.
 *
 *   This project has now typed three slugs from memory and got all three wrong:
 *   `ps4` for `ps4--1`, `segacd` for `sega-cd`, and `role-playing-game-rpg` for
 *   `role-playing-rpg`. The first two nearly shipped a PlayStation family with
 *   no PlayStation 4 in it. The third was caught by this file, one hour after
 *   this file was written, against its own author.
 *
 *   A guess that happens to be wrong costs a run. A guess that happens to be
 *   RIGHT is worse, because it teaches that guessing works.
 *
 * THE VOCABULARIES ARE THE IGDB ONES
 *
 *   `data/categories.igdb.json`, `data/platforms.igdb.json`,
 *   `data/tags.igdb.json` — not the RAWG files beside them, which stay on disk
 *   only so a record written before the migration can still be read against the
 *   vocabulary that produced it. Turn 020 found two runners reading the RAWG
 *   files while the app read these.
 */

import { readData } from "../src/paths.js";

let cache = null;

function load() {
  if (cache) return cache;
  const categories = JSON.parse(readData("data/categories.igdb.json"));
  const platforms = JSON.parse(readData("data/platforms.igdb.json"));
  const tags = JSON.parse(readData("data/tags.igdb.json"));

  cache = {
    categorySlugs: categories.categories.map(c => c.slug),
    families: platforms.platforms.map(p => ({
      slug: p.slug,
      children: (p.platforms || []).map(c => c.slug),
    })),
    machineSlugs: platforms.platforms.flatMap(p => (p.platforms || []).map(c => c.slug)),
    tagSlugs: tags.facets.flatMap(f => f.tags.map(t => t.slug)),
  };
  return cache;
}

/**
 * Build a request.
 *
 * `family` names a platform family and resolves to every machine under it.
 * `machines` names specific consoles instead. One or the other — mixing them is
 * two different questions ("on PlayStation" and "on a PS5") and the record has
 * to say which was asked.
 *
 * A null category is a real request meaning "any kind", the same as leaving the
 * box empty in the form. It is not a missing value.
 */
export function buildRequest({ category = null, family = null, machines = [], tags = [] }) {
  const v = load();

  if (category !== null && !v.categorySlugs.includes(category)) {
    throw new Error(
      `"${category}" is not a category in data/categories.igdb.json.\n` +
      `  available: ${v.categorySlugs.join(", ")}`
    );
  }

  if ((family === null) === (machines.length === 0)) {
    throw new Error(
      family === null
        ? "A platform family or at least one machine is required."
        : `Give a family or machines, not both — "on ${family}" and "on ${machines.join(", ")}" ` +
          `are different requests and the record has to say which was asked.`
    );
  }

  let machineSlugs, platformSlugs, selectionSlugs, specific;

  if (family !== null) {
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
    machineSlugs = fam.children;
    platformSlugs = [family];
    selectionSlugs = [family];
    specific = false;
  } else {
    const unknown = machines.filter(m => !v.machineSlugs.includes(m));
    if (unknown.length) {
      throw new Error(
        `Not a machine in data/platforms.igdb.json: ${unknown.join(", ")}\n` +
        `  available: ${v.machineSlugs.join(", ")}`
      );
    }
    machineSlugs = machines;
    platformSlugs = [];
    selectionSlugs = machines;
    specific = true;
  }

  const badTags = tags.filter(t => !v.tagSlugs.includes(t));
  if (badTags.length) {
    throw new Error(
      `Not in the pinned tag vocabulary: ${badTags.join(", ")}\n` +
      `  A tag this product cannot offer is one the catalogue cannot be asked about.\n` +
      `  Add it to data/tag-candidates.json and re-run scripts/pin-igdb-tags.js.`
    );
  }

  return {
    categorySlug: category,
    platformSlugs,
    machineSlugs,
    selectionSlugs,
    specific,
    tagSlugs: tags,
    playedIds: [],
  };
}

/** Everything that could be asked for, for a usage message. */
export function describeVocabulary() {
  const v = load();
  return [
    `categories: ${v.categorySlugs.join(", ")}`,
    `families:   ${v.families.map(f => `${f.slug} (${f.children.length})`).join(", ")}`,
    `tags:       ${v.tagSlugs.length} in data/tags.igdb.json`,
  ].join("\n");
}
