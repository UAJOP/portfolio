#!/usr/bin/env node
/**
 * A4.1 contract QA — owner-private read connectors.
 *
 * Deterministic, offline, no provider credentials and no network. Every case
 * asserts a policy decision, not a provider response.
 */
import {
  AJOOP_READ_CONNECTOR_ACCESS,
  AJOOP_READ_CONNECTOR_DEFAULT_LIMIT,
  AJOOP_READ_CONNECTOR_DEFAULT_PR_STATE,
  AJOOP_READ_CONNECTOR_MAX_CALENDAR_RANGE_DAYS,
  AJOOP_READ_CONNECTOR_MAX_ID_CHARS,
  AJOOP_READ_CONNECTOR_MAX_LIMIT,
  AJOOP_READ_CONNECTOR_MAX_PR_NUMBER,
  AJOOP_READ_CONNECTOR_MAX_QUERY_CHARS,
  AJOOP_READ_CONNECTOR_PROVENANCE,
  AJOOP_READ_CONNECTOR_SCHEMA_VERSION,
  AJOOP_READ_CONNECTOR_SURFACES,
  AJOOP_READ_CONNECTOR_TOOL_IDS,
  canUseAjoopReadConnectors,
  evaluateAjoopConnectorRead,
  listAjoopReadConnectorToolIds,
  shouldUseAjoopReadConnector,
} from "../server/ajoop-read-connector-contract.mjs";

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

const OWNER = Object.freeze({
  surface: AJOOP_READ_CONNECTOR_SURFACES.OWNER_PRIVATE,
  authenticatedOwner: true,
});

const PUBLIC_CLAIMING_OWNER = Object.freeze({
  surface: AJOOP_READ_CONNECTOR_SURFACES.PUBLIC_PORTFOLIO,
  authenticatedOwner: true,
});

const T = AJOOP_READ_CONNECTOR_TOOL_IDS;
const evaluate = (request, context = OWNER) => evaluateAjoopConnectorRead(request, context);
const accepted = (toolId, args) => evaluate({ toolId, args });
const codeOf = (toolId, args) => accepted(toolId, args).code;
const withObjectPrototypeValue = (key, value, run) => {
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
  Object.defineProperty(Object.prototype, key, { value, configurable: true });
  try {
    return run();
  } finally {
    if (previous) Object.defineProperty(Object.prototype, key, previous);
    else delete Object.prototype[key];
  }
};

try {
  /* ---------------------------------------------------------------- registry */

  const toolIds = listAjoopReadConnectorToolIds();
  check("registry exposes eight bounded read tools", toolIds.length, 8);
  check("registry ids are unique", new Set(toolIds).size, 8);
  ok("registry result is frozen", Object.isFrozen(toolIds));
  check(
    "registry matches the declared A4.1 read surface exactly",
    toolIds.slice().sort().join(","),
    [
      "calendar.list_events",
      "calendar.read_event",
      "drive.read_file",
      "drive.search_files",
      "github.read_pull_request",
      "github.search_pull_requests",
      "gmail.read_thread",
      "gmail.search_messages",
    ].join(","),
  );
  ok(
    "every registered tool id is a read or search operation",
    toolIds.every((id) => /\.(read|search|list)_/.test(id)),
  );

  const FORBIDDEN_WRITE_TOOLS = [
    "gmail.send_email",
    "gmail.delete_message",
    "calendar.create_event",
    "calendar.update_event",
    "calendar.delete_event",
    "github.merge_pull_request",
    "github.create_issue",
    "drive.update_file",
    "drive.delete_file",
    "execute",
    "action",
    "provider.passthrough",
  ];
  for (const toolId of FORBIDDEN_WRITE_TOOLS) {
    check(`registry excludes write tool ${toolId}`, toolIds.includes(toolId), false);
    check(`write tool ${toolId} fails closed`, evaluate({ toolId, args: {} }).code, "unknown-tool");
  }

  /* ------------------------------------------------------- auth and surface */

  check("owner-private authenticated surface may read", canUseAjoopReadConnectors(OWNER), true);
  check(
    "public surface can never become owner by boolean claim",
    canUseAjoopReadConnectors(PUBLIC_CLAIMING_OWNER),
    false,
  );
  check(
    "owner-private still requires authentication",
    canUseAjoopReadConnectors({ surface: AJOOP_READ_CONNECTOR_SURFACES.OWNER_PRIVATE, authenticatedOwner: false }),
    false,
  );
  check("missing context denies", canUseAjoopReadConnectors(undefined), false);
  check("null context denies instead of throwing", canUseAjoopReadConnectors(null), false);
  check("array context denies", canUseAjoopReadConnectors(["owner-private", true]), false);
  check("string context denies", canUseAjoopReadConnectors("owner-private"), false);
  check(
    "truthy non-boolean owner flag is not authentication",
    canUseAjoopReadConnectors({ surface: AJOOP_READ_CONNECTOR_SURFACES.OWNER_PRIVATE, authenticatedOwner: "true" }),
    false,
  );
  check(
    "unknown surface denies",
    canUseAjoopReadConnectors({ surface: "owner", authenticatedOwner: true }),
    false,
  );
  check(
    "inherited context fields never grant owner access",
    canUseAjoopReadConnectors(Object.create(OWNER)),
    false,
  );

  const gmailArgs = { query: "from:zaigo" };
  check(
    "public request is rejected before connector execution",
    evaluate({ toolId: T.GMAIL_SEARCH_MESSAGES, args: gmailArgs }, PUBLIC_CLAIMING_OWNER).code,
    "owner-private-auth-required",
  );
  check(
    "unauthenticated owner request is rejected",
    evaluate(
      { toolId: T.GMAIL_SEARCH_MESSAGES, args: gmailArgs },
      { surface: AJOOP_READ_CONNECTOR_SURFACES.OWNER_PRIVATE, authenticatedOwner: false },
    ).code,
    "owner-private-auth-required",
  );
  check(
    "null context fails closed rather than throwing",
    evaluate({ toolId: T.GMAIL_SEARCH_MESSAGES, args: gmailArgs }, null).code,
    "owner-private-auth-required",
  );
  check(
    "missing context fails closed",
    evaluateAjoopConnectorRead({ toolId: T.GMAIL_SEARCH_MESSAGES, args: gmailArgs }).code,
    "owner-private-auth-required",
  );
  check(
    "authorization is checked before argument validity is revealed",
    evaluate({ toolId: "gmail.send_email", args: { nonsense: true } }, PUBLIC_CLAIMING_OWNER).code,
    "owner-private-auth-required",
  );

  /* ------------------------------------------------------- request envelope */

  check("null request fails closed", evaluate(null).code, "invalid-request");
  check("array request fails closed", evaluate([]).code, "invalid-request");
  check("string request fails closed", evaluate("gmail.search_messages").code, "invalid-request");
  check(
    "prototype-carrying envelope cannot smuggle fields past the allowlist",
    evaluate(Object.create({ toolId: T.GMAIL_SEARCH_MESSAGES, args: gmailArgs })).code,
    "invalid-request",
  );
  check("missing toolId is unknown", evaluate({ args: gmailArgs }).code, "unknown-tool");
  check("non-string toolId is unknown", evaluate({ toolId: 7, args: gmailArgs }).code, "unknown-tool");
  check(
    "inherited tool ids are not registry members",
    evaluate({ toolId: "toString", args: {} }).code,
    "unknown-tool",
  );
  check(
    "constructor is not a registry member",
    evaluate({ toolId: "constructor", args: {} }).code,
    "unknown-tool",
  );
  check(
    "tool ids are exact identifiers, not trimmed free text",
    evaluate({ toolId: `  ${T.GMAIL_READ_THREAD}  `, args: { threadId: "abc" } }).code,
    "unknown-tool",
  );
  check(
    "unexpected request envelope fields are rejected",
    evaluate({ toolId: T.GMAIL_SEARCH_MESSAGES, args: gmailArgs, retry: 99 }).code,
    "unexpected-request-field",
  );
  check(
    "non-object args are rejected",
    evaluate({ toolId: T.GMAIL_SEARCH_MESSAGES, args: "query=x" }).code,
    "invalid-arguments",
  );
  check(
    "array args are rejected",
    evaluate({ toolId: T.GMAIL_SEARCH_MESSAGES, args: ["x"] }).code,
    "invalid-arguments",
  );
  check(
    "explicitly undefined args are rejected",
    evaluate({ toolId: T.GMAIL_SEARCH_MESSAGES, args: undefined }).code,
    "invalid-arguments",
  );
  check(
    "prototype-carrying args cannot smuggle values past the allowlist",
    evaluate({ toolId: T.GMAIL_SEARCH_MESSAGES, args: Object.create({ query: "inherited" }) }).code,
    "invalid-arguments",
  );
  check(
    "Object.prototype toolId cannot satisfy the request envelope",
    withObjectPrototypeValue("toolId", T.GMAIL_SEARCH_MESSAGES, () => evaluate({ args: gmailArgs }).code),
    "unknown-tool",
  );

  const INHERITED_ARGUMENT_CASES = [
    ["query", "polluted", T.GMAIL_SEARCH_MESSAGES, {}],
    ["threadId", "polluted", T.GMAIL_READ_THREAD, {}],
    ["timeMin", "2026-09-10T00:00:00Z", T.CALENDAR_LIST_EVENTS, { timeMax: "2026-09-11T00:00:00Z" }],
    ["timeMax", "2026-09-11T00:00:00Z", T.CALENDAR_LIST_EVENTS, { timeMin: "2026-09-10T00:00:00Z" }],
    ["eventId", "polluted", T.CALENDAR_READ_EVENT, {}],
    ["repository", "UAJOP/portfolio", T.GITHUB_READ_PULL_REQUEST, { prNumber: 73 }],
    ["prNumber", 73, T.GITHUB_READ_PULL_REQUEST, { repository: "UAJOP/portfolio" }],
    ["fileId", "polluted", T.DRIVE_READ_FILE, {}],
  ];
  for (const [key, value, toolId, args] of INHERITED_ARGUMENT_CASES) {
    check(
      `Object.prototype ${key} cannot satisfy a missing own argument`,
      withObjectPrototypeValue(key, value, () => accepted(toolId, args).ok),
      false,
    );
  }
  check(
    "inherited optional state is ignored in favor of the default",
    withObjectPrototypeValue("state", "closed", () =>
      accepted(T.GITHUB_SEARCH_PULL_REQUESTS, { repository: "UAJOP/portfolio" }).request.args.state),
    AJOOP_READ_CONNECTOR_DEFAULT_PR_STATE,
  );
  check(
    "inherited optional limit is ignored in favor of the default",
    withObjectPrototypeValue("limit", 99, () =>
      accepted(T.GMAIL_SEARCH_MESSAGES, { query: "own query" }).request.args.limit),
    AJOOP_READ_CONNECTOR_DEFAULT_LIMIT,
  );
  check(
    "normal own-property requests still pass after prototype probes",
    accepted(T.GMAIL_SEARCH_MESSAGES, { query: "own query" }).code,
    "accepted",
  );
  check(
    "polluted __proto__ key is an unexpected argument",
    codeOf(T.GMAIL_SEARCH_MESSAGES, JSON.parse('{"query":"x","__proto__":{"limit":9999}}')),
    "unexpected-argument",
  );
  ok("prototype was not polluted by the previous case", {}.limit === undefined);

  const CALLER_POLICY_FIELDS = [
    "surface",
    "authenticatedOwner",
    "access",
    "permission",
    "provenance",
    "version",
    "authority",
    "connector",
    "operation",
  ];
  for (const field of CALLER_POLICY_FIELDS) {
    check(
      `caller cannot self-assert ${field}`,
      evaluate({ toolId: T.GMAIL_SEARCH_MESSAGES, args: gmailArgs, [field]: "claimed" }).code,
      "caller-policy-field-forbidden",
    );
  }
  check(
    "policy fields are rejected even when the tool id is unknown",
    evaluate({ toolId: "gmail.send_email", access: "write" }).code,
    "caller-policy-field-forbidden",
  );

  /* ------------------------------------------------------------------ gmail */

  const gmailSearch = accepted(T.GMAIL_SEARCH_MESSAGES, { query: "  from:zaigo newer_than:30d  " });
  check("gmail search accepted", gmailSearch.code, "accepted");
  check("gmail search connector", gmailSearch.request.connector, "gmail");
  check("gmail search operation", gmailSearch.request.operation, "search_messages");
  check("gmail search tool id preserved", gmailSearch.request.toolId, T.GMAIL_SEARCH_MESSAGES);
  check("gmail query edge whitespace trimmed", gmailSearch.request.args.query, "from:zaigo newer_than:30d");
  check("gmail default result limit", gmailSearch.request.args.limit, AJOOP_READ_CONNECTOR_DEFAULT_LIMIT);

  const gmailPhrase = accepted(T.GMAIL_SEARCH_MESSAGES, { query: 'subject:"quarterly  report"' });
  check("gmail phrase search accepted", gmailPhrase.code, "accepted");
  check(
    "gmail quoted phrase is never silently rewritten",
    gmailPhrase.request.args.query,
    'subject:"quarterly  report"',
  );

  check("gmail query required", codeOf(T.GMAIL_SEARCH_MESSAGES, {}), "invalid-string-argument");
  check("gmail non-string query rejected", codeOf(T.GMAIL_SEARCH_MESSAGES, { query: 12 }), "invalid-string-argument");
  check("gmail null query rejected", codeOf(T.GMAIL_SEARCH_MESSAGES, { query: null }), "invalid-string-argument");
  check(
    "gmail explicitly undefined query rejected",
    codeOf(T.GMAIL_SEARCH_MESSAGES, { query: undefined }),
    "invalid-argument-value",
  );
  check(
    "gmail whitespace-only query rejected",
    codeOf(T.GMAIL_SEARCH_MESSAGES, { query: "   " }),
    "empty-string-argument",
  );
  check(
    "gmail multiline query rejected rather than joined",
    codeOf(T.GMAIL_SEARCH_MESSAGES, { query: "from:a\nto:b" }),
    "unsafe-string-argument",
  );

  const QUERY_TOOLS = [
    [T.GMAIL_SEARCH_MESSAGES, (query) => ({ query })],
    [T.DRIVE_SEARCH_FILES, (query) => ({ query })],
    [T.GITHUB_SEARCH_PULL_REQUESTS, (query) => ({ repository: "UAJOP/portfolio", query })],
  ];
  for (const [toolId, argsFor] of QUERY_TOOLS) {
    check(
      `${toolId} rejects Arabic Letter Mark`,
      codeOf(toolId, argsFor("alpha\u061Cbeta")),
      "unsafe-string-argument",
    );
    check(
      `${toolId} rejects Word Joiner`,
      codeOf(toolId, argsFor("alpha\u2060beta")),
      "unsafe-string-argument",
    );
    check(
      `${toolId} rejects an invisible function application control`,
      codeOf(toolId, argsFor("alpha\u2061beta")),
      "unsafe-string-argument",
    );
    check(
      `${toolId} rejects a deprecated bidi formatting control`,
      codeOf(toolId, argsFor("alpha\u206Abeta")),
      "unsafe-string-argument",
    );
  }
  check(
    "gmail query at the character bound accepted",
    codeOf(T.GMAIL_SEARCH_MESSAGES, { query: "x".repeat(AJOOP_READ_CONNECTOR_MAX_QUERY_CHARS) }),
    "accepted",
  );
  check(
    "gmail overlong query rejected, never truncated",
    codeOf(T.GMAIL_SEARCH_MESSAGES, { query: "x".repeat(AJOOP_READ_CONNECTOR_MAX_QUERY_CHARS + 1) }),
    "string-argument-too-long",
  );
  check(
    "gmail max result limit accepted",
    accepted(T.GMAIL_SEARCH_MESSAGES, { query: "x", limit: AJOOP_READ_CONNECTOR_MAX_LIMIT }).request.args.limit,
    AJOOP_READ_CONNECTOR_MAX_LIMIT,
  );
  check(
    "gmail result limit is bounded",
    codeOf(T.GMAIL_SEARCH_MESSAGES, { query: "x", limit: AJOOP_READ_CONNECTOR_MAX_LIMIT + 1 }),
    "invalid-limit",
  );
  check("gmail zero limit rejected", codeOf(T.GMAIL_SEARCH_MESSAGES, { query: "x", limit: 0 }), "invalid-limit");
  check(
    "gmail fractional limit rejected",
    codeOf(T.GMAIL_SEARCH_MESSAGES, { query: "x", limit: 2.5 }),
    "invalid-limit",
  );
  check(
    "gmail string limit rejected",
    codeOf(T.GMAIL_SEARCH_MESSAGES, { query: "x", limit: "20" }),
    "invalid-limit",
  );
  check(
    "gmail search rejects write-like extra argument",
    codeOf(T.GMAIL_SEARCH_MESSAGES, { query: "x", send: true }),
    "unexpected-argument",
  );

  const gmailThread = accepted(T.GMAIL_READ_THREAD, { threadId: " 18f2c9ab4d7e0011 " });
  check("gmail thread read accepted", gmailThread.code, "accepted");
  check("gmail thread id trimmed", gmailThread.request.args.threadId, "18f2c9ab4d7e0011");
  check("gmail thread operation", gmailThread.request.operation, "read_thread");
  check("gmail thread id required", codeOf(T.GMAIL_READ_THREAD, {}), "invalid-string-argument");
  check(
    "gmail thread read rejects unrelated arguments",
    codeOf(T.GMAIL_READ_THREAD, { threadId: "x", body: "mutate" }),
    "unexpected-argument",
  );
  check(
    "gmail thread read rejects a smuggled query",
    codeOf(T.GMAIL_READ_THREAD, { threadId: "x", query: "from:a" }),
    "unexpected-argument",
  );
  check(
    "gmail thread read rejects a limit it does not accept",
    codeOf(T.GMAIL_READ_THREAD, { threadId: "x", limit: 5 }),
    "unexpected-argument",
  );

  /* --------------------------------------------------------------- calendar */

  const calendar = accepted(T.CALENDAR_LIST_EVENTS, {
    timeMin: "2026-09-10T00:00:00+03:00",
    timeMax: "2026-09-17T00:00:00+03:00",
    limit: 30,
  });
  check("calendar range accepted", calendar.code, "accepted");
  check("calendar connector", calendar.request.connector, "calendar");
  check("calendar lower instant canonicalized to UTC", calendar.request.args.timeMin, "2026-09-09T21:00:00.000Z");
  check("calendar upper instant canonicalized to UTC", calendar.request.args.timeMax, "2026-09-16T21:00:00.000Z");
  check("calendar explicit limit preserved", calendar.request.args.limit, 30);
  check("calendar default limit applied", accepted(T.CALENDAR_LIST_EVENTS, {
    timeMin: "2026-09-10T00:00:00Z",
    timeMax: "2026-09-11T00:00:00Z",
  }).request.args.limit, AJOOP_READ_CONNECTOR_DEFAULT_LIMIT);

  const sameInstant = accepted(T.CALENDAR_LIST_EVENTS, {
    timeMin: "2026-09-10T12:30:00Z",
    timeMax: "2026-09-10T12:30:00.000+00:00",
  });
  check("calendar equal instants are not a range", sameInstant.code, "invalid-time-range");
  check(
    "calendar normalization is offset-independent",
    accepted(T.CALENDAR_LIST_EVENTS, { timeMin: "2026-09-10T03:00:00+03:00", timeMax: "2026-09-11T00:00:00Z" })
      .request.args.timeMin,
    "2026-09-10T00:00:00.000Z",
  );
  check(
    "calendar minute precision accepted",
    accepted(T.CALENDAR_LIST_EVENTS, { timeMin: "2026-09-10T00:00Z", timeMax: "2026-09-11T00:00Z" }).code,
    "accepted",
  );

  check(
    "calendar rejects reverse range",
    codeOf(T.CALENDAR_LIST_EVENTS, { timeMin: "2026-09-17T00:00:00Z", timeMax: "2026-09-10T00:00:00Z" }),
    "invalid-time-range",
  );
  check(
    "calendar rejects malformed time",
    codeOf(T.CALENDAR_LIST_EVENTS, { timeMin: "tomorrow-ish", timeMax: "2026-09-17T00:00:00Z" }),
    "invalid-time",
  );
  check(
    "calendar rejects date-only bounds",
    codeOf(T.CALENDAR_LIST_EVENTS, { timeMin: "2026-09-10", timeMax: "2026-09-17" }),
    "invalid-time",
  );
  check(
    "calendar rejects host-local datetimes with no offset",
    codeOf(T.CALENDAR_LIST_EVENTS, { timeMin: "2026-09-10T00:00:00", timeMax: "2026-09-17T00:00:00" }),
    "invalid-time",
  );
  check(
    "calendar rejects legacy non-ISO date text",
    codeOf(T.CALENDAR_LIST_EVENTS, { timeMin: "Sep 10 2026", timeMax: "Sep 17 2026" }),
    "invalid-time",
  );
  check(
    "calendar rejects an overflowing calendar day instead of rolling it forward",
    codeOf(T.CALENDAR_LIST_EVENTS, { timeMin: "2026-02-30T00:00:00Z", timeMax: "2026-03-05T00:00:00Z" }),
    "invalid-time",
  );
  check(
    "calendar rejects an impossible month",
    codeOf(T.CALENDAR_LIST_EVENTS, { timeMin: "2026-13-01T00:00:00Z", timeMax: "2026-12-01T00:00:00Z" }),
    "invalid-time",
  );
  check(
    "calendar accepts a real leap day",
    codeOf(T.CALENDAR_LIST_EVENTS, { timeMin: "2028-02-29T00:00:00Z", timeMax: "2028-03-01T00:00:00Z" }),
    "accepted",
  );
  check(
    "calendar rejects a leap day in a common year",
    codeOf(T.CALENDAR_LIST_EVENTS, { timeMin: "2026-02-29T00:00:00Z", timeMax: "2026-03-01T00:00:00Z" }),
    "invalid-time",
  );
  check(
    "calendar range at the day bound accepted",
    codeOf(T.CALENDAR_LIST_EVENTS, {
      timeMin: "2026-01-01T00:00:00.000Z",
      timeMax: new Date(Date.parse("2026-01-01T00:00:00.000Z") + AJOOP_READ_CONNECTOR_MAX_CALENDAR_RANGE_DAYS * 86400000).toISOString(),
    }),
    "accepted",
  );
  check(
    "calendar rejects a range one millisecond past the bound",
    codeOf(T.CALENDAR_LIST_EVENTS, {
      timeMin: "2026-01-01T00:00:00.000Z",
      timeMax: new Date(Date.parse("2026-01-01T00:00:00.000Z") + AJOOP_READ_CONNECTOR_MAX_CALENDAR_RANGE_DAYS * 86400000 + 1).toISOString(),
    }),
    "time-range-too-wide",
  );
  check(
    "calendar rejects a full-year sweep",
    codeOf(T.CALENDAR_LIST_EVENTS, { timeMin: "2026-01-01T00:00:00Z", timeMax: "2026-12-31T00:00:00Z" }),
    "time-range-too-wide",
  );
  check(
    "calendar list rejects a smuggled event mutation argument",
    codeOf(T.CALENDAR_LIST_EVENTS, {
      timeMin: "2026-09-10T00:00:00Z",
      timeMax: "2026-09-11T00:00:00Z",
      summary: "new meeting",
    }),
    "unexpected-argument",
  );

  const calendarEvent = accepted(T.CALENDAR_READ_EVENT, { eventId: " 6c9p4b9k6ss30b9k@google.com " });
  check("calendar event accepted", calendarEvent.code, "accepted");
  check("calendar event id trimmed", calendarEvent.request.args.eventId, "6c9p4b9k6ss30b9k@google.com");
  check("calendar event id required", codeOf(T.CALENDAR_READ_EVENT, {}), "invalid-string-argument");
  check(
    "calendar event read rejects a time range it does not accept",
    codeOf(T.CALENDAR_READ_EVENT, { eventId: "x", timeMin: "2026-09-10T00:00:00Z" }),
    "unexpected-argument",
  );

  /* ----------------------------------------------------------------- github */

  const githubSearch = accepted(T.GITHUB_SEARCH_PULL_REQUESTS, {
    repository: " UAJOP/portfolio ",
    query: "ajoop memory",
  });
  check("github PR search accepted", githubSearch.code, "accepted");
  check("github repository trimmed and preserved", githubSearch.request.args.repository, "UAJOP/portfolio");
  check("github optional query preserved", githubSearch.request.args.query, "ajoop memory");
  check("github search default state", githubSearch.request.args.state, AJOOP_READ_CONNECTOR_DEFAULT_PR_STATE);
  check("github search default limit", githubSearch.request.args.limit, AJOOP_READ_CONNECTOR_DEFAULT_LIMIT);
  ok("github optional query omitted when absent", !Object.hasOwn(
    accepted(T.GITHUB_SEARCH_PULL_REQUESTS, { repository: "UAJOP/portfolio" }).request.args,
    "query",
  ));
  check(
    "github explicitly undefined optional query rejected",
    codeOf(T.GITHUB_SEARCH_PULL_REQUESTS, { repository: "UAJOP/portfolio", query: undefined }),
    "invalid-argument-value",
  );
  check(
    "github empty optional query rejected",
    codeOf(T.GITHUB_SEARCH_PULL_REQUESTS, { repository: "UAJOP/portfolio", query: "  " }),
    "empty-string-argument",
  );

  for (const state of ["open", "closed", "all"]) {
    check(
      `github accepts the ${state} state`,
      accepted(T.GITHUB_SEARCH_PULL_REQUESTS, { repository: "UAJOP/portfolio", state }).request.args.state,
      state,
    );
  }
  check(
    "github PR state is bounded",
    codeOf(T.GITHUB_SEARCH_PULL_REQUESTS, { repository: "UAJOP/portfolio", state: "merged" }),
    "invalid-state",
  );
  check(
    "github PR state rejects a non-string",
    codeOf(T.GITHUB_SEARCH_PULL_REQUESTS, { repository: "UAJOP/portfolio", state: true }),
    "invalid-state",
  );

  const REJECTED_REPOSITORIES = [
    ["bare name", "portfolio"],
    ["path traversal", "../.."],
    ["dot segments", ".git/."],
    ["parent segment", "UAJOP/.."],
    ["current segment", "UAJOP/."],
    ["three segments", "UAJOP/portfolio/tree"],
    ["trailing slash", "UAJOP/"],
    ["leading slash", "/portfolio"],
    ["full url", "https://github.com/UAJOP/portfolio"],
    ["query smuggling", "UAJOP/portfolio?tab=x"],
    ["space in name", "UAJOP/my portfolio"],
    ["leading hyphen owner", "-UAJOP/portfolio"],
    ["trailing hyphen owner", "UAJOP-/portfolio"],
    ["dotted owner", "UA.JOP/portfolio"],
    ["empty", "  "],
  ];
  for (const [label, repository] of REJECTED_REPOSITORIES) {
    const result = codeOf(T.GITHUB_READ_PULL_REQUEST, { repository, prNumber: 1 });
    ok(
      `github rejects repository (${label}): ${repository}`,
      result === "invalid-repository" || result === "empty-string-argument",
    );
  }
  check(
    "github accepts a dotted repository name",
    codeOf(T.GITHUB_SEARCH_PULL_REQUESTS, { repository: "UAJOP/portfolio.github.io" }),
    "accepted",
  );
  check(
    "github accepts a hyphenated owner",
    codeOf(T.GITHUB_SEARCH_PULL_REQUESTS, { repository: "kaan-balci/portfolio" }),
    "accepted",
  );
  check("github repository required", codeOf(T.GITHUB_SEARCH_PULL_REQUESTS, {}), "invalid-string-argument");

  const githubPr = accepted(T.GITHUB_READ_PULL_REQUEST, { repository: "UAJOP/sinama", prNumber: 73 });
  check("github PR read accepted", githubPr.code, "accepted");
  check("github PR number preserved", githubPr.request.args.prNumber, 73);
  check("github PR operation", githubPr.request.operation, "read_pull_request");
  for (const [label, prNumber] of [
    ["zero", 0],
    ["negative", -3],
    ["fractional", 1.5],
    ["string", "73"],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["above bound", AJOOP_READ_CONNECTOR_MAX_PR_NUMBER + 1],
  ]) {
    check(
      `github rejects a ${label} PR number`,
      codeOf(T.GITHUB_READ_PULL_REQUEST, { repository: "UAJOP/sinama", prNumber }),
      "invalid-pr-number",
    );
  }
  check("github PR number required", codeOf(T.GITHUB_READ_PULL_REQUEST, { repository: "UAJOP/sinama" }), "invalid-pr-number");
  check(
    "github PR read rejects a merge argument",
    codeOf(T.GITHUB_READ_PULL_REQUEST, { repository: "UAJOP/sinama", prNumber: 73, merge: true }),
    "unexpected-argument",
  );

  /* ------------------------------------------------------------------ drive */

  const driveSearch = accepted(T.DRIVE_SEARCH_FILES, { query: "  name contains 'CV'  ", limit: 5 });
  check("drive search accepted", driveSearch.code, "accepted");
  check("drive connector", driveSearch.request.connector, "drive");
  check("drive query trimmed but otherwise intact", driveSearch.request.args.query, "name contains 'CV'");
  check("drive bounded limit preserved", driveSearch.request.args.limit, 5);
  check("drive query required", codeOf(T.DRIVE_SEARCH_FILES, {}), "invalid-string-argument");
  check(
    "drive quoted phrase is never silently rewritten",
    accepted(T.DRIVE_SEARCH_FILES, { query: "name contains 'Kaan  Balci  CV'" }).request.args.query,
    "name contains 'Kaan  Balci  CV'",
  );
  check(
    "drive result limit is bounded",
    codeOf(T.DRIVE_SEARCH_FILES, { query: "x", limit: AJOOP_READ_CONNECTOR_MAX_LIMIT + 1 }),
    "invalid-limit",
  );

  const driveRead = accepted(T.DRIVE_READ_FILE, { fileId: " 1A2b3C_d4E-f5G6h7I8j9K0lMnOpQrS " });
  check("drive file read accepted", driveRead.code, "accepted");
  check("drive file id trimmed", driveRead.request.args.fileId, "1A2b3C_d4E-f5G6h7I8j9K0lMnOpQrS");
  check("drive file id required", codeOf(T.DRIVE_READ_FILE, {}), "invalid-string-argument");
  check(
    "drive file read rejects a content mutation argument",
    codeOf(T.DRIVE_READ_FILE, { fileId: "x", content: "overwrite" }),
    "unexpected-argument",
  );
  check(
    "drive file read rejects a query it does not accept",
    codeOf(T.DRIVE_READ_FILE, { fileId: "x", query: "name contains 'CV'" }),
    "unexpected-argument",
  );

  /* -------------------------------------------------------- identifier shape */

  const ID_TOOLS = [
    [T.GMAIL_READ_THREAD, "threadId"],
    [T.CALENDAR_READ_EVENT, "eventId"],
    [T.DRIVE_READ_FILE, "fileId"],
  ];
  for (const [toolId, key] of ID_TOOLS) {
    check(
      `${key} rejects an embedded NUL byte`,
      codeOf(toolId, { [key]: "abc\u0000def" }),
      "unsafe-string-argument",
    );
    check(
      `${key} rejects an ANSI escape sequence`,
      codeOf(toolId, { [key]: "a\u001B[31mb" }),
      "unsafe-string-argument",
    );
    check(
      `${key} rejects a bidi override`,
      codeOf(toolId, { [key]: "a\u202Eb" }),
      "unsafe-string-argument",
    );
    check(
      `${key} rejects a zero-width joiner`,
      codeOf(toolId, { [key]: "a\u200Bb" }),
      "unsafe-string-argument",
    );
    check(`${key} rejects a path separator`, codeOf(toolId, { [key]: "..\\secrets" }), "invalid-identifier");
    for (const pathShaped of ["/", "a/b", "./secret", "../..", ".", ".."]) {
      check(
        `${key} rejects path-shaped identifier ${pathShaped}`,
        codeOf(toolId, { [key]: pathShaped }),
        "invalid-identifier",
      );
    }
    check(`${key} rejects a url`, codeOf(toolId, { [key]: "https://example.com/x" }), "invalid-identifier");
    check(`${key} rejects an interior space`, codeOf(toolId, { [key]: "a b" }), "invalid-identifier");
    check(
      `${key} rejects an overlong identifier`,
      codeOf(toolId, { [key]: "a".repeat(AJOOP_READ_CONNECTOR_MAX_ID_CHARS + 1) }),
      "string-argument-too-long",
    );
    check(
      `${key} accepts an identifier at the character bound`,
      codeOf(toolId, { [key]: "a".repeat(AJOOP_READ_CONNECTOR_MAX_ID_CHARS) }),
      "accepted",
    );
  }

  /* -------------------------------------------------------- selection policy */

  check(
    "current personal external state selects connectors when local context is insufficient",
    shouldUseAjoopReadConnector({ requiresCurrentPersonalExternalState: true }),
    true,
  );
  check(
    "deterministic facts suppress external connector use",
    shouldUseAjoopReadConnector({ requiresCurrentPersonalExternalState: true, deterministicFactAvailable: true }),
    false,
  );
  check(
    "portfolio corpus suppresses external connector use",
    shouldUseAjoopReadConnector({ requiresCurrentPersonalExternalState: true, portfolioSufficient: true }),
    false,
  );
  check(
    "conversation context suppresses external connector use",
    shouldUseAjoopReadConnector({ requiresCurrentPersonalExternalState: true, conversationSufficient: true }),
    false,
  );
  check(
    "any single sufficient local source suppresses connectors",
    shouldUseAjoopReadConnector({
      requiresCurrentPersonalExternalState: true,
      deterministicFactAvailable: true,
      portfolioSufficient: true,
      conversationSufficient: true,
    }),
    false,
  );
  check("non-current questions do not select connectors", shouldUseAjoopReadConnector({}), false);
  check("missing selection signals do not select connectors", shouldUseAjoopReadConnector(), false);
  check("null selection policy does not throw or select", shouldUseAjoopReadConnector(null), false);
  check("array selection policy does not select", shouldUseAjoopReadConnector([]), false);
  check("string selection policy does not select", shouldUseAjoopReadConnector("current"), false);
  check(
    "class instance selection policy does not select",
    shouldUseAjoopReadConnector(new (class SelectionPolicy {
      requiresCurrentPersonalExternalState = true;
    })()),
    false,
  );
  check(
    "a non-boolean trigger does not select connectors",
    shouldUseAjoopReadConnector({ requiresCurrentPersonalExternalState: "yes" }),
    false,
  );
  check(
    "a numeric trigger does not select connectors",
    shouldUseAjoopReadConnector({ requiresCurrentPersonalExternalState: 1 }),
    false,
  );
  check(
    "truthy non-boolean suppressors do not alter exact-boolean policy",
    shouldUseAjoopReadConnector({
      requiresCurrentPersonalExternalState: true,
      deterministicFactAvailable: "true",
      portfolioSufficient: 1,
      conversationSufficient: {},
    }),
    true,
  );
  check(
    "selection policy does not grant authorization",
    evaluate(
      { toolId: T.GMAIL_SEARCH_MESSAGES, args: gmailArgs },
      { surface: AJOOP_READ_CONNECTOR_SURFACES.PUBLIC_PORTFOLIO, authenticatedOwner: true },
    ).ok && shouldUseAjoopReadConnector({ requiresCurrentPersonalExternalState: true }),
    false,
  );

  /* ------------------------------------------------ hostile object behavior */

  check(
    "throwing getPrototypeOf proxy fails closed",
    evaluate(new Proxy({}, { getPrototypeOf() { throw new Error("trap"); } })).code,
    "invalid-request",
  );
  check(
    "throwing ownKeys proxy fails closed",
    evaluate(new Proxy({}, { ownKeys() { throw new Error("trap"); } })).code,
    "invalid-request",
  );
  check(
    "throwing descriptor proxy fails closed",
    evaluate(new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("trap"); } })).code,
    "invalid-request",
  );
  check(
    "toolId getter is rejected without execution",
    evaluate({ get toolId() { throw new Error("getter must not run"); } }).code,
    "invalid-request",
  );
  check(
    "required argument getter is rejected without execution",
    evaluate({
      toolId: T.GMAIL_SEARCH_MESSAGES,
      args: { get query() { throw new Error("getter must not run"); } },
    }).code,
    "invalid-argument-value",
  );

  /* ---------------------------------------------------------- trust metadata */

  const ACCEPTED_SAMPLES = [
    [T.GMAIL_SEARCH_MESSAGES, { query: "from:zaigo" }],
    [T.GMAIL_READ_THREAD, { threadId: "abc123" }],
    [T.CALENDAR_LIST_EVENTS, { timeMin: "2026-09-10T00:00:00Z", timeMax: "2026-09-11T00:00:00Z" }],
    [T.CALENDAR_READ_EVENT, { eventId: "abc123" }],
    [T.GITHUB_SEARCH_PULL_REQUESTS, { repository: "UAJOP/portfolio" }],
    [T.GITHUB_READ_PULL_REQUEST, { repository: "UAJOP/portfolio", prNumber: 73 }],
    [T.DRIVE_SEARCH_FILES, { query: "CV" }],
    [T.DRIVE_READ_FILE, { fileId: "abc123" }],
  ];
  check("every declared tool has an accepted sample", ACCEPTED_SAMPLES.length, toolIds.length);
  for (const [toolId, args] of ACCEPTED_SAMPLES) {
    const result = accepted(toolId, args);
    check(`${toolId} sample accepted`, result.code, "accepted");
    check(`${toolId} access is derived read-only`, result.request.access, AJOOP_READ_CONNECTOR_ACCESS.READ_ONLY);
    check(
      `${toolId} provenance is derived connected-source`,
      result.request.provenance,
      AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE,
    );
    check(`${toolId} schema version is derived`, result.request.version, AJOOP_READ_CONNECTOR_SCHEMA_VERSION);
    ok(`${toolId} envelope is frozen`, Object.isFrozen(result.request));
    ok(`${toolId} args are frozen`, Object.isFrozen(result.request.args));
    ok(`${toolId} result is frozen`, Object.isFrozen(result));
    check(
      `${toolId} connected provenance is never canonical portfolio truth`,
      result.request.provenance === "canonical-portfolio",
      false,
    );
    check(
      `${toolId} envelope exposes exactly the derived contract fields`,
      Object.keys(result.request).sort().join(","),
      "access,args,connector,operation,provenance,toolId,version",
    );
  }

  check(
    "evaluation is deterministic across repeated calls",
    JSON.stringify(accepted(T.GMAIL_SEARCH_MESSAGES, { query: "from:zaigo" }).request),
    JSON.stringify(accepted(T.GMAIL_SEARCH_MESSAGES, { query: "from:zaigo" }).request),
  );
  check(
    "mutating the caller's args after acceptance cannot change the envelope",
    (() => {
      const args = { query: "from:zaigo" };
      const result = accepted(T.GMAIL_SEARCH_MESSAGES, args);
      args.query = "from:attacker";
      return result.request.args.query;
    })(),
    "from:zaigo",
  );
} catch (error) {
  failures.push(`unexpected exception\n      ${error?.stack || error}`);
}

if (failures.length) {
  console.error(`Ajoop read connector contract QA failed. ${failures.length} failure(s):`);
  failures.forEach((failure) => console.error(`\n- ${failure}`));
  process.exit(1);
}

console.log(
  `Ajoop read connector contract passed. ${passed} assertions · owner-private · Gmail/Calendar/GitHub/Drive · read-only · bounded args · derived provenance · no network, no provider credentials.`,
);
