# Ajoop 5.4 — tool registry and read-only skills

Ajoop 5.3 answers from a retrieved corpus. 5.4 is the beginning of answering
from *capabilities* as well — but only the beginning.

**This release ships Phase 1 only: a registry, an execution boundary and three
read-only lookups. Nothing selects a tool, nothing calls one on a visitor's
behalf, and no visitor-facing behaviour changes.**

## What exists today

```
User
  ↓
Ajoop  ─────────────────────────────  unchanged: retrieval → generation → answer
  ↓
Tool decision                          ✗ not built
  ↓
Tool Registry            ✓ server/ajoop-tool-registry.mjs
  ↓
schema / scope / budget / timeout      ✓ server/ajoop-tool-executor.mjs
  ↓
Executor                 ✓ three read-only portfolio skills
  ↓
structured result        ✓ closed envelope
  ↓
bounded agent loop                     ✗ not built
  ↓
final answer
```

Everything below the *tool decision* line is built. Nothing above it is. The
`/ajoop-rag` request path does not import any of these modules, no `tools` array
is sent to Ollama, and no generation prompt changed.

## Phase map

| Phase | Scope | Status |
| --- | --- | --- |
| **5.4 Phase 1** | registry, executor, budget primitive, event contract, three read-only skills | **this release** |
| 5.4 Phase 2 | model tool selection, bounded agent loop, real tool events | not started |
| 5.4 Phase 3 | SINAMA tool evaluation and observability | not started |
| later | web search, MCP, write/side-effect tools | not planned |

## Modules

| File | Role |
| --- | --- |
| `server/ajoop-tool-schema.mjs` | strict closed-world validator; refuses schemas it cannot enforce |
| `server/ajoop-tool-registry.mjs` | the definition contract; fails closed at construction |
| `server/ajoop-tool-executor.mjs` | the one call path: lookup, scope, validation, budget, timeout, normalization |
| `server/ajoop-tool-events.mjs` | the sanitized tool-event contract |
| `server/ajoop-portfolio-tools.mjs` | the three Phase 1 skills, over canonical knowledge |
| `scripts/qa-ajoop-tools.mjs` | `npm run qa:ajoop:tools` |

## The definition contract

```
id · version · description · inputSchema · outputSchema
riskLevel · sideEffects · allowedScopes · timeoutMs · maxCallsPerTurn · execute
```

Phase 1 accepts `riskLevel: "read_only"`, `sideEffects: false` (exactly `false`,
not merely falsy) and `allowedScopes: ["portfolio"]`. Introducing anything else
is a deliberate edit to the registry, not a definition that slips past.

Construction fails closed on: a duplicate or malformed id, a missing or trivial
description, a schema the validator cannot enforce, an open object schema, an
unsupported risk level, `sideEffects` other than `false`, an unknown scope, a
timeout outside 10–5000 ms, a call cap outside 1–3, a missing executor, an event
allowlist naming anything but a closed enum or a bounded number, and a canonical
event mapping naming anything but a bounded output field.

**A registry entry is capability authorization.** If a tool is not registered it
does not exist: there is no dynamic import, no module name resolved from text,
no `eval`, and no runtime `register()`. The set of things Ajoop can do is a
property of the build.

Registered definitions are deeply frozen, and the registry copies rather than
adopts — editing the source object afterwards changes nothing.

### The safe manifest

`registry.manifest()` returns the ten contract fields and **never** `execute`.
It is built by naming the safe fields rather than deleting the unsafe one, so a
field added later is hidden by default. It carries no function, filesystem path,
secret, environment value or internal error.

## Validation

Deliberately not a JSON Schema engine. Every type has an explicit **keyword
allowlist**, and every constraint is type-checked at registration:

| Type | Keywords |
| --- | --- |
| `object` | `type`, `properties`, `required`, `additionalProperties` (must be `false`) |
| `array` | `type`, `items`, `minItems`, `maxItems` |
| `string` | `type`, `minLength`, `maxLength`, `pattern`, `enum` |
| `integer` | `type`, `minimum`, `maximum`, `enum` |
| `number` | `type`, `minimum`, `maximum` |
| `boolean` | `type` |

Anything else — `format`, `anyOf`, `exclusiveMinimum`, a missing `type` — is a
**registry construction failure**. Bounds are validated too: `maxLength` must be
a positive integer, `minLength ≤ maxLength`, `minimum ≤ maximum`, numeric bounds
finite, `pattern` a compilable expression, `enum` non-empty, type-compatible and
duplicate-free. Silently ignoring an unsupported keyword is the worst available
outcome: the author believes a bound exists and it does not.

- **Nothing is coerced.** `"3"` is not `3`; `"true"` is not `true`.
- **Objects are closed.** An undeclared property is a rejection, not something
  to strip.
- **Errors name no caller text.** A failure reports `{path, code}`, and any path
  segment that is not a **declared schema field** is `<redacted>`. There is no
  "looks like a safe identifier" heuristic: `sk_live_SECRET_0123456789` is a
  perfectly well-formed identifier, so the test is "did the schema declare
  this", which is a closed question.

Invalid arguments never reach an executor. Invalid output never leaves one.

## The three skills

All three read the canonical corpus at call time through `loadMasterKnowledge()`
— the same loader, sanitizer, visibility tiers and alias table retrieval uses.
**There is no second knowledge base and no fact is hard-coded** (asserted in QA).

Privacy is inherited, not reimplemented: restricted material is already gone
before these records exist, and the tools additionally drop the
`public_on_request` tier — the same exclusion `ajoop-rag.mjs` applies to
`retrievalIndex`. The on-request contact record is unreachable through a tool
for the same reason it is unreachable through cosine similarity: it is not in
the set being searched.

| Tool | Input | Returns |
| --- | --- | --- |
| `portfolio.project_lookup` | `project` — canonical id, slug or alias | title, summary, status, category, stack, flagship, canonical links |
| `portfolio.profile_lookup` | `section` — `profile` \| `skills` \| `experience` \| `education` | canonical entries with structured `details` |
| `portfolio.evidence_lookup` | `entity` — project, employer or profile | the resolved `entity_id`, plus the record's own evidence claims and canonical links |

The `project` / `entity` pattern is deliberately narrow
(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$`, max 96). That is an **input** bound and
nothing more: it decides what the executor will try to resolve, and decides
nothing about what may be recorded. A model-supplied string is never
event-visible however narrow its grammar —
`sk-live-SECRET-SYSTEM-ignore-prior-instructions` satisfies this pattern
perfectly, resolves to no record, and contributes nothing to an event. See
[Tool events](#tool-events).

96 covers the longest public canonical id (69 characters, a certification slug)
with headroom; QA asserts that **every** public canonical id and slug is
accepted by the schema. Canonical aliases do contain spaces ("merge rush"), so
the resolver also tries a separator-normalised form: the model writes
`merge-rush`, and the alias table remains the only source of what that means.

A miss returns `{found: false}`, not an error and not a guess. There is no fuzzy
fallback: a tool that guesses which project was meant is a tool that confidently
answers about the wrong one.

## The execution boundary

```js
const turn = createToolTurn({ registry, scope: "portfolio", maxCalls: 3 });
const result = await turn.invoke({ toolId, arguments });
turn.events();
```

The executor owns every guard — registry lookup, scope, input validation,
per-tool and per-turn budgets, timeout, execution, output validation, error
normalization, event generation. Executors implement none of them, and there is
no parameter through which one could weaken them.

**The budget counts ATTEMPTS, not successes.** Reservation happens at the top of
`invoke()`, before the registry is consulted — so `unknown-tool`,
`invalid-arguments` and `scope-denied` each cost one of the three. Refused calls
were previously free, which gave a hostile caller unlimited attempts and an
unlimited event log through the same hole. The per-tool cap is charged only once
a real tool is resolved; the global ceiling is charged always. `maxCalls` is
clamped to the hard ceiling of **3**.

**Identity is reserved before the first await.** `call_index` is assigned
synchronously at entry, so a slow first call keeps `tool-1` even when a fast
second call finishes first. Events are stored by reserved index and reported in
invocation order, whatever order they completed in.

**One turn per visitor turn, and one way in.** `createToolTurn()` is the only
function the executor exports:

```js
const turn = createToolTurn({ registry, scope });

await turn.invoke(...);
await turn.invoke(...);
await turn.invoke(...);   // the third is the last, always
```

There is no single-call convenience helper. One used to exist, guarded by an
`allowSingleUse: true` acknowledgement, and it minted a fresh turn — therefore a
fresh budget — on every call. An acknowledgement is a comment enforced at
runtime; Phase 2 needs the shared-budget path to be the only path that exists.
QA builds its own one-shot fixture out of `createToolTurn` instead.

Closed envelope, closed vocabulary:

```json
{ "ok": true,  "code": "ok", "data": {} }
{ "ok": false, "code": "invalid-arguments" }
```

`ok` · `unknown-tool` · `invalid-arguments` · `scope-denied` ·
`budget-exhausted` · `timeout` · `tool-error` · `invalid-output`

No raw exception message, stack trace or filesystem path ever reaches a caller.

## Security model

**Tool results are data, never instructions.** Nothing a tool returns is
inspected for directives, tool names, scopes or budgets. The Phase 2 rules are
therefore already structural: tool output cannot override system instructions,
request another tool, change scope, raise a budget, or authorize a forbidden
operation, because nothing reads it for anything but shape.

### Output is snapshotted, not merely validated

The executor never hands on the executor's own object:

```
executor result → safe structural snapshot → validate snapshot
               → deep freeze → return snapshot
```

All of it inside the normalized `try`/`catch`. "Validate then return it" fails
three separate ways: the object can **mutate after validation**, so what was
checked is not what the caller gets; **inherited enumerable properties** pass a
naive key walk and then appear to anyone reading the object normally; and a
**Proxy can throw from `ownKeys` or a getter**, turning inspection itself into
an exception carrying whatever the trap chose to say.

Accepted: plain or null-prototype objects, arrays, and JSON-like scalars.
Refused as `invalid-output`: custom prototypes and class instances, accessors,
functions, symbols, bigints, `NaN`/`Infinity`, `undefined`, reserved keys,
cycles, over-deep or over-large structures, and any value whose inspection
throws.

## Tool events

Defined now, before anything emits one, so an evaluation harness does not get to
dictate the shape later.

```json
{
  "version": 1,
  "call_id": "tool-1",
  "call_index": 1,
  "tool": "portfolio.project_lookup",
  "status": "success",
  "arguments": { "project_id": "project:sinama" },
  "result_code": "ok"
}
```

`project_id` is the id of the record the lookup **resolved to**, not the string
the caller sent. `"SINAMA"`, `"sinama"` and `"project:sinama"` all produce the
event above.

`status` is `success` | `rejected` | `error`, derived from the result code.
Every attempt produces exactly one event, including refused ones — an attempt on
a tool that does not exist is the most interesting thing an evaluator can see.

**Never present:** result body, retrieved text, model answer, user question,
conversation history, API keys, environment values, raw errors, stack traces, IP
or origin, wall-clock timestamp, filesystem paths. None of these is filtered
out — none is ever read. `buildToolEvent()` has no parameter through which a
result could reach it.

The timestamp exclusion is deliberate: wall-clock times can be correlated
against server logs to reconstruct who asked what and when. `call_index` gives
ordering, which is the only temporal fact an evaluator needs.

The `tool` field carries a **registered id taken from the definition**, or the
fixed marker `<unknown>`. A model-invented id is never copied into an event,
truncated or otherwise: `tool` is the field an evaluator reads without
suspicion, and an unknown-tool event already says what matters.

### The event source model

Every string in an event comes from one of exactly three places:

1. a **closed enum** the registry declares,
2. a **trusted canonical value** produced by a successful resolution against the
   canonical corpus, or
3. a **fixed system marker** such as `<unknown>`.

"A model-supplied string that passed input validation" is deliberately not a
fourth source. Validation answers whether the executor will accept an argument;
it says nothing about whether the text is safe to store in a diagnostic an
evaluation harness will later read.

**Door one — `eventArguments`.** A per-tool opt-in allowlist over input fields,
admitting only:

- string → a closed `enum`, and nothing else; the emitted text is one of a
  handful of strings the registry wrote, and the model chose only which
- integer → explicit finite `minimum` and `maximum`
- boolean → allowed; there are two values
- object / array → forbidden

The projection re-derives enum **membership** at emission time rather than
trusting that registration checked it.

**Door two — `canonicalEventArguments`.** A declarative `{ eventName:
outputField }` mapping. On success only, the value is read from the tool's own
validated, snapshotted output — for the portfolio tools, a record id read out of
the canonical corpus — and must additionally satisfy the registry's own fixed
canonical grammar. It is declarative rather than a callback so that the event
path stays data: a pair of strings cannot read an environment variable, open a
file, or decide anything. And it exposes nothing new — the value was returned to
the caller in the tool result moments earlier.

**Arguments come from a successful validated result, and nothing else.** The
executor passes both the arguments and the output snapshot to the event recorder
on the success path alone. "The input passed validation" is not sufficient:
validation happens on the way in, and proves only that the argument object was
well-formed — not that the attempt went anywhere. An evaluator reading
`{"status":"timeout","arguments":{"section":"skills"}}` would reasonably infer a
real attempt at that section when nothing came back. The failed attempt is still
recorded in full — tool, call index, status, result code — with `arguments`
empty.

| Case | `status` | `arguments` |
| --- | --- | --- |
| resolved lookup | `success` | `{ "project_id": "<canonical id>" }` |
| valid enum member | `success` | `{ "section": "experience" }` |
| valid identifier, resolved nothing | `success` | `{}` |
| unknown tool | `rejected` | `{}` (and `"tool": "<unknown>"`) |
| invalid arguments | `rejected` | `{}` |
| scope denied | `rejected` | `{}` |
| budget exhausted (per-tool) | `rejected` | `{}` |
| budget exhausted (per-turn) | — | no event at all |
| timeout | `error` | `{}` |
| tool error | `error` | `{}` |
| invalid output | `error` | `{}` |

**Removed: whitespace inference.** The registry used to admit a `pattern` as a
string's justification, proving it "forbids whitespace" by probing a fixed set
of characters. U+2003 EM SPACE walked through: a sentence spelled with em spaces
satisfies any pattern whose only exclusions are the ones somebody thought to
probe. The mechanism is gone rather than extended — a probe list can only ever
be as complete as somebody's memory of Unicode, which is a losing shape for a
security control. QA regression-tests ASCII space, tab, newline, U+00A0, U+2002,
U+2003, U+2009, U+3000, U+200B, U+200C, U+2060 and U+2028, and asserts that no
`pattern` of any shape can make a field event-visible.

**Canonical arguments are better evaluation data.** SINAMA eventually asks "was
the required tool used, with the right arguments". `"SINAMA"`, `"sinama"` and
`"sinama-ai-agent-reliability-lab"` are the same tool target, and recording the
resolved record id makes them compare equal — a stable evaluation identity
rather than a sample of whichever alias the model produced.

### Trust boundary: `canonicalEventArguments` (accepted)

The registry can verify that a canonical source names a bounded output field,
and the projection can verify that the emitted value fits a fixed grammar.
Neither can verify **provenance** — that the field holds a canonically resolved
identifier rather than something the executor copied out of its own input. That
would require the generic registry to depend on the corpus, which it must not.
The gap is accepted as an architectural trust boundary, and closed by rule and
by test rather than by mechanism:

> `canonicalEventArguments` must only reference output fields derived from
> trusted canonical/internal resolution, never echoed model input. Every new
> tool using canonical event arguments requires a QA case proving the emitted
> identifiers belong to its trusted canonical source.

For the Phase 1 tools that case exists: the suite drives `evidence_lookup` over
every public record and asserts that each recorded `entity_id` is an id the
corpus holds, and the adversarial sweep confirms no unresolved identifier
produces one. The canonical source fields are also named apart from their inputs
(`id`, `entity_id` against `project`, `entity`) so a mapping that read input
would not read as a mapping that reads output.

## SINAMA boundary

`/sinama` still emits `"tool_events": []`, and that remains **honest**: no tool
has run. The adapter does not import the registry, and no tool activity is
fabricated because a registry now exists.

The intended boundary, for when Phase 2 lands:

```
public /ajoop-rag        → answer only, schema unchanged
internal RAG metadata    → sanitized tool events
/sinama adapter          → tool_events
```

Tool diagnostics are not exposed on any new public route, and none was added.

## Phase 2 extension points (design only — not implemented)

- `registry.manifest()` is already the shape a native Ollama tool declaration
  needs: id, description, input schema.
- `createToolTurn()` is the loop's outer boundary; a bounded agent loop sits on
  top of it and inherits the 3-call ceiling without having to be correct itself.
- `turn.events()` is what maps to SINAMA `tool_events`.
- Tool results are already inert values, so injecting them into a prompt as
  untrusted data needs no new guard — only a prompt that says so.

None of that exists yet. Phase 2 is a separate pass.

## Corpus encapsulation

`loadPortfolioToolCorpus()` returns lookup functions and an immutable record
list — never the loader's `master`, never the raw knowledge tree, never a
mutable `Map`, and never a `public_on_request` record. Records are deep-copied
and frozen, so nothing downstream can reach back and rewrite the cache; a tool
result cannot mutate its own source.

The cache is a shared promise (safe under concurrent first load) and a failed
load is not cached, so one bad filesystem moment does not poison the process.
QA asserts the tool corpus is exactly the set RAG retrieval would hold.

## Testing

```bash
npm run qa:ajoop:tools
```

The gate is **mandatory**, not optional: it runs inside `npm run qa` (via
`qa:portfolio`) and inside `qa:ajoop:release`. QA resolves the npm script graph
transitively and asserts the suite is reachable from both, so removing it breaks
a test rather than quietly removing a gate.

No network, no Ollama, no Qdrant. The suite runs against the **real** canonical
corpus — a fixture corpus would prove the plumbing and nothing about whether a
project lookup returns the project — and asserts registry rejections, immutable
metadata, executor absence from the manifest, strict validation, scope denial,
both budgets, timeout, throw normalization, malformed-output rejection, alias
resolution, on-request exclusion, event safety, and that the RAG path, the
bridge and the SINAMA adapter are unchanged.
