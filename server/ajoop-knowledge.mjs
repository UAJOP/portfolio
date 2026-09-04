/**
 * The canonical Ajoop knowledge source: load, sanitize, recordize.
 *
 * data/portfolio/ajoop-master-knowledge.json is a structured source of truth
 * about Kaan, not a prompt and not an answer key. This module turns it into
 * SEMANTIC RECORDS — one concept or entity per record — that the existing RAG
 * pipeline embeds alongside the portfolio datasets it already indexes.
 *
 * Two properties matter more than anything else here:
 *
 * 1. PRIVACY IS PHYSICAL. Restricted material is deleted from the parsed tree
 *    by sanitizeKnowledge() before any record exists, and every record's text
 *    is rendered from an EXPLICIT field list rather than by walking whatever
 *    keys happen to be present. A key added to the JSON later therefore reaches
 *    the embedding corpus only if someone writes a line for it.
 *    loadMasterKnowledge() then refuses to return an index in which a removed
 *    value reappeared, so a regression takes the index down instead of leaking.
 *
 * 2. ENTITIES STAY SEPARATE. Hospital Form App (C#/.NET) and Hospital
 *    Appointment System (Python/Tkinter) are different projects, as are SINAMA
 *    and Merge Rush. Each gets its own record and its own stack line; nothing
 *    merges them into a generic "projects" document.
 *
 * Everything stays in memory and is built once at startup.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const MASTER_KNOWLEDGE_FILE = "ajoop-master-knowledge.json";
export const MASTER_KNOWLEDGE_SOURCE = "master-knowledge";

/**
 * The only two visibility tiers that may reach the public embedding index.
 *
 * This mirrors privacy_and_answer_boundaries.safe_to_index inside the file
 * itself, so the code and the data agree on where the boundary is. Everything
 * else — restricted, restricted_pending_public_clearance,
 * do_not_offer_by_default, private, internal — is dropped.
 */
export const INDEXABLE_VISIBILITY = Object.freeze(["public", "public_on_request"]);

/** Retrieval priority hint for later briefs. Lower is stronger. */
const PRIORITY_BY_VISIBILITY = Object.freeze({ public: 1, public_on_request: 2 });

/**
 * Keys whose VALUE is a secret by name alone, whatever the file says about it.
 *
 * The visibility markers cover what the author thought to mark; this covers
 * what a later edit might forget to mark.
 */
const RESTRICTED_KEY_PATTERN =
  /(pass(word|phrase)|secret|token|api[_-]?key|apikey|credential|private[_-]?key|access[_-]?key|tunnel[_-]?id)/i;

/** Shortest removed value worth searching for when proving absence. */
const REDACTION_MIN_LENGTH = 4;

const clean = (value, max = 1200) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());

export function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[ıİ]/g, "i")
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

/**
 * Which tier a visibility marker belongs to.
 *
 * Anything unrecognised is RESTRICTED. A marker nobody anticipated must fail
 * closed, because the alternative is a new visibility word silently becoming
 * public on the day it is introduced.
 */
export function classifyVisibility(raw) {
  const marker = String(raw ?? "public")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  if (marker === "public") return "public";
  /* "public_on_request_not_recruiter_default" is the on-request tier carrying
   * an extra caveat, not a third tier. */
  if (marker.startsWith("public_on_request")) return "public_on_request";
  return "restricted";
}

export const isIndexableVisibility = (raw) => INDEXABLE_VISIBILITY.includes(classifyVisibility(raw));

/**
 * The knowledge tree with every restricted node deleted, recording what went.
 *
 * A node is removed whole — never partially — when its own `visibility` marker
 * is not indexable, or when its key names a credential. Removing the whole node
 * is what stops a sibling explanation ("rule: do not expose X until…") from
 * dragging the value it protects back into the corpus.
 */
export function sanitizeKnowledge(value, path = [], removed = []) {
  if (Array.isArray(value)) {
    return value
      .map((item, position) => sanitizeKnowledge(item, [...path, String(position + 1)], removed))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") return value;

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (RESTRICTED_KEY_PATTERN.test(key)) {
      removed.push({ path: childPath.join("."), reason: "restricted key" });
      continue;
    }
    if (child && typeof child === "object" && !Array.isArray(child) && "visibility" in child) {
      if (classifyVisibility(child.visibility) === "restricted") {
        removed.push({ path: childPath.join("."), reason: `visibility ${clean(child.visibility, 80)}` });
        continue;
      }
    }
    output[key] = sanitizeKnowledge(child, childPath, removed);
  }
  return output;
}

/** Every string leaf inside a removed node, for the absence proof below. */
export function collectRedactedValues(value, into = new Set()) {
  if (typeof value === "string") {
    const text = value.trim();
    if (text.length >= REDACTION_MIN_LENGTH) into.add(text);
    return into;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectRedactedValues(item, into));
    return into;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectRedactedValues(item, into));
  }
  return into;
}

/**
 * Which restricted values, if any, survived into the rendered records.
 *
 * The answer must always be none. It is checked rather than assumed because
 * "restricted material is absent" is the one claim in this pipeline a reviewer
 * cannot verify by reading a prompt.
 */
export function findRedactedLeaks(records, redactedValues) {
  const leaks = [];
  for (const record of records) {
    const haystack = `${record.title}\n${record.text}`.toLowerCase();
    for (const value of redactedValues) {
      if (haystack.includes(value.toLowerCase())) leaks.push({ record: record.id, value });
    }
  }
  return leaks;
}

/* ---------- semantic records ---------- */

/**
 * A knowledge value as plain prose.
 *
 * Nodes in this file are either bare values or `{ value, confidence,
 * visibility }` wrappers; both read the same way from a record's point of view.
 */
function asText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return clean(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (typeof value === "object" && "value" in value) return asText(value.value);
  return "";
}

/** One `Label: value` line, or null when the value is missing or was removed. */
function fact(label, value, separator = ", ") {
  const text = Array.isArray(value)
    ? value.map(asText).filter(Boolean).join(separator)
    : asText(value);
  return text ? `${label}: ${text}` : null;
}

/** Sentence-shaped lists (highlights, proof points) read better run together. */
const prose = (label, value) => fact(label, value, " ");

const hostOf = (url) =>
  String(url || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");

const handleOf = (url) => {
  const parts = String(url || "").replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || "";
};

/** Canonical links, kept as metadata so the embedding text stays URL-free. */
const linksFrom = (entries) =>
  entries
    .map(([type, value]) => {
      const url = asText(value);
      return isHttpUrl(url) ? { type, url } : null;
    })
    .filter(Boolean);

function makeRecord({ id, entityType, title, lines, visibility = "public", tags = [], metadata = {} }) {
  const text = lines.filter(Boolean).join("\n");
  if (!text) return null;
  const tier = classifyVisibility(visibility);
  return {
    id,
    entityType,
    title,
    text,
    visibility: tier,
    priority: PRIORITY_BY_VISIBILITY[tier] || 3,
    tags: [...new Set(tags.map((tag) => clean(tag, 60).toLowerCase()).filter(Boolean))],
    metadata,
  };
}

const SKILL_GROUPS = Object.freeze([
  ["core_programming_languages", "programming", "Programming languages Kaan Balcı works in."],
  [
    "frameworks_runtime_and_app_tech",
    "frameworks",
    "Frameworks, runtimes and application technologies Kaan Balcı builds with.",
  ],
  ["web", "web", "Web development capabilities Kaan Balcı works with."],
  ["databases_and_data", "databases", "Database, data and analysis capabilities Kaan Balcı works with."],
  [
    "ai_and_automation",
    "ai-automation",
    "AI, conversational AI and workflow automation capabilities Kaan Balcı works with.",
  ],
  ["qa_and_reliability", "qa-reliability", "QA, testing and reliability capabilities Kaan Balcı works with."],
  ["game_development", "game-development", "Game development capabilities Kaan Balcı works with."],
  [
    "delivery_and_tools",
    "delivery-tools",
    "Delivery, tooling and collaboration platforms Kaan Balcı works with.",
  ],
  [
    "historical_self_reported_exposure_2025_not_default_proficiency",
    "historical-exposure",
    "Technologies Kaan Balcı self-reported exposure to in 2025. These are exposure, not claimed current proficiency.",
  ],
]);

function identityRecords(knowledge) {
  const identity = knowledge.identity || {};
  const headlines = identity.channel_specific_headlines || {};
  const disambiguation = knowledge.identity_disambiguation || {};
  const positioning = knowledge.current_positioning || {};
  return [
    makeRecord({
      id: "identity",
      entityType: "identity",
      title: "Kaan Balcı — identity, location and headline",
      lines: [
        "Who Kaan Balcı is, where he is based and how he currently describes himself.",
        fact("Full name", identity.full_name),
        fact("Location", identity.location),
        fact("Availability", identity.availability),
        fact("Portfolio headline", headlines.portfolio_primary),
        fact("CV headline", headlines.current_cv),
        fact("LinkedIn headline", headlines.linkedin),
        fact("Background descriptor", headlines.background_descriptor),
        fact("Summary", identity.canonical_summary),
      ],
      tags: [
        "kaan balcı",
        "kaan balci",
        "identity",
        "who is kaan",
        "location",
        "availability",
        "headline",
        "title",
      ],
      metadata: { snapshotDate: asText(knowledge.snapshot_date) },
    }),
    makeRecord({
      id: "identity-disambiguation",
      entityType: "identity",
      title: "Kaan Balcı — which Kaan Balcı this portfolio is about",
      lines: [
        "Several public people share the name Kaan Balcı. These signals identify the one this portfolio describes.",
        fact("Canonical identity signals", disambiguation.canonical_person?.signals),
        fact("Not this person", disambiguation.explicit_not_this_person, "; "),
        fact("Rule", disambiguation.rule),
      ],
      tags: ["kaan balcı", "identity", "disambiguation", "same name", "not this person"],
    }),
    makeRecord({
      id: "professional-positioning",
      entityType: "positioning",
      title: "Kaan Balcı — professional direction and target roles",
      lines: [
        "The direction Kaan Balcı is currently pursuing and the roles he is targeting.",
        fact("Primary direction", positioning.primary_direction),
        fact("Target roles", positioning.target_roles),
        fact("Core value proposition", positioning.core_value_proposition, "; "),
      ],
      tags: [
        "positioning",
        "target roles",
        "forward deployed engineer",
        "solution engineer",
        "applied ai",
        "career direction",
      ],
    }),
  ];
}

/**
 * Contacts, split by visibility tier on purpose.
 *
 * The public channels and the on-request phone number are separate records so
 * an ordinary "how do I reach Kaan" retrieval lands on the public one, and the
 * on-request tier never rides along as incidental context.
 */
function contactRecords(knowledge) {
  const contact = knowledge.contact_and_channels || {};
  const channelNames = [
    contact.portfolio && "personal portfolio website",
    contact.github && "GitHub profile",
    contact.linkedin && "LinkedIn profile",
    contact.primary_email && "email address",
    contact.instagram && "Instagram",
    contact.youtube && "YouTube channel",
    contact.x && "X (formerly Twitter)",
    contact.twitch && "Twitch channel",
    contact.resume && "downloadable CV/resume",
  ].filter(Boolean);

  return [
    makeRecord({
      id: "contacts",
      entityType: "contact",
      title: "Kaan Balcı — public contact channels",
      lines: [
        `How to reach Kaan Balcı and where to find his work: ${channelNames.join(", ")}.`,
        fact("Primary email", contact.primary_email),
        fact("Portfolio website", hostOf(asText(contact.portfolio))),
        fact("GitHub username", handleOf(asText(contact.github))),
        fact("LinkedIn profile handle", handleOf(asText(contact.linkedin))),
        fact("Instagram handle", handleOf(asText(contact.instagram))),
        fact("X handle", handleOf(asText(contact.x))),
        fact("Twitch channel", handleOf(asText(contact.twitch))),
        contact.resume ? "Resume: the portfolio publishes a canonical downloadable CV link." : null,
      ],
      tags: ["contact", "email", "linkedin", "github", "portfolio", "resume", "cv", "social", "reach kaan"],
      metadata: {
        links: linksFrom([
          ["portfolio", contact.portfolio],
          ["github", contact.github],
          ["linkedin", contact.linkedin],
          ["resume", contact.resume],
          ["instagram", contact.instagram],
          ["youtube", contact.youtube],
          ["x", contact.x],
          ["twitch", contact.twitch],
        ]),
        email: asText(contact.primary_email),
      },
    }),
    /* Named after the one detail it holds rather than after its tier. A record
     * whose text only said "contact detail shared on request" had no subject
     * for the embedding to sit on, and ranked top for questions as unrelated as
     * how many certificates Kaan holds — the precise accident the on-request
     * tier is supposed to avoid. Anchoring it on the words "phone number" keeps
     * it retrievable by someone asking for it and inert otherwise. */
    makeRecord({
      id: "contacts:on-request",
      entityType: "contact",
      title: "Kaan Balcı — phone number, shared on request",
      visibility: contact.phone?.visibility,
      lines: [
        "Kaan Balcı's telephone number. He shares it on request rather than publishing it by default, so it is not part of an ordinary answer about his work.",
        fact("Phone number", contact.phone),
        contact.phone?.status ? "Recorded in: his current CV and his LinkedIn export." : null,
      ],
      tags: ["phone", "phone number", "telephone", "call", "contact on request"],
    }),
  ];
}

function educationRecords(knowledge) {
  return (knowledge.education || []).map((entry) =>
    makeRecord({
      id: `education:${slugify(entry.institution)}`,
      entityType: "education",
      title: `${asText(entry.institution)} — ${asText(entry.program)}`,
      visibility: entry.visibility,
      lines: [
        `Kaan Balcı studied ${asText(entry.program)} at ${asText(entry.institution)}.`,
        fact("Degree", entry.degree),
        fact("Period", entry.canonical_period),
        fact("GPA", entry.gpa),
        fact("Honors", entry.honors),
        fact("Planned end date on LinkedIn", entry.planned_end_from_linkedin),
        fact("Additional user-confirmed detail", entry.additional_user_confirmed, "; "),
        fact("Notes", entry.notes),
      ],
      tags: ["education", "university", "degree", asText(entry.institution), asText(entry.program), "gpa"],
      metadata: {
        institution: asText(entry.institution),
        program: asText(entry.program),
        period: asText(entry.canonical_period),
      },
    }),
  );
}

function languageRecords(knowledge) {
  const languages = knowledge.spoken_languages || [];
  return [
    makeRecord({
      id: "spoken-languages",
      entityType: "language",
      title: "Kaan Balcı — spoken languages",
      lines: [
        "Languages Kaan Balcı speaks and the level he holds in each.",
        ...languages.map((entry) => fact(asText(entry.language), entry.level)),
      ],
      tags: ["languages", "spoken languages", "turkish", "english", "german", "language level"],
    }),
  ];
}

function skillRecords(knowledge) {
  const capabilities = knowledge.technical_capabilities || {};
  return SKILL_GROUPS.map(([key, slug, lead]) =>
    makeRecord({
      id: `skills:${slug}`,
      entityType: "skills",
      title: `Kaan Balcı — ${slug.replace(/-/g, " ")} skills`,
      lines: [
        lead,
        fact("Skills", capabilities[key]),
        slug === "historical-exposure" ? fact("Proficiency rule", capabilities.proficiency_rule) : null,
      ],
      tags: ["skills", "capabilities", slug, ...(Array.isArray(capabilities[key]) ? capabilities[key] : [])],
      metadata: { group: key, skills: Array.isArray(capabilities[key]) ? capabilities[key] : [] },
    }),
  );
}

/**
 * One record per role, including the two different roles at Punto.
 *
 * The entity id is the organization slug, disambiguated by the first word of
 * the role only when that organization appears more than once — so a repeat
 * employer becomes two separate entities without giving every other record a
 * needlessly long id.
 */
function experienceRecords(knowledge) {
  const entries = knowledge.professional_experience || [];
  const counts = new Map();
  entries.forEach((entry) => {
    const key = slugify(entry.organization);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return entries.map((entry) => {
    const org = slugify(entry.organization);
    const suffix = (counts.get(org) || 0) > 1 ? `-${slugify(entry.role).split("-")[0]}` : "";
    return makeRecord({
      id: `experience:${org}${suffix}`,
      entityType: "experience",
      title: `${asText(entry.organization)} — ${asText(entry.role)}`,
      visibility: entry.visibility,
      lines: [
        `Kaan Balcı worked at ${asText(entry.organization)} as ${asText(entry.role)}.`,
        fact("Period", entry.period),
        fact("Location", entry.location),
        fact("Work mode", entry.work_mode),
        prose("What he did there", entry.highlights),
        fact("Business address", entry.public_business_location),
        fact("Source status", entry.source_status),
      ],
      tags: [
        "experience",
        "work history",
        "employment",
        asText(entry.organization),
        asText(entry.role),
        asText(entry.period),
      ],
      metadata: {
        organization: asText(entry.organization),
        role: asText(entry.role),
        period: asText(entry.period),
        answerPolicy: asText(entry.public_answer_policy) || undefined,
      },
    });
  });
}

function achievementRecords(knowledge) {
  const signals = knowledge.achievements_and_signals || {};
  const contributed = signals.projects_contributed || {};
  const gameathon = signals.gameathon || {};
  const snapshot = signals.linkedin_dynamic_snapshot || {};
  return [
    makeRecord({
      id: "achievements",
      entityType: "achievement",
      title: "Kaan Balcı — achievements and signals",
      lines: [
        "Achievements, awards and measurable signals from Kaan Balcı's record.",
        contributed.value
          ? `Projects contributed: ${asText(contributed.value)} — ${asText(contributed.meaning)}`
          : null,
        gameathon.value ? `Gameathon: ${asText(gameathon.value)} Focus: ${asText(gameathon.details)}.` : null,
        fact("GPA", signals.gpa),
        signals.honor_student?.value ? "Honor student: yes" : null,
        fact("Recommendation themes on LinkedIn", signals.linkedin_recommendation_themes),
        snapshot.followers
          ? `LinkedIn audience on ${asText(snapshot.snapshot_date)}: ${asText(snapshot.followers)} followers, ${asText(snapshot.connections)} connections. ${asText(snapshot.rule)}`
          : null,
      ],
      tags: ["achievements", "awards", "gameathon", "gpa", "honor student", "recommendations", "50+ projects"],
    }),
  ];
}

function certificationRecords(knowledge) {
  const certifications = knowledge.certifications || {};
  const selected = certifications.selected_verified_current_site || [];
  const summary = makeRecord({
    id: "certifications:summary",
    entityType: "certification",
    title: "Kaan Balcı — certifications overview",
    lines: [
      `Kaan Balcı holds ${asText(certifications.canonical_total)} certificates in total.`,
      fact("Providers", certifications.providers),
      `Certificates verified on the public certificate page: ${selected.length}.`,
      fact("Rule", certifications.rule),
    ],
    tags: [
      "certifications",
      "certificates",
      "courses",
      "how many certificates",
      asText(certifications.canonical_total),
    ],
    metadata: { total: asText(certifications.canonical_total), verifiedCount: selected.length },
  });

  const individual = selected.map((entry) =>
    makeRecord({
      id: `certifications:${slugify(entry.title)}`,
      entityType: "certification",
      title: `Certificate — ${asText(entry.title)}`,
      lines: [
        `Kaan Balcı completed the certificate "${asText(entry.title)}".`,
        fact("Provider", entry.provider),
        fact("Completed", entry.completed),
      ],
      tags: ["certificate", asText(entry.provider), asText(entry.title)],
      metadata: { provider: asText(entry.provider), completed: asText(entry.completed) },
    }),
  );

  return [summary, ...individual];
}

/**
 * Projects, one record per project, never merged.
 *
 * Each record's stack line comes only from that project's own `stack`, which is
 * what keeps Hospital Form App's C#/.NET facts out of Hospital Appointment
 * System's Python/Tkinter record, and Merge Rush's Phaser stack out of SINAMA's.
 */
function projectRecords(knowledge) {
  const projects = knowledge.projects || {};

  const flagship = Object.entries(projects.flagship || {}).map(([key, entry]) => {
    const name = asText(entry.name) || key;
    const privateRepo = /private/i.test(asText(entry.repo_visibility));
    return makeRecord({
      id: `project:${slugify(key)}`,
      entityType: "project",
      title: name,
      lines: [
        `${name} is one of Kaan Balcı's flagship projects.`,
        fact("Status", entry.status),
        fact("Role", entry.role),
        fact("Category", entry.category),
        fact("Summary", entry.summary),
        fact("Technologies", entry.stack),
        fact("Public-safe architecture", entry.architecture_public_safe, "; "),
        fact("Evidence", entry.current_proof_from_repo || entry.proof, "; "),
        privateRepo ? "Repository: private, so no public repository link is offered." : null,
        fact("Conflict note", entry.conflict_note),
        entry.links
          ? fact("Canonical links", Object.keys(entry.links).map((kind) => kind.replace(/_/g, " ")))
          : null,
      ],
      tags: ["project", name, key, ...(Array.isArray(entry.stack) ? entry.stack : [])],
      metadata: {
        flagship: true,
        status: asText(entry.status),
        category: asText(entry.category),
        stack: Array.isArray(entry.stack) ? entry.stack : [],
        repoVisibility: privateRepo ? "private" : undefined,
        links: linksFrom(Object.entries(entry.links || {})),
      },
    });
  });

  const catalog = (projects.portfolio_catalog || []).map((entry) =>
    makeRecord({
      id: `project:${slugify(entry.name)}`,
      entityType: "project",
      title: asText(entry.name),
      lines: [
        `${asText(entry.name)} is a project in Kaan Balcı's portfolio catalog.`,
        fact("Category", entry.category),
        fact("Technologies", entry.stack),
      ],
      tags: [
        "project",
        asText(entry.name),
        asText(entry.category),
        ...(Array.isArray(entry.stack) ? entry.stack : []),
      ],
      metadata: {
        flagship: false,
        category: asText(entry.category),
        stack: Array.isArray(entry.stack) ? entry.stack : [],
      },
    }),
  );

  return [...flagship, ...catalog];
}

function githubRecords(knowledge) {
  const github = knowledge.github || {};
  const snapshot = github.dynamic_profile_snapshot || {};
  return [
    makeRecord({
      id: "github:summary",
      entityType: "github",
      title: "Kaan Balcı — GitHub account summary",
      lines: [
        "Kaan Balcı's public GitHub account and what it contains.",
        fact("GitHub username", github.username),
        fact("Repository count", github.reconciliation),
        fact("Repository names", github.public_repositories),
        fact("Snapshot date", github.snapshot_date),
        snapshot.stars !== undefined
          ? `Profile snapshot: ${asText(snapshot.stars)} stars, ${asText(snapshot.followers)} followers, ${asText(snapshot.following)} following. ${asText(snapshot.note)}`
          : null,
      ],
      tags: ["github", "repositories", "repos", "open source", asText(github.username), "how many repositories"],
      metadata: {
        username: asText(github.username),
        links: linksFrom([["github", github.canonical_url]]),
      },
    }),
  ];
}

function workStyleRecords(knowledge) {
  const style = knowledge.soft_skills_and_work_style || {};
  const recruiter = knowledge.recruiter_intelligence || {};
  const personal = knowledge.public_personal_context || {};
  return [
    makeRecord({
      id: "soft-skills",
      entityType: "soft-skills",
      title: "Kaan Balcı — soft skills",
      lines: [
        "Soft skills Kaan Balcı's own record and third-party recommendations support.",
        fact("Directly supported by his record", style.directly_supported),
        fact("Themes in third-party recommendations", style.third_party_recommendation_themes),
      ],
      tags: ["soft skills", "communication", "teamwork", "problem solving", "collaboration"],
    }),
    makeRecord({
      id: "work-style",
      entityType: "work-style",
      title: "Kaan Balcı — how he works",
      lines: [
        "The method Kaan Balcı follows when he takes on a problem.",
        fact("Working method", style.working_method, "; "),
      ],
      tags: ["work style", "working method", "process", "how he works"],
    }),
    makeRecord({
      id: "recruiter-intelligence",
      entityType: "recruiter-intelligence",
      title: "Kaan Balcı — role fit and hiring evidence",
      lines: [
        "How Kaan Balcı's evidence maps onto the roles he is targeting, and the limits of that evidence.",
        fact("Best fit story", recruiter.best_fit_story),
        fact(
          "Strongest evidence for forward deployed engineering",
          recruiter.strongest_evidence_for_forward_deployed_engineering,
          "; ",
        ),
        fact("Strongest evidence for applied AI", recruiter.strongest_evidence_for_applied_ai),
        fact("Strongest evidence for software engineering", recruiter.strongest_evidence_for_software_engineering),
        fact("Do not overclaim", recruiter.do_not_overclaim, " "),
      ],
      tags: ["recruiter", "hiring", "role fit", "why hire kaan", "strengths", "evidence"],
    }),
    makeRecord({
      id: "personal-context",
      entityType: "personal-context",
      title: "Kaan Balcı — interests outside work",
      visibility: personal.visibility,
      lines: [
        "Public personal context about Kaan Balcı, for culture-fit and personal-interest questions rather than a default recruiter answer.",
        fact("Interests", personal.interests),
      ],
      tags: ["interests", "hobbies", "personal", "culture fit", "basketball", "cycling", "gaming"],
    }),
  ];
}

/**
 * Every semantic record the master knowledge produces, in a stable order.
 *
 * `knowledge` must already have been through sanitizeKnowledge().
 */
export function buildMasterKnowledgeRecords(knowledge) {
  return [
    ...identityRecords(knowledge),
    ...contactRecords(knowledge),
    ...educationRecords(knowledge),
    ...languageRecords(knowledge),
    ...skillRecords(knowledge),
    ...experienceRecords(knowledge),
    ...achievementRecords(knowledge),
    ...certificationRecords(knowledge),
    ...projectRecords(knowledge),
    ...githubRecords(knowledge),
    ...workStyleRecords(knowledge),
  ].filter(Boolean);
}

/** The node a sanitizeKnowledge() removal path points at, read from the raw tree. */
function nodeAtPath(raw, path) {
  return path.split(".").reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    return Array.isArray(current) ? current[Number(key) - 1] : current[key];
  }, raw);
}

/**
 * Read, sanitize and recordize the canonical knowledge file. Called once.
 *
 * Throws when a removed value reappears in a record: an index that cannot be
 * built is a recoverable outage — the browser keeps its deterministic answers —
 * whereas an index that has already served a restricted value cannot be
 * un-served.
 */
export async function loadMasterKnowledge(dataDir) {
  const raw = JSON.parse(await readFile(resolve(dataDir, MASTER_KNOWLEDGE_FILE), "utf8"));
  const removed = [];
  const knowledge = sanitizeKnowledge(raw, [], removed);

  const redactedValues = new Set();
  for (const entry of removed) collectRedactedValues(nodeAtPath(raw, entry.path), redactedValues);

  const records = buildMasterKnowledgeRecords(knowledge);
  const leaks = findRedactedLeaks(records, redactedValues);
  if (leaks.length) {
    throw new Error(
      `master knowledge leaked ${leaks.length} restricted value(s), first in record "${leaks[0].record}"`,
    );
  }

  return {
    knowledge,
    records,
    removed,
    redactedValues,
    stats: {
      records: records.length,
      publicRecords: records.filter((record) => record.visibility === "public").length,
      onRequestRecords: records.filter((record) => record.visibility === "public_on_request").length,
      privacyExcluded: removed.length,
    },
  };
}
