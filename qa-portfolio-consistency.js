const fs = require("fs");
const vm = require("vm");

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (path) => fs.readFileSync(path, "utf8");

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
  check(source.includes('src="script.js"'), `${file} must load the global script bootloader`);
  check(!source.includes("flagship-copy.js"), `${file} still references retired flagship-copy.js`);
});

const index = read("index.html");
[
  "Calculator JS",
  "Weather App",
  "AI workflow demo",
  "Algorithmic 3D lab",
].forEach((stale) => check(!index.includes(stale), `homepage should not lead with: ${stale}`));

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
const legacyRuntime = read("legacy-script.js");
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
    const expected = target.endsWith(".html") || target.includes(".html?")
      ? target
      : `project-detail.html?project=${encodeURIComponent(target)}`;
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

if (failures.length) {
  console.error(`Portfolio consistency guard failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Portfolio consistency guard passed.");
console.log(`Registry ${registry.version} · ${Object.keys(registry.projects).length} projects · ${Object.keys(registry.recruiterProfiles).length} recruiter profiles · ${registry.buildLog.length} build checkpoints · ${registry.labs.length} labs`);
