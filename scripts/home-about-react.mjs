import fs from "node:fs";
import path from "node:path";
import { ROOT, loadRegistry } from "./i18n-catalog.mjs";
import { loadProductionLocalization } from "./production-localization.mjs";
import { localizedBuildLogEntry } from "./shared-localization.mjs";
import { loadRouteRuntime, loadSiteRoutes } from "./site-routes.mjs";
import { decodeHtml } from "./localized-html.mjs";

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const structure = readJson("data/site/m3-25b-home-about-structure.json");
const buildLog = readJson("data/portfolio/build-log.json");
const profile = readJson("data/portfolio/profile.json");
const projects = readJson("data/portfolio/projects.json");
const registry = loadRegistry();
const routeRuntime = loadRouteRuntime(registry, loadSiteRoutes());

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

export function injectProductionMain({ document, markup, props, clientEntry }) {
  const main = document.match(/<main\b([^>]*)>[\s\S]*?<\/main>/i);
  if (!main) throw new Error("production document has no main to replace");
  const attributes = main[1].replace(/\sdata-react-main(?:="[^"]*")?/i, "").replace(/\sdata-prerendered(?:="[^"]*")?/i, "");
  const payload = JSON.stringify(props).replaceAll("<", "\\u003c");
  return document
    .replace(/<main\b[^>]*>[\s\S]*?<\/main>/i, `<main${attributes} data-react-main data-prerendered="true">${markup}</main>`)
    .replace("</body>", `<script id="react-main-props" type="application/json">${payload}</script><script type="module" src="/${clientEntry}"></script></body>`);
}
