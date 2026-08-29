#!/usr/bin/env node
/**
 * qa-project-data.mjs — guards the canonical project catalog (BRIEF 01).
 *
 * Project facts live in data/portfolio/. This check enforces that:
 *   - the catalog is internally consistent (slugs, links, media, categories),
 *   - every project-detail.html?project=<slug> URL that worked before the
 *     migration still resolves, verified against a pre-migration fixture,
 *   - every project id referenced by a consumer resolves,
 *   - project facts have not crept back into the runtime files.
 *
 * Node built-ins only, consistent with the other qa-* checks.
 *
 *   node scripts/qa-project-data.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const readJson = (p) => JSON.parse(read(p));

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

/* ---------- load the generated registry the way a browser would ---------- */

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(read("portfolio-data.js"), sandbox);
const registry = sandbox.window.KAAN_PORTFOLIO;

ok("1. generated registry loads and exposes window.KAAN_PORTFOLIO", registry);
ok("1. registry exposes projectDetails", registry && registry.projectDetails);
ok("1. registry exposes projects", registry && registry.projects);

const details = registry.projectDetails || {};
const projects = registry.projects || {};
const detailSlugs = Object.keys(details);

/* ---------- 2. catalog is non-empty ---------- */

ok("2. project detail catalog is non-empty", detailSlugs.length > 0);
ok("2. flagship project catalog is non-empty", Object.keys(projects).length > 0);

/* ---------- 3. slug uniqueness / no duplicate records ---------- */

const sourceDetails = readJson("data/portfolio/project-details.json");
const rawSlugs = [...read("data/portfolio/project-details.json").matchAll(/^ {2}"([^"]+)":/gm)].map(
  (m) => m[1],
);
check(
  "3. project-details.json declares each slug exactly once",
  rawSlugs.length,
  new Set(rawSlugs).size,
);
check(
  "3. every declared slug survives JSON parsing (no silent overwrite)",
  Object.keys(sourceDetails).length,
  rawSlugs.length,
);

/* 15. no two records describe the same project by title. */
const titleIndex = new Map();
for (const [slug, project] of Object.entries(details)) {
  const key = (project.title && project.title.en) || "";
  if (titleIndex.has(key)) {
    failures.push(
      `15. duplicate project record: "${slug}" and "${titleIndex.get(key)}" share title.en ${JSON.stringify(key)}`,
    );
  } else {
    titleIndex.set(key, slug);
    passed += 1;
  }
}

/* ---------- 4. every pre-migration slug is preserved ---------- */

const baseline = readJson("scripts/fixtures/project-catalog-baseline.json");
const baselineSlugs = baseline.slugOrder;

check("4. baseline fixture slug count", baselineSlugs.length, 25);
for (const slug of baselineSlugs) {
  ok(`4. legacy slug preserved: ${slug}`, Object.prototype.hasOwnProperty.call(details, slug));
}
check(
  "4. no slug silently added or removed",
  detailSlugs.slice().sort().join(","),
  baselineSlugs.slice().sort().join(","),
);
check("4. slug order preserved", detailSlugs.join(","), baselineSlugs.join(","));

/* Per-record contract parity: fields, identity, links, media, counts. */
for (const [slug, want] of Object.entries(baseline.records)) {
  const got = details[slug];
  if (!got) continue; /* already reported above */

  check(
    `4. ${slug}: field set unchanged`,
    Object.keys(got).sort().join(","),
    want.fields.join(","),
  );
  check(`4. ${slug}: title.en unchanged`, got.title && got.title.en, want.title.en);
  check(`4. ${slug}: title.tr unchanged`, got.title && got.title.tr, want.title.tr);
  check(
    `4. ${slug}: category unchanged`,
    JSON.stringify(got.category),
    JSON.stringify(want.category),
  );
  check(`4. ${slug}: year unchanged`, got.year, want.year);
  check(`4. ${slug}: image unchanged`, got.image, want.image);
  check(
    `10. ${slug}: link targets unchanged`,
    (got.links || []).map((l) => l.url).join(" | "),
    want.linkUrls.join(" | "),
  );
  check(`4. ${slug}: stack entry count unchanged`, (got.stack || []).length, want.stackCount);
  check(`4. ${slug}: gallery entry count unchanged`, (got.gallery || []).length, want.galleryCount);
  check(
    `4. ${slug}: feature count unchanged`,
    ((got.features && got.features.en) || []).length,
    want.featureCount,
  );
}

/* ---------- 5 & 6. project-detail lookup behaviour ---------- */

/* The runtime resolves `projectDetailData[slug]`, projected from the registry. */
const runtime = read("js/portfolio/routing.js");
ok(
  "5. project-detail projects the catalog from the registry",
  /window\.KAAN_PORTFOLIO && window\.KAAN_PORTFOLIO\.projectDetails/.test(runtime),
);
for (const slug of baselineSlugs) {
  ok(`5. lookup resolves: project-detail.html?project=${slug}`, Boolean(details[slug]));
}
for (const unknown of ["", "does-not-exist", "__proto__", "constructor", "toString"]) {
  const resolved = Object.prototype.hasOwnProperty.call(details, unknown) ? details[unknown] : null;
  ok(`6. unknown slug does not resolve: ${JSON.stringify(unknown)}`, resolved === null);
}

/* ---------- 7 & 8. localization ---------- */

const BILINGUAL_FIELDS = ["title", "subtitle", "category", "role", "type", "status", "overview", "challenge", "solution"];
for (const [slug, project] of Object.entries(details)) {
  for (const field of BILINGUAL_FIELDS) {
    const value = project[field];
    ok(`7. ${slug}.${field} has Turkish copy`, value && typeof value.tr === "string" && value.tr.length > 0);
    ok(`8. ${slug}.${field} has English copy`, value && typeof value.en === "string" && value.en.length > 0);
  }
  ok(`7. ${slug}.features has Turkish list`, Array.isArray(project.features && project.features.tr));
  ok(`8. ${slug}.features has English list`, Array.isArray(project.features && project.features.en));
  for (const link of project.links || []) {
    ok(`7. ${slug} link label has Turkish text`, link.label && typeof link.label.tr === "string");
    ok(`8. ${slug} link label has English text`, link.label && typeof link.label.en === "string");
  }
}

/* Flagship projects carry bilingual status/category/summary. */
for (const [id, project] of Object.entries(projects)) {
  for (const field of ["status", "category", "summary"]) {
    const value = project[field];
    ok(`7. projects.${id}.${field} has Turkish copy`, value && typeof value.tr === "string");
    ok(`8. projects.${id}.${field} has English copy`, value && typeof value.en === "string");
  }
  ok(`1. projects.${id} has a name`, typeof project.name === "string" && project.name.length > 0);
}

/* ---------- 9. referenced local media exists ---------- */

const isExternal = (url) => /^(https?:|mailto:|tel:|#)/i.test(url);
for (const [slug, project] of Object.entries(details)) {
  for (const asset of [project.image, ...(project.gallery || [])]) {
    if (!asset || isExternal(asset)) continue;
    ok(`9. ${slug}: asset exists on disk — ${asset}`, existsSync(join(ROOT, decodeURIComponent(asset))));
  }
}

/* ---------- 10. links have a valid shape and local targets resolve ---------- */

for (const [slug, project] of Object.entries(details)) {
  ok(`10. ${slug}: links is an array`, Array.isArray(project.links));
  for (const link of project.links || []) {
    ok(`10. ${slug}: link has a url`, typeof link.url === "string" && link.url.length > 0);
    if (isExternal(link.url)) {
      /* Shape only — external URLs are never fetched during QA. */
      ok(`10. ${slug}: external link is https — ${link.url}`, /^https:\/\/[^\s]+$/.test(link.url) || /^mailto:/.test(link.url));
      continue;
    }
    const target = link.url.split("#")[0].split("?")[0];
    if (!target) continue;
    ok(`10. ${slug}: local link target exists — ${target}`, existsSync(join(ROOT, decodeURIComponent(target))));
  }
}

for (const [id, project] of Object.entries(projects)) {
  for (const [role, url] of Object.entries(project.links || {})) {
    if (isExternal(url)) continue;
    const target = url.split("#")[0].split("?")[0];
    ok(`10. projects.${id}.links.${role} target exists — ${target}`, existsSync(join(ROOT, decodeURIComponent(target))));
  }
}

/* ---------- 11/12/13. consumer selections resolve ---------- */

/* Recruiter Mode evidence lists reference flagship project ids. */
const recruiterProfiles = registry.recruiterProfiles || {};
ok("13. recruiter profiles exist", Object.keys(recruiterProfiles).length > 0);
for (const [role, profile] of Object.entries(recruiterProfiles)) {
  for (const id of profile.evidence || []) {
    ok(`13. recruiter "${role}" evidence resolves: ${id}`, Boolean(projects[id]));
  }
}

/* Homepage / Works / Ajoop reference flagship ids from portfolio-v2.js. */
const v2 = read("portfolio-v2.js");
const referencedIds = new Set(
  [...v2.matchAll(/\bp\.([a-zA-Z][a-zA-Z0-9]*)\b/g)].map((m) => m[1]).filter((id) => id in projects),
);
ok("11/12. portfolio-v2.js references at least one flagship project", referencedIds.size > 0);
for (const id of referencedIds) {
  ok(`11/12. portfolio-v2.js project reference resolves: ${id}`, Boolean(projects[id]));
}

/* A flagship project whose caseStudy points at a project detail route must
 * resolve, in either the canonical or the legacy URL shape. */
for (const [id, project] of Object.entries(projects)) {
  const href = (project.links && project.links.caseStudy) || "";
  const match =
    href.match(/^projects\/([^/]+)\/$/) ||
    href.match(/project-detail\.html\?project=([^&]+)$/);
  if (!match) continue;
  const slug = decodeURIComponent(match[1]);
  ok(`12. projects.${id} caseStudy slug resolves: ${slug}`, Boolean(details[slug]));
  ok(
    `12. projects.${id} caseStudy uses the canonical route`,
    href.startsWith("projects/"),
  );
}

/* ---------- 14. categories resolve ---------- */

const detailCategories = new Set(Object.values(details).map((p) => p.category.en));
ok("14. detail categories are non-empty", detailCategories.size > 0);
for (const [slug, project] of Object.entries(details)) {
  ok(
    `14. ${slug}: category has both languages`,
    project.category && project.category.en && project.category.tr,
  );
}
for (const [id, project] of Object.entries(projects)) {
  ok(
    `14. projects.${id}: category has both languages`,
    project.category && project.category.en && project.category.tr,
  );
}

/* ---------- cross-source fact agreement ---------- */

/* A flagship project linked to a detail record must not disagree about the
 * title. The title itself is derived by the composer, so this asserts the
 * derivation actually happened rather than a copy being reintroduced. */
const sourceProjects = readJson("data/portfolio/projects.json");
for (const [id, project] of Object.entries(sourceProjects)) {
  if (!("detailSlug" in project)) continue;
  const slug = project.detailSlug;
  ok(`15. projects.${id}.detailSlug resolves: ${slug}`, Boolean(sourceDetails[slug]));
  ok(
    `15. projects.${id} does not store a duplicate name`,
    !("name" in project),
  );
  check(
    `15. projects.${id}.name is projected from ${slug}.title.en`,
    projects[id] && projects[id].name,
    sourceDetails[slug] && sourceDetails[slug].title.en,
  );
}

/* Shared link URLs must agree between a flagship record and its detail record. */
for (const [id, project] of Object.entries(sourceProjects)) {
  if (!("detailSlug" in project)) continue;
  const detailUrls = new Set((sourceDetails[project.detailSlug].links || []).map((l) => l.url));
  /* A caseStudy link pointing at the project's own detail page is a
   * self-reference, not a shared fact, so it has no counterpart to agree with.
   * Both the canonical route and the legacy query URL are accepted. */
  const ownDetailRoutes = new Set([
    `projects/${project.detailSlug}/`,
    `project-detail.html?project=${project.detailSlug}`,
  ]);
  for (const [role, url] of Object.entries(project.links || {})) {
    if (role === "caseStudy" && ownDetailRoutes.has(url)) continue;
    ok(
      `15. projects.${id}.links.${role} agrees with ${project.detailSlug} — ${url}`,
      detailUrls.has(url),
    );
  }
}

/* ---------- drift guard: project facts must not return to runtime files ---------- */

const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* Every shipped runtime module, so project facts cannot reappear in any of
 * them. BRIEF 03 split legacy-script.js into js/**; the stub is included so a
 * regression that revives it is caught too. */
const RUNTIME_FILES = [
  "legacy-script.js",
  "portfolio-v2.js",
  "js/core/shell.js",
  "js/core/theme.js",
  "js/core/media.js",
  "js/core/i18n.js",
  "js/portfolio/routing.js",
  "js/portfolio/project-detail.js",
  "js/portfolio/works.js",
  "js/ajoop/matcher.js",
  "js/ajoop/assistant.js",
  "js/features/ultimate.js",
  "js/features/recruiter.js",
  "js/features/command-palette.js",
  "js/features/ajoop-nav.js",
  "js/features/creative.js",
  "js/features/certificates.js",
  "js/request/submission.js",
  "js/request/form.js",
  "js/pages/games.js",
];

for (const file of RUNTIME_FILES) {
  const code = stripComments(read(file));
  ok(
    `drift: ${file} does not redeclare projectDetailData as a literal`,
    !/const\s+projectDetailData\s*=\s*\{\s*["']/.test(code),
  );
  ok(
    `drift: ${file} does not reintroduce githubRepositoryProjectDetails`,
    !/githubRepositoryProjectDetails/.test(code),
  );
  /* A large object literal keyed by slug-like strings is how the old data
   * looked. Flag anything similar so new project facts cannot creep back. */
  const slugKeyed = (code.match(/^\s{2}"[a-z0-9]+(?:-[a-z0-9]+){2,}":\s*\{/gm) || []).length;
  ok(
    `drift: ${file} holds no slug-keyed project literal (found ${slugKeyed})`,
    slugKeyed === 0,
  );
}

check(
  "drift: the routing module carries a projection, not an inline catalog",
  runtime.split(/\r?\n/).length < 200,
  true,
);

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Project data: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(
  `Project data catalog passed. ${passed} assertions · ${detailSlugs.length} detail records · ${Object.keys(projects).length} flagship projects.`,
);
