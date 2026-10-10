/**
 * V4-E06.3 — the reviewed delta of Career Adventure as an entered game.
 *
 * The accepted #30 page structure (data/site/m3-30-labs-games-structure.json)
 * is unchanged. What E06.3 adds to the rendered /adventure/ document is the
 * game's shell, added by the route's V4 consumer (src/react/v4/consumers.jsx,
 * careerAdventure): the hero's Play action, the board's poster, and around the
 * canvas its HUD, the milestone toast and the menu, how-to, settings, career
 * path, pause, result and failure layers.
 *
 * Every added element carries data-ca-part, and this is the complete list.
 * `withoutCareerAdventureGame` removes exactly these from a rendered <main>,
 * so a gate can still hold everything else on the page to the accepted copy
 * and structure. It fails closed: a part that is missing, duplicated or not
 * declared here stops the gate instead of slipping past it.
 *
 * Like E06.2, the engine itself changed in this phase (adventure-game.js was
 * rewritten around a fixed-step simulation): see
 * docs/v4-e06-3-career-adventure.md for what, and why the #30 reviewed edits
 * can no longer be reversed out of that file.
 */
export const CAREER_ADVENTURE_ROUTE = "adventure";

/* The game controller: one classic script between the engine and the
 * lifecycle host, which stays the document's last classic script. */
export const CAREER_ADVENTURE_SCRIPT = "/js/pages/career-adventure-game.js";

/* [part, what it is] — one of each per document. */
export const CAREER_ADVENTURE_PARTS = Object.freeze([
  ["enter", "hero: the Play action and the profile's record"],
  ["noscript", "notice without JavaScript"],
  ["poster", "board: the poster that enters the game"],
  ["hud", "HUD: controls, score, next object, tools, stage, career path"],
  ["toast", "milestone toast"],
  ["layers", "menu, how to play, settings, career path, pause, results, failure"],
]);

/* Attributes the consumer sets on accepted elements. They carry no copy the
 * page shows; the labels travel as data for the controller and the engine. */
export const CAREER_ADVENTURE_MARKS = Object.freeze(["data-ca-hero", "data-ca-root"]);

/* The element that opens at `start`, through its matching close tag. */
function elementEnd(html, start, tag) {
  const token = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
  token.lastIndex = start;
  let depth = 0;
  for (let match = token.exec(html); match; match = token.exec(html)) {
    if (match[1]) depth -= 1;
    else if (!match[0].endsWith("/>")) depth += 1;
    if (depth === 0) return token.lastIndex;
  }
  throw new Error(`Career Adventure delta: <${tag}> opened at ${start} is never closed`);
}

export function withoutCareerAdventureGame(main) {
  let html = String(main);
  for (const [part, what] of CAREER_ADVENTURE_PARTS) {
    const opening = new RegExp(`<([a-z0-9]+)\\b[^>]*\\sdata-ca-part="${part}"[^>]*>`, "g");
    const found = [...html.matchAll(opening)];
    if (found.length !== 1) throw new Error(`Career Adventure delta: expected 1 × ${what}, found ${found.length}`);
    const [{ index }] = found;
    html = html.slice(0, index) + html.slice(elementEnd(html, index, found[0][1]));
  }
  for (const mark of CAREER_ADVENTURE_MARKS) {
    if (!html.includes(` ${mark}=""`)) throw new Error(`Career Adventure delta: ${mark} is not set`);
  }
  if (/data-ca-part=|class="[^"]*\bca-/.test(html)) throw new Error("Career Adventure delta: the page carries a game element this list does not declare");
  /* The root's labels, its name and the marks are attributes of accepted elements. */
  return html.replace(/ data-ca-labels="[^"]*"/, "");
}
