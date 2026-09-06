/**
 * A small, strict, closed-world validator for tool arguments and tool results.
 *
 * This is deliberately NOT a JSON Schema implementation. A general engine would
 * bring `$ref`, `anyOf`, `allOf`, remote schema resolution, draft negotiation
 * and coercion rules — hundreds of behaviours nothing here uses, each one a
 * place where a malformed argument could find a path to an executor. The
 * schemas the portfolio tools actually need are objects of bounded strings,
 * enums, integers, booleans and small arrays, so that is exactly what this
 * supports.
 *
 * Four rules make it safe rather than merely small:
 *
 * 1. NOTHING IS COERCED. `"3"` is not 3, `"true"` is not true, and an absent
 *    field is not an empty one. A validator that repairs input is a validator
 *    that decides what the caller meant, and in Phase 2 the caller is a
 *    language model.
 *
 * 2. OBJECTS ARE CLOSED. `additionalProperties: false` is required on every
 *    object schema and enforced, so a field nobody declared cannot ride along
 *    into an executor.
 *
 * 3. THE SCHEMA LANGUAGE ITSELF IS CLOSED. Every type has an explicit keyword
 *    allowlist and every constraint is type-checked at registration. A schema
 *    saying `maxLength: "20"`, `format: "email"` or `exclusiveMinimum: 0` is a
 *    registry construction failure, not a constraint that silently does
 *    nothing. Silently ignoring an unsupported keyword is the worst outcome
 *    available: the author believes a bound exists and it does not.
 *
 * 4. ERRORS NAME NO CALLER TEXT. A failure reports a path and a code, and any
 *    path segment that is not a DECLARED schema field is `<redacted>`. There is
 *    no "looks like a safe identifier" heuristic, because the thing being
 *    judged is attacker-controlled and the judgement would be the whole
 *    defence.
 */

/** Leaf types the validator understands. Anything else is a malformed schema. */
const LEAF_TYPES = new Set(["string", "integer", "number", "boolean"]);

/**
 * The keyword allowlist, per type. Anything outside it is refused.
 *
 * These are the keywords this file genuinely implements — not the ones JSON
 * Schema defines. If a keyword is not enforced by `walk()` below, it does not
 * appear here, and a schema using it will not register.
 */
const ALLOWED_KEYWORDS = Object.freeze({
  object: new Set(["type", "properties", "required", "additionalProperties"]),
  array: new Set(["type", "items", "minItems", "maxItems"]),
  string: new Set(["type", "minLength", "maxLength", "pattern", "enum"]),
  integer: new Set(["type", "minimum", "maximum", "enum"]),
  number: new Set(["type", "minimum", "maximum"]),
  boolean: new Set(["type"]),
});

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const bad = (at, problem) => {
  throw new Error(`schema ${at}: ${problem}`);
};

/**
 * Check a schema is one this validator can enforce, before anything uses it.
 *
 * Called by the registry at construction, so an unenforceable schema stops a
 * deploy rather than producing a tool whose declared bounds are decorative.
 */
export function assertSupportedSchema(schema, path = "") {
  const at = path || "(root)";
  if (!isPlainObject(schema)) bad(at, "not an object");
  if (typeof schema.type !== "string") bad(at, "missing type");

  const allowed = ALLOWED_KEYWORDS[schema.type];
  if (!allowed) bad(at, `unsupported type "${schema.type}"`);
  for (const keyword of Object.keys(schema)) {
    if (!allowed.has(keyword)) bad(at, `unsupported keyword "${keyword}" for type ${schema.type}`);
  }

  if (schema.type === "object") {
    if (schema.additionalProperties !== false) {
      bad(at, "object schemas must set additionalProperties:false");
    }
    if (!isPlainObject(schema.properties)) bad(at, "object schemas need properties");
    if (schema.required !== undefined) {
      if (!Array.isArray(schema.required) || schema.required.some((key) => typeof key !== "string")) {
        bad(at, "required must be an array of strings");
      }
      for (const key of schema.required) {
        if (!Object.hasOwn(schema.properties, key)) bad(at, `required names an undeclared property "${key}"`);
      }
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      assertSupportedSchema(child, path ? `${path}.${key}` : key);
    }
    return schema;
  }

  if (schema.type === "array") {
    if (!isPlainObject(schema.items)) bad(at, "array schemas need an items schema");
    assertBound(at, schema, "minItems", { min: 0 });
    assertBound(at, schema, "maxItems", { min: 1 });
    if (
      Number.isInteger(schema.minItems) &&
      Number.isInteger(schema.maxItems) &&
      schema.minItems > schema.maxItems
    ) {
      bad(at, "minItems exceeds maxItems");
    }
    assertSupportedSchema(schema.items, `${at}[]`);
    return schema;
  }

  if (schema.type === "string") {
    assertBound(at, schema, "minLength", { min: 0 });
    assertBound(at, schema, "maxLength", { min: 1 });
    if (
      Number.isInteger(schema.minLength) &&
      Number.isInteger(schema.maxLength) &&
      schema.minLength > schema.maxLength
    ) {
      bad(at, "minLength exceeds maxLength");
    }
    if (schema.pattern !== undefined) {
      if (typeof schema.pattern !== "string" || !schema.pattern) bad(at, "pattern must be a non-empty string");
      try {
        new RegExp(schema.pattern);
      } catch (error) {
        bad(at, "pattern is not a valid expression");
      }
    }
    assertEnum(at, schema, "string");
    return schema;
  }

  if (schema.type === "integer" || schema.type === "number") {
    for (const keyword of ["minimum", "maximum"]) {
      if (schema[keyword] === undefined) continue;
      const value = schema[keyword];
      if (typeof value !== "number" || !Number.isFinite(value)) bad(at, `${keyword} must be a finite number`);
      if (schema.type === "integer" && !Number.isInteger(value)) bad(at, `${keyword} must be an integer`);
    }
    if (typeof schema.minimum === "number" && typeof schema.maximum === "number" && schema.minimum > schema.maximum) {
      bad(at, "minimum exceeds maximum");
    }
    if (schema.type === "integer") assertEnum(at, schema, "number");
    return schema;
  }

  /* boolean: `type` is the only keyword, already allowlisted. */
  return schema;
}

function assertBound(at, schema, keyword, { min }) {
  if (schema[keyword] === undefined) return;
  const value = schema[keyword];
  if (!Number.isInteger(value)) bad(at, `${keyword} must be an integer`);
  if (value < min) bad(at, `${keyword} must be at least ${min}`);
}

function assertEnum(at, schema, expected) {
  if (schema.enum === undefined) return;
  if (!Array.isArray(schema.enum) || !schema.enum.length) bad(at, "enum must be a non-empty array");
  for (const value of schema.enum) {
    if (typeof value !== expected) bad(at, `enum values must be of type ${expected}`);
  }
  if (new Set(schema.enum).size !== schema.enum.length) bad(at, "enum contains duplicates");
}

/**
 * Validate a value against a supported schema.
 *
 * Returns `{ ok, errors }` where each error is `{ path, code }`. Never throws
 * for bad DATA — only a bad SCHEMA throws, and schemas are checked once at
 * registration rather than per call.
 */
export function validateAgainstSchema(value, schema, path = "") {
  const errors = [];
  walk(value, schema, path, errors);
  return { ok: errors.length === 0, errors };
}

/**
 * The redaction rule for path segments.
 *
 * A path is built from KEYS, and a caller controls its own keys. An earlier
 * version allowed any identifier-shaped key through, which is exactly the
 * heuristic an attacker aims at: `sk_live_SECRET_0123456789` is a perfectly
 * well-formed JavaScript identifier. So the test is not "does this look safe"
 * but "is this a field the SCHEMA declares" — a closed question with an answer
 * that does not depend on the input's shape.
 */
const REDACTED = "<redacted>";
const segment = (schema, key) => (isPlainObject(schema?.properties) && Object.hasOwn(schema.properties, key) ? key : REDACTED);
const joinPath = (path, name) => (path ? `${path}.${name}` : name);

function fail(errors, path, code) {
  errors.push({ path: path || "(root)", code });
}

function walk(value, schema, path, errors) {
  if (schema.type === "object") {
    if (!isPlainObject(value)) return fail(errors, path, "type");
    for (const key of schema.required || []) {
      /* Declared by the schema, so safe to name. */
      if (!Object.hasOwn(value, key)) fail(errors, joinPath(path, key), "required");
    }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) {
        /* The closed-world rule, and the redaction rule: an undeclared property
         * is a rejection, and its NAME is never repeated back. */
        fail(errors, joinPath(path, REDACTED), "unexpected-property");
      }
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      if (!Object.hasOwn(value, key)) continue;
      walk(value[key], child, joinPath(path, segment(schema, key)), errors);
    }
    return undefined;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) return fail(errors, path, "type");
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) fail(errors, path, "min-items");
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) fail(errors, path, "max-items");
    value.forEach((item, index) => walk(item, schema.items, `${path}[${index}]`, errors));
    return undefined;
  }

  if (schema.type === "string") {
    if (typeof value !== "string") return fail(errors, path, "type");
    if (schema.enum && !schema.enum.includes(value)) fail(errors, path, "enum");
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) fail(errors, path, "min-length");
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) fail(errors, path, "max-length");
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(errors, path, "pattern");
    return undefined;
  }

  if (schema.type === "integer") {
    /* Integer means integer. `3.0` is fine because it IS an integer; `"3"` is
     * not, and is never made into one. */
    if (typeof value !== "number" || !Number.isInteger(value)) return fail(errors, path, "type");
    if (schema.enum && !schema.enum.includes(value)) fail(errors, path, "enum");
    if (typeof schema.minimum === "number" && value < schema.minimum) fail(errors, path, "minimum");
    if (typeof schema.maximum === "number" && value > schema.maximum) fail(errors, path, "maximum");
    return undefined;
  }

  if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return fail(errors, path, "type");
    if (typeof schema.minimum === "number" && value < schema.minimum) fail(errors, path, "minimum");
    if (typeof schema.maximum === "number" && value > schema.maximum) fail(errors, path, "maximum");
    return undefined;
  }

  if (schema.type === "boolean") {
    if (typeof value !== "boolean") fail(errors, path, "type");
    return undefined;
  }

  return fail(errors, path, "unsupported-schema");
}

/** Recursively freeze a schema so a registered contract cannot be edited later. */
export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

/* ---------- structural snapshotting ---------- */

/** Value shapes that may appear in a tool result. Everything else is refused. */
export class UnsafeValueError extends Error {
  constructor(reason) {
    super(`unsafe value: ${reason}`);
    this.name = "UnsafeValueError";
    this.reason = reason;
  }
}

const MAX_SNAPSHOT_DEPTH = 8;
const MAX_SNAPSHOT_NODES = 5000;

/**
 * A safe structural copy of an executor's result.
 *
 * An executor returns an object it still owns, and "validate then return it"
 * is not safe for three separate reasons this handles at once:
 *
 *   - the object can MUTATE after validation, so what was checked is not what
 *     the caller receives;
 *   - INHERITED enumerable properties pass a naive `Object.keys` walk and then
 *     appear to a consumer reading the object normally;
 *   - a Proxy can throw from `ownKeys` or a getter, turning inspection itself
 *     into an exception carrying whatever the trap wants to say.
 *
 * So nothing is validated in place. The result is copied into fresh
 * null-prototype-free plain structures made only of own, enumerable, data
 * properties with JSON-like leaves, and it is the COPY that is validated,
 * frozen and returned. The executor's object is never handed on.
 *
 * Throws `UnsafeValueError` — the caller turns that into `invalid-output`
 * without reading its message.
 */
export function safeSnapshot(value, depth = 0, budget = { nodes: 0 }) {
  if (depth > MAX_SNAPSHOT_DEPTH) throw new UnsafeValueError("too-deep");
  if ((budget.nodes += 1) > MAX_SNAPSHOT_NODES) throw new UnsafeValueError("too-large");

  if (value === null) return null;

  const type = typeof value;
  if (type === "string" || type === "boolean") return value;
  if (type === "number") {
    /* NaN and Infinity are not JSON values and are never a legitimate result. */
    if (!Number.isFinite(value)) throw new UnsafeValueError("non-finite-number");
    return value;
  }
  if (type === "undefined") throw new UnsafeValueError("undefined");
  if (type === "function") throw new UnsafeValueError("function");
  if (type === "symbol") throw new UnsafeValueError("symbol");
  if (type === "bigint") throw new UnsafeValueError("bigint");

  if (Array.isArray(value)) {
    const copy = [];
    /* `length` and index access can both be trapped; any throw becomes an
     * UnsafeValueError rather than escaping with its own message. */
    let length;
    try {
      length = value.length;
    } catch (error) {
      throw new UnsafeValueError("inspection-failed");
    }
    if (!Number.isInteger(length) || length < 0 || length > MAX_SNAPSHOT_NODES) {
      throw new UnsafeValueError("bad-length");
    }
    for (let index = 0; index < length; index += 1) {
      let item;
      try {
        item = value[index];
      } catch (error) {
        throw new UnsafeValueError("inspection-failed");
      }
      copy.push(safeSnapshot(item, depth + 1, budget));
    }
    return copy;
  }

  if (type !== "object") throw new UnsafeValueError("unsupported-type");

  /* A custom prototype means a class instance or something stranger; neither is
   * a plain data result, and both can carry inherited behaviour. */
  let prototype;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch (error) {
    throw new UnsafeValueError("inspection-failed");
  }
  if (prototype !== Object.prototype && prototype !== null) throw new UnsafeValueError("custom-prototype");

  /* `ownKeys` and `getOwnPropertyDescriptor` are the two traps a hostile Proxy
   * uses to throw during inspection. Both are contained here. */
  let keys;
  try {
    keys = Object.keys(value);
  } catch (error) {
    throw new UnsafeValueError("inspection-failed");
  }

  const copy = {};
  for (const key of keys) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new UnsafeValueError("reserved-key");
    }
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch (error) {
      throw new UnsafeValueError("inspection-failed");
    }
    if (!descriptor) throw new UnsafeValueError("inspection-failed");
    /* An accessor runs code when read. A result is data, so a getter is
     * refused rather than invoked — invoking it is how a "validated" object
     * returns something different on the second read. */
    if (!Object.hasOwn(descriptor, "value")) throw new UnsafeValueError("accessor");
    copy[key] = safeSnapshot(descriptor.value, depth + 1, budget);
  }
  /* Cycles are caught by MAX_SNAPSHOT_DEPTH rather than by a visited set: a
   * cyclic result is malformed regardless, and a depth bound also stops the
   * deep-but-acyclic case a visited set would happily accept. */
  return copy;
}
