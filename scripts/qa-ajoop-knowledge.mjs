#!/usr/bin/env node
/**
 * qa-ajoop-knowledge.mjs — ingestion contracts for the canonical Ajoop knowledge.
 *
 * Covers what Brief 1 actually promises and nothing beyond it: that the master
 * knowledge file parses, that it becomes per-entity semantic records, that
 * restricted material is ABSENT from the embedding corpus rather than merely
 * discouraged, that project entities stay separated, that canonical links
 * survive as metadata without polluting embedding text, and that the index
 * still initializes.
 *
 * Retrieval quality, alias handling, exact-fact routing and evidence UI belong
 * to later briefs and are deliberately not asserted here.
 *
 * Node built-ins only, consistent with the other qa-* checks. No network, no
 * Ollama: embeddings are stubbed.
 *
 *   node scripts/qa-ajoop-knowledge.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MASTER_KNOWLEDGE_FILE,
  MASTER_KNOWLEDGE_SOURCE,
  buildMasterKnowledgeRecords,
  classifyVisibility,
  findRedactedLeaks,
  loadMasterKnowledge,
  sanitizeKnowledge,
} from "../server/ajoop-knowledge.mjs";
import { createAjoopRag } from "../server/ajoop-rag.mjs";

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (Object.is(actual, expected)) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
};
const ok = (label, condition) => check(label, Boolean(condition), true);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = resolve(ROOT, "data", "portfolio");
const ORIGIN = "https://kaanbalci.com";
const ENV = { AJOOP_AI_ALLOWED_ORIGINS: ORIGIN };

/* ---------- A. the canonical file is present and well formed ---------- */

const rawText = readFileSync(resolve(DATA_DIR, MASTER_KNOWLEDGE_FILE), "utf8");
let raw = null;
try {
  raw = JSON.parse(rawText);
  passed += 1;
} catch (error) {
  failures.push(`the canonical knowledge file must parse as JSON: ${error.message}`);
}

check("the runtime reads it from data/portfolio", MASTER_KNOWLEDGE_FILE, "ajoop-master-knowledge.json");
ok("it declares a schema version", typeof raw?.schema_version === "string");
ok("it declares a snapshot date", typeof raw?.snapshot_date === "string");
for (const section of [
  "source_priority",
  "identity",
  "contact_and_channels",
  "current_positioning",
  "education",
  "spoken_languages",
  "technical_capabilities",
  "professional_experience",
  "achievements_and_signals",
  "certifications",
  "projects",
  "github",
  "recruiter_intelligence",
  "soft_skills_and_work_style",
  "aliases_and_typos",
  "privacy_and_answer_boundaries",
  "conflict_resolution",
  "sources",
]) {
  ok(`it carries the ${section} section`, Boolean(raw?.[section]));
}

/* The source-priority hierarchy survives ingestion. Brief 3 ranks with it; this
 * brief only has to avoid throwing it away. */
ok("the source-priority hierarchy is preserved", (raw?.source_priority || []).length >= 8);

/* ---------- the visibility boundary ---------- */

check("public is indexable", classifyVisibility("public"), "public");
check("public_on_request is indexable", classifyVisibility("public_on_request"), "public_on_request");
check(
  "an on-request tier with a caveat is still on-request",
  classifyVisibility("public_on_request_not_recruiter_default"),
  "public_on_request",
);
for (const marker of [
  "restricted",
  "restricted_pending_public_clearance",
  "do_not_offer_by_default",
  "private",
  "internal",
  "confidential",
  "something_nobody_has_defined_yet",
]) {
  check(`${marker} is restricted`, classifyVisibility(marker), "restricted");
}

/* ---------- B1. restricted VALUES are absent from the committed source ------
 *
 * Repository visibility is independent of RAG visibility. This file is
 * committed to a public GitHub repository, so a value that sanitization keeps
 * out of the embedding index is still published the moment it is written here.
 * The checks below therefore run against the RAW committed JSON, before any
 * sanitization.
 *
 * They are deliberately written as invariants over shape and pattern rather
 * than as a list of forbidden strings: a test that named the removed values
 * would republish them in this file instead.
 */

/** Keys a restricted node may still carry. Everything else is a value payload. */
const POLICY_KEYS = new Set([
  "visibility",
  "rule",
  "status",
  "note",
  "notes",
  "reason",
  "policy",
  "source_status",
  "value_redacted",
  "values_redacted",
]);

/** Every node in the raw tree, with the dotted path that reaches it. */
function walkNodes(value, path = "", into = []) {
  if (!value || typeof value !== "object") return into;
  if (Array.isArray(value)) {
    value.forEach((item, position) => walkNodes(item, `${path}.${position + 1}`, into));
    return into;
  }
  into.push({ path: path || "(root)", node: value });
  Object.entries(value).forEach(([key, child]) => walkNodes(child, path ? `${path}.${key}` : key, into));
  return into;
}

const rawNodes = walkNodes(raw);
const restrictedNodes = rawNodes.filter(
  ({ node }) => "visibility" in node && classifyVisibility(node.visibility) === "restricted",
);

ok("the committed file still marks restricted nodes", restrictedNodes.length > 0);
for (const { path, node } of restrictedNodes) {
  const payloadKeys = Object.keys(node).filter((key) => !POLICY_KEYS.has(key));
  check(
    `${path} is marked restricted and carries policy only, no value payload`,
    payloadKeys.join(", "),
    "",
  );
}

/* The two fields the brief names are redacted in place rather than deleted, so
 * the policy that protects them survives in the committed file. */
const cbot = (raw?.professional_experience || []).find((entry) => entry.organization === "CBOT");
const clientField = cbot?.specific_client_names_user_reported;
ok("the CBOT client-name field still exists as policy", Boolean(clientField));
check("it is still marked restricted", classifyVisibility(clientField?.visibility), "restricted");
check("its values are declared redacted", clientField?.values_redacted, true);
ok("it carries no values array", !("values" in (clientField || {})));
ok("its rule still forbids guessing a client name", /never guess/i.test(clientField?.rule || ""));

const legacyField = raw?.contact_and_channels?.legacy_secondary_email;
ok("the legacy secondary email field still exists as policy", Boolean(legacyField));
check("it is still marked restricted", classifyVisibility(legacyField?.visibility), "restricted");
check("its value is declared redacted", legacyField?.value_redacted, true);
ok("it carries no value", !("value" in (legacyField || {})));
ok("its rule still forbids offering the legacy address", /never guess/i.test(legacyField?.rule || ""));

/* Pattern sweeps over the whole committed text. These catch a restricted value
 * reintroduced anywhere in the file, including somewhere nobody thought to
 * mark, without this test having to know what that value is. */
{
  const emails = [...new Set(rawText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])];
  const publicEmail = raw?.contact_and_channels?.primary_email?.value;
  check("the committed file contains exactly one email address", emails.length, 1);
  check("and it is the public primary one", emails[0], publicEmail);

  const phones = [...new Set(rawText.match(/\+[0-9][0-9 ()-]{7,}/g) || [])];
  const publicPhone = raw?.contact_and_channels?.phone?.value;
  check("the committed file contains exactly one phone number", phones.length, 1);
  check("and it is the public-on-request one", phones[0], publicPhone);
}

/* No credential-shaped key exists in the committed file at all. */
{
  const credentialKeys = rawNodes.flatMap(({ path, node }) =>
    Object.keys(node)
      .filter((key) => /(pass(word|phrase)|secret|token|api[_-]?key|apikey|credential|private[_-]?key|access[_-]?key|tunnel[_-]?id)/i.test(key))
      .map((key) => `${path}.${key}`),
  );
  check("the committed file holds no credential-shaped key", credentialKeys.join(", "), "");
}

/* ---------- B2. restricted material never reaches the corpus ---------- */

const loaded = await loadMasterKnowledge(DATA_DIR);
const corpusText = loaded.records.map((record) => `${record.title}\n${record.text}`).join("\n").toLowerCase();
const metadataText = JSON.stringify(loaded.records.map((record) => record.metadata)).toLowerCase();

/* ---------- B1b. every experience belongs to Kaan ----------
 *
 * A "Simay Bülbül Design" internship was once recorded here. It is another
 * person's history that was mixed into Kaan's prior context, and a CV claim
 * that belongs to someone else is a worse defect than a missing one — it is
 * wrong about two people at once.
 *
 * The guard is a CLOSED ALLOWLIST rather than a check for that one name,
 * because the failure mode is "a record nobody meant to add", and the next one
 * will have a different name. Adding any organization to the canonical file
 * fails this until a human puts it in the list on purpose.
 */
const KAAN_EMPLOYERS = [
  "Atölye Joyday",
  "CBOT",
  "Ocean's Team",
  "Outlier AI",
  "Punto Organization",
];
{
  const organizations = [...new Set((raw?.professional_experience || []).map((entry) => entry.organization))].sort();
  check(
    "professional experience contains only Kaan's own employers",
    organizations.join(" | "),
    KAAN_EMPLOYERS.join(" | "),
  );

  /* His canonical internship is the Punto one, unchanged. */
  const internship = (raw?.professional_experience || []).find(
    (entry) => entry.organization === "Punto Organization" && /intern/i.test(entry.role),
  );
  ok("the canonical internship is still recorded", Boolean(internship));
  check("it is the software development internship", internship?.role, "Software Development Intern");
  check("with its canonical period", internship?.period, "Jul 2024 - Sep 2024");

  /* The specific misattribution, checked by name at every layer it could
   * survive at: the committed source, the generated records, and the text
   * actually handed to the embedding model. */
  const FOREIGN = ["simay", "bülbül", "bulbul", "sample-to-sewing", "fashion-week", "showroom"];
  for (const term of FOREIGN) {
    ok(`the committed knowledge does not mention "${term}"`, !rawText.toLowerCase().includes(term));
  }
  const generated = loaded.records.map((record) => `${record.id} ${record.title} ${record.text}`).join("\n").toLowerCase();
  for (const term of FOREIGN) {
    ok(`no generated record mentions "${term}"`, !generated.includes(term));
  }

  /* And every experience record maps back to an allowlisted employer. */
  const experienceRecords = loaded.records.filter((record) => record.entityType === "experience");
  ok("there are experience records", experienceRecords.length > 0);
  ok(
    "every experience record names an allowlisted employer",
    experienceRecords.every((record) => KAAN_EMPLOYERS.includes(record.metadata?.organization)),
  );
  check(
    "one record per role, none missing and none extra",
    experienceRecords.length,
    (raw?.professional_experience || []).length,
  );
}

/* Redacting the values did not relax the runtime boundary: the restricted nodes
 * are still dropped whole, so even their surviving policy prose stays out of
 * the index. */
check("both restricted fields are still removed at runtime", loaded.stats.privacyExcluded, 2);
ok(
  "the sanitized tree has no client-name field",
  !("specific_client_names_user_reported" in
    (loaded.knowledge.professional_experience.find((entry) => entry.organization === "CBOT") || {})),
);
ok(
  "the sanitized tree has no legacy secondary email",
  !("legacy_secondary_email" in (loaded.knowledge.contact_and_channels || {})),
);
ok("no restricted value leaked into a record", findRedactedLeaks(loaded.records, loaded.redactedValues).length === 0);

/* The same pattern sweeps, now over the records rather than the source. An
 * address or number that reached a record from anywhere would show up here. */
{
  const emails = [...new Set((corpusText + metadataText).match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [])];
  check("the records contain exactly one email address", emails.length, 1);
  check(
    "and it is the public primary one",
    emails[0],
    String(raw?.contact_and_channels?.primary_email?.value).toLowerCase(),
  );
  const phones = [...new Set(corpusText.match(/\+[0-9][0-9 ()-]{7,}/g) || [])];
  check("the records contain exactly one phone number", phones.length, 1);
  check("and it is the public-on-request one", phones[0], raw?.contact_and_channels?.phone?.value);
}

/* Every indexed record is on an allowed tier, and the strictest tier is what a
 * novel marker falls back to. */
ok(
  "every record is public or public-on-request",
  loaded.records.every((record) => ["public", "public_on_request"].includes(record.visibility)),
);
/* Named rather than counted: a bare number would still pass if one on-request
 * record were swapped for another, and this tier is exactly where a record
 * appearing unnoticed matters most. */
check(
  "the on-request tier holds only the records it should",
  loaded.records
    .filter((record) => record.visibility === "public_on_request")
    .map((record) => record.id)
    .sort()
    .join(", "),
  "contacts:on-request, personal-context",
);
ok(
  "the phone number lives only in its own on-request record",
  loaded.records.filter((record) => record.text.includes("+90 507")).map((record) => record.id).join() ===
    "contacts:on-request",
);

/* A credential-shaped key is dropped on name alone, even unmarked. */
{
  const removed = [];
  const sanitized = sanitizeKnowledge(
    { github: { username: "UAJOP", api_key: "sk-live-should-never-index", access_token: "abc123" } },
    [],
    removed,
  );
  check("a credential key is dropped without a visibility marker", removed.length, 2);
  ok("its siblings survive", sanitized.github.username === "UAJOP");
  ok("the credential value is gone", !JSON.stringify(sanitized).includes("sk-live-should-never-index"));
}

/* An unrecognised visibility marker fails closed rather than open. */
{
  const removed = [];
  const sanitized = sanitizeKnowledge(
    { secretive: { value: "unreleased client", visibility: "pending_legal_review" } },
    [],
    removed,
  );
  check("an unknown visibility marker is treated as restricted", removed.length, 1);
  ok("its value never reaches the tree", !JSON.stringify(sanitized).includes("unreleased client"));
}

/* And the leak detector itself detects, so the guard above is not vacuous. The
 * planted value is synthetic on purpose: a real restricted value written here
 * would be published by this file instead of by the one it protects. */
ok(
  "the leak detector catches a planted restricted value",
  findRedactedLeaks(
    [{ id: "planted", title: "t", text: "Restricted Example Holding A.Ş." }],
    new Set(["Restricted Example Holding A.Ş."]),
  ).length === 1,
);

/* ---------- C. representative public knowledge is present ---------- */

const byId = new Map(loaded.records.map((record) => [record.id, record]));
const recordText = (id) => byId.get(id)?.text || "";

for (const id of [
  "identity",
  "professional-positioning",
  "contacts",
  "education:izmir-university-of-economics",
  "education:anadolu-university-open-education-faculty",
  "spoken-languages",
  "skills:programming",
  "skills:ai-automation",
  "experience:cbot",
  "experience:outlier-ai",
  "certifications:summary",
  "achievements",
  "project:sinama",
  "project:merge-rush-tiny-factory",
  "github:summary",
  "recruiter-intelligence",
  "soft-skills",
  "work-style",
]) {
  ok(`there is a record for ${id}`, byId.has(id));
}

ok("the identity record names Kaan Balcı", recordText("identity").includes("Kaan Balcı"));
ok("the identity record carries his location", recordText("identity").includes("Istanbul"));
ok("the programming record lists C# and Python", /C#/.test(recordText("skills:programming")) && /Python/.test(recordText("skills:programming")));
ok(
  "the CBOT record keeps the generalized sector evidence",
  /banking, insurance, municipal services and employee benefits/i.test(recordText("experience:cbot")),
);
ok("the CBOT record keeps the 500+ node migration", recordText("experience:cbot").includes("500+"));
ok("the certifications record states the 25+ total", recordText("certifications:summary").includes("25+"));
ok("the education record carries the GPA", recordText("education:izmir-university-of-economics").includes("3.07"));
ok("the GitHub record reconciles the repository count", /24|25/.test(recordText("github:summary")));
ok("the GitHub record names the account", recordText("github:summary").includes("UAJOP"));

/* Each record is one concept, not a dump of the whole file. */
check(
  "no record is a monolith",
  loaded.records.filter((record) => record.text.length > 2000).length,
  0,
);
ok("record ids are unique", new Set(loaded.records.map((record) => record.id)).size === loaded.records.length);
ok("every record declares an entity type", loaded.records.every((record) => Boolean(record.entityType)));
ok("every record declares a priority", loaded.records.every((record) => Number.isInteger(record.priority)));

/* Recordizing is deterministic: the same input yields the same output. */
{
  const again = buildMasterKnowledgeRecords(loaded.knowledge);
  check(
    "recordizing the same knowledge twice is identical",
    JSON.stringify(again),
    JSON.stringify(loaded.records),
  );
}

/* ---------- D. project entities stay separated ---------- */

const formApp = recordText("project:hospital-form-app");
const appointments = recordText("project:hospital-appointment-system");
const mergeRush = recordText("project:merge-rush-tiny-factory");
const sinama = recordText("project:sinama");

ok("Hospital Form App is its own record", Boolean(formApp));
ok("Hospital Form App keeps its C#/.NET stack", /C#/.test(formApp) && /\.NET/.test(formApp) && /Windows Forms/.test(formApp));
ok("Hospital Form App does not inherit Python", !/Python/i.test(formApp));
ok("Hospital Form App does not inherit Tkinter", !/Tkinter/i.test(formApp));

ok("Hospital Appointment System is its own record", Boolean(appointments));
ok("Hospital Appointment System keeps its Python/Tkinter stack", /Python/.test(appointments) && /Tkinter/.test(appointments));
ok("Hospital Appointment System does not inherit C#", !/C#/.test(appointments));
ok("Hospital Appointment System does not inherit Windows Forms", !/Windows Forms/i.test(appointments));

ok("Merge Rush keeps Phaser and TypeScript", /Phaser 3/.test(mergeRush) && /TypeScript/.test(mergeRush));
ok("Merge Rush does not contain FastAPI", !/FastAPI/i.test(mergeRush));
ok("Merge Rush does not contain Next.js", !/Next\.js/i.test(mergeRush));

ok("SINAMA keeps FastAPI and Next.js", /FastAPI/.test(sinama) && /Next\.js/.test(sinama));
ok("SINAMA does not contain Phaser", !/Phaser/i.test(sinama));
ok("SINAMA does not contain Vitest", !/Vitest/i.test(sinama));

/* The catalog is many records, not one "projects" document. */
{
  const projects = loaded.records.filter((record) => record.entityType === "project");
  ok("the catalog produced a record per project", projects.length >= 25);
  ok("each project record names exactly one project", projects.every((record) => record.text.split("\n")[0].includes(record.title)));
}

/* ---------- E. links survive as metadata, not as embedding noise ---------- */

ok(
  "no record injects a raw URL into its embedding text",
  loaded.records.every((record) => !/https?:\/\//i.test(record.text)),
);

const contactLinks = byId.get("contacts")?.metadata?.links || [];
const linkUrl = (links, type) => (links.find((link) => link.type === type) || {}).url;
check("the canonical portfolio link survives", linkUrl(contactLinks, "portfolio"), raw?.contact_and_channels?.portfolio?.value);
check("the canonical LinkedIn link survives", linkUrl(contactLinks, "linkedin"), raw?.contact_and_channels?.linkedin?.value);
check("the canonical GitHub link survives", linkUrl(contactLinks, "github"), raw?.contact_and_channels?.github?.value);
check("the canonical resume link survives", linkUrl(contactLinks, "resume"), raw?.contact_and_channels?.resume?.value);

const sinamaLinks = byId.get("project:sinama")?.metadata?.links || [];
check("SINAMA keeps its live URL", linkUrl(sinamaLinks, "live"), raw?.projects?.flagship?.SINAMA?.links?.live);
check("SINAMA keeps its case-study URL", linkUrl(sinamaLinks, "case_study"), raw?.projects?.flagship?.SINAMA?.links?.case_study);
check("the GitHub record keeps its canonical URL", linkUrl(byId.get("github:summary")?.metadata?.links || [], "github"), raw?.github?.canonical_url);

/* A private repository is named as private and offered no link. */
{
  const record = byId.get("project:merge-rush-tiny-factory");
  check("Merge Rush offers no repository link", (record?.metadata?.links || []).length, 0);
  check("Merge Rush records that its repository is private", record?.metadata?.repoVisibility, "private");
}

/* ---------- F. the index still initializes ---------- */

let embedCalls = 0;
const embedStub = async (url, init) => {
  if (String(url).includes("/api/chat")) throw new Error("generation is not exercised here");
  embedCalls += 1;
  const batch = JSON.parse(init.body).input;
  return { ok: true, json: async () => ({ embeddings: batch.map(() => [1, 0, 0]) }) };
};

const rag = createAjoopRag({ env: ENV, fetchImpl: embedStub });
const status = await rag.initialize();

ok("the index builds", status.ready);
ok("it embeds every chunk once", embedCalls > 0);
check("the seven existing datasets still build", status.datasets, 7);
ok("the existing datasets still produce their chunks", status.datasetChunks > 100);
check("every master record is indexed", status.masterKnowledgeRecords, loaded.records.length);
ok("master records reach the index as chunks", status.masterKnowledgeChunks >= status.masterKnowledgeRecords);
check("privacy exclusions are reported", status.privacyExcluded, 2);
check("no duplicate chunk is embedded", status.duplicateChunks, 0);
ok("the combined corpus is larger than either half", status.chunks > status.datasetChunks);

const health = await rag.handle({
  method: "POST",
  origin: ORIGIN,
  contentType: "application/json",
  body: JSON.stringify({ version: 1, mode: "health" }),
});
check("health answers 200", health.status, 200);
check("health reports ready", health.body.ready, true);
check("health reports available", health.body.ok, true);
check("health keeps its mode field", health.body.mode, "rag");
ok("health keeps naming the generation model", typeof health.body.model === "string" && health.body.model.length > 0);
check("health keeps naming the embedding model", health.body.embedModel, "qwen3-embedding:0.6b");
check("health keeps reporting the chunk count", health.body.chunks, status.chunks);
check("health adds the master-knowledge record count", health.body.masterKnowledgeRecords, loaded.records.length);
check("health adds the indexed public record count", health.body.indexedPublicRecords, loaded.stats.publicRecords);

/* The corpus that was actually embedded — not the records before chunking — is
 * the thing that must be clean. This reads it back off the built index. */
{
  const indexed = [];
  const capturing = async (url, init) => {
    if (String(url).includes("/api/chat")) throw new Error("generation is not exercised here");
    const batch = JSON.parse(init.body).input;
    indexed.push(...batch);
    return { ok: true, json: async () => ({ embeddings: batch.map(() => [1, 0, 0]) }) };
  };
  const capturingRag = createAjoopRag({ env: ENV, fetchImpl: capturing });
  await capturingRag.initialize();
  const embedded = indexed.join("\n").toLowerCase();

  /* Same pattern sweep, at the last point where anything could still leak: the
   * bytes actually sent to the embedding model. */
  const embeddedEmails = [...new Set(embedded.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [])];
  check("exactly one email address is ever embedded", embeddedEmails.length, 1);
  check(
    "and it is the public primary one",
    embeddedEmails[0],
    String(raw?.contact_and_channels?.primary_email?.value).toLowerCase(),
  );
  const embeddedPhones = [...new Set(embedded.match(/\+[0-9][0-9 ()-]{7,}/g) || [])];
  check("exactly one phone number is ever embedded", embeddedPhones.length, 1);
  check("and it is the public-on-request one", embeddedPhones[0], raw?.contact_and_channels?.phone?.value);
  /* The policy prose that replaced the removed values stays out too: the whole
   * restricted node is dropped, not just its payload. */
  ok(
    "no embedding input carries the redaction policy prose",
    !embedded.includes("deliberately not stored in this file"),
  );
  for (const term of ["simay", "bülbül", "bulbul", "sample-to-sewing", "fashion-week", "showroom"]) {
    ok(`no embedding input mentions "${term}"`, !embedded.includes(term));
  }
  ok(
    "every embedding input is a chunk, not the whole file",
    indexed.every((text) => text.length <= 1400),
  );
  ok(
    "the master knowledge is embedded as many records",
    indexed.filter((text) => text.includes(`source: ${MASTER_KNOWLEDGE_SOURCE}`)).length >= loaded.records.length,
  );
}

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Ajoop knowledge ingestion: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(
  `Ajoop knowledge ingestion contracts passed. ${passed} assertions · ` +
    `${loaded.stats.records} semantic records · ${loaded.stats.privacyExcluded} restricted field(s) excluded · no network, no Ollama.`,
);
