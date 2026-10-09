/**
 * V4-E06.5 — the complete catalog on Works and the native archive on Games.
 *
 * data/portfolio/catalog.json is the coverage registry: one public identity
 * per standalone project, one collection of earlier learning artifacts that
 * are not projects, and a disposition for every UAJOP repository. This module
 * turns its public part into page structure at build time:
 *
 *   Works   a "Complete catalog" section after the curated explorer: three
 *           collapsed groups of project rows, the learning collection, then
 *           the factual relations and the capability evidence. The curated cards, the filter, the
 *           System Map and the Capability View above it are unchanged.
 *   Games   a "Native game archive" section under the four browser games,
 *           and Play plus Case Study on each of the four.
 *
 * Groups are <details>, so the whole catalog is reachable without
 * JavaScript and nothing here needs hydration state. Rows are not project
 * cards: they do not enter the explorer's filter, map or counts, and they do
 * not reach Home.
 *
 * Only `identities`, `collections` and `relations` are read here. `repositories` (which
 * names private repositories) is for the audit document and the coverage
 * gate, and is never rendered.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const CATALOG_STYLE = "catalog";

export function loadCatalog() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "portfolio", "catalog.json"), "utf8"));
}

const text = (value) => ({ type: "text", value: String(value) });
const message = (key) => ({ type: "message", key });
const internal = (target) => ({ type: "internal", path: target });
const element = (tag, attributes = {}, children = []) => ({
  type: "element",
  tag,
  attributes: Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null).map(([name, value]) => ({ name, value })),
  children: children.flat(Infinity).filter((value) => value !== null && value !== undefined).map((value) => (typeof value === "string" ? text(value) : value)),
});
const two = (value) => String(value).padStart(2, "0");
const isExternal = (target) => /^https?:\/\//.test(target);
const href = (target) => (isExternal(target) ? target : internal(target));
const detailPath = (identity) => (identity.detailSlug ? `/projects/${identity.detailSlug}/` : null);

/** Where an identity's title leads: its case study, else its detail page, else its play page. */
export function primaryPath(identity) {
  return identity.links.caseStudy || detailPath(identity) || identity.links.play || null;
}

function link(target, label) {
  const external = isExternal(target);
  return element("a", { href: href(target), ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) }, [label]);
}

function row(identity) {
  const primary = primaryPath(identity);
  if (!primary) throw new Error(`catalog: ${identity.id} has no public page`);
  const detail = detailPath(identity);
  const actions = [
    identity.links.play ? link(identity.links.play, message(identity.kind === "assistant" ? "catalog.link.open" : "catalog.link.play")) : null,
    identity.links.caseStudy && identity.links.caseStudy !== primary ? link(identity.links.caseStudy, message("catalog.link.caseStudy")) : null,
    detail && detail !== primary ? link(detail, message("catalog.link.details")) : null,
    identity.links.live ? link(identity.links.live, message("catalog.link.live")) : null,
    identity.links.github ? link(identity.links.github, "GitHub") : null,
    identity.links.video ? link(identity.links.video, "Video") : null,
  ].filter(Boolean);
  return element("li", { class: "v4-catalog__row", "data-catalog-id": identity.id }, [
    element("a", { class: "v4-catalog__title", href: href(primary) }, [identity.title]),
    element("span", { class: "v4-catalog__kind" }, [message(`catalog.kind.${identity.kind}`)]),
    element("span", { class: "v4-catalog__tech" }, [identity.tech]),
    element("span", { class: "v4-catalog__year" }, [identity.year]),
    element("span", { class: "v4-catalog__status", "data-catalog-status": identity.status }, [message(`catalog.status.${identity.status}`)]),
    actions.length ? element("span", { class: "v4-catalog__links" }, actions) : null,
  ]);
}

/* A member of a collection: a learning artifact, not a project. It links to
 * an archive page when one exists; an incomplete artifact has no page and is
 * named without a link. */
function memberRow(member) {
  const detail = member.detailSlug ? `/projects/${member.detailSlug}/` : null;
  const actions = [member.links.github ? link(member.links.github, "GitHub") : null].filter(Boolean);
  return element("li", { class: "v4-catalog__row v4-catalog__row--member", "data-catalog-member": member.id }, [
    detail ? element("a", { class: "v4-catalog__title", href: href(detail) }, [member.title]) : element("span", { class: "v4-catalog__title" }, [member.title]),
    element("span", { class: "v4-catalog__kind" }, [message(`catalog.kind.${member.kind}`)]),
    element("span", { class: "v4-catalog__tech" }, [member.tech]),
    element("span", { class: "v4-catalog__year" }, [member.year]),
    element("span", { class: "v4-catalog__status", "data-catalog-status": member.status }, [message(`catalog.status.${member.status}`)]),
    actions.length ? element("span", { class: "v4-catalog__links" }, actions) : null,
  ]);
}

function group(catalog, id, { open = false, name = "v4-catalog" } = {}) {
  const collection = (catalog.collections || []).find((entry) => entry.group === id);
  if (collection) {
    return element("details", { class: "v4-catalog__group v4-catalog__group--collection", id: `catalog-${id}`, name, "data-catalog-collection": collection.id }, [
      element("summary", {}, [
        element("span", { class: "v4-catalog__label" }, [message(`catalog.group.${id}`)]),
        element("span", { class: "v4-catalog__count" }, [two(collection.members.length)]),
      ]),
      element("p", { class: "v4-catalog__note" }, [message(`catalog.group.${id}.note`)]),
      element("ul", { class: "v4-catalog__list" }, collection.members.map(memberRow)),
    ]);
  }
  const identities = catalog.identities.filter((identity) => identity.group === id);
  return element("details", { class: "v4-catalog__group", id: `catalog-${id}`, name, ...(open ? { open: "open" } : {}) }, [
    element("summary", {}, [
      element("span", { class: "v4-catalog__label" }, [message(`catalog.group.${id}`)]),
      element("span", { class: "v4-catalog__count" }, [two(identities.length)]),
    ]),
    element("p", { class: "v4-catalog__note" }, [message(`catalog.group.${id}.note`)]),
    element("ul", { class: "v4-catalog__list" }, identities.map(row)),
  ]);
}

function relations(catalog) {
  const byId = new Map(catalog.identities.map((identity) => [identity.id, identity]));
  const node = (id) => {
    const identity = byId.get(id);
    if (!identity) throw new Error(`catalog relation points at unknown identity ${id}`);
    return element("a", { href: href(primaryPath(identity)) }, [identity.title]);
  };
  return element("details", { class: "v4-catalog__group v4-catalog__group--relations", id: "catalog-relations", name: "v4-catalog" }, [
    element("summary", {}, [
      element("span", { class: "v4-catalog__label" }, [message("catalog.relations.title")]),
      element("span", { class: "v4-catalog__count" }, [two(catalog.relations.length)]),
    ]),
    element("p", { class: "v4-catalog__note" }, [message("catalog.relations.note")]),
    element("ul", { class: "v4-catalog__relations" }, catalog.relations.map((relation) => element("li", { "data-catalog-relation": relation.type }, [
      node(relation.from), element("span", {}, [message(`catalog.relation.${relation.type}`)]), node(relation.to),
    ]))),
  ]);
}

/** Evidence per capability: current work first, never the learning or history tiers. */
function capabilities(catalog) {
  const counted = catalog.identities.filter((identity) => !["learning", "history"].includes(identity.tier));
  const clusters = catalog.capabilities.map((id) => ({ id, identities: counted.filter((identity) => identity.capabilities.includes(id)) })).filter((cluster) => cluster.identities.length);
  return element("details", { class: "v4-catalog__group v4-catalog__group--capabilities", id: "catalog-capabilities", name: "v4-catalog" }, [
    element("summary", {}, [
      element("span", { class: "v4-catalog__label" }, [message("catalog.capabilities.title")]),
      element("span", { class: "v4-catalog__count" }, [two(clusters.length)]),
    ]),
    element("p", { class: "v4-catalog__note" }, [message("catalog.capabilities.note")]),
    element("dl", { class: "v4-catalog__clusters" }, clusters.map((cluster) => element("div", { "data-catalog-capability": cluster.id }, [
      element("dt", {}, [message(`catalog.capability.${cluster.id}`)]),
      element("dd", {}, cluster.identities.map((identity) => element("a", { href: href(primaryPath(identity)) }, [identity.title]))),
    ]))),
  ]);
}

export function worksCatalogSection(catalog = loadCatalog()) {
  return element("section", { class: "section-shell section-block v4-catalog", id: "catalog", "aria-labelledby": "v4-catalog-title" }, [
    element("div", { class: "section-heading" }, [
      element("p", { class: "eyebrow" }, [message("catalog.eyebrow")]),
      element("h2", { id: "v4-catalog-title" }, [message("catalog.title")]),
      element("p", {}, [message("catalog.lead")]),
    ]),
    element("div", { class: "v4-catalog__groups" }, [
      ...catalog.groups.map((id) => group(catalog, id)),
      relations(catalog),
      capabilities(catalog),
    ]),
  ]);
}

export function gamesArchiveSection(catalog = loadCatalog()) {
  return element("section", { class: "section-shell section-block v4-catalog v4-catalog--games", id: "native-archive", "aria-labelledby": "v4-native-title" }, [
    element("div", { class: "section-heading" }, [
      element("p", { class: "eyebrow" }, [message("catalog.eyebrow")]),
      element("h2", { id: "v4-native-title" }, [message("catalog.group.nativeGames")]),
      element("p", {}, [message("catalog.games.archiveLead")]),
    ]),
    element("div", { class: "v4-catalog__groups" }, [group(catalog, "nativeGames", { open: true, name: null })]),
  ]);
}

/* ---------- the page deltas ---------- */

const isElement = (node) => node?.type === "element";
const attribute = (node, name) => node.attributes.find((entry) => entry.name === name);
const hasClass = (node, name) => isElement(node) && String(attribute(node, "class")?.value || "").split(/\s+/).includes(name);
function all(node, test, found = []) {
  if (!isElement(node)) return found;
  if (test(node)) found.push(node);
  node.children.forEach((child) => all(child, test, found));
  return found;
}
function one(node, test, what) {
  const found = all(node, test);
  if (found.length !== 1) throw new Error(`catalog delta: expected 1 × ${what}, found ${found.length}`);
  return found[0];
}

/** Works: the catalog section follows the curated explorer. Nothing above it changes. */
export function withWorksCatalog(children, catalog = loadCatalog()) {
  return [...children, worksCatalogSection(catalog)];
}

/**
 * Games: the hero says what the page now is, each browser game offers Play
 * and Case Study, and the native archive follows the four browser games.
 */
export function withGamesCatalog(children, catalog = loadCatalog()) {
  const next = structuredClone(children);
  const root = { type: "element", tag: "main", attributes: [], children: next };
  const title = one(root, (node) => node.tag === "h1", "Games title");
  title.attributes = title.attributes.filter((entry) => !/^data-(message-key|pv2-)/.test(entry.name));
  title.children = [message("catalog.games.heroTitle")];

  const playable = catalog.identities.filter((identity) => identity.kind === "browserGame");
  for (const identity of playable) {
    const card = one(root, (node) => hasClass(node, "game-card") && attribute(node, "data-game-link")?.value === identity.links.play, `${identity.id} game card`);
    const content = one(card, (node) => hasClass(node, "project-content"), `${identity.id} card content`);
    const existing = all(content, (node) => hasClass(node, "project-actions"));
    const closing = content.children.filter((node) => isElement(node) && node.tag === "a");
    const caseStudy = element("a", { href: internal(identity.links.caseStudy) }, [message("games.action.caseStudy")]);
    if (existing.length === 1) {
      /* A card that already offers its case study (by path or by its own label) keeps what it has. */
      const links = existing[0].children.filter(isElement);
      const has = links.some((entry) => attribute(entry, "href")?.value?.path === identity.links.caseStudy || entry.children.some((child) => child.type === "message" && child.key === "games.action.caseStudy"));
      if (!has) existing[0].children = [...existing[0].children, caseStudy];
    } else if (closing.length === 1) {
      const actions = element("div", { class: "project-actions" }, [closing[0], caseStudy]);
      content.children = content.children.map((node) => (node === closing[0] ? actions : node));
    } else {
      throw new Error(`catalog delta: ${identity.id} card has no action to extend`);
    }
  }

  const featured = next.findIndex((node) => hasClass(node, "games-featured"));
  if (featured === -1) throw new Error("catalog delta: the Games catalog section is missing");
  next.splice(featured + 1, 0, gamesArchiveSection(catalog));
  return next;
}
