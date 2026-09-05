#!/usr/bin/env node
/**
 * Answer strategy, evidence curation and generation-quality contracts.
 *
 * Node built-ins only. Model and embedding calls are deterministic stubs; no
 * network or Ollama is used.
 */
import {
  ANSWER_MODES,
  ROLE_FAMILIES,
  buildSafeFallback,
  detectAnswerRepetition,
  detectRecruiterQuestion,
  recruiterEvidenceIds,
  selectAnswerStrategy,
  selectEvidenceRecords,
  selectRecruiterContext,
  serializeSelectedEvidence,
  validateGeneratedAnswer,
} from "../server/ajoop-answer.mjs";
import { createAjoopRag, parseScopedAnswer } from "../server/ajoop-rag.mjs";

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

const projectPlan = (projects = []) => ({
  contextEligible: true,
  activeProjects: projects,
  activeOrganizations: [],
  experienceFocus: null,
  followUp: false,
});

/* ---------- strategy selection ---------- */

for (const [question, mode, history = []] of [
  ["Kaan bu role uygun mu?", ANSWER_MODES.RECRUITER_FIT],
  ["Neden Kaan'ı işe almalıyız?", ANSWER_MODES.RECRUITER_HIRE],
  ["Kaan'ın en güçlü tarafları neler?", ANSWER_MODES.RECRUITER_STRENGTHS],
  ["Kaan'ın AI Engineer rolü için eksikleri neler?", ANSWER_MODES.RECRUITER_GAPS],
  ["What would worry you as a hiring manager?", ANSWER_MODES.RECRUITER_RISK],
  ["Kaan'ı diğer junior adaylardan ayıran ne?", ANSWER_MODES.RECRUITER_DIFFERENTIATION],
  ["Kaan hangi role en uygun?", ANSWER_MODES.RECRUITER_BEST_ROLE],
  ["Hangi şirket ortamında daha iyi performans gösterir?", ANSWER_MODES.RECRUITER_ENVIRONMENT],
  ["Bunu neye dayanarak söylüyorsun?", ANSWER_MODES.RECRUITER_EVIDENCE, [{ role: "user", content: "Kaan bu role uygun mu?" }]],
]) {
  check(`recruiter mode: ${question}`, detectRecruiterQuestion(question, history)?.mode, mode);
}

for (const [question, family] of [
  ["Forward Deployed Engineer rolüne uygun mu?", ROLE_FAMILIES.FORWARD_DEPLOYED],
  ["Applied AI Engineer için güçlü bir aday mı?", ROLE_FAMILIES.APPLIED_AI],
  ["Software Engineer rolü için hangi kanıtları var?", ROLE_FAMILIES.SOFTWARE],
  ["AI Product rolüne uygun mu?", ROLE_FAMILIES.AI_PRODUCT],
]) {
  check(`role family: ${question}`, detectRecruiterQuestion(question)?.roleFamily, family);
}

check(
  "project mode",
  selectAnswerStrategy({ question: "SINAMA stacki ne", plan: projectPlan(["SINAMA"]) }).mode,
  ANSWER_MODES.PORTFOLIO_PROJECT,
);
check(
  "comparison mode",
  selectAnswerStrategy({ question: "karşılaştır", plan: projectPlan(["SINAMA", "Merge Rush: Tiny Factory"]) }).mode,
  ANSWER_MODES.COMPARISON,
);
check(
  "experience mode",
  selectAnswerStrategy({
    question: "CBOT'ta ne yaptı?",
    plan: { ...projectPlan(), activeOrganizations: ["CBOT"], experienceFocus: "specific" },
  }).mode,
  ANSWER_MODES.PORTFOLIO_EXPERIENCE,
);
check(
  "self mode",
  selectAnswerStrategy({ question: "sen kimsin?", plan: projectPlan() }).mode,
  ANSWER_MODES.SELF,
);
check(
  "general mode",
  selectAnswerStrategy({ question: "RAG nedir?", plan: { ...projectPlan(), contextEligible: false } }).mode,
  ANSWER_MODES.GENERAL,
);
check(
  "follow-up mode",
  selectAnswerStrategy({
    question: "peki neden önemli?",
    plan: { ...projectPlan(), followUp: true },
  }).mode,
  ANSWER_MODES.FOLLOW_UP,
);

/* ---------- role-family context and evidence ---------- */

const allRoleIds = [
  "recruiter-intelligence",
  "professional-positioning",
  "skills:programming",
  "experience:cbot",
  "experience:atolye-joyday",
  "experience:outlier-ai",
  "experience:punto-organization-software",
  "project:sinama",
  "project:hospital-form-app",
  "project:merge-rush-tiny-factory",
];
const roleIndex = allRoleIds.map((entityId, index) => ({
  id: `master-knowledge:${entityId}:1`,
  source: "master-knowledge",
  entityId,
  entityType: entityId.split(":")[0],
  title: entityId,
  text: `source: master-knowledge\nentity: ${entityId}\ntitle: ${entityId}\nEvidence for ${entityId}.`,
  visibility: "public",
  priority: index + 1,
  metadata: { links: [{ type: "github", url: "https://github.com/UAJOP" }] },
}));

for (const [family, expected] of [
  [ROLE_FAMILIES.FORWARD_DEPLOYED, ["recruiter-intelligence", "experience:cbot", "project:sinama", "experience:atolye-joyday"]],
  [ROLE_FAMILIES.APPLIED_AI, ["recruiter-intelligence", "project:sinama", "experience:outlier-ai", "experience:cbot"]],
  [ROLE_FAMILIES.SOFTWARE, ["recruiter-intelligence", "skills:programming", "experience:punto-organization-software", "project:hospital-form-app"]],
]) {
  const strategy = { recruiter: true, roleFamily: family, mode: ANSWER_MODES.RECRUITER_FIT, evidenceLimit: 4 };
  check(`${family} mapping`, recruiterEvidenceIds(strategy).join(), expected.join());
  check(
    `${family} deterministic context`,
    selectRecruiterContext(roleIndex, strategy).map((item) => item.entityId).join(),
    expected.join(),
  );
  ok(
    `${family} excludes random game evidence`,
    !selectRecruiterContext(roleIndex, strategy).some((item) => item.entityId === "project:merge-rush-tiny-factory"),
  );
}

const affinity = new Map([
  ["master-sinama", { projects: ["SINAMA"], organizations: [] }],
  ["detail-sinama", { projects: ["SINAMA"], organizations: [] }],
  ["build-sinama", { projects: ["SINAMA"], organizations: [] }],
  ["merge", { projects: ["Merge Rush: Tiny Factory"], organizations: [] }],
  ["cbot", { projects: [], organizations: ["CBOT"] }],
]);
const records = [
  { id: "build-sinama", source: "build-log", entityId: "build-1", title: "SINAMA log", visibility: "public", priority: 1 },
  { id: "detail-sinama", source: "project-details", entityId: "sinama", title: "SINAMA detail", visibility: "public", priority: 2 },
  { id: "master-sinama", source: "master-knowledge", entityId: "project:sinama", title: "SINAMA", visibility: "public", priority: 1 },
  { id: "merge", source: "master-knowledge", entityId: "project:merge-rush-tiny-factory", title: "Merge Rush", visibility: "public", priority: 1 },
  { id: "cbot", source: "master-knowledge", entityId: "experience:cbot", title: "CBOT", entityType: "experience", visibility: "public", priority: 1 },
];
const sinamaEvidence = selectEvidenceRecords({
  strategy: { mode: ANSWER_MODES.PORTFOLIO_PROJECT, expectedScope: "PORTFOLIO", evidenceLimit: 2, activeProjects: ["SINAMA"] },
  records,
  affinity,
});
check("named project evidence deduplicates to one entity", sinamaEvidence.length, 1);
check("named project prefers canonical source", sinamaEvidence[0]?.source, "master-knowledge");
ok("named project excludes Merge Rush", sinamaEvidence.every((item) => item.entityId !== "project:merge-rush-tiny-factory"));

const cbotEvidence = selectEvidenceRecords({
  strategy: { mode: ANSWER_MODES.PORTFOLIO_EXPERIENCE, expectedScope: "PORTFOLIO", evidenceLimit: 3, activeOrganizations: ["CBOT"] },
  records,
  affinity,
});
check("named experience puts CBOT first", cbotEvidence[0]?.entityId, "experience:cbot");

check(
  "GENERAL evidence is always empty",
  selectEvidenceRecords({ strategy: { expectedScope: "GENERAL", evidenceLimit: 4 }, records, affinity }).length,
  0,
);
check(
  "unsupported portfolio claim does not compensate with unrelated evidence",
  selectEvidenceRecords({
    strategy: { mode: ANSWER_MODES.PORTFOLIO_FACT, expectedScope: "PORTFOLIO", evidenceLimit: 3 },
    records,
    affinity,
    answer: "The portfolio does not record production Kubernetes ownership.",
  }).length,
  0,
);
const serialized = serializeSelectedEvidence([{ ...records[2], text: "source: x\nentity: y\ntitle: z\nCanonical SINAMA evidence.", metadata: {
  links: [
    { type: "github", url: "https://github.com/UAJOP/sinama" },
    { type: "bad", url: "javascript:alert(1)" },
  ],
} }]);
check("serialized evidence keeps its canonical title", serialized[0]?.title, "SINAMA");
check("serialized evidence derives a compact record summary", serialized[0]?.summary, "Canonical SINAMA evidence.");
check("only structured safe links survive", serialized[0]?.links.length, 1);

/* ---------- generation validator ---------- */

const generalStrategy = { expectedScope: "GENERAL", mode: ANSWER_MODES.GENERAL };
const portfolioStrategy = { expectedScope: "PORTFOLIO", mode: ANSWER_MODES.PORTFOLIO_PROJECT };
const valid = (scope, answer) => ({ scope, answer, contractText: `SCOPE: ${scope}\nANSWER: ${answer}` });

ok("valid compact output passes", validateGeneratedAnswer({
  parsed: valid("GENERAL", "Castling moves the king two squares toward the rook."),
  strategy: generalStrategy,
}).ok);
for (const [label, parsed, expectedFlag] of [
  ["empty", null, "malformed-contract"],
  ["scope mismatch", valid("PORTFOLIO", "A useful answer."), "scope-mismatch"],
  ["reasoning leak", { ...valid("GENERAL", "A useful answer."), contractText: "I need to decide.\nSCOPE: GENERAL\nANSWER: A useful answer." }, "reasoning-leak"],
  ["contract noise", { ...valid("GENERAL", "A useful answer."), contractText: "Sure.\nSCOPE: GENERAL\nANSWER: A useful answer." }, "contract-noise"],
  ["language leak", valid("GENERAL", "The answer starts well. Kendisi then changes template."), "language-template-leak"],
]) {
  const result = validateGeneratedAnswer({ parsed, strategy: generalStrategy, locale: "en" });
  ok(`${label} is rejected`, !result.ok);
  ok(`${label} exposes ${expectedFlag}`, result.flags.includes(expectedFlag));
}

const repeated = "Castling moves the king two squares toward the rook. Castling moves the king two squares toward the rook. Castling moves the king two squares toward the rook.";
check("repeated sentences are detected", detectAnswerRepetition(repeated), "repeated-sentence");
check(
  "near-duplicate sentences are detected",
  detectAnswerRepetition("Castling moves a king two squares toward one rook when the path is clear. The king moves two squares toward the rook when the path is clear."),
  "near-repeated-sentence",
);
ok("duplicate contract parser rejects output", !parseScopedAnswer("SCOPE: GENERAL\nANSWER: A.\nSCOPE: GENERAL\nANSWER: B."));
ok("duplicate answer parser rejects output", !parseScopedAnswer("SCOPE: GENERAL\nANSWER: A.\nANSWER: B."));
ok("empty answer parser rejects output", !parseScopedAnswer("SCOPE: PORTFOLIO\nANSWER:"));

const contradiction = validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "The portfolio does not specify the stack, but it uses Phaser 3 and TypeScript."),
  strategy: portfolioStrategy,
  question: "Merge Rush stacki ne?",
  records: [{ text: "Technologies: Phaser 3, TypeScript" }],
});
ok("direct-evidence contradiction is rejected", !contradiction.ok);
ok("contradiction exposes its repair signal", contradiction.flags.includes("evidence-contradiction"));
ok("token-cut ending is rejected", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "This otherwise plausible recruiter assessment was cut off before it could finish the final oper"),
  strategy: portfolioStrategy,
}).flags.includes("incomplete-ending"));
ok("full English template in Turkish is rejected", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "Worked with major models and completed tasks across projects, evaluated outputs and assessed quality."),
  strategy: portfolioStrategy,
  locale: "tr",
}).flags.includes("language-template-leak"));

/* ---------- localized safe fallback ---------- */

const fallbackRecords = [
  { title: "SINAMA" },
  { title: "CBOT" },
  { title: "Merge Rush: Tiny Factory" },
];
for (const locale of ["tr", "en", "de", "es", "fr"]) {
  const fallback = buildSafeFallback({ strategy: portfolioStrategy, locale, records: fallbackRecords });
  check(`${locale} portfolio fallback scope`, fallback.scope, "PORTFOLIO");
  ok(`${locale} fallback preserves SINAMA`, fallback.answer.includes("SINAMA"));
  ok(`${locale} fallback preserves CBOT`, fallback.answer.includes("CBOT"));
  ok(`${locale} fallback preserves Merge Rush`, fallback.answer.includes("Merge Rush: Tiny Factory"));
  const general = buildSafeFallback({ strategy: generalStrategy, locale, records: [] });
  check(`${locale} general fallback scope`, general.scope, "GENERAL");
  ok(`${locale} general fallback is concise`, general.answer.length < 120);
}

/* ---------- end to end: calls, retry, fallback and evidence ---------- */

const ORIGIN = "https://kaanbalci.com";
const ENV = { AJOOP_AI_ALLOWED_ORIGINS: ORIGIN, AJOOP_AI_RATE_MAX: "100" };
const defaultReply = ({ prompt }) => {
  const scope = prompt.includes("Answer strategy: general.") || prompt.includes("Answer strategy: self-about-ajoop.")
    ? "GENERAL"
    : "PORTFOLIO";
  return ` ${scope}\nANSWER: This is a concise grounded answer.`;
};

const makeRag = async (reply = defaultReply) => {
  const state = { embed: 0, chat: 0, built: false, prompts: [] };
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).includes("/api/chat")) {
      state.chat += 1;
      const prompt = body.messages.map((message) => message.content).join("\n");
      state.prompts.push(prompt);
      return { ok: true, json: async () => ({ message: { content: reply({ state, prompt, body }) } }) };
    }
    state.embed += 1;
    const query = state.built && body.input.length === 1;
    return {
      ok: true,
      json: async () => ({ embeddings: body.input.map(() => query ? [1, 0, 0] : [0.01, 1, 0]) }),
    };
  };
  const rag = createAjoopRag({ env: ENV, fetchImpl });
  await rag.initialize();
  state.initEmbed = state.embed;
  state.built = true;
  return { rag, state };
};
const ask = (rag, question, locale = "en", history = []) => rag.handle({
  method: "POST",
  origin: ORIGIN,
  contentType: "application/json",
  body: JSON.stringify({ version: 1, mode: "rag", question, locale, history }),
});

{
  const { rag, state } = await makeRag();
  const response = await ask(rag, "RAG nedir?", "tr");
  check("valid GENERAL uses zero per-turn embeddings", state.embed - state.initEmbed, 0);
  check("valid GENERAL uses one chat", state.chat, 1);
  check("valid GENERAL has no sources", response.body.sources.length, 0);
  check("valid GENERAL has no evidence", response.body.evidence.length, 0);
  check("valid GENERAL reports one attempt", response.body.generationAttempts, 1);
}

for (const [question, expectedMode, expectedEvidence] of [
  ["SINAMA stacki ne", ANSWER_MODES.PORTFOLIO_PROJECT, "project:sinama"],
  ["Merge Rush stacki ne", ANSWER_MODES.PORTFOLIO_PROJECT, "project:merge-rush-tiny-factory"],
  ["Hospital Form App hangi teknolojileri kullanıyor?", ANSWER_MODES.PORTFOLIO_PROJECT, "project:hospital-form-app"],
  ["Hospital Appointment System hangi teknolojileri kullanıyor?", ANSWER_MODES.PORTFOLIO_PROJECT, "project:hospital-appointment-system"],
  ["CBOT'ta ne yaptı?", ANSWER_MODES.PORTFOLIO_EXPERIENCE, "experience:cbot"],
  ["Outlier'da ne yaptı?", ANSWER_MODES.PORTFOLIO_EXPERIENCE, "experience:outlier-ai"],
  ["Joyday'de ne yaptı?", ANSWER_MODES.PORTFOLIO_EXPERIENCE, "experience:atolye-joyday"],
  ["Punto'da ne yaptı?", ANSWER_MODES.PORTFOLIO_EXPERIENCE, "experience:punto-organization-software"],
  ["Kaan'ın staj deneyimi ne?", ANSWER_MODES.PORTFOLIO_EXPERIENCE, "experience:punto-organization-software"],
  ["Kaan Forward Deployed Engineer rolüne uygun mu?", ANSWER_MODES.RECRUITER_FIT, "experience:cbot"],
  ["Kaan Applied AI Engineer için güçlü bir aday mı?", ANSWER_MODES.RECRUITER_FIT, "project:sinama"],
  ["Software Engineer rolü için hangi kanıtları var?", ANSWER_MODES.RECRUITER_EVIDENCE, "skills:programming"],
  ["Neden Kaan'ı işe almalıyız?", ANSWER_MODES.RECRUITER_HIRE, "recruiter-intelligence"],
  ["Kaan'ın AI Engineer rolü için eksikleri neler?", ANSWER_MODES.RECRUITER_GAPS, "project:sinama"],
  ["Kaan'ı diğer junior adaylardan ayıran ne?", ANSWER_MODES.RECRUITER_DIFFERENTIATION, "recruiter-intelligence"],
  ["Hangi şirket ortamında daha iyi performans gösterir?", ANSWER_MODES.RECRUITER_ENVIRONMENT, "experience:cbot"],
]) {
  const { rag, state } = await makeRag();
  const response = await ask(rag, question, "tr");
  const responseEvidence = response.body.evidence || [];
  check(`${question} answers successfully`, response.status, 200);
  check(`${question} uses one embedding`, state.embed - state.initEmbed, 1);
  check(`${question} uses one chat`, state.chat, 1);
  check(`${question} answer mode`, response.body.answerMode, expectedMode);
  ok(`${question} evidence is compact`, responseEvidence.length >= 1 && responseEvidence.length <= 4);
  ok(`${question} evidence includes ${expectedEvidence}`, responseEvidence.some((item) => item.entityId === expectedEvidence));
  check(`${question} reports one attempt`, response.body.generationAttempts, 1);
}

{
  const { rag, state } = await makeRag();
  for (const question of ["RAG nedir?", "satrançta rok nasıl yapılır?", "REST API nedir?", "Matrix neden etkili bir film?"]) {
    const before = { embed: state.embed, chat: state.chat };
    const response = await ask(rag, question, "tr");
    check(`${question} is GENERAL`, response.body.scope, "general");
    check(`${question} uses zero embeddings`, state.embed - before.embed, 0);
    check(`${question} uses one chat`, state.chat - before.chat, 1);
    check(`${question} has no UI evidence`, response.body.evidence.length, 0);
  }
}

{
  const { rag, state } = await makeRag();
  for (const question of ["sen kimsin?", "internete erişimin var mı?"]) {
    const before = { embed: state.embed, chat: state.chat };
    const response = await ask(rag, question, "tr");
    check(`${question} uses the self strategy`, response.body.answerMode, ANSWER_MODES.SELF);
    check(`${question} stays evidence-free GENERAL`, response.body.scope, "general");
    check(`${question} needs no embedding`, state.embed - before.embed, 0);
    check(`${question} uses one chat`, state.chat - before.chat, 1);
    check(`${question} has no unrelated evidence`, response.body.evidence.length, 0);
  }
}

{
  const { rag, state } = await makeRag(({ state: current }) => current.chat === 1
    ? " GENERAL\nANSWER: Castling repeats the same explanation. Castling repeats the same explanation. Castling repeats the same explanation."
    : " GENERAL\nANSWER: Rokta şah, daha önce oynamamış kaleye doğru iki kare gider; aradaki kareler boş olmalı ve şah tehdit altındaki bir kareden geçmemelidir.");
  const response = await ask(rag, "satrançta rok nasıl yapılır?", "tr");
  check("repetition triggers exactly one repair", state.chat, 2);
  check("GENERAL repair still uses zero embeddings", state.embed - state.initEmbed, 0);
  check("repair succeeds without fallback", response.body.fallbackUsed, false);
  check("repair is reported", response.body.repaired, true);
  ok("repetition flag is reported", response.body.validatorFlags.includes("repeated-sentence"));
}

{
  const { rag, state } = await makeRag(() => " PORTFOLIO\nANSWER: First.\nSCOPE: PORTFOLIO\nANSWER: Second.");
  const response = await ask(rag, "SINAMA ne işe yarıyor?", "tr");
  check("invalid twice stops at two chats", state.chat, 2);
  check("invalid twice reuses one embedding", state.embed - state.initEmbed, 1);
  check("invalid twice uses fallback", response.body.fallbackUsed, true);
  check("fallback stays portfolio scoped", response.body.scope, "portfolio");
  ok("fallback comes from allowed record titles", String(response.body.answer || "").includes("SINAMA"));
}

{
  const { rag, state } = await makeRag(({ state: current }) => current.chat === 1
    ? " PORTFOLIO\nANSWER: The portfolio does not specify the stack, but it uses Phaser 3 and TypeScript."
    : " PORTFOLIO\nANSWER: Merge Rush: Tiny Factory uses Phaser 3 and TypeScript.");
  const response = await ask(rag, "merge rush stacki ne?", "en");
  check("contradiction repair uses two chats", state.chat, 2);
  check("contradiction repair uses one embedding", state.embed - state.initEmbed, 1);
  ok("contradiction flag is reported", response.body.validatorFlags.includes("evidence-contradiction"));
  ok("repaired answer no longer denies the stack", !/does not specify/i.test(response.body.answer));
}

{
  const { rag, state } = await makeRag();
  const response = await ask(rag, "Kaan'ın LinkedIn'i", "tr");
  check("exact fact uses no chat", state.chat, 0);
  check("exact fact uses no per-turn embedding", state.embed - state.initEmbed, 0);
  check("exact fact has one canonical evidence card", response.body.evidence.length, 1);
  check("exact fact evidence is contacts", response.body.evidence[0]?.entityId, "contacts");
}

{
  const replies = {
    tr: "Kaan Balcı için SINAMA ve CBOT güçlü kanıtlardır.",
    en: "SINAMA and CBOT are strong evidence for Kaan Balcı.",
    de: "SINAMA und CBOT sind starke Nachweise für Kaan Balcı.",
    es: "SINAMA y CBOT son pruebas sólidas para Kaan Balcı.",
    fr: "SINAMA et CBOT sont des preuves solides pour Kaan Balcı.",
  };
  const { rag } = await makeRag(({ prompt }) => {
    const locale = Object.keys(replies).find((key) => prompt.includes(`Answer in ${{ tr: "Turkish", en: "English", de: "German", es: "Spanish", fr: "French" }[key]}.`));
    return ` PORTFOLIO\nANSWER: ${replies[locale || "en"]}`;
  });
  for (const locale of Object.keys(replies)) {
    const response = await ask(rag, "Kaan Applied AI rolüne uygun mu?", locale);
    check(`${locale} generated copy is preserved`, response.body.answer, replies[locale]);
    for (const name of ["Kaan Balcı", "SINAMA", "CBOT"]) ok(`${locale} preserves ${name}`, String(response.body.answer || "").includes(name));
  }
}

if (failures.length) {
  console.error(`Ajoop answer quality: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(`Ajoop answer-quality contracts passed. ${passed} assertions · one-retry cap · no network, no Ollama.`);
