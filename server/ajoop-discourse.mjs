/**
 * Canonical public discourse resolution for bounded multi-turn Ajoop turns.
 *
 * This module owns structure, not prose: explicit topic changes, singular and
 * plural antecedents, ordered-result positions, previous-answer references and
 * presentation depth. Browser state is only a hint and is accepted solely when
 * the bounded history independently supports every canonical public entity.
 */
import { foldQuestion, hasPhrase, tokenize } from "./ajoop-text.mjs";
import { mentionsPortfolioOwner, resolveEntities } from "./ajoop-entities.mjs";

export const PUBLIC_DISCOURSE_STATE_VERSION = 1;
const MAX_REFERENTS = 4;
const REFERENT_TYPES = new Set(["person", "project", "organization"]);
const ORDERED_REFERENT_TYPES = new Set(["project", "organization"]);

const unique = (values) => [...new Set(values.filter(Boolean))].slice(0, MAX_REFERENTS);
const phrases = (text, values) => values.some((value) => hasPhrase(text, value));

function typedEntities(question, entityIndex) {
  return resolveEntities(question, entityIndex).map((entity) => ({
    ...entity,
    type: entityIndex?.entities?.find((candidate) => candidate.canonical === entity.canonical)?.type || "technology",
  }));
}

function discourseEntities(question, entityIndex) {
  const referents = typedEntities(question, entityIndex).filter((entity) => REFERENT_TYPES.has(entity.type));
  const namedSubjects = referents.filter((entity) => entity.type !== "person");
  if (namedSubjects.length) return namedSubjects;
  /* In "Kaan'ın en güçlü projeleri" Kaan grants portfolio authority, but he is
   * not one of the result referents. The returned projects establish those. */
  if (/\b(?:proje\w*|project\w*)\b/.test(foldQuestion(question))) return [];
  return referents;
}

function aliasPosition(text, alias) {
  const padded = ` ${text} `;
  const index = padded.indexOf(` ${alias} `);
  return index < 0 ? Number.POSITIVE_INFINITY : index;
}

/** Canonical public entities mentioned in textual order, never index order. */
export function canonicalMentionsInOrder(value, entityIndex, { projectsOnly = false } = {}) {
  const text = foldQuestion(value);
  if (!text || !entityIndex?.entities?.length) return [];
  return entityIndex.entities
    .filter((entity) => (!projectsOnly || entity.type === "project") && REFERENT_TYPES.has(entity.type))
    .map((entity) => ({
      canonical: entity.canonical,
      position: Math.min(...entity.aliases.map((alias) => aliasPosition(text, alias))),
    }))
    .filter((item) => Number.isFinite(item.position))
    .sort((left, right) => left.position - right.position)
    .map((item) => item.canonical)
    .filter((canonical, index, all) => all.indexOf(canonical) === index)
    .slice(0, MAX_REFERENTS);
}

function requestedDepth(text) {
  if (phrases(text, ["tek cumle", "one sentence"]) || /\b(?:ozet\w*|summar\w*)\b/.test(text)) return "summary";
  if (/\b(?:kisa\w*|shorter|briefly|concise)\b/.test(text)) return "shorter";
  if (/\b(?:detay\w*|detail\w*|expand\w*)\b/.test(text)
      || phrases(text, ["daha teknik", "more technical", "teknik anlat"])
      || phrases(text, ["biraz daha ac", "biraz ac", "daha ac", "daha fazla", "tell me more"])) return "more_detail";
  return "default";
}

function ordinalPosition(text) {
  const tokens = tokenize(text);
  const roots = [
    { position: 0, pattern: /^(?:ilk\w*|birinci\w*|first)$/ },
    { position: 1, pattern: /^(?:ikinci\w*|second)$/ },
    { position: 2, pattern: /^(?:ucuncu\w*|third)$/ },
    { position: 3, pattern: /^(?:dorduncu\w*|fourth)$/ },
  ];
  return roots.find((entry) => tokens.some((token) => entry.pattern.test(token)))?.position ?? null;
}

function referenceShape(text) {
  const tokens = tokenize(text);
  const exactTwo = tokens.some((token) => /^(?:ikisi\w*|both)$/.test(token))
    || phrases(text, ["her iki", "the two"]);
  const genericPlural = tokens.some((token) => /^(?:bunlar\w*|sunlar\w*|hangisi\w*|them|these|those)$/.test(token))
    || phrases(text, ["which one"]);
  const singular = tokens.some((token) => /^(?:o|bu|this|that|orada|there|onu|onun|ona|onda|ondan|bunu|bunun|buna|bunda|bundan|sunu|sunun|suna|sunda|it|its)$/.test(token))
    || phrases(text, ["that one", "this one"]);
  const previousAnswer = phrases(text, [
    "az onceki cevap", "biraz onceki cevap", "onceki cevap", "previous answer", "same answer", "aynisini",
  ]);
  const previousTopic = phrases(text, [
    "az onceki konu", "biraz onceki konu", "onceki konu", "previous topic", "oraya don",
  ]);
  return { exactTwo, genericPlural, plural: exactTwo || genericPlural, singular, previousAnswer, previousTopic };
}

function requestedOperation(text, shape, depth) {
  if (/\b(?:karsilastir\w*|compare\w*|fark\w*|ortak\w*|difference\w*|common)\b/.test(text)) return "compare";
  if (depth === "summary") return "summarize";
  if (depth === "shorter") return "shorten";
  if (depth === "more_detail") return "expand";
  if (shape.previousAnswer && /\b(?:tekrar\w*|repeat)\b/.test(text)) return "repeat";
  return "answer";
}

function explicitGeneralReset(text) {
  return phrases(text, [
    "portfolyoyla baglamadan", "portfolyoya baglamadan", "portfolyodan bagimsiz",
    "without linking it to the portfolio", "without the portfolio", "not about the portfolio",
  ]);
}

function continuationCues(question) {
  const text = foldQuestion(question);
  const depth = requestedDepth(text);
  const shape = referenceShape(text);
  const ordinal = ordinalPosition(text);
  const marker = phrases(text, ["peki", "what about", "how about", "devam", "continue", "go on"]);
  /* Only unmistakable ellipsis is a continuation. Broad domain words such as
   * "architecture" or "database" are valid self-contained new topics. */
  const tokens = tokenize(text);
  const attribute = tokens.length <= 2 && tokens.some((token) => /^(?:stack\w*|teknoloji\w*|technology\w*)$/.test(token));
  return {
    text,
    depth,
    ordinal,
    ...shape,
    continuation: marker || attribute || depth !== "default" || ordinal !== null
      || shape.plural || shape.singular || shape.previousAnswer || shape.previousTopic,
  };
}

function entityTokenSpans(question, entities) {
  const tokens = tokenize(foldQuestion(question));
  const spans = [];
  entities.forEach((entity) => {
    const alias = tokenize(entity.matched || "");
    if (!alias.length) return;
    for (let index = 0; index <= tokens.length - alias.length; index += 1) {
      if (!alias.every((token, offset) => tokens[index + offset] === token)) continue;
      spans.push({ start: index, end: index + alias.length, entity });
      break;
    }
  });
  return { tokens, spans };
}

/**
 * One bounded lexical classification shared by live resolution and history
 * replay. A local possessive binds to the nearest preceding named subject;
 * earlier names and old turns are not recruited merely because the sentence
 * also contains a comparison coordinator.
 */
export function classifyPublicLocalReferences(question, entities = []) {
  const { tokens, spans } = entityTokenSpans(question, entities);
  const referenceIndexes = tokens
    .map((token, index) => (/^(?:o|bu|this|that|onu|onun|bunu|bunun|sunu|sunun|it|its)$/.test(token) ? index : -1))
    .filter((index) => index >= 0);
  const possessiveIndexes = tokens
    .map((token, index) => (/^(?:onun|bunun|sunun|its)$/.test(token) ? index : -1))
    .filter((index) => index >= 0);
  const firstEntity = Math.min(...spans.map((span) => span.start));
  const localDemonstrative = spans.some((span) => {
    /* Permit a small bounded adjective span ("bu yeni AJOOP", "this local
     * AJOOP") but never cross a coordinator/comparison boundary. */
    for (let distance = 1; distance <= 3 && span.start - distance >= 0; distance += 1) {
      const candidate = tokens[span.start - distance];
      const between = tokens.slice(span.start - distance + 1, span.start);
      if (between.some((token) => /^(?:proje\w*|project\w*|ve|ile|and|with|then|sonra|karsilastir\w*|compare\w*)$/.test(token))) break;
      if (/^(?:bu|this|that)$/.test(candidate)) return true;
    }
    return false;
  });
  const localPossessive = possessiveIndexes.some((possessiveIndex) =>
    spans.some((span) => span.end <= possessiveIndex),
  );
  const singularAfterEntity = referenceIndexes.some((referenceIndex) =>
    spans.some((span) => span.end <= referenceIndex),
  );
  return Object.freeze({
    localDemonstrative,
    localPossessive,
    singularAfterEntity,
    contextualReferenceFirst: referenceIndexes.some((index) => index < firstEntity),
  });
}

function turnStructure(question, entityIndex) {
  const currentEntities = typedEntities(question, entityIndex);
  const currentReferents = discourseEntities(question, entityIndex);
  const cues = continuationCues(question);
  const explicitReferents = unique(currentReferents.map((entity) => entity.canonical));
  const references = classifyPublicLocalReferences(question, currentEntities);
  const comparisonRequested = requestedOperation(cues.text, cues, cues.depth) === "compare";
  const mixedSingular = explicitReferents.length === 1 && cues.singular && comparisonRequested
    && !references.localDemonstrative && !references.localPossessive;
  const hasStructuralReference = cues.ordinal !== null || cues.plural || cues.singular
    || cues.previousAnswer || cues.previousTopic;
  const ownerOverview = mentionsPortfolioOwner(question)
    && /\b(?:deneyim\w*|experience\w*|kariyer\w*|career|beceri\w*|skill\w*)\b/.test(cues.text);
  const explicitReset = explicitGeneralReset(cues.text);
  const localCurrentReference = currentEntities.length > 0
    && (references.localPossessive || (!comparisonRequested && references.singularAfterEntity));
  const fresh = explicitReset || ownerOverview
    || (explicitReferents.length > 0 && !mixedSingular)
    || localCurrentReference
    || (!hasStructuralReference && (currentEntities.length > 0 || !cues.continuation));
  return {
    currentEntities,
    currentReferents,
    explicitReferents,
    cues,
    references,
    comparisonRequested,
    mixedSingular,
    explicitReset,
    fresh,
  };
}

/**
 * The canonical bounded segment that still belongs to the active topic.
 *
 * Fresh user turns are the normal boundary. A server-validated GENERAL state
 * can also de-escalate a structurally contextual turn (for example, an
 * unresolved ordinal followed by a clarification). When that accepted state
 * conflicts with portfolio authority in the otherwise-active segment, the
 * earliest completed suffix without that authority is the stable server-owned
 * boundary. Generated history must not carry the older portfolio exchange
 * across it, and unmatched messages never establish a boundary.
 */
export function activeDiscourseSegment(history, entityIndex, boundary = null) {
  const bounded = Array.isArray(history) ? history : [];
  const completed = [];
  for (let index = 0; index < bounded.length - 1; index += 1) {
    if (bounded[index]?.role === "user" && bounded[index + 1]?.role === "assistant") {
      completed.push(bounded[index], bounded[index + 1]);
      index += 1;
    }
  }
  let active = completed;
  for (let index = completed.length - 2; index >= 0; index -= 2) {
    if (turnStructure(completed[index].content, entityIndex).fresh) {
      active = completed.slice(index);
      break;
    }
  }
  const acceptedGeneralBoundary = boundary?.stateStatus === "accepted"
    && boundary?.contextScope === "general";
  if (!acceptedGeneralBoundary || !activeHistorySupportsPortfolio(active, entityIndex)) {
    return Object.freeze({ history: Object.freeze(active), generalBoundaryApplied: false });
  }
  for (let index = 0; index < active.length; index += 2) {
    const suffix = active.slice(index);
    if (!activeHistorySupportsPortfolio(suffix, entityIndex)) {
      return Object.freeze({ history: Object.freeze(suffix), generalBoundaryApplied: true });
    }
  }
  return Object.freeze({ history: Object.freeze([]), generalBoundaryApplied: true });
}

export function activeDiscourseHistory(history, entityIndex, boundary = null) {
  return activeDiscourseSegment(history, entityIndex, boundary).history;
}

function activeHistorySupportsPortfolio(active, entityIndex) {
  const users = active.filter((item) => item.role === "user").slice(-4).reverse();
  for (const item of users) {
    const allEntities = typedEntities(item.content, entityIndex);
    const entities = discourseEntities(item.content, entityIndex);
    const local = classifyPublicLocalReferences(item.content, allEntities);
    if ((mentionsPortfolioOwner(item.content) && !local.localPossessive)
        || entities.some((entity) => entity.type === "person" || entity.type === "project")) return true;
    const text = foldQuestion(item.content);
    /* A first-person portfolio relation is an authority-bearing frame. Generic
     * nouns (project, career, hire...) are intentionally not. */
    if (/\bbeni\b.*\b(?:baglayan|uygun|fit)\w*\b/.test(text)
        || /\b(?:my|me)\b.*\b(?:experience|fit|qualif\w*)\b/.test(text)) return true;
    if (!continuationCues(item.content).continuation) return false;
  }
  return false;
}

function nearestExplicitReferentsInSegment(activeHistory, entityIndex) {
  const users = activeHistory.filter((item) => item.role === "user");
  const priorReferents = (before) => {
    for (let index = before - 1; index >= 0; index -= 1) {
      const entities = discourseEntities(users[index].content, entityIndex);
      if (entities.length) return unique(entities.map((entity) => entity.canonical));
      if (!continuationCues(users[index].content).continuation) break;
    }
    return [];
  };
  for (let index = users.length - 1; index >= 0; index -= 1) {
    const item = users[index];
    const entities = discourseEntities(item.content, entityIndex);
    if (entities.length) {
      const structure = turnStructure(item.content, entityIndex);
      const { cues, references } = structure;
      const explicit = unique(entities.map((entity) => entity.canonical));
      const contextualMixed = explicit.length === 1 && cues.singular
        && structure.comparisonRequested
        && !references.localDemonstrative
        && !references.localPossessive;
      if (!contextualMixed) return explicit;
      const prior = priorReferents(index);
      if (prior.length !== 1) return explicit;
      const antecedentFirst = references.contextualReferenceFirst;
      return unique(antecedentFirst ? [...prior, ...explicit] : [...explicit, ...prior]);
    }
    if (!continuationCues(item.content).continuation) break;
  }
  return [];
}

function nearestExplicitReferents(history, entityIndex) {
  return nearestExplicitReferentsInSegment(activeDiscourseHistory(history, entityIndex), entityIndex);
}

function generalWorldReferents(referents, entityIndex) {
  const types = new Map((entityIndex?.entities || []).map((entity) => [entity.canonical, entity.type]));
  return referents.filter((canonical) => types.get(canonical) === "organization");
}

function nearestOrderedWorldReferentsInSegment(activeHistory, entityIndex) {
  const users = activeHistory.filter((item) => item.role === "user");
  const orderedOrganizations = (value) => generalWorldReferents(
    canonicalMentionsInOrder(value, entityIndex),
    entityIndex,
  );
  const priorReferents = (before) => {
    for (let index = before - 1; index >= 0; index -= 1) {
      const ordered = orderedOrganizations(users[index].content);
      if (ordered.length) return ordered;
      if (!continuationCues(users[index].content).continuation) break;
    }
    return [];
  };
  for (let index = users.length - 1; index >= 0; index -= 1) {
    const item = users[index];
    const ordered = orderedOrganizations(item.content);
    if (ordered.length) {
      const structure = turnStructure(item.content, entityIndex);
      const contextualMixed = ordered.length === 1 && structure.cues.singular
        && structure.comparisonRequested
        && !structure.references.localDemonstrative
        && !structure.references.localPossessive;
      if (!contextualMixed) return ordered;
      const prior = priorReferents(index);
      if (prior.length !== 1) return ordered;
      return unique(structure.references.contextualReferenceFirst
        ? [...prior, ...ordered]
        : [...ordered, ...prior]);
    }
    if (!continuationCues(item.content).continuation) break;
  }
  return [];
}

function latestAssistantReferents(history, entityIndex) {
  const answer = [...activeDiscourseHistory(history, entityIndex)].reverse()
    .find((item) => item.role === "assistant")?.content || "";
  return canonicalMentionsInOrder(answer, entityIndex);
}

function orderedAnswerReferents(value, entityIndex) {
  const allowed = new Set((entityIndex?.entities || [])
    .filter((entity) => ORDERED_REFERENT_TYPES.has(entity.type))
    .map((entity) => entity.canonical));
  return canonicalMentionsInOrder(value, entityIndex).filter((canonical) => allowed.has(canonical));
}

function latestRankedAssistantReferents(history, entityIndex) {
  const active = activeDiscourseHistory(history, entityIndex);
  for (let index = active.length - 1; index >= 0; index -= 1) {
    const item = active[index];
    if (item?.role !== "assistant") continue;
    let userIndex = index - 1;
    while (userIndex >= 0 && active[userIndex]?.role !== "user") userIndex -= 1;
    if (userIndex < 0 || !rankingRequest(active[userIndex].content)) continue;
    const ordered = orderedAnswerReferents(item.content, entityIndex);
    if (ordered.length >= 2) return ordered;
  }
  return [];
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseStateHint(raw, entityIndex) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.version !== PUBLIC_DISCOURSE_STATE_VERSION) return null;
  const known = new Set((entityIndex?.entities || []).filter((entity) => REFERENT_TYPES.has(entity.type)).map((entity) => entity.canonical));
  const read = (value) => {
    if (!Array.isArray(value) || value.length > MAX_REFERENTS) return null;
    if (value.some((item) => typeof item !== "string" || !known.has(item))) return null;
    const result = unique(value);
    return result.length === value.length ? result : null;
  };
  const referents = read(raw.referents);
  const orderedReferents = read(raw.orderedReferents);
  const scope = raw.scope === null || raw.scope === "general" || raw.scope === "portfolio" ? raw.scope : null;
  if (raw.scope !== null && scope === null) return null;
  if (scope === "general" && (referents?.length || orderedReferents?.length)) return null;
  return referents && orderedReferents ? { scope, referents, orderedReferents } : null;
}

function historySupportsPortfolio(history, entityIndex) {
  return activeHistorySupportsPortfolio(activeDiscourseHistory(history, entityIndex), entityIndex);
}

function validateStateHint(raw, history, entityIndex) {
  if (raw === undefined || raw === null) return { status: "absent", scope: null, referents: [], orderedReferents: [] };
  const parsed = parseStateHint(raw, entityIndex);
  if (!parsed) return { status: "rejected", scope: null, referents: [], orderedReferents: [] };
  const anchor = nearestExplicitReferents(history, entityIndex);
  const answer = latestAssistantReferents(history, entityIndex);
  const rankedAnswer = latestRankedAssistantReferents(history, entityIndex);
  const orderedSupported = !parsed.orderedReferents.length
    || (rankedAnswer.length >= 2 && sameValues(parsed.orderedReferents, rankedAnswer));
  const directlySupported = anchor.length
    ? sameValues(parsed.referents, anchor)
    : sameValues(parsed.referents, answer);
  const orderedSetSupported = parsed.orderedReferents.length >= 2
    && orderedSupported
    && sameValues(parsed.referents, parsed.orderedReferents);
  const referentsSupported = !parsed.referents.length || directlySupported || orderedSetSupported;
  const scopeSupported = parsed.scope !== "portfolio" || historySupportsPortfolio(history, entityIndex);
  if (!referentsSupported || !orderedSupported || !scopeSupported) {
    return { status: "rejected", scope: null, referents: [], orderedReferents: [] };
  }
  return { status: "accepted", ...parsed };
}

/** Resolve one current turn from bounded public input. */
export function resolvePublicDiscourseTurn({ question, history = [], conversationState, entityIndex }) {
  const structure = turnStructure(question, entityIndex);
  const { currentEntities, currentReferents, cues } = structure;
  const hint = validateStateHint(conversationState, history, entityIndex);
  const nonEmptyHint = Boolean(
    conversationState
      && (conversationState.scope || conversationState.referents?.length || conversationState.orderedReferents?.length),
  );
  const explicitReset = structure.explicitReset;
  const activeSegment = activeDiscourseSegment(history, entityIndex, {
    stateStatus: hint.status,
    contextScope: hint.scope,
  });
  const activeCompletedHistory = activeSegment.history;
  const historicalReferents = nearestExplicitReferents(history, entityIndex);
  const answerReferents = latestAssistantReferents(history, entityIndex);
  /* An accepted GENERAL state is an authority boundary produced by the prior
   * server turn. It may de-escalate older portfolio history, so only absent or
   * rejected state may fall back to history-derived referents and scope. */
  const acceptedGeneralBoundary = hint.status === "accepted" && hint.scope === "general";
  const safeSegmentReferents = nearestExplicitReferentsInSegment(activeCompletedHistory, entityIndex);
  const fallbackHistoricalReferents = acceptedGeneralBoundary
    ? generalWorldReferents(safeSegmentReferents, entityIndex)
    : historicalReferents;
  const fallbackAnswerReferents = acceptedGeneralBoundary ? [] : answerReferents;
  const fallbackOrderedReferents = acceptedGeneralBoundary
    ? nearestOrderedWorldReferentsInSegment(activeCompletedHistory, entityIndex)
    : fallbackAnswerReferents;
  const explicitReferents = structure.explicitReferents;
  /* Historical state never creates a mixed turn by itself. Cross-turn mixing
   * needs comparison semantics and a genuinely contextual form; a possessive
   * after the local named subject ("AJOOP and its purpose") stays local. */
  const { comparisonRequested, mixedSingular, fresh } = structure;
  let referents = [];
  let continuationSource = "none";
  let unresolvedReason = null;

  if (mixedSingular) {
    const candidates = hint.referents.length ? hint.referents : fallbackHistoricalReferents;
    if (candidates.length === 1) {
      const antecedentFirst = structure.references.contextualReferenceFirst;
      referents = unique(antecedentFirst ? [...candidates, ...explicitReferents] : [...explicitReferents, ...candidates]);
      if (comparisonRequested && referents.length < 2) {
        referents = [];
        unresolvedReason = "missing-distinct-comparison-referent";
      } else continuationSource = hint.referents.length ? "validated-state-mixed" : "history-mixed";
    } else {
      unresolvedReason = candidates.length ? "ambiguous-singular-antecedent" : "missing-singular-antecedent";
    }
  } else if (fresh) {
    referents = explicitReferents;
    if (referents.length) continuationSource = "message";
  } else if (cues.ordinal !== null) {
    const ordered = hint.orderedReferents.length ? hint.orderedReferents : fallbackOrderedReferents;
    if (ordered[cues.ordinal]) {
      referents = [ordered[cues.ordinal]];
      continuationSource = hint.orderedReferents.length ? "validated-state-ordinal" : "history-ordinal";
    } else {
      unresolvedReason = "missing-ordered-antecedent";
    }
  } else if (cues.exactTwo) {
    const candidates = hint.referents.length >= 2
      ? hint.referents
      : fallbackHistoricalReferents.length >= 2
        ? fallbackHistoricalReferents
        : fallbackAnswerReferents;
    if (candidates.length === 2) {
      referents = candidates;
      continuationSource = hint.referents.length >= 2 ? "validated-state-exact-two" : "history-exact-two";
    } else if (candidates.length > 2) {
      unresolvedReason = "ambiguous-exact-two-antecedent";
    } else {
      unresolvedReason = "missing-plural-antecedent";
    }
  } else if (cues.genericPlural) {
    const candidates = hint.referents.length >= 2
      ? hint.referents
      : fallbackHistoricalReferents.length >= 2
        ? fallbackHistoricalReferents
        : fallbackAnswerReferents;
    if (candidates.length >= 2) {
      referents = candidates;
      continuationSource = hint.referents.length >= 2 ? "validated-state-plural" : "history-plural";
    } else unresolvedReason = "missing-plural-antecedent";
  } else {
    referents = hint.referents.length ? hint.referents : fallbackHistoricalReferents;
    if (cues.singular && referents.length > 1) {
      referents = [];
      unresolvedReason = "ambiguous-singular-antecedent";
    } else if (referents.length) continuationSource = hint.referents.length ? "validated-state" : "history";
    else if (cues.singular) {
      /* A de-escalating boundary exchange can itself be a deterministic
       * clarification. It becomes textual context only after a subsequent
       * GENERAL exchange completes; fresh GENERAL and portfolio segments use
       * their first completed exchange normally. */
      const hasTextualAntecedent = activeCompletedHistory.length >= 2
        && (!acceptedGeneralBoundary || !activeHistorySupportsPortfolio(activeCompletedHistory, entityIndex))
        && (!activeSegment.generalBoundaryApplied || activeCompletedHistory.length >= 4);
      if (hasTextualAntecedent) continuationSource = "history-text";
      else unresolvedReason = "missing-singular-antecedent";
    }
  }

  const turnKind = unresolvedReason ? "ambiguous" : fresh ? "new_topic" : "continuation";
  const contextScope = fresh
    ? null
    : acceptedGeneralBoundary
      ? "general"
      : hint.scope === "portfolio" || historySupportsPortfolio(history, entityIndex)
      ? "portfolio"
      : hint.scope;
  return Object.freeze({
    turnKind,
    currentEntities: Object.freeze(currentEntities.map((entity) => Object.freeze({ ...entity }))),
    primaryReferent: referents[0] || null,
    referents: Object.freeze(referents),
    orderedReferents: Object.freeze(fresh
      ? []
      : hint.orderedReferents.length
        ? hint.orderedReferents
        : cues.ordinal !== null
          ? fallbackOrderedReferents
          : []),
    previousTopicReference: cues.previousTopic,
    previousAnswerReference: cues.previousAnswer,
    requestedDepth: cues.depth,
    requestedOperation: requestedOperation(cues.text, cues, cues.depth),
    explicitGeneralReset: explicitReset,
    contextScope,
    continuationSource,
    browserHint: fresh && nonEmptyHint ? "rejected" : hint.status,
    semanticResolutionUsed: false,
    confidence: unresolvedReason ? "none" : "high",
    unresolvedReason,
  });
}

function rankingRequest(question) {
  const text = foldQuestion(question);
  const collection = /\b(?:proje\w*|project\w*|deneyim\w*|experience\w*|sirket\w*|compan(?:y|ies)|employer\w*)\b/.test(text);
  const orderingVerb = /\b(?:sirala\w*|rank\w*|listele\w*|list(?:ed|ing)?)\b/.test(text);
  const superlative = /\b(?:top|best|strongest)\b/.test(text) || phrases(text, ["en guclu", "en iyi"]);
  const boundedCount = /\b(?:[2-9]|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|two|three|four|five|six|seven|eight|nine)\b/.test(text);
  return collection && (orderingVerb || (superlative && boundedCount));
}

/** State returned by the server for the next bounded turn. */
export function buildNextPublicConversationState({ resolvedTurn, answer, scope, entityIndex, question = "" }) {
  if (scope !== "PORTFOLIO" && scope !== "portfolio") {
    return Object.freeze({ version: PUBLIC_DISCOURSE_STATE_VERSION, scope: "general", referents: Object.freeze([]), orderedReferents: Object.freeze([]) });
  }
  const answerReferents = orderedAnswerReferents(answer, entityIndex);
  const rankedReferents = rankingRequest(question) && answerReferents.length >= 2 ? answerReferents : [];
  const orderedReferents = rankedReferents.length
    ? rankedReferents
    : resolvedTurn?.turnKind === "continuation" && resolvedTurn?.orderedReferents?.length
      ? unique([...resolvedTurn.orderedReferents])
      : [];
  const referents = rankedReferents.length
    ? rankedReferents
    : resolvedTurn?.referents?.length
      ? unique([...resolvedTurn.referents])
      : orderedReferents.length
      ? orderedReferents
      : [];
  return Object.freeze({
    version: PUBLIC_DISCOURSE_STATE_VERSION,
    scope: "portfolio",
    referents: Object.freeze(referents),
    orderedReferents: Object.freeze(orderedReferents),
  });
}

export function publicDiscourseDiagnostic(resolvedTurn) {
  return Object.freeze({
    turnKind: resolvedTurn.turnKind,
    primaryReferent: resolvedTurn.primaryReferent,
    referents: Object.freeze([...resolvedTurn.referents]),
    orderedReferents: Object.freeze([...resolvedTurn.orderedReferents]),
    previousTopicReference: resolvedTurn.previousTopicReference,
    previousAnswerReference: resolvedTurn.previousAnswerReference,
    requestedDepth: resolvedTurn.requestedDepth,
    requestedOperation: resolvedTurn.requestedOperation,
    contextScope: resolvedTurn.contextScope,
    continuationSource: resolvedTurn.continuationSource,
    browserHint: resolvedTurn.browserHint,
    semanticResolutionUsed: false,
    confidence: resolvedTurn.confidence,
    unresolvedReason: resolvedTurn.unresolvedReason,
  });
}

export function discourseConstraintText(resolvedTurn) {
  if (!resolvedTurn || resolvedTurn.turnKind !== "continuation") return "";
  const referentLock = resolvedTurn.referents.length ? [
    `Canonical referents: ${resolvedTurn.referents.join("; ")}`,
    "These canonical referents are server-validated structure. Do not replace or rediscover them from prose.",
  ] : [];
  return [
    ...referentLock,
    `Requested operation: ${resolvedTurn.requestedOperation}`,
    `Requested depth: ${resolvedTurn.requestedDepth}`,
  ].join("\n");
}
