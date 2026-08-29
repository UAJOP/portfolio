#!/usr/bin/env node
/**
 * qa-recruiter-ux.mjs — guards the recruiter conversion contracts (BRIEF 05).
 *
 * Static checks cannot prove conversion. What they can prove is that the
 * recruiter path is not silently broken: the primary CTA resolves, the CV and
 * contact are reachable, every recruiter-selected project exists in canonical
 * data, role labels are present and bilingual, and the session-scoped recruiter
 * intent helper behaves.
 *
 * Node built-ins only. Validates; never writes.
 *
 *   node scripts/qa-recruiter-ux.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (actual === expected) { passed += 1; return; }
  failures.push(`${label}\n      expected: ${expected}\n      actual:   ${actual}`);
};
const ok = (label, condition) => check(label, Boolean(condition), true);

/* ---------- canonical registry ---------- */

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(read("portfolio-data.js"), sandbox);
const registry = sandbox.window.KAAN_PORTFOLIO;
const projects = registry.projects;
const details = registry.projectDetails;

/* ---------- 1. hero answers who / what / action ---------- */

const home = read("index.html");
const heroMatch = home.match(/<section[^>]*class="hero[^"]*"[^>]*>[\s\S]*?<\/section>/i);
ok("homepage has a hero section", Boolean(heroMatch));
const hero = heroMatch ? heroMatch[0] : "";

check("hero has exactly one <h1>", (hero.match(/<h1\b/g) || []).length, 1);

/* One visually primary CTA, not several competing ones. */
const primaryCtas = [...hero.matchAll(/class="btn primary"/g)].length;
check("hero has exactly one primary CTA", primaryCtas, 1);
ok("hero primary CTA is not the only action", /class="btn (ghost|text)"/.test(hero));

/* Every hero CTA destination must resolve. */
for (const m of hero.matchAll(/<a[^>]*href="([^"]+)"[^>]*>/g)) {
  const href = m[1];
  if (/^(https?:|mailto:|tel:|#)/.test(href)) continue;
  const target = href.split("#")[0].split("?")[0];
  if (!target) continue;
  ok(`hero CTA resolves — ${href}`, exists(decodeURIComponent(target)));
}

/* Positioning and availability must be stated, not implied. */
ok("hero states a professional direction", /Forward Deployed|Applied AI|AI Designer|Software/i.test(hero));
ok("homepage states availability", /Available for|Open for work|müsait|Açık/i.test(home));

/* ---------- 2. CV and contact are reachable ---------- */

const resumeLink = (read("js/core/shell.js").match(/const resumeLink =\s*\r?\n?\s*"([^"]+)"/) || [])[1];
ok("a single canonical resume link exists", Boolean(resumeLink) && /^https?:/.test(resumeLink));

/* The CV is exposed globally rather than repeated on every page: the header
 * carries Recruiter Mode and the command palette on all pages, and both link to
 * the single resumeLink constant. Asserting a per-page CV button would push
 * toward spamming every section, which the brief warns against. */
ok("Recruiter Mode exposes the CV", /cv:\s*"[^"]+"/.test(read("js/features/recruiter.js")));
ok("command palette exposes the CV", /View Resume|Özgeçmiş/.test(read("js/features/ultimate.js")));
ok("the resume opener routes through the single constant", /window\.open\(resumeLink/.test(read("js/core/shell.js")));

for (const page of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))) {
  ok(`${page}: header exposes Recruiter Mode (its CV and contact path)`, /data-recruiter-toggle/.test(read(page)));
}

for (const page of ["index.html", "about.html", "works.html"]) {
  ok(`${page}: exposes a contact path`, /mailto:|request\.html/i.test(read(page)));
}

/* The request form is for project inquiries; a recruiter must also have a
 * direct path that is not the long form. */
ok("homepage offers direct contact, not only the request form", /mailto:/i.test(home));

/* ---------- 3. recruiter evidence resolves ---------- */

const profiles = registry.recruiterProfiles;
ok("recruiter profiles exist", Object.keys(profiles).length > 0);
for (const [role, profile] of Object.entries(profiles)) {
  ok(`recruiter role "${role}" has a label`, profile.label && profile.label.en && profile.label.tr);
  ok(`recruiter role "${role}" lists evidence`, Array.isArray(profile.evidence) && profile.evidence.length > 0);
  for (const id of profile.evidence || []) {
    ok(`recruiter "${role}" evidence resolves in canonical data: ${id}`, Boolean(projects[id]));
  }
  ok(`recruiter role "${role}" lists skills`, Array.isArray(profile.skills) && profile.skills.length > 0);
}

/* ---------- 4. project role clarity ---------- */

/* Every flagship project must say what Kaan actually did, in both languages. */
for (const [id, project] of Object.entries(projects)) {
  ok(`projects.${id} declares a role`, Boolean(project.role));
  if (project.role) {
    ok(`projects.${id} role has English copy`, typeof project.role.en === "string" && project.role.en.length > 0);
    ok(`projects.${id} role has Turkish copy`, typeof project.role.tr === "string" && project.role.tr.length > 0);
  }
}

/* Cards on the two recruiter-facing browse surfaces must show it. */
for (const page of ["index.html", "works.html"]) {
  const html = read(page);
  const cards = (html.match(/<article class="(?:project-card|flagship-focus-card)[\s\S]*?<\/article>/g) || []);
  const withRole = cards.filter((c) => c.includes('class="project-role"'));
  if (page === "works.html") {
    check(`${page}: every project card shows a role`, withRole.length, cards.length);
  } else {
    ok(`${page}: project cards show a role (${withRole.length})`, withRole.length > 0);
  }

  /* Role labels must be bilingual, using the existing pv2 copy mechanism. */
  const roleLines = html.match(/<p class="project-role"[^>]*>/g) || [];
  for (const line of roleLines) {
    ok(`${page}: role line has English copy`, /data-pv2-en="[^"]+"/.test(line));
    ok(`${page}: role line has Turkish copy`, /data-pv2-tr="[^"]+"/.test(line));
  }
  check(
    `${page}: role lines are EN/TR paired`,
    (html.match(/class="project-role"[^>]*data-pv2-en=/g) || []).length,
    (html.match(/data-pv2-tr="Rol/g) || []).length,
  );
}

/* ---------- 5. recruiter intent helper ---------- */

const recruiterSrc = read("js/features/recruiter.js");
const START = "/* recruiter-intent:start";
const END = "/* recruiter-intent:end */";
const a = recruiterSrc.indexOf(START);
const b = recruiterSrc.indexOf(END);
ok("recruiter intent helper is marked and extractable", a !== -1 && b > a);

if (a !== -1 && b > a) {
  const block = recruiterSrc.slice(a, b + END.length);
  const { readRecruiterIntent, writeRecruiterIntent, RECRUITER_INTENT_KEY } = new Function(
    block + "\nreturn { readRecruiterIntent, writeRecruiterIntent, RECRUITER_INTENT_KEY };",
  )();

  /* A minimal Storage stand-in, so this runs without a browser. */
  const makeStore = () => {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
      size: () => map.size,
    };
  };

  const store = makeStore();
  check("intent defaults to inactive", readRecruiterIntent(store), false);
  writeRecruiterIntent(true, store);
  check("enabling records the intent", readRecruiterIntent(store), true);
  check("intent is stored under the expected key", store.getItem(RECRUITER_INTENT_KEY), "active");
  writeRecruiterIntent(false, store);
  check("disabling clears the intent", readRecruiterIntent(store), false);
  check("disabling removes the key entirely", store.size(), 0);

  /* Blocked storage must degrade, not throw. */
  const hostile = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  check("blocked storage reads as inactive instead of throwing", readRecruiterIntent(hostile), false);
  check("blocked storage writes report failure instead of throwing", writeRecruiterIntent(true, hostile), false);
}

/* Session-scoped, and deliberately never auto-reopens the modal. */
/* Comments legitimately explain the sessionStorage choice, so compare code. */
const recruiterCode = recruiterSrc
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");
ok(
  "recruiter intent uses sessionStorage, not localStorage",
  /sessionStorage/.test(recruiterCode) && !/localStorage/.test(recruiterCode),
);
ok(
  "recruiter mode is not auto-opened on load (no dark pattern)",
  !/setRecruiterMode\(\s*true/.test(recruiterSrc.replace(/\/\*[\s\S]*?\*\//g, " ")),
);
ok("returning recruiters get a resume affordance", /is-recruiter-intent/.test(recruiterSrc));

/* ---------- 6. nothing regressed into legacy routes ---------- */

for (const page of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))) {
  ok(
    `${page}: no legacy project query URL reintroduced`,
    !/href="project-detail\.html\?project=/.test(read(page)),
  );
}

/* ---------- 7. games are framed as engineering, not filler ---------- */

const games = read("games.html");
ok("games page frames the work in engineering terms", /interactive|system|engineering|product|Phaser|gameplay/i.test(games));

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Recruiter UX: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const f of failures) console.error(`  x ${f}\n`);
  process.exit(1);
}

console.log(
  `Recruiter UX contracts passed. ${passed} assertions · ${Object.keys(projects).length} flagship projects · ` +
    `${Object.keys(profiles).length} recruiter roles. Static checks only — conversion itself is not measurable here.`,
);
