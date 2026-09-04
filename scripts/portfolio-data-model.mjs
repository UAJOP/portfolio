/**
 * The canonical portfolio data model.
 *
 * This module is the single definition of how the JSON files under
 * data/portfolio/ compose into the legacy `window.KAAN_PORTFOLIO` shape. Both
 * the generator and the QA guard import it, so the file that ships and the file
 * that is checked can never disagree about what "correct" means.
 *
 * Key order matters. `portfolio-data.js` is a compatibility artifact, and its
 * generated output is compared byte-for-byte against the committed file, so the
 * order below is part of the contract rather than a formatting preference.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.join(here, "..");
export const DATA_DIR = path.join(REPO_ROOT, "data", "portfolio");
export const I18N_DIR = path.join(REPO_ROOT, "data", "i18n");
export const GENERATED_REGISTRY = path.join(REPO_ROOT, "portfolio-data.js");

/**
 * Canonical files that the SERVER reads and the browser registry must not.
 *
 * `portfolio-data.js` ships to GitHub Pages, so everything composed into it is
 * downloaded by every visitor. Ajoop's master knowledge is a server-side
 * retrieval corpus read once by server/ajoop-knowledge.mjs; composing it would
 * put tens of kilobytes of recruiter intelligence into the page bundle for no
 * reader benefit. It is listed here rather than left unlisted so that the
 * directory and the manifests still describe each other exactly — the point of
 * the guard in qa-portfolio-data.js.
 */
export const SERVER_ONLY_FILES = ["ajoop-master-knowledge.json"];

/** Every canonical file, in the order a reader should encounter them. */
export const CANONICAL_FILES = [
  "meta.json",
  "profile.json",
  "socials.json",
  "projects.json",
  "project-details.json",
  "recruiter-profiles.json",
  "build-log.json",
  "labs.json",
  "sinama-evidence.json",
];

export function readJson(file) {
  const raw = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${path.relative(REPO_ROOT, file)} is not valid JSON: ${error.message}`);
  }
}

/**
 * Projects that also have a full detail record, keyed by project id.
 *
 * A project with a detail page had its title stored twice: once as
 * `projects.json:<id>.name` and again as
 * `project-details.json:<slug>.title.en`. The detail record owns the title
 * because it carries both languages, so `projects.json` stores `detailSlug`
 * instead of `name` and the card title is projected from the detail record —
 * the same technique already used for `profile.github` / `profile.linkedin`.
 *
 * Only the title is shared. `category`, `status.tr` and `summary` vs
 * `subtitle` differ deliberately between the card and the detail page, so they
 * stay stored separately. See docs/project-data-architecture.md.
 */
export const PROJECT_DETAIL_LINKS = {
  joyday: "atolye-joyday-official-website",
  hospital: "hospital-form-app",
  chatbotFlow: "ai-chatbot-flow-design",
};

/**
 * Restores the legacy `name` field for linked projects by projecting it from
 * the detail record, keeping it at its original key position.
 */
export function composeProjects(projects, projectDetails) {
  const composed = {};

  for (const [id, project] of Object.entries(projects)) {
    if (!("detailSlug" in project)) {
      composed[id] = project;
      continue;
    }

    const slug = project.detailSlug;
    const detail = projectDetails[slug];
    if (!detail) {
      throw new Error(
        `projects.json:${id}.detailSlug points at "${slug}", which does not exist in project-details.json`,
      );
    }

    const rebuilt = {};
    for (const [key, value] of Object.entries(project)) {
      if (key === "detailSlug") rebuilt.name = detail.title.en;
      else rebuilt[key] = value;
    }

    /* BRIEF 05: recruiter-facing cards state what Kaan actually did on each
     * project. The detail record already carries a fact-checked bilingual
     * `role`, so linked projects project it rather than storing a second copy —
     * the same rule as `name` above. Projects that store their own `role`
     * (sinama, mergeRush) keep it untouched. */
    if (!("role" in rebuilt) && detail.role) {
      rebuilt.role = detail.role;
    }

    composed[id] = rebuilt;
  }

  return composed;
}

/**
 * Composes the canonical JSON into the exact object the legacy runtime expects.
 *
 * Composition only — no defaulting, no coercion, no invented fields. If a value
 * is wrong here it was wrong in the JSON, which is what makes the parity check
 * against the pre-migration registry meaningful.
 */
export function composePortfolio() {
  const read = (name) => readJson(path.join(DATA_DIR, name));

  const meta = read("meta.json");
  const profile = read("profile.json");
  const socials = read("socials.json");
  const projectDetails = read("project-details.json");

  return {
    version: meta.version,
    updatedAt: meta.updatedAt,
    profile: {
      name: profile.name,
      primaryTitle: profile.primaryTitle,
      backgroundTitle: profile.backgroundTitle,
      location: profile.location,
      availability: profile.availability,
      direction: profile.direction,
      resume: profile.resume,
      // DERIVED, not stored. The legacy registry exposes these two URLs both
      // here and under `socials`, so storing them twice would leave GitHub and
      // LinkedIn with two editable sources — exactly the drift this data layer
      // exists to remove. socials.json is the single canonical source; these
      // fields are projections of it, kept at their original key positions.
      linkedin: socials.linkedin,
      github: socials.github,
      email: profile.email,
      socials,
      footerTagline: profile.footerTagline,
    },
    projects: composeProjects(read("projects.json"), projectDetails),
    projectDetails,
    recruiterProfiles: read("recruiter-profiles.json"),
    buildLog: read("build-log.json"),
    labs: read("labs.json"),
    sinamaEvidence: read("sinama-evidence.json"),
  };
}

/**
 * The composition contract for `profile`, exported so the guard can enforce it
 * rather than trust it.
 *
 * This exists to close a common-mode failure. `composePortfolio()` places every
 * profile field by hand, and the guard compares the generated artifact against
 * that same function's output — so if a field were added to profile.json and the
 * composer forgot it, expected and actual would still agree and CI would pass
 * while canonical data was silently discarded.
 *
 * `qa-portfolio-data.js` reads the raw JSON and checks it against these lists,
 * which is a source the composer does not control.
 */
export const PROFILE_COMPOSITION = {
  /** Copied straight from profile.json. Every raw key must appear here. */
  passthrough: [
    "name",
    "primaryTitle",
    "backgroundTitle",
    "location",
    "availability",
    "direction",
    "resume",
    "email",
    "footerTagline",
  ],
  /** Present in the composed object but NOT stored in profile.json. */
  derived: {
    socials: "socials.json",
    github: "socials.json:github",
    linkedin: "socials.json:linkedin",
  },
};

/** Full composed key order, which is part of the generated-artifact contract. */
export const COMPOSED_PROFILE_KEYS = [
  "name",
  "primaryTitle",
  "backgroundTitle",
  "location",
  "availability",
  "direction",
  "resume",
  "linkedin",
  "github",
  "email",
  "socials",
  "footerTagline",
];

const GENERATED_HEADER = `// GENERATED FILE — DO NOT EDIT DIRECTLY.
// Source: data/portfolio/*
// Run: npm run data:generate
//
// The canonical portfolio truth lives in the JSON files above. This file exists
// because GitHub Pages serves the repository directly with no build step, so the
// legacy runtime needs window.KAAN_PORTFOLIO available synchronously from a
// classic script. Editing it by hand will be overwritten and will fail qa:data.
`;

/**
 * Serializes the composed model into the legacy classic-script artifact.
 *
 * Deterministic by construction: the same JSON always produces byte-identical
 * output. JSON is a subset of JavaScript, so the object literal is emitted with
 * JSON.stringify rather than a bespoke printer that could drift.
 *
 * Always emits LF. Callers comparing against a checked-out file must normalize,
 * because this repository uses `* text=auto` and Windows checkouts are CRLF.
 */
export function renderRegistrySource(portfolio) {
  const body = JSON.stringify(portfolio, null, 2)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n");

  return `${GENERATED_HEADER}(function () {
  window.KAAN_PORTFOLIO = Object.freeze(${body});
})();
`;
}

/** Normalizes line endings so CRLF checkouts compare equal to generated LF. */
export const normalizeEol = (text) => text.replace(/\r\n/g, "\n");
