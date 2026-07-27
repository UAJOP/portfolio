(function () {
  const pageData = window.caseStudyPageData || {};

  function language() {
    return document.documentElement.lang === "tr" ? "tr" : "en";
  }

  function applyTranslations() {
    const activeLanguage = language();
    const translations = pageData.translations;
    const active = translations?.[activeLanguage] || translations?.en;

    if (active) {
      document.querySelectorAll("[data-case-i18n]").forEach((element) => {
        const value = active[element.dataset.caseI18n];
        if (value) element.textContent = value;
      });
      document.querySelectorAll("[data-case-i18n-alt]").forEach((element) => {
        const value = active[element.dataset.caseI18nAlt];
        if (value) element.alt = value;
      });
      document.querySelectorAll("[data-case-i18n-aria-label]").forEach((element) => {
        const value = active[element.dataset.caseI18nAriaLabel];
        if (value) element.setAttribute("aria-label", value);
      });
    }

    const title = pageData.titles?.[activeLanguage] || pageData.titles?.en;
    if (title) document.title = title;

    const openModalImage = document.querySelector("[data-case-modal].is-open [data-case-modal-image]");
    const openModalTrigger = document.querySelector("[data-case-gallery][aria-expanded='true']");
    if (openModalImage && openModalTrigger) {
      openModalImage.alt = openModalTrigger.querySelector("img")?.alt || "";
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.attributeName === "lang")) {
      applyTranslations();
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  const modal = document.querySelector("[data-case-modal]");
  const modalImage = modal?.querySelector("[data-case-modal-image]");
  const modalClose = modal?.querySelector("[data-case-modal-close]");
  let modalTrigger = null;

  function closeModal() {
    if (!modal?.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("case-modal-open");
    modalTrigger?.setAttribute("aria-expanded", "false");
    if (modalImage) {
      modalImage.src = "";
      modalImage.alt = "";
    }
    modalTrigger?.focus();
  }

  document.querySelectorAll("[data-case-gallery]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      if (!modal || !modalImage) return;
      modalTrigger = button;
      const image = button.querySelector("img");
      modalImage.src = button.dataset.caseGallery;
      modalImage.alt = image?.alt || "";
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("case-modal-open");
      button.setAttribute("aria-expanded", "true");
      modalClose?.focus();
    });
  });

  modalClose?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (!modal?.classList.contains("is-open")) return;
    if (event.key === "Escape") closeModal();
    if (event.key === "Tab" && modalClose) {
      event.preventDefault();
      modalClose.focus();
    }
  });

  applyTranslations();
})();
