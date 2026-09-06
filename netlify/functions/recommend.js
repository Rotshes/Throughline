import { recommendAndRecord } from "../../src/recommend.js";
import { recordAcceptance } from "../../src/store.js";

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * POST /api/recommend        { games: [...] }        -> a recommendation or a decline
 * POST /api/recommend/accept { sessionId: "..." }    -> criterion 14
 *
 * The OpenRouter key and the Supabase service key live here and never reach the
 * browser. Nothing about correctness is decided client-side.
 */
export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body must be JSON." });
  }

  if (event.path.endsWith("/accept")) {
    if (!body.sessionId) return json(400, { error: "sessionId is required." });
    const r = await recordAcceptance(body.sessionId);
    return r.ok ? json(200, { ok: true }) : json(500, { error: r.reason });
  }

  const games = Array.isArray(body.games)
    ? body.games.map(g => String(g).trim()).filter(Boolean)
    : [];

  // Criterion 7b is checked inside the pipeline too. Repeated here so an
  // obviously bad request is refused without loading prompts or schemas.
  if (games.length < 2 || games.length > 5) {
    return json(400, { error: `Give between two and five games. You gave ${games.length}.` });
  }

  let result;
  try {
    result = await recommendAndRecord(games);
  } catch (e) {
    // An unexpected fault must still look like a failure, never like an empty
    // recommendation. Criterion 12.
    return json(500, { ok: false, stage: "unexpected", failureReason: e.message });
  }

  const payload = {
    ok: result.ok,
    sessionId: result.sessionId,
    motifs: result.analysis?.motifs ?? [],
    evidenceCheck: result.analysis?.evidenceCheck ?? null,
    recommendation: result.ok ? result.matching.recommendation : null,
    stage: result.ok ? null : result.stage,
    phase: result.ok ? null : result.phase,
    failureReason: result.ok ? null : result.failure_reason,
    meta: {
      callsUsed: result.budget?.used ?? null,
      callCap: result.budget?.max ?? null,
      candidates: result.candidates ?? null,
      excluded: result.excluded ?? null,
      latencyMs: (result.analysis?.usage?.latency_ms ?? 0) + (result.matching?.usage?.latency_ms ?? 0),
      prompts: {
        analysis: result.analysis?.prompt
          ? `${result.analysis.prompt.file} v${result.analysis.prompt.version}` : null,
        matching: result.matching?.prompt
          ? `${result.matching.prompt.file} v${result.matching.prompt.version}` : null,
      },
      // Surfaced rather than swallowed: if recording failed, criterion 10 did
      // not hold for this request and somebody should be able to tell.
      recording: result.recording ?? null,
    },
  };

  return json(result.ok ? 200 : 200, payload);
}
