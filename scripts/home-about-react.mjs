import fs from "node:fs";
import path from "node:path";
import { ROOT, loadRegistry, truncateDescription } from "./i18n-catalog.mjs";
import { loadProductionLocalization } from "./production-localization.mjs";
import { localizedBuildLogEntry } from "./shared-localization.mjs";
import { loadRouteRuntime, loadSiteRoutes } from "./site-routes.mjs";
import { decodeHtml } from "./localized-html.mjs";
import { createHomeAboutHeadModel, createSiteHeadRenderer } from "./site-head.mjs";
import { catalogSearchCopy, defaultCatalogSources, defaultRoleSources, projectRole } from "./m3-works-games-catalog-copy.mjs";
import { ajoopShellModel, commandPaletteModel } from "./m3-28-overlay-copy.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const homeAboutStructure = readJson("data/site/m3-25b-home-about-structure.json");
const worksGamesStructure = readJson("data/site/m3-26-works-games-structure.json");
const caseStudyStructure = readJson("data/site/m3-29-case-studies-structure.json");
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
  if (CASE_STUDY_IDS.has(route.routeId)) {
    if (caseStudyStructure.acceptedRef !== "6650aacd844cde957888d296f086c1eb21992991") throw new Error("Case-study React contract is not tied to the #29 base ref");
    const page = caseStudyStructure.pages[route.routeId];
    const localized = page.locales[route.locale];
    if (!localized) throw new Error(`${route.locale}/${route.routeId}: missing accepted case-study contract`);
    return { kind: "caseStudy", page: route.routeId, locale: route.locale, structure: localized.children, data: localizedCanonicalData(route.locale) };
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
  const localizedBuildLog = buildLog.map((entry) => localizedBuildLogEntry({
    entry,
    overlay: localization.packs.content,
    locale: route.locale,
    defaultLocale: registry.defaultLocale,
  })).map((entry) => ({ ...entry, title: decodeHtml(entry.title), detail: decodeHtml(entry.detail) }));
  const props = {
    page: route.routeId,
    locale: route.locale,
    copy,
    compat,
    links,
    data: localizedCanonicalData(route.locale),
    buildLog: localizedBuildLog,
  };
  if (!catalogPage) return props;
  /* Catalog-only props; Home/About keep exactly their accepted payload. */
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
  return {
    main,
    recruiter: recruiterModel(route.locale, localization),
    ajoop: { ...ajoopShellModel(route.locale), ...((casePage || projectRoute) ? { a: true } : {}) },
    commandPalette: commandPaletteModel(route.locale),
    document: {
      locale: route.locale,
      htmlLang: localization.definition.htmlLang || route.locale,
      dir: localization.definition.dir || "ltr",
      page: casePage ? "caseStudy" : projectRoute ? "projectDetail" : route.routeId,
      navPage: casePage || projectRoute ? "works" : route.routeId,
      bodyClass: caseLocale?.bodyClass || null,
      /* Accepted project pages declare their slug on <body>; the retained
       * runtime (project routing, AJOOP page context) reads it from there. */
      projectSlug: projectRoute ? route.slug : null,
      mainAttributes: projectRoute ? { "data-project-detail": "", "data-react-project-detail-owner": "react" } : null,
      afterMain: caseLocale?.afterMain || [],
      scripts: casePage?.scripts || [],
      clientEntry,
    },
    head: caseLocale?.head || (projectRoute ? createProjectHeadModel(route, main, localization) : createHomeAboutHeadModel({
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
