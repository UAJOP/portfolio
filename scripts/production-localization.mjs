/** Node-side canonical catalog loader used by production React prerendering. */
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadRegistry } from "./i18n-catalog.mjs";
import { createMessageResolver, resolveLocalizedData, resolveCanonicalLocalizedData } from "./shared-localization.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));

export function loadProductionLocalization(locale) {
  const registry = loadRegistry();
  if (!registry.byId.has(locale)) throw new Error(`unknown production locale ${locale}`);
  const messages = readJson(`data/i18n/messages/${locale}/common.json`);
  const packs = locale === registry.defaultLocale
    ? {}
    : {
        content: readJson(`data/i18n/packs/${locale}/content.json`),
        projects: readJson(`data/i18n/packs/${locale}/projects.json`),
        meta: readJson(`data/i18n/packs/${locale}/meta.json`),
      };
  return {
    locale,
    definition: registry.byId.get(locale),
    messages,
    packs,
    message: createMessageResolver(messages, { locale, context: "production React" }),
    localizedData: (options) => resolveLocalizedData({ locale, ...options }),
    canonicalData: (options) => resolveCanonicalLocalizedData({ locale, defaultLocale: registry.defaultLocale, ...options }),
  };
}
