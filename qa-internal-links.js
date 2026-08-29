/**
 * Deterministic internal-link validation.
 *
 * External availability is intentionally out of scope here: social sites block
 * bots and rate-limit, so remote failures must not gate a merge. Everything
 * checked below is fully determined by the contents of this repository.
 */
const fs = require("fs");
const vm = require("vm");

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (file) => fs.readFileSync(file, "utf8");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(read("portfolio-data.js"), sandbox, { filename: "portfolio-data.js" });
const registry = sandbox.window.KAAN_PORTFOLIO;
const roles = Object.keys(registry.recruiterProfiles);

// Project slugs the dynamic archive route can actually resolve.
// These were scraped out of legacy-script.js until BRIEF 01 moved the detail
// records into data/portfolio/project-details.json; they now come from the
// generated registry, which is the same object the runtime resolves against.
const slugs = new Set(Object.keys(registry.projectDetails));

const htmlFiles = fs.readdirSync(".").filter((file) => file.endsWith(".html"));
const idsByFile = {};
htmlFiles.forEach((file) => {
  idsByFile[file] = new Set(
    [...read(file).matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
  );
});

let checked = 0;
let roleLinks = 0;
let projectLinks = 0;

htmlFiles.forEach((file) => {
  const references = [...read(file).matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  references.forEach((reference) => {
    if (/^(https?:|mailto:|tel:|data:|javascript:|#)/.test(reference)) return;
    checked += 1;

    const [pathAndQuery, fragment] = reference.split("#");
    const [path, query] = pathAndQuery.split("?");
    const target = path || file;

    if (!fs.existsSync(decodeURIComponent(target))) {
      failures.push(`${file} -> missing target: ${reference}`);
      return;
    }

    if (fragment && target.endsWith(".html") && idsByFile[target]) {
      check(idsByFile[target].has(fragment), `${file} -> dead anchor: ${reference}`);
    }

    // Canonical project route since BRIEF 02: /projects/<slug>/. The directory
    // existing is not enough — it must be a known slug with a generated page.
    const canonicalProject = target.match(/^projects\/([^/]+)\/$/);
    if (canonicalProject) {
      projectLinks += 1;
      const slug = decodeURIComponent(canonicalProject[1]);
      check(slugs.has(slug), `${file} -> unknown project slug: ${reference}`);
      check(
        fs.existsSync(`projects/${slug}/index.html`),
        `${file} -> project route has no generated page: ${reference}`
      );
    }

    if (!query) return;
    const params = new URLSearchParams(query);
    if (params.has("role")) {
      roleLinks += 1;
      check(roles.includes(params.get("role")), `${file} -> unknown recruiter role: ${reference}`);
    }
    if (params.has("project")) {
      projectLinks += 1;
      check(slugs.has(params.get("project")), `${file} -> unknown project slug: ${reference}`);
    }
  });
});

// Footer home links and flagship case-study routes must always resolve.
htmlFiles.forEach((file) => {
  const footer = (read(file).match(/<footer[\s\S]*?<\/footer>/) || [])[0];
  if (!footer) return;
  const brand = footer.match(/<a[^>]*class="footer-brand"[^>]*href="([^"]+)"/) ||
    footer.match(/<a[^>]*href="([^"]+)"[^>]*class="footer-brand"/);
  check(brand, `${file} -> footer brand link is missing`);
  if (brand) check(fs.existsSync(brand[1]), `${file} -> footer brand link does not resolve: ${brand[1]}`);
});

Object.values(registry.projects).forEach((project) => {
  Object.entries(project.links || {}).forEach(([name, url]) => {
    if (/^https?:/.test(url)) return;
    const path = url.split("?")[0].split("#")[0];
    check(fs.existsSync(path), `registry project ${project.id}.${name} does not resolve: ${url}`);
  });
});

if (failures.length) {
  console.error(`Internal link check failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Internal link check passed.");
console.log(`${checked} internal references · ${roleLinks} role deep links · ${projectLinks} project links · ${slugs.size} known slugs`);
