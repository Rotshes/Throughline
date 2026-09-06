import "dotenv/config";

/**
 * Read a required secret, tolerating how they arrive.
 *
 * Values pasted into a hosting dashboard commonly carry a trailing newline or
 * wrapping quotes. Either produces `Bearer "sk-..."` and a 401 that reads as a
 * bad key rather than a bad paste, which is a slow thing to diagnose.
 */
function required(name) {
  const raw = process.env[name];
  if (!raw) throw new Error(`Missing ${name}. Set it in .env locally, or in the host's environment variables when deployed.`);

  const v = raw.trim().replace(/^["']|["']$/g, "").trim();
  if (!v) throw new Error(`${name} is set but empty once quotes and whitespace are stripped.`);
  return v;
}

export const config = {
  get openrouterKey() {
    return required("OPENROUTER_API_KEY");
  },
  // One model for both calls to begin with. The two-call split exists partly so
  // this can differ per call later, once the logs justify it. See spec.md part 5,
  // pitfall 8, and decision 0001.
  //
  // Model identifiers go stale — providers retire and rename them. A wrong id
  // returns HTTP 404 "no endpoints found", which is why this is an environment
  // variable and not a constant. Current ids: https://openrouter.ai/api/v1/models
  model: process.env.OPENROUTER_MODEL || "google/gemini-3.7-flash",
  maxCallsPerRequest: Number(process.env.MAX_CALLS_PER_REQUEST || 4),
  // Where call records go until Supabase exists (step 5). The shape of a row is
  // fixed here so swapping the destination does not change the record.
  callLogPath: process.env.CALL_LOG_PATH || "logs/model-calls.jsonl",
};
