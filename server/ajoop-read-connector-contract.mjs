/**
 * AJOOP owner-private read connector contract — policy only, no provider calls.
 *
 * A4 begins by separating current/personal external state from the public
 * portfolio surface. Gmail, Calendar, GitHub and Drive are owner tools. A
 * public request cannot upgrade itself into an owner request by supplying a
 * boolean flag; authorization belongs to the trusted owner-private boundary.
 *
 * V1 rules:
 * - connector reads require an authenticated owner-private surface;
 * - only the declared read tool ids exist, and there is no write or passthrough tool;
 * - every tool has an explicit argument allowlist and explicit bounds;
 * - policy fields (version/access/provenance/connector) are derived here, never supplied;
 * - caller input is rejected rather than silently repaired;
 * - connected results are current external state, never canonical portfolio truth.
 *
 * This module deliberately has no filesystem, database, network, model or
 * environment access. It only decides whether a runtime surface may use
 * connectors at all, whether a connector read is the right retrieval path, and
 * whether one proposed internal read request satisfies the contract.
 *
 * Provider content is untrusted data for every later phase. Nothing here grants
 * connected material any authority, and nothing here persists it.
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

export const AJOOP_READ_CONNECTOR_PR_STATES = Object.freeze(["open", "closed", "all"]);
export const AJOOP_READ_CONNECTOR_DEFAULT_PR_STATE = "open";

export const AJOOP_READ_CONNECTOR_DEFAULT_LIMIT = 20;
export const AJOOP_READ_CONNECTOR_MAX_LIMIT = 100;
export const AJOOP_READ_CONNECTOR_MAX_QUERY_CHARS = 800;
export const AJOOP_READ_CONNECTOR_MAX_ID_CHARS = 240;
export const AJOOP_READ_CONNECTOR_MAX_REPOSITORY_CHARS = 160;
export const AJOOP_READ_CONNECTOR_MAX_TIMESTAMP_CHARS = 40;
export const AJOOP_READ_CONNECTOR_MAX_CALENDAR_RANGE_DAYS = 93;
export const AJOOP_READ_CONNECTOR_MAX_PR_NUMBER = 1000000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * These fields are policy decisions, not caller input. Rejecting them rather
 * than ignoring them makes an accidental HTTP-body spread fail closed, and it
 * keeps the reason distinguishable from an ordinary typo in the envelope.
 */
const CALLER_POLICY_FIELDS = Object.freeze([
  "surface",
  "authenticatedOwner",
  "access",
  "permission",
  "provenance",
  "version",
  "authority",
  "connector",
  "operation",
]);

const REQUEST_FIELDS = Object.freeze(["toolId", "args"]);

/**
 * Control characters, bidi overrides and zero-width marks never carry meaning
 * in a provider query or identifier, but they do corrupt logs, terminals and
 * later URL construction. They are rejected rather than stripped so a caller
 * never silently gets a different search than it asked for.
 */
const UNSAFE_TEXT = /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF]/;

/** Identifier shapes actually issued by Gmail, Calendar and Drive. */
const SAFE_IDENTIFIER = /^[A-Za-z0-9._~+=@-]+$/;

/** GitHub logins allow single internal hyphens; repositories allow dot and underscore. */
const GITHUB_OWNER = /^[A-Za-z0-9](?:-?[A-Za-z0-9])*$/;
const GITHUB_REPOSITORY_NAME = /^[A-Za-z0-9._-]+$/;
const GITHUB_MAX_OWNER_CHARS = 39;
const GITHUB_MAX_REPOSITORY_NAME_CHARS = 100;

/**
 * Calendar bounds must be unambiguous instants. A datetime without an explicit
 * UTC designator or numeric offset is resolved against the host clock's local
 * timezone, which would make the normalized envelope depend on which machine
 * validated it, so the offset is mandatory.
 */
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-]\d{2}:\d{2})$/;

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

const reject = (code) => Object.freeze({ ok: false, code });
const accept = (value) => Object.freeze({ ok: true, value });

/**
 * Caller payloads arrive as parsed JSON, which always carries Object.prototype.
 * Requiring that exact shape means an allowlist built from own keys cannot be
 * sidestepped by hiding arguments on a prototype.
 */
const isPlainObject = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
};

/** Read a data property without consulting a prototype or invoking an accessor. */
const ownDataProperty = (source, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (!descriptor) return { present: false, data: false, value: undefined };
  if (!Object.hasOwn(descriptor, "value")) return { present: true, data: false, value: undefined };
  return { present: true, data: true, value: descriptor.value };
};

const normalizeBoundedText = (value, maxChars) => {
  if (typeof value !== "string") return reject("invalid-string-argument");
  if (UNSAFE_TEXT.test(value)) return reject("unsafe-string-argument");
  // Trimming the edges is harmless; collapsing interior runs is not, because a
  // quoted provider phrase would silently become a different search.
  const trimmed = value.trim();
  if (!trimmed) return reject("empty-string-argument");
  if (trimmed.length > maxChars) return reject("string-argument-too-long");
  return accept(trimmed);
};

const normalizeIdentifier = (value) => {
  const text = normalizeBoundedText(value, AJOOP_READ_CONNECTOR_MAX_ID_CHARS);
  if (!text.ok) return text;
  if (!SAFE_IDENTIFIER.test(text.value)) return reject("invalid-identifier");
  if (text.value === "." || text.value === "..") return reject("invalid-identifier");
  return text;
};

const normalizeLimit = (value) => {
  if (!Number.isInteger(value) || value < 1 || value > AJOOP_READ_CONNECTOR_MAX_LIMIT) {
    return reject("invalid-limit");
  }
  return accept(value);
};

const normalizeRepository = (value) => {
  const text = normalizeBoundedText(value, AJOOP_READ_CONNECTOR_MAX_REPOSITORY_CHARS);
  if (!text.ok) return text;
  const segments = text.value.split("/");
  if (segments.length !== 2) return reject("invalid-repository");
  const [owner, name] = segments;
  if (!owner || owner.length > GITHUB_MAX_OWNER_CHARS || !GITHUB_OWNER.test(owner)) {
    return reject("invalid-repository");
  }
  if (!name || name.length > GITHUB_MAX_REPOSITORY_NAME_CHARS || !GITHUB_REPOSITORY_NAME.test(name)) {
    return reject("invalid-repository");
  }
  // "." and ".." are legal characters but illegal repositories, and they are the
  // shapes that turn a later path join into traversal.
  if (name === "." || name === "..") return reject("invalid-repository");
  return text;
};

const daysInUtcMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Date.parse is deliberately not the gate. It accepts date-only strings, legacy
 * non-ISO formats and overflowing calendar days such as 2026-02-30, which it
 * silently rolls forward into March.
 */
const normalizeIsoInstant = (value) => {
  const text = normalizeBoundedText(value, AJOOP_READ_CONNECTOR_MAX_TIMESTAMP_CHARS);
  if (!text.ok) return text;
  const match = ISO_INSTANT.exec(text.value);
  if (!match) return reject("invalid-time");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return reject("invalid-time");
  if (day < 1 || day > daysInUtcMonth(year, month)) return reject("invalid-time");

  const ms = Date.parse(text.value);
  if (!Number.isFinite(ms)) return reject("invalid-time");
  return Object.freeze({ ok: true, value: new Date(ms).toISOString(), ms });
};

const normalizeArgs = (spec, args) => {
  const keys = Object.keys(args);
  if (keys.some((key) => !spec.allowedArgs.includes(key))) return reject("unexpected-argument");

  // Snapshot own data properties only. Required values cannot be inherited,
  // and accessors are rejected without executing them.
  const values = Object.create(null);
  for (const key of keys) {
    const property = ownDataProperty(args, key);
    if (!property.data || property.value === undefined) return reject("invalid-argument-value");
    values[key] = property.value;
  }

  const has = (key) => Object.hasOwn(values, key);
  const value = (key) => (has(key) ? values[key] : undefined);

  const withLimit = (base) => {
    if (!has("limit")) {
      return accept(Object.freeze({ ...base, limit: AJOOP_READ_CONNECTOR_DEFAULT_LIMIT }));
    }
    const limit = normalizeLimit(value("limit"));
    if (!limit.ok) return limit;
    return accept(Object.freeze({ ...base, limit: limit.value }));
  };

  switch (spec.operation) {
    case "search_messages":
    case "search_files": {
      const query = normalizeBoundedText(value("query"), AJOOP_READ_CONNECTOR_MAX_QUERY_CHARS);
      if (!query.ok) return query;
      return withLimit({ query: query.value });
    }

    case "read_thread": {
      const threadId = normalizeIdentifier(value("threadId"));
      if (!threadId.ok) return threadId;
      return accept(Object.freeze({ threadId: threadId.value }));
    }

    case "read_file": {
      const fileId = normalizeIdentifier(value("fileId"));
      if (!fileId.ok) return fileId;
      return accept(Object.freeze({ fileId: fileId.value }));
    }

    case "list_events": {
      const timeMin = normalizeIsoInstant(value("timeMin"));
      if (!timeMin.ok) return timeMin;
      const timeMax = normalizeIsoInstant(value("timeMax"));
      if (!timeMax.ok) return timeMax;
      if (timeMax.ms <= timeMin.ms) return reject("invalid-time-range");
      if (timeMax.ms - timeMin.ms > AJOOP_READ_CONNECTOR_MAX_CALENDAR_RANGE_DAYS * DAY_MS) {
        return reject("time-range-too-wide");
      }
      return withLimit({ timeMin: timeMin.value, timeMax: timeMax.value });
    }

    case "read_event": {
      const eventId = normalizeIdentifier(value("eventId"));
      if (!eventId.ok) return eventId;
      return accept(Object.freeze({ eventId: eventId.value }));
    }

    case "search_pull_requests": {
      const repository = normalizeRepository(value("repository"));
      if (!repository.ok) return repository;

      const base = Object.assign(Object.create(null), { repository: repository.value });
      if (has("query")) {
        const query = normalizeBoundedText(value("query"), AJOOP_READ_CONNECTOR_MAX_QUERY_CHARS);
        if (!query.ok) return query;
        base.query = query.value;
      }

      const state = has("state") ? value("state") : AJOOP_READ_CONNECTOR_DEFAULT_PR_STATE;
      if (!AJOOP_READ_CONNECTOR_PR_STATES.includes(state)) return reject("invalid-state");
      base.state = state;

      return withLimit(base);
    }

    case "read_pull_request": {
      const repository = normalizeRepository(value("repository"));
      if (!repository.ok) return repository;
      const prNumber = value("prNumber");
      if (!Number.isInteger(prNumber) || prNumber < 1 || prNumber > AJOOP_READ_CONNECTOR_MAX_PR_NUMBER) {
        return reject("invalid-pr-number");
      }
      return accept(Object.freeze({ repository: repository.value, prNumber }));
    }

    default:
      return reject("unknown-tool");
  }
};

/**
 * The public portfolio route is never a connector surface, even if a caller
 * claims to be the owner. Authentication belongs at the owner-private boundary;
 * it is not a flag that can upgrade a public route into a private one.
 */
export function canUseAjoopReadConnectors(context) {
  if (context === null || typeof context !== "object" || Array.isArray(context)) return false;
  try {
    const surface = ownDataProperty(context, "surface");
    const authenticatedOwner = ownDataProperty(context, "authenticatedOwner");
    return (
      surface.data &&
      surface.value === AJOOP_READ_CONNECTOR_SURFACES.OWNER_PRIVATE &&
      authenticatedOwner.data &&
      authenticatedOwner.value === true
    );
  } catch {
    return false;
  }
}

/**
 * Routing policy, kept separate from the authorization gate above: being allowed
 * to read a connector is not a reason to. Connected reads answer current,
 * personal, external state. Anything already answerable from a deterministic
 * fact, the curated portfolio corpus or the live conversation is answered there,
 * so connectors never become the default retrieval path.
 *
 * Every suppressor is evaluated before the trigger, so an ambiguous signal
 * suppresses the connector rather than reaching for one.
 */
export function shouldUseAjoopReadConnector(policy = {}) {
  if (!isPlainObject(policy)) return false;
  try {
    const trigger = ownDataProperty(policy, "requiresCurrentPersonalExternalState");
    const suppressors = ["deterministicFactAvailable", "portfolioSufficient", "conversationSufficient"];
    if (suppressors.some((key) => {
      const property = ownDataProperty(policy, key);
      return property.data && property.value === true;
    })) return false;
    return trigger.data && trigger.value === true;
  } catch {
    return false;
  }
}

/**
 * Validate and normalize one proposed internal connector read.
 *
 * Authorization is checked before the payload is inspected, so a public caller
 * learns nothing about the argument surface. Version, connector, operation,
 * access and provenance are derived from the trusted registry, never from the
 * request: a caller must not be able to self-assert "read-only" or to relabel a
 * connected result as canonical portfolio truth.
 */
export function evaluateAjoopConnectorRead(request, context) {
  try {
    if (!canUseAjoopReadConnectors(context)) return reject("owner-private-auth-required");
    if (!isPlainObject(request)) return reject("invalid-request");

    if (CALLER_POLICY_FIELDS.some((field) => Object.hasOwn(request, field))) {
      return reject("caller-policy-field-forbidden");
    }
    if (Object.keys(request).some((key) => !REQUEST_FIELDS.includes(key))) {
      return reject("unexpected-request-field");
    }

    // Tool ids are exact own data properties, not inherited or normalized text.
    const tool = ownDataProperty(request, "toolId");
    if (!tool.present) return reject("unknown-tool");
    if (!tool.data) return reject("invalid-request");
    const toolId = tool.value;
    if (typeof toolId !== "string" || !Object.hasOwn(TOOL_SPECS, toolId)) {
      return reject("unknown-tool");
    }

    const argsProperty = ownDataProperty(request, "args");
    if (argsProperty.present && !argsProperty.data) return reject("invalid-arguments");
    const args = argsProperty.present ? argsProperty.value : {};
    if (!isPlainObject(args)) return reject("invalid-arguments");

    const spec = TOOL_SPECS[toolId];
    const normalized = normalizeArgs(spec, args);
    if (!normalized.ok) return normalized;

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
        args: normalized.value,
      }),
    });
  } catch {
    return reject("invalid-request");
  }
}

export function listAjoopReadConnectorToolIds() {
  return Object.freeze(Object.keys(TOOL_SPECS));
}
