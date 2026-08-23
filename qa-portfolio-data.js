/**
 * Deterministic guard for the canonical portfolio data layer (#24).
 *
 * After #24 the JSON under data/portfolio/ is the source of truth and
 * portfolio-data.js is a generated compatibility artifact. That split only stays
 * trustworthy if two things are enforced mechanically:
 *
 *   1. The generated artifact matches the canonical JSON exactly. A stale
 *      artifact must FAIL the build, never be silently regenerated, because
 *      GitHub Pages serves the committed file directly.
 *   2. The protected product truth inside the JSON has not drifted.
 *
 * Everything checked here is decided by the repository, so it cannot flake. No
 * network, no timestamps, no ordering surprises.
 *
 * Run with `npm run qa:data`. It never writes a file.
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

const DATA_DIR = "data/portfolio";
const I18N_FILE = "data/i18n/react-shell.json";
const GENERATED = "portfolio-data.js";

/** The five canonical destinations. These values are protected product truth. */
const CANONICAL_SOCIALS = {
  github: "https://github.com/UAJOP",
  linkedin: "https://www.linkedin.com/in/balcikaan/",
  instagram: "https://www.instagram.com/kaan_ba1/",
  youtube: "https://www.youtube.com/channel/UCCoOWMoemn93OX7cHyGTZuA",
  x: "https://x.com/KaanAjop",
};

const CANONICAL_PRIMARY_TITLE = "Forward Deployed Engineer";
const CANONICAL_BACKGROUND_TITLE = "AI Designer & Software Developer";
const CANONICAL_FOOTER_EN =
  "Forward Deployed Engineer building reliable AI systems and product-minded software.";
const CANONICAL_FOOTER_TR =
  "Güvenilir AI sistemleri ve ürün odaklı yazılımlar geliştiren Forward Deployed Engineer.";

const isBilingual = (value) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof value.en === "string" &&
  typeof value.tr === "string" &&
  Object.keys(value).length === 2;

async function main() {
  // --- Canonical JSON parses -----------------------------------------------
  const { CANONICAL_FILES, composePortfolio, renderRegistrySource, normalizeEol } = await import(
    "./scripts/portfolio-data-model.mjs"
  );

  CANONICAL_FILES.forEach((name) => {
    const file = `${DATA_DIR}/${name}`;
    check(exists(file), `canonical data file is missing: ${file}`);
    if (!exists(file)) return;
    try {
      JSON.parse(read(file));
    } catch (error) {
      failures.push(`${file} is not valid JSON: ${error.message}`);
    }
  });

  check(exists(I18N_FILE), `${I18N_FILE} is missing`);

  if (failures.length) return report();

  // --- Composition ----------------------------------------------------------
  const composed = composePortfolio();

  // --- Generated artifact is in step ----------------------------------------
  // Normalized for line endings: this repository uses `* text=auto`, so a
  // Windows checkout is CRLF while the generator always emits LF. Comparing raw
  // bytes would fail on one platform and pass on the other.
  check(exists(GENERATED), `${GENERATED} is missing; run "npm run data:generate"`);
  if (exists(GENERATED)) {
    const expected = normalizeEol(renderRegistrySource(composed));
    const actual = normalizeEol(read(GENERATED));
    check(
      expected === actual,
      `${GENERATED} is stale. It no longer matches data/portfolio/. Run "npm run data:generate" and commit the result — CI will not regenerate it for you.`,
    );

    check(
      read(GENERATED).startsWith("// GENERATED FILE — DO NOT EDIT DIRECTLY."),
      `${GENERATED} must keep its generated-file header`,
    );

    // The runtime contract the legacy site depends on: a classic script that
    // defines window.KAAN_PORTFOLIO synchronously, with no fetch and no await.
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    try {
      vm.runInContext(read(GENERATED), sandbox, { filename: GENERATED });
    } catch (error) {
      failures.push(`${GENERATED} does not evaluate as a classic script: ${error.message}`);
    }
    const registry = sandbox.window.KAAN_PORTFOLIO;
    check(Boolean(registry), `${GENERATED} must expose window.KAAN_PORTFOLIO`);
    check(!/\bfetch\s*\(/.test(read(GENERATED)), `${GENERATED} must not fetch at runtime`);
    check(!/\bawait\b/.test(read(GENERATED)), `${GENERATED} must stay synchronous`);
    check(Object.isFrozen(registry || {}), "the generated registry must stay frozen");

    if (registry) {
      check(
        JSON.stringify(registry) === JSON.stringify(composed),
        "the generated window.KAAN_PORTFOLIO does not deep-equal the composed JSON model",
      );
    }
  }

  // --- Protected product truth ---------------------------------------------
  const profile = composed.profile;

  check(profile.primaryTitle?.en === CANONICAL_PRIMARY_TITLE, "profile.primaryTitle.en has drifted from the canonical target title");
  check(profile.primaryTitle?.tr === CANONICAL_PRIMARY_TITLE, "profile.primaryTitle.tr has drifted from the canonical target title");
  check(profile.backgroundTitle?.en === CANONICAL_BACKGROUND_TITLE, "profile.backgroundTitle.en has drifted");
  check(profile.backgroundTitle?.tr === CANONICAL_BACKGROUND_TITLE, "profile.backgroundTitle.tr has drifted");
  check(profile.footerTagline?.en === CANONICAL_FOOTER_EN, "canonical EN footer positioning has drifted");
  check(profile.footerTagline?.tr === CANONICAL_FOOTER_TR, "canonical TR footer positioning has drifted");
  check(typeof profile.resume === "string" && profile.resume.startsWith("https://"), "profile.resume must remain a public https URL");
  check(profile.name === "Kaan Balcı", "profile.name has drifted");

  const socialKeys = Object.keys(profile.socials || {});
  check(socialKeys.length === 5, `profile.socials must define exactly five destinations (found ${socialKeys.length})`);
  Object.entries(CANONICAL_SOCIALS).forEach(([platform, url]) => {
    check(profile.socials?.[platform] === url, `canonical ${platform} URL has drifted: ${profile.socials?.[platform]}`);
  });
  socialKeys.forEach((key) => {
    check(Object.hasOwn(CANONICAL_SOCIALS, key), `unexpected social destination in canonical data: ${key}`);
  });

  // --- Bilingual structure --------------------------------------------------
  ["primaryTitle", "backgroundTitle", "location", "availability", "direction", "footerTagline"].forEach((field) => {
    check(isBilingual(profile[field]), `profile.${field} must be a { en, tr } pair`);
  });

  // --- Projects -------------------------------------------------------------
  const projectIds = Object.keys(composed.projects);
  check(projectIds.length > 0, "canonical data defines no projects");
  check(new Set(projectIds).size === projectIds.length, "duplicate project ids in canonical data");

  Object.entries(composed.projects).forEach(([key, project]) => {
    check(project.id === key, `project "${key}" declares a mismatched id "${project.id}"`);
    check(typeof project.name === "string" && project.name.length > 0, `project ${key} is missing a name`);
    ["status", "category", "summary"].forEach((field) => {
      check(isBilingual(project[field]), `project ${key}.${field} must be a { en, tr } pair`);
    });

    const links = project.links || {};
    check(Object.keys(links).length > 0, `project ${key} must declare at least one link`);
    Object.entries(links).forEach(([name, url]) => {
      check(typeof url === "string" && url.length > 0, `project ${key}.links.${name} is empty`);
      if (typeof url !== "string") return;
      const isExternal = /^https?:\/\//.test(url);
      if (isExternal) return;
      // Internal links must resolve to a real page in this repository.
      const target = url.split("?")[0].split("#")[0];
      check(exists(target), `project ${key}.links.${name} does not resolve: ${url}`);
    });
  });

  // --- Recruiter evidence ---------------------------------------------------
  Object.entries(composed.recruiterProfiles).forEach(([id, entry]) => {
    check(isBilingual(entry.label), `recruiter profile ${id}.label must be a { en, tr } pair`);
    check(isBilingual(entry.focusTitle), `recruiter profile ${id}.focusTitle must be a { en, tr } pair`);
    check(Array.isArray(entry.evidence) && entry.evidence.length > 0, `recruiter profile ${id} cites no evidence`);
    (entry.evidence || []).forEach((projectId) => {
      check(
        projectIds.includes(projectId),
        `recruiter profile ${id} cites a project that does not exist: ${projectId}`,
      );
    });
    // `capabilities` are deliberately plain strings: they are language-neutral
    // technical terms ("AI Agent Reliability") that the live runtime renders
    // untranslated. `skills` are the bilingual field on this object.
    (entry.capabilities || []).forEach((capability, index) => {
      check(
        typeof capability === "string" && capability.trim().length > 0,
        `recruiter profile ${id}.capabilities[${index}] must be a non-empty string`,
      );
    });
    (entry.skills || []).forEach((skill, index) => {
      check(isBilingual(skill), `recruiter profile ${id}.skills[${index}] must be a { en, tr } pair`);
    });
  });

  // --- Labs -----------------------------------------------------------------
  const labIds = composed.labs.map((lab) => lab.id);
  check(new Set(labIds).size === labIds.length, `duplicate lab ids: ${labIds.join(", ")}`);
  composed.labs.forEach((lab) => {
    check(Boolean(lab.id), "a lab entry is missing an id");
    check(isBilingual(lab.type), `lab ${lab.id}.type must be a { en, tr } pair`);
    check(isBilingual(lab.description), `lab ${lab.id}.description must be a { en, tr } pair`);
    const target = String(lab.url || "").split("?")[0].split("#")[0];
    check(exists(target), `lab ${lab.id} url does not resolve: ${lab.url}`);
  });

  // --- Build log ------------------------------------------------------------
  const dates = composed.buildLog.map((entry) => entry.date);
  check(
    dates.every((date, index) => index === 0 || dates[index - 1] >= date),
    "build log entries must stay in descending date order",
  );
  composed.buildLog.forEach((entry, index) => {
    check(isBilingual(entry.title), `build log[${index}].title must be a { en, tr } pair`);
    check(isBilingual(entry.detail), `build log[${index}].detail must be a { en, tr } pair`);
    check(/^\d{4}-\d{2}-\d{2}$/.test(entry.date), `build log[${index}].date must be ISO formatted`);
  });
  check(composed.updatedAt >= dates[0], `meta.updatedAt (${composed.updatedAt}) is older than the newest build log entry (${dates[0]})`);

  // --- i18n -----------------------------------------------------------------
  if (exists(I18N_FILE)) {
    let strings = {};
    try {
      strings = JSON.parse(read(I18N_FILE));
    } catch (error) {
      failures.push(`${I18N_FILE} is not valid JSON: ${error.message}`);
    }
    const keys = Object.keys(strings);
    check(keys.length > 0, `${I18N_FILE} defines no strings`);
    keys.forEach((key) => {
      check(isBilingual(strings[key]), `${I18N_FILE} key "${key}" must be a { en, tr } pair`);
      if (!isBilingual(strings[key])) return;
      check(strings[key].en.trim().length > 0, `${I18N_FILE} key "${key}" has an empty EN string`);
      check(strings[key].tr.trim().length > 0, `${I18N_FILE} key "${key}" has an empty TR string`);
    });
  }

  // --- Nothing private leaked into canonical data ---------------------------
  // The JSON is public the moment it is committed, so a local path, a token or
  // an internal host in it would ship straight to production.
  const forbidden = [
    /[A-Za-z]:\\Users\\/,
    /\/home\/[a-z]/i,
    /\bBearer\s+[A-Za-z0-9._-]{8,}/,
    /\b(?:api[_-]?key|secret|password|passwd|private[_-]?key)\b\s*[:=]/i,
    /\.env\b/,
    /localhost:\d+/,
    /\b127\.0\.0\.1\b/,
  ];
  const serialized = JSON.stringify(composed) + JSON.stringify(exists(I18N_FILE) ? read(I18N_FILE) : "");
  forbidden.forEach((pattern) => {
    const match = serialized.match(pattern);
    check(!match, `canonical data contains something that looks private: ${match && match[0]}`);
  });

  // --- React consumes the canonical data ------------------------------------
  check(
    !exists("src/react/data/foundation.js"),
    "the temporary #23 parity fixture must be deleted now that React reads canonical JSON",
  );
  check(
    !exists("src/react/data/translations.js"),
    "React shell strings must live in data/i18n/react-shell.json, not in a JS module",
  );

  const reactData = "src/react/data/portfolio.js";
  check(exists(reactData), `${reactData} is missing`);
  if (exists(reactData)) {
    const source = read(reactData);
    check(source.includes("@data/portfolio/"), `${reactData} must import the canonical JSON`);
    check(!/\bfetch\s*\(/.test(source), `${reactData} must not fetch data at runtime; pre-rendering needs it at build time`);

    // The social label map is UI copy, but it must cover exactly the canonical
    // destinations or the footer would silently render a raw key or drop a link.
    const labelled = [...source.matchAll(/^\s{2}([a-z]+):\s*"/gm)].map((m) => m[1]);
    Object.keys(CANONICAL_SOCIALS).forEach((platform) => {
      check(labelled.includes(platform), `${reactData} has no display label for canonical social "${platform}"`);
    });
    labelled.forEach((platform) => {
      check(
        Object.hasOwn(CANONICAL_SOCIALS, platform),
        `${reactData} labels a social destination that is not canonical: ${platform}`,
      );
    });
  }

  const i18nModule = "src/react/i18n/translate.js";
  check(exists(i18nModule), `${i18nModule} is missing`);
  if (exists(i18nModule)) {
    check(read(i18nModule).includes("@data/i18n/react-shell.json"), `${i18nModule} must read the canonical i18n JSON`);
  }

  // --- Editing workflow is documented where it will be seen -----------------
  check(
    read("PORTFOLIO_ARCHITECTURE.md").includes("npm run data:generate"),
    "the architecture doc must document the edit-JSON-then-generate workflow",
  );

  report();
}

function report() {
  if (failures.length) {
    console.error(`Portfolio data contract failed with ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  const composedSummary = JSON.parse(
    JSON.stringify({
      files: fs.readdirSync(path.join(__dirname, DATA_DIR)).length,
    }),
  );
  console.log("Portfolio data contract passed.");
  console.log(
    `${composedSummary.files} canonical files · generated adapter in step · protected truth verified`,
  );
}

main().catch((error) => {
  console.error("Portfolio data contract failed to run:");
  console.error(error);
  process.exit(1);
});
