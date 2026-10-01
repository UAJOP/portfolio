/** Shared production head renderer for legacy generation and React prerendering. */
import { escapeHtml } from "./localized-html.mjs";

const HEAD_REPLACEMENTS = [
  [/<title>[\s\S]*?<\/title>/i],
  [/<meta[^>]*\bname="description"[^>]*>/i],
  [/<meta[^>]*\bname="robots"[^>]*>/i],
  [/<link[^>]*\brel="canonical"[^>]*>/i],
  [/<meta[^>]*\bproperty="og:title"[^>]*>/i],
  [/<meta[^>]*\bproperty="og:description"[^>]*>/i],
  [/<meta[^>]*\bproperty="og:url"[^>]*>/i],
  [/<meta[^>]*\bproperty="og:locale"[^>]*>/i],
  [/<meta[^>]*\bname="twitter:title"[^>]*>/i],
  [/<meta[^>]*\bname="twitter:description"[^>]*>/i],
];
const ALTERNATE_LINKS = /<link[^>]*\brel=["']alternate["'][^>]*>/gi;
const CANONICAL_LINK = /<link[^>]*\brel=["']canonical["'][^>]*>/i;
const OG_URL_META = /<meta[^>]*\bproperty=["']og:url["'][^>]*>/i;
const tidyWhitespace = (text) => text.replace(/^[ \t]+$/gm, "").replace(/[ \t]+$/gm, "");

export function createSiteHeadRenderer({ registry, indexableLocales, absoluteFor }) {
  const alternateLinkRecords = (routeKey, indexable) => {
    if (!indexable || !indexableLocales.length) return [];
    const locales = [registry.defaultLocale, ...indexableLocales];
    const links = locales.map((id) => ({
      hrefLang: registry.byId.get(id).htmlLang || id,
      href: absoluteFor(routeKey, id),
    }));
    links.push({ hrefLang: "x-default", href: absoluteFor(routeKey, registry.defaultLocale) });
    return links;
  };
  const alternateLinks = (routeKey, indexable) => alternateLinkRecords(routeKey, indexable)
    .map(({ hrefLang, href }) => `<link rel="alternate" hreflang="${escapeHtml(hrefLang)}" href="${escapeHtml(href)}"/>`)
    .join("");

  const stripHeadMetadata = (head) => {
    let out = head;
    for (const [pattern] of HEAD_REPLACEMENTS) out = out.replace(pattern, "");
    return out.replace(ALTERNATE_LINKS, "");
  };

  const buildLocalizedHead = (head, { routeKey, locale, meta, indexable, companion }) => {
    const definition = registry.byId.get(locale);
    if (!definition) throw new Error(`head renderer: unknown locale ${locale}`);
    for (const key of ["title", "description", "ogTitle", "ogDescription"]) {
      if (!meta?.[key]) throw new Error(`head renderer: ${locale}/${routeKey} is missing ${key}`);
    }
    const canonical = absoluteFor(routeKey, locale);
    const robots = indexable ? "index, follow" : "noindex, follow";
    const injected = [
      `<title>${escapeHtml(meta.title)}</title>`,
      `<meta name="description" content="${escapeHtml(meta.description)}"/>`,
      companion ? "" : `<link rel="canonical" href="${escapeHtml(canonical)}"/>`,
      `<meta name="robots" content="${robots}"/>`,
      `<meta property="og:locale" content="${escapeHtml(definition.ogLocale || definition.htmlLang || locale)}"/>`,
      `<meta property="og:title" content="${escapeHtml(meta.ogTitle)}"/>`,
      `<meta property="og:description" content="${escapeHtml(meta.ogDescription)}"/>`,
      companion ? "" : `<meta property="og:url" content="${escapeHtml(canonical)}"/>`,
      `<meta name="twitter:title" content="${escapeHtml(meta.ogTitle)}"/>`,
      `<meta name="twitter:description" content="${escapeHtml(meta.ogDescription)}"/>`,
      alternateLinks(routeKey, indexable),
    ].join("");
    const charset = head.match(/<meta[^>]*charset=[^>]*>/i);
    if (!charset) throw new Error("source document has no <meta charset> to preserve");
    const rest = tidyWhitespace(stripHeadMetadata(head).replace(charset[0], ""));
    return `${charset[0]}${injected}${rest}`;
  };

  const buildEnglishDocument = ({ route, file, indexable, source }) => {
    const headMatch = source.match(/<head>([\s\S]*?)<\/head>/i);
    if (!headMatch) throw new Error(`${file} has no <head>`);
    let head = headMatch[1].replace(ALTERNATE_LINKS, "");
    const canonicalUrl = absoluteFor(route.page, registry.defaultLocale);
    if (indexable) {
      const canonical = head.match(CANONICAL_LINK);
      if (!canonical) throw new Error(`${file} has no canonical link to own`);
      const setAttribute = (tag, name, value) => tag.replace(new RegExp(`\\b${name}=(["'])[^"']*\\1`, "i"), `${name}="${escapeHtml(value)}"`);
      head = head.replace(canonical[0], `${setAttribute(canonical[0], "href", canonicalUrl)}${alternateLinks(route.page, true)}`);
      head = head.replace(OG_URL_META, (tag) => setAttribute(tag, "content", canonicalUrl));
    } else {
      head = head.replace(CANONICAL_LINK, "").replace(OG_URL_META, "");
    }
    head = tidyWhitespace(head);
    return source.replace(/<head>[\s\S]*?<\/head>/i, `<head>${head}</head>`);
  };

  return { alternateLinkRecords, alternateLinks, buildLocalizedHead, buildEnglishDocument };
}

export const HOME_ABOUT_THEME_BOOTSTRAP = Object.freeze({
  home: '(function(){try{var savedTheme=localStorage.getItem("kaanbalci-site-theme")||"dark";document.documentElement.setAttribute("data-theme",savedTheme==="light"?"light":"dark");}catch(error){document.documentElement.setAttribute("data-theme","dark");}})();',
  about: '(function(){try{var t=localStorage.getItem("kaanbalci-site-theme")||"dark";document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark");}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();',
});

const PERSON_KNOWS_ABOUT = Object.freeze([
  "Forward Deployed Engineering",
  "Applied AI",
  "AI Deployment",
  "Customer Workflow Discovery",
  "Technical Scoping",
  "Solution Engineering",
  "AI Reliability",
  "LLM Evaluation",
  "Conversational AI",
  "FastAPI",
  "TypeScript",
]);

/** Canonical structured head model for the React-owned Home/About documents.
 * The shared alternate-link renderer remains the URL authority; route-specific
 * tag presence preserves the accepted pre-cutover metadata contract. */
export function createHomeAboutHeadModel({
  route,
  registry,
  routeRuntime,
  site,
  localization,
  sourceMeta,
  profile,
  socials,
}) {
  if (!HOME_ABOUT_THEME_BOOTSTRAP[route.routeId]) throw new Error(`unsupported Home/About head route ${route.routeId}`);
  const meta = route.locale === registry.defaultLocale
    ? sourceMeta[route.routeId]
    : localization.packs.meta?.[route.routeId];
  if (!meta) throw new Error(`${route.locale}/${route.routeId}: missing canonical meta`);
  const headRenderer = createSiteHeadRenderer({
    registry,
    indexableLocales: (registry.localizedRoutes?.indexable || []).filter((id) => id !== registry.defaultLocale),
    absoluteFor: (routeKey, locale) => `${site.origin}/${routeRuntime.localizedRouteKey(routeKey, locale)}`,
  });
  const canonical = `${site.origin}${route.pathname}`;
  const localized = route.locale !== registry.defaultLocale;
  const home = route.routeId === "home";
  return {
    title: meta.title,
    description: meta.description,
    keywords: home ? "Kaan Balcı, Forward Deployed Engineer, Applied AI, AI deployment, customer workflows, technical scoping, solution engineering, AI reliability, LLM evaluation, FastAPI, TypeScript" : null,
    canonical,
    alternates: headRenderer.alternateLinkRecords(route.route, true),
    og: {
      siteName: home ? "Kaan Balcı Portfolio" : null,
      locale: home || localized ? localization.definition.ogLocale || localization.definition.htmlLang : null,
      title: meta.ogTitle,
      description: meta.ogDescription,
      type: home ? "website" : null,
      url: home || localized ? canonical : null,
      image: `${site.origin}/assets/portfolio_website_cover.webp`,
    },
    twitter: {
      card: home ? "summary_large_image" : null,
      title: localized ? meta.ogTitle : null,
      description: localized ? meta.ogDescription : null,
      image: home ? `${site.origin}/assets/portfolio_website_cover.webp` : null,
    },
    themeBootstrap: HOME_ABOUT_THEME_BOOTSTRAP[route.routeId],
    jsonLd: home ? {
      "@context": "https://schema.org",
      "@type": "Person",
      name: profile.name,
      url: site.origin,
      image: `${site.origin}/assets/kaan-balci-profile.webp`,
      jobTitle: profile.primaryTitle[registry.defaultLocale],
      description: localization.message("shell.head.personDescription"),
      sameAs: [socials.github, socials.linkedin],
      knowsAbout: PERSON_KNOWS_ABOUT,
    } : null,
  };
}
export function localizeJsonLd(head, { locale, canonical, meta }) {
  const englishCanonical = canonical.replace(`/${locale}/`, "/");
  return head.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi, (match, body) => {
    let data;
    try { data = JSON.parse(body); } catch { return match; }
    const apply = (node) => {
      if (Array.isArray(node)) return node.map(apply);
      if (!node || typeof node !== "object") return node;
      const out = { ...node };
      if (typeof out.description === "string") out.description = meta.ogDescription;
      if (out.inLanguage !== undefined) out.inLanguage = locale;
      for (const key of ["url", "mainEntityOfPage"]) if (out[key] === englishCanonical) out[key] = canonical;
      for (const key of Object.keys(out)) if (key !== "description" && key !== "inLanguage") out[key] = apply(out[key]);
      return out;
    };
    return `<script type="application/ld+json">${JSON.stringify(apply(data))}</script>`;
  });
}

export function renderProjectHeadMetadata({ title, description, canonical, alternateLinks, image, jsonLd }) {
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}"/>`,
    `<link rel="canonical" href="${escapeHtml(canonical)}"/>`,
    alternateLinks,
    `<meta name="robots" content="index, follow"/>`,
    `<meta property="og:site_name" content="Kaan Balcı Portfolio"/>`,
    `<meta property="og:type" content="article"/>`,
    `<meta property="og:title" content="${escapeHtml(title)}"/>`,
    `<meta property="og:description" content="${escapeHtml(description)}"/>`,
    `<meta property="og:url" content="${escapeHtml(canonical)}"/>`,
    `<meta property="og:image" content="${escapeHtml(image)}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:title" content="${escapeHtml(title)}"/>`,
    `<meta name="twitter:description" content="${escapeHtml(description)}"/>`,
    `<meta name="twitter:image" content="${escapeHtml(image)}"/>`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
  ].join("");
}
