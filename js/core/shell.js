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

const overlayTriggerMap = new Map();
let inertedBackgroundElements = [];
/* Open overlay roots in the order they were opened; the last is the foreground. */
const openOverlayRoots = [];

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
  if (!container || !(trigger instanceof HTMLElement)) return;
  /* Asked to open again from inside itself (Ctrl+K in the open palette), an
   * overlay keeps the control it was first opened from. */
  if (container.contains(trigger) && overlayTriggerMap.has(container)) return;
  overlayTriggerMap.set(container, trigger);
}

function restoreOverlayFocus(container) {
  let trigger = container ? overlayTriggerMap.get(container) : null;
  /* A takeover starts inside the overlay it replaces (Ctrl+K in the open Ajoop
   * panel). That overlay is closed by now, so focus goes back to the control
   * it was opened from, not to an element that is no longer on screen. */
  const replaced = new Set();
  for (;;) {
    const from = Array.from(overlayTriggerMap.keys()).find(
      (other) =>
        other !== container &&
        !replaced.has(other) &&
        other.contains(trigger) &&
        !isOverlayOpen(other),
    );
    if (!from) break;
    replaced.add(from);
    trigger = overlayTriggerMap.get(from);
  }
  replaced.forEach((other) => overlayTriggerMap.delete(other));
  if (trigger?.isConnected) trigger.focus();
  if (container) overlayTriggerMap.delete(container);
}

/* overlay-ownership:start
 * One owner model for everything that covers the page: Ajoop, the Command
 * Palette, Recruiter Mode and the page dialogs that use this contract.
 *
 * An overlay claims the page by its own root element and releases it by that
 * same element. Whoever claimed last is the foreground: only it is
 * interactive, everything else is inert, and the page is marked
 * `overlay-modal-open` for as long as any overlay is open. Releasing is
 * checked against the claim, so an overlay that is not open — or a second
 * owner of the same markup taking over, as React does at hydration — cannot
 * clear state another overlay still holds. When the foreground overlay closes
 * over one that is still open, that one becomes the foreground again. */
function isOverlayOpen(container) {
  return openOverlayRoots.some(
    (root) => root === container || root.contains(container) || container.contains(root),
  );
}

function syncOverlayOwnership() {
  const foreground = openOverlayRoots[openOverlayRoots.length - 1] || null;
  setBackgroundInert(foreground);
  setOverlayBodyState(Boolean(foreground));
}

function claimOverlay(root) {
  if (!root) return;
  const at = openOverlayRoots.indexOf(root);
  if (at !== -1) openOverlayRoots.splice(at, 1);
  openOverlayRoots.push(root);
  syncOverlayOwnership();
}

function releaseOverlay(root) {
  const at = openOverlayRoots.indexOf(root);
  if (at === -1) return false;
  openOverlayRoots.splice(at, 1);
  syncOverlayOwnership();
  return true;
}
/* overlay-ownership:end */

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
  navToggle.setAttribute("aria-label", getUiText("nav.open"));
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
    navToggle.setAttribute("aria-label", getUiText(isOpen ? "nav.close" : "nav.open"));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => closeMobileNavigation());
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navLinks.classList.contains("is-open")) {
      closeMobileNavigation({ restoreFocus: true });
    }
  });

  /* The collapse breakpoint is owned by CSS (portfolio-v2.css); when the
   * toggle is no longer rendered the inline navigation is back, so close. */
  window.addEventListener("resize", () => {
    if (window.getComputedStyle(navToggle).display === "none") closeMobileNavigation();
  });
}


subscribeSiteLocale(() => {
  if (!navToggle) return;
  const isOpen = Boolean(navLinks?.classList.contains("is-open"));
  navToggle.setAttribute("aria-label", getUiText(isOpen ? "nav.close" : "nav.open"));
});
document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = new Date().getFullYear();
});

