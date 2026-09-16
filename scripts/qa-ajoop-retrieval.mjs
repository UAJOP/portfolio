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
import { buildAliasIndex, mentionsPortfolioOwner } from "../server/ajoop-entities.mjs";
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
import { buildNextPublicConversationState } from "../server/ajoop-discourse.mjs";

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
const plan = (question, history = [], conversationState) => planRetrievalTurn({
  question, history, conversationState, entityIndex,
});

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
for (const canonical of ["Python", "JavaScript"]) {
  const entity = entityIndex.entities.find((item) => item.canonical === canonical);
  ok(`${canonical} is derived from canonical programming capabilities`, Boolean(entity?.derived));
  check(`${canonical} is a context-sensitive technology`, entity?.type, ENTITY_TYPES.TECHNOLOGY);
  check(`${canonical} does not become a free-standing portfolio signal`, plan(`What is ${canonical} used for?`).contextEligible, false);
}
check(
  "JavaScript does not also resolve the suffix-tolerant Java entity",
  plan("What is JavaScript used for in his website?").currentEntities.map((entity) => entity.canonical).join(),
  "JavaScript",
);
/* A short form is only granted when it is unique, which is why neither
 * hospital project may claim the word "hospital". */
ok("punto gets its short form", plan("punto'da ne yaptı").currentEntities.some(
  (entity) => entity.canonical === "Punto Organization",
));
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

/* ---------- B2. a catalogued technology is not a portfolio signal ----------
 *
 * The corpus lists C#, .NET and GitHub because Kaan uses them, and for a while
 * that membership alone made "What is C# used for?" a portfolio question: the
 * explicit-entity short-circuit fired before the definition-frame rule, so the
 * turn retrieved his skills section and answered in PORTFOLIO scope. The pair
 * that matters is the contrast — the same technology, with and without a
 * subject that is actually his.
 */
/**
 * RESOLUTION IS NOT AUTHORITY, and both halves are asserted.
 *
 * These two phrasings do resolve their entity today, which makes them the pair
 * that can prove the actual claim: Ajoop still RECOGNISES that the sentence
 * names C# or GitHub — recognition feeds chunk affinity and is worth keeping —
 * and that recognition no longer BUYS portfolio eligibility.
 *
 * Asserting only `contextEligible === false` would be satisfied just as well by
 * a future regression that stopped resolving these aliases altogether, because
 * the turn would then fall to the plain definition-frame branch and look
 * identical from the outside. The entity assertion is what separates the two.
 *
 * The expected TYPE comes from the resolver's own classification, not from a
 * technology list copied into this file.
 */
for (const [question, expectedType] of [
  ["What is C# used for?", ENTITY_TYPES.TECHNOLOGY],
  ["What is GitHub used for?", ENTITY_TYPES.CHANNEL],
]) {
  const result = plan(question);
  const resolved = result.currentEntities;
  ok(`the world entity still resolves: ${question}`, resolved.length > 0);
  ok(
    `and keeps its non-owned type: ${question}`,
    resolved.some((entity) => entity.type === expectedType),
  );
  check(`but it grants no eligibility: ${question}`, result.contextEligible, false);
  check(`for the world-entity reason: ${question}`, result.contextReason, "world-entity-definition");
  check(`and locks no project: ${question}`, result.activeProjects.length, 0);
}

/* ---------- B2b. portfolio-owner provenance survives entity resolution ----------
 *
 * "his" and "onun" already mean the portfolio owner in the exact-fact and
 * entity layers. Definition-style eligibility must preserve that authority;
 * generic relation nouns such as work/research/website/workflow grant none.
 */
for (const [question, canonical] of [
  ["What is C# used for in his work?", "C#"],
  ["What is GitHub used for in his workflow?", "GitHub"],
  ["What is Python used for in his research?", "Python"],
  ["What is JavaScript used for in his website?", "JavaScript"],
]) {
  const result = plan(question);
  check(`owner reference is recognized: ${question}`, mentionsPortfolioOwner(question), true);
  ok(`the portfolio-known entity resolves: ${question}`, result.currentEntities.some((entity) => entity.canonical === canonical));
  check(`owner reference grants eligibility: ${question}`, result.contextEligible, true);
  check(`owner-reference provenance is reported: ${question}`, result.contextReason, "owner-reference");
}

{
  const question = "onun C# deneyimi nedir?";
  const result = plan(question);
  check("the Turkish owner reference is recognized", mentionsPortfolioOwner(question), true);
  check("the Turkish owner-reference question stays eligible", result.contextEligible, true);
}

for (const question of [
  "What is C# used for?",
  "What is C# used for at work?",
  "What is C# used for in her work?",
  "What is C# used for in their work?",
]) {
  const result = plan(question);
  check(`no Kaan owner reference is invented: ${question}`, mentionsPortfolioOwner(question), false);
  check(`generic definition remains general: ${question}`, result.contextEligible, false);
  check(`generic definition keeps its world-entity reason: ${question}`, result.contextReason, "world-entity-definition");
}

{
  const withOwner = "What is C# used for in his work?";
  const withoutOwner = withOwner.replace("his ", "");
  check("mutation removes the only owner-reference authority", mentionsPortfolioOwner(withoutOwner), false);
  check("removing his makes the same C# definition ineligible", plan(withoutOwner).contextEligible, false);
  check("the independent at-work negative remains ineligible", plan("What is C# used for at work?").contextEligible, false);
}
/**
 * The same routing outcome, reached without any entity at all.
 *
 * Whether an alias survives tokenisation is orthogonal to the rule under test
 * ("What is C# used for?" resolves C#, "what is .net" does not), so these
 * phrasings assert the general routing only. Requiring them to resolve would
 * turn this block into a tokeniser test and would pressure the production fix
 * into solving a problem it should not own.
 */
for (const question of ["C# nedir?", "what is .net"]) {
  const result = plan(question);
  check(`world-entity definition stays general: ${question}`, result.contextEligible, false);
  ok(
    `for a general reason: ${question}`,
    ["world-entity-definition", "definition-frame"].includes(result.contextReason),
  );
  check(`and locks no project: ${question}`, result.activeProjects.length, 0);
}
/* The same words, once the question is about him, stay portfolio. */
for (const question of [
  "Kaan C# biliyor mu?",
  "Kaan C# ile ne yaptı?",
  "Kaan'ın GitHub adresi nedir?",
  "C# projelerinde ne yaptı?",
]) {
  check(`explicit person or framing stays portfolio: ${question}`, plan(question).contextEligible, true);
}
/* A definition frame naming one of HIS entities is still portfolio: the rule
 * keys on who owns the subject, not on the shape of the sentence. */
for (const question of ["SINAMA nedir?", "What is SINAMA?"]) {
  check(`owned-entity definition stays portfolio: ${question}`, plan(question).contextEligible, true);
}

/* ---------- B3. organization resolution is not relationship authority ---------- */

for (const question of ["CBOT nedir?", "What is CBOT?"]) {
  const result = plan(question);
  ok(
    `the organization still resolves: ${question}`,
    result.currentEntities.some((entity) => entity.canonical === "CBOT" && entity.type === ENTITY_TYPES.ORGANIZATION),
  );
  check(`a bare organization definition stays general: ${question}`, result.contextEligible, false);
  check(`for the world-entity reason: ${question}`, result.contextReason, "world-entity-definition");
  check(`and it gains no active organization authority: ${question}`, result.activeOrganizations.length, 0);
}

for (const question of [
  "Kaan CBOT'ta ne yaptı?",
  "Kaan'ın CBOT deneyimi nedir?",
  "What did Kaan do at CBOT?",
  "Tell me about Kaan's experience at CBOT.",
]) {
  const result = plan(question);
  ok(
    `the framed organization still resolves: ${question}`,
    result.currentEntities.some((entity) => entity.canonical === "CBOT" && entity.type === ENTITY_TYPES.ORGANIZATION),
  );
  check(`the Kaan relationship stays portfolio: ${question}`, result.contextEligible, true);
  check(`and keeps the organization active: ${question}`, result.activeOrganizations.join(), "CBOT");
}

{
  const result = plan("peki neden?", [
    { role: "user", content: "Kaan CBOT'ta ne yaptı?" },
    { role: "assistant", content: "CBOT deneyimini anlattım." },
  ]);
  check("an inherited organization remains eligible", result.contextEligible, true);
  check("and remains the active organization", result.activeOrganizations.join(), "CBOT");
}

{
  const result = plan("SINAMA nedir?");
  ok("the project contrast still resolves as a project", result.currentEntities.some((entity) => entity.canonical === "SINAMA" && entity.type === ENTITY_TYPES.PROJECT));
  check("project definition authority remains intact", result.contextEligible, true);
  check("and the project remains active", result.activeProjects.join(), "SINAMA");
}
/* The narrowing must not reach past the current turn: an inherited project
 * subject still makes a bare follow-up eligible. */
{
  const result = plan("peki hangi teknolojiler kullanılıyor?", [
    { role: "user", content: "Kaan'ın SINAMA projesini anlat." },
    { role: "assistant", content: "SINAMA bir değerlendirme platformu." },
  ]);
  check("[follow-up] an inherited project keeps the turn eligible", result.contextEligible, true);
  check("[follow-up] and it is still recognised as a follow-up", result.followUp, true);
}

/* ---------- C. entity typing drives isolation differently ---------- */

check("a project question locks to that project", plan("sinamanın stacki ne").activeProjects.join(), "SINAMA");
check("an ownerless organization relation grants no authority", plan("cbot'ta ne yaptı").contextEligible, false);
for (const [question, expected] of [
  ["outlier'da ne yaptı", "Outlier AI"],
  ["joyday'de ne yaptı", "Atölye Joyday"],
  ["punto'da ne yaptı", "Punto Organization"],
]) {
  const result = plan(question);
  check(`organization still resolves without authority: ${question}`, result.currentEntities.map((entity) => entity.canonical).join(), expected);
  check(`ownerless organization relation stays general: ${question}`, result.contextEligible, false);
  check(`ownerless organization relation activates no employer: ${question}`, result.activeOrganizations.length, 0);
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
ok("a follow-up sends a bounded active segment", selectGenerationHistory(heavy, { followUp: true, entityIndex }).length <= 4);
{
  const general = [user("Matrix filmini anlat"), bot("Bir bilim kurgu klasiği.")];
  const result = plan("neden bu kadar etkiliydi?", general);
  ok("[history] a general follow-up keeps continuity", result.generationHistory.length > 0);
  check("[history] without becoming a portfolio question", result.contextEligible, false);
}
{
  const portfolioState = { version: 1, scope: "portfolio", referents: ["SINAMA"], orderedReferents: [] };
  const portfolioHistory = [user("SINAMA'yı anlat."), bot("SINAMA bir projedir.")];
  const nodeQuestion = "Node.js event loop nasıl çalışır?";
  const nodeAnswer = "Node.js event loop görevleri aşamalar halinde işler.";
  const nodeTurn = plan(nodeQuestion, portfolioHistory, portfolioState).discourse;
  const nodeState = buildNextPublicConversationState({
    resolvedTurn: nodeTurn, answer: nodeAnswer, scope: "GENERAL", entityIndex, question: nodeQuestion,
  });
  const combined = [...portfolioHistory, user(nodeQuestion), bot(nodeAnswer)];
  const result = plan("Bunu daha teknik anlat.", combined, nodeState);
  check("[active-history] a fresh GENERAL segment keeps its own exchange", result.generationHistory.length, 2);
  check("[active-history] the GENERAL segment starts at the Node.js question", result.generationHistory[0]?.content, nodeQuestion);
  check("[active-history] stale SINAMA prose is excluded", result.generationHistory.some((item) => /SINAMA/.test(item.content)), false);
}
{
  const rankingQuestion = "Kaan'ın en güçlü 3 projesini söyle.";
  const rankingAnswer = "Portfolio bu sıralamayı sağlayamıyor.";
  const rankingTurn = plan(rankingQuestion).discourse;
  const rankingState = buildNextPublicConversationState({
    resolvedTurn: rankingTurn, answer: rankingAnswer, scope: "PORTFOLIO", entityIndex, question: rankingQuestion,
  });
  const rankingHistory = [user(rankingQuestion), bot(rankingAnswer)];
  const ordinalQuestion = "İkinci olanı anlat.";
  const ordinalTurn = plan(ordinalQuestion, rankingHistory, rankingState).discourse;
  const clarificationAnswer = "Hangi sıralı listeyi kastettiğini göremiyorum.";
  const clarificationState = buildNextPublicConversationState({
    resolvedTurn: ordinalTurn, answer: clarificationAnswer, scope: "GENERAL", entityIndex, question: ordinalQuestion,
  });
  const combined = [...rankingHistory, user(ordinalQuestion), bot(clarificationAnswer)];
  const result = plan("Daha detaylı anlat.", combined, clarificationState);
  check("[active-history] a post-clarification GENERAL continuation remains usable", result.followUp, true);
  check("[active-history] clarification is the generation-history boundary", result.generationHistory.length, 2);
  check("[active-history] post-boundary history starts at the unresolved ordinal", result.generationHistory[0]?.content, ordinalQuestion);
  check("[active-history] pre-boundary portfolio ranking is excluded", result.generationHistory.some((item) => /en güçlü 3 projesini/.test(item.content)), false);

  const detailQuestion = "Daha detaylı anlat.";
  const detailAnswer = "Genel açıklamayı biraz daha ayrıntılandırdım.";
  const extended = [...combined, user(detailQuestion), bot(detailAnswer)];
  const singularQuestion = "Bunu daha teknik anlat.";
  const singular = plan(singularQuestion, extended, clarificationState);
  check("[active-history-textual] post-clarification singular remains a continuation", singular.discourse.turnKind, "continuation");
  check("[active-history-textual] post-clarification singular uses history-text", singular.discourse.continuationSource, "history-text");
  check("[active-history-textual] post-clarification singular remains general", singular.discourse.contextScope, "general");
  check("[active-history-textual] post-clarification singular grants no portfolio authority", singular.contextEligible, false);
  check("[active-history-textual] post-clarification singular receives the max-four safe segment", singular.generationHistory.length, 4);
  check("[active-history-textual] safe segment starts at the ordinal boundary", singular.generationHistory[0]?.content, ordinalQuestion);
  check("[active-history-textual] safe segment retains the clarification answer", singular.generationHistory[1]?.content, clarificationAnswer);
  check("[active-history-textual] safe segment excludes ranking prose", singular.generationHistory.some((item) => /en güçlü 3 projesini/.test(item.content)), false);

  const singularAnswer = "Genel açıklamayı teknik ayrıntılarla genişlettim.";
  const twiceExtended = [...extended, user(singularQuestion), bot(singularAnswer)];
  const nextSingular = plan("Onu biraz aç.", twiceExtended, clarificationState);
  check("[active-history-textual] successive singular remains a continuation", nextSingular.discourse.turnKind, "continuation");
  check("[active-history-textual] successive singular uses history-text", nextSingular.discourse.continuationSource, "history-text");
  check("[active-history-textual] successive singular remains general", nextSingular.discourse.contextScope, "general");
  check("[active-history-textual] successive singular grants no portfolio authority", nextSingular.contextEligible, false);
  check("[active-history-textual] successive singular remains max-four bounded", nextSingular.generationHistory.length, 4);
  check("[active-history-textual] successive singular keeps the prior GENERAL depth turn", nextSingular.generationHistory[0]?.content, detailQuestion);
  check("[active-history-textual] successive singular keeps the immediately prior answer", nextSingular.generationHistory.at(-1)?.content, singularAnswer);
  check("[active-history-textual] successive singular excludes ranking prose", nextSingular.generationHistory.some((item) => /en güçlü 3 projesini/.test(item.content)), false);

  const second = plan("Az önceki cevabı tek cümlede özetle.", extended, clarificationState);
  check("[active-history] a second post-clarification follow-up remains usable", second.followUp, true);
  check("[active-history] the stable clarification segment fills the four-message bound", second.generationHistory.length, 4);
  check("[active-history] the stable segment still begins at the ordinal", second.generationHistory[0]?.content, ordinalQuestion);
  check("[active-history] the stable segment retains the clarification answer", second.generationHistory[1]?.content, clarificationAnswer);
  check("[active-history] the second follow-up still excludes portfolio ranking", second.generationHistory.some((item) => /en güçlü 3 projesini/.test(item.content)), false);
}
{
  const portfolioState = { version: 1, scope: "portfolio", referents: ["SINAMA"], orderedReferents: [] };
  const portfolioHistory = [user("SINAMA'yı anlat."), bot("SINAMA bir projedir.")];
  const result = plan("Daha teknik anlat.", portfolioHistory, portfolioState);
  check("[active-history-positive] portfolio continuation retains authority", result.contextEligible, true);
  check("[active-history-positive] portfolio continuation retains its active exchange", result.generationHistory.length, 2);
  check("[active-history-positive] portfolio history still contains SINAMA", result.generationHistory.some((item) => /SINAMA/.test(item.content)), true);
  for (const [label, state] of [
    ["absent", undefined],
    ["rejected", { version: 99, scope: "general", referents: [], orderedReferents: [] }],
  ]) {
    const fallback = plan("Daha teknik anlat.", portfolioHistory, state);
    check(`[active-history-fallback] ${label} state retains portfolio authority`, fallback.contextEligible, true);
    check(`[active-history-fallback] ${label} state retains bounded active history`, fallback.generationHistory.length, 2);
  }
}
{
  const generalState = { version: 1, scope: "general", referents: [], orderedReferents: [] };
  const portfolioHistory = [user("SINAMA'yı anlat."), bot("SINAMA bir projedir.")];
  const blocked = plan("Daha detaylı anlat.", portfolioHistory, generalState);
  check("[active-history-boundary] accepted GENERAL over portfolio-only history sends no generation history", blocked.generationHistory.length, 0);
  const blockedSingular = plan("Bunu daha teknik anlat.", portfolioHistory, generalState);
  check("[active-history-boundary] accepted GENERAL portfolio-only singular clarifies", blockedSingular.discourse.turnKind, "ambiguous");
  check("[active-history-boundary] accepted GENERAL portfolio-only singular has no textual source", blockedSingular.discourse.continuationSource, "none");
  check("[active-history-boundary] accepted GENERAL portfolio-only singular sends no generation history", blockedSingular.generationHistory.length, 0);
  check("[active-history-boundary] accepted GENERAL portfolio-only singular grants no authority", blockedSingular.contextEligible, false);

  const generalHistory = [
    user("Node.js event loop nasıl çalışır?"), bot("Node yanıtı 1."),
    user("Daha teknik anlat."), bot("Node yanıtı 2."),
    user("Biraz daha aç."), bot("Node yanıtı 3."),
  ];
  const bounded = plan("Tek cümlede özetle.", generalHistory, generalState);
  check("[active-history-boundary] three completed GENERAL exchanges are bounded after segmentation", bounded.generationHistory.length, 4);
  check("[active-history-boundary] max-four begins at the second GENERAL exchange", bounded.generationHistory[0]?.content, "Daha teknik anlat.");
  check("[active-history-boundary] max-four retains the latest GENERAL answer", bounded.generationHistory.at(-1)?.content, "Node yanıtı 3.");
}
{
  const generalState = { version: 1, scope: "general", referents: [], orderedReferents: [] };
  const portfolioPair = [user("SINAMA'yı anlat."), bot("SINAMA bir projedir.")];
  for (const [label, history] of [
    ["trailing user", [...portfolioPair, user("İkinci olanı anlat.")]],
    ["trailing assistant", [...portfolioPair, bot("Artık yanıt.")]],
    ["assistant only", [bot("SINAMA bir projedir.")]],
    ["user only", [user("SINAMA'yı anlat.")]],
  ]) {
    const result = plan("Daha detaylı anlat.", history, generalState);
    check(`[active-history-malformed] ${label} cannot establish a completed GENERAL boundary`, result.generationHistory.length, 0);
  }

  for (const [label, history] of [
    ["assistant then user", [bot("orphan assistant"), user("orphan user")]],
    ["two assistants then user", [bot("orphan one"), bot("orphan two"), user("orphan user")]],
  ]) {
    const result = plan("Bunu daha teknik anlat.", history, generalState);
    check(`[textual-antecedent] ${label} is structurally ambiguous`, result.discourse.turnKind, "ambiguous");
    check(`[textual-antecedent] ${label} does not become history-text`, result.discourse.continuationSource, "none");
    check(`[textual-antecedent] ${label} reports the missing antecedent`, result.discourse.unresolvedReason, "missing-singular-antecedent");
    check(`[textual-antecedent] ${label} sends no generation history`, result.generationHistory.length, 0);
    check(`[textual-antecedent] ${label} grants no portfolio authority`, result.contextEligible, false);
  }

  const nodeQuestion = "Node.js event loop nasıl çalışır?";
  const nodeAnswer = "Node.js event loop görevleri aşamalar halinde işler.";
  for (const [label, history] of [
    ["leading orphan plus pair", [bot("orphan assistant"), user(nodeQuestion), bot(nodeAnswer)]],
    ["completed pair only", [user(nodeQuestion), bot(nodeAnswer)]],
  ]) {
    const result = plan("Bunu daha teknik anlat.", history, generalState);
    check(`[textual-antecedent] ${label} remains a continuation`, result.discourse.turnKind, "continuation");
    check(`[textual-antecedent] ${label} uses canonical history-text`, result.discourse.continuationSource, "history-text");
    check(`[textual-antecedent] ${label} keeps exactly one completed pair`, result.generationHistory.length, 2);
    check(`[textual-antecedent] ${label} starts with Node.js`, result.generationHistory[0]?.content, nodeQuestion);
    check(`[textual-antecedent] ${label} retains the Node.js answer`, result.generationHistory[1]?.content, nodeAnswer);
    check(`[textual-antecedent] ${label} stays general`, result.contextEligible, false);
  }
}
{
  const pairQuestion = "Outlier AI ve CBOT nedir?";
  const pairAnswer = "Outlier AI ve CBOT iki farklı organizasyondur.";
  const pairTurn = plan(pairQuestion).discourse;
  const pairState = buildNextPublicConversationState({
    resolvedTurn: pairTurn, answer: pairAnswer, scope: "GENERAL", entityIndex, question: pairQuestion,
  });
  const pairHistory = [user(pairQuestion), bot(pairAnswer)];
  for (const question of ["İkisini karşılaştır.", "Bunları karşılaştır."]) {
    const result = plan(question, pairHistory, pairState);
    check(`[general-world-pair] ${question} remains a continuation`, result.discourse.turnKind, "continuation");
    check(`[general-world-pair] ${question} uses both user-established organizations`, result.discourse.referents.join("|"), "CBOT|Outlier AI");
    check(`[general-world-pair] ${question} remains GENERAL`, result.discourse.contextScope, "general");
    check(`[general-world-pair] ${question} grants no portfolio authority`, result.contextEligible, false);
    check(`[general-world-pair] ${question} activates no employer retrieval filter`, result.activeOrganizations.length, 0);
    check(`[general-world-pair] ${question} retains the completed general exchange`, result.generationHistory.length, 2);
  }

  for (const [question, expected] of [
    ["İlkini anlat.", "Outlier AI"],
    ["İkincisini anlat.", "CBOT"],
  ]) {
    const result = plan(question, pairHistory, pairState);
    check(`[general-world-order] ${question} follows user textual order`, result.discourse.primaryReferent, expected);
    check(`[general-world-order] ${question} remains a continuation`, result.discourse.turnKind, "continuation");
    check(`[general-world-order] ${question} uses history ordinal`, result.discourse.continuationSource, "history-ordinal");
    check(`[general-world-order] ${question} remains GENERAL`, result.discourse.contextScope, "general");
    check(`[general-world-order] ${question} grants no portfolio authority`, result.contextEligible, false);
    check(`[general-world-order] ${question} activates no employer retrieval filter`, result.activeOrganizations.length, 0);
  }

  const reverseQuestion = "CBOT ve Outlier AI nedir?";
  const reverseAnswer = "CBOT ve Outlier AI iki farklı organizasyondur.";
  const reverseTurn = plan(reverseQuestion).discourse;
  const reverseState = buildNextPublicConversationState({
    resolvedTurn: reverseTurn, answer: reverseAnswer, scope: "GENERAL", entityIndex, question: reverseQuestion,
  });
  const reverseOrdinal = plan("İkincisini anlat.", [user(reverseQuestion), bot(reverseAnswer)], reverseState);
  check("[general-world-order] reverse pair proves textual rather than index order", reverseOrdinal.discourse.primaryReferent, "Outlier AI");
  check("[general-world-order] reverse pair stays GENERAL", reverseOrdinal.discourse.contextScope, "general");
  check("[general-world-order] reverse pair grants no authority", reverseOrdinal.contextEligible, false);

  const tripleQuestion = "Outlier AI, CBOT ve Joyday nedir?";
  const tripleAnswer = "Outlier AI, CBOT ve Joyday üç farklı organizasyondur.";
  const tripleTurn = plan(tripleQuestion).discourse;
  const tripleState = buildNextPublicConversationState({
    resolvedTurn: tripleTurn, answer: tripleAnswer, scope: "GENERAL", entityIndex, question: tripleQuestion,
  });
  const tripleHistory = [user(tripleQuestion), bot(tripleAnswer)];
  for (const [question, expected] of [
    ["İlkini anlat.", "Outlier AI"],
    ["İkincisini anlat.", "CBOT"],
    ["Üçüncüsünü anlat.", "Atölye Joyday"],
  ]) {
    const result = plan(question, tripleHistory, tripleState);
    check(`[general-world-order] triple ${question} follows textual order`, result.discourse.primaryReferent, expected);
    check(`[general-world-order] triple ${question} stays unauthorized`, result.contextEligible, false);
  }

  const detailQuestion = "Daha detaylı anlat.";
  const detailAnswer = "İki organizasyonun amaçlarını genel düzeyde ayrıntılandırdım.";
  const detailTurn = plan(detailQuestion, pairHistory, pairState).discourse;
  const detailState = buildNextPublicConversationState({
    resolvedTurn: detailTurn, answer: detailAnswer, scope: "GENERAL", entityIndex, question: detailQuestion,
  });
  const extended = [...pairHistory, user(detailQuestion), bot(detailAnswer)];
  const afterDetail = plan("İkisini karşılaştır.", extended, detailState);
  check("[general-world-pair] pair survives one GENERAL continuation", afterDetail.discourse.referents.join("|"), "CBOT|Outlier AI");
  check("[general-world-pair] continued pair stays GENERAL", afterDetail.discourse.contextScope, "general");
  check("[general-world-pair] continued pair grants no authority", afterDetail.contextEligible, false);
  check("[general-world-pair] continued pair uses the bounded GENERAL segment", afterDetail.generationHistory.length, 4);
  const ordinalAfterDetail = plan("İkincisini anlat.", extended, detailState);
  check("[general-world-order] pair order survives a GENERAL depth continuation", ordinalAfterDetail.discourse.primaryReferent, "CBOT");
  check("[general-world-order] depth-chain ordinal stays GENERAL", ordinalAfterDetail.discourse.contextScope, "general");
  check("[general-world-order] depth-chain ordinal grants no authority", ordinalAfterDetail.contextEligible, false);

  const longHistory = [
    user("SINAMA'yı anlat."), bot("SINAMA bir projedir."),
    ...pairHistory,
    user(detailQuestion), bot(detailAnswer),
    user("Biraz daha aç."), bot("Genel organizasyon açıklamasını genişlettim."),
  ];
  const long = plan("Bunları karşılaştır.", longHistory, detailState);
  check("[general-world-pair] long chain retains only organization referents", long.discourse.referents.join("|"), "CBOT|Outlier AI");
  check("[general-world-pair] long chain never reaches stale SINAMA", long.discourse.referents.includes("SINAMA"), false);
  check("[general-world-pair] long chain remains unauthorized", long.contextEligible, false);
  check("[general-world-pair] long chain remains max-four bounded", long.generationHistory.length, 4);
  check("[general-world-pair] long chain generation excludes SINAMA", long.generationHistory.some((item) => /SINAMA/.test(item.content)), false);
  const longOrdinal = plan("İkincisini anlat.", longHistory, detailState);
  check("[general-world-order] old SINAMA cannot displace fresh organization order", longOrdinal.discourse.primaryReferent, "CBOT");
  check("[general-world-order] old SINAMA is absent from ordinal generation", longOrdinal.generationHistory.some((item) => /SINAMA/.test(item.content)), false);

  const singleHistory = [user("CBOT nedir?"), bot("CBOT bir organizasyondur.")];
  const singleOrdinal = plan("İkincisini anlat.", singleHistory, pairState);
  check("[general-world-order] one organization cannot satisfy second ordinal", singleOrdinal.discourse.turnKind, "ambiguous");
  check("[general-world-order] one organization reports missing order", singleOrdinal.discourse.unresolvedReason, "missing-ordered-antecedent");

  for (const [label, history] of [
    ["assistant then user", [bot("Outlier AI ve CBOT"), user("Outlier AI ve CBOT nedir?")]],
    ["two assistants then user", [bot("Outlier AI"), bot("CBOT"), user("Outlier AI ve CBOT nedir?")]],
  ]) {
    const malformed = plan("İkincisini anlat.", history, pairState);
    check(`[general-world-order] malformed ${label} cannot establish order`, malformed.discourse.turnKind, "ambiguous");
    check(`[general-world-order] malformed ${label} supplies no referent`, malformed.discourse.referents.length, 0);
    check(`[general-world-order] malformed ${label} grants no authority`, malformed.contextEligible, false);
  }

  for (const [label, history] of [
    ["project pair", [user("SINAMA ve Ajoop Portfolio Copilot nedir?"), bot("İki proje hakkında yanıt.")]],
    ["owner organization pair", [user("Kaan CBOT ve Outlier AI'da ne yaptı?"), bot("Kaan'ın iki deneyimi hakkında yanıt.")]],
  ]) {
    const blocked = plan("İkincisini anlat.", history, pairState);
    check(`[general-world-order] ${label} cannot become GENERAL order`, blocked.discourse.turnKind, "ambiguous");
    check(`[general-world-order] ${label} supplies no GENERAL ordinal referent`, blocked.discourse.referents.length, 0);
    check(`[general-world-order] ${label} cannot restore authority`, blocked.contextEligible, false);
  }
}
{
  const generalState = { version: 1, scope: "general", referents: [], orderedReferents: [] };
  const cbotHistory = [user("CBOT nedir?"), bot("CBOT hakkında genel bir organizasyon açıklaması.")];
  const mixed = plan("Bunu Outlier AI ile karşılaştır.", cbotHistory, generalState);
  check("[general-world-mixed] mixed comparison continues", mixed.discourse.turnKind, "continuation");
  check("[general-world-mixed] mixed comparison reports history-mixed", mixed.discourse.continuationSource, "history-mixed");
  check("[general-world-mixed] mixed comparison preserves CBOT and Outlier", mixed.discourse.referents.join("|"), "CBOT|Outlier AI");
  check("[general-world-mixed] mixed comparison stays GENERAL", mixed.discourse.contextScope, "general");
  check("[general-world-mixed] mixed comparison grants no authority", mixed.contextEligible, false);
  check("[general-world-mixed] mixed comparison activates no employer retrieval", mixed.activeOrganizations.length, 0);

  const singular = plan("Onun tarihi ne?", cbotHistory, generalState);
  check("[general-world-singular] organization singular continues", singular.discourse.turnKind, "continuation");
  check("[general-world-singular] organization singular preserves CBOT", singular.discourse.referents.join(), "CBOT");
  check("[general-world-singular] organization singular stays GENERAL", singular.discourse.contextScope, "general");
  check("[general-world-singular] organization singular grants no authority", singular.contextEligible, false);
  check("[general-world-singular] organization singular activates no employer retrieval", singular.activeOrganizations.length, 0);

  const pairHistory = [user("Outlier AI ve CBOT nedir?"), bot("İki organizasyon hakkında genel açıklama.")];
  const ambiguous = plan("Bunu anlat.", pairHistory, generalState);
  check("[general-world-singular] pair singular is ambiguous", ambiguous.discourse.turnKind, "ambiguous");
  check("[general-world-singular] pair singular does not degrade to history-text", ambiguous.discourse.continuationSource, "none");
  check("[general-world-singular] pair singular reports ambiguous antecedent", ambiguous.discourse.unresolvedReason, "ambiguous-singular-antecedent");
  check("[general-world-singular] pair singular grants no authority", ambiguous.contextEligible, false);
  check("[general-world-singular] pair singular sends no generation history", ambiguous.generationHistory.length, 0);

  for (const [label, history] of [
    ["person", [user("Kaan kimdir?"), bot("Kaan hakkında bir yanıt.")]],
    ["owner organization", [user("Kaan CBOT'ta ne yaptı?"), bot("Kaan ve CBOT hakkında bir yanıt.")]],
  ]) {
    const blocked = plan("Bunu daha teknik anlat.", history, generalState);
    check(`[general-world-negative] ${label} cannot become a GENERAL referent`, blocked.discourse.referents.length, 0);
    check(`[general-world-negative] ${label} safely clarifies`, blocked.discourse.turnKind, "ambiguous");
    check(`[general-world-negative] ${label} grants no authority`, blocked.contextEligible, false);
    check(`[general-world-negative] ${label} sends no generation history`, blocked.generationHistory.length, 0);
  }
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
      const scope = state.prompts.at(-1).includes("Answer strategy: general.") ? "GENERAL" : "PORTFOLIO";
      return { ok: true, json: async () => ({ message: { content: ` ${scope}\nANSWER: Stubbed.` } }) };
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

/* Explicit-owner organization isolation, again under adversarial similarity. */
for (const [question, expected, wrongBias] of [
  ["CBOT'ta Kaan ne yaptı?", "cbot", "joyday|outlier"],
  ["Kaan'ın Outlier AI deneyimi neydi?", "outlier", "cbot|joyday"],
  ["Joyday'de Kaan teknik olarak ne yaptı?", "joyday", "cbot|punto"],
  ["Kaan Punto'da ne yaptı?", "punto", "cbot|oceans"],
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
