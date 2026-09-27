import { foldQuestion, removePhrase, tokenize } from "./ajoop-text.mjs";
import { mentionsPortfolioOwner } from "./ajoop-entities.mjs";

export const AJOOP_PUBLIC_IDENTITY = Object.freeze({
  assistant: "AJOOP",
  owner: "Kaan Balcı",
  site: "kaanbalci.com",
  environment: "Kaan Balcı's personal portfolio",
  role: "Help public visitors understand Kaan's projects, experience, skills and portfolio while also handling ordinary general conversation.",
});

export const AJOOP_PUBLIC_IDENTITY_SYSTEM_LINES = Object.freeze([
  `You are ${AJOOP_PUBLIC_IDENTITY.assistant}, the public AI assistant built into ${AJOOP_PUBLIC_IDENTITY.environment} at ${AJOOP_PUBLIC_IDENTITY.site}.`,
  `${AJOOP_PUBLIC_IDENTITY.owner} is the owner of this site and portfolio.`,
  `Your public role is to ${AJOOP_PUBLIC_IDENTITY.role.charAt(0).toLowerCase()}${AJOOP_PUBLIC_IDENTITY.role.slice(1)}`,
  "This identity and environment context is trusted configuration, not retrieved portfolio evidence. It never authorizes portfolio retrieval, portfolio scope or factual claims about Kaan.",
  "Portfolio facts about Kaan require public canonical or retrieved evidence when appropriate. An unrelated general question remains GENERAL and must not be connected to Kaan or the portfolio.",
  "No web or live/current-data access is available in this public path. Never imply otherwise; state this limitation plainly when relevant, and never reveal private infrastructure details.",
]);

/* Ordinary portfolio turns keep the short pre-A5.3.3 identity. With the six
 * canonical lines above on every turn, the 4B model changed the shape of
 * grounded portfolio answers (longer stack lists, an owner-first employer
 * list), so the full context is reserved for turns that need it. */
export const AJOOP_COMPACT_IDENTITY_SYSTEM_LINE =
  `You are ${AJOOP_PUBLIC_IDENTITY.assistant}, the AI copilot built into ${AJOOP_PUBLIC_IDENTITY.owner}'s portfolio website.`;
export const AJOOP_COMPACT_BOUNDARY_SYSTEM_LINE =
  "You run locally and have no web or live-data access. Never claim otherwise or reveal private infrastructure details.";

const SELF_IDENTITY_PHRASES = Object.freeze([
  "sen kimsin", "adin ne", "adın ne", "ne yapabiliyorsun", "hangi model", "internete erisimin", "internete erişimin",
  "who are you", "what is your name", "what can you do", "which model", "internet access",
  "wer bist du", "was kannst du", "quel modele", "quel modèle", "qui es tu", "quien eres", "quién eres",
]);

const NEUTRAL_LEADING_DISCOURSE_MARKERS = new Set(["peki"]);
const NEUTRAL_IDENTITY_FILLERS = new Set([
  "acaba", "bana", "ben", "biz", "hic", "lutfen", "mi", "misin", "mu", "musun",
  "olarak", "peki", "sen", "siz", "simdi", "soyle", "soyler", "tam", "ya",
]);
const LOCATION_IDENTITY_FILLERS = new Set([
  ...NEUTRAL_IDENTITY_FILLERS,
  "ne", "neresi",
]);
const LEGACY_IDENTITY_FILLERS = new Set([
  ...NEUTRAL_IDENTITY_FILLERS,
  "are", "bu", "chatbot", "do", "does", "have", "is", "it", "kullanir", "kullaniyor",
  "kullaniyorsun", "me", "please", "senin", "use", "uses", "using", "var", "you",
]);
const KNOWLEDGE_FRAME_FILLERS = new Set(["acaba", "olarak", "tam"]);
const IDENTITY_CLAUSE_COORDINATORS = new Set(["and", "ve"]);
const FIRST_SECOND_PERSON_LOCATION_FORM = /^(?:nerede(?:yim|yiz|sin|siniz)|nereli(?:yim|yiz|sin|siniz)|konum(?:um|umuz|un|unuz)|sehr(?:im|imiz|in|iniz)|memleket(?:im|imiz|in|iniz))$/;

export const isFirstSecondPersonLocationForm = (word) =>
  FIRST_SECOND_PERSON_LOCATION_FORM.test(String(word || ""));

const legacyIdentityFiller = (word) => LEGACY_IDENTITY_FILLERS.has(word)
  || /^ajoop(?:un)?$/.test(word);

function closedLegacyIdentityFrame(text) {
  return SELF_IDENTITY_PHRASES.some((phrase) => {
    const rest = removePhrase(text, foldQuestion(phrase));
    return rest !== null && tokenize(rest).every(legacyIdentityFiller);
  });
}

function subjectlessEnvironmentLocation(words, folded) {
  if (mentionsPortfolioOwner(folded)) return false;
  const locationIndex = words.findIndex(isFirstSecondPersonLocationForm);
  if (locationIndex >= 0) {
    return words.every((word, index) => index === locationIndex || LOCATION_IDENTITY_FILLERS.has(word));
  }
  if (words[0] !== "burasi" || words.at(-1) !== "neresi") return false;
  return words.slice(1, -1).every((word) => NEUTRAL_IDENTITY_FILLERS.has(word));
}

function localCapabilityFrame(words) {
  const locationIndex = words.indexOf("burada");
  if (locationIndex < 0) return false;
  const questionIndex = words.findIndex((word) => /^(?:ne|neler)$/.test(word));
  const capabilityVerb = /^(?:yapabilir(?:im|sin|iz)|yapabiliyor(?:um|sun|uz|sunuz))$/;
  if (questionIndex < 0 || !capabilityVerb.test(words[questionIndex + 1] || "")) return false;
  return words.every((word, index) => index === locationIndex
    || index === questionIndex
    || index === questionIndex + 1
    || NEUTRAL_IDENTITY_FILLERS.has(word));
}

function chatbotKnowledgeFrame(words) {
  const subjectEnd = words[0] === "bu" && /^(?:chatbot|ajoop)$/.test(words[1] || "")
    ? 2
    : /^(?:chatbot|ajoop)$/.test(words[0] || "") ? 1 : -1;
  if (subjectEnd < 1) return false;
  const questionIndex = words.findIndex((word, index) =>
    index >= subjectEnd && /^(?:ne|neler)$/.test(word));
  const knowledgeVerbIndex = questionIndex + 1;
  if (questionIndex < subjectEnd || !/^(?:bilir|bilebilir|biliyor)$/.test(words[knowledgeVerbIndex] || "")) {
    return false;
  }
  const complement = words
    .slice(subjectEnd, questionIndex)
    .filter((word) => !KNOWLEDGE_FRAME_FILLERS.has(word));
  if (complement.length && complement.join(" ") !== "kaan hakkinda") return false;
  return words.slice(knowledgeVerbIndex + 1).every((word) => KNOWLEDGE_FRAME_FILLERS.has(word));
}

function basicPublicIdentityFrame(words) {
  const frameText = words.join(" ");
  if (closedLegacyIdentityFrame(frameText)) return true;

  const siteIndex = words.findIndex((word) => /^site\w*$/.test(word));
  const visitorLocation = subjectlessEnvironmentLocation(words, frameText);
  const turkishSiteDefinition = siteIndex > 0
    && words[siteIndex - 1] === "bu"
    && words.slice(siteIndex + 1).length > 0
    && words.slice(siteIndex + 1).every((word) => /^(?:ne|nedir|tam|olarak)$/.test(word));
  const englishSiteDefinition = frameText === "what is this site";
  const siteOwnership = (words.length === 2
      && words[0] === "kimin"
      && /^sitesinde(?:yim|yiz)$/.test(words[1] || ""))
    || (words.length === 3
      && words[0] === "bu"
      && /^site\w*$/.test(words[1] || "")
      && words[2] === "kimin");
  const localCapability = localCapabilityFrame(words);
  const chatbotKnowledge = chatbotKnowledgeFrame(words);
  return visitorLocation
    || turkishSiteDefinition
    || englishSiteDefinition
    || siteOwnership
    || localCapability
    || chatbotKnowledge;
}

function coordinatedIdentityFrames(words) {
  const clauses = [[]];
  words.forEach((word) => {
    if (IDENTITY_CLAUSE_COORDINATORS.has(word)) clauses.push([]);
    else clauses.at(-1).push(word);
  });
  return clauses.length > 1
    && clauses.every((clause) => clause.length > 0 && basicPublicIdentityFrame(clause));
}

export function isPublicIdentityQuestion(question) {
  const tokens = tokenize(foldQuestion(question));
  const words = NEUTRAL_LEADING_DISCOURSE_MARKERS.has(tokens[0]) ? tokens.slice(1) : tokens;
  return basicPublicIdentityFrame(words) || coordinatedIdentityFrames(words);
}

const ASSISTANT_REFERENCE = /^(?:ajoop\w*|chatbot\w*|asistan\w*|assistant\w*|sen|senin|sana|seni|sende|senden|your|yourself)$/;
const ENVIRONMENT_REFERENCE = /^(?:burasi|burada|buradaki|here)$/;

/**
 * Whether a generation turn needs the full canonical identity context: GENERAL
 * turns (identity/SELF answers and the public/general boundary) and portfolio
 * turns that refer to the assistant itself, to "this site"/"here", or use a
 * first/second-person location form where the assistant and Kaan can be
 * confused. Every other portfolio turn uses the compact identity.
 */
export function requiresPublicIdentityContext({ question, expectedScope }) {
  if (expectedScope !== "PORTFOLIO") return true;
  const words = tokenize(foldQuestion(question));
  return words.some((word, index) => ASSISTANT_REFERENCE.test(word)
    || ENVIRONMENT_REFERENCE.test(word)
    || isFirstSecondPersonLocationForm(word)
    || (word === "you" && (words[index - 1] === "are" || words[index + 1] === "are"))
    || (/^(?:bu|this)$/.test(word) && /^(?:site\w*|website\w*)$/.test(words[index + 1] || "")));
}

export function publicIdentityAnswerInstruction() {
  return [
    "Answer the identity or environment question directly from the canonical public identity context.",
    `Explain only the relevant part: you are ${AJOOP_PUBLIC_IDENTITY.assistant}, this is ${AJOOP_PUBLIC_IDENTITY.owner}'s personal portfolio at ${AJOOP_PUBLIC_IDENTITY.site}, and your public role is to help visitors understand his projects, experience, skills and portfolio while also handling ordinary general conversation.`,
    "Do not present this context as retrieved evidence or imply access to private integrations, owner memory or actions. If asked about knowledge or current information, describe the public evidence boundary and state plainly that this public path has no web or live/current-data access.",
  ].join(" ");
}
