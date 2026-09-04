/**
 * Question normalization shared by alias resolution and exact-fact routing.
 *
 * This is deliberately NOT the fold used by the live-data guard in
 * ajoop-rag.mjs. That one wants pure word tokens and strips every symbol,
 * which is right for asking "does this sentence mention money" and wrong here:
 * `C#` and `.NET` are entities whose punctuation IS the name, and `Kaan'ın`
 * must become one token rather than two. Two small folds with opposite
 * requirements are clearer than one fold with a flag.
 *
 * Turkish drives the rest of the design. The language agglutinates, so a
 * visitor writes `GitHub'ı`, `sinamanın`, `sertifikası`, `üniversitelerde` —
 * the entity is a PREFIX of the token, not the token. Matching therefore
 * anchors on a left word boundary and tolerates a bounded suffix, which is a
 * controlled variant rather than fuzzy matching: no edit distance, no
 * near-miss, nothing but "this word starts with the alias and ends soon after".
 */

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * How many suffix letters a phrase of this length may absorb.
 *
 * Six covers the longest case that matters (`üniversitelerde`), but a short
 * phrase gets a short budget: `cv` and `gpa` still need to match `CV'si` and
 * `GPA'si`, while a generous budget on a two-letter stem would start swallowing
 * unrelated words. A phrase that does not end in a letter or digit — `c#` — is
 * matched exactly, whatever its length.
 */
function suffixBudget(phrase) {
  if (!/[a-z0-9ı]$/.test(phrase)) return 0;
  if (phrase.length >= 4) return 6;
  return phrase.length >= 2 ? 3 : 0;
}

/**
 * The question as matchable text.
 *
 * Apostrophes are DELETED rather than spaced, so the Turkish possessive glues
 * to its stem: `Kaan'ın` → `kaanin`, `stack'i` → `stacki`. A dot survives only
 * when a letter or digit follows it, which keeps `.net` whole and drops the
 * full stop that ends a sentence.
 */
export function foldQuestion(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[ıİ]/g, "i")
    .toLowerCase()
    .replace(/['’‘`´]/g, "")
    .replace(/\.(?![a-z0-9])/g, " ")
    .replace(/[^a-z0-9#+. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The same fold, except that the Turkish dotless ı is preserved.
 *
 * `sınama` is an ordinary Turkish noun meaning testing; `sinama` is not a
 * Turkish word at all. Folding ı to i destroys exactly the distinction that
 * tells a question about SINAMA apart from a question about testing, so the
 * ambiguity check in ajoop-entities.mjs reads this form instead.
 */
export function foldPreservingDotless(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/['’‘`´]/g, "")
    .replace(/\.(?![a-z0-9ı])/g, " ")
    .replace(/[^a-z0-9ı#+. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const tokenize = (text) => (text ? text.split(" ").filter(Boolean) : []);

/** The regex that matches one normalized phrase at a word boundary. */
function phrasePattern(phrase) {
  const budget = suffixBudget(phrase);
  const suffix = budget ? `[a-zı]{0,${budget}}` : "";
  return new RegExp(`(?:^|\\s)(${escapeRegExp(phrase)}${suffix})(?=\\s|$)`);
}

/** Whether the normalized text contains the phrase, suffixes allowed. */
export function hasPhrase(text, phrase) {
  const target = String(phrase || "").trim();
  return Boolean(target) && phrasePattern(target).test(text);
}

/**
 * The text with the first occurrence of the phrase removed, or null if absent.
 *
 * The exact-fact resolver works by subtraction: strike out the topic, and if
 * every word left over is a question particle then the question really was
 * about that topic and nothing else.
 */
export function removePhrase(text, phrase) {
  const target = String(phrase || "").trim();
  if (!target) return null;
  const match = phrasePattern(target).exec(text);
  if (!match) return null;
  const start = match.index + (match[0].length - match[1].length);
  return `${text.slice(0, start)} ${text.slice(start + match[1].length)}`.replace(/\s+/g, " ").trim();
}
