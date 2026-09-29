import { readJson, loadRegistry, compareKeys } from "./i18n-catalog.mjs";

export const messageFile = (locale, domain) => `data/i18n/messages/${locale}/${domain}.json`;

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
