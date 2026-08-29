#!/usr/bin/env node
/**
 * qa-ajoop-intents.mjs — regression tests for Ajoop deterministic intent matching.
 *
 * Guards the two P1 bugs fixed in BRIEF 00.1:
 *   1. Turkish-locale case folding broke uppercase ASCII input (SINAMA -> sınama).
 *   2. Unanchored substring matching produced false positives (email -> ai).
 *
 * The matching layer is extracted verbatim from js/ajoop/matcher.js between the
 * `ajoop-intent-matching` markers, so this tests the shipped code rather than a
 * copy. The intent fixture mirrors the runtime keyword map and is drift-guarded
 * against the source below.
 *
 * Node built-ins only, consistent with the other qa-*.js checks.
 *
 *   node scripts/qa-ajoop-intents.mjs
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = join(ROOT, "js", "ajoop", "matcher.js");
const source = readFileSync(RUNTIME, "utf8");

/* The runtime keyword map is assembled across two files: js/ajoop/assistant.js
 * declares the base intents, then portfolio-v2.js upserts four more
 * ("sinama", "mergeRush", "roles", "latestBuild") and promotes "roles" to the
 * front. Drift guards must therefore search both. */
/* Intents are assembled across several modules: js/ajoop/assistant.js declares
 * the base map, js/request/form.js and js/pages/games.js upsert their own
 * intents, and portfolio-v2.js adds four more and promotes "roles" to the
 * front. Drift guards must search all of them. */
const INTENT_SOURCES = [
  join(ROOT, "js", "ajoop", "assistant.js"),
  join(ROOT, "js", "request", "form.js"),
  join(ROOT, "js", "pages", "games.js"),
  join(ROOT, "portfolio-v2.js"),
];
const runtimeSources = [source, ...INTENT_SOURCES.map((f) => readFileSync(f, "utf8"))].join("\n");

/* Comments legitimately mention the old API when explaining the fix, so strip
 * them before asserting the implementation no longer calls it. */
const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ---------- extract the matching layer from the shipped runtime ---------- */

const START = "/* ajoop-intent-matching:start";
const END = "/* ajoop-intent-matching:end */";
const startIndex = source.indexOf(START);
const endIndex = source.indexOf(END);

if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
  console.error(
    "FAIL: could not find the ajoop-intent-matching markers in js/ajoop/matcher.js.\n" +
      "The matching layer must stay wrapped in those markers so this test can " +
      "exercise the real implementation.",
  );
  process.exit(1);
}

const matchingSource = source.slice(startIndex, endIndex + END.length);

/* The block is intentionally DOM-free, so it evaluates standalone. */
const {
  normalizeIntentText,
  foldIntentText,
  tokenizeIntentText,
  matchesKeyword,
} = new Function(
  matchingSource +
    "\nreturn { normalizeIntentText, foldIntentText, tokenizeIntentText, matchesKeyword };",
)();

/* ---------- intent fixture ----------
 * Mirrors window.chatbotKeywordMap in runtime order (the map is assembled from
 * several unshift/upsert blocks, so order is captured here rather than
 * re-derived). Drift is guarded below: every id and keyword must still exist in
 * the runtime modules.
 */

const INTENTS = [
  { id: "latestBuild", keywords: ["latest", "build", "now", "son build", "güncel", "ne yapıyor"] },
  { id: "roles", keywords: ["role", "roles", "rol", "pozisyon", "uygun", "fit", "işe uygun", "hangi iş", "hangi rol", "solution", "developer", "forward deployed", "ai engineer", "solution engineer", "software engineer", "role fit", "career fit", "hiring fit", "rol uyumu", "uygunluk"] },
  { id: "mergeRush", keywords: ["merge rush", "tiny factory", "phaser", "playables", "factory run", "endless"] },
  { id: "sinama", keywords: ["sinama", "reliability", "regression", "readiness", "tool trace", "agent test"] },
  { id: "games", keywords: ["games", "oyunlar", "oyun", "joyday painting", "action painting", "paint", "canvas", "png", "ai flow puzzle", "n8n", "workflow", "chatbot"] },
  { id: "adventure", keywords: ["adventure", "macera", "oyun", "game", "mini game", "merge", "kariyer oyunu", "job offer"] },
  { id: "request", keywords: ["request", "talep", "form", "iş talebi", "proje talebi", "hire", "service", "hizmet", "teklif"] },
  { id: "education", keywords: ["education", "eğitim", "okul", "üniversite", "university", "mezun"] },
  { id: "experience", keywords: ["deneyim", "experience", "iş geçmişi", "work history", "cbot", "outlier", "punto", "ocean", "staj", "intern"] },
  { id: "weather", keywords: ["hava", "hava durumu", "weather", "yağmur", "rain", "sıcak", "soğuk", "istanbul hava", "izmir hava"] },
  { id: "greeting", keywords: ["selam", "merhaba", "mrb", "naber", "nasılsın", "gunaydin", "günaydın", "iyi akşamlar", "hello", "hi", "hey"] },
  { id: "joyday", keywords: ["joyday", "atolye", "atölye", "reservation", "rezervasyon", "workshop", "action painting", "paket"] },
  { id: "ai", keywords: ["ai", "yapay", "chatbot", "bot", "cbot", "n8n", "llm", "prompt", "ivr", "automation", "otomasyon", "flow", "akış"] },
  { id: "projects", keywords: ["project", "projects", "proje", "projeler", "work", "works", "portfolio", "portfolyo", "github", "hospital", "hastane"] },
  { id: "stack", keywords: ["stack", "tech", "technology", "teknoloji", "python", "c#", "javascript", "php", "unity", "unreal", "mysql", "firebase"] },
  { id: "cv", keywords: ["cv", "resume", "mail", "email", "contact", "iletişim", "linkedin", "ulaş"] },
  { id: "availability", keywords: ["available", "iş", "job", "role", "rol", "pozisyon", "hiring", "hire", "uygun"] },
  { id: "certificates", keywords: ["certificate", "certificates", "sertifika", "sertifikalar", "udemy", "cisco"] },
  { id: "about", keywords: ["kaan", "kim", "who", "about", "hakkında", "hakkımda", "mezun"] },
];

/* Mirrors detectChatbotIntent: first intent in map order whose keywords match. */
const detectIntent = (message) => {
  const tokens = tokenizeIntentText(message);
  if (!tokens.length) return "default";
  const match = INTENTS.find((item) =>
    item.keywords.some((keyword) => matchesKeyword(tokens, keyword)),
  );
  return match ? match.id : "default";
};

/* ---------- assertions ---------- */

let passed = 0;
const failures = [];

const check = (label, actual, expected) => {
  if (actual === expected) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n      expected: ${expected}\n      actual:   ${actual}`);
};

const intentIs = (input, expected) =>
  check(`detectIntent(${JSON.stringify(input)})`, detectIntent(input), expected);

const intentIsNot = (input, forbidden) => {
  const actual = detectIntent(input);
  if (actual !== forbidden) {
    passed += 1;
    return;
  }
  failures.push(
    `detectIntent(${JSON.stringify(input)})\n      must NOT be: ${forbidden}\n      actual:   ${actual}`,
  );
};

/* ---------- drift guard: fixture must reflect the shipped keyword map ---------- */

for (const intent of INTENTS) {
  check(
    `drift guard: intent id "${intent.id}" still present in the runtime`,
    runtimeSources.includes(`"${intent.id}"`),
    true,
  );
  for (const keyword of intent.keywords) {
    check(
      `drift guard: keyword "${keyword}" (${intent.id}) still present in the runtime`,
      runtimeSources.includes(`"${keyword}"`),
      true,
    );
  }
}

/* The old implementation must be gone from executable code. */
check(
  'no runtime code calls toLocaleLowerCase("tr-TR")',
  /toLocaleLowerCase\(\s*["']tr-TR["']\s*\)/.test(stripComments(runtimeSources)),
  false,
);

/* ---------- normalization ---------- */

check('normalizeIntentText("SINAMA")', normalizeIntentText("SINAMA"), "sinama");
check('normalizeIntentText("Sinama")', normalizeIntentText("Sinama"), "sinama");
check('normalizeIntentText("İLETİŞİM")', normalizeIntentText("İLETİŞİM"), "iletişim");
check('normalizeIntentText("iletişim")', normalizeIntentText("iletişim"), "iletişim");
check('normalizeIntentText("ÇALIŞMA") === normalizeIntentText("çalışma")',
  normalizeIntentText("ÇALIŞMA"), normalizeIntentText("çalışma"));
check('normalizeIntentText("GitHub")', normalizeIntentText("GitHub"), "github");

/* The naive-fix trap: plain toLowerCase leaves U+0307 behind. */
check(
  "normalizeIntentText strips no-longer-matching combining dot from İ",
  normalizeIntentText("İ").codePointAt(0) === 0x69 && normalizeIntentText("İ").length === 1,
  true,
);

/* Accent folding: all three spellings of iletişim agree. */
check('foldIntentText("İLETİŞİM")', foldIntentText("İLETİŞİM"), "iletisim");
check('foldIntentText("iletişim")', foldIntentText("iletişim"), "iletisim");
check('foldIntentText("ILETISIM")', foldIntentText("ILETISIM"), "iletisim");
check('foldIntentText("Iletisim")', foldIntentText("Iletisim"), "iletisim");

/* ---------- tokenization ---------- */

const tokenBases = (value) => tokenizeIntentText(value).map((t) => t.base).join("|");

check('tokenize("sinama?")', tokenBases("sinama?"), "sinama");
check('tokenize("SINAMA!")', tokenBases("SINAMA!"), "sinama");
check('tokenize("github,")', tokenBases("github,"), "github");
check('tokenize("ai.")', tokenBases("ai."), "ai");
check('tokenize("  spaced   out  ")', tokenBases("  spaced   out  "), "spaced|out");
check('tokenize("c#") keeps the hash', tokenBases("c#"), "c#");
check('tokenize("n8n")', tokenBases("n8n"), "n8n");
check('tokenize("") is empty', tokenizeIntentText("").length, 0);
check("tokenize(null) is empty", tokenizeIntentText(null).length, 0);

/* ---------- P1-1: uppercase ASCII must match (the SINAMA regression) ---------- */

intentIs("sinama", "sinama");
intentIs("SINAMA", "sinama");
intentIs("Sinama", "sinama");
intentIs("sinama?", "sinama");
intentIs("SINAMA!", "sinama");
intentIs("tell me about sinama", "sinama");
intentIs("Tell me about SINAMA", "sinama");

intentIs("ai", "ai");
intentIs("AI", "ai");
intentIs("Ai", "ai");
intentIs("ai.", "ai");
intentIs("tell me about AI", "ai");
intentIs("I want to learn about AI", "ai");

intentIs("github", "projects");
intentIs("GITHUB", "projects");
intentIs("GitHub", "projects");
intentIs("github,", "projects");
intentIs("your GitHub", "projects");
intentIs("What is your GitHub?", "projects");

intentIs("email", "cv");
intentIs("EMAIL", "cv");
intentIs("hiring", "availability");
intentIs("HIRING", "availability");

/* ---------- P1-2: substring collisions must not fire ---------- */

intentIsNot("email", "ai"); /* "em[ai]l" */
intentIsNot("EMAIL", "ai");
intentIsNot("hiring", "greeting"); /* "[hi]ring" */
intentIsNot("HIRING", "greeting");

/* Other short keywords that substring-matching would have mis-fired on. */
intentIsNot("chief", "greeting"); /* "c[hi]ef" */
intentIsNot("architecture", "ai"); /* no bare "ai" token */
intentIsNot("kontrol", "roles"); /* "kont[rol]" vs keyword "rol" */
intentIsNot("knowledge", "latestBuild"); /* "k[now]ledge" vs keyword "now" */
intentIsNot("robot", "ai"); /* "ro[bot]" vs keyword "bot" */
intentIsNot("profit", "roles"); /* "pro[fit]" vs keyword "fit" */
intentIsNot("whoever", "about"); /* prefix guard is fine, but "who" is short -> exact */

/* The legitimate short-keyword hits still work as whole tokens. */
intentIs("hi", "greeting");
intentIs("cv", "cv");
intentIs("who is Kaan", "about");
intentIs("telegram bot", "ai");

/* ---------- multi-word phrases must keep working ---------- */

intentIs("merge rush", "mergeRush");
intentIs("Merge Rush", "mergeRush");
intentIs("tiny factory", "mergeRush");
intentIs("tell me about Merge Rush please", "mergeRush");
intentIs("ai flow puzzle", "games");
intentIs("work history", "experience");
intentIs("hava durumu", "weather");
intentIs("forward deployed", "roles");
intentIs("software engineer", "roles");

/* A phrase keyword must not match when its words are not adjacent. */
intentIsNot("factory that does merge things", "mergeRush");

/* ---------- Turkish normalization ---------- */

intentIs("iletişim", "cv");
intentIs("İLETİŞİM", "cv");
intentIs("iletisim", "cv"); /* diacritic-free typing */
intentIs("ILETISIM", "cv");

intentIs("eğitim", "education");
intentIs("EĞİTİM", "education");
intentIs("egitim", "education");

intentIs("sertifika", "certificates");
intentIs("SERTİFİKA", "certificates");
intentIs("sertifikalar", "certificates");

intentIs("oyun", "games");
intentIs("OYUN", "games");
intentIs("oyunlar", "games");

intentIs("hakkında", "about");
intentIs("HAKKINDA", "about");

intentIs("çalışma", "default"); /* not a keyword; must fall through cleanly */

/* Turkish agglutination: suffixed forms still resolve via prefix matching. */
intentIs("projeler", "projects");
intentIs("projelerini görebilir miyim", "projects");
intentIs("sinamayı anlat", "sinama");

/* Diacritic-sensitive short keyword: "iş" must not be triggered by English "is". */
check(
  'short keyword "iş" is diacritic-sensitive',
  matchesKeyword(tokenizeIntentText("is"), "iş"),
  false,
);
check(
  'short keyword "iş" still matches Turkish "iş"',
  matchesKeyword(tokenizeIntentText("iş"), "iş"),
  true,
);
check(
  'short keyword "iş" still matches uppercase "İŞ"',
  matchesKeyword(tokenizeIntentText("İŞ"), "iş"),
  true,
);

/* ---------- fallback ---------- */

intentIs("", "default");
intentIs("   ", "default");
intentIs("!!!???", "default");
intentIs("zxcvbnm qwerty", "default");
intentIs("tell me something completely unrelated", "default");
check("detectIntent(null)", detectIntent(null), "default");
check("detectIntent(undefined)", detectIntent(undefined), "default");

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Ajoop intent matching: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(
  `Ajoop intent matching passed. ${passed} assertions across ${INTENTS.length} intents.`,
);
