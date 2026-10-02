/* Build-time copy for the #28 React overlay shells (Ajoop panel chrome and
 * Command Palette chrome). Nothing here holds copy.
 *
 * The runtime resolves this copy with getLocalizedCollection() and
 * getI18nText() (js/core/locale.js) over the feature literals and the locale
 * pack each React page actually loads, i18n/pack-{locale}-core.js. The SSR
 * model resolves it the same way from the same files: English is the
 * evaluated feature literal, every other locale is that literal with the
 * shipped core pack merged over it by locale.js's own mergeLocaleCopy, and
 * phrases come from the same pack. The #28 gate proves SSR copy equals the
 * copy the runtime hands React after hydration, in every locale. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT, loadDynamicSurface } from "./i18n-catalog.mjs";

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

/** locale.js's mergeLocaleCopy, evaluated from its source rather than restated. */
const mergeLocaleCopy = (() => {
  const source = read("js/core/locale.js");
  const start = source.indexOf("function mergeLocaleCopy(");
  const end = source.indexOf("\n}\n", start);
  if (start < 0 || end < 0) throw new Error("js/core/locale.js no longer defines mergeLocaleCopy");
  return vm.runInNewContext(`(${source.slice(start, end + 2)})`);
})();

const packs = new Map();
/** The core pack a React page loads for `locale`, as the browser evaluates it. */
function corePack(locale) {
  if (!packs.has(locale)) {
    const window = {};
    vm.runInNewContext(read(`i18n/pack-${locale}-core.js`), { window });
    const pack = window.KAAN_I18N_PACKS?.[locale];
    if (!pack) throw new Error(`i18n/pack-${locale}-core.js did not define the ${locale} pack`);
    packs.set(locale, pack);
  }
  return packs.get(locale);
}

const surfaces = new Map();
const surface = (namespace) => {
  if (!surfaces.has(namespace)) surfaces.set(namespace, loadDynamicSurface(namespace));
  return surfaces.get(namespace);
};

/** getLocalizedCollection(<feature literal>, locale, namespace). */
export function runtimeCollection(namespace, locale) {
  const collection = surface(namespace);
  if (locale === "en") return collection.en;
  const inline = collection[locale] || collection.en;
  const packed = corePack(locale)?.dynamic?.[namespace];
  return packed ? mergeLocaleCopy(collection.en, packed) : inline;
}

/** getI18nText(english, turkish, locale). */
export function runtimePhrase(english, turkish, locale) {
  if (locale === "en") return english;
  const packed = corePack(locale)?.pages?.text?.[english];
  if (typeof packed === "string" && packed) return packed;
  return locale === "tr" ? turkish : english;
}

const required = (value, what, locale) => {
  if (typeof value !== "string" || !value) throw new Error(`#28 ${locale}: missing ${what}`);
  return value;
};

export function ajoopShellModel(locale) {
  const content = runtimeCollection("ajoop", locale);
  const field = (key) => required(content[key], `ajoop.${key}`, locale);
  return {
    language: locale,
    copy: {
      launcher: field("launcher"),
      title: field("title"),
      subtitle: required(runtimePhrase("Portfolio Copilot", "Portfolyo Asistanı", locale), "Ajoop subtitle", locale),
      inputPlaceholder: field("inputPlaceholder"),
      sendLabel: field("sendLabel"),
      openLabel: field("openLabel"),
      closeLabel: field("closeLabel"),
    },
    mascot: { state: "idle", label: required(runtimePhrase("Ready", "Hazır", locale), "Ajoop resting label", locale) },
  };
}

export function commandPaletteModel(locale) {
  const content = runtimeCollection("ultimate", locale);
  const field = (key) => required(content[key], `ultimate.${key}`, locale);
  return {
    language: locale,
    copy: {
      commandsTitle: field("commandsTitle"),
      commandPlaceholder: field("commandPlaceholder"),
      commandDialogLabel: field("commandDialogLabel"),
      noResults: field("noResults"),
    },
  };
}
