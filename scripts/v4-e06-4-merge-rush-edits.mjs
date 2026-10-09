/**
 * V4-E06.4 — the reviewed delta of Merge Rush on the Games and Works catalogs.
 *
 * The accepted catalog structure (data/site/m3-26-works-games-structure.json)
 * is unchanged on disk. It was captured while Merge Rush was a case study
 * only; now that /merge-rush/ is playable, each catalog's Merge Rush card is
 * edited at build time, and only in these ways:
 *
 *   Games   the card and its title lead to /merge-rush/; the status reads
 *           Playable V1; the actions are Play and Case Study.
 *   Works   the card still leads to the case study; the status reads
 *           Playable V1; a Play action sits beside View Case Study.
 *   Both    the summary no longer claims multi-cell board logic, which the
 *           shipped game does not have.
 *
 * Nothing else on either page is touched. Each edit fails closed: if the card
 * or the element it expects is missing or duplicated, the build stops instead
 * of shipping a half-edited card. No GitHub action is added: the game's
 * repository is private.
 */
export const MERGE_RUSH_PLAY_PATH = "/merge-rush/";
const CASE_STUDY_PATH = "/merge-rush-case-study/";
const STATUS_KEY = "mergeRush.play.facts.status";

const EDITS = {
  games: { link: "data-game-link", summaryFrom: "games.mergeRush.body", summaryTo: "mergeRush.card.games", statusClass: "game-status" },
  works: { link: "data-project-link", summaryFrom: "works.supporting.mergeRush.summary", summaryTo: "mergeRush.card.works", statusClass: "project-status" },
};

const isElement = (node) => node?.type === "element";
const attribute = (node, name) => node.attributes.find((entry) => entry.name === name);
const hasClass = (node, name) => isElement(node) && String(attribute(node, "class")?.value || "").split(/\s+/).includes(name);
const message = (key) => ({ type: "message", key });
const element = (tag, attributes, children) => ({ type: "element", tag, attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })), children });

function all(node, test, found = []) {
  if (!isElement(node)) return found;
  if (test(node)) found.push(node);
  node.children.forEach((child) => all(child, test, found));
  return found;
}

function one(node, test, what) {
  const found = all(node, test);
  if (found.length !== 1) throw new Error(`Merge Rush catalog delta: expected 1 × ${what}, found ${found.length}`);
  return found[0];
}

const setAttribute = (node, name, value) => {
  const entry = attribute(node, name);
  if (entry) entry.value = value;
  else node.attributes.push({ name, value });
};
const removeAttribute = (node, name) => {
  node.attributes = node.attributes.filter((entry) => entry.name !== name);
};
const usesMessage = (node, key) => node.children.some((child) => child.type === "message" && child.key === key);

export function withMergeRushPlayable(pageId, children) {
  const edit = EDITS[pageId];
  if (!edit) throw new Error(`Merge Rush catalog delta: no edit is declared for ${pageId}`);
  const next = structuredClone(children);
  const root = { type: "element", tag: "main", attributes: [], children: next };
  const card = one(root, (node) => attribute(node, edit.link)?.value === CASE_STUDY_PATH, `${pageId} Merge Rush card`);
  const content = one(card, (node) => hasClass(node, "project-content"), "card content");

  const status = one(card, (node) => hasClass(node, edit.statusClass), "status label");
  removeAttribute(status, "data-message-key");
  status.children = [message(STATUS_KEY)];
  if (pageId === "games") setAttribute(status, "class", "game-status live");

  const summary = one(card, (node) => node.tag === "p" && usesMessage(node, edit.summaryFrom), "summary");
  removeAttribute(summary, "data-message-key");
  summary.children = summary.children.map((child) => (child.type === "message" && child.key === edit.summaryFrom ? message(edit.summaryTo) : child));
  for (const entry of summary.attributes) {
    if (entry.value && typeof entry.value === "object" && entry.value.key === edit.summaryFrom) entry.value = { ...entry.value, key: edit.summaryTo };
  }

  /* The card's closing link becomes the action row. */
  const closing = content.children.filter((node) => isElement(node) && node.tag === "a");
  if (closing.length !== 1) throw new Error(`Merge Rush catalog delta: expected 1 × closing link on the ${pageId} card, found ${closing.length}`);
  const [caseStudy] = closing;
  const play = element("a", { href: { type: "internal", path: MERGE_RUSH_PLAY_PATH } }, [message("portfolio.cta.play")]);
  if (pageId === "games") {
    setAttribute(card, edit.link, MERGE_RUSH_PLAY_PATH);
    const title = one(card, (node) => node.tag === "h3", "title");
    setAttribute(one(title, (node) => node.tag === "a", "title link"), "href", { type: "internal", path: MERGE_RUSH_PLAY_PATH });
    caseStudy.children = [message("games.action.caseStudy")];
  }
  const actions = element("div", { class: "project-actions" }, pageId === "games" ? [play, caseStudy] : [caseStudy, play]);
  content.children = content.children.map((node) => (node === caseStudy ? actions : node));
  return next;
}
