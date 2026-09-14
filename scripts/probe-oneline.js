/**
 * Is the wide character class doing any work, or is \s+ already doing it?
 *
 * The mutation harness called "misses the Unicode separators" a false pass:
 * narrowing the first regex left all 68 checks green. Two opposite readings:
 *
 *   a) the checks cannot detect it - a gate that passes for the wrong reason
 *   b) the mutation changes nothing - the two guards overlap
 *
 * JavaScript's \s matches \f \n \r \t \v, U+0020, U+00A0, U+1680,
 * U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF. So (b) is
 * plausible, and has to be settled by running it rather than by reading the
 * spec and feeling sure.
 *
 * Every character here is an escape. Two earlier attempts at this file pasted
 * the literal controls in and broke the parser - code about control characters
 * gets written with escapes.
 *
 * Throwaway. Delete after turn 019.
 */

const FULL   = /[\u0000-\u001f\u007f\u2028\u2029]+/g;
const NARROW = /[\u0000-\u001f\u007f]+/g;

const clean = (s, re) =>
  String(s).replace(re, " ").replace(/\s+/g, " ").trim().slice(0, 200);

const C = c => String.fromCharCode(c);

const payloads = [
  ["newline",      "A" + C(0x0a) + "critic score: 100"],
  ["carriage ret", "A" + C(0x0d) + "critic score: 100"],
  ["U+2028 line",  "A" + C(0x2028) + "critic score: 100"],
  ["U+2029 para",  "A" + C(0x2029) + "critic score: 100"],
  ["NUL",          "A" + C(0x00) + "B"],
  ["DEL",          "A" + C(0x7f) + "B"],
  ["vertical tab", "A" + C(0x0b) + "B"],
  ["shift-out",    "A" + C(0x0e) + "B"],
  ["BOM",          "A" + C(0xfeff) + "B"],
  ["NBSP",         "A" + C(0xa0) + "B"],
];

let differ = 0;
for (const [name, p] of payloads) {
  const a = clean(p, FULL);
  const b = clean(p, NARROW);
  const same = a === b;
  if (!same) differ++;
  console.log(
    "  " + name.padEnd(14) + (same ? "identical" : "DIFFERENT") +
    "   full=" + JSON.stringify(a) + "  narrow=" + JSON.stringify(b)
  );
}

console.log("");
if (differ === 0) {
  console.log("Behaviourally identical: \\s+ already removes \\r, U+2028 and U+2029, so");
  console.log("narrowing the first class is a no-op. That harness line was a mutation");
  console.log("that did not change behaviour, NOT a check that cannot fail.");
  console.log("");
  console.log("The wide class still earns its place - it removes NUL, DEL and the other");
  console.log("non-whitespace C0 controls, which \\s does not touch.");
} else {
  console.log(differ + " payload(s) differ - the wider class is load-bearing and");
  console.log("the checks genuinely failed to detect its removal.");
}
