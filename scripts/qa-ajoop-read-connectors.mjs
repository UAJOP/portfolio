#!/usr/bin/env node
import {
  AJOOP_READ_CONNECTOR_ACCESS,
  AJOOP_READ_CONNECTOR_DEFAULT_LIMIT,
  AJOOP_READ_CONNECTOR_MAX_LIMIT,
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

const PUBLIC = Object.freeze({
  surface: AJOOP_READ_CONNECTOR_SURFACES.PUBLIC_PORTFOLIO,
  authenticatedOwner: true,
});

const accepted = (toolId, args) => evaluateAjoopConnectorRead({ toolId, args }, OWNER);

try {
  const toolIds = listAjoopReadConnectorToolIds();
  check("registry exposes eight bounded read tools", toolIds.length, 8);
  check("registry ids are unique", new Set(toolIds).size, 8);
  ok("registry result is frozen", Object.isFrozen(toolIds));
  check("send email is not a read tool", toolIds.includes("gmail.send_email"), false);
  check("delete event is not a read tool", toolIds.includes("calendar.delete_event"), false);

  check("owner-private authenticated surface may read", canUseAjoopReadConnectors(OWNER), true);
  check("public surface can never become owner by boolean claim", canUseAjoopReadConnectors(PUBLIC), false);
  check(
    "owner-private still requires authentication",
    canUseAjoopReadConnectors({ surface: AJOOP_READ_CONNECTOR_SURFACES.OWNER_PRIVATE, authenticatedOwner: false }),
    false,
  );

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
  check("non-current questions do not select connectors", shouldUseAjoopReadConnector({}), false);

  check(
    "public request is rejected before connector execution",
    evaluateAjoopConnectorRead(
      { toolId: AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES, args: { query: "from:zaigo" } },
      PUBLIC,
    ).code,
    "owner-private-auth-required",
  );
  check(
    "unauthenticated owner request is rejected",
    evaluateAjoopConnectorRead(
      { toolId: AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES, args: { query: "from:zaigo" } },
      { surface: AJOOP_READ_CONNECTOR_SURFACES.OWNER_PRIVATE, authenticatedOwner: false },
    ).code,
    "owner-private-auth-required",
  );

  check("null request fails closed", evaluateAjoopConnectorRead(null, OWNER).code, "invalid-request");
  check("array request fails closed", evaluateAjoopConnectorRead([], OWNER).code, "invalid-request");
  check(
    "caller cannot self-assert access",
    evaluateAjoopConnectorRead(
      {
        toolId: AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES,
        args: { query: "from:zaigo" },
        access: "write",
      },
      OWNER,
    ).code,
    "caller-policy-field-forbidden",
  );
  check(
    "caller cannot self-assert provenance",
    evaluateAjoopConnectorRead(
      {
        toolId: AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES,
        args: { query: "from:zaigo" },
        provenance: "canonical",
      },
      OWNER,
    ).code,
    "caller-policy-field-forbidden",
  );
  check(
    "unknown write-shaped tool is rejected",
    evaluateAjoopConnectorRead({ toolId: "gmail.send_email", args: { to: "x@example.com" } }, OWNER).code,
    "unknown-tool",
  );
  check(
    "unexpected request envelope fields are rejected",
    evaluateAjoopConnectorRead(
      { toolId: AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES, args: { query: "x" }, retry: 99 },
      OWNER,
    ).code,
    "unexpected-request-field",
  );

  const gmailSearch = accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES, {
    query: "  from:zaigo   newer_than:30d  ",
  });
  check("gmail search accepted", gmailSearch.code, "accepted");
  check("gmail search connector", gmailSearch.request.connector, "gmail");
  check("gmail search operation", gmailSearch.request.operation, "search_messages");
  check("gmail query whitespace normalized", gmailSearch.request.args.query, "from:zaigo newer_than:30d");
  check("gmail default result limit", gmailSearch.request.args.limit, AJOOP_READ_CONNECTOR_DEFAULT_LIMIT);
  check("connector schema version derived by policy", gmailSearch.request.version, AJOOP_READ_CONNECTOR_SCHEMA_VERSION);
  check("connector access is derived read-only", gmailSearch.request.access, AJOOP_READ_CONNECTOR_ACCESS.READ_ONLY);
  check(
    "connector provenance is derived connected-source",
    gmailSearch.request.provenance,
    AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE,
  );
  ok("accepted connector envelope is frozen", Object.isFrozen(gmailSearch.request));
  ok("accepted connector args are frozen", Object.isFrozen(gmailSearch.request.args));

  check(
    "gmail query required",
    accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES, {}).code,
    "invalid-string-argument",
  );
  check(
    "gmail result limit is bounded",
    accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES, { query: "x", limit: AJOOP_READ_CONNECTOR_MAX_LIMIT + 1 }).code,
    "invalid-limit",
  );
  check(
    "gmail search rejects write-like extra argument",
    accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES, { query: "x", send: true }).code,
    "unexpected-argument",
  );

  const gmailThread = accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_READ_THREAD, { threadId: " thread-123 " });
  check("gmail thread read accepted", gmailThread.code, "accepted");
  check("gmail thread id normalized", gmailThread.request.args.threadId, "thread-123");

  const calendar = accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_LIST_EVENTS, {
    timeMin: "2026-09-10T00:00:00+03:00",
    timeMax: "2026-09-17T00:00:00+03:00",
    limit: 30,
  });
  check("calendar range accepted", calendar.code, "accepted");
  check("calendar range connector", calendar.request.connector, "calendar");
  check("calendar lower instant canonicalized", calendar.request.args.timeMin, "2026-09-09T21:00:00.000Z");
  check("calendar upper instant canonicalized", calendar.request.args.timeMax, "2026-09-16T21:00:00.000Z");
  check("calendar explicit limit preserved", calendar.request.args.limit, 30);
  check(
    "calendar rejects reverse range",
    accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_LIST_EVENTS, {
      timeMin: "2026-09-17T00:00:00Z",
      timeMax: "2026-09-10T00:00:00Z",
    }).code,
    "invalid-time-range",
  );
  check(
    "calendar rejects unboundedly wide range",
    accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_LIST_EVENTS, {
      timeMin: "2026-01-01T00:00:00Z",
      timeMax: "2026-12-31T00:00:00Z",
    }).code,
    "time-range-too-wide",
  );
  check(
    "calendar rejects malformed time",
    accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_LIST_EVENTS, {
      timeMin: "tomorrow-ish",
      timeMax: "2026-09-17T00:00:00Z",
    }).code,
    "invalid-time",
  );

  const calendarEvent = accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_READ_EVENT, { eventId: " event_abc " });
  check("calendar event accepted", calendarEvent.code, "accepted");
  check("calendar event id normalized", calendarEvent.request.args.eventId, "event_abc");

  const githubSearch = accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_SEARCH_PULL_REQUESTS, {
    repository: "UAJOP/portfolio",
    query: " ajoop   memory ",
  });
  check("github PR search accepted", githubSearch.code, "accepted");
  check("github PR repository preserved", githubSearch.request.args.repository, "UAJOP/portfolio");
  check("github optional query normalized", githubSearch.request.args.query, "ajoop memory");
  check("github search defaults to open PRs", githubSearch.request.args.state, "open");
  check(
    "github repository must be owner/name",
    accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_SEARCH_PULL_REQUESTS, { repository: "portfolio" }).code,
    "invalid-repository",
  );
  check(
    "github PR state is bounded",
    accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_SEARCH_PULL_REQUESTS, {
      repository: "UAJOP/portfolio",
      state: "merged",
    }).code,
    "invalid-state",
  );

  const githubPr = accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_READ_PULL_REQUEST, {
    repository: "UAJOP/sinama",
    prNumber: 73,
  });
  check("github PR read accepted", githubPr.code, "accepted");
  check("github PR number preserved", githubPr.request.args.prNumber, 73);
  check(
    "github PR number must be positive integer",
    accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_READ_PULL_REQUEST, {
      repository: "UAJOP/sinama",
      prNumber: 0,
    }).code,
    "invalid-pr-number",
  );

  const driveSearch = accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.DRIVE_SEARCH_FILES, {
    query: "  CV Kaan Balci  ",
    limit: 5,
  });
  check("drive search accepted", driveSearch.code, "accepted");
  check("drive search connector", driveSearch.request.connector, "drive");
  check("drive query normalized", driveSearch.request.args.query, "CV Kaan Balci");
  check("drive limit preserved", driveSearch.request.args.limit, 5);

  const driveRead = accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.DRIVE_READ_FILE, { fileId: " file-xyz " });
  check("drive file read accepted", driveRead.code, "accepted");
  check("drive file id normalized", driveRead.request.args.fileId, "file-xyz");

  check(
    "read thread rejects unrelated arguments",
    accepted(AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_READ_THREAD, { threadId: "x", body: "mutate" }).code,
    "unexpected-argument",
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
  `Ajoop read connector contract passed. ${passed} assertions · owner-private · Gmail/Calendar/GitHub/Drive · read-only · bounded args · no network · no provider credentials.`,
);
