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
    heading: "The design system behind the next portfolio.",
    title: "V3 design system | Kaan Balcı engineering preview",
  },
  {
    file: `${OUT_DIR}/about/index.html`,
    route: `${BASE}about`,
    heading: "How the system is built",
    title: "System principles | Kaan Balcı engineering preview",
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
  // Attribute-tolerant: the V3 heading carries design-system classes, but the
  // text still has to be in the file before any JavaScript runs.
  check(
    new RegExp(`<h1[^>]*>${escapeRegExp(heading)}</h1>`).test(html),
    `${file} does not pre-render its heading: ${heading}`,
  );

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
    html.includes(`<span class="v3-brand-title">${canonicalTitle}</span>`),
    `${file} does not render the canonical primary title in the header`,
  );
  check(html.includes(canonicalTagline), `${file} does not render the canonical footer positioning copy`);

  // The exactly-once rule belongs to the FOOTER, which has a fixed contract of
  // five destinations. A page body may legitimately link a canonical
  // destination as well, so scoping this to the footer keeps the real invariant
  // without forbidding an ordinary call to action.
  const footer = (html.match(/<footer[\s\S]*?<\/footer>/) || [])[0] || "";
  check(Boolean(footer), `${file} must render the site footer`);
  canonicalSocials.forEach(([platform, url]) => {
    const pattern = new RegExp(`href="${escapeRegExp(url)}"`, "g");
    const occurrences = (footer.match(pattern) || []).length;
    check(
      occurrences === 1,
      `${file} footer must link ${platform} exactly once with the canonical URL (found ${occurrences})`,
    );
  });

  const externalLinks = [...html.matchAll(/<a\b([^>]*href="https?:[^"]*"[^>]*)>/g)].map((match) => match[1]);
  externalLinks.forEach((attrs) => {
    const href = (attrs.match(/href="([^"]*)"/) || [])[1];
    check(canonicalSocials.some(([, url]) => url === href), `${file} links a non-canonical external URL: ${href}`);
    check(/rel="[^"]*noopener/.test(attrs), `${file} external link must set rel="noopener": ${href}`);
  });
});

check(seenTitles.size === prerenderedRoutes.length, "each pre-rendered route must have its own <title>");

// --- Canonical data, not a fixture ------------------------------------------
// #23 shipped a temporary parity fixture because a Vite module graph could not
// import the browser-global registry. #24 replaced it with real JSON, so the
// fixture must be gone and React must read the canonical files. Drift inside the
// data layer itself is qa-portfolio-data.js's job; this guard only proves the
// React build consumes it and that the output carries the truth.
check(
  !exists("src/react/data/foundation.js"),
  "the temporary #23 parity fixture must be deleted now that React reads canonical JSON",
);

const reactData = "src/react/data/portfolio.js";
check(exists(reactData), `${reactData} is missing`);
if (exists(reactData)) {
  const source = read(reactData);
  check(source.includes("@data/portfolio/"), `${reactData} must import the canonical JSON`);
  check(
    !/\bfetch\s*\(/.test(source),
    `${reactData} must not fetch at runtime; the pre-render step needs this data at build time`,
  );
}

// The background title is registry truth but only appears where a page chooses
// to render it, so it is asserted on the route that does rather than globally.
const homeHtml = exists(prerenderedRoutes[0].file) ? read(prerenderedRoutes[0].file) : "";
check(
  homeHtml.includes(canonicalBackground.replace(/&/g, "&amp;")),
  "the preview home route must render the canonical background title",
);

// --- Shared shell is production-intended ------------------------------------
// The whole point of #24's shell is that #25 can mount real pages in it. That
// only holds while the shell carries no preview assumptions.
const shellFiles = ["SiteShell.jsx", "SiteHeader.jsx", "SiteFooter.jsx"];
shellFiles.forEach((name) => {
  const file = `src/react/components/shell/${name}`;
  check(exists(file), `shared shell component is missing: ${file}`);
  if (!exists(file)) return;
  const source = read(file);
  check(
    !source.includes("react-preview"),
    `${file} must not hard-code the preview base; navigation arrives through props`,
  );
  check(
    !source.includes("PreviewNotice"),
    `${file} must not import preview-only chrome; it is passed in through the banner slot`,
  );
});

check(
  exists("src/react/components/preview/PreviewNotice.jsx"),
  "preview-only chrome must stay outside components/shell/",
);

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
