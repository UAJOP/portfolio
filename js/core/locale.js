/**
 * Central locale authority for the static portfolio runtime.
 *
 * Canonical configuration is generated from data/i18n/locales.json into
 * i18n-data.js before this module loads. Every feature must read locale state
 * through this contract instead of creating its own storage or browser-locale
 * logic.
 *
 * BRIEF 09C makes the URL authoritative. A page served from a localized static
 * route IS that locale: no saved preference and no browser language may
 * override it, because canonical and hreflang promise search engines that
 * /de/works.html is the German page. Preference and browser detection now only
 * influence where the language selector takes you, never what the current URL
 * renders as.
 */
const siteLocaleRegistry = (() => {
  const config = window.KAAN_I18N || {};
  const locales = Array.isArray(config.locales) ? config.locales : [];
  const byId = new Map(locales.map((item) => [item.id, Object.freeze({ ...item })]));
  const active = locales.filter((item) => item.active);
  const fallback = byId.get(config.defaultLocale) || active[0] || {
    id: "en",
    nativeLabel: "English",
    label: "English",
    dir: "ltr",
    active: true,
    default: true,
  };
  return Object.freeze({
    storageKey: config.storageKey || "kaanbalci-site-language",
    defaultLocale: fallback.id,
    locales: Object.freeze(locales.map((item) => Object.freeze({ ...item }))),
    active: Object.freeze(active.map((item) => Object.freeze({ ...item }))),
    byId,
  });
})();

function normalizeLocaleId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .split("-")[0];
}

function getLocaleDefinition(value, { activeOnly = false } = {}) {
  const id = normalizeLocaleId(value);
  const locale = siteLocaleRegistry.byId.get(id) || null;
  if (!locale) return null;
  if (activeOnly && !locale.active) return null;
  return locale;
}

function isKnownLocale(value) {
  return Boolean(getLocaleDefinition(value));
}

function isActiveLocale(value) {
  return Boolean(getLocaleDefinition(value, { activeOnly: true }));
}

/* ---------- route locale ---------- */

/**
 * The locale this document IS.
 *
 * The parser-blocking bootstrap already resolved it — from the page's own
 * `data-route-locale`, or from the failed pathname on the root 404 — and left
 * the result on `window.__KAAN_ROUTE_LOCALE__`. Reading the attribute as well
 * keeps this module usable if the bootstrap is ever absent.
 *
 * Named distinctly from the `documentRouteLocale()` helper in
 * `locale-routes.js`: these modules share one global lexical scope, so a
 * repeated identifier is a syntax error, not a shadow.
 */
const documentLocaleId = (() => {
  const declared = window.__KAAN_ROUTE_LOCALE__ || document.documentElement.getAttribute("data-route-locale");
  return getLocaleDefinition(declared)?.id || null;
})();

/**
 * A locale is renderable when it is active, or when it is the locale this route
 * was generated for. The second case is what lets a candidate locale be
 * reviewed on its real static routes while staying unexposed everywhere else.
 */
function isRenderableLocale(value) {
  const id = normalizeLocaleId(value);
  return isActiveLocale(id) || (documentLocaleId !== null && id === documentLocaleId);
}

function renderableLocaleId(value) {
  const id = normalizeLocaleId(value);
  return isRenderableLocale(id) ? id : siteLocaleRegistry.defaultLocale;
}

function getRouteLocale() {
  return documentLocaleId;
}

/* ---------- preference and detection ---------- */

function getStoredLocale() {
  try {
    const stored = localStorage.getItem(siteLocaleRegistry.storageKey);
    return getLocaleDefinition(stored, { activeOnly: true })?.id || null;
  } catch (error) {
    return null;
  }
}

function getBrowserLocale() {
  const preferences = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  for (const value of preferences) {
    const locale = getLocaleDefinition(value, { activeOnly: true });
    if (locale) return locale.id;
  }
  return null;
}

/**
 * Locale resolution priority.
 *
 * 1. The route's own locale — absolute, so a direct URL always wins
 * 2. Saved preference (active locales only)
 * 3. First matching active browser language
 * 4. Default locale
 *
 * Steps 2-4 only ever run on a page that declares no route locale.
 */
function resolveInitialLocale() {
  if (documentLocaleId) return documentLocaleId;
  const prepaint = getLocaleDefinition(window.__KAAN_PREPAINT_LOCALE__, { activeOnly: true });
  if (prepaint) return prepaint.id;
  return getStoredLocale() || getBrowserLocale() || siteLocaleRegistry.defaultLocale;
}

let currentSiteLanguage = resolveInitialLocale();
const localeSubscribers = new Set();

function getCurrentLocale() {
  return currentSiteLanguage;
}

function getActiveLocales() {
  return siteLocaleRegistry.active.slice();
}

/**
 * Locales the language selector may offer: the active ones, plus this route's
 * own locale so a candidate locale under review can switch back out of itself.
 */
function getSelectableLocales() {
  const selectable = getActiveLocales();
  if (documentLocaleId && !selectable.some((item) => item.id === documentLocaleId)) {
    const definition = siteLocaleRegistry.byId.get(documentLocaleId);
    if (definition) selectable.push(definition);
  }
  return selectable;
}

function getNextActiveLocale(locale = currentSiteLanguage) {
  const selectable = getSelectableLocales();
  if (!selectable.length) return siteLocaleRegistry.defaultLocale;
  const index = Math.max(0, selectable.findIndex((item) => item.id === locale));
  return selectable[(index + 1) % selectable.length].id;
}

function persistSiteLocale(locale) {
  try {
    localStorage.setItem(siteLocaleRegistry.storageKey, locale);
    return true;
  } catch (error) {
    return false;
  }
}

/* ---------- translation packs ---------- */

/**
 * The shipped pack for a locale, if this page loaded one.
 *
 * Packs are scope-split: a page carries `core` plus whatever its page type
 * renders, so a reader pays for one locale and one page type rather than for
 * every translation on the site.
 */
function getLocalePack(locale = currentSiteLanguage) {
  return (window.KAAN_I18N_PACKS && window.KAAN_I18N_PACKS[normalizeLocaleId(locale)]) || null;
}

/** Deep-merges pack copy over the English shape so a gap degrades, not breaks. */
function mergeLocaleCopy(base, override) {
  if (override === null || override === undefined) return base;
  if (Array.isArray(base) && Array.isArray(override)) {
    return base.map((item, index) => (index < override.length ? mergeLocaleCopy(item, override[index]) : item));
  }
  if (base && typeof base === "object" && !Array.isArray(base) && override && typeof override === "object" && !Array.isArray(override)) {
    const merged = { ...base };
    for (const key of Object.keys(override)) merged[key] = mergeLocaleCopy(base[key], override[key]);
    return merged;
  }
  return override;
}

/**
 * Reads one namespace out of a pack.
 *
 * A bare name addresses the `dynamic` domain, which is where feature copy
 * lives; `domain:name` reaches any other domain, as case studies do with
 * `case-studies:sinama-case-study`.
 */
function getPackNamespace(namespace, locale) {
  const separator = String(namespace).indexOf(":");
  const domain = separator < 0 ? "dynamic" : namespace.slice(0, separator);
  const name = separator < 0 ? namespace : namespace.slice(separator + 1);
  return getLocalePack(locale)?.[domain]?.[name] || null;
}

function getPackPhrase(source, locale) {
  const value = getLocalePack(locale)?.pages?.text?.[source];
  return typeof value === "string" && value ? value : null;
}

function getPackAttribute(source, locale) {
  const value = getLocalePack(locale)?.pages?.attribute?.[source];
  return typeof value === "string" && value ? value : null;
}

/* ---------- value resolution ---------- */

function getLocalizedValue(value, locale = currentSiteLanguage) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object" || Array.isArray(value)) return value;
  const activeLocale = renderableLocaleId(locale);
  return value[activeLocale] ?? value[siteLocaleRegistry.defaultLocale] ?? value.en ?? Object.values(value)[0] ?? "";
}

/**
 * Resolves a locale-keyed content collection.
 *
 * `namespace` opts the collection into the shipped locale pack, which is how a
 * locale beyond the ones written inline reaches a feature without that feature
 * growing a `de:` / `es:` / `fr:` branch. Adding a sixth locale is a data
 * change, never a feature-code change.
 */
function getLocalizedCollection(collection, locale = currentSiteLanguage, namespace = null) {
  if (!collection || typeof collection !== "object") return collection;
  const activeLocale = renderableLocaleId(locale);
  const inline = collection[activeLocale] || collection[siteLocaleRegistry.defaultLocale] || collection.en || Object.values(collection)[0];
  if (!namespace) return inline;
  const packed = getPackNamespace(namespace, activeLocale);
  if (!packed) return inline;
  const fallback = collection[siteLocaleRegistry.defaultLocale] || collection.en || inline;
  return mergeLocaleCopy(fallback, packed);
}

function getUiText(key, locale = currentSiteLanguage) {
  const activeLocale = renderableLocaleId(locale);
  const packed = getLocalePack(activeLocale)?.ui?.[key];
  if (typeof packed === "string" && packed) return packed;
  const entry = window.KAAN_I18N?.ui?.[key];
  if (!entry) return key;
  return String(getLocalizedValue(entry, activeLocale) || key);
}

/** Existing bilingual strings can use this compatibility helper without
 * creating another language-state branch. Locale packs supply every locale
 * beyond the inline English/Turkish pair without touching feature code. */
function getI18nText(english, turkish, locale = currentSiteLanguage) {
  const activeLocale = renderableLocaleId(locale);
  if (activeLocale === "en") return english;
  const packed = getPackPhrase(english, activeLocale);
  if (packed) return packed;
  if (activeLocale === "tr" && turkish !== undefined) return turkish;
  if (typeof i18nTranslations !== "undefined") {
    return i18nTranslations[activeLocale]?.[english] || english;
  }
  return english;
}

/* ---------- canonical data composition ---------- */

/**
 * Adds this page's locale to the canonical registry's locale-keyed copy.
 *
 * Language-neutral facts — slugs, years, stacks, image paths, link URLs — are
 * never touched: the pack only ever adds a `[locale]` branch beside the
 * existing `en` / `tr` ones, which is exactly what the renderers already know
 * how to read. That is why a new locale needs no renderer change at all.
 *
 * `window.KAAN_PORTFOLIO` is frozen only at the top level, so the nested copy
 * maps accept the added branch. Running once at boot keeps every renderer,
 * including ones that re-render on locale change, seeing the same data.
 */
function composeLocalePackIntoRegistry(locale = currentSiteLanguage) {
  const registry = window.KAAN_PORTFOLIO;
  const pack = getLocalePack(locale);
  if (!registry || !pack || locale === siteLocaleRegistry.defaultLocale) return;

  const branch = (node, value) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    node[locale] = value;
  };

  /* content: flat registry paths such as `profile.availability`. */
  for (const [key, value] of Object.entries(pack.content || {})) {
    branch(resolveRegistryPath(registry, key), value);
  }

  /* projects: per-slug overlays keyed by canonical project identity. */
  for (const [slug, overlay] of Object.entries(pack.projects || {})) {
    const project = registry.projectDetails?.[slug];
    if (!project) continue;
    for (const [field, value] of Object.entries(overlay)) {
      if (field === "links") {
        (value || []).forEach((entry, index) => {
          if (entry && entry.label !== undefined) branch(project.links?.[index]?.label, entry.label);
        });
        continue;
      }
      branch(project[field], value);
    }
  }
}

/** Walks a `a.b[0].c` path into the canonical registry. */
function resolveRegistryPath(registry, key) {
  const parts = key.split(/\.|\[(\d+)\]/).filter((part) => part !== undefined && part !== "");
  let cursor = registry;
  for (const part of parts) {
    if (cursor == null) return null;
    cursor = cursor[/^\d+$/.test(part) ? Number(part) : part];
  }
  return cursor;
}

/* ---------- state changes ---------- */

function notifyLocaleSubscribers(locale, previousLocale, source) {
  const detail = Object.freeze({ locale, previousLocale, source });
  localeSubscribers.forEach((listener) => {
    try { listener(detail); } catch (error) { console.error("Locale subscriber failed", error); }
  });
  document.dispatchEvent(new CustomEvent("site:localechange", { detail }));
}

function setCurrentLocale(locale, { persist = true, source = "user", force = false } = {}) {
  const definition = isRenderableLocale(locale)
    ? siteLocaleRegistry.byId.get(normalizeLocaleId(locale))
    : siteLocaleRegistry.byId.get(siteLocaleRegistry.defaultLocale);
  if (!definition) return currentSiteLanguage;
  const previousLocale = currentSiteLanguage;
  currentSiteLanguage = definition.id;
  document.documentElement.lang = definition.htmlLang || definition.id;
  document.documentElement.dir = definition.dir || "ltr";
  document.documentElement.dataset.locale = definition.id;
  if (persist) persistSiteLocale(definition.id);
  if (force || previousLocale !== definition.id) {
    notifyLocaleSubscribers(definition.id, previousLocale, source);
  }
  return definition.id;
}

/**
 * The user-facing language switch.
 *
 * With localized static routes in place a language change is a navigation, not
 * an in-place re-render: the reader ends up on the URL that is canonical for
 * their language. The in-place path remains for any page that has no localized
 * equivalent, so switching never becomes a dead end.
 */
function switchSiteLocale(locale, { source = "selector" } = {}) {
  const target = normalizeLocaleId(locale);
  if (!isKnownLocale(target)) return currentSiteLanguage;
  persistSiteLocale(target);

  const routes = window.KAAN_LOCALE_ROUTES;
  if (routes) {
    const href = routes.localizedHrefForCurrentPage(target);
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (href && href !== here) {
      window.location.assign(href);
      return target;
    }
  }
  return setCurrentLocale(target, { persist: true, source });
}

function subscribeSiteLocale(listener) {
  if (typeof listener !== "function") return () => {};
  localeSubscribers.add(listener);
  return () => localeSubscribers.delete(listener);
}

/* ---------- selector ---------- */

function renderLanguageSelectors() {
  const selectable = getSelectableLocales();
  document.querySelectorAll("[data-lang-selector], .lang-switch").forEach((container) => {
    if (container.dataset.localeSelectorReady === "true") return;
    container.dataset.localeSelectorReady = "true";
    container.setAttribute("data-lang-selector", "");
    container.removeAttribute("role");
    container.removeAttribute("aria-label");
    container.replaceChildren();

    const label = document.createElement("label");
    label.className = "lang-selector-label";
    const text = document.createElement("span");
    /* The site's own utility, defined in css/a11y.css. The selector shipped
     * with `sr-only`, which nothing defines, so the label rendered visibly in
     * every language — and would have widened the header further in German. */
    text.className = "visually-hidden";
    text.dataset.langSelectorLabel = "";
    text.textContent = getUiText("language.selectorLabel");
    const select = document.createElement("select");
    select.className = "lang-selector-select";
    select.dataset.langSelect = "";
    /* Browsers restore form-control values on back/forward *after* scripts run,
     * which would leave the selector showing the language the reader navigated
     * away to rather than the one this URL renders. */
    select.setAttribute("autocomplete", "off");
    select.setAttribute("aria-label", getUiText("language.selectorAria"));
    selectable.forEach((locale) => {
      const option = document.createElement("option");
      option.value = locale.id;
      option.textContent = locale.nativeLabel || locale.label || locale.id;
      select.appendChild(option);
    });
    select.value = getCurrentLocale();
    select.addEventListener("change", () => switchSiteLocale(select.value, { source: "selector" }));
    label.append(text, select);
    container.appendChild(label);
  });
}

function syncLanguageSelectors(locale = currentSiteLanguage) {
  document.querySelectorAll("[data-lang-select]").forEach((select) => {
    select.value = locale;
    select.setAttribute("aria-label", getUiText("language.selectorAria", locale));
  });
  document.querySelectorAll("[data-lang-selector-label]").forEach((label) => {
    label.textContent = getUiText("language.selectorLabel", locale);
  });
}

/**
 * Recovery links on the root 404 document.
 *
 * GitHub Pages serves that one document at whatever URL failed, so its relative
 * links would resolve against the broken path — `/de/typo/works.html` rather
 * than the German works page. Every internal link is therefore rewritten to a
 * root-absolute URL in the locale the failed path asked for.
 */
function localizeRecoveryLinks(locale = currentSiteLanguage) {
  if (!document.documentElement.hasAttribute("data-route-locale-from-path")) return;
  const routes = window.KAAN_LOCALE_ROUTES;
  if (!routes) return;
  document.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) return;
    /* Normalised to root-relative first: the document's own URL is the broken
     * one, so nothing here may be resolved against it. */
    const absolute = `/${href.replace(/^[./]+/, "")}`;
    link.setAttribute("href", routes.localizedInternalHref(absolute, locale));
  });
}

composeLocalePackIntoRegistry();
renderLanguageSelectors();
setCurrentLocale(currentSiteLanguage, { persist: false, source: "initial", force: false });
subscribeSiteLocale(({ locale }) => syncLanguageSelectors(locale));
subscribeSiteLocale(({ locale }) => localizeRecoveryLinks(locale));
syncLanguageSelectors(currentSiteLanguage);
localizeRecoveryLinks(currentSiteLanguage);

/**
 * Back/forward across localized routes.
 *
 * Every localized route is a real document, so history navigation gives the
 * locale of the page being restored — never the one the reader switched away
 * to. `pageshow` covers both restore paths: the bfcache, which replays a page
 * without re-running scripts, and the ordinary back/forward load, where the
 * browser reinstates form state after boot has already synced the selector.
 */
window.addEventListener("pageshow", () => {
  const restored = getRouteLocale() || currentSiteLanguage;
  if (restored !== currentSiteLanguage) setCurrentLocale(restored, { persist: false, source: "pageshow", force: true });
  else syncLanguageSelectors(currentSiteLanguage);
});
