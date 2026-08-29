/**
 * Compatibility bridge for the pre-BRIEF-03 runtime entry point.
 *
 * Until BRIEF 03 this file WAS the runtime: 5,244 lines owning navigation,
 * theme, i18n, the project catalog, Ajoop, Recruiter Mode, the command palette,
 * the request form and per-game enhancements, all loaded on every page.
 *
 * Those responsibilities now live in focused modules under js/, loaded per page
 * by script.js. See docs/frontend-runtime-architecture.md for the module tree
 * and load order.
 *
 * This file is kept, and deliberately does no work, because it is a public
 * entry point: a cached HTML page or an external copy may still request
 * /legacy-script.js. Serving an empty, valid script beats a 404.
 *
 * DO NOT add runtime behaviour here. New shared behaviour belongs in js/core/
 * or js/features/; new page behaviour belongs in a page-scoped module plus the
 * script.js manifest. scripts/qa-runtime-modules.mjs fails if this file grows
 * real logic again.
 */
(function () {
  if (document.querySelector('script[src*="js/core/shell.js"]')) return;
  console.warn(
    "legacy-script.js is a compatibility stub. Load script.js, which boots the js/ runtime modules.",
  );
})();
