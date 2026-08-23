/**
 * React-shell translation utility.
 *
 * The strings themselves live in `data/i18n/react-shell.json`, keyed as
 * `key -> { en, tr }` — the same bilingual shape the portfolio registry uses, so
 * both data layers read the same way.
 *
 * Scope note: this covers the React shell and the design-system preview only.
 * The production translation system in `legacy-script.js` is untouched, and page
 * copy migrates with each page rather than in one sweep.
 */
import strings from "@data/i18n/react-shell.json";

export const SUPPORTED_LANGUAGES = ["en", "tr"];
export const DEFAULT_LANGUAGE = "en";

export { strings };

/**
 * Returns the translated string.
 *
 * A missing key returns the key itself rather than an empty string, so drift is
 * visible in the UI and in a Pa11y run instead of silently blanking a label.
 */
export function translate(language, key) {
  const entry = strings[key];
  if (!entry) return key;
  return entry[language] || entry[DEFAULT_LANGUAGE] || key;
}
