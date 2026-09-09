/**
 * AJOOP owner-private read connector contract — policy only, no provider calls.
 *
 * A4 begins by separating current/personal external state from the public
 * portfolio surface. Gmail, Calendar, GitHub and Drive are owner tools. A
 * public request cannot upgrade itself into an owner request by supplying a
 * boolean flag; authorization belongs to the trusted owner-private boundary.
 *
 * This module deliberately performs no network access and owns no provider
 * credentials. It only validates canonical internal read requests so later
 * provider adapters can stay small and fail closed.
 */

export const AJOOP_READ_CONNECTOR_SCHEMA_VERSION = 1;

export const AJOOP_READ_CONNECTOR_SURFACES = Object.freeze({
  PUBLIC_PORTFOLIO: "public-portfolio",
  OWNER_PRIVATE: "owner-private",
});

export const AJOOP_READ_CONNECTOR_ACCESS = Object.freeze({
  READ_ONLY: "read-only",
});

export const AJOOP_READ_CONNECTOR_PROVENANCE = Object.freeze({
  CONNECTED_SOURCE: "connected-source",
});

export const AJOOP_READ_CONNECTORS = Object.freeze({
  GMAIL: "gmail",
  CALENDAR: "calendar",
  GITHUB: "github",
  DRIVE: "drive",
});

export const AJOOP_READ_CONNECTOR_TOOL_IDS = Object.freeze({
  GMAIL_SEARCH_MESSAGES: "gmail.search_messages",
  GMAIL_READ_THREAD: "gmail.read_thread",
  CALENDAR_LIST_EVENTS: "calendar.list_events",
  CALENDAR_READ_EVENT: "calendar.read_event",
  GITHUB_SEARCH_PULL_REQUESTS: "github.search_pull_requests",
  GITHUB_READ_PULL_REQUEST: "github.read_pull_request",
  DRIVE_SEARCH_FILES: "drive.search_files",
  DRIVE_READ_FILE: "drive.read_file",
});

export const AJOOP_READ_CONNECTOR_DEFAULT_LIMIT = 20;
export const AJOOP_READ_CONNECTOR_MAX_LIMIT = 100;
export const AJOOP_READ_CONNECTOR_MAX_QUERY_CHARS = 800;
export const AJOOP_READ_CONNECTOR_MAX_ID_CHARS = 240;
export const AJOOP_READ_CONNECTOR_MAX_REPOSITORY_CHARS = 160;
export const AJOOP_READ_CONNECTOR_MAX_CALENDAR_RANGE_DAYS = 93;

const DAY_MS = 24 * 60 * 60 * 1000;

const CALLER_POLICY_FIELDS = Object.freeze([
  "surface",
  "authenticatedOwner",
  "access",
  "permission",
  "provenance",
  "version",
]);

const TOOL_SPECS = Object.freeze({
  [AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES]: Object.freeze({
    connector: AJOOP_READ_CONNECTORS.GMAIL,
    operation: "search_messages",
    allowedArgs: Object.freeze(["query", "limit"]),
  }),
  [AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_READ_THREAD]: Object.freeze({
    connector: AJOOP_READ_CONNECTORS.GMAIL,
    operation: "read_thread",
    allowedArgs: Object.freeze(["threadId"]),
  }),
  [AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_LIST_EVENTS]: Object.freeze({
    connector: AJOOP_READ_CONNECTORS.CALENDAR,
    operation: "list_events",
    allowedArgs: Object.freeze(["timeMin", "timeMax", "limit"]),
  }),
  [AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_READ_EVENT]: Object.freeze({
    connector: AJOOP_READ_CONNECTORS.CALENDAR,
    operation: "read_event",
    allowedArgs: Object.freeze(["eventId"]),
  }),
  [AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_SEARCH_PULL_REQUESTS]: Object.freeze({
    connector: AJOOP_READ_CONNECTORS.GITHUB,
    operation: "search_pull_requests",
    allowedArgs: Object.freeze(["repository", "query", "state", "limit"]),
  }),
  [AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_READ_PULL_REQUEST]: Object.freeze({
    connector: AJOOP_READ_CONNECTORS.GITHUB,
    operation: "read_pull_request",
    allowedArgs: Object.freeze(["repository", "prNumber"]),
  }),
  [AJOOP_READ_CONNECTOR_TOOL_IDS.DRIVE_SEARCH_FILES]: Object.freeze({
    connector: AJOOP_READ_CONNECTORS.DRIVE,
    operation: "search_files",
    allowedArgs: Object.freeze(["query", "limit"]),
  }),
  [AJOOP_READ_CONNECTOR_TOOL_IDS.DRIVE_READ_FILE]: Object.freeze({
    connector: AJOOP_READ_CONNECTORS.DRIVE,
    operation: "read_file",
    allowedArgs: Object.freeze(["fileId"]),
  }),
});

const cleanSingleLine = (value) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const normalizeBoundedString = (value, maxChars, { required = true } = {}) => {
  if (value === undefined && !required) return Object.freeze({ ok: true, value: undefined });
  if (typeof value !== "string") return Object.freeze({ ok: false, code: "invalid-string-argument" });
  const cleaned = cleanSingleLine(value);
  if (!cleaned) return Object.freeze({ ok: false, code: "empty-string-argument" });
  if (cleaned.length > maxChars) return Object.freeze({ ok: false, code: "string-argument-too-long" });
  return Object.freeze({ ok: true, value: cleaned });
};

const normalizeLimit = (value) => {
  if (value === undefined) return Object.freeze({ ok: true, value: AJOOP_READ_CONNECTOR_DEFAULT_LIMIT });
  if (!Number.isInteger(value) || value < 1 || value > AJOOP_READ_CONNECTOR_MAX_LIMIT) {
    return Object.freeze({ ok: false, code: "invalid-limit" });
  }
  return Object.freeze({ ok: true, value });
};

const normalizeRepository = (value) => {
  const normalized = normalizeBoundedString(value, AJOOP_READ_CONNECTOR_MAX_REPOSITORY_CHARS);
  if (!normalized.ok) return normalized;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized.value)) {
    return Object.freeze({ ok: false, code: "invalid-repository" });
  }
  return normalized;
};

const normalizeId = (value) => normalizeBoundedString(value, AJOOP_READ_CONNECTOR_MAX_ID_CHARS);

const normalizeIsoInstant = (value) => {
  const normalized = normalizeBoundedString(value, 64);
  if (!normalized.ok) return normalized;
  const parsed = Date.parse(normalized.value);
  if (!Number.isFinite(parsed)) return Object.freeze({ ok: false, code: "invalid-time" });
  return Object.freeze({ ok: true, value: new Date(parsed).toISOString(), ms: parsed });
};

const hasOnlyAllowedArgs = (args, allowedArgs) =>
  Object.keys(args).every((key) => allowedArgs.includes(key));

const normalizeArgs = (toolId, args) => {
  const spec = TOOL_SPECS[toolId];
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return Object.freeze({ ok: false, code: "invalid-arguments" });
  }
  if (!hasOnlyAllowedArgs(args, spec.allowedArgs)) {
    return Object.freeze({ ok: false, code: "unexpected-argument" });
  }

  if (toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES) {
    const query = normalizeBoundedString(args.query, AJOOP_READ_CONNECTOR_MAX_QUERY_CHARS);
    if (!query.ok) return query;
    const limit = normalizeLimit(args.limit);
    if (!limit.ok) return limit;
    return Object.freeze({ ok: true, args: Object.freeze({ query: query.value, limit: limit.value }) });
  }

  if (toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_READ_THREAD) {
    const threadId = normalizeId(args.threadId);
    if (!threadId.ok) return threadId;
    return Object.freeze({ ok: true, args: Object.freeze({ threadId: threadId.value }) });
  }

  if (toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_LIST_EVENTS) {
    const timeMin = normalizeIsoInstant(args.timeMin);
    if (!timeMin.ok) return timeMin;
    const timeMax = normalizeIsoInstant(args.timeMax);
    if (!timeMax.ok) return timeMax;
    if (timeMax.ms <= timeMin.ms) return Object.freeze({ ok: false, code: "invalid-time-range" });
    if (timeMax.ms - timeMin.ms > AJOOP_READ_CONNECTOR_MAX_CALENDAR_RANGE_DAYS * DAY_MS) {
      return Object.freeze({ ok: false, code: "time-range-too-wide" });
    }
    const limit = normalizeLimit(args.limit);
    if (!limit.ok) return limit;
    return Object.freeze({
      ok: true,
      args: Object.freeze({ timeMin: timeMin.value, timeMax: timeMax.value, limit: limit.value }),
    });
  }

  if (toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_READ_EVENT) {
    const eventId = normalizeId(args.eventId);
    if (!eventId.ok) return eventId;
    return Object.freeze({ ok: true, args: Object.freeze({ eventId: eventId.value }) });
  }

  if (toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_SEARCH_PULL_REQUESTS) {
    const repository = normalizeRepository(args.repository);
    if (!repository.ok) return repository;
    const query = normalizeBoundedString(args.query, AJOOP_READ_CONNECTOR_MAX_QUERY_CHARS, { required: false });
    if (!query.ok) return query;
    const state = args.state === undefined ? "open" : args.state;
    if (!["open", "closed", "all"].includes(state)) return Object.freeze({ ok: false, code: "invalid-state" });
    const limit = normalizeLimit(args.limit);
    if (!limit.ok) return limit;
    return Object.freeze({
      ok: true,
      args: Object.freeze({
        repository: repository.value,
        ...(query.value === undefined ? {} : { query: query.value }),
        state,
        limit: limit.value,
      }),
    });
  }

  if (toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_READ_PULL_REQUEST) {
    const repository = normalizeRepository(args.repository);
    if (!repository.ok) return repository;
    if (!Number.isInteger(args.prNumber) || args.prNumber < 1 || args.prNumber > 1000000000) {
      return Object.freeze({ ok: false, code: "invalid-pr-number" });
    }
    return Object.freeze({
      ok: true,
      args: Object.freeze({ repository: repository.value, prNumber: args.prNumber }),
    });
  }

  if (toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.DRIVE_SEARCH_FILES) {
    const query = normalizeBoundedString(args.query, AJOOP_READ_CONNECTOR_MAX_QUERY_CHARS);
    if (!query.ok) return query;
    const limit = normalizeLimit(args.limit);
    if (!limit.ok) return limit;
    return Object.freeze({ ok: true, args: Object.freeze({ query: query.value, limit: limit.value }) });
  }

  if (toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.DRIVE_READ_FILE) {
    const fileId = normalizeId(args.fileId);
    if (!fileId.ok) return fileId;
    return Object.freeze({ ok: true, args: Object.freeze({ fileId: fileId.value }) });
  }

  return Object.freeze({ ok: false, code: "unknown-tool" });
};

export function canUseAjoopReadConnectors({ surface, authenticatedOwner = false } = {}) {
  return surface === AJOOP_READ_CONNECTOR_SURFACES.OWNER_PRIVATE && authenticatedOwner === true;
}

/**
 * A4.3 policy: connected reads are for current/personal external state, not a
 * replacement for deterministic facts, the portfolio corpus or conversation.
 */
export function shouldUseAjoopReadConnector({
  requiresCurrentPersonalExternalState = false,
  deterministicFactAvailable = false,
  portfolioSufficient = false,
  conversationSufficient = false,
} = {}) {
  if (deterministicFactAvailable || portfolioSufficient || conversationSufficient) return false;
  return requiresCurrentPersonalExternalState === true;
}

export function evaluateAjoopConnectorRead(request, context = {}) {
  if (!canUseAjoopReadConnectors(context)) {
    return Object.freeze({ ok: false, code: "owner-private-auth-required" });
  }

  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return Object.freeze({ ok: false, code: "invalid-request" });
  }

  if (CALLER_POLICY_FIELDS.some((field) => Object.hasOwn(request, field))) {
    return Object.freeze({ ok: false, code: "caller-policy-field-forbidden" });
  }

  const toolId = cleanSingleLine(request.toolId);
  if (!toolId || !Object.hasOwn(TOOL_SPECS, toolId)) {
    return Object.freeze({ ok: false, code: "unknown-tool" });
  }

  if (Object.keys(request).some((key) => !["toolId", "args"].includes(key))) {
    return Object.freeze({ ok: false, code: "unexpected-request-field" });
  }

  const normalized = normalizeArgs(toolId, request.args ?? {});
  if (!normalized.ok) return normalized;

  const spec = TOOL_SPECS[toolId];
  return Object.freeze({
    ok: true,
    code: "accepted",
    request: Object.freeze({
      version: AJOOP_READ_CONNECTOR_SCHEMA_VERSION,
      toolId,
      connector: spec.connector,
      operation: spec.operation,
      access: AJOOP_READ_CONNECTOR_ACCESS.READ_ONLY,
      provenance: AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE,
      args: normalized.args,
    }),
  });
}

export function listAjoopReadConnectorToolIds() {
  return Object.freeze(Object.keys(TOOL_SPECS));
}
