/**
 * Certificate preview modal (single-work page).
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 288-341.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
const modal = document.querySelector("[data-modal]");
const modalImg = document.querySelector("[data-modal-img]");
const modalClose = document.querySelector("[data-modal-close]");
const certificatePreviewButtons = document.querySelectorAll("[data-cert]");
let lastModalTrigger = null;
if (modal) modal.inert = true;

function closeModal() {
  if (!modal || !modalImg || !modal.classList.contains("is-open")) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modal.inert = true;
  document.body.classList.remove("modal-open");
  modalImg.removeAttribute("src");
  modalImg.alt = "Certificate preview";
  lastModalTrigger?.focus();
}

if (modal && modalImg && certificatePreviewButtons.length) {
  certificatePreviewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      lastModalTrigger = button;
      modalImg.src = button.dataset.cert;
      modalImg.alt = button.dataset.certTitle || "Certificate preview";
      modal.classList.add("is-open");
      modal.inert = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      modalClose?.focus();
    });
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }

  document.addEventListener("keydown", (event) => {
    if (!modal.classList.contains("is-open")) return;

    if (event.key === "Escape") {
      closeModal();
    }

    if (event.key === "Tab" && modalClose) {
      event.preventDefault();
      modalClose.focus();
    }
  });
}

