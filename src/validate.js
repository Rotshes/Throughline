import AjvModule from "ajv";
import { readData } from "./paths.js";

// Ajv ships as CommonJS. Imported into ESM directly, Node hands back the
// constructor; bundled by esbuild, the same import can arrive as
// { default: Ajv }. Taking either means this cannot work locally and break once
// deployed, which is the failure mode that costs an afternoon.
const Ajv = AjvModule.default ?? AjvModule;

const ajv = new Ajv({ allErrors: true, strict: false });

const shortlistSchema = JSON.parse(readData("schemas/shortlist.schema.json"));

export const validateShortlistShape = ajv.compile(shortlistSchema);

export function errorsToText(validator) {
  return (validator.errors || []).map(e => `${e.instancePath || "/"} ${e.message}`).join("; ");
}

/**
 * Criterion 12. A model asked for JSON will sometimes wrap it in prose or code
 * fences. Recovering the JSON is fine; guessing at prose is not.
 */
export function parseJsonStrict(text) {
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch (e) {
    return { ok: false, reason: `not valid JSON: ${e.message}` };
  }
}
