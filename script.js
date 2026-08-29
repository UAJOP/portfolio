(function () {
  /**
   * Page-aware runtime loader.
   *
   * Until BRIEF 03 every page loaded one 5,244-line legacy-script.js, so a game
   * page paid for the request form and the project-detail renderer. The runtime
   * is now a set of modules under js/, and each page loads only what it needs.
   *
   * The manifest below is the single source of truth for load order. Modules are
   * classic scripts (not ES modules) on purpose: they share one global lexical
   * scope in load order, which is what lets them be split without a bundler, and
   * they keep working from a subdirectory and over file://.
   *
   * ORDER IS A CONTRACT. It reproduces the original single-file execution order.
   * Do not reorder without checking docs/frontend-runtime-architecture.md.
   *
   * A page declares its type with <body data-page="...">. Unknown or missing
   * markers fall back to COMMON only, which every page can run safely.
   */

  const COMMON = [
    "js/core/shell.js",
    "js/core/theme.js",
    "js/core/media.js",
    "js/core/i18n.js",
    "js/portfolio/routing.js",
    "js/ajoop/matcher.js",
    "js/ajoop/assistant.js",
    "js/features/ultimate.js",
    "js/features/recruiter.js",
    "js/features/command-palette.js",
    "js/features/ajoop-nav.js",
    "js/features/creative.js",
  ];

  /* Page-scoped modules, keyed by data-page. Each entry lists the modules that
   * page needs in addition to COMMON, in load order. */
  const PAGE_MODULES = {
    home: [],
    about: [],
    blog: [],
    now: [],
    labs: ["js/pages/labs.js"],
    error: [],
    caseStudy: [],
    works: ["js/portfolio/works.js"],
    games: ["js/portfolio/works.js", "js/pages/games.js"],
    game: ["js/pages/games.js"],
    projectDetail: ["js/portfolio/project-detail.js"],
    certificates: ["js/features/certificates.js"],
    request: ["js/request/submission.js", "js/request/form.js"],
  };

  /* Modules whose position in COMMON matters relative to a page module.
   * project-detail must be defined before assistant.js runs applyLanguage(),
   * and works.js must come after ultimate.js because its search UI reads the
   * shared copy. Splice points keep those guarantees explicit. */
  const INSERT_BEFORE = {
    "js/portfolio/project-detail.js": "js/ajoop/matcher.js",
    "js/features/certificates.js": "js/core/i18n.js",
    "js/portfolio/works.js": "js/features/recruiter.js",
  };

  const current = document.currentScript;
  const currentUrl = current?.src || new URL("script.js", window.location.href).href;
  const baseUrl = new URL(".", currentUrl);
  const assetUrl = (name) => new URL(name, baseUrl).href;

  function ensureV2Styles() {
    if (document.querySelector('link[href$="portfolio-v2.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = assetUrl("portfolio-v2.css");
    document.head.appendChild(link);
  }

  function hasScript(name) {
    return Array.from(document.scripts).some((script) => {
      try {
        return new URL(script.src, window.location.href).pathname.endsWith(`/${name}`);
      } catch (error) {
        return false;
      }
    });
  }

  /** Resolves the module list for this page, in load order. */
  function moduleList() {
    const page = (document.body && document.body.dataset.page) || "";
    const extras = PAGE_MODULES[page] || [];
    const list = COMMON.slice();

    extras.forEach((module) => {
      const before = INSERT_BEFORE[module];
      const at = before ? list.indexOf(before) : -1;
      if (at === -1) list.push(module);
      else list.splice(at, 0, module);
    });

    return list;
  }

  function parserBoot(modules) {
    const registryAlreadyDeclared = hasScript("portfolio-data.js");
    ensureV2Styles();

    const tags = [];
    if (!registryAlreadyDeclared) tags.push("portfolio-data.js");
    tags.push(...modules);
    if (!registryAlreadyDeclared) tags.push("portfolio-v2.js");

    document.write(
      tags.map((name) => `<script src="${assetUrl(name)}"><\/script>`).join(""),
    );
  }

  function loadScript(name) {
    if (hasScript(name)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = assetUrl(name);
      script.async = false;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error(`Failed to load ${name}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function asyncBoot(modules) {
    ensureV2Styles();
    try {
      if (!window.KAAN_PORTFOLIO) await loadScript("portfolio-data.js");
      for (const name of modules) await loadScript(name);
      await loadScript("portfolio-v2.js");
    } catch (error) {
      console.error("Portfolio runtime boot failed", error);
    }
  }

  /* Every page loads this script at the end of <body>, so document.body — and
   * therefore the page marker — is always available by the time we run, on the
   * parser path as well as the async one. qa-runtime-modules.mjs enforces that
   * placement so this assumption cannot quietly break. */
  if (document.readyState === "loading" && current) parserBoot(moduleList());
  else asyncBoot(moduleList());
})();
