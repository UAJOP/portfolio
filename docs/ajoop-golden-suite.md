# AJOOP golden evaluation suite

Operational reference for `scripts/qa-ajoop-golden.mjs` and
`scripts/fixtures/ajoop-golden-cases.json`.

## Purpose

The per-layer suites prove each part of the agent obeys its own contract. This
one asks whether the **composition** lands in the right place for a real
visitor sentence:

```
planner → tool selection → canonical arguments → tool execution
  → trusted-context attribution → RAG grounding → validation/fallback
  → SINAMA event projection
```

It adds **no hooks to `server/*`**. Every observation comes from surfaces the
bridge already uses: the `internal` sidecar returned by `createAjoopAgent`, its
aggregate counters, and the SINAMA adapter's already-sanitized `tool_events`.

## Running

```bash
npm run qa:ajoop:golden          # deterministic, offline, agent mode=on
npm run qa:ajoop:golden:live     # real local Ollama, 3 runs per case
npm run qa:ajoop:golden:http     # boundary subset against a running bridge
```

Direct invocation for anything more specific:

```bash
node scripts/qa-ajoop-golden.mjs --cases=B-01,E-01      # one or more case ids
node scripts/qa-ajoop-golden.mjs --mode=shadow          # off | shadow | on
node scripts/qa-ajoop-golden.mjs --live --runs=5        # override run count
node scripts/qa-ajoop-golden.mjs --output=report.json   # machine-readable
```

`--output` writes only where you point it. Without it the runner writes
nothing — no transcripts, no default file, nothing into `docs/`.

`--http` targets `AJOOP_GOLDEN_BRIDGE_URL` (default `http://127.0.0.1:8787`).
It never starts or stops a bridge; run one yourself first.

## Coverage model — 46 cases

| code | category | n | detects |
|------|----------|---|---------|
| A | exact facts | 5 | deterministic route lost; agent compute on a bypass case |
| B | project lookup | 5 | wrong `project_id`; project isolation break |
| C | profile / skills | 4 | wrong `section`; context overflow to fallback |
| D | evidence / experience | 4 | wrong `entity_id`; unresolvable entity |
| E | general, zero tool | 4 | false tool fire; GENERAL quarantine breach |
| F | ambiguous wording | 3 | scope misclassification (`sınama` vs SINAMA) |
| G | multi-turn follow-up | 3 | history drift; subject loss; scope flip |
| J | rejection / malformed | 3 | refusals stop being refusals; malformed retried |
| K | injection / fake calls | 3 | prose or history becoming an executable call |
| L | grounding / sources | 2 | answer cites what did not ground it |
| M | repair / fallback | 2 | repair path dies; fallback masks a break |
| O | English locale | 2 | locale-specific regressions |
| P | typo / alias | 2 | alias → canonical id resolution loss |
| Q | SINAMA projection | 4 | unsanitized field; success attributed to unpacked result |

Tool-selection correctness, canonical-argument correctness and Turkish handling
are **cross-cutting dimensions**, asserted inside B/C/D/F/L/O/P rather than
given their own buckets. 32 cases are Turkish, 14 English.

## A4 companion suite

Connect-and-act behaviour is evaluated separately by `scripts/qa-ajoop-a4-golden.mjs` with `scripts/fixtures/ajoop-a4-golden-cases.json` (`npm run qa:ajoop:a4-golden`). That runner does not modify this suite, its cases, or its counts.

A4 routing is deterministic policy rather than a scripted planner, so its offline connector selection measures the real system. It covers:

- connector-needed routing;
- no-connector routing (general, portfolio, canonical fact, conversation);
- clarification instead of guessed targets;
- runtime-private owner authority, forged-auth denial and cross-runtime isolation;
- deterministic current-state truth despite an injected malicious generator;
- Turkish and English multi-sender clarification with zero reads;
- prompt injection from connected content;
- Tier 3 send/delete/merge denial;
- Tier 1 preview-only preparation.

It uses fake providers with write traps and network traps, and runs in `qa:ajoop:release` and `qa:portfolio`. See `docs/ajoop-owner-connected-workflows-v1.md` and `docs/ajoop-action-safety-v1.md`.

## Fixture schema

Canonical identifiers only. Never factual values, never expected model prose.
The corpus, registry and resolvers stay the single source of truth, and the
runner validates every id in this file against them before any case runs — a
typo fails as a typo instead of surfacing later as a "wrong tool".

```jsonc
{
  "id": "B-01",
  "category": "project_lookup",
  "locale": "tr",
  "question": "…",
  "history": [] | { "use": "B-01" } | { "turns": [ {role, content} ] },

  "expect": {
    "scope": "portfolio",
    "answer_mode": "portfolio-project",   // must exist in ANSWER_MODES
    "exact_fact": "contact:github",       // must exist in buildExactFacts()
    "tool": "portfolio.project_lookup",   // must exist in the registry
    "tool_input": { "project": "SINAMA" },// what the scripted planner sends
    "arguments": { "project_id": "project:sinama" }, // canonical EVENT args
    "tool_required": true,
    "tool_forbidden": false,
    "source_entity": "project:sinama",
    "min_sources": 1,
    "max_sources": 0,
    "max_generation_attempts": 2,
    "sinama_event_count": 1,
    "sinama_event_statuses": ["rejected"]
  },

  "policy":  { "fallback": "allowed|forbidden", "repair": "allowed|forbidden" },
  "review":  { "manual": true, "checklist": ["grounded", "correct project"] },

  "planner": "expected|none|unknown-tool|invalid-arguments|malformed",
  "model":   "ok|repair-then-ok|always-invalid",
  "modes":   ["deterministic"],           // omit to run everywhere
  "sinama":  true,                        // drive through the /sinama adapter
  "http_boundary": true,                  // include in the --http subset
  "forbidden_source_entity": "project:sinama",
  "known_divergence": { "contracts": [...], "reason": "…", "filed": "…" }
}
```

`tool_input` must satisfy the **real** tool schema
(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$`) and resolve through `resolveRecord`.
Multi-word names such as `"Merge Rush"` are rejected by the registry before
execution — use the slug (`merge-rush-tiny-factory`) or the canonical id.

## Deterministic vs semantic

**Deterministic contracts** are machine-checked and can fail the run. They come
in two severities:

- `safety` — one violation fails, always, in every mode. Wrong tool, wrong
  canonical argument, forbidden tool executing, an unknown key on the public
  body, unsanitized SINAMA event, cross-entity grounding, budget escape, wrong
  exact fact, injected text reaching the system role, prose becoming an
  executable call, a dropped result being attributed. Never majority-voted.
- `hard` — ordinary correctness. Majority-voted in live mode only.

**Semantic review** items are never machine-failed. They are printed under
`HUMAN REVIEW REQUIRED` with a short checklist, and listed in the JSON report.
Prose is never string-matched into a pass or fail.

### What deterministic mode does *not* prove

Offline the planner is **told** which tool to call. "Expected tool accuracy"
would therefore measure the fixture, not the system, so the runner reports it as
`n/a (scripted)` and only computes it under `--live`. What offline mode does
assert is that the dictated call survives schema validation and executes
(`tool.scripted_call_executes`), that arguments project to canonical ids, and
that attribution and sanitization hold.

## Offline vs live

| | deterministic (default) | live (`--live`) |
|---|---|---|
| planner | fixture | real local model |
| model | stub | real local model |
| network | none | Ollama only |
| runs per case | 1 | 3 (`--runs=N`) |
| flake budget | none — every hard contract is 1/1 | majority per hard contract |
| proves | architecture | planner judgment |

Live mode issues one discarded warm-up turn so latency percentiles describe
steady state rather than first planner load.

## Hard-fail vs flake policy

Live only:

- **Majority-tolerant** (`hard`): 2 of 3 passes the case, and the case is
  recorded in `Flaked (majority)` and in the JSON `flakes` array. Covers tool
  selection where a no-tool outcome is safe, semantic review, validator repair,
  fallback occurrence, answer completeness.
- **Zero-tolerance** (`safety`): a single occurrence fails the case and the run.
  A missing expected tool counts as a *missed* selection (majority-tolerant); a
  **wrong** tool is a safety failure even once.

An isolated allowed fallback is reported, not treated as an architecture
failure — that is what keeps the known-stochastic profile/skills case from
turning the suite into noise while the `fallback_rate` metric still surfaces it.

## Known divergences

A `known_divergence` keeps a contract the suite still believes in while
production does not yet deliver it. Bending the fixture to match today's output
would make the suite permanently blind to that behaviour.

Guardrails: it must name the exact contracts and carry a written reason, it is
printed in its own section on every run rather than folded into the pass count,
it appears in the JSON report, and it **can never downgrade a `safety`
contract**.

Currently open:

- `PHASE-3.1-DIVERGENCE-1` (case `E-03`) — a bare technology name that is also a
  catalogued skill (`C#`) pulls a general-knowledge question into portfolio
  scope with 4 sources, although `selectAnswerStrategy()` classifies it as
  `general`. Needs an owner decision: fix the routing, or accept and retire the
  divergence.

## Public boundary

`PUBLIC_BODY_KEYS` in the runner is an **allowlist**, and containment against it
is the load-bearing assertion: `Object.keys(body) ⊆ PUBLIC_BODY_KEYS`. A new
field — `plannerDebug`, `rawPrompt`, anything — hard-fails until somebody adds
it deliberately. The internal-name denylist is kept only as defence in depth, so
that a leak is easy to diagnose; it decides nothing. The same allowlist applies
to the `--http` subset, which additionally proves a non-ASCII Turkish question
survived transport.

## Manual review workflow

1. Run the suite. Anything under `HUMAN REVIEW REQUIRED` needs eyes.
2. For each case, read the answer and check its listed items — grounded,
   coherent, correct project/person, no unsupported claim, follow-up preserved
   context.
3. Record the verdict wherever the release checklist lives. The runner
   deliberately does not persist answers.

Reviewing a single case: `node scripts/qa-ajoop-golden.mjs --cases=G-01 --live`.

## Metrics

Printed as a `METRICS` block on every run and mirrored into `--output` JSON.
Every value is derived from RUNTIME observations — `agent.metrics()` deltas, the
response body, and contract outcomes — never from counting how many fixtures
declare a contract. Live repetitions each contribute their own observations, so
live fallback and repair rates are real.

| metric | numerator / denominator |
|---|---|
| `exact_fact_hit_rate` | exact-fact hits (right id, 0 generations) / exact-fact cases |
| `expected_tool_accuracy` | correct tool selections / tool-required opportunities — **live only**; `n/a (scripted)` offline |
| `forbidden_tool_rate` | forbidden executions / forbidden-tool opportunities |
| `canonical_argument_accuracy` | correct canonical args / executed expected-tool calls |
| `planner_failure_rate` | `planner_failures` / `planner_attempts` |
| `malformed_planner_rate` | `planner_malformed` / `planner_attempts` |
| `tool_rejection_rate` | `tool_rejected` / `tool_attempts` |
| `tool_error_rate` | `tool_errors` / `tool_attempts` |
| `grounded_answer_rate` | correct source entity / cases asserting one |
| `fallback_rate` | fallback answers / generated answers |
| `validator_repair_rate` | repaired answers / generated answers |
| `followup_coherence_rate` | follow-ups passing their machine contracts / follow-ups having any |

**Zero applicable observations ⇒ `null` in JSON and `n/a` in the terminal.**
There is no `denominator || 1` anywhere: a fabricated 0% reads as a clean bill of
health, which is exactly the lie an evaluation suite must not tell. A follow-up
whose coherence is purely a human judgement contributes to neither side of
`followup_coherence_rate`.

Live adds `latency.{exact_fact,portfolio,general}.{p50,p95}`, split so a 40 ms
deterministic fact answer never flatters a 16 s portfolio generation.
Percentiles are **nearest-rank without interpolation**, so at the default
`runs=3` a p95 normally equals the maximum observation. No external telemetry.

## Adding a case

1. Add the object to `ajoop-golden-cases.json` using an existing id prefix.
2. Use only canonical identifiers; verify `tool_input` resolves and matches the
   schema pattern.
3. Run `node scripts/qa-ajoop-golden.mjs --cases=<id>`.
4. If it needs human judgment, add `review.manual` with a checklist rather than
   asserting on prose.
