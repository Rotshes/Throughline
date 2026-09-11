/**
 * The only two things the browser is allowed to ask for.
 *
 * No keys here, no correctness decisions here. The browser renders what the
 * function returns and nothing more — every gate runs on the server, because a
 * check that runs in the browser is a check anyone can skip.
 */
export async function requestShortlist({ category, platforms, tags }) {
  const res = await fetch("/api/shortlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, platforms, tags }),
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
