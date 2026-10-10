/**
 * V4-E06.5 / E06.6 — the complete catalog on Works and the native archive on
 * Games, presented as cards.
 *
 * data/portfolio/catalog.json is the coverage registry: one public identity
 * per standalone project, one collection of earlier learning artifacts that
 * are not projects, and a disposition for every UAJOP repository. This module
 * turns its public part into page structure at build time:
 *
 *   Works   a "Complete catalog" section after the curated explorer: three
 *           collapsed groups of project cards, the learning collection as
 *           compact cards, then the factual relations and the capability
 *           evidence. The curated cards, the filter, the System Map and the
 *           Capability View above it are unchanged.
 *   Games   the four browser games with one playable treatment (Play plus
 *           Case Study, a frame of the game itself), then the native archive
 *           as cards.
 *
 * Groups are <details>, so the whole catalog is reachable without
 * JavaScript and nothing here needs hydration state. Catalog cards are not
 * the explorer's project cards: they do not enter its filter, map or counts,
 * and they do not reach Home.
 *
 * Only `identities`, `collections`, `relations` and `cards` are read here.
 * `repositories` (which names private repositories) is for the audit
 * document and the coverage gate, and is never rendered.
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

/* ---------- the card system (V4-E06.6) ----------
 *
 * One card, three tiers. `featured` is the flagship size, `standard` a full
 * project card, `compact` the denser archive and learning card. Every tier has
 * the same parts in the same order: a visual, kind · year · status, the title,
 * the role where one is recorded, one line on what was built, the stack and
 * the links that exist. A tier changes size and density, never completeness.
 *
 * The visual is the project's own image, in variants written by
 * scripts/v4-e06-6-card-images.mjs. A project without an authentic image gets
 * a typographic identity plate (its real stack on the V4 grid), which
 * is plainly not a screenshot. */
const SIZES = {
  lead: "(max-width: 760px) 92vw, 560px",
  featured: "(max-width: 760px) 92vw, (max-width: 1100px) 46vw, 590px",
  standard: "(max-width: 760px) 92vw, (max-width: 1100px) 46vw, 390px",
  compact: "(max-width: 760px) 92vw, (max-width: 1100px) 46vw, 290px",
};

/** The typographic identity plate: the entry's real stack, set in type. */
export function plateNode(entry, extraClass = "") {
  if (!entry.card?.plate) throw new Error(`catalog: ${entry.id} has no plate`);
  const [first, ...rest] = entry.tech.split(" · ");
  return element("div", { class: `v4-pcard__media v4-pcard__media--plate${extraClass ? ` ${extraClass}` : ""}`, "aria-hidden": "true", "data-plate-kind": entry.kind }, [
    element("span", { class: "v4-pcard__monogram" }, [first]),
    rest.length ? element("span", { class: "v4-pcard__plate-tech" }, [rest.join(" · ")]) : null,
  ]);
}

/** Every catalog entry that has a card, by id and by project slug. */
export function cardEntries(catalog = loadCatalog()) {
  return [...catalog.identities, ...(catalog.collections || []).flatMap((collection) => collection.members)].filter((entry) => entry.card);
}

function visual(entry, sizes) {
  const { image } = entry.card;
  if (!image) return plateNode(entry);
  if (!image.variants?.length) throw new Error(`catalog: ${entry.id} has no image variants; run scripts/v4-e06-6-card-images.mjs`);
  const [smallest] = image.variants;
  return element("div", { class: `v4-pcard__media${image.fit === "contain" ? " v4-pcard__media--contain" : ""}${image.backdrop === "light" ? " v4-pcard__media--light" : ""}` }, [
    /* The title beside it names the project; the image adds no text of its own. */
    element("img", {
      alt: "", src: `/${smallest.src}`, srcset: image.variants.map((variant) => `/${variant.src} ${variant.width}w`).join(", "), sizes,
      width: String(smallest.width), height: String(smallest.height), loading: "lazy", decoding: "async",
    }),
  ]);
}

function actionsOf(entry) {
  const detail = detailPath(entry);
  return [
    entry.links.play ? link(entry.links.play, message(entry.kind === "assistant" ? "catalog.link.open" : "catalog.link.play")) : null,
    entry.links.caseStudy ? link(entry.links.caseStudy, message("catalog.link.caseStudy")) : null,
    detail ? link(detail, message("catalog.link.details")) : null,
    entry.links.live ? link(entry.links.live, message("catalog.link.live")) : null,
    entry.links.github ? link(entry.links.github, "GitHub") : null,
    entry.links.video ? link(entry.links.video, "Video") : null,
  ].filter(Boolean);
}

function card(entry, { heading, member = false, lead = false }) {
  if (!entry.card) throw new Error(`catalog: ${entry.id} has no card`);
  const primary = member ? detailPath(entry) : primaryPath(entry);
  if (!primary) throw new Error(`catalog: ${entry.id} has no public page`);
  const tier = entry.card.tier;
  return element("li", {
    class: `v4-catalog__row v4-pcard v4-pcard--${tier}${lead ? " v4-pcard--lead" : ""}`,
    [member ? "data-catalog-member" : "data-catalog-id"]: entry.id,
    "data-card-tier": tier,
    ...(entry.kind === "browserGame" ? { "data-card-playable": true } : {}),
  }, [
    visual(entry, SIZES[lead ? "lead" : tier]),
    element("div", { class: "v4-pcard__body" }, [
      element("p", { class: "v4-pcard__meta" }, [
        element("span", { class: "v4-catalog__kind" }, [message(`catalog.kind.${entry.kind}`)]),
        element("span", { class: "v4-catalog__year" }, [entry.year]),
        element("span", { class: "v4-catalog__status", "data-catalog-status": entry.status }, [message(`catalog.status.${entry.status}`)]),
      ]),
      element(heading, { class: "v4-pcard__title" }, [element("a", { class: "v4-catalog__title", href: href(primary) }, [entry.title])]),
      entry.card.roleRef ? element("p", { class: "v4-pcard__role" }, [{ type: "role", ref: entry.card.roleRef }]) : null,
      element("p", { class: "v4-pcard__summary" }, [message(`catalog.card.${entry.id}.summary`)]),
      element("ul", { class: "v4-pcard__stack" }, entry.card.stack.map((token) => element("li", {}, [token]))),
      element("p", { class: "v4-catalog__links v4-pcard__actions" }, actionsOf(entry)),
    ]),
  ]);
}

/* The repositories that were never finished: named for the record inside the
 * learning collection, with their source link and no card, image or page. */
function unfinishedNote(members, heading) {
  if (!members.length) return null;
  return element("li", { class: "v4-pcard v4-pcard--note" }, [
    element(heading, { class: "v4-pcard__title" }, [message("catalog.card.unfinished.title")]),
    element("p", { class: "v4-pcard__summary" }, [message("catalog.card.unfinished.body")]),
    element("ul", { class: "v4-pcard__unfinished" }, members.map((member) => element("li", { class: "v4-catalog__row", "data-catalog-member": member.id }, [
      element("span", { class: "v4-catalog__title" }, [member.title]),
      element("span", { class: "v4-catalog__status", "data-catalog-status": member.status }, [message(`catalog.status.${member.status}`)]),
      member.links.github ? element("span", { class: "v4-catalog__links" }, [link(member.links.github, "GitHub")]) : null,
    ]))),
  ]);
}

/** The cards of one group, in catalog order, the group's lead card first. */
function cardGrid(catalog, id, heading) {
  const collection = (catalog.collections || []).find((entry) => entry.group === id);
  if (collection) {
    return element("ul", { class: "v4-pcards v4-pcards--compact" }, [
      ...collection.members.filter((member) => !member.incomplete).map((member) => card(member, { heading, member: true })),
      unfinishedNote(collection.members.filter((member) => member.incomplete), heading),
    ]);
  }
  const identities = catalog.identities.filter((identity) => identity.group === id);
  const leadId = catalog.cards.lead[id];
  const tiers = new Set(identities.map((identity) => identity.card.tier));
  if (tiers.size !== 1) throw new Error(`catalog: group ${id} mixes card tiers`);
  return element("ul", { class: `v4-pcards v4-pcards--${[...tiers][0]}`, "data-card-group": id }, identities.map((identity) => card(identity, { heading, lead: identity.id === leadId })));
}

function groupCount(catalog, id) {
  const collection = (catalog.collections || []).find((entry) => entry.group === id);
  return collection ? collection.members.length : catalog.identities.filter((identity) => identity.group === id).length;
}

function group(catalog, id) {
  const collection = (catalog.collections || []).find((entry) => entry.group === id);
  return element("details", {
    class: `v4-catalog__group v4-catalog__group--cards${collection ? " v4-catalog__group--collection" : ""}`, id: `catalog-${id}`,
    ...(collection ? { "data-catalog-collection": collection.id } : {}),
  }, [
    element("summary", {}, [
      element("h3", { class: "v4-catalog__label" }, [message(`catalog.group.${id}`)]),
      element("span", { class: "v4-catalog__count" }, [two(groupCount(catalog, id))]),
      element("span", { class: "v4-catalog__summary-note" }, [message(`catalog.group.${id}.note`)]),
      element("span", { class: "v4-catalog__cue", "aria-hidden": "true" }, [message("catalog.group.show")]),
    ]),
    cardGrid(catalog, id, "h4"),
  ]);
}

function relations(catalog) {
  const byId = new Map(catalog.identities.map((identity) => [identity.id, identity]));
  const node = (id) => {
    const identity = byId.get(id);
    if (!identity) throw new Error(`catalog relation points at unknown identity ${id}`);
    return element("a", { href: href(primaryPath(identity)) }, [identity.title]);
  };
  return element("details", { class: "v4-catalog__group v4-catalog__group--relations", id: "catalog-relations" }, [
    element("summary", {}, [
      element("h3", { class: "v4-catalog__label" }, [message("catalog.relations.title")]),
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
  return element("details", { class: "v4-catalog__group v4-catalog__group--capabilities", id: "catalog-capabilities" }, [
    element("summary", {}, [
      element("h3", { class: "v4-catalog__label" }, [message("catalog.capabilities.title")]),
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
    cardGrid(catalog, "nativeGames", "h3"),
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

/**
 * The curated cards keep everything but a retired cover. A cover that imitated
 * a screenshot (or was stock art) gives way to what the catalog card shows:
 * the project's authentic image, or its identity plate.
 */
export function withCuratedVisuals(children, catalog = loadCatalog()) {
  const next = structuredClone(children);
  const owners = catalog.cards.curatedCoverOwner;
  const entries = new Map(cardEntries(catalog).map((entry) => [entry.id, entry]));
  const swap = (node) => {
    if (!isElement(node)) return;
    node.children = node.children.map((child) => {
      if (!isElement(child) || child.tag !== "img" || !hasClass(node, "project-card")) return child;
      const file = decodeURIComponent(String(attribute(child, "src")?.value || "").split("/").pop());
      const entry = entries.get(owners[file]);
      if (!entry) return child;
      if (entry.card.plate) return plateNode(entry, "v4-curated-plate");
      const { image } = entry.card;
      const largest = image.variants.at(-1);
      const kept = child.attributes.filter((item) => ["alt", "data-message-alt-key", "loading", "decoding"].includes(item.name));
      const classes = [image.fit === "contain" ? "project-cover-contain" : "", image.backdrop === "light" ? "v4-cover-light" : ""].filter(Boolean).join(" ");
      child.attributes = [...kept, ...Object.entries({
        ...(classes ? { class: classes } : {}),
        src: `/${largest.src}`, srcset: image.variants.map((variant) => `/${variant.src} ${variant.width}w`).join(", "), sizes: SIZES.featured,
        width: String(largest.width), height: String(largest.height),
      }).map(([name, value]) => ({ name, value }))];
      return child;
    });
    node.children.forEach(swap);
  };
  next.forEach(swap);
  return next;
}

/** Works: the catalog section follows the curated explorer, whose cards lose only their retired covers. */
export function withWorksCatalog(children, catalog = loadCatalog()) {
  return [...withCuratedVisuals(children, catalog), worksCatalogSection(catalog)];
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
    /* V4-E06.6: the four share one playable treatment and show the game itself. */
    card.attributes.push({ name: "data-card-playable", value: true });
    const cover = one(card, (node) => node.tag === "img", `${identity.id} card image`);
    const variants = identity.card.image.variants;
    const kept = cover.attributes.filter((entry) => ["alt", "data-message-alt-key", "loading", "decoding"].includes(entry.name));
    cover.attributes = [...kept, ...Object.entries({
      src: `/${variants[0].src}`, srcset: variants.map((variant) => `/${variant.src} ${variant.width}w`).join(", "), sizes: SIZES.featured,
      width: String(variants[0].width), height: String(variants[0].height),
    }).map(([name, value]) => ({ name, value }))];
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
