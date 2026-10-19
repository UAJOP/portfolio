import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));

export const ATELIS_ROUTE_ID = "atelisDesignCaseStudy";
export const ATELIS_ROUTE = "atelis-design-case-study/";
export const ATELIS_STYLE = "atelis";
export const ATELIS_SOCIAL_IMAGE = "/assets/atelis/atelis-projects-desktop.webp";

const model = readJson("data/portfolio/atelis-case-study.json");
const catalog = readJson("data/portfolio/catalog.json");
const identity = catalog.identities.find((item) => item.id === model.id);
if (!identity) throw new Error("Atelis case study requires the canonical catalog identity");

const text = (value) => ({ type: "text", value: String(value) });
const internal = (target) => ({ type: "internal", path: target });
const element = (tag, attributes = {}, children = []) => ({
  type: "element",
  tag,
  attributes: Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null).map(([name, value]) => ({ name, value })),
  children: children.flat(Infinity).filter((value) => value !== null && value !== undefined).map((value) => (typeof value === "string" ? text(value) : value)),
});
const classes = (node) => String(node?.attributes?.find((entry) => entry.name === "class")?.value || "").split(/\s+/);
const attribute = (node, name) => node?.attributes?.find((entry) => entry.name === name)?.value;
const localized = (locale) => {
  const copy = model.locales[locale];
  if (!copy) throw new Error(`${locale}/${ATELIS_ROUTE_ID}: missing localized Atelis content`);
  if (locale !== "en") assertAtelisLocaleParity(model.locales.en, copy, locale);
  return copy;
};
const imageCopy = (copy, id) => copy.images[id];

/** Fail closed: every English leaf needs a non-empty localized leaf; no silent English fallback. */
export function assertAtelisLocaleParity(source, copy, locale) {
  const target = stringLeaves(copy);
  const missing = [...stringLeaves(source).keys()].filter((key) => !target.get(key)?.trim());
  if (missing.length) throw new Error(`${locale}/${ATELIS_ROUTE_ID}: missing localized Atelis keys: ${missing.join(", ")}`);
}

function action(href, label, variant = "ghost", external = false) {
  return element("a", { class: `btn ${variant}`, href, ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) }, [label]);
}

function atelisCard(locale) {
  const copy = localized(locale).card;
  const image = model.images.find((item) => item.id === "home");
  return element("article", {
    class: "project-card reveal delay-2",
    "data-category": "web",
    "data-project-link": `/${ATELIS_ROUTE}`,
    "data-project-id": model.id,
  }, [
    element("img", { src: image.src, alt: copy.alt, width: String(image.width), height: String(image.height), loading: "lazy", decoding: "async" }),
    element("div", { class: "project-content" }, [
      element("div", { class: "project-meta" }, [
        element("span", {}, [copy.category]),
        element("span", { class: "project-status is-live" }, [copy.status]),
      ]),
      element("div", { class: "project-tags" }, identity.card.stack.slice(0, 4).map((item) => element("span", {}, [item]))),
      element("h3", {}, [element("a", { href: internal(`/${ATELIS_ROUTE}`) }, [copy.title])]),
      element("p", { class: "project-role" }, [copy.role]),
      element("p", {}, [copy.summary]),
      element("div", { class: "project-actions" }, [
        element("a", { href: internal(`/${ATELIS_ROUTE}`) }, [copy.caseStudy]),
        element("a", { href: model.live, target: "_blank", rel: "noopener noreferrer" }, [copy.live]),
      ]),
    ]),
  ]);
}

/** Add one Atelis card beside Joyday without rewriting the accepted #26 snapshot. */
export function withAtelisWorksCard(children, locale) {
  let inserted = 0;
  const visit = (node) => {
    if (node?.type !== "element") return node;
    let nextChildren = node.children.map(visit);
    if (classes(node).includes("project-tier-selected")) {
      const gridIndex = nextChildren.findIndex((child) => child.type === "element" && classes(child).includes("catalog-grid"));
      if (gridIndex >= 0) {
        const grid = nextChildren[gridIndex];
        const already = grid.children.some((child) => attribute(child, "data-project-id") === model.id || attribute(child, "data-project-link") === `/${ATELIS_ROUTE}`);
        if (already) throw new Error(`${locale}: Atelis Works card already exists`);
        const joydayIndex = grid.children.findIndex((child) => attribute(child, "data-project-link") === "/atolye-joyday-case-study/");
        if (joydayIndex < 0) throw new Error(`${locale}: Atelis Works card could not find the Joyday anchor`);
        const card = atelisCard(locale);
        nextChildren = [...nextChildren];
        nextChildren[gridIndex] = { ...grid, children: [...grid.children.slice(0, joydayIndex + 1), { type: "space" }, card, ...grid.children.slice(joydayIndex + 1)] };
        inserted += 1;
      }
    }
    return { ...node, children: nextChildren };
  };
  const result = children.map(visit);
  if (inserted !== 1) throw new Error(`${locale}: expected one Atelis Works injection, found ${inserted}`);
  return result;
}

const heading = (section) => element("div", { class: "case-section-heading" }, [
  element("p", { class: "eyebrow" }, [section.eyebrow]),
  element("h2", {}, [section.title]),
]);
const copySection = (section, extra = []) => element("section", { class: "case-section section-shell" }, [
  heading(section),
  element("div", { class: "case-panel case-copy" }, [element("p", {}, [section.body])]),
  extra,
]);
const stat = (value, label) => element("article", { class: "case-proof" }, [element("strong", {}, [value]), element("span", {}, [label])]);

function gallery(copy) {
  return element("div", { class: "atelis-gallery" }, model.images.slice(1).map((image) => {
    const words = imageCopy(copy, image.id);
    return element("figure", { class: `atelis-shot atelis-shot--${image.id}` }, [
      element("img", {
        src: image.src,
        alt: words.alt,
        width: String(image.width),
        height: String(image.height),
        loading: "lazy",
        decoding: "async",
      }),
      element("figcaption", {}, [words.caption]),
    ]);
  }));
}

export function atelisCaseStudyStructure({ locale, href, resume }) {
  const copy = localized(locale);
  const heroImage = model.images[0];
  const sections = copy.sections;
  return [
    element("section", { class: "case-hero section-shell atelis-hero" }, [
      element("div", {}, [
        element("p", { class: "eyebrow" }, [copy.hero.eyebrow]),
        element("h1", {}, [copy.hero.title]),
        element("p", { class: "case-hero-lead" }, [copy.hero.lead]),
        element("dl", { class: "case-meta-grid" }, [
          [copy.hero.clientLabel, model.client], [copy.hero.roleLabel, copy.hero.role], [copy.hero.yearLabel, model.year], [copy.hero.typeLabel, copy.hero.type],
        ].map(([label, value]) => element("div", {}, [element("dt", {}, [label]), element("dd", {}, [value])]))),
        element("div", { class: "case-stack", role: "group", "aria-label": copy.labels.stack }, model.stack.map((item) => element("span", {}, [item]))),
        element("div", { class: "case-actions" }, [action(model.live, copy.hero.live, "primary", true), action(href("/works/"), copy.hero.works)]),
      ]),
      element("figure", { class: "case-hero-visual" }, [
        element("img", { src: heroImage.src, alt: imageCopy(copy, heroImage.id).alt, width: String(heroImage.width), height: String(heroImage.height), decoding: "async", fetchpriority: "high" }),
        element("figcaption", {}, [imageCopy(copy, heroImage.id).caption]),
      ]),
    ]),
    element("section", { class: "case-proof-strip is-five section-shell", "aria-label": copy.labels.proof }, [
      stat(model.facts.locales, copy.labels.locales),
      stat(model.facts.projects, copy.labels.projects),
      stat(model.facts.indexableUrls, copy.labels.urls),
      stat(model.facts.htmlPages, copy.labels.pages),
      stat(model.facts.gridTests, copy.labels.tests),
    ]),
    copySection(sections.need),
    copySection(sections.role),
    copySection(sections.direction, [element("ul", { class: "atelis-palette", "aria-label": copy.labels.palette }, model.palette.map((color, index) => element("li", { "data-atelis-swatch": String(index + 1) }, [color])))]),
    copySection(sections.portfolio),
    copySection(sections.i18n),
    copySection(sections.inquiry),
    copySection(sections.tradeoffs),
    copySection(sections.qa),
    element("section", { class: "case-section section-shell" }, [heading(sections.gallery), element("p", { class: "atelis-gallery-lead" }, [sections.gallery.body]), gallery(copy)]),
    element("section", { class: "section-shell contact-hub" }, [
      element("div", {}, [element("p", { class: "eyebrow" }, [sections.related.eyebrow]), element("h2", {}, [sections.related.title])]),
      element("div", { class: "contact-actions" }, [
        action(href("/atolye-joyday-case-study/"), sections.related.joyday, "primary"),
        action(href("/request/"), sections.related.contact),
        action(resume, sections.related.resume, "ghost", true),
      ]),
    ]),
  ];
}

export function atelisMeta(locale) {
  return localized(locale).meta;
}

export function atelisCardCopy(locale) {
  return localized(locale).card;
}

function stringLeaves(value, prefix = "", output = new Map()) {
  if (typeof value === "string") output.set(prefix, value);
  else if (Array.isArray(value)) value.forEach((item, index) => stringLeaves(item, `${prefix}[${index}]`, output));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => stringLeaves(item, prefix ? `${prefix}.${key}` : key, output));
  return output;
}

/** Deterministic fallback-source localization for the committed React route shell. */
export function atelisTranslationPairs(locale) {
  if (locale === "en") return [];
  const source = stringLeaves(localized("en"));
  const target = stringLeaves(localized(locale));
  return [...source.entries()].flatMap(([key, value]) => {
    const translated = target.get(key);
    return typeof translated === "string" && translated !== value ? [[value, translated]] : [];
  }).sort((a, b) => b[0].length - a[0].length);
}

export function atelisModel() {
  return model;
}
