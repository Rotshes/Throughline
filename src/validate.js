import fs from "node:fs";
import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

const motifsSchema = JSON.parse(fs.readFileSync("schemas/motifs.schema.json", "utf8"));
const recommendationSchema = JSON.parse(fs.readFileSync("schemas/recommendation.schema.json", "utf8"));

export const validateMotifsShape = ajv.compile(motifsSchema);
export const validateRecommendationShape = ajv.compile(recommendationSchema);

export function errorsToText(validator) {
  return (validator.errors || []).map(e => `${e.instancePath || "/"} ${e.message}`).join("; ");
}

/**
 * Criterion 7b. Checked before any model call, because a single game cannot
 * produce a motif that satisfies criterion 3 — so the call could not succeed
 * and would only cost money.
 */
export function checkGameCount(games) {
  if (!Array.isArray(games)) return { ok: false, reason: "games must be a list" };
  if (games.length < 2) return { ok: false, reason: `Path A needs at least two games; got ${games.length}.` };
  if (games.length > 5) return { ok: false, reason: `Path A takes at most five games; got ${games.length}.` };
  return { ok: true };
}

/**
 * Criterion 3, enforced here rather than in the schema.
 *
 * The schema is shared with path B, where evidence sources are question ids and
 * there are no games to cite — so this rule cannot live in the schema without
 * breaking the other path. See the $comment in motifs.schema.json.
 *
 * Matching is case- and whitespace-insensitive so that "slay the spire" cited
 * against an input of "Slay the Spire" is not treated as an invented source.
 */
export function checkPathAEvidence(motifs, inputGames) {
  const norm = s => String(s).trim().toLowerCase();
  const inputs = new Set(inputGames.map(norm));
  const problems = [];

  for (const motif of motifs) {
    const cited = new Set();
    for (const item of motif.evidence) {
      const source = norm(item.source);
      if (!inputs.has(source)) {
        problems.push(`Motif "${motif.name}" cites "${item.source}", which is not one of the input games.`);
        continue;
      }
      cited.add(source);
      if (norm(item.detail).includes(norm(motif.name))) {
        problems.push(`Motif "${motif.name}" has evidence from "${item.source}" that restates the motif name instead of giving a detail.`);
      }
    }
    if (cited.size < 2) {
      problems.push(`Motif "${motif.name}" cites ${cited.size} distinct input game(s); criterion 3 requires at least 2.`);
    }
  }

  return { ok: problems.length === 0, problems };
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
