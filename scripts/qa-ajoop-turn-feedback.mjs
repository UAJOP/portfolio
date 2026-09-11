#!/usr/bin/env node
/**
 * qa-ajoop-turn-feedback.mjs — A5.1.1 truthful turn feedback.
 *
 * Runs the SHIPPED js/ajoop/assistant.js against a small in-memory DOM: no
 * browser, no network, no bridge. It pins the properties whose failure would
 * still look like a working panel — an ordinary answer that quietly changed
 * shape, a provenance line that went missing, a "checking" that reads as a
 * failure, an unavailable bridge presented as Ajoop being down, a raw provider
 * error reaching the transcript, a turn that never ends.
 *
 * Section 12 adds A5.1.2 mobile and keyboard polish: where focus lands on open,
 * Tab from the focused dialog, and the short-viewport and touch-first CSS rules.
 * CSS checks there are static contracts, not geometry.
 *
 * Node built-ins only, consistent with the other qa-* checks.
 *
 *   node scripts/qa-ajoop-turn-feedback.mjs
 *   node scripts/qa-ajoop-turn-feedback.mjs --baseline=<old assistant.js>
 *
 * --baseline additionally renders every ordinary answer fixture with an earlier
 * assistant.js (for example `git show origin/main:js/ajoop/assistant.js`) and
 * requires byte-identical DOM, which is the strongest form of "unchanged".
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { getAjoopActionPolicy, listAjoopActionTypes } from "../server/ajoop-action-contract.mjs";
import { AJOOP_READ_CONNECTORS } from "../server/ajoop-read-connector-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), "utf8");

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

/* ---------- a minimal DOM ---------- */

/** Every text write to a turn's activity label, in order. */
const activityLog = [];

function matchSimple(element, selector) {
  const tokens = selector.match(/^[a-z0-9]+|\.[\w-]+|\[[^\]]+\]/gi) || [];
  if (tokens.join("") !== selector) throw new Error(`unsupported selector in the QA DOM: ${selector}`);
  return tokens.every((token) => {
    if (token[0] === ".") return element.classList.contains(token.slice(1));
    if (token[0] === "[") {
      const match = token.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      if (!match) throw new Error(`unsupported attribute selector in the QA DOM: ${token}`);
      return match[2] === undefined ? element.hasAttribute(match[1]) : element.getAttribute(match[1]) === match[2];
    }
    return element.tagName === token.toUpperCase();
  });
}

class FakeElement {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = document;
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this._text = "";
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.disabled = false;
    const element = this;
    const tokens = () => element.className.split(/\s+/).filter(Boolean);
    this.classList = {
      contains: (token) => tokens().includes(token),
      add: (...added) => {
        element.className = [...new Set([...tokens(), ...added])].join(" ");
      },
      remove: (...removed) => {
        element.className = tokens().filter((token) => !removed.includes(token)).join(" ");
      },
      toggle: (token, force) => {
        const on = force === undefined ? !tokens().includes(token) : Boolean(force);
        if (on) element.classList.add(token);
        else element.classList.remove(token);
        return on;
      },
    };
  }
  get childNodes() {
    return this.children;
  }
  get isConnected() {
    for (let node = this; node; node = node.parentNode) {
      if (node === this.ownerDocument.body) return true;
    }
    return false;
  }
  get hidden() {
    return this.attributes.has("hidden");
  }
  set hidden(value) {
    if (value) this.attributes.set("hidden", "");
    else this.attributes.delete("hidden");
  }
  get id() {
    return this.getAttribute("id") || "";
  }
  set id(value) {
    this.setAttribute("id", value);
  }
  setAttribute(name, value) {
    if (name === "class") this.className = String(value);
    else this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    if (name === "class") return this.className;
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  hasAttribute(name) {
    return name === "class" ? Boolean(this.className) : this.attributes.has(name);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  appendChild(child) {
    if (child.parentNode) child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }
  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join("");
  }
  set textContent(value) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._text = String(value);
    if (this.attributes.has("data-ajoop-turn-activity")) activityLog.push(this._text);
  }
  addEventListener() {}
  focus() {}
  matches(selector) {
    return selector.split(",").some((part) => matchSimple(this, part.trim()));
  }
  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function createDocument() {
  const document = { createElement: (tag) => new FakeElement(tag, document) };
  document.body = new FakeElement("body", document);
  document.querySelector = (selector) => document.body.querySelector(selector);
  document.querySelectorAll = (selector) => document.body.querySelectorAll(selector);
  document.addEventListener = () => {};
  return document;
}

/** The parts of the real panel the renderers address, mirroring its template. */
function mountPanel(document) {
  const el = (tag, attributes = {}, children = []) => {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(child);
    return element;
  };
  const service = el("p", { class: "chatbot-service", "data-chatbot-bridge": "", role: "status", hidden: "" }, [
    el("span", { class: "chatbot-service-dot", "aria-hidden": "true" }),
    el("span", { "data-chatbot-bridge-text": "" }),
  ]);
  const list = el("div", { class: "chatbot-messages", "data-chatbot-messages": "", "aria-live": "polite" });
  const quicks = el("div", { class: "chatbot-quicks", "data-chatbot-quicks": "" }, [el("button"), el("button")]);
  const widget = el("aside", { class: "portfolio-chatbot", "data-portfolio-chatbot": "" }, [
    el("div", { class: "chatbot-header" }, [
      el("span", { class: "ajoop-mascot", "data-ajoop-mascot": "idle" }),
      el("div", { class: "chatbot-identity" }, [el("p", { "data-chatbot-subtitle": "" }), service]),
      el("span", { class: "ajoop-mascot-state", "data-ajoop-mascot-label": "" }),
    ]),
    list,
    quicks,
  ]);
  document.body.appendChild(widget);
  return { widget, service, list, quicks };
}

const EXPORTS = [
  "AJOOP_TURN_STATE",
  "AJOOP_TURN_SAFE_CODE",
  "AJOOP_TURN_SOURCES",
  "AJOOP_PRESENTATION_SOURCE_LIMIT",
  "AJOOP_PRESENTATION_SOURCES",
  "AJOOP_PRESENTATION_ACTIONS",
  "normalizeAjoopTurnStatus",
  "normalizeAjoopPresentationSources",
  "normalizeAjoopActionPreview",
  "ajoopProvenanceLabel",
  "renderAjoopActionPreview",
  "ajoopTurnActivityLabel",
  "ajoopTurnOutcomeLabel",
  "ajoopTurnOutcome",
  "ajoopServiceState",
  "ajoopServiceLabel",
  "fillAjoopMessage",
  "openAjoopTurn",
  "renderAjoopTurnActivity",
  "finishAjoopTurn",
  "answerAjoopRoute",
  "setAjoopTurnBusy",
  "renderAjoopBridgeStatus",
  "initializeAjoopAi",
  "ajoopHeaderSubtitle",
  "portfolioChatbotState",
  "focusAjoopEntry",
  "handleAjoopPanelKeydown",
];

/**
 * The shipped assistant in a fresh realm.
 *
 * `setupPortfolioChatbot()` runs at load and returns at once, because the panel
 * is already mounted. Everything the assistant reaches for through a typeof
 * guard — bridge state, planner, RAG transport — is absent unless a test
 * supplies it, which is exactly the shipped behaviour with those modules off.
 */
function loadAssistant(globals = {}, file = "js/ajoop/assistant.js") {
  const document = createDocument();
  const panel = mountPanel(document);
  const timers = [];
  const remembered = [];
  const window = {
    setTimeout: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout: () => {},
    open: () => {},
    location: { href: "" },
  };
  const sandbox = {
    window,
    document,
    console,
    resumeLink: "CV-KAAN-BALCI.pdf",
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    getI18nText: (english, turkish, locale) => (locale === "tr" ? turkish : english),
    getCurrentLocale: () => "en",
    renderableLocaleId: (locale) => locale,
    getLocalizedCollection: (collection, locale) => collection[locale] || collection.en,
    escapeProjectHtml: (value) => String(value),
    rememberAjoopRagExchange: (entry) => remembered.push(entry),
    ...globals,
  };
  vm.createContext(sandbox);
  vm.runInContext(read(file), sandbox, { filename: file });
  const api = vm.runInContext(
    `({ ${EXPORTS.map((name) => `${name}: typeof ${name} === "undefined" ? undefined : ${name}`).join(", ")} })`,
    sandbox,
  );
  const flushTimers = () => {
    while (timers.length) timers.shift()();
  };
  return { sandbox, document, panel, api, remembered, flushTimers };
}

const settle = async () => {
  for (let index = 0; index < 25; index += 1) await new Promise((resolve) => setImmediate(resolve));
};

function serialize(element) {
  const tag = element.tagName.toLowerCase();
  const attributes = [...element.attributes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");
  const classes = element.className ? ` class="${element.className}"` : "";
  const properties = ["href", "target", "rel"]
    .filter((name) => element[name] !== undefined)
    .map((name) => ` ${name}=${element[name]}`)
    .join("");
  const inner = element._text + element.children.map(serialize).join("");
  /* Card ids come from a module-wide counter, so two renders differ only there. */
  return `<${tag}${classes}${attributes}${properties}>${inner}</${tag}>`.replace(/ajoop-card-\d+/g, "ajoop-card-N");
}

/** Text an exception, a bridge or a provider could carry — none may be rendered. */
const HOSTILE = {
  error: "ECONNREFUSED 127.0.0.1:8787",
  message: "Request failed with status code 502 from https://gmail.googleapis.com/gmail/v1/users/me",
  detail: "C:\\Users\\kaan-\\.ajoop-runtime\\google-token.json",
  stack: "TypeError: Cannot read properties of undefined (reading 'cards')\n    at planAjoopResponse (js/ajoop/response.js:12:7)",
  endpoint: "https://ajoop.kaanbalci.com/ajoop-rag",
  token: "ya29.a0-secret-token",
  prompt: "You are Ajoop. System prompt:",
};
const HOSTILE_MARKERS = [
  "ECONNREFUSED",
  "8787",
  "googleapis",
  "status code",
  ".ajoop-runtime",
  "google-token",
  "TypeError",
  "response.js",
  "ajoop-rag",
  "ya29",
  "System prompt",
  "network-error",
  "timeout",
  "http-error",
];
const noHostileText = (label, html) => {
  const leaked = HOSTILE_MARKERS.filter((marker) => html.includes(marker));
  check(`${label} leaks nothing raw${leaked.length ? ` (${leaked.join(", ")})` : ""}`, leaked.length, 0);
};

const CARD = {
  type: "project",
  entityId: "sinama",
  title: "SINAMA — AI Agent Reliability Lab",
  summary:
    "A reliability lab for repeatable multi-turn agent testing, with typed scenarios, captured transcripts and review of every run against its expectations.",
  meta: ["Applied AI / Reliability", "Live MVP", "2026"],
  tags: ["FastAPI", "PostgreSQL", "React", "Docker"],
  proof: ["14-scenario typed cross-vertical suite", "Transcript capture", "Run review", "Regression tracking"],
  links: [
    { label: "Case study", url: "sinama-case-study.html", kind: "caseStudy" },
    { label: "GitHub", url: "https://github.com/UAJOP/sinama", kind: "github" },
    { label: "Live", url: "https://sinama.kaanbalci.com", kind: "live" },
  ],
};
const COMPARISON = {
  left: { title: "SINAMA" },
  right: { title: "Merge Rush" },
  rows: [
    { label: "Stack", a: ["FastAPI", "PostgreSQL"], b: ["Unity", "C#"] },
    { label: "Status", a: "Live MVP", b: "" },
  ],
  links: {
    left: [{ label: "Case study", url: "sinama-case-study.html" }],
    right: [{ label: "Case study", url: "merge-rush-case-study.html" }],
  },
};
const LINKS = [
  { label: "Works", url: "works.html" },
  { label: "GitHub", url: "https://github.com/UAJOP" },
];

/** Every ordinary answer shape the panel renders today. */
const FIXTURES = [
  ["prepared answer with links", { type: "bot", language: "en", text: "Prepared canonical answer.", links: LINKS, provenance: "evidence" }],
  ["evidence answer with a card", { type: "bot", language: "en", text: "SINAMA is the flagship.", cards: [CARD], provenance: "evidence" }],
  ["deep evidence answer", { type: "bot", language: "en", text: "In detail.", cards: [CARD], detail: true, provenance: "evidence" }],
  ["comparison answer", { type: "bot", language: "en", text: "Side by side.", comparison: COMPARISON, provenance: "evidence" }],
  ["AI-assisted grounded answer", { type: "bot", language: "en", text: "AI restated it.", cards: [CARD], provenance: "ai" }],
  ["general answer", { type: "bot", language: "en", text: "RAG is retrieval-augmented generation." }],
  ["greeting", { type: "bot", text: "Hey, I am Ajoop." }],
  ["Turkish evidence answer", { type: "bot", language: "tr", text: "SINAMA amiral gemisi.", cards: [CARD], links: LINKS, provenance: "evidence" }],
  ["Turkish AI-assisted answer", { type: "bot", language: "tr", text: "AI yeniden anlattı.", provenance: "ai" }],
  ["user echo", { type: "user", text: "SINAMA?" }],
];

const renderSpec = (env, spec) => {
  const message = env.document.createElement("div");
  message.className = `chatbot-message ${spec.type === "user" ? "user" : "bot"}`;
  env.api.fillAjoopMessage(message, spec);
  return message;
};

/* ---------- 1. the bounded presentation contract ---------- */

{
  const { api } = loadAssistant();
  const states = Object.values(api.AJOOP_TURN_STATE);
  check("the contract names six turn states", states.length, 6);
  for (const state of ["checking", "reading", "preparing", "completed", "partial", "unavailable"]) {
    ok(`turn state exists: ${state}`, states.includes(state));
  }
  check("an unknown state is not presentable", api.normalizeAjoopTurnStatus({ state: "exploding" }), null);
  check("a bare string is not presentable", api.normalizeAjoopTurnStatus("unavailable"), null);
  check("nothing is not presentable", api.normalizeAjoopTurnStatus(null), null);

  const hostile = api.normalizeAjoopTurnStatus({
    ...HOSTILE,
    state: "unavailable",
    source: "https://gmail.googleapis.com/gmail/v1",
    partial: "yes",
    safeCode: "ECONNREFUSED",
  });
  check("the contract carries exactly four fields", Object.keys(hostile).sort().join(","), "partial,safeCode,source,state");
  check("an unlisted source falls back to the portfolio", hostile.source, "portfolio");
  check("an unlisted safe code is dropped", hostile.safeCode, null);
  check("partial must be literally true", hostile.partial, false);
  ok("the normalized contract is frozen", Object.isFrozen(hostile));
  ok("no raw field survives normalization", !HOSTILE_MARKERS.some((marker) => JSON.stringify(hostile).includes(marker)));
  check("an inherited property name is not a source", api.normalizeAjoopTurnStatus({ state: "reading", source: "toString" }).source, "portfolio");
  check("the partial state implies partial", api.normalizeAjoopTurnStatus({ state: "partial" }).partial, true);
  for (const source of ["gmail", "calendar", "github", "drive"]) {
    check(`a future owner source is accepted as a label: ${source}`, api.normalizeAjoopTurnStatus({ state: "reading", source }).source, source);
  }
  check("the public portfolio source has no name", api.AJOOP_TURN_SOURCES.portfolio, null);
  ok("source names are plain product names, never addresses",
    Object.values(api.AJOOP_TURN_SOURCES).every((name) => name === null || /^[A-Za-z ]+$/.test(name)));
}

/* ---------- 2. copy: activity, outcome, service ---------- */

{
  const { api } = loadAssistant();
  const status = (raw) => api.normalizeAjoopTurnStatus(raw);
  const activity = (raw, language = "en") => api.ajoopTurnActivityLabel(status(raw), language);

  check("checking, public, EN", activity({ state: "checking" }), "Looking into it…");
  check("checking, public, TR", activity({ state: "checking" }, "tr"), "Bakıyorum…");
  check("reading, public, EN", activity({ state: "reading" }), "Reading portfolio evidence…");
  check("reading, public, TR", activity({ state: "reading" }, "tr"), "Portfolyo kanıtı okunuyor…");
  check("preparing, EN", activity({ state: "preparing" }), "Preparing the answer…");
  check("preparing, TR", activity({ state: "preparing" }, "tr"), "Yanıt hazırlanıyor…");
  check("reading a future owner source, EN", activity({ state: "reading", source: "gmail" }), "Reading Gmail…");
  check("reading a future owner source, TR", activity({ state: "reading", source: "gmail" }, "tr"), "Gmail okunuyor…");
  check("checking a future owner source, EN", activity({ state: "checking", source: "calendar" }), "Checking Google Calendar…");
  check("checking a future owner source, TR", activity({ state: "checking", source: "calendar" }, "tr"), "Google Calendar kontrol ediliyor…");
  check("reading GitHub", activity({ state: "reading", source: "github" }), "Reading GitHub…");
  check("reading Drive", activity({ state: "reading", source: "drive" }), "Reading Google Drive…");
  ok("public activity names no provider",
    ["checking", "reading", "preparing"].every((state) => !/Gmail|Calendar|GitHub|Drive/.test(activity({ state }))));

  const plan = { type: "answer", text: "Grounded.", provenance: "evidence", cards: [], links: [] };
  const outcome = (p, model) => api.ajoopTurnOutcome(p, model);
  check("plan + AI answer completes", outcome(plan, { ok: true, answer: "x" }).state, "completed");
  check("plan + AI answer carries no code", outcome(plan, { ok: true, answer: "x" }).safeCode, null);
  check("plan without assistance carries no code", outcome(plan, null).safeCode, null);
  for (const reason of ["timeout", "network-error", "http-error", "invalid-response", "busy", "oversized"]) {
    check(`a real attempt that failed marks assistance unavailable: ${reason}`,
      outcome(plan, { ok: false, reason }).safeCode, "assist-unavailable");
    check(`a failed attempt still completes the grounded answer: ${reason}`, outcome(plan, { ok: false, reason }).state, "completed");
  }
  for (const reason of ["not-configured", "unavailable", "stale", "duplicate-turn"]) {
    check(`a reason that says nothing about this answer is quiet: ${reason}`, outcome(plan, { ok: false, reason }).safeCode, null);
  }
  check("no plan and no answer is the whole request failing", outcome(null, null).safeCode, "turn-failed");
  check("the whole request failing is unavailable", outcome(null, null).state, "unavailable");
  check("no plan and a failed attempt is the whole request failing", outcome(null, { ok: false, reason: "timeout" }).safeCode, "turn-failed");
  check("no plan but an AI answer completes", outcome(null, { ok: true, answer: "x" }).state, "completed");

  const note = (raw, language = "en") => api.ajoopTurnOutcomeLabel(status(raw), language);
  check("whole failure copy, EN", note({ state: "unavailable", safeCode: "turn-failed" }),
    "I could not prepare an answer this time. Please try again.");
  check("whole failure copy, TR", note({ state: "unavailable", safeCode: "turn-failed" }, "tr"),
    "Bu sefer bir yanıt hazırlayamadım. Lütfen tekrar dene.");
  check("assistance note, EN", note({ state: "completed", safeCode: "assist-unavailable" }), "AI assistance unavailable");
  check("assistance note, TR", note({ state: "completed", safeCode: "assist-unavailable" }, "tr"), "AI desteği kullanılamadı");
  check("partial note, public", note({ state: "partial" }), "Some sources unavailable");
  check("partial note, TR", note({ state: "partial" }, "tr"), "Bazı kaynaklar kullanılamadı");
  check("partial note names a future source", note({ state: "completed", source: "github", safeCode: "source-partial" }), "GitHub partly unavailable");
  check("a plain success has no note", note({ state: "completed" }), null);

  check("service: available", api.ajoopServiceState("available"), "available");
  check("service: checking", api.ajoopServiceState("checking"), "checking");
  check("service: unavailable", api.ajoopServiceState("unavailable"), "unavailable");
  for (const quiet of ["unknown", "disabled", "AI Mode", undefined, null]) {
    check(`service makes no claim for: ${String(quiet)}`, api.ajoopServiceState(quiet), null);
  }
  check("service available, EN", api.ajoopServiceLabel("available", "en"), "AI assistance available");
  check("service checking, EN", api.ajoopServiceLabel("checking", "en"), "Checking AI assistance…");
  check("service unavailable, EN", api.ajoopServiceLabel("unavailable", "en"), "AI assistance unavailable; grounded answers still work.");
  check("service available, TR", api.ajoopServiceLabel("available", "tr"), "AI desteği kullanılabilir");
  check("service checking, TR", api.ajoopServiceLabel("checking", "tr"), "AI desteği kontrol ediliyor…");
  check("service unavailable, TR", api.ajoopServiceLabel("unavailable", "tr"), "AI desteği kullanılamıyor; kanıta dayalı yanıtlar çalışıyor.");
  for (const language of ["en", "tr"]) {
    ok(`checking never reads as a failure (${language})`,
      !/unavailable|offline|fail|error|kullanılamıyor|çevrimdışı|hata/i.test(api.ajoopServiceLabel("checking", language)));
    ok(`available never reads as a failure (${language})`,
      !/unavailable|offline|fail|error|kullanılamıyor|çevrimdışı|hata/i.test(api.ajoopServiceLabel("available", language)));
    ok(`no service copy says Ajoop itself is down (${language})`,
      ["available", "checking", "unavailable"].every((service) => !/ajoop/i.test(api.ajoopServiceLabel(service, language))));
  }
  ok("unavailable says grounded answers still work", /still work/.test(api.ajoopServiceLabel("unavailable", "en")));
  ok("unavailable says grounded answers still work (TR)", /çalışıyor/.test(api.ajoopServiceLabel("unavailable", "tr")));
}

/* ---------- 3. ordinary answers render exactly as before ---------- */

{
  const env = loadAssistant();
  for (const [label, spec] of FIXTURES) {
    const plain = serialize(renderSpec(env, spec));
    const withSuccess = serialize(renderSpec(env, { ...spec, status: { state: "completed" } }));
    check(`a plain success adds nothing to the DOM: ${label}`, withSuccess, plain);
    ok(`an ordinary answer carries no turn status: ${label}`, !plain.includes("data-ajoop-turn-status"));
    ok(`an ordinary answer carries no provenance note: ${label}`, !plain.includes("ajoop-provenance-note"));
  }

  const evidence = renderSpec(env, FIXTURES[1][1]);
  check("evidence answer anatomy is prose, card, provenance",
    evidence.children.map((child) => child.className).join(" | "),
    "chatbot-message-text | ajoop-card | ajoop-provenance");
  const provenance = evidence.querySelector(".ajoop-provenance");
  check("portfolio-grounded provenance label", provenance.textContent, "Portfolio evidence");
  check("portfolio-grounded provenance kind", provenance.getAttribute("data-ajoop-provenance"), "evidence");
  check("provenance is the last thing in the message", evidence.children.at(-1), provenance);

  const links = renderSpec(env, FIXTURES[0][1]);
  check("prepared answer anatomy is prose, links, provenance",
    links.children.map((child) => child.className).join(" | "),
    "chatbot-message-text | chatbot-message-links | ajoop-provenance");

  const ai = renderSpec(env, FIXTURES[4][1]).querySelector(".ajoop-provenance");
  check("AI-assisted grounded provenance label", ai.textContent, "AI-assisted · grounded in portfolio evidence");
  check("AI-assisted grounded provenance kind", ai.getAttribute("data-ajoop-provenance"), "ai");
  check("Turkish portfolio provenance", renderSpec(env, FIXTURES[7][1]).querySelector(".ajoop-provenance").textContent, "Portfolyo kanıtı");
  check("Turkish AI provenance", renderSpec(env, FIXTURES[8][1]).querySelector(".ajoop-provenance").textContent,
    "AI destekli · portfolyo kanıtına dayalı");
  for (const index of [5, 6, 9]) {
    check(`no provenance where no evidence claim is made: ${FIXTURES[index][0]}`,
      renderSpec(env, FIXTURES[index][1]).querySelector(".ajoop-provenance"), null);
  }

  const baselineArg = process.argv.find((arg) => arg.startsWith("--baseline="));
  if (baselineArg) {
    const baseline = loadAssistant({}, baselineArg.slice("--baseline=".length));
    for (const [label, spec] of FIXTURES) {
      check(`byte-identical to the baseline assistant: ${label}`,
        serialize(renderSpec(env, spec)), serialize(renderSpec(baseline, spec)));
    }
  }
}

/* ---------- A5.1.3 REAL BEHAVIOR TESTS: connected presentation ---------- */

{
  const env = loadAssistant();
  const { api } = env;
  check("connected source list is bounded", api.AJOOP_PRESENTATION_SOURCE_LIMIT, 3);
  check("presentation source allowlist is exact",
    Object.keys(api.AJOOP_PRESENTATION_SOURCES).join(","), "portfolio,gmail,calendar,github,drive");
  check("presentation sources match the A4 connected connector registry",
    Object.keys(api.AJOOP_PRESENTATION_SOURCES).slice(1).join(","), Object.values(AJOOP_READ_CONNECTORS).join(","));
  check("singular Gmail source remains supported",
    api.normalizeAjoopPresentationSources({ source: "gmail" }).join(","), "gmail");
  check("Calendar uses its product label",
    api.ajoopProvenanceLabel("evidence", "en", ["calendar"]), "Google Calendar evidence");
  check("GitHub uses its product label",
    api.ajoopProvenanceLabel("evidence", "en", ["github"]), "GitHub evidence");
  check("Drive uses its product label",
    api.ajoopProvenanceLabel("evidence", "en", ["drive"]), "Google Drive evidence");
  check("duplicates are removed and canonical order is stable",
    api.normalizeAjoopPresentationSources(["calendar", "gmail", "calendar"]).join(","), "gmail,calendar");
  check("source count is capped after stable ordering",
    api.normalizeAjoopPresentationSources(["drive", "github", "calendar", "gmail", "portfolio"]).join(","),
    "portfolio,gmail,calendar");
  check("unknown source is rejected",
    api.normalizeAjoopPresentationSources(["slack"]).join(","), "");
  check("hostile source text is rejected",
    api.normalizeAjoopPresentationSources([HOSTILE.message, HOSTILE.token, HOSTILE.detail]).join(","), "");
  ok("normalized sources are frozen", Object.isFrozen(api.normalizeAjoopPresentationSources(["gmail"])));

  const portfolioDefault = renderSpec(env, {
    type: "bot", language: "en", text: "Existing public answer.", provenance: "evidence",
  });
  const defaultProvenance = portfolioDefault.querySelector(".ajoop-provenance");
  check("absent source metadata preserves Portfolio evidence", defaultProvenance.textContent, "Portfolio evidence");
  ok("absent source metadata does not opt into connected styling",
    !defaultProvenance.classList.contains("ajoop-provenance-connected"));
  check("absent source metadata adds no connected source attribute",
    defaultProvenance.getAttribute("data-ajoop-sources"), null);

  const portfolio = renderSpec(env, {
    type: "bot", language: "en", text: "Explicit portfolio answer.", provenance: "evidence", source: "portfolio",
  });
  check("explicit Portfolio source remains supported",
    portfolio.querySelector(".ajoop-provenance").textContent, "Portfolio evidence");

  const gmail = renderSpec(env, {
    type: "bot", language: "en", text: "One safe answer.", provenance: "evidence", source: "gmail",
  });
  const gmailProvenance = gmail.querySelector(".ajoop-provenance");
  check("Gmail source renders truthful evidence wording", gmailProvenance.textContent, "Gmail evidence");
  check("Gmail source is exposed only as a bounded code", gmailProvenance.getAttribute("data-ajoop-sources"), "gmail");
  ok("connected provenance receives quiet visual treatment", gmailProvenance.classList.contains("ajoop-provenance-connected"));

  const multi = renderSpec(env, {
    type: "bot", language: "en", text: "Two safe sources.", provenance: "ai", sources: ["calendar", "gmail", "gmail"],
  });
  check("multi-source AI wording is grounded, not connected-capability wording",
    multi.querySelector(".ajoop-provenance").textContent,
    "AI-assisted · grounded in Gmail + Google Calendar evidence");
  ok("source wording never claims connection or provider verification",
    !/connected|verified by|live access/i.test(multi.querySelector(".ajoop-provenance").textContent));

  const degraded = renderSpec(env, {
    type: "bot", language: "en", text: "Partial but readable.", provenance: "evidence",
    sources: ["gmail", "calendar"], status: { state: "partial", source: "calendar" },
  });
  check("partial answer keeps truthful multi-source provenance",
    degraded.querySelector(".ajoop-provenance").textContent,
    "Gmail + Google Calendar evidence · Google Calendar partly unavailable");

  const hostile = renderSpec(env, {
    type: "bot", language: "en", text: "Safe answer.", provenance: "evidence",
    sources: [HOSTILE.endpoint], actionPreview: { actionType: "unknown.action", tier: 3, ...HOSTILE },
  });
  check("hostile source renders no false Portfolio provenance",
    hostile.querySelector(".ajoop-provenance"), null);
  check("hostile source adds no connected provenance marker",
    hostile.querySelector(".ajoop-provenance-connected"), null);
  check("rejected preview adds no card", hostile.querySelector(".ajoop-action-preview"), null);
  noHostileText("hostile connected presentation metadata", serialize(hostile));

  const unknown = renderSpec(env, {
    type: "bot", language: "en", text: "Unknown source stays readable.", provenance: "evidence", sources: ["slack"],
  });
  check("unknown-only source renders no provenance claim", unknown.querySelector(".ajoop-provenance"), null);

  const mixed = renderSpec(env, {
    type: "bot", language: "en", text: "Mixed sources.", provenance: "evidence",
    sources: [HOSTILE.endpoint, "calendar", "gmail", "slack"],
  });
  check("mixed valid and hostile sources render accepted sources only",
    mixed.querySelector(".ajoop-provenance").textContent, "Gmail + Google Calendar evidence");

  let accessorReads = 0;
  const accessorSpec = { type: "bot", language: "en", text: "Accessor-safe.", provenance: "evidence" };
  Object.defineProperty(accessorSpec, "sources", { enumerable: true, get() { accessorReads += 1; return ["gmail"]; } });
  Object.defineProperty(accessorSpec, "actionPreview", { enumerable: true, get() { accessorReads += 1; return { actionType: "email.send", tier: 3 }; } });
  const accessorMessage = renderSpec(env, accessorSpec);
  check("presentation metadata accessors are never invoked", accessorReads, 0);
  check("accessor source renders no false Portfolio provenance",
    accessorMessage.querySelector(".ajoop-provenance"), null);
  check("accessor action preview is dropped", accessorMessage.querySelector(".ajoop-action-preview"), null);

  let singularAccessorReads = 0;
  const singularAccessorSpec = { type: "bot", language: "en", text: "Singular accessor-safe.", provenance: "evidence" };
  Object.defineProperty(singularAccessorSpec, "source", {
    enumerable: true,
    get() { singularAccessorReads += 1; return "gmail"; },
  });
  const singularAccessorMessage = renderSpec(env, singularAccessorSpec);
  check("singular source accessor is never invoked", singularAccessorReads, 0);
  check("singular source accessor renders no false Portfolio provenance",
    singularAccessorMessage.querySelector(".ajoop-provenance"), null);

  for (const [label, value] of [["undefined", undefined], ["invalid", 42]]) {
    const invalid = renderSpec(env, {
      type: "bot", language: "en", text: "Invalid data property.", provenance: "evidence", source: value,
    });
    check(`present ${label} source data property renders no provenance claim`,
      invalid.querySelector(".ajoop-provenance"), null);
  }

  const nonEnumerable = { type: "bot", language: "en", text: "Non-enumerable.", provenance: "evidence" };
  Object.defineProperty(nonEnumerable, "sources", { enumerable: false, value: ["gmail"] });
  check("non-enumerable source metadata renders no provenance claim",
    renderSpec(env, nonEnumerable).querySelector(".ajoop-provenance"), null);

  const precedence = renderSpec(env, {
    type: "bot", language: "en", text: "Sources precedence.", provenance: "evidence",
    source: "gmail", sources: undefined,
  });
  check("present rejected sources field takes precedence over singular source",
    precedence.querySelector(".ajoop-provenance"), null);
}

{
  const env = loadAssistant();
  const { api } = env;
  check("browser presentation action types match the authoritative A4 registry",
    Object.keys(api.AJOOP_PRESENTATION_ACTIONS).sort().join(","), [...listAjoopActionTypes()].sort().join(","));
  for (const actionType of listAjoopActionTypes()) {
    check(`browser presentation tier matches A4 policy: ${actionType}`,
      api.AJOOP_PRESENTATION_ACTIONS[actionType].tier, getAjoopActionPolicy(actionType).tier);
    check(`browser presentation connector matches A4 policy: ${actionType}`,
      api.AJOOP_PRESENTATION_ACTIONS[actionType].source, getAjoopActionPolicy(actionType).connector);
  }
  check("unknown action type is rejected", api.normalizeAjoopActionPreview({ actionType: "gmail.raw_request", tier: 1 }), null);
  check("unknown tier is rejected", api.normalizeAjoopActionPreview({ actionType: "email.prepare_draft", tier: 9 }), null);
  check("caller cannot downgrade a Tier 3 action", api.normalizeAjoopActionPreview({ actionType: "email.send", tier: 1 }), null);

  for (const [actionType, tier] of [
    ["gmail.search_messages", 0],
    ["email.prepare_draft", 1],
    ["gmail.create_draft", 2],
    ["email.send", 3],
  ]) {
    const normalized = api.normalizeAjoopActionPreview({ actionType, tier, executionAvailable: true, ...HOSTILE });
    check(`action tier is re-derived: ${actionType}`, normalized.tier, tier);
    check(`action execution is always unavailable: ${actionType}`, normalized.executionAvailable, false);
    check(`action preview is always informational: ${actionType}`, normalized.previewOnly, true);
    check(`confirmation is derived from tier: ${actionType}`, normalized.requiresConfirmation, tier >= 2);
    ok(`normalized action is frozen: ${actionType}`, Object.isFrozen(normalized));
  }

  const preview = renderSpec(env, {
    type: "bot", language: "en", text: "A local draft can be described.",
    actionPreview: { actionType: "email.prepare_draft", tier: 1, preview: HOSTILE, target: HOSTILE },
  });
  const card = preview.querySelector(".ajoop-action-preview");
  ok("a valid action preview renders semantic static content", card && card.tagName === "SECTION");
  check("action preview has an accessible name", card.getAttribute("aria-label"), "Action preview");
  ok("action preview states the proposed action", card.textContent.includes("Prepare email draft"));
  ok("action preview states the safe target category", card.textContent.includes("Gmail"));
  ok("action preview states the deterministic permission tier", card.textContent.includes("Tier 1 · Preview only"));
  ok("action preview states confirmation status", card.textContent.includes("Not required for this read or local preview"));
  ok("action preview states execution is unavailable", card.textContent.includes("Execution is unavailable in this surface."));
  check("action preview contains no controls", card.querySelectorAll("button").length, 0);
  check("action preview contains no links", card.querySelectorAll("a").length, 0);
  noHostileText("valid preview with hostile extra fields", serialize(card));

  for (const [actionType, tier, phrase] of [
    ["gmail.create_draft", 2, "Would require confirmation before changing external state"],
    ["email.send", 3, "Consequential action — strong confirmation required"],
  ]) {
    const rendered = api.renderAjoopActionPreview({ actionType, tier }, "en");
    ok(`Tier ${tier} states its risk in words`, rendered.textContent.includes(phrase));
    ok(`Tier ${tier} never presents execution`, rendered.textContent.includes("Execution is unavailable in this surface."));
    check(`Tier ${tier} exposes no execution control`, rendered.querySelectorAll("button").length, 0);
  }

  const plain = renderSpec(env, { type: "bot", language: "en", text: "No metadata." });
  const rejected = renderSpec(env, {
    type: "bot", language: "en", text: "No metadata.", actionPreview: { actionType: "unknown", tier: 0 },
  });
  check("normal answer DOM is unchanged when action metadata is absent or rejected", serialize(rejected), serialize(plain));
}

/* ---------- A5.1.3 STATIC CONTRACT CHECKS ---------- */

{
  const source = read("js/ajoop/assistant.js");
  const block = source.slice(
    source.indexOf("/* ajoop-connected-presentation:start"),
    source.indexOf("/* ajoop-connected-presentation:end */"),
  );
  ok("connected presentation block exists", block.length > 100);
  for (const forbidden of [
    "gmail-provider", "calendar-provider", "github-provider", "drive-provider",
    "ajoop-owner-connected-workflows", "ajoop-owner-context", "ajoop-owner-tool-policy",
    "oauth", "token.txt", ".ajoop-runtime", "googleapis", "XMLHttpRequest",
    "sendBeacon", "localStorage", "credential", "secret",
  ]) {
    ok(`browser presentation imports/exposes no ${forbidden}`, !block.toLowerCase().includes(forbidden.toLowerCase()));
  }
  ok("browser presentation makes no network request", !/\bfetch\s*\(/.test(block));
  ok("browser presentation creates no action controls", !/createElement\(["'](?:button|a)["']\)/.test(block));
  ok("public turn response path remains unconnected to owner action metadata",
    !/actionPreview:\s*(?:model|context|plan)/.test(source));
  ok("source array normalization is bounded", /slice\(0, AJOOP_PRESENTATION_SOURCE_LIMIT\)/.test(block));
  ok("source identity is visible text, not icon-only", /AJOOP_PRESENTATION_SOURCES\[preview\.source\]/.test(block));
}

/* ---------- 4. degraded and partial answers ---------- */

{
  const env = loadAssistant();
  const degraded = renderSpec(env, {
    ...FIXTURES[1][1],
    status: { ...HOSTILE, state: "completed", safeCode: "assist-unavailable" },
  });
  check("a degraded answer keeps its prose", degraded.querySelector(".chatbot-message-text").textContent, "SINAMA is the flagship.");
  check("a degraded answer keeps its evidence", degraded.querySelectorAll(".ajoop-card").length, 1);
  check("a degraded answer says so beside its provenance", degraded.querySelector(".ajoop-provenance").textContent,
    "Portfolio evidence · AI assistance unavailable");
  check("the degraded state is a bounded code", degraded.getAttribute("data-ajoop-turn-status"), "assist-unavailable");
  check("the provenance kind is unchanged", degraded.querySelector(".ajoop-provenance").getAttribute("data-ajoop-provenance"), "evidence");
  noHostileText("a degraded answer given hostile status fields", serialize(degraded));

  const turkish = renderSpec(env, { ...FIXTURES[7][1], status: { state: "completed", safeCode: "assist-unavailable" } });
  check("a degraded Turkish answer", turkish.querySelector(".ajoop-provenance").textContent, "Portfolyo kanıtı · AI desteği kullanılamadı");

  const partial = renderSpec(env, { ...FIXTURES[1][1], status: { state: "partial", source: "github" } });
  check("a partial answer names the partial source", partial.querySelector(".ajoop-provenance").textContent,
    "Portfolio evidence · GitHub partly unavailable");
  check("a partial answer is coded", partial.getAttribute("data-ajoop-turn-status"), "source-partial");

  const social = renderSpec(env, { ...FIXTURES[6][1], status: { state: "completed", safeCode: "assist-unavailable" } });
  check("a turn with no evidence claim grows no provenance line", social.querySelector(".ajoop-provenance"), null);
}

/* ---------- 5. the pending turn ---------- */

{
  const env = loadAssistant();
  activityLog.length = 0;
  const node = env.api.openAjoopTurn("en");
  check("the pending turn joins the transcript", node.parentNode, env.panel.list);
  ok("the pending turn is marked pending", node.classList.contains("is-pending"));
  const activity = node.querySelector("[data-ajoop-turn-activity]");
  check("the pending turn shows its state in visible words", activity.textContent, "Looking into it…");
  ok("the activity text is not screen-reader-only", !activity.classList.contains("visually-hidden"));
  check("no visually hidden copy remains in the pending turn", node.querySelectorAll(".visually-hidden").length, 0);
  check("the dots are decorative", node.querySelector(".ajoop-typing").getAttribute("aria-hidden"), "true");
  check("the dots carry no text", node.querySelector(".ajoop-typing").textContent, "");
  check("the activity comes after the dots in reading order",
    node.querySelector("[data-chatbot-prose]").children.map((child) => child.className).join(" | "),
    "ajoop-typing | ajoop-turn-activity");
  check("the pending turn exposes its state", node.getAttribute("data-ajoop-turn-state"), "checking");

  ok("the activity path moves a pending turn on", env.api.renderAjoopTurnActivity(node, { state: "preparing" }, "en"));
  check("preparing is visible", activity.textContent, "Preparing the answer…");
  check("preparing is exposed", node.getAttribute("data-ajoop-turn-state"), "preparing");
  const writes = activityLog.length;
  env.api.renderAjoopTurnActivity(node, { state: "preparing" }, "en");
  check("an unchanged state is not rewritten (and so not re-announced)", activityLog.length, writes);
  ok("a settled state is refused by the activity path", !env.api.renderAjoopTurnActivity(node, { state: "completed" }, "en"));
  ok("an unknown state is refused by the activity path", !env.api.renderAjoopTurnActivity(node, { state: "exploding" }, "en"));
  check("a refused state leaves the activity alone", activity.textContent, "Preparing the answer…");
  ok("a hostile status still reaches only known copy",
    env.api.renderAjoopTurnActivity(node, { ...HOSTILE, state: "reading", source: HOSTILE.error }, "en"));
  check("hostile status renders the public reading copy", activity.textContent, "Reading portfolio evidence…");
  noHostileText("the pending turn given hostile status fields", serialize(node));
  env.api.renderAjoopTurnActivity(node, { state: "reading", source: "gmail" }, "tr");
  check("a future owner source can be named while reading", activity.textContent, "Gmail okunuyor…");

  const second = env.api.openAjoopTurn("tr");
  ok("a superseded pending turn is removed", !node.isConnected);
  check("a Turkish pending turn", second.querySelector("[data-ajoop-turn-activity]").textContent, "Bakıyorum…");
  check("only one pending turn exists", env.panel.list.querySelectorAll(".is-pending").length, 1);
}

/* ---------- 6. settling a turn ---------- */

const GROUNDED_PLAN = { type: "answer", text: "Grounded answer.", links: [], cards: [CARD], provenance: "evidence", depth: "normal" };

{
  const env = loadAssistant();
  const node = env.api.openAjoopTurn("en");
  env.api.setAjoopTurnBusy(true);
  env.api.finishAjoopTurn({
    node,
    route: null,
    plan: null,
    model: { ...HOSTILE, ok: false, reason: "network-error", status: 502 },
    language: "en",
    question: "Why SINAMA?",
  });
  const html = serialize(env.panel.widget);
  ok("a failed turn is no longer pending", !node.classList.contains("is-pending"));
  ok("a failed turn stays in the transcript", node.isConnected);
  check("a failed turn ends in words", node.querySelector(".chatbot-message-text").textContent,
    "I could not prepare an answer this time. Please try again.");
  check("a failed turn is coded, not described", node.getAttribute("data-ajoop-turn-status"), "turn-failed");
  check("a failed turn makes no evidence claim", node.querySelector(".ajoop-provenance"), null);
  check("a failed turn drops its pending markers", node.getAttribute("data-ajoop-turn") ?? node.getAttribute("data-ajoop-turn-state"), null);
  check("a failed turn releases the actions", env.panel.quicks.getAttribute("aria-busy"), "false");
  ok("a failed turn re-enables every action", env.panel.quicks.querySelectorAll("button").every((button) => !button.disabled));
  check("a failed turn is not remembered as an exchange", env.remembered.length, 0);
  noHostileText("the whole-request failure", html);
}

{
  const env = loadAssistant();
  const node = env.api.openAjoopTurn("en");
  env.api.finishAjoopTurn({ node, route: {}, plan: GROUNDED_PLAN, model: { ...HOSTILE, ok: false, reason: "timeout" }, language: "en", question: "q" });
  check("failed assistance keeps the grounded answer", node.querySelector(".chatbot-message-text").textContent, "Grounded answer.");
  check("failed assistance is stated on the answer", node.querySelector(".ajoop-provenance").textContent,
    "Portfolio evidence · AI assistance unavailable");
  check("failed assistance keeps the evidence", node.querySelectorAll(".ajoop-card").length, 1);
  check("the grounded answer is still remembered", env.remembered.at(-1)?.answer, "Grounded answer.");
  noHostileText("failed optional assistance", serialize(node));
}

{
  const env = loadAssistant();
  const node = env.api.openAjoopTurn("en");
  env.api.finishAjoopTurn({ node, route: {}, plan: GROUNDED_PLAN, model: { ok: false, reason: "unavailable" }, language: "en", question: "q" });
  check("a known-down bridge does not repeat itself on every answer", node.querySelector(".ajoop-provenance").textContent, "Portfolio evidence");
  check("a known-down bridge adds no status to the answer", node.getAttribute("data-ajoop-turn-status"), null);
}

{
  const env = loadAssistant();
  const node = env.api.openAjoopTurn("en");
  env.api.finishAjoopTurn({
    node,
    route: {},
    plan: GROUNDED_PLAN,
    model: { ok: true, answer: "AI grounded answer.", scope: "portfolio", evidence: null },
    language: "en",
    question: "q",
  });
  check("an AI-assisted turn shows the AI answer", node.querySelector(".chatbot-message-text").textContent, "AI grounded answer.");
  check("an AI-assisted turn keeps AI provenance", node.querySelector(".ajoop-provenance").textContent,
    "AI-assisted · grounded in portfolio evidence");
  check("an AI-assisted turn carries no status", node.getAttribute("data-ajoop-turn-status"), null);
}

/* ---------- 7. the turn lifecycle end to end ---------- */

const turnGlobals = () => {
  let turn = 0;
  return { beginAjoopAiTurn: () => (turn += 1), isAjoopAiTurnCurrent: (id) => id === turn };
};
const ROUTE = { intent: "project_overview", family: "project" };

{
  const env = loadAssistant({
    ...turnGlobals(),
    planAjoopResponse: () => {
      throw new Error(HOSTILE.stack);
    },
  });
  activityLog.length = 0;
  env.api.answerAjoopRoute(ROUTE, { message: "SINAMA?" });
  const node = env.panel.list.children.at(-1);
  check("a turn opens in its checking state", node.querySelector("[data-ajoop-turn-activity]").textContent, "Looking into it…");
  await settle();
  env.flushTimers();
  await settle();
  ok("a planner exception does not leave the turn pending", !node.classList.contains("is-pending"));
  check("a planner exception ends in the failure copy", node.querySelector(".chatbot-message-text").textContent,
    "I could not prepare an answer this time. Please try again.");
  check("a planner exception releases the actions", env.panel.quicks.getAttribute("aria-busy"), "false");
  noHostileText("a planner exception", serialize(env.panel.widget));
  ok("a turn with no assistance never claims to be preparing", !activityLog.includes("Preparing the answer…"));
}

{
  let release;
  const env = loadAssistant({
    ...turnGlobals(),
    isAjoopAiConfigured: () => true,
    requestAjoopRagTurn: () => new Promise((resolve) => {
      release = resolve;
    }),
    planAjoopResponse: () => ({ ...GROUNDED_PLAN, cards: [] }),
  });
  env.api.answerAjoopRoute(ROUTE, { message: "SINAMA?" });
  const node = env.panel.list.children.at(-1);
  const activity = node.querySelector("[data-ajoop-turn-activity]");
  await settle();
  check("before the beat the turn is still checking", activity.textContent, "Looking into it…");
  env.flushTimers();
  await settle();
  check("outstanding assistance after the beat is preparing", activity.textContent, "Preparing the answer…");
  ok("a preparing turn is still pending", node.classList.contains("is-pending"));
  release({ ok: true, answer: "AI grounded answer.", scope: "portfolio", turnState: "ai" });
  await settle();
  check("the prepared answer commits into the same container", node.querySelector(".chatbot-message-text").textContent, "AI grounded answer.");
  check("the prepared answer keeps AI provenance", node.querySelector(".ajoop-provenance").textContent,
    "AI-assisted · grounded in portfolio evidence");
  check("the committed turn drops its activity state", node.getAttribute("data-ajoop-turn-state"), null);
}

{
  const env = loadAssistant({
    ...turnGlobals(),
    isAjoopAiConfigured: () => false,
    requestAjoopRagTurn: () => {
      throw new Error("an unconfigured bridge must not be asked");
    },
    planAjoopResponse: () => ({ ...GROUNDED_PLAN, cards: [] }),
  });
  activityLog.length = 0;
  env.api.answerAjoopRoute(ROUTE, { message: "SINAMA?" });
  const node = env.panel.list.children.at(-1);
  await settle();
  env.flushTimers();
  await settle();
  check("a deterministic-only turn commits its grounded answer", node.querySelector(".chatbot-message-text").textContent, "Grounded answer.");
  check("a deterministic-only turn keeps portfolio provenance", node.querySelector(".ajoop-provenance").textContent, "Portfolio evidence");
  ok("a deterministic-only turn never claims to be preparing", !activityLog.includes("Preparing the answer…"));
}

{
  const env = loadAssistant({
    ...turnGlobals(),
    isAjoopAiConfigured: () => true,
    requestAjoopRagTurn: () => Promise.resolve({ ok: false, reason: "timeout", turnState: "failed", ...HOSTILE }),
    planAjoopResponse: () => ({ ...GROUNDED_PLAN, cards: [] }),
  });
  env.api.answerAjoopRoute(ROUTE, { message: "SINAMA?" });
  const node = env.panel.list.children.at(-1);
  await settle();
  env.flushTimers();
  await settle();
  check("a timed-out assistance turn shows the grounded answer", node.querySelector(".chatbot-message-text").textContent, "Grounded answer.");
  check("a timed-out assistance turn is marked on the answer", node.querySelector(".ajoop-provenance").textContent,
    "Portfolio evidence · AI assistance unavailable");
  noHostileText("a timed-out assistance turn", serialize(node));
}

{
  /* A card missing its arrays throws inside the commit itself. */
  const env = loadAssistant({
    ...turnGlobals(),
    planAjoopResponse: () => ({ ...GROUNDED_PLAN, cards: [{ title: "Broken card" }] }),
  });
  env.api.answerAjoopRoute(ROUTE, { message: "SINAMA?" });
  const node = env.panel.list.children.at(-1);
  await settle();
  env.flushTimers();
  await settle();
  ok("a commit that throws does not leave the turn pending", !node.classList.contains("is-pending"));
  check("a commit that throws ends in the failure copy", node.querySelector(".chatbot-message-text").textContent,
    "I could not prepare an answer this time. Please try again.");
  check("a commit that throws leaves no half-rendered card", node.querySelectorAll(".ajoop-card").length, 0);
  check("a commit that throws releases the actions", env.panel.quicks.getAttribute("aria-busy"), "false");
  ok("a commit that throws shows no exception text", !/TypeError|undefined|length/.test(node.textContent));
}

/* ---------- 8. service status ---------- */

{
  let bridgeState = "unknown";
  const env = loadAssistant({ getAjoopAiState: () => ({ state: bridgeState }) });
  const line = env.panel.service;
  const text = line.querySelector("[data-chatbot-bridge-text]");
  const render = (state, language = "en") => {
    bridgeState = state;
    env.api.portfolioChatbotState.language = language;
    env.api.renderAjoopBridgeStatus();
  };

  render("unknown");
  ok("an unknown bridge makes no claim", line.hidden);
  check("an unknown bridge writes no text", text.textContent, "");
  render("disabled");
  ok("a disabled bridge makes no claim", line.hidden);
  render("checking");
  ok("a check in progress is shown", !line.hidden);
  check("a check in progress is stated as checking", text.textContent, "Checking AI assistance…");
  check("a check in progress is exposed as checking", line.getAttribute("data-ajoop-service"), "checking");
  render("available");
  check("available is stated in words", text.textContent, "AI assistance available");
  check("available is exposed", line.getAttribute("data-ajoop-service"), "available");
  render("unavailable");
  check("unavailable states that grounded answers still work", text.textContent, "AI assistance unavailable; grounded answers still work.");
  check("unavailable is exposed", line.getAttribute("data-ajoop-service"), "unavailable");
  render("unavailable", "tr");
  check("unavailable follows the site locale", text.textContent, "AI desteği kullanılamıyor; kanıta dayalı yanıtlar çalışıyor.");
  render("unknown");
  ok("a verdict can be withdrawn again", line.hidden && !line.hasAttribute("data-ajoop-service") && text.textContent === "");
  check("the service line is a status region", line.getAttribute("role"), "status");
  check("the assistant keeps one identity (EN)", env.api.ajoopHeaderSubtitle("en"), "Portfolio Copilot");
  check("the assistant keeps one identity (TR)", env.api.ajoopHeaderSubtitle("tr"), "Portfolyo Asistanı");
}

{
  let bridgeState = "unknown";
  let finishProbe;
  const env = loadAssistant({
    getAjoopAiState: () => ({ state: bridgeState }),
    getAjoopAiConfig: () => ({}),
    isAjoopAiConfigured: () => true,
    checkAjoopAiHealth: () => {
      bridgeState = "checking";
      return new Promise((resolve) => {
        finishProbe = () => {
          bridgeState = "unavailable";
          resolve(bridgeState);
        };
      });
    },
  });
  const text = env.panel.service.querySelector("[data-chatbot-bridge-text]");
  env.api.initializeAjoopAi();
  check("opening the panel states a real check as checking", text.textContent, "Checking AI assistance…");
  finishProbe();
  await settle();
  check("the probe's verdict replaces checking", text.textContent, "AI assistance unavailable; grounded answers still work.");
}

{
  /* The real bridge: `checking` is set synchronously when a probe starts, which
   * is what initializeAjoopAi relies on, and a bridge nobody has asked is
   * `unknown`, which the header does not present. */
  const source = read("js/ajoop/ai-bridge.js");
  const block = source.slice(source.indexOf("/* ajoop-ai-bridge:start"), source.indexOf("/* ajoop-ai-bridge:end */"));
  const config = { enabled: true, endpoint: "https://ai.example/ajoop", timeoutMs: 5, retryAfterMs: 60000 };
  const bridge = new Function("window", `${block}\nreturn { checkAjoopAiHealth, getAjoopAiState, resetAjoopAiState };`)({ KAAN_AJOOP_AI: config });
  const { api } = loadAssistant();
  bridge.resetAjoopAiState();
  check("a configured bridge nobody has asked makes no header claim", api.ajoopServiceState(bridge.getAjoopAiState().state), null);
  bridge.checkAjoopAiHealth({ config, force: true, fetchImpl: () => new Promise(() => {}) });
  check("the real bridge is checking as soon as a probe starts", bridge.getAjoopAiState().state, "checking");
  check("which the header presents as checking", api.ajoopServiceState(bridge.getAjoopAiState().state), "checking");
}

/* ---------- 9. accessibility, mobile and CSS architecture ---------- */

const assistantSource = read("js/ajoop/assistant.js");
const css = read("style.css");

{
  const template = assistantSource.slice(assistantSource.indexOf("function setupPortfolioChatbot("));
  ok("the transcript is a polite live region", /data-chatbot-messages aria-live="polite"/.test(template));
  ok("the service line is a status region inside the identity block",
    /<div class="chatbot-identity">(?:(?!<\/div>)[\s\S])*data-chatbot-bridge role="status" hidden>/.test(template));
  ok("the service dot is decorative", /class="chatbot-service-dot" aria-hidden="true"/.test(template));
  ok("the retired header dot is gone", !template.includes("chatbot-bridge-dot") && !css.includes(".chatbot-bridge-dot"));
  ok("the panel is still a labelled modal dialog", /role="dialog" aria-modal="true" aria-labelledby="ajoop-dialog-title"/.test(template));
  ok("focus is still trapped while the panel is open", /trapFocus\(event, panel\)/.test(template));
  ok("no mode label returns to the header", !/ajoopLabel\(\s*"[^"]*(AI Mode|Evidence Mode|AI Enhanced)/i.test(assistantSource));

  const openTurn = assistantSource.slice(assistantSource.indexOf("function openAjoopTurn("), assistantSource.indexOf("function renderAjoopTurnActivity("));
  ok("the pending turn no longer hides its words from sighted visitors", !openTurn.includes("visually-hidden"));
  const activityCalls = assistantSource.match(/ajoopTurnActivityLabel\(/g) || [];
  check("activity copy is written by one renderer only", activityCalls.length, 2);
  ok("failure copy never reads an error object", !/error\.(message|stack|name)|String\(error\)|\$\{error/.test(assistantSource));

  /* Header tracks must equal the header's visible cells, or empty tracks still
   * add gutters: mascot, identity, state label, close — and no state label on
   * phones, where it is display:none. */
  const tracks = (value) => value.trim().split(/\s+(?![^()]*\))/).length;
  const base = css.match(/\.chatbot-header \{\s*display: grid;\s*\/\*[\s\S]*?\*\/\s*grid-template-columns: ([^;]+);/);
  const phones = [...css.matchAll(/\n  \.chatbot-header \{\s*grid-template-columns: ([^;]+);/g)].map((match) => tracks(match[1]));
  check("desktop header tracks match its four cells", base && tracks(base[1]), 4);
  check("<=560px and <=380px header tracks match their three cells", phones.join(","), "3,3");

  ok("[hidden] still hides the service line", /\.chatbot-header \.chatbot-service\[hidden\] \{\s*display: none;/.test(css));
  ok("the service line wraps instead of widening the header", /\.chatbot-header \.chatbot-service \{[^}]*overflow-wrap: anywhere;/.test(css));
  ok("the activity text wraps", /\.ajoop-turn-activity \{[^}]*overflow-wrap: anywhere;/.test(css));
  ok("the activity text may shrink", /\.ajoop-turn-activity \{[^}]*min-width: 0;/.test(css));
  ok("the pending line wraps on narrow phones", /\.chatbot-message\.is-pending \.chatbot-message-text \{[^}]*flex-wrap: wrap;/.test(css));
  ok("the pending bubble keeps its one-line minimum height", /\.chatbot-message\.is-pending \{\s*min-height: 43px;/.test(css));
  ok("the dots stand still under reduced motion", /@media \(prefers-reduced-motion: reduce\) \{\s*\.ajoop-typing i \{\s*animation: none;/.test(css));
  ok("the new status UI sets no fixed width", !/\.(?:chatbot-service|ajoop-turn-activity)[^{]*\{[^}]*(?:^|[^-])width:\s*\d{2,}px/.test(css));
  ok("a provenance line that states a degraded result is not faded",
    /\.chatbot-message\.bot\[data-ajoop-turn-status\] \.ajoop-provenance \{\s*opacity: 1;/.test(css));

  /* Light-theme provenance must clear WCAG AA (4.5:1) for its 10.5px text.
   * Computed from the shipped tokens and rules against --bg-2, which is darker
   * than every light surface the bubble composites over, so a pass here also
   * holds on the real, lighter background. */
  const lightTokens = (css.match(/html\[data-theme="light"\] \{([^}]*)\}/) || [])[1] || "";
  const token = (name) => (lightTokens.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i")) || [])[1];
  const hex = (value) => [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
  const channel = (value) => {
    const unit = value / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };
  const over = (foreground, alpha, background) =>
    foreground.map((value, index) => value * alpha + background[index] * (1 - alpha));
  const ruleBody = (selector) =>
    (css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`)) || [])[1] || "";
  const opacityOf = (body) => Number((body.match(/opacity:\s*([\d.]+)/) || [])[1]);
  const colorOf = (body) => (body.match(/color:\s*(#[0-9a-f]{6})/i) || [])[1];

  const ground = hex(token("--bg-2") || "#000000");
  const muted = hex(token("--muted") || "#ffffff");
  const lightFade = opacityOf(ruleBody('html[data-theme="light"] .chatbot-message .ajoop-provenance'));
  const lightAi = ruleBody('html[data-theme="light"] .chatbot-message .ajoop-provenance[data-ajoop-provenance="ai"]');
  const degraded = ruleBody(".chatbot-message.bot[data-ajoop-turn-status] .ajoop-provenance");
  ok("light theme declares its own provenance fade", Number.isFinite(lightFade));
  ok("light theme gives AI provenance its own darker shade", Boolean(colorOf(lightAi)));
  const ratios = [
    ["portfolio-grounded", contrast(over(muted, lightFade, ground), ground)],
    ["AI-assisted", contrast(over(hex(colorOf(lightAi) || "#ffffff"), opacityOf(lightAi) || lightFade, ground), ground)],
    ["degraded", contrast(over(muted, opacityOf(degraded), ground), ground)],
  ];
  for (const [kind, ratio] of ratios) {
    ok(`light-theme ${kind} provenance meets WCAG AA 4.5:1 (computed ${ratio.toFixed(2)}:1)`, ratio >= 4.5);
  }
  ok("dark-theme provenance rules are unchanged",
    /\.ajoop-provenance \{[^}]*color: var\(--muted\);[^}]*opacity: 0\.75;/.test(css) &&
      /\n\.chatbot-message \.ajoop-provenance\[data-ajoop-provenance="ai"\] \{\s*color: var\(--brand\);\s*opacity: 0\.9;/.test(css));
  ok("status text uses theme tokens, not fixed colours",
    /\.ajoop-turn-activity \{[^}]*color: var\(--muted\);/.test(css) && !/\.chatbot-service[^{]*\{[^}]*color:\s*#/.test(css));
  ok("the phone sheet keeps its safe-area height", css.includes("max-height: calc(100dvh - 96px - env(safe-area-inset-bottom));"));
  ok("the widget keeps its safe-area offsets", css.includes("bottom: max(18px, calc(env(safe-area-inset-bottom) + 14px));"));
  ok("the transcript still refuses horizontal growth", /\.chatbot-message \{\s*max-width: 92%;[\s\S]*?min-width: 0;/.test(css));
}

/* ---------- 10. localization ---------- */

const NEW_COPY = [
  "Looking into it…",
  "Checking {source}…",
  "Reading {source}…",
  "Reading portfolio evidence…",
  "Preparing the answer…",
  "I could not prepare an answer this time. Please try again.",
  "AI assistance unavailable",
  "{source} partly unavailable",
  "Some sources unavailable",
  "AI assistance available",
  "Checking AI assistance…",
  "AI assistance unavailable; grounded answers still work.",
  "AI unavailable",
];

{
  const labelled = new Set(
    [...assistantSource.matchAll(/ajoopLabel\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"(?:[^"\\]|\\.)*"/g)].map((match) => match[1]),
  );
  for (const english of NEW_COPY) ok(`new copy goes through the i18n alias: ${english}`, labelled.has(english));
  ok("ajoopLabel stays the one-line getI18nText alias the catalog detects",
    /^const ajoopLabel = \(english, turkish, language\) => typeof getI18nText === "function" \? getI18nText\(/m.test(assistantSource));
  for (const retired of ["Thinking this through…", "Local AI bridge connected", "Local AI offline"]) {
    ok(`retired copy is gone from the assistant: ${retired}`, !assistantSource.includes(`"${retired}"`));
  }

  for (const locale of ["tr", "de", "es", "fr"]) {
    const pages = JSON.parse(read(`data/i18n/packs/${locale}/pages.json`));
    const phrases = Object.assign({}, ...Object.values(pages));
    const runtime = read(`i18n/pack-${locale}-core.js`);
    for (const english of NEW_COPY) {
      const value = phrases[english];
      ok(`${locale} translates: ${english}`, typeof value === "string" && value.trim() !== "" && value !== english);
      ok(`${locale} runtime pack ships: ${english}`, runtime.includes(JSON.stringify(english)));
      if (english.includes("{source}")) ok(`${locale} keeps the {source} slot: ${english}`, String(value).includes("{source}"));
    }
  }
}

/* ---------- 11. no owner connector reaches a public browser module ---------- */

{
  const walk = (dir) =>
    readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
      const next = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return walk(next);
      return entry.name.endsWith(".js") ? [next] : [];
    });
  const browserFiles = [...walk("js"), "script.js", "ajoop-ai-config.js", "portfolio-v2.js", "portfolio-data.js"];
  const FORBIDDEN = [
    ["an ES import", /^\s*import\s[\s\S]*?from\s*["']/m],
    ["a dynamic import", /\bimport\s*\(/],
    ["require()", /\brequire\s*\(/],
    ["googleapis", /googleapis/i],
    ["an owner module", /ajoop-owner|owner-connected|provider-client|read-adapter|read-connectors/i],
    ["local runtime state", /\.ajoop-runtime/],
    ["the GitHub API", /api\.github\.com/i],
    ["an OAuth token field", /access_token|refresh_token|client_secret/i],
  ];
  for (const file of browserFiles) {
    const source = read(file);
    const hits = FORBIDDEN.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
    check(`${file} references no owner connector${hits.length ? ` (${hits.join(", ")})` : ""}`, hits.length, 0);
  }
  const loader = read("script.js");
  ok("the runtime manifest ships nothing from server/", !/["']\.?\/?server\//.test(loader));
  ok("the public AI endpoint is not an owner endpoint", !/owner/i.test(read("ajoop-ai-config.js")));
}

/* ---------- 12. A5.1.2 mobile and keyboard ---------- */

/** The dialog's own element and three controls, with every focus call recorded. */
function mountDialog(env) {
  const panel = env.document.createElement("div");
  panel.setAttribute("data-chatbot-panel", "");
  panel.setAttribute("tabindex", "-1");
  const close = env.document.createElement("button");
  const input = env.document.createElement("input");
  input.setAttribute("data-chatbot-input", "");
  const send = env.document.createElement("button");
  for (const control of [close, input, send]) panel.appendChild(control);
  env.document.body.appendChild(panel);
  const focused = [];
  for (const element of [panel, close, input, send]) {
    element.focus = () => {
      focused.push(element);
      env.document.activeElement = element;
    };
  }
  return { panel, close, input, send, focused };
}

{
  /* Where focus lands when the panel opens: the composer with a mouse or a
   * keyboard, the dialog itself on a touch-first device, so opening Ajoop on a
   * phone does not raise the soft keyboard before anything has been read. */
  const env = loadAssistant();
  const dialog = mountDialog(env);
  const pointer = (touchFirst) => {
    env.sandbox.window.matchMedia = (query) => ({ matches: touchFirst && /pointer:\s*coarse/.test(query) });
  };
  pointer(false);
  env.api.focusAjoopEntry();
  check("with a mouse or keyboard, opening focuses the composer", dialog.focused.at(-1), dialog.input);
  pointer(true);
  env.api.focusAjoopEntry();
  check("on a touch-first device, opening focuses the dialog, not the composer", dialog.focused.at(-1), dialog.panel);
  delete env.sandbox.window.matchMedia;
  env.api.focusAjoopEntry();
  check("without matchMedia the composer is focused, as before", dialog.focused.at(-1), dialog.input);
}

{
  /* Tab from the focused dialog container. The shared trap only wraps at the
   * first and last control, so without this Shift+Tab would leave the dialog. */
  const trapped = [];
  const env = loadAssistant({
    getFocusableElements: (container) => container.children.filter((child) => child.tagName !== "DIV"),
    trapFocus: (event) => trapped.push(event.key),
  });
  const dialog = mountDialog(env);
  const key = (name, shiftKey = false) => ({
    key: name,
    shiftKey,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  });
  env.api.portfolioChatbotState.open = true;

  env.document.activeElement = dialog.panel;
  const tab = key("Tab");
  env.api.handleAjoopPanelKeydown(tab);
  check("Tab from the focused dialog reaches its first control", dialog.focused.at(-1), dialog.close);
  ok("Tab from the focused dialog is handled inside the dialog", tab.prevented);

  env.document.activeElement = dialog.panel;
  const back = key("Tab", true);
  env.api.handleAjoopPanelKeydown(back);
  check("Shift+Tab from the focused dialog wraps to its last control, not the inert page", dialog.focused.at(-1), dialog.send);
  ok("Shift+Tab from the focused dialog is handled inside the dialog", back.prevented);

  env.document.activeElement = dialog.input;
  const between = key("Tab");
  env.api.handleAjoopPanelKeydown(between);
  check("Tab between controls still goes through the shared trap", trapped.at(-1), "Tab");
  ok("Tab between controls is left to the browser", !between.prevented);

  const escape = key("Escape");
  env.api.handleAjoopPanelKeydown(escape);
  ok("Escape is still handled while the panel is open", escape.prevented);

  env.api.portfolioChatbotState.open = false;
  env.document.activeElement = dialog.panel;
  const trappedBefore = trapped.length;
  const closed = key("Tab");
  env.api.handleAjoopPanelKeydown(closed);
  ok("a closed panel leaves Tab alone", !closed.prevented && trapped.length === trappedBefore);
}

{
  /* STATIC CSS contracts. These pin the rules; they do not prove geometry. The
   * geometry was measured in headless Chrome for the A5.1.2 report. */
  const mediaBlock = (query) => {
    const start = css.indexOf(`@media ${query} {`);
    if (start < 0) return "";
    let depth = 0;
    for (let index = css.indexOf("{", start); index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}" && (depth -= 1) === 0) return css.slice(start, index + 1);
    }
    return "";
  };

  const short = mediaBlock("screen and (max-height: 540px)");
  ok("short viewports have their own panel rules", short);
  ok("on a short viewport the panel scrolls instead of clipping its rows", /\.chatbot-panel \{[^}]*overflow-y: auto;/.test(short));
  ok("on a short viewport the transcript keeps a usable minimum height",
    /grid-template-rows: auto minmax\(8\.5rem, 1fr\) auto auto;/.test(short));
  ok("on a short viewport the composer stays pinned to the bottom of the panel",
    /\.chatbot-form \{[^}]*position: sticky;[^}]*bottom: 0;/.test(short));
  ok("the pinned composer is opaque, so the transcript never shows through it",
    /\.chatbot-form \{[^}]*background:[^;]*var\(--surface-solid\);/.test(short));

  const touch = mediaBlock("(hover: none) and (pointer: coarse)");
  ok("touch-first composer text is 16px, so iOS does not zoom on focus", /\.chatbot-form input \{\s*font-size: 16px;/.test(touch));
  ok("touch-first suggestions are at least 40px tall", /\.chatbot-quicks button \{\s*min-height: 40px;/.test(touch));
  ok("touch-first Start over is at least 36px tall",
    /\.chatbot-quicks \.chatbot-actions-secondary button \{\s*min-height: 36px;/.test(touch));
  const smallTouch = mediaBlock("(hover: none) and (pointer: coarse) and (max-width: 380px)");
  ok("the smallest touch composer keeps a 44px send button", /\.chatbot-form button \{\s*width: 44px;\s*height: 44px;/.test(smallTouch));

  ok("the composer uses the page font", /\.chatbot-form input \{[^}]*font: inherit;/.test(css));
  ok("the placeholder is a theme token at full opacity", /\.chatbot-form input::placeholder \{\s*color: var\(--muted\);\s*opacity: 1;/.test(css));
  ok("the panel height follows the dynamic viewport where supported", css.includes("max-height: min(680px, calc(100dvh - 120px));"));
  /* The dialog's own focus state. css/a11y.css gives every [tabindex] element a
   * 6px radius on :focus-visible, and a panel opened from a keyboard on a
   * touch-first device IS :focus-visible, so its corners squared off. STATIC:
   * this pins the cascade that prevents it; the rendered corners and ring were
   * measured in headless Chrome for the report. */
  const cssRules = (source) =>
    [...source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
      selectors: selectors.split(",").map((selector) => selector.trim()),
      body,
    }));
  const specificity = (selector) => {
    const bare = selector.replace(/::[\w-]+/g, "");
    const ids = (bare.match(/#[\w-]+/g) || []).length;
    const classLike = (bare.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) || []).length;
    const types = (bare.replace(/\[[^\]]+\]/g, "").match(/(?:^|[\s>+~])[a-z][\w-]*/gi) || []).length;
    return ids * 10000 + classLike * 100 + types;
  };
  const styleRules = cssRules(css);
  const panelRules = styleRules.filter(({ selectors }) => selectors.some((selector) => /(?:^|\s)\.chatbot-panel$/.test(selector)));
  ok("no chatbot panel rule hard-codes a radius outside its property",
    panelRules.length > 0 && panelRules.every(({ body }) => !/border-radius:\s*\d/.test(body)));
  check("the panel radius is set once per breakpoint: default, <=560px, <=380px",
    [...css.matchAll(/--chatbot-panel-radius:\s*([^;]+);/g)].map((match) => match[1]).join(","), "28px,22px,18px");
  const keyboardFocus = styleRules.find(({ selectors }) => selectors.includes(".portfolio-chatbot .chatbot-panel:focus-visible"));
  ok("the keyboard-focused dialog keeps the panel's own radius",
    Boolean(keyboardFocus) && /border-radius:\s*var\(--chatbot-panel-radius\);/.test(keyboardFocus.body));
  ok("the keyboard-focused dialog keeps the site focus ring",
    Boolean(keyboardFocus) && !/outline:\s*none/.test(keyboardFocus.body));
  ok("css/a11y.css still has the generic [tabindex]:focus-visible rule this guards against",
    cssRules(read("css/a11y.css")).some(({ selectors }) => selectors.includes("[tabindex]:focus-visible")));
  ok("the dialog focus rule outranks [tabindex]:focus-visible, which loads after style.css",
    specificity(".portfolio-chatbot .chatbot-panel:focus-visible") > specificity("[tabindex]:focus-visible"));
  const pointerFocus = styleRules.find(({ selectors }) => selectors.includes(".portfolio-chatbot .chatbot-panel:focus:not(:focus-visible)"));
  ok("a dialog focused by a tap or a click still draws no ring",
    Boolean(pointerFocus) && /outline:\s*none;/.test(pointerFocus.body));
  ok("the dialog container is programmatically focusable", /data-chatbot-panel[^>]*tabindex="-1"/.test(assistantSource));
  ok("opening no longer focuses the composer unconditionally", !/setTimeout\(\(\) => input\?\.focus\(\)/.test(assistantSource));
  ok("Start over no longer focuses the composer unconditionally", !/\[data-chatbot-input\]"\)\?\.focus\(\)/.test(assistantSource));
}

/* ---------- report ---------- */

if (failures.length) {
  console.error(`Ajoop turn feedback: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(`Ajoop turn feedback passed. ${passed} assertions · shipped assistant.js · in-memory DOM · no network.`);
