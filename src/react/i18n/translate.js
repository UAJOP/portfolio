/**
 * React-shell translation utility.
 *
 * The strings live beside production messages in per-locale, stable-key source
 * files. The preview intentionally supports EN/TR only until it becomes a
 * production surface; active production locale coverage is enforced separately.
 *
 * Scope note: this covers the React shell and the design-system preview only.
 * The production translation system in `legacy-script.js` is untouched, and page
 * copy migrates with each page rather than in one sweep.
 */
import en from "@data/i18n/messages/en/react-preview.json";
import tr from "@data/i18n/messages/tr/react-preview.json";

export const SUPPORTED_LANGUAGES = ["en", "tr"];
export const DEFAULT_LANGUAGE = "en";

export const strings = { en, tr };

/**
 * Returns the translated string.
 *
 * A missing key returns the key itself rather than an empty string, so drift is
 * visible in the UI and in a Pa11y run instead of silently blanking a label.
 */
export function translate(language, key) {
  return strings[language]?.[key] || strings[DEFAULT_LANGUAGE]?.[key] || key;
}
