/**
 * Ajoop conversation memory and page awareness (Ajoop 4.0 Brain).
 *
 * Two kinds of context feed the router:
 *
 *   conversation context — what the visitor already asked about, kept for the
 *                          browser session so "hangi teknolojileri kullaniyor?"
 *                          still means SINAMA one turn later;
 *   page context         — where the visitor is standing right now, so an
 *                          ambiguous question on a project page resolves
 *                          against that project without being typed out.
 *
 * Conversation context wins over page context: a visitor who explicitly names
 * another subject has changed the subject.
 */
/* ajoop-context:start
 * Structured conversation memory. Keep this block DOM-free and pass the store
 * in, so QA can exercise it against a fake storage object.
 *
 * WHAT IS PERSISTED: routing metadata only — the resolved intent, the resolved
 * entity ids, a repeat counter and the page type. Raw visitor messages are
 * never written to storage. Ajoop answers from canonical site data, so it never
 * needs the transcript to stay useful, and a transcript in sessionStorage would
 * be visitor content this site has no reason to hold.
 *
 * sessionStorage, not localStorage, for the same reason Recruiter Mode uses it:
 * one visit is one sitting. A version suffix on the key lets a later shape
 * change ignore stale records instead of guarding every field forever.
 */
const AJOOP_CONTEXT_KEY = "ajoop-context-v1";
const AJOOP_CONTEXT_VERSION = 1;

/**
 * Ajoop 4.1 added `lastFacet` and `depth` to this shape.
 *
 * The version and the storage key deliberately did NOT change: reads merge the
 * stored record onto these defaults, so a context written by 4.0 keeps working
 * and simply picks up the new fields at their defaults. Bumping the version
 * would have discarded live sessions for no benefit.
 */
function emptyAjoopContext() {
  return {
    version: AJOOP_CONTEXT_VERSION,
    lastIntent: null,
    lastEntity: null,
    previousEntity: null,
    /* Consecutive turns on the same intent — rotates prepared answer lines. */
    answerDepth: 0,
    /* Which aspect of the subject was last asked about (stack, links, proof…). */
    lastFacet: null,
    /* How much detail the visitor asked for: quick | normal | deep. */
    depth: "normal",
    pageContext: null,
    /* Ajoop 4.5 context lifetime. `entityAge` counts turns since the subject
     * was last named or used; `touchedAt` is when the context last moved. Both
     * exist so a stale subject stops being treated as context — see
     * pruneAjoopContext for why that matters. */
    entityAge: 0,
    touchedAt: 0,
  };
}

/**
 * How long a subject stays in play.
 *
 * A visitor who asked about SINAMA, then about the CV, then about education,
 * is no longer talking about SINAMA — but 4.4 kept it indefinitely, so a later
 * "github?" would answer about a project three topics ago. Four turns is about
 * as long as a subject survives in a real conversation before it needs to be
 * named again, and fifteen minutes is long enough that stepping away for a
 * coffee does not lose the thread while a next-day tab does.
 */
const AJOOP_ENTITY_MAX_AGE = 4;
const AJOOP_CONTEXT_TTL_MS = 15 * 60 * 1000;

function ajoopNow(now) {
  if (typeof now === "function") return now();
  if (typeof now === "number") return now;
  return Date.now();
}

/**
 * The context as it should be READ this turn, with anything stale removed.
 *
 * Pure: it does not write. The router calls it once so every consumer sees the
 * same pruned view, and the stored record is only rewritten when the turn is
 * remembered — a read must never have side effects on the conversation.
 */
function pruneAjoopContext(context, now) {
  if (!context) return context;
  const current = ajoopNow(now);

  /* A context nobody has touched for a quarter of an hour is a different
   * visit in the same tab. Start clean rather than half-remembering. */
  if (context.touchedAt && current - context.touchedAt > AJOOP_CONTEXT_TTL_MS) {
    return emptyAjoopContext();
  }
  if (context.lastEntity && (context.entityAge || 0) > AJOOP_ENTITY_MAX_AGE) {
    return Object.assign({}, context, { lastEntity: null, entityAge: 0 });
  }
  return context;
}

function ajoopContextStore(store) {
  if (store) return store;
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

function readAjoopContext(store) {
  const target = ajoopContextStore(store);
  if (!target) return emptyAjoopContext();
  try {
    const raw = target.getItem(AJOOP_CONTEXT_KEY);
    if (!raw) return emptyAjoopContext();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== AJOOP_CONTEXT_VERSION) return emptyAjoopContext();
    return Object.assign(emptyAjoopContext(), parsed);
  } catch (error) {
    /* Storage can be blocked or the record can be corrupt; Ajoop still answers,
     * it just starts the conversation fresh. */
    return emptyAjoopContext();
  }
}

function writeAjoopContext(next, store) {
  const target = ajoopContextStore(store);
  if (!target) return false;
  try {
    target.setItem(
      AJOOP_CONTEXT_KEY,
      JSON.stringify(Object.assign(emptyAjoopContext(), next)),
    );
    return true;
  } catch (error) {
    return false;
  }
}

function resetAjoopContext(store) {
  const target = ajoopContextStore(store);
  if (!target) return false;
  try {
    target.removeItem(AJOOP_CONTEXT_KEY);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Folds one resolved turn into the stored context.
 *
 * `previousEntity` only rotates when the subject actually changed, so asking
 * three follow-ups about SINAMA does not erase the comparison partner a visitor
 * set up two turns ago. `answerDepth` counts consecutive turns on the same
 * intent, which is what lets a repeated question return a different prepared
 * line instead of the same one.
 */
function rememberAjoopTurn(turn, store) {
  const current = pruneAjoopContext(readAjoopContext(store), turn && turn.now);
  const intent = (turn && turn.intent) || null;
  const entity = (turn && turn.entity) || null;
  /* A turn that used the stored subject keeps it alive; a turn that ignored it
   * ages it. `usedEntity` is what the router resolved, whatever its source. */
  const usedEntity = turn && turn.usedEntity ? turn.usedEntity : null;
  const carried = entity || current.lastEntity;
  const refreshed = Boolean(entity) || (usedEntity && usedEntity === current.lastEntity);
  const next = {
    version: AJOOP_CONTEXT_VERSION,
    lastIntent: intent,
    lastEntity: carried,
    previousEntity:
      entity && current.lastEntity && entity !== current.lastEntity
        ? current.lastEntity
        : current.previousEntity,
    answerDepth: intent && intent === current.lastIntent ? current.answerDepth + 1 : 0,
    /* The resolved subject and aspect are what a continuation ("daha detaylı")
     * re-answers, so both survive the turn even when the next message names
     * neither. */
    lastFacet: turn && turn.facet !== undefined ? turn.facet : current.lastFacet,
    depth: turn && turn.depth ? turn.depth : current.depth,
    pageContext: (turn && turn.pageContext) || current.pageContext,
    entityAge: refreshed ? 0 : (current.entityAge || 0) + 1,
    touchedAt: ajoopNow(turn && turn.now),
  };
  writeAjoopContext(next, store);
  return next;
}

/**
 * Drops the active subject without clearing the rest of the conversation.
 *
 * A question about Kaan, about Ajoop, or a greeting is a change of subject
 * even though it names no new one. Letting the old project simply expire would
 * leave it live for the next "github?", so it is released deliberately.
 */
function releaseAjoopEntity(store, now) {
  const current = readAjoopContext(store);
  if (!current.lastEntity) return current;
  const next = Object.assign({}, current, {
    previousEntity: current.lastEntity,
    lastEntity: null,
    entityAge: 0,
    touchedAt: ajoopNow(now),
  });
  writeAjoopContext(next, store);
  return next;
}

/** Records a depth change without disturbing the active subject. */
function setAjoopDepth(depth, store) {
  const current = readAjoopContext(store);
  const next = Object.assign({}, current, { depth });
  writeAjoopContext(next, store);
  return next;
}
/* ajoop-context:end */

/* ajoop-page-context:start
 * Page awareness.
 *
 * Every route already states what it is: `data-page` names the page type and
 * generated project pages carry `data-project-slug`. Both are read here rather
 * than re-derived from the pathname, and neither is duplicated into a second
 * list of routes — the 25 project routes stay owned by the generator.
 *
 * Case-study pages are the one route shape without a declared slug, so they are
 * matched against the canonical `projects[*].links.caseStudy` values in the
 * registry. That mapping is data, not a hardcoded route table: adding a case
 * study to the registry teaches Ajoop the page with no change here.
 *
 * `doc` is injectable so this stays testable without a DOM.
 */
function ajoopPageDocument(doc) {
  if (doc) return doc;
  return typeof document === "undefined" ? null : document;
}

/** The registry project whose case study is the given path, or null. */
function ajoopCaseStudyEntity(pathname, registry) {
  const source =
    registry || (typeof window !== "undefined" ? window.KAAN_PORTFOLIO : null);
  const projects = (source && source.projects) || {};
  const path = String(pathname || "").toLowerCase();
  if (!path) return null;
  let match = null;
  Object.keys(projects).forEach((id) => {
    const links = projects[id].links || {};
    const caseStudy = String(links.caseStudy || "").toLowerCase();
    if (!caseStudy || match) return;
    /* Registry links are repo-relative ("sinama-case-study.html",
     * "projects/ai-chatbot-flow-design/"); the live path carries a locale
     * prefix on localized routes, so compare on the tail. */
    const tail = caseStudy.replace(/\/+$/, "");
    if (tail && path.replace(/\/+$/, "").endsWith(tail)) match = id;
  });
  return match;
}

/**
 * Where the visitor is: page type, the entity that page is about (when it is
 * about one) and the active locale.
 */
function readAjoopPageContext(doc, registry) {
  const target = ajoopPageDocument(doc);
  const body = target && target.body;
  const dataset = (body && body.dataset) || {};
  const locale =
    typeof getCurrentLocale === "function"
      ? getCurrentLocale()
      : (target && target.documentElement && target.documentElement.lang) || "en";

  const pageType = dataset.page || "";
  let pageEntity = null;

  if (dataset.projectSlug) {
    pageEntity = dataset.projectSlug;
  } else if (pageType === "caseStudy") {
    const pathname =
      typeof window !== "undefined" && window.location ? window.location.pathname : "";
    pageEntity = ajoopCaseStudyEntity(pathname, registry);
  }

  return { pageType, pageEntity, locale };
}
/* ajoop-page-context:end */
