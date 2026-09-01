/**
 * Locale route mapping (BRIEF 09C).
 *
 * Once real localized static routes exist, the URL is the strongest locale
 * authority. This module owns the one answer to
 *
 *     current route + target locale = equivalent localized route
 *
 * so no feature rebuilds route strings by hand and no locale prefix can ever
 * stack (`/tr/de/works.html` is unrepresentable here).
 *
 * URL shape
 *   English   /            /works.html            /projects/<slug>/
 *   Localized /tr/         /tr/works.html         /tr/projects/<slug>/
 *
 * English is the unprefixed default; `/en/` does not exist.
 *
 * The same file is evaluated by scripts/generate-localized-routes.mjs inside a
 * sandbox with a stub `window`, so generation and runtime can never disagree
 * about what a localized route is. Keep it free of DOM access at load time.
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
  /* The known route inventory. Anything not in it — assets, stylesheets,
   * scripts, PDFs — is a file, not a page, and must never take a locale
   * prefix. */
  const routes = new Set(Array.isArray(config.routes) ? config.routes : []);
  return Object.freeze({ defaultLocale, prefixes, ordered, routes, ids: locales.map((item) => item.id) });
})();

/**
 * Query parameters that survive a locale switch.
 *
 * `project` is deliberately absent: the legacy shell's slug is re-expressed as
 * a canonical `/projects/<slug>/` path, so carrying it too would duplicate the
 * identity in the URL.
 */
const LOCALE_ROUTE_SAFE_PARAMS = ["role"];

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
 * leading slash. The site root is "".
 */
function canonicalRouteKey(routePath) {
  /* A directory and its index document are the same route; the site root is "". */
  return stripLocaleRoutePrefix(routePath).route.replace(/(^|\/)index\.html$/, "$1");
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

/** Keeps meaningful query parameters and drops campaign/tracking noise. */
function preservedRouteSearch(search) {
  const kept = [];
  for (const name of LOCALE_ROUTE_SAFE_PARAMS) {
    const value = readRouteParam(search, name);
    if (value) kept.push(`${name}=${encodeURIComponent(value)}`);
  }
  return kept.length ? `?${kept.join("&")}` : "";
}

/**
 * The absolute pathname of the site root for the current document.
 *
 * Generated pages declare their depth (`<body data-site-root="../">`), so the
 * root is derived rather than assumed to be "/". That keeps the site working
 * from a subdirectory and over file://.
 */
function siteRootPathname() {
  if (typeof document === "undefined" || typeof window === "undefined") return "/";
  const relative = (document.body && document.body.dataset.siteRoot) || "";
  try {
    const url = new URL(relative || ".", window.location.href);
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
  const relative = pathname.startsWith(root) ? pathname.slice(root.length) : pathname.replace(/^\/+/, "");
  /* A directory URL ends at its index document. */
  return relative;
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
 * Fragments survive because they address content the reader is looking at;
 * tracking parameters do not.
 */
function localizedHrefForCurrentPage(locale) {
  if (typeof window === "undefined") return "";
  const routeKey = canonicalRouteKey(currentRoutePath());
  const target = localizedRouteKey(routeKey, locale, window.location.search);
  const search = preservedRouteSearch(window.location.search);
  return `${siteRootPathname()}${target}${search}${window.location.hash || ""}`;
}

/**
 * Rewrites one internal link so it stays inside `locale`.
 *
 * External URLs, protocol-relative URLs, `mailto:`/`tel:` and bare fragments
 * are returned untouched — a language switch must never rewrite a GitHub,
 * LinkedIn or live-demo destination.
 *
 * Only paths in the known route inventory take a locale prefix. Assets keep
 * their single root-relative identity: there is no `/de/assets/`, and inventing
 * one would 404 every image on a localized page.
 *
 * Two depths matter on a generated page and they are not the same one:
 * `siteRoot` reaches the repository root (where assets live) and `localeRoot`
 * reaches the locale's own root (where sibling pages live). On `/de/works.html`
 * they are `../` and `` respectively; on `/de/projects/slug/`, `../../../` and
 * `../../`.
 */
function localizedInternalHref(href, locale, { siteRoot = "", localeRoot = null } = {}) {
  const value = String(href || "");
  if (!value || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return value;

  const [pathAndQuery, ...hashParts] = value.split("#");
  const hash = hashParts.length ? `#${hashParts.join("#")}` : "";
  const [rawPath, ...queryParts] = pathAndQuery.split("?");
  const search = queryParts.length ? `?${queryParts.join("?")}` : "";
  const rootRelative = rawPath.startsWith("/");
  const bare = rootRelative ? rawPath : rawPath.replace(/^(?:\.\.\/)+/, "").replace(/^\.\//, "");
  const routeKey = canonicalRouteKey(bare);

  if (!isLocalizableRoute(routeKey)) {
    /* Not a page: hand back an asset path valid from this page's depth. */
    return rootRelative ? value : `${siteRoot}${bare}${search}${hash}`;
  }

  const prefix = rootRelative ? "/" : localeRoot === null ? siteRoot : localeRoot;
  const localized = rootRelative
    ? localizedRouteKey(routeKey, locale, search)
    : localizedRouteKey(routeKey, locale, search).slice(localeRoot === null ? 0 : localeRoutePrefix(locale).length);
  /* The site root has no filename of its own. A relative link needs one, or it
   * would collapse to an empty href; a root-relative link does not, so it gets
   * the canonical directory form the sitemap and canonical tags use. */
  const named =
    routeKey === "" && !rootRelative && /(^|\/)index\.html$/.test(bare) ? `${localized}index.html` : localized;
  const preserved = preservedRouteSearch(search);
  return `${prefix}${named}${preserved}${hash}`;
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
    siteRootPathname,
    currentRoutePath,
    documentRouteLocale,
    localizedHrefForCurrentPage,
    localizedInternalHref,
    safeParams: LOCALE_ROUTE_SAFE_PARAMS,
  });
}
