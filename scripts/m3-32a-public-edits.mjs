import assert from "node:assert/strict";
import { ICON_FONT, ICON_LICENSE, ICON_OFL, ICON_STYLESHEET } from "./generate-icon-font.mjs";

/** Reviewed document edit for Master 3 #32A (self-hosted Boxicons subset).
 * A React-owned document is its accepted bytes with exactly one change in
 * <head>: the upstream icon stylesheet and its two connection hints become the
 * local subset stylesheet, in the same cascade position. Reversing the edit
 * must reproduce the contract an earlier phase pinned, so those gates keep
 * their accepted hashes and need no git history. Legacy-owned documents (404,
 * the project-detail shell) are out of scope and keep the upstream link. */
export const ICON_SUBSET_LINK = '<link rel="stylesheet" href="/css/boxicons-subset.css"/>';
export const ICON_UPSTREAM_LINK = '<link rel="stylesheet" href="https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css"/>';
export const ICON_UPSTREAM_PRECONNECTS = '<link rel="preconnect" href="https://unpkg.com"/><link rel="preconnect" href="https://unpkg.com" crossorigin=""/>';
/** Public files #32A adds. They are generator output for the pinned upstream
 * package, so `generate-icon-font.mjs --check` is their authority, not a hash. */
export const ICON_SUBSET_PUBLIC_FILES = Object.freeze([ICON_STYLESHEET, ICON_FONT, ICON_OFL, ICON_LICENSE]);
/* React hoists connection hints; the upstream pair followed this one. */
const PRECEDING_PRECONNECT = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin=""/>';
const UPSTREAM_TAG = /<link\b[^>]*\bhref="https:\/\/unpkg\.com(\/boxicons@2\.1\.4\/css\/boxicons\.min\.css)?"[^>]*>/g;

const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

/** The accepted (pre-#32A) bytes of a React-emitted document. */
export function iconSubsetAcceptedBase(html, file) {
  assert.equal(occurrences(html, ICON_SUBSET_LINK), 1, `${file}: #32A icon stylesheet must occur exactly once`);
  assert.equal(occurrences(html, "https://unpkg.com"), 0, `${file}: #32A leaves no upstream icon host reference`);
  assert.equal(occurrences(html, PRECEDING_PRECONNECT), 1, `${file}: #32A connection-hint anchor must occur exactly once`);
  return html
    .replace(PRECEDING_PRECONNECT, () => `${PRECEDING_PRECONNECT}${ICON_UPSTREAM_PRECONNECTS}`)
    .replace(ICON_SUBSET_LINK, () => ICON_UPSTREAM_LINK);
}

/** An accepted static document with the same edit applied forward. Hermetic
 * browser comparisons serve the accepted side this way: the upstream host is
 * unreachable there, so without it the accepted page would render no icons
 * while the React page renders all of them. */
export function withIconSubset(html, file) {
  const tags = [...html.matchAll(UPSTREAM_TAG)].map((match) => Boolean(match[1]));
  assert.deepEqual(tags, [false, false, true], `${file}: accepted document must carry the upstream icon stylesheet after its two connection hints`);
  return html.replace(UPSTREAM_TAG, (tag, stylesheet) => (stylesheet ? ICON_SUBSET_LINK : ""));
}

/** Whether a document is an accepted one a hermetic server serves through `withIconSubset`. */
export const servesUpstreamIcons = (html) => html.includes("https://unpkg.com/boxicons@");
