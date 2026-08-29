#!/usr/bin/env node
/**
 * generate-project-pages.mjs — static canonical page per project (BRIEF 02).
 *
 * Writes projects/<slug>/index.html for every record in the canonical
 * registry, plus sitemap.xml. Run after editing data/portfolio/*.json:
 *
 *   npm run generate:projects
 *
 * The page shell is derived from project-detail.html at generation time rather
 * than kept as a second template, so the layout has exactly one maintained
 * source. Only metadata and the slug marker are injected; project facts stay in
 * data/portfolio/ and are rendered at runtime by the existing renderer.
 *
 * Deterministic: identical input always produces byte-identical output, with no
 * timestamps or random values, so `qa:seo` can diff generated files against the
 * checked-in ones.
 *
 * Node built-ins only.
 *
 *   node scripts/generate-project-pages.mjs           # write
 *   node scripts/generate-project-pages.mjs --check   # verify only, write nothing
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ORIGIN = "https://kaanbalci.com";
const OUTPUT_DIR = path.join(ROOT, "projects");
const SHELL_SOURCE = path.join(ROOT, "project-detail.html");
const DEFAULT_SOCIAL_IMAGE = "assets/portfolio_website_cover.webp";

/* Generated pages sit two levels deep. Relative rather than root-absolute so
 * the site still works from a subdirectory and over file://. */
const DEPTH_PREFIX = "../../";

const checkOnly = process.argv.includes("--check");

/* ---------- canonical data ---------- */

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "portfolio-data.js"), "utf8"), sandbox);
const registry = sandbox.window.KAAN_PORTFOLIO;

if (!registry || !registry.projectDetails) {
  throw new Error("portfolio-data.js did not expose window.KAAN_PORTFOLIO.projectDetails");
}

const projects = registry.projectDetails;
const slugs = Object.keys(projects);

if (!slugs.length) throw new Error("the canonical registry contains no project detail records");

/* ---------- slug safety ---------- */

/* Slugs become directory names, so they are validated before any write. */
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const seen = new Set();
for (const slug of slugs) {
  if (!SAFE_SLUG.test(slug)) {
    throw new Error(`unsafe project slug ${JSON.stringify(slug)}: expected lowercase kebab-case`);
  }
  if (seen.has(slug)) throw new Error(`duplicate project slug: ${slug}`);
  seen.add(slug);

  const target = path.resolve(OUTPUT_DIR, slug);
  if (path.dirname(target) !== OUTPUT_DIR) {
    throw new Error(`slug ${JSON.stringify(slug)} escapes the projects directory`);
  }
}

/* ---------- helpers ---------- */

const escapeHtml = (value) =>
  String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const en = (field) => {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field.en || field.tr || "";
};

/** Search snippets are truncated on a word boundary, never mid-word. */
const truncate = (text, limit = 160) => {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "")}…`;
};

const absoluteUrl = (repoRelative) =>
  `${SITE_ORIGIN}/${String(repoRelative || "").replace(/^\/+/, "")}`;

const canonicalFor = (slug) => `${SITE_ORIGIN}/projects/${slug}/`;

/**
 * Chooses the narrowest schema.org type the canonical data actually supports.
 * Anything not clearly software or a game stays CreativeWork rather than being
 * forced into SoftwareApplication.
 */
const schemaTypeFor = (project) => {
  const haystack = [
    en(project.category),
    en(project.type),
    (project.stack || []).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  if (/\bgame\b|unity|unreal|oyun/.test(haystack)) return "VideoGame";
  if (/web (site|development)|website|landing|portfolio|front-?end/.test(haystack)) {
    return "WebSite";
  }
  if (/software|application|app\b|desktop|database|automation|python|c#|java|kotlin|android/.test(haystack)) {
    return "SoftwareApplication";
  }
  return "CreativeWork";
};

/* ---------- shell derivation ---------- */

const rawShell = fs.readFileSync(SHELL_SOURCE, "utf8");

/**
 * Rebases every repo-relative href/src in the shell onto the generated page's
 * depth. Absolute URLs, protocol-relative URLs, fragments and root-relative
 * paths are left untouched.
 */
function rebaseShellPaths(html) {
  return html.replace(
    /\b(href|src)="([^"]*)"/g,
    (match, attr, value) => {
      if (!value || /^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(value)) return match;
      return `${attr}="${DEPTH_PREFIX}${value}"`;
    },
  );
}

/** Removes the head tags the generator replaces with project-specific ones. */
function stripShellHead(head) {
  return head
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta[^>]*name="description"[^>]*>/i, "")
    .replace(/<meta[^>]*name="robots"[^>]*>/i, "")
    .replace(/<link[^>]*rel="canonical"[^>]*>/i, "");
}

/**
 * Splits the encoding declaration off the shell head.
 *
 * `<meta charset>` must appear within the first 1024 bytes of the document, and
 * the injected metadata block is larger than that, so charset is re-emitted
 * first rather than left wherever the shell happened to put it. Turkish
 * characters in the titles depend on this.
 */
function extractCharset(head) {
  const match = head.match(/<meta[^>]*charset=[^>]*>/i);
  if (!match) throw new Error("project-detail.html has no <meta charset> to preserve");
  return { charset: match[0], rest: head.replace(match[0], "") };
}

function buildHeadMetadata(slug, project) {
  const title = en(project.title);
  const description = truncate(en(project.subtitle) || en(project.overview));
  const canonical = canonicalFor(slug);
  const image = absoluteUrl(project.image || DEFAULT_SOCIAL_IMAGE);
  const pageTitle = `${title} | Kaan Balcı`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": schemaTypeFor(project),
    name: title,
    description: truncate(en(project.overview) || en(project.subtitle), 300),
    url: canonical,
    image,
    dateCreated: String(project.year || ""),
    inLanguage: ["en", "tr"],
    genre: en(project.category),
    creator: { "@type": "Person", name: "Kaan Balcı", url: `${SITE_ORIGIN}/` },
  };

  const keywords = (project.stack || []).filter(Boolean);
  if (keywords.length) jsonLd.keywords = keywords.join(", ");

  /* sameAs only ever carries links the canonical data actually provides. */
  const sameAs = (project.links || [])
    .map((link) => link.url)
    .filter((url) => typeof url === "string" && /^https:\/\//.test(url));
  if (sameAs.length) jsonLd.sameAs = sameAs.length === 1 ? sameAs[0] : sameAs;

  return [
    `<title>${escapeHtml(pageTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}"/>`,
    `<link rel="canonical" href="${escapeHtml(canonical)}"/>`,
    `<meta name="robots" content="index, follow"/>`,
    `<meta property="og:site_name" content="Kaan Balcı Portfolio"/>`,
    `<meta property="og:type" content="article"/>`,
    `<meta property="og:title" content="${escapeHtml(pageTitle)}"/>`,
    `<meta property="og:description" content="${escapeHtml(description)}"/>`,
    `<meta property="og:url" content="${escapeHtml(canonical)}"/>`,
    `<meta property="og:image" content="${escapeHtml(image)}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:title" content="${escapeHtml(pageTitle)}"/>`,
    `<meta name="twitter:description" content="${escapeHtml(description)}"/>`,
    `<meta name="twitter:image" content="${escapeHtml(image)}"/>`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
  ].join("");
}

const GENERATED_NOTICE = `<!--
GENERATED FILE.
Source: data/portfolio/project-details.json
Generator: scripts/generate-project-pages.mjs
Do not edit project content here.
-->`;

function renderProjectPage(slug, project) {
  const rebased = rebaseShellPaths(rawShell);

  const headMatch = rebased.match(/<head>([\s\S]*?)<\/head>/i);
  if (!headMatch) throw new Error("project-detail.html has no <head> to derive from");
  const { charset, rest } = extractCharset(stripShellHead(headMatch[1]));

  let html = rebased.replace(
    /<head>[\s\S]*?<\/head>/i,
    `<head>${charset}${buildHeadMetadata(slug, project)}${rest}</head>`,
  );

  /* Declarative slug marker plus the depth prefix the renderer needs. */
  html = html.replace(
    /<body([^>]*)>/i,
    `<body$1 data-project-slug="${escapeHtml(slug)}" data-site-root="${DEPTH_PREFIX}">`,
  );

  /* The raw shell carries the real project heading instead of a "Loading…"
   * placeholder, so the page is meaningful without JavaScript. The renderer
   * replaces this whole section on boot, so there is never a second H1. */
  const title = en(project.title);
  const subtitle = en(project.subtitle);
  html = html.replace(
    /<main data-project-detail>[\s\S]*?<\/main>/i,
    `<main data-project-detail><section class="page-hero section-shell reveal">` +
      `<p class="eyebrow">${escapeHtml(en(project.category))}</p>` +
      `<h1>${escapeHtml(title)}</h1>` +
      `<p>${escapeHtml(subtitle)}</p>` +
      `</section></main>`,
  );

  html = html.replace(/^<!DOCTYPE html>/i, `<!DOCTYPE html>\n${GENERATED_NOTICE}`);

  return html;
}

/* ---------- sitemap ---------- */

/* Static pages that are indexable, with their priorities. Project routes are
 * appended from the registry so a new project needs no manual sitemap edit. */
const STATIC_SITEMAP_PAGES = [
  ["", "weekly", "1.0"],
  ["works.html", "monthly", "0.9"],
  ["sinama-case-study.html", "monthly", "0.9"],
  ["merge-rush-case-study.html", "monthly", "0.9"],
  ["now.html", "weekly", "0.8"],
  ["blog.html", "monthly", "0.8"],
  ["about.html", "monthly", "0.8"],
  ["games.html", "monthly", "0.7"],
  ["labs.html", "monthly", "0.7"],
  ["ai-flow-puzzle-case-study.html", "monthly", "0.7"],
  ["atolye-joyday-case-study.html", "monthly", "0.7"],
  ["hospital-system-case-study.html", "monthly", "0.7"],
  ["single-work.html", "monthly", "0.6"],
  ["request.html", "monthly", "0.6"],
  ["adventure.html", "monthly", "0.5"],
  ["joyday-paint.html", "monthly", "0.5"],
  ["ai-flow-puzzle.html", "monthly", "0.5"],
];

function renderSitemap() {
  const entries = [
    ...STATIC_SITEMAP_PAGES.map(([page, changefreq, priority]) => [
      `${SITE_ORIGIN}/${page}`,
      changefreq,
      priority,
    ]),
    /* Canonical project routes. The legacy query-string URLs are deliberately
     * absent: they are compatibility endpoints, not indexable pages. */
    ...slugs.map((slug) => [canonicalFor(slug), "monthly", "0.6"]),
  ];

  const body = entries
    .map(
      ([loc, changefreq, priority]) =>
        `  <url><loc>${loc}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/* ---------- write / check ---------- */

/** Only directories holding a page this generator produced are considered ours. */
function generatorOwnedDirs() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  return fs
    .readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      const page = path.join(OUTPUT_DIR, entry.name, "index.html");
      return fs.existsSync(page) && fs.readFileSync(page, "utf8").includes(GENERATED_NOTICE);
    })
    .map((entry) => entry.name);
}

const planned = new Map(slugs.map((slug) => [slug, renderProjectPage(slug, projects[slug])]));
const sitemap = renderSitemap();

const differences = [];
const readIfExists = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
const normalize = (text) => (text == null ? null : text.replace(/\r\n/g, "\n"));

for (const [slug, html] of planned) {
  const file = path.join(OUTPUT_DIR, slug, "index.html");
  if (normalize(readIfExists(file)) !== normalize(html)) {
    differences.push(`projects/${slug}/index.html`);
  }
}

const stale = generatorOwnedDirs().filter((slug) => !planned.has(slug));
for (const slug of stale) differences.push(`projects/${slug}/ (stale, no longer in the registry)`);

const sitemapFile = path.join(ROOT, "sitemap.xml");
if (normalize(readIfExists(sitemapFile)) !== normalize(sitemap)) differences.push("sitemap.xml");

if (checkOnly) {
  if (differences.length) {
    console.error(
      `Generated output is out of date (${differences.length}):\n` +
        differences.map((d) => `  - ${d}`).join("\n") +
        "\n\nRun: npm run generate:projects",
    );
    process.exit(1);
  }
  console.log(
    `Generated project pages are up to date. ${planned.size} routes · sitemap in step.`,
  );
  process.exit(0);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
for (const [slug, html] of planned) {
  const dir = path.join(OUTPUT_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

/* Stale removal is limited to directories carrying this generator's notice. */
for (const slug of stale) {
  fs.rmSync(path.join(OUTPUT_DIR, slug), { recursive: true, force: true });
}

fs.writeFileSync(sitemapFile, sitemap);

console.log(
  `[projects] ${planned.size} canonical pages written to projects/` +
    (stale.length ? ` · ${stale.length} stale removed` : "") +
    `\n[sitemap] ${STATIC_SITEMAP_PAGES.length} static + ${slugs.length} project URLs`,
);
