/**
 * The tool-event contract: one attempted call, one sanitized record.
 *
 * Defined NOW, before anything emits one, so that SINAMA does not get to
 * dictate it later. Once an evaluation harness is consuming a shape, the shape
 * stops being a design decision and becomes a compatibility obligation — and
 * the field somebody adds under that pressure is exactly the one that carries a
 * result body or a question.
 *
 * An event answers "which tool was attempted, with what bounded arguments, and
 * how did it end". It does not answer "what did it return", and it never will.
 *
 * Every string in an event has one of three sources — a closed enum, a
 * canonical value produced by a successful resolution, or a fixed marker such
 * as `<unknown>`. None of them is "a model-supplied string that passed
 * validation"; see `projectEventArguments` for why that is not a source.
 *
 * WHAT AN EVENT MAY CONTAIN — and this list is enforced, not documented:
 *
 *   version · call_id · call_index · tool · status · arguments · result_code
 *
 * WHAT IT MUST NEVER CONTAIN: the result body, retrieved text, the model's
 * answer, the visitor's question, conversation history, API keys, environment
 * values, raw errors, stack traces, IP or origin, a wall-clock timestamp, or a
 * filesystem path. None of those is excluded by filtering — none is ever read
 * in the first place. `buildToolEvent` takes a call record and a definition,
 * and there is no parameter through which a result could reach it.
 *
 * The timestamp exclusion is the least obvious and worth stating: an event
 * stream carrying wall-clock times can be correlated against server logs to
 * reconstruct who asked what and when, which turns a tool-evaluation feed into
 * a de-anonymisation aid. `call_index` gives ordering, which is the only
 * temporal fact an evaluator legitimately needs.
 */

import {
  CANONICAL_EVENT_VALUE_PATTERN,
  EVENT_STRING_MAX_LENGTH,
  isWellFormedToolId,
} from "./ajoop-tool-registry.mjs";

/** Contract version. Bump when a FIELD changes meaning or disappears. */
export const TOOL_EVENT_VERSION = 1;

/** How a call ended, from an evaluator's point of view. */
export const TOOL_EVENT_STATUS = Object.freeze({
  /* The tool ran and returned schema-valid output. */
  SUCCESS: "success",
  /* The call never reached the executor: unknown tool, bad arguments, scope,
   * budget. The system worked; the request was refused. */
  REJECTED: "rejected",
  /* The call reached the executor and did not come back cleanly: timeout, a
   * throw, or output that failed validation. */
  ERROR: "error",
});

/** Result codes that mean "refused before execution". */
const REJECTION_CODES = new Set(["unknown-tool", "invalid-arguments", "scope-denied", "budget-exhausted"]);

/** The closed field list, in the order an event serialises. */
export const TOOL_EVENT_FIELDS = Object.freeze([
  "version",
  "call_id",
  "call_index",
  "tool",
  "status",
  "arguments",
  "result_code",
]);

/** A result code maps to exactly one status. */
export function statusForResultCode(code) {
  if (code === "ok") return TOOL_EVENT_STATUS.SUCCESS;
  if (REJECTION_CODES.has(code)) return TOOL_EVENT_STATUS.REJECTED;
  return TOOL_EVENT_STATUS.ERROR;
}

/**
 * The arguments an event may echo — and the two doors they may come through.
 *
 * THE RULE: no string reaches an event because it was ACCEPTABLE. It reaches an
 * event because of where it came FROM. A raw model-supplied identifier is never
 * event-safe, however well-formed; `sk-live-SECRET-SYSTEM-ignore-prior-
 * instructions` satisfies any identifier grammar you care to write, and a
 * validator's job was never to decide what is safe to store.
 *
 * DOOR ONE — a closed enum. `definition.eventArguments` may name an input
 * field, but the registry admits a string field only when it declares an
 * `enum`, and the check below re-derives that at emission: a value is echoed
 * only if it is LITERALLY a member of the declared set. So the text stored is
 * text this registry wrote, and the model chose only which of them. If the
 * registration check were somehow bypassed, this second lock still holds.
 *
 * DOOR TWO — a canonical value. `definition.canonicalEventArguments` maps an
 * event argument name to a field of the tool's own VALIDATED OUTPUT, which for
 * the portfolio tools is a record id read out of the canonical corpus. It is
 * supplied only on success, so a lookup that resolved nothing contributes
 * nothing, and the value must still satisfy the registry's own fixed canonical
 * grammar. The caller's spelling is discarded either way: `"SINAMA"` and
 * `"sinama"` both become the record's id, which is also what makes these
 * arguments a stable evaluation identity rather than a sample of model prose.
 *
 * Both doors additionally require `validated`, and the executor sets it on the
 * SUCCESS PATH ALONE. That is stricter than "the input passed validation", and
 * deliberately so: a call that timed out or threw proved only that its argument
 * object was well-formed on the way in, and an evaluator reading
 * `{"status":"timeout","arguments":{"section":"skills"}}` would reasonably infer
 * a real attempt at that section when nothing came back at all. A failed
 * attempt is recorded in full — tool, index, status, code — with `arguments`
 * empty.
 */
export function projectEventArguments(definition, { arguments: args, validated, output = null }) {
  const projected = {};
  if (!validated) return projected;

  /* Door one: enum members, bounded integers, booleans. */
  if (args && typeof args === "object") {
    for (const field of definition?.eventArguments || []) {
      const value = args[field];
      if (value === undefined) continue;
      const property = definition?.inputSchema?.properties?.[field];
      if (typeof value === "boolean") {
        projected[field] = value;
      } else if (Number.isInteger(value) && property?.type === "integer") {
        projected[field] = value;
      } else if (typeof value === "string" && Array.isArray(property?.enum) && property.enum.includes(value)) {
        /* Membership, not shape. The string stored is the registry's own. */
        projected[field] = value;
      }
    }
  }

  /* Door two: values the tool derived from the canonical corpus. */
  if (output && typeof output === "object" && !Array.isArray(output)) {
    for (const [name, source] of Object.entries(definition?.canonicalEventArguments || {})) {
      const value = output[source];
      if (value === undefined || value === null) continue;
      if (typeof value === "boolean" || Number.isInteger(value)) {
        projected[name] = value;
      } else if (typeof value === "string" && CANONICAL_EVENT_VALUE_PATTERN.test(value)) {
        projected[name] = value;
      }
    }
  }

  return projected;
}

/**
 * One sanitized event.
 *
 * `toolId` is used rather than a definition lookup so an unknown-tool attempt
 * still produces an event — refusing to record a call because the tool does not
 * exist would hide precisely the attempts worth evaluating.
 *
 * `args` and `output` are both supplied ONLY on the success path. Everything
 * else — unknown tool, invalid arguments, denied scope, exhausted budget,
 * timeout, a throw, output that failed its own schema — reaches here with
 * neither, and so emits `arguments: {}`. That also covers the "valid but
 * unresolved" case: the call succeeded, but nothing resolved, so the canonical
 * door has nothing trusted to contribute.
 */
export function buildToolEvent({
  callIndex,
  toolId,
  resultCode,
  definition = null,
  arguments: args = null,
  validated = false,
  output = null,
}) {
  return Object.freeze({
    version: TOOL_EVENT_VERSION,
    call_id: `tool-${callIndex}`,
    call_index: callIndex,
    tool: safeToolName(toolId, definition),
    status: statusForResultCode(resultCode),
    arguments: Object.freeze(projectEventArguments(definition, { arguments: args, validated, output })),
    result_code: resultCode,
  });
}

/** The marker for any id this registry does not vouch for. */
export const UNKNOWN_TOOL_NAME = "<unknown>";

/**
 * The name an event may carry.
 *
 * ONLY a registered id is ever emitted, and it is taken from the DEFINITION
 * rather than from the caller — so what appears in an event is a string this
 * process registered at startup, not a string a model produced.
 *
 * Everything else becomes a fixed marker. Truncating a model-invented id would
 * still put arbitrary text into a stored diagnostic, and "tool" is exactly the
 * field an evaluator reads without suspicion. The id is not information worth
 * that: an unknown-tool event already says an unregistered tool was attempted,
 * which is the fact that matters.
 */
function safeToolName(toolId, definition) {
  if (definition && typeof definition.id === "string") return definition.id;
  return UNKNOWN_TOOL_NAME;
}

/**
 * Whether an object is a well-formed event carrying nothing extra.
 *
 * Used by QA, and available to any future consumer that wants to assert the
 * contract at a boundary rather than trust it.
 */
export function isSafeToolEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  const keys = Object.keys(event);
  if (keys.length !== TOOL_EVENT_FIELDS.length) return false;
  if (!TOOL_EVENT_FIELDS.every((field) => keys.includes(field))) return false;
  if (event.version !== TOOL_EVENT_VERSION) return false;
  if (!Number.isInteger(event.call_index) || event.call_index < 1) return false;
  if (event.call_id !== `tool-${event.call_index}`) return false;
  /* A registered id or the fixed marker. Never arbitrary caller text. */
  if (typeof event.tool !== "string" || !event.tool) return false;
  if (event.tool !== UNKNOWN_TOOL_NAME && !isWellFormedToolId(event.tool)) return false;
  if (!Object.values(TOOL_EVENT_STATUS).includes(event.status)) return false;
  if (typeof event.result_code !== "string" || !/^[a-z-]{2,32}$/.test(event.result_code)) return false;
  if (statusForResultCode(event.result_code) !== event.status) return false;
  if (!event.arguments || typeof event.arguments !== "object" || Array.isArray(event.arguments)) return false;
  return Object.values(event.arguments).every((value) => {
    if (typeof value === "boolean" || Number.isInteger(value)) return true;
    /* A bound at the boundary. Provenance is enforced where the value is
     * projected; this is the structural check a future consumer can apply
     * without holding the definition that produced the event. */
    return typeof value === "string" && value.length <= EVENT_STRING_MAX_LENGTH;
  });
}
