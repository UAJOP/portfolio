/**
 * One-time Master 2 migration from phrase-identity page copy to stable keys.
 *
 * Usage:
 *   node scripts/migrate-master2-i18n.mjs
 *   node scripts/migrate-master2-i18n.mjs --check
 *
 * The migration is intentionally explicit. It reuses reviewed translations,
 * removes only phrases whose authored consumers now declare data-message-key,
 * and advances the closed compatibility baseline to the smaller catalog.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  buildCatalog,
  compareKeys,
  readJson,
  sortObject,
  stableJson,
} from "./i18n-catalog.mjs";

const checkOnly = process.argv.includes("--check");
const localeIds = ["en", "tr", "de", "es", "fr"];
const translatedLocaleIds = localeIds.filter((locale) => locale !== "en");

const migrations = [
  {
    key: "home.hero.title",
    source: "I turn ambiguous customer workflows into deployable AI and software systems.",
  },
  {
    key: "home.identity.availabilityValue",
    source: "Available for Forward Deployed Engineer roles",
  },
  {
    key: "works.hero.title",
    source: "Engineering evidence for forward-deployed work.",
  },
  {
    key: "about.hero.title",
    source: "I work where ambiguous customer problems meet hands-on engineering.",
  },
  {
    key: "about.hero.lead",
    source: "My primary target is Forward Deployed Engineer; AI Designer & Software Developer describes the professional background behind that direction.",
  },
  {
    key: "about.profile.eyebrow",
    source: "Professional profile",
  },
  {
    key: "about.profile.title",
    source: "The part I like is the beginning, when nobody can say yet what the system has to do.",
  },
  {
    key: "about.profile.approach",
    source: "That is where discovery and technical scoping do the real work: naming the users, the business rules, the integration boundaries and the success criteria, then getting to a prototype fast enough that the conversation can continue against something real. I care about what the system actually does, not only whether the interface looks convincing.",
  },
  {
    key: "about.profile.experience",
    source: "At CBOT, I worked on enterprise conversational-AI projects involving chatbot QA, stabilization, channel configuration, flow restructuring and an insurance-claims intake POC. Project-based AI evaluation work added structured review of LLM responses, reasoning, code and multimodal outputs.",
  },
  {
    key: "about.profile.evidence",
    source: "In 2026, SINAMA became my strongest proof that AI behavior can be evaluated instead of guessed at, and Atölye Joyday remains the real-business example of owning a customer-facing product end to end. Merge Rush: Tiny Factory carries the product-engineering breadth behind both.",
    english: "In 2026, SINAMA became my strongest evidence that AI behavior can be evaluated instead of guessed at, and Atölye Joyday remains the real-business example of owning a customer-facing product end to end. Merge Rush: Tiny Factory carries the product-engineering breadth behind both.",
  },
  {
    key: "home.selectedWork.joyday.summary",
    source: "Proves end-to-end delivery on a real business: service discovery, reservation journey and operational automation, shipped and owned in daily use.",
    english: "Service discovery, a reservation journey, and operational automation for a live business website.",
  },
  {
    key: "works.supporting.mergeRush.summary",
    source: "Proves: stateful product engineering and iterative delivery. Timed workflows, multi-cell board logic, responsive layouts, automated tests and platform-aware production architecture.",
    english: "Stateful product engineering through timed workflows, multi-cell board logic, responsive layouts, automated tests, and platform-aware architecture.",
  },
];

const expectedFiles = new Map();
const pagesByLocale = new Map();

for (const locale of translatedLocaleIds) {
  const file = `data/i18n/packs/${locale}/pages.json`;
  const pages = readJson(file);
  pagesByLocale.set(locale, pages);
}

for (const locale of localeIds) {
  const file = `data/i18n/messages/${locale}/common.json`;
  const messages = readJson(file);
  for (const migration of migrations) {
    if (messages[migration.key]) continue;
    if (locale === "en") {
      messages[migration.key] = migration.english || migration.source;
      continue;
    }
    const translated = pagesByLocale.get(locale)?.text?.[migration.source];
    if (!translated) {
      throw new Error(`${locale} is missing the reviewed compatibility translation for ${migration.key}`);
    }
    messages[migration.key] = translated;
  }
  expectedFiles.set(file, stableJson(sortObject(messages)));
}

for (const locale of translatedLocaleIds) {
  const file = `data/i18n/packs/${locale}/pages.json`;
  const pages = pagesByLocale.get(locale);
  for (const migration of migrations) delete pages.text[migration.source];
  expectedFiles.set(file, stableJson(pages));
}

function writeOrCheck(file, expected) {
  const absolute = path.join(ROOT, file);
  const actual = fs.readFileSync(absolute, "utf8");
  if (checkOnly) {
    if (actual !== expected) throw new Error(`${file} is not at the Master 2 migration result`);
    return;
  }
  fs.writeFileSync(absolute, expected);
}

for (const [file, expected] of expectedFiles) writeOrCheck(file, expected);

const contractFile = "data/i18n/message-contract.json";
const contract = readJson(contractFile);
const catalog = buildCatalog();
const compatibilityKeys = catalog.entries
  .filter((entry) => entry.domain === "pages")
  .map((entry) => entry.key)
  .sort(compareKeys);
const baseline = {
  entryCount: compatibilityKeys.length,
  sha256: crypto.createHash("sha256").update(JSON.stringify(compatibilityKeys)).digest("hex"),
};
contract.domains.historicalPageCompatibility.baseline = baseline;
writeOrCheck(contractFile, stableJson(contract));

console.log(
  `[i18n:migrate:master2] ${checkOnly ? "verified" : "migrated"} ${migrations.length} stable keys; ` +
  `compatibility baseline ${baseline.entryCount} entries`,
);
