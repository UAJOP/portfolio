/* Build-time access to the authorities the accepted catalog runtime used for
 * copy that is not in the common message domain. Nothing here holds copy.
 *
 * Catalog search (js/features/ultimate.js getCatalogSearchLabels):
 * - Works: the "ultimate" structured-runtime surface. English and Turkish are
 *   the feature-module literals (loadDynamicSurface); German, Spanish and
 *   French are the authored data/i18n/packs/{locale}/dynamic.json overlays.
 *   (packs/tr/dynamic.json is derived from the same literal and checked by
 *   `build-locale-packs --check`.)
 * - Games: getI18nText(english, turkish) phrases. English is the phrase
 *   itself; every other locale is the authored phrase-compatibility pack
 *   data/i18n/packs/{locale}/pages.json, which the runtime consults first.
 *
 * Project roles: the canonical project facts. Flagships with a role use
 * data/portfolio/projects.json plus the packs/{locale}/content.json overlay;
 * every other project uses data/portfolio/project-details.json (reached via
 * projects.json detailSlug when present) plus packs/{locale}/projects.json,
 * resolved exactly like generated project pages (resolveCanonicalLocalizedData). */
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadDynamicSurface } from "./i18n-catalog.mjs";
import { resolveCanonicalLocalizedData } from "./shared-localization.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));

export const CATALOG_SEARCH_AUTHORITY = Object.freeze({
  works: Object.freeze({ authority: "structured-runtime", namespace: "ultimate", label: "projectSearchLabel", placeholder: "projectSearchPlaceholder" }),
  games: Object.freeze({ authority: "page-phrase", label: "Search games", placeholder: "Search by game, category or feature..." }),
});

const required = (value, where) => {
  if (typeof value !== "string" || !value) throw new Error(`catalog copy: missing ${where}`);
  return value;
};

export function defaultCatalogSources() {
  return {
    surface: (namespace) => loadDynamicSurface(namespace),
    dynamicPack: (locale) => readJson(`data/i18n/packs/${locale}/dynamic.json`),
    pagesPack: (locale) => readJson(`data/i18n/packs/${locale}/pages.json`),
  };
}

export function catalogSearchCopy(page, locale, sources = defaultCatalogSources()) {
  const authority = CATALOG_SEARCH_AUTHORITY[page];
  if (!authority) throw new Error(`catalog copy: no search authority for ${page}`);
  const field = (name) => {
    if (authority.authority === "structured-runtime") {
      const key = authority[name];
      const value = locale === "en" || locale === "tr"
        ? sources.surface(authority.namespace)?.[locale]?.[key]
        : sources.dynamicPack(locale)?.[authority.namespace]?.[key];
      return required(value, `${locale} ${authority.namespace}.${key}`);
    }
    const phrase = authority[name];
    return required(locale === "en" ? phrase : sources.pagesPack(locale)?.text?.[phrase], `${locale} phrase ${JSON.stringify(phrase)}`);
  };
  return { label: field("label"), placeholder: field("placeholder") };
}

export function defaultRoleSources() {
  return {
    projects: readJson("data/portfolio/projects.json"),
    details: readJson("data/portfolio/project-details.json"),
    pack: (locale, domain) => (locale === "en" ? {} : readJson(`data/i18n/packs/${locale}/${domain}.json`)),
  };
}

/** Returns the canonical source of a project's role, or null if none exists. */
export function projectRoleSource(ref, sources = defaultRoleSources()) {
  const flagship = sources.projects[ref];
  if (flagship?.role) return { kind: "flagship", id: ref };
  const slug = flagship?.detailSlug || ref;
  return sources.details[slug]?.role ? { kind: "detail", slug } : null;
}

export function projectRole(ref, locale, sources = defaultRoleSources()) {
  const source = projectRoleSource(ref, sources);
  if (!source) throw new Error(`project role: ${ref} has no canonical role`);
  if (source.kind === "flagship") {
    const overlay = { role: sources.pack(locale, "content")[`projects.${ref}.role`] };
    return resolveCanonicalLocalizedData({ canonical: sources.projects[ref], overlay, path: "role", locale });
  }
  return resolveCanonicalLocalizedData({
    canonical: sources.details[source.slug],
    overlay: sources.pack(locale, "projects")[source.slug] || {},
    path: "role",
    locale,
  });
}
