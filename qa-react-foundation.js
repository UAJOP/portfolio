/**
 * Deterministic guard for the React migration foundation (#23).
 *
 * Two jobs, both fully decided by the repository so this can never flake:
 *
 *  1. Prove the React build really pre-renders. A build that emits an empty
 *     <div id="root"></div> is not pre-rendering, and would silently give up the
 *     crawlability the portfolio depends on. Every assertion here is written to
 *     fail in that case.
 *  2. Prove the React build stays isolated from production, and that the
 *     preview's copy of the profile truth has not drifted from the canonical
 *     registry in `portfolio-data.js`.
 *
 * Run after `npm run build:react`; CI does exactly that.
 *
 * Deliberately hash-independent: bundle filenames are content-hashed, so assets
 * are matched by extension, never by name.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");
const exists = (file) => fs.existsSync(path.join(__dirname, file));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const OUT_DIR = "dist-react";
const BASE = "/react-preview/";

// --- Build output exists ----------------------------------------------------
if (!exists(OUT_DIR)) {
  console.error("React foundation check failed:");
  console.error(`- ${OUT_DIR}/ is missing; run "npm run build:react" first`);
  process.exit(1);
}

// Each entry is one pre-rendered route: the emitted file, the heading that must
// appear in the HTML before any JavaScript runs, and its expected <title>.
const prerenderedRoutes = [
  {
    file: `${OUT_DIR}/index.html`,
    route: BASE,
    heading: "React migration foundation",
    title: "React migration foundation | Kaan Balcı engineering preview",
  },
  {
    file: `${OUT_DIR}/about/index.html`,
    route: `${BASE}about`,
    heading: "How the migration proceeds",
    title: "Migration approach | Kaan Balcı engineering preview",
  },
  {
    file: `${OUT_DIR}/404.html`,
    route: "unmatched preview path",
    heading: "Preview route not found",
    title: "Preview route not found | Kaan Balcı engineering preview",
  },
];

const assetDir = path.join(__dirname, OUT_DIR, "assets");
const assetFiles = fs.existsSync(assetDir) ? fs.readdirSync(assetDir) : [];
const scriptBundles = assetFiles.filter((file) => file.endsWith(".js"));
const styleBundles = assetFiles.filter((file) => file.endsWith(".css"));

check(scriptBundles.length >= 1, "React build produced no JavaScript bundle");
check(styleBundles.length >= 1, "React build produced no CSS bundle");

// --- Canonical truth, loaded from the real registry -------------------------
// The preview keeps a temporary parity fixture. Reading the registry here is
// what stops that fixture from quietly becoming a second source of truth.
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(read("portfolio-data.js"), sandbox, { filename: "portfolio-data.js" });
const registry = sandbox.window.KAAN_PORTFOLIO;

const canonicalTitle = registry?.profile?.primaryTitle?.en || "";
const canonicalBackground = registry?.profile?.backgroundTitle?.en || "";
const canonicalTagline = registry?.profile?.footerTagline?.en || "";
const canonicalSocials = Object.entries(registry?.profile?.socials || {});

check(canonicalTitle === "Forward Deployed Engineer", "registry primaryTitle is no longer Forward Deployed Engineer");
check(canonicalSocials.length === 5, "registry must still define the five canonical social destinations");

// --- Pre-render proof -------------------------------------------------------
const seenTitles = new Set();

prerenderedRoutes.forEach(({ file, route, heading, title }) => {
  if (!exists(file)) {
    failures.push(`pre-rendered route is missing: ${file} (${route})`);
    return;
  }

  const html = read(file);
  const rootMatch = html.match(/<div id="root"[^>]*>([\s\S]*?)<\/body>/);
  const rendered = rootMatch ? rootMatch[1] : "";

  // The core assertion of this whole pass: content before JavaScript.
  check(
    html.includes('data-prerendered="true"'),
    `${file} is not marked as pre-rendered, so the client would re-render instead of hydrating`,
  );
  check(!/<div id="root"><\/div>/.test(html), `${file} ships an empty root container instead of pre-rendered HTML`);
  check(rendered.length > 1000, `${file} holds only ${rendered.length} B inside #root; that is not a real render`);
  check(html.includes(`<h1>${heading}</h1>`), `${file} does not pre-render its heading: ${heading}`);

  // Semantics have to survive the build, not merely appear at runtime.
  check(/<header\b/.test(html), `${file} pre-rendered HTML is missing a header landmark`);
  check(/<nav\b/.test(html), `${file} pre-rendered HTML is missing a nav landmark`);
  check(/<main\b/.test(html), `${file} pre-rendered HTML is missing a main landmark`);
  check(/<footer\b/.test(html), `${file} pre-rendered HTML is missing a footer landmark`);
  check(!/role="button"/.test(html), `${file} uses a simulated button role instead of a real button`);
  check(!/href="#"/.test(html), `${file} contains a placeholder link`);

  // Metadata every migrated page will eventually need for real.
  check(html.includes(`<title>${title}</title>`), `${file} does not carry its route title: ${title}`);
  check(/<meta name="description" content="[^"]{40,}"/.test(html), `${file} is missing a real meta description`);
  check(
    /<meta name="robots" content="noindex, nofollow"/.test(html),
    `${file} must stay noindex; the preview is not a public page`,
  );
  seenTitles.add((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);

  // Bundles are referenced under the preview base, never from the site root.
  check(
    new RegExp(`src="${escapeRegExp(BASE)}assets/[^"]+\\.js"`).test(html),
    `${file} does not load its JavaScript bundle from ${BASE}`,
  );

  // Canonical truth actually rendered into the output.
  //
  // These match the specific elements that carry the titles, not the page as a
  // whole. A substring search over the document would pass on the tagline alone
  // ("Forward Deployed Engineer building reliable AI systems...") and would
  // therefore not notice an invented job title in the header.
  check(
    html.includes(`<p class="rf-title">${canonicalTitle}</p>`),
    `${file} does not render the canonical primary title in the header`,
  );
  check(
    html.includes(`<p class="rf-background">${canonicalBackground.replace(/&/g, "&amp;")}</p>`),
    `${file} does not render the canonical background title in the header`,
  );
  check(html.includes(canonicalTagline), `${file} does not render the canonical footer positioning copy`);

  canonicalSocials.forEach(([platform, url]) => {
    const pattern = new RegExp(`href="${escapeRegExp(url)}"`, "g");
    const occurrences = (html.match(pattern) || []).length;
    check(occurrences === 1, `${file} must link ${platform} exactly once with the canonical URL (found ${occurrences})`);
  });

  const externalLinks = [...html.matchAll(/<a\b([^>]*href="https?:[^"]*"[^>]*)>/g)].map((match) => match[1]);
  externalLinks.forEach((attrs) => {
    const href = (attrs.match(/href="([^"]*)"/) || [])[1];
    check(canonicalSocials.some(([, url]) => url === href), `${file} links a non-canonical external URL: ${href}`);
    check(/rel="[^"]*noopener/.test(attrs), `${file} external link must set rel="noopener": ${href}`);
  });
});

check(seenTitles.size === prerenderedRoutes.length, "each pre-rendered route must have its own <title>");

// --- Parity fixture ---------------------------------------------------------
const fixture = "src/react/data/foundation.js";
check(exists(fixture), `${fixture} is missing`);
if (exists(fixture)) {
  const source = read(fixture);
  // Field-scoped, for the same reason as above: the tagline also contains the
  // primary title, so a whole-file search cannot detect an invented one.
  check(
    source.includes(`primaryTitle: "${canonicalTitle}"`),
    `${fixture} has drifted from the canonical primary title`,
  );
  check(
    source.includes(`backgroundTitle: "${canonicalBackground}"`),
    `${fixture} has drifted from the canonical background title`,
  );
  check(source.includes(canonicalTagline), `${fixture} has drifted from the canonical footer positioning copy`);
  canonicalSocials.forEach(([platform, url]) => {
    check(source.includes(url), `${fixture} has drifted from the canonical ${platform} URL`);
  });
  check(
    source.includes("NOT a production source of truth"),
    `${fixture} must stay explicitly marked as a temporary migration fixture`,
  );
}

// --- Production isolation ---------------------------------------------------
// The single most important property of this pass: the live site is untouched.
const productionPages = [
  "index.html",
  "about.html",
  "works.html",
  "games.html",
  "labs.html",
  "404.html",
  "sinama-case-study.html",
  "merge-rush-case-study.html",
];

productionPages.forEach((page) => {
  check(exists(page), `production page was removed: ${page}`);
  if (!exists(page)) return;
  const source = read(page);
  check(source.includes('src="script.js"'), `${page} no longer boots the production runtime`);
  check(!source.includes(OUT_DIR), `${page} must not reference the React build output`);
  check(!source.includes("react-preview"), `${page} must not link the React preview`);
  check(!/<script[^>]+type="module"/.test(source), `${page} must not load a module bundle; production has no build step`);
});

["portfolio-data.js", "portfolio-v2.js", "legacy-script.js", "script.js", "style.css", "portfolio-v2.css"].forEach(
  (file) => {
    check(exists(file), `production runtime file was removed: ${file}`);
    if (exists(file)) check(!read(file).includes("react-preview"), `${file} must not reference the React preview`);
  },
);

// The preview must not be discoverable from any public surface.
check(!read("sitemap.xml").includes("react-preview"), "the React preview must stay out of sitemap.xml");
check(!read("robots.txt").includes("react-preview"), "robots.txt must not advertise the React preview");

// Build output must be git-ignored, so GitHub Pages can never publish it.
const gitignoreLines = read(".gitignore").split(/\r?\n/);
check(gitignoreLines.includes(OUT_DIR), `${OUT_DIR} must be git-ignored so Pages cannot serve the preview`);
check(gitignoreLines.includes(".react-ssr-tmp"), "the temporary server bundle directory must be git-ignored");

// The Vite config must keep pointing away from the production root.
const viteConfig = read("vite.config.mjs");
check(viteConfig.includes('REACT_OUT_DIR = path.join(here, "dist-react")'), "Vite must build into dist-react/");
check(viteConfig.includes('REACT_BASE = "/react-preview/"'), "the preview must stay mounted under /react-preview/");
check(viteConfig.includes('REACT_ROOT = path.join(here, "src", "react")'), "the Vite root must stay src/react/");
check(!exists("react-preview.html"), "the preview entry must not live at the production root");
check(!exists(`${OUT_DIR}/script.js`), "the React build must never emit a file named like the production bootloader");

// --- Toolchain reproducibility ----------------------------------------------
const manifest = JSON.parse(read("package.json"));
const pinned = /^\d+\.\d+\.\d+$/;

["react", "react-dom", "react-router-dom"].forEach((name) => {
  const version = manifest.dependencies?.[name];
  check(Boolean(version), `${name} must be declared as a dependency`);
  if (version) check(pinned.test(version), `${name} must be pinned exactly, found "${version}"`);
});

["vite", "@vitejs/plugin-react"].forEach((name) => {
  const version = manifest.devDependencies?.[name];
  check(Boolean(version), `${name} must be declared as a devDependency`);
  if (version) check(pinned.test(version), `${name} must be pinned exactly, found "${version}"`);
});

// The React scripts must not have displaced the existing QA pipeline.
["qa", "qa:js", "qa:portfolio", "qa:assets", "qa:links", "qa:html", "qa:spelling", "qa:a11y", "qa:lighthouse"].forEach(
  (script) => {
    check(Boolean(manifest.scripts?.[script]), `existing QA script must be preserved: ${script}`);
  },
);
check(
  manifest.scripts?.["build:react"] === "node scripts/prerender-react.mjs",
  "build:react must run the pre-render pipeline",
);
check(manifest.scripts?.["qa:react"] === "node qa-react-foundation.js", "qa:react must run this guard");
check(!/react/.test(manifest.scripts?.qa || ""), "the React build must not be folded into the static-site qa command");

// Pa11y and Lighthouse must keep auditing the production pages, not the preview.
// The preview gets its own separate accessibility config so it adds coverage
// instead of displacing any.
const pa11yUrls = JSON.parse(read(".pa11yci")).urls || [];
const lighthouseUrls = JSON.parse(read("lighthouserc.json")).ci?.collect?.url || [];
check(pa11yUrls.length === 11, `Pa11y must keep auditing all 11 production pages (found ${pa11yUrls.length})`);
check(lighthouseUrls.length === 11, `Lighthouse must keep auditing all 11 production pages (found ${lighthouseUrls.length})`);
check(!pa11yUrls.some((url) => url.includes("react")), "Pa11y production coverage must not be replaced by preview URLs");
check(
  !lighthouseUrls.some((url) => url.includes("react")),
  "Lighthouse production coverage must not be replaced by preview URLs",
);

check(exists(".pa11yci-react"), "the preview needs its own accessibility config so it does not displace production coverage");
if (exists(".pa11yci-react")) {
  const previewA11yUrls = JSON.parse(read(".pa11yci-react")).urls || [];
  check(
    previewA11yUrls.length === prerenderedRoutes.length,
    `preview accessibility config must cover all ${prerenderedRoutes.length} preview routes (found ${previewA11yUrls.length})`,
  );
  check(
    previewA11yUrls.every((url) => url.includes(BASE)),
    "preview accessibility config must only target preview routes",
  );
  check(
    manifest.scripts?.["qa:a11y:react"] === "pa11y-ci --config .pa11yci-react",
    "qa:a11y:react must run the preview accessibility config",
  );
  check(manifest.scripts?.["qa:a11y"] === "pa11y-ci --config .pa11yci", "the production accessibility script must be unchanged");
}

if (failures.length) {
  console.error(`React foundation check failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("React foundation check passed.");
console.log(
  `${prerenderedRoutes.length} pre-rendered routes · ${scriptBundles.length} JS bundle(s) · ${styleBundles.length} CSS bundle(s) · production isolation verified`,
);
