/**
 * The only two things the browser is allowed to ask for.
 *
 * No keys here, no correctness decisions here. The browser renders what the
 * function returns and nothing more — every gate runs on the server, because a
 * check that runs in the browser is a check anyone can skip.
 */
export async function requestShortlist({ category, platforms, machines, tags }) {
  const res = await fetch("/api/shortlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `platforms` are families, `machines` are specific consoles. The server
    // decides which catalogue parameter to use; the browser only reports what
    // was ticked.
    body: JSON.stringify({ category, platforms, machines, tags }),
  });

  // Read as text first. A crashed function returns an HTML or plain-text error
  // page, and parsing straight to JSON throws away the only description of what
  // went wrong. Turn 003 lost an afternoon to a 500 that read as a bad API key.
  const raw = await res.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      stage: "server",
      failureReason: `HTTP ${res.status}. The server did not return JSON:\n\n${raw.slice(0, 800)}`,
    };
  }

  if (!res.ok) {
    return { ok: false, stage: "request", failureReason: body.error ?? `HTTP ${res.status}` };
  }
  return body;
}

/** The front page's rows. Read-only, and cached by the function. */
export async function fetchHome() {
  try {
    const res = await fetch("/api/home");
    const raw = await res.text();
    try {
      return JSON.parse(raw);
    } catch {
      return { ok: false, stage: "server", reason: `HTTP ${res.status}: ${raw.slice(0, 300)}`, rows: [] };
    }
  } catch (e) {
    return { ok: false, stage: "server", reason: e.message, rows: [] };
  }
}

/**
 * One game, in full. Asked for only when somebody opens a card — never for a
 * whole row, because each open costs two catalogue requests.
 */
export async function fetchGame(id) {
  try {
    const res = await fetch(`/api/game?id=${encodeURIComponent(id)}`);
    const raw = await res.text();
    try {
      return JSON.parse(raw);
    } catch {
      return { ok: false, stage: "server", reason: `HTTP ${res.status}: ${raw.slice(0, 300)}` };
    }
  } catch (e) {
    return { ok: false, stage: "server", reason: e.message };
  }
}

/**
 * The library. One list, shared by everyone who opens the site — no accounts,
 * no per-browser identity. See docs/decisions/0005.
 */
export async function fetchLibrary() {
  try {
    const res = await fetch("/api/library");
    const body = await res.json();
    return res.ok ? body : { ok: false, entries: [], reason: body.error ?? `HTTP ${res.status}` };
  } catch (e) {
    // "Nothing here yet" and "could not reach the database" look identical on
    // screen and mean opposite things, so a failure is reported as one.
    return { ok: false, entries: [], reason: e.message };
  }
}

export async function saveToLibrary(entry) {
  try {
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    const body = await res.json();
    return res.ok ? body : { ok: false, reason: body.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

export async function removeFromLibrary(gameId) {
  try {
    const res = await fetch(`/api/library?gameId=${encodeURIComponent(gameId)}`, {
      method: "DELETE",
    });
    const body = await res.json();
    return res.ok ? body : { ok: false, reason: body.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/** Criterion 15. Which of the three, not whether. */
export async function recordClick(requestId, pickId) {
  try {
    const res = await fetch("/api/shortlist/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, pickId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
