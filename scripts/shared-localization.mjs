/** Pure fail-closed localization primitives shared by generators and React SSR. */
const present = (value) => value !== undefined && value !== null && value !== "";

export function requireSemanticMessage(messages, key, { locale = "unknown", context = "message" } = {}) {
  const value = messages?.[key];
  if (!present(value)) {
    throw new Error(`${context}: missing required semantic key ${key} for locale ${locale}`);
  }
  return value;
}
export function createMessageResolver(messages, { locale = "unknown", context = "message" } = {}) {
  return (key) => key == null || key === "" ? null : requireSemanticMessage(messages, key, { locale, context });
}

/**
 * Resolve structured copy without an implicit English fallback.
 * Language-neutral facts are accepted only when the caller marks them as such.
 */
export function resolveLocalizedData({
  locale,
  path,
  localizedValue,
  neutralValue,
  languageNeutral = false,
  required = true,
}) {
  if (present(localizedValue)) return localizedValue;
  if (languageNeutral && present(neutralValue)) return neutralValue;
  if (!required) return null;
  const reason = languageNeutral ? "localized or neutral value" : "localized value";
  throw new Error(`localized data: missing required ${reason} at ${path} for locale ${locale}`);
}

const pathSegments = (value) => String(value).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
export function valueAtPath(source, dataPath) {
  if (source == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(source, dataPath)) return source[dataPath];
  return pathSegments(dataPath).reduce((value, segment) => value?.[segment], source);
}

export function localizedBuildLogEntry({ entry, overlay = {}, locale, defaultLocale = "en" }) {
  if (!entry?.id) throw new Error("localized build log: entry has no stable id");
  const field = (name) => resolveLocalizedData({
    locale,
    path: `buildLogById.${entry.id}.${name}`,
    localizedValue: locale === defaultLocale ? entry[name]?.[defaultLocale] : overlay[`buildLogById.${entry.id}.${name}`] ?? entry[name]?.[locale],
  });
  return { ...entry, title: field("title"), detail: field("detail") };
}

/** Resolve a canonical data path plus its reviewed locale overlay. */
export function resolveCanonicalLocalizedData({
  canonical,
  overlay = {},
  path,
  locale,
  defaultLocale = "en",
  languageNeutral = false,
  required = true,
}) {
  const canonicalValue = valueAtPath(canonical, path);
  const overlaid = valueAtPath(overlay, path);
  const embedded = canonicalValue && typeof canonicalValue === "object" && !Array.isArray(canonicalValue)
    ? canonicalValue[locale]
    : undefined;
  const defaultValue = canonicalValue && typeof canonicalValue === "object" && !Array.isArray(canonicalValue)
    ? canonicalValue[defaultLocale]
    : canonicalValue;
  const localizedValue = locale === defaultLocale ? defaultValue : (overlaid ?? embedded);
  return resolveLocalizedData({
    locale,
    path,
    localizedValue,
    neutralValue: defaultValue,
    languageNeutral,
    required,
  });
}
