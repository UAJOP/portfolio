import fs from "node:fs";
import path from "node:path";
import { ROOT, loadRegistry } from "./i18n-catalog.mjs";
import { loadProductionLocalization } from "./production-localization.mjs";
import { localizedBuildLogEntry } from "./shared-localization.mjs";
import { loadRouteRuntime, loadSiteRoutes } from "./site-routes.mjs";
import { decodeHtml } from "./localized-html.mjs";
import { createHomeAboutHeadModel } from "./site-head.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const structure = readJson("data/site/m3-25b-home-about-structure.json");
const buildLog = readJson("data/portfolio/build-log.json");
const profile = readJson("data/portfolio/profile.json");
const projects = readJson("data/portfolio/projects.json");
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

function collectRequirements(nodes, requirements = { messages: new Set(), compat: new Set(), internal: new Set() }) {
  for (const node of nodes) {
    if (node.type === "message") requirements.messages.add(node.key);
    if (node.type !== "element") continue;
    for (const attribute of node.attributes) {
      const value = attribute.value;
      if (value?.type === "message") requirements.messages.add(value.key);
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

export function productionMainProps(route) {
  const page = structure.pages[route.routeId];
  if (!page) throw new Error(`no Home/About production component for ${route.routeId}`);
  if (structure.acceptedRef !== "34fdfad01f63004ed10d616a7b061e3996c28150") {
    throw new Error("Home/About React structure is not tied to the accepted pre-cutover ref");
  }
  const localization = loadProductionLocalization(route.locale);
  const requirements = collectRequirements(page.children);
  const copy = Object.fromEntries([...requirements.messages].sort().map((key) => [key, localization.message(key)]));
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
  return {
    page: route.routeId,
    locale: route.locale,
    copy,
    compat,
    links,
    data: localizedCanonicalData(route.locale),
    buildLog: localizedBuildLog,
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
