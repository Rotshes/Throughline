/**
 * Text shaping that belongs to no particular catalogue.
 *
 * Lifted out of src/catalogue.js unchanged when a second source arrived. It was
 * never RAWG-specific — every catalogue returns prose written for a store page
 * rather than for a shortlist — and leaving it there would have meant the IGDB
 * module importing the RAWG one, which is exactly the dependency the migration
 * exists to remove.
 */

/**
 * Trim a catalogue description to something a person will read.
 *
 * Descriptions run to several paragraphs and often carry store copy, bullet
 * lists and occasionally a second language after the English. Cut at a sentence
 * boundary rather than mid-word, and prefer stopping early over running long:
 * this sits beside the model's argument, and if it is longer than the argument
 * it stops being context and becomes the page.
 *
 * Pure, so it is checked offline.
 */
export function trimDescription(raw, limit = 420) {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= limit) return text;

  const window = text.slice(0, limit);
  const lastStop = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));

  // Cut at the sentence if that leaves something worth reading; otherwise take
  // the window and mark it. The floor is an absolute number of characters, not
  // a fraction of the limit: a description whose first sentence ends at 150
  // should be cut there whether the limit is 420 or 800, and "Hi." should never
  // be the whole synopsis just because the limit happened to be small.
  const MIN_USEFUL = 120;
  if (lastStop >= MIN_USEFUL) return window.slice(0, lastStop + 1);
  return window.trimEnd() + "…";
}
