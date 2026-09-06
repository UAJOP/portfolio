/**
 * The execution boundary: the one place a tool can be called from.
 *
 * Every guard lives here — registry lookup, scope authorization, argument
 * validation, per-tool and per-turn budgets, timeout, output snapshotting and
 * validation, error normalization, event generation. Individual executors
 * implement none of them.
 *
 * That centralisation is the whole point. If each tool enforced its own budget
 * and validated its own arguments, the safety of the system would be the
 * intersection of every tool author's care. Here a new tool inherits the
 * boundary by existing, and a tool author cannot weaken it because there is no
 * parameter through which to try.
 *
 * THERE IS EXACTLY ONE WAY IN: `createToolTurn()`, then `turn.invoke()` for
 * every call in that visitor turn.
 *
 *     const turn = createToolTurn({ registry, scope });
 *     await turn.invoke(...);
 *     await turn.invoke(...);
 *     await turn.invoke(...);   // the third is the last, always
 *
 * One visitor turn, one tool turn, a hard ceiling of three. A single-call
 * convenience helper used to live here as well, and it minted a fresh turn —
 * and therefore a fresh budget — on every call. It required a deliberate
 * acknowledgement flag, which is a comment enforced at runtime rather than a
 * property of the system: Phase 2's agent loop needs the shared-budget path to
 * be the ONLY path, not merely the recommended one. QA scripts that want a
 * one-shot call now build one locally out of `createToolTurn`, where it cannot
 * be mistaken for a runtime API.
 *
 * Four properties are load-bearing and each is easy to get subtly wrong:
 *
 * 1. THE BUDGET COUNTS ATTEMPTS, NOT SUCCESSES. Reservation happens at the very
 *    top of invoke(), before the registry is even consulted. An earlier version
 *    charged only calls that reached an executor, which meant unknown tools,
 *    bad arguments and denied scopes were free — so a hostile caller had an
 *    unbounded number of refused attempts and an unbounded event log, which is
 *    a denial-of-service and an evaluation-poisoning channel at once.
 *
 * 2. IDENTITY IS RESERVED BEFORE THE FIRST AWAIT. `call_index` is assigned
 *    synchronously at entry, so a slow first call stays `tool-1` even when a
 *    fast second call finishes before it. Completion timing must never rename
 *    anything: an evaluator reading events needs invocation order, and derived
 *    identity would silently reorder under concurrency.
 *
 * 3. TOOL OUTPUT IS DATA, AND IT IS COPIED. Nothing a tool returns is inspected
 *    for instructions, tool names, scopes or budgets — and the object itself is
 *    never handed on. It is structurally snapshotted, the snapshot is
 *    validated, and the frozen snapshot is what a caller receives.
 *
 * 4. AN EVENT'S ARGUMENTS COME FROM THE VALIDATED SNAPSHOT, NEVER FROM THE
 *    CALLER. The success path hands `record()` the frozen output so the event
 *    can carry a canonical id; every failure path hands it nothing. A raw
 *    model-supplied identifier therefore has no route into an event at all —
 *    not even the one that used to exist, where passing input validation was
 *    treated as good enough. See server/ajoop-tool-events.mjs.
 */
import { MAX_TOOL_CALLS_PER_TURN, isWellFormedToolId } from "./ajoop-tool-registry.mjs";
import { buildToolEvent } from "./ajoop-tool-events.mjs";
import { UnsafeValueError, deepFreeze, safeSnapshot, validateAgainstSchema } from "./ajoop-tool-schema.mjs";

/**
 * The closed failure vocabulary. A caller may branch on these; nothing else is
 * ever returned.
 */
export const TOOL_RESULT_CODES = Object.freeze({
  OK: "ok",
  UNKNOWN_TOOL: "unknown-tool",
  INVALID_ARGUMENTS: "invalid-arguments",
  SCOPE_DENIED: "scope-denied",
  BUDGET_EXHAUSTED: "budget-exhausted",
  TIMEOUT: "timeout",
  TOOL_ERROR: "tool-error",
  INVALID_OUTPUT: "invalid-output",
});

const failure = (code, extra = {}) => Object.freeze({ ok: false, code, ...extra });
const success = (data) => Object.freeze({ ok: true, code: TOOL_RESULT_CODES.OK, data });

/**
 * Run `work` with a deadline.
 *
 * The timer is always cleared and an AbortSignal is raised, so a cooperative
 * tool can stop. A timed-out promise is ABANDONED rather than cancelled —
 * JavaScript offers no more — so the late settlement is explicitly neutralised:
 * the race has already resolved, and a `.catch()` is attached to the abandoned
 * promise so a late rejection cannot surface as an unhandled rejection. It
 * produces no second event and no second result, because the caller has
 * already returned.
 */
async function withTimeout(work, timeoutMs) {
  const controller = new AbortController();
  let timer = null;
  const pending = Promise.resolve().then(() => work(controller.signal));
  /* Attached immediately and unconditionally: whichever way the race goes, this
   * promise now has a handler and cannot become an unhandled rejection. */
  pending.catch(() => {});
  try {
    return await Promise.race([
      pending,
      new Promise((unused, rejectTimeout) => {
        timer = setTimeout(() => {
          controller.abort();
          const error = new Error("tool timeout");
          error.toolTimeout = true;
          rejectTimeout(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * A single turn's tool budget and event log.
 *
 * `maxCalls` is clamped to the registry ceiling: a caller asking for more than
 * MAX_TOOL_CALLS_PER_TURN gets the ceiling, not an error and not what it asked
 * for. Phase 2's agent loop sits directly on top of this, and the loop's
 * termination guarantee should not depend on the loop being written correctly.
 *
 * ONE TURN OBJECT PER VISITOR TURN. The budget is meaningful only if it is
 * shared across every call in that turn; creating a fresh turn per call would
 * make the ceiling decorative.
 */
export function createToolTurn({ registry, scope, maxCalls = MAX_TOOL_CALLS_PER_TURN, context = {} } = {}) {
  if (!registry) throw new Error("tool turn: a registry is required");

  const ceiling = Math.max(
    0,
    Math.min(Number.isInteger(maxCalls) ? maxCalls : MAX_TOOL_CALLS_PER_TURN, MAX_TOOL_CALLS_PER_TURN),
  );
  let attempts = 0;
  const perTool = new Map();
  /* Keyed by reserved index rather than appended, so an event lands in its
   * invocation slot however late it completes. */
  const events = new Map();

  const orderedEvents = () =>
    [...events.entries()].sort(([left], [right]) => left - right).map(([, event]) => event);

  /**
   * BOTH `args` AND `output` ARE PASSED ON THE SUCCESS PATH ONLY.
   *
   * Every other path — unknown tool, invalid arguments, denied scope, exhausted
   * budget, timeout, a throw, output that failed its own schema — records the
   * attempt with `arguments: {}`.
   *
   * "The input passed validation" was still doing too much work. A call that
   * timed out or threw did not establish that the tool's target existed, that
   * the enum member meant anything, or that the attempt was coherent at all —
   * it established only that the argument object was well-formed on the way in.
   * An evaluator reading `{"status":"timeout","arguments":{"mode":"a"}}` would
   * reasonably infer a real attempt against `mode=a`; what actually happened is
   * that nothing came back. So arguments are projected from a SUCCESSFUL
   * VALIDATED RESULT, and from nothing else.
   *
   * The failed attempt is still recorded in full — tool, index, status, result
   * code. It is the arguments alone that go, because they are the field an
   * evaluation harness reads as "what the agent did".
   */
  const record = (callIndex, { toolId, resultCode, definition = null, args = null, validated = false, output = null }) => {
    events.set(
      callIndex,
      buildToolEvent({ callIndex, toolId, resultCode, definition, arguments: args, validated, output }),
    );
  };

  const invoke = async ({ toolId, arguments: args = {} } = {}) => {
    /**
     * RESERVE FIRST. Both the attempt and the identity are taken synchronously,
     * before the registry is consulted and before any await, so:
     *
     *   - a refused attempt still costs one of the three, and
     *   - a slow call keeps the index it started with.
     *
     * A turn that is already exhausted reserves nothing further: it records no
     * event either, because an unbounded log is half the problem an unbounded
     * budget creates.
     */
    if (attempts >= ceiling) return failure(TOOL_RESULT_CODES.BUDGET_EXHAUSTED);
    attempts += 1;
    const callIndex = attempts;

    const definition = isWellFormedToolId(toolId) ? registry.get(toolId) : null;

    if (!definition) {
      record(callIndex, { toolId, resultCode: TOOL_RESULT_CODES.UNKNOWN_TOOL });
      return failure(TOOL_RESULT_CODES.UNKNOWN_TOOL);
    }

    if (!definition.allowedScopes.includes(scope)) {
      record(callIndex, { toolId, resultCode: TOOL_RESULT_CODES.SCOPE_DENIED, definition });
      return failure(TOOL_RESULT_CODES.SCOPE_DENIED);
    }

    /* The PER-TOOL cap is charged only once a real tool is resolved — it is a
     * property of that tool, and an unknown id belongs to none. The global
     * attempt budget above has already been spent either way. */
    const usedForTool = perTool.get(definition.id) || 0;
    if (usedForTool >= definition.maxCallsPerTurn) {
      record(callIndex, { toolId, resultCode: TOOL_RESULT_CODES.BUDGET_EXHAUSTED, definition });
      return failure(TOOL_RESULT_CODES.BUDGET_EXHAUSTED);
    }

    const validation = validateAgainstSchema(args, definition.inputSchema);
    if (!validation.ok) {
      /* No arguments: the object that failed validation is unvalidated model
       * output, and this attempt produced no result to project from. */
      record(callIndex, { toolId, resultCode: TOOL_RESULT_CODES.INVALID_ARGUMENTS, definition });
      return failure(TOOL_RESULT_CODES.INVALID_ARGUMENTS, { errors: Object.freeze(validation.errors) });
    }

    perTool.set(definition.id, usedForTool + 1);

    let snapshot;
    try {
      const raw = await withTimeout(
        (signal) => definition.execute(args, { scope, signal, context }),
        definition.timeoutMs,
      );
      /**
       * Snapshot INSIDE the guarded region.
       *
       * Inspecting a hostile result is itself dangerous: a Proxy can throw from
       * `ownKeys` or a getter, and that exception would otherwise escape
       * carrying whatever text the trap chose. Copying here means every such
       * throw is caught by the same handler that normalises an executor throw.
       */
      snapshot = safeSnapshot(raw);
    } catch (error) {
      /* Normalised to a code. A raw message could carry a filesystem path, an
       * environment value or a fragment of whatever the tool was reading. An
       * unsafe-value failure is a malformed RESULT, not a failed execution. */
      const code = error?.toolTimeout
        ? TOOL_RESULT_CODES.TIMEOUT
        : error instanceof UnsafeValueError
          ? TOOL_RESULT_CODES.INVALID_OUTPUT
          : TOOL_RESULT_CODES.TOOL_ERROR;
      /* The attempt is recorded; its arguments are not. Nothing came back, so
       * there is no successful validated result to project from. */
      record(callIndex, { toolId, resultCode: code, definition });
      return failure(code);
    }

    /* The SNAPSHOT is validated, not the original: what was checked is exactly
     * what the caller receives, and the executor can no longer change it. */
    const outputValidation = validateAgainstSchema(snapshot, definition.outputSchema);
    if (!outputValidation.ok) {
      /* A result that failed its own schema is not a successful result, so it
       * projects neither its canonical fields nor the input that led to it. */
      record(callIndex, { toolId, resultCode: TOOL_RESULT_CODES.INVALID_OUTPUT, definition });
      return failure(TOOL_RESULT_CODES.INVALID_OUTPUT, { errors: Object.freeze(outputValidation.errors) });
    }

    const data = deepFreeze(snapshot);
    record(callIndex, { toolId, resultCode: TOOL_RESULT_CODES.OK, definition, args, validated: true, output: data });
    return success(data);
  };

  return Object.freeze({
    invoke,
    /** Sanitized events in INVOCATION order, whatever order they completed in. */
    events: orderedEvents,
    stats: () =>
      Object.freeze({
        scope,
        ceiling,
        attempts,
        used: attempts,
        remaining: Math.max(0, ceiling - attempts),
        calls: events.size,
      }),
  });
}
