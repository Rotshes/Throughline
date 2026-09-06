import crypto from "node:crypto";
import { readData } from "./paths.js";

/**
 * Load a prompt and identify it.
 *
 * Behaviour lives in the prompts, so a result is only meaningful alongside the
 * prompt that produced it. Two things are recorded:
 *
 *   version — what the file declares in its header.
 *   sha256  — what the file actually contains.
 *
 * Both, because they can disagree. Editing a prompt without bumping its header
 * is an easy mistake and an invisible one: every later row would claim a version
 * that no longer describes the text. When the hash changes and the version does
 * not, the log shows it.
 *
 * The hash is truncated to 16 hex characters. That is 64 bits — far more than
 * enough to notice that a file changed, which is all it is for here.
 */
export function loadPrompt(path) {
  const text = readData(path);
  const declared = text.match(/^version:\s*([0-9]+\.[0-9]+)\s*$/m);

  return {
    text,
    file: path,
    version: declared ? declared[1] : null,
    sha256: crypto.createHash("sha256").update(text).digest("hex").slice(0, 16),
  };
}
