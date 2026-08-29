/**
 * Deterministic, DOM-free intent normalization and matching.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 2821-2934.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
/* ajoop-intent-matching:start
 * Locale-independent normalization and token matching for Ajoop intent
 * detection. Extracted verbatim by scripts/qa-ajoop-intents.mjs, so keep the
 * start/end markers intact and keep this block free of DOM access.
 *
 * Two bugs made the previous `toLocaleLowerCase("tr-TR")` + `includes()`
 * approach unreliable:
 *   1. Turkish casing maps ASCII "I" to dotless "ı", so "SINAMA" folded to
 *      "sınama" and could never match the keyword "sinama".
 *   2. Unanchored substring matching let short keywords fire from inside
 *      unrelated words ("email" matched "ai", "hiring" matched "hi").
 *
 * Swapping in plain toLowerCase() is NOT a fix: it maps "İ" to "i" plus
 * U+0307, so "İLETİŞİM" would stop matching "iletişim". Both sides are
 * normalized through the same functions instead.
 */

/* Token characters keep "#" and "+" so keywords like "c#" survive tokenizing. */
const AJOOP_TOKEN_SEPARATOR = /[^\p{L}\p{N}#+]+/u;

/* Keywords this short are matched exactly; longer ones allow a prefix match so
 * Turkish suffixes still resolve ("projelerini" -> "proje"). */
const AJOOP_EXACT_MATCH_MAX_LENGTH = 3;

/* At one or two characters an accent-folded keyword carries too little signal
 * ("iş" folds to "is", a common English word), so those compare with Turkish
 * letters preserved. */
const AJOOP_DIACRITIC_SENSITIVE_MAX_LENGTH = 2;

/**
 * Canonical form that preserves Turkish letters (ş, ğ, ü, ö, ç) but unifies
 * dotted and dotless i. Applied to user input and keywords alike.
 */
function normalizeIntentText(value) {
  return String(value == null ? "" : value)
    .normalize("NFC")
    .replace(/İ/g, "i") /* İ */
    .replace(/ı/g, "i") /* ı */
    .toLowerCase()
    .normalize("NFC");
}

/**
 * Accent-folded form, so "İLETİŞİM", "iletişim" and "iletisim" all agree.
 */
function foldIntentText(value) {
  return normalizeIntentText(value)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC");
}

/**
 * Splits text into tokens, each carrying both representations.
 */
function tokenizeIntentText(value) {
  return normalizeIntentText(value)
    .split(AJOOP_TOKEN_SEPARATOR)
    .filter(Boolean)
    .map((base) => ({ base, folded: foldIntentText(base) }));
}

const ajoopKeywordTokenCache = new Map();

function getKeywordTokens(keyword) {
  let tokens = ajoopKeywordTokenCache.get(keyword);
  if (!tokens) {
    tokens = tokenizeIntentText(keyword);
    ajoopKeywordTokenCache.set(keyword, tokens);
  }
  return tokens;
}

function matchesKeywordToken(token, keywordToken) {
  if (keywordToken.base.length <= AJOOP_DIACRITIC_SENSITIVE_MAX_LENGTH) {
    return token.base === keywordToken.base;
  }
  if (keywordToken.folded.length <= AJOOP_EXACT_MATCH_MAX_LENGTH) {
    return token.folded === keywordToken.folded;
  }
  return token.folded.startsWith(keywordToken.folded);
}

/**
 * True when `keyword` (single word or phrase) appears as a consecutive run of
 * tokens in `tokens`.
 */
function matchesKeyword(tokens, keyword) {
  const keywordTokens = getKeywordTokens(keyword);
  if (!keywordTokens.length) return false;
  const limit = tokens.length - keywordTokens.length;
  for (let start = 0; start <= limit; start += 1) {
    let matched = true;
    for (let offset = 0; offset < keywordTokens.length; offset += 1) {
      if (!matchesKeywordToken(tokens[start + offset], keywordTokens[offset])) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}
/* ajoop-intent-matching:end */

function detectChatbotIntent(message) {
  const tokens = tokenizeIntentText(message);
  if (!tokens.length) return "default";
  const match = chatbotKeywordMap.find((item) =>
    item.keywords.some((keyword) => matchesKeyword(tokens, keyword)),
  );
  return match?.id || "default";
}

