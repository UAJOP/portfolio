(function () {
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

  function parserBoot() {
    const registryAlreadyDeclared = hasScript("portfolio-data.js");
    ensureV2Styles();

    if (registryAlreadyDeclared) {
      document.write(`<script src="${assetUrl("legacy-script.js")}"><\/script>`);
      return;
    }

    document.write(
      `<script src="${assetUrl("portfolio-data.js")}"><\/script>` +
      `<script src="${assetUrl("legacy-script.js")}"><\/script>` +
      `<script src="${assetUrl("portfolio-v2.js")}"><\/script>`,
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

  async function asyncBoot() {
    ensureV2Styles();
    try {
      if (!window.KAAN_PORTFOLIO) await loadScript("portfolio-data.js");
      await loadScript("legacy-script.js");
      await loadScript("portfolio-v2.js");
    } catch (error) {
      console.error("Portfolio runtime boot failed", error);
    }
  }

  if (document.readyState === "loading" && current) parserBoot();
  else asyncBoot();
})();
