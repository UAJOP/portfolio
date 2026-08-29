#!/usr/bin/env node
/**
 * Behavioral guards for BRIEF 06 recruiter-funnel analytics.
 * Node built-ins only; validates and never writes.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (actual === expected) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n      expected: ${expected}\n      actual:   ${actual}`);
};
const ok = (label, condition) => check(label, Boolean(condition), true);

const analyticsSource = read("js/core/analytics.js");
const configSource = read("js/core/analytics-config.js");
const coreEndMarker = "/* analytics-core:end */";
const coreEnd = analyticsSource.indexOf(coreEndMarker);
ok("analytics core has an extractable behavior-test boundary", coreEnd > 0);

const core = new Function(
  `${analyticsSource.slice(0, coreEnd + coreEndMarker.length)}
  return {
    ANALYTICS_EVENTS,
    ANALYTICS_EVENT_NAMES,
    ANALYTICS_SOURCES,
    ANALYTICS_PAGE_TYPES,
    analyticsUrlKey,
    buildAnalyticsProjectCatalog,
    analyticsProjectForUrl,
    normalizeAnalyticsEvent,
    isLocalAnalyticsEnvironment,
    hasProductionAnalyticsConfiguration
  };`,
)();

const config = new Function(`${configSource}\nreturn portfolioAnalyticsConfig;`)();
const dataSandbox = { window: {} };
vm.createContext(dataSandbox);
vm.runInContext(read("portfolio-data.js"), dataSandbox);
const registry = dataSandbox.window.KAAN_PORTFOLIO;

/* ---------- event and provider contracts ---------- */

const requiredEvents = [
  "recruiter_mode_open",
  "selected_work_open",
  "project_open",
  "github_open",
  "live_demo_open",
  "cv_open",
  "contact_open",
  "request_start",
  "request_submit",
];
check(
  "event registry is exactly the nine approved funnel events",
  [...core.ANALYTICS_EVENT_NAMES].sort().join(","),
  requiredEvents.slice().sort().join(","),
);
for (const name of core.ANALYTICS_EVENT_NAMES) {
  ok(`${name}: uses snake_case`, /^[a-z]+(?:_[a-z]+)*$/.test(name));
}
ok("no duplicate custom page_view event", !core.ANALYTICS_EVENT_NAMES.has("page_view"));

check("provider is Umami", config.provider, "umami");
check("production website ID is deliberately unconfigured", config.websiteId, "");
check("provider script uses HTTPS", new URL(config.scriptUrl).protocol, "https:");
check("provider is restricted to two production domains", config.domains.length, 2);
ok("provider excludes raw search parameters", config.excludeSearch === true);
ok("provider excludes URL hashes", config.excludeHash === true);
ok("provider respects Do Not Track", config.respectDoNotTrack === true);
ok("config contains no secret or API-key field", !/(secret|apiKey|accessToken|password)\s*:/i.test(configSource));

const validConfig = {
  ...config,
  websiteId: "00000000-0000-4000-8000-000000000000",
};
ok(
  "missing website ID keeps production disabled",
  !core.hasProductionAnalyticsConfiguration(config, {
    protocol: "https:",
    hostname: "kaanbalci.com",
  }),
);
ok(
  "valid public website ID enables the production domain",
  core.hasProductionAnalyticsConfiguration(validConfig, {
    protocol: "https:",
    hostname: "kaanbalci.com",
  }),
);
for (const location of [
  { protocol: "http:", hostname: "localhost" },
  { protocol: "http:", hostname: "127.0.0.1" },
  { protocol: "file:", hostname: "" },
]) {
  ok(
    `${location.protocol}//${location.hostname || "file"}: never enables production transport`,
    !core.hasProductionAnalyticsConfiguration(validConfig, location),
  );
}
ok(
  "unapproved preview domain never enables production transport",
  !core.hasProductionAnalyticsConfiguration(validConfig, {
    protocol: "https:",
    hostname: "preview.example",
  }),
);

/* ---------- canonical project identity ---------- */

const catalog = core.buildAnalyticsProjectCatalog(registry);
check("all 25 canonical detail slugs remain analytics identifiers", Object.keys(registry.projectDetails).filter((slug) => catalog.slugs.has(slug)).length, 25);
for (const [url, expectedSlug, expectedKind] of [
  ["sinama-case-study.html", "sinama", "project"],
  ["merge-rush-case-study.html", "merge-rush", "project"],
  ["projects/ai-chatbot-flow-design/", "ai-chatbot-flow-design", "project"],
  ["atolye-joyday-case-study.html", "atolye-joyday-official-website", "project"],
  ["https://github.com/UAJOP/Hospital-System", "hospital-form-app", "github"],
  ["https://atolyejoyday.com/", "atolye-joyday-official-website", "live"],
]) {
  const project = core.analyticsProjectForUrl(url, registry);
  check(`${url}: resolves canonical analytics slug`, project?.slug, expectedSlug);
  check(`${url}: resolves interaction kind`, project?.kind, expectedKind);
}
check(
  "raw query and hash are removed from first-party URL keys",
  core.analyticsUrlKey("https://kaanbalci.com/projects/ic-supply/?name=kaan#details"),
  "/projects/ic-supply/",
);

/* ---------- payload normalization and PII drift ---------- */

const normalized = core.normalizeAnalyticsEvent(
  "cv_open",
  {
    source: "hero",
    email: "visitor@example.com",
    name: "Visitor",
    message: "private text",
    phone: "+90...",
    description: "form content",
    formData: { details: "private" },
    userInput: "chat text",
    chatInput: "chat text",
    arbitrary: "visible button copy",
  },
  { registry, pageType: "home", recruiterMode: false },
);
check(
  "payload keeps only approved structured properties",
  Object.keys(normalized.properties).sort().join(","),
  "page_type,recruiter_mode,source",
);
ok("payload serialisation contains no supplied PII", !/visitor|private|chat text|\+90/i.test(JSON.stringify(normalized)));
check("page type comes from the BRIEF 03 vocabulary", normalized.properties.page_type, "home");
check("recruiter mode is a boolean", typeof normalized.properties.recruiter_mode, "boolean");
ok(
  "unknown events are rejected",
  core.normalizeAnalyticsEvent("button_click", { source: "hero" }, { registry }) === null,
);
ok(
  "unknown project identifiers reject project events",
  core.normalizeAnalyticsEvent(
    "project_open",
    { project_slug: "invented-title", source: "works" },
    { registry, pageType: "works" },
  ) === null,
);
ok(
  "arbitrary source values are dropped",
  !core.normalizeAnalyticsEvent(
    "cv_open",
    { source: "Button copy from DOM" },
    { registry, pageType: "home" },
  ).properties.source,
);

/* Declarative markers are parsed as event contracts, not counted as strings. */
const home = read("index.html");
const markedTags = [...home.matchAll(/<[^>]+data-analytics-event="([^"]+)"[^>]*>/g)].map((match) => match[0]);
check("homepage has five deliberate Selected Work markers", markedTags.length, 5);
for (const tag of markedTags) {
  const eventName = (tag.match(/data-analytics-event="([^"]+)"/) || [])[1];
  const projectSlug = (tag.match(/data-analytics-project="([^"]+)"/) || [])[1];
  const source = (tag.match(/data-analytics-source="([^"]+)"/) || [])[1];
  const event = core.normalizeAnalyticsEvent(
    eventName,
    { project_slug: projectSlug, source },
    { registry, pageType: "home", recruiterMode: false },
  );
  ok(`${projectSlug}: marker resolves to an approved event payload`, Boolean(event));
  check(`${projectSlug}: marker source is selected_work`, event?.properties.source, "selected_work");
}

/* ---------- execute the real runtime with a browser-shaped harness ---------- */

function makeHarness({ location, runtimeConfig }) {
  const appended = [];
  const listeners = new Map();
  const dispatched = [];
  const debug = [];
  const createScript = () => {
    const scriptListeners = new Map();
    return {
      attributes: {},
      async: false,
      defer: false,
      setAttribute(name, value) { this.attributes[name] = String(value); },
      addEventListener(name, handler) { scriptListeners.set(name, handler); },
      fire(name) { scriptListeners.get(name)?.(); },
    };
  };
  const document = {
    body: {
      dataset: { page: "home" },
      classList: { contains: () => false },
    },
    head: { appendChild: (node) => appended.push(node) },
    addEventListener(name, handler, options) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push({ handler, options });
    },
    dispatchEvent: (event) => dispatched.push(event),
    querySelector: () => null,
    createElement: () => createScript(),
  };
  const window = { location, KAAN_PORTFOLIO: registry };
  const context = {
    window,
    document,
    portfolioAnalyticsConfig: runtimeConfig,
    URL,
    Set,
    Map,
    Object,
    JSON,
    console: { debug: (...args) => debug.push(args), error: () => {} },
    CustomEvent: class CustomEvent {
      constructor(type, options) { this.type = type; this.detail = options?.detail; }
    },
  };
  vm.createContext(context);
  vm.runInContext(
    `${analyticsSource}
     globalThis.__qa = {
       trackAnalyticsEvent,
       initializePortfolioAnalytics,
       trackRequestStartOnce,
       analyticsSourceForElement,
       ANALYTICS_EVENTS
     };`,
    context,
  );
  return { context, document, window, appended, listeners, dispatched, debug, api: context.__qa };
}

const localHarness = makeHarness({
  location: { protocol: "http:", hostname: "localhost", href: "http://localhost:4173/" },
  runtimeConfig: validConfig,
});
check("local runtime appends no provider script", localHarness.appended.length, 0);
check("analytics click delegation initializes once", localHarness.listeners.get("click")?.length, 1);
localHarness.api.initializePortfolioAnalytics();
check("repeated initialization does not duplicate click delegation", localHarness.listeners.get("click")?.length, 1);

localHarness.api.trackAnalyticsEvent("cv_open", {
  source: "hero",
  email: "not-allowed@example.com",
});
check("local debug transport records one event", localHarness.dispatched.length, 1);
check("local debug event is sanitized", JSON.stringify(localHarness.dispatched[0].detail).includes("not-allowed"), false);

const fakeForm = {};
localHarness.api.trackRequestStartOnce(fakeForm);
localHarness.api.trackRequestStartOnce(fakeForm);
check(
  "request_start fires once per page form",
  localHarness.dispatched.filter((item) => item.detail?.name === "request_start").length,
  1,
);

const ajoopElement = {
  dataset: {},
  closest: (selector) => (selector === "[data-portfolio-chatbot]" ? {} : null),
};
check("Ajoop CTA source is a fixed identifier", localHarness.api.analyticsSourceForElement(ajoopElement), "ajoop");

const productionHarness = makeHarness({
  location: { protocol: "https:", hostname: "kaanbalci.com", href: "https://kaanbalci.com/" },
  runtimeConfig: validConfig,
});
check("configured production appends one provider script", productionHarness.appended.length, 1);
const providerScript = productionHarness.appended[0];
ok("provider script is async", providerScript.async === true);
ok("provider script is deferred", providerScript.defer === true);
check("provider script excludes search", providerScript.attributes["data-exclude-search"], "true");
check("provider script is domain-restricted", providerScript.attributes["data-domains"], "kaanbalci.com,www.kaanbalci.com");

productionHarness.api.trackAnalyticsEvent("cv_open", { source: "hero" });
const delivered = [];
productionHarness.window.umami = {
  track: (name, properties) => delivered.push({ name, properties }),
};
providerScript.fire("load");
check("event queued before provider load is flushed once", delivered.length, 1);
check("provider receives the approved event name", delivered[0]?.name, "cv_open");
productionHarness.window.umami.track = () => { throw new Error("blocked"); };
check(
  "provider exceptions are swallowed",
  productionHarness.api.trackAnalyticsEvent("cv_open", { source: "hero" }),
  false,
);

/* ---------- integration placement and privacy ---------- */

const requestSource = read("js/request/form.js");
const successStart = requestSource.indexOf("if (result.state === REQUEST_SUBMISSION_STATE.SUCCESS)");
const successEnd = requestSource.indexOf("} else {", successStart);
ok("request success branch is identifiable", successStart > 0 && successEnd > successStart);
const successBranch = requestSource.slice(successStart, successEnd);
ok("request_submit is inside the confirmed success branch", /ANALYTICS_EVENTS\.REQUEST_SUBMIT/.test(successBranch));
check(
  "request_submit has no second runtime call site",
  (requestSource.match(/ANALYTICS_EVENTS\.REQUEST_SUBMIT/g) || []).length,
  1,
);
ok("request_start listens for meaningful form interaction", /addEventListener\("focusin", recordRequestStart\)/.test(requestSource));
ok("request_start ignores hidden fields", /control\.type === "hidden"/.test(requestSource));

const ajoopSource = `${read("js/ajoop/assistant.js")}\n${read("js/ajoop/matcher.js")}`;
ok("Ajoop message and matcher code never calls analytics", !/trackAnalytics|data-analytics/.test(ajoopSource));
ok("analytics module never reads storage", !/(localStorage|sessionStorage)/.test(analyticsSource));
ok("analytics module never reads form controls or chatbot input", !/(FormData|chatInput|userInput|\[data-chatbot-input\])/.test(analyticsSource));
check("analytics core has one provider send call", (analyticsSource.match(/window\.umami\.track\(/g) || []).length, 1);
const nonAnalyticsRuntime = fs
  .readdirSync(path.join(ROOT, "js"), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
  .map((entry) => read(path.relative(ROOT, path.join(entry.parentPath, entry.name))))
  .join("\n");
check("no second runtime module talks to Umami directly", (nonAnalyticsRuntime.match(/window\.umami\.track\(/g) || []).length, 1);
ok("provider script is created dynamically, outside HTML critical rendering", !/<script[^>]+cloud\.umami\.is/i.test(home));

const runtimeFiles = [
  "js/features/recruiter.js",
  "js/features/command-palette.js",
  "js/portfolio/works.js",
  "js/request/form.js",
];
const suspiciousPayloadKey = /\b(email|name|message|phone|description|formData|userInput|chatInput)\s*:/;
for (const file of runtimeFiles) {
  const source = read(file);
  const calls = [...source.matchAll(/trackAnalyticsEvent\([\s\S]*?\n\s*\);/g)].map((match) => match[0]);
  for (const call of calls) {
    ok(`${file}: analytics call payload has no suspicious PII key`, !suspiciousPayloadKey.test(call));
  }
}

const worksSource = read("js/portfolio/works.js");
ok(
  "non-navigating card gestures are rejected before analytics",
  worksSource.indexOf("if (shouldIgnoreCardActivation(event)) return") <
    worksSource.indexOf('trackAnalyticsNavigation(url, "works")'),
);

if (failures.length) {
  console.error(`Analytics QA: ${failures.length} failure(s), ${passed} passed.\n`);
  for (const failure of failures) console.error(`  x ${failure}\n`);
  process.exit(1);
}

console.log(
  `Analytics contracts passed. ${passed} assertions · ${requiredEvents.length} events · ` +
    `${catalog.slugs.size} canonical project identifiers · production configuration required.`,
);
