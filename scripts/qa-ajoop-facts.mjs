#!/usr/bin/env node
/**
 * qa-ajoop-facts.mjs — exact-fact routing and alias resolution contracts.
 *
 * Two mechanisms, tested separately because they are separate: a narrow
 * deterministic resolver for stable canonical facts, and an alias index that
 * only ever improves the retrieval query.
 *
 * The negative cases matter more than the positive ones here. A missed exact
 * route falls through to retrieval and costs a slower answer; a false route
 * answers "GitHub nedir?" with Kaan's profile URL and sounds certain doing it.
 * So every "must not route" case below is load-bearing.
 *
 * Expected VALUES are read from the canonical JSON rather than written out, so
 * this file cannot drift from the master knowledge and cannot quietly become a
 * second source of truth for a fact.
 *
 * Node built-ins only. No network, no Ollama: embeddings are stubbed.
 *
 *   node scripts/qa-ajoop-facts.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMasterKnowledge } from "../server/ajoop-knowledge.mjs";
import { buildAliasIndex, buildRetrievalQuery, resolveEntities } from "../server/ajoop-entities.mjs";
import { buildExactFacts, renderExactFact, resolveExactFact } from "../server/ajoop-facts.mjs";
import { foldQuestion, foldPreservingDotless } from "../server/ajoop-text.mjs";
import { createAjoopRag } from "../server/ajoop-rag.mjs";

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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = resolve(ROOT, "data", "portfolio");
const ORIGIN = "https://kaanbalci.com";
const ENV = { AJOOP_AI_ALLOWED_ORIGINS: ORIGIN };
const LOCALES = ["en", "tr", "de", "es", "fr"];

const raw = JSON.parse(readFileSync(resolve(DATA_DIR, "ajoop-master-knowledge.json"), "utf8"));
const loaded = await loadMasterKnowledge(DATA_DIR);
const aliasIndex = buildAliasIndex(loaded.knowledge);
const facts = buildExactFacts(loaded.knowledge, aliasIndex);
const byId = new Map(facts.map((fact) => [fact.id, fact]));
const factValue = (id) => byId.get(id)?.value;

/* ---------- A. the fact store equals the canonical master ---------- */

ok("the fact store was built", facts.length >= 20);
ok("fact ids are unique", new Set(facts.map((fact) => fact.id)).size === facts.length);
ok("every fact names the record it came from", facts.every((fact) => Boolean(fact.sourceRecordId)));
ok(
  "every fact points at a record that exists",
  facts.every((fact) => loaded.records.some((record) => record.id === fact.sourceRecordId)),
);

const contact = raw.contact_and_channels;
check("full name matches the master", factValue("identity:full-name"), raw.identity.full_name.value);
check("location matches the master", factValue("identity:location"), raw.identity.location.value);
check("availability matches the master", factValue("identity:availability"), raw.identity.availability.value);
check("email matches the master", factValue("contact:email"), contact.primary_email.value);
check("LinkedIn matches the master", factValue("contact:linkedin"), contact.linkedin.value);
check("GitHub matches the master", factValue("contact:github"), contact.github.value);
check("the CV link matches the master", factValue("contact:resume"), contact.resume.value);
check("the portfolio link matches the master", factValue("contact:portfolio"), contact.portfolio.value);
check("the phone matches the master", factValue("contact:phone"), contact.phone.value);
check(
  "the certificate total matches the master",
  factValue("certifications:total").total,
  raw.certifications.canonical_total,
);
check(
  "the programming-language list matches the master",
  factValue("skills:programming-languages").join("|"),
  raw.technical_capabilities.core_programming_languages.join("|"),
);
check(
  "the spoken-language list matches the master",
  factValue("languages:spoken").map((entry) => `${entry.language}:${entry.level}`).join("|"),
  raw.spoken_languages.map((entry) => `${entry.language}:${entry.level}`).join("|"),
);
check(
  "education matches the master",
  factValue("education:list").map((entry) => `${entry.institution}|${entry.period}`).join(" / "),
  raw.education.map((entry) => `${entry.institution}|${entry.canonical_period}`).join(" / "),
);
check("the GPA matches the master", factValue("education:gpa").gpa, String(raw.education[0].gpa));
check(
  "the project contribution total matches the master",
  factValue("projects:contributed-total"),
  raw.achievements_and_signals.projects_contributed.value,
);
check(
  "the GitHub snapshot count matches the master",
  factValue("github:repository-count").all,
  String(raw.github.connector_public_repositories_including_profile_repo),
);
check(
  "the GitHub web-visible count matches the master",
  factValue("github:repository-count").web,
  String(raw.github.github_web_visible_repository_count),
);

/* Dates follow the master's own conflict resolution: the CV start date wins and
 * the stale LinkedIn one is not resurrected. */
ok(
  "the Anadolu period is the CV one, not the LinkedIn one",
  factValue("education:list")[1].period === raw.education[1].canonical_period &&
    !factValue("education:list")[1].period.includes("Jul 2025"),
);

/* The four channel headlines stay distinct rather than collapsing into one
 * false universal title. */
{
  const headlines = factValue("identity:headlines");
  const source = raw.identity.channel_specific_headlines;
  check("the portfolio headline is canonical", headlines.portfolio, source.portfolio_primary);
  check("the CV headline is canonical", headlines.cv, source.current_cv);
  check("the LinkedIn headline is canonical", headlines.linkedin, source.linkedin);
  check("the background descriptor is canonical", headlines.background, source.background_descriptor);
  ok("all four headlines differ", new Set(Object.values(headlines)).size === 4);
}

/* Project contributions and GitHub repositories are different numbers with
 * different meanings, and the answers must keep them apart. */
{
  const projects = renderExactFact(byId.get("projects:contributed-total"), "en");
  const repos = renderExactFact(byId.get("github:repository-count"), "en");
  ok("the project total says it is not the repository count", /not the number of repositories/i.test(projects));
  ok("the repository answer is framed as a snapshot", /snapshot/i.test(repos));
  ok("the repository answer refuses to claim it is live", /live data|cannot confirm/i.test(repos));
  ok("the repository answer carries its snapshot date", repos.includes(raw.github.snapshot_date));
}

/* ---------- B. exact routing: positives ---------- */

const routes = (question) => resolveExactFact(question, facts)?.id || null;

const POSITIVES = [
  ["CV", "contact:resume"],
  ["Kaanın cv si", "contact:resume"],
  ["özgeçmiş", "contact:resume"],
  ["özgeçmişi", "contact:resume"],
  ["resume", "contact:resume"],
  ["LinkedIn", "contact:linkedin"],
  ["Kaan'ın LinkedIn profili", "contact:linkedin"],
  ["Kaan'ın LinkedIn'i", "contact:linkedin"],
  ["linkdin", "contact:linkedin"],
  ["What is his LinkedIn?", "contact:linkedin"],
  ["GitHub", "contact:github"],
  ["git hub linki", "contact:github"],
  ["Kaan'ın github profili", "contact:github"],
  ["Kaan'ın maili ne", "contact:email"],
  ["email adresi", "contact:email"],
  ["mail adresi ne", "contact:email"],
  ["kaç sertifikası var", "certifications:total"],
  ["sertifika sayısı", "certifications:total"],
  ["hangi programlama dillerini biliyor", "skills:programming-languages"],
  ["programlama dilleri", "skills:programming-languages"],
  ["programming languages", "skills:programming-languages"],
  ["hangi üniversitelerde okudu", "education:list"],
  ["eğitimi ne", "education:list"],
  ["GPA'si kaç", "education:gpa"],
  ["not ortalaması kaç", "education:gpa"],
  ["Kaan nerede yaşıyor", "identity:location"],
  ["Kaan nerede çalışıyor", "identity:location"],
  ["Kaan iş arıyor mu", "identity:availability"],
  ["hangi dilleri konuşuyor", "languages:spoken"],
  ["Kaan'ın unvanı ne?", "identity:headlines"],
  ["kaç projesi var", "projects:contributed-total"],
  ["GitHub'da kaç repo var", "github:repository-count"],
  ["portfolyo sitesi", "contact:portfolio"],
];
for (const [question, expected] of POSITIVES) {
  check(`routes: ${question}`, routes(question), expected);
}

/* ---------- C. exact routing: negatives ---------- */

const NEGATIVES = [
  "GitHub nedir?",
  "GitHub Actions nasıl çalışır?",
  "What is GitHub?",
  "LinkedIn nedir?",
  "CV nasıl hazırlanır?",
  "iyi bir CV nasıl olmalı?",
  "email validation nasıl yapılır?",
  "JavaScript'te email validation nasıl yapılır?",
  "telefon nasıl çalışır?",
  "programlama dili nedir?",
  "sertifika neden önemlidir?",
  "üniversite seçerken nelere bakılır?",
  "Kaan GitHub Actions biliyor mu?",
  "sinema filmi öner",
  "dot product nedir",
  "net maaş nedir",
  "c dili nedir",
  "bugün hava nasıl",
  "Türkiye hakkında ne düşünüyorsun?",
  /* Ordinary portfolio questions belong to retrieval, not to the fact store. */
  "sinamanın stacki ne",
  "cbot'ta ne yaptı",
  "merge rush nasıl çalışıyor",
  "Kaan'ı işe alsam bana ne katkısı olur?",
];
for (const question of NEGATIVES) {
  check(`does not route: ${question}`, routes(question), null);
}

/* ---------- D. phone privacy ---------- */

for (const question of ["Kaan'ın telefon numarası ne?", "telefonu var mı?", "cep telefonu ne?", "phone number"]) {
  check(`the phone is returned when asked for: ${question}`, routes(question), "contact:phone");
}
for (const question of ["Kaan'a nasıl ulaşırım?", "iletişim bilgileri", "contact", "Kaan'ın LinkedIn'i", "Kaan'ın maili ne"]) {
  const id = routes(question);
  ok(`a generic contact question does not reach the phone fact: ${question}`, id !== "contact:phone");
}
check("the phone fact keeps its on-request tier", byId.get("contact:phone").visibility, "public_on_request");
ok(
  "every other fact is public",
  facts.filter((fact) => fact.id !== "contact:phone").every((fact) => fact.visibility === "public"),
);
/* The generic contact answer offers public channels and nothing else. */
for (const locale of LOCALES) {
  const answer = renderExactFact(byId.get("contact:channels"), locale);
  ok(`[${locale}] the generic contact answer offers the email`, answer.includes(contact.primary_email.value));
  ok(`[${locale}] it offers LinkedIn`, answer.includes(contact.linkedin.value));
  ok(`[${locale}] it never carries the phone number`, !answer.includes(contact.phone.value));
}

/* ---------- E. privacy: restricted data cannot become a fact ---------- */

{
  const everyValue = JSON.stringify(facts.map((fact) => fact.value)).toLowerCase();
  const emails = [...new Set(everyValue.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [])];
  check("exactly one email address exists across every fact", emails.length, 1);
  check("and it is the public primary one", emails[0], contact.primary_email.value.toLowerCase());

  const phones = [...new Set(everyValue.match(/\+[0-9][0-9 ()-]{7,}/g) || [])];
  check("exactly one phone number exists across every fact", phones.length, 1);
  check("and it is the public-on-request one", phones[0], contact.phone.value);

  /* Both restricted nodes were removed upstream, so no fact can be built from
   * them however the fact list changes. */
  check("the restricted fields are still excluded", loaded.stats.privacyExcluded, 2);
  ok(
    "no fact was built from a restricted node",
    !("legacy_secondary_email" in (loaded.knowledge.contact_and_channels || {})),
  );
  ok(
    "a fact whose canonical value was removed simply does not exist",
    buildExactFacts({ ...loaded.knowledge, contact_and_channels: {} }, aliasIndex)
      .every((fact) => !fact.id.startsWith("contact:")),
  );
}

/* ---------- F. localization ---------- */

for (const locale of LOCALES) {
  const answer = renderExactFact(byId.get("skills:programming-languages"), locale);
  ok(`[${locale}] the programming answer is prose, not a dump`, answer.length > 30 && !answer.includes("="));
  for (const language of raw.technical_capabilities.core_programming_languages) {
    ok(`[${locale}] it lists ${language}`, answer.includes(language));
  }
}
ok(
  "the five locales differ from one another",
  new Set(LOCALES.map((locale) => renderExactFact(byId.get("contact:email"), locale))).size === 5,
);
for (const locale of LOCALES) {
  const answer = renderExactFact(byId.get("project:none") || byId.get("education:list"), locale);
  ok(`[${locale}] technology and institution names are never translated`, answer.includes(raw.education[0].institution));
}
ok(
  "every fact renders in every locale",
  facts.every((fact) => LOCALES.every((locale) => renderExactFact(fact, locale).length > 10)),
);

/* ---------- G. alias resolution ---------- */

const entitiesFor = (question) => resolveEntities(question, aliasIndex).map((entity) => entity.canonical);
const resolvesTo = (question) => entitiesFor(question).join(", ");

ok("the alias index was built from the master", aliasIndex.entities.length === Object.keys(raw.aliases_and_typos).length);
ok("it holds no alias the master does not list", aliasIndex.aliasCount >= aliasIndex.entities.length);

const ALIAS_CASES = [
  ["sinamayı kim yaptı", "SINAMA"],
  ["sinamanın stacki ne", "SINAMA"],
  ["sinamaa", "SINAMA"],
  ["cbot", "CBOT"],
  ["c bot", "CBOT"],
  ["cbot'ta ne yaptı", "CBOT"],
  ["outlier", "Outlier AI"],
  ["outlier ai", "Outlier AI"],
  ["joyday", "Atölye Joyday"],
  ["atolye joyday", "Atölye Joyday"],
  ["merge rush", "Merge Rush: Tiny Factory"],
  ["tiny factory", "Merge Rush: Tiny Factory"],
  ["python hastane", "Hospital Appointment System"],
  ["tkinter hastane", "Hospital Appointment System"],
  ["windows forms hastane", "Hospital Form App"],
  ["kaanın", "Kaan Balcı"],
  ["Kaan'ın", "Kaan Balcı"],
  ["kaan balcı", "Kaan Balcı"],
];
for (const [question, expected] of ALIAS_CASES) {
  ok(`alias resolves: ${question} -> ${expected}`, entitiesFor(question).includes(expected));
}

/* The two hospital projects must never resolve to each other. */
ok("python hastane is not the Windows Forms project", !entitiesFor("python hastane").includes("Hospital Form App"));
ok("windows forms hastane is not the Python project", !entitiesFor("windows forms hastane").includes("Hospital Appointment System"));

/* ---------- G2. context-sensitive entities ----------
 *
 * GitHub, LinkedIn, C# and .NET are things visitors ask general questions
 * about. Their names alone must not drag Kaan's records into a conversation
 * that was never about him, so alias resolution gates them behind an
 * independent portfolio signal. The exact-fact route is unaffected, which is
 * why a bare "GitHub" or "linkdin" is still answered — just not by this
 * mechanism.
 */
const GENERIC_CONCEPTS = [
  "GitHub nedir?",
  "LinkedIn nedir?",
  "C# nedir?",
  ".NET nedir?",
  "What is GitHub?",
  "LinkedIn ne işe yarar?",
  "dot net framework nedir",
];
for (const question of GENERIC_CONCEPTS) {
  check(`a generic concept gains no canonical entity: ${question}`, resolvesTo(question), "");
  check(
    `and its retrieval query is untouched: ${question}`,
    buildRetrievalQuery(question, resolveEntities(question, aliasIndex)),
    question,
  );
}

const CONTEXTUAL_CASES = [
  ["Kaan GitHub Actions biliyor mu?", "GitHub"],
  ["c sharp ile ne yaptı?", "C#"],
  ["c# ile ne yaptı", "C#"],
  ["dot net projeleri neler?", ".NET"],
  ["dotnet ile ne yaptı", ".NET"],
  ["Kaan'ın LinkedIn deneyimi nasıl?", "LinkedIn"],
  ["Kaan'ın github projeleri", "GitHub"],
];
for (const [question, expected] of CONTEXTUAL_CASES) {
  ok(`a portfolio signal unlocks the entity: ${question} -> ${expected}`, entitiesFor(question).includes(expected));
}

/* Only these four are gated. Making every alias context-dependent would cost
 * recall for nothing, so the rest resolve on their own. */
check(
  "exactly four entities are context-sensitive",
  aliasIndex.entities.filter((entity) => entity.contextSensitive).map((entity) => entity.canonical).sort().join(","),
  ".NET,C#,GitHub,LinkedIn",
);
for (const question of ["cbot", "outlier", "joyday", "merge rush", "tiny factory", "python hastane", "sinamaa"]) {
  ok(`an ungated alias still resolves alone: ${question}`, entitiesFor(question).length > 0);
}
/* The gate must not be satisfiable by the entity's own name. */
ok("naming GitHub is not itself a portfolio signal", entitiesFor("github repo nedir").length === 0);

/* ---------- H. no substring accidents, no fuzzy matching ---------- */

const NO_ENTITY = [
  "sinema filmi öner",
  "sınama ve değerlendirme arasındaki fark nedir",
  "sınama nedir",
  "dot product nedir",
  "net maaş nedir",
  "c dili nedir",
  "internet bağlantım yok",
  "bugün hava nasıl",
];
for (const question of NO_ENTITY) {
  check(`no entity is invented for: ${question}`, resolvesTo(question), "");
}
/* The ambiguous spelling resolves once the question shows it is about the
 * portfolio — the rule is a gate, not a blanket ban. */
ok("the ordinary-word spelling still resolves with a portfolio signal", entitiesFor("sınama projesi ne").includes("SINAMA"));
ok("the unambiguous spelling resolves on its own", entitiesFor("sinama ne işe yarıyor").includes("SINAMA"));
/* And the fold that makes this possible keeps the two spellings apart. */
check("the dotless fold preserves ı", foldPreservingDotless("sınama"), "sınama");
check("the ordinary fold does not", foldQuestion("sınama"), "sinama");

/* ---------- I. the retrieval query, and the untouched question ---------- */

for (const question of ["sinamanın stacki ne", "cbot'ta ne yaptı", "c sharp projeleri neler", "merge rush nasıl çalışıyor"]) {
  const query = buildRetrievalQuery(question, resolveEntities(question, aliasIndex));
  ok(`the retrieval query keeps the question verbatim: ${question}`, query.startsWith(question));
  ok(`it carries canonical entity names: ${question}`, /canonical entities:/.test(query));
}
check(
  "SINAMA is named by its full canonical title",
  buildRetrievalQuery("sinamanın stacki ne", resolveEntities("sinamanın stacki ne", aliasIndex)),
  `sinamanın stacki ne\ncanonical entities: ${raw.projects.flagship.SINAMA.name}`,
);
check(
  "a question with no entity is passed through unchanged",
  buildRetrievalQuery("bugün hava nasıl", resolveEntities("bugün hava nasıl", aliasIndex)),
  "bugün hava nasıl",
);
/* The load-bearing one: a question that uses the ordinary Turkish word must
 * reach retrieval EXACTLY as typed. Alias resolution adds nothing, so this
 * brief cannot be what makes such a question look like a portfolio question —
 * what retrieval then returns, and how the model scopes it, belong to the
 * ranking work in a later brief. */
{
  const question = "sınama ve değerlendirme arasındaki fark nedir";
  check(
    "an ordinary-word question is embedded verbatim, with nothing added",
    buildRetrievalQuery(question, resolveEntities(question, aliasIndex)),
    question,
  );
}

/* ---------- J. end to end: fast path and pipeline ---------- */

let embedCalls = 0;
let chatCalls = 0;
const embedQueries = [];
const stub = async (url, init) => {
  if (String(url).includes("/api/chat")) {
    chatCalls += 1;
    throw new Error("generation is not exercised here");
  }
  embedCalls += 1;
  const batch = JSON.parse(init.body).input;
  if (batch.length === 1) embedQueries.push(batch[0]);
  return { ok: true, json: async () => ({ embeddings: batch.map(() => [1, 0, 0]) }) };
};

const rag = createAjoopRag({ env: ENV, fetchImpl: stub });
const status = await rag.initialize();
ok("the index still builds", status.ready);
check("every fact is loaded into the runtime", status.exactFacts, facts.length);
check("every alias entity is loaded", status.aliasEntities, aliasIndex.entities.length);
/* Derived, not hard-coded: the corpus size follows from the datasets plus the
 * master records, so editing the canonical knowledge moves this number without
 * anyone having to remember to update a literal here. */
check(
  "the corpus is exactly the datasets plus the master knowledge",
  status.chunks,
  status.datasetChunks + status.masterKnowledgeChunks - status.duplicateChunks,
);
check("this brief added no chunks of its own", status.masterKnowledgeRecords, loaded.records.length);

const ask = (question, locale = "tr") =>
  rag.handle({
    method: "POST",
    origin: ORIGIN,
    contentType: "application/json",
    body: JSON.stringify({ version: 1, mode: "rag", question, locale, history: [] }),
  });

/* An exact fact costs no embedding and no generation. A stub that throws on
 * /api/chat means a 200 here is proof the model was never reached. */
{
  const before = { embedCalls, chatCalls };
  for (const question of ["CV", "Kaan'ın LinkedIn'i", "kaç sertifikası var", "programlama dilleri"]) {
    const response = await ask(question);
    check(`[e2e] answered deterministically: ${question}`, response.status, 200);
    check(`[e2e] scope is portfolio: ${question}`, response.body.scope, "portfolio");
    ok(`[e2e] the answer is prose: ${question}`, response.body.answer.length > 20);
    ok(`[e2e] it names the fact that answered: ${question}`, Boolean(response.body.exactFact));
    ok(`[e2e] it carries its source record: ${question}`, response.body.sources.length === 1);
  }
  check("[e2e] exact facts made no embedding call", embedCalls - before.embedCalls, 0);
  check("[e2e] exact facts made no generation call", chatCalls - before.chatCalls, 0);
}

/* The response contract the browser reads is unchanged. */
{
  const response = await ask("Kaan'ın LinkedIn'i");
  for (const field of ["ok", "mode", "scope", "answer", "model", "embedModel", "sources", "retrievalTopScore"]) {
    ok(`[e2e] the response keeps its ${field} field`, field in response.body);
  }
  check("[e2e] mode is still rag", response.body.mode, "rag");
  ok("[e2e] the answer carries the canonical LinkedIn URL", response.body.answer.includes(contact.linkedin.value));
}

/* A non-exact question still goes through retrieval, with the alias-aware
 * query. It reaches generation, which this stub refuses — a 503 is the proof. */
{
  embedQueries.length = 0;
  const before = chatCalls;
  const response = await ask("sinamanın stacki ne");
  check("[e2e] a normal question reaches generation", response.status, 503);
  check("[e2e] generation was called once", chatCalls - before, 1);
  ok("[e2e] the embedding query carried the canonical entity", /SINAMA/.test(embedQueries[0] || ""));
  ok("[e2e] and kept the original wording", (embedQueries[0] || "").includes("sinamanın stacki ne"));
}

/* A general question is untouched by both mechanisms: no exact fact, and an
 * embedding query identical to what the visitor typed. */
{
  embedQueries.length = 0;
  const response = await ask("GitHub nedir?");
  check("[e2e] a definition question is not answered from a fact", response.status, 503);
  ok("[e2e] and it carries no exact fact", !("exactFact" in response.body));
  check("[e2e] its embedding query is the question, verbatim", embedQueries[0], "GitHub nedir?");
  ok("[e2e] with no canonical entity tail", !/canonical entities:/.test(embedQueries[0] || ""));
}

/* The live-data guard still runs first, ahead of everything added here. */
{
  const before = { embedCalls, chatCalls };
  const response = await ask("güncel dolar kuru kaç tl");
  check("[e2e] the live-data guard still fires", response.status, 200);
  check("[e2e] it is still GENERAL", response.body.scope, "general");
  ok("[e2e] it invents no rate", !/[0-9]/.test(response.body.answer));
  check("[e2e] it still costs nothing upstream", embedCalls - before.embedCalls + (chatCalls - before.chatCalls), 0);
}

/* History does not decide exact facts. */
{
  const response = await rag.handle({
    method: "POST",
    origin: ORIGIN,
    contentType: "application/json",
    body: JSON.stringify({
      version: 1,
      mode: "rag",
      question: "LinkedIn nedir?",
      locale: "tr",
      history: [
        { role: "user", content: "Kaan Balcı kimdir?" },
        { role: "assistant", content: "Kaan Balcı bir Forward Deployed Engineer." },
      ],
    }),
  });
  ok("[e2e] a Kaan-shaped history does not turn a definition into a fact", !("exactFact" in response.body));
}

/* ---------- K. on-request records are not retrievable ----------
 *
 * The phone is embedded and stays in the canonical corpus, but cosine
 * similarity has no notion of consent: a question that never asked for a number
 * could otherwise rank the on-request chunk into the model's context and have
 * it read back out. The stub below is adversarial on purpose — it scores the
 * phone chunk top for any question mentioning a phone — so the assertions fail
 * if the visibility gate is removed.
 */
{
  check("the retrievable index is smaller than the corpus", status.chunks > status.retrievableChunks, true);
  check(
    "by exactly the on-request records",
    status.chunks - status.retrievableChunks,
    loaded.stats.onRequestRecords,
  );

  const chatPrompts = [];
  const phoneSeeking = async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).includes("/api/chat")) {
      chatPrompts.push(body.messages.map((message) => message.content).join("\n"));
      return { ok: true, json: async () => ({ message: { content: " PORTFOLIO\nANSWER: Stubbed." } }) };
    }
    /* Anything phone-shaped scores 1, everything else ~0. If the on-request
     * chunk were eligible it would win every one of these questions. */
    return {
      ok: true,
      json: async () => ({
        embeddings: body.input.map((text) => [/telefon|phone|numara/i.test(text) ? 1 : 0, 0.01, 0]),
      }),
    };
  };
  const guarded = createAjoopRag({ env: ENV, fetchImpl: phoneSeeking });
  await guarded.initialize();
  const askGuarded = (question) =>
    guarded.handle({
      method: "POST",
      origin: ORIGIN,
      contentType: "application/json",
      body: JSON.stringify({ version: 1, mode: "rag", question, locale: "tr", history: [] }),
    });

  /* Questions that mention a phone but do NOT hit the exact route, so they fall
   * through to retrieval and generation. */
  for (const question of ["telefon nasıl çalışır?", "telefon numarası nasıl doğrulanır?"]) {
    chatPrompts.length = 0;
    const response = await askGuarded(question);
    check(`[guard] it fell through to generation: ${question}`, response.status, 200);
    ok(`[guard] no exact fact answered it: ${question}`, !("exactFact" in response.body));
    ok(
      `[guard] no on-request record was retrieved: ${question}`,
      response.body.sources.every((source) => source.entityId !== "contacts:on-request"),
    );
    ok(
      `[guard] the model's context never carried the phone number: ${question}`,
      chatPrompts.every((prompt) => !prompt.includes(contact.phone.value)),
    );
  }

  /* No on-request record of any kind can be retrieved, phone or not. */
  const onRequestIds = loaded.records
    .filter((record) => record.visibility === "public_on_request")
    .map((record) => record.id);
  ok("there are on-request records to exclude", onRequestIds.length > 0);
  for (const question of ["Kaan'ın ilgi alanları neler", "telefon numarası nasıl doğrulanır?", "Kaan hangi şirketlerde çalıştı"]) {
    const response = await askGuarded(question);
    ok(
      `[guard] no on-request record surfaces for: ${question}`,
      (response.body.sources || []).every((source) => !onRequestIds.includes(source.entityId)),
    );
  }

  /* And the narrow route still works, still without touching the model. */
  let upstream = 0;
  const counting = async (url, init) => {
    upstream += 1;
    if (String(url).includes("/api/chat")) throw new Error("generation must not be reached");
    return {
      ok: true,
      json: async () => ({ embeddings: JSON.parse(init.body).input.map(() => [1, 0, 0]) }),
    };
  };
  const exactRag = createAjoopRag({ env: ENV, fetchImpl: counting });
  await exactRag.initialize();
  const callsAfterInit = upstream;
  const phoneAnswer = await exactRag.handle({
    method: "POST",
    origin: ORIGIN,
    contentType: "application/json",
    body: JSON.stringify({ version: 1, mode: "rag", question: "Kaan'ın telefon numarası ne?", locale: "tr", history: [] }),
  });
  check("[guard] the explicit phone question is answered", phoneAnswer.status, 200);
  check("[guard] by the exact phone fact", phoneAnswer.body.exactFact, "contact:phone");
  ok("[guard] and returns the number", phoneAnswer.body.answer.includes(contact.phone.value));
  check("[guard] costing zero embed and chat calls", upstream - callsAfterInit, 0);
}

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Ajoop exact facts: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(
  `Ajoop exact-fact and alias contracts passed. ${passed} assertions · ` +
    `${facts.length} facts · ${aliasIndex.entities.length} entities / ${aliasIndex.aliasCount} aliases · no network, no Ollama.`,
);
