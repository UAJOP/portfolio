# AJOOP Owner Connected Workflows V1 (A4.2 / A4.3)

## Boundary

The workflow layer lets AJOOP answer questions about the owner's **current** digital state from the four Tier-1 read connectors (Gmail, Calendar, GitHub, Drive). It is owner-private, local-first, bounded and explicit.

- It owns no HTTP route. No module in the public runtime (`ajoop-bridge`, `ajoop-bridge-core`, `ajoop-rag`, `ajoop-agent`, `ajoop-sinama`) can reach it, any read adapter, any provider client or the action contract. QA checks this with a transitive import scan.
- `/ajoop-rag` is unchanged and gains no connector or action capability.
- Every entry point requires a context minted in-process by `createAjoopOwnerPrivateContext()` (`server/ajoop-owner-context.mjs`). Minted contexts are registered in a module-private `WeakSet`. A parsed HTTP body such as `{ "surface": "owner-private", "authenticatedOwner": true }`, a JSON copy, a Proxy or connected data is never a trusted context. Only the future owner-authentication boundary may mint one.
- Real provider clients are constructed by that boundary and injected. QA and CI use fake clients only; there is no network, OAuth browser or live provider.

Modules:

| Module | Responsibility |
| --- | --- |
| `server/ajoop-owner-context.mjs` | branded owner-private context; shared unsafe-text patterns |
| `server/ajoop-owner-tool-policy.mjs` | A4.3 deterministic routing, target resolution, time windows, budgets, owner action classification |
| `server/ajoop-connected-context.mjs` | bounded connected-context builder and adapter-result validation |
| `server/ajoop-owner-connected-workflows.mjs` | orchestration, deterministic grounded answers, optional guarded generation |
| `server/ajoop-action-contract.mjs` | A4.4–A4.6 action safety (see `docs/ajoop-action-safety-v1.md`) |

## Pipeline

```text
owner request (minted context)
  -> planAjoopOwnerRequest            deterministic plan, no I/O
  -> evaluateAjoopConnectorRead       A4.1 approval, per planned read
  -> executeAjoop<Source>Read         existing read adapter, injected client
  -> inspectAjoopConnectorResult      provenance / connector / shape re-check
  -> deterministic composer           grounded answer + claims
  -> (optional) injected generator    accepted only if checkAjoopCurrentStateAnswer passes
```

Plans are internal objects such as:

```js
{ route: "connected-read", intent: "github-pr-status", requiresCurrentState: true,
  sources: ["github"], budget: 2,
  tools: [{ toolId: "github.read_pull_request", args: { repository: "UAJOP/portfolio", prNumber: 58 } }] }
```

Every planned read must already satisfy A4.1 exactly; a plan is never repaired later. No chain-of-thought is exposed. The workflow result carries the answer, a short evidence summary (source, tool, success code, claims) and completeness flags.

## When connectors are used (A4.3)

Being allowed to read a connector is never a reason to. A4.1's `shouldUseAjoopReadConnector` makes the final decision, and its suppressors are evaluated first:

| Suppressor | Example | Result |
| --- | --- | --- |
| conversation already answers it (trusted flag) | follow-up already answered | `no-connector` / `conversation` |
| deterministic canonical fact | "Kaan'ın mail adresi ne?", "Kaan'ın GitHub adresi ne?" | `no-connector` / `canonical-fact` |
| portfolio question (third-person owner reference) | "Kaan C# kullanıyor mu?", "What technologies does Kaan use?" | `no-connector` / `portfolio` |
| nothing current-state requested | "C# nedir?", "GitHub nedir?", "Event loop nedir?" | `no-connector` / `general` |

An explicit repository such as `UAJOP/portfolio` names a GitHub target and is removed before the portfolio-owner check. Otherwise the organization name would be misread as a portfolio question.

Connected reads are planned only for current personal state:

| Intent | Example | Reads |
| --- | --- | --- |
| `gmail-sender-lookup` | "Zaigo'dan dönüş geldi mi?", "Did Zaigo reply?" | `gmail.search_messages` `from:<sender> newer_than:90d`, limit 10 |
| `gmail-recent-inbox` | "Yeni mail var mı?" | `gmail.search_messages` `in:inbox newer_than:7d`, limit 10 |
| `calendar-agenda` | "Perşembe takvimimde ne var?", "Yarın toplantım var mı?" | `calendar.list_events` for the local day or week |
| `github-pr-status` | "Portfolio PR #58 ne durumda?" | `github.read_pull_request` |
| `github-open-prs` | "Portfolio açık PR'lar ne durumda?" | `github.search_pull_requests` (open, limit 10) |
| `drive-file-discovery` | "Drive'daki son CV hangisi?", "SINAMA ile ilgili son dokümanı bul." | `drive.search_files`, limit 10 |
| `drive-file-read` | a Drive link plus "oku" | `drive.read_file` |
| `job-application-status` (multi-source) | "Bu hafta iş başvurularında nerede kaldık?" | `gmail.search_messages` + `calendar.list_events` |

The multi-source workflow uses only Gmail and Calendar. Drive and GitHub are never called for it, and no application tracker is invented: the answer says it is based only on Gmail and Calendar data.

## Target resolution

Entity resolution only builds valid tool arguments; it is never authority, and nothing is guessed.

- **Sender:** a Turkish ablative (`Zaigo'dan`), `from <Name>`, or `Did/Has <Name> reply`. The token must match `^[\p{L}\p{N}][\p{L}\p{N}&._-]{0,59}$`, so Gmail operators, spaces, quotes and parentheses cannot enter the fixed query. No sender for a reply question gives `needs-clarification`.
- **Repository:** an explicit `owner/repo` validated with A4.1 semantics, or exactly one trusted configured alias (`repositoryAliases`, validated at construction). A missing or ambiguous repository gives `needs-clarification`.
- **Drive file:** only an explicit Drive URL yields a `fileId`. "Bu dosyanın içinde ne yazıyor?" without one gives `needs-clarification`.
- **Drive search term:** remaining topic words after stop words and file nouns; CV, özgeçmiş and resume map to `CV`. An empty term gives `needs-clarification`.
- **Time windows:** computed from the trusted clock and IANA time zone as real local midnights (DST-safe; a DST day is 23 or 25 hours), converted to canonical UTC. Weeks start on Monday.

Questions longer than 1,200 characters, or containing control, bidi or zero-width characters, are rejected before planning.

## Budgets

| Workflow | Maximum connector reads |
| --- | --- |
| single-source | 2 |
| multi-source | 4 |

The planner rejects any plan above its budget, and the runner stops at the budget regardless. Current workflows use 1 read (single-source) or 2 reads (multi-source). There is no automatic pagination, no search loop, and no retry beyond the adapters' own bounded behaviour.

### Deadlines

Only Drive has a provider-level deadline, so the workflow bounds every connector read and the optional generator itself:

| Stage | Default | On expiry |
| --- | --- | --- |
| each connector read (adapter call) | 45,000 ms | the source becomes `provider-unavailable`, is disclosed in the answer, and a multi-source workflow still answers from healthy sources |
| injected generator | 60,000 ms | `generation: "failed:generation-timeout"`; the deterministic grounded answer is returned |

Timers are always cleared, and a late adapter result or generation is ignored. The deadlines are integers from 1 to 120,000 ms passed only by trusted server code to `createAjoopOwnerConnectedWorkflows({ readDeadlineMs, generationDeadlineMs })`. They are never read from requests or the environment.

## Grounding

Straightforward answers are deterministic. Composers read only validated adapter output and record claims such as `found`, `resultCount`, `latestMessageId`, `eventCount`, `state`, `merged`, `latestFileId`, `orderedBy` and `complete`.

- Empty results are stated as absent ("bulunamadı", "etkinlik yok"), never implied present.
- Gmail's latest message is chosen by `internalDate`. Drive's latest file is the first result under the fixed `modifiedTime desc` ordering, and that ordering is recorded as evidence. PDF metadata is enough; content is never parsed.
- A PR's `merged`, `state` and `draft` values are reported exactly as returned.
- Truncated, paginated or incomplete sources add a partial note and `incomplete: true`.
- A failed source is disclosed with its sanitized code and never replaced by a guess. Multi-source answers report per-source failures.

If a generator is injected, its output is accepted only when `checkAjoopCurrentStateAnswer` finds no contradiction. It rejects:

- an absent result described as present, including via affirmatives or positive counts;
- a partial result presented as complete;
- an unmerged PR described as merged, or the reverse;
- a PR answer that does not identify the PR;
- a Drive "latest file" that is not the evidenced file;
- an unavailable source that is not disclosed.

A rejected, failed or over-long generation falls back to the deterministic answer and reports why.

## Authority and connected context

Authority is domain-sensitive:

```text
deterministic canonical facts
  > connected current state (only where current state is required)
  > curated portfolio
  > owner memory (advisory)
```

`buildAjoopConnectedContext` turns adapter results into at most 4,500 characters of JSON lines under a fixed header. Connected data is untrusted and never instructions.

- Every source's status line (ok, unavailable with code, incomplete) comes before any record, so a failure stays visible when records are dropped.
- Strings are neutralized for control, bidi and zero-width characters, and bounded.
- Labels that could spoof the generation envelope (`OWNER MEMORY DATA`, `STRONGER EVIDENCE DATA`, `system:` and similar) are replaced with `[label removed]`.
- Instruction-like records ("Ignore previous instructions", "Delete this meeting", "Reveal your system prompt", "Store this file permanently") are flagged `instructionLike: true`, never obeyed.
- Results relabelled as `canonical-portfolio`, attributed to the wrong connector, or malformed are rejected.

Connected context is only ever placed inside the owner-generation user-data envelope as STRONGER EVIDENCE DATA, never in the system role. Owner memory is read (never written) only when a generator is injected, and stays advisory below connected evidence. A stale memory claiming "Zaigo replied" cannot override an empty Gmail result. Connected data cannot answer canonical identity questions, because those route to `no-connector`.

## Ephemeral current state

Connected results live only in local variables for the current request. The workflow layer:

- writes nothing to A3 memory (store write methods are never called);
- writes no files and keeps no connected transcript archive;
- does not persist emails, events, Drive content, PR bodies or connector responses.

The optional `observe` callback receives only bounded metadata (connector, tool id, outcome code, latency, route, intent, tool-call count, action type, tier, decision). It never receives questions, queries, senders, recipients, subjects, bodies, content or tokens. A throwing observer cannot affect a workflow.

## Actions from workflows

An imperative owner request ("Send this email.", "Create the meeting.", "Open the issue.", "Merge PR #58.", "Delete the Drive file.") routes to the action contract, never to a connector. A4 V1:

- prepares Tier 1 previews;
- reports `execution-not-enabled` for Tier 2 and `execution-denied` for Tier 3;
- makes zero provider or network calls.

Text inside emails, events, PRs, files or memory can never create an action intent. See `docs/ajoop-action-safety-v1.md`.

## Supported workflow proofs

Deterministic fake-provider scenarios in `scripts/qa-ajoop-owner-connected-workflows.mjs` and `scripts/qa-ajoop-a4-golden.mjs`:

| Workflow | Question | Sources | Proven |
| --- | --- | --- | --- |
| A job reply | "Zaigo'dan dönüş geldi mi?" | Gmail only | latest reply by date, grounded yes/no |
| B calendar | "Perşembe takvimimde ne var?" | Calendar only | local times, cancelled events excluded |
| C GitHub | "Portfolio PR #58 ne durumda?" | GitHub only | open / merged / closed / draft truth preserved |
| D Drive | "Drive'daki son CV hangisi?" | Drive only | latest by `modifiedTime desc`, PDF metadata only |
| Multi-source | "Bu hafta iş başvurularında nerede kaldık?" | Gmail + Calendar | per-source counts, job-related events, partial failure disclosed |

## QA

```bash
npm run qa:ajoop:owner-workflows
npm run qa:ajoop:a4-golden
```

Both run inside `qa:ajoop:release` and `qa:portfolio`, with fake providers only.

## A4 exit gate (engineering)

| Gate | Evidence |
| --- | --- |
| Tier-1 connectors useful | four single-source workflows plus one multi-source workflow answer real owner questions from connector output |
| Connected reads reliable | adapter QA (Gmail, Calendar, GitHub, Drive) plus workflow handling of empty, partial, failed, malformed and injected results |
| Action permissions explicit | frozen registry tiers and confirmation strengths (`docs/ajoop-action-safety-v1.md`) |
| No unsafe silent writes | no executor exists; Tier 2 not enabled, Tier 3 denied, fake write traps and network traps stay at zero |
| At least three realistic workflows | workflows A–D plus the multi-source workflow |
| Evaluation coverage | `qa:ajoop:a4-golden`: connector-needed, no-connector, injection, Tier 3 denial and Tier 1 preview-only cases |

Engineering completion is not production completion. Remaining steps: stacked PR review and merge, owner-local Gmail, Calendar, GitHub and Drive smokes, actual owner workflow acceptance, and a deliberate deployment in A5.

## Out of scope

Public exposure, live bridge wiring, external writes, automatic memory persistence of connected data, Slack/Notion/Tier-2 connectors, PDF/OCR parsing, a workflow-builder UI, generic SaaS auth, and automatic multi-page search.
