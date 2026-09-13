/**
 * What this app has actually put in front of somebody.
 *
 * The one list here that is genuinely ours rather than a catalogue's. It is
 * `requests.picks` — the record written after every shortlist that passed nine
 * gates — read back in reverse. No other site could show it, because no other
 * site made these choices.
 *
 * MOVED OFF THE FRONT PAGE, AND WHY THAT IS RIGHT
 *
 *   It sat between rows about what is new, what reviewed well and what is cheap,
 *   where it read as a fourth catalogue listing. It is not one: it is a record of
 *   this app's own behaviour, and the place that means something is the page
 *   where somebody is about to ask the same question.
 *
 *   On the find page it answers "what does this thing actually give people?"
 *   before you have typed anything, which is a better argument for the product
 *   than a heading can make.
 *
 * WHAT IT COSTS THAT IT DID NOT BEFORE
 *
 *   It used to cost zero catalogue requests, because it showed a title and an
 *   angle and nothing else. Covers mean one more request — batched, all ids at
 *   once — and that is the whole price of the change.
 */

import { igdbRequest, imageUrl } from "./igdb.js";
import { storeConfigured, baseUrl, restHeaders } from "./store.js";

/** How many to show. A strip, not a page. */
const LIMIT = 10;

/** How long a built strip is reused, per warm instance. */
const TTL_MS = 5 * 60 * 1000;
let cached = null;

/**
 * The ids and angles, newest first, deduplicated.
 *
 * Reads more rows than it needs because one request holds three picks and the
 * same game recurs — twenty-five rows is seventy-five picks to draw ten distinct
 * games from.
 *
 * Returns an empty list rather than throwing on any failure. This strip is a
 * flourish; losing it must not cost anybody the form underneath it.
 */
async function recentPicks(limit) {
  if (!storeConfigured()) return [];
  try {
    const url =
      `${baseUrl()}/rest/v1/requests` +
      `?select=picks,created_at&outcome=eq.shortlisted&order=created_at.desc&limit=25`;
    const res = await fetch(url, { headers: restHeaders() });
    if (!res.ok) return [];
    const rows = await res.json();

    const seen = new Set();
    const out = [];
    for (const row of rows) {
      for (const p of Array.isArray(row.picks) ? row.picks : []) {
        if (!Number.isInteger(p?.id) || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push({ id: p.id, title: p.title, angleLabel: p.angleLabel ?? null });
        if (out.length >= limit) return out;
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Attach a cover to each pick. Pure, so it is checked offline.
 *
 * The title stays the one that was RECORDED, not the one the catalogue returns
 * now. `requests.picks` is a record of what a person was shown, and criterion 15
 * ties a click to the text that persuaded them — quietly replacing it with a
 * fresher title would make the record describe something that never happened.
 * The cover is decoration and can be current.
 *
 * A pick whose game the catalogue no longer returns keeps its place with no
 * cover. It was still shown to somebody.
 */
export function attachCovers(picks, games) {
  const coverById = new Map();
  for (const g of Array.isArray(games) ? games : []) {
    if (!Number.isInteger(g?.id)) continue;
    const url = imageUrl(g.cover, "cover");
    if (url) coverById.set(g.id, url);
  }

  return (Array.isArray(picks) ? picks : [])
    .filter(p => Number.isInteger(p?.id) && p.title)
    .map(p => ({
      id: p.id,
      title: p.title,
      angleLabel: p.angleLabel ?? null,
      cover: coverById.get(p.id) ?? null,
    }));
}

/**
 * The strip. One database read and at most one catalogue request.
 *
 * Never throws. Every failure path returns an empty list, because this sits
 * above a form that has to keep working when the record cannot be read.
 */
export async function buildSuggested({ force = false } = {}) {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const picks = await recentPicks(LIMIT);
  if (picks.length === 0) {
    cached = { at: Date.now(), value: { games: [] } };
    return cached.value;
  }

  let games = [];
  try {
    games = await igdbRequest("games",
      `fields id, cover.image_id; where id = (${picks.map(p => p.id).join(",")}); limit ${LIMIT};`);
  } catch {
    // A catalogue outage costs the pictures, not the strip. The titles and the
    // angles came from this project's own records and are still true.
    games = [];
  }

  const value = { games: attachCovers(picks, games) };
  cached = { at: Date.now(), value };
  return value;
}
