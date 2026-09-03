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
  "Forward Deployed Engineer turning customer workflows into reliable AI systems and shipped software.";
const CANONICAL_FOOTER_TR =
  "Müşteri workflow'larını güvenilir AI sistemlerine ve çalışan yazılım ürünlerine dönüştüren Forward Deployed Engineer.";

const isBilingual = (value) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof value.en === "string" &&
  typeof value.tr === "string" &&
  Object.keys(value).length === 2;

async function main() {
  // --- Canonical JSON parses -----------------------------------------------
  const {
    CANONICAL_FILES,
    COMPOSED_PROFILE_KEYS,
    PROFILE_COMPOSITION,
    composePortfolio,
    renderRegistrySource,
    normalizeEol,
  } = await import("./scripts/portfolio-data-model.mjs");

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

  // The directory and the manifest must describe each other exactly. Without
  // this, a new canonical domain file could be added and then silently ignored
  // by both the composer and this guard.
  const onDisk = fs
    .readdirSync(path.join(__dirname, DATA_DIR))
    .filter((name) => name.endsWith(".json"))
    .sort();
  onDisk.forEach((name) => {
    check(
      CANONICAL_FILES.includes(name),
      `${DATA_DIR}/${name} is not listed in CANONICAL_FILES, so nothing composes or checks it`,
    );
  });
  CANONICAL_FILES.forEach((name) => {
    check(onDisk.includes(name), `CANONICAL_FILES lists ${name}, which does not exist on disk`);
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

  // --- Composition contract -------------------------------------------------
  // Closes a common-mode failure. The staleness check above compares the
  // generated artifact against composePortfolio(), so if a field were added to
  // profile.json and the composer forgot it, both sides would agree and CI would
  // pass while canonical data was silently dropped. These checks read the RAW
  // JSON, which the composer does not control.
  const rawProfile = JSON.parse(read(`${DATA_DIR}/profile.json`));
  const rawProfileKeys = Object.keys(rawProfile);
  const composedProfileKeys = Object.keys(composed.profile);
  const derivedKeys = Object.keys(PROFILE_COMPOSITION.derived);

  rawProfileKeys.forEach((key) => {
    check(
      composedProfileKeys.includes(key),
      `profile.json defines "${key}" but composePortfolio() never places it — the field would be silently discarded`,
    );
    check(
      PROFILE_COMPOSITION.passthrough.includes(key),
      `profile.json defines "${key}", which is not in the declared composition contract; add it to PROFILE_COMPOSITION.passthrough and to the composer`,
    );
  });

  PROFILE_COMPOSITION.passthrough.forEach((key) => {
    check(rawProfileKeys.includes(key), `composition contract expects profile.json to define "${key}"`);
  });

  composedProfileKeys.forEach((key) => {
    check(
      rawProfileKeys.includes(key) || derivedKeys.includes(key),
      `composed profile exposes "${key}", which is neither stored in profile.json nor declared as derived`,
    );
  });

  derivedKeys.forEach((key) => {
    check(
      !rawProfileKeys.includes(key),
      `"${key}" is derived from ${PROFILE_COMPOSITION.derived[key]}, so storing it in profile.json creates a second editable source`,
    );
    check(composedProfileKeys.includes(key), `derived profile field "${key}" is missing from the composed object`);
  });

  // Key order is part of the generated-artifact contract, not a formatting
  // preference: the artifact is compared byte-for-byte.
  check(
    composedProfileKeys.join(",") === COMPOSED_PROFILE_KEYS.join(","),
    `composed profile key order drifted from the contract:\n    expected ${COMPOSED_PROFILE_KEYS.join(",")}\n    actual   ${composedProfileKeys.join(",")}`,
  );

  // --- Protected product truth ---------------------------------------------
  const profile = composed.profile;

  // The legacy registry exposes these URLs twice; socials.json is the only
  // place either is stored, so the two views must agree by construction.
  check(
    profile.github === profile.socials.github,
    `profile.github (${profile.github}) must be derived from socials.github (${profile.socials.github})`,
  );
  check(
    profile.linkedin === profile.socials.linkedin,
    `profile.linkedin (${profile.linkedin}) must be derived from socials.linkedin (${profile.socials.linkedin})`,
  );

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

  // Every i18n key the React tree asks for must exist, and every key defined
  // must still be used. A missing key renders as the raw key in the UI; an
  // orphan key is dead translation work that will rot.
  if (exists(I18N_FILE)) {
    const strings = JSON.parse(read(I18N_FILE));
    const reactFiles = [];
    const walk = (dir) => {
      fs.readdirSync(path.join(__dirname, dir), { withFileTypes: true }).forEach((entry) => {
        const next = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(next);
        else if (/\.jsx?$/.test(entry.name)) reactFiles.push(next);
      });
    };
    walk("src/react");

    const source = reactFiles.map(read).join("\n");
    // Any dotted logical identifier counts as an i18n-key reference. Keys are
    // also passed indirectly — collected in arrays and mapped through t(), or
    // carried on the route table as navKey — so matching only t("literal")
    // would report those as orphans. Crucially, this scan does NOT filter
    // through the JSON first: deleting a still-used key must remain detectable.
    // File names such as index.html are excluded from the key-shaped matches.
    // `*` not `+`: an empty attribute such as alt="" must still match, or the
    // quote pairing desynchronizes and every literal after it is misread.
    const translationKey = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/;
    const fileName = /\.(?:html|jsx?|css|json|svg|webp|png|ico)$/i;
    const used = new Set(
      [...source.matchAll(/"([^"\\]*)"/g)]
        .map((match) => match[1])
        .filter((value) => translationKey.test(value) && !fileName.test(value)),
    );

    used.forEach((key) => {
      check(Object.hasOwn(strings, key), `React asks for i18n key "${key}", which ${I18N_FILE} does not define`);
    });
    Object.keys(strings).forEach((key) => {
      check(used.has(key), `${I18N_FILE} defines "${key}", which nothing in src/react uses`);
    });

    // Human-facing shell copy must not be hard-coded. These are the literals
    // that were found outside i18n during review; the check keeps them out.
    const shellFiles = reactFiles.filter((file) => file.includes("/components/shell/"));
    const untranslated = ["Skip to main content", "All rights reserved"];
    shellFiles.forEach((file) => {
      const text = read(file);
      untranslated.forEach((literal) => {
        check(
          !text.includes(`>${literal}`) && !text.includes(`"${literal}"`),
          `${file} hard-codes English UI copy "${literal}"; move it to ${I18N_FILE}`,
        );
      });
    });

    // The shell must read bilingual product truth through the active language
    // rather than pinning itself to one side of the pair.
    // Positive assertion rather than banning ".en": `[language] || .en` is the
    // correct hydration-safe form, and it legitimately contains ".en".
    const header = "src/react/components/shell/SiteHeader.jsx";
    if (exists(header)) {
      check(
        read(header).includes("profile.primaryTitle[language]"),
        `${header} must render primaryTitle through the active language, not pinned to one side of the pair`,
      );
    }
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
