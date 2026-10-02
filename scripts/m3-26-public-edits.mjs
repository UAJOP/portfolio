/* The reviewed #26 edits to public legacy files, shared by the route-aware
 * artifact gate and the differential gate (which reverses them to compose
 * the accepted artifact hermetically). */
import assert from "node:assert/strict";

/* Each #26 public file is the accepted base plus exactly these reviewed edits
 * (LF form). The hash manifest pins the current bytes; reversing the edits
 * must reproduce the accepted base whose hash the independently accepted
 * #25-A / #25-B manifests already pin, so no git history is needed. */
export const WORKS_GAMES_REVIEWED_EDITS = Object.freeze({
  "js/features/ultimate.js": [[
    '  document.querySelectorAll("[data-project-search]").forEach((node) => {\n    node.placeholder = catalogSearchLabels.placeholder;\n  });\n  document.querySelectorAll("[data-project-search-label]").forEach((node) => {\n    node.textContent = catalogSearchLabels.label;\n  });\n',
    '  /* React-owned catalogs render their own localized search copy. */\n  document.querySelectorAll("[data-project-search]").forEach((node) => {\n    if (node.closest("[data-react-main]")) return;\n    node.placeholder = catalogSearchLabels.placeholder;\n  });\n  document.querySelectorAll("[data-project-search-label]").forEach((node) => {\n    if (node.closest("[data-react-main]")) return;\n    node.textContent = catalogSearchLabels.label;\n  });\n',
  ]],
  "js/core/i18n-runtime.js": [[
    '  document.querySelectorAll("[data-preserve-case]").forEach((element) => element.removeAttribute("data-preserve-case"));\n',
    '  document.querySelectorAll("[data-preserve-case]").forEach((element) => {\n    if (!element.closest("[data-react-main]")) element.removeAttribute("data-preserve-case");\n  });\n',
  ]],
  "js/pages/games.js": [[
    "function setupGameCards() {\n",
    'function setupGameCards() {\n  if (document.querySelector("main[data-react-main]")) return;\n',
  ]],
  "js/portfolio/works.js": [
    [
      'const projectCards = document.querySelectorAll(".project-card[data-category]");\n',
      'const projectCards = document.querySelectorAll(".project-card[data-category]");\nconst reactOwnsCatalog = Boolean(document.querySelector("main[data-react-main]"));\n',
    ],
    ["if (filterButtons.length && projectCards.length) {\n", "if (!reactOwnsCatalog && filterButtons.length && projectCards.length) {\n"],
    ["function setupProjectCardNavigation() {\n", "function setupProjectCardNavigation() {\n  if (reactOwnsCatalog) return;\n"],
    ["function setupProjectSearch() {\n", "function setupProjectSearch() {\n  if (reactOwnsCatalog) return;\n"],
  ],
  "style.css": [
    [".project-search-wrap {\n  margin: -10px 0 28px;\n}\n", ".project-search-wrap {\n  margin: -10px 0 28px;\n  display: grid;\n  gap: 10px;\n}\n"],
    [".project-search-wrap label {\n  display: grid;\n", ".project-search-wrap label,\n.project-search-wrap > div {\n  display: grid;\n"],
    [".project-search-wrap label > div {\n  display: flex;\n",".project-search-wrap label > div,\n.project-search-wrap > div {\n  display: flex;\n"],
    ['html[data-theme="light"] .project-search-wrap label > div,\n', 'html[data-theme="light"] .project-search-wrap label > div,\nhtml[data-theme="light"] .project-search-wrap > div,\n'],
    ["  .project-search-wrap label > div { border-radius: 20px; }\n", "  .project-search-wrap label > div,\n  .project-search-wrap > div { border-radius: 20px; }\n"],
  ],
});
const lf = (value) => value.replace(/\r\n/g, "\n");

/** Reverses the reviewed edits; every edited span must occur exactly once. */
export function acceptedBaseOf(file, content, edits = WORKS_GAMES_REVIEWED_EDITS[file]) {
  let base = lf(content);
  for (const [from, to] of [...edits].reverse()) {
    assert.equal(base.split(to).length, 2, `${file}: reviewed edit must occur exactly once`);
    base = base.replace(to, () => from);
  }
  return base;
}

