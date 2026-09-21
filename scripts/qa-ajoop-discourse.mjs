#!/usr/bin/env node
/** A5.3.1 canonical public discourse regression families. No network/Ollama. */
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMasterKnowledge } from "../server/ajoop-knowledge.mjs";
import { buildAliasIndex } from "../server/ajoop-entities.mjs";
import { buildEntityIndex, planRetrievalTurn } from "../server/ajoop-retrieval.mjs";
import {
  buildNextPublicConversationState,
  canonicalMentionsInOrder,
  discourseConstraintText,
  resolvePublicDiscourseTurn,
} from "../server/ajoop-discourse.mjs";
import { createAjoopRag } from "../server/ajoop-rag.mjs";

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (Object.is(actual, expected)) passed += 1;
  else failures.push(`${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
};
const ok = (label, value) => check(label, Boolean(value), true);
const user = (content) => ({ role: "user", content });
const bot = (content) => ({ role: "assistant", content });

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { knowledge } = await loadMasterKnowledge(resolve(ROOT, "data", "portfolio"));
const entityIndex = buildEntityIndex(knowledge, buildAliasIndex(knowledge));
const resolveTurn = (question, history = [], conversationState) => resolvePublicDiscourseTurn({
  question, history, conversationState, entityIndex,
});
const plan = (question, history = [], conversationState) => planRetrievalTurn({
  question, history, conversationState, entityIndex,
});
const portfolioState = (referents, orderedReferents = []) => ({
  version: 1, scope: "portfolio", referents, orderedReferents,
});
const RECRUITER_LIKE_ORGANIZATION_QUESTIONS = Object.freeze([
  "Outlier AI şirket ortamı nasıl?",
  "What is the company environment at Outlier AI?",
  "CBOT şirket kültürü nasıl?",
  "Joyday çalışma ortamı nasıl?",
  "What is the work environment like at Outlier AI?",
]);
const OWNER_RECRUITER_CONTROLS = Object.freeze([
  ["Kaan için Outlier AI şirket ortamı uygun mu?", "Outlier AI", "experience:outlier-ai"],
  ["Kaan CBOT ortamına uygun muydu?", "CBOT", "experience:cbot"],
  ["Kaan için Joyday çalışma ortamı nasıldı?", "Atölye Joyday", "experience:atolye-joyday"],
  ["Would Outlier AI be a good environment for Kaan?", "Outlier AI", "experience:outlier-ai"],
]);

/* A. Singular referent and presentation depth are one structural family. */
const sinamaHistory = [user("SINAMA'yı anlat."), bot("SINAMA bir projedir.")];
for (const [question, expectedDepth] of [
  ["Daha detaylı.", "more_detail"],
  ["onu biraz aç", "more_detail"],
  ["bunu detaylandır", "more_detail"],
  ["onun stack'i ne?", "default"],
  ["tell me more", "more_detail"],
]) {
  const history = [user("SINAMA'yı anlat."), bot("SINAMA bir AI agent reliability ürünüdür.")];
  const turn = resolveTurn(question, history, portfolioState(["SINAMA"]));
  check(`[singular] ${question} continues`, turn.turnKind, "continuation");
  check(`[singular] ${question} retains SINAMA`, turn.primaryReferent, "SINAMA");
  check(`[depth] ${question}`, turn.requestedDepth, expectedDepth);
}
for (const question of [
  "Why is that technically important?",
  "Why does that matter for recruiters?",
  "How does that compare technically?",
  "Can you explain that in practical terms?",
]) {
  const turn = resolveTurn(question, sinamaHistory, portfolioState(["SINAMA"]));
  check(`[long-bare-that] ${question} remains a continuation`, turn.turnKind, "continuation");
  check(`[long-bare-that] ${question} retains its portfolio referent`, turn.primaryReferent, "SINAMA");
}
{
  const question = "How does that compare technically with AJOOP?";
  const turn = resolveTurn(question, sinamaHistory, portfolioState(["SINAMA"]));
  check("[long-bare-that-mixed] comparison remains contextual", turn.turnKind, "continuation");
  check("[long-bare-that-mixed] demonstrative and explicit project form the pair",
    turn.referents.join("|"), "SINAMA|Ajoop Portfolio Copilot");
}
for (const question of [
  "Pick the 2 projects that best demonstrate applied AI.",
  "Pick the 2 projects from his portfolio that best demonstrate applied AI.",
  "Choose the 3 project examples that best demonstrate applied AI.",
  "Pick 2 of the projects in the portfolio that best show applied AI.",
  "Pick the projects that best demonstrate applied AI.",
  "Choose the project that best demonstrates applied AI.",
]) {
  const turn = resolveTurn(question, sinamaHistory, portfolioState(["SINAMA"]));
  check(`[relative-that-ranking] ${question} starts fresh`, turn.turnKind, "new_topic");
  check(`[relative-that-ranking] ${question} inherits no stale SINAMA`, turn.referents.length, 0);
  check(`[relative-that-ranking] ${question} keeps the shared ranking shape`, plan(question).compositionIntent, "ranking");
}
for (const question of [
  "Rank that among the top 3 projects.",
  "Choose that as one of the top 3 projects.",
  "Put that among the 3 strongest projects.",
  "Among the top 3 projects, rank that.",
  "Of the strongest 3 projects, choose that.",
  "Rank the top 3 projects including that.",
  "Pick 3 projects and include that.",
  "Out of the top 3 projects, where does that land?",
  "Rank the projects with that included.",
  "Pick three projects alongside that.",
]) {
  const result = plan(question, sinamaHistory, portfolioState(["SINAMA"]));
  check(`[demonstrative-that-ranking] ${question} remains contextual`, result.discourse.turnKind, "continuation");
  check(`[demonstrative-that-ranking] ${question} retains stale-history target intentionally`, result.discourse.primaryReferent, "SINAMA");
  check(`[demonstrative-that-ranking] ${question} still uses ranking composition`, result.compositionIntent, "ranking");
}
{
  const question = "Compare the top candidates against that.";
  const result = plan(question, sinamaHistory, portfolioState(["SINAMA"]));
  check("[prepositional-that-comparison] demonstrative remains contextual", result.discourse.turnKind, "continuation");
  check("[prepositional-that-comparison] stale-history target remains SINAMA", result.discourse.primaryReferent, "SINAMA");
  check("[prepositional-that-comparison] comparison semantics survive", result.compositionIntent, "comparison");
}
{
  const question = "Rank the projects with that included.";
  const discourseUrl = new URL("../server/ajoop-discourse.mjs", import.meta.url);
  const mutantUrl = new URL(`../server/.qa-ajoop-discourse-mutant-${process.pid}-${Date.now()}.mjs`, import.meta.url);
  const structuralRule = `    if (!next || DEMONSTRATIVE_THAT_FOLLOW.test(next)) return false;\n    if (DEMONSTRATIVE_THAT_GOVERNOR.test(previous) || PREPOSITIONAL_THAT_GOVERNOR.test(previous) || /ing$/.test(previous)) return false;\n    return true;`;
  const predicateListMutant = `    const collectionIndex = tokens.findLastIndex((candidate, index) =>\n      index < thatIndex && RANKING_COLLECTION_TOKEN.test(candidate),\n    );\n    const fixedPredicates = /^(?:rank\\w*|choose\\w*|pick\\w*|select\\w*|put|place\\w*)$/;\n    return !tokens.slice(collectionIndex + 1, thatIndex).some((candidate) => fixedPredicates.test(candidate));`;
  const source = readFileSync(discourseUrl, "utf8");
  const normalizedSource = source.replace(/\r\n?/g, "\n");
  ok("[relative-that-mutation] structural rule anchor exists", normalizedSource.includes(structuralRule));
  const mutantSource = normalizedSource.replace(structuralRule, predicateListMutant);
  if (mutantSource === normalizedSource) throw new Error("relative-that mutation was not applied");
  writeFileSync(mutantUrl, mutantSource, "utf8");
  try {
    const mutant = await import(mutantUrl.href);
    const turn = mutant.resolvePublicDiscourseTurn({
      question,
      history: sinamaHistory,
      conversationState: portfolioState(["SINAMA"]),
      entityIndex,
    });
    check("[relative-that-mutation] fixed predicate list breaks preposition-object that", turn.turnKind, "new_topic");
    check("[relative-that-mutation] fixed predicate list loses prepositional SINAMA", turn.primaryReferent, null);
  } finally {
    unlinkSync(mutantUrl);
  }
}

/* B. Plural referents remain an ordered set instead of collapsing to one. */
const comparisonHistory = [
  user("SINAMA ile AJOOP arasındaki fark ne?"),
  bot("SINAMA ve Ajoop Portfolio Copilot iki farklı projedir."),
];
const pair = ["SINAMA", "Ajoop Portfolio Copilot"];
for (const question of [
  "Peki ikisinin ortak tarafı ne?",
  "ikisini karşılaştır",
  "bunların farkı ne?",
  "compare both technically",
]) {
  const turn = resolveTurn(question, comparisonHistory, portfolioState(pair));
  check(`[plural] ${question} continues`, turn.turnKind, "continuation");
  check(`[plural] ${question} keeps both`, turn.referents.join("|"), pair.join("|"));
}

/* C. Ordinals bind to the prior answer's actual canonical order. */
const ranked = ["Ajoop Portfolio Copilot", "SINAMA", "Hospital Appointment System"];
const rankedHistory = [
  user("Kaan'ın en güçlü 3 projesini söyle."),
  bot("1. Ajoop Portfolio Copilot 2. SINAMA 3. Hospital Appointment System"),
];
for (const [question, expected] of [
  ["İkinci olanı biraz daha aç.", "SINAMA"],
  ["ilkini anlat", "Ajoop Portfolio Copilot"],
  ["üçüncüsü hangi teknolojileri kullanıyor?", "Hospital Appointment System"],
  ["expand the second", "SINAMA"],
]) {
  const turn = resolveTurn(question, rankedHistory, portfolioState(ranked, ranked));
  check(`[ordinal] ${question}`, turn.primaryReferent, expected);
  ok(`[ordinal] ${question} came from preserved order`, turn.continuationSource.includes("ordinal"));
}
check(
  "canonical answer mentions preserve textual order",
  canonicalMentionsInOrder(rankedHistory[1].content, entityIndex, { projectsOnly: true }).join("|"),
  ranked.join("|"),
);

/* C2. Exact-two is not generic plural, and mixed explicit/anaphoric turns
 * combine the new subject with exactly one validated antecedent. */
for (const [question, expected] of [
  ["AJOOP ile onu karşılaştır", ["Ajoop Portfolio Copilot", "SINAMA"]],
  ["onu AJOOP ile karşılaştır", ["SINAMA", "Ajoop Portfolio Copilot"]],
  ["compare AJOOP with it", ["Ajoop Portfolio Copilot", "SINAMA"]],
]) {
  const turn = resolveTurn(question, sinamaHistory, portfolioState(["SINAMA"]));
  check(`[mixed] ${question} continues`, turn.turnKind, "continuation");
  check(`[mixed] ${question} combines subjects in semantic order`, turn.referents.join("|"), expected.join("|"));
}
for (const question of [
  "AJOOP ve onun amacı ne?",
  "AJOOP ve onun stack'i ne?",
  "AJOOP and its purpose?",
  "AJOOP and what is its stack?",
]) {
  const turn = resolveTurn(question, sinamaHistory, portfolioState(["SINAMA"]));
  check(`[local-coreference] ${question} is a fresh local subject`, turn.turnKind, "new_topic");
  check(`[local-coreference] ${question} does not inherit stale SINAMA`, turn.referents.join(), "Ajoop Portfolio Copilot");
}
for (const question of [
  "What is Python and what is it used for?",
  "Python ve onun amacı nedir?",
]) {
  const result = plan(question, sinamaHistory, portfolioState(["SINAMA"]));
  check(`[technology-local] ${question} starts a fresh topic`, result.discourse.turnKind, "new_topic");
  check(`[technology-local] ${question} inherits no stale project`, result.inheritedEntities.length, 0);
  check(`[technology-local] ${question} persists no technology referent`, result.discourse.referents.length, 0);
  check(`[technology-local] ${question} has no portfolio authority`, result.contextEligible, false);
}
{
  const question = "Compare AJOOP with Hospital Appointment System and its purpose.";
  const expected = ["Ajoop Portfolio Copilot", "Hospital Appointment System"];
  const turn = resolveTurn(question, sinamaHistory, portfolioState(["SINAMA"]));
  check("[multi-local-possessive] two explicit subjects start fresh", turn.turnKind, "new_topic");
  check("[multi-local-possessive] stale SINAMA is not a third side", turn.referents.join("|"), expected.join("|"));
  const answer = "Ajoop Portfolio Copilot and Hospital Appointment System have different purposes.";
  const state = buildNextPublicConversationState({
    resolvedTurn: turn, answer, scope: "PORTFOLIO", entityIndex, question,
  });
  const next = resolveTurn("compare both in more detail", [...sinamaHistory, user(question), bot(answer)], state);
  check("[multi-local-possessive-chain] server state remains valid", next.browserHint, "accepted");
  check("[multi-local-possessive-chain] next continuation retains only the explicit pair", next.referents.join("|"), expected.join("|"));
}
{
  const mixedQuestion = "AJOOP ile onu karşılaştır";
  const mixedAnswer = "Ajoop Portfolio Copilot ve SINAMA farklı amaçlara hizmet eder.";
  const mixedTurn = resolveTurn(mixedQuestion, sinamaHistory, portfolioState(["SINAMA"]));
  const mixedState = buildNextPublicConversationState({
    resolvedTurn: mixedTurn, answer: mixedAnswer, scope: "PORTFOLIO", entityIndex, question: mixedQuestion,
  });
  const mixedHistory = [...sinamaHistory, user(mixedQuestion), bot(mixedAnswer)];
  const nextPair = resolveTurn("ikisini daha teknik karşılaştır", mixedHistory, mixedState);
  check("[mixed-chain] server-built mixed pair is accepted next turn", nextPair.browserHint, "accepted");
  check("[mixed-chain] explicit and inherited pair survives", nextPair.referents.join("|"), "Ajoop Portfolio Copilot|SINAMA");
}
{
  const turn = resolveTurn("AJOOP ne işe yarıyor?", sinamaHistory, portfolioState(["SINAMA"]));
  check("[mixed] explicit entity without anaphora starts fresh", turn.turnKind, "new_topic");
  check("[mixed] explicit entity without anaphora replaces stale state", turn.referents.join(), "Ajoop Portfolio Copilot");
}
for (const [question, expected] of [
  ["Bu AJOOP projesini anlat.", ["Ajoop Portfolio Copilot"]],
  ["Bu yeni AJOOP projesini anlat.", ["Ajoop Portfolio Copilot"]],
  ["Bu AJOOP projesini Hospital Appointment System ile karşılaştır.", ["Ajoop Portfolio Copilot", "Hospital Appointment System"]],
  ["This AJOOP project should be compared with Hospital Appointment System.", ["Ajoop Portfolio Copilot", "Hospital Appointment System"]],
  ["This local AJOOP project should be compared with Hospital Appointment System.", ["Ajoop Portfolio Copilot", "Hospital Appointment System"]],
]) {
  const turn = resolveTurn(question, sinamaHistory, portfolioState(["SINAMA"]));
  check(`[local-demonstrative] ${question} starts fresh`, turn.turnKind, "new_topic");
  check(`[local-demonstrative] ${question} never inherits SINAMA`, turn.referents.join("|"), expected.join("|"));
}
for (const question of [
  "Bu projeyi AJOOP ile karşılaştır.",
  "This project should be compared with AJOOP.",
  "That project should be compared with AJOOP.",
  "Compare this project with AJOOP.",
]) {
  const turn = resolveTurn(question, sinamaHistory, portfolioState(["SINAMA"]));
  check(`[contextual-generic-np] ${question} continues`, turn.turnKind, "continuation");
  check(`[contextual-generic-np] ${question} binds generic NP to prior project`, turn.referents.join("|"), "SINAMA|Ajoop Portfolio Copilot");
}
{
  const ajoopOnlyHistory = [user("AJOOP'u anlat."), bot("Ajoop Portfolio Copilot bir portfolyo asistanıdır.")];
  const turn = resolveTurn(
    "AJOOP ile onu karşılaştır",
    ajoopOnlyHistory,
    portfolioState(["Ajoop Portfolio Copilot"]),
  );
  check("[distinct-comparison] deduplicated one-sided comparison is ambiguous", turn.turnKind, "ambiguous");
  check("[distinct-comparison] one entity is not presented as two sides", turn.referents.length, 0);
  check("[distinct-comparison] ambiguity reports missing distinct side", turn.unresolvedReason, "missing-distinct-comparison-referent");
}
const tripleHistory = [
  user("SINAMA, AJOOP ve CBOT deneyimlerini listele."),
  bot("SINAMA, Ajoop Portfolio Copilot ve CBOT öne çıkar."),
];
const triple = ["SINAMA", "Ajoop Portfolio Copilot", "CBOT"];
for (const question of ["ikisini karşılaştır", "both of them", "the two technically"]) {
  const turn = resolveTurn(question, tripleHistory, portfolioState(triple));
  check(`[exact-two] ${question} is ambiguous against three`, turn.turnKind, "ambiguous");
  check(`[exact-two] ${question} does not bind all three`, turn.referents.length, 0);
  check(`[exact-two] ${question} reports count ambiguity`, turn.unresolvedReason, "ambiguous-exact-two-antecedent");
}
for (const question of ["bunları karşılaştır", "compare them", "these technically"]) {
  const turn = resolveTurn(question, tripleHistory, portfolioState(triple));
  check(`[generic-plural] ${question} retains all bounded refs`, turn.referents.join("|"), triple.join("|"));
}
{
  const truncated = resolveTurn(
    "ikisini karşılaştır",
    tripleHistory,
    portfolioState(triple.slice(0, 2), triple.slice(0, 2)),
  );
  check("[ordered-hint] ranked triple cannot be prefix-truncated", truncated.browserHint, "rejected");
  check("[ordered-hint] real triple makes exact-two ambiguous", truncated.turnKind, "ambiguous");
  check("[ordered-hint] rejected prefix supplies no pair", truncated.referents.length, 0);
  check("[ordered-hint] ambiguity comes from three real antecedents", truncated.unresolvedReason, "ambiguous-exact-two-antecedent");
}

/* D/E/F. Previous answer/topic transformations retain scope and subjects. */
const appliedHistory = [
  user("Beni Applied AI tarafına bağlayan deneyimler hangileri?"),
  bot("SINAMA, Outlier AI ve CBOT bu bağı destekler."),
];
for (const [question, depth, operation] of [
  ["Az önceki cevabı tek cümlede tekrar et.", "summary", "summarize"],
  ["aynısını daha teknik anlat", "more_detail", "expand"],
  ["önceki konuyu kısa anlat", "shorter", "shorten"],
]) {
  const turn = resolveTurn(question, appliedHistory, portfolioState([], []));
  check(`[previous-answer] ${question} continues`, turn.turnKind, "continuation");
  check(`[previous-answer] ${question} retains portfolio scope`, turn.contextScope, "portfolio");
  check(`[previous-answer] ${question} depth`, turn.requestedDepth, depth);
  check(`[previous-answer] ${question} operation`, turn.requestedOperation, operation);
  check(`[previous-answer] ${question} stays portfolio eligible`, plan(question, appliedHistory, portfolioState([], [])).contextEligible, true);
}

/* Chain 6: plural state survives multiple changes of presentation. */
const comparisonInitial = resolveTurn("SINAMA ile AJOOP arasındaki fark ne?");
const comparisonState = buildNextPublicConversationState({
  resolvedTurn: comparisonInitial,
  answer: comparisonHistory[1].content,
  scope: "PORTFOLIO",
  entityIndex,
  question: "SINAMA ile AJOOP arasındaki fark ne?",
});
const pluralFromBuiltState = resolveTurn("bunları teknik karşılaştır", comparisonHistory, comparisonState);
check("[state-chain] initial comparison builds pair state", comparisonState.referents.join("|"), pair.join("|"));
check("[state-chain] generic plural consumes server-built pair", pluralFromBuiltState.referents.join("|"), pair.join("|"));
const technical = resolveTurn(
  "ikisini teknik açıdan biraz daha detaylı karşılaştır.",
  comparisonHistory,
  portfolioState(pair),
);
check("[chain-6] technical comparison keeps pair", technical.referents.join("|"), pair.join("|"));
const technicalState = buildNextPublicConversationState({
  resolvedTurn: technical,
  answer: "SINAMA ve Ajoop Portfolio Copilot farklı sorumluluklara sahiptir.",
  scope: "PORTFOLIO",
  entityIndex,
  question: "ikisini teknik açıdan biraz daha detaylı karşılaştır.",
});
const summaryHistory = [
  ...comparisonHistory,
  user("ikisini teknik açıdan biraz daha detaylı karşılaştır."),
  bot("SINAMA ve Ajoop Portfolio Copilot farklı sorumluluklara sahiptir."),
];
const summary = resolveTurn("kısa özetle.", summaryHistory, technicalState);
check("[chain-6] summary keeps pair", summary.referents.join("|"), pair.join("|"));
check("[chain-6] summary changes depth", summary.requestedDepth, "summary");

/* Chain 7: ordinal -> singular state -> pronoun is transitive. */
const ordinal = resolveTurn("Üçüncüsünü anlat.", rankedHistory, portfolioState(ranked, ranked));
const ordinalState = buildNextPublicConversationState({
  resolvedTurn: ordinal,
  answer: "Hospital Appointment System randevu iş akışını yönetir.",
  scope: "PORTFOLIO",
  entityIndex,
  question: "Üçüncüsünü anlat.",
});
const pronoun = resolveTurn(
  "Peki onun stack'i ne?",
  [...rankedHistory, user("Üçüncüsünü anlat."), bot("Hospital Appointment System randevu iş akışını yönetir.")],
  ordinalState,
);
check("[chain-7] ordinal becomes singular state", ordinalState.referents.join(), "Hospital Appointment System");
check("[chain-7] pronoun inherits ordinal selection", pronoun.primaryReferent, "Hospital Appointment System");

/* Chain 8: ranking -> server state -> ordinal -> server state -> another
 * ordinal. The active selection changes while the original order survives. */
const initialRanking = resolveTurn("Kaan'ın en güçlü 3 projesini söyle.");
const rankingState = buildNextPublicConversationState({
  resolvedTurn: initialRanking,
  answer: rankedHistory[1].content,
  scope: "PORTFOLIO",
  entityIndex,
  question: "Kaan'ın en güçlü 3 projesini söyle.",
});
const secondTurn = resolveTurn("İkinci olanı anlat.", rankedHistory, rankingState);
const secondState = buildNextPublicConversationState({
  resolvedTurn: secondTurn,
  answer: "SINAMA bir AI reliability projesidir.",
  scope: "PORTFOLIO",
  entityIndex,
  question: "İkinci olanı anlat.",
});
const thirdHistory = [...rankedHistory, user("İkinci olanı anlat."), bot("SINAMA bir AI reliability projesidir.")];
const thirdTurn = resolveTurn("Üçüncü olanın stack'i ne?", thirdHistory, secondState);
check("[state-chain] ranking builds original order", rankingState.orderedReferents.join("|"), ranked.join("|"));
check("[state-chain] second selection becomes active ref", secondState.referents.join(), "SINAMA");
check("[state-chain] second selection preserves original order", secondState.orderedReferents.join("|"), ranked.join("|"));
check("[state-chain] subsequent third ordinal uses original order", thirdTurn.primaryReferent, "Hospital Appointment System");

for (const [middleQuestion, middleAnswer, ordinalQuestion, expected] of [
  ["bunları karşılaştır", "Ajoop Portfolio Copilot, SINAMA ve Hospital Appointment System karşılaştırması.", "İkinciyi aç.", "SINAMA"],
  ["daha detaylı anlat", "Üç proje de farklı ürün ve otomasyon sorunlarına odaklanır.", "Üçüncüyü aç.", "Hospital Appointment System"],
]) {
  const middleTurn = resolveTurn(middleQuestion, rankedHistory, rankingState);
  const middleState = buildNextPublicConversationState({
    resolvedTurn: middleTurn, answer: middleAnswer, scope: "PORTFOLIO", entityIndex, question: middleQuestion,
  });
  const nextHistory = [...rankedHistory, user(middleQuestion), bot(middleAnswer)];
  const selected = resolveTurn(ordinalQuestion, nextHistory, middleState);
  check(`[ordered-chain] ${middleQuestion} preserves active ordered collection`, middleState.orderedReferents.join("|"), ranked.join("|"));
  check(`[ordered-chain] ${middleQuestion} preserves active result set`, middleState.referents.join("|"), ranked.join("|"));
  check(`[ordered-chain] ${ordinalQuestion} selects from original order`, selected.primaryReferent, expected);
}

/* Ordered public collections also support canonical organizations. */
const experienceQuestion = "Kaan'ın en güçlü 3 deneyimini listele.";
const experienceAnswer = "1. Outlier AI 2. CBOT 3. Ajoop Portfolio Copilot";
const experienceOrder = ["Outlier AI", "CBOT", "Ajoop Portfolio Copilot"];
const experienceInitial = resolveTurn(experienceQuestion);
const experienceState = buildNextPublicConversationState({
  resolvedTurn: experienceInitial, answer: experienceAnswer, scope: "PORTFOLIO", entityIndex, question: experienceQuestion,
});
const experienceOrdinal = resolveTurn(
  "İkinci deneyimi aç.",
  [user(experienceQuestion), bot(experienceAnswer)],
  experienceState,
);
check("[ordered-org] organizations form a canonical ordered collection", experienceState.orderedReferents.join("|"), experienceOrder.join("|"));
check("[ordered-org] ranked organizations become active referents", experienceState.referents.join("|"), experienceOrder.join("|"));
check("[ordered-org] ordinal selects canonical organization", experienceOrdinal.primaryReferent, "CBOT");
{
  const experienceHistory = [user(experienceQuestion), bot(experienceAnswer)];
  for (const question of ["bunları karşılaştır", "hangisi daha güçlü?", "which one is stronger?"]) {
    const turn = resolveTurn(question, experienceHistory, experienceState);
    check(`[ordered-org-plural] ${question} retains result set`, turn.referents.join("|"), experienceOrder.join("|"));
    check(`[ordered-org-plural] ${question} retains order`, turn.orderedReferents.join("|"), experienceOrder.join("|"));
  }
  const comparedQuestion = "bunları karşılaştır";
  const comparedAnswer = "Outlier AI, CBOT ve Ajoop Portfolio Copilot farklı deneyim türleridir.";
  const comparedTurn = resolveTurn(comparedQuestion, experienceHistory, experienceState);
  const comparedState = buildNextPublicConversationState({
    resolvedTurn: comparedTurn, answer: comparedAnswer, scope: "PORTFOLIO", entityIndex, question: comparedQuestion,
  });
  const selected = resolveTurn(
    "İkincisini aç.",
    [...experienceHistory, user(comparedQuestion), bot(comparedAnswer)],
    comparedState,
  );
  check("[ordered-org-chain] plural comparison preserves ordered collection", comparedState.orderedReferents.join("|"), experienceOrder.join("|"));
  check("[ordered-org-chain] following ordinal selects CBOT", selected.primaryReferent, "CBOT");
}

/* G. Explicit new topics beat any old browser state and preserve authority rules. */
for (const question of [
  "Python nedir? Portfolyoyla bağlamadan kısa anlat.",
  "Python nedir?",
  "CBOT nedir?",
  "Bitcoin şu an kaç dolar?",
]) {
  const result = plan(question, sinamaHistory, portfolioState(["SINAMA"]));
  check(`[new-topic] ${question} is self-contained`, result.discourse.turnKind, "new_topic");
  check(`[new-topic] ${question} inherits no SINAMA`, result.inheritedEntities.length, 0);
  check(`[new-topic] ${question} has no forced portfolio RAG`, result.contextEligible, false);
}
{
  const result = plan("AJOOP ne işe yarıyor?", sinamaHistory, portfolioState(["SINAMA"]));
  check("[new-topic] explicit AJOOP replaces SINAMA", result.activeProjects.join(), "Ajoop Portfolio Copilot");
  check("[new-topic] explicit AJOOP inherits nothing", result.inheritedEntities.length, 0);
}
{
  const result = plan("Hospital Appointment System hangi teknolojilerle geliştirildi?", sinamaHistory, portfolioState(["SINAMA"]));
  check("[new-topic] explicit project switch wins", result.activeProjects.join(), "Hospital Appointment System");
}

/* Required negative controls: unresolved structure never invents authority. */
for (const [question, reason] of [
  ["ikinci olanı anlat", "missing-ordered-antecedent"],
  ["ikisinin farkı ne?", "missing-plural-antecedent"],
  ["onu anlat", "missing-singular-antecedent"],
]) {
  const turn = resolveTurn(question, [], { version: 1, scope: null, referents: [], orderedReferents: [] });
  check(`[negative] ${question} is ambiguous`, turn.turnKind, "ambiguous");
  check(`[negative] ${question} invents no referent`, turn.referents.length, 0);
  check(`[negative] ${question} reports why`, turn.unresolvedReason, reason);
}

/* Stale and hostile browser hints are rejected against the actual history. */
const ajoopHistory = [user("AJOOP'u anlat."), bot("Ajoop Portfolio Copilot yerel bir portfolyo asistanıdır.")];
{
  const turn = resolveTurn("onu biraz aç", ajoopHistory, portfolioState(["SINAMA"]));
  check("[hint] stale SINAMA hint is rejected", turn.browserHint, "rejected");
  check("[hint] history-supported AJOOP wins", turn.primaryReferent, "Ajoop Portfolio Copilot");
}
for (const hostile of ["secret-owner-memory", "does-not-exist"] ) {
  const turn = resolveTurn("onu biraz aç", ajoopHistory, portfolioState([hostile]));
  check(`[hint] ${hostile} is rejected`, turn.browserHint, "rejected");
  check(`[hint] ${hostile} creates no authority`, turn.primaryReferent, "Ajoop Portfolio Copilot");
}
{
  const oldPortfolioThenGeneral = [
    user("SINAMA'yı anlat."), bot("SINAMA bir projedir."),
    user("Python nedir?"), bot("Python genel amaçlı bir dildir."),
  ];
  const turn = resolveTurn("bunu biraz aç", oldPortfolioThenGeneral, portfolioState([]));
  check("[hint] an old portfolio scope cannot cross a fresh general topic", turn.contextScope, null);
  check("[hint] stale portfolio scope is rejected after a fresh general topic", turn.browserHint, "rejected");
}
{
  const staleRankedHistory = [
    ...rankedHistory,
    user("Python nedir?"), bot("Python genel amaçlı bir programlama dilidir."),
  ];
  const staleGeneralRank = { version: 1, scope: "general", referents: ranked, orderedReferents: ranked };
  const turn = resolveTurn("İkinci olanı anlat.", staleRankedHistory, staleGeneralRank);
  const retrieval = plan("İkinci olanı anlat.", staleRankedHistory, staleGeneralRank);
  check("[active-segment] general-scoped ranked hint is rejected", turn.browserHint, "rejected");
  check("[active-segment] ordinal beyond fresh Python boundary is ambiguous", turn.turnKind, "ambiguous");
  check("[active-segment] stale rank inherits no project", turn.referents.length, 0);
  check("[active-segment] stale rank grants no portfolio authority", retrieval.contextEligible, false);
}
{
  /* A portfolio answer with no usable ranking produces no ordered state. The
   * unresolved ordinal then produces the GENERAL boundary used by the next
   * turn; this models the actual server/browser transition instead of injecting
   * the final state in isolation. Ranking prose quality belongs to A5.3.2. */
  const rankingQuestion = "Kaan'ın en güçlü 3 projesini söyle.";
  const rankingAnswer = "Portfolio, Kaan'ın en güçlü 3 projesi hakkında bilgi vermez.";
  const rankingTurn = resolveTurn(rankingQuestion);
  const rankingState = buildNextPublicConversationState({
    resolvedTurn: rankingTurn, answer: rankingAnswer, scope: "PORTFOLIO", entityIndex, question: rankingQuestion,
  });
  check("[clarification-barrier] unsupported ranking stores no referents", rankingState.referents.length, 0);
  check("[clarification-barrier] unsupported ranking stores no order", rankingState.orderedReferents.length, 0);

  const rankingHistory = [user(rankingQuestion), bot(rankingAnswer)];
  const ordinalQuestion = "İkinci olanı anlat.";
  const ordinalTurn = resolveTurn(ordinalQuestion, rankingHistory, rankingState);
  check("[clarification-barrier] unresolved ordinal is ambiguous", ordinalTurn.turnKind, "ambiguous");
  check("[clarification-barrier] unresolved ordinal keeps no old referent", ordinalTurn.referents.length, 0);
  const clarificationAnswer = "Hangi sıralı listeyi kastettiğini göremiyorum.";
  const clarificationState = buildNextPublicConversationState({
    resolvedTurn: ordinalTurn, answer: clarificationAnswer, scope: "GENERAL", entityIndex, question: ordinalQuestion,
  });
  check("[clarification-barrier] clarification emits general state", clarificationState.scope, "general");

  const clarificationHistory = [
    ...rankingHistory, user(ordinalQuestion), bot(clarificationAnswer),
  ];
  const technical = resolveTurn("Bunu daha teknik anlat.", clarificationHistory, clarificationState);
  const technicalPlan = plan("Bunu daha teknik anlat.", clarificationHistory, clarificationState);
  check("[clarification-barrier] contextual turn remains ambiguous", technical.turnKind, "ambiguous");
  check("[clarification-barrier] accepted general state is retained", technical.contextScope, "general");
  check("[clarification-barrier] old portfolio referent is not resurrected", technical.referents.length, 0);
  check("[clarification-barrier] old portfolio authority is not resurrected", technicalPlan.contextEligible, false);
}
{
  const generalState = { version: 1, scope: "general", referents: [], orderedReferents: [] };
  const bounded = resolveTurn("Daha detaylı.", sinamaHistory, generalState);
  const boundedPlan = plan("Daha detaylı.", sinamaHistory, generalState);
  check("[general-state-barrier] accepted state remains general", bounded.contextScope, "general");
  check("[general-state-barrier] history contributes no old referent", bounded.referents.length, 0);
  check("[general-state-barrier] history contributes no portfolio authority", boundedPlan.contextEligible, false);
  check("[general-state-barrier] portfolio-only prose is excluded from generation history", boundedPlan.generationHistory.length, 0);
}
{
  const valid = resolveTurn("Daha teknik anlat.", sinamaHistory, portfolioState(["SINAMA"]));
  check("[general-state-positive] valid portfolio state continues", valid.turnKind, "continuation");
  check("[general-state-positive] valid portfolio state retains SINAMA", valid.primaryReferent, "SINAMA");
  check("[general-state-positive] valid portfolio state retains authority", valid.contextScope, "portfolio");
}
{
  const explicitOwner = plan("Kaan Outlier AI'da ne yaptı?");
  check("[general-state-positive] fresh explicit owner is portfolio", explicitOwner.contextEligible, true);
  check("[general-state-positive] fresh explicit owner activates Outlier", explicitOwner.activeOrganizations.join(), "Outlier AI");
  const ownerless = plan("Outlier AI şirket ortamı nasıl?");
  check("[general-state-negative] ownerless organization stays general", ownerless.contextEligible, false);
  check("[general-state-negative] ownerless organization activates no employer", ownerless.activeOrganizations.length, 0);
}
{
  const nodeQuestion = "Node.js event loop nasıl çalışır?";
  const nodeAnswer = "Node.js event loop görevleri aşamalar halinde işler.";
  const nodeTurn = resolveTurn(nodeQuestion, sinamaHistory, portfolioState(["SINAMA"]));
  const nodeState = buildNextPublicConversationState({
    resolvedTurn: nodeTurn, answer: nodeAnswer, scope: "GENERAL", entityIndex, question: nodeQuestion,
  });
  const nodeHistory = [...sinamaHistory, user(nodeQuestion), bot(nodeAnswer)];
  const local = resolveTurn("Bunu daha teknik anlat.", nodeHistory, nodeState);
  const localPlan = plan("Bunu daha teknik anlat.", nodeHistory, nodeState);
  check("[general-segment] local textual reference remains a continuation", local.turnKind, "continuation");
  check("[general-segment] server-built state remains general", local.contextScope, "general");
  check("[general-segment] local continuation cannot recover SINAMA", local.referents.includes("SINAMA"), false);
  check("[general-segment] local continuation has no portfolio authority", localPlan.contextEligible, false);
  check("[general-segment] generation keeps the completed Node.js exchange", localPlan.generationHistory.length, 2);
  check("[general-segment] generation starts at the Node.js boundary", localPlan.generationHistory[0]?.content, nodeQuestion);
}
{
  /* Build the boundary through the same fresh GENERAL transition the server
   * uses, then make its harmless prose adversarial by mentioning two canonical
   * projects. Those answer-only names are presentation, never authority. */
  const generalQuestion = "Yazılım mimarisi örnekleri nelerdir?";
  const incidentalAnswer = "Genel örneklerde SINAMA ve Ajoop Portfolio Copilot adları anılabilir.";
  const generalTurn = resolveTurn(generalQuestion, sinamaHistory, portfolioState(["SINAMA"]));
  const generalState = buildNextPublicConversationState({
    resolvedTurn: generalTurn, answer: incidentalAnswer, scope: "GENERAL", entityIndex, question: generalQuestion,
  });
  const incidentalHistory = [...sinamaHistory, user(generalQuestion), bot(incidentalAnswer)];
  for (const question of ["İkisini karşılaştır.", "Bunları karşılaştır.", "İkincisini anlat."]) {
    const turn = resolveTurn(question, incidentalHistory, generalState);
    const retrieval = plan(question, incidentalHistory, generalState);
    check(`[answer-referent-barrier] ${question} remains ambiguous`, turn.turnKind, "ambiguous");
    check(`[answer-referent-barrier] ${question} keeps accepted GENERAL state`, turn.contextScope, "general");
    check(`[answer-referent-barrier] ${question} promotes no incidental answer entity`, turn.referents.length, 0);
    check(`[answer-referent-barrier] ${question} grants no portfolio authority`, retrieval.contextEligible, false);
    check(`[answer-referent-barrier] ${question} activates no project`, retrieval.activeProjects.length, 0);
  }
}
for (const [label, state, expectedHint] of [
  ["absent", undefined, "absent"],
  ["invalid", { version: 99, scope: "general", referents: [], orderedReferents: [] }, "rejected"],
]) {
  const fallback = resolveTurn("Daha teknik anlat.", sinamaHistory, state);
  check(`[history-fallback] ${label} state preserves continuation`, fallback.turnKind, "continuation");
  check(`[history-fallback] ${label} state preserves SINAMA`, fallback.primaryReferent, "SINAMA");
  check(`[history-fallback] ${label} state preserves portfolio authority`, fallback.contextScope, "portfolio");
  check(`[history-fallback] ${label} state reports validation status`, fallback.browserHint, expectedHint);
}
{
  const narrowedPair = resolveTurn("bunu biraz aç", comparisonHistory, portfolioState(["SINAMA"]));
  check("[hint] a browser cannot arbitrarily narrow a validated pair", narrowedPair.browserHint, "rejected");
  check("[hint] singular reference against a pair stays ambiguous", narrowedPair.turnKind, "ambiguous");
  check("[hint] server invents no singular selection from the pair", narrowedPair.referents.length, 0);
}
{
  const genericHistory = [
    user("Bir project için career experience nasıl yazılır?"),
    bot("Genel olarak somut sonuç ve sorumluluk yazılır."),
  ];
  const forged = resolveTurn("önceki cevabı kısalt", genericHistory, portfolioState([]));
  check("[authority] generic frame nouns reject forged portfolio scope", forged.browserHint, "rejected");
  check("[authority] forged scope grants no portfolio authority", forged.contextScope, null);
}
{
  for (const organization of ["CBOT", "Outlier AI", "Atölye Joyday"]) {
    const history = [user(`${organization} nedir?`), bot(`${organization} hakkında genel bir tanım.`)];
    const forgedState = portfolioState([organization]);
    check(`[organization-authority-class] bare ${organization} definition is general`, plan(`${organization} nedir?`).contextEligible, false);
    check(`[organization-authority-class] bare ${organization} cannot validate portfolio scope`, resolveTurn("Daha detaylı.", history, forgedState).browserHint, "rejected");
    check(`[organization-authority-class] inherited ${organization} alone stays general`, plan("Daha detaylı.", history, forgedState).contextEligible, false);
  }
  for (const question of [
    "CBOT nasıl bir şirket?",
    "What companies does Outlier AI own?",
    "What did CBOT build?",
    "CBOT ve onun amacı ne?",
    "Outlier AI and its purpose?",
    "Joyday ne yapıyor?",
    "CBOT'un durumu nedir?",
    "What kind of company is Outlier AI?",
    "CBOT hangi ürünleri geliştirdi?",
    "Outlier AI hangi hizmetleri sunuyor?",
    "CBOT'ta ne yaptı?",
    ...RECRUITER_LIKE_ORGANIZATION_QUESTIONS,
  ]) {
    const result = plan(question, sinamaHistory, portfolioState(["SINAMA"]));
    check(`[organization-general] ${question} starts fresh`, result.discourse.turnKind, "new_topic");
    check(`[organization-general] ${question} inherits no stale project`, result.inheritedEntities.length, 0);
    check(`[organization-general] ${question} has no portfolio authority`, result.contextEligible, false);
    check(`[organization-general] ${question} activates no employer`, result.activeOrganizations.length, 0);
    check(`[organization-general] ${question} exposes no experience focus`, result.experienceFocus, null);
  }
  const generalOrganizationQuestion = "CBOT ve onun amacı ne?";
  const generalOrganizationAnswer = "CBOT conversational AI alanında çalışan bir şirkettir.";
  const generalOrganizationTurn = resolveTurn(generalOrganizationQuestion, sinamaHistory, portfolioState(["SINAMA"]));
  const generalOrganizationState = buildNextPublicConversationState({
    resolvedTurn: generalOrganizationTurn,
    answer: generalOrganizationAnswer,
    scope: "GENERAL",
    entityIndex,
    question: generalOrganizationQuestion,
  });
  const generalOrganizationHistory = [
    ...sinamaHistory,
    user(generalOrganizationQuestion), bot(generalOrganizationAnswer),
  ];
  const generalOrganizationNext = plan("Daha detaylı.", generalOrganizationHistory, generalOrganizationState);
  check("[organization-general-chain] local possessive never becomes owner provenance", generalOrganizationNext.discourse.contextScope, "general");
  check("[organization-general-chain] next continuation remains without portfolio authority", generalOrganizationNext.contextEligible, false);
  for (const question of [
    "Kaan'ın CBOT deneyimini anlat.",
    "CBOT'ta Kaan ne yaptı?",
    "Kaan'ın Outlier AI deneyimi neydi?",
    "Joyday'de Kaan teknik olarak ne yaptı?",
    "What did Kaan do at CBOT?",
    "Tell me about Kaan's experience at Outlier AI.",
  ]) {
    check(`[organization-owner] ${question} retains portfolio authority`, plan(question).contextEligible, true);
  }
  for (const [question, organization] of OWNER_RECRUITER_CONTROLS) {
    const result = plan(question);
    check(`[recruiter-authority] ${question} retains portfolio authority`, result.contextEligible, true);
    check(`[recruiter-authority] ${question} activates the requested employer`, result.activeOrganizations.join(), organization);
  }
  const bareOrganizationHistory = [user("CBOT nedir?"), bot("CBOT bir conversational AI şirketidir.")];
  const forged = resolveTurn("Daha detaylı.", bareOrganizationHistory, portfolioState(["CBOT"]));
  const forgedPlan = plan("Daha detaylı.", bareOrganizationHistory, portfolioState(["CBOT"]));
  check("[organization-authority] bare organization rejects forged scope", forged.browserHint, "rejected");
  check("[organization-authority] bare organization retains no portfolio scope", forged.contextScope, null);
  check("[organization-authority] inherited organization alone grants no retrieval authority", forgedPlan.contextEligible, false);

  const ownerQuestion = "Kaan'ın CBOT deneyimini anlat.";
  const ownerAnswer = "Kaan'ın CBOT deneyimi conversational AI ürün çalışmasını kapsar.";
  const ownerTurn = resolveTurn(ownerQuestion);
  const ownerState = buildNextPublicConversationState({
    resolvedTurn: ownerTurn, answer: ownerAnswer, scope: "PORTFOLIO", entityIndex, question: ownerQuestion,
  });
  const ownerHistory = [user(ownerQuestion), bot(ownerAnswer)];
  const continued = resolveTurn("Daha detaylı.", ownerHistory, ownerState);
  check("[organization-authority] explicit owner provenance validates state", continued.browserHint, "accepted");
  check("[organization-authority] owner provenance retains portfolio scope", continued.contextScope, "portfolio");
  check("[organization-authority] owner-scoped organization remains active", continued.referents.join(), "CBOT");
  check("[organization-authority] owner-scoped continuation remains eligible", plan("Daha detaylı.", ownerHistory, ownerState).contextEligible, true);
}

/* Ranking intent requires an actual list/order request, not an isolated
 * adjective or digit that happens to coexist with a multi-entity answer. */
for (const question of ["SINAMA güçlü bir proje mi?", "AJOOP 3 yıldır var mı?"]) {
  const turn = resolveTurn(question);
  const state = buildNextPublicConversationState({
    resolvedTurn: turn,
    answer: "SINAMA, Ajoop Portfolio Copilot ve CBOT birlikte anılabilir.",
    scope: "PORTFOLIO",
    entityIndex,
    question,
  });
  check(`[ranking-negative] ${question} creates no ordered collection`, state.orderedReferents.length, 0);
}
for (const question of [
  "Kaan'ın en güçlü 3 projesini söyle.",
  "En iyi üç projeyi söyle.",
  "İlk üç projeyi sırala.",
  "List the top three projects.",
]) {
  const turn = resolveTurn(question);
  const state = buildNextPublicConversationState({
    resolvedTurn: turn,
    answer: rankedHistory[1].content,
    scope: "PORTFOLIO",
    entityIndex,
    question,
  });
  check(`[ranking-positive] ${question} creates exact ordered triple`, state.orderedReferents.join("|"), ranked.join("|"));
  check(`[ranking-positive] ${question} makes ranking active`, state.referents.join("|"), ranked.join("|"));
}

/* A broad answer remains broad; one coincidental project mention cannot narrow
 * the next previous-answer transformation. */
{
  const broadQuestion = "Beni Applied AI tarafına bağlayan deneyimler hangileri?";
  const broadAnswer = "SINAMA, CBOT ve Outlier AI bu bağı destekler.";
  const broadTurn = resolveTurn(broadQuestion);
  const broadState = buildNextPublicConversationState({
    resolvedTurn: broadTurn, answer: broadAnswer, scope: "PORTFOLIO", entityIndex, question: broadQuestion,
  });
  const transformed = resolveTurn(
    "Az önceki cevabı tek cümlede özetle.",
    [user(broadQuestion), bot(broadAnswer)],
    broadState,
  );
  check("[broad-state] broad answer does not auto-narrow to SINAMA", broadState.referents.length, 0);
  check("[broad-state] previous-answer transform is a continuation", transformed.turnKind, "continuation");
  check("[broad-state] previous-answer transform retains portfolio scope", transformed.contextScope, "portfolio");
  check("[broad-state] previous-answer transform retains whole answer", transformed.referents.length, 0);
}

/* Broad technical nouns do not inherit old portfolio context by themselves. */
for (const question of [
  "Yazılım mimarisi nedir?",
  "Database ne işe yarar?",
  "Technical debt nedir?",
  "HTTP status nedir?",
  "Architecture?",
]) {
  const result = plan(question, sinamaHistory, portfolioState(["SINAMA"]));
  check(`[ellipsis] ${question} starts a new topic`, result.discourse.turnKind, "new_topic");
  check(`[ellipsis] ${question} inherits no project`, result.inheritedEntities.length, 0);
  check(`[ellipsis] ${question} gains no portfolio authority`, result.contextEligible, false);
}
for (const question of ["onun stack'i", "peki mimarisi", "stack?", "daha teknik anlat"]) {
  const turn = resolveTurn(question, sinamaHistory, portfolioState(["SINAMA"]));
  check(`[ellipsis-positive] ${question} continues`, turn.turnKind, "continuation");
  check(`[ellipsis-positive] ${question} retains SINAMA`, turn.primaryReferent, "SINAMA");
}

/* The model receives exact resolved constraints, but no extra resolver call. */
ok("resolved constraints name both canonical referents", discourseConstraintText(technical).includes(pair.join("; ")));
{
  const broad = resolveTurn("Az önceki cevabı tek cümlede özetle.", appliedHistory, portfolioState([], []));
  const constraints = discourseConstraintText(broad);
  ok("[broad-constraints] operation is preserved without entity refs", constraints.includes("Requested operation: summarize"));
  ok("[broad-constraints] depth is preserved without entity refs", constraints.includes("Requested depth: summary"));
  check("[broad-constraints] empty canonical set is not emitted as a lock", constraints.includes("Canonical referents:"), false);
  check("[broad-constraints] no rediscovery prohibition exists without refs", constraints.includes("Do not replace or rediscover"), false);
}
check("semantic resolver is not used", technical.semanticResolutionUsed, false);

/* End-to-end ambiguity: zero per-turn embedding and generation calls. */
{
  const state = { embed: 0, chat: 0, built: false, prompts: [] };
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).includes("/api/chat")) {
      state.chat += 1;
      const prompt = body.messages.map((message) => message.content).join("\n");
      state.prompts.push(prompt);
      const scope = prompt.includes("The first line must be exactly: SCOPE: PORTFOLIO") ? "PORTFOLIO" : "GENERAL";
      return { ok: true, json: async () => ({ message: { content: ` ${scope}\nANSWER: SINAMA için stub yanıt.` } }) };
    }
    state.embed += 1;
    return { ok: true, json: async () => ({ embeddings: body.input.map(() => [0, 1, 0]) }) };
  };
  const rag = createAjoopRag({
    env: { AJOOP_AI_ALLOWED_ORIGINS: "https://kaanbalci.com", AJOOP_AI_RATE_MAX: "1000" },
    fetchImpl,
  });
  await rag.initialize();
  state.built = true;
  const before = { embed: state.embed, chat: state.chat };
  const response = await rag.handle({
    method: "POST",
    origin: "https://kaanbalci.com",
    contentType: "application/json",
    body: JSON.stringify({
      version: 1,
      mode: "rag",
      question: "ikinci olanı anlat",
      locale: "tr",
      history: [],
      conversationState: { version: 1, scope: null, referents: [], orderedReferents: [] },
    }),
  });
  check("[e2e] unresolved ordinal is a safe clarification", response.body.answerMode, "clarify-reference");
  check("[e2e] unresolved ordinal performs no retrieval", state.embed - before.embed, 0);
  check("[e2e] unresolved ordinal performs no generation", state.chat - before.chat, 0);
  check("[e2e] response exposes only sanitized discourse kind", response.body.discourse.turnKind, "ambiguous");

  const staleRankedHistory = [
    ...rankedHistory,
    user("Python nedir?"), bot("Python genel amaçlı bir programlama dilidir."),
  ];
  const staleBefore = { embed: state.embed, chat: state.chat };
  const staleOrdinal = await rag.handle({
    method: "POST",
    origin: "https://kaanbalci.com",
    contentType: "application/json",
    body: JSON.stringify({
      version: 1,
      mode: "rag",
      question: "İkinci olanı anlat.",
      locale: "tr",
      history: staleRankedHistory,
      conversationState: { version: 1, scope: "general", referents: ranked, orderedReferents: ranked },
    }),
  });
  check("[e2e-active-segment] stale ordinal is a safe clarification", staleOrdinal.body.answerMode, "clarify-reference");
  check("[e2e-active-segment] stale general-ranked hint is rejected", staleOrdinal.body.discourse.browserHint, "rejected");
  check("[e2e-active-segment] stale ordinal performs no retrieval", state.embed - staleBefore.embed, 0);
  check("[e2e-active-segment] stale ordinal performs no generation", state.chat - staleBefore.chat, 0);

  const rankingQuestion = "Kaan'ın en güçlü 3 projesini söyle.";
  const ranking = await rag.handle({
    method: "POST",
    origin: "https://kaanbalci.com",
    contentType: "application/json",
    body: JSON.stringify({ version: 1, mode: "rag", question: rankingQuestion, locale: "tr", history: [] }),
  });
  check("[e2e-clarification-barrier] ranking answer has no ordered state", ranking.body.conversationState.orderedReferents.length, 0);
  const rankingConversation = [user(rankingQuestion), bot(ranking.body.answer)];
  const ordinalQuestion = "İkinci olanı anlat.";
  const ordinal = await rag.handle({
    method: "POST",
    origin: "https://kaanbalci.com",
    contentType: "application/json",
    body: JSON.stringify({
      version: 1, mode: "rag", question: ordinalQuestion, locale: "tr",
      history: rankingConversation, conversationState: ranking.body.conversationState,
    }),
  });
  check("[e2e-clarification-barrier] ordinal safely clarifies", ordinal.body.answerMode, "clarify-reference");
  check("[e2e-clarification-barrier] ordinal emits general state", ordinal.body.conversationState.scope, "general");
  const clarificationConversation = [
    ...rankingConversation, user(ordinalQuestion), bot(ordinal.body.answer),
  ];
  const technicalBefore = { embed: state.embed, chat: state.chat };
  const technical = await rag.handle({
    method: "POST",
    origin: "https://kaanbalci.com",
    contentType: "application/json",
    body: JSON.stringify({
      version: 1, mode: "rag", question: "Bunu daha teknik anlat.", locale: "tr",
      history: clarificationConversation, conversationState: ordinal.body.conversationState,
    }),
  });
  check("[e2e-clarification-barrier] next contextual turn safely clarifies", technical.body.answerMode, "clarify-reference");
  check("[e2e-clarification-barrier] next contextual turn stays general", technical.body.scope, "general");
  check("[e2e-clarification-barrier] next contextual turn retains no referent", technical.body.discourse.referents.length, 0);
  check("[e2e-clarification-barrier] next contextual turn performs no retrieval", state.embed - technicalBefore.embed, 0);
  check("[e2e-clarification-barrier] next contextual turn performs no generation", state.chat - technicalBefore.chat, 0);
  check("[e2e-clarification-barrier] next contextual turn exposes no sources", technical.body.sources.length, 0);

  const directGeneralBefore = { embed: state.embed, chat: state.chat };
  const directGeneral = await rag.handle({
    method: "POST",
    origin: "https://kaanbalci.com",
    contentType: "application/json",
    body: JSON.stringify({
      version: 1, mode: "rag", question: "Daha detaylı anlat.", locale: "tr",
      history: sinamaHistory,
      conversationState: { version: 1, scope: "general", referents: [], orderedReferents: [] },
    }),
  });
  check("[e2e-general-history-barrier] accepted GENERAL stays general", directGeneral.body.scope, "general");
  check("[e2e-general-history-barrier] portfolio-only history performs no retrieval", state.embed - directGeneralBefore.embed, 0);
  check("[e2e-general-history-barrier] general continuation performs one generation", state.chat - directGeneralBefore.chat, 1);
  check("[e2e-general-history-barrier] portfolio-only history exposes no sources", directGeneral.body.sources.length, 0);
  check("[e2e-general-history-barrier] portfolio-only history exposes no retrieved evidence", directGeneral.body.retrievedSources.length, 0);
  check("[e2e-general-history-barrier] portfolio-only history exposes no evidence", directGeneral.body.evidence.length, 0);
  check("[e2e-general-history-barrier] generation prompt excludes the old SINAMA question", state.prompts.at(-1).includes("SINAMA'yı anlat."), false);

  for (const [label, malformedHistory] of [
    ["assistant then user", [bot("orphan assistant"), user("orphan user")]],
    ["two assistants then user", [bot("orphan one"), bot("orphan two"), user("orphan user")]],
  ]) {
    const malformedBefore = { embed: state.embed, chat: state.chat };
    const malformed = await rag.handle({
      method: "POST",
      origin: "https://kaanbalci.com",
      contentType: "application/json",
      body: JSON.stringify({
        version: 1, mode: "rag", question: "Bunu daha teknik anlat.", locale: "tr",
        history: malformedHistory,
        conversationState: { version: 1, scope: "general", referents: [], orderedReferents: [] },
      }),
    });
    check(`[e2e-textual-antecedent] ${label} safely clarifies`, malformed.body.answerMode, "clarify-reference");
    check(`[e2e-textual-antecedent] ${label} is ambiguous`, malformed.body.discourse.turnKind, "ambiguous");
    check(`[e2e-textual-antecedent] ${label} performs no retrieval`, state.embed - malformedBefore.embed, 0);
    check(`[e2e-textual-antecedent] ${label} performs no generation`, state.chat - malformedBefore.chat, 0);
    check(`[e2e-textual-antecedent] ${label} exposes no sources`, malformed.body.sources.length, 0);
    check(`[e2e-textual-antecedent] ${label} exposes no retrieved evidence`, malformed.body.retrievedSources.length, 0);
    check(`[e2e-textual-antecedent] ${label} exposes no evidence`, malformed.body.evidence.length, 0);
  }

  const organizationQuestion = "Outlier AI ve CBOT nedir?";
  const organizationAnswer = "Outlier AI ve CBOT iki farklı organizasyondur.";
  const organizationTurn = resolveTurn(organizationQuestion);
  const organizationState = buildNextPublicConversationState({
    resolvedTurn: organizationTurn,
    answer: organizationAnswer,
    scope: "GENERAL",
    entityIndex,
    question: organizationQuestion,
  });
  const organizationHistory = [user(organizationQuestion), bot(organizationAnswer)];
  for (const question of ["İkisini karşılaştır.", "Bunları karşılaştır."]) {
    const organizationBefore = { embed: state.embed, chat: state.chat };
    const organization = await rag.handle({
      method: "POST",
      origin: "https://kaanbalci.com",
      contentType: "application/json",
      body: JSON.stringify({
        version: 1, mode: "rag", question, locale: "tr",
        history: organizationHistory, conversationState: organizationState,
      }),
    });
    check(`[e2e-general-world-pair] ${question} stays GENERAL`, organization.body.scope, "general");
    check(`[e2e-general-world-pair] ${question} preserves both organizations`, organization.body.discourse.referents.join("|"), "CBOT|Outlier AI");
    check(`[e2e-general-world-pair] ${question} performs no portfolio retrieval`, state.embed - organizationBefore.embed, 0);
    check(`[e2e-general-world-pair] ${question} performs one general generation`, state.chat - organizationBefore.chat, 1);
    check(`[e2e-general-world-pair] ${question} exposes no sources`, organization.body.sources.length, 0);
    check(`[e2e-general-world-pair] ${question} exposes no retrieved evidence`, organization.body.retrievedSources.length, 0);
    check(`[e2e-general-world-pair] ${question} exposes no evidence`, organization.body.evidence.length, 0);
  }
  const ordinalBefore = { embed: state.embed, chat: state.chat };
  const ordinalOrganization = await rag.handle({
    method: "POST",
    origin: "https://kaanbalci.com",
    contentType: "application/json",
    body: JSON.stringify({
      version: 1, mode: "rag", question: "İkincisini anlat.", locale: "tr",
      history: organizationHistory, conversationState: organizationState,
    }),
  });
  check("[e2e-general-world-order] ordinal resolves the second textual organization", ordinalOrganization.body.discourse.primaryReferent, "CBOT");
  check("[e2e-general-world-order] ordinal stays GENERAL", ordinalOrganization.body.scope, "general");
  check("[e2e-general-world-order] ordinal performs no portfolio retrieval", state.embed - ordinalBefore.embed, 0);
  check("[e2e-general-world-order] ordinal performs one general generation", state.chat - ordinalBefore.chat, 1);
  check("[e2e-general-world-order] ordinal exposes no sources", ordinalOrganization.body.sources.length, 0);
  check("[e2e-general-world-order] ordinal exposes no retrieved evidence", ordinalOrganization.body.retrievedSources.length, 0);
  check("[e2e-general-world-order] ordinal exposes no evidence", ordinalOrganization.body.evidence.length, 0);

  const incidentalQuestion = "Yazılım mimarisi örnekleri nelerdir?";
  const incidentalAnswer = "Genel örneklerde SINAMA ve Ajoop Portfolio Copilot adları anılabilir.";
  const incidentalTurn = resolveTurn(incidentalQuestion, sinamaHistory, portfolioState(["SINAMA"]));
  const incidentalState = buildNextPublicConversationState({
    resolvedTurn: incidentalTurn, answer: incidentalAnswer, scope: "GENERAL", entityIndex, question: incidentalQuestion,
  });
  const incidentalHistory = [...sinamaHistory, user(incidentalQuestion), bot(incidentalAnswer)];
  for (const question of ["İkisini karşılaştır.", "Bunları karşılaştır.", "İkincisini anlat."]) {
    const incidentalBefore = { embed: state.embed, chat: state.chat };
    const response = await rag.handle({
      method: "POST",
      origin: "https://kaanbalci.com",
      contentType: "application/json",
      body: JSON.stringify({
        version: 1, mode: "rag", question, locale: "tr",
        history: incidentalHistory, conversationState: incidentalState,
      }),
    });
    check(`[e2e-answer-referent-barrier] ${question} safely clarifies`, response.body.answerMode, "clarify-reference");
    check(`[e2e-answer-referent-barrier] ${question} stays GENERAL`, response.body.scope, "general");
    check(`[e2e-answer-referent-barrier] ${question} performs no retrieval`, state.embed - incidentalBefore.embed, 0);
    check(`[e2e-answer-referent-barrier] ${question} performs no generation`, state.chat - incidentalBefore.chat, 0);
    check(`[e2e-answer-referent-barrier] ${question} exposes no sources`, response.body.sources.length, 0);
    check(`[e2e-answer-referent-barrier] ${question} exposes no retrieved evidence`, response.body.retrievedSources.length, 0);
  }

  for (const question of [
    "What is Python and what is it used for?",
    "Python ve onun amacı nedir?",
    "CBOT nasıl bir şirket?",
    "What companies does Outlier AI own?",
    "What did CBOT build?",
    "CBOT ve onun amacı ne?",
    "Outlier AI and its purpose?",
    "Joyday ne yapıyor?",
    "CBOT'un durumu nedir?",
    "What kind of company is Outlier AI?",
    "CBOT hangi ürünleri geliştirdi?",
    "Outlier AI hangi hizmetleri sunuyor?",
    "CBOT'ta ne yaptı?",
    ...RECRUITER_LIKE_ORGANIZATION_QUESTIONS,
  ]) {
    const generalBefore = { embed: state.embed, chat: state.chat };
    const general = await rag.handle({
      method: "POST",
      origin: "https://kaanbalci.com",
      contentType: "application/json",
      body: JSON.stringify({
        version: 1, mode: "rag", question, locale: "en", history: sinamaHistory,
        conversationState: portfolioState(["SINAMA"]),
      }),
    });
    check(`[e2e-general-boundary] ${question} is GENERAL`, general.body.scope, "general");
    check(`[e2e-general-boundary] ${question} starts fresh`, general.body.discourse.turnKind, "new_topic");
    check(`[e2e-general-boundary] ${question} carries no stale SINAMA`, general.body.discourse.referents.includes("SINAMA"), false);
    check(`[e2e-general-boundary] ${question} persists general state without authority`, general.body.conversationState.referents.length, 0);
    check(`[e2e-general-boundary] ${question} performs no portfolio retrieval`, state.embed - generalBefore.embed, 0);
    check(`[e2e-general-boundary] ${question} performs one general generation`, state.chat - generalBefore.chat, 1);
    check(`[e2e-general-boundary] ${question} selects general answer mode`, general.body.answerMode, "general");
    check(`[e2e-general-boundary] ${question} exposes no portfolio sources`, general.body.sources.length, 0);
    check(`[e2e-general-boundary] ${question} retrieves no source family`, general.body.retrievedSources.length, 0);
  }

  for (const question of RECRUITER_LIKE_ORGANIZATION_QUESTIONS) {
    const freshBefore = { embed: state.embed, chat: state.chat };
    const fresh = await rag.handle({
      method: "POST",
      origin: "https://kaanbalci.com",
      contentType: "application/json",
      body: JSON.stringify({ version: 1, mode: "rag", question, locale: "en", history: [] }),
    });
    check(`[e2e-recruiter-fresh] ${question} is GENERAL`, fresh.body.scope, "general");
    check(`[e2e-recruiter-fresh] ${question} selects general answer mode`, fresh.body.answerMode, "general");
    check(`[e2e-recruiter-fresh] ${question} performs no portfolio retrieval`, state.embed - freshBefore.embed, 0);
    check(`[e2e-recruiter-fresh] ${question} performs one general generation`, state.chat - freshBefore.chat, 1);
    check(`[e2e-recruiter-fresh] ${question} exposes no portfolio sources`, fresh.body.sources.length, 0);
    check(`[e2e-recruiter-fresh] ${question} retrieves no source family`, fresh.body.retrievedSources.length, 0);
  }

  for (const [question, organization, expectedSource] of OWNER_RECRUITER_CONTROLS) {
    const ownerBefore = { embed: state.embed, chat: state.chat };
    const owner = await rag.handle({
      method: "POST",
      origin: "https://kaanbalci.com",
      contentType: "application/json",
      body: JSON.stringify({ version: 1, mode: "rag", question, locale: "en", history: [] }),
    });
    const sourceIds = owner.body.sources.map((source) => source.entityId);
    const experienceIds = sourceIds.filter((id) => id.startsWith("experience:"));
    check(`[e2e-recruiter-owner] ${question} is PORTFOLIO`, owner.body.scope, "portfolio");
    ok(`[e2e-recruiter-owner] ${question} keeps a portfolio answer mode`, owner.body.answerMode !== "general");
    check(`[e2e-recruiter-owner] ${question} performs one portfolio embedding`, state.embed - ownerBefore.embed, 1);
    check(`[e2e-recruiter-owner] ${question} performs one generation`, state.chat - ownerBefore.chat, 1);
    ok(`[e2e-recruiter-owner] ${question} includes ${organization} evidence`, sourceIds.includes(expectedSource));
    ok(`[e2e-recruiter-owner] ${question} excludes rival employer evidence`, experienceIds.every((id) => id === expectedSource));
  }

  const distinctBefore = { embed: state.embed, chat: state.chat };
  const distinctComparison = await rag.handle({
    method: "POST",
    origin: "https://kaanbalci.com",
    contentType: "application/json",
    body: JSON.stringify({
      version: 1,
      mode: "rag",
      question: "AJOOP ile onu karşılaştır",
      locale: "tr",
      history: [user("AJOOP'u anlat."), bot("Ajoop Portfolio Copilot bir portfolyo asistanıdır.")],
      conversationState: portfolioState(["Ajoop Portfolio Copilot"]),
    }),
  });
  check("[e2e-distinct] one-sided comparison safely clarifies", distinctComparison.body.answerMode, "clarify-reference");
  check("[e2e-distinct] one-sided comparison performs no retrieval", state.embed - distinctBefore.embed, 0);
  check("[e2e-distinct] one-sided comparison performs no generation", state.chat - distinctBefore.chat, 0);

  for (const question of ["onun LinkedIn'i ne?", "ikisinin CV'si nerede?", "ikinci olanın GitHub linki ne?"]) {
    const exactCollisionBefore = { embed: state.embed, chat: state.chat };
    const collision = await rag.handle({
      method: "POST",
      origin: "https://kaanbalci.com",
      contentType: "application/json",
      body: JSON.stringify({
        version: 1, mode: "rag", question, locale: "tr", history: [],
        conversationState: { version: 1, scope: null, referents: [], orderedReferents: [] },
      }),
    });
    check(`[exact-order] ${question} clarifies before exact facts`, collision.body.answerMode, "clarify-reference");
    check(`[exact-order] ${question} performs no retrieval`, state.embed - exactCollisionBefore.embed, 0);
    check(`[exact-order] ${question} performs no generation`, state.chat - exactCollisionBefore.chat, 0);
    check(`[exact-order] ${question} leaks no exact fact`, collision.body.exactFact, undefined);
  }

  const exactBefore = { embed: state.embed, chat: state.chat };
  const exact = await rag.handle({
    method: "POST",
    origin: "https://kaanbalci.com",
    contentType: "application/json",
    body: JSON.stringify({
      version: 1, mode: "rag", question: "Kaan'ın LinkedIn'i ne?", locale: "tr", history: [],
    }),
  });
  check("[exact-order] self-contained canonical fact still resolves", exact.body.answerMode, "portfolio-fact");
  check("[exact-order] canonical fact performs no retrieval", state.embed - exactBefore.embed, 0);
  check("[exact-order] canonical fact performs no generation", state.chat - exactBefore.chat, 0);

  const continuationBefore = { embed: state.embed, chat: state.chat };
  const continuation = await rag.handle({
    method: "POST",
    origin: "https://kaanbalci.com",
    contentType: "application/json",
    body: JSON.stringify({
      version: 1,
      mode: "rag",
      question: "Daha detaylı.",
      locale: "tr",
      history: [user("SINAMA'yı anlat."), bot("SINAMA bir projedir.")],
      conversationState: portfolioState(["SINAMA"]),
    }),
  });
  check("[e2e] continuation performs one retrieval", state.embed - continuationBefore.embed, 1);
  check("[e2e] continuation performs one generation", state.chat - continuationBefore.chat, 1);
  check("[e2e] canonical response state retains SINAMA", continuation.body.conversationState.referents.join(), "SINAMA");
  check("[e2e] generation receives resolved referent", state.prompts.at(-1).includes("Canonical referents: SINAMA"), true);

  const broadBefore = { embed: state.embed, chat: state.chat };
  const broadSummary = await rag.handle({
    method: "POST",
    origin: "https://kaanbalci.com",
    contentType: "application/json",
    body: JSON.stringify({
      version: 1,
      mode: "rag",
      question: "Az önceki cevabı tek cümlede özetle.",
      locale: "tr",
      history: appliedHistory,
      conversationState: portfolioState([], []),
    }),
  });
  const broadPrompt = state.prompts.at(-1);
  check("[prompt-e2e] broad transformation performs one retrieval", state.embed - broadBefore.embed, 1);
  ok("[prompt-e2e] broad transformation stays within normal generation/repair budget", state.chat - broadBefore.chat >= 1 && state.chat - broadBefore.chat <= 2);
  check("[prompt-e2e] broad transformation stays a continuation", broadSummary.body.discourse.turnKind, "continuation");
  ok("[prompt-e2e] prompt carries summarize operation", broadPrompt.includes("Requested operation: summarize"));
  ok("[prompt-e2e] prompt carries summary depth", broadPrompt.includes("Requested depth: summary"));
  check("[prompt-e2e] prompt has no empty canonical subject lock", broadPrompt.includes("Canonical referents: none"), false);
  check("[prompt-e2e] prompt has no referent rediscovery ban", broadPrompt.includes("Do not replace or rediscover"), false);
}

if (failures.length) {
  console.error(`Ajoop discourse: ${failures.length} failure(s), ${passed} passed.\n`);
  failures.forEach((failure) => console.error(`  x ${failure}\n`));
  process.exit(1);
}
console.log(`Ajoop discourse contracts passed. ${passed} assertions · multi-turn and negative state chains · no network, no live Ollama.`);
