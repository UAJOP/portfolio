/**
 * React's view of the canonical portfolio data.
 *
 * Every value here is imported from the JSON under data/portfolio/ — the same
 * files the legacy registry is generated from. There is no second copy of any
 * product fact, which is why the temporary parity fixture from #23
 * (`foundation.js`) could be deleted in #24.
 *
 * Imports are resolved at BUILD time through Vite's `@data` alias. Nothing here
 * fetches at runtime: the pre-render step has to be able to see this data while
 * generating HTML, and a runtime fetch would produce empty pre-rendered pages.
 *
 * This module composes and shapes. It must never redefine a fact. If a value
 * looks wrong, fix the JSON.
 */
import meta from "@data/portfolio/meta.json";
import profileFields from "@data/portfolio/profile.json";
import socialUrls from "@data/portfolio/socials.json";
import projects from "@data/portfolio/projects.json";
import recruiterProfiles from "@data/portfolio/recruiter-profiles.json";
import buildLog from "@data/portfolio/build-log.json";
import labs from "@data/portfolio/labs.json";
import sinamaEvidence from "@data/portfolio/sinama-evidence.json";

export { meta, projects, recruiterProfiles, buildLog, labs, sinamaEvidence };

/** Profile with its socials spliced back in, matching the registry shape. */
export const profile = { ...profileFields, socials: socialUrls };

/**
 * Display names for the canonical social destinations.
 *
 * The URLs are product truth and come from `socials.json`. These labels are UI
 * copy — the human-readable name of each platform — and are the only part of the
 * footer's link rendering that is not canonical data. `qa-portfolio-data.js`
 * fails if this map and the canonical socials ever cover different platforms, so
 * a new destination cannot ship without a label and a label cannot outlive its
 * destination.
 */
const SOCIAL_LABELS = {
  github: "GitHub",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
};

/** The five canonical destinations, in their canonical order. */
export const socials = Object.entries(socialUrls).map(([id, url]) => ({
  id,
  url,
  label: SOCIAL_LABELS[id] || id,
}));

/** Ordered project list; the JSON is keyed by id for registry compatibility. */
export const projectList = Object.values(projects);

/** Ordered recruiter evidence profiles, with their key exposed as `id`. */
export const recruiterProfileList = Object.entries(recruiterProfiles).map(([id, value]) => ({
  id,
  ...value,
}));

/** Resolves the project ids a recruiter profile cites into project objects. */
export const evidenceProjectsFor = (recruiterProfileId) =>
  (recruiterProfiles[recruiterProfileId]?.evidence || [])
    .map((id) => projects[id])
    .filter(Boolean);
