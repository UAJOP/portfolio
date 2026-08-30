import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
let assertions = 0;
const failures = [];
const assert = (condition, message) => {
  assertions += 1;
  if (!condition) failures.push(message);
};
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const json = (file) => JSON.parse(read(file));
const exists = (file) => fs.existsSync(path.join(ROOT, file));

const registry = json("data/i18n/locales.json");
const ui = json("data/i18n/ui.json");
const glossary = json("data/i18n/glossary.json");
const localeIds = registry.locales.map((item) => item.id);
const active = registry.locales.filter((item) => item.active);
const inactive = registry.locales.filter((item) => !item.active);
const defaults = registry.locales.filter((item) => item.default);

assert(registry.schemaVersion === 1, "locale registry schemaVersion must be 1");
assert(registry.storageKey === "kaanbalci-site-language", "legacy language storage key must be preserved");
assert(new Set(localeIds).size === localeIds.length, "locale ids must be unique");
assert(defaults.length === 1, "exactly one locale must be default");
assert(defaults[0]?.id === registry.defaultLocale, "default flag and defaultLocale must agree");
assert(active.some((item) => item.id === registry.defaultLocale), "default locale must be active");
for (const id of ["en", "tr"]) assert(active.some((item) => item.id === id), `${id} must be active`);
for (const id of ["de", "es", "fr"]) assert(inactive.some((item) => item.id === id), `${id} must remain planned/inactive in V1`);
for (const item of registry.locales) {
  assert(/^[a-z]{2,3}$/.test(item.id), `invalid locale id ${item.id}`);
  assert(Boolean(item.nativeLabel), `${item.id} needs nativeLabel`);
  assert(Boolean(item.label), `${item.id} needs label`);
  assert(["ltr", "rtl"].includes(item.dir), `${item.id} has invalid dir`);
}

for (const [key, pack] of Object.entries(ui)) {
  assert(Boolean(pack.en), `${key} missing English UI copy`);
  for (const locale of active) assert(Boolean(pack[locale.id]), `${key} missing active locale ${locale.id}`);
}

const protectedTerms = new Set(glossary.protectedTerms || []);
for (const term of ["GitHub", "JavaScript", "Forward Deployed Engineer", "AI Engineer", "Solution Engineer", "SINAMA", "n8n"]) {
  assert(protectedTerms.has(term), `glossary must protect ${term}`);
}

const generatedData = read("i18n-data.js");
const sandbox = { window: {} };
vm.runInNewContext(generatedData, sandbox, { filename: "i18n-data.js" });
assert(Boolean(sandbox.window.KAAN_I18N), "generated i18n-data.js must assign window.KAAN_I18N");
assert(JSON.stringify(sandbox.window.KAAN_I18N.locales) === JSON.stringify(registry.locales), "generated locale registry is stale");
assert(JSON.stringify(sandbox.window.KAAN_I18N.ui) === JSON.stringify(ui), "generated UI catalog is stale");
assert(JSON.stringify(sandbox.window.KAAN_I18N.glossary) === JSON.stringify(glossary), "generated glossary is stale");

const bootstrap = read("js/core/locale-bootstrap.js");
assert(bootstrap.includes(JSON.stringify(registry.storageKey)), "bootstrap storage key drift");
assert(bootstrap.includes(JSON.stringify(registry.defaultLocale)), "bootstrap default locale drift");
for (const locale of active) assert(bootstrap.includes(`\"id\":\"${locale.id}\"`), `bootstrap missing active ${locale.id}`);
for (const locale of inactive) assert(!bootstrap.includes(`\"id\":\"${locale.id}\"`), `bootstrap must not activate ${locale.id}`);
assert(bootstrap.includes("navigator.languages"), "bootstrap must support browser locale preferences");
assert(bootstrap.includes("data.localePending") || bootstrap.includes("dataset.localePending"), "bootstrap must mark non-default pending locale");
assert(bootstrap.includes("dataset.localeReady"), "bootstrap must have runtime-failure safety release");

const localeSource = read("js/core/locale.js");
for (const contract of ["getCurrentLocale", "setCurrentLocale", "getActiveLocales", "getNextActiveLocale", "getLocalizedValue", "getLocalizedCollection", "getUiText", "subscribeSiteLocale"]) {
  assert(localeSource.includes(`function ${contract}`), `central locale authority missing ${contract}`);
}
assert(localeSource.includes("source: \"selector\""), "language selector must write through central locale authority");
assert(localeSource.includes("nativeLabel"), "selector must render native language names");
assert(!localeSource.includes("🇹🇷") && !localeSource.includes("🇬🇧") && !localeSource.includes("🇺🇸"), "language selector must not use flags");

const scriptSource = read("script.js");
const order = ["i18n-data.js", "js/core/locale.js", "js/core/shell.js", "js/core/theme.js", "js/core/i18n.js"];
let previous = -1;
for (const token of order) {
  const at = scriptSource.indexOf(`\"${token}\"`);
  assert(at > previous, `runtime order broken around ${token}`);
  previous = at;
}

const rootHtml = fs.readdirSync(ROOT).filter((file) => file.endsWith(".html"));
const projectHtml = fs.existsSync(path.join(ROOT, "projects"))
  ? fs.readdirSync(path.join(ROOT, "projects")).map((slug) => `projects/${slug}/index.html`).filter(exists)
  : [];
const allHtml = [...rootHtml, ...projectHtml];
let runtimePageCount = 0;
for (const file of allHtml) {
  const source = read(file);
  if (!source.includes("script.js")) continue;
  runtimePageCount += 1;
  const bootstrapPath = file.startsWith("projects/") ? "../../js/core/locale-bootstrap.js" : "js/core/locale-bootstrap.js";
  assert(source.includes(`src=\"${bootstrapPath}\"`) || source.includes(`src="${bootstrapPath}"`), `${file} missing locale bootstrap`);
  assert(source.indexOf("locale-bootstrap.js") < source.indexOf("<body"), `${file} locale bootstrap must run before body parse`);
  assert(!/hreflang\s*=/.test(source), `${file} must not publish hreflang before localized static routes exist`);
  for (const id of ["de", "es", "fr"]) assert(!source.includes(`data-lang-switch=\"${id}\"`) && !source.includes(`data-lang-switch="${id}"`), `${file} exposes inactive ${id}`);
  const enCount = (source.match(/data-pv2-en=/g) || []).length;
  const trCount = (source.match(/data-pv2-tr=/g) || []).length;
  assert(enCount === trCount, `${file} data-pv2 EN/TR compatibility attributes must stay paired`);
  assert(!/data-(?:pv2|flagship|sinama|mr)-(?:de|es|fr)=/.test(source), `${file} must not grow one-attribute-per-locale patterns`);
}
assert(runtimePageCount >= 40, `expected broad runtime page coverage, got ${runtimePageCount}`);
assert(projectHtml.length === 25, `expected 25 generated project routes, got ${projectHtml.length}`);

const localizedJsonFiles = [
  "data/portfolio/projects.json",
  "data/portfolio/project-details.json",
  "data/portfolio/profile.json",
  "data/portfolio/recruiter-profiles.json",
  "data/portfolio/build-log.json",
  "data/portfolio/labs.json",
  "data/portfolio/sinama-evidence.json",
];
function inspectLocalized(value, label) {
  if (Array.isArray(value)) return value.forEach((item, index) => inspectLocalized(item, `${label}[${index}]`));
  if (!value || typeof value !== "object") return;
  const keys = Object.keys(value);
  const localeLike = keys.includes("en") && keys.every((key) => localeIds.includes(key));
  if (localeLike) {
    for (const locale of active) assert(Object.hasOwn(value, locale.id) && value[locale.id] !== "", `${label} missing ${locale.id}`);
  }
  for (const [key, child] of Object.entries(value)) inspectLocalized(child, `${label}.${key}`);
}
for (const file of localizedJsonFiles) inspectLocalized(json(file), file);

const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (/\.(?:js|mjs|html|css)$/.test(entry.name)) sourceFiles.push(rel);
  }
}
walk("js");
for (const file of fs.readdirSync(ROOT)) if (/\.js$/.test(file)) sourceFiles.push(file);

const allowedStorageOwners = new Set(["js/core/locale.js", "js/core/locale-bootstrap.js", "i18n-data.js"]);
const allowedLangWriters = new Set(["js/core/locale.js", "js/core/locale-bootstrap.js"]);
for (const file of sourceFiles) {
  const source = read(file);
  if (source.includes("kaanbalci-site-language")) assert(allowedStorageOwners.has(file), `${file} independently owns language storage`);
  if (/document\.documentElement\.lang\s*=/.test(source) || /\bhtml\.lang\s*=/.test(source)) assert(allowedLangWriters.has(file), `${file} independently writes document language`);
  assert(!source.includes("ENGİNEER"), `${file} contains Turkish-casing regression ENGİNEER`);
  assert(!source.includes("GİTHUB"), `${file} contains Turkish-casing regression GİTHUB`);
  assert(!source.includes("JAVASCRİPT"), `${file} contains Turkish-casing regression JAVASCRİPT`);
}

for (const file of ["adventure-game.js", "ai-flow-puzzle.js", "joyday-paint.js", "case-study.js"]) {
  const source = read(file);
  assert(source.includes("getCurrentLocale"), `${file} must consume the central locale authority`);
  assert(!source.includes("kaanbalci-site-language"), `${file} must not read language storage directly`);
}
assert(!read("ai-flow-puzzle.js").includes("document.documentElement.lang ="), "AI Flow Puzzle must not own document language");

const css = read("style.css");
assert(css.includes('html[data-locale-pending="true"] body'), "first-paint pending CSS missing");
assert(css.includes(".lang-selector-select"), "N-locale selector styles missing");
assert(css.includes("[data-preserve-case]"), "protected terminology casing guard missing");

const i18nSource = read("js/core/i18n.js");
assert(i18nSource.includes("subscribeSiteLocale"), "translation presentation must subscribe to central locale changes");
assert(i18nSource.includes("applyProtectedTermCasing"), "terminology casing guard must be applied by i18n presentation");
assert(!i18nSource.includes('language === "tr" ? "tr" : "en"'), "core i18n must not clamp the locale model to EN/TR");

const packageJson = json("package.json");
assert(packageJson.scripts?.["qa:i18n"] === "node scripts/qa-i18n.mjs", "package.json must expose qa:i18n");
assert(String(packageJson.scripts?.qa || "").includes("qa:i18n"), "qa:i18n must block npm run qa");

const workflowPath = ".github/workflows/site-preflight.yml";
if (exists(workflowPath)) {
  const workflow = read(workflowPath);
  assert(workflow.includes("npm run qa:i18n"), "Site Preflight must run blocking qa:i18n");
}

if (failures.length) {
  console.error(`i18n QA failed: ${failures.length} failure(s), ${assertions} assertions`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`i18n QA passed: ${assertions} assertions`);
