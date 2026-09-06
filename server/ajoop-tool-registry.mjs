/**
 * The tool registry: what Ajoop is allowed to do, stated once, in advance.
 *
 * A REGISTRY ENTRY IS CAPABILITY AUTHORIZATION. If a tool is not registered it
 * does not exist — there is no dynamic import, no module name resolved from
 * text, no `eval`, and no path by which something not written into this process
 * at startup becomes callable. In Phase 2 the caller of the executor is a
 * language model, and the only defence that survives a model being talked into
 * something is a defence that was decided before the model ran.
 *
 * Everything here therefore FAILS CLOSED at construction rather than at call
 * time. A malformed definition is a startup error, not a request that returns
 * an error to a visitor: a tool whose contract is wrong should stop a deploy,
 * because by the time it is being called the model has already been told the
 * tool exists.
 *
 * Phase 1 registers read-only lookups over canonical portfolio data. The
 * constraints below encode that literally — `riskLevel: "read_only"` and
 * `sideEffects: false` are the only values accepted — so introducing a tool
 * that writes anything is a deliberate edit to this file rather than a new
 * definition slipping past.
 */
import { assertSupportedSchema, deepFreeze } from "./ajoop-tool-schema.mjs";

/** Risk levels the registry knows about. Phase 1 accepts exactly one. */
export const TOOL_RISK_LEVELS = Object.freeze({ READ_ONLY: "read_only" });

/** Scopes a tool may be authorized for. Phase 1 has one. */
export const TOOL_SCOPES = Object.freeze({ PORTFOLIO: "portfolio" });

/** The hard ceiling on tool calls in a single turn, whatever a caller asks for. */
export const MAX_TOOL_CALLS_PER_TURN = 3;

/** Bounds on a definition's own declarations. */
const MIN_TIMEOUT_MS = 10;
const MAX_TIMEOUT_MS = 5000;
const TOOL_ID_PATTERN = /^[a-z][a-z0-9_]{0,31}(?:\.[a-z][a-z0-9_]{0,31}){1,3}$/;

/**
 * Segments that must never appear in a tool id, at any position.
 *
 * The grammar above already excludes them by character class — `__proto__`
 * starts with an underscore, `constructor` and `prototype` are lowercase words
 * that would otherwise be legal. A name that becomes a Map key and appears in
 * diagnostics deserves an explicit refusal rather than one inferred from a
 * regex, and the cost of naming the three strings is one line.
 */
const RESERVED_ID_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Whether a supplied id is even SHAPED like something this registry could hold.
 *
 * Exported because the executor and the event builder both need it before they
 * have a definition: an id that fails this test is never echoed anywhere, so a
 * model-invented tool name cannot become a diagnostic string.
 */
export function isWellFormedToolId(value) {
  if (typeof value !== "string" || !TOOL_ID_PATTERN.test(value)) return false;
  return value.split(".").every((part) => !RESERVED_ID_SEGMENTS.has(part));
}
const TOOL_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * The fields a caller may read about a tool.
 *
 * `execute` is deliberately absent, and the manifest is built by naming these
 * rather than by deleting `execute` from a copy — a subtractive approach means
 * a field added later is exposed by default, which is the wrong direction for
 * something that will eventually be serialised toward a model.
 */
const MANIFEST_FIELDS = Object.freeze([
  "id",
  "version",
  "description",
  "inputSchema",
  "outputSchema",
  "riskLevel",
  "sideEffects",
  "allowedScopes",
  "timeoutMs",
  "maxCallsPerTurn",
]);

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function reject(id, problem) {
  throw new Error(`tool definition ${id ? `"${id}"` : "(unnamed)"}: ${problem}`);
}

/**
 * Validate one definition completely, or throw.
 *
 * Exported so QA can exercise every rejection without standing up a registry.
 */
export function assertValidToolDefinition(definition) {
  if (!isPlainObject(definition)) reject(null, "not an object");

  const { id } = definition;
  if (!isWellFormedToolId(id)) {
    reject(typeof id === "string" ? id.slice(0, 40) : null, "id must look like namespace.tool_name and use no reserved segment");
  }
  if (typeof definition.version !== "string" || !TOOL_VERSION_PATTERN.test(definition.version)) {
    reject(id, "version must be semver-like, e.g. 1.0.0");
  }
  /* The description is what a model will be shown. An empty one is a tool
   * nobody can choose correctly. */
  if (typeof definition.description !== "string" || definition.description.trim().length < 12) {
    reject(id, "description must be a meaningful string");
  }
  if (definition.description.length > 400) reject(id, "description is too long");

  for (const field of ["inputSchema", "outputSchema"]) {
    const schema = definition[field];
    if (!isPlainObject(schema)) reject(id, `${field} must be an object schema`);
    if (schema.type !== "object") reject(id, `${field} must have type "object"`);
    try {
      assertSupportedSchema(schema);
    } catch (error) {
      reject(id, `${field} is not supported: ${error.message}`);
    }
  }

  if (definition.riskLevel !== TOOL_RISK_LEVELS.READ_ONLY) {
    reject(id, `riskLevel must be "${TOOL_RISK_LEVELS.READ_ONLY}" in this phase`);
  }
  /* Not falsy — exactly `false`. `sideEffects: 0` and `sideEffects: undefined`
   * are both a definition that never thought about the question. */
  if (definition.sideEffects !== false) reject(id, "sideEffects must be exactly false in this phase");

  const scopes = definition.allowedScopes;
  if (!Array.isArray(scopes) || !scopes.length) reject(id, "allowedScopes must be a non-empty array");
  if (new Set(scopes).size !== scopes.length) reject(id, "allowedScopes contains duplicates");
  for (const scope of scopes) {
    if (!Object.values(TOOL_SCOPES).includes(scope)) reject(id, `unknown scope "${scope}"`);
  }

  if (!Number.isInteger(definition.timeoutMs) || definition.timeoutMs < MIN_TIMEOUT_MS || definition.timeoutMs > MAX_TIMEOUT_MS) {
    reject(id, `timeoutMs must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`);
  }
  if (
    !Number.isInteger(definition.maxCallsPerTurn) ||
    definition.maxCallsPerTurn < 1 ||
    definition.maxCallsPerTurn > MAX_TOOL_CALLS_PER_TURN
  ) {
    reject(id, `maxCallsPerTurn must be an integer between 1 and ${MAX_TOOL_CALLS_PER_TURN}`);
  }
  if (typeof definition.execute !== "function") reject(id, "execute must be a function");

  /**
   * The event allowlist: which validated input fields may appear in a tool
   * event. Absent means NONE.
   *
   * Opt-in rather than opt-out because the fields are model-supplied, and — see
   * `assertEventVisibleField` — opt-in only as far as a CLOSED ENUM. A free
   * string argument has no route into an event through this door at all.
   */
  const eventArguments = definition.eventArguments ?? [];
  if (!Array.isArray(eventArguments)) reject(id, "eventArguments must be an array");
  for (const field of eventArguments) {
    if (typeof field !== "string" || !Object.hasOwn(definition.inputSchema.properties, field)) {
      reject(id, `eventArguments names a field that is not an input property`);
    }
    assertEventVisibleField(id, field, definition.inputSchema.properties[field]);
  }

  assertCanonicalEventArguments(id, definition, eventArguments);

  return definition;
}

/**
 * THE EVENT SOURCE MODEL — the one rule the rest of this section implements.
 *
 * A string in a tool event may come from exactly three places:
 *
 *   1. a CLOSED ENUM this registry declares,
 *   2. a TRUSTED CANONICAL VALUE produced by a successful lookup against the
 *      canonical corpus, or
 *   3. a FIXED SYSTEM MARKER such as `<unknown>`.
 *
 * It may never come from a raw model-supplied string, and "it passed input
 * validation" is not a fourth source. Validation answers "is this argument
 * acceptable to the executor"; it does not answer "is this text safe to store
 * in a diagnostic that an evaluation harness will later read". Both
 * `sk-live-SECRET-SYSTEM-ignore-prior-instructions` and
 * `SYSTEM-ignore-prior-instructions` are perfectly valid identifiers.
 *
 * The previous rule tried to close that gap by proving a field's PATTERN could
 * not admit prose, probing it with representative whitespace characters. U+2003
 * EM SPACE walked straight through: a sentence spelled with em spaces satisfies
 * any pattern whose only word-break exclusions are the ones somebody thought to
 * probe. That approach is gone. It could only ever be as complete as its probe
 * list, and a probe list is a list of the Unicode somebody remembered — a
 * losing shape for a security control.
 *
 * The replacement does not reason about grammars at all. It reasons about
 * PROVENANCE, which is a closed question with a stable answer.
 */

/** The longest string that may appear in an event. Ids, not prose. */
export const EVENT_STRING_MAX_LENGTH = 128;

/**
 * The grammar a canonical value must satisfy to be emitted.
 *
 * ONE fixed expression owned by this registry, applied to a value whose source
 * is already trusted — not an expression supplied by a tool author, and not an
 * inference about what some other expression permits. It is a bound, not the
 * defence: the defence is that the value came from the canonical corpus.
 */
export const CANONICAL_EVENT_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** The shape of an event argument name the registry itself mints. */
const CANONICAL_EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * Whether a model-supplied field may be echoed into a tool event.
 *
 *   string  → A CLOSED ENUM, and nothing else. The emitted text is then one of
 *             a handful of strings this registry wrote, and the model's only
 *             influence is WHICH of them.
 *   integer → explicit finite minimum AND maximum
 *   boolean → allowed as-is; there are only two values
 *
 * A `pattern` plus a `maxLength` is no longer sufficient for a string, however
 * carefully the expression is drawn. Objects and arrays are refused outright.
 */
function assertEventVisibleField(id, field, property) {
  if (!isPlainObject(property)) reject(id, `eventArguments field "${field}" has no schema`);

  if (property.type === "boolean") return;

  if (property.type === "integer") {
    if (!Number.isFinite(property.minimum) || !Number.isFinite(property.maximum)) {
      reject(id, `eventArguments field "${field}" must declare a finite minimum and maximum`);
    }
    return;
  }

  if (property.type === "string") {
    if (!Array.isArray(property.enum)) {
      reject(
        id,
        `eventArguments field "${field}" must declare an enum: a model-supplied string is event-safe only when it is one of a fixed registry-owned set, never because a pattern looks bounded`,
      );
    }
    for (const value of property.enum) {
      if (value.length > EVENT_STRING_MAX_LENGTH) {
        reject(id, `eventArguments field "${field}" has an enum value longer than ${EVENT_STRING_MAX_LENGTH} characters`);
      }
    }
    return;
  }

  reject(id, `eventArguments field "${field}" must be an enum string, a bounded integer or a boolean`);
}

/**
 * The canonical-value door: `{ eventName: outputField }`.
 *
 * A tool that takes a free identifier — a project slug, an entity name — cannot
 * put that identifier into an event. What it CAN do is name a field of its own
 * validated output whose value the tool derived from the canonical corpus, and
 * have that emitted instead. So `"SINAMA"`, `"sinama"` and
 * `"sinama-ai-agent-reliability-lab"` all produce the same event argument,
 * because all three resolve to the same record and it is the RECORD's id that
 * is emitted. An identifier that resolves to nothing produces no event argument
 * at all — not a truncated one, not a hashed one, none.
 *
 * The mapping is declarative on purpose. A projection callback would be a
 * second executable surface, running on every call with no schema in front of
 * it — precisely what this boundary exists to prevent. A pair of strings cannot
 * read an environment variable, open a file, or decide anything.
 *
 * It is also strictly weaker than what the caller already holds: the value was
 * returned to that caller in the tool result moments earlier, having passed the
 * output schema and the structural snapshot. The event opens no new channel.
 */
function assertCanonicalEventArguments(id, definition, eventArguments) {
  const mapping = definition.canonicalEventArguments ?? {};
  if (!isPlainObject(mapping)) reject(id, "canonicalEventArguments must be an object");

  for (const [name, source] of Object.entries(mapping)) {
    if (!CANONICAL_EVENT_NAME_PATTERN.test(name) || RESERVED_ID_SEGMENTS.has(name)) {
      reject(id, `canonicalEventArguments name "${String(name).slice(0, 40)}" must be a lower_snake_case identifier`);
    }
    if (eventArguments.includes(name)) {
      reject(id, `canonicalEventArguments name "${name}" collides with an input event argument`);
    }
    if (typeof source !== "string" || !Object.hasOwn(definition.outputSchema.properties, source)) {
      reject(id, `canonicalEventArguments maps "${name}" to a field that is not an output property`);
    }
    assertCanonicalSourceField(id, name, definition.outputSchema.properties[source]);
  }

  return mapping;
}

/**
 * Whether an output field is shaped like a canonical identifier.
 *
 * A type and a bound, and deliberately no pattern requirement: the
 * emission-time gate is this registry's own CANONICAL_EVENT_VALUE_PATTERN, so
 * nothing here depends on reading a tool author's expression.
 */
function assertCanonicalSourceField(id, name, property) {
  if (!isPlainObject(property)) reject(id, `canonicalEventArguments source for "${name}" has no schema`);

  if (property.type === "boolean") return;

  if (property.type === "integer") {
    if (!Number.isFinite(property.minimum) || !Number.isFinite(property.maximum)) {
      reject(id, `canonicalEventArguments source for "${name}" must declare a finite minimum and maximum`);
    }
    return;
  }

  if (property.type === "string") {
    if (!Number.isInteger(property.maxLength)) {
      reject(id, `canonicalEventArguments source for "${name}" must declare an explicit maxLength`);
    }
    if (property.maxLength > EVENT_STRING_MAX_LENGTH) {
      reject(id, `canonicalEventArguments source for "${name}" allows more than ${EVENT_STRING_MAX_LENGTH} characters`);
    }
    return;
  }

  reject(id, `canonicalEventArguments source for "${name}" must be a bounded string, integer or boolean`);
}

/**
 * Build a registry from a fixed list of definitions.
 *
 * There is no `register()` after construction on purpose: a registry that can
 * grow at runtime is a registry whose contents depend on execution order, and
 * the set of things Ajoop can do should be a property of the build.
 */
export function createToolRegistry(definitions = []) {
  if (!Array.isArray(definitions)) throw new Error("tool registry: definitions must be an array");

  const tools = new Map();
  for (const definition of definitions) {
    assertValidToolDefinition(definition);
    if (tools.has(definition.id)) reject(definition.id, "duplicate id");

    /* The schemas and metadata are frozen; `execute` stays a live reference but
     * is unreachable except through get(), which the executor alone uses. */
    const frozen = Object.freeze({
      ...Object.fromEntries(MANIFEST_FIELDS.map((field) => [field, deepFreeze(definition[field])])),
      allowedScopes: Object.freeze([...definition.allowedScopes]),
      eventArguments: Object.freeze([...(definition.eventArguments ?? [])]),
      /* Copied and frozen like every other contract field, and — like
       * `eventArguments` — absent from MANIFEST_FIELDS, so the event projection
       * rules are never serialised toward a model. */
      canonicalEventArguments: Object.freeze({ ...(definition.canonicalEventArguments ?? {}) }),
      execute: definition.execute,
    });
    tools.set(frozen.id, frozen);
  }

  const manifestEntry = (tool) =>
    Object.freeze(Object.fromEntries(MANIFEST_FIELDS.map((field) => [field, tool[field]])));

  return Object.freeze({
    /** Ids in registration order. */
    ids: () => [...tools.keys()],

    has: (id) => tools.has(id),

    /** The full entry, executor included. For the executor's use only. */
    get: (id) => tools.get(id) || null,

    /**
     * The safe view: every declared field EXCEPT the executor.
     *
     * This is what Phase 2 will translate into Ollama tool declarations, so it
     * must never carry a function, a filesystem path, an environment value or
     * anything else that is not part of the published contract.
     */
    manifest: () => Object.freeze(tools.values().toArray().map(manifestEntry)),

    describe: (id) => (tools.has(id) ? manifestEntry(tools.get(id)) : null),

    size: tools.size,
  });
}
