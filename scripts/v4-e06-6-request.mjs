/**
 * V4-E06.6 — the Request page's collaboration surface.
 *
 * The form, its fields, its validation and its submission are the accepted
 * ones and are not touched. Two things beside the form change:
 *
 *   - the note under "Good for" told visitors how the endpoint posts
 *     (no-cors, Apps Script). It now says what a visitor needs to know: who
 *     reads the request, and what to do if the form does not confirm it;
 *   - a "Direct contact" panel gives the two shortest paths that already
 *     exist on the site, email and LinkedIn, for someone who would rather
 *     talk first.
 *
 * The page is a captured, locale-resolved structure, so copy arrives as text
 * through `message`, the route's own localization.
 */
const EMAIL = "kaanb8776@gmail.com";
const LINKEDIN = "https://www.linkedin.com/in/balcikaan/";
export const REQUEST_STYLE = "request";

const text = (value) => ({ type: "text", value: String(value) });
const element = (tag, attributes = {}, children = []) => ({
  type: "element",
  tag,
  attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
  children: children.map((value) => (typeof value === "string" ? text(value) : value)),
});
const isElement = (node) => node?.type === "element";
const hasClass = (node, name) => isElement(node) && String(node.attributes.find((entry) => entry.name === "class")?.value || "").split(/\s+/).includes(name);
function one(nodes, name) {
  const found = [];
  const walk = (node) => { if (!isElement(node)) return; if (hasClass(node, name)) found.push(node); node.children.forEach(walk); };
  nodes.forEach(walk);
  if (found.length !== 1) throw new Error(`request surface: expected 1 × .${name}, found ${found.length}`);
  return found[0];
}

export function withRequestSurface(children, message) {
  const next = structuredClone(children);
  const note = one(next, "request-note");
  note.attributes = note.attributes.filter((entry) => !entry.name.startsWith("data-pv2-"));
  note.children = [text(message("request.v4.note"))];

  one(next, "request-copy").children.push(element("div", { class: "detail-panel compact-panel request-info-card v4-request-direct" }, [
    element("p", { class: "eyebrow" }, [message("request.v4.direct.eyebrow")]),
    element("h2", {}, [message("request.v4.direct.title")]),
    element("p", {}, [message("request.v4.direct.body")]),
    element("p", { class: "v4-request-direct__links" }, [
      element("a", { href: `mailto:${EMAIL}` }, [EMAIL]),
      element("a", { href: LINKEDIN, target: "_blank", rel: "noopener noreferrer" }, ["LinkedIn"]),
    ]),
  ]));
  return next;
}
