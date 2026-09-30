/** Canonical production route adapter for React build/prerender tooling. */
import { loadRegistry, loadProjectRegistry, projectSlugs, routePrefixFor } from "./i18n-catalog.mjs";
import { loadSiteRoutes, sourceDocumentFor } from "./site-routes.mjs";

const publicPathFor = (route, prefix = "") => `/${prefix}${route}`;
const documentFor = (route, prefix = "") => `${prefix}${sourceDocumentFor(route)}`;

export function canonicalReactRoutes({
  site = loadSiteRoutes(),
  locales = loadRegistry(),
  projects = loadProjectRegistry(),
} = {}) {
  const localeIds = [
    locales.defaultLocale,
    ...(locales.localizedRoutes?.generate || []).filter((id) => id !== locales.defaultLocale),
  ];
  const records = [];

  for (const locale of localeIds) {
    const prefix = routePrefixFor(locale, locales);
    for (const page of site.pages) {
      records.push({
        kind: "page",
        id: page.id,
        routeId: page.id,
        locale,
        route: page.route,
        pathname: publicPathFor(page.route, prefix),
        output: documentFor(page.route, prefix),
        renderer: page.renderer,
      });
    }
    for (const slug of projectSlugs(projects)) {
      const route = site.projects.route.replace("{slug}", slug);
      records.push({
        kind: "project",
        id: `project:${slug}`,
        routeId: "project",
        slug,
        locale,
        route,
        pathname: publicPathFor(route, prefix),
        output: documentFor(route, prefix),
        renderer: site.projects.renderer,
      });
    }
    for (const companion of site.companions) {
      records.push({
        kind: "companion",
        id: companion.id,
        routeId: companion.id,
        locale,
        route: companion.document,
        pathname: publicPathFor(companion.document, prefix),
        output: `${prefix}${companion.document}`,
        renderer: companion.renderer,
      });
    }
  }
  return records;
}
export function productionReactRoutes(options) {
  return canonicalReactRoutes(options).filter((route) => route.renderer === "react");
}

export function findCanonicalReactRoute(pathname, options) {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return canonicalReactRoutes(options).find((route) => route.pathname === normalized) || null;
}
