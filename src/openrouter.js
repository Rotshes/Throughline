import { config } from "./config.js";

/**
 * One model call. Returns the text plus whatever the provider reported about
 * tokens, cost and time. Never throws on a bad response — the caller decides
 * what a failure means, and every outcome gets logged.
 */
export async function callModel({ prompt, model = config.model }) {
  const started = Date.now();
  let response, body;

  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openrouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        // Ask the provider to report cost with the response. Not every model
        // route returns it; the reader below tolerates its absence.
        usage: { include: true },
      }),
    });
    body = await response.json();
  } catch (e) {
    return {
      ok: false,
      model,
      latency_ms: Date.now() - started,
      failure_reason: `network error: ${e.message}`,
    };
  }

  const latency_ms = Date.now() - started;

  if (!response.ok) {
    return {
      ok: false,
      model,
      latency_ms,
      failure_reason: `HTTP ${response.status}: ${body?.error?.message ?? "no message"}`,
    };
  }

  const text = body?.choices?.[0]?.message?.content;
  const usage = body?.usage ?? {};

  if (typeof text !== "string" || text.length === 0) {
    return { ok: false, model, latency_ms, failure_reason: "empty response body" };
  }

  return {
    ok: true,
    text,
    model: body?.model ?? model,
    latency_ms,
    tokens_in: usage.prompt_tokens ?? null,
    tokens_out: usage.completion_tokens ?? null,
    cost_usd: usage.cost ?? null,
  };
}
