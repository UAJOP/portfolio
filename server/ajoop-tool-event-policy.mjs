/**
 * The semantic layer of tool-event validation.
 *
 * `isSafeToolEvent` proves an event is STRUCTURALLY safe: the closed field set,
 * a well-formed tool id, a status matching its result code, bounded scalar
 * arguments. That is the right contract for a generic validator and it is
 * deliberately left alone — it knows nothing about the portfolio, and giving it
 * corpus knowledge would make every consumer of the event contract depend on
 * the canonical data.
 *
 * But structure is not meaning. All of these are structurally impeccable:
 *
 *   portfolio.project_lookup  { "secret": "VALUE" }
 *   portfolio.project_lookup  { "project_id": "sk-live-SECRET" }
 *   portfolio.project_lookup  { "project_id": "SYSTEM-ignore-prior-instructions" }
 *   portfolio.project_lookup  { "project_id": "project:not-in-corpus" }
 *   portfolio.profile_lookup  { "section": "secrets" }
 *   portfolio.evidence_lookup { "entity_id": "non-canonical-but-grammar-valid" }
 *
 * Every one is a bounded scalar under a lower_snake_case key. Every one would
 * have reached an evaluation harness as a statement about what the agent did.
 * None of them could have been produced by the real executor.
 *
 * So this module adds the second layer, and it answers a different question:
 * not "is this shaped like an event" but "could this event have come from THIS
 * tool". It derives the answer from things that already exist —
 *
 *   the tool's declared event contract   (registry: eventArguments,
 *                                         canonicalEventArguments, inputSchema)
 *   the public canonical corpus          (portfolio tools: identity surface)
 *
 * — rather than from a second copy of either. There is no list of valid ids
 * here and no duplicated enum; there is a rule for reading the ones that exist.
 *
 * WHAT THIS IS NOT. It does not prove an event was really emitted by a real
 * execution: there is no signature, no hash and no audit chain, and none is
 * wanted in this pass. It protects a public evaluation boundary from a
 * malformed or contaminated sidecar, which is a different and much smaller job.
 */

/**
 * The sentinel for "this tool intentionally accepts any public canonical id".
 *
 * A VALUE, not an absence. That distinction is the whole point of this section:
 * "any public entity" and "nobody has decided yet" are opposite statements, and
 * an earlier version expressed both as `null`.
 */
export const ANY_PUBLIC_ENTITY = Symbol("ajoop.canonical.any-public-entity");

/**
 * Which canonical records each tool's canonical event argument may name.
 *
 * The IDS all come from the corpus — nothing here enumerates one. What this map
 * carries is the single piece of information the registry genuinely does not
 * hold: that `project_lookup` looks up projects. The executor knows it, because
 * it passes `{ entityType: "project" }` to the resolver, but that is a detail of
 * the executor body rather than a declared part of the contract, and reaching
 * into a function body to recover it would be worse than stating it.
 *
 * THREE STATES, and the third is the one that matters:
 *
 *   "project"           — a specific required entity type
 *   ANY_PUBLIC_ENTITY   — deliberately any public canonical record
 *   absent from this map — NO POLICY DECIDED, and therefore no event accepted
 *
 * The previous shape collapsed the second and third into `?? null`, which made
 * the map fail OPEN: a canonical tool added later and forgotten here would not
 * have been rejected, it would have silently accepted any public id in the
 * corpus — an employer id validating as a project result, and an evaluation
 * harness told the agent looked up something it never looked up. The shipped
 * tools were correct; the contract was not, and a contract that is only correct
 * for the entries somebody remembered is the kind that breaks on the day
 * somebody is in a hurry.
 *
 * Adding a canonical tool now requires adding a line here. That is the intended
 * cost: the alternative is a default, and there is no safe default for "what
 * may this identifier be".
 */
const CANONICAL_ENTITY_TYPES = new Map([
  ["portfolio.project_lookup", "project"],
  ["portfolio.evidence_lookup", ANY_PUBLIC_ENTITY],
]);

/** The fixed marker Phase 1 emits for an id the registry does not vouch for. */
const UNKNOWN_TOOL_NAME = "<unknown>";

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Compile one tool's event-argument contract from its registry entry.
 *
 * Two kinds of argument, matching Phase 1's two doors:
 *
 *   enum      — an input field on `eventArguments`. Its legal values are the
 *               field's declared `enum`, read straight off the input schema.
 *               REQUIRED on success when the input itself is required, because
 *               a successful call necessarily had one.
 *   canonical — a name on `canonicalEventArguments`. Its legal values are the
 *               canonical ids the identity surface vouches for. OPTIONAL,
 *               because a lookup that resolved nothing is a perfectly ordinary
 *               success and emits no canonical argument at all.
 */
function compileToolContract(definition) {
  const enums = new Map();
  const canonical = new Map();

  for (const field of definition.eventArguments || []) {
    const property = definition.inputSchema?.properties?.[field];
    if (!Array.isArray(property?.enum)) continue;
    enums.set(field, {
      values: new Set(property.enum),
      required: Array.isArray(definition.inputSchema?.required)
        ? definition.inputSchema.required.includes(field)
        : false,
    });
  }

  for (const name of Object.keys(definition.canonicalEventArguments || {})) {
    /* `configured` is read separately from `entityType` so that "no policy" is
     * a state the enforcement below must handle, rather than a value that
     * happens to look like one. */
    canonical.set(name, {
      configured: CANONICAL_ENTITY_TYPES.has(definition.id),
      entityType: CANONICAL_ENTITY_TYPES.get(definition.id),
    });
  }

  /**
   * A tool that emits canonical identifiers but has no provenance policy is
   * unusable, and unusable at the level of the whole tool rather than of the
   * individual argument.
   *
   * Checking only the argument would accept a success that happened to carry
   * none — an unresolved lookup emits `{}` — which reports "this tool ran
   * successfully" for a tool nobody has vouched for. The identifier is not the
   * only claim in an event; the tool name is a claim too.
   */
  const canonicalPolicyMissing = [...canonical.values()].some((rule) => !rule.configured);

  return {
    enums,
    canonical,
    canonicalPolicyMissing,
    /* The closed key set for a successful event. Anything outside it fails. */
    allowed: new Set([...enums.keys(), ...canonical.keys()]),
  };
}

/**
 * Build the semantic validator for the shipped portfolio tools.
 *
 * `registry` supplies the contracts, `identities` supplies canonical
 * provenance. Both are constructed once during trusted runtime composition and
 * captured here; nothing is reloaded per request and nothing mutable escapes.
 *
 * Returns `(event) => boolean`. It never throws for bad DATA — a malformed
 * event is `false`, not an exception — because its caller is a public boundary
 * that must fail closed rather than fail loudly.
 */
export function createPortfolioToolEventPolicy({ registry, identities } = {}) {
  if (!registry || typeof registry.get !== "function") {
    throw new TypeError("tool event policy: a tool registry is required");
  }
  if (!identities || typeof identities.has !== "function" || typeof identities.hasType !== "function") {
    throw new TypeError("tool event policy: a canonical identity surface is required");
  }

  /* Compiled once, from the frozen registry entries. */
  const contracts = new Map();
  for (const id of registry.ids()) {
    contracts.set(id, compileToolContract(registry.get(id)));
  }

  const validate = (event) => {
    if (!isPlainObject(event)) return false;
    const args = event.arguments;
    if (!isPlainObject(args)) return false;
    const keys = Object.keys(args);

    /**
     * A FAILED ATTEMPT CARRIES NO ARGUMENTS.
     *
     * Phase 1 already emits `{}` for every non-`ok` result, but the whole
     * reason this validator exists is that the producer might not be the
     * producer we think. An `error` event carrying a project id is either a
     * contaminated sidecar or a regression in the executor, and both should
     * reach an evaluator as nothing rather than as a claim.
     */
    if (event.result_code !== "ok") return keys.length === 0;

    /* A tool the registry does not know cannot have succeeded. The unknown
     * marker is only ever a rejection, which the branch above already handled. */
    if (event.tool === UNKNOWN_TOOL_NAME) return false;
    const contract = contracts.get(event.tool);
    if (!contract) return false;
    /* No provenance policy, no trusted success. See `compileToolContract`. */
    if (contract.canonicalPolicyMissing) return false;

    /* KEY CLOSURE. An unrecognised key fails the event outright; it is never
     * stripped. A sidecar that smuggled `secret` alongside a real project id is
     * not a good event with a bad field, it is an event from somewhere else. */
    for (const key of keys) {
      if (!contract.allowed.has(key)) return false;
    }

    for (const [field, rule] of contract.enums) {
      if (!Object.hasOwn(args, field)) {
        /* A required input was necessarily supplied for the call to succeed,
         * so its enum argument must be present. */
        if (rule.required) return false;
        continue;
      }
      /* MEMBERSHIP, not shape. The value must be one of the registry's own
       * strings — `"secrets"` is a well-formed identifier and not a section. */
      if (!rule.values.has(args[field])) return false;
    }

    for (const [name, rule] of contract.canonical) {
      if (!Object.hasOwn(args, name)) continue;
      const value = args[name];
      if (typeof value !== "string" || !value) return false;
      /**
       * CANONICAL PROVENANCE. Exact membership of the public corpus — so an
       * alias, a plausible-looking slug, an id for a record that does not
       * exist, and an id for a `public_on_request` record all fail alike.
       *
       * A tool with canonical event arguments and no configured provenance
       * policy accepts NOTHING. It is not that such a tool is suspect; it is
       * that nobody has said what its identifier may be, and inventing an
       * answer here is exactly the fail-open this branch exists to prevent.
       */
      if (!rule.configured) return false;
      if (rule.entityType === ANY_PUBLIC_ENTITY) {
        if (!identities.has(value)) return false;
      } else if (typeof rule.entityType === "string" && rule.entityType) {
        if (!identities.hasType(value, rule.entityType)) return false;
      } else {
        /* Configured with something that is neither the sentinel nor a type
         * name. A malformed policy is a policy that has not been made. */
        return false;
      }
    }

    return true;
  };

  return validate;
}
