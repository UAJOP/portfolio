/**
 * Canonical public routes and locale route mapping (BRIEF 09C, Clean Public
 * URLs V1).
 *
 * Once real localized static routes exist, the URL is the strongest locale
 * authority. This module owns the one answer to
 *
 *     current route + target locale = equivalent localized route
 *
 * so no feature rebuilds route strings by hand and no locale prefix can ever
 * stack (`/tr/de/works/` is unrepresentable here).
 *
 * URL shape — every public page is a directory, never a `.html` file:
 *   English   /            /works/            /projects/<slug>/
 *   Localized /tr/         /tr/works/         /tr/projects/<slug>/
 *
 * English is the unprefixed default; `/en/` does not exist. Slugs are never
 * translated, so a language switch only ever changes the prefix.
 *
 * The route table comes from data/site/routes.json through the generated
 * i18n-data.js. The same file is evaluated by the build scripts and QA inside a
 * sandbox with a stub `window`, so generation, the sitemap, QA and the browser
 * can never disagree about what a route is. Keep it free of DOM access at load
 * time.
 */
const siteLocaleRoutes = (() => {
  const config = (typeof window !== "undefined" && window.KAAN_I18N) || {};
  const locales = Array.isArray(config.locales) ? config.locales : [];
  const defaultLocale = config.defaultLocale || "en";
  const prefixes = new Map();
  for (const locale of locales) {
    const prefix = locale.routePrefix ?? (locale.id === defaultLocale ? "" : locale.id);
    prefixes.set(locale.id, prefix ? `${prefix}/` : "");
  }
  if (!prefixes.has(defaultLocale)) prefixes.set(defaultLocale, "");
  /* Longest first so a future two-segment prefix cannot be shadowed. */
  const ordered = [...prefixes.entries()]
    .filter(([, prefix]) => prefix !== "")
    .sort((a, b) => b[1].length - a[1].length);

  const table = config.routeTable || {};
  const pages = Array.isArray(table.pages) ? table.pages : [];
  const companions = Array.isArray(table.companions) ? table.companions : [];
  const byId = new Map(pages.map((page) => [page.id, page]));
  /* Pre-migration `.html` paths, mapped onto the clean route they became. Input
   * only: nothing this module returns ever ends in one of these. */
  const legacy = new Map(pages.filter((page) => page.legacy).map((page) => [page.legacy, page.route]));

  /* The known route inventory. Anything not in it — assets, stylesheets,
   * scripts, PDFs — is a file, not a page, and must never take a locale
   * prefix. */
  const routes = new Set([...pages.map((page) => page.route), ...companions]);
  return Object.freeze({
    defaultLocale,
    prefixes,
    ordered,
    routes,
    pages,
    byId,
    legacy,
    companions,
    projectRoute: table.projectRoute || "projects/{slug}/",
    ids: locales.map((item) => item.id),
  });
})();

/**
 * Query parameters a locale switch deliberately drops.
 *
 * `project` is re-expressed as a canonical `/projects/<slug>/` path, so
 * carrying it too would duplicate the identity in the URL. Campaign and click
 * identifiers describe how the reader arrived, not what they are looking at.
 * Every other parameter — `role`, `source`, anything a feature adds later —
 * survives, in its original order and encoding.
 */
const LOCALE_ROUTE_DROPPED_PARAMS = ["project", "gclid", "fbclid", "msclkid", "dclid", "mc_cid", "mc_eid"];
const LOCALE_ROUTE_DROPPED_PREFIXES = ["utm_"];

/**
 * The canonical project route shape.
 *
 * Matching on shape as well as inventory membership means a project added to
 * the canonical data before its page is regenerated still routes as a page
 * rather than being mistaken for an asset and losing its locale.
 */
const PROJECT_ROUTE_SHAPE = /^projects\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;

/** True when a route key addresses a page this site localizes. */
function isLocalizableRoute(routeKey) {
  return siteLocaleRoutes.routes.has(routeKey) || PROJECT_ROUTE_SHAPE.test(routeKey);
}

/** The `<locale>/` prefix for a locale, or "" for the default locale. */
function localeRoutePrefix(locale) {
  return siteLocaleRoutes.prefixes.get(locale) ?? "";
}

/**
 * Splits a site-relative path into its locale prefix and the remainder.
 * Applied repeatedly so an already-stacked prefix collapses instead of growing.
 */
function stripLocaleRoutePrefix(routePath) {
  let rest = String(routePath || "").replace(/^\/+/, "");
  let locale = siteLocaleRoutes.defaultLocale;
  let matched = true;
  while (matched) {
    matched = false;
    for (const [id, prefix] of siteLocaleRoutes.ordered) {
      if (rest === prefix.slice(0, -1) || rest.startsWith(prefix)) {
        locale = id;
        rest = rest === prefix.slice(0, -1) ? "" : rest.slice(prefix.length);
        matched = true;
        break;
      }
    }
  }
  return { locale, route: rest };
}

/** The locale a site-relative path represents. */
function localeFromRoutePath(routePath) {
  return stripLocaleRoutePrefix(routePath).locale;
}

/**
 * The canonical route key for a site-relative path: no locale prefix, no
 * leading slash, no index document. The site root is "".
 *
 * Legacy input is normalized rather than rejected — `/tr/about.html`,
 * `/single-work.html` and `/works` all resolve to the route they became — so
 * old bookmarks, crawled links and pre-migration data keep landing on a real
 * page. Output built from this key never contains `.html`.
 */
function canonicalRouteKey(routePath) {
  const key = stripLocaleRoutePrefix(routePath).route.replace(/(^|\/)index\.html$/, "$1");
  if (siteLocaleRoutes.legacy.has(key)) return siteLocaleRoutes.legacy.get(key);
  if (key && !key.endsWith("/") && isLocalizableRoute(`${key}/`)) return `${key}/`;
  return key;
}

/**
 * Rewrites a canonical route key into `locale`.
 *
 * The legacy project shell is intentionally mapped onto the canonical project
 * route: it is a compatibility endpoint, so a language switch should land the
 * reader on the real localized page rather than duplicate a query-string URL
 * per locale.
 */
function localizedRouteKey(routeKey, locale, search) {
  const key = canonicalRouteKey(routeKey);
  if (key === "project-detail.html") {
    const slug = readRouteParam(search, "project");
    if (slug) return `${localeRoutePrefix(locale)}projects/${encodeURIComponent(slug)}/`;
  }
  return `${localeRoutePrefix(locale)}${key}`;
}

function readRouteParam(search, name) {
  if (!search) return null;
  const query = String(search).replace(/^\?/, "");
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const separator = pair.indexOf("=");
    const key = decodeURIComponent(separator < 0 ? pair : pair.slice(0, separator));
    if (key === name) return decodeURIComponent((separator < 0 ? "" : pair.slice(separator + 1)).replace(/\+/g, " "));
  }
  return null;
}

/** Keeps meaningful query parameters and drops identity and tracking noise. */
function preservedRouteSearch(search) {
  const query = String(search || "").replace(/^\?/, "");
  const kept = query.split("&").filter((pair) => {
    if (!pair) return false;
    const separator = pair.indexOf("=");
    let name = separator < 0 ? pair : pair.slice(0, separator);
    try {
      name = decodeURIComponent(name);
    } catch (error) {
      /* A malformed name is still a name; keep comparing it verbatim. */
    }
    name = name.toLowerCase();
    if (LOCALE_ROUTE_DROPPED_PARAMS.includes(name)) return false;
    return !LOCALE_ROUTE_DROPPED_PREFIXES.some((prefix) => name.startsWith(prefix));
  });
  return kept.length ? `?${kept.join("&")}` : "";
}

/* ---------- canonical route API ---------- */

/**
 * The public URL for a page, by its stable id, in `locale`.
 *
 *     routeFor("works")        -> "/works/"
 *     routeFor("works", "tr")  -> "/tr/works/"
 *     routeFor("home", "de")   -> "/de/"
 */
function routeFor(id, locale = siteLocaleRoutes.defaultLocale) {
  const page = siteLocaleRoutes.byId.get(id);
  if (!page) throw new Error(`unknown route id ${id}`);
  return `/${localeRoutePrefix(locale)}${page.route}`;
}

/** The route key (no leading slash, no locale) for a project slug. */
function projectRouteKey(slug) {
  return siteLocaleRoutes.projectRoute.replace("{slug}", encodeURIComponent(slug));
}

/**
 * The public URL for a canonical project, in `locale`.
 *
 *     routeForProject("hospital-form-app", "de") -> "/de/projects/hospital-form-app/"
 */
function routeForProject(slug, locale = siteLocaleRoutes.defaultLocale) {
  return `/${localeRoutePrefix(locale)}${projectRouteKey(slug)}`;
}

/**
 * The repository file that serves a route in `locale`.
 *
 * A directory route is served by its `index.html`; a companion document (the
 * 404 page, the legacy project shell) is served as itself. This is the only
 * place the site maps a public URL onto a file.
 */
function documentPathFor(routeKey, locale = siteLocaleRoutes.defaultLocale) {
  const key = canonicalRouteKey(routeKey);
  const file = key === "" || key.endsWith("/") ? `${key}index.html` : key;
  return `${localeRoutePrefix(locale)}${file}`;
}

/**
 * The absolute pathname of the site root for the current document.
 *
 * Every first-party URL is root-relative, so this is "/" — unless a page
 * declares otherwise with `<body data-site-root>`, which keeps the site
 * relocatable under a subdirectory without touching any route string.
 */
function siteRootPathname() {
  if (typeof document === "undefined" || typeof window === "undefined") return "/";
  const declared = (document.body && document.body.dataset.siteRoot) || "/";
  try {
    const url = new URL(declared, window.location.href);
    return url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  } catch (error) {
    return "/";
  }
}

/** The current document's site-relative path, including any locale prefix. */
function currentRoutePath() {
  if (typeof window === "undefined") return "";
  const root = siteRootPathname();
  const pathname = window.location.pathname;
  return pathname.startsWith(root) ? pathname.slice(root.length) : pathname.replace(/^\/+/, "");
}

/**
 * The locale this page IS.
 *
 * Generated pages state it declaratively, which is what lets the parser-blocking
 * bootstrap know the locale before `<body>` exists. The pathname is the
 * fallback for any page that predates the marker.
 */
function documentRouteLocale() {
  if (typeof document === "undefined") return siteLocaleRoutes.defaultLocale;
  const declared = document.documentElement.getAttribute("data-route-locale");
  if (declared && siteLocaleRoutes.prefixes.has(declared)) return declared;
  return localeFromRoutePath(currentRoutePath());
}

/**
 * The equivalent URL for the current page in `locale`.
 *
 * The query and the fragment survive, because they address what the reader is
 * looking at; only identity already expressed in the path and tracking noise
 * are dropped.
 */
function localizedHrefForCurrentPage(locale) {
  if (typeof window === "undefined") return "";
  const routeKey = canonicalRouteKey(currentRoutePath());
  const target = localizedRouteKey(routeKey, locale, window.location.search);
  const search = preservedRouteSearch(window.location.search);
  return `${siteRootPathname()}${target}${search}${window.location.hash || ""}`;
}

/**
 * Rewrites one internal URL so it stays inside `locale`, as a root-relative
 * path.
 *
 * External URLs, protocol-relative URLs, `mailto:`/`tel:` and bare fragments
 * are returned untouched — a language switch must never rewrite a GitHub,
 * LinkedIn or live-demo destination.
 *
 * Input is either root-relative (`/works/`, `/assets/logo.webp`) or
 * site-relative (`projects/slug/`, `assets/logo.webp`). Only paths in the
 * known route inventory take a locale prefix. Assets keep their single
 * identity: there is no `/de/assets/`, and inventing one would 404 every image
 * on a localized page.
 *
 * Output is always root-relative, so it means the same thing at every depth —
 * `/tr/`, `/de/works/` and `/fr/projects/<slug>/` alike — with no `../` chain
 * to compute or get wrong.
 */
function localizedInternalHref(href, locale, { siteRoot = "/" } = {}) {
  const value = String(href || "");
  if (!value || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return value;

  const [pathAndQuery, ...hashParts] = value.split("#");
  const hash = hashParts.length ? `#${hashParts.join("#")}` : "";
  const [rawPath, ...queryParts] = pathAndQuery.split("?");
  const search = queryParts.length ? `?${queryParts.join("?")}` : "";
  const bare = rawPath.replace(/^\/+/, "").replace(/^(?:\.\.?\/)+/, "");
  const routeKey = canonicalRouteKey(bare);

  if (!isLocalizableRoute(routeKey)) {
    /* Not a page: the same file from every page and every locale. */
    return `${siteRoot}${bare}${search}${hash}`;
  }

  return `${siteRoot}${localizedRouteKey(routeKey, locale, search)}${preservedRouteSearch(search)}${hash}`;
}

if (typeof window !== "undefined") {
  window.KAAN_LOCALE_ROUTES = Object.freeze({
    isLocalizableRoute,
    localeRoutePrefix,
    stripLocaleRoutePrefix,
    localeFromRoutePath,
    canonicalRouteKey,
    localizedRouteKey,
    preservedRouteSearch,
    routeFor,
    routeForProject,
    projectRouteKey,
    documentPathFor,
    siteRootPathname,
    currentRoutePath,
    documentRouteLocale,
    localizedHrefForCurrentPage,
    localizedInternalHref,
    pages: siteLocaleRoutes.pages,
    companions: siteLocaleRoutes.companions,
    droppedParams: LOCALE_ROUTE_DROPPED_PARAMS,
  });
}
