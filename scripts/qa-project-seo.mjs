#!/usr/bin/env node
/**
 * qa-project-seo.mjs — guards the canonical project routes and their SEO
 * metadata (BRIEF 02).
 *
 * Everything here is asserted against RAW generated HTML, before any
 * JavaScript runs. That is the whole point of generating static pages: a
 * crawler that does not execute JS must still receive project-specific
 * metadata.
 *
 * This check validates. It never writes — the generator writes.
 *
 * Node built-ins only.
 *
 *   node scripts/qa-project-seo.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ORIGIN = "https://kaanbalci.com";
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let passed = 0;
const failures = [];

const check = (label, actual, expected) => {
  if (actual === expected) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n      expected: ${expected}\n      actual:   ${actual}`);
};
const ok = (label, condition) => check(label, Boolean(condition), true);

/* ---------- canonical registry ---------- */

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(read("portfolio-data.js"), sandbox);
const projects = sandbox.window.KAAN_PORTFOLIO.projectDetails;
const slugs = Object.keys(projects);

ok("registry exposes project detail records", slugs.length > 0);

/* ---------- tiny HTML helpers ---------- */

const attr = (tag, name) => {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', "i"));
  return m ? m[1] : null;
};
const tags = (html, tagName) => html.match(new RegExp("<" + tagName + "\\b[^>]*>", "gi")) || [];
const metaBy = (html, key, kind) => {
  for (const t of tags(html, "meta")) {
    if ((attr(t, kind) || "").toLowerCase() === key.toLowerCase()) return attr(t, "content");
  }
  return null;
};
const linkRel = (html, rel) => {
  for (const t of tags(html, "link")) {
    if ((attr(t, "rel") || "").toLowerCase() === rel) return attr(t, "href");
  }
  return null;
};
const decode = (s) =>
  String(s == null ? "" : s)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");

const en = (field) => (!field ? "" : typeof field === "string" ? field : field.en || field.tr || "");

/* ---------- 1. every project has a generated route ---------- */

const projectsDir = path.join(ROOT, "projects");
ok("projects/ directory exists", fs.existsSync(projectsDir));

const generatedDirs = fs.existsSync(projectsDir)
  ? fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : [];

check(
  "generated route count matches the registry",
  generatedDirs.length,
  slugs.length,
);
check(
  "generated routes match registry slugs exactly",
  generatedDirs.join(","),
  slugs.slice().sort().join(","),
);

for (const slug of slugs) {
  ok(`route exists: projects/${slug}/index.html`, fs.existsSync(path.join(projectsDir, slug, "index.html")));
}

/* ---------- 2. per-page raw-HTML metadata ---------- */

const seenTitles = new Map();
const seenCanonicals = new Map();

for (const slug of slugs) {
  const file = path.join(projectsDir, slug, "index.html");
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, "utf8");
  const project = projects[slug];
  const canonical = `${SITE_ORIGIN}/projects/${slug}/`;
  const label = `projects/${slug}/`;

  /* charset must be inside the first 1024 bytes or browsers may mis-decode. */
  const charsetOffset = Buffer.from(html, "utf8").indexOf(Buffer.from("<meta charset"));
  ok(`${label}: <meta charset> present`, charsetOffset >= 0);
  ok(`${label}: <meta charset> within first 1024 bytes (${charsetOffset})`, charsetOffset >= 0 && charsetOffset < 1024);

  /* title */
  const titleTags = html.match(/<title>[\s\S]*?<\/title>/gi) || [];
  check(`${label}: exactly one <title>`, titleTags.length, 1);
  const title = decode((titleTags[0] || "").replace(/<\/?title>/gi, ""));
  check(`${label}: title derives from canonical data`, title, `${en(project.title)} | Kaan Balcı`);
  ok(`${label}: title is unique`, !seenTitles.has(title));
  seenTitles.set(title, slug);

  /* description */
  const description = decode(metaBy(html, "description", "name"));
  ok(`${label}: has meta description`, description && description.length > 0);
  ok(`${label}: description is a reasonable snippet length`, description && description.length <= 200);

  /* canonical */
  check(`${label}: canonical is its own unique route`, linkRel(html, "canonical"), canonical);
  ok(`${label}: canonical is not the legacy detail page`, !/project-detail\.html/.test(linkRel(html, "canonical") || ""));
  ok(`${label}: canonical is unique`, !seenCanonicals.has(canonical));
  seenCanonicals.set(canonical, slug);

  /* robots must allow indexing — these pages replace the noindex legacy route */
  const robots = metaBy(html, "robots", "name") || "";
  ok(`${label}: indexable`, /index/.test(robots) && !/noindex/.test(robots));

  /* OpenGraph */
  check(`${label}: og:title matches title`, decode(metaBy(html, "og:title", "property")), title);
  check(`${label}: og:description matches description`, decode(metaBy(html, "og:description", "property")), description);
  check(`${label}: og:url matches canonical`, metaBy(html, "og:url", "property"), canonical);
  ok(`${label}: og:type present`, metaBy(html, "og:type", "property"));
  const ogImage = metaBy(html, "og:image", "property");
  ok(`${label}: og:image is absolute`, ogImage && ogImage.startsWith(`${SITE_ORIGIN}/`));

  /* the social image must be a real asset in the repo */
  if (ogImage) {
    const rel = decodeURIComponent(ogImage.replace(`${SITE_ORIGIN}/`, ""));
    ok(`${label}: og:image resolves on disk — ${rel}`, fs.existsSync(path.join(ROOT, rel)));
  }

  /* Twitter */
  check(`${label}: twitter:card`, metaBy(html, "twitter:card", "name"), "summary_large_image");
  check(`${label}: twitter:title matches title`, decode(metaBy(html, "twitter:title", "name")), title);
  check(`${label}: twitter:description matches description`, decode(metaBy(html, "twitter:description", "name")), description);
  check(`${label}: twitter:image matches og:image`, metaBy(html, "twitter:image", "name"), ogImage);

  /* JSON-LD */
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  ok(`${label}: has JSON-LD`, Boolean(ld));
  if (ld) {
    let parsed = null;
    try {
      parsed = JSON.parse(ld[1]);
    } catch (error) {
      failures.push(`${label}: JSON-LD is not valid JSON — ${error.message}`);
    }
    if (parsed) {
      passed += 1;
      check(`${label}: JSON-LD @context`, parsed["@context"], "https://schema.org");
      ok(`${label}: JSON-LD @type is a known schema`, ["CreativeWork", "SoftwareApplication", "VideoGame", "WebSite"].includes(parsed["@type"]));
      check(`${label}: JSON-LD name matches project`, parsed.name, en(project.title));
      check(`${label}: JSON-LD url matches canonical`, parsed.url, canonical);
      check(`${label}: JSON-LD image matches og:image`, parsed.image, ogImage);
      check(`${label}: JSON-LD creator`, parsed.creator && parsed.creator.name, "Kaan Balcı");
      /* No fabricated commerce or popularity signals. */
      for (const forbidden of ["aggregateRating", "review", "offers", "price", "interactionCount", "ratingValue"]) {
        ok(`${label}: JSON-LD has no fabricated ${forbidden}`, !(forbidden in parsed));
      }
      if ("sameAs" in parsed) {
        const list = Array.isArray(parsed.sameAs) ? parsed.sameAs : [parsed.sameAs];
        const known = new Set((project.links || []).map((l) => l.url));
        for (const url of list) {
          ok(`${label}: JSON-LD sameAs comes from canonical links — ${url}`, known.has(url));
        }
      }
    }
  }

  /* slug marker + runtime dependencies */
  const body = (html.match(/<body\b[^>]*>/i) || [])[0] || "";
  check(`${label}: declares its slug`, attr(body, "data-project-slug"), slug);
  check(`${label}: declares its site-root depth`, attr(body, "data-site-root"), "../../");
  ok(`${label}: mounts the project detail renderer`, /<main[^>]*data-project-detail[^>]*>/.test(html));
  for (const dep of ["portfolio-data.js", "script.js", "portfolio-v2.js"]) {
    ok(`${label}: loads ${dep} from the site root`, html.includes(`src="../../${dep}"`));
  }
  ok(`${label}: loads style.css from the site root`, html.includes(`href="../../style.css"`));

  /* exactly one H1, carrying the project title so the page is meaningful
   * before JavaScript replaces the section */
  const h1s = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  check(`${label}: exactly one <h1>`, h1s.length, 1);
  check(
    `${label}: raw <h1> is the project title`,
    decode((h1s[0] || "").replace(/<\/?h1[^>]*>/gi, "")),
    en(project.title),
  );

  /* no path that only works from the site root */
  const bare = html.match(/\b(?:href|src)="(?!https?:|\/\/|mailto:|tel:|#|\.\.\/)[^"]+"/g) || [];
  ok(`${label}: no un-rebased relative paths (${bare.slice(0, 2).join(", ")})`, bare.length === 0);

  /* every rebased path must resolve from two directories deep */
  const rebased = [...html.matchAll(/\b(?:href|src)="\.\.\/\.\.\/([^"#?]+)/g)].map((m) => m[1]);
  for (const rel of new Set(rebased)) {
    ok(
      `${label}: ../../${rel} resolves from the project directory`,
      fs.existsSync(path.join(ROOT, decodeURIComponent(rel))),
    );
  }

  /* generated marker */
  ok(`${label}: carries the generated-file notice`, html.includes("GENERATED FILE."));
}

/* ---------- 3. legacy route preserved ---------- */

const legacy = read("project-detail.html");
ok("legacy project-detail.html still exists", legacy.length > 0);
ok("legacy page still mounts the renderer", /<main[^>]*data-project-detail[^>]*>/.test(legacy));
ok(
  "legacy page stays out of the index so it cannot compete with the unique routes",
  /noindex/.test(metaBy(legacy, "robots", "name") || ""),
);

const runtime = read("js/portfolio/routing.js");
const resolver = (runtime.match(/function resolveCurrentProjectSlug\(\)[\s\S]*?\n\}/) || [""])[0];
ok("runtime has a single slug resolver", resolver.length > 0);
ok(
  "resolver reads the declarative page marker",
  /dataset\.projectSlug/.test(resolver),
);
ok(
  "resolver falls back to the legacy query string",
  /URLSearchParams\(window\.location\.search\)\.get\("project"\)/.test(resolver),
);
ok(
  "resolver prefers the page marker over the query string",
  resolver.indexOf("dataset.projectSlug") < resolver.indexOf("URLSearchParams"),
);
const detailModule = read("js/portfolio/project-detail.js");
ok("runtime keeps the not-found fallback", /Project Not Found|Proje Bulunamadı/.test(detailModule));
ok("runtime builds canonical project URLs", /function projectUrl\(slug\)/.test(runtime));
ok("runtime rebases relative URLs by page depth", /function siteUrl\(path\)/.test(runtime));

/* ---------- 4. sitemap ---------- */

const sitemap = read("sitemap.xml");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const projectLocs = locs.filter((l) => l.includes("/projects/"));

check("sitemap lists every project route", projectLocs.length, slugs.length);
for (const slug of slugs) {
  ok(`sitemap contains ${slug}`, locs.includes(`${SITE_ORIGIN}/projects/${slug}/`));
}
ok("sitemap excludes legacy query-string project URLs", !locs.some((l) => l.includes("project-detail.html")));
ok("sitemap has no duplicate URLs", locs.length === new Set(locs).size);
for (const page of ["", "works.html", "games.html", "about.html", "blog.html", "request.html"]) {
  ok(`sitemap still lists ${page || "the homepage"}`, locs.includes(`${SITE_ORIGIN}/${page}`));
}

/* Every sitemap URL must resolve to a file on disk. */
for (const loc of locs) {
  const rel = loc.replace(`${SITE_ORIGIN}/`, "");
  const target = rel === "" ? "index.html" : rel.endsWith("/") ? `${rel}index.html` : rel;
  ok(`sitemap URL resolves on disk — ${loc}`, fs.existsSync(path.join(ROOT, decodeURIComponent(target))));
}

/* robots.txt must not block the new routes. */
const robotsTxt = read("robots.txt");
ok("robots.txt does not disallow /projects/", !/Disallow:\s*\/projects/i.test(robotsTxt));
ok("robots.txt still declares the sitemap", /Sitemap:/.test(robotsTxt));

/* ---------- 5. internal links prefer the canonical route ---------- */

const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
for (const file of htmlFiles) {
  const html = read(file);
  const legacyLinks = [...html.matchAll(/href="project-detail\.html\?project=([a-z0-9-]+)"/g)];
  ok(
    `${file}: links to projects use the canonical route (${legacyLinks.length} legacy links)`,
    legacyLinks.length === 0,
  );
}
ok(
  "runtime emits no hardcoded legacy project URLs",
  !/["'`]project-detail\.html\?project=/.test(runtime.replace(/\/\*[\s\S]*?\*\//g, " ")),
);

/* ---------- 6. generated output is in step with canonical data ---------- */

let generatorCheck = "";
let generatorExit = 0;
try {
  generatorCheck = execFileSync(
    process.execPath,
    [path.join(ROOT, "scripts", "generate-project-pages.mjs"), "--check"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (error) {
  generatorExit = error.status || 1;
  generatorCheck = `${error.stdout || ""}${error.stderr || ""}`;
}
check(
  `generated pages and sitemap are in step with canonical data\n      ${generatorCheck.trim().split("\n").join("\n      ")}`,
  generatorExit,
  0,
);

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Project SEO: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(
  `Project SEO passed. ${passed} assertions · ${slugs.length} canonical routes · ${projectLocs.length} sitemap project URLs.`,
);
