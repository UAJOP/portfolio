/**
 * qa-ajoop-behavior.mjs — deterministic behaviour matrix for the Ajoop core.
 *
 * Ajoop 4.5 rebuilt language resolution, the intent ontology, context
 * precedence and the evidence policy. Those are exactly the parts that used to
 * regress silently, because every one of their failures looks like a plausible
 * answer rather than like an error.
 *
 * This harness pins them down. It evaluates the SHIPPED marker blocks — the
 * same code the browser runs — against a table of cases, each stating what the
 * core should decide:
 *
 *   input                the visitor's message
 *   expectedLanguage     conversation language, or null for "do not change it"
 *   expectedIntent       ontology intent id, or null for "no confident match"
 *   expectedEntity       resolved subject id, or null
 *   expectedEvidence     what this intent may cite: none | supporting |
 *                        required | insufficiency
 *   context              optional stored conversation context for the turn
 *
 * It runs headless in a second: no browser, no network, no DOM. Add a row
 * whenever a real question routes wrongly, and the row is the regression test.
 *
 * Usage:
 *   node scripts/qa-ajoop-behavior.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

/** Pulls one marker-delimited block out of a shipped module. */
function block(file, name) {
  const source = read(file);
  const start = source.indexOf(`/* ${name}:start`);
  const end = source.indexOf(`/* ${name}:end */`);
  if (start < 0 || end < 0) {
    console.error(
      `FAIL: could not find the ${name} markers in ${file}.\n` +
        "The core layers must stay wrapped in those markers so this harness can " +
        "test the shipped code rather than a copy of it.",
    );
    process.exit(1);
  }
  return source.slice(start, end);
}

/* The canonical registry, loaded exactly as the browser loads it. */
const registryGlobal = {};
new Function("window", read("portfolio-data.js"))(registryGlobal);
const REGISTRY = registryGlobal.KAAN_PORTFOLIO;

/* The core, in load order. Every one of these blocks is DOM-free by contract,
 * which is what makes this possible at all. */
const CORE = [
  block("js/ajoop/matcher.js", "ajoop-intent-matching"),
  block("js/ajoop/language.js", "ajoop-language"),
  block("js/ajoop/ontology.js", "ajoop-ontology"),
  block("js/ajoop/entities.js", "ajoop-entities"),
  block("js/ajoop/context.js", "ajoop-context"),
  block("js/ajoop/context.js", "ajoop-page-context"),
  block("js/ajoop/knowledge.js", "ajoop-knowledge"),
  block("js/ajoop/router.js", "ajoop-router"),
  block("js/ajoop/conversation.js", "ajoop-conversation"),
  block("js/ajoop/evidence.js", "ajoop-evidence"),
  block("js/ajoop/response.js", "ajoop-response"),
].join("\n");

/* The two host helpers the blocks reach for through typeof guards. */
const PRELUDE = `
  const window = { KAAN_PORTFOLIO: __REGISTRY__ };
  function getCurrentLocale() { return "en"; }
  function getI18nText(english, turkish, locale) { return locale === "tr" ? turkish : english; }
`;

const EXPORTS = `
  return {
    detectAjoopMessageLanguage,
    detectAjoopMetaIntent,
    scoreAjoopOntology,
    ajoopEvidencePolicy,
    routeAjoopQuery,
    emptyAjoopContext,
    selectAjoopEvidence,
    planAjoopResponse,
    planAjoopActions,
  };
`;

const core = new Function("__REGISTRY__", PRELUDE + CORE + EXPORTS)(REGISTRY);

/* ---------- the matrix ---------- */

const withContext = (values) => Object.assign(core.emptyAjoopContext(), values);

const CASES = [
  /* --- SOCIAL: greetings, slang and initialisms, in five languages --- */
  { input: "selam", expectedLanguage: "tr", expectedIntent: "greeting", expectedEvidence: "none" },
  { input: "selamlar", expectedLanguage: "tr", expectedIntent: "greeting", expectedEvidence: "none" },
  { input: "merhaba", expectedLanguage: "tr", expectedIntent: "greeting", expectedEvidence: "none" },
  { input: "sa", expectedLanguage: "tr", expectedIntent: "greeting", expectedEvidence: "none" },
  { input: "hello", expectedLanguage: "en", expectedIntent: "greeting", expectedEvidence: "none" },
  { input: "hey", expectedLanguage: "en", expectedIntent: "greeting", expectedEvidence: "none" },
  { input: "hola", expectedLanguage: "es", expectedIntent: "greeting", expectedEvidence: "none" },
  { input: "hola que pasa", expectedLanguage: "es", expectedIntent: "greeting", expectedEvidence: "none" },
  { input: "bonjour", expectedLanguage: "fr", expectedIntent: "greeting", expectedEvidence: "none" },
  { input: "salut", expectedLanguage: "fr", expectedIntent: "greeting", expectedEvidence: "none" },
  { input: "hallo", expectedLanguage: "de", expectedIntent: "greeting", expectedEvidence: "none" },
  { input: "teşekkürler", expectedLanguage: "tr", expectedIntent: "thanks", expectedEvidence: "none" },
  { input: "thanks", expectedLanguage: "en", expectedIntent: "thanks", expectedEvidence: "none" },
  { input: "görüşürüz", expectedLanguage: "tr", expectedIntent: "goodbye", expectedEvidence: "none" },

  /* --- Language-neutral follow-ups must NOT move the conversation --- */
  { input: "SINAMA?", expectedLanguage: null },
  { input: "GitHub?", expectedLanguage: null },
  { input: "stack?", expectedLanguage: null },

  /* --- AJOOP META: global, never inherit a subject --- */
  { input: "sen kimsin?", expectedLanguage: "tr", expectedIntent: "identity", expectedEntity: null, expectedEvidence: "none" },
  { input: "who are you", expectedLanguage: "en", expectedIntent: "identity", expectedEntity: null, expectedEvidence: "none" },
  { input: "wer bist du", expectedLanguage: "de", expectedIntent: "identity", expectedEvidence: "none" },
  { input: "ne yapabilirsin", expectedLanguage: "tr", expectedIntent: "capabilities", expectedEvidence: "none" },
  { input: "what can you do", expectedLanguage: "en", expectedIntent: "capabilities", expectedEvidence: "none" },
  { input: "nasıl çalışıyorsun", expectedLanguage: "tr", expectedIntent: "how_it_works", expectedEvidence: "none" },
  { input: "is this AI?", expectedIntent: "is_ai", expectedEvidence: "none" },
  /* The whole point of "global": a live subject must not survive into it. */
  {
    input: "sen kimsin?",
    context: withContext({ lastEntity: "sinama", lastIntent: "tech_stack" }),
    expectedIntent: "identity",
    expectedEntity: null,
  },

  /* --- PERSON, and the distinctions this release turns on --- */
  { input: "kaan kim?", expectedLanguage: null, expectedIntent: "who_is_kaan", expectedEvidence: "supporting" },
  { input: "who is kaan", expectedIntent: "who_is_kaan", expectedEvidence: "supporting" },
  { input: "kaan ne yapıyor?", expectedLanguage: "tr", expectedIntent: "what_does_kaan_do", expectedEvidence: "supporting", expectedPlanType: "answer" },
  { input: "kaan ne iş yapıyor", expectedIntent: "what_does_kaan_do" },
  { input: "mesleği ne", expectedIntent: "what_does_kaan_do" },
  { input: "what does kaan do", expectedIntent: "what_does_kaan_do" },
  { input: "was macht kaan beruflich", expectedLanguage: "de", expectedIntent: "what_does_kaan_do" },
  { input: "qué hace kaan", expectedLanguage: "es", expectedIntent: "what_does_kaan_do" },
  { input: "que fait kaan", expectedLanguage: "fr", expectedIntent: "what_does_kaan_do" },
  /* Same verb, one time marker, different question and different evidence. */
  { input: "kaan şu an ne üzerinde çalışıyor?", expectedIntent: "current_work", expectedEvidence: "required" },
  { input: "what is kaan working on", expectedIntent: "current_work" },
  { input: "woran arbeitet er", expectedLanguage: "de", expectedIntent: "current_work" },
  /* And the third neighbour: the site's changelog, not the person. */
  { input: "portfolyoda en son ne değişti?", expectedIntent: "latest_build", expectedEvidence: "required" },
  { input: "what changed recently", expectedIntent: "latest_build" },

  { input: "iş geçmişi ne", expectedIntent: "experience", expectedEvidence: "supporting" },
  { input: "work experience", expectedLanguage: "en", expectedIntent: "experience" },
  { input: "Berufserfahrung", expectedLanguage: "de", expectedIntent: "experience" },
  { input: "experiencia laboral", expectedLanguage: "es", expectedIntent: "experience" },
  { input: "expérience professionnelle", expectedLanguage: "fr", expectedIntent: "experience" },
  { input: "nerede okudu", expectedIntent: "education", expectedEvidence: "none" },
  { input: "hangi teknolojileri biliyor", expectedIntent: "skills", expectedEvidence: "supporting" },
  { input: "what are his skills", expectedLanguage: "en", expectedIntent: "skills" },
  { input: "was sind seine Fähigkeiten", expectedLanguage: "de", expectedIntent: "skills" },
  { input: "cuáles son sus habilidades", expectedLanguage: "es", expectedIntent: "skills" },
  { input: "quelles sont ses compétences", expectedLanguage: "fr", expectedIntent: "skills" },
  { input: "cv", expectedIntent: "cv", expectedEvidence: "none", expectedConfidence: "high", expectedPlanType: "answer" },
  { input: "Lebenslauf", expectedLanguage: "de", expectedIntent: "cv" },
  { input: "su currículum", expectedLanguage: "es", expectedIntent: "cv" },
  { input: "voir son CV", expectedLanguage: "fr", expectedIntent: "cv" },
  { input: "nasıl ulaşabilirim", expectedIntent: "contact", expectedEvidence: "none" },
  { input: "contact details", expectedLanguage: "en", expectedIntent: "contact" },

  /* --- PROJECT --- */
  { input: "SINAMA?", expectedIntent: "project_overview", expectedEntity: "sinama", expectedEvidence: "required", expectedPlanType: "answer", expectedCardEntity: "sinama", expectNoDuplicateLinks: true },
  { input: "Why was SINAMA built?", expectedIntent: "project_reasoning", expectedEntity: "sinama", expectedEvidence: "required" },
  { input: "SINAMA hangi teknolojiler?", expectedIntent: "tech_stack", expectedEntity: "sinama", expectedEvidence: "required", expectedCardEntity: "sinama" },
  { input: "SINAMA kanıt", expectedIntent: "evidence", expectedEntity: "sinama", expectedEvidence: "required", expectedCardEntity: "sinama" },
  { input: "Merge Rush ne durumda", expectedIntent: "status", expectedEntity: "mergeRush", expectedCardEntity: "mergeRush" },
  { input: "SINAMA GitHub", expectedIntent: "links", expectedEntity: "sinama", expectedEvidence: "none" },
  /* An aspect question with no subject of its own inherits the conversation's. */
  {
    input: "stack?",
    context: withContext({ lastEntity: "sinama", lastIntent: "project_overview" }),
    expectedIntent: "tech_stack",
    expectedEntity: "sinama",
    expectedConfidence: "high",
  },
  {
    input: "github?",
    context: withContext({ lastEntity: "sinama", lastIntent: "project_overview" }),
    expectedEntity: "sinama",
  },
  /* A stale subject is not context. Four turns is the limit. */
  {
    input: "github?",
    context: withContext({ lastEntity: "sinama", entityAge: 9 }),
    expectedEntity: null,
    expectedPlanType: "clarify",
    expectedFallback: "ambiguous",
  },
  {
    input: "github?",
    context: withContext({ lastEntity: "sinama", touchedAt: 1_000 }),
    now: 1_000 + 15 * 60 * 1_000 + 1,
    expectedEntity: null,
  },
  {
    input: "Merge Rush stack?",
    context: withContext({ lastEntity: "sinama" }),
    expectedIntent: "tech_stack",
    expectedEntity: "mergeRush",
  },
  /* A person-level question never inherits a project, whatever is in play. */
  {
    input: "kaan kim?",
    context: withContext({ lastEntity: "sinama" }),
    expectedIntent: "who_is_kaan",
    expectedEntity: null,
  },
  {
    input: "cv",
    context: withContext({ lastEntity: "sinama" }),
    expectedIntent: "cv",
    expectedEntity: null,
  },

  /* --- ROLE FIT --- */
  { input: "applied ai için uygun mu", expectedIntent: "applied_ai_fit", expectedEntity: "applied-ai", expectedEvidence: "required", expectedCardEntity: "sinama" },
  { input: "forward deployed engineer", expectedIntent: "solution_engineering_fit", expectedEvidence: "required" },
  { input: "hangi role uygun", expectedIntent: "fit_for_role", expectedEvidence: "required" },

  /* --- DISCOVERY --- */
  { input: "en iyi projeler", expectedIntent: "best_projects", expectedEvidence: "required" },
  { input: "best projects", expectedIntent: "best_projects" },
  { input: "zeig mir seine Projekte", expectedLanguage: "de", expectedIntent: "best_projects" },
  { input: "projects using Python", expectedIntent: "projects_by_technology", expectedEvidence: "required", expectedCardEntity: "sinama" },
  { input: "game projects", expectedIntent: "projects_by_domain", expectedEvidence: "required", expectedCardEntity: "mergeRush" },
  { input: "web projects", expectedIntent: "projects_by_domain", expectedEvidence: "required", expectedCardEntity: "joyday" },

  /* --- Fallback taxonomy and confidence gate --- */
  { input: "links?", expectedIntent: "links", expectedConfidence: "low", expectedPlanType: "clarify", expectedFallback: "ambiguous" },
  { input: "cv projects", expectedConfidence: "low", expectedPlanType: "clarify", expectedFallback: "ambiguous" },
  { input: "SINAMA annual revenue?", expectedLanguage: "en", expectedIntent: "unsupported_claim", expectedEntity: "sinama", expectedEvidence: "insufficiency", expectedPlanType: "insufficient", expectedFallback: "unsupported" },
  { input: "What is Kaan's salary?", expectedIntent: "unsupported_claim", expectedEvidence: "insufficiency", expectedPlanType: "insufficient", expectedFallback: "unsupported" },

  /* --- Nonsense must reach no confident intent --- */
  { input: "qwertyuiop", expectedIntent: null, expectedPlanType: "clarify", expectedFallback: "unknown" },
  { input: "asdf 123", expectedIntent: null, expectedPlanType: "clarify", expectedFallback: "unknown" },
];

/* ---------- run ---------- */

let failures = 0;
let checks = 0;

function expect(label, actual, expected) {
  checks += 1;
  if (actual === expected) return true;
  failures += 1;
  console.log(`FAIL  ${label}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  return false;
}

for (const testCase of CASES) {
  const { input } = testCase;
  if ("expectedLanguage" in testCase) {
    expect(`[lang] ${input}`, core.detectAjoopMessageLanguage(input), testCase.expectedLanguage);
  }
  const route = core.routeAjoopQuery(input, {
    conversation: testCase.context || null,
    page: null,
    registry: REGISTRY,
    now: testCase.now,
  });
  if ("expectedIntent" in testCase) {
    expect(`[intent] ${input}`, route.intent, testCase.expectedIntent);
  }
  if ("expectedEntity" in testCase) {
    expect(`[entity] ${input}`, route.entity, testCase.expectedEntity);
  }
  if ("expectedEvidence" in testCase) {
    expect(`[evidence] ${input}`, route.evidencePolicy, testCase.expectedEvidence);
  }
  if ("expectedConfidence" in testCase) {
    expect(`[confidence] ${input}`, route.confidence, testCase.expectedConfidence);
  }

  const plan = core.planAjoopResponse(route, {
    language: testCase.expectedLanguage || "en",
    message: input,
    registry: REGISTRY,
    preparedAnswer: () => ({ text: "Prepared canonical answer.", links: [] }),
    entityAnswer: () => ({ text: "Canonical project answer.", links: [] }),
  });
  if ("expectedPlanType" in testCase) {
    expect(`[response] ${input}`, plan.type, testCase.expectedPlanType);
  }
  if ("expectedFallback" in testCase) {
    expect(`[fallback] ${input}`, plan.fallback && plan.fallback.kind, testCase.expectedFallback);
  }
  if ("expectedCardEntity" in testCase) {
    expect(
      `[card] ${input}`,
      plan.cards.some((card) => card.entityId === testCase.expectedCardEntity),
      true,
    );
  }
  if (testCase.expectNoDuplicateLinks) {
    expect(`[links] ${input} has no message/card duplication`, plan.links.length, 0);
  }

  const actionPlan = core.planAjoopActions(route, plan, {
    language: testCase.expectedLanguage || "en",
    registry: REGISTRY,
  });
  expect(`[actions] ${input} has at most three primary choices`, actionPlan.actions.length <= 3, true);
  expect(`[actions] ${input} keeps Start over secondary`, actionPlan.secondary.length, 1);
}

/* A standing invariant rather than a per-case expectation: no social or meta
 * answer may ever be allowed to cite portfolio evidence. */
for (const intent of ["greeting", "thanks", "goodbye", "identity", "capabilities", "how_it_works", "is_ai"]) {
  expect(`[policy] ${intent} cites nothing`, core.ajoopEvidencePolicy(intent), "none");
}

for (const input of ["hello", "who are you", "what can you do"]) {
  const route = core.routeAjoopQuery(input, { conversation: null, page: null, registry: REGISTRY });
  const plan = core.planAjoopResponse(route, {
    language: "en",
    message: input,
    registry: REGISTRY,
    preparedAnswer: () => ({ text: "Prepared canonical answer.", links: [] }),
    entityAnswer: () => ({ text: "Canonical project answer.", links: [] }),
  });
  expect(`[provenance] ${input} has no cards`, plan.cards.length, 0);
  expect(`[provenance] ${input} has no provenance`, plan.provenance, null);
}

/* Evidence relevance is a family boundary, not just a label on the route. */
for (const [input, expectedCards] of [
  ["who is kaan", 0],
  ["work experience", 0],
  ["what are his skills", 2],
  ["what is kaan working on", 2],
]) {
  const route = core.routeAjoopQuery(input, { conversation: null, page: null, registry: REGISTRY });
  const evidence = core.selectAjoopEvidence(route, "en", input, REGISTRY);
  expect(`[relevance] ${input}`, evidence ? evidence.cards.length : 0, expectedCards);
}

const latestRoute = core.routeAjoopQuery("what changed recently", {
  conversation: null,
  page: null,
  registry: REGISTRY,
});
const latestEvidence = core.selectAjoopEvidence(latestRoute, "en", "what changed recently", REGISTRY);
expect("[relevance] latest build cites current/build entries", latestEvidence.entries.length > 0, true);
expect("[relevance] latest build has no unrelated project cards", latestEvidence.cards.length, 0);

/* Compatibility code may remain for old callers, but the live submit path must
 * enter the ontology router directly and never consult the keyword map. */
const assistantSource = read("js/ajoop/assistant.js");
const submitStart = assistantSource.indexOf("function handleAjoopMessage(message)");
const submitEnd = assistantSource.indexOf("\nfunction ", submitStart + 1);
const submitSource = assistantSource.slice(submitStart, submitEnd);
expect("[legacy] live submit uses the ontology router", submitSource.includes("routeAjoopQuery("), true);
expect("[legacy] live submit bypasses no keyword matcher", submitSource.includes("detectChatbotIntent("), false);
expect("[legacy] live submit bypasses no prepared-answer router", submitSource.includes("answerChatbotIntent("), false);

console.log(
  failures
    ? `\nAjoop behaviour matrix FAILED: ${failures} of ${checks} checks.`
    : `Ajoop behaviour matrix passed. ${checks} checks across ${CASES.length} cases.`,
);
process.exit(failures ? 1 : 0);
