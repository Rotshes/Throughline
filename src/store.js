import { config } from "./config.js";

/**
 * Where records go once the app is deployed.
 *
 * Netlify functions have no persistent filesystem, so the JSONL log stops
 * existing the moment a function returns. Criterion 10 would still appear to
 * pass locally while silently failing in production — the worst kind of failure,
 * because nothing reports it.
 *
 * Supabase is used when configured; otherwise this is a no-op and the local
 * file log in callLog.js remains the record.
 */
export function storeConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

/**
 * The project URL, with the things people paste by accident removed.
 *
 * A trailing slash produces "//rest/v1/sessions", which PostgREST rejects with
 * PGRST125 "Invalid path specified in request URL" — a 404 that looks like a
 * missing table rather than a malformed URL. Copying the URL from the dashboard
 * with the REST path already on it does the same thing.
 */
function baseUrl() {
  return String(process.env.SUPABASE_URL)
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/, "");
}

async function insert(table, rows) {
  if (!storeConfigured() || rows.length === 0) return { ok: true, skipped: true };

  const url = `${baseUrl()}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    // Never throws. A recording failure must not destroy a result the user is
    // waiting for — but it must be visible, so it is returned and surfaced.
    // The URL is included because the common failures here are malformed
    // URLs, and the status alone does not distinguish them from a missing table.
    return { ok: false, reason: `POST ${url} -> HTTP ${res.status} ${await res.text()}` };
  }
  return { ok: true, rows: await res.json() };
}

export async function saveRequest(request) {
  const r = await insert("requests", [request]);
  return r.ok && r.rows?.[0] ? { ok: true, id: r.rows[0].id } : r;
}

export async function saveCalls(requestId, calls) {
  // The in-memory row uses `at`; the table column is `created_at`. Mapped here
  // rather than renaming the field, so the local JSONL log keeps the shape it
  // has had since turn 001 and rows from the motif design stay readable
  // alongside these.
  const rows = calls.map(({ at, ...rest }) => ({
    ...rest,
    created_at: at,
    request_id: requestId,
  }));
  return insert("model_calls", rows);
}

/**
 * Criterion 15. Records which of the three was clicked, against an existing
 * request. Which one, not whether — a count of people who liked something says
 * nothing without knowing what they picked over what.
 */
export async function recordClick(requestId, pickId) {
  if (!storeConfigured()) return { ok: true, skipped: true };
  const res = await fetch(
    `${baseUrl()}/rest/v1/requests?id=eq.${encodeURIComponent(requestId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ clicked_id: pickId, clicked_at: new Date().toISOString() }),
    }
  );
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status} ${await res.text()}` };
  const rows = await res.json();
  return rows.length === 1 ? { ok: true } : { ok: false, reason: "no such request" };
}
