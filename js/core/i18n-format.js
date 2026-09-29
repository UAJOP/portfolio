/** Locale-aware formatting primitives shared by production features. */
(function exposeLocaleFormatting(global) {
  const localeTag = (locale) => {
    const active = typeof renderableLocaleId === "function" ? renderableLocaleId(locale) : locale;
    return global.KAAN_I18N?.formatting?.[active]?.intlLocale || active || "en-US";
  };

  global.formatSiteDate = (value, options = {}, locale = getCurrentLocale()) =>
    new Intl.DateTimeFormat(localeTag(locale), options).format(value instanceof Date ? value : new Date(value));

  global.formatSiteNumber = (value, options = {}, locale = getCurrentLocale()) =>
    new Intl.NumberFormat(localeTag(locale), options).format(value);

  global.selectSitePlural = (value, options = {}, locale = getCurrentLocale()) =>
    new Intl.PluralRules(localeTag(locale), options).select(value);
})(window);
