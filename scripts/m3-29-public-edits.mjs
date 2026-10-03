import assert from "node:assert/strict";

/** Narrow legacy-runtime ownership guards required while #29 React documents
 * coexist with the retained legacy renderers. Reversing these reviewed edits
 * lets older-phase artifact gates reconstruct their own accepted authority. */
export const CASE_PROJECT_REVIEWED_EDITS = Object.freeze({
  "case-study.js": [
    [
      '      document.querySelectorAll("[data-case-i18n]").forEach((element) => {\n        const value = active[element.dataset.caseI18n];',
      '      document.querySelectorAll("[data-case-i18n]").forEach((element) => {\n        if (element.closest("[data-react-main]")) return;\n        const value = active[element.dataset.caseI18n];',
    ],
    [
      '      document.querySelectorAll("[data-case-i18n-alt]").forEach((element) => {\n        const value = active[element.dataset.caseI18nAlt];',
      '      document.querySelectorAll("[data-case-i18n-alt]").forEach((element) => {\n        if (element.closest("[data-react-main]")) return;\n        const value = active[element.dataset.caseI18nAlt];',
    ],
    [
      '      document.querySelectorAll("[data-case-i18n-aria-label]").forEach((element) => {\n        const value = active[element.dataset.caseI18nAriaLabel];',
      '      document.querySelectorAll("[data-case-i18n-aria-label]").forEach((element) => {\n        if (element.closest("[data-react-main]")) return;\n        const value = active[element.dataset.caseI18nAriaLabel];',
    ],
    [
      '    button.setAttribute("aria-expanded", "false");',
      '    if (!button.hasAttribute("aria-expanded")) button.setAttribute("aria-expanded", "false");',
    ],
  ],
  "js/portfolio/project-detail.js": [[
    '  if (!root) return;\n\n  const slug = resolveCurrentProjectSlug();',
    '  if (!root) return;\n  if (root.dataset?.reactProjectDetailOwner === "react") return;\n\n  const slug = resolveCurrentProjectSlug();',
  ]],
});

const lf = (value) => value.replace(/\r\n/g, "\n");

export function caseProjectAcceptedBase(file, content, edits = CASE_PROJECT_REVIEWED_EDITS[file]) {
  let base = lf(content);
  for (const [from, to] of [...edits].reverse()) {
    assert.equal(base.split(to).length, 2, `${file}: #29 reviewed edit must occur exactly once`);
    base = base.replace(to, () => from);
  }
  return base;
}
