#!/usr/bin/env node
/**
 * Answer strategy, evidence curation and generation-quality contracts.
 *
 * Node built-ins only. Model and embedding calls are deterministic stubs; no
 * network or Ollama is used.
 */
import {
  ANSWER_MODES,
  EVIDENCE_SUPPORT,
  ROLE_FAMILIES,
  assessEvidenceSupport,
  answerStrategyPrompt,
  buildSafeFallback,
  compositionSupportMetadata,
  detectAnswerRepetition,
  detectRecruiterQuestion,
  recruiterEvidenceIds,
  repairPrompt,
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
for (const question of [
  "Outlier AI şirket ortamı nasıl?",
  "What is the company environment at Outlier AI?",
]) {
  const strategy = selectAnswerStrategy({
    question,
    plan: {
      ...projectPlan(),
      contextEligible: false,
      activeOrganizations: ["Outlier AI"],
      experienceFocus: "overview",
    },
  });
  check(`denied authority overrides recruiter mode: ${question}`, strategy.mode, ANSWER_MODES.GENERAL);
  check(`denied authority overrides recruiter scope: ${question}`, strategy.expectedScope, "GENERAL");
  check(`denied authority clears recruiter flag: ${question}`, strategy.recruiter, false);
}
check(
  "follow-up mode",
  selectAnswerStrategy({
    question: "peki neden önemli?",
    plan: { ...projectPlan(), followUp: true },
  }).mode,
  ANSWER_MODES.FOLLOW_UP,
);

for (const [question, plan, intent, count] of [
  ["Kaan'ın en güçlü 3 projesini söyle.", { ...projectPlan(), compositionIntent: "ranking" }, "ranking", 3],
  ["Kaan'ın projelerini özetle.", { ...projectPlan(), compositionIntent: "summary" }, "summary", null],
  ["Kaan Python biliyor mu?", projectPlan(), null, null],
]) {
  const strategy = selectAnswerStrategy({ question, plan });
  check(`composition intent: ${question}`, strategy.compositionIntent, intent);
  check(`requested selection count: ${question}`, strategy.requestedCount, count);
}
check("direct yes/no shape is preserved", selectAnswerStrategy({
  question: "Kaan Python biliyor mu?", plan: projectPlan(),
}).directYesNo, true);
for (const question of [
  "Can you summarize Kaan's projects?",
  "Could you tell me about SINAMA?",
  "Can you rank Kaan's top 3 projects for applied AI?",
  "Would you compare SINAMA and AJOOP?",
]) {
  check(`English modal request is not binary: ${question}`, selectAnswerStrategy({
    question, plan: projectPlan(),
  }).directYesNo, false);
}
for (const question of [
  "Can Kaan use Python?",
  "Could Kaan handle this role?",
  "Would Kaan fit this role?",
  "Kaan Python biliyor mu?",
  "Kaan bunu yaptı mı?",
  "Bunu biliyor musun?",
]) {
  check(`genuine modal/question-particle shape remains binary: ${question}`, selectAnswerStrategy({
    question, plan: projectPlan(),
  }).directYesNo, true);
}
check("Turkish noun suffix is not a question particle", selectAnswerStrategy({
  question: "SINAMA'nın öneri sistemi?", plan: projectPlan(["SINAMA"]),
}).directYesNo, false);
for (const [locale, positive, negative] of [
  ["tr", "Kaan Python biliyor mu?", "Kaan Python biliyor."],
  ["en", "Does Kaan use Python?", "Kaan uses Python."],
  ["de", "Hat Kaan Python verwendet?", "Hat Kaan Python verwendet."],
  ["es", "¿Tiene Kaan experiencia con Python?", "Tiene Kaan experiencia con Python."],
  ["fr", "Est-ce que Kaan utilise Python?", "Est-ce que Kaan utilise Python."],
]) {
  check(`${locale} question structure identifies direct yes/no`, selectAnswerStrategy({
    question: positive, plan: projectPlan(),
  }).directYesNo, true);
  check(`${locale} declarative sibling is not a direct yes/no`, selectAnswerStrategy({
    question: negative, plan: projectPlan(),
  }).directYesNo, false);
}
check("why-suitable wording uses existing recruiter-fit strategy", selectAnswerStrategy({
  question: "Kaan Forward Deployed Engineer için neden uygun?", plan: projectPlan(),
}).mode, ANSWER_MODES.RECRUITER_FIT);
for (const [label, question, plan, expectedLimit] of [
  ["project + project", "SINAMA ile Hospital Appointment System'ı karşılaştır.", {
    ...projectPlan(["SINAMA", "Hospital Appointment System"]), compositionIntent: "comparison",
  }, 2],
  ["project + organization", "SINAMA ile CBOT'u karşılaştır.", {
    ...projectPlan(["SINAMA"]), activeOrganizations: ["CBOT"], compositionIntent: "comparison",
  }, 2],
  ["organization + organization", "Kaan'ın CBOT ve Outlier AI deneyimlerini karşılaştır.", {
    ...projectPlan(), activeOrganizations: ["CBOT", "Outlier AI"], compositionIntent: "comparison",
  }, 2],
  ["three targets", "Bu üç hedefi karşılaştır.", {
    ...projectPlan(["SINAMA", "Hospital Appointment System"]), activeOrganizations: ["CBOT"], compositionIntent: "comparison",
  }, 3],
]) {
  const strategy = selectAnswerStrategy({ question, plan });
  check(`${label} uses shared comparison strategy`, strategy.mode, ANSWER_MODES.COMPARISON);
  check(`${label} reserves every validated side`, strategy.evidenceLimit, expectedLimit);
}

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

const mixedComparisonEvidence = selectEvidenceRecords({
  strategy: {
    mode: ANSWER_MODES.COMPARISON,
    expectedScope: "PORTFOLIO",
    evidenceLimit: 2,
    activeProjects: ["SINAMA"],
    activeOrganizations: ["CBOT"],
  },
  records,
  affinity,
});
check("mixed comparison keeps project and organization evidence", mixedComparisonEvidence
  .map((item) => item.entityId).sort().join(), "experience:cbot,project:sinama");

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

/* ---------- composition support calibration ---------- */

const supportRecords = [
  { id: "support-sinama", source: "master-knowledge", entityId: "project:sinama", entityType: "project", title: "SINAMA", text: "SINAMA is an AI agent reliability project using Python." },
  { id: "support-hospital", source: "master-knowledge", entityId: "project:hospital-appointment-system", entityType: "project", title: "Hospital Appointment System", text: "Hospital Appointment System is a C# scheduling project." },
  { id: "support-cbot", source: "master-knowledge", entityId: "experience:cbot", entityType: "experience", title: "CBOT", text: "Kaan worked on customer chatbot quality at CBOT." },
];
const supportAffinity = new Map([
  ["support-sinama", { projects: ["SINAMA"], organizations: [] }],
  ["support-hospital", { projects: ["Hospital Appointment System"], organizations: [] }],
  ["support-cbot", { projects: [], organizations: ["CBOT"] }],
]);
check("ranking with enough distinct records is supported", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", compositionIntent: "ranking", requestedCount: 2, framedTypes: ["project"] },
  records: supportRecords.slice(0, 2), affinity: supportAffinity,
}), EVIDENCE_SUPPORT.SUPPORTED);
check("evidence-poor ranking is partial", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", compositionIntent: "ranking", requestedCount: 3 },
  records: supportRecords.slice(0, 1), affinity: supportAffinity,
}), EVIDENCE_SUPPORT.PARTIAL);
check("two-sided comparison is supported across separate records", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", compositionIntent: "comparison", activeProjects: ["SINAMA", "Hospital Appointment System"] },
  records: supportRecords.slice(0, 2), affinity: supportAffinity,
}), EVIDENCE_SUPPORT.SUPPORTED);
check("one-sided comparison is partial", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", compositionIntent: "comparison", activeProjects: ["SINAMA", "Hospital Appointment System"] },
  records: supportRecords.slice(0, 1), affinity: supportAffinity,
}), EVIDENCE_SUPPORT.PARTIAL);
check("entity presence cannot support an uncovered comparison criterion", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", compositionIntent: "comparison", activeProjects: ["SINAMA", "Hospital Appointment System"] },
  records: supportRecords.slice(0, 2),
  question: "SINAMA ile Hospital Appointment System'dan hangisi daha ölçeklenebilir?",
  affinity: supportAffinity,
}), EVIDENCE_SUPPORT.PARTIAL);
check("organization presence cannot support missing Kubernetes depth", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", compositionIntent: "comparison", activeOrganizations: ["CBOT", "Outlier AI"] },
  records: [
    supportRecords[2],
    { id: "support-outlier", source: "master-knowledge", entityId: "experience:outlier-ai", title: "Outlier AI", text: "Model evaluation work." },
  ],
  question: "CBOT ve Outlier AI'dan hangisinde Kubernetes derinliği daha yüksek?",
  affinity: new Map([...supportAffinity, ["support-outlier", { projects: [], organizations: ["Outlier AI"] }]]),
}), EVIDENCE_SUPPORT.PARTIAL);
check("broad project comparison is supported by two retrieved canonical candidates", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", compositionIntent: "comparison", framedTypes: ["project"] },
  records: supportRecords.slice(0, 2), affinity: supportAffinity,
  question: "Kaan'ın projelerini karşılaştır.",
}), EVIDENCE_SUPPORT.SUPPORTED);
{
  const metadata = compositionSupportMetadata({
    strategy: { expectedScope: "PORTFOLIO", compositionIntent: "comparison", framedTypes: ["project"] },
    records: supportRecords.slice(0, 2), affinity: supportAffinity,
    question: "Kaan'ın projelerini karşılaştır.",
  });
  check("broad comparison metadata keeps two eligible logical candidates", metadata.eligibleCandidates.length, 2);
  check("broad comparison metadata keeps two supported logical candidates", metadata.supportedCandidates.length, 2);
}
check("broad project comparison remains partial with only one canonical candidate", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", compositionIntent: "comparison", framedTypes: ["project"] },
  records: supportRecords.slice(0, 1), affinity: supportAffinity,
  question: "Kaan'ın projelerini karşılaştır.",
}), EVIDENCE_SUPPORT.PARTIAL);
check("broad project comparison remains partial when criterion coverage is thin", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", compositionIntent: "comparison", framedTypes: ["project"] },
  records: supportRecords.slice(0, 2), affinity: supportAffinity,
  question: "Kaan'ın projelerini reliability açısından karşılaştır.",
}), EVIDENCE_SUPPORT.PARTIAL);
check("cross-cutting records cannot become broad comparison candidates", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", compositionIntent: "comparison", framedTypes: ["project"] },
  records: [{ id: "skills", entityId: "skills:programming", text: "Python reliability" }],
  affinity: new Map([["skills", { projects: [], organizations: [] }]]),
  question: "Kaan'ın projelerini karşılaştır.",
}), EVIDENCE_SUPPORT.UNKNOWN);
{
  const scalableRecords = supportRecords.slice(0, 2).map((record) => ({
    ...record,
    text: `${record.text} Recorded scalable systems evidence.`,
  }));
  check("comparison criterion is supported only when every named side covers it", assessEvidenceSupport({
    strategy: { expectedScope: "PORTFOLIO", compositionIntent: "comparison", activeProjects: ["SINAMA", "Hospital Appointment System"] },
    records: scalableRecords,
    question: "SINAMA ile Hospital Appointment System'dan hangisi daha scalable?",
    affinity: supportAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
}
check("retrieval miss is unknown rather than corpus absence", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", directYesNo: true }, records: [], question: "Kaan quantum annealing biliyor mu?",
}), EVIDENCE_SUPPORT.UNKNOWN);
check("independently established absence remains representable", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", directYesNo: true, corpusAbsenceEstablished: true }, records: [], question: "Kaan quantum annealing biliyor mu?",
}), EVIDENCE_SUPPORT.ABSENT);
check("Python yes/no is supported by matching evidence", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", directYesNo: true }, records: supportRecords, question: "Kaan Python biliyor mu?", affinity: supportAffinity,
}), EVIDENCE_SUPPORT.SUPPORTED);
for (const [question, expected] of [
  ["Kaan Python ve quantum annealing biliyor mu?", EVIDENCE_SUPPORT.PARTIAL],
  ["Kaan chatbot ve SAP deneyimine sahip mi?", EVIDENCE_SUPPORT.PARTIAL],
  ["Kaan JavaScript ile kernel driver geliştirdi mi?", EVIDENCE_SUPPORT.UNKNOWN],
]) {
  check(`one lexical hit cannot support a compound proposition: ${question}`, assessEvidenceSupport({
    strategy: { expectedScope: "PORTFOLIO", directYesNo: true },
    records: supportRecords,
    question,
    affinity: supportAffinity,
  }), expected);
}
check("cross-cutting prose mention does not establish named-target coverage", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", activeProjects: ["SINAMA"] },
  records: [{ id: "cross-cutting", source: "master-knowledge", entityId: "recruiter-intelligence", title: "Recruiter", text: "SINAMA is mentioned here." }],
  affinity: new Map([["cross-cutting", { projects: [], organizations: [] }]]),
}), EVIDENCE_SUPPORT.UNKNOWN);
{
  const sinamaDatabase = {
    id: "field-sinama", entityId: "project:sinama", title: "SINAMA", entityType: "project",
    text: "Technologies: Next.js, Python, FastAPI, PostgreSQL.",
    tags: ["postgresql"], metadata: { stack: ["Next.js", "Python", "FastAPI", "PostgreSQL"] },
  };
  const fieldAffinity = new Map([[sinamaDatabase.id, { projects: ["SINAMA"], organizations: [] }]]);
  const actorAliases = ["kaan", "kaan balci", "kaan balcı"];
  const namedStrategy = { expectedScope: "PORTFOLIO", activeProjects: ["SINAMA"], actorAliases };
  check("named target plus structurally covered database field is supported", assessEvidenceSupport({
    strategy: namedStrategy, records: [sinamaDatabase], question: "What database does SINAMA use?", affinity: fieldAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
  check("named target without an explicit hosting proposition is only partial", assessEvidenceSupport({
    strategy: namedStrategy, records: [sinamaDatabase], question: "Which cloud provider hosts SINAMA?", affinity: fieldAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("missing named target remains unknown", assessEvidenceSupport({
    strategy: namedStrategy, records: [supportRecords[1]], question: "What database does SINAMA use?", affinity: supportAffinity,
  }), EVIDENCE_SUPPORT.UNKNOWN);
}
{
  const actorAliases = ["kaan", "kaan balci", "kaan balcı"];
  const identityOnly = {
    id: "identity-sinama", entityId: "project:sinama", title: "SINAMA", entityType: "project",
    text: "SINAMA is an AI agent reliability project.",
  };
  const relationAffinity = new Map([[identityOnly.id, { projects: ["SINAMA"], organizations: [] }]]);
  const namedStrategy = { expectedScope: "PORTFOLIO", activeProjects: ["SINAMA"], actorAliases };
  check("entity identity alone cannot establish who created the project", assessEvidenceSupport({
    strategy: namedStrategy, records: [identityOnly], question: "Who created SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("entity identity alone cannot establish a developed-by relation", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true }, records: [identityOnly], question: "Has Kaan developed SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  const wrongActor = { ...identityOnly, text: "SINAMA was developed by an external team." };
  check("predicate presence with the wrong actor cannot support the requested relation", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true }, records: [wrongActor], question: "Has Kaan developed SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  ok("[bound-relation-mutation] a predicate-only mutant would accept the wrong-actor record", /\bdeveloped\b/i.test(wrongActor.text));
  const adjacentProjectWork = { ...identityOnly, text: "Kaan developed evaluation tooling for SINAMA." };
  check("actor and predicate cannot support a project that is only an adjunct of another object", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true }, records: [adjacentProjectWork], question: "Has Kaan developed SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  ok("[patient-binding-mutation] actor, predicate, and target co-occurrence would accept the tooling record",
    /\bkaan\b/i.test(adjacentProjectWork.text) && /\bdeveloped\b/i.test(adjacentProjectWork.text) && /\bsinama\b/i.test(adjacentProjectWork.text));
  for (const text of [
    "Kaan confirmed Alex developed SINAMA.",
    "Kaan said that Alex developed SINAMA.",
    "Kaan observed Alex develop SINAMA.",
  ]) {
    check(`outer-clause actor cannot fill the local subject of develop: ${text}`, assessEvidenceSupport({
      strategy: { ...namedStrategy, directYesNo: true }, records: [{ ...identityOnly, text }],
      question: "Has Kaan developed SINAMA?", affinity: relationAffinity,
    }), EVIDENCE_SUPPORT.PARTIAL);
  }
  for (const text of [
    "Kaan Balcı developed SINAMA.",
    "Kaan, a QA engineer, developed SINAMA.",
    "Kaan and Alex developed SINAMA.",
    "Alex and Kaan developed SINAMA.",
    "Kaan, who replaced Alex, developed SINAMA.",
  ]) {
    check(`matrix-subject actor supports develop: ${text}`, assessEvidenceSupport({
      strategy: { ...namedStrategy, directYesNo: true }, records: [{ ...identityOnly, text }],
      question: "Has Kaan developed SINAMA?", affinity: relationAffinity,
    }), EVIDENCE_SUPPORT.SUPPORTED);
  }
  check("canonical alias equivalence works from full-name question to short-name evidence", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true }, records: [{ ...identityOnly, text: "Kaan developed SINAMA." }],
    question: "Has Kaan Balcı developed SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
  for (const text of [
    "The team that replaced Kaan developed SINAMA.",
    "The team, which Kaan advised, developed SINAMA.",
    "Alex said Kaan reviewed it before Alex developed SINAMA.",
  ]) {
    check(`embedded actor cannot fill matrix subject: ${text}`, assessEvidenceSupport({
      strategy: { ...namedStrategy, directYesNo: true }, records: [{ ...identityOnly, text }],
      question: "Has Kaan developed SINAMA?", affinity: relationAffinity,
    }), EVIDENCE_SUPPORT.PARTIAL);
  }
  ok("[actor-alias-mutation] old requested-token suffix rejects the canonical full-name subject",
    !["kaan", "balci"].slice(-1).every((token, index) => token === ["kaan"][index]));
  ok("[actor-locality-mutation] unrestricted pre-predicate presence accepts a relative-clause actor",
    "the team that replaced kaan".split(" ").includes("kaan"));
  const missingWho = { ...identityOnly, text: "SINAMA was created in 2026." };
  check("creation event without an agent cannot fill a who slot", assessEvidenceSupport({
    strategy: namedStrategy, records: [missingWho], question: "Who created SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  ok("[bound-relation-mutation] an event-only mutant would accept the unfilled who record", /\bcreated\b/i.test(missingWho.text));
  const adjacentCreation = { ...identityOnly, text: "Kaan created the evaluation framework for SINAMA." };
  check("creator evidence for a related framework cannot fill the project's creator slot", assessEvidenceSupport({
    strategy: namedStrategy, records: [adjacentCreation], question: "Who created SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("explicit creator relation supports the named factual question", assessEvidenceSupport({
    strategy: namedStrategy,
    records: [{ ...identityOnly, text: "Kaan created SINAMA." }],
    question: "Who created SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
  check("explicit developer relation supports the direct yes/no proposition", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true },
    records: [{ ...identityOnly, text: "Kaan developed SINAMA." }],
    question: "Has Kaan developed SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
  check("passive creator relation supports the named factual question", assessEvidenceSupport({
    strategy: namedStrategy,
    records: [{ ...identityOnly, text: "SINAMA was created by Kaan." }],
    question: "Who created SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
  check("passive developer relation supports the direct yes/no proposition", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true },
    records: [{ ...identityOnly, text: "SINAMA was developed by Kaan." }],
    question: "Has Kaan developed SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
  check("work on binds a project complement", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true },
    records: [{ ...identityOnly, text: "Kaan worked on SINAMA." }],
    question: "Did Kaan work on SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
  check("work at does not bind a project complement", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true },
    records: [{ ...identityOnly, text: "Kaan worked at SINAMA." }],
    question: "Did Kaan work on SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  const cbotIdentity = {
    id: "identity-cbot", entityId: "organization:cbot", title: "CBOT", entityType: "organization",
    text: "CBOT is an organization in Kaan's work history.",
  };
  const cbotAffinity = new Map([[cbotIdentity.id, { projects: [], organizations: ["CBOT"] }]]);
  const cbotStrategy = { expectedScope: "PORTFOLIO", activeOrganizations: ["CBOT"], directYesNo: true, actorAliases };
  for (const preposition of ["at", "for"]) {
    check(`work ${preposition} binds an organization complement`, assessEvidenceSupport({
      strategy: cbotStrategy,
      records: [{ ...cbotIdentity, text: `Kaan worked ${preposition} CBOT.` }],
      question: `Did Kaan work ${preposition} CBOT?`, affinity: cbotAffinity,
    }), EVIDENCE_SUPPORT.SUPPORTED);
  }
  check("work on does not bind an organization complement", assessEvidenceSupport({
    strategy: cbotStrategy,
    records: [{ ...cbotIdentity, text: "Kaan worked on CBOT." }],
    question: "Did Kaan work at CBOT?", affinity: cbotAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("work with is not an arbitrary accepted organization complement", assessEvidenceSupport({
    strategy: cbotStrategy,
    records: [{ ...cbotIdentity, text: "Kaan worked with CBOT." }],
    question: "Did Kaan work for CBOT?", affinity: cbotAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("work complement still requires the requested actor", assessEvidenceSupport({
    strategy: cbotStrategy,
    records: [{ ...cbotIdentity, text: "An external consultant worked at CBOT." }],
    question: "Did Kaan work at CBOT?", affinity: cbotAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  for (const question of [
    "Did Alex work at CBOT with Kaan?",
    "Did Kaan and Alex work at CBOT?",
    "Did Kaan's teammate work at CBOT?",
  ]) {
    check(`a recognized owner mention outside the grammatical actor cannot satisfy: ${question}`, assessEvidenceSupport({
      strategy: cbotStrategy,
      records: [{ ...cbotIdentity, text: "Kaan Balcı worked at CBOT." }],
      question, affinity: cbotAffinity,
    }), EVIDENCE_SUPPORT.PARTIAL);
  }
  const ownedSinama = {
    ...identityOnly,
    source: "master-knowledge",
    metadata: { owner: "Kaan Balcı", project: "SINAMA", role: "Creator and developer" },
  };
  check("a non-actor owner mention cannot unlock structured project-role evidence", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true }, records: [ownedSinama],
    question: "Did Alex work on SINAMA with Kaan?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  ok("[actor-alias-scope-mutation] recognizing Kaan anywhere would wrongly admit canonical Kaan evidence",
    actorAliases.some((alias) => "did alex work at cbot with kaan?".includes(alias.toLowerCase())));
  check("structured ownership cannot satisfy a compound requested actor", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true }, records: [ownedSinama],
    question: "Did Kaan Balcı and Alex work on SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("structured ownership cannot satisfy a possessive teammate actor", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true }, records: [ownedSinama],
    question: "Did Kaan Balcı's teammate work on SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  ok("[structured-owner-equality-mutation] prefix identity would collapse a compound actor to its owner prefix",
    ["kaan", "balci"].every((token, index) => ["kaan", "balci", "and", "alex"][index] === token));
  check("structured ownership alone cannot drop a requested work participant", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true }, records: [ownedSinama],
    question: "Did Kaan work on SINAMA with Alex?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("explicit work-on evidence covers its bounded participant", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true },
    records: [{ ...ownedSinama, text: "Kaan worked on SINAMA with Alex." }],
    question: "Did Kaan work on SINAMA with Alex?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
  check("work-at evidence cannot drop a requested post-target participant", assessEvidenceSupport({
    strategy: cbotStrategy,
    records: [{ ...cbotIdentity, text: "Kaan Balcı worked at CBOT." }],
    question: "Did Kaan work at CBOT with Alex?", affinity: cbotAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("work-at evidence covers an explicitly bound participant", assessEvidenceSupport({
    strategy: cbotStrategy,
    records: [{ ...cbotIdentity, text: "Kaan worked at CBOT with Alex." }],
    question: "Did Kaan work at CBOT with Alex?", affinity: cbotAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
  for (const text of [
    "Kaan worked at CBOT and later had lunch with Alex.",
    "Kaan worked at CBOT and later spoke with Alex.",
  ]) {
    check(`a later relation segment cannot supply the work-at participant: ${text}`, assessEvidenceSupport({
      strategy: cbotStrategy,
      records: [{ ...cbotIdentity, text }],
      question: "Did Kaan work at CBOT with Alex?", affinity: cbotAffinity,
    }), EVIDENCE_SUPPORT.PARTIAL);
  }
  check("a later relation segment cannot supply the work-on participant", assessEvidenceSupport({
    strategy: { ...namedStrategy, directYesNo: true },
    records: [{ ...ownedSinama, text: "Kaan worked on SINAMA and later met with Alex." }],
    question: "Did Kaan work on SINAMA with Alex?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  ok("[participant-attachment-mutation] whole-clause relation plus participant search would accept the distractor",
    /\bworked at cbot\b/i.test("Kaan worked at CBOT and later spoke with Alex.")
      && /\bwith alex\b/i.test("Kaan worked at CBOT and later spoke with Alex."));
  check("Turkish post-target participant remains part of the requested relation", assessEvidenceSupport({
    strategy: cbotStrategy,
    records: [{ ...cbotIdentity, text: "Kaan worked at CBOT." }],
    question: "Kaan CBOT'ta Alex ile çalıştı mı?", affinity: cbotAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("Turkish participant order can bind equivalent explicit evidence", assessEvidenceSupport({
    strategy: cbotStrategy,
    records: [{ ...cbotIdentity, text: "Kaan worked at CBOT with Alex." }],
    question: "Kaan CBOT'ta Alex ile çalıştı mı?", affinity: cbotAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
  ok("[secondary-participant-mutation] dropping the post-target participant would reuse the supported base relation",
    assessEvidenceSupport({
      strategy: cbotStrategy,
      records: [{ ...cbotIdentity, text: "Kaan Balcı worked at CBOT." }],
      question: "Did Kaan work at CBOT?", affinity: cbotAffinity,
    }) === EVIDENCE_SUPPORT.SUPPORTED);
  check("requested work-with relation cannot be replaced by work-at evidence", assessEvidenceSupport({
    strategy: cbotStrategy,
    records: [{ ...cbotIdentity, text: "Kaan worked at CBOT." }],
    question: "Did Kaan work with CBOT?", affinity: cbotAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("requested work-for relation cannot be replaced by work-at evidence", assessEvidenceSupport({
    strategy: cbotStrategy,
    records: [{ ...cbotIdentity, text: "Kaan worked at CBOT." }],
    question: "Did Kaan work for CBOT?", affinity: cbotAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("Turkish locative work question binds canonical work-at evidence", assessEvidenceSupport({
    strategy: cbotStrategy,
    records: [{ ...cbotIdentity, text: "Kaan Balcı worked at CBOT." }],
    question: "Kaan CBOT'ta çalıştı mı?", affinity: cbotAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
  check("Turkish comitative work question is not satisfied by work-at evidence", assessEvidenceSupport({
    strategy: cbotStrategy,
    records: [{ ...cbotIdentity, text: "Kaan Balcı worked at CBOT." }],
    question: "Kaan CBOT ile çalıştı mı?", affinity: cbotAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("recognized entity definition remains supported by its canonical record", assessEvidenceSupport({
    strategy: namedStrategy, records: [identityOnly], question: "What is SINAMA?", affinity: relationAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
}
check("composition support calibration precedes direct yes/no answer shape", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", compositionIntent: "ranking", directYesNo: true, requestedCount: 2, framedTypes: ["project"] },
  records: supportRecords.slice(0, 2), affinity: supportAffinity,
  question: "Does Kaan have 2 projects to rank?",
}), EVIDENCE_SUPPORT.SUPPORTED);
check("named-entity affinity cannot bypass the rest of a compound proposition", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", directYesNo: true, activeProjects: ["SINAMA"] },
  records: [supportRecords[0]],
  question: "SINAMA Python ve quantum annealing kullanıyor mu?",
  affinity: supportAffinity,
}), EVIDENCE_SUPPORT.PARTIAL);
check("cross-cutting capability prose cannot complete a named-project proposition", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", directYesNo: true, activeProjects: ["SINAMA"] },
  records: [
    supportRecords[0],
    { id: "cross-sap", source: "master-knowledge", entityId: "skills:programming", title: "Skills", text: "SAP and quantum annealing" },
  ],
  question: "SINAMA Python ve quantum annealing kullanıyor mu?",
  affinity: new Map([...supportAffinity, ["cross-sap", { projects: [], organizations: [] }]]),
}), EVIDENCE_SUPPORT.PARTIAL);
check("ranking counts distinct project candidates rather than arbitrary records", assessEvidenceSupport({
  strategy: { expectedScope: "PORTFOLIO", compositionIntent: "ranking", requestedCount: 2 },
  records: [supportRecords[0], supportRecords[2], { id: "skills", source: "master-knowledge", entityId: "skills:programming", title: "Skills", text: "Python" }],
  affinity: supportAffinity,
}), EVIDENCE_SUPPORT.PARTIAL);
{
  const rankingRecords = ["Alpha", "Beta", "Gamma"].map((title, index) => ({
    id: `rank-${index}`,
    source: "master-knowledge",
    entityId: `project:${title.toLowerCase()}`,
    title,
    text: `${title} project evidence.`,
  }));
  const rankingAffinity = new Map(rankingRecords.map((record) => [record.id, { projects: [record.title], organizations: [] }]));
  const strategy = { expectedScope: "PORTFOLIO", compositionIntent: "ranking", requestedCount: 3, framedTypes: ["project"] };
  const question = "GPU kernel optimizasyonuna göre en güçlü 3 projeyi sırala.";
  check("three projects without the ranking criterion remain partial", assessEvidenceSupport({
    strategy, records: rankingRecords, question, affinity: rankingAffinity,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check("ranking becomes supported when three distinct projects each cover the criterion", assessEvidenceSupport({
    strategy,
    records: rankingRecords.map((record) => ({ ...record, text: `${record.text} GPU kernel optimizasyonuna evidence.` })),
    question,
    affinity: rankingAffinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
}

{
  const criterionCases = [
    ["Teknik derinliğe göre 3 proje seç.", ["teknik", "derinlige"], 3],
    ["Choose 3 projects for technical depth.", ["technical", "depth"], 3],
    ["Pick the 2 projects that best demonstrate applied AI.", ["applied", "ai"], 2],
  ];
  for (const [question, expectedCriteria, requestedCount] of criterionCases) {
    const records = ["Alpha", "Beta", "Gamma"].map((title, index) => ({
      id: `criterion-${index}`,
      entityId: `project:${title.toLowerCase()}`,
      entityType: "project",
      title,
      text: `${title}: ${expectedCriteria.join(" ")}.`,
    }));
    const affinity = new Map(records.map((record) => [record.id, { projects: [record.title], organizations: [] }]));
    const strategy = { expectedScope: "PORTFOLIO", compositionIntent: "ranking", requestedCount, framedTypes: ["project"] };
    const metadata = compositionSupportMetadata({ strategy, records, question, affinity });
    check(`[criterion-metadata] ${question}`, metadata.criteria.join("|"), expectedCriteria.join("|"));
    ok(`[criterion-metadata] ${question} excludes selection grammar`,
      metadata.criteria.every((term) => !/^(?:sec|choose|pick|select|best|demonstrate|for)$/.test(term)));
    check(`[criterion-metadata] ${question} supports the requested bounded set`,
      metadata.supportedCandidates.length, requestedCount === 2 ? 3 : requestedCount);
    check(`[criterion-metadata] ${question} becomes supported when records cover the real criterion`,
      assessEvidenceSupport({ strategy, records, question, affinity }), EVIDENCE_SUPPORT.SUPPORTED);
  }
  const broad = compositionSupportMetadata({
    strategy: { expectedScope: "PORTFOLIO", compositionIntent: "comparison", framedTypes: ["experience"] },
    records: supportRecords,
    question: "Kaan'ın deneyimlerini karşılaştır ve ana farkları söyle.",
    affinity: supportAffinity,
  });
  check("[criterion-metadata] no-criterion broad comparison stays empty", broad.criteria.length, 0);
  const realCriterion = compositionSupportMetadata({
    strategy: { expectedScope: "PORTFOLIO", compositionIntent: "comparison", framedTypes: ["project"] },
    records: supportRecords,
    question: "Kaan'ın projelerini reliability açısından karşılaştır.",
    affinity: supportAffinity,
  });
  check("[criterion-metadata] real comparison criterion is retained", realCriterion.criteria.join("|"), "reliability");
}
{
  const experienceRecords = [
    { id: "exp-cbot", entityId: "experience:cbot", entityType: "experience", title: "CBOT — AI Designer", text: "Chatbot quality work." },
    { id: "exp-outlier", entityId: "experience:outlier-ai", entityType: "experience", title: "Outlier AI — AI Trainer", text: "Model evaluation work." },
    { id: "skills", entityId: "skills:programming", entityType: "skills", title: "Programming skills", text: "Python and C#." },
  ];
  const affinity = new Map([
    ["exp-cbot", { projects: [], organizations: ["CBOT"] }],
    ["exp-outlier", { projects: [], organizations: ["Outlier AI"] }],
    ["skills", { projects: [], organizations: [] }],
  ]);
  const strategy = { expectedScope: "PORTFOLIO", compositionIntent: "ranking", requestedCount: 2, framedTypes: ["experience"] };
  const metadata = compositionSupportMetadata({
    strategy, records: experienceRecords, question: "Kaan'ın en güçlü 2 deneyimini sırala.", affinity,
  });
  check("experience ranking follows the requested family", metadata.eligibleCandidates.length, 2);
  ok("experience ranking excludes cross-cutting skill records", !metadata.eligibleCandidates.includes("Programming skills"));
  check("experience ranking support uses the same two logical records", metadata.supportedCandidates.length, 2);
  check("experience ranking is supported with two eligible experiences", assessEvidenceSupport({
    strategy, records: experienceRecords, question: "Kaan'ın en güçlü 2 deneyimini sırala.", affinity,
  }), EVIDENCE_SUPPORT.SUPPORTED);
  const ambiguous = compositionSupportMetadata({
    strategy: { ...strategy, framedTypes: [] }, records: experienceRecords, question: "En güçlü 2 tanesini sırala.", affinity,
  });
  check("ambiguous broad ranking does not default to a record family", ambiguous.eligibleCandidates.length, 0);
}

for (const [question, recordsForQuestion] of [
  ["Kaan C# ile chatbot geliştirdi mi?", [
    { id: "csharp", title: "C# skills", text: "Kaan uses C#." },
    { id: "chatbot", title: "Chatbot work", text: "Kaan developed a chatbot." },
  ]],
  ["Kaan Python ile mobil oyun geliştirdi mi?", [
    { id: "python", title: "Python skills", text: "Kaan uses Python." },
    { id: "mobile-game", title: "Mobile game", text: "Kaan developed a mobile game." },
  ]],
  ["Kaan JavaScript ile IVR sistemi yaptı mı?", [
    { id: "javascript", title: "JavaScript skills", text: "Kaan uses JavaScript." },
    { id: "ivr", title: "IVR system", text: "Kaan worked on an IVR sistemi." },
  ]],
]) {
  check(`unrelated records cannot manufacture a direct relation: ${question}`, assessEvidenceSupport({
    strategy: { expectedScope: "PORTFOLIO", directYesNo: true },
    records: recordsForQuestion,
    question,
  }), EVIDENCE_SUPPORT.PARTIAL);
  check(`one canonical record can support the complete relation: ${question}`, assessEvidenceSupport({
    strategy: { expectedScope: "PORTFOLIO", directYesNo: true },
    records: [{ id: "relation", title: "Canonical relation", text: question }],
    question,
  }), EVIDENCE_SUPPORT.SUPPORTED);
}

const rankingPrompt = answerStrategyPrompt({
  mode: ANSWER_MODES.PORTFOLIO_FACT,
  expectedScope: "PORTFOLIO",
  compositionIntent: "ranking",
  evidenceSupport: EVIDENCE_SUPPORT.PARTIAL,
  requestedCount: 3,
});
ok("ranking prompt operates over supplied cross-record candidates", rankingPrompt.includes("Rank only the supplied candidates"));
ok("ranking prompt limits partial ordering to criterion-supported candidates", rankingPrompt.includes("order only candidates established for that criterion"));
{
  const named = answerStrategyPrompt({
    mode: ANSWER_MODES.COMPARISON,
    expectedScope: "PORTFOLIO",
    compositionIntent: "comparison",
    activeProjects: ["SINAMA", "Hospital Appointment System"],
    compositionSupport: { named: true },
  });
  ok("named comparison prompt contains validated named-target constraint", named.includes("only the validated named targets"));
  ok("named comparison prompt does not contain broad-candidate wording", !named.includes("supported retrieved canonical candidates"));
  const broad = answerStrategyPrompt({
    mode: ANSWER_MODES.COMPARISON,
    expectedScope: "PORTFOLIO",
    compositionIntent: "comparison",
    framedTypes: ["project"],
    compositionSupport: { named: false },
  });
  ok("broad comparison prompt omits named-target wording", !broad.includes("only the named entities") && !broad.includes("validated named target"));
  ok("broad comparison prompt contains supported-candidate constraint", broad.includes("supported retrieved canonical candidates"));
}
ok("summary prompt requests multi-record synthesis", answerStrategyPrompt({
  mode: ANSWER_MODES.PORTFOLIO_FACT,
  expectedScope: "PORTFOLIO",
  compositionIntent: "summary",
  evidenceSupport: EVIDENCE_SUPPORT.SUPPORTED,
}).includes("recurring work, outcomes and technical themes"));
ok("supported yes/no prompt requires direct answer first", answerStrategyPrompt({
  mode: ANSWER_MODES.PORTFOLIO_FACT,
  expectedScope: "PORTFOLIO",
  directYesNo: true,
  evidenceSupport: EVIDENCE_SUPPORT.SUPPORTED,
}).includes("Begin the answer with Yes/No"));
{
  const prompt = answerStrategyPrompt({
    mode: ANSWER_MODES.GENERAL,
    expectedScope: "GENERAL",
    compositionIntent: "comparison",
    evidenceSupport: EVIDENCE_SUPPORT.PARTIAL,
  });
  ok("GENERAL strategy prompt keeps diagnostic comparison intent quarantined",
    !/(?:supplied (?:records|evidence|candidates)|portfolio|build the comparison across)/i.test(prompt));
}

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
const falseCorpusAbsence = validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "The portfolio does not record enough information to compare these projects."),
  strategy: { ...portfolioStrategy, compositionIntent: "comparison", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
  records: supportRecords.slice(0, 1),
});
ok("partial evidence rejects a blanket corpus-absence claim", falseCorpusAbsence.flags.includes("unproven-corpus-absence"));
ok("partial support alone is not treated as an evidence contradiction", !falseCorpusAbsence.flags.includes("evidence-contradiction"));
for (const answer of [
  "The supplied SINAMA records do not specify a cloud provider.",
  "SINAMA uses Python and FastAPI; the available records do not specify which cloud provider hosts it.",
]) {
  const validation = validateGeneratedAnswer({
    parsed: valid("PORTFOLIO", answer),
    strategy: { ...portfolioStrategy, evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
    question: "Which cloud provider hosts SINAMA?",
    records: [{ text: "Technologies: Python, FastAPI" }],
  });
  ok(`bounded missing-field statement is accepted: ${answer}`, validation.ok);
}
ok("true established absence remains valid", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "The portfolio does not record quantum annealing work."),
  strategy: { ...portfolioStrategy, evidenceSupport: EVIDENCE_SUPPORT.ABSENT, corpusAbsenceEstablished: true },
}).ok);
ok("unsupported direct yes is rejected", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "Yes, Kaan has quantum annealing experience."),
  strategy: { ...portfolioStrategy, directYesNo: true, evidenceSupport: EVIDENCE_SUPPORT.UNKNOWN },
}).flags.includes("unsupported-binary"));
ok("supported direct yes remains valid", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "Yes, Kaan uses Python in recorded projects."),
  strategy: { ...portfolioStrategy, directYesNo: true, evidenceSupport: EVIDENCE_SUPPORT.SUPPORTED },
}).ok);
ok("partial evidence rejects an unqualified ranking", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "SINAMA is definitively the strongest project, followed by Hospital Appointment System."),
  strategy: { ...portfolioStrategy, compositionIntent: "ranking", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
}).flags.includes("overconfident-partial-composition"));
ok("a global evidence qualifier cannot license an unsupported ranking", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "Based on the available evidence, SINAMA ranks first for reliability work; this ordering is provisional."),
  strategy: { ...portfolioStrategy, compositionIntent: "ranking", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
}).flags.includes("overconfident-partial-composition"));
const partialRankingSupport = {
  intent: "ranking",
  eligibleCandidates: ["SINAMA", "Hospital Appointment System", "Quantum Ledger"],
  supportedCandidates: ["SINAMA", "Hospital Appointment System"],
};
ok("partial ranking can order only its structurally supported candidate subset", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "Among the supported candidates, SINAMA ranks first and Hospital Appointment System second; the remaining criterion coverage is unresolved."),
  strategy: { ...portfolioStrategy, compositionIntent: "ranking", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL, compositionSupport: partialRankingSupport },
}).ok);
ok("unsupported candidate may be named only in an unresolved ranking clause", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "SINAMA ranks first and Hospital Appointment System second among supported candidates. Quantum Ledger is not established for this criterion."),
  strategy: { ...portfolioStrategy, compositionIntent: "ranking", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL, compositionSupport: partialRankingSupport },
}).ok);
ok("partial ranking rejects an unsupported candidate despite a qualifier", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "Based on the available evidence, SINAMA ranks first and Quantum Ledger second."),
  strategy: { ...portfolioStrategy, compositionIntent: "ranking", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL, compositionSupport: partialRankingSupport },
}).flags.includes("overconfident-partial-composition"));
ok("one-sided evidence rejects an unqualified comparison", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "SINAMA is unquestionably more reliable than the unsupported product."),
  strategy: { ...portfolioStrategy, compositionIntent: "comparison", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
}).flags.includes("overconfident-partial-composition"));
ok("one-sided evidence allows a cautious comparison refusal", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "The available evidence supports only SINAMA; it does not establish the other product, so a full comparison is not reliable."),
  strategy: { ...portfolioStrategy, compositionIntent: "comparison", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
}).ok);
const partialComparisonSupport = {
  intent: "comparison",
  eligibleCandidates: ["SINAMA", "Hospital Appointment System", "Quantum Ledger"],
  supportedCandidates: ["SINAMA", "Hospital Appointment System"],
};
ok("partial comparison may compare only supported participants and name the unresolved side separately", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "SINAMA is more reliability-focused than Hospital Appointment System. Quantum Ledger is not established for this criterion."),
  strategy: { ...portfolioStrategy, compositionIntent: "comparison", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL, compositionSupport: partialComparisonSupport },
}).ok);
ok("partial comparison rejects an affirmative unsupported participant", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "SINAMA is more reliability-focused than Quantum Ledger."),
  strategy: { ...portfolioStrategy, compositionIntent: "comparison", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL, compositionSupport: partialComparisonSupport },
}).flags.includes("overconfident-partial-composition"));
for (const [locale, intent, answer] of [
  ["en", "ranking", "Only SINAMA is established; I cannot identify a second project that best demonstrates the criterion."],
  ["en", "ranking", "The records do not establish which other project is strongest."],
  ["en", "comparison", "I cannot say which project is better or best."],
  ["en", "ranking", "First, SINAMA: the supplied evidence covers the criterion. Merge Rush: the supplied records do not describe it."],
  ["tr", "ranking", "En iyi ikinci projeyi belirleyemiyorum."],
]) {
  ok(`${locale} honest partial ${intent} inability is accepted`, validateGeneratedAnswer({
    parsed: valid("PORTFOLIO", answer),
    strategy: { ...portfolioStrategy, compositionIntent: intent, evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
    locale,
  }).ok);
}
for (const [locale, answer] of [
  ["en", "Based on the available evidence, SINAMA is more reliable than Quantum Ledger."],
  ["en", "The evidence is insufficient for one metric. SINAMA is more reliable than Quantum Ledger."],
  ["tr", "Kanıt yetersiz. SINAMA Quantum Ledger'dan daha güvenilir."],
  ["de", "Die Nachweise sind nicht vollständig. SINAMA ist zuverlässiger als Quantum Ledger."],
  ["es", "Las pruebas son insuficientes. SINAMA es más fiable que Quantum Ledger."],
  ["fr", "Les éléments sont insuffisants. SINAMA est plus fiable que Quantum Ledger."],
]) {
  ok(`${locale} unrelated qualifier cannot license an unsupported comparative`, validateGeneratedAnswer({
    parsed: valid("PORTFOLIO", answer),
    strategy: { ...portfolioStrategy, compositionIntent: "comparison", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
    locale,
  }).flags.includes("overconfident-partial-composition"));
}
for (const [locale, intent, answer] of [
  ["en", "ranking", "SINAMA is the strongest project and Hospital is second."],
  ["tr", "ranking", "En güçlü proje SINAMA, ikinci Hospital Appointment System."],
  ["de", "ranking", "SINAMA ist das stärkste Projekt und Hospital ist Zweiter."],
  ["es", "ranking", "SINAMA es el proyecto más fuerte y Hospital es segundo."],
  ["fr", "ranking", "SINAMA est le projet le plus fort et Hospital est deuxième."],
  ["en", "comparison", "SINAMA is more reliable than Quantum Ledger."],
]) {
  ok(`${locale} partial ${intent} rejects a definite unsupported conclusion`, validateGeneratedAnswer({
    parsed: valid("PORTFOLIO", answer),
    strategy: { ...portfolioStrategy, compositionIntent: intent, evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
    locale,
  }).flags.includes("overconfident-partial-composition"));
}
for (const [locale, intent, answer] of [
  ["en", "ranking", "Based on the available evidence, SINAMA ranks first, but the ordering is provisional."],
  ["tr", "ranking", "Mevcut kanıta göre SINAMA birinci; sıralama geçicidir."],
  ["de", "ranking", "Nach den verfügbaren Nachweisen liegt SINAMA vorläufig an erster Stelle."],
  ["es", "ranking", "Según las pruebas disponibles, SINAMA ocupa provisionalmente el primer lugar."],
  ["fr", "ranking", "Selon les éléments disponibles, SINAMA occupe provisoirement la première place."],
  ["en", "comparison", "The available evidence supports only SINAMA and cannot establish the missing side."],
]) {
  const validation = validateGeneratedAnswer({
    parsed: valid("PORTFOLIO", answer),
    strategy: { ...portfolioStrategy, compositionIntent: intent, evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
    locale,
  });
  if (intent === "ranking") {
    ok(`${locale} qualifier alone cannot license an ordered conclusion`, validation.flags.includes("overconfident-partial-composition"));
  } else {
    ok(`${locale} partial ${intent} allows a non-comparative evidence limit`, validation.ok);
  }
}
ok("token-cut ending is rejected", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "This otherwise plausible recruiter assessment was cut off before it could finish the final oper"),
  strategy: portfolioStrategy,
}).flags.includes("incomplete-ending"));
ok("full English template in Turkish is rejected", validateGeneratedAnswer({
  parsed: valid("PORTFOLIO", "Worked with major models and completed tasks across projects, evaluated outputs and assessed quality."),
  strategy: portfolioStrategy,
  locale: "tr",
}).flags.includes("language-template-leak"));

/* Recruiter strength calibration: explicit risky phrases, not a blacklist of
 * role names, ordinary enterprise work, or discussion of missing evidence. */
const recruiterStrategy = { expectedScope: "PORTFOLIO", mode: ANSWER_MODES.RECRUITER_FIT, recruiter: true };
const strengthFlags = (answer, records = [], strategy = recruiterStrategy) => validateGeneratedAnswer({
  parsed: valid(strategy.expectedScope, answer), strategy, records,
}).flags;
for (const answer of [
  "Kaan builds scalable AI systems.",
  "Kaan gerçek zamanlı ve ölçeklenebilir AI sistemleri geliştiriyor.",
  "Kaan builds production-grade systems.",
  "Kaan delivered enterprise-scale systems.",
  "Kaan has senior-level engineering depth.",
  "Kaan has deep expertise in AI.",
  "Kaan derin uzmanlığa sahiptir.",
  "Kaan is an expert in AI systems.",
  "Kaan AI sistemleri konusunda uzmandır.",
  "Kaan has extensive production ownership.",
]) {
  ok(`unsupported recruiter strength is rejected: ${answer}`, strengthFlags(answer).includes("unsupported-strength"));
}
for (const answer of [
  "Kaan contributed to enterprise conversational AI, live-chat and multi-channel automation.",
  "A Senior AI Engineer role would require more evidence.",
  "The AI Training Specialist role involved reviewing model outputs.",
  "Expert review would help assess his work.",
  "The records do not establish scalable systems.",
  "Deep expertise is not shown by the records.",
  "There is no evidence of senior-level depth.",
  "Production-grade ownership remains unverified.",
  "He needs more evidence of scalable systems.",
  "Ölçeklenebilir sistemler geliştirdiği kayıtlarda belirtilmemiş.",
  "Derin uzmanlık kanıtı yoktur.",
  "Ölçeklenebilir sistem deneyimi için daha fazla kanıt gerekir.",
  /* Turkish denies with a verb suffix, not a keyword. These read as claims to
   * a word-list guard, and rejecting them threw away correct repairs. */
  "Ölçeklenebilir sistemlerde deneyimi olup olmadığı bilinmiyor.",
  "Portfolio, ölçeklenebilir sistemleri doğrulamaz.",
  "Kayıtlar production-grade sistemleri göstermez.",
  "Portfolyo, derin uzmanlığa dair kanıt içermiyor.",
  "Kaan'ın enterprise-scale deneyimi kayıtlarda görünmüyor.",
]) {
  ok(`calibrated recruiter language stays allowed: ${answer}`, !strengthFlags(answer).includes("unsupported-strength"));
}
ok("general explanation of scalable systems is not recruiter-policed", !strengthFlags(
  "Scalable systems handle increasing demand.", [], generalStrategy,
).includes("unsupported-strength"));
ok("an adjacent gap cannot excuse an unsupported positive clause", strengthFlags(
  "Kaan builds scalable AI systems, but production ownership is not recorded.",
).includes("unsupported-strength"));
ok("equivalent Turkish evidence supports English scalable claim", !strengthFlags(
  "Kaan builds scalable systems.", [{ text: "Kaan ölçeklenebilir sistemler geliştirdi." }],
).includes("unsupported-strength"));
ok("equivalent English evidence supports Turkish scalable claim", !strengthFlags(
  "Kaan ölçeklenebilir sistemler geliştirdi.", [{ text: "Kaan built scalable systems." }],
).includes("unsupported-strength"));
ok("scalable evidence does not establish highly scalable", strengthFlags(
  "Kaan builds highly scalable systems.", [{ text: "Kaan built scalable systems." }],
).includes("unsupported-strength"));
ok("recorded ordinary enterprise work does not establish enterprise-scale", strengthFlags(
  "Kaan built enterprise-scale systems.", [{ text: "Kaan contributed to enterprise conversational AI." }],
).includes("unsupported-strength"));
ok("canonical guardrails cannot be misread as strength evidence", strengthFlags(
  "Kaan has senior-level depth.", [{ text: "Do not claim senior-level depth without evidence." }],
).includes("unsupported-strength"));
ok("a record describing a gap cannot support a positive claim", strengthFlags(
  "Kaan builds scalable systems.", [{ text: "Evidence of scalable systems is missing." }],
).includes("unsupported-strength"));
ok("a denial suffix does not license an unsupported claim elsewhere", strengthFlags(
  "Kaan ölçeklenebilir sistemler kurdu. Üretim deneyimi bilinmiyor.",
).includes("unsupported-strength"));
ok("an ordinary negated sentence is still not a claim", !strengthFlags(
  "Kaan'ın ölçeklenebilir sistem deneyimi kayıtlarda bulunmuyor.",
).includes("unsupported-strength"));

ok("recruiter prompt explicitly distinguishes live-chat from scalability", answerStrategyPrompt(recruiterStrategy)
  .includes("Exposure, a role title or enterprise work never establishes scalable / ölçeklenebilir"));
ok("strength repair asks for concrete facts at the recorded level", repairPrompt(["unsupported-strength"], recruiterStrategy)
  .includes("Claim only the strength the records state, and do not swap in another qualifier"));

/* ---------- scope contract ----------
 *
 * The live regression this protects: the model wrote a correct, grounded
 * recruiter answer but labelled it SCOPE: GENERAL, the validator rejected it,
 * and the repair prompt named the flag without naming the scope — so the second
 * attempt reproduced the same label and every turn reached the fallback. The
 * contract is asserted generically, on expectedScope, never on a single mode. */

const scopeLine = (scope) => `The first line must be exactly: SCOPE: ${scope}`;
for (const scope of ["PORTFOLIO", "GENERAL"]) {
  for (const [label, strategy] of [
    [`recruiter ${scope}`, { mode: ANSWER_MODES.RECRUITER_FIT, recruiter: true, expectedScope: scope }],
    [`non-recruiter ${scope}`, { mode: ANSWER_MODES.PORTFOLIO_FACT, expectedScope: scope }],
  ]) {
    ok(`initial prompt requires the expected scope (${label})`, answerStrategyPrompt(strategy).includes(scopeLine(scope)));
    ok(`initial prompt names only the expected scope (${label})`, !answerStrategyPrompt(strategy)
      .includes(scopeLine(scope === "PORTFOLIO" ? "GENERAL" : "PORTFOLIO")));
    ok(`scope-mismatch repair requires the expected scope (${label})`, repairPrompt(["scope-mismatch"], strategy)
      .includes(scopeLine(scope)));
  }
}
/* Every shipped strategy carries the contract, so no future mode can silently
 * lose it — this is what a removed contract has to fail against. */
for (const [question, plan] of [
  ["Neden Kaan'ı işe almalıyız?", {}],
  ["Kaan Forward Deployed Engineer rolüne uygun mu?", {}],
  ["SINAMA stacki ne?", projectPlan(["SINAMA"])],
  ["Kaan nerede çalıştı?", { contextEligible: true, activeOrganizations: [], experienceFocus: true }],
  ["RAG nedir?", { contextEligible: false }],
]) {
  const strategy = selectAnswerStrategy({ question, plan, history: [] });
  ok(`shipped strategy carries a scope contract: ${question}`,
    answerStrategyPrompt(strategy).includes(scopeLine(strategy.expectedScope)));
}
/* No expectedScope must inject no scope sentence at all — not a truncated or
 * undefined one. */
for (const strategy of [null, undefined, { mode: ANSWER_MODES.PORTFOLIO_FACT }, { mode: ANSWER_MODES.RECRUITER_FIT, recruiter: true }]) {
  ok(`absent expectedScope injects no scope instruction: ${JSON.stringify(strategy)}`,
    !/The first line must be exactly/.test(answerStrategyPrompt(strategy)));
  ok(`absent expectedScope repairs without a scope instruction: ${JSON.stringify(strategy)}`,
    !/The first line must be exactly/.test(repairPrompt(["scope-mismatch"], strategy)));
}
ok("a non-scope rejection adds no scope-correction sentence",
  !repairPrompt(["near-repeated-sentence"], { mode: ANSWER_MODES.RECRUITER_FIT, recruiter: true, expectedScope: "PORTFOLIO" })
    .includes("The rejected draft used the wrong scope"));
ok("a scope rejection names the correction explicitly",
  repairPrompt(["scope-mismatch"], { mode: ANSWER_MODES.RECRUITER_FIT, recruiter: true, expectedScope: "PORTFOLIO" })
    .includes("The rejected draft used the wrong scope"));

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
const rankingFallback = buildSafeFallback({
  strategy: { ...portfolioStrategy, compositionIntent: "ranking", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
  locale: "en",
  records: fallbackRecords,
});
ok("ranking fallback refuses to invent a definite order", rankingFallback.answer.includes("will not impose a definite order"));
const uncertainYesNoFallback = buildSafeFallback({
  strategy: { ...portfolioStrategy, directYesNo: true, evidenceSupport: EVIDENCE_SUPPORT.UNKNOWN },
  locale: "en",
  records: fallbackRecords,
});
ok("unsupported yes/no fallback stays non-binary", uncertainYesNoFallback.answer.includes("not enough for a reliable yes/no"));

const localizedPartialAnswers = {
  tr: "Mevcut kanıta göre sıralama geçicidir.",
  en: "The ranking is provisional on the available evidence.",
  de: "Die Rangfolge ist anhand der verfügbaren Nachweise vorläufig.",
  es: "La clasificación es provisional según las pruebas disponibles.",
  fr: "Le classement est provisoire selon les éléments disponibles.",
};
const localizedFallbackSignals = {
  tr: ["Güvenilir bir sıralama", "evet/hayır", "Portfolyodaki ilgili"],
  en: ["reliable ranking", "yes/no", "relevant portfolio"],
  de: ["verlässliche Rangfolge", "Ja/Nein", "relevanten Portfolio"],
  es: ["clasificación fiable", "sí o no", "registros relevantes"],
  fr: ["classement fiable", "oui ou non", "éléments pertinents"],
};
for (const locale of ["tr", "en", "de", "es", "fr"]) {
  ok(`${locale} partial composition accepts localized calibration without a magic disclaimer`, validateGeneratedAnswer({
    parsed: valid("PORTFOLIO", localizedPartialAnswers[locale]),
    strategy: { ...portfolioStrategy, compositionIntent: "ranking", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
    locale,
  }).ok);
  ok(`${locale} partial comparison accepts the same localized calibration rule`, validateGeneratedAnswer({
    parsed: valid("PORTFOLIO", localizedPartialAnswers[locale]),
    strategy: { ...portfolioStrategy, compositionIntent: "comparison", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
    locale,
  }).ok);
  const ranking = buildSafeFallback({
    strategy: { ...portfolioStrategy, compositionIntent: "ranking", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
    locale,
    records: fallbackRecords,
  });
  const yesNo = buildSafeFallback({
    strategy: { ...portfolioStrategy, directYesNo: true, evidenceSupport: EVIDENCE_SUPPORT.UNKNOWN },
    locale,
    records: fallbackRecords,
  });
  const comparison = buildSafeFallback({
    strategy: { ...portfolioStrategy, compositionIntent: "comparison", evidenceSupport: EVIDENCE_SUPPORT.PARTIAL },
    locale,
    records: fallbackRecords,
  });
  ok(`${locale} ranking fallback is localized`, ranking.answer.includes(localizedFallbackSignals[locale][0]));
  ok(`${locale} uncertain yes/no fallback is localized`, yesNo.answer.includes(localizedFallbackSignals[locale][1]));
  ok(`${locale} partial comparison fallback is localized`, comparison.answer.includes(localizedFallbackSignals[locale][2]));
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
const ask = (rag, question, locale = "en", history = [], conversationState) => rag.handle({
  method: "POST",
  origin: ORIGIN,
  contentType: "application/json",
  body: JSON.stringify({ version: 1, mode: "rag", question, locale, history, conversationState }),
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
  ["CBOT'ta Kaan ne yaptı?", ANSWER_MODES.PORTFOLIO_EXPERIENCE, "experience:cbot"],
  ["Kaan Outlier'da ne yaptı?", ANSWER_MODES.PORTFOLIO_EXPERIENCE, "experience:outlier-ai"],
  ["Joyday'de Kaan ne yaptı?", ANSWER_MODES.PORTFOLIO_EXPERIENCE, "experience:atolye-joyday"],
  ["Kaan Punto'da ne yaptı?", ANSWER_MODES.PORTFOLIO_EXPERIENCE, "experience:punto-organization-software"],
  ["Kaan'ın staj deneyimi ne?", ANSWER_MODES.PORTFOLIO_EXPERIENCE, "experience:punto-organization-software"],
  ["Kaan Forward Deployed Engineer rolüne uygun mu?", ANSWER_MODES.RECRUITER_FIT, "experience:cbot"],
  ["Kaan Applied AI Engineer için güçlü bir aday mı?", ANSWER_MODES.RECRUITER_FIT, "project:sinama"],
  ["Kaan'ın Software Engineer rolü için hangi kanıtları var?", ANSWER_MODES.RECRUITER_EVIDENCE, "skills:programming"],
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

for (const repairedAnswer of [
  "Kaan contributed to live-chat QA and multi-channel automation at CBOT; production ownership remains a question for the interview.",
  "Kaan builds scalable AI systems.",
]) {
  const repairedSuccessfully = !repairedAnswer.includes("scalable");
  const { rag, state } = await makeRag(({ state: current }) => ` PORTFOLIO\nANSWER: ${current.chat === 1
    ? "Kaan builds scalable AI systems."
    : repairedAnswer}`);
  const response = await ask(rag, "Why should we hire Kaan?", "en");
  check(`strength guard uses at most one repair (${repairedSuccessfully})`, state.chat, 2);
  check(`strength repair reuses its embedding (${repairedSuccessfully})`, state.embed - state.initEmbed, 1);
  check(`strength repair fallback status (${repairedSuccessfully})`, response.body.fallbackUsed, !repairedSuccessfully);
  check(`strength repair preserves portfolio scope (${repairedSuccessfully})`, response.body.scope, "portfolio");
  ok(`strength flag is reported (${repairedSuccessfully})`, response.body.validatorFlags.includes("unsupported-strength"));
  ok(`unsupported strength never reaches the user (${repairedSuccessfully})`, !response.body.answer.includes("scalable"));
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

/* ---------- A5.3.2 class-level composition E2E ---------- */

{
  const { rag, state } = await makeRag(({ prompt }) => {
    if (prompt.includes("Answer strategy: general.")) {
      return " GENERAL\nANSWER: This is a general answer without portfolio evidence.";
    }
    if (prompt.includes("Kaan Python biliyor mu?")) {
      return " PORTFOLIO\nANSWER: Yes, the supplied skills and project records show Python use.";
    }
    if (prompt.includes("müşteri chatbot deneyimi")) {
      return " PORTFOLIO\nANSWER: Yes, the CBOT experience record supports customer chatbot work.";
    }
    if (prompt.includes("production AI agent reliability")) {
      return " PORTFOLIO\nANSWER: Yes, SINAMA records support AI agent reliability work; production ownership should be read only at the level the records state.";
    }
    if (prompt.includes("Hospital Appointment System ile SINAMA")) {
      return " PORTFOLIO\nANSWER: Hospital Appointment System emphasizes appointment workflows, while SINAMA emphasizes AI agent reliability; the supplied records support comparison without declaring a winner.";
    }
    if (prompt.includes("SINAMA ile CBOT")) {
      return " PORTFOLIO\nANSWER: SINAMA records AI-agent reliability work, while CBOT records conversational-AI experience; the supplied records support both sides.";
    }
    if (prompt.includes("CBOT ve Outlier AI") || prompt.includes("Outlier AI ve CBOT")) {
      const reversed = prompt.includes("Outlier AI ve CBOT");
      return ` PORTFOLIO\nANSWER: ${reversed ? "Outlier AI" : "CBOT"} records one experience context, while ${reversed ? "CBOT" : "Outlier AI"} records another; the supplied records support both sides.`;
    }
    if (prompt.includes("SINAMA, Joyday")) {
      return " PORTFOLIO\nANSWER: SINAMA emphasizes AI agent reliability, Atölye Joyday product delivery, and Hospital Appointment System appointment workflows; the supplied records support comparison without declaring a winner.";
    }
    if (prompt.includes("karşılaştır") || prompt.includes("fark ne")) {
      return " PORTFOLIO\nANSWER: SINAMA emphasizes AI agent reliability, while Hospital Appointment System emphasizes appointment workflows; the supplied records support comparison without declaring a winner.";
    }
    if (prompt.includes("özetle") || prompt.includes("ana teknik temalar")) {
      return " PORTFOLIO\nANSWER: The records show recurring themes in applied AI, conversational systems, reliability work, and full-stack product delivery.";
    }
    if (prompt.includes("rol") || prompt.includes("Engineer")) {
      return " PORTFOLIO\nANSWER: The recorded project and experience evidence supports a calibrated role fit, while the portfolio leaves deployment scale as an interview question.";
    }
    return " PORTFOLIO\nANSWER: Based on the supplied candidates, SINAMA ranks first for AI reliability depth, Hospital Appointment System second for application architecture, and Hospital Form App third for focused delivery; this ordering is criterion-specific.";
  });

  for (const question of [
    "Kaan'ın en güçlü 3 projesini söyle.",
    "En güçlü 2 projesini seç ve nedenlerini açıkla.",
    "Teknik derinliğe göre 3 proje seç.",
  ]) {
    const before = { embed: state.embed, chat: state.chat };
    const response = await ask(rag, question, "en");
    check(`[composition-ranking] ${question} stays portfolio`, response.body.scope, "portfolio");
    check(`[composition-ranking] ${question} uses one retrieval`, state.embed - before.embed, 1);
    check(`[composition-ranking] ${question} uses one generation`, state.chat - before.chat, 1);
    check(`[composition-ranking] ${question} avoids fallback`, response.body.fallbackUsed, false);
    ok(`[composition-ranking] ${question} supplies diverse project records`, new Set(response.body.sources
      .filter((item) => item.entityId.startsWith("project:"))
      .map((item) => item.entityId)).size >= 2);
  }

  const experienceComparison = await ask(rag, "Kaan'ın CBOT ve Outlier AI deneyimlerini karşılaştır.", "en");
  check("[composition-comparison] two experiences stay portfolio", experienceComparison.body.scope, "portfolio");
  check("[composition-comparison] two experiences use shared comparison", experienceComparison.body.answerMode, ANSWER_MODES.COMPARISON);
  ok("[composition-comparison] two experiences keep CBOT evidence", experienceComparison.body.sources
    .some((item) => item.entityId === "experience:cbot"));
  ok("[composition-comparison] two experiences keep Outlier evidence", experienceComparison.body.sources
    .some((item) => item.entityId === "experience:outlier-ai"));
  check("[composition-comparison] two experiences avoid fallback", experienceComparison.body.fallbackUsed, false);

  const reversedExperience = await ask(rag, "Kaan'ın Outlier AI ve CBOT deneyimlerini karşılaştır.", "en");
  check("[composition-comparison] reversed experiences use shared comparison", reversedExperience.body.answerMode, ANSWER_MODES.COMPARISON);
  ok("[composition-comparison] reversed experiences keep both sides", ["experience:cbot", "experience:outlier-ai"]
    .every((id) => reversedExperience.body.sources.some((item) => item.entityId === id)));
  ok("[composition-comparison] reversed experience order reaches the answer", reversedExperience.body.answer.indexOf("Outlier AI") < reversedExperience.body.answer.indexOf("CBOT"));

  for (const question of [
    "SINAMA ile Hospital Appointment System'ı karşılaştır.",
    "Hospital Appointment System ile SINAMA'yı karşılaştır.",
    "SINAMA ile CBOT'u karşılaştır.",
    "SINAMA, Joyday ve Hospital Appointment System arasındaki fark ne?",
  ]) {
    const response = await ask(rag, question, "en");
    check(`[composition-comparison] ${question} selects comparison`, response.body.answerMode, ANSWER_MODES.COMPARISON);
    ok(`[composition-comparison] ${question} keeps SINAMA evidence`, response.body.sources.some((item) => /SINAMA/i.test(item.title)));
    const secondEvidence = question.includes("CBOT") ? /CBOT/i : /Hospital Appointment System/i;
    ok(`[composition-comparison] ${question} keeps its second side`, response.body.sources.some((item) => secondEvidence.test(item.title)));
    if (question.includes("Joyday")) {
      ok(`[composition-comparison] ${question} preserves all three supported sides`, response.body.sources
        .some((item) => /Joyday/i.test(item.title)));
      check(`[composition-comparison] ${question} exposes one evidence card per side`, response.body.evidence.length, 3);
    }
    check(`[composition-comparison] ${question} avoids fallback`, response.body.fallbackUsed, false);
    const first = question.startsWith("Hospital") ? "Hospital Appointment System" : "SINAMA";
    const second = question.startsWith("Hospital") ? "SINAMA" : question.includes("CBOT") ? "CBOT" : "Hospital Appointment System";
    ok(`[composition-comparison] ${question} preserves named order`, response.body.answer.indexOf(first) < response.body.answer.indexOf(second));
  }

  for (const question of [
    "Kaan Forward Deployed Engineer için neden uygun?",
    "Why would a recruiter hire Kaan for Applied AI?",
  ]) {
    const response = await ask(rag, question, "en");
    check(`[composition-role-fit] ${question} stays portfolio`, response.body.scope, "portfolio");
    ok(`[composition-role-fit] ${question} uses recruiter strategy`, response.body.answerMode.startsWith("recruiter-"));
    ok(`[composition-role-fit] ${question} has cross-record evidence`, new Set(response.body.sources.map((item) => item.entityId)).size >= 2);
    check(`[composition-role-fit] ${question} avoids fallback`, response.body.fallbackUsed, false);
  }

  for (const question of [
    "Is a Software Engineer a good fit for remote work?",
    "Bu engineer pozisyonu için hangi kanıtlar önemli?",
    "What evidence makes an engineer suitable for this role?",
    "Solution Engineer tarafında güçlü iletişim neden önemli?",
  ]) {
    const before = { embed: state.embed, chat: state.chat, prompts: state.prompts.length };
    const response = await ask(rag, question, "en");
    check(`[role-authority-negative] ${question} remains GENERAL`, response.body.scope, "general");
    ok(`[role-authority-negative] ${question} cannot select a recruiter/portfolio strategy`,
      response.body.answerMode === ANSWER_MODES.GENERAL || response.body.answerMode === "clarify-reference");
    check(`[role-authority-negative] ${question} uses zero embedding`, state.embed - before.embed, 0);
    check(`[role-authority-negative] ${question} exposes zero sources`, response.body.sources.length, 0);
    check(`[role-authority-negative] ${question} exposes zero evidence`, response.body.evidence.length, 0);
    if (state.prompts.length > before.prompts) {
      const prompt = state.prompts.at(-1);
      ok(`[role-authority-negative] ${question} prompt has no portfolio composition instruction`,
        !/(?:supplied (?:records|evidence|candidates)|portfolio records)/i.test(prompt));
    } else {
      check(`[role-authority-negative] ${question} structural clarification performs no generation`, state.chat - before.chat, 0);
    }
  }

  {
    const firstQuestion = "Kaan Forward Deployed Engineer için neden uygun?";
    const first = await ask(rag, firstQuestion, "en");
    const history = [
      { role: "user", content: firstQuestion },
      { role: "assistant", content: first.body.answer },
    ];
    const followUp = await ask(rag, "Peki bu role neden uygun?", "en", history, first.body.conversationState);
    check("[role-authority-positive] validated portfolio follow-up remains portfolio", followUp.body.scope, "portfolio");
    ok("[role-authority-positive] validated portfolio follow-up retains recruiter refinement", followUp.body.answerMode.startsWith("recruiter-"));
  }

  for (const question of [
    "Kaan'ın projelerini özetle.",
    "Deneyimini kısa özetle.",
    "Portfolyodaki ana teknik temalar neler?",
    "Son projelerini teknik açıdan özetle.",
  ]) {
    const response = await ask(rag, question, "en");
    check(`[composition-summary] ${question} stays portfolio`, response.body.scope, "portfolio");
    check(`[composition-summary] ${question} avoids fallback`, response.body.fallbackUsed, false);
    ok(`[composition-summary] ${question} exposes evidence`, response.body.evidence.length >= 1);
  }

  for (const question of [
    "Kaan Python biliyor mu?",
    "Kaan'ın müşteri chatbot deneyimi var mı?",
    "Kaan production AI agent reliability üzerinde çalışmış mı?",
  ]) {
    const response = await ask(rag, question, "en");
    check(`[composition-yes-no] ${question} answers directly`, /^Yes\b/.test(response.body.answer), true);
    check(`[composition-yes-no] ${question} avoids fallback`, response.body.fallbackUsed, false);
  }

  for (const question of [
    "Python nedir? Portfolyoyla bağlamadan kısa anlat.",
    "CBOT nedir?",
    "Outlier AI nedir?",
  ]) {
    const before = { embed: state.embed, chat: state.chat };
    const response = await ask(rag, question, "en");
    check(`[composition-general] ${question} stays GENERAL`, response.body.scope, "general");
    check(`[composition-general] ${question} uses no portfolio embedding`, state.embed - before.embed, 0);
    check(`[composition-general] ${question} exposes no evidence`, response.body.evidence.length, 0);
  }


  {
    const before = { embed: state.embed, prompts: state.prompts.length };
    const response = await ask(rag, "CBOT ile Outlier AI'ı karşılaştır.", "en");
    check("[general-comparison] remains GENERAL", response.body.scope, "general");
    check("[general-comparison] uses GENERAL strategy", response.body.answerMode, ANSWER_MODES.GENERAL);
    check("[general-comparison] uses zero portfolio embeddings", state.embed - before.embed, 0);
    check("[general-comparison] exposes zero sources", response.body.sources.length, 0);
    check("[general-comparison] exposes zero evidence", response.body.evidence.length, 0);
    const prompt = state.prompts.at(-1);
    ok("[general-comparison] prompt contains no portfolio evidence/composition instruction",
      !/(?:supplied (?:records|evidence|candidates)|portfolio records|build the comparison across)/i.test(prompt));
  }
}

{
  const { rag, state } = await makeRag(() => " PORTFOLIO\nANSWER: The available evidence supports only SINAMA; it does not establish Quantum Ledger, so a full comparison is not reliable.");
  const response = await ask(rag, "SINAMA ile Quantum Ledger'ı karşılaştır.", "en");
  check("[partial-comparison] one supported entity remains portfolio", response.body.scope, "portfolio");
  check("[partial-comparison] one validated side cannot manufacture comparison mode", response.body.answerMode, ANSWER_MODES.PORTFOLIO_PROJECT);
  check("[partial-comparison] one retrieval and one generation", `${state.embed - state.initEmbed}/${state.chat}`, "1/1");
  check("[partial-comparison] cautious partial answer avoids fallback", response.body.fallbackUsed, false);
  ok("[partial-comparison] unsupported side is not treated as established", response.body.answer.includes("does not establish Quantum Ledger"));
}

for (const question of [
  "Kaan Python ve quantum annealing biliyor mu?",
  "Kaan chatbot ve SAP deneyimine sahip mi?",
  "Kaan JavaScript ile kernel driver geliştirdi mi?",
  "Kaan C# ile chatbot geliştirdi mi?",
  "Kaan Python ile mobil oyun geliştirdi mi?",
  "Kaan JavaScript ile IVR sistemi yaptı mı?",
]) {
  const { rag, state } = await makeRag(() => " PORTFOLIO\nANSWER: Yes, the supported technology proves the whole proposition.");
  const response = await ask(rag, question, "en");
  check(`[compound-proposition] ${question} uses only one embedding`, state.embed - state.initEmbed, 1);
  check(`[compound-proposition] ${question} stops after one repair`, state.chat, 2);
  check(`[compound-proposition] ${question} rejects the binary overclaim`, response.body.fallbackUsed, true);
  ok(`[compound-proposition] ${question} reports unsupported binary`, response.body.validatorFlags.includes("unsupported-binary"));
  check(`[compound-proposition] ${question} fallback remains non-binary`, /^Yes\b/.test(response.body.answer), false);
}

{
  const { rag, state } = await makeRag(({ state: current }) => current.chat === 1
    ? " PORTFOLIO\nANSWER: The portfolio does not record Python use."
    : " PORTFOLIO\nANSWER: Yes, the supplied skills and project evidence records Python use.");
  const response = await ask(rag, "Kaan Python biliyor mu?", "en");
  check("[retrieval-miss] false corpus absence triggers one repair", state.chat, 2);
  ok("[retrieval-miss] unproven absence is reported", response.body.validatorFlags.includes("unproven-corpus-absence"));
  check("[retrieval-miss] repaired supported yes/no avoids fallback", response.body.fallbackUsed, false);
}

{
  const { rag, state } = await makeRag(() => " PORTFOLIO\nANSWER: SINAMA uses PostgreSQL as its recorded database technology.");
  const response = await ask(rag, "What database does SINAMA use?", "en");
  ok("[field-support-e2e] known database field reaches SUPPORTED calibration",
    /supplied evidence supports a direct synthesis/i.test(state.prompts.at(-1)));
  check("[field-support-e2e] grounded direct answer is accepted", response.body.fallbackUsed, false);
  ok("[field-support-e2e] answer preserves the supported database", /PostgreSQL/.test(response.body.answer));
}

{
  const answer = "The supplied SINAMA records do not specify which cloud provider hosts it.";
  const { rag, state } = await makeRag(() => ` PORTFOLIO\nANSWER: ${answer}`);
  const response = await ask(rag, "Which cloud provider hosts SINAMA?", "en");
  ok("[field-support-e2e] missing named field reaches PARTIAL calibration",
    /supplied evidence is partial/i.test(state.prompts.at(-1)));
  check("[field-support-e2e] honest bounded insufficiency is accepted", response.body.fallbackUsed, false);
  check("[field-support-e2e] PARTIAL is not called a contradiction",
    response.body.validatorFlags.includes("evidence-contradiction"), false);
}

{
  const { rag, state } = await makeRag(() => " PORTFOLIO\nANSWER: The available evidence is insufficient to establish Rust experience.");
  const response = await ask(rag, "Does Kaan have experience with Rust?", "en");
  ok("[field-support-e2e] absent capability retrieval reaches UNKNOWN calibration",
    /bounded retrieval did not establish the answer/i.test(state.prompts.at(-1)));
  check("[field-support-e2e] UNKNOWN insufficiency remains non-binary", /^(?:Yes|No)\b/.test(response.body.answer), false);
}

{
  const { rag, state } = await makeRag(() => " PORTFOLIO\nANSWER: The portfolio does not record Rust experience.");
  const response = await ask(rag, "Does Kaan have experience with Rust?", "en");
  check("[field-support-e2e] UNKNOWN global absence gets one repair", state.chat, 2);
  check("[field-support-e2e] UNKNOWN global absence cannot pass", response.body.fallbackUsed, true);
  ok("[field-support-e2e] retrieval miss is not promoted to corpus absence",
    response.body.validatorFlags.includes("unproven-corpus-absence"));
}

{
  const { rag, state } = await makeRag(() => " PORTFOLIO\nANSWER: Yes, Kaan has quantum annealing delivery experience.");
  const response = await ask(rag, "Kaan quantum annealing deneyimine sahip mi?", "en");
  check("[unsupported-yes-no] overconfident answer stops after one repair", state.chat, 2);
  check("[unsupported-yes-no] invalid binary answer uses safe fallback", response.body.fallbackUsed, true);
  ok("[unsupported-yes-no] unsupported binary flag is reported", response.body.validatorFlags.includes("unsupported-binary"));
  check("[unsupported-yes-no] fallback does not fabricate yes", /^Yes\b/.test(response.body.answer), false);
}

if (failures.length) {
  console.error(`Ajoop answer quality: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(`Ajoop answer-quality contracts passed. ${passed} assertions · one-retry cap · no network, no Ollama.`);
