/**
 * Central locale authority for the static portfolio runtime.
 *
 * Canonical configuration is generated from data/i18n/locales.json into
 * i18n-data.js before this module loads. Every feature must read locale state
 * through this contract instead of creating its own storage or browser-locale
 * logic.
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

function resolveInitialLocale() {
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

function getNextActiveLocale(locale = currentSiteLanguage) {
  const active = siteLocaleRegistry.active;
  if (!active.length) return siteLocaleRegistry.defaultLocale;
  const index = Math.max(0, active.findIndex((item) => item.id === locale));
  return active[(index + 1) % active.length].id;
}

function persistSiteLocale(locale) {
  try {
    localStorage.setItem(siteLocaleRegistry.storageKey, locale);
    return true;
  } catch (error) {
    return false;
  }
}

function getLocalizedValue(value, locale = currentSiteLanguage) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object" || Array.isArray(value)) return value;
  const activeLocale = getLocaleDefinition(locale, { activeOnly: true })?.id || siteLocaleRegistry.defaultLocale;
  return value[activeLocale] ?? value[siteLocaleRegistry.defaultLocale] ?? value.en ?? Object.values(value)[0] ?? "";
}

function getLocalizedCollection(collection, locale = currentSiteLanguage) {
  if (!collection || typeof collection !== "object") return collection;
  const activeLocale = getLocaleDefinition(locale, { activeOnly: true })?.id || siteLocaleRegistry.defaultLocale;
  return collection[activeLocale] || collection[siteLocaleRegistry.defaultLocale] || collection.en || Object.values(collection)[0];
}

function getUiText(key, locale = currentSiteLanguage) {
  const entry = window.KAAN_I18N?.ui?.[key];
  if (!entry) return key;
  return String(getLocalizedValue(entry, locale) || key);
}

/** Existing bilingual strings can use this compatibility helper without
 * creating another language-state branch. Future locale packs may add the
 * English source string to the compatibility dictionaries without touching
 * feature code. */
function getI18nText(english, turkish, locale = currentSiteLanguage) {
  const activeLocale = getLocaleDefinition(locale, { activeOnly: true })?.id || siteLocaleRegistry.defaultLocale;
  if (activeLocale === "en") return english;
  if (activeLocale === "tr" && turkish !== undefined) return turkish;
  if (typeof i18nTranslations !== "undefined") {
    return i18nTranslations[activeLocale]?.[english] || english;
  }
  return english;
}

function notifyLocaleSubscribers(locale, previousLocale, source) {
  const detail = Object.freeze({ locale, previousLocale, source });
  localeSubscribers.forEach((listener) => {
    try { listener(detail); } catch (error) { console.error("Locale subscriber failed", error); }
  });
  document.dispatchEvent(new CustomEvent("site:localechange", { detail }));
}

function setCurrentLocale(locale, { persist = true, source = "user", force = false } = {}) {
  const definition = getLocaleDefinition(locale, { activeOnly: true }) || getLocaleDefinition(siteLocaleRegistry.defaultLocale, { activeOnly: true });
  if (!definition) return currentSiteLanguage;
  const previousLocale = currentSiteLanguage;
  currentSiteLanguage = definition.id;
  document.documentElement.lang = definition.id;
  document.documentElement.dir = definition.dir || "ltr";
  document.documentElement.dataset.locale = definition.id;
  if (persist) persistSiteLocale(definition.id);
  if (force || previousLocale !== definition.id) {
    notifyLocaleSubscribers(definition.id, previousLocale, source);
  }
  return definition.id;
}

function subscribeSiteLocale(listener) {
  if (typeof listener !== "function") return () => {};
  localeSubscribers.add(listener);
  return () => localeSubscribers.delete(listener);
}

function renderLanguageSelectors() {
  const activeLocales = getActiveLocales();
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
    text.className = "sr-only";
    text.dataset.langSelectorLabel = "";
    text.textContent = getUiText("language.selectorLabel");
    const select = document.createElement("select");
    select.className = "lang-selector-select";
    select.dataset.langSelect = "";
    select.setAttribute("aria-label", getUiText("language.selectorAria"));
    activeLocales.forEach((locale) => {
      const option = document.createElement("option");
      option.value = locale.id;
      option.textContent = locale.nativeLabel || locale.label || locale.id;
      select.appendChild(option);
    });
    select.value = getCurrentLocale();
    select.addEventListener("change", () => setCurrentLocale(select.value, { persist: true, source: "selector" }));
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

renderLanguageSelectors();
setCurrentLocale(currentSiteLanguage, { persist: false, source: "initial", force: false });
subscribeSiteLocale(({ locale }) => syncLanguageSelectors(locale));
syncLanguageSelectors(currentSiteLanguage);
