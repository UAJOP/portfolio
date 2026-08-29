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
if (modal) modal.inert = true;

function closeModal() {
  if (!modal || !modalImg || !modal.classList.contains("is-open")) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modal.inert = true;
  document.body.classList.remove("modal-open");
  modalImg.removeAttribute("src");
  modalImg.alt = "Certificate preview";
  /* BRIEF 04: the rest of the page becomes interactive again, and focus goes
   * back to the thumbnail that opened the dialog. */
  setBackgroundInert(null);
  setOverlayBodyState(false);
  restoreOverlayFocus(modal);
}

if (modal && modalImg && certificatePreviewButtons.length) {
  certificatePreviewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      modalImg.src = button.dataset.cert;
      modalImg.alt = button.dataset.certTitle || "Certificate preview";
      modal.classList.add("is-open");
      modal.inert = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      /* BRIEF 04: same overlay contract as Ajoop, the command palette and
       * Recruiter Mode — remember the trigger, take the background out of the
       * tab order, and move focus into the dialog. */
      rememberOverlayTrigger(modal, button);
      setBackgroundInert(modal);
      setOverlayBodyState(true);
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

    /* BRIEF 04: previously every Tab was cancelled and focus forced back to the
     * close button, so nothing else in the dialog could be reached. The shared
     * trap cycles through the dialog's own focusable elements instead. */
    trapFocus(event, modal);
  });
}

