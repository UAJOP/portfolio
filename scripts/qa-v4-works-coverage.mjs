/* V4-E06.5 — coverage gate for the GitHub / Works / case-study catalog.
 *
 *   npm run qa:v4:works-coverage
 *
 * Checks the canonical data, and the built site in dist-site/ when it exists
 * (run `npm run build:site` first for the full set). It answers one question:
 * does every repository have an explicit, truthful place, and does nothing
 * private or stale reach a public page?
 *
 * It does not call GitHub. The list of repositories is the audited list in
 * data/portfolio/catalog.json; docs/v4-e06-5-github-works-coverage.md records
 * how that list was taken and what was read in each. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = path.join(ROOT, "dist-site");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

let passed = 0;
const failures = [];
function ok(name, condition, detail = "") {
  if (condition) passed += 1;
  else failures.push(detail ? `${name} — ${detail}` : name);
}

const catalog = readJson("data/portfolio/catalog.json");
const details = readJson("data/portfolio/project-details.json");
const projects = readJson("data/portfolio/projects.json");
const routes = readJson("data/site/routes.json").pages;
const routeSet = new Set(routes.map((page) => `/${page.route}`));
const identities = new Map(catalog.identities.map((identity) => [identity.id, identity]));
const collections = new Map((catalog.collections || []).map((collection) => [collection.id, collection]));
const members = [...collections.values()].flatMap((collection) => collection.members);
const repoNames = new Set(catalog.repositories.map((entry) => entry.repo));
const EXPECTED_REPOSITORIES = 32;

/* ---------- 1. every repository has exactly one disposition ---------- */
ok("1. the audit lists every repository", catalog.repositories.length === EXPECTED_REPOSITORIES, `${catalog.repositories.length} of ${EXPECTED_REPOSITORIES}`);
ok("1. no repository is listed twice", new Set(catalog.repositories.map((entry) => entry.repo.toLowerCase())).size === catalog.repositories.length);
for (const entry of catalog.repositories) {
  ok(`1. ${entry.repo}: disposition is one of the enum`, catalog.dispositions.includes(entry.disposition), entry.disposition);
  ok(`1. ${entry.repo}: visibility is stated`, ["public", "private"].includes(entry.visibility));
  ok(`1. ${entry.repo}: the decision is explained`, typeof entry.reason === "string" && entry.reason.length > 20);
  ok(`1. ${entry.repo}: maps to a known identity or to none`, entry.identity === null || identities.has(entry.identity), String(entry.identity));
  ok(`1. ${entry.repo}: its collection, if any, exists`, entry.collection === undefined || collections.has(entry.collection), String(entry.collection));
  ok(`1. ${entry.repo}: is a project or a collection member, never both`, !(entry.identity && entry.collection));
  if (entry.disposition === "exclude") ok(`1. ${entry.repo}: an excluded repository is not represented`, entry.identity === null && entry.collection === undefined);
  if (entry.disposition === "learning") ok(`1. ${entry.repo}: a learning repository is not a standalone project`, entry.identity === null);
  if (entry.disposition === "superseded") {
    ok(`1. ${entry.repo}: a superseded repository is not a standalone project`, entry.identity === null);
    ok(`1. ${entry.repo}: and names what stands in its place`, identities.has(entry.supersededBy) || repoNames.has(entry.duplicateOf), String(entry.supersededBy || entry.duplicateOf));
  }
  if (entry.visibility === "private" && entry.identity) ok(`1. ${entry.repo}: a private source is represented only by a public product`, ["live", "playable"].includes(identities.get(entry.identity).status));
}

/* ---------- 1b. auditing a repository does not make it a project ---------- */
const NOT_A_PROJECT = ["learning", "unfinished", "privateArchive", "superseded"];
for (const identity of catalog.identities) {
  ok(`1b. ${identity.id}: a standalone identity is not a learning, incomplete, private-archive or superseded artifact`, !NOT_A_PROJECT.includes(identity.status) && identity.kind !== "collection", identity.status);
}
ok("1b. collection members and project identities do not overlap", members.every((member) => !identities.has(member.id)) && new Set(members.map((member) => member.id)).size === members.length);
for (const member of members) {
  if (member.incomplete) {
    ok(`1b. ${member.id}: an incomplete artifact has no page of its own`, member.detailSlug === null && !Object.hasOwn(details, member.id));
    ok(`1b. ${member.id}: and says it is incomplete`, member.status === "unfinished");
  }
  if (member.detailSlug) ok(`1b. ${member.id}: its archive page exists`, Object.hasOwn(details, member.detailSlug));
  if (member.repo === null) ok(`1b. ${member.id}: a member without a public repository has no repository link`, !member.links.github);
}

/* ---------- 2. one canonical identity per public project ---------- */
ok("2. no duplicate canonical id", identities.size === catalog.identities.length);
ok("2. no two identities share a title", new Set(catalog.identities.map((identity) => identity.title.toLowerCase())).size === catalog.identities.length);
const slugOwners = new Map();
for (const identity of catalog.identities) {
  ok(`2. ${identity.id}: group is known`, catalog.groups.includes(identity.group), identity.group);
  ok(`2. ${identity.id}: capabilities are known`, identity.capabilities.every((id) => catalog.capabilities.includes(id)));
  const primary = identity.links.caseStudy || (identity.detailSlug ? `/projects/${identity.detailSlug}/` : null) || identity.links.play;
  ok(`2. ${identity.id}: has a public surface`, Boolean(primary));
  if (identity.detailSlug) {
    ok(`2. ${identity.id}: detail page exists`, Object.hasOwn(details, identity.detailSlug), identity.detailSlug);
    ok(`2. ${identity.id}: detail page belongs to one identity`, !slugOwners.has(identity.detailSlug));
    slugOwners.set(identity.detailSlug, identity.id);
  }
  for (const [kind, target] of Object.entries(identity.links)) {
    if (/^https?:\/\//.test(target)) continue;
    const known = routeSet.has(target) || (target.startsWith("/projects/") && Object.hasOwn(details, target.split("/")[2]));
    ok(`2. ${identity.id}: ${kind} link resolves to a route`, known, target);
  }
  if (identity.tags.includes("playable")) ok(`2. ${identity.id}: a playable project has a Play link`, Boolean(identity.links.play) && routeSet.has(identity.links.play));
  if (identity.tags.includes("case-study")) ok(`2. ${identity.id}: a case-study project has a case study`, Boolean(identity.links.caseStudy));
  if (identity.status === "live") ok(`2. ${identity.id}: Live means a real address`, /^https:\/\//.test(identity.links.live || "") || (identity.kind === "assistant" && routeSet.has(identity.links.play)));
  if (identity.status === "superseded") ok(`2. ${identity.id}: superseded names its successor`, identities.has(identity.supersededBy));
}
for (const member of members) {
  if (!member.detailSlug) continue;
  ok(`2. ${member.id}: archive page belongs to one entry`, !slugOwners.has(member.detailSlug));
  slugOwners.set(member.detailSlug, member.id);
}
for (const slug of Object.keys(details)) ok(`2. project page ${slug} belongs to a catalog identity or a collection member`, slugOwners.has(slug));
for (const relation of catalog.relations) ok(`2. relation ${relation.from} → ${relation.to} joins known identities`, identities.has(relation.from) && identities.has(relation.to));
const playable = catalog.identities.filter((identity) => identity.kind === "browserGame");
ok("2. the four browser games are playable with a case study", playable.length === 4 && playable.every((identity) => identity.links.play && identity.links.caseStudy), playable.map((identity) => identity.id).join(", "));

/* ---------- 3. the private boundary ---------- */
const privateRepos = catalog.repositories.filter((entry) => entry.visibility === "private").map((entry) => entry.repo);
const publicRepos = new Set(catalog.repositories.filter((entry) => entry.visibility === "public").map((entry) => entry.repo.toLowerCase()));
const githubRepo = (url) => /^https:\/\/github\.com\/([^/]+\/[^/#?]+)/i.exec(url)?.[1] || null;
for (const member of members) {
  if (member.links.github) ok(`3. ${member.id}: GitHub link is a public repository`, publicRepos.has(String(githubRepo(member.links.github)).toLowerCase()), member.links.github);
}
for (const identity of catalog.identities) {
  if (identity.repo) ok(`3. ${identity.id}: its repository is public`, publicRepos.has(identity.repo.toLowerCase()), identity.repo);
  if (identity.links.github) ok(`3. ${identity.id}: GitHub link is a public repository`, publicRepos.has(String(githubRepo(identity.links.github)).toLowerCase()), identity.links.github);
}
for (const [slug, record] of Object.entries(details)) {
  for (const link of record.links || []) {
    ok(`3. ${slug}: no placeholder link`, link.url !== "#" && link.url !== "");
    const repo = githubRepo(link.url);
    if (repo) ok(`3. ${slug}: GitHub link is a public repository`, publicRepos.has(repo.toLowerCase()), link.url);
  }
}
/* Addresses and names that must never be published. A slug such as
 * "ic-supply" is a page of ours, so names are matched as repository paths. */
const forbidden = privateRepos.flatMap((repo) => [new RegExp(`github\\.com/${repo.replace("/", "/")}(?![\\w-])`, "i")]);
const forbiddenNames = [/merge-rush-tiny-factory/i, /\bJoydayv2\b/, /\bPorto9\b/, /desktop-tutorial/i, /UAJOP\/ActionPainting/i, /UAJOP\/Joyday\b/i];
const PUBLIC_SOURCES = [
  "data/portfolio/project-details.json", "data/portfolio/projects.json", "data/portfolio/labs.json", "data/portfolio/build-log.json",
  "portfolio-data.js", "i18n-data.js", "sitemap.xml",
  ...["en", "tr", "de", "es", "fr"].map((locale) => `data/i18n/messages/${locale}/common.json`),
];
function scan(label, text) {
  for (const pattern of [...forbidden, ...forbiddenNames]) ok(`3. ${label}: no private repository address or name`, !pattern.test(text), String(pattern));
  ok(`4. ${label}: no stale "Wheather-App"`, !/Wheather/i.test(text));
}
for (const file of PUBLIC_SOURCES) scan(file, read(file));

/* ---------- 4. stale facts ---------- */
ok("4. Weather App is listed under the real repository name", members.find((member) => member.id === "weather-app")?.links.github === "https://github.com/UAJOP/Weather-App");
ok("4. Weather App and Calculator JavaScript have no project record", !Object.hasOwn(details, "weather-app") && !Object.hasOwn(details, "calculator-javascript"));
ok("4. Merge Rush is Playable V1 in the canonical record", projects.mergeRush.status.en === "Playable V1" && projects.mergeRush.links.play === "/merge-rush/");
ok("4. Merge Rush canonical proof has no stale claim", !/restoration stage|footprint|Repair Energy|Active Development/i.test(JSON.stringify(projects.mergeRush)));
ok("4. the Works and Games summaries no longer claim multi-cell logic", !/multi-cell/i.test(read("data/i18n/messages/en/common.json").split("\n").filter((line) => /"mergeRush\.card\./.test(line)).join("\n")));

/* ---------- 5. the old Unity "Ajoop" and AJOOP are not one thing ---------- */
const unity = details["unity-essentials"];
const unityMember = members.find((member) => member.id === "unity-essentials");
ok("5. the Unity project is not titled Ajoop", !/ajoop/i.test(unity.title.en) && Boolean(unityMember) && !/ajoop/i.test(unityMember.title));
ok("5. its page says the old name is unrelated to AJOOP", /historical name/i.test(unity.overview.en) && /AJOOP, the assistant/.test(unity.overview.en));
ok("5. the catalog records the old name as historical, and the project is not an identity beside AJOOP", unityMember?.historicalName === "Ajoop" && !identities.has("unity-essentials"));
ok("5. only the assistant carries the AJOOP identity", catalog.identities.filter((identity) => /^ajoop/i.test(identity.title)).length === 1);

/* ---------- 6. the audited project copy is the copy in the data ---------- */
const truth = spawnSync(process.execPath, [path.join(ROOT, "scripts", "v4-e06-5-project-truth.mjs"), "--check"], { encoding: "utf8" });
ok("6. project records match the source-audited table", truth.status === 0, (truth.stderr || truth.stdout).trim());
ok("6. no project record keeps the shared boilerplate paragraph", !Object.values(details).some((record) => /The goal of this repository is to turn/.test(record.challenge.en)));

/* ---------- 7. the built site ---------- */
if (fs.existsSync(DIST)) {
  const html = (route) => fs.readFileSync(path.join(DIST, route, "index.html"), "utf8");
  const visible = (text) => text.replace(/<script[\s\S]*?<\/script>/g, "");
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  const files = walk(DIST).filter((file) => /\.(html|js|xml|css)$/.test(file) && !file.includes(`${path.sep}assets${path.sep}merge-rush${path.sep}`));
  let leaks = 0;
  let stale = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    if ([...forbidden, ...forbiddenNames].some((pattern) => pattern.test(text))) leaks += 1;
    if (/Wheather/i.test(text)) stale += 1;
  }
  ok(`7. no private repository reaches the built site (${files.length} files)`, leaks === 0, `${leaks} file(s)`);
  ok("7. no built page says Wheather-App", stale === 0, `${stale} file(s)`);

  const works = visible(html("works"));
  const rows = (works.match(/data-catalog-id="/g) || []).length;
  const memberRows = (works.match(/data-catalog-member="/g) || []).length;
  const cards = (works.match(/class="project-card[ "]/g) || []).length;
  ok("7. Works lists every standalone project identity", rows === catalog.identities.length, `${rows} of ${catalog.identities.length}`);
  ok("7. Works lists the learning collection's members as members, not projects", memberRows === members.length, `${memberRows} of ${members.length}`);
  for (const member of members.filter((entry) => entry.incomplete)) {
    const start = works.indexOf(`data-catalog-member="${member.id}"`);
    const row = start === -1 ? "" : works.slice(start, works.indexOf("</li>", start));
    ok(`7. ${member.id}: named without a link to a project page`, row.includes('<span class="v4-catalog__title">') && !row.includes("/projects/"));
    ok(`7. ${member.id}: no page is built for it`, !fs.existsSync(path.join(DIST, "projects", member.id)));
  }
  ok("7. Works stays curated: the catalog is collapsed and the cards are few", cards <= 12 && !/<details[^>]*class="v4-catalog__group"[^>]*open/.test(works), `${cards} cards`);
  ok("7. Works keeps its explorer: grid, System Map and Capability View", /data-v4-explorer/.test(works) && works.includes("v4-explorer__map") && (works.match(/data-v4-mode=/g) || []).length >= 3, `${(works.match(/data-v4-mode=/g) || []).length} modes`);
  ok("7. Works lists the factual relations and the capability evidence", works.includes('id="catalog-relations"') && works.includes('id="catalog-capabilities"'));

  const games = visible(html("games"));
  const nativeCount = catalog.identities.filter((identity) => identity.group === "nativeGames").length;
  ok("7. Games lists the native archive under the browser games", (games.match(/data-catalog-id="/g) || []).length === nativeCount && games.indexOf('id="native-archive"') > games.indexOf("games-featured"));
  for (const identity of playable) {
    const card = new RegExp(`<article[^>]*data-game-link="${identity.links.play}"[\\s\\S]*?</article>`).exec(games)?.[0] || "";
    ok(`7. Games: ${identity.id} offers Play and Case Study`, card.includes(`href="${identity.links.play}"`) && card.includes(`href="${identity.links.caseStudy}"`));
  }
  for (const route of ["works", "games", "merge-rush", "merge-rush-case-study"]) {
    const page = visible(html(route));
    const card = route === "works" || route === "games" ? (/<article[^>]*merge-rush[\s\S]*?<\/article>/.exec(page)?.[0] || "") : page;
    ok(`7. /${route}/ does not call Merge Rush "Active Development"`, !/Active Development/.test(card));
  }
  for (const locale of ["", "tr", "de", "es", "fr"]) {
    for (const route of ["career-adventure-case-study", "portfolio-case-study"]) {
      const file = path.join(DIST, locale, route, "index.html");
      ok(`7. ${locale || "en"}/${route} is built`, fs.existsSync(file) && /<h1[^>]*>[^<]+<\/h1>/.test(fs.readFileSync(file, "utf8")));
    }
  }
  ok("7. the portfolio case study does not claim an owner cockpit exists", /owner cockpit is on the roadmap; it is not built/i.test(visible(html("portfolio-case-study"))));
  const detailPages = Object.keys(details).map((slug) => visible(html(path.join("projects", slug))));
  ok("7. no project page shows the generic impact or process fallback", !detailPages.some((page) => /represents my ability to combine|Clarified the project goal/.test(page)));
  ok("7. no placeholder href on a catalog or project page", ![works, games, ...detailPages].some((page) => /href="#"/.test(page)));
} else {
  console.log("dist-site/ not found: built-site checks skipped (run npm run build:site).");
}

if (failures.length) {
  console.error(`Works coverage: ${failures.length} failure(s), ${passed} passed.`);
  for (const failure of failures) console.error(`  x ${failure}`);
  process.exit(1);
}
const totals = Object.fromEntries(catalog.dispositions.map((disposition) => [disposition, catalog.repositories.filter((entry) => entry.disposition === disposition).length]));
console.log(`Works coverage: ${passed} checks passed · ${catalog.repositories.length}/${EXPECTED_REPOSITORIES} repositories · ${catalog.identities.length} standalone project identities · ${collections.size} collection of ${members.length} learning artifacts · ${JSON.stringify(totals)}`);
