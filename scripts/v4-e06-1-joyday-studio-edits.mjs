/**
 * V4-E06.1 — the reviewed delta of Joyday Action Painting's play mode.
 *
 * The accepted #30 contract (data/site/m3-30-labs-games-structure.json) and
 * the painting engine are unchanged. What E06.1 adds to the rendered
 * /joyday-paint/ document is the studio's shell, added by the route's V4
 * consumer (src/react/v4/consumers.jsx, joydayStudio): the controls that enter
 * and leave the studio, its start state, its failure state, the notice for a
 * browser without JavaScript, and two more choices on the finished artwork.
 *
 * This is the complete list. `withoutJoydayStudio` removes exactly these from
 * a rendered <main>, so a gate can still hold everything else on the page to
 * the accepted copy and structure, and it fails closed: an addition that is
 * missing, duplicated or renamed stops the gate instead of slipping past it.
 */
export const JOYDAY_STUDIO_ROUTE = "joydayPaint";

/* The studio controller: one classic script between the engine and the
 * lifecycle host, which stays the document's last classic script. */
export const JOYDAY_STUDIO_SCRIPT = "/js/pages/joyday-studio.js";

/* [what it is, how many the page carries, the element as rendered] */
export const JOYDAY_STUDIO_ADDITIONS = Object.freeze([
  ["shell bar: exit and title", 1, /<div class="jds-bar jds-bar--start">[\s\S]*?<\/div>/g],
  ["shell bar: fullscreen, new canvas, dock page", 1, /<div class="jds-bar jds-bar--end">[\s\S]*?<\/div>/g],
  ["start state: heading", 1, /<h2 class="jds-start">[\s\S]*?<\/h2>/g],
  ["start state: start and resume", 1, /<div class="jds-go">[\s\S]*?<\/div>/g],
  ["studio mood announcement (E06.1B)", 1, /<p class="jds-mood"[^>]*>[\s\S]*?<\/p>/g],
  ["failure state", 1, /<div class="jds-error"[^>]*>[\s\S]*?<\/div><\/div>/g],
  ["notice without JavaScript", 1, /<noscript>[\s\S]*?<\/noscript>/g],
  ["finished artwork: keep painting", 1, /<button type="button" class="btn ghost" data-jds-keep="">[\s\S]*?<\/button>/g],
  ["finished artwork: exit", 1, /<button type="button" class="btn ghost" data-jds-exit="">[\s\S]*?<\/button>/g],
]);

/* Attributes the consumer sets on accepted elements; they carry no copy. */
export const JOYDAY_STUDIO_MARKS = Object.freeze(["data-jds-root", "data-jds-enter"]);

export function withoutJoydayStudio(main) {
  let html = String(main);
  for (const [what, expected, pattern] of JOYDAY_STUDIO_ADDITIONS) {
    const found = html.match(pattern) || [];
    if (found.length !== expected) throw new Error(`Joyday studio delta: expected ${expected} × ${what}, found ${found.length}`);
    html = html.replace(pattern, "");
  }
  for (const mark of JOYDAY_STUDIO_MARKS) {
    if (!html.includes(` ${mark}=""`)) throw new Error(`Joyday studio delta: ${mark} is not set`);
  }
  if (/class="[^"]*\bjds-|data-jds-(?!root=""|enter="")/.test(html)) throw new Error("Joyday studio delta: the page carries a studio element this list does not declare");
  return html;
}
