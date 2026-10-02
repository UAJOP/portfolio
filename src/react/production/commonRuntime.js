/* The classic COMMON runtime and Ajoop engine surface that the #28 React
 * overlay owners depend on.
 *
 * Every global a React overlay touches is named here and nowhere else, so the
 * dependency is explicit and can be replaced in one place when Master 3 #31
 * removes the classic runtime. All of them are function declarations of the
 * classic scripts (window properties). None is required during SSR, and each
 * accessor tolerates its absence. Nothing here reads `legacy-script.js`.
 *
 *   js/core/shell.js         overlay stacking, inert background, focus trap
 *   js/core/analytics.js     analytics events and navigation
 *   js/core/locale.js        current locale, in-place locale changes
 *   js/core/theme.js         theme switching
 *   js/portfolio/routing.js  localized internal URLs
 *   js/features/ultimate.js  command copy (incl. runtime-added commands)
 *   js/features/creative.js  easter egg command
 *   js/features/recruiter.js, command-palette.js, js/ajoop/assistant.js
 *                            the cross-overlay open/close requests
 *   js/ajoop/assistant.js    the Ajoop engine and its presentation port */
const runtime = () => (typeof window === "undefined" ? {} : window);
const call = (name) => (...args) => {
  const fn = runtime()[name];
  return typeof fn === "function" ? fn(...args) : undefined;
};

export const shell = {
  closeMobileNavigation: call("closeMobileNavigation"),
  setBackgroundInert: call("setBackgroundInert"),
  setOverlayBodyState: call("setOverlayBodyState"),
  rememberOverlayTrigger: call("rememberOverlayTrigger"),
  /* A close without focus restoration simply does not call this. The trigger
   * entry it leaves is never read: every open records a fresh one first. */
  restoreOverlayFocus: call("restoreOverlayFocus"),
  trapFocus: call("trapFocus"),
  getFocusableElements: (container) => call("getFocusableElements")(container) || [],
  openDrivePreviews: call("openDrivePreviews"),
};

export const overlays = {
  setChatbotOpen: call("setChatbotOpen"),
  setCommandPaletteOpen: call("setCommandPaletteOpen"),
  setRecruiterMode: call("setRecruiterMode"),
};

export const analytics = {
  track: call("trackAnalyticsEvent"),
  navigation: call("trackAnalyticsNavigation"),
};

export const site = {
  currentLocale: () => call("getCurrentLocale")() || null,
  setLocale: call("setCurrentLocale"),
  nextLocale: call("getNextActiveLocale"),
  subscribeLocale: (listener) => call("subscribeSiteLocale")(listener) || (() => {}),
  url: (path) => call("siteUrl")(path) ?? path,
  applyTheme: call("applySiteTheme"),
  currentTheme: () => (typeof document === "undefined" ? null : document.documentElement.getAttribute("data-theme")),
  updateStaticLabels: call("updateUltimateStaticLabels"),
  commandContent: call("getUltimateContent"),
  launchEasterEgg: call("launchEasterEgg"),
};

export const ajoopEngine = {
  connect: call("connectAjoopPresentation"),
  submit: call("submitAjoopComposer"),
  composerActivity: call("noteAjoopComposerActivity"),
  runAction: call("runAjoopAction"),
  panelState: call("setAjoopPanelOpenState"),
  initializeAi: call("initializeAjoopAi"),
  focusEntry: call("focusAjoopEntry"),
  isTouchFirst: () => Boolean(call("isAjoopTouchFirst")()),
};
