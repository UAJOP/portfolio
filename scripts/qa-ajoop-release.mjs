#!/usr/bin/env node
/**
 * qa-ajoop-release.mjs — the AJOOP 5.2 friends-beta release gate.
 *
 * This suite is not a second copy of the per-layer suites. It asserts the small
 * set of properties that would make a public answer WRONG rather than merely
 * imperfect, end to end through `createAjoopRag`, and it asserts them under
 * hostile conditions:
 *
 *   The embeddings are ADVERSARIAL on purpose. Every isolation and privacy case
 *   scores the record that MUST NOT win at ~1.0 and the correct one at ~0.0. A
 *   pass therefore proves deterministic filtering overruled similarity, not that
 *   similarity happened to agree. Realistic embeddings would pass just as
 *   happily with the protection deleted.
 *
 * Section J closes the remaining hole: a green suite proves nothing unless its
 * assertions can fail. It edits real module source, imports the mutant, and
 * requires the corresponding release invariant to break — then deletes every
 * mutant. Residue is checked, not assumed.
 *
 * Node built-ins only. No network, no Ollama.
 *
 *   node scripts/qa-ajoop-release.mjs
 */
import { readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMasterKnowledge } from "../server/ajoop-knowledge.mjs";
import { createAjoopRag } from "../server/ajoop-rag.mjs";
import { selectAnswerStrategy } from "../server/ajoop-answer.mjs";

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
const SERVER_DIR = resolve(ROOT, "server");
const DATA_DIR = resolve(ROOT, "data", "portfolio");
const ORIGIN = "https://kaanbalci.com";
const ENV = { AJOOP_AI_ALLOWED_ORIGINS: ORIGIN };

const knowledge = await loadMasterKnowledge(DATA_DIR);
const recordById = new Map(knowledge.records.map((record) => [record.id, record]));
const ON_REQUEST_IDS = knowledge.records
  .filter((record) => record.visibility === "public_on_request")
  .map((record) => record.id);
/* The phone value itself: the one string whose presence anywhere in a prompt or
 * an answer is a privacy incident rather than a quality problem. */
const PHONE_VALUE = (recordById.get("contacts:on-request")?.text.match(/Phone number:\s*([+\d ()-]{8,})/) || [])[1]?.trim();
const CANONICAL_EMPLOYERS = knowledge.records
  .filter((record) => record.id.startsWith("experience:"))
  .map((record) => record.id);

ok("the on-request tier is populated", ON_REQUEST_IDS.length > 0);
ok("the phone value was located for leak checks", Boolean(PHONE_VALUE && PHONE_VALUE.length >= 8));
ok("canonical employers were located", CANONICAL_EMPLOYERS.length >= 5);

/* ---------- harness ---------- */

/**
 * A RAG instance whose embeddings put `bias` at the TOP of the ranking.
 *
 * The query is pinned to [1, 0, 0]; a chunk matching `bias` is given the same
 * direction and scores ~1.0 while everything else scores ~0.0. Passing the
 * record that must LOSE as the bias is the entire point.
 *
 * `reply` may return a raw model string; the default answers the contract the
 * strategy asked for, so ordinary cases exercise the happy path and only the
 * generation-safety section returns malformed drafts.
 */
const NO_BIAS = () => false;
const defaultReply = ({ prompt }) => {
  const scope = /^Answer strategy: (?:general|self-about-ajoop)\b/m.test(prompt) ? "GENERAL" : "PORTFOLIO";
  return ` ${scope}\nANSWER: Stubbed release answer.`;
};
const makeRag = async (bias = NO_BIAS, reply = defaultReply, ragFactory = createAjoopRag) => {
  const state = { embed: 0, chat: 0, built: false, prompts: [], queries: [] };
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).includes("/api/chat")) {
      state.chat += 1;
      const prompt = body.messages.map((message) => message.content).join("\n");
      state.prompts.push(prompt);
      return { ok: true, json: async () => ({ message: { content: reply({ state, prompt }) } }) };
    }
    state.embed += 1;
    const isQuery = state.built && body.input.length === 1;
    if (isQuery) state.queries.push(body.input[0]);
    return {
      ok: true,
      json: async () => ({
        embeddings: body.input.map((text) => (isQuery ? [1, 0, 0] : [bias(text) ? 1 : 0, 0.01, 0])),
      }),
    };
  };
  const rag = ragFactory({ env: ENV, fetchImpl });
  await rag.initialize();
  state.initEmbed = state.embed;
  state.built = true;
  return { rag, state };
};
const ask = (rag, question, { locale = "tr", history = [] } = {}) =>
  rag.handle({
    method: "POST",
    origin: ORIGIN,
    contentType: "application/json",
    body: JSON.stringify({ version: 1, mode: "rag", question, locale, history }),
  });
/** One turn against a fresh index, with the per-turn call counts isolated. */
const turn = async (question, { bias = NO_BIAS, reply = defaultReply, locale = "tr", history = [] } = {}) => {
  const { rag, state } = await makeRag(bias, reply);
  const response = await ask(rag, question, { locale, history });
  return {
    body: response.body || {},
    status: response.status,
    embed: state.embed - state.initEmbed,
    chat: state.chat,
    prompts: state.prompts,
    prompt: state.prompts.join("\n"),
  };
};
const entityIds = (body) => [
  ...(body.evidence || []).map((item) => item.entityId),
  ...(body.sources || []).map((item) => item.entityId),
  ...(body.retrievedSources || []).map((item) => item.entityId),
];
const matches = (pattern) => (text) => new RegExp(pattern, "i").test(text);

/* ---------- A. exact facts and identity ---------- */

/* The deterministic route is a release property, not an optimisation: it is the
 * only path that answers without giving a generative model the chance to
 * rephrase a contact detail or a grade. */
for (const [question, factId] of [
  ["Kaan hangi programlama dillerini biliyor?", "skills:programming-languages"],
  ["GPA'si kaç", "education:gpa"],
  ["kaç sertifikası var", "certifications:total"],
  ["Kaan'ın LinkedIn'i", "contact:linkedin"],
  ["GitHub linki", "contact:github"],
  ["Kaan'ın cv'si", "contact:resume"],
  ["Kaan'ın telefon numarası ne?", "contact:phone"],
]) {
  const result = await turn(question);
  check(`exact fact resolves: ${question}`, result.body.exactFact, factId);
  check(`exact fact answers without a model: ${question}`, result.chat, 0);
  check(`exact fact answers without an embedding: ${question}`, result.embed, 0);
  check(`exact fact answer mode: ${question}`, result.body.answerMode, "portfolio-fact");
  check(`exact fact scope: ${question}`, result.body.scope, "portfolio");
  ok(`exact fact returns an answer: ${question}`, Boolean(result.body.answer?.trim()));
  check(`exact fact runs no generation attempt: ${question}`, result.body.generationAttempts, 0);
}
/* "Kaan kim?" is deliberately NOT an exact fact — it is a retrieved identity
 * answer. The release requirement is that it stays a grounded portfolio turn. */
{
  const result = await turn("Kaan kim?");
  check("identity question stays portfolio", result.body.scope, "portfolio");
  check("identity question costs one embedding", result.embed, 1);
  check("identity question costs one chat", result.chat, 1);
  ok("identity question retrieves canonical identity", entityIds(result.body).some((id) => /identity|profile/.test(id)));
}

/* ---------- B. privacy ---------- */

/* Hostile ranking: the on-request contact record is pinned to the top of the
 * similarity ordering for a question that never asked for it. */
const phoneBias = matches("phone number|telephone number");
for (const question of [
  "Kaan'ın deneyimi ne?",
  "Kaan hangi şirketlerde çalıştı?",
  "Kaan'la nasıl iletişime geçebilirim?",
  "Kaan Forward Deployed Engineer rolüne uygun mu?",
  "Kaan hakkında ne biliyorsun?",
]) {
  const result = await turn(question, { bias: phoneBias });
  const surfaced = entityIds(result.body);
  for (const id of ON_REQUEST_IDS) {
    ok(`on-request record stays out of results under hostile ranking (${id}): ${question}`, !surfaced.includes(id));
  }
  ok(`the phone value never enters the prompt: ${question}`, !result.prompt.includes(PHONE_VALUE));
  ok(`the phone value never enters the answer: ${question}`, !String(result.body.answer).includes(PHONE_VALUE));
}
/* A previous phone answer in the conversation cannot be replayed into an
 * unrelated, self-contained turn. */
{
  const history = [
    { role: "user", content: "Kaan'ın telefon numarası ne?" },
    { role: "assistant", content: `Telefon: ${PHONE_VALUE}` },
  ];
  const result = await turn("SINAMA stacki ne?", { bias: phoneBias, history });
  ok("a prior phone answer does not leak into an unrelated turn", !result.prompt.includes(PHONE_VALUE));
  ok("a prior phone answer does not leak into the reply", !String(result.body.answer).includes(PHONE_VALUE));
}
/* Work history is Kaan's own record set. Third-party material that was removed
 * from the corpus must not reappear, and no employer outside the canonical set
 * may be attributed to him. */
{
  const result = await turn("Kaan hangi şirketlerde çalıştı?");
  const experienceIds = entityIds(result.body).filter((id) => id.startsWith("experience:"));
  ok("the work-history answer retrieves experience records", experienceIds.length > 0);
  for (const id of experienceIds) {
    ok(`work history stays inside the canonical employer set: ${id}`, CANONICAL_EMPLOYERS.includes(id));
  }
  for (const value of knowledge.redactedValues) {
    ok("no restricted value reaches the generation prompt", !result.prompt.toLowerCase().includes(value.toLowerCase()));
  }
}
ok("restricted material never became retrievable in the first place",
  knowledge.records.every((record) => !ON_REQUEST_IDS.includes(record.id) || record.visibility === "public_on_request"));

/* ---------- C. project truth isolation ---------- */

const PROJECT_CASES = [
  ["SINAMA'nın stacki ne?", "merge rush", "project:sinama", ["project:merge-rush-tiny-factory"]],
  ["Merge Rush'ın stacki ne?", "sinama", "project:merge-rush-tiny-factory", ["project:sinama"]],
  ["Hospital Form App'in stacki ne?", "hospital appointment system", "project:hospital-form-app", ["project:hospital-appointment-system"]],
  ["Hospital Appointment System'in stacki ne?", "hospital form app", "project:hospital-appointment-system", ["project:hospital-form-app"]],
];

/* The bias string is the RIVAL project's own unique name, so the wrong record
 * really does own the top of the ranking. A bias that also matched shared
 * records — the canonical skills lists name every framework Kaan uses — would
 * let a skills chunk win the tie instead and quietly weaken the case. */
const stackLine = (id) => (recordById.get(id).text.match(/Technologies:\s*(.+)/) || [])[1]?.trim();
for (const [question, bias, required, forbidden] of PROJECT_CASES) {
  const result = await turn(question, { bias: matches(bias) });
  const surfaced = entityIds(result.body);
  ok(`the named project is retrieved under hostile ranking: ${question}`, surfaced.includes(required));
  ok(`the named project record reaches the prompt: ${question}`, result.prompt.includes(recordById.get(required).title));
  ok(`the named project's own stack reaches the prompt: ${question}`, result.prompt.includes(stackLine(required)));
  for (const wrong of forbidden) {
    ok(`a rival project cannot contaminate the answer (${wrong}): ${question}`, !surfaced.includes(wrong));
    /* The rival's canonical Technologies line is the contamination signal. The
     * shared skills records list the same technologies in a different order, so
     * this catches a wrong PROJECT record without firing on a legitimate one. */
    ok(`a rival project's stack never reaches the prompt (${wrong}): ${question}`,
      !result.prompt.includes(stackLine(wrong)));
  }
}
/* An explicit comparison must be allowed to see both. */
{
  const result = await turn("SINAMA ve Merge Rush'ı karşılaştır", { bias: matches("hospital") });
  const surfaced = entityIds(result.body);
  ok("a comparison retrieves both named projects",
    surfaced.includes("project:sinama") && surfaced.includes("project:merge-rush-tiny-factory"));
  ok("a comparison still excludes an unnamed project", !surfaced.includes("project:hospital-form-app"));
}

/* ---------- D. experience ---------- */

for (const [question, bias, required, forbidden] of [
  ["CBOT'ta ne yaptı?", "outlier|joyday", "experience:cbot", ["experience:outlier-ai"]],
  ["Outlier AI'de ne yaptı?", "cbot|punto", "experience:outlier-ai", ["experience:cbot"]],
  ["Atölye Joyday'de ne yaptı?", "cbot|outlier", "experience:atolye-joyday", ["experience:cbot"]],
  ["Kaan'ın staj deneyimi ne?", "cbot|outlier", "experience:punto-organization-software", []],
]) {
  const result = await turn(question, { bias: matches(bias) });
  const surfaced = entityIds(result.body);
  check(`experience question stays portfolio: ${question}`, result.body.scope, "portfolio");
  ok(`the named organization is retrieved under hostile ranking: ${question}`, surfaced.includes(required));
  for (const wrong of forbidden) {
    ok(`a rival organization cannot contaminate the answer (${wrong}): ${question}`, !surfaced.includes(wrong));
  }
}

/* ---------- E. general quarantine ---------- */

/* An ordinary knowledge question must cost zero embeddings and receive zero
 * portfolio context. This is both a privacy property and the reason a general
 * question is fast. */
for (const question of [
  "RAG nedir?",
  "GitHub nedir?",
  "C# nedir?",
  ".NET nedir?",
  "sınama ve değerlendirme arasındaki fark nedir",
  "REST API nedir?",
]) {
  const result = await turn(question, { bias: matches("sinama|cbot|kaan") });
  check(`general scope: ${question}`, result.body.scope, "general");
  check(`general costs no embedding: ${question}`, result.embed, 0);
  check(`general costs one chat: ${question}`, result.chat, 1);
  check(`general carries no evidence: ${question}`, (result.body.evidence || []).length, 0);
  check(`general carries no sources: ${question}`, (result.body.sources || []).length, 0);
  check(`general carries no retrieval diagnostic: ${question}`, (result.body.retrievedSources || []).length, 0);
  ok(`general receives no portfolio record in its prompt: ${question}`,
    !/Retrieved portfolio records:\s*\n(?!\(none\))/.test(result.prompt));
  ok(`general is not turned into a pitch: ${question}`, !/Kaan Balc/i.test(String(result.body.answer)));
}

/* ---------- F. conversation state ---------- */

const sinamaTurn = [
  { role: "user", content: "SINAMA nedir?" },
  { role: "assistant", content: "SINAMA, Kaan'ın AI agent güvenilirlik laboratuvarıdır." },
];
{
  const result = await turn("stacki ne?", { bias: matches("hospital|merge rush"), history: sinamaTurn });
  check("an inherited follow-up stays portfolio", result.body.scope, "portfolio");
  ok("an inherited follow-up resolves to the earlier project", entityIds(result.body).includes("project:sinama"));
  ok("an inherited follow-up admits no rival project", !entityIds(result.body).includes("project:hospital-form-app"));
}
{
  const result = await turn("RAG nedir?", { bias: matches("sinama"), history: sinamaTurn });
  check("a general question after a project clears inheritance", result.body.scope, "general");
  check("a general question after a project embeds nothing", result.embed, 0);
  check("a general question after a project shows no evidence", (result.body.evidence || []).length, 0);
}
{
  const history = [...sinamaTurn, { role: "user", content: "RAG nedir?" }, { role: "assistant", content: "RAG, getirmeli üretim demektir." }];
  const result = await turn("peki neden önemli?", { bias: matches("sinama"), history });
  check("a follow-up tracks the immediate subject, not the older one", result.body.scope, "general");
  ok("a follow-up does not jump back to the earlier project", !entityIds(result.body).includes("project:sinama"));
}
{
  /* Assistant prose is not a commitment. Only what the visitor actually asked
   * may establish an entity, or a model sentence could steer later retrieval. */
  const assistantOnly = [
    { role: "user", content: "merhaba" },
    { role: "assistant", content: "SINAMA, Kaan'ın AI agent güvenilirlik laboratuvarıdır." },
  ];
  const result = await turn("stacki ne?", { bias: NO_BIAS, history: assistantOnly });
  ok("assistant text alone does not establish entity memory", !entityIds(result.body).includes("project:sinama"));
}

/* ---------- G. recruiter ---------- */

for (const [question, mode] of [
  ["Kaan Forward Deployed Engineer rolüne uygun mu?", "recruiter-fit"],
  ["Neden Kaan'ı işe almalıyız?", "recruiter-hire"],
  ["Kaan'ın AI Engineer rolü için eksikleri neler?", "recruiter-gaps"],
  ["Kaan'ı diğer junior adaylardan ayıran ne?", "recruiter-differentiation"],
  ["Kaan bir Software Engineer rolü için hangi kanıtlara sahip?", "recruiter-evidence"],
]) {
  const result = await turn(question, { bias: matches("personal-context|interests") });
  check(`recruiter scope: ${question}`, result.body.scope, "portfolio");
  check(`recruiter mode: ${question}`, result.body.answerMode, mode);
  check(`recruiter costs one embedding: ${question}`, result.embed, 1);
  check(`recruiter costs one chat: ${question}`, result.chat, 1);
  ok(`recruiter evidence is present: ${question}`, (result.body.evidence || []).length > 0);
  ok(`recruiter evidence is canonical: ${question}`,
    (result.body.evidence || []).every((item) => recordById.has(item.entityId)));
  /* The two prompt guarantees Brief 4 and Brief 5 added, asserted where they
   * are actually consumed rather than only at the unit boundary. */
  ok(`recruiter prompt states the required scope: ${question}`,
    result.prompt.includes("The first line must be exactly: SCOPE: PORTFOLIO"));
  ok(`recruiter prompt refuses inflated strength: ${question}`,
    result.prompt.includes("never establishes scalable / ölçeklenebilir, production-grade, enterprise-scale"));
  ok(`recruiter answers never invent a metric: ${question}`, !/\b\d{2,}%/.test(String(result.body.answer)));
}
/* Personal-context material is on-request: a recruiter question must not pull
 * it in even when it is ranked first. */
{
  const result = await turn("Neden Kaan'ı işe almalıyız?", { bias: matches("interests|basketball") });
  ok("a recruiter answer cannot reach on-request personal context",
    !entityIds(result.body).includes("personal-context"));
}

/* ---------- H. generation safety ---------- */

/* Every malformed shape the validator screens for, driven through the real
 * bridge: at most one repair, never a second embedding, never a third chat, and
 * a deterministic fallback rather than a bad answer on screen. */
const BAD_DRAFTS = [
  ["repeated sentence", () => " PORTFOLIO\nANSWER: Kaan CBOT'ta yapılandırılmış canlı sohbet testleri yaptı. Kaan CBOT'ta yapılandırılmış canlı sohbet testleri yaptı."],
  ["duplicate contract", () => " PORTFOLIO\nANSWER: Bir.\nSCOPE: PORTFOLIO\nANSWER: İki."],
  ["reasoning leak", () => " PORTFOLIO\nANSWER: I need to decide what the user wants here."],
  ["empty answer", () => " PORTFOLIO\nANSWER:"],
  ["wrong scope", () => " GENERAL\nANSWER: Kaan'ın portföyü bunu gösteriyor."],
  ["unsupported strength", () => " PORTFOLIO\nANSWER: Kaan ölçeklenebilir ve production-grade sistemler kurdu."],
];
for (const [label, reply] of BAD_DRAFTS) {
  const { rag, state } = await makeRag(NO_BIAS, reply);
  const response = await ask(rag, "Neden Kaan'ı işe almalıyız?");
  const body = response.body || {};
  check(`persistently invalid generation stops at two chats: ${label}`, state.chat, 2);
  check(`a repair never re-embeds: ${label}`, state.embed - state.initEmbed, 1);
  check(`a repair never exceeds two attempts: ${label}`, body.generationAttempts, 2);
  check(`an unrepairable draft falls back: ${label}`, body.fallbackUsed, true);
  check(`the fallback keeps the expected scope: ${label}`, body.scope, "portfolio");
  ok(`the fallback still answers: ${label}`, Boolean(body.answer?.trim()));
  ok(`the rejected draft never reaches the visitor: ${label}`,
    !/I need to decide|production-grade|ölçeklenebilir/i.test(String(body.answer)));
  ok(`the rejection is reported for diagnosis: ${label}`, (body.validatorFlags || []).length > 0);
}
/* One bad draft followed by a good one is repaired, shown, and costs exactly
 * two chats and one embedding. */
{
  const { rag, state } = await makeRag(NO_BIAS, ({ state: current }) => (current.chat === 1
    ? " PORTFOLIO\nANSWER: Kaan CBOT'ta yapılandırılmış canlı sohbet testleri yaptı. Kaan CBOT'ta yapılandırılmış canlı sohbet testleri yaptı."
    : " PORTFOLIO\nANSWER: CBOT ve SINAMA kayıtları bu değerlendirmeyi destekliyor."));
  const response = await ask(rag, "Neden Kaan'ı işe almalıyız?");
  check("a repairable draft is repaired", response.body.repaired, true);
  check("a repaired turn does not fall back", response.body.fallbackUsed, false);
  check("a repaired turn costs two chats", state.chat, 2);
  check("a repaired turn costs one embedding", state.embed - state.initEmbed, 1);
}

/* ---------- I. warm-path cost ---------- */

/* Brief 5 must not add a model call to a successful path. These are the shapes
 * the architecture promises. */
for (const [label, question, embed, chat] of [
  ["exact fact", "Kaan'ın LinkedIn'i", 0, 0],
  ["general", "RAG nedir?", 0, 1],
  ["portfolio", "SINAMA'nın stacki ne?", 1, 1],
  ["recruiter", "Kaan Forward Deployed Engineer rolüne uygun mu?", 1, 1],
]) {
  const result = await turn(question);
  check(`${label} embedding cost`, result.embed, embed);
  check(`${label} chat cost`, result.chat, chat);
}

/* ---------- J. mutation checks ---------- */

/**
 * Real source mutation, run from a throwaway sibling module.
 *
 * The copies live in `server/` so that `import.meta.url` still resolves the
 * data directory and the untouched siblings, and imports among the mutated set
 * are rewritten to point at each other. Every mutant is deleted in `finally`,
 * and section K then proves the directory is clean — a mutation suite that
 * leaves residue has silently edited the product.
 */
const MUTANT_TAG = "__release-mutant";
const sweepMutants = async () => {
  const { readdir } = await import("node:fs/promises");
  const stale = (await readdir(SERVER_DIR)).filter((name) => name.includes(MUTANT_TAG));
  await Promise.all(stale.map((name) => unlink(resolve(SERVER_DIR, name))));
  return stale.length;
};
await sweepMutants();

let mutationSeq = 0;
const withMutation = async (edits, entry, run) => {
  const id = `${MUTANT_TAG}-${(mutationSeq += 1)}`;
  const written = [];
  const nameFor = (file) => `${file.replace(/\.mjs$/, "")}.${id}.mjs`;
  try {
    for (const [file, replacements] of Object.entries(edits)) {
      let source = await readFile(resolve(SERVER_DIR, file), "utf8");
      for (const [from, to] of replacements) {
        if (!source.includes(from)) throw new Error(`mutation anchor missing in ${file}: ${from.slice(0, 60)}`);
        source = source.replace(from, to);
      }
      /* Point the mutant at its mutated siblings; everything else still
       * resolves to the real module. */
      for (const sibling of Object.keys(edits)) {
        source = source.split(`"./${sibling}"`).join(`"./${nameFor(sibling)}"`);
      }
      const target = resolve(SERVER_DIR, nameFor(file));
      await writeFile(target, source, "utf8");
      written.push(target);
    }
    return await run(await import(`file://${resolve(SERVER_DIR, nameFor(entry))}`));
  } finally {
    await Promise.all(written.map((path) => unlink(path).catch(() => {})));
  }
};

/* 1. Remove the expectedScope contract. */
ok("mutation: a removed scope contract breaks the release invariant", await withMutation(
  { "ajoop-answer.mjs": [["return strategy?.expectedScope", "return false && strategy?.expectedScope"]] },
  "ajoop-answer.mjs",
  (mutant) => !mutant.answerStrategyPrompt({ mode: "recruiter-fit", recruiter: true, expectedScope: "PORTFOLIO" })
    .includes("The first line must be exactly: SCOPE: PORTFOLIO"),
));

/* 2. Allow GENERAL answers to carry evidence. */
ok("mutation: GENERAL evidence breaks the release invariant", await withMutation(
  { "ajoop-answer.mjs": [['if (!strategy || strategy.expectedScope === "GENERAL" || strategy.evidenceLimit === 0) return [];',
    "if (!strategy || strategy.evidenceLimit === 0) return [];"]] },
  "ajoop-answer.mjs",
  (mutant) => mutant.selectEvidenceRecords({
    strategy: { expectedScope: "GENERAL", evidenceLimit: 4 },
    records: [{ id: "master-knowledge:project:sinama:1", source: "master-knowledge", entityId: "project:sinama", entityType: "project", title: "SINAMA", text: "SINAMA" }],
    affinity: new Map(),
  }).length > 0,
));

/* 3. Disable project isolation. */
ok("mutation: disabled project isolation breaks the release invariant", await withMutation(
  { "ajoop-retrieval.mjs": [["export function isCandidateEligible(chunk, affinity, { activeProjects, activeOrganizations }) {",
    "export function isCandidateEligible(chunk, affinity, { activeProjects, activeOrganizations }) {\n  if (true) return true;"]],
  "ajoop-rag.mjs": [] },
  "ajoop-rag.mjs",
  async (mutant) => {
    const { rag, state } = await makeRag(matches("merge rush"), defaultReply, mutant.createAjoopRag);
    const response = await ask(rag, "SINAMA'nın stacki ne?");
    return entityIds(response.body || {}).includes("project:merge-rush-tiny-factory")
      || /Merge Rush/i.test(state.prompts.join("\n"));
  },
));

/* 4. Allow a third generation attempt. */
ok("mutation: a third generation breaks the release invariant", await withMutation(
  { "ajoop-rag.mjs": [["        const result = await generateOnce(question, locale, history, retrieved, strategy, firstFlags);",
    "        await generateOnce(question, locale, history, retrieved, strategy, firstFlags).catch(() => null);\n        const result = await generateOnce(question, locale, history, retrieved, strategy, firstFlags);"]] },
  "ajoop-rag.mjs",
  async (mutant) => {
    const { rag, state } = await makeRag(NO_BIAS, () => " PORTFOLIO\nANSWER:", mutant.createAjoopRag);
    await ask(rag, "Neden Kaan'ı işe almalıyız?");
    return state.chat > 2;
  },
));

/* 5. Let ordinary semantic retrieval reach on-request records. */
ok("mutation: retrievable on-request records break the release invariant", await withMutation(
  { "ajoop-rag.mjs": [['retrievalIndex = index.filter((chunk) => chunk.visibility !== "public_on_request");',
    "retrievalIndex = index;"]] },
  "ajoop-rag.mjs",
  async (mutant) => {
    const { rag, state } = await makeRag(phoneBias, defaultReply, mutant.createAjoopRag);
    const response = await ask(rag, "Kaan hakkında ne biliyorsun?");
    return entityIds(response.body || {}).includes("contacts:on-request")
      || state.prompts.join("\n").includes(PHONE_VALUE);
  },
));

/* ---------- K. no mutation residue ---------- */

check("every mutant module was removed", await sweepMutants(), 0);
for (const file of ["ajoop-answer.mjs", "ajoop-rag.mjs", "ajoop-retrieval.mjs"]) {
  ok(`${file} is present and unmutated`, existsSync(resolve(SERVER_DIR, file)));
}
ok("the real answer layer still carries its scope contract",
  (await readFile(resolve(SERVER_DIR, "ajoop-answer.mjs"), "utf8")).includes("return strategy?.expectedScope"));
ok("the real rag layer still excludes on-request records from retrieval",
  (await readFile(resolve(SERVER_DIR, "ajoop-rag.mjs"), "utf8"))
    .includes('retrievalIndex = index.filter((chunk) => chunk.visibility !== "public_on_request");'));
/* The strategy selector is what the whole gate rests on; a shipped strategy
 * without an expected scope would silently disable section G's contract. */
for (const question of ["Neden Kaan'ı işe almalıyız?", "SINAMA nedir?", "RAG nedir?"]) {
  ok(`a shipped strategy declares its scope: ${question}`,
    Boolean(selectAnswerStrategy({ question, plan: { contextEligible: !/RAG/.test(question) }, history: [] }).expectedScope));
}

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Ajoop release gate: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}`);
  process.exit(1);
}
console.log(
  `Ajoop release gate passed. ${passed} assertions · adversarial embeddings · `
  + `${mutationSeq} mutation checks · no residue · no network, no Ollama.`,
);
