const fs = require("fs");
const vm = require("vm");

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (path) => fs.readFileSync(path, "utf8");
const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(read("portfolio-data.js"), sandbox, {
  filename: "portfolio-data.js",
});
const registry = sandbox.window.KAAN_PORTFOLIO;

check(registry, "portfolio-data.js must expose window.KAAN_PORTFOLIO");
check(registry?.version === "2.0.0", "portfolio registry version must remain explicit");
check(/^\d{4}-\d{2}-\d{2}$/.test(registry?.updatedAt || ""), "registry updatedAt must use YYYY-MM-DD");

["sinama", "mergeRush", "joyday", "chatbotFlow", "hospital"].forEach((id) => {
  check(registry?.projects?.[id], `missing registry project: ${id}`);
});

["applied-ai", "solution-engineering", "software", "game"].forEach((id) => {
  check(registry?.recruiterProfiles?.[id], `missing recruiter profile: ${id}`);
  check((registry?.recruiterProfiles?.[id]?.evidence || []).length >= 2, `recruiter profile ${id} needs at least two evidence links`);
});

// --- Canonical career identity ---------------------------------------------
// Recruiter URLs are evidence-focus views, not separate target identities.
const canonicalTargetTitle = "Forward Deployed Engineer";
check(registry?.profile?.primaryTitle?.en === canonicalTargetTitle, "canonical EN primary target title must be Forward Deployed Engineer");
check(registry?.profile?.primaryTitle?.tr === canonicalTargetTitle, "canonical TR primary target title must be Forward Deployed Engineer");
check(registry?.profile?.backgroundTitle?.en === "AI Designer & Software Developer", "professional background title must remain explicit and separate from the primary target");

Object.entries(registry?.recruiterProfiles || {}).forEach(([id, profile]) => {
  check(!Object.prototype.hasOwnProperty.call(profile, "primaryTitle"), `recruiter focus ${id} must not override the canonical primary title`);
  check(!Object.prototype.hasOwnProperty.call(profile, "profile"), `recruiter focus ${id} must not reintroduce a competing profile title`);
  check(!Object.prototype.hasOwnProperty.call(profile, "roles"), `recruiter focus ${id} must not reintroduce alternate target-role arrays`);
  check(Boolean(profile.focusTitle?.en && profile.focusTitle?.tr), `recruiter focus ${id} needs a bilingual focusTitle`);
  check(Array.isArray(profile.capabilities) && profile.capabilities.length > 0, `recruiter focus ${id} needs capability evidence`);
});

const careerRuntime = read("portfolio-v2.js");
check(/registry\.profile\.primaryTitle/.test(careerRuntime), "Recruiter Mode must render the canonical registry primary title");
check(!/profile\.roles\s*\.map/.test(careerRuntime), "Recruiter Mode must not render alternate target-role chips");
check(!/pick\(profile\.profile/.test(careerRuntime), "Recruiter Mode focus switching must not replace the primary target title");
check(careerRuntime.includes("Kaan is currently positioning primarily as a Forward Deployed Engineer"), "Ajoop EN role-fit answer must identify Forward Deployed Engineer as the primary direction");
check(careerRuntime.includes("Kaan öncelikli olarak Forward Deployed Engineer yönünde konumlanıyor"), "Ajoop TR role-fit answer must identify Forward Deployed Engineer as the primary direction");
check(!/target\.answers\.roles\s*=\s*\{\s*text:\s*\[/.test(careerRuntime), "Ajoop role-fit answer must not randomly omit the canonical primary target");

check((registry?.buildLog || []).length >= 3, "build log needs at least three checkpoints");
check((registry?.labs || []).length >= 3, "Labs needs at least three experiments");
check(registry?.sinamaEvidence?.healthy?.status === "READY", "healthy SINAMA evidence must remain READY");
check(registry?.sinamaEvidence?.broken?.status === "BLOCKED", "broken SINAMA evidence must remain BLOCKED");

check(!fs.existsSync("flagship-copy.js"), "flagship-copy.js must stay retired");
check(fs.existsSync("legacy-script.js"), "legacy-script.js compatibility runtime is missing");

const requiredBootPages = [
  "index.html",
  "works.html",
  "games.html",
  "blog.html",
  "about.html",
  "request.html",
  "single-work.html",
  "404.html",
  "sinama-case-study.html",
  "merge-rush-case-study.html",
  "labs.html",
  "now.html",
  "project-detail.html",
];
requiredBootPages.forEach((file) => {
  const source = read(file);
  /* 404.html loads the bootloader root-absolutely: GitHub Pages serves it at
   * whatever URL failed, so a relative path would resolve against that. */
  check(
    source.includes('src="script.js"') || source.includes('src="/script.js"'),
    `${file} must load the global script bootloader`,
  );
  check(!source.includes("flagship-copy.js"), `${file} still references retired flagship-copy.js`);
});

const index = read("index.html");
[
  "Calculator JS",
  "Weather App",
  "AI workflow demo",
  "Algorithmic 3D lab",
  /* The homepage used to open on a two-flagship framing that led with a game
   * product. The forward-deployed story leads with customer workflow evidence. */
  "Two products define my current engineering direction.",
].forEach((stale) => check(!index.includes(stale), `homepage should not lead with: ${stale}`));
const normalizedIndex = normalizeWhitespace(index);
check(normalizedIndex.includes("Hiring a Forward Deployed Engineer?"), "homepage recruiter CTA must use the canonical target identity");
check(/"jobTitle"\s*:\s*"Forward Deployed Engineer"/.test(index), "homepage structured data must use the canonical current target title");

const games = read("games.html");
check(!games.includes("<h3>Interview Run</h3>"), "Interview Run must not return as an active game card without an explicit product decision");
check(games.includes("Merge Rush: Tiny Factory"), "Games must keep Merge Rush as the active product lead");

const sitemap = read("sitemap.xml");
check(sitemap.includes("/labs.html"), "sitemap must include Labs");
check(sitemap.includes("/now.html"), "sitemap must include Build Log");
check(!sitemap.includes("/project-detail.html"), "noindex dynamic project-detail must stay out of sitemap");

const request = read("request.html");
check(request.includes("no-cors"), "request page must disclose the no-cors confirmation limitation");

const architecture = read("PORTFOLIO_ARCHITECTURE.md");
const normalizedArchitecture = architecture.toLowerCase();
check(normalizedArchitecture.includes("source-of-truth"), "architecture document must keep the source-of-truth rule");
check(normalizedArchitecture.includes("does not claim a live llm"), "architecture document must keep Ajoop scope explicit");

// --- Runtime boot integrity -------------------------------------------------
// The bootloader is the highest-risk part of V2: a page either declares the
// registry + V2 runtime itself, or relies on script.js to inject them. Both
// paths must stay unambiguous and free of duplicate runtime loads.
const runtimeFiles = ["portfolio-data.js", "script.js", "legacy-script.js", "portfolio-v2.js"];
const htmlFiles = fs.readdirSync(".").filter((file) => file.endsWith(".html"));

htmlFiles.forEach((file) => {
  const source = read(file);
  const scriptSrcs = [...source.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);

  runtimeFiles.forEach((runtime) => {
    const occurrences = scriptSrcs.filter((src) => src === runtime).length;
    check(occurrences <= 1, `${file} declares ${runtime} ${occurrences} times (duplicate runtime load)`);
  });

  check(
    !scriptSrcs.includes("legacy-script.js"),
    `${file} must not load legacy-script.js directly; the bootloader owns that execution order`,
  );

  const dataIndex = scriptSrcs.indexOf("portfolio-data.js");
  const bootIndex = scriptSrcs.indexOf("script.js");
  const v2Index = scriptSrcs.indexOf("portfolio-v2.js");

  if (dataIndex !== -1 || v2Index !== -1) {
    // Migrated page: registry before the bootloader, V2 runtime after it.
    check(dataIndex !== -1 && v2Index !== -1, `${file} must declare both portfolio-data.js and portfolio-v2.js, or neither`);
    check(bootIndex !== -1, `${file} must still load script.js between the registry and the V2 runtime`);
    check(dataIndex < bootIndex, `${file} must declare portfolio-data.js before script.js`);
    check(bootIndex < v2Index, `${file} must declare portfolio-v2.js after script.js`);
    check(source.includes("portfolio-v2.css"), `${file} declares the V2 runtime but never links portfolio-v2.css`);
  }

  check((source.match(/portfolio-v2\.css/g) || []).length <= 1, `${file} links portfolio-v2.css more than once`);

  // Unified EN/TR copy must stay paired, otherwise one language silently wins.
  const enCopy = (source.match(/data-pv2-en=/g) || []).length;
  const trCopy = (source.match(/data-pv2-tr=/g) || []).length;
  check(enCopy === trCopy, `${file} has ${enCopy} data-pv2-en vs ${trCopy} data-pv2-tr attributes; unified copy must stay paired`);
});

// --- Dynamic archive route --------------------------------------------------
// BRIEF 03 split the single legacy runtime into modules under js/. These checks
// describe shipped behaviour, so they read the concatenated module sources
// rather than the legacy-script.js compatibility stub.
const legacyRuntime = [
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
]
  .map(read)
  .join("\n");
check(
  !/params\.get\("project"\)\s*\|\|/.test(legacyRuntime),
  "project-detail must not fall back to a hardcoded slug; a missing or unknown project belongs in the not-found state",
);

// --- Command palette targets ------------------------------------------------
// Experiments moved to labs.html in V2, so same-page scroll commands would
// silently no-op on every other page.
check(
  !legacyRuntime.includes('value: "algorithmic-3d-lab"'),
  "the 3D lab command must navigate to labs.html#algorithmic-3d-lab instead of scrolling to a section that no longer exists on most pages",
);
check(read("labs.html").includes('id="algorithmic-3d-lab"'), "labs.html must keep the algorithmic-3d-lab anchor target");
check(
  (registry?.labs || []).some((item) => (item.url || "").includes("algorithmic-3d-lab")),
  "registry Labs must keep the Algorithmic 3D Lab entry that the command palette points at",
);

// --- SINAMA Evidence Explorer -----------------------------------------------
const v2Runtime = read("portfolio-v2.js");
check(
  /sinamaEvidence\[[^\]]+\]\.label/.test(v2Runtime),
  "the Evidence Explorer must read scenario labels from the registry instead of duplicating product truth",
);
["healthy", "broken"].forEach((id) => {
  const conversation = registry?.sinamaEvidence?.[id]?.conversation || [];
  check(conversation.length > 0, `sinamaEvidence.${id} needs conversation turns`);
  check(
    conversation.every((turn) => turn.speaker && typeof turn.speaker === "object" && turn.speaker.en && turn.speaker.tr),
    `sinamaEvidence.${id} speaker names must be bilingual so the explorer is not half-English in TR`,
  );
});

// --- Card and ARIA semantics ------------------------------------------------
// Project/game cards must stay containers with real anchors inside. A card that
// simulates a link (role="link" + tabindex) while containing its own links is
// invalid ARIA, adds a redundant tab stop and makes Enter/Space ambiguous.
const hasNestedAnchors = (source) => {
  const re = /<a\b|<\/a>/g;
  let depth = 0;
  let match;
  while ((match = re.exec(source))) {
    if (match[0] === "</a>") depth = Math.max(0, depth - 1);
    else if (++depth > 1) return true;
  }
  return false;
};

htmlFiles.forEach((file) => {
  const source = read(file);

  check(!hasNestedAnchors(source), `${file} must not nest anchors inside anchors`);

  (source.match(/<div\b[^>]*>/g) || []).forEach((tag) => {
    if (!/\saria-label="/.test(tag) || /\srole="/.test(tag)) return;
    const label = (tag.match(/aria-label="([^"]*)"/) || [])[1];
    check(false, `${file}: <div aria-label="${label}"> has the generic role, which drops the accessible name; give it a role that supports naming`);
  });

  (source.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) || []).forEach((card) => {
    const open = card.match(/^<article\b[^>]*>/)[0];
    if (!/class="[^"]*project-card[^"]*"/.test(open)) return;

    check(!/\srole="link"/.test(open), `${file}: project card must not simulate a link with role="link"`);
    check(!/\stabindex=/.test(open), `${file}: project card must not carry tabindex; its real anchors provide keyboard access`);

    const target = (open.match(/data-(?:project|game)-link="([^"]*)"/) || [])[1];
    if (!target) return;
    // Canonical project route since BRIEF 02. The legacy
    // project-detail.html?project=<slug> URL still resolves, but internal
    // links point at the unique page.
    const expected = target.endsWith(".html") || target.includes(".html?")
      ? target
      : `projects/${encodeURIComponent(target)}/`;
    const titleHref = (card.match(/<h3[^>]*>\s*<a[^>]+href="([^"]*)"/) || [])[1];
    check(titleHref === expected, `${file}: card targeting "${target}" must expose that destination as a real title anchor (found ${titleHref || "none"})`);
  });
});

// Whole-card navigation stays a mouse convenience only: keyboard users move
// through the real anchors, so simulated key handlers must not come back.
const functionBody = (source, name) => {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return "";
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  return "";
};

check(/function shouldIgnoreCardActivation\b/.test(legacyRuntime), "the shared card activation guard is missing");
["setupProjectCardNavigation", "setupGameCards"].forEach((name) => {
  const body = functionBody(legacyRuntime, name);
  check(Boolean(body), `${name} is missing from the legacy runtime`);
  check(!body.includes("keydown"), `${name} must not simulate keyboard activation on cards`);
  check(body.includes("shouldIgnoreCardActivation"), `${name} must route card clicks through the shared activation guard`);
});

// --- Canonical site footer ---------------------------------------------------
// Every public page must render the same footer component. Social URLs live in
// the registry; the HTML keeps static hrefs so the footer still works without
// JavaScript, and this guard is what keeps the two in step.
const canonicalSocials = registry?.profile?.socials || {};
check(Object.keys(canonicalSocials).length === 5, "registry profile.socials must define the five canonical destinations");

const canonicalTagline = registry?.profile?.footerTagline?.en || "";
check(Boolean(canonicalTagline), "registry profile.footerTagline must define the canonical footer positioning copy");
check(canonicalTagline === "Forward Deployed Engineer turning customer workflows into reliable AI systems and shipped software.", "canonical EN footer positioning must reflect the Forward Deployed Engineer target");
check(registry?.profile?.footerTagline?.tr === "Müşteri workflow'larını güvenilir AI sistemlerine ve çalışan yazılım ürünlerine dönüştüren Forward Deployed Engineer.", "canonical TR footer positioning must reflect the Forward Deployed Engineer target");

// Wordings that previously drifted across page families and must not return.
const retiredFooterCopy = [
  "AI Designer &amp; Software Developer building reliable AI systems and product-minded software.",
  "AI Designer &amp; Software Developer building practical AI workflows and software products.",
  "AI Designer &amp; Software Developer building practical AI workflows and scalable software systems.",
  "Forward Deployed Engineer building reliable AI systems and product-minded software.",
];

htmlFiles.forEach((file) => {
  const source = read(file);
  const footer = (source.match(/<footer[\s\S]*?<\/footer>/) || [])[0];
  check(Boolean(footer), `${file} must render the site footer`);
  if (!footer) return;

  const brand = footer.match(/<a[^>]*class="footer-brand"[^>]*>/);
  check(Boolean(brand), `${file} footer must expose the Kaan Balcı brand link`);
  if (brand) check(/href="index\.html"/.test(brand[0]), `${file} footer brand must link back to index.html`);

  const socialAnchors = [...footer.matchAll(/<a\b([^>]*)>/g)]
    .map((match) => match[1])
    .filter((attrs) => /href="https?:/.test(attrs));

  Object.entries(canonicalSocials).forEach(([platform, url]) => {
    const matches = socialAnchors.filter((attrs) => attrs.includes(`href="${url}"`));
    check(matches.length === 1, `${file} footer must link ${platform} exactly once with the canonical URL (found ${matches.length})`);
  });

  socialAnchors.forEach((attrs) => {
    const href = (attrs.match(/href="([^"]*)"/) || [])[1];
    check(Object.values(canonicalSocials).includes(href), `${file} footer links a non-canonical external URL: ${href}`);
    check(/target="_blank"/.test(attrs), `${file} footer external link must open in a new tab: ${href}`);
    check(/rel="[^"]*noopener/.test(attrs), `${file} footer external link must set rel="noopener": ${href}`);
    check(/aria-label="/.test(attrs), `${file} footer icon-only link needs an accessible name: ${href}`);
  });

  check(footer.includes(canonicalTagline.replace(/&/g, "&amp;")), `${file} footer must use the canonical positioning copy`);
  retiredFooterCopy.forEach((stale) => {
    check(!footer.includes(stale), `${file} footer still uses retired positioning copy`);
  });
  check(/All rights reserved/.test(footer), `${file} footer must keep the copyright line`);
});

// --- Portfolio truth freshness ----------------------------------------------
const buildLog = registry?.buildLog || [];
const newestEntry = buildLog.map((entry) => entry.date).sort().pop();
check(registry.updatedAt >= newestEntry, `registry updatedAt (${registry.updatedAt}) is older than the newest build log entry (${newestEntry})`);

const shippedArchitecture = buildLog.find((entry) => /Portfolio Architecture V2$/.test(entry.title?.en || ""));
check(Boolean(shippedArchitecture), "build log must record Portfolio Architecture V2");
if (shippedArchitecture) {
  check(shippedArchitecture.status === "shipped", "Portfolio Architecture V2 has shipped and must not still read as building");
}

const consistencyPass = buildLog.find((entry) => /Consistency, footer and QA hardening/.test(entry.title?.en || ""));
check(Boolean(consistencyPass), "build log must record the consistency, footer and QA hardening pass");
if (consistencyPass) {
  check(consistencyPass.status === "shipped", "the completed consistency, footer and QA hardening pass must be shipped");
  check(/^Standardized\b/.test(normalizeWhitespace(consistencyPass.detail?.en)), "the completed consistency pass must use past-tense EN detail copy");
}

const assetPass = buildLog.find((entry) => /Asset and LCP optimization V1/.test(entry.title?.en || ""));
check(Boolean(assetPass), "build log must record Asset and LCP optimization V1");
if (assetPass) {
  check(assetPass.status === "shipped", "the completed Asset and LCP optimization pass must be shipped");
  check(/^Reduced\b/.test(normalizeWhitespace(assetPass.detail?.en)), "the completed Asset and LCP pass must use past-tense EN detail copy");
}

const buildDates = buildLog.map((entry) => entry.date);
check(
  buildDates.every((date, index) => index === 0 || buildDates[index - 1] >= date),
  "build log entries must stay in descending date order"
);

// --- QA toolchain reproducibility -------------------------------------------
check(fs.existsSync("package-lock.json"), "package-lock.json must be committed so npm ci can reproduce the QA toolchain");
const manifest = JSON.parse(read("package.json"));
Object.entries(manifest.devDependencies || {}).forEach(([name, range]) => {
  check(range !== "latest", `QA dependency ${name} must be pinned, not "latest"`);
});
check(manifest.scripts?.["qa:assets"] === "node qa-assets.js", "package scripts must expose the deterministic asset policy");
check(/qa:assets/.test(manifest.scripts?.qa || ""), "the aggregate QA command must include the asset policy");

const workflow = read(".github/workflows/site-preflight.yml");
check(/npm ci --no-audit --no-fund/.test(workflow), "CI must install with npm ci so the lockfile is honoured");
check(!/npm install --no-audit/.test(workflow), "CI must not fall back to npm install");
check(/name: Check asset performance policy[\s\S]*npm run qa:assets/.test(workflow), "CI must run the blocking asset policy");

// Deterministic checks must stay real gates; only network-dependent steps may
// be report-only.
const workflowSteps = workflow.split(/\n\s*- name: /).slice(1);
const reportOnlyAllowed = ["Run Lighthouse CI"];
workflowSteps.forEach((step) => {
  const name = step.split("\n")[0].trim();
  if (!/continue-on-error:\s*true/.test(step)) return;
  check(reportOnlyAllowed.includes(name), `CI step "${name}" must block; only ${reportOnlyAllowed.join(", ")} may be report-only`);
});


if (failures.length) {
  console.error(`Portfolio consistency guard failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Portfolio consistency guard passed.");
console.log(`Registry ${registry.version} · ${Object.keys(registry.projects).length} projects · ${Object.keys(registry.recruiterProfiles).length} recruiter profiles · ${registry.buildLog.length} build checkpoints · ${registry.labs.length} labs`);
