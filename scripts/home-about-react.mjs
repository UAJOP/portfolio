import fs from "node:fs";
import path from "node:path";
import { ROOT, loadRegistry, truncateDescription } from "./i18n-catalog.mjs";
import { loadProductionLocalization } from "./production-localization.mjs";
import { localizedBuildLogEntry } from "./shared-localization.mjs";
import { loadRouteRuntime, loadSiteRoutes } from "./site-routes.mjs";
import { decodeHtml } from "./localized-html.mjs";
import { createHomeAboutHeadModel, createSiteHeadRenderer } from "./site-head.mjs";
import { catalogSearchCopy, defaultCatalogSources, defaultRoleSources, projectRole } from "./m3-works-games-catalog-copy.mjs";
import { ajoopShellModel, commandPaletteModel, runtimeCollection } from "./m3-28-overlay-copy.mjs";
import { v4AboutModel, v4CertificatesModel, v4ExperienceModel } from "./v4-inner-pages.mjs";
import { ajoopCaseStudyStructure, ajoopHubModel, ajoopHubStructure, ajoopSystemModel } from "./v4-ajoop-pages.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const homeAboutStructure = readJson("data/site/m3-25b-home-about-structure.json");
const worksGamesStructure = readJson("data/site/m3-26-works-games-structure.json");
const caseStudyStructure = readJson("data/site/m3-29-case-studies-structure.json");
const labsGamesStructure = readJson("data/site/m3-30-labs-games-structure.json");
const remainingRoutesStructure = readJson("data/site/m3-30-5-remaining-routes-structure.json");
const labs = readJson("data/portfolio/labs.json");
const buildLog = readJson("data/portfolio/build-log.json");
const meta = readJson("data/portfolio/meta.json");
const profile = readJson("data/portfolio/profile.json");
const projects = readJson("data/portfolio/projects.json");
const projectDetails = readJson("data/portfolio/project-details.json");
const recruiterProfiles = readJson("data/portfolio/recruiter-profiles.json");
const socials = readJson("data/portfolio/socials.json");
const sourceMeta = readJson("data/i18n/source/meta.json");
const registry = loadRegistry();
const site = loadSiteRoutes();
const routeRuntime = loadRouteRuntime(registry, site);
const CASE_STUDY_IDS = new Set(Object.keys(caseStudyStructure.pages));
const LABS_GAMES_ACCEPTED_REF = "760feca095a80393a79562435c685afee13d096d";
const REMAINING_ROUTES_ACCEPTED_REF = "726fcde72939828ad441a7b625ef79feb1dbe662";
/* The lab-card call to action is resolved exactly as the accepted runtime
 * resolves it (getI18nText in js/core/locale.js): the locale pack's phrase for
 * the English source, else the Turkish text portfolio-v2.js carries inline,
 * else English. No pack defines the phrase today, so German, Spanish and
 * French show English, as they did; a pack entry added later is picked up
 * here and by the runtime alike. qa:m3:labs-games holds the result to what
 * the accepted runtime renders in each locale. */
const LAB_CARD_ACTION = { source: "Open experiment", tr: "Deneyi aç" };
function labCardAction(locale) {
  if (locale === registry.defaultLocale) return LAB_CARD_ACTION.source;
  const packed = readJson(`data/i18n/packs/${locale}/pages.json`).text?.[LAB_CARD_ACTION.source];
  if (typeof packed === "string" && packed) return decodeHtml(packed);
  return locale === "tr" ? LAB_CARD_ACTION.tr : LAB_CARD_ACTION.source;
}
const ENGINE_HOST_SCRIPT = "/js/pages/engine-host.js";
const PROJECT_LABELS = {
  backToWorks: "Back to works",
  askSimilarWork: "Ask for Similar Work",
  copyProjectLink: "Copy Project Link",
  preview: "preview",
  role: "Role",
  year: "Year",
  projectType: "Project Type",
  status: "Status",
  overview: "Overview",
  projectOverview: "Project Overview",
  challenge: "Challenge",
  challengeTitle: "The part that needed solving",
  solution: "Solution",
  solutionTitle: "How I approached it",
  impact: "Result / Impact",
  impactTitle: "The value created",
  process: "Process",
  processTitle: "How the work moved forward",
  techStack: "Tech Stack",
  highlights: "Highlights",
  gallery: "Gallery",
  galleryTitle: "Visual context from the project.",
  galleryBody: "Current portfolio assets are used for now. As new screenshots are added, this area becomes stronger automatically.",
  galleryImage: "gallery image",
  previousProject: "Previous Project",
  allWorks: "All Works",
  nextProject: "Next Project",
};
const PROJECT_FALLBACKS = {
  impact: "This project represents my ability to combine technical practice, user needs and product-oriented thinking.",
  process: [
    ["Analysis", "Clarified the project goal, user need and core flow."],
    ["Design", "Planned the system logic, screens or gameplay structure."],
    ["Development", "Built the technical implementation and made the core features work."],
    ["Iteration", "Refined the result through testing, cleanup and portfolio presentation."],
  ],
};

function projectPhrase(locale, phrase, pages) {
  if (locale === registry.defaultLocale) return phrase;
  const value = pages.text?.[phrase];
  if (!value) throw new Error(`${locale}/project: missing reviewed page phrase ${JSON.stringify(phrase)}`);
  return decodeHtml(value);
}

const projectSchemaType = (project) => {
  const haystack = [project.category, project.type, ...(project.stack || [])].join(" ").toLowerCase();
  if (/\bgame\b|unity|unreal|oyun/.test(haystack)) return "VideoGame";
  if (/web (site|development)|website|landing|portfolio|front-?end/.test(haystack)) return "WebSite";
  if (/software|application|app\b|desktop|database|automation|python|c#|java|kotlin|android/.test(haystack)) return "SoftwareApplication";
  return "CreativeWork";
};

function projectRouteModel(route, localization) {
  const canonical = projectDetails[route.slug];
  if (!canonical) throw new Error(`${route.locale}/project:${route.slug}: missing canonical record`);
  const overlay = localization.packs.projects?.[route.slug] || {};
  const field = (name, options = {}) => decodeHtml(localization.canonicalData({ canonical, overlay, path: name, ...options }));
  const pages = route.locale === registry.defaultLocale ? { text: {} } : readJson(`data/i18n/packs/${route.locale}/pages.json`);
  const phrase = (value) => projectPhrase(route.locale, value, pages);
  const optional = (name) => localization.canonicalData({ canonical, overlay, path: name, required: false });
  const impact = optional("impact");
  const process = optional("process");
  const slugs = Object.keys(projectDetails);
  const index = slugs.indexOf(route.slug);
  const href = (value) => value.startsWith("/") ? routeRuntime.localizedInternalHref(value, route.locale) : value;
  const asset = (value) => value.startsWith("/") ? value : `/${value}`;
  const stack = canonical.stack.map((item) => route.locale === registry.defaultLocale ? item : decodeHtml(pages.text?.[item] || item));
  const project = {
    slug: route.slug,
    category: field("category"), title: field("title"), subtitle: field("subtitle"), role: field("role"),
    year: String(canonical.year), type: field("type"), status: field("status"), overview: field("overview"),
    challenge: field("challenge"), solution: field("solution"),
    impact: impact ? decodeHtml(impact) : phrase(PROJECT_FALLBACKS.impact),
    process: process ? process.map((step) => ({ title: decodeHtml(step.title), text: decodeHtml(step.text) })) : PROJECT_FALLBACKS.process.map(([title, text]) => ({ title: phrase(title), text: phrase(text) })),
    image: asset(canonical.image), gallery: (canonical.gallery?.length ? canonical.gallery : [canonical.image]).map(asset),
    stack,
    features: localization.canonicalData({ canonical, overlay, path: "features" }).map(decodeHtml),
    links: (canonical.links || []).map((link, linkIndex) => ({
      label: decodeHtml(localization.canonicalData({ canonical, overlay, path: `links[${linkIndex}].label` })),
      url: href(link.url), external: /^https?:\/\//.test(link.url),
    })),
    canonical: `${site.origin}${route.pathname}`,
  };
  const labels = Object.fromEntries(Object.entries(PROJECT_LABELS).map(([key, value]) => [key, phrase(value)]));
  labels.copyDone = localization.packs.dynamic.ultimate.copyDone;
  const projectLinks = {
    works: routeRuntime.localizedInternalHref("/works/", route.locale),
    email: profile.email,
    previous: routeRuntime.localizedInternalHref(`/projects/${slugs[(index - 1 + slugs.length) % slugs.length]}/`, route.locale),
    next: routeRuntime.localizedInternalHref(`/projects/${slugs[(index + 1) % slugs.length]}/`, route.locale),
  };
  return { project, labels, projectLinks };
}

function createProjectHeadModel(route, model, localization) {
  const description = truncateDescription(model.project.subtitle || model.project.overview);
  const title = `${model.project.title} | Kaan Balcı`;
  const headRenderer = createSiteHeadRenderer({
    registry,
    indexableLocales: (registry.localizedRoutes?.indexable || []).filter((id) => id !== registry.defaultLocale),
    absoluteFor: (routeKey, locale) => `${site.origin}/${routeRuntime.localizedRouteKey(routeKey, locale)}`,
  });
  const image = `${site.origin}${model.project.image}`;
  const jsonLd = {
    "@context": "https://schema.org", "@type": projectSchemaType(model.project), name: model.project.title,
    description: truncateDescription(model.project.overview || model.project.subtitle, 300), url: model.project.canonical, image, dateCreated: model.project.year,
    inLanguage: route.locale, genre: model.project.category,
    creator: { "@type": "Person", name: profile.name, url: `${site.origin}/` },
  };
  const sameAs = model.project.links.filter((link) => link.external).map((link) => link.url);
  if (sameAs.length) jsonLd.sameAs = sameAs.length === 1 ? sameAs[0] : sameAs;
  if (model.project.stack.length) jsonLd.keywords = model.project.stack.join(", ");
  return {
    title, description, canonical: model.project.canonical, robots: "index, follow",
    alternates: headRenderer.alternateLinkRecords(`projects/${route.slug}/`, true),
    og: { siteName: "Kaan Balcı Portfolio", locale: localization.definition.ogLocale, title, description, type: "article", url: model.project.canonical, image },
    twitter: { card: "summary_large_image", title, description, image },
    themeBootstrap: '(function(){try{var t=localStorage.getItem("kaanbalci-site-theme")||"dark";document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark");}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();',
    jsonLd,
  };
}

const textNode = (value) => ({ type: "text", value: String(value) });
const elementNode = (tag, attributes = {}, children = []) => ({
  type: "element",
  tag,
  attributes: Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null).map(([name, value]) => ({ name, value })),
  children: children.flat(Infinity).filter((value) => value !== null && value !== undefined).map((value) => typeof value === "string" || typeof value === "number" ? textNode(value) : value),
});

function projectDetailStructure({ project, labels, projectLinks }) {
  const icon = (classes) => elementNode("i", { class: classes });
  const panel = (eyebrow, title, body, delay = "") => elementNode("article", { class: `detail-panel reveal${delay}` }, [
    elementNode("p", { class: "eyebrow" }, [eyebrow]), elementNode("h2", {}, [title]), elementNode("p", {}, [body]),
  ]);
  return [
    elementNode("section", { class: "project-detail-hero section-shell reveal" }, [
      elementNode("div", { class: "project-detail-copy" }, [
        elementNode("a", { class: "back-link", href: projectLinks.works }, [icon("bx bx-arrow-back"), labels.backToWorks]),
        elementNode("p", { class: "eyebrow" }, [project.category]), elementNode("h1", {}, [project.title]), elementNode("p", {}, [project.subtitle]),
        elementNode("div", { class: "project-detail-actions" }, [
          project.links.map((link) => elementNode("a", { class: "btn primary", href: link.url, ...(link.external ? { target: "_blank", rel: "noopener" } : {}) }, [link.label])),
          elementNode("a", { class: "btn ghost", href: projectLinks.email }, [labels.askSimilarWork]),
          elementNode("button", { class: "btn ghost", type: "button", "data-copy-project-link": true }, [labels.copyProjectLink]),
        ]),
      ]),
      elementNode("div", { class: "project-detail-visual reveal delay-1" }, [elementNode("img", { src: project.image, alt: `${project.title} ${labels.preview}`, decoding: "async", fetchpriority: "high" })]),
    ]),
    elementNode("section", { class: "section-shell project-detail-meta reveal delay-2" }, [
      [[labels.role, project.role], [labels.year, project.year], [labels.projectType, project.type], [labels.status, project.status]].map(([label, value]) => elementNode("article", {}, [elementNode("span", {}, [label]), elementNode("strong", {}, [value])])),
    ]),
    elementNode("section", { class: "section-shell section-block project-detail-grid" }, [
      elementNode("div", { class: "project-detail-main" }, [
        panel(labels.overview, labels.projectOverview, project.overview), panel(labels.challenge, labels.challengeTitle, project.challenge, " delay-1"),
        panel(labels.solution, labels.solutionTitle, project.solution, " delay-2"), panel(labels.impact, labels.impactTitle, project.impact),
        elementNode("article", { class: "detail-panel reveal delay-1" }, [
          elementNode("p", { class: "eyebrow" }, [labels.process]), elementNode("h2", {}, [labels.processTitle]),
          elementNode("div", { class: "process-steps" }, project.process.map((step, index) => elementNode("article", {}, [
            elementNode("span", {}, [String(index + 1).padStart(2, "0")]), elementNode("div", {}, [elementNode("h3", {}, [step.title]), elementNode("p", {}, [step.text])]),
          ]))),
        ]),
      ]),
      elementNode("aside", { class: "project-detail-side reveal delay-1", "aria-label": labels.projectOverview }, [
        elementNode("div", { class: "detail-panel compact-panel" }, [elementNode("h3", {}, [labels.techStack]), elementNode("div", { class: "project-tags detail-tags" }, project.stack.map((item) => elementNode("span", {}, [item])))]),
        elementNode("div", { class: "detail-panel compact-panel" }, [elementNode("h3", {}, [labels.highlights]), elementNode("ul", { class: "detail-list" }, project.features.map((item) => elementNode("li", {}, [item])))]),
      ]),
    ]),
    elementNode("section", { class: "section-shell section-block" }, [
      elementNode("div", { class: "section-heading reveal" }, [elementNode("p", { class: "eyebrow" }, [labels.gallery]), elementNode("h2", {}, [labels.galleryTitle]), elementNode("p", {}, [labels.galleryBody])]),
      elementNode("div", { class: "detail-gallery" }, project.gallery.map((image) => elementNode("img", { class: "reveal", src: image, alt: `${project.title} ${labels.galleryImage}`, loading: "lazy", decoding: "async" }))),
    ]),
    elementNode("section", { class: "section-shell detail-navigation reveal" }, [
      elementNode("a", { class: "btn ghost", href: projectLinks.previous }, [icon("bx bx-left-arrow-alt"), labels.previousProject]),
      elementNode("a", { class: "btn primary", href: projectLinks.works }, [labels.allWorks]),
      elementNode("a", { class: "btn ghost", href: projectLinks.next }, [labels.nextProject, icon("bx bx-right-arrow-alt")]),
    ]),
  ];
}

/* Labs experiment index, from the canonical data/portfolio/labs.json and the
 * locale content packs — the same sources and markup portfolio-v2.js used to
 * render client-side into the empty [data-labs-grid]. */
function labCardNodes(locale, localization) {
  const field = (index, name) => decodeHtml(localization.canonicalData({ canonical: { labs }, overlay: localization.packs.content, path: `labs.[${index}].${name}` }));
  return labs.map((item, index) => elementNode("article", { class: "lab-card" }, [
    elementNode("div", { class: "lab-card-top" }, [elementNode("span", {}, [field(index, "type")]), elementNode("i", { class: "bx bx-flask" })]),
    elementNode("h3", {}, [item.title]),
    elementNode("p", {}, [field(index, "description")]),
    elementNode("div", { class: "project-tags" }, item.tags.map((tag) => elementNode("span", {}, [tag]))),
    elementNode("a", { href: routeRuntime.localizedInternalHref(item.url, locale) }, [labCardAction(locale), elementNode("i", { class: "bx bx-right-arrow-alt" })]),
  ]));
}

/* Server-render the one container the accepted runtime filled client-side. */
function withFilledContainer(nodes, attribute, children, what) {
  let filled = 0;
  const visit = (list) => list.map((node) => {
    if (node.type !== "element") return node;
    if (!node.attributes.some(({ name }) => name === attribute)) return { ...node, children: visit(node.children) };
    filled += 1;
    return { ...node, children };
  });
  const structure = visit(nodes);
  if (filled !== 1) throw new Error(`${what}, found ${filled}`);
  return structure;
}

const withLabCards = (nodes, cards) => withFilledContainer(nodes, "data-labs-grid", cards, "Labs shell must contain exactly one experiment index");

function localizedBuildLogEntries(locale, localization) {
  return buildLog.map((entry) => localizedBuildLogEntry({
    entry,
    overlay: localization.packs.content,
    locale,
    defaultLocale: registry.defaultLocale,
  })).map((entry) => ({ ...entry, title: decodeHtml(entry.title), detail: decodeHtml(entry.detail) }));
}

/* The whole Build Log of /now/, from the canonical data/portfolio/build-log.json
 * and the locale content packs — the same source and markup portfolio-v2.js
 * used to render client-side into the empty [data-build-log]. Release-state
 * names are product terms and stay identical in every language. */
const BUILD_LOG_STATUS = { shipped: "Shipped", building: "Building", integration: "Integration" };
function buildLogNodes(locale, localization) {
  return localizedBuildLogEntries(locale, localization).map((entry) => elementNode("article", { class: "build-log-item" }, [
    elementNode("time", { dateTime: entry.date }, [entry.date]),
    elementNode("div", {}, [
      elementNode("div", { class: "build-log-meta" }, [
        elementNode("span", {}, [entry.area]),
        elementNode("span", { class: `build-log-status is-${entry.status}` }, [BUILD_LOG_STATUS[entry.status] || entry.status]),
      ]),
      elementNode("h3", {}, [entry.title]),
      elementNode("p", {}, [entry.detail]),
    ]),
  ]));
}

/* The Certificates training label is resolved exactly as the accepted runtime resolves
 * it (getUiText("training") in js/core/locale.js, applied over the static
 * text): the locale UI pack's value. The accepted static documents carry the
 * page-phrase translation instead, which differs in Turkish and German; the
 * visitor saw the UI-pack value, so that is what the server renders.
 * qa:m3:remaining-routes holds the result to what the accepted runtime shows. */
function withTrainingLabel(nodes, locale) {
  if (locale === registry.defaultLocale) return nodes;
  const packed = readJson(`data/i18n/packs/${locale}/ui.json`).training;
  if (typeof packed !== "string" || !packed) throw new Error(`${locale}/certificates: missing UI pack phrase "training"`);
  return withFilledContainer(nodes, "data-training-type", [textNode(decodeHtml(packed))], "Certificates page must contain exactly one training label");
}

/* #30.5: Now, Experience, Certificates, Request and Privacy. */
function remainingRoutePage(route) {
  const page = route.kind === "page" ? remainingRoutesStructure.pages[route.routeId] : null;
  if (!page) return null;
  if (remainingRoutesStructure.acceptedRef !== REMAINING_ROUTES_ACCEPTED_REF) throw new Error("Remaining-routes React contract is not tied to the #30.5 base ref");
  const localized = page.locales[route.locale];
  if (!localized) throw new Error(`${route.locale}/${route.routeId}: missing accepted remaining-route contract`);
  return { page, localized };
}

const hasAside = (nodes) => nodes.some((node) => node.type === "element" && (node.tag === "aside" || hasAside(node.children)));

function labsGamesPage(route) {
  const page = labsGamesStructure.pages[route.routeId];
  if (!page) return null;
  if (labsGamesStructure.acceptedRef !== LABS_GAMES_ACCEPTED_REF) throw new Error("Labs/mini-game React contract is not tied to the #30 base ref");
  const localized = page.locales[route.locale];
  if (!localized) throw new Error(`${route.locale}/${route.routeId}: missing accepted Labs/mini-game contract`);
  return { page, localized };
}

/* The accepted Labs document carried no OpenGraph tags; the shared document
 * head always emits a title, description and image, so those come from the
 * canonical page meta instead of rendering empty tags. */
function labsGamesHead(route, localized, localization) {
  const captured = localized.head.og;
  let og = captured;
  if (!(og.title && og.description && og.image)) {
    const meta = route.locale === registry.defaultLocale ? sourceMeta[route.routeId] : localization.packs.meta?.[route.routeId];
    if (!meta?.ogTitle || !meta?.ogDescription) throw new Error(`${route.locale}/${route.routeId}: missing canonical meta`);
    og = { ...og, title: og.title || meta.ogTitle, description: og.description || meta.ogDescription, image: og.image || `${site.origin}/assets/portfolio_website_cover.webp` };
  }
  /* The accepted documents carried no structured data. This states only what
   * the head already states — the page, its language, the site it belongs to
   * and its author — and claims nothing about the game itself. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: localized.head.title,
    description: localized.head.description,
    url: `${site.origin}${route.pathname}`,
    inLanguage: localization.definition.htmlLang || route.locale,
    image: og.image,
    isPartOf: { "@type": "WebSite", name: "Kaan Balcı Portfolio", url: `${site.origin}/` },
    author: { "@type": "Person", name: profile.name, url: `${site.origin}/` },
  };
  if (localized.head.canonical !== jsonLd.url) throw new Error(`${route.locale}/${route.routeId}: accepted canonical does not match the route`);
  return { ...localized.head, og, jsonLd };
}

/* V4: the Home hero's delivery flow. Geometry is authored in
 * data/site/v4-home-flow.json; every label resolves through the canonical
 * message catalog like the rest of the page. */
const v4HomeFlow = readJson("data/site/v4-home-flow.json");
/* V4: the project ecosystem. Capabilities are the Works catalog's filter
 * categories and projects are its cards; a wire exists only where a card is
 * filed under a category. Read from the same structure the Works page
 * renders, so the map cannot drift from the catalog or claim a relationship
 * the catalog does not make. */
function v4EcosystemModel(locale, message) {
  const canonical = localizedCanonicalData(locale);
  const attribute = (node, name) => node.attributes.find((entry) => entry.name === name)?.value;
  const hasClass = (node, name) => String(attribute(node, "class") || "").split(/\s+/).includes(name);
  const text = (node) => {
    if (node.type === "message") return message(node.key);
    if (node.type === "data") return String(node.path).split(".").reduce((value, segment) => value?.[segment], canonical);
    if (node.type === "text") return node.value;
    return node.type === "element" ? node.children.map(text).join("") : "";
  };
  const find = (node, test) => {
    if (node.type !== "element") return null;
    if (test(node)) return node;
    for (const child of node.children) {
      const hit = find(child, test);
      if (hit) return hit;
    }
    return null;
  };
  const capabilities = [];
  const projects = [];
  let tier = -1;
  const walk = (node) => {
    if (node.type !== "element") return;
    const filter = attribute(node, "data-filter-btn");
    if (filter !== undefined && filter !== "all") capabilities.push({ id: filter, label: text(node) });
    if (attribute(node, "data-project-section") !== undefined) tier += 1;
    if (hasClass(node, "project-card")) {
      const link = find(find(node, (entry) => entry.tag === "h3"), (entry) => entry.tag === "a");
      const target = attribute(link, "href");
      const href = target?.type === "internal" ? routeRuntime.localizedInternalHref(target.path, locale) : target?.type === "data" ? text(target) : target;
      const status = find(node, (entry) => hasClass(entry, "project-status"));
      const id = String(attribute(node, "data-project-link") || attribute(node, "data-game-link")).split("/").filter(Boolean).pop();
      if (!id || typeof href !== "string" || !href) throw new Error(`${locale}: Works catalog card without a canonical destination`);
      projects.push({
        id,
        title: text(link),
        href,
        categories: String(attribute(node, "data-category")).split(/\s+/).filter(Boolean),
        tier: hasClass(node, "is-archive") ? "archive" : tier === 0 ? "primary" : "supporting",
        ...(status ? { status: text(status) } : {}),
      });
      return;
    }
    node.children.forEach(walk);
  };
  worksGamesStructure.pages.works.children.forEach(walk);
  const known = new Set(capabilities.map((capability) => capability.id));
  for (const project of projects) {
    if (!project.title || !project.categories.length || project.categories.some((id) => !known.has(id))) {
      throw new Error(`${locale}: Works catalog card ${project.id} is not filed under a known catalog category`);
    }
  }
  return {
    eyebrow: message("home.ecosystem.eyebrow"),
    title: message("home.ecosystem.title"),
    lead: message("home.ecosystem.lead"),
    capabilitiesLabel: message("home.ecosystem.capabilities"),
    projectsLabel: message("home.ecosystem.projects"),
    viewAll: { label: message("home.hero.viewWork"), href: routeRuntime.localizedInternalHref("/works/", locale) },
    capabilities,
    projects,
  };
}

/* V4 Works: the same catalog map, with the labels for its three views. */
function v4WorksModel(locale, message) {
  const { capabilities, projects, capabilitiesLabel, projectsLabel } = v4EcosystemModel(locale, message);
  return {
    ecosystem: { capabilities, projects, capabilitiesLabel, projectsLabel },
    labels: { viewAria: message("works.view.aria"), grid: message("works.view.grid"), map: message("works.view.map"), capability: message("works.view.capability") },
  };
}

/* V4 project detail: what the shell adds to a page that already has its
 * content. The tracker lists the page's own sections under their own labels;
 * related work is every other catalog project filed under a capability this
 * one is filed under, in catalog order. A page the catalog does not know gets
 * a tracker and nothing else. */
function v4DetailModel(route, children, message) {
  const attribute = (node, name) => node.attributes.find((entry) => entry.name === name)?.value;
  const hasClass = (node, name) => node.type === "element" && String(attribute(node, "class") || "").split(/\s+/).includes(name);
  const text = (node) => (node.type === "text" ? node.value : node.type === "message" ? message(node.key) : node.type === "element" ? node.children.map(text).join("") : "");
  const find = (node, test) => {
    if (node.type !== "element") return null;
    if (test(node)) return node;
    for (const child of node.children) {
      const hit = find(child, test);
      if (hit) return hit;
    }
    return null;
  };
  const items = children.flatMap((node, index) => {
    if (!hasClass(node, "case-section")) return [];
    const label = find(node, (entry) => hasClass(entry, "eyebrow")) || find(node, (entry) => entry.tag === "h2");
    const value = label ? text(label).replace(/\s+/g, " ").trim() : "";
    return value ? [{ id: `v4-s-${index}`, label: value }] : [];
  });
  const ecosystem = v4EcosystemModel(route.locale, message);
  const id = route.route.split("/").filter(Boolean).pop();
  const self = ecosystem.projects.find((project) => project.id === id);
  const ports = self ? ecosystem.capabilities.filter((capability) => self.categories.includes(capability.id)) : [];
  const groups = ports.map((capability) => ({
    id: capability.id,
    label: capability.label,
    projects: ecosystem.projects.filter((project) => project.id !== id && project.categories.includes(capability.id)).map(({ id: projectId, title, href, status }) => ({ id: projectId, title, href, ...(status ? { status } : {}) })),
  })).filter((group) => group.projects.length);
  return {
    consumer: "detail",
    ports,
    tracker: { aria: message("project.tracker.aria"), items },
    related: self && groups.length ? { eyebrow: message("project.related.eyebrow"), title: message("project.related.title"), self: self.title, groups } : null,
  };
}

function v4HomeModel(locale, message) {
  const { schemaVersion, ...flow } = v4HomeFlow;
  /* AJOOP's flagship port speaks only in the assistant's own shipped copy:
   * its shell strings and the first of its own quick questions. */
  const ajoop = ajoopShellModel(locale);
  const quicks = (runtimeCollection("ajoop", locale).quicks || []).slice(0, 4).map((quick) => quick.label).filter(Boolean);
  if (quicks.length !== 4) throw new Error(`${locale}: AJOOP quick questions are missing from its shipped copy`);
  const ecosystem = v4EcosystemModel(locale, message);
  for (const id of flow.flagship) {
    if (!ecosystem.projects.some((project) => project.id === id)) throw new Error(`${locale}: flagship ${id} is not a Works catalog project`);
  }
  return {
    ecosystem,
    ajoop: { title: ajoop.copy.title, subtitle: ajoop.copy.subtitle, launcher: ajoop.copy.launcher, prompt: ajoop.copy.inputPlaceholder, state: ajoop.mascot.label, quicks, links: [["/ajoop/", "ajoop.hub.open"], ["/ajoop-case-study/", "ajoop.hub.how"]].map(([target, key]) => ({ href: routeRuntime.localizedInternalHref(target, locale), label: message(key) })) },
    flow: {
      ...flow,
      aria: message(flow.aria),
      handoff: message(flow.handoff),
      hub: { ...flow.hub, label: message(flow.hub.label), value: message(flow.hub.value) },
      stages: flow.stages.map((stage) => ({ ...stage, label: message(stage.label) })),
    },
  };
}

/* V4 inner pages (scripts/v4-inner-pages.mjs): Experience and Certificates
 * are captured documents, so their models are read from the localized
 * structure itself, with the English contract supplying what must not depend
 * on a language (month names, provider identity). */
const plainText = (node) => (!node ? "" : node.type === "text" ? node.value : node.type === "element" ? node.children.map(plainText).join("") : "");
const experienceTitle = (locale) => plainText(remainingRoutesStructure.pages.blog.locales[locale].children.find((node) => node.type === "element").children.find((node) => node.tag === "h1")).replace(/\s+/g, " ").trim();
function v4CapturedModel(route, captured, structure, message) {
  const english = captured.page.locales[registry.defaultLocale].children;
  if (route.routeId === "blog") {
    return v4ExperienceModel({
      locale: route.locale, children: structure, english, text: plainText, message,
      ecosystem: v4EcosystemModel(route.locale, message),
      asOf: meta.updatedAt,
      about: { label: message("shell.nav.about"), title: message("about.hero.title"), href: routeRuntime.localizedInternalHref("/about/", route.locale) },
    });
  }
  if (route.routeId === "certificates") return v4CertificatesModel({ locale: route.locale, children: structure, english, text: plainText, message });
  return null;
}

function v4AboutPageModel(route, children, localization, message) {
  const text = (node) => (!node ? "" : node.type === "message" ? message(node.key) : node.type === "text" ? node.value : node.type === "element" ? node.children.map(text).join("") : "");
  const value = (entry) => (entry?.type === "message" ? message(entry.key) : entry?.type === "internal" ? routeRuntime.localizedInternalHref(entry.path, route.locale) : entry);
  return v4AboutModel({
    locale: route.locale, children, text, value, message,
    recruiter: recruiterModel(route.locale, localization),
    experience: { label: message("shell.nav.blog"), title: experienceTitle(route.locale), href: routeRuntime.localizedInternalHref("/blog/", route.locale) },
  });
}

/* V4-E04: the two AJOOP routes (scripts/v4-ajoop-pages.mjs). */
const AJOOP_ROUTES = new Set(["ajoop", "ajoopCaseStudy"]);
const ajoopKnowledge = readJson("data/portfolio/ajoop-master-knowledge.json").projects.flagship["Ajoop Portfolio Copilot"];
const THEME_BOOTSTRAP = '(function(){try{var t=localStorage.getItem("kaanbalci-site-theme")||"dark";document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark");}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();';

function v4AjoopMainProps(route, loadLocalization) {
  const localization = loadLocalization(route.locale);
  const message = (key) => {
    const value = localization.message(key);
    if (typeof value !== "string" || !value) throw new Error(`${route.locale}/${route.routeId}: missing ${key}`);
    return value;
  };
  const href = (value) => routeRuntime.localizedInternalHref(value, route.locale);
  if (route.routeId === "ajoop") {
    const links = [["/works/", "shell.nav.works"], ["/blog/", "shell.nav.blog"], ["/about/", "shell.nav.about"], ["/certificates/", "shell.nav.certificates"], ["/ajoop-case-study/", "ajoop.hub.how"]].map(([target, key]) => ({ href: href(target), label: message(key) }));
    return { kind: "v4Page", page: "ajoop", locale: route.locale, structure: ajoopHubStructure({ message, links }), v4: { consumer: "hub" } };
  }
  if (!Array.isArray(ajoopKnowledge?.architecture_public_safe) || !ajoopKnowledge.architecture_public_safe.length) throw new Error("AJOOP public-safe architecture record is missing");
  const structure = ajoopCaseStudyStructure({
    message,
    hubHref: href("/ajoop/"),
    worksHref: { href: href("/works/"), label: message("home.hero.viewWork") },
    stack: ajoopKnowledge.architecture_public_safe,
  });
  /* The shipped quick questions, as the way into the live assistant. */
  const shell = ajoopShellModel(route.locale);
  const quicks = (runtimeCollection("ajoop", route.locale).quicks || []).slice(0, 4).map((quick) => quick.label).filter(Boolean);
  return {
    kind: "caseStudy", page: route.routeId, locale: route.locale, structure, data: localizedCanonicalData(route.locale),
    v4: {
      ...v4DetailModel(route, structure, message),
      system: ajoopSystemModel({ message }),
      entry: { href: href("/ajoop/"), title: shell.copy.title, subtitle: shell.copy.subtitle, state: shell.mascot.label, ask: message("ajoop.case.hero.askLabel"), quicks, cta: message("ajoop.case.cta.try") },
    },
  };
}

/* The head of an AJOOP route, from its canonical per-locale meta. */
function v4AjoopHead(route, localization) {
  const meta = route.locale === registry.defaultLocale ? sourceMeta[route.routeId] : localization.packs.meta?.[route.routeId];
  if (!meta?.title || !meta?.description) throw new Error(`${route.locale}/${route.routeId}: missing canonical meta`);
  const headRenderer = createSiteHeadRenderer({
    registry,
    indexableLocales: (registry.localizedRoutes?.indexable || []).filter((id) => id !== registry.defaultLocale),
    absoluteFor: (routeKey, locale) => `${site.origin}/${routeRuntime.localizedRouteKey(routeKey, locale)}`,
  });
  const canonical = `${site.origin}${route.pathname}`;
  const image = `${site.origin}/assets/portfolio_website_cover.webp`;
  const caseStudy = route.routeId === "ajoopCaseStudy";
  return {
    title: meta.title, description: meta.description, keywords: null, canonical, robots: "index, follow",
    alternates: headRenderer.alternateLinkRecords(route.route, true),
    og: { siteName: "Kaan Balcı Portfolio", locale: localization.definition.ogLocale || localization.definition.htmlLang, title: meta.ogTitle || meta.title, description: meta.ogDescription || meta.description, type: caseStudy ? "article" : "website", url: canonical, image },
    twitter: { card: "summary_large_image", title: meta.ogTitle || meta.title, description: meta.ogDescription || meta.description, image },
    themeBootstrap: THEME_BOOTSTRAP,
    /* States what the head states and nothing about the system itself. */
    jsonLd: {
      "@context": "https://schema.org", "@type": "WebPage", name: meta.title, description: meta.description, url: canonical,
      inLanguage: localization.definition.htmlLang || route.locale, image,
      isPartOf: { "@type": "WebSite", name: "Kaan Balcı Portfolio", url: `${site.origin}/` },
      author: { "@type": "Person", name: profile.name, url: `${site.origin}/` },
    },
    ...(caseStudy ? { extraStyles: ["/case-study.css"] } : {}),
  };
}

const SHELL_MESSAGE_KEYS = [
  "language.selectorAria",
  "nav.open",
  "shell.availabilityAria",
  "shell.brand.homeAria",
  "shell.brand.logoAlt",
  "shell.command.label",
  "shell.footer.privacy",
  "shell.footer.rights",
  "shell.footer.socialAria",
  "shell.footer.tagline",
  "shell.nav.about",
  "shell.nav.blog",
  "shell.nav.certificates",
  "shell.nav.games",
  "shell.nav.home",
  "shell.nav.request",
  "shell.nav.works",
  "shell.recruiter.label",
  "shell.recruiter.openAria",
  "shell.skipToContent",
  "shell.social.githubAria",
  "shell.social.instagramAria",
  "shell.social.linkedinAria",
  "shell.social.xAria",
  "shell.social.youtubeAria",
  "theme.dark",
  "theme.switchToLight",
];

function collectRequirements(nodes, requirements = { messages: new Set(), compat: new Set(), internal: new Set(), roles: new Set(), fixedMessages: new Set(), fixedRoles: new Set() }) {
  for (const node of nodes) {
    if (node.type === "message") requirements.messages.add(node.key);
    if (node.type === "role") requirements.roles.add(node.ref);
    if (node.type !== "element") continue;
    for (const attribute of node.attributes) {
      const value = attribute.value;
      if (value?.type === "message" && value.locale) requirements.fixedMessages.add(`${value.locale}\u0000${value.key}`);
      else if (value?.type === "message") requirements.messages.add(value.key);
      if (value?.type === "role") requirements.fixedRoles.add(`${value.locale}\u0000${value.ref}`);
      if (value?.type === "compat") requirements.compat.add(value.key);
      if (value?.type === "internal") requirements.internal.add(value.path);
    }
    collectRequirements(node.children, requirements);
  }
  return requirements;
}

function localizedCanonicalData(locale) {
  const localizeLink = (value) => typeof value === "string" && value.startsWith("/")
    ? routeRuntime.localizedInternalHref(value, locale)
    : value;
  return {
    profile: { email: profile.email, resume: profile.resume },
    projects: Object.fromEntries(["sinama", "chatbotFlow", "joyday", "mergeRush", "hospital"].map((id) => [id, {
      ...(projects[id].name ? { name: projects[id].name } : {}),
      links: Object.fromEntries(Object.entries(projects[id].links).map(([key, value]) => [key, localizeLink(value)])),
    }])),
  };
}

function recruiterModel(locale, localization) {
  const portfolio = { profile, projects, recruiterProfiles };
  const canonical = (sourcePath, { languageNeutral = false } = {}) => localization.canonicalData({
    canonical: portfolio,
    overlay: localization.packs.content,
    path: sourcePath,
    languageNeutral,
  });
  const acceptedProjectName = (project) => {
    if (project.name) return project.name;
    const slug = project.detailSlug;
    if (!slug || !projectDetails[slug]) throw new Error(`${locale}: recruiter evidence ${project.id} has no canonical title source`);
    return projectDetails[slug].title.en;
  };
  const evidenceFor = (id) => {
    const project = projects[id];
    if (!project) throw new Error(`${locale}: recruiter evidence ${id} is missing from canonical projects`);
    const destination = project.links?.caseStudy || project.links?.live;
    if (!destination) throw new Error(`${locale}: recruiter evidence ${id} has no canonical destination`);
    return {
      id,
      title: acceptedProjectName(project),
      summary: canonical(`projects.${id}.summary`),
      href: destination.startsWith("/") ? routeRuntime.localizedInternalHref(destination, locale) : destination,
    };
  };
  return {
    availability: canonical("profile.availability"),
    primaryTitle: canonical("profile.primaryTitle"),
    updatedAt: meta.updatedAt,
    resume: profile.resume,
    email: profile.email,
    linkedin: socials.linkedin,
    copy: localization.packs.dynamic.recruiterV2,
    profiles: Object.fromEntries(Object.entries(recruiterProfiles).map(([id, item]) => [id, {
      id,
      label: canonical(`recruiterProfiles.${id}.label`),
      focusTitle: canonical(`recruiterProfiles.${id}.focusTitle`),
      capabilities: item.capabilities.map((value) => localization.localizedData({
        path: `recruiterProfiles.${id}.capabilities`,
        neutralValue: value,
        languageNeutral: true,
      })),
      skills: item.skills.map((_, index) => canonical(`recruiterProfiles.${id}.skills[${index}]`)),
      evidence: item.evidence.map(evidenceFor),
    }])),
  };
}

/* Catalog-card whole-surface navigation, exactly as the accepted runtime
 * authorized it: on Works, js/portfolio/works.js handles data-project-link (a
 * path is a page route, a bare slug is a canonical project page); on Games,
 * js/pages/games.js handles data-game-link. Other cards stay inert. */
function catalogCardDestinations(nodes, locale, page, destinations = {}) {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    for (const attribute of node.attributes) {
      if (typeof attribute.value !== "string") continue;
      if (page === "works" && attribute.name === "data-project-link") {
        const slug = attribute.value;
        destinations[slug] = routeRuntime.localizedInternalHref(slug.includes("/") || slug.includes(".") ? slug : `/projects/${encodeURIComponent(slug)}/`, locale);
      }
      if (page === "games" && attribute.name === "data-game-link") destinations[attribute.value] = routeRuntime.localizedInternalHref(attribute.value, locale);
    }
    catalogCardDestinations(node.children, locale, page, destinations);
  }
  return destinations;
}

/* The injectable sources exist so the source-authority gate can prove that
 * rendered copy comes only from the canonical authorities and fails closed. */
export function productionMainProps(route, {
  loadLocalization = loadProductionLocalization,
  catalogSources = defaultCatalogSources(),
  roleSources = defaultRoleSources(),
} = {}) {
  if (AJOOP_ROUTES.has(route.routeId)) return v4AjoopMainProps(route, loadLocalization);
  if (CASE_STUDY_IDS.has(route.routeId)) {
    if (caseStudyStructure.acceptedRef !== "6650aacd844cde957888d296f086c1eb21992991") throw new Error("Case-study React contract is not tied to the #29 base ref");
    const page = caseStudyStructure.pages[route.routeId];
    const localized = page.locales[route.locale];
    if (!localized) throw new Error(`${route.locale}/${route.routeId}: missing accepted case-study contract`);
    const caseLocalization = loadLocalization(route.locale);
    const caseMessage = (key) => {
      const value = caseLocalization.message(key);
      if (typeof value !== "string" || !value) throw new Error(`${route.locale}/${route.routeId}: missing ${key}`);
      return value;
    };
    return { kind: "caseStudy", page: route.routeId, locale: route.locale, structure: localized.children, data: localizedCanonicalData(route.locale), v4: v4DetailModel(route, localized.children, caseMessage) };
  }
  const engineShell = labsGamesPage(route);
  if (engineShell) {
    const structure = route.routeId === "labs"
      ? withLabCards(engineShell.localized.children, labCardNodes(route.locale, loadLocalization(route.locale)))
      : engineShell.localized.children;
    return { kind: "engineShell", page: route.routeId, locale: route.locale, structure };
  }
  const captured = remainingRoutePage(route);
  if (captured) {
    const structure = route.routeId === "now"
      ? withFilledContainer(captured.localized.children, "data-build-log", buildLogNodes(route.locale, loadLocalization(route.locale)), "Now page must contain exactly one Build Log")
      : route.routeId === "certificates" ? withTrainingLabel(captured.localized.children, route.locale)
        : captured.localized.children;
    const capturedLocalization = loadLocalization(route.locale);
    const v4 = v4CapturedModel(route, captured, structure, (key) => {
      const value = capturedLocalization.message(key);
      if (typeof value !== "string" || !value) throw new Error(`${route.locale}/${route.routeId}: missing ${key}`);
      return value;
    });
    return { kind: "capturedPage", page: route.routeId, locale: route.locale, structure, ...(v4 ? { v4 } : {}) };
  }
  if (route.kind === "project") {
    const localization = loadLocalization(route.locale);
    const model = projectRouteModel(route, localization);
    return { kind: "project", page: route.routeId, locale: route.locale, ...model, structure: projectDetailStructure(model) };
  }
  const catalogPage = worksGamesStructure.pages[route.routeId];
  const structure = catalogPage ? worksGamesStructure : homeAboutStructure;
  const page = structure.pages[route.routeId];
  if (!page) throw new Error(`no production React component for ${route.routeId}`);
  if (homeAboutStructure.acceptedRef !== "34fdfad01f63004ed10d616a7b061e3996c28150") {
    throw new Error("Home/About React structure is not tied to its accepted pre-cutover ref");
  }
  if (worksGamesStructure.acceptedRef !== "24be2f8159a0925dc00f29375ea8740738214df3") {
    throw new Error("Works/Games React structure is not tied to the accepted main ref");
  }
  const localization = loadLocalization(route.locale);
  const requirements = collectRequirements(page.children);
  const required = (value, what) => {
    if (typeof value !== "string" || !value) throw new Error(`${route.locale}/${route.routeId}: missing ${what}`);
    return value;
  };
  const copy = Object.fromEntries([...requirements.messages].sort().map((key) => [key, required(localization.message(key), key)]));
  const compat = Object.fromEntries(["en", "tr"].map((locale) => {
    const accepted = loadProductionLocalization(locale);
    return [locale, Object.fromEntries([...requirements.compat].sort().map((key) => [key, decodeHtml(accepted.message(key))]))];
  }));
  const links = Object.fromEntries([...requirements.internal].sort().map((href) => [href, routeRuntime.localizedInternalHref(href, route.locale)]));
  const localizedBuildLog = localizedBuildLogEntries(route.locale, localization);
  const props = {
    page: route.routeId,
    locale: route.locale,
    copy,
    compat,
    links,
    data: localizedCanonicalData(route.locale),
    buildLog: localizedBuildLog,
  };
  if (route.routeId === "home") props.v4 = v4HomeModel(route.locale, (key) => required(localization.message(key), key));
  if (route.routeId === "works") props.v4 = v4WorksModel(route.locale, (key) => required(localization.message(key), key));
  if (route.routeId === "about") props.v4 = v4AboutPageModel(route, page.children, localization, (key) => required(localization.message(key), key));
  if (!catalogPage) return props;
  /* Catalog-only props; Home and About add only their V4 models above. */
  const fixedLocalization = Object.fromEntries(["en", "tr"].map((locale) => [locale, loadLocalization(locale)]));
  const roleLine = (ref, locale, labelSource) => `${required(labelSource.message(worksGamesStructure.roleLabel), worksGamesStructure.roleLabel)} ${required(projectRole(ref, locale, roleSources), `${ref} role`)}`;
  const search = catalogSearchCopy(route.routeId, route.locale, catalogSources);
  return {
    ...props,
    structure: page.children,
    catalog: { searchLabel: search.label, searchPlaceholder: search.placeholder },
    roles: Object.fromEntries([...requirements.roles].sort().map((ref) => [ref, roleLine(ref, route.locale, localization)])),
    fixedCopy: Object.fromEntries([...requirements.fixedMessages].sort().map((entry) => {
      const [locale, key] = entry.split("\u0000");
      return [`${locale}:${key}`, required(fixedLocalization[locale].message(key), `${locale} ${key}`)];
    })),
    fixedRoles: Object.fromEntries([...requirements.fixedRoles].sort().map((entry) => {
      const [locale, ref] = entry.split("\u0000");
      return [`${locale}:${ref}`, roleLine(ref, locale, fixedLocalization[locale])];
    })),
    cardDestinations: catalogCardDestinations(page.children, route.locale, route.routeId),
  };
}

export function productionDocumentProps(route, clientEntry) {
  const localization = loadProductionLocalization(route.locale);
  const main = productionMainProps(route);
  const copy = Object.fromEntries(SHELL_MESSAGE_KEYS.map((key) => [key, localization.message(key)]));
  const href = (value) => routeRuntime.localizedInternalHref(value, route.locale);
  const nav = [
    ["home", "/", "shell.nav.home"],
    ["works", "/works/", "shell.nav.works"],
    ["games", "/games/", "shell.nav.games"],
    ["blog", "/blog/", "shell.nav.blog"],
    ["certificates", "/certificates/", "shell.nav.certificates"],
    ["request", "/request/", "shell.nav.request"],
    ["about", "/about/", "shell.nav.about"],
  ].map(([id, path, key]) => ({ id, href: href(path), label: copy[key] }));
  const socialIcons = {
    github: "bx bxl-github",
    linkedin: "bx bxl-linkedin-square",
    instagram: "bx bxl-instagram",
    youtube: "bx bxl-youtube",
    x: "bx bxl-twitter",
  };
  const socialLabels = {
    github: "shell.social.githubAria",
    linkedin: "shell.social.linkedinAria",
    instagram: "shell.social.instagramAria",
    youtube: "shell.social.youtubeAria",
    x: "shell.social.xAria",
  };
  const socialTitles = { github: "GitHub", linkedin: "LinkedIn", instagram: "Instagram", youtube: "YouTube", x: "X" };
  const socialLinks = Object.keys(socialIcons).map((id) => ({
    id,
    href: socials[id],
    label: copy[socialLabels[id]],
    title: socialTitles[id],
    icon: socialIcons[id],
  }));
  const casePage = caseStudyStructure.pages[route.routeId];
  const caseLocale = casePage?.locales?.[route.locale];
  const projectRoute = route.kind === "project";
  const engineShell = labsGamesPage(route);
  const captured = remainingRoutePage(route);
  const capturedShell = engineShell || captured;
  const ajoopRoute = AJOOP_ROUTES.has(route.routeId);
  const hubRoute = route.routeId === "ajoop";
  const ajoopCaseRoute = route.routeId === "ajoopCaseStudy";
  /* One conversation, two presentations: the Hub route renders the shell as
   * the Hub; every other route's panel links to it. */
  const ajoopPresentation = hubRoute
    ? { hub: ajoopHubModel({ message: (key) => localization.message(key), caseStudyHref: href("/ajoop-case-study/") }) }
    : { hubLink: { href: href("/ajoop/"), label: localization.message("ajoop.hub.open") } };
  return {
    main,
    recruiter: recruiterModel(route.locale, localization),
    ajoop: { ...ajoopShellModel(route.locale), ...ajoopPresentation, ...((casePage || ajoopCaseRoute || projectRoute || (capturedShell && hasAside(capturedShell.localized.children))) ? { a: true } : {}) },
    commandPalette: commandPaletteModel(route.locale),
    document: {
      locale: route.locale,
      htmlLang: localization.definition.htmlLang || route.locale,
      dir: localization.definition.dir || "ltr",
      /* A Labs/mini-game shell keeps the accepted page type: it is what makes
       * script.js load that page’s runtime modules. */
      /* The AJOOP case study is a case study; the Hub is its own page type. */
      hub: hubRoute,
      v4Styles: ajoopCaseRoute ? ["ajoop"] : [],
      page: casePage || ajoopCaseRoute ? "caseStudy" : projectRoute ? "projectDetail" : capturedShell ? capturedShell.page.pageType : route.routeId,
      navPage: casePage || projectRoute ? "works" : route.routeId,
      bodyClass: caseLocale?.bodyClass || (ajoopCaseRoute ? "case-study-page" : null),
      /* Accepted project pages declare their slug on <body>; the retained
       * runtime (project routing, AJOOP page context) reads it from there. */
      projectSlug: projectRoute ? route.slug : null,
      mainAttributes: projectRoute ? { "data-project-detail": "", "data-react-project-detail-owner": "react" } : null,
      afterMain: caseLocale?.afterMain || [],
      /* Scripts the accepted document ran before the runtime loader. */
      leadScripts: captured?.page.leadScripts || [],
      scripts: engineShell ? [...engineShell.page.scripts, ENGINE_HOST_SCRIPT] : casePage?.scripts || [],
      clientEntry,
    },
    head: caseLocale?.head || (ajoopRoute ? v4AjoopHead(route, localization) : capturedShell ? labsGamesHead(route, capturedShell.localized, localization) : projectRoute ? createProjectHeadModel(route, main, localization) : createHomeAboutHeadModel({
      route,
      registry,
      routeRuntime,
      site,
      localization,
      sourceMeta,
      profile,
      socials,
    })),
    shell: {
      bindings: {
        themeDark: "theme.dark",
        themeSwitchToLight: "theme.switchToLight",
      },
      text: {
        skipToContent: copy["shell.skipToContent"],
        brandHomeAria: copy["shell.brand.homeAria"],
        brandLogoAlt: copy["shell.brand.logoAlt"],
        availabilityAria: copy["shell.availabilityAria"],
        recruiterLabel: copy["shell.recruiter.label"],
        recruiterTitle: route.locale === "tr" ? "Recruiter Mode" : copy["shell.recruiter.label"],
        recruiterOpenAria: copy["shell.recruiter.openAria"],
        commandLabel: copy["shell.command.label"],
        languageSelectorAria: copy["language.selectorAria"],
        themeSwitchToLight: copy["theme.switchToLight"],
        themeDark: copy["theme.dark"],
        navOpen: copy["nav.open"],
        footerTagline: copy["shell.footer.tagline"],
        footerSocialAria: copy["shell.footer.socialAria"],
        footerRights: copy["shell.footer.rights"],
        footerPrivacy: copy["shell.footer.privacy"],
      },
      name: profile.name,
      email: profile.email,
      availability: profile.availability[registry.defaultLocale],
      homeHref: href("/"),
      privacyHref: href("/privacy/"),
      nav,
      socialLinks,
      footerCompat: {
        en: profile.footerTagline.en,
        tr: profile.footerTagline.tr,
      },
    },
  };
}
