import assert from "node:assert/strict";

/** Reviewed legacy-runtime stand-downs for #27. Reversing these exact edits
 * must reproduce the independently pinned df39ea32 artifact. */
export const RECRUITER_BUILD_LOG_REVIEWED_EDITS = Object.freeze({
  "js/core/i18n-runtime.js": [
    [
      '        if (parent.closest("[data-react-main]")) return NodeFilter.FILTER_REJECT;\n',
      '        if (parent.closest("[data-react-main], [data-react-recruiter-owner=\'react\']")) return NodeFilter.FILTER_REJECT;\n',
    ],
    [
      '  document.querySelectorAll(`[${attributeName}]`).forEach((element) => {\n    if (element.closest("[data-react-main]")) return;\n',
      '  document.querySelectorAll(`[${attributeName}]`).forEach((element) => {\n    if (element.closest("[data-react-main], [data-react-recruiter-owner=\'react\']")) return;\n',
    ],
    [
      '    if (!element.closest("[data-react-main]")) element.removeAttribute("data-preserve-case");\n',
      '    if (!element.closest("[data-react-main], [data-react-recruiter-owner=\'react\']")) element.removeAttribute("data-preserve-case");\n',
    ],
    [
      '  document.querySelectorAll("body *").forEach((element) => {\n    if (element.closest("[data-react-main]")) return;\n',
      '  document.querySelectorAll("body *").forEach((element) => {\n    if (element.closest("[data-react-main], [data-react-recruiter-owner=\'react\']")) return;\n',
    ],
  ],
  "js/features/recruiter.js": [
    [
      '  if (!drawer) return;\n  const hadFocus = drawer.contains(document.activeElement);\n',
      '  if (!drawer) return;\n  if (drawer.closest("[data-react-recruiter-owner=\'react\']")) return;\n  const hadFocus = drawer.contains(document.activeElement);\n',
    ],
    [
      '  if (!drawer) return;\n  const wasOpen = document.body.classList.contains("recruiter-mode-active");\n',
      '  if (!drawer) return;\n  const reactOwner = drawer.closest("[data-react-recruiter-owner=\'react\']");\n  if (reactOwner) {\n    const request = { isOpen: Boolean(isOpen), restoreFocus, trigger };\n    reactOwner.__portfolioReactRecruiterRequest = request;\n    if (reactOwner.__portfolioReactRecruiterReady) {\n      reactOwner.dispatchEvent(new CustomEvent("portfolio:react-recruiter-request", { detail: request }));\n      return;\n    }\n    /* The SSR dialog is already complete HTML. Keep it responsive while the\n     * React bundle loads, then let React adopt this exact state without\n     * replaying focus or analytics. */\n    request.preHydrationApplied = true;\n  }\n  const wasOpen = document.body.classList.contains("recruiter-mode-active");\n',
    ],
    [
      'function setupRecruiterMode() {\n  if (document.querySelector("[data-recruiter-drawer]")) return;\n',
      'function setupRecruiterMode() {\n  /* #27 ownership boundary: React production documents SSR and hydrate their\n   * own recruiter root. Legacy routes continue through this unchanged owner. */\n  const reactOwner = document.querySelector("[data-react-recruiter-owner=\'react\']");\n  if (reactOwner) {\n    const drawer = reactOwner.querySelector("[data-recruiter-drawer]");\n    if (!drawer) return;\n    document.querySelectorAll("[data-recruiter-toggle]").forEach((button) => {\n      button.setAttribute("aria-controls", drawer.id);\n      button.setAttribute("aria-expanded", "false");\n    });\n    const click = (event) => {\n      const trigger = event.target.closest?.("[data-recruiter-toggle]");\n      if (trigger) {\n        event.preventDefault();\n        setRecruiterMode(\n          !document.body.classList.contains("recruiter-mode-active"),\n          { trigger },\n        );\n        return;\n      }\n      if (event.target.closest?.("[data-recruiter-close]") || event.target === drawer) {\n        setRecruiterMode(false);\n      }\n    };\n    const keydown = (event) => {\n      if (!document.body.classList.contains("recruiter-mode-active")) return;\n      if (event.key === "Escape") {\n        event.preventDefault();\n        setRecruiterMode(false);\n        return;\n      }\n      trapFocus(event, drawer);\n    };\n    document.addEventListener("click", click);\n    document.addEventListener("keydown", keydown);\n    reactOwner.__portfolioReactRecruiterEntryCleanup = () => {\n      document.removeEventListener("click", click);\n      document.removeEventListener("keydown", keydown);\n      delete reactOwner.__portfolioReactRecruiterEntryCleanup;\n    };\n    applyRecruiterIntentMarker(readRecruiterIntent());\n    return;\n  }\n  if (document.querySelector("[data-recruiter-drawer]")) return;\n',
    ],
  ],
  "portfolio-v2.js": [[
    '  function installRecruiterV2() {\n    if (typeof renderRecruiterDrawer !== "function" || typeof setRecruiterMode !== "function") return;\n',
    '  function installRecruiterV2() {\n    if (document.querySelector("[data-react-recruiter-owner=\'react\']")) return;\n    if (typeof renderRecruiterDrawer !== "function" || typeof setRecruiterMode !== "function") return;\n',
  ]],
});

const lf = (value) => value.replace(/\r\n/g, "\n");

export function recruiterBuildLogAcceptedBase(file, content, edits = RECRUITER_BUILD_LOG_REVIEWED_EDITS[file]) {
  let base = lf(content);
  for (const [from, to] of [...edits].reverse()) {
    assert.equal(base.split(to).length, 2, `${file}: #27 reviewed edit must occur exactly once`);
    base = base.replace(to, () => from);
  }
  return base;
}
