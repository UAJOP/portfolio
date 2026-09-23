/**
 * Ajoop answer quality policy.
 *
 * Brief 3 owns whether and how portfolio records are retrieved. This module
 * starts after that decision: it chooses how the answer should be written,
 * which already-indexed records best support recruiter questions, which small
 * evidence set the UI may show, and whether generated prose is safe to return.
 * Every function is pure; no network, filesystem or model call lives here.
 */
import { foldQuestion, hasPhrase, tokenize } from "./ajoop-text.mjs";

export const ANSWER_MODES = Object.freeze({
  GENERAL: "general",
  PORTFOLIO_FACT: "portfolio-fact",
  PORTFOLIO_PROJECT: "portfolio-project",
  PORTFOLIO_EXPERIENCE: "portfolio-experience",
  RECRUITER_FIT: "recruiter-fit",
  RECRUITER_HIRE: "recruiter-hire",
  RECRUITER_STRENGTHS: "recruiter-strengths",
  RECRUITER_GAPS: "recruiter-gaps",
  RECRUITER_RISK: "recruiter-risk",
  RECRUITER_DIFFERENTIATION: "recruiter-differentiation",
  RECRUITER_BEST_ROLE: "recruiter-best-role",
  RECRUITER_ENVIRONMENT: "recruiter-environment",
  RECRUITER_EVIDENCE: "recruiter-evidence",
  COMPARISON: "comparison",
  SELF: "self-about-ajoop",
  FOLLOW_UP: "follow-up",
});

export const ROLE_FAMILIES = Object.freeze({
  GENERAL: "general",
  FORWARD_DEPLOYED: "forward-deployed",
  APPLIED_AI: "applied-ai",
  SOFTWARE: "software-engineering",
  AI_PRODUCT: "ai-product",
});

const ROLE_FAMILY_PHRASES = Object.freeze({
  [ROLE_FAMILIES.FORWARD_DEPLOYED]: Object.freeze(["forward deployed", "fde", "solution engineer", "solution engineering", "cozum muhendisi", "çözüm mühendisi"]),
  [ROLE_FAMILIES.APPLIED_AI]: Object.freeze(["applied ai", "ai engineer", "yapay zeka muhendisi", "yapay zekâ mühendisi", "ml engineer"]),
  [ROLE_FAMILIES.SOFTWARE]: Object.freeze(["software engineer", "software developer", "yazilim muhendisi", "yazılım mühendisi", "backend engineer", "full stack"]),
  [ROLE_FAMILIES.AI_PRODUCT]: Object.freeze(["ai product", "ai designer", "product manager", "urun", "ürün", "conversational designer"]),
});

const TARGET_ROLE_IDENTITIES = Object.freeze([
  Object.freeze({ id: "forward-deployed-engineer", family: ROLE_FAMILIES.FORWARD_DEPLOYED, aliases: Object.freeze(["fde", "forward deployed", "forward deployed engineer", "forward deployed engineering", "forward deployed work"]) }),
  Object.freeze({ id: "solution-engineer", family: ROLE_FAMILIES.FORWARD_DEPLOYED, aliases: Object.freeze(["solution engineer", "solution engineering", "cozum muhendisi", "çözüm mühendisi", "cozum muhendisligi", "çözüm mühendisliği", "cozum muhendisliginde", "çözüm mühendisliğinde"]) }),
  Object.freeze({ id: "applied-ai-engineer", family: ROLE_FAMILIES.APPLIED_AI, aliases: Object.freeze(["applied ai engineer", "applied ai engineering"]) }),
  Object.freeze({ id: "ai-engineer", family: ROLE_FAMILIES.APPLIED_AI, aliases: Object.freeze(["ai engineer", "yapay zeka muhendisi", "yapay zekâ mühendisi"]) }),
  Object.freeze({ id: "ml-engineer", family: ROLE_FAMILIES.APPLIED_AI, aliases: Object.freeze(["ml engineer"]) }),
  Object.freeze({ id: "software-engineer", family: ROLE_FAMILIES.SOFTWARE, aliases: Object.freeze(["software engineer", "software engineering", "yazilim muhendisi", "yazılım mühendisi"]) }),
  Object.freeze({ id: "software-developer", family: ROLE_FAMILIES.SOFTWARE, aliases: Object.freeze(["software developer"]) }),
  Object.freeze({ id: "backend-engineer", family: ROLE_FAMILIES.SOFTWARE, aliases: Object.freeze(["backend engineer"]) }),
  Object.freeze({ id: "ai-product-engineer", family: ROLE_FAMILIES.AI_PRODUCT, aliases: Object.freeze(["ai product engineer", "ai product engineering"]) }),
  Object.freeze({ id: "ai-designer", family: ROLE_FAMILIES.AI_PRODUCT, aliases: Object.freeze(["ai designer"]) }),
  Object.freeze({ id: "product-manager", family: ROLE_FAMILIES.AI_PRODUCT, aliases: Object.freeze(["product manager"]) }),
  Object.freeze({ id: "digital-product-developer", family: ROLE_FAMILIES.AI_PRODUCT, aliases: Object.freeze(["digital product developer", "product developer"]) }),
  Object.freeze({ id: "conversational-designer", family: ROLE_FAMILIES.AI_PRODUCT, aliases: Object.freeze(["conversational designer"]) }),
]);

const RECRUITER_SIGNAL = Object.freeze([
  "role", "rol", "pozisyon", "position", "aday", "candidate", "ise al", "işe al",
  "ise almali", "işe almalı", "neden ise", "neden işe", "would you hire", "why hire",
  "hire", "hiring", "recruiter", "ise alim", "işe alım", "mentorluk", "mentorship",
  "hiring manager", "junior aday", "company environment", "sirket ortami", "şirket ortamı",
  "fit", "uygun mu", "bring to", "weakness", "strength", "eksi", "guclu taraf", "güçlü taraf",
  "neden uygun", "why suitable", "suitable for",
  "neye dayan", "kanit", "kanıt", "evidence", "prove",
]);

const RECRUITER_KINDS = Object.freeze([
  [ANSWER_MODES.RECRUITER_RISK, ["worry", "risk", "endise", "endişe", "riskli"]],
  [ANSWER_MODES.RECRUITER_GAPS, ["eksik", "zayif", "zayıf", "weakness", "gap", "mentorluk", "mentorship", "gelistirmesi", "geliştirmesi"]],
  [ANSWER_MODES.RECRUITER_DIFFERENTIATION, ["ayiran", "ayıran", "differentiat", "differ from other", "other junior", "diger junior", "diğer junior"]],
  [ANSWER_MODES.RECRUITER_BEST_ROLE, ["hangi role", "hangi rol", "best role", "most suitable role", "en uygun rol"]],
  [ANSWER_MODES.RECRUITER_ENVIRONMENT, ["sirket ortami", "şirket ortamı", "company environment", "work environment", "kultur", "kültür"]],
  [ANSWER_MODES.RECRUITER_EVIDENCE, ["neye dayan", "kanit", "kanıt", "evidence", "prove"]],
  [ANSWER_MODES.RECRUITER_STRENGTHS, ["guclu taraf", "güçlü taraf", "strength", "strongest"]],
  [ANSWER_MODES.RECRUITER_HIRE, ["neden ise", "neden işe", "ise almali", "işe almalı", "why hire", "would you hire", "bring to"]],
  [ANSWER_MODES.RECRUITER_FIT, ["uygun mu", "fit", "guclu bir aday", "güçlü bir aday", "ready for", "aday mi", "aday mı"]],
  [ANSWER_MODES.RECRUITER_FIT, ["neden uygun", "why suitable", "suitable for"]],
]);

const SELF_PHRASES = Object.freeze([
  "sen kimsin", "adin ne", "adın ne", "ne yapabiliyorsun", "hangi model", "internete erisimin", "internete erişimin",
  "who are you", "what is your name", "what can you do", "which model", "internet access",
  "wer bist du", "was kannst du", "quel modele", "quel modèle", "qui es tu", "quien eres", "quién eres",
]);

const phraseIn = (text, phrases) => phrases.some((phrase) => hasPhrase(text, foldQuestion(phrase)));

export const EVIDENCE_SUPPORT = Object.freeze({
  NOT_APPLICABLE: "not-applicable",
  SUPPORTED: "supported",
  PARTIAL: "partially-supported",
  UNKNOWN: "unknown",
  ABSENT: "absent",
});

function requestedSelectionCount(question) {
  const words = tokenize(foldQuestion(question));
  const numbers = new Map([
    ["2", 2], ["iki", 2], ["two", 2],
    ["3", 3], ["uc", 3], ["three", 3],
    ["4", 4], ["dort", 4], ["four", 4],
    ["5", 5], ["bes", 5], ["five", 5],
    ["6", 6], ["alti", 6], ["six", 6],
    ["7", 7], ["yedi", 7], ["seven", 7],
    ["8", 8], ["sekiz", 8], ["eight", 8],
    ["9", 9], ["dokuz", 9], ["nine", 9],
  ]);
  const explicit = words.map((word) => numbers.get(word)).find(Boolean);
  if (explicit) return explicit;
  const selection = words.some((word) => /^(?:sec\w*|choose\w*|pick\w*|select\w*)$/.test(word));
  const singularCollection = words.some((word, index) => {
    if (!/^(?:proje|project|deneyim|experience|sirket|company|employer)$/.test(word)) return false;
    /* An immediately following plural nominal is the head of a compound NP
     * ("project examples"), so singular `project` is only an attributive
     * modifier and cannot establish a requested count. */
    return !/^[a-z]{3,}s$/.test(words[index + 1] || "");
  });
  const pluralCollection = words.some((word) => /^(?:projeler\w*|projects|deneyimler\w*|experiences|sirketler\w*|companies|employers)$/.test(word));
  return selection && singularCollection && !pluralCollection ? 1 : null;
}

function isDirectYesNoQuestion(question) {
  const folded = foldQuestion(question);
  const words = tokenize(folded);
  const first = words[0] || "";
  const englishAuxiliary = /^(?:do|does|did|is|are|was|were|has|have|had|can|could|would|will|should)$/.test(first);
  const requestFrame = englishAuxiliary && words[1] === "you";
  return (englishAuxiliary && !requestFrame)
    || (String(question || "").trim().endsWith("?")
      && (/^(?:hat|ist|sind|war|kann|konnte|tiene|es|son|puede|ha|esta|est|sont|peut)$/.test(first)
        || (first === "a" && words[1] === "t" && /^(?:il|elle)$/.test(words[2] || ""))))
    || words.some((word) => /^(?:mi|mu|midir|mudur|miydi|muydu|miyim|muyum|misin|musun|miyiz|muyuz|misiniz|musunuz)$/i.test(word));
}

function strategyShape(question, plan) {
  return {
    compositionIntent: plan?.compositionIntent || null,
    directYesNo: isDirectYesNoQuestion(question),
    requestedCount: requestedSelectionCount(question),
  };
}

function recruiterHistoryText(history) {
  return (history || [])
    .filter((item) => item?.role === "user")
    .slice(-2)
    .map((item) => item.content)
    .join(" ");
}

export function detectRoleFamily(question, history = []) {
  const folded = foldQuestion(`${recruiterHistoryText(history)} ${question}`);
  for (const family of [
    ROLE_FAMILIES.FORWARD_DEPLOYED,
    ROLE_FAMILIES.APPLIED_AI,
    ROLE_FAMILIES.SOFTWARE,
    ROLE_FAMILIES.AI_PRODUCT,
  ]) {
    if (phraseIn(folded, ROLE_FAMILY_PHRASES[family])) return family;
  }
  return ROLE_FAMILIES.GENERAL;
}

export function detectRecruiterQuestion(question, history = []) {
  const current = foldQuestion(question);
  const prior = foldQuestion(recruiterHistoryText(history));
  const recruiterContext = phraseIn(current, RECRUITER_SIGNAL) || phraseIn(prior, RECRUITER_SIGNAL);
  if (!recruiterContext) return null;

  const mode = RECRUITER_KINDS.find(([, phrases]) => phraseIn(current, phrases))?.[0]
    || ANSWER_MODES.RECRUITER_FIT;
  return {
    mode,
    roleFamily: detectRoleFamily(question, history),
  };
}

function explicitComparisonOperands(question, plan, fallbackTargets) {
  const entities = plan?.discourse?.currentEntities;
  if (!Array.isArray(entities)) return fallbackTargets;
  const canonicalEntities = entities.filter((entity) => ["project", "organization"].includes(entity.type));
  const predicateTokens = tokenize(foldQuestion(question));
  const predicateIndex = predicateTokens.findIndex((token) => /^(?:compare\w*|karsilastir\w*|differ\w*|differentiat\w*|fark\w*)$/.test(token));
  if (predicateIndex < 0) return [];
  const fromIndex = predicateTokens.findIndex((token, index) => index > predicateIndex && /^(?:from|ile|den|dan|tan|ten)$/.test(token));
  const contextBoundary = /^(?:using|by|through|via|based|according|considering|given|because|for|about|regarding)$/;
  const spanFor = (entity) => {
    const alias = tokenize(foldQuestion(entity.matched || entity.canonical || ""));
    for (let index = 0; index <= predicateTokens.length - alias.length; index += 1) {
      if (alias.every((token, offset) => predicateTokens[index + offset] === token)) {
        return { entity, start: index, end: index + alias.length };
      }
    }
    return null;
  };
  const mentions = canonicalEntities
    .map(spanFor)
    .filter(Boolean);
  const questionFrameIndex = predicateTokens.reduce((latest, token, index) =>
    index < predicateIndex && /^(?:what|which|how|who|whom|ne|hangi|nasil|kim)$/.test(token) ? index : latest, -1);
  const betweenIndex = predicateTokens.reduce((latest, token, index) =>
    index < predicateIndex && /^(?:between|arasinda\w*)$/.test(token) ? index : latest, -1);
  const prePredicateMentions = mentions.filter(({ end }) => end <= predicateIndex);
  const compactOperandBridge = /^(?:and|or|ve|ile|with|versus|vs|the|his|her|their|of|experience\w*|deneyim\w*|project\w*|proje\w*|arasinda\w*)$/;
  const compactPrePredicatePhrase = (startIndex, minimumMentions) => {
    const mentionsInPhrase = prePredicateMentions.filter(({ start }) => start >= startIndex);
    if (mentionsInPhrase.length < minimumMentions) return false;
    const occupied = new Set(prePredicateMentions.flatMap(({ start, end }) =>
      Array.from({ length: end - start }, (_, offset) => start + offset)));
    return predicateTokens.slice(startIndex, predicateIndex)
      .every((token, offset) => occupied.has(startIndex + offset) || compactOperandBridge.test(token));
  };
  const whichOfFrame = /^(?:which|hangisi)$/.test(predicateTokens[0] || "")
    && /^(?:of|arasindan)$/.test(predicateTokens[1] || "");
  const coordinatedPrePredicateFrame = compactPrePredicatePhrase(0, 2)
    || (whichOfFrame && compactPrePredicatePhrase(2, 2));
  const compactPrePredicateSubject = compactPrePredicatePhrase(0, 1);
  const postPredicateOperands = mentions.filter(({ start }) => {
    if (start <= predicateIndex) return false;
    const argumentStart = fromIndex >= 0 && start > fromIndex ? fromIndex + 1 : predicateIndex + 1;
    return !predicateTokens.slice(argumentStart, start).some((token) => contextBoundary.test(token));
  });
  const pairedDifferFrame = /^(?:differ\w*|differentiat\w*)$/.test(predicateTokens[predicateIndex] || "")
    && fromIndex >= 0
    && postPredicateOperands.some(({ start }) => start > fromIndex);

  const operands = mentions.filter(({ start }) => {
    if (start < predicateIndex) {
      /* Pre-predicate mentions are operands only inside a grammatical
       * comparison frame: BETWEEN, the interrogative subject, or one compact
       * coordinated entity phrase. Leading evidence adjuncts are excluded
       * independently of punctuation and comparison verb spelling. */
      if (betweenIndex >= 0 && start > betweenIndex) return true;
      if (coordinatedPrePredicateFrame) return true;
      return pairedDifferFrame && (compactPrePredicateSubject
        || (questionFrameIndex >= 0 && start > questionFrameIndex));
    }
    return postPredicateOperands.some((operand) => operand.start === start);
  }).map(({ entity }) => entity);
  return [...new Set(operands.map((entity) => entity.canonical))];
}

export function selectAnswerStrategy({ question, plan, history = [] }) {
  const folded = foldQuestion(question);
  const shape = strategyShape(question, plan);
  if (phraseIn(folded, SELF_PHRASES)) {
    return {
      ...shape,
      mode: ANSWER_MODES.SELF,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "GENERAL",
      recruiter: false,
      evidenceLimit: 0,
    };
  }
  /* Authority is decided by retrieval planning, never inferred from an answer
   * shape. Recruiter vocabulary may refine an already-authorized portfolio
   * turn, but it cannot revive a plan that was explicitly denied. */
  if (!plan?.contextEligible) {
    return {
      ...shape,
      mode: ANSWER_MODES.GENERAL,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "GENERAL",
      recruiter: false,
      evidenceLimit: 0,
    };
  }

  const comparisonTargets = [...new Set([
    ...(plan?.activeProjects || []),
    ...(plan?.activeOrganizations || []),
  ])];
  const recruiter = detectRecruiterQuestion(question, history);
  const comparisonOperands = explicitComparisonOperands(question, plan, comparisonTargets);
  const trueNamedComparison = shape.compositionIntent === "comparison" && comparisonOperands.length >= 2;
  if (recruiter && !trueNamedComparison) {
    return {
      ...shape,
      ...recruiter,
      expectedScope: "PORTFOLIO",
      recruiter: true,
      evidenceLimit: 4,
    };
  }
  if (shape.compositionIntent === "comparison" && comparisonTargets.length !== 1) {
    return {
      ...shape,
      mode: ANSWER_MODES.COMPARISON,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "PORTFOLIO",
      recruiter: false,
      evidenceLimit: comparisonTargets.length >= 2 ? comparisonTargets.length : 6,
    };
  }
  /* Explicit composition outranks only the legacy entity-count presentation
   * fallback. Recruiter refinement above keeps its semantics and already
   * carries compositionIntent into the shared composition instruction. */
  if (["ranking", "summary"].includes(shape.compositionIntent)) {
    return {
      ...shape,
      mode: ANSWER_MODES.PORTFOLIO_FACT,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "PORTFOLIO",
      recruiter: false,
      evidenceLimit: 6,
    };
  }
  if ((plan?.activeProjects || []).length > 1) {
    return {
      ...shape,
      mode: ANSWER_MODES.COMPARISON,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "PORTFOLIO",
      recruiter: false,
      evidenceLimit: plan.activeProjects.length + (plan.activeOrganizations || []).length,
    };
  }
  if ((plan?.activeProjects || []).length) {
    return {
      ...shape,
      mode: ANSWER_MODES.PORTFOLIO_PROJECT,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "PORTFOLIO",
      recruiter: false,
      evidenceLimit: 2,
    };
  }
  if ((plan?.activeOrganizations || []).length || plan?.experienceFocus) {
    return {
      ...shape,
      mode: ANSWER_MODES.PORTFOLIO_EXPERIENCE,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "PORTFOLIO",
      recruiter: false,
      evidenceLimit: 3,
    };
  }
  if (plan?.followUp && plan?.contextEligible) {
    return {
      ...shape,
      mode: ANSWER_MODES.FOLLOW_UP,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "PORTFOLIO",
      recruiter: false,
      evidenceLimit: 3,
    };
  }
  return {
    ...shape,
    mode: ANSWER_MODES.PORTFOLIO_FACT,
    roleFamily: ROLE_FAMILIES.GENERAL,
    expectedScope: "PORTFOLIO",
    recruiter: false,
    evidenceLimit: shape.compositionIntent ? 6 : 3,
  };
}

const ROLE_EVIDENCE_IDS = Object.freeze({
  [ROLE_FAMILIES.FORWARD_DEPLOYED]: Object.freeze([
    "recruiter-intelligence",
    "experience:cbot",
    "project:sinama",
    "experience:atolye-joyday",
  ]),
  [ROLE_FAMILIES.APPLIED_AI]: Object.freeze([
    "recruiter-intelligence",
    "project:sinama",
    "experience:outlier-ai",
    "experience:cbot",
  ]),
  [ROLE_FAMILIES.SOFTWARE]: Object.freeze([
    "recruiter-intelligence",
    "skills:programming",
    "experience:punto-organization-software",
    "project:hospital-form-app",
  ]),
  [ROLE_FAMILIES.AI_PRODUCT]: Object.freeze([
    "recruiter-intelligence",
    "experience:cbot",
    "project:sinama",
    "experience:atolye-joyday",
  ]),
});

function generalRecruiterEvidence(mode) {
  if (mode === ANSWER_MODES.RECRUITER_ENVIRONMENT) {
    return ["recruiter-intelligence", "experience:atolye-joyday", "experience:cbot", "experience:punto-organization-software"];
  }
  if (mode === ANSWER_MODES.RECRUITER_BEST_ROLE) {
    return ["professional-positioning", "recruiter-intelligence", "project:sinama", "experience:cbot"];
  }
  if (mode === ANSWER_MODES.RECRUITER_GAPS || mode === ANSWER_MODES.RECRUITER_RISK) {
    return ["recruiter-intelligence", "professional-positioning", "project:sinama", "experience:cbot"];
  }
  return ["recruiter-intelligence", "experience:cbot", "project:sinama", "experience:outlier-ai"];
}

export function recruiterEvidenceIds(strategy) {
  if (!strategy?.recruiter) return [];
  return [...(ROLE_EVIDENCE_IDS[strategy.roleFamily] || generalRecruiterEvidence(strategy.mode))];
}

/** Selects one canonical chunk for each role-family evidence record. */
export function selectRecruiterContext(index, strategy) {
  const selected = [];
  for (const id of recruiterEvidenceIds(strategy)) {
    const candidates = (index || [])
      .filter((item) => item.entityId === id && item.visibility !== "public_on_request")
      .sort((left, right) => (left.priority || 9) - (right.priority || 9) || left.id.localeCompare(right.id));
    if (candidates[0]) selected.push(candidates[0]);
    if (selected.length >= (strategy.evidenceLimit || 4)) break;
  }
  return selected;
}

function isRecruiterFitAssessment(strategy) {
  return strategy?.recruiter === true && strategy.mode === ANSWER_MODES.RECRUITER_FIT;
}

function sourceRank(item) {
  if (item.source === "master-knowledge") return 5;
  if (item.source === "project-details") return 4;
  if (item.source === "projects") return 3;
  if (item.source === "recruiter-profiles") return 2;
  if (item.source === "build-log") return 0;
  return 1;
}

function marksFor(item, affinity) {
  return affinity?.get(item.id) || { projects: [], organizations: [] };
}

function logicalEvidenceKey(item, affinity) {
  const marks = marksFor(item, affinity);
  if (marks.projects.length === 1) return `project:${marks.projects[0]}`;
  if (marks.organizations.length === 1) return `organization:${marks.organizations[0]}`;
  return `${item.source}:${item.entityId}`;
}

function evidenceSort(strategy, affinity) {
  const recruiterOrder = new Map(recruiterEvidenceIds(strategy).map((id, index) => [id, index]));
  return (left, right) => {
    if (strategy.recruiter) {
      const leftOrder = recruiterOrder.has(left.entityId) ? recruiterOrder.get(left.entityId) : 99;
      const rightOrder = recruiterOrder.has(right.entityId) ? recruiterOrder.get(right.entityId) : 99;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    }
    const leftMarks = marksFor(left, affinity);
    const rightMarks = marksFor(right, affinity);
    const leftDirect = leftMarks.projects.some((name) => strategy.activeProjects?.includes(name))
      || leftMarks.organizations.some((name) => strategy.activeOrganizations?.includes(name));
    const rightDirect = rightMarks.projects.some((name) => strategy.activeProjects?.includes(name))
      || rightMarks.organizations.some((name) => strategy.activeOrganizations?.includes(name));
    if (leftDirect !== rightDirect) return Number(rightDirect) - Number(leftDirect);
    if (sourceRank(left) !== sourceRank(right)) return sourceRank(right) - sourceRank(left);
    if ((left.priority || 9) !== (right.priority || 9)) return (left.priority || 9) - (right.priority || 9);
    return (right.score || 0) - (left.score || 0);
  };
}

function recordSearchText(record) {
  return foldQuestion([
    record?.title,
    record?.entityId,
    record?.text,
    ...(record?.tags || []),
  ].filter(Boolean).join(" "));
}

function recordSupportsNamedEntity(record, canonical, affinity) {
  const marks = marksFor(record, affinity);
  return [...marks.projects, ...marks.organizations].includes(canonical);
}

function distinctEvidenceEntities(records, affinity) {
  return new Set((records || []).map((record) => logicalEvidenceKey(record, affinity))).size;
}

function broadCompositionCandidates(records, affinity, framedTypes = []) {
  const family = framedTypes.length === 1 ? framedTypes[0] : null;
  const candidates = new Map();
  const add = (key, name, record) => {
    if (!key || !name) return;
    if (!candidates.has(key)) candidates.set(key, { key, name, records: [] });
    candidates.get(key).records.push(record);
  };
  for (const record of records || []) {
    const marks = marksFor(record, affinity);
    if (family === "project") {
      for (const name of marks.projects) add(`project:${name}`, name, record);
      continue;
    }
    if (family === "experience") {
      if (record.entityType === "experience") {
        add(`experience:${record.entityId}`, record.title || record.entityId, record);
      }
      continue;
    }
    for (const name of marks.projects) add(`project:${name}`, name, record);
    if (record.entityType === "experience") {
      add(`experience:${record.entityId}`, record.title || record.entityId, record);
    }
  }
  return [...candidates.values()];
}

const PROPOSITION_STOPWORDS = new Set([
  "kaan", "kaanin", "balci", "balcinin", "biliyor", "bilir", "know", "knows",
  "does", "did", "has", "have", "had", "worked", "calismis", "calisti", "uzerinde",
  "deneyimi", "deneyim", "experience", "sahip", "gelistirdi", "gelistirmis", "developed",
  "built", "created", "made", "yapti", "yapmis", "with", "icin", "olan", "olarak", "midir", "mudur", "musun",
  "miydi", "what", "which", "this", "that", "customer", "musteri", "var", "exists",
  "a", "an", "the", "of", "for", "to", "from", "as", "about", "his", "her", "their",
  "hat", "ist", "sind", "war", "kann", "konnte", "verwendet", "kennt",
  "tiene", "puede", "esta", "utiliza", "sabe", "son",
  "est", "sont", "peut", "utilise", "connait", "que",
]);

function propositionTerms(question) {
  return [...new Set(tokenize(foldQuestion(question))
    .filter((word) => (word.length >= 3 || /^(?:ai|ml|c#|f#|go|r)$/.test(word)) && !PROPOSITION_STOPWORDS.has(word))
    .filter((word) => !/^(?:and|ve|ile|mi|mu|mı|mü|yes|no)$/.test(word)))];
}

const FACT_REQUEST_BOILERPLATE = /^(?:use\w*|using|tell\w*|say\w*|show\w*|about|which|what|where|when|how|who|whose|ne|hangi|nedir|nelerdir|kullan\w*|kullaniyor\w*|kullandi\w*|anlat\w*|soyle\w*)$/;
const SEMANTIC_ACTION_PREDICATE = /^(?:creat\w*|develop\w*|build\w*|built|make|made|work\w*|calis\w*|gelistir\w*|yap\w*)$/;
const DATABASE_TECHNOLOGY = /\b(?:postgres(?:ql)?|mysql|sqlite|sql server|mongodb|mongo|redis|firebase|supabase|dynamodb|mariadb|oracle)\b/;

function factualPropositionTerms(question, strategy) {
  const entityTokens = [...new Set([
    ...(strategy?.activeProjects || []),
    ...(strategy?.activeOrganizations || []),
  ].flatMap((name) => tokenize(foldQuestion(name))))];
  const semanticActions = tokenize(foldQuestion(question)).filter((word) => SEMANTIC_ACTION_PREDICATE.test(word));
  return [...new Set([...propositionTerms(question), ...semanticActions])]
    .filter((word) => !entityTokens.some((token) => word === token || (token.length >= 4 && word.startsWith(token))))
    .filter((word) => !FACT_REQUEST_BOILERPLATE.test(word));
}

function isDefinitionIdentityRequest(question) {
  const text = foldQuestion(question);
  return /^(?:what|who) (?:is|are)\b/.test(text)
    || /\b(?:nedir|kimdir|ne demek|ne anlama gelir)\b/.test(text);
}

function recordCoversRequestedField(record, question, terms = null) {
  const folded = foldQuestion(question);
  const text = recordSearchText(record);
  const stack = [
    ...(Array.isArray(record?.metadata?.stack) ? record.metadata.stack : []),
    ...(record?.tags || []),
  ].map(foldQuestion).join(" ");
  if (/\b(?:database|db|veritabani\w*)\b/.test(folded)) {
    return DATABASE_TECHNOLOGY.test(stack)
      || /(?:^|\n)(?:Database|Databases):/im.test(String(record?.text || ""));
  }
  if (/\b(?:cloud provider|hosting provider|hosted|hosts|barindir\w*|bulut saglayici\w*)\b/.test(folded)) {
    return String(record?.text || "")
      .split(/[.!?;\n]+/)
      .map(foldQuestion)
      .some((clause) => /\b(?:host\w*|deploy\w*|barindir\w*)\b/.test(clause)
        && /\b(?:cloud|provider|vercel|railway|aws|azure|gcp|google cloud)\b/.test(clause));
  }
  if (/\b(?:stack\w*|teknoloji\w*|technolog\w*)\b/.test(folded)) {
    return Boolean(record?.metadata?.stack?.length)
      || /(?:^|\n)(?:Technologies|Skills):/im.test(String(record?.text || ""));
  }
  if (/\b(?:purpose|summary|amac\w*|ne ise yar\w*)\b/.test(folded)) {
    return /(?:^|\n)(?:Summary|Purpose|Category):/im.test(String(record?.text || ""));
  }
  if (/\b(?:status|durum\w*)\b/.test(folded)) return /(?:^|\n)Status:/im.test(String(record?.text || ""));
  if (/\b(?:role|rol\w*)\b/.test(folded)) return /(?:^|\n)Role:/im.test(String(record?.text || ""));
  return Array.isArray(terms) && terms.length > 0 && terms.every((term) => hasPhrase(text, term));
}

const COMPOSITION_BOILERPLATE = /^(?:[2-9]|two|three|four|five|six|seven|eight|nine|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|hangisi\w*|which|welch\w*|cual\w*|lequel\w*|daha|more|most|mehr|mas|plus|en|gore|acisindan|bakimindan|terms|according|nach|segun|selon|arasinda\w*|between|among|ana|main|fark\w*|differ\w*|ortak\w*|common|karsilastir\w*|compare\w*|vergleich\w*|compara\w*|comparer\w*|sirala\w*|rank\w*|rang\w*|clasifica\w*|classer\w*|sec\w*|choose\w*|pick\w*|select\w*|demonstrate\w*|goster\w*|soyle\w*|say\w*|tell\w*|show\w*|best|top|guclu\w*|strong\w*|stark\w*|fuerte\w*|fort\w*|yuksek\w*|higher|hoher\w*|mayor\w*|eleve\w*|proje\w*|project\w*|projekt\w*|proyecto\w*|projet\w*|deneyim\w*|experience\w*|erfahrung\w*|experiencia\w*|sirket\w*|compan\w*|employer\w*|unternehmen\w*|empresa\w*|entreprise\w*|first|second|third|ilk\w*|birinci\w*|ikinci\w*|ucuncu\w*)$/;

function compositionCriterionTerms(question, strategy) {
  const entityTokens = [...new Set([
    ...(strategy?.activeProjects || []),
    ...(strategy?.activeOrganizations || []),
  ].flatMap((name) => tokenize(foldQuestion(name))))];
  const belongsToEntity = (word) => entityTokens.some((token) => word === token
    || (token.length >= 4 && word.startsWith(token)));
  return propositionTerms(question)
    .filter((word) => !belongsToEntity(word))
    .filter((word) => !COMPOSITION_BOILERPLATE.test(word));
}

function recordCoversTerms(record, terms) {
  const text = recordSearchText(record);
  return terms.every((term) => hasPhrase(text, term));
}

function recordCoversTermsTogether(record, terms) {
  return String(record?.text || "")
    .split(/[.!?;\n]+/)
    .map(foldQuestion)
    .filter(Boolean)
    .some((clause) => terms.every((term) => hasPhrase(clause, term)));
}

function actionPredicateFamily(token) {
  if (/^(?:creat\w*)$/.test(token)) return "create";
  if (/^(?:develop\w*|gelistir\w*)$/.test(token)) return "develop";
  if (/^(?:build\w*|built|make|made|yap\w*)$/.test(token)) return "build";
  if (/^(?:work\w*|calis\w*)$/.test(token)) return "work";
  return null;
}

function requestedRelationShape(question, strategy) {
  const tokens = tokenize(foldQuestion(question));
  const predicateIndex = tokens.findIndex((token) => actionPredicateFamily(token));
  if (predicateIndex < 0) return null;
  const predicate = actionPredicateFamily(tokens[predicateIndex]);
  const targets = [
    ...(strategy?.activeProjects || []).map((name) => ({ type: "project", tokens: tokenize(foldQuestion(name)) })),
    ...(strategy?.activeOrganizations || []).map((name) => ({ type: "organization", tokens: tokenize(foldQuestion(name)) })),
  ];
  const typedTargets = targets.filter((target) => target.tokens.length);
  const targetTokens = new Set(typedTargets.flatMap((target) => target.tokens));
  const actorNoise = /^(?:has|have|had|did|does|do|was|were|is|are|the|a|an|his|her|their|its|who|whom|kim|tarafindan)$/;
  const byIndex = tokens.findIndex((token, index) => index > predicateIndex && /^(?:by|tarafindan)$/.test(token));
  const requestedTargetSpans = typedTargets.flatMap((target) => {
    const spans = [];
    for (let index = 0; index <= tokens.length - target.tokens.length; index += 1) {
      const prefixMatches = target.tokens.slice(0, -1)
        .every((token, offset) => tokens[index + offset] === token);
      if (!prefixMatches) continue;
      const expectedLast = target.tokens.at(-1);
      const actualLast = tokens[index + target.tokens.length - 1];
      const suffix = actualLast === expectedLast
        ? null
        : ["da", "de", "ta", "te"].find((ending) => actualLast === `${expectedLast}${ending}`) || null;
      if (actualLast === expectedLast || suffix) {
        spans.push({ start: index, end: index + target.tokens.length, type: target.type, suffix });
      }
    }
    return spans;
  });
  const requestedTarget = [...requestedTargetSpans]
    .sort((left, right) => Math.abs(left.start - predicateIndex) - Math.abs(right.start - predicateIndex))[0] || null;
  const actorSlice = byIndex >= 0
    ? tokens.slice(byIndex + 1)
    : requestedTarget && requestedTarget.start < predicateIndex
      ? tokens.slice(0, requestedTarget.start)
      : tokens.slice(0, predicateIndex);
  const actor = actorSlice.filter((token) => !actorNoise.test(token) && !targetTokens.has(token));
  const rawWorkComplement = predicate === "work" && requestedTarget
    ? requestedTarget.suffix
      ? requestedTarget.type === "organization" ? "at" : "on"
      : (requestedTarget.start > predicateIndex
          ? tokens.slice(predicateIndex + 1, requestedTarget.start)
          : tokens.slice(requestedTarget.end, predicateIndex))
        .find((token) => !/^(?:the|a|an)$/.test(token)) || null
    : null;
  const workComplement = /^(?:ile)$/.test(rawWorkComplement || "")
    ? "with"
    : /^(?:uzerinde|uzerine)$/.test(rawWorkComplement || "")
      ? "on"
      : rawWorkComplement;
  const participantBoundary = predicateIndex < requestedTarget?.start ? tokens.length : predicateIndex;
  const postTargetTokens = predicate === "work" && requestedTarget
    ? tokens.slice(requestedTarget.end, participantBoundary)
    : [];
  const participantConnectorIndex = postTargetTokens.findIndex((token) => /^(?:with|ile)$/.test(token));
  const participantAfterConnector = participantConnectorIndex >= 0
    ? postTargetTokens.slice(participantConnectorIndex + 1)
    : [];
  const participantBeforeConnector = participantConnectorIndex > 0
    ? postTargetTokens.slice(0, participantConnectorIndex)
      .filter((token) => token !== rawWorkComplement && !/^(?:the|a|an)$/.test(token))
    : [];
  const participants = participantConnectorIndex >= 0
    ? [{
        connector: "with",
        tokens: participantAfterConnector.length ? participantAfterConnector : participantBeforeConnector,
      }].filter((participant) => participant.tokens.length)
    : [];
  const curatedActorAliases = (strategy?.actorAliases || [])
    .map((alias) => Array.isArray(alias) ? alias : tokenize(foldQuestion(alias)))
    .filter((alias) => alias.length);
  const parsedActorMatchesAlias = actor.length > 0 && curatedActorAliases.some((alias) =>
    alias.length === actor.length && alias.every((token, index) => token === actor[index]));
  const actorAliases = parsedActorMatchesAlias ? curatedActorAliases : actor.length ? [actor] : [];
  return Object.freeze({
    predicate,
    actor: Object.freeze(actor),
    actorAliases: Object.freeze(actorAliases.map((alias) => Object.freeze(alias))),
    requiresWhAgent: /^(?:who|whom|kim)\b/.test(foldQuestion(question)),
    workComplement,
    participants: Object.freeze(participants.map((participant) => Object.freeze({
      connector: participant.connector,
      tokens: Object.freeze(participant.tokens),
    }))),
    targets: Object.freeze(typedTargets.map((target) => Object.freeze({
      type: target.type,
      tokens: Object.freeze(target.tokens),
    }))),
    targetTokens: Object.freeze([...targetTokens]),
  });
}

function recordCoversBoundRelation(record, relation) {
  if (!relation) return false;
  const targetTokens = new Set(relation.targetTokens || []);
  const agentNoise = /^(?:source|entity|title|summary|evidence|technologies|skills|role|status|project|was|were|is|are|the|a|an|in|on|at|during|for|from|to|of|by|tarafindan)$/;
  const passiveBridge = /^(?:am|is|are|was|were|be|been|being|has|have|had)$/;
  const directObjectBridge = /^(?:the|a|an)$/;
  const subjectBridge = /^(?:am|is|are|was|were|be|been|being|has|have|had|do|does|did|will|would|can|could|may|might|must|should|that|to)$/;
  const actorAliases = relation.actorAliases?.length ? relation.actorAliases : [relation.actor || []];
  const sequenceAt = (words, alias, start) => alias.length > 0
    && alias.every((token, offset) => words[start + offset] === token);
  const endsWithActor = (words) => actorAliases.some((alias) =>
    words.length >= alias.length && sequenceAt(words, alias, words.length - alias.length));
  const startsWithActor = (words) => actorAliases.some((alias) => sequenceAt(words, alias, 0));
  const coordinatedActor = (words) => actorAliases.some((alias) => {
    for (let index = 0; index <= words.length - alias.length; index += 1) {
      if (!sequenceAt(words, alias, index)) continue;
      const before = words[index - 1] || "";
      const after = words[index + alias.length] || "";
      if (/^(?:and|ve)$/.test(before) || /^(?:and|ve)$/.test(after)) return true;
    }
    return false;
  });
  const localSubjectWords = (rawClause, words, predicateIndex) => {
    const segments = String(rawClause).split(",").map((segment) => tokenize(foldQuestion(segment)));
    if (segments.length > 1) {
      let offset = 0;
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (predicateIndex < offset + segment.length) {
          const local = segment.slice(0, predicateIndex - offset);
          return local.length ? local : segments[0];
        }
        offset += segment.length;
      }
    }
    const prefix = words.slice(0, predicateIndex);
    const relativeIndex = prefix.findIndex((token) => /^(?:that|which|who)$/.test(token));
    return relativeIndex >= 0 ? prefix.slice(0, relativeIndex) : prefix;
  };
  const targetSpans = (words) => (relation.targets || []).flatMap((target) => {
    const spans = [];
    for (let index = 0; index <= words.length - target.tokens.length; index += 1) {
      if (target.tokens.every((token, offset) => words[index + offset] === token)) {
        spans.push({ start: index, end: index + target.tokens.length, type: target.type });
      }
    }
    return spans;
  });
  const structuredProjectWork = relation.predicate === "work"
    && relation.workComplement === "on"
    && !(relation.participants || []).length
    && record?.source === "master-knowledge"
    && record?.entityType === "project"
    && typeof record?.metadata?.role === "string"
    && record.metadata.role.trim()
    && typeof record?.metadata?.owner === "string"
    && typeof record?.metadata?.project === "string"
    && actorAliases.some((alias) => {
      const owner = tokenize(foldQuestion(record.metadata.owner));
      return alias.length === owner.length && sequenceAt(owner, alias, 0);
    })
    && (relation.targets || []).some((target) => {
      if (target.type !== "project") return false;
      const project = tokenize(foldQuestion(record.metadata.project));
      return project.length >= target.tokens.length && sequenceAt(project, target.tokens, 0);
    });
  if (structuredProjectWork) return true;

  return String(record?.text || "")
    .split(/[.!?;\n]+/)
    .map((raw) => ({ raw, clause: foldQuestion(raw) }))
    .filter(({ clause }) => clause && !/\b(?:not|never|no|degil|yapmadi|gelistirmedi|calismadi)\b/.test(clause))
    .some(({ raw, clause }) => {
      const words = tokenize(clause);
      const predicateIndex = words.findIndex((token) => actionPredicateFamily(token) === relation.predicate);
      if (predicateIndex < 0) return false;
      const byIndex = words.findIndex((token, index) => index > predicateIndex && /^(?:by|tarafindan)$/.test(token));
      const spans = targetSpans(words);
      const activeTargets = spans.filter(({ start, type }) => {
        if (start <= predicateIndex) return false;
        const bridge = words.slice(predicateIndex + 1, start);
        if (relation.predicate === "work") {
          const complement = bridge[0];
          const expected = type === "project" ? /^(?:on)$/ : /^(?:at|for)$/;
          return expected.test(complement || "")
            && (!relation.workComplement || complement === relation.workComplement)
            && bridge.slice(1).every((token) => directObjectBridge.test(token));
        }
        return bridge.every((token) => directObjectBridge.test(token));
      });
      const activeTarget = activeTargets.length > 0;
      const passiveTarget = spans.some(({ start, end }) => start <= 1
        && relation.predicate !== "work"
        && end <= predicateIndex
        && words.slice(0, start).every((token) => directObjectBridge.test(token))
        && words.slice(end, predicateIndex).length > 0
        && words.slice(end, predicateIndex).every((token) => passiveBridge.test(token)));
      if (!activeTarget && !passiveTarget) return false;
      const participantsCovered = !(relation.participants || []).length || activeTargets.some((target) => {
        const boundary = words.findIndex((token, index) =>
          index >= target.end && /^(?:and|but|then|ve|ama|ancak)$/.test(token));
        const tailEnd = boundary >= 0 ? boundary : words.length;
        return relation.participants.every((participant) => {
          for (let index = target.end; index < tailEnd; index += 1) {
            const connectorMatches = participant.connector === "with"
              ? /^(?:with|ile)$/.test(words[index])
              : words[index] === participant.connector;
            if (!connectorMatches) continue;
            const afterStart = index + 1;
            const beforeStart = index - participant.tokens.length;
            if ((afterStart + participant.tokens.length <= tailEnd
                  && sequenceAt(words, participant.tokens, afterStart))
                || (beforeStart >= target.end
                  && sequenceAt(words, participant.tokens, beforeStart))) return true;
          }
          return false;
        });
      });
      if (!participantsCovered) return false;

      const activeAgentWords = words.slice(0, predicateIndex);
      const passiveAgentWords = byIndex >= 0 ? words.slice(byIndex + 1) : [];
      if (relation.actor.length) {
        if (passiveTarget) {
          const localAgent = passiveAgentWords.filter((token) => !directObjectBridge.test(token));
          return startsWithActor(localAgent);
        }
        const localSubject = localSubjectWords(raw, words, predicateIndex)
          .filter((token) => !subjectBridge.test(token));
        return endsWithActor(localSubject) || coordinatedActor(localSubject);
      }
      if (!relation.requiresWhAgent) return true;
      const agentWords = passiveTarget ? passiveAgentWords : activeAgentWords;
      return agentWords.some((token) => !agentNoise.test(token) && !targetTokens.has(token) && !/^\d+$/.test(token));
    });
}

export function compositionSupportMetadata({ strategy, records = [], question = "", affinity = new Map() }) {
  const intent = strategy?.compositionIntent;
  if (!["comparison", "ranking"].includes(intent)) return null;
  const criteria = compositionCriterionTerms(question, strategy);
  const targets = [...new Set([
    ...(strategy.activeProjects || []),
    ...(strategy.activeOrganizations || []),
  ])];
  const broadFamilies = strategy.framedTypes || [];
  const ambiguousBroadRanking = intent === "ranking" && !targets.length && broadFamilies.length !== 1;
  const candidates = targets.length
    ? targets.map((name) => ({
        name,
        records: records.filter((record) => recordSupportsNamedEntity(record, name, affinity)),
      }))
    : ambiguousBroadRanking
      ? []
      : broadCompositionCandidates(records, affinity, broadFamilies);
  const supportedCandidates = candidates
    .filter((candidate) => candidate.records.length
      && (!criteria.length || candidate.records.some((record) => recordCoversTerms(record, criteria))))
    .map((candidate) => candidate.name);
  return Object.freeze({
    intent,
    named: targets.length > 0,
    requiredCount: intent === "ranking" ? strategy.requestedCount || 2 : 2,
    criteria: Object.freeze([...criteria]),
    eligibleCandidates: Object.freeze(candidates.map((candidate) => candidate.name)),
    supportedCandidates: Object.freeze(supportedCandidates),
  });
}

/**
 * Calibrates what the selected evidence can justify. UNKNOWN deliberately does
 * not mean corpus absence: retrieval is a bounded view, not a corpus audit.
 * ABSENT is reserved for a caller that has independently established absence.
 */
export function assessEvidenceSupport({ strategy, records = [], question = "", affinity = new Map() }) {
  if (!strategy || strategy.expectedScope === "GENERAL") return EVIDENCE_SUPPORT.NOT_APPLICABLE;
  if (!records.length) {
    return strategy.corpusAbsenceEstablished ? EVIDENCE_SUPPORT.ABSENT : EVIDENCE_SUPPORT.UNKNOWN;
  }

  const targets = [...new Set([
    ...(strategy.activeProjects || []),
    ...(strategy.activeOrganizations || []),
  ])];
  if (strategy.compositionIntent === "comparison") {
    const support = compositionSupportMetadata({ strategy, records, question, affinity });
    if (support.eligibleCandidates.length < 2) {
      return support.eligibleCandidates.length ? EVIDENCE_SUPPORT.PARTIAL : EVIDENCE_SUPPORT.UNKNOWN;
    }
    return support.supportedCandidates.length === support.eligibleCandidates.length
      ? EVIDENCE_SUPPORT.SUPPORTED
      : EVIDENCE_SUPPORT.PARTIAL;
  }

  if (strategy.compositionIntent === "ranking") {
    const support = compositionSupportMetadata({ strategy, records, question, affinity });
    return support.supportedCandidates.length >= support.requiredCount
      ? EVIDENCE_SUPPORT.SUPPORTED
      : EVIDENCE_SUPPORT.PARTIAL;
  }
  if (strategy.compositionIntent === "summary") {
    const distinct = distinctEvidenceEntities(records, affinity);
    return distinct >= (targets.length || 2) ? EVIDENCE_SUPPORT.SUPPORTED : EVIDENCE_SUPPORT.PARTIAL;
  }
  /* Recruiter fit is an evidence-backed assessment even when the visitor uses
   * a yes/no-shaped sentence. Calibrate the selected role-family evidence as
   * an assessment before ordinary factual proposition verification. */
  if (isRecruiterFitAssessment(strategy)) {
    const distinct = distinctEvidenceEntities(records, affinity);
    return distinct >= 2 ? EVIDENCE_SUPPORT.SUPPORTED : EVIDENCE_SUPPORT.PARTIAL;
  }
  if (strategy.directYesNo) {
    const structurallyRelevant = targets.length
      ? records.filter((record) => targets.some((target) => recordSupportsNamedEntity(record, target, affinity)))
      : records;
    const coveredTargets = targets.filter((target) => structurallyRelevant
      .some((record) => recordSupportsNamedEntity(record, target, affinity))).length;
    if (targets.length && coveredTargets < targets.length) {
      return coveredTargets ? EVIDENCE_SUPPORT.PARTIAL : EVIDENCE_SUPPORT.UNKNOWN;
    }
    const terms = targets.length
      ? factualPropositionTerms(question, strategy)
      : propositionTerms(question);
    const relation = targets.length ? requestedRelationShape(question, strategy) : null;
    const relationBound = /\b(?:ile|with|using|mit|con|avec)\b/.test(foldQuestion(question));
    const supportsWholeProposition = (record) => relation
      ? recordCoversBoundRelation(record, relation)
      : relationBound
        ? recordCoversTermsTogether(record, terms)
        : recordCoversTerms(record, terms);
    if (terms.length && structurallyRelevant.some(supportsWholeProposition)) {
      return EVIDENCE_SUPPORT.SUPPORTED;
    }
    const matched = terms.filter((term) => structurallyRelevant
      .some((record) => hasPhrase(recordSearchText(record), term))).length;
    if (matched || coveredTargets) return EVIDENCE_SUPPORT.PARTIAL;
    return strategy.corpusAbsenceEstablished ? EVIDENCE_SUPPORT.ABSENT : EVIDENCE_SUPPORT.UNKNOWN;
  }
  if (targets.length) {
    const relevantByTarget = targets.map((target) => records
      .filter((record) => recordSupportsNamedEntity(record, target, affinity)));
    const covered = relevantByTarget.filter((items) => items.length).length;
    if (covered === targets.length) {
      const terms = factualPropositionTerms(question, strategy);
      if (!terms.length && isDefinitionIdentityRequest(question)) return EVIDENCE_SUPPORT.SUPPORTED;
      if (!terms.length) return EVIDENCE_SUPPORT.PARTIAL;
      const relation = requestedRelationShape(question, strategy);
      if (relation) {
        return relevantByTarget.every((items) => items.some((record) => recordCoversBoundRelation(record, relation)))
          ? EVIDENCE_SUPPORT.SUPPORTED
          : EVIDENCE_SUPPORT.PARTIAL;
      }
      return relevantByTarget.every((items) => items.some((record) => recordCoversRequestedField(record, question, terms)))
        ? EVIDENCE_SUPPORT.SUPPORTED
        : EVIDENCE_SUPPORT.PARTIAL;
    }
    if (covered) return EVIDENCE_SUPPORT.PARTIAL;
    return EVIDENCE_SUPPORT.UNKNOWN;
  }
  const distinct = distinctEvidenceEntities(records, affinity);
  if (strategy.recruiter) {
    return distinct >= 2 ? EVIDENCE_SUPPORT.SUPPORTED : EVIDENCE_SUPPORT.PARTIAL;
  }
  return EVIDENCE_SUPPORT.SUPPORTED;
}

/**
 * Curates compact UI evidence from the records the answer was allowed to use.
 * Raw retrieval stays separate; duplicate chunks and duplicate logical entities
 * cannot become duplicate cards.
 */
export function selectEvidenceRecords({ strategy, records = [], affinity = new Map(), answer = "" }) {
  if (!strategy || strategy.expectedScope === "GENERAL" || strategy.evidenceLimit === 0) return [];
  if (!strategy.recruiter
      && (ABSENCE_CLAIM.test(answer) || IGNORANCE_CLAIM.test(answer))
      && ![EVIDENCE_SUPPORT.SUPPORTED, EVIDENCE_SUPPORT.PARTIAL].includes(strategy.evidenceSupport)) return [];
  const activeProjects = strategy.activeProjects || [];
  const activeOrganizations = strategy.activeOrganizations || [];
  let candidates = records.filter((item) => item && item.visibility !== "public_on_request");

  if (strategy.mode === ANSWER_MODES.COMPARISON && (activeProjects.length || activeOrganizations.length)) {
    candidates = candidates.filter((item) => {
      const marks = marksFor(item, affinity);
      return marks.projects.some((name) => activeProjects.includes(name))
        || marks.organizations.some((name) => activeOrganizations.includes(name));
    });
  } else if (strategy.mode === ANSWER_MODES.PORTFOLIO_PROJECT && activeProjects.length) {
    candidates = candidates.filter((item) => marksFor(item, affinity).projects.some((name) => activeProjects.includes(name)));
  } else if (strategy.mode === ANSWER_MODES.PORTFOLIO_EXPERIENCE && activeOrganizations.length) {
    candidates = candidates.filter((item) => marksFor(item, affinity).organizations.some((name) => activeOrganizations.includes(name)));
  } else if (strategy.mode === ANSWER_MODES.PORTFOLIO_EXPERIENCE && strategy.experienceFocus === "internship") {
    candidates = candidates.filter((item) => {
      const text = foldQuestion([item.title, ...(item.tags || []), item.metadata?.role].filter(Boolean).join(" "));
      return item.entityType === "experience" && phraseIn(text, ["intern", "internship", "staj", "stajyer"]);
    });
  } else if (strategy.mode === ANSWER_MODES.PORTFOLIO_EXPERIENCE) {
    candidates = candidates.filter((item) => item.entityType === "experience");
  }

  /* Dated implementation notes are useful retrieval diagnostics, not the best
   * UI card when a canonical entity record exists. */
  const withoutBuildLog = candidates.filter((item) => item.source !== "build-log");
  if (withoutBuildLog.length) candidates = withoutBuildLog;
  candidates = [...candidates].sort(evidenceSort({ ...strategy, activeProjects, activeOrganizations }, affinity));

  const answerFolded = foldQuestion(answer);
  if (answerFolded && strategy.recruiter) {
    const named = candidates.filter((item) => {
      const marks = marksFor(item, affinity);
      return [...marks.projects, ...marks.organizations].some((name) => hasPhrase(answerFolded, foldQuestion(name)));
    });
    if (named.length) {
      const namedIds = new Set(named.map((item) => item.id));
      candidates = [...named, ...candidates.filter((item) => !namedIds.has(item.id))];
    }
  }

  const selected = [];
  const keys = new Set();
  for (const item of candidates) {
    const key = logicalEvidenceKey(item, affinity);
    if (keys.has(key)) continue;
    keys.add(key);
    selected.push(item);
    if (selected.length >= strategy.evidenceLimit) break;
  }
  return selected;
}

function canonicalLinks(item) {
  const links = Array.isArray(item?.metadata?.links) ? item.metadata.links : [];
  return links
    .map((link) => ({
      kind: String(link?.type || "link").slice(0, 32),
      url: String(link?.url || "").trim(),
    }))
    .filter((link) => /^(?:https?:\/\/|mailto:)/i.test(link.url))
    .slice(0, 3);
}

export function serializeSelectedEvidence(records) {
  return (records || []).map((item) => ({
    id: item.id,
    source: item.source,
    entityId: item.entityId,
    type: item.entityType || "record",
    title: item.title,
    summary: String(item.text || "")
      .split("\n")
      .find((line) => !/^(?:source|entity|title):/i.test(line.trim()))
      ?.trim()
      .slice(0, 320) || "",
    links: canonicalLinks(item),
  }));
}

/**
 * The scope a strategy expects is already decided before generation, so the
 * prompt states it instead of leaving the model to re-derive it from the
 * question. Without this line a 4B model reads an assessment question — why
 * should we hire him? — as a request for advice and labels a perfectly
 * grounded PORTFOLIO answer GENERAL. The validator then discards a good draft
 * over its first line, and since the repair attempt re-derives the same label
 * the turn always lands in the fallback. Naming the required scope is cheaper
 * than repairing it and leaves the guard exactly as strict.
 */
function scopeContractLine(strategy) {
  return strategy?.expectedScope
    ? `The first line must be exactly: SCOPE: ${strategy.expectedScope}`
    : "";
}

function evidenceSupportInstruction(strategy) {
  const support = strategy?.evidenceSupport;
  if (!support || support === EVIDENCE_SUPPORT.NOT_APPLICABLE) return "";
  if (support === EVIDENCE_SUPPORT.SUPPORTED) {
    return "The supplied evidence supports a direct synthesis. Combine facts across records when needed; the exact answer need not appear verbatim in one record.";
  }
  if (support === EVIDENCE_SUPPORT.PARTIAL) {
    return "The supplied evidence is partial. Give the supported portion, qualify the conclusion, and name the unresolved part without claiming the whole portfolio is silent.";
  }
  if (support === EVIDENCE_SUPPORT.ABSENT) {
    return "A full canonical check established that the requested evidence is absent. State that narrowly and do not substitute unrelated facts.";
  }
  return "The bounded retrieval did not establish the answer. Say the available evidence is insufficient; never turn a retrieval miss into a claim that the whole portfolio lacks the information.";
}

function compositionInstruction(strategy) {
  if (strategy?.compositionIntent === "ranking") {
    return "Rank only the supplied candidates against the user's stated criterion. Explain the criterion and evidence for each selection; never imply a universal or permanent ordering. If coverage is partial, order only candidates established for that criterion and identify the omitted coverage gap.";
  }
  if (strategy?.compositionIntent === "summary") {
    return "Synthesize the supplied records into a useful summary of recurring work, outcomes and technical themes instead of listing record titles or requiring one record to contain the summary verbatim.";
  }
  if (strategy?.compositionIntent === "comparison") {
    const named = strategy?.compositionSupport?.named
      ?? Boolean((strategy?.activeProjects || []).length + (strategy?.activeOrganizations || []).length);
    return named
      ? "Build the comparison across the separate records for each validated named target. Preserve the user's entity order and do not invent a winner unless the question supplies a criterion. With partial coverage, describe supported sides separately and do not assert a cross-side winner."
      : "Build the comparison only across supported retrieved canonical candidates from the requested record family. Do not treat unrelated cross-cutting records as comparison sides. With partial coverage, describe supported candidates separately and do not assert a cross-side winner.";
  }
  return "";
}

function directAnswerInstruction(strategy) {
  if (!strategy?.directYesNo || strategy.recruiter) return "";
  if (strategy.evidenceSupport === EVIDENCE_SUPPORT.SUPPORTED) {
    return "This is a direct yes/no question with clear support. Begin the answer with Yes/No (or the locale equivalent), then give concise evidence.";
  }
  return "This is a direct yes/no question without complete support. Do not guess Yes or No; state that the available evidence is insufficient and explain what is supported.";
}

export function answerStrategyPrompt(strategy) {
  if (!strategy) return "Answer directly and concisely.";
  if (strategy.expectedScope === "GENERAL") {
    const instruction = strategy.mode === ANSWER_MODES.SELF
      ? "Describe Ajoop accurately as Kaan's local-model portfolio copilot. State plainly, never hypothetically, that you have no web or live-data access, and expose no private infrastructure details."
      : "Answer the general question normally and helpfully from ordinary world knowledge. Do not mention Kaan or recruiting.";
    return [
      `Answer strategy: ${strategy.mode}.`,
      instruction,
      scopeContractLine(strategy),
    ].filter(Boolean).join("\n");
  }
  if (strategy.recruiter) {
    const synthesisInstruction = isRecruiterFitAssessment(strategy)
      ? "Give the bottom line first. Use two to four concrete evidence points as transferable evidence, not as direct experience in the requested role. End with one interview validation point phrased as something to confirm; do not describe missing portfolio content."
      : "Give the bottom line first. Use two to four concrete evidence points, name the best-fit work, state one real gap or unknown, and end with a calibrated conclusion.";
    const gapInstruction = isRecruiterFitAssessment(strategy)
      ? "Assess transferability to the requested role from the supplied evidence. Unless a supplied record explicitly names that role, do not use 'direct experience', 'doğrudan deneyim' or label his experience, work or systems with the requested role name; describe only the recorded work, then assess its transferability. The gap sentence must say what an interview should validate or confirm. Do not say there is 'no explicit record', 'no direct information', an 'information gap', or that the portfolio or records do not show, record, specify, contain or lack the capability. Do not use scalable, production-grade, enterprise-scale, senior-level or expert anywhere, including in the validation point, unless a supplied record states that exact strength. Prefer concrete recorded facts over engineering adjectives."
      : "State unknowns as what the portfolio does not show. Prefer concrete recorded facts over engineering adjectives.";
    const focus = {
      [ANSWER_MODES.RECRUITER_GAPS]: "Focus on evidence-backed gaps, unknowns and where mentorship would help. Never invent a personal weakness.",
      [ANSWER_MODES.RECRUITER_RISK]: "State what a careful hiring manager should validate, based only on thin or absent portfolio evidence.",
      [ANSWER_MODES.RECRUITER_DIFFERENTIATION]: "Explain the evidence-backed combination that differentiates him; do not merely list languages.",
      [ANSWER_MODES.RECRUITER_BEST_ROLE]: "Name the strongest role family and explain why, then name the main growth area.",
      [ANSWER_MODES.RECRUITER_ENVIRONMENT]: "Describe the work environment supported by the evidence, not personality speculation.",
      [ANSWER_MODES.RECRUITER_EVIDENCE]: "Answer with the concrete records that support the earlier assessment.",
      [ANSWER_MODES.RECRUITER_STRENGTHS]: "Prioritize two to four demonstrated strengths and tie each to concrete evidence.",
      [ANSWER_MODES.RECRUITER_HIRE]: "Explain what he could bring and the main unknown; never issue a definite hiring verdict.",
      [ANSWER_MODES.RECRUITER_FIT]: "Give a calibrated fit assessment for the requested role and the main evidence gap.",
    }[strategy.mode];
    return [
      `Answer strategy: ${strategy.mode}; role family: ${strategy.roleFamily}.`,
      synthesisInstruction,
      "Stay under 120 words and four complete sentences.",
      "Separate recorded facts from your assessment. Never claim certainty, invent a percentage, or imply guaranteed success.",
      gapInstruction,
      "Exposure, a role title or enterprise work never establishes scalable / ölçeklenebilir, production-grade, enterprise-scale, senior-level or expert. Claim only the strength the records state.",
      focus,
      compositionInstruction(strategy),
      evidenceSupportInstruction(strategy),
      scopeContractLine(strategy),
    ].filter(Boolean).join("\n");
  }
  const namedComparison = strategy?.compositionSupport?.named
    ?? Boolean((strategy?.activeProjects || []).length + (strategy?.activeOrganizations || []).length);
  const prompts = {
    [ANSWER_MODES.GENERAL]: "Answer the general question normally and helpfully. Do not mention Kaan, recruiting or the portfolio, and do not attach portfolio evidence.",
    [ANSWER_MODES.PORTFOLIO_PROJECT]: "Answer the named project question directly from its records. If a requested stack or field is present, state it without first claiming it is missing.",
    [ANSWER_MODES.PORTFOLIO_EXPERIENCE]: "Answer from the matching experience records. Preserve company names, role titles, dates and metrics exactly.",
    [ANSWER_MODES.COMPARISON]: namedComparison
      ? "Compare only the validated named targets using their separate records; no single record needs to contain the whole comparison."
      : "Compare only the supported retrieved canonical candidates from the requested record family; no single record needs to contain the whole comparison.",
    [ANSWER_MODES.SELF]: "Describe Ajoop accurately as Kaan's local-model portfolio copilot. State plainly, never hypothetically, that you have no web or live-data access, and expose no private infrastructure details.",
    [ANSWER_MODES.FOLLOW_UP]: "Answer the immediate follow-up using its bounded conversation and active entity only.",
    [ANSWER_MODES.PORTFOLIO_FACT]: "Answer directly from the supplied portfolio records. If support is genuinely absent, say exactly what the portfolio does not verify and do not substitute unrelated facts.",
  };
  return [
    `Answer strategy: ${strategy.mode}.`,
    prompts[strategy.mode] || "Answer directly and concisely.",
    compositionInstruction(strategy),
    evidenceSupportInstruction(strategy),
    directAnswerInstruction(strategy),
    scopeContractLine(strategy),
  ].filter(Boolean).join("\n");
}

export function repairPrompt(flags, strategy) {
  const fitGapRepair = isRecruiterFitAssessment(strategy)
    && (flags || []).some((flag) => ["evidence-contradiction", "unproven-corpus-absence"].includes(flag));
  const fitStrengthRepair = isRecruiterFitAssessment(strategy)
    && (flags || []).includes("unsupported-strength");
  return [
    `The previous draft was rejected (${(flags || []).join(", ") || "invalid output"}).`,
    (flags || []).includes("scope-mismatch") && strategy?.expectedScope
      ? `The rejected draft used the wrong scope. The first line must be exactly: SCOPE: ${strategy.expectedScope}`
      : "",
    "Write a fresh answer from the same records. Do not quote or discuss the rejected draft.",
    "Use exactly one SCOPE line and one ANSWER line. No reasoning, labels, repetition or text after the answer.",
    "Answer directly; never claim a recorded field is absent when the supplied records contain it.",
    (flags || []).includes("unsupported-strength")
      ? "Remove unsupported strength claims. Claim only the strength the records state, and do not swap in another qualifier."
      : "",
    fitStrengthRepair
      ? "Keep the interview validation point neutral: do not use scalable, production-grade, enterprise-scale, senior-level or expert there."
      : "",
    (flags || []).includes("unsupported-target-role-experience")
      ? "Do not claim direct experience in the requested role. Describe the recorded work and assess its transferability to the role."
      : "",
    (flags || []).includes("unproven-corpus-absence")
      ? "Do not claim the whole portfolio lacks information merely because the bounded retrieval did not establish it. Describe evidence sufficiency instead."
      : "",
    fitGapRepair
      ? "Rewrite the gap as an interview validation point. Do not say that the portfolio or records do not show, record, specify or contain the capability."
      : "",
    (flags || []).includes("unsupported-binary")
      ? "Do not guess a Yes/No conclusion. State that the available evidence is insufficient, then mention only the supported portion."
      : "",
    (flags || []).includes("overconfident-partial-composition")
      ? "The evidence is partial. Remove absolute certainty and limit the synthesis to what the supplied records establish."
      : "",
    answerStrategyPrompt(strategy),
  ].filter(Boolean).join("\n");
}

function normalizedBlock(value) {
  return foldQuestion(value).replace(/\s+/g, " ").trim();
}

export function detectAnswerRepetition(answer) {
  const text = String(answer || "").trim();
  if (!text) return "empty-answer";
  const paragraphs = text.split(/\n\s*\n/).map(normalizedBlock).filter((item) => item.length >= 24);
  if (new Set(paragraphs).size !== paragraphs.length) return "repeated-paragraph";

  const sentences = text.split(/(?<=[.!?])\s+/).map(normalizedBlock).filter((item) => tokenize(item).length >= 5);
  if (new Set(sentences).size !== sentences.length) return "repeated-sentence";
  const sentenceSets = sentences.map((sentence) => new Set(tokenize(sentence)));
  for (let left = 0; left < sentenceSets.length; left += 1) {
    for (let right = left + 1; right < sentenceSets.length; right += 1) {
      const smaller = sentenceSets[left].size <= sentenceSets[right].size ? sentenceSets[left] : sentenceSets[right];
      const larger = smaller === sentenceSets[left] ? sentenceSets[right] : sentenceSets[left];
      const overlap = [...smaller].filter((word) => larger.has(word)).length;
      if (overlap >= 5 && overlap / smaller.size >= 0.78) return "near-repeated-sentence";
    }
  }

  const words = tokenize(normalizedBlock(text));
  const phrases = new Map();
  for (let index = 0; index <= words.length - 5; index += 1) {
    const phrase = words.slice(index, index + 5).join(" ");
    phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    if (phrases.get(phrase) >= 3) return "repeated-phrase";
  }
  return null;
}

const META_REASONING = /\b(?:i need to (?:analy[sz]e|decide|determine)|the user is asking|let me (?:analy[sz]e|reason)|analysis:|reasoning:)\b/i;
const ABSENCE_CLAIM = /(?:(?:portfolio|supplied records?|available records?|provided records?|supplied [^.!?]{0,30} records?) (?:does not|do not|doesn't|don't) (?:record|specify|contain|identify|establish)|not explicitly (?:specified|recorded)|portfolyoda[^.!?]{0,80}(?:kayit yok|kayıt yok|belirtilmemis|belirtilmemiş|yer almiyor|yer almıyor)|(?:nicht|pas|no) [^.!?]{0,50}(?:angegeben|specifie|spécifié|especificado|registrado))/i;
const BOUNDED_EVIDENCE_ABSENCE = /\b(?:supplied|available|provided)\b[^.!?]{0,45}\brecords?\b[^.!?]{0,45}\b(?:does not|do not|doesn't|don't)\b/i;
const IGNORANCE_CLAIM = /\b(?:i do not know|i don't know|bilmiyorum|bilinmiyor|je ne sais pas|no lo se|no lo sé|ich weiss nicht|ich weiß nicht)\b/i;
const DEFINITE_RANK_ASSERTION = /(?:\branks? (?:first|second|third)\b|\b(?:is|are|was|were) (?:[a-z]+ ){0,2}(?:the )?(?:first|second|third|strongest|best|winner)\b|\b(?:en guclu|en iyi) (?:proje|project|deneyim|aday)\b[^.!?]{0,60}|\b(?:birinci|ikinci|ucuncu)(?:dir|tir)?\b|\b(?:ist|sind) (?:der|die|das)?\s*(?:starkste|erste|zweite|gewinner)\w*\b|\bliegt\b[^.!?]{0,50}\b(?:erste|zweite|dritte)\w*\s+stelle\b|\b(?:es|son) (?:el|la)?\s*(?:proyecto )?(?:mas fuerte|primero|segundo|ganador)\w*\b|\bocupa\b[^.!?]{0,50}\b(?:primer|segundo|tercer)\w*\s+lugar\b|\b(?:est|sont) (?:le|la)?\s*(?:projet )?(?:plus fort|premier|deuxieme|troisieme|gagnant)\w*\b|\boccupe\b[^.!?]{0,50}\b(?:premiere|deuxieme|troisieme)\w*\s+place\b)/i;
const DEFINITE_COMPARISON_ASSERTION = /(?:\b(?:wins?|beats?|outperforms?)\b|\b(?:more|less|better|worse|stronger|weaker|higher|lower)\b[^.!?]{0,100}\bthan\b|\b[a-z]+(?:dan|den|tan|ten)\b[^.!?]{0,100}\bdaha\b|\bdaha\b[^.!?]{0,100}\b(?:gore|nazaran|kiyasla)\b|\b(?:besser|schlechter|starker|schwacher|hoher|niedriger|[a-z]{4,}er)\b[^.!?]{0,100}\bals\b|\bmas\b[^.!?]{0,100}\bque\b|\bplus\b[^.!?]{0,100}\bque\b)/i;
function mentionedCompositionCandidates(answer, names = []) {
  const text = foldQuestion(answer);
  return names.filter((name) => hasPhrase(text, foldQuestion(name)));
}

function hasUnsafePartialComposition(answer, strategy) {
  const intent = strategy?.compositionIntent;
  const claimClauses = affirmativeClaimClauses(answer);
  const conclusionClauses = claimClauses.filter((clause) => intent === "ranking"
    ? DEFINITE_RANK_ASSERTION.test(clause)
    : DEFINITE_COMPARISON_ASSERTION.test(clause) || DEFINITE_RANK_ASSERTION.test(clause));
  if (!conclusionClauses.length) return false;
  const support = strategy?.compositionSupport;
  if (!support) return true;
  const mentioned = mentionedCompositionCandidates(conclusionClauses.join(" "), support.eligibleCandidates);
  return mentioned.length < 2
    || mentioned.some((name) => !support.supportedCandidates.includes(name));
}

/* A small recruiter-only risk screen, not a general factual verifier. Match
 * explicit strength phrases, not ordinary enterprise work or senior/expert
 * role names. EN/TR equivalents share support; negated claims, evidence gaps
 * and future learning needs neither trigger the guard nor establish support.
 * Turkish negation is a suffix, so -m(i|u)yor and -maz/-mez are read as denials. */
const STRONG_QUALIFIERS = Object.freeze([
  /\b(?:scalable|olceklenebilir)\b/,
  /\b(?:highly scalable|yuksek (?:olcude )?olceklenebilir)\b/,
  /\bproduction grade\b/,
  /\b(?:enterprise (?:scale|grade)|kurumsal olcekte)\b/,
  /\b(?:senior level|kidemli seviyesinde)\b/,
  /* Turkish softens the final k before a vowel suffix, so uzmanlık becomes
   * uzmanlığa/uzmanlığı once folded. Both spellings are the same claim. */
  /\b(?:deep expertise|derin uzmanli[kg][a-z]*)\b/,
  /\b(?:expert (?:in|at|proficiency)|(?:alaninda|konusunda) uzman[a-z]*)\b/,
  /\bextensive production ownership\b/,
]);
const CLAIM_UNESTABLISHED = /\b(?:not|never|no|cannot|can't|could not|unable|without|lacks?|missing|unknown|unresolved|insufficient|unverified|unproven|needs?|requires?|would need|should (?:learn|develop)|yok[a-z]*|degil[a-z]*|belirsiz[a-z]*|eksik[a-z]*|kanitlanmamis[a-z]*|belirtilmemis[a-z]*|belirleyem[a-z]*|gerekiyor|gerekir|gerekebilir|ihtiyac[a-z]*|bilinm[a-z]*|[a-z]{2,}m(?:[iu]yor|az|ez)[a-z]*)\b/;

function affirmativeClaimClauses(text) {
  return String(text || "")
    .split(/[.!?;,\n]+|\b(?:but|however|ancak|ama|fakat)\b/i)
    .map(foldQuestion)
    .filter((clause) => clause && !CLAIM_UNESTABLISHED.test(clause));
}

function hasUnsupportedStrength(answer, records) {
  const claims = affirmativeClaimClauses(answer);
  const support = (records || []).flatMap((record) => affirmativeClaimClauses(record.text));
  return STRONG_QUALIFIERS.some((qualifier) => claims.some((clause) => qualifier.test(clause))
    && !support.some((clause) => qualifier.test(clause)));
}

const DIRECT_EXPERIENCE_MARKER = /^(?:direct|directly|dogrudan)$/;
const EXPERIENCE_MARKER = /^(?:experience\w*|experienced|deneyim\w*|tecrube\w*)$/;
const RELEVANCE_MODIFIER = /^(?:relevant|related|transferable|adjacent|applicable|suitable)$/;
const EXPERIENCE_MODIFIER = /^(?:hands?|on|practical|professional|actual|real|world|technical|client|facing|substantial|extensive)$/;
const ROLE_BINDING_PREPOSITION = /^(?:in|as|within|doing|working)$/;

function mentionedTargetRoles(text, family) {
  const folded = foldQuestion(text);
  return TARGET_ROLE_IDENTITIES.filter((role) => role.family === family && phraseIn(folded, role.aliases));
}

function recordedTargetRoleIds(record) {
  if (record?.entityType !== "experience") return [];
  const canonicalRole = foldQuestion(String(record?.metadata?.role || "")).trim();
  if (!canonicalRole) return [];
  return TARGET_ROLE_IDENTITIES
    .filter((role) => role.aliases.some((alias) => foldQuestion(alias) === canonicalRole))
    .map((role) => role.id);
}

function targetRoleSpans(words, family) {
  const spans = [];
  for (const role of TARGET_ROLE_IDENTITIES.filter((candidate) => candidate.family === family)) {
    for (const alias of role.aliases) {
      const aliasWords = tokenize(foldQuestion(alias));
      for (let start = 0; start <= words.length - aliasWords.length; start += 1) {
        if (aliasWords.every((word, offset) => words[start + offset] === word)) {
          spans.push({ id: role.id, start, end: start + aliasWords.length });
        }
      }
    }
  }
  return spans;
}

const ROLE_RELATION_BOUNDARY = /^(?:and|but|however|while|ve|ama|ancak|fakat)$/;
const EXPERIENCE_SUBJECT = /^(?:kaan|he|his|him|kendisi|onun)$/;
const ROLE_COMPLEMENT_PREFIX = /^(?:a|an|the|as|in|within)$/;

function hasExperienceSubject(words, nucleusStart) {
  return words.slice(0, nucleusStart).some((word) => EXPERIENCE_SUBJECT.test(word));
}

function directlyAttributedTargetRoleIds(words, family, requestedRoles = []) {
  const directIndexes = words.flatMap((word, index) => DIRECT_EXPERIENCE_MARKER.test(word) ? [index] : []);
  const experienceIndexes = words.flatMap((word, index) => EXPERIENCE_MARKER.test(word) ? [index] : []);
  const spans = targetRoleSpans(words, family);
  const boundRoleIds = new Set();
  for (const directIndex of directIndexes) {
    for (const experienceIndex of experienceIndexes) {
      let directExperienceRelation = false;
      const nucleusStart = Math.min(directIndex, experienceIndex);
      const nucleusEnd = Math.max(directIndex, experienceIndex);
      if (directIndex < experienceIndex) {
        const between = words.slice(directIndex + 1, experienceIndex);
        directExperienceRelation = between.length <= 4
          && !between.some((word) => RELEVANCE_MODIFIER.test(word))
          && (between.every((word) => EXPERIENCE_MODIFIER.test(word))
            || mentionedTargetRoles(between.join(" "), family).length > 0);
      } else if (directIndex > experienceIndex && directIndex - experienceIndex <= 3) {
        const afterDirect = words.slice(directIndex + 1);
        directExperienceRelation = ROLE_BINDING_PREPOSITION.test(afterDirect[0] || "")
          && mentionedTargetRoles(afterDirect.slice(1).join(" "), family).length > 0;
      }
      if (!directExperienceRelation || !hasExperienceSubject(words, nucleusStart)) continue;

      spans
        .filter((span) => span.start > directIndex && span.end <= experienceIndex)
        .forEach((span) => boundRoleIds.add(span.id));

      const postStart = nucleusEnd + 1;
      if (ROLE_BINDING_PREPOSITION.test(words[postStart] || "")) {
        spans
          .filter((span) => span.start >= postStart + 1)
          .filter((span) => words.slice(postStart + 1, span.start)
            .every((word) => ROLE_COMPLEMENT_PREFIX.test(word)))
          .forEach((span) => boundRoleIds.add(span.id));
        if (/^(?:this|requested|target|bu|hedef)$/.test(words[postStart + 1] || "")
            && /^(?:role|rol\w*)$/.test(words[postStart + 2] || "")) {
          requestedRoles.forEach((role) => boundRoleIds.add(role.id));
        }
      }

      spans
        .filter((span) => span.end <= nucleusStart && nucleusStart - span.end <= 3)
        .filter((span) => !words.slice(span.end, nucleusStart)
          .some((word) => ROLE_RELATION_BOUNDARY.test(word) || RELEVANCE_MODIFIER.test(word)))
        .forEach((span) => boundRoleIds.add(span.id));
    }
  }
  return [...boundRoleIds];
}

function affirmativeTargetRoleClauses(text) {
  return String(text || "")
    .split(/[.!?;\n]+|\b(?:but|however|ancak|ama|fakat)\b/i)
    .map(foldQuestion)
    .filter((clause) => clause && !CLAIM_UNESTABLISHED.test(clause));
}

function hasUnsupportedTargetRoleExperience(answer, strategy, question, records) {
  if (!isRecruiterFitAssessment(strategy)) return false;
  const family = strategy.roleFamily && strategy.roleFamily !== ROLE_FAMILIES.GENERAL
    ? strategy.roleFamily
    : detectRoleFamily(question);
  if (!ROLE_FAMILY_PHRASES[family]) return false;
  const requestedRoles = mentionedTargetRoles(question, family);
  const establishedRoleIds = new Set((records || []).flatMap(recordedTargetRoleIds));
  return affirmativeTargetRoleClauses(answer).some((clause) => {
    const words = tokenize(clause);
    const boundRoleIds = directlyAttributedTargetRoleIds(words, family, requestedRoles);
    return boundRoleIds.some((roleId) => !establishedRoleIds.has(roleId));
  });
}

function requestedFieldIsPresent(question, records) {
  const folded = foldQuestion(question);
  const text = (records || []).map((item) => item.text || "").join("\n");
  if (phraseIn(folded, ["staj", "intern", "deneyim", "experience", "ne yapti", "ne yaptı"])) {
    return /Kaan Balcı worked at|(?:^|\n)Period:/im.test(text);
  }
  return (records || []).some((record) => recordCoversRequestedField(record, question));
}

function obviousLanguageLeak(answer, locale) {
  const englishSignals = new Set([
    "the", "is", "are", "was", "were", "does", "not", "any", "and", "or", "with", "from", "for",
    "into", "that", "this", "these", "those", "has", "have", "shows", "lacks", "related", "worked",
    "completed", "evaluated", "assessed", "including", "across", "tasks",
  ]);
  const turkishSignals = new Set(["ve", "bir", "icin", "ile", "ancak", "olarak", "bu", "gore", "degil", "yoktur", "kendisinin"]);
  const words = tokenize(foldQuestion(answer));
  const count = (signals) => words.filter((word) => signals.has(word)).length;
  if (locale === "en") return /\b(?:Kendisi|Portfolyoda|Bu nedenle|kayıtlarda)\b/i.test(answer) || count(turkishSignals) >= 4;
  if (locale === "tr") return count(englishSignals) >= 5;
  if (["de", "es", "fr"].includes(locale)) {
    return count(englishSignals) >= 5 || /\b(?:Kendisi|Portfolyoda)\b/i.test(answer);
  }
  return false;
}

export function validateGeneratedAnswer({ raw = "", parsed, strategy, question = "", records = [], locale = "en", maxChars = 1800 }) {
  const flags = [];
  if (!parsed?.scope || !parsed?.answer) return { ok: false, flags: ["malformed-contract"] };
  if (parsed.scope !== strategy?.expectedScope) flags.push("scope-mismatch");
  if (parsed.answer.length > maxChars) flags.push("answer-too-long");
  if (parsed.answer.length < 3) flags.push("answer-too-short");
  if (parsed.answer.length >= 80 && !/[.!?…]["')\]]?$/.test(parsed.answer.trim())) flags.push("incomplete-ending");

  const repetition = detectAnswerRepetition(parsed.answer);
  if (repetition) flags.push(repetition);
  const contractText = String(parsed.contractText || raw || "");
  const contractLines = contractText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!/^SCOPE\s*:\s*(?:PORTFOLIO|GENERAL)$/i.test(contractLines[0] || "")
    || !/^ANSWER\s*:\s*\S/i.test(contractLines[1] || "")
    || contractLines.length !== 2) {
    flags.push("contract-noise");
  }
  if (META_REASONING.test(contractText)) flags.push("reasoning-leak");
  if (/<\/?think\b/i.test(parsed.answer)) flags.push("reasoning-marker");
  if (obviousLanguageLeak(parsed.answer, locale)) flags.push("language-template-leak");
  if (strategy?.recruiter && hasUnsupportedStrength(parsed.answer, records)) flags.push("unsupported-strength");
  if (hasUnsupportedTargetRoleExperience(parsed.answer, strategy, question, records)) {
    flags.push("unsupported-target-role-experience");
  }

  const hasDirectEvidence = requestedFieldIsPresent(question, records);
  const absenceClaim = ABSENCE_CLAIM.test(parsed.answer);
  const ignoranceClaim = IGNORANCE_CLAIM.test(parsed.answer);
  const support = strategy?.evidenceSupport;
  if ((hasDirectEvidence || support === EVIDENCE_SUPPORT.SUPPORTED)
      && (absenceClaim || ignoranceClaim)) {
    flags.push("evidence-contradiction");
  }
  if (absenceClaim && !BOUNDED_EVIDENCE_ABSENCE.test(parsed.answer)
      && support && support !== EVIDENCE_SUPPORT.ABSENT) {
    flags.push("unproven-corpus-absence");
  }
  if (strategy?.directYesNo && !strategy.recruiter) {
    const beginsBinary = /^(?:yes|no|evet|hayir|ja|nein|oui|non|si)(?:\s|$)/i.test(foldQuestion(parsed.answer));
    if ([EVIDENCE_SUPPORT.PARTIAL, EVIDENCE_SUPPORT.UNKNOWN].includes(support) && beginsBinary) {
      flags.push("unsupported-binary");
    }
  }
  if (["ranking", "comparison"].includes(strategy?.compositionIntent)
      && support === EVIDENCE_SUPPORT.PARTIAL
      && hasUnsafePartialComposition(parsed.answer, strategy)) {
    flags.push("overconfident-partial-composition");
  }
  return { ok: flags.length === 0, flags: [...new Set(flags)] };
}

const GENERAL_FALLBACK = Object.freeze({
  tr: "Bu soruya şu anda düzgün bir yanıt üretemedim. Lütfen tekrar dener misin?",
  en: "I could not produce a reliable answer just now. Please try again.",
  de: "Ich konnte gerade keine verlässliche Antwort erzeugen. Bitte versuche es noch einmal.",
  es: "No pude generar una respuesta fiable en este momento. Inténtalo de nuevo.",
  fr: "Je n’ai pas pu produire une réponse fiable pour le moment. Réessayez, s’il vous plaît.",
});

const PORTFOLIO_FALLBACK = Object.freeze({
  tr: "Portfolyodaki ilgili kayıtlar: {titles}. Şu anda güvenilir bir doğal dil özeti üretemediğim için bu kanıtların ötesinde bir iddiada bulunmuyorum.",
  en: "The relevant portfolio records are {titles}. I could not produce a reliable natural-language summary, so I will not make a claim beyond that evidence.",
  de: "Die relevanten Portfolioeinträge sind {titles}. Ich konnte keine verlässliche Zusammenfassung erzeugen und gehe daher nicht über diese Nachweise hinaus.",
  es: "Los registros relevantes del portafolio son {titles}. No pude generar un resumen fiable, así que no haré afirmaciones más allá de esas pruebas.",
  fr: "Les éléments pertinents du portfolio sont {titles}. Je n’ai pas pu produire un résumé fiable, donc je ne ferai aucune affirmation au-delà de ces preuves.",
});

const RANKING_FALLBACK = Object.freeze({
  tr: "İlgili kanıtlar: {titles}. Güvenilir bir sıralama üretemediğim için bu kayıtlar arasında kesin bir sıra dayatmıyorum.",
  en: "Relevant evidence: {titles}. I could not produce a reliable ranking, so I will not impose a definite order on these records.",
  de: "Relevante Nachweise: {titles}. Ich konnte keine verlässliche Rangfolge erstellen und lege daher keine endgültige Reihenfolge fest.",
  es: "Pruebas relevantes: {titles}. No pude elaborar una clasificación fiable, así que no impondré un orden definitivo.",
  fr: "Éléments pertinents : {titles}. Je n’ai pas pu établir un classement fiable, donc je n’imposerai pas d’ordre définitif.",
});

const UNCERTAIN_YES_NO_FALLBACK = Object.freeze({
  tr: "Mevcut kanıtlar ({titles}) güvenilir bir evet/hayır sonucu için yeterli değil.",
  en: "The available evidence ({titles}) is not enough for a reliable yes/no conclusion.",
  de: "Die verfügbaren Nachweise ({titles}) reichen für eine verlässliche Ja/Nein-Antwort nicht aus.",
  es: "Las pruebas disponibles ({titles}) no bastan para una conclusión fiable de sí o no.",
  fr: "Les éléments disponibles ({titles}) ne suffisent pas pour une conclusion fiable par oui ou non.",
});

export function buildSafeFallback({ strategy, locale = "en", records = [] }) {
  const language = GENERAL_FALLBACK[locale] ? locale : "en";
  if (strategy?.expectedScope === "GENERAL") {
    return { scope: "GENERAL", answer: GENERAL_FALLBACK[language] };
  }
  const titles = [...new Set(records.map((item) => String(item?.title || "").trim()).filter(Boolean))].slice(0, 3);
  if (!titles.length) {
    return { scope: "PORTFOLIO", answer: GENERAL_FALLBACK[language] };
  }
  const support = strategy?.evidenceSupport;
  if (strategy?.compositionIntent === "ranking") {
    return { scope: "PORTFOLIO", answer: RANKING_FALLBACK[language].replace("{titles}", titles.join(", ")) };
  }
  if (strategy?.directYesNo && !isRecruiterFitAssessment(strategy)
      && support !== EVIDENCE_SUPPORT.SUPPORTED) {
    const answer = UNCERTAIN_YES_NO_FALLBACK[language].replace("{titles}", titles.join(", "));
    return { scope: "PORTFOLIO", answer };
  }
  return {
    scope: "PORTFOLIO",
    answer: PORTFOLIO_FALLBACK[language].replace("{titles}", titles.join(", ")),
  };
}

export function answerQualityError(flags) {
  const error = new Error((flags || ["invalid-generation"]).join(", "));
  error.name = "AjoopAnswerQualityError";
  error.answerQuality = true;
  error.flags = flags || ["invalid-generation"];
  return error;
}
