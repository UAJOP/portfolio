/**
 * Resume links, overlay/focus-trap utilities, mobile navigation, footer year.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 1-147.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
const resumeLink =
  "https://drive.google.com/file/d/1eERVaYoP-ICuP3xfbzpaDaCo5amwqA8u/view?usp=sharing";

document.querySelectorAll("[data-resume-link]").forEach((link) => {
  link.href = resumeLink;
});

function openDrivePreviews() {
  window.open(resumeLink, "_blank", "noopener,noreferrer");
}

const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector("[data-nav]");

const overlayTriggerMap = new WeakMap();
let inertedBackgroundElements = [];

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      (element.offsetParent !== null || element === document.activeElement),
  );
}

function trapFocus(event, container) {
  if (event.key !== "Tab" || !container) return;
  const focusableElements = getFocusableElements(container);
  if (!focusableElements.length) {
    event.preventDefault();
    container.focus?.();
    return;
  }

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function rememberOverlayTrigger(container, trigger = document.activeElement) {
  if (container && trigger instanceof HTMLElement) {
    overlayTriggerMap.set(container, trigger);
  }
}

function restoreOverlayFocus(container) {
  const trigger = container ? overlayTriggerMap.get(container) : null;
  if (trigger?.isConnected) trigger.focus();
  if (container) overlayTriggerMap.delete(container);
}

function setBackgroundInert(activeRoot = null) {
  inertedBackgroundElements.forEach(({ element, wasInert }) => {
    element.inert = wasInert;
  });
  inertedBackgroundElements = [];

  if (!activeRoot || !("inert" in HTMLElement.prototype)) return;
  Array.from(document.body.children).forEach((element) => {
    if (
      element === activeRoot ||
      element.contains(activeRoot) ||
      activeRoot.contains(element) ||
      element.tagName === "SCRIPT"
    ) {
      return;
    }
    inertedBackgroundElements.push({ element, wasInert: element.inert });
    element.inert = true;
  });
}

function setOverlayBodyState(isOpen) {
  document.body.classList.toggle("overlay-modal-open", Boolean(isOpen));
}

function closeMobileNavigation({ restoreFocus = false } = {}) {
  if (!navToggle || !navLinks) return;
  const wasOpen = navLinks.classList.contains("is-open");
  navLinks.classList.remove("is-open");
  navToggle.classList.remove("is-open");
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.setAttribute(
    "aria-label",
    document.documentElement.lang === "tr"
      ? "Navigasyonu aç"
      : "Open navigation",
  );
  if (restoreFocus && wasOpen) navToggle.focus();
}

if (navToggle && navLinks) {
  navLinks.id = navLinks.id || "site-navigation";
  navToggle.setAttribute("aria-controls", navLinks.id);

  navToggle.addEventListener("click", () => {
    const isOpen = !navLinks.classList.contains("is-open");
    if (isOpen) {
      setChatbotOpen?.(false, { restoreFocus: false });
      setCommandPaletteOpen?.(false, { restoreFocus: false });
      setRecruiterMode?.(false, { restoreFocus: false });
    }
    navLinks.classList.toggle("is-open", isOpen);
    navToggle.classList.toggle("is-open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute(
      "aria-label",
      document.documentElement.lang === "tr"
        ? isOpen
          ? "Navigasyonu kapat"
          : "Navigasyonu aç"
        : isOpen
          ? "Close navigation"
          : "Open navigation",
    );
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => closeMobileNavigation());
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navLinks.classList.contains("is-open")) {
      closeMobileNavigation({ restoreFocus: true });
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 820) closeMobileNavigation();
  });
}

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = new Date().getFullYear();
});

