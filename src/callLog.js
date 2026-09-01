import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/**
 * One row per model call, including the ones that failed.
 * Criterion 10. Failures are the rows most worth having: a success rate you
 * cannot see is a success rate you will assume is 100%.
 *
 * Step 5 replaces the destination with Supabase. The row shape stays the same,
 * so that swap changes where records go and not what a record is.
 */
export function logCall(row) {
  const record = {
    at: new Date().toISOString(),
    call: row.call,                 // "analysis" | "preferences" | "matching"
    model: row.model,
    tokens_in: row.tokens_in ?? null,
    tokens_out: row.tokens_out ?? null,
    cost_usd: row.cost_usd ?? null, // null when the provider did not report it
    latency_ms: row.latency_ms ?? null,
    success: row.success,
    failure_reason: row.failure_reason ?? null,
    attempt: row.attempt ?? 1,
  };

  const file = path.resolve(config.callLogPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(record) + "\n");
  return record;
}
