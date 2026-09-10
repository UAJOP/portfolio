/**
 * AJOOP A4.4-A4.6 owner-private action contract.
 *
 * Permission tiers come only from the frozen registry below. No model,
 * connected source, memory record or caller field can choose or downgrade a
 * tier, a confirmation strength or execution support: any such field in a
 * request is rejected.
 *
 * A4 V1 deliberately contains NO external executor. Tier 0 reads run through
 * the A4.1 read adapters elsewhere. Tier 1 actions produce local previews
 * only. Tier 2 execution is not enabled and Tier 3 execution is denied, even
 * with a valid confirmation. This module imports no network, provider or
 * filesystem API, so no code path here can mutate an external system.
 *
 * Action intent must come from the owner's current request: a branded intent
 * is minted only from the owner's question text through the deterministic
 * classifier. Confirmations are branded and bound to the exact action type,
 * target and arguments; any change, staleness or weaker strength invalidates
 * them.
 */
import { createHash } from "node:crypto";
import { AJOOP_READ_CONNECTOR_TOOL_IDS, evaluateAjoopConnectorRead } from "./ajoop-read-connector-contract.mjs";
import {
  AJOOP_OWNER_UNSAFE_LINE_TEXT,
  AJOOP_OWNER_UNSAFE_MULTILINE_TEXT,
  isAjoopOwnerPrivateContext,
} from "./ajoop-owner-context.mjs";
import { AJOOP_OWNER_MAX_QUESTION_CHARS, classifyAjoopOwnerAction } from "./ajoop-owner-tool-policy.mjs";

export const AJOOP_ACTION_SCHEMA_VERSION = 1;
export const AJOOP_ACTION_PROVENANCE = "owner-request";

export const AJOOP_ACTION_TIERS = Object.freeze({
  READ_ONLY: 0,
  PREPARE: 1,
  REVERSIBLE_WRITE: 2,
  CONSEQUENTIAL: 3,
});

export const AJOOP_CONFIRMATION_STRENGTHS = Object.freeze({
  NONE: "none",
  STANDARD: "standard",
  STRONG: "strong",
});

export const AJOOP_ACTION_LIMITS = Object.freeze({
  EMAIL_MAX_RECIPIENTS: 10,
  EMAIL_MAX_ADDRESS_CHARS: 254,
  EMAIL_MAX_SUBJECT_CHARS: 500,
  EMAIL_MAX_BODY_CHARS: 20000,
  CALENDAR_MAX_TITLE_CHARS: 500,
  CALENDAR_MAX_LOCATION_CHARS: 1000,
  CALENDAR_MAX_ATTENDEES: 20,
  CALENDAR_MAX_DURATION_DAYS: 14,
  GITHUB_ISSUE_MAX_TITLE_CHARS: 500,
  GITHUB_ISSUE_MAX_BODY_CHARS: 12000,
  PREVIEW_EXCERPT_CHARS: 500,
  MAX_PREPARED_ACTION_CHARS: 64000,
  MAX_EXECUTION_REQUEST_CHARS: 64000,
  CONFIRMATION_MAX_AGE_MS: 120000,
});

const freeze = (value) => Object.freeze(value);
const TIERS = AJOOP_ACTION_TIERS;
const STRENGTHS = AJOOP_CONFIRMATION_STRENGTHS;
const LIMITS = AJOOP_ACTION_LIMITS;
const READ_TOOL_IDS = Object.values(AJOOP_READ_CONNECTOR_TOOL_IDS);
const STRENGTH_BY_TIER = [STRENGTHS.NONE, STRENGTHS.NONE, STRENGTHS.STANDARD, STRENGTHS.STRONG];
const STRENGTH_RANK = { [STRENGTHS.NONE]: 0, [STRENGTHS.STANDARD]: 1, [STRENGTHS.STRONG]: 2 };

const entry = (tier, connector, preparedAlternative = null) => freeze({ tier, connector, preparedAlternative });

const REGISTRY = freeze({
  ...Object.fromEntries(READ_TOOL_IDS.map((toolId) => [toolId, entry(TIERS.READ_ONLY, toolId.split(".")[0])])),
  "email.prepare_draft": entry(TIERS.PREPARE, "gmail"),
  "calendar.prepare_event": entry(TIERS.PREPARE, "calendar"),
  "github.prepare_issue": entry(TIERS.PREPARE, "github"),
  "gmail.create_draft": entry(TIERS.REVERSIBLE_WRITE, "gmail", "email.prepare_draft"),
  "calendar.create_event": entry(TIERS.REVERSIBLE_WRITE, "calendar", "calendar.prepare_event"),
  "calendar.update_event": entry(TIERS.REVERSIBLE_WRITE, "calendar"),
  "github.create_issue": entry(TIERS.REVERSIBLE_WRITE, "github", "github.prepare_issue"),
  "github.add_label": entry(TIERS.REVERSIBLE_WRITE, "github"),
  "email.send": entry(TIERS.CONSEQUENTIAL, "gmail", "email.prepare_draft"),
  "gmail.delete_message": entry(TIERS.CONSEQUENTIAL, "gmail"),
  "calendar.delete_event": entry(TIERS.CONSEQUENTIAL, "calendar"),
  "github.merge_pull_request": entry(TIERS.CONSEQUENTIAL, "github"),
  "github.comment_pull_request": entry(TIERS.CONSEQUENTIAL, "github"),
  "drive.delete_file": entry(TIERS.CONSEQUENTIAL, "drive"),
  "drive.update_file": entry(TIERS.CONSEQUENTIAL, "drive"),
  "drive.share_file": entry(TIERS.CONSEQUENTIAL, "drive"),
});

const CALLER_POLICY_FIELDS = freeze([
  "tier", "requiresConfirmation", "confirmationStrength", "executionSupported", "preparationSupported", "externalEffect",
  "provenance", "origin", "actionId", "fingerprint", "status", "preview", "authorized", "confirmed", "approved", "version",
]);

const ACCESS_DENIED = freeze({ ok: false, code: "owner-private-auth-required" });
const fail = (code, extra = {}) => freeze({ ok: false, code, ...extra });

/* ------------------------------------------------------------------ registry */

/** Deterministic policy for one action type, or null when the type is unknown. */
export function getAjoopActionPolicy(actionType) {
  if (typeof actionType !== "string" || !Object.hasOwn(REGISTRY, actionType)) return null;
  const { tier, connector, preparedAlternative } = REGISTRY[actionType];
  return freeze({
    actionType,
    tier,
    connector,
    requiresConfirmation: tier >= TIERS.REVERSIBLE_WRITE,
    confirmationStrength: STRENGTH_BY_TIER[tier],
    executionSupported: tier === TIERS.READ_ONLY,
    preparationSupported: tier === TIERS.PREPARE,
    externalEffect: tier === TIERS.READ_ONLY ? "read-only" : tier === TIERS.PREPARE ? "none" : "external-write",
    preparedAlternative,
  });
}

export function listAjoopActionTypes() {
  return freeze(Object.keys(REGISTRY));
}

/* ------------------------------------------------------------------ helpers */

const isPlainObject = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
};

const isPlainArray = (value) => {
  try {
    return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype;
  } catch {
    return false;
  }
};

const ownData = (source, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) return { present: Boolean(descriptor), valid: false };
  return { present: true, valid: descriptor.value !== undefined, value: descriptor.value };
};

const hasCallerPolicyField = (source) => Reflect.ownKeys(source).some((key) => typeof key === "string" && CALLER_POLICY_FIELDS.includes(key));

/** Snapshot own enumerable data properties against an allowlist without running accessors. */
const snapshot = (source, allowed) => {
  const values = Object.create(null);
  for (const key of Reflect.ownKeys(source)) {
    if (typeof key !== "string" || !allowed.includes(key)) return { error: "unexpected-argument", field: String(key) };
    const property = ownData(source, key);
    if (!property.valid) return { error: "invalid-action-arguments", field: key };
    values[key] = property.value;
  }
  return { values };
};

const digest = (text) => createHash("sha256").update(text, "utf8").digest("hex");

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

/** Copy a JSON-safe value (plain objects, arrays, strings, finite numbers, booleans, null) with bounds. */
const copyJsonSafe = (value, depth = 0) => {
  if (depth > 6) throw new Error("action-value-too-deep");
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("action-value-invalid");
    return value;
  }
  if (isPlainArray(value)) {
    if (value.length > 100) throw new Error("action-value-too-large");
    return Array.from({ length: value.length }, (_, index) => {
      const property = ownData(value, String(index));
      if (!property.valid) throw new Error("action-value-invalid");
      return copyJsonSafe(property.value, depth + 1);
    });
  }
  if (isPlainObject(value)) {
    const copy = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new Error("action-value-invalid");
      const property = ownData(value, key);
      if (!property.valid) throw new Error("action-value-invalid");
      copy[key] = copyJsonSafe(property.value, depth + 1);
    }
    return copy;
  }
  throw new Error("action-value-invalid");
};

const truncateUtf16Safely = (text, maxChars) => {
  let value = text.slice(0, maxChars);
  if (value && /[\uD800-\uDBFF]/.test(value.at(-1))) value = value.slice(0, -1);
  return value;
};

const isSingleLine = (value, maxChars) => (
  typeof value === "string" && value.length > 0 && value.length <= maxChars && value.trim() === value && !AJOOP_OWNER_UNSAFE_LINE_TEXT.test(value)
);

const isMultiLine = (value, maxChars, { allowEmpty = false } = {}) => (
  typeof value === "string" && value.length <= maxChars && (allowEmpty || value.trim().length > 0) && !AJOOP_OWNER_UNSAFE_MULTILINE_TEXT.test(value)
);

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const isEmailAddress = (value) => (
  typeof value === "string" && value.length <= LIMITS.EMAIL_MAX_ADDRESS_CHARS && EMAIL.test(value) && !/^\.|\.\.|\.@/.test(value)
);

/** Validate a bounded list of unique email addresses; returns the copied list or an error code. */
const readEmailList = (value, { min, max }) => {
  if (!isPlainArray(value)) return { error: "invalid-action-arguments" };
  if (value.length < min || value.length > max) return { error: "recipient-bound-exceeded" };
  const list = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const property = ownData(value, String(index));
    if (!property.valid || !isEmailAddress(property.value)) return { error: "invalid-recipient" };
    const key = property.value.toLowerCase();
    if (seen.has(key)) return { error: "duplicate-recipient" };
    seen.add(key);
    list.push(property.value);
  }
  return { list };
};

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-](\d{2}):(\d{2}))$/;
const parseInstant = (value) => {
  if (typeof value !== "string" || value.length > 40) return null;
  const match = RFC3339.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const second = Number(match[6] ?? 0);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (match[8] !== "Z" && (Number(match[9]) > 23 || Number(match[10]) > 59)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
};

const isTimeZone = (value) => {
  if (typeof value !== "string" || !value || value.length > 64 || AJOOP_OWNER_UNSAFE_LINE_TEXT.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const localDisplay = (milliseconds, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(milliseconds));
  const read = (type) => parts.find((part) => part.type === type)?.value;
  return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")}`;
};

const missingRequired = (values, required) => required.filter((key) => !Object.hasOwn(values, key));

/* ------------------------------------------------------------------ tier 1 preparers */

const prepareEmailDraft = (values) => {
  const missing = missingRequired(values, ["to", "subject", "body"]);
  if (missing.length) return fail("needs-clarification", { missing: freeze(missing) });
  const recipients = readEmailList(values.to, { min: 1, max: LIMITS.EMAIL_MAX_RECIPIENTS });
  if (recipients.error) return fail(recipients.error, { field: "to" });
  if (!isSingleLine(values.subject, LIMITS.EMAIL_MAX_SUBJECT_CHARS)) return fail("invalid-action-arguments", { field: "subject" });
  if (!isMultiLine(values.body, LIMITS.EMAIL_MAX_BODY_CHARS)) return fail("invalid-action-arguments", { field: "body" });
  return {
    ok: true,
    target: { kind: "email-recipients", to: recipients.list },
    arguments: { to: recipients.list, subject: values.subject, body: values.body },
    preview: {
      kind: "email-draft",
      to: recipients.list,
      subject: values.subject,
      bodyExcerpt: truncateUtf16Safely(values.body, LIMITS.PREVIEW_EXCERPT_CHARS),
      bodyChars: values.body.length,
      hiddenRecipients: 0,
      attachments: 0,
      sendsEmail: false,
    },
  };
};

const prepareCalendarEvent = (values) => {
  const missing = missingRequired(values, ["title", "start", "end"]);
  if (missing.length) return fail("needs-clarification", { missing: freeze(missing) });
  if (!isSingleLine(values.title, LIMITS.CALENDAR_MAX_TITLE_CHARS)) return fail("invalid-action-arguments", { field: "title" });
  const start = parseInstant(values.start);
  if (start === null) return fail("invalid-action-arguments", { field: "start" });
  const end = parseInstant(values.end);
  if (end === null) return fail("invalid-action-arguments", { field: "end" });
  if (end <= start) return fail("invalid-time-range", { field: "end" });
  if (end - start > LIMITS.CALENDAR_MAX_DURATION_DAYS * 24 * 60 * 60 * 1000) return fail("invalid-time-range", { field: "end" });
  const timeZone = Object.hasOwn(values, "timeZone") ? values.timeZone : null;
  if (timeZone !== null && !isTimeZone(timeZone)) return fail("invalid-action-arguments", { field: "timeZone" });
  const location = Object.hasOwn(values, "location") ? values.location : null;
  if (location !== null && !isSingleLine(location, LIMITS.CALENDAR_MAX_LOCATION_CHARS)) return fail("invalid-action-arguments", { field: "location" });
  let attendees = [];
  if (Object.hasOwn(values, "attendees")) {
    const parsed = readEmailList(values.attendees, { min: 0, max: LIMITS.CALENDAR_MAX_ATTENDEES });
    if (parsed.error) return fail(parsed.error, { field: "attendees" });
    attendees = parsed.list;
  }
  const startUtc = new Date(start).toISOString();
  const endUtc = new Date(end).toISOString();
  return {
    ok: true,
    target: { kind: "calendar", calendar: "primary" },
    arguments: { title: values.title, start: startUtc, end: endUtc, timeZone, location, attendees },
    preview: {
      kind: "calendar-event",
      title: values.title,
      startUtc,
      endUtc,
      timeZone,
      localStart: timeZone ? localDisplay(start, timeZone) : null,
      localEnd: timeZone ? localDisplay(end, timeZone) : null,
      location,
      attendees,
      recurrence: "none",
      createsEvent: false,
    },
  };
};

const prepareGitHubIssue = (values, context) => {
  const missing = missingRequired(values, ["repository", "title", "body"]);
  if (missing.length) return fail("needs-clarification", { missing: freeze(missing) });
  const repository = evaluateAjoopConnectorRead(
    { toolId: AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_SEARCH_PULL_REQUESTS, args: { repository: values.repository, limit: 1 } },
    context,
  );
  if (typeof values.repository !== "string" || !repository.ok || repository.request.args.repository !== values.repository) {
    return fail("invalid-action-arguments", { field: "repository" });
  }
  if (!isSingleLine(values.title, LIMITS.GITHUB_ISSUE_MAX_TITLE_CHARS)) return fail("invalid-action-arguments", { field: "title" });
  if (!isMultiLine(values.body, LIMITS.GITHUB_ISSUE_MAX_BODY_CHARS, { allowEmpty: true })) return fail("invalid-action-arguments", { field: "body" });
  return {
    ok: true,
    target: { kind: "github-repository", repository: values.repository },
    arguments: { repository: values.repository, title: values.title, body: values.body },
    preview: {
      kind: "github-issue",
      repository: values.repository,
      title: values.title,
      bodyExcerpt: truncateUtf16Safely(values.body, LIMITS.PREVIEW_EXCERPT_CHARS),
      bodyChars: values.body.length,
      labels: [],
      assignees: [],
      milestone: null,
      createsIssue: false,
    },
  };
};

const PREPARERS = freeze({
  "email.prepare_draft": { allowed: ["to", "subject", "body"], prepare: prepareEmailDraft },
  "calendar.prepare_event": { allowed: ["title", "start", "end", "timeZone", "location", "attendees"], prepare: prepareCalendarEvent },
  "github.prepare_issue": { allowed: ["repository", "title", "body"], prepare: prepareGitHubIssue },
});

/* ------------------------------------------------------------------ owner intent */

const intents = new WeakSet();

/**
 * Mint an action intent from the owner's CURRENT question. Callers must pass
 * only the owner's own words; connected content, memory and portfolio records
 * are never valid inputs, and a hand-built intent object is never accepted.
 */
export function createAjoopOwnerActionIntent(context, question) {
  if (!isAjoopOwnerPrivateContext(context)) return ACCESS_DENIED;
  if (typeof question !== "string") return fail("invalid-owner-question");
  const trimmed = question.trim();
  if (!trimmed || trimmed.length > AJOOP_OWNER_MAX_QUESTION_CHARS || AJOOP_OWNER_UNSAFE_MULTILINE_TEXT.test(trimmed)) {
    return fail("invalid-owner-question");
  }
  const classified = classifyAjoopOwnerAction(trimmed);
  if (!classified) return fail("no-owner-action-intent");
  const intent = freeze({
    requestedActionType: classified.requestedActionType,
    preparedActionType: classified.preparedActionType,
    questionDigest: digest(trimmed).slice(0, 32),
  });
  intents.add(intent);
  return freeze({ ok: true, code: "owner-intent-created", intent });
}

const intentAllows = (intent, actionType) => {
  try {
    return intents.has(intent) && (intent.requestedActionType === actionType || intent.preparedActionType === actionType);
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ preparation */

/** Prepare a Tier 1 local preview. Never performs an external call. */
export function prepareAjoopAction(request, { context, intent } = {}) {
  try {
    if (!isAjoopOwnerPrivateContext(context)) return ACCESS_DENIED;
    if (!isPlainObject(request)) return fail("invalid-action-request");
    if (hasCallerPolicyField(request)) return fail("caller-policy-field-forbidden");
    const shape = snapshot(request, ["actionType", "arguments"]);
    if (shape.error || !Object.hasOwn(shape.values, "actionType") || !Object.hasOwn(shape.values, "arguments")) {
      return fail("invalid-action-request");
    }
    const { actionType, arguments: args } = shape.values;
    const policy = getAjoopActionPolicy(actionType);
    if (!policy) return fail("unknown-action");
    if (policy.tier !== TIERS.PREPARE) return fail("action-not-preparable", { actionType, tier: policy.tier });
    if (!intentAllows(intent, actionType)) return fail("owner-intent-required", { actionType });
    if (!isPlainObject(args)) return fail("invalid-action-arguments");
    const preparer = PREPARERS[actionType];
    const values = snapshot(args, preparer.allowed);
    if (values.error) return fail(values.error, { field: values.field });
    const prepared = preparer.prepare(values.values, context);
    if (!prepared.ok) return prepared;

    const fingerprint = digest(canonicalJson({ actionType, target: prepared.target, arguments: prepared.arguments }));
    const action = deepFreeze({
      version: AJOOP_ACTION_SCHEMA_VERSION,
      actionId: `act_${fingerprint.slice(0, 24)}`,
      actionType,
      tier: policy.tier,
      target: prepared.target,
      arguments: prepared.arguments,
      preview: prepared.preview,
      requiresConfirmation: policy.requiresConfirmation,
      confirmationStrength: policy.confirmationStrength,
      executionSupported: false,
      externalEffect: "none",
      status: "prepared-preview",
      provenance: AJOOP_ACTION_PROVENANCE,
      fingerprint,
    });
    if (JSON.stringify(action).length > LIMITS.MAX_PREPARED_ACTION_CHARS) return fail("prepared-action-too-large");
    return freeze({ ok: true, code: "action-prepared", action });
  } catch {
    return fail("invalid-action-request");
  }
}

/* ------------------------------------------------------------------ confirmation and execution */

const confirmations = new WeakSet();

const readExecutionRequest = (request) => {
  if (!isPlainObject(request)) return { error: "invalid-action-request" };
  if (hasCallerPolicyField(request)) return { error: "caller-policy-field-forbidden" };
  const shape = snapshot(request, ["actionType", "target", "arguments"]);
  if (shape.error || ["actionType", "target", "arguments"].some((key) => !Object.hasOwn(shape.values, key))) {
    return { error: "invalid-action-request" };
  }
  const policy = getAjoopActionPolicy(shape.values.actionType);
  if (!policy) return { error: "unknown-action" };
  const target = copyJsonSafe(shape.values.target);
  const args = copyJsonSafe(shape.values.arguments);
  if (!isPlainObject(target) || !isPlainObject(args)) return { error: "invalid-action-request" };
  const canonical = canonicalJson({ actionType: policy.actionType, target, arguments: args });
  if (canonical.length > LIMITS.MAX_EXECUTION_REQUEST_CHARS) return { error: "action-request-too-large" };
  return { policy, fingerprint: digest(canonical) };
};

/**
 * Record an explicit owner confirmation for one exact action. The confirmation
 * is bound to the action fingerprint; it is never inferred and never reusable
 * for a different target or different arguments.
 */
export function createAjoopActionConfirmation(request, { context, strength, confirmedAt } = {}) {
  try {
    if (!isAjoopOwnerPrivateContext(context)) return ACCESS_DENIED;
    if (strength !== STRENGTHS.STANDARD && strength !== STRENGTHS.STRONG) return fail("invalid-confirmation-strength");
    if (!Number.isFinite(confirmedAt)) return fail("invalid-confirmation-clock");
    const parsed = readExecutionRequest(request);
    if (parsed.error) return fail(parsed.error);
    const confirmation = freeze({
      actionType: parsed.policy.actionType,
      fingerprint: parsed.fingerprint,
      strength,
      confirmedAt,
    });
    confirmations.add(confirmation);
    return freeze({ ok: true, code: "confirmation-recorded", confirmation });
  } catch {
    return fail("invalid-action-request");
  }
}

const confirmationStatus = (confirmation, policy, fingerprint, now) => {
  if (confirmation === undefined || confirmation === null) return "missing";
  try {
    if (!confirmations.has(confirmation)) return "invalid:unrecognized";
    if (confirmation.actionType !== policy.actionType || confirmation.fingerprint !== fingerprint) return "invalid:action-mismatch";
    if (STRENGTH_RANK[confirmation.strength] < STRENGTH_RANK[policy.confirmationStrength]) return "invalid:insufficient-strength";
    if (!Number.isFinite(now)) return "invalid:no-clock";
    if (confirmation.confirmedAt > now) return "invalid:future";
    if (now - confirmation.confirmedAt > LIMITS.CONFIRMATION_MAX_AGE_MS) return "invalid:stale";
    return "valid";
  } catch {
    return "invalid:unrecognized";
  }
};

/**
 * Decide what would happen to an external action request. A4 V1 never
 * executes: the result always carries `executed: false` and `externalCalls: 0`.
 */
export function evaluateAjoopActionExecution(request, { context, intent, confirmation, now } = {}) {
  const decision = (code, policy = null, extra = {}) => freeze({
    ok: false,
    code,
    actionType: policy?.actionType ?? null,
    tier: policy?.tier ?? null,
    requiresConfirmation: policy?.requiresConfirmation ?? null,
    confirmationStrength: policy?.confirmationStrength ?? null,
    executionSupported: false,
    executed: false,
    externalCalls: 0,
    preparedAlternative: policy?.preparedAlternative ?? null,
    ...extra,
  });
  try {
    if (!isAjoopOwnerPrivateContext(context)) return decision(ACCESS_DENIED.code);
    const parsed = readExecutionRequest(request);
    if (parsed.error) return decision(parsed.error);
    const { policy, fingerprint } = parsed;
    if (policy.tier === TIERS.READ_ONLY) return decision("use-read-connector", policy);
    if (policy.tier === TIERS.PREPARE) return decision("preview-only", policy);
    if (!intents.has(intent) || intent.requestedActionType !== policy.actionType) {
      return decision("owner-intent-required", policy, { confirmation: "not-evaluated" });
    }
    const status = confirmationStatus(confirmation, policy, fingerprint, now);
    const code = policy.tier === TIERS.REVERSIBLE_WRITE ? "execution-not-enabled" : "execution-denied";
    return decision(code, policy, { confirmation: status });
  } catch {
    return decision("invalid-action-request");
  }
}
