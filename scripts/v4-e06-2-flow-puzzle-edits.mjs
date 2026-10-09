/**
 * V4-E06.2 — the reviewed delta of AI Flow Puzzle as an entered game.
 *
 * The accepted #30 page structure (data/site/m3-30-labs-games-structure.json)
 * is unchanged. What E06.2 adds to the rendered /ai-flow-puzzle/ document is
 * the game's shell, added by the route's V4 consumer
 * (src/react/v4/consumers.jsx, flowPuzzle): the hub in the hero, and around
 * the workspace its bar, panel tabs, canvas controls, hint note, selection
 * bar, phone dock, menu, and the mission, result and failure layers.
 *
 * Every added element carries data-afp-part, and this is the complete list.
 * `withoutFlowPuzzleGame` removes exactly these from a rendered <main>, so a
 * gate can still hold everything else on the page to the accepted copy and
 * structure. It fails closed: a part that is missing, duplicated or not
 * declared here stops the gate instead of slipping past it.
 *
 * Unlike E06.1, the engine itself changed in this phase (ai-flow-puzzle.js):
 * see docs/v4-e06-2-ai-flow-puzzle.md for what, and why the #30 reviewed
 * edits can no longer be reversed out of that file.
 */
export const FLOW_PUZZLE_ROUTE = "aiFlowPuzzle";

/* The game controller: one classic script between the engine and the
 * lifecycle host, which stays the document's last classic script. */
export const FLOW_PUZZLE_SCRIPT = "/js/pages/flow-puzzle-game.js";

/* [part, what it is] — one of each per document. */
export const FLOW_PUZZLE_PARTS = Object.freeze([
  ["hub", "hub: missions, progress, how to play"],
  ["by", "hub: by-line, tagline and premise"],
  ["noscript", "notice without JavaScript"],
  ["bar-start", "workspace bar: level select, name, level"],
  ["bar-end", "workspace bar: hints used, menu"],
  ["tabs", "panel tabs"],
  ["zoom", "canvas controls: zoom out, fit, zoom in"],
  ["note", "hint note"],
  ["selbar", "selection bar"],
  ["dock", "phone and tablet dock"],
  ["scrim", "sheet scrim"],
  ["menu", "workspace menu"],
  ["mission", "mission briefing layer"],
  ["result", "result layer"],
  ["error", "failure state"],
]);

/* Attributes the consumer sets on accepted elements. They carry no copy the
 * page shows; the labels travel as data for the controller and the engine. */
export const FLOW_PUZZLE_MARKS = Object.freeze(["data-afp-hub", "data-afp-play", "data-afp-root"]);

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
  throw new Error(`Flow puzzle delta: <${tag}> opened at ${start} is never closed`);
}

export function withoutFlowPuzzleGame(main) {
  let html = String(main);
  for (const [part, what] of FLOW_PUZZLE_PARTS) {
    const opening = new RegExp(`<([a-z0-9]+)\\b[^>]*\\sdata-afp-part="${part}"[^>]*>`, "g");
    const found = [...html.matchAll(opening)];
    if (found.length !== 1) throw new Error(`Flow puzzle delta: expected 1 × ${what}, found ${found.length}`);
    const [{ index }] = found;
    html = html.slice(0, index) + html.slice(elementEnd(html, index, found[0][1]));
  }
  for (const mark of FLOW_PUZZLE_MARKS) {
    if (!html.includes(` ${mark}=""`)) throw new Error(`Flow puzzle delta: ${mark} is not set`);
  }
  if (/data-afp-part=|class="[^"]*\bafp-/.test(html)) throw new Error("Flow puzzle delta: the page carries a game element this list does not declare");
  /* The root's label and its data are attributes of an accepted element. */
  return html.replace(/ data-afp-labels="[^"]*"/, "");
}
