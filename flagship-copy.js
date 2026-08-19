(function () {
  function currentLanguage() {
    return (document.documentElement.lang || "en") === "tr" ? "tr" : "en";
  }

  function applyFlagshipCopy() {
    const lang = currentLanguage();

    document.querySelectorAll("[data-flagship-en][data-flagship-tr]").forEach((node) => {
      const value = lang === "tr" ? node.dataset.flagshipTr : node.dataset.flagshipEn;
      if (typeof value === "string") node.textContent = value;
    });

    document.querySelectorAll("[data-flagship-aria-en][data-flagship-aria-tr]").forEach((node) => {
      const value = lang === "tr" ? node.dataset.flagshipAriaTr : node.dataset.flagshipAriaEn;
      if (typeof value === "string") node.setAttribute("aria-label", value);
    });
  }

  applyFlagshipCopy();

  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.type === "attributes" && record.attributeName === "lang")) {
      applyFlagshipCopy();
    }
  });

  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
