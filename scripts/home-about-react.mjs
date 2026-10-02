import fs from "node:fs";
import path from "node:path";
import { ROOT, loadRegistry } from "./i18n-catalog.mjs";
import { loadProductionLocalization } from "./production-localization.mjs";
import { localizedBuildLogEntry } from "./shared-localization.mjs";
import { loadRouteRuntime, loadSiteRoutes } from "./site-routes.mjs";
import { decodeHtml } from "./localized-html.mjs";
import { createHomeAboutHeadModel } from "./site-head.mjs";
import { catalogSearchCopy, defaultCatalogSources, defaultRoleSources, projectRole } from "./m3-works-games-catalog-copy.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const homeAboutStructure = readJson("data/site/m3-25b-home-about-structure.json");
const worksGamesStructure = readJson("data/site/m3-26-works-games-structure.json");
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
  return {
    main: productionMainProps(route),
    recruiter: recruiterModel(route.locale, localization),
    document: {
      locale: route.locale,
      htmlLang: localization.definition.htmlLang || route.locale,
      dir: localization.definition.dir || "ltr",
      page: route.routeId,
      clientEntry,
    },
    head: createHomeAboutHeadModel({
      route,
      registry,
      routeRuntime,
      site,
      localization,
      sourceMeta,
      profile,
      socials,
    }),
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
