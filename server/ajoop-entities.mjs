/**
 * Alias resolution: what canonical entity is this question talking about?
 *
 * The master knowledge already curates `aliases_and_typos`, so this module
 * indexes that rather than inventing a second alias source. Everything here
 * serves RETRIEVAL ONLY. The visitor's message is never rewritten and the model
 * always sees the question exactly as it was typed; resolved entities are
 * appended to the embedding query alone, where a canonical name pulls the right
 * records for a question that spelled the entity wrong.
 *
 * This is deliberately NOT fuzzy matching. There is no edit distance and no
 * near-miss scoring, because "close to a portfolio entity" is how `sinema`
 * becomes SINAMA and a film recommendation turns into a project pitch. The only
 * tolerance is curated aliases plus the bounded Turkish suffix handled in
 * ajoop-text.mjs.
 *
 * Exact facts are a SEPARATE mechanism in ajoop-facts.mjs. Resolving the word
 * "github" to the GitHub entity is not the same as deciding that the visitor
 * asked for Kaan's GitHub URL, and merging the two would be the intent router
 * this architecture does not have.
 */
import { foldPreservingDotless, foldQuestion, hasPhrase } from "./ajoop-text.mjs";

/**
 * Aliases that are also ordinary words, and the spelling that makes them so.
 *
 * This is the one code-level control map the alias system needs, and it stays
 * tiny on purpose. `sınama` with the Turkish dotless ı is the noun "testing";
 * `sinama` with a dotted i is not a Turkish word at all, which is why
 * ajoop-text.mjs keeps a fold that preserves the difference. A question that
 * uses the ordinary-word spelling has to show an independent portfolio signal
 * before it is read as being about the project.
 */
const AMBIGUOUS_SPELLINGS = Object.freeze({
  SINAMA: ["sınama"],
});

/**
 * Entities whose names are also ordinary subjects of general conversation.
 *
 * "GitHub nedir?" and "C# nedir?" are general-knowledge questions that happen
 * to contain a canonical name, and appending "canonical entities: GitHub" to
 * their retrieval query drags Kaan's records into a conversation that was never
 * about him. So these four resolve only when the question shows independently
 * that it is about his work.
 *
 * The list stays short and explicit rather than becoming a rule about all
 * aliases: SINAMA, CBOT, Merge Rush and the rest are not things a visitor asks
 * general questions about, and making every alias context-dependent would cost
 * recall for nothing. This is also why a bare "GitHub" or "linkdin" still
 * works — the exact-fact route answers those before retrieval is involved.
 */
const CONTEXT_SENSITIVE = new Set(["GitHub", "LinkedIn", "C#", ".NET"]);

/**
 * Words that mark a question as being about Kaan's work rather than about a
 * concept. Consulted only for the two gated cases above.
 *
 * Every signal here has to be INDEPENDENT of the entity it licenses — a signal
 * that could itself be part of the entity's name would make the gate vacuous,
 * which is why "github" and "repo" are deliberately absent.
 */
const PORTFOLIO_SIGNALS = Object.freeze([
  "kaan", "balci", "onun", "his",
  "proje", "project", "portfolyo", "portfolio", "case study", "vaka",
  "deneyim", "experience", "tecrube", "gecmisi",
  "yapti", "yapmis", "gelistirdi", "gelistirmis", "kurdu", "yazdi",
  "built", "made", "created", "wrote",
  "kullaniyor", "kullanir", "kullandi", "uses", "used",
  "biliyor", "bilir", "knows",
  "calisti", "calisiyor", "worked", "works",
  "stack", "mvp", "demo", "lab", "urun", "product", "uygulama",
]);

/** Every alias the master records, plus the canonical name itself. */
function aliasesFor(canonical, listed) {
  const all = [canonical, ...(Array.isArray(listed) ? listed : [])];
  const normalized = all.map((alias) => foldQuestion(alias)).filter(Boolean);
  /* Longest first so a multi-word alias wins over a fragment of itself. */
  return [...new Set(normalized)].sort((left, right) => right.length - left.length);
}

/**
 * A fuller name for an entity, when the knowledge records one.
 *
 * "SINAMA — AI Agent Reliability Lab" is a better retrieval anchor than
 * "SINAMA", because it carries the words a visitor's question is likely to use.
 */
function descriptorFor(canonical, knowledge) {
  const flagship = knowledge?.projects?.flagship?.[canonical];
  const name = typeof flagship?.name === "string" ? flagship.name.trim() : "";
  return name && name !== canonical ? name : canonical;
}

/**
 * The alias index, built once at startup.
 *
 * Shape: an ordered list of entities, each with its normalized aliases and the
 * spellings that make it ambiguous. Order is the master file's order, which is
 * stable, so resolution is deterministic.
 */
export function buildAliasIndex(knowledge) {
  const table = knowledge?.aliases_and_typos || {};
  const entities = Object.entries(table).map(([canonical, listed]) => ({
    canonical,
    descriptor: descriptorFor(canonical, knowledge),
    aliases: aliasesFor(canonical, listed),
    ambiguousSpellings: (AMBIGUOUS_SPELLINGS[canonical] || []).map((spelling) =>
      foldPreservingDotless(spelling),
    ),
    contextSensitive: CONTEXT_SENSITIVE.has(canonical),
  }));
  return {
    entities,
    aliasCount: entities.reduce((total, entity) => total + entity.aliases.length, 0),
  };
}

/** Whether the question shows it is about Kaan's work rather than a concept. */
function hasPortfolioSignal(folded) {
  return PORTFOLIO_SIGNALS.some((signal) => hasPhrase(folded, signal));
}

/**
 * The canonical entities this question mentions.
 *
 * Returns `[{ canonical, descriptor, matched }]` in index order. Two gates can
 * drop a match, and both require the same independent portfolio signal:
 *
 * - a context-sensitive entity — GitHub, LinkedIn, C#, .NET — because the name
 *   alone is just as likely to be a general-knowledge question;
 * - an ambiguous spelling — `sınama`, the Turkish noun — because the word is
 *   not a name at all in that spelling.
 *
 * So "GitHub nedir" and "sınama ve değerlendirme arasındaki fark nedir" resolve
 * to nothing, while "Kaan GitHub Actions biliyor mu" and "sınama projesi ne"
 * resolve normally. Everything else — SINAMA spelled with a dotted i, CBOT,
 * Merge Rush, the hospital projects — is unaffected.
 */
export function resolveEntities(question, index) {
  const folded = foldQuestion(question);
  if (!folded || !index?.entities?.length) return [];
  const dotless = foldPreservingDotless(question);
  const signalled = hasPortfolioSignal(folded);
  const resolved = [];

  for (const entity of index.entities) {
    const matched = entity.aliases.find((alias) => hasPhrase(folded, alias));
    if (!matched) continue;
    if (!signalled) {
      if (entity.contextSensitive) continue;
      /* An unambiguous spelling of the same alias — `sinama`, `sinamayı` — is
       * unaffected by this; only the ordinary-word spelling is gated. */
      if (entity.ambiguousSpellings.some((spelling) => hasPhrase(dotless, spelling))) continue;
    }
    resolved.push({ canonical: entity.canonical, descriptor: entity.descriptor, matched });
  }
  return resolved;
}
