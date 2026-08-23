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

/** Every canonical file, in the order a reader should encounter them. */
export const CANONICAL_FILES = [
  "meta.json",
  "profile.json",
  "socials.json",
  "projects.json",
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
      linkedin: profile.linkedin,
      github: profile.github,
      email: profile.email,
      // Kept in its own file because it is the most protected data in the
      // registry; spliced back in at its original position here.
      socials,
      footerTagline: profile.footerTagline,
    },
    projects: read("projects.json"),
    recruiterProfiles: read("recruiter-profiles.json"),
    buildLog: read("build-log.json"),
    labs: read("labs.json"),
    sinamaEvidence: read("sinama-evidence.json"),
  };
}

/**
 * The profile fields the composer above places by hand. The guard uses this to
 * fail if a field is added to profile.json but never reaches the composed
 * object, which is the one way this explicit ordering could silently lose data.
 */
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
