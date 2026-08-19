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

if (failures.length) {
  console.error(`Portfolio consistency guard failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Portfolio consistency guard passed.");
console.log(`Registry ${registry.version} · ${Object.keys(registry.projects).length} projects · ${Object.keys(registry.recruiterProfiles).length} recruiter profiles · ${registry.buildLog.length} build checkpoints · ${registry.labs.length} labs`);
