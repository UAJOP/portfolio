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

const RECRUITER_SIGNAL = Object.freeze([
  "role", "rol", "pozisyon", "position", "aday", "candidate", "ise al", "işe al",
  "ise almali", "işe almalı", "neden ise", "neden işe", "would you hire", "why hire",
  "hire", "hiring", "recruiter", "ise alim", "işe alım", "mentorluk", "mentorship",
  "hiring manager", "junior aday", "company environment", "sirket ortami", "şirket ortamı",
  "fit", "uygun mu", "bring to", "weakness", "strength", "eksi", "guclu taraf", "güçlü taraf",
  "neye dayan", "kanit", "kanıt", "evidence", "prove",
]);

const RECRUITER_KINDS = Object.freeze([
  [ANSWER_MODES.RECRUITER_RISK, ["worry", "risk", "endise", "endişe", "riskli"]],
  [ANSWER_MODES.RECRUITER_GAPS, ["eksik", "zayif", "zayıf", "weakness", "gap", "mentorluk", "mentorship", "gelistirmesi", "geliştirmesi"]],
  [ANSWER_MODES.RECRUITER_DIFFERENTIATION, ["ayiran", "ayıran", "differentiat", "diger junior", "diğer junior"]],
  [ANSWER_MODES.RECRUITER_BEST_ROLE, ["hangi role", "hangi rol", "best role", "most suitable role", "en uygun rol"]],
  [ANSWER_MODES.RECRUITER_ENVIRONMENT, ["sirket ortami", "şirket ortamı", "company environment", "work environment", "kultur", "kültür"]],
  [ANSWER_MODES.RECRUITER_EVIDENCE, ["neye dayan", "kanit", "kanıt", "evidence", "prove"]],
  [ANSWER_MODES.RECRUITER_STRENGTHS, ["guclu taraf", "güçlü taraf", "strength", "strongest"]],
  [ANSWER_MODES.RECRUITER_HIRE, ["neden ise", "neden işe", "ise almali", "işe almalı", "why hire", "would you hire", "bring to"]],
  [ANSWER_MODES.RECRUITER_FIT, ["uygun mu", "fit", "guclu bir aday", "güçlü bir aday", "ready for", "aday mi", "aday mı"]],
]);

const SELF_PHRASES = Object.freeze([
  "sen kimsin", "adin ne", "adın ne", "ne yapabiliyorsun", "hangi model", "internete erisimin", "internete erişimin",
  "who are you", "what is your name", "what can you do", "which model", "internet access",
  "wer bist du", "was kannst du", "quel modele", "quel modèle", "qui es tu", "quien eres", "quién eres",
]);

const phraseIn = (text, phrases) => phrases.some((phrase) => hasPhrase(text, foldQuestion(phrase)));

function recruiterHistoryText(history) {
  return (history || [])
    .filter((item) => item?.role === "user")
    .slice(-2)
    .map((item) => item.content)
    .join(" ");
}

export function detectRoleFamily(question, history = []) {
  const folded = foldQuestion(`${recruiterHistoryText(history)} ${question}`);
  if (phraseIn(folded, ["forward deployed", "fde", "solution engineer", "solution engineering", "cozum muhendisi", "çözüm mühendisi"])) {
    return ROLE_FAMILIES.FORWARD_DEPLOYED;
  }
  if (phraseIn(folded, ["applied ai", "ai engineer", "yapay zeka muhendisi", "yapay zekâ mühendisi", "ml engineer"])) {
    return ROLE_FAMILIES.APPLIED_AI;
  }
  if (phraseIn(folded, ["software engineer", "software developer", "yazilim muhendisi", "yazılım mühendisi", "backend engineer", "full stack"])) {
    return ROLE_FAMILIES.SOFTWARE;
  }
  if (phraseIn(folded, ["ai product", "ai designer", "product manager", "urun", "ürün", "conversational designer"])) {
    return ROLE_FAMILIES.AI_PRODUCT;
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

export function selectAnswerStrategy({ question, plan, history = [] }) {
  const recruiter = detectRecruiterQuestion(question, history);
  if (recruiter) {
    return {
      ...recruiter,
      expectedScope: "PORTFOLIO",
      recruiter: true,
      evidenceLimit: 4,
    };
  }

  const folded = foldQuestion(question);
  if (phraseIn(folded, SELF_PHRASES)) {
    return {
      mode: ANSWER_MODES.SELF,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "GENERAL",
      recruiter: false,
      evidenceLimit: 0,
    };
  }
  if ((plan?.activeProjects || []).length > 1) {
    return {
      mode: ANSWER_MODES.COMPARISON,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "PORTFOLIO",
      recruiter: false,
      evidenceLimit: plan.activeProjects.length,
    };
  }
  if ((plan?.activeProjects || []).length) {
    return {
      mode: ANSWER_MODES.PORTFOLIO_PROJECT,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "PORTFOLIO",
      recruiter: false,
      evidenceLimit: 2,
    };
  }
  if ((plan?.activeOrganizations || []).length || plan?.experienceFocus) {
    return {
      mode: ANSWER_MODES.PORTFOLIO_EXPERIENCE,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "PORTFOLIO",
      recruiter: false,
      evidenceLimit: 3,
    };
  }
  if (plan?.followUp && plan?.contextEligible) {
    return {
      mode: ANSWER_MODES.FOLLOW_UP,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "PORTFOLIO",
      recruiter: false,
      evidenceLimit: 3,
    };
  }
  if (!plan?.contextEligible) {
    return {
      mode: ANSWER_MODES.GENERAL,
      roleFamily: ROLE_FAMILIES.GENERAL,
      expectedScope: "GENERAL",
      recruiter: false,
      evidenceLimit: 0,
    };
  }
  return {
    mode: ANSWER_MODES.PORTFOLIO_FACT,
    roleFamily: ROLE_FAMILIES.GENERAL,
    expectedScope: "PORTFOLIO",
    recruiter: false,
    evidenceLimit: 3,
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

/**
 * Curates compact UI evidence from the records the answer was allowed to use.
 * Raw retrieval stays separate; duplicate chunks and duplicate logical entities
 * cannot become duplicate cards.
 */
export function selectEvidenceRecords({ strategy, records = [], affinity = new Map(), answer = "" }) {
  if (!strategy || strategy.expectedScope === "GENERAL" || strategy.evidenceLimit === 0) return [];
  if (!strategy.recruiter && (ABSENCE_CLAIM.test(answer) || IGNORANCE_CLAIM.test(answer))) return [];
  const activeProjects = strategy.activeProjects || [];
  const activeOrganizations = strategy.activeOrganizations || [];
  let candidates = records.filter((item) => item && item.visibility !== "public_on_request");

  if (strategy.mode === ANSWER_MODES.COMPARISON && activeProjects.length) {
    candidates = candidates.filter((item) => marksFor(item, affinity).projects.some((name) => activeProjects.includes(name)));
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

export function answerStrategyPrompt(strategy) {
  if (!strategy) return "Answer directly and concisely.";
  if (strategy.recruiter) {
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
      "Give the bottom line first. Use two to four concrete evidence points, name the best-fit work, state one real gap or unknown, and end with a calibrated conclusion.",
      "Stay under 120 words and four complete sentences.",
      "Separate recorded facts from your assessment. Never claim certainty, invent a percentage, or imply guaranteed success.",
      "State unknowns as what the portfolio does not show. Do not call work deep, scalable, senior or production-grade unless a supplied record says so.",
      focus,
      scopeContractLine(strategy),
    ].filter(Boolean).join("\n");
  }
  const prompts = {
    [ANSWER_MODES.GENERAL]: "Answer the general question normally and helpfully. Do not mention Kaan, recruiting or the portfolio, and do not attach portfolio evidence.",
    [ANSWER_MODES.PORTFOLIO_PROJECT]: "Answer the named project question directly from its records. If a requested stack or field is present, state it without first claiming it is missing.",
    [ANSWER_MODES.PORTFOLIO_EXPERIENCE]: "Answer from the matching experience records. Preserve company names, role titles, dates and metrics exactly.",
    [ANSWER_MODES.COMPARISON]: "Compare only the named entities, using one concise point per meaningful difference and no invented winner.",
    [ANSWER_MODES.SELF]: "Describe Ajoop accurately as Kaan's local-model portfolio copilot. State plainly, never hypothetically, that you have no web or live-data access, and expose no private infrastructure details.",
    [ANSWER_MODES.FOLLOW_UP]: "Answer the immediate follow-up using its bounded conversation and active entity only.",
    [ANSWER_MODES.PORTFOLIO_FACT]: "Answer directly from the supplied portfolio records. If support is genuinely absent, say exactly what the portfolio does not verify and do not substitute unrelated facts.",
  };
  return [
    `Answer strategy: ${strategy.mode}.`,
    prompts[strategy.mode] || "Answer directly and concisely.",
    scopeContractLine(strategy),
  ].filter(Boolean).join("\n");
}

export function repairPrompt(flags, strategy) {
  return [
    `The previous draft was rejected (${(flags || []).join(", ") || "invalid output"}).`,
    (flags || []).includes("scope-mismatch") && strategy?.expectedScope
      ? `The rejected draft used the wrong scope. The first line must be exactly: SCOPE: ${strategy.expectedScope}`
      : "",
    "Write a fresh answer from the same records. Do not quote or discuss the rejected draft.",
    "Use exactly one SCOPE line and one ANSWER line. No reasoning, labels, repetition or text after the answer.",
    "Answer directly; never claim a recorded field is absent when the supplied records contain it.",
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
const ABSENCE_CLAIM = /(?:portfolio (?:does not|doesn't) (?:record|specify|contain)|not explicitly (?:specified|recorded)|portfolyoda[^.!?]{0,80}(?:kayit yok|kayıt yok|belirtilmemis|belirtilmemiş|yer almiyor|yer almıyor)|(?:nicht|pas|no) [^.!?]{0,50}(?:angegeben|specifie|spécifié|especificado|registrado))/i;
const IGNORANCE_CLAIM = /\b(?:i do not know|i don't know|bilmiyorum|bilinmiyor|je ne sais pas|no lo se|no lo sé|ich weiss nicht|ich weiß nicht)\b/i;

function requestedFieldIsPresent(question, records) {
  const folded = foldQuestion(question);
  const text = (records || []).map((item) => item.text || "").join("\n");
  if (phraseIn(folded, ["stack", "teknoloji", "technology", "technologies"])) {
    return /(?:^|\n)(?:Technologies|Skills):|stack\.[0-9]+:/im.test(text);
  }
  if (phraseIn(folded, ["staj", "intern", "deneyim", "experience", "ne yapti", "ne yaptı"])) {
    return /Kaan Balcı worked at|(?:^|\n)Period:/im.test(text);
  }
  return false;
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

  const hasDirectEvidence = requestedFieldIsPresent(question, records);
  if (hasDirectEvidence && (ABSENCE_CLAIM.test(parsed.answer) || IGNORANCE_CLAIM.test(parsed.answer))) {
    flags.push("evidence-contradiction");
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

export function buildSafeFallback({ strategy, locale = "en", records = [] }) {
  const language = GENERAL_FALLBACK[locale] ? locale : "en";
  if (strategy?.expectedScope === "GENERAL") {
    return { scope: "GENERAL", answer: GENERAL_FALLBACK[language] };
  }
  const titles = [...new Set(records.map((item) => String(item?.title || "").trim()).filter(Boolean))].slice(0, 3);
  if (!titles.length) {
    return { scope: "PORTFOLIO", answer: GENERAL_FALLBACK[language] };
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
