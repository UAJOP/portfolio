#!/usr/bin/env node
/** Deterministic first-party runtime budgets for kaanbalci.com V1. */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file));
const text = (file) => read(file).toString("utf8");
const raw = (file) => read(file).length;
const gzip = (file) => zlib.gzipSync(read(file), { level: 9 }).length;

let passed = 0;
const failures = [];
const ok = (label, condition, detail = "") => {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};

const loader = text("script.js");
const commonMatch = loader.match(/const COMMON = \[([\s\S]*?)\];/);
const common = commonMatch
  ? [...commonMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
  : [];

const LEGACY = "js/core/i18n.js";
const RUNTIME = "js/core/i18n-runtime.js";
const I18N_CHAIN = ["i18n-data.js", "js/core/locale-routes.js", "js/core/locale.js", RUNTIME];

ok("COMMON manifest parsed", common.length > 0);
ok("compact i18n runtime is common", common.includes(RUNTIME));
ok("historical dictionary is not common", !common.includes(LEGACY));
ok("historical dictionary remains available to build tooling", fs.existsSync(path.join(ROOT, LEGACY)));
ok("compact i18n runtime exists", fs.existsSync(path.join(ROOT, RUNTIME)));

const runtimeRaw = raw(RUNTIME);
const runtimeGzip = gzip(RUNTIME);
ok("compact i18n runtime stays below 8 KB raw", runtimeRaw <= 8_000, `${runtimeRaw} B`);
ok("compact i18n runtime stays below 3 KB gzip", runtimeGzip <= 3_000, `${runtimeGzip} B`);

const legacyRaw = raw(LEGACY);
const legacyGzip = gzip(LEGACY);
ok("legacy dictionary is materially larger than browser runtime", legacyRaw > runtimeRaw * 5);
ok("browser avoids at least 15 KB gzip of legacy i18n", legacyGzip - runtimeGzip >= 15_000, `${legacyGzip - runtimeGzip} B`);

const chainRaw = I18N_CHAIN.reduce((sum, file) => sum + raw(file), 0);
const chainGzip = I18N_CHAIN.reduce((sum, file) => sum + gzip(file), 0);
ok("common i18n chain stays below 60 KB raw", chainRaw <= 60_000, `${chainRaw} B`);
ok("common i18n chain stays below 20 KB gzip", chainGzip <= 20_000, `${chainGzip} B`);

/* Locale packs are selected from one parser-bootstrap locale, then narrowed by
 * page scopes. There must be no code that eagerly enumerates all five packs. */
ok("pack loader uses one resolved locale", /const locale = window\.__KAAN_PACK_LOCALE__/.test(loader));
ok("pack loader scope-splits locale data", /\["core", \.\.\.\(PAGE_PACK_SCOPES\[page\] \|\| \[\]\)\]/.test(loader));
ok("loader does not enumerate five locale ids for eager pack loading", !/\[\s*["']tr["']\s*,\s*["']de["']\s*,\s*["']es["']\s*,\s*["']fr["']/.test(loader));

/* The build-time dictionary must not sneak back through any page-scoped entry. */
const pageBlock = loader.match(/const PAGE_MODULES = \{([\s\S]*?)\n  \};/)?.[1] || "";
ok("legacy dictionary is absent from page-scoped modules", !pageBlock.includes(LEGACY));

const report = {
  legacy: { raw: legacyRaw, gzip: legacyGzip },
  runtime: { raw: runtimeRaw, gzip: runtimeGzip },
  commonI18nChain: { raw: chainRaw, gzip: chainGzip },
  gzipAvoidedFromCommonRuntime: legacyGzip - runtimeGzip,
};

if (failures.length) {
  console.error(`Performance budget: ${failures.length} failure(s), ${passed} passed.`);
  failures.forEach((failure) => console.error(`  x ${failure}`));
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`Performance budget passed. ${passed} assertions.`);
console.log(JSON.stringify(report, null, 2));
