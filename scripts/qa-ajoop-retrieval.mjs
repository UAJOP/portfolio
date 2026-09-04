#!/usr/bin/env node
/**
 * qa-ajoop-retrieval.mjs — retrieval precision, project truth, conversation state.
 *
 * The embeddings here are ADVERSARIAL on purpose. Every project-isolation case
 * scores the WRONG project at 1.0 and the right one at 0.0, so a test that
 * passes proves deterministic filtering beat similarity rather than that
 * similarity happened to agree. A suite built on realistic embeddings would
 * pass just as happily with the isolation removed.
 *
 * Node built-ins only. No network, no Ollama.
 *
 *   node scripts/qa-ajoop-retrieval.mjs
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMasterKnowledge } from "../server/ajoop-knowledge.mjs";
import { buildAliasIndex } from "../server/ajoop-entities.mjs";
import {
  ENTITY_TYPES,
  buildChunkAffinity,
  buildEntityIndex,
  experienceRecordFocus,
  framedRecordTypes,
  inheritPortfolioEntity,
  isFollowUpQuestion,
  planRetrievalTurn,
  scoreCandidate,
  selectGenerationHistory,
  selectTopChunks,
} from "../server/ajoop-retrieval.mjs";
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

const loaded = await loadMasterKnowledge(DATA_DIR);
const entityIndex = buildEntityIndex(loaded.knowledge, buildAliasIndex(loaded.knowledge));
const plan = (question, history = []) => planRetrievalTurn({ question, history, entityIndex });

/* ---------- A. the entity index ---------- */

ok("the entity index extends the curated aliases", entityIndex.entities.length > 12);
for (const [canonical, type] of [
  ["SINAMA", ENTITY_TYPES.PROJECT],
  ["Merge Rush: Tiny Factory", ENTITY_TYPES.PROJECT],
  ["Hospital Form App", ENTITY_TYPES.PROJECT],
  ["Hospital Appointment System", ENTITY_TYPES.PROJECT],
  ["CBOT", ENTITY_TYPES.ORGANIZATION],
  ["Outlier AI", ENTITY_TYPES.ORGANIZATION],
  ["Atölye Joyday", ENTITY_TYPES.ORGANIZATION],
  ["C#", ENTITY_TYPES.TECHNOLOGY],
  [".NET", ENTITY_TYPES.TECHNOLOGY],
  ["Kaan Balcı", ENTITY_TYPES.PERSON],
]) {
  check(`${canonical} is typed ${type}`, entityIndex.entities.find((e) => e.canonical === canonical)?.type, type);
}
/* Employers the master records but never aliases still become entities. */
for (const canonical of ["Punto Organization", "Ocean's Team"]) {
  const entity = entityIndex.entities.find((e) => e.canonical === canonical);
  ok(`${canonical} was derived from the knowledge`, Boolean(entity));
  check(`${canonical} is an organization`, entity?.type, ENTITY_TYPES.ORGANIZATION);
}
/* A short form is only granted when it is unique, which is why neither
 * hospital project may claim the word "hospital". */
ok("punto gets its short form", plan("punto'da ne yaptı").activeOrganizations.includes("Punto Organization"));
ok(
  "no entity claims the ambiguous word hospital",
  entityIndex.entities.every((entity) => !entity.aliases.includes("hospital")),
);
{
  const affinity = buildChunkAffinity([
    {
      id: "projects:hospital:1",
      source: "projects",
      entityId: "hospital",
      title: "hospital",
      affinityHints: ["hospital-form-app"],
    },
  ], entityIndex);
  check(
    "a structural detail slug assigns the legacy hospital card to Hospital Form App",
    affinity.get("projects:hospital:1")?.projects.join(),
    "Hospital Form App",
  );
}

/* ---------- B. context eligibility ---------- */

const QUARANTINED = [
  "GitHub nedir?",
  "LinkedIn nedir?",
  "C# nedir?",
  ".NET nedir?",
  "RAG nedir?",
  "AI agent nedir?",
  "regression testing nedir?",
  "sınama ve değerlendirme arasındaki fark nedir",
  "sinema filmi öner",
  "üniversite seçerken nelere dikkat edilmeli?",
  "proje yönetimi nedir?",
];
for (const question of QUARANTINED) {
  const result = plan(question);
  check(`quarantined: ${question}`, result.contextEligible, false);
  check(`no entity survives: ${question}`, result.activeEntities.length, 0);
  check(`the query is the question verbatim: ${question}`, result.retrievalText, question);
}

const ELIGIBLE = [
  "Kaan RAG kullandı mı?",
  "projelerinde RAG var mı?",
  "hangi projeleri var?",
  "hangi teknolojileri kullanıyor?",
  "hangi şirketlerde çalıştı?",
  "CBOT'ta ne yaptı?",
  "SINAMA ne işe yarıyor?",
  "Hospital Form App stacki ne?",
  "neden Kaan'ı işe almalıyız?",
  "iş geçmişini anlat",
  "Kaan'ın staj deneyimi ne?",
  "onun deneyimi ne",
];
for (const question of ELIGIBLE) {
  check(`eligible: ${question}`, plan(question).contextEligible, true);
}

/* ---------- C. entity typing drives isolation differently ---------- */

check("a project question locks to that project", plan("sinamanın stacki ne").activeProjects.join(), "SINAMA");
check("an organization question locks to that organization", plan("cbot'ta ne yaptı").activeOrganizations.join(), "CBOT");
for (const [question, expected] of [
  ["outlier'da ne yaptı", "Outlier AI"],
  ["joyday'de ne yaptı", "Atölye Joyday"],
  ["punto'da ne yaptı", "Punto Organization"],
]) {
  check(`organization resolves: ${question}`, plan(question).activeOrganizations.join(), expected);
}
/* Technology is a boost, never a lock: C# spans several projects. */
for (const question of ["c sharp ile ne yaptı?", "dot net projeleri neler?"]) {
  const result = plan(question);
  check(`technology question is eligible: ${question}`, result.contextEligible, true);
  check(`technology applies no project lock: ${question}`, result.activeProjects.length, 0);
  check(`and no organization lock: ${question}`, result.activeOrganizations.length, 0);
}
/* Two named projects lift the lock for both. */
{
  const result = plan("SINAMA ile Merge Rush'ı karşılaştır");
  check("a comparison activates both projects", result.activeProjects.length, 2);
  ok("SINAMA is one of them", result.activeProjects.includes("SINAMA"));
  ok("Merge Rush is the other", result.activeProjects.includes("Merge Rush: Tiny Factory"));
}

/* ---------- D. follow-up detection and inheritance ---------- */

for (const question of [
  "peki stacki ne?",
  "onda hangi veritabanı var?",
  "bu projede ne kullandı?",
  "neden yaptı?",
  "peki performansı nasıl?",
  "what stack does it use?",
  "what about the database?",
  "peki neden?",
]) {
  ok(`follow-up detected: ${question}`, isFollowUpQuestion(question, entityIndex));
}
for (const question of [
  "RAG nedir?",
  "GitHub nedir?",
  "SINAMA nedir?",
  "sinema filmi öner",
  "Kaan hangi şirketlerde çalıştı?",
  "bu ne demek",
]) {
  ok(`not a follow-up: ${question}`, !isFollowUpQuestion(question, entityIndex));
}

const user = (content) => ({ role: "user", content });
const bot = (content) => ({ role: "assistant", content });

check(
  "a follow-up inherits the last named project",
  inheritPortfolioEntity([user("SINAMA nedir?")], entityIndex)?.canonical,
  "SINAMA",
);
check(
  "a chain of follow-ups keeps reaching back",
  inheritPortfolioEntity([user("SINAMA nedir?"), bot("..."), user("stacki ne?"), bot("...")], entityIndex)?.canonical,
  "SINAMA",
);
check(
  "a new self-contained subject breaks the chain",
  inheritPortfolioEntity([user("SINAMA nedir?"), bot("..."), user("RAG nedir?"), bot("...")], entityIndex),
  null,
);
/* The one that matters most: generated text is not conversational state. */
check(
  "an assistant message never establishes entity memory",
  inheritPortfolioEntity([bot("SINAMA is Kaan's AI reliability lab.")], entityIndex),
  null,
);
check(
  "even a long assistant monologue establishes nothing",
  inheritPortfolioEntity([bot("SINAMA uses FastAPI."), bot("Merge Rush uses Phaser 3.")], entityIndex),
  null,
);

/* ---------- E. the current question outranks history ---------- */

{
  const result = plan("SINAMA stacki ne", [user("Merge Rush'ı anlat")]);
  check("[history] an explicit entity beats the previous topic", result.activeProjects.join(), "SINAMA");
  check("[history] and inherits nothing", result.inheritedEntity, null);
}
{
  const result = plan("Hospital Form App hangi teknolojileri kullanıyor?", [user("SINAMA nedir?")]);
  check("[history] an explicit project switch takes effect", result.activeProjects.join(), "Hospital Form App");
}
{
  const result = plan("GitHub nedir?", [user("Kaan'ın projelerini anlat")]);
  check("[history] a general question after portfolio history stays quarantined", result.contextEligible, false);
  check("[history] and sends no conversation to the model", result.generationHistory.length, 0);
}
{
  const result = plan("RAG nedir?", [user("SINAMA nasıl çalışıyor?"), bot("...")]);
  check("[history] a new subject clears portfolio context", result.contextEligible, false);
  check("[history] with no inheritance", result.inheritedEntity, null);
}
{
  const result = plan("RAG nedir?", [user("güncel dolar kuru kaç"), bot("Canlı verilere erişimim yok.")]);
  check("[history] a live-data refusal does not poison the next turn", result.contextEligible, false);
  check("[history] and is not replayed to the model", result.generationHistory.length, 0);
}
{
  const result = plan("stacki ne?", [user("SINAMA nedir?"), bot("...")]);
  check("[history] a genuine follow-up inherits", result.inheritedEntity?.canonical, "SINAMA");
  check("[history] and becomes eligible", result.contextEligible, true);
  check("[history] locking to the inherited project", result.activeProjects.join(), "SINAMA");
  ok("[history] with a short window of conversation", result.generationHistory.length > 0);
}
{
  const result = plan("peki hangi veritabanını kullanıyor?", [
    user("SINAMA nedir?"), bot("..."), user("stacki ne?"), bot("..."),
  ]);
  check("[history] a chained follow-up still inherits", result.inheritedEntity?.canonical, "SINAMA");
}
{
  const result = plan("peki neden önemli?", [user("SINAMA nedir?"), bot("..."), user("RAG nedir?"), bot("...")]);
  check("[history] a broken chain does not reach back past the new subject", result.inheritedEntity, null);
  check("[history] so portfolio context stays off", result.contextEligible, false);
  ok("[history] but the immediate general conversation is preserved", result.generationHistory.length > 0);
}
{
  const result = plan("stacki ne?", [bot("SINAMA is Kaan's AI reliability lab.")]);
  check("[history] assistant-only history inherits nothing", result.inheritedEntity, null);
  check("[history] so the turn is not eligible", result.contextEligible, false);
}

/* ---------- F. generation history selection ---------- */

const heavy = [user("Kaan'ın projelerini anlat"), bot("..."), user("SINAMA nedir?"), bot("...")];
check("a self-contained question sends no history", selectGenerationHistory(heavy, { followUp: false }).length, 0);
ok("a follow-up sends a bounded window", selectGenerationHistory(heavy, { followUp: true }).length <= 4);
{
  const general = [user("Matrix filmini anlat"), bot("Bir bilim kurgu klasiği.")];
  const result = plan("neden bu kadar etkiliydi?", general);
  ok("[history] a general follow-up keeps continuity", result.generationHistory.length > 0);
  check("[history] without becoming a portfolio question", result.contextEligible, false);
}
/* Old sensitive output cannot ride along into an unrelated turn. */
{
  const withPhone = [user("telefon numarası ne"), bot("Telefon numarası: +90 507 133 3382")];
  const result = plan("RAG nedir?", withPhone);
  check("[privacy] a self-contained turn drops the old phone answer", result.generationHistory.length, 0);
}

/* ---------- G. the embedding query never carries old prose ---------- */

{
  const result = plan("stacki ne?", [user("SINAMA nedir?"), bot("SINAMA is a reliability lab for agents.")]);
  ok("the query starts with the current question", result.retrievalText.startsWith("stacki ne?"));
  ok("it names the inherited entity", /SINAMA/.test(result.retrievalText));
  ok("it does not replay the previous question", !result.retrievalText.includes("SINAMA nedir?"));
  ok("it does not replay the previous answer", !result.retrievalText.includes("reliability lab for agents"));
}
for (const question of QUARANTINED) {
  ok(`no entity tail on a general question: ${question}`, !/canonical entities:/.test(plan(question).retrievalText));
}

/* ---------- H. framed record families ---------- */

check("work-history framing targets experience", framedRecordTypes("Kaan hangi şirketlerde çalıştı?").join(), "experience");
check("an internship question targets experience", framedRecordTypes("Kaan'ın staj deneyimi ne?").join(), "experience");
check("a company-list question requests an experience overview", experienceRecordFocus("Kaan hangi şirketlerde çalıştı?"), "overview");
check("an internship question requests the internship slice", experienceRecordFocus("Kaan'ın staj deneyimi ne?"), "internship");
check("a project question targets projects", framedRecordTypes("hangi projeleri var?").join(), "project");
check("a technology question targets skills", framedRecordTypes("hangi teknolojileri kullanıyor?").join(), "skills");
check("a named project reserves nothing", plan("SINAMA stacki ne").reservedTypes.length, 0);
ok("an unfocused question does reserve", plan("hangi şirketlerde çalıştı?").reservedTypes.includes("experience"));

/* selectTopChunks honours both the reservation and the per-entity cap. */
{
  const fake = (id, entityId, entityType) => ({ id, source: "s", entityId, entityType, title: id });
  const ranked = [
    fake("a1", "a", "project"), fake("a2", "a", "project"), fake("a3", "a", "project"),
    fake("b1", "b", "experience"), fake("c1", "c", "experience"),
  ];
  const capped = selectTopChunks(ranked, { topK: 4 });
  check("the per-entity cap holds", capped.filter((item) => item.entityId === "a").length, 2);
  const reserved = selectTopChunks(ranked, { topK: 4, reserveWhen: (item) => item.entityType === "experience" });
  check("reserved slots go to the framed family first", reserved.slice(0, 2).map((i) => i.id).join(), "b1,c1");
  check("and the rest follow ranking", reserved.length, 4);
}
{
  const affinity = new Map([["experience", { projects: [], organizations: [] }]]);
  const score = scoreCandidate(
    { id: "experience", title: "CBOT — AI Designer", tags: [], entityType: "experience", priority: 1 },
    0.1,
    { affinity, activeEntities: [], terms: [], framedTypes: ["experience"] },
  );
  check("framed record types contribute to the hybrid score", score.topicScore, 0.25);
  check("canonical source priority remains additive", score.sourceBonus, 0.05);
}

/* ---------- I. end to end, with adversarial embeddings ---------- */

/**
 * A stub embedding that puts `bias` at the TOP of the ranking.
 *
 * The query vector is pinned to [1, 0, 0] and a chunk matching `bias` is given
 * the same direction, so it scores ~1.0 while everything else scores ~0.0.
 * Passing the WRONG project as the bias is the whole point: a test that passes
 * proves deterministic filtering overruled similarity.
 *
 * Getting this backwards is easy and silently defeats the suite — an earlier
 * revision biased the chunks without pinning the query, which made the
 * "adversarial" chunks orthogonal to it and handed the right answer to the
 * wrong mechanism. The mutation tests in the deliverable exist to catch exactly
 * that, and did.
 */
const makeRag = async (bias) => {
  const state = { embed: 0, chat: 0, built: false, queries: [], prompts: [] };
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).includes("/api/chat")) {
      state.chat += 1;
      state.prompts.push(body.messages.map((message) => message.content).join("\n"));
      return { ok: true, json: async () => ({ message: { content: " PORTFOLIO\nANSWER: Stubbed." } }) };
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
  const rag = createAjoopRag({ env: ENV, fetchImpl });
  await rag.initialize();
  /* Index building costs a batch per 24 chunks; per-turn cost is measured from
   * here, not from a guessed constant. */
  state.initEmbed = state.embed;
  state.built = true;
  return { rag, state };
};
const matches = (pattern) => (text) => new RegExp(pattern, "i").test(text);
const ask = (rag, question, history = []) =>
  rag.handle({
    method: "POST",
    origin: ORIGIN,
    contentType: "application/json",
    body: JSON.stringify({ version: 1, mode: "rag", question, locale: "tr", history }),
  });

/* Project truth: the wrong project is scored top and must still not appear. */
const PROJECT_CASES = [
  [
    "sinamanın stacki ne",
    "phaser|merge rush|tiny factory",
    "project:sinama",
    ["merge-rush", "hospital"],
    [],
  ],
  [
    "merge rush stacki ne",
    "fastapi|postgres|sinama",
    "project:merge-rush-tiny-factory",
    ["sinama", "hospital"],
    [],
  ],
  [
    "Hospital Form App hangi teknolojileri kullanıyor?",
    "tkinter|mysql|hospital appointment system",
    "project:hospital-form-app",
    ["appointment"],
    [],
  ],
  [
    "Hospital Appointment System hangi teknolojileri kullanıyor?",
    "windows forms|form app|ado.net",
    "project:hospital-appointment-system",
    ["form-app"],
    ["projects/hospital"],
  ],
];
for (const [question, wrongBias, expectedId, forbidden, forbiddenSources] of PROJECT_CASES) {
  const { rag, state } = await makeRag(matches(wrongBias));
  const response = await ask(rag, question);
  const ids = response.body.sources.map((source) => source.entityId);
  const sourceIds = response.body.sources.map((source) => `${source.source}/${source.entityId}`);
  check(`[e2e] answered: ${question}`, response.status, 200);
  ok(`[e2e] the named project's record is present: ${question}`, ids.includes(expectedId));
  for (const banned of forbidden) {
    ok(
      `[e2e] no ${banned} evidence contaminates it: ${question}`,
      ids.every((id) => !id.includes(banned) || id === expectedId),
    );
  }
  for (const banned of forbiddenSources) {
    ok(`[e2e] no ${banned} source contaminates it: ${question}`, !sourceIds.includes(banned));
  }
  check(`[e2e] one embedding, one generation: ${question}`, `${state.embed - state.initEmbed}/${state.chat}`, "1/1");
}

/* Multi-project comparison keeps both families. */
{
  const { rag } = await makeRag(() => true);
  const response = await ask(rag, "SINAMA ile Merge Rush'ı karşılaştır");
  const ids = response.body.sources.map((source) => source.entityId).join(" ");
  ok("[e2e] a comparison keeps SINAMA", /sinama/i.test(ids));
  ok("[e2e] and keeps Merge Rush", /merge-rush|mergeRush/i.test(ids));
}

/* Organization isolation, again under adversarial similarity. */
for (const [question, expected, wrongBias] of [
  ["cbot'ta ne yaptı", "cbot", "joyday|outlier"],
  ["outlier'da ne yaptı", "outlier", "cbot|joyday"],
  ["joyday'de ne yaptı", "joyday", "cbot|punto"],
  ["punto'da ne yaptı", "punto", "cbot|oceans"],
]) {
  const { rag } = await makeRag(matches(wrongBias));
  const response = await ask(rag, question);
  const experience = response.body.sources
    .map((source) => source.entityId)
    .filter((id) => id.startsWith("experience:"));
  ok(`[e2e] ${question} retrieves its own employer`, experience.some((id) => id.includes(expected)));
  ok(
    `[e2e] ${question} retrieves no other employer`,
    experience.every((id) => id.includes(expected)),
  );
}

/* Work history: the §25 regression, under an embedding that ranks every
 * experience record last. */
{
  const { rag, state } = await makeRag((text) => !/CBOT|Outlier|Punto|Joyday|Ocean/i.test(text));
  const overviewIds = [
    "experience:atolye-joyday",
    "experience:cbot",
    "experience:outlier-ai",
    "experience:punto-organization-software",
    "experience:punto-organization-event",
    "experience:oceans-team",
  ];
  for (const question of ["Kaan hangi şirketlerde çalıştı?", "iş geçmişini anlat"]) {
    const response = await ask(rag, question);
    const experience = response.body.sources
      .map((source) => source.entityId)
      .filter((id) => id.startsWith("experience:"));
    check(`[e2e] ${question} retrieves every canonical role`, experience.length, overviewIds.length);
    for (const id of overviewIds) ok(`[e2e] ${question} includes ${id}`, experience.includes(id));
  }
  const internship = await ask(rag, "Kaan'ın staj deneyimi ne?");
  check(
    "[e2e] the internship role is structurally reserved first",
    internship.body.sources[0]?.entityId,
    "experience:punto-organization-software",
  );
  ok(
    "[e2e] generation is instructed to preserve exact work-history fields",
    /copy the organization, role title and Period field.+exactly as written/.test(state.prompts.at(-1)),
  );
}

/* General quarantine: no embedding, no records, exactly one generation. */
{
  const { rag, state } = await makeRag(() => true);
  const baseline = { embed: state.embed, chat: state.chat };
  for (const question of QUARANTINED) {
    const response = await ask(rag, question);
    check(`[e2e] answered without portfolio evidence: ${question}`, response.body.sources.length, 0);
    ok(
      `[e2e] the model was told there are no records: ${question}`,
      /Retrieved portfolio records:\n\(none\)/.test(state.prompts.at(-1)),
    );
  }
  check("[e2e] quarantined questions cost no embeddings", state.embed - baseline.embed, 0);
  check("[e2e] and exactly one generation each", state.chat - baseline.chat, QUARANTINED.length);
}

/* The release blocker, end to end. */
{
  const { rag, state } = await makeRag(() => true);
  const response = await ask(rag, "sınama ve değerlendirme arasındaki fark nedir");
  check("[blocker] the SINAMA collision is answered", response.status, 200);
  check("[blocker] with no portfolio evidence at all", response.body.sources.length, 0);
  ok("[blocker] and the model saw no records", /Retrieved portfolio records:\n\(none\)/.test(state.prompts.at(-1)));
  ok("[blocker] nor any SINAMA text", !/AI Agent Reliability Lab/.test(state.prompts.at(-1)));
}

/* Kaan-heavy history cannot drag a general question into the portfolio. */
{
  const { rag, state } = await makeRag(() => true);
  const kaanHeavy = [
    user("Kaan'ın projelerini anlat"), bot("SINAMA, Merge Rush ve Hospital Form App."),
    user("SINAMA nedir?"), bot("Bir AI güvenilirlik laboratuvarı."),
  ];
  for (const question of ["GitHub nedir?", "RAG nedir?", "C# nedir?"]) {
    const before = state.embed;
    const response = await ask(rag, question, kaanHeavy);
    check(`[e2e] ${question} after Kaan-heavy history has no evidence`, response.body.sources.length, 0);
    check(`[e2e] ${question} is not embedded`, state.embed - before, 0);
    ok(
      `[e2e] ${question} was not given the old conversation`,
      !/Kaan'ın projelerini anlat/.test(state.prompts.at(-1)),
    );
  }
}

/* Exact facts and the live-data guard are untouched by all of this. */
{
  const { rag, state } = await makeRag(() => true);
  const before = { embed: state.embed, chat: state.chat };
  for (const question of ["CV", "linkdin", "kaç sertifikası var", "telefon numarası ne", "programlama dilleri", "GPA'si kaç"]) {
    const response = await ask(rag, question);
    check(`[e2e] exact fact still deterministic: ${question}`, response.status, 200);
    ok(`[e2e] and still names its fact: ${question}`, Boolean(response.body.exactFact));
  }
  check("[e2e] exact facts cost nothing upstream", state.embed - before.embed + (state.chat - before.chat), 0);

  const live = await ask(rag, "güncel dolar kuru kaç tl");
  check("[e2e] the live-data guard still fires first", live.body.scope, "general");
  ok("[e2e] and still invents no figure", !/[0-9]/.test(live.body.answer));
  check("[e2e] costing nothing upstream", state.embed - before.embed + (state.chat - before.chat), 0);
}

/* On-request records stay out of retrieval, whatever the ranking says. */
{
  const { rag } = await makeRag(matches("telefon|phone|numara"));
  const response = await ask(rag, "telefon nasıl çalışır?");
  ok(
    "[privacy] the on-request record is still unreachable",
    (response.body.sources || []).every((source) => source.entityId !== "contacts:on-request"),
  );
}

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Ajoop retrieval: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(
  `Ajoop retrieval contracts passed. ${passed} assertions · ` +
    `${entityIndex.entities.length} entities · adversarial embeddings · no network, no Ollama.`,
);
