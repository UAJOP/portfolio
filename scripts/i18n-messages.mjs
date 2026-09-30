import { readJson, loadRegistry, compareKeys } from "./i18n-catalog.mjs";

export const messageFile = (locale, domain) => `data/i18n/messages/${locale}/${domain}.json`;

/* Only these shell messages are read after page render. Page-level semantic
 * messages are baked into localized HTML and must not be duplicated into the
 * global runtime payload or every locale's core pack. */
export const SEMANTIC_PAGE_SOURCES = new Set([
  "index.html",
  "works/index.html",
  "about/index.html",
  "request/index.html",
  "labs/index.html",
  "blog/index.html",
  "games/index.html",
  "sinama-case-study/index.html",
  "merge-rush-case-study/index.html",
  "adventure/index.html",
  "joyday-paint/index.html",
  "ai-flow-puzzle/index.html",
  "project-detail.html",
]);

export const RUNTIME_COMMON_KEYS = [
  "language.selectorAria",
  "language.selectorLabel",
  "nav.close",
  "nav.open",
  "theme.dark",
  "theme.light",
  "theme.switchToDark",
  "theme.switchToLight",
  "training",
];

export function loadMessageDomain(locale, domain = "common") {
  return readJson(messageFile(locale, domain));
}

export function commonMessageMatrix(registry = loadRegistry()) {
  const matrix = {};
  for (const locale of registry.locales) {
    const messages = loadMessageDomain(locale.id, "common");
    for (const key of Object.keys(messages).sort(compareKeys)) {
      (matrix[key] ??= {})[locale.id] = messages[key];
    }
  }
  return matrix;
}

export function runtimeMessageMatrix(registry = loadRegistry()) {
  const matrix = commonMessageMatrix(registry);
  return Object.fromEntries(RUNTIME_COMMON_KEYS.map((key) => [key, matrix[key]]));
}

export function runtimeMessages(messages) {
  return Object.fromEntries(RUNTIME_COMMON_KEYS.map((key) => [key, messages[key]]));
}

export function semanticSourceMessageMap(locale, domain = "common") {
  const english = loadMessageDomain("en", domain);
  const localized = loadMessageDomain(locale, domain);
  const promoted = readJson("data/i18n/home-about-semantic-keys.json");
  const explicitKeys = new Set(promoted.promotedKeys || []);
  const seen = new Map();
  const ambiguous = new Set();
  for (const [key, source] of Object.entries(english)) {
    if (explicitKeys.has(key)) continue;
    if (typeof source !== "string" || !source.trim()) continue;
    if (seen.has(source)) ambiguous.add(source);
    else seen.set(source, localized[key]);
  }
  for (const source of ambiguous) seen.delete(source);
  return seen;
}

export function explicitSemanticPageMap(source, locale, kind = "text", domain = "common") {
  const manifest = readJson("data/i18n/home-about-semantic-keys.json");
  if (manifest.schemaVersion !== 1) throw new Error("unsupported Home/About semantic-key manifest");
  const messages = loadMessageDomain(locale, domain);
  const entries = manifest.sources?.[source]?.[kind] || {};
  return new Map(Object.entries(entries).map(([copy, key]) => {
    if (typeof messages[key] !== "string" || !messages[key]) {
      throw new Error(`${source}: missing promoted semantic key ${key} for ${locale}`);
    }
    return [copy, messages[key]];
  }));
}

export function placeholderNames(value) {
  return [...new Set(
    [...String(value).matchAll(/\{([a-z][a-zA-Z0-9]*)\}/g)].map((match) => match[1]),
  )].sort(compareKeys);
}

export function interpolateMessage(value, parameters = {}) {
  const expected = placeholderNames(value);
  const supplied = Object.keys(parameters).sort(compareKeys);
  if (expected.join("\0") !== supplied.join("\0")) {
    throw new Error(`message placeholders differ: expected [${expected.join(", ")}], received [${supplied.join(", ")}]`);
  }
  return String(value).replace(/\{([a-z][a-zA-Z0-9]*)\}/g, (_, name) => String(parameters[name]));
}

export function messageCatalogErrors(reference, candidate) {
  const errors = [];
  const expectedKeys = Object.keys(reference).sort(compareKeys);
  const actualKeys = Object.keys(candidate).sort(compareKeys);
  for (const key of expectedKeys) {
    if (!Object.hasOwn(candidate, key)) errors.push(`missing:${key}`);
    else if (typeof candidate[key] !== "string" || !candidate[key].trim()) errors.push(`empty:${key}`);
    else if (placeholderNames(reference[key]).join("\0") !== placeholderNames(candidate[key]).join("\0")) {
      errors.push(`placeholders:${key}`);
    }
  }
  for (const key of actualKeys) if (!Object.hasOwn(reference, key)) errors.push(`extra:${key}`);
  return errors;
}
