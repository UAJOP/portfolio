/**
 * Runtime language presentation for the static multilingual portfolio.
 *
 * Translation COPY lives in locale packs generated from data/i18n/. The large
 * historical EN/TR phrase dictionaries remain in js/core/i18n.js only as a
 * build-time compatibility source while the pack tooling is migrated; that
 * legacy file is deliberately NOT loaded by the browser.
 */
const originalDocumentTitle = document.title;

function normalizeI18nText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function preserveWhitespace(originalValue, translatedValue) {
  const leading = originalValue.match(/^\s*/)?.[0] || "";
  const trailing = originalValue.match(/\s*$/)?.[0] || "";
  return `${leading}${translatedValue}${trailing}`;
}

function hasLegacyTextTranslation(key) {
  if (!key) return false;
  return typeof getPackPhrase === "function" && Boolean(getPackPhrase(key, getCurrentLocale()));
}

function hasLegacyAttributeTranslation(key) {
  if (!key) return false;
  return typeof getPackAttribute === "function" && Boolean(getPackAttribute(key, getCurrentLocale()));
}

function collectTranslatableTextNodes() {
  const nodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        const key = normalizeI18nText(node.nodeValue);
        if (key && hasLegacyTextTranslation(key)) {
          node.__i18nKey = key;
          nodes.push(node);
        }
        return NodeFilter.FILTER_SKIP;
      },
    },
  );

  while (walker.nextNode()) {}
  return nodes;
}

const translatableTextNodes = collectTranslatableTextNodes();
const translatableAttributes = [];

["aria-label", "alt", "title", "placeholder"].forEach((attributeName) => {
  document.querySelectorAll(`[${attributeName}]`).forEach((element) => {
    const key = element.getAttribute(attributeName);
    if (key && hasLegacyAttributeTranslation(key)) {
      translatableAttributes.push({ element, attributeName, key });
    }
  });
});

function translateLegacyText(key, locale) {
  if (locale === siteLocaleRegistry.defaultLocale) return key;
  return (typeof getPackPhrase === "function" && getPackPhrase(key, locale)) || key;
}

function translateLegacyAttribute(key, locale) {
  if (locale === siteLocaleRegistry.defaultLocale) return key;
  return (typeof getPackAttribute === "function" && getPackAttribute(key, locale)) || key;
}

function translateDocumentTitle(locale) {
  if (locale === siteLocaleRegistry.defaultLocale) return originalDocumentTitle;
  const packed = typeof getLocalePack === "function"
    ? getLocalePack(locale)?.pages?.title?.[originalDocumentTitle]
    : null;
  return typeof packed === "string" && packed ? packed : originalDocumentTitle;
}

function applyProtectedTermCasing() {
  const terms = window.KAAN_I18N?.glossary?.protectedTerms || [];
  if (!terms.length || !document.body) return;
  document.querySelectorAll("[data-preserve-case]").forEach((element) => element.removeAttribute("data-preserve-case"));
  document.querySelectorAll("body *").forEach((element) => {
    if (element.children.length) return;
    const text = String(element.textContent || "");
    if (!terms.some((term) => text.includes(term))) return;
    try {
      if (getComputedStyle(element).textTransform !== "none") element.setAttribute("data-preserve-case", "");
    } catch (error) {
      // Static/file:// contexts may not expose computed styles consistently.
    }
  });
}

function applyLanguagePresentation(locale = getCurrentLocale()) {
  const activeLocale = renderableLocaleId(locale);
  currentSiteLanguage = activeLocale;

  translatableTextNodes.forEach((node) => {
    const key = node.__i18nKey;
    node.nodeValue = preserveWhitespace(node.nodeValue, translateLegacyText(key, activeLocale));
  });

  translatableAttributes.forEach((item) => {
    item.element.setAttribute(
      item.attributeName,
      translateLegacyAttribute(item.key, activeLocale),
    );
  });

  document.querySelectorAll("[data-training-type]").forEach((element) => {
    element.textContent = getUiText("training", activeLocale);
  });

  document.title = translateDocumentTitle(activeLocale);
  syncLanguageSelectors(activeLocale);

  if (typeof applySiteTheme === "function") applySiteTheme(siteThemeState.current);
  if (typeof renderProjectDetail === "function") renderProjectDetail(activeLocale);
  if (typeof renderAiWorkflowDemo === "function") renderAiWorkflowDemo(activeLocale);
  if (typeof updatePortfolioChatbotLanguage === "function") updatePortfolioChatbotLanguage(activeLocale);
  if (typeof updateAiFlowPuzzleLanguage === "function") updateAiFlowPuzzleLanguage(activeLocale);
  if (typeof updateJoydayPaintLanguage === "function") updateJoydayPaintLanguage(activeLocale);
  if (typeof updateCareerAdventureLanguage === "function") updateCareerAdventureLanguage(activeLocale);
  if (typeof updateUltimateStaticLabels === "function") updateUltimateStaticLabels(activeLocale);
  if (typeof renderCommandPalette === "function" && document.querySelector("[data-command-palette]")) {
    renderCommandPalette(activeLocale);
  }
  if (typeof renderRecruiterDrawer === "function" && document.querySelector("[data-recruiter-drawer]")) {
    renderRecruiterDrawer(activeLocale);
  }

  applyProtectedTermCasing();
  document.documentElement.dataset.localeReady = "true";
  delete document.documentElement.dataset.localePending;
}

/** Compatibility entry point used by existing UI modules. New code should call
 * setCurrentLocale() directly. */
function applyLanguage(language) {
  return setCurrentLocale(language, { persist: true, source: "compat-applyLanguage" });
}

subscribeSiteLocale(({ locale }) => applyLanguagePresentation(locale));
applyLanguagePresentation(getCurrentLocale());
