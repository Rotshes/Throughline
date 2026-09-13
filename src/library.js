/**
 * The library: games somebody has put on a list, and which state each is in.
 *
 * One library, shared by every visitor. No accounts, no per-browser identity —
 * see docs/decisions/0005. That is a demonstration choice and it is written
 * down rather than left to be inferred.
 *
 * Its one job for the recommender is criterion 8: a game in here never enters a
 * candidate set again. The recommender asks only whether an id is present and
 * never which status it holds — the status is for the person reading their own
 * list. Keeping that distinction means a new status can be added without
 * anything in the pipeline caring.
 *
 * Every function here returns rather than throws. A library failure must not
 * cost somebody a shortlist that already passed nine gates.
 */

import { readData } from "./paths.js";
import { storeConfigured, baseUrl, restHeaders } from "./store.js";

/** The five states, pinned in data/ because the browser needs them too. */
export function statuses() {
  return JSON.parse(readData("data/statuses.json")).statuses;
}

export function statusIds() {
  return statuses().map(s => s.id);
}

export function defaultStatus() {
  return statuses().find(s => s.default)?.id ?? statuses()[0].id;
}

/**
 * Is this a status the table will accept?
 *
 * Checked here rather than left to the database's CHECK constraint, so a bad
 * value produces a readable refusal instead of a Postgres error surfaced as a
 * 500. Pure apart from reading the pinned file.
 */
export function isValidStatus(status) {
  return typeof status === "string" && statusIds().includes(status);
}

/**
 * Everything in the library, newest change first.
 *
 * Returns `{ ok, entries }`. On failure, `entries` is empty and `reason` says
 * why — the page shows the failure rather than an empty library, because
 * "nothing here yet" and "could not reach the database" look identical and mean
 * opposite things.
 */
export async function listLibrary() {
  if (!storeConfigured()) return { ok: true, entries: [], skipped: true };

  const url = `${baseUrl()}/rest/v1/library?select=*&order=updated_at.desc`;
  const res = await fetch(url, { headers: restHeaders() });
  if (!res.ok) {
    return { ok: false, entries: [], reason: `HTTP ${res.status} ${await res.text()}` };
  }
  return { ok: true, entries: await res.json() };
}

/**
 * Just the ids, for the exclusion.
 *
 * A separate, narrower request than `listLibrary` because this one runs on
 * every recommendation and does not need the titles or the images.
 */
export async function libraryIds() {
  if (!storeConfigured()) return { ok: true, ids: [] };

  const url = `${baseUrl()}/rest/v1/library?select=game_id`;
  const res = await fetch(url, { headers: restHeaders() });
  if (!res.ok) {
    // Returned, never thrown. Failing to read the library must not fail the
    // request — it means the exclusion did not happen, which the response says.
    return { ok: false, ids: [], reason: `HTTP ${res.status} ${await res.text()}` };
  }
  const rows = await res.json();
  return { ok: true, ids: rows.map(r => r.game_id) };
}

/**
 * Add a game, or change the status of one already there.
 *
 * An upsert on the primary key, so clicking "add" twice is not an error and a
 * status change is the same operation as an add. `added_at` is left alone by
 * the update so it keeps meaning when the game first appeared.
 */
export async function upsertEntry(entry) {
  if (!storeConfigured()) {
    return { ok: false, reason: "No database is configured, so nothing was saved." };
  }

  const row = {
    game_id: entry.gameId,
    status: entry.status,
    title: entry.title,
    slug: entry.slug ?? null,
    image: entry.image ?? null,
    released: entry.released ?? null,
    platforms: entry.platforms ?? [],
    updated_at: new Date().toISOString(),
  };

  const res = await fetch(`${baseUrl()}/rest/v1/library`, {
    method: "POST",
    headers: {
      ...restHeaders(),
      "Content-Type": "application/json",
      // Upsert. Without this, adding a game already present returns a 409 that
      // reads like a bug to whoever clicked the button twice.
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([row]),
  });

  if (!res.ok) return { ok: false, reason: `HTTP ${res.status} ${await res.text()}` };
  const rows = await res.json();
  return { ok: true, entry: rows[0] ?? null };
}

/** Take a game out. Removing something absent is not an error. */
export async function removeEntry(gameId) {
  if (!storeConfigured()) {
    return { ok: false, reason: "No database is configured, so nothing was removed." };
  }
  const res = await fetch(
    `${baseUrl()}/rest/v1/library?game_id=eq.${encodeURIComponent(gameId)}`,
    { method: "DELETE", headers: restHeaders() }
  );
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status} ${await res.text()}` };
  return { ok: true };
}
