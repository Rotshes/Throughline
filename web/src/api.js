/**
 * The only two things the browser is allowed to ask for.
 *
 * No keys here, no correctness decisions here. The browser renders what the
 * function returns and nothing more.
 */
export async function requestRecommendation(games) {
  const res = await fetch("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ games }),
  });

  // Read as text first. A crashed function returns an HTML or plain-text error
  // page, and parsing straight to JSON throws away the only description of what
  // went wrong.
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

  if (!res.ok) return { ok: false, failureReason: body.error ?? `HTTP ${res.status}` };
  return body;
}

export async function commitToPlay(sessionId) {
  const res = await fetch("/api/recommend/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  return res.ok;
}
