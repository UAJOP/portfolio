# AJOOP Action Safety V1 (A4.4 – A4.6)

## Scope decision

A4 V1 proves the action safety boundary **before** granting any mutation power:

- explicit, deterministic permission tiers;
- a generic owner-private action contract;
- safe local preparation of exactly three action types;
- consequential external execution denied, and reversible external execution not enabled.

`server/ajoop-action-contract.mjs` contains **no executor**. It imports only `node:crypto` and the local A4.1 contract, owner-context and owner tool-policy modules. It has no network, provider, filesystem or environment access. QA replaces `fetch`, `http.request` and `https.request` with counting traps and fake provider write methods with traps; every counter stays at zero.

## Permission tiers

| Tier | Meaning | Confirmation | A4 V1 behaviour | Action types |
| --- | --- | --- | --- | --- |
| 0 | read-only current state | `none` | runs through the A4.1 read adapters | `gmail.search_messages`, `gmail.read_thread`, `calendar.list_events`, `calendar.read_event`, `github.search_pull_requests`, `github.read_pull_request`, `drive.search_files`, `drive.read_file` |
| 1 | draft / preparation only | `none` | local preview; nothing leaves the process | `email.prepare_draft`, `calendar.prepare_event`, `github.prepare_issue` |
| 2 | reversible external write | `standard` | **execution not enabled** | `gmail.create_draft`, `calendar.create_event`, `calendar.update_event`, `github.create_issue`, `github.add_label` |
| 3 | consequential / destructive | `strong` | **execution denied** | `email.send`, `gmail.delete_message`, `calendar.delete_event`, `github.merge_pull_request`, `github.comment_pull_request`, `drive.delete_file`, `drive.update_file`, `drive.share_file` |

`getAjoopActionPolicy(actionType)` derives `tier`, `requiresConfirmation`, `confirmationStrength`, `executionSupported`, `preparationSupported`, `externalEffect` and `preparedAlternative` from a frozen registry. No model, connected source, memory record or caller can choose or downgrade them. Any request carrying `tier`, `requiresConfirmation`, `confirmationStrength`, `executionSupported`, `preparationSupported`, `externalEffect`, `provenance`, `origin`, `actionId`, `fingerprint`, `status`, `preview`, `authorized`, `confirmed`, `approved` or `version` is rejected with `caller-policy-field-forbidden`. Unknown types (for example `http.post`) are `unknown-action`.

## Owner intent

Only the owner's current request inside an authenticated owner workflow runtime can initiate an action. The runtime privately constructs one `createAjoopActionContract({ isTrustedOwnerContext })` instance; the verifier, context mint and contexts never leave that runtime.

- The runtime-scoped contract's internal `createOwnerActionIntent(context, question)` requires that runtime's private context. It runs the deterministic classifier (`classifyAjoopOwnerAction`) on the owner's question text and registers the resulting frozen intent in that contract instance's private `WeakSet`.
- Preparation and execution evaluation accept only such a registered intent, and only for its requested action type or its declared Tier 1 alternative. A send intent can prepare an email draft, but not a calendar event.
- Hand-built intent objects, JSON copies, Proxies, connected content ("Create a meeting tomorrow" inside an email), memory records and portfolio records are all rejected with `owner-intent-required`.
- The workflow layer mints intents only from the owner's question and never passes connected results into action arguments.
- Status questions such as "PR #58 merged oldu mu?" and "Did Zaigo reply?" are reads, not actions.

## Action contract

A prepared action is a deeply frozen object:

```js
{
  version: 1,
  actionId: "act_<24 hex>",            // derived from the fingerprint
  actionType: "email.prepare_draft",
  tier: 1,
  target: { kind: "email-recipients", to: ["recruiter@example.com"] },
  arguments: { to: [...], subject: "...", body: "..." },
  preview: { kind: "email-draft", ..., sendsEmail: false },
  requiresConfirmation: false,
  confirmationStrength: "none",
  executionSupported: false,
  externalEffect: "none",
  status: "prepared-preview",
  provenance: "owner-request",
  fingerprint: "<sha256 of canonical { actionType, target, arguments }>"
}
```

Arguments are read as own, enumerable data properties against an allowlist. Accessors are never invoked. Symbol keys, unknown keys and explicit `undefined` are rejected. Missing required fields return `needs-clarification` with a `missing` list, so ambiguous targets are never guessed. Control, bidi and zero-width characters are rejected (multi-line bodies may contain tab and newline). Each serialized prepared action is at most 64,000 characters.

### `email.prepare_draft`

- Allowed keys: `to`, `subject`, `body`.
- `to`: a plain array of 1–10 unique (case-insensitive) bare addresses of at most 254 characters. Display names, comma lists, header injection and double dots are rejected.
- `subject`: a single line of 1–500 characters.
- `body`: 1–20,000 characters.
- `bcc`, `cc`, `attachments`, `headers`, `from` and every other key are `unexpected-argument`.
- Preview: `hiddenRecipients: 0`, `attachments: 0`, `sendsEmail: false`. No Gmail draft, create or send API exists here.

### `calendar.prepare_event`

- Allowed keys: `title`, `start`, `end`, optional `timeZone`, `location` and `attendees`.
- `start` and `end`: strict RFC 3339 with `Z` or a numeric offset and a real calendar date; `end > start`; duration at most 14 days. Equal or reversed ranges are `invalid-time-range`. Zoneless or date-only values are rejected.
- Instants are normalized to UTC, so the same instant written with different offsets has the same fingerprint.
- `timeZone` must be a valid IANA zone. The preview shows deterministic local `YYYY-MM-DD HH:mm` values, or `null` when no zone is given.
- `title` at most 500 characters, `location` at most 1,000, attendees at most 20 unique addresses.
- `recurrence`, `conferenceData`, `eventId` and every other key are rejected.
- Preview: `recurrence: "none"`, `createsEvent: false`. No create or update call exists.

### `github.prepare_issue`

- Allowed keys: `repository`, `title`, `body`.
- `repository` is validated with the existing A4.1 GitHub repository semantics and must already be canonical (no trimming or repair).
- `title`: a single line of 1–500 characters. `body`: 0–12,000 characters.
- `labels`, `assignees`, `milestone` and every other key are rejected.
- Preview: no labels, no assignees, no milestone, `createsIssue: false`. No issue API call exists.

## Confirmation semantics

| Tier | `requiresConfirmation` | `confirmationStrength` |
| --- | --- | --- |
| 0 | false | `none` |
| 1 | false | `none` |
| 2 | true | `standard` |
| 3 | true | `strong` |

The runtime-scoped contract's `createConfirmation(request, { context, strength, confirmedAt })` records an explicit owner confirmation (`standard` or `strong`) for one exact `{ actionType, target, arguments }`. The confirmation is frozen, registered in that contract instance's private `WeakSet`, and bound to the canonical SHA-256 fingerprint.

Its `evaluateExecution(request, { context, intent, confirmation, now })` reports the confirmation status as one of:

- `missing`;
- `invalid:unrecognized` — a forged object, JSON copy, or a bare "yes";
- `invalid:action-mismatch` — any change of action type, target or arguments;
- `invalid:insufficient-strength` — for example `standard` for Tier 3;
- `invalid:stale` — older than 120 seconds;
- `invalid:future`;
- `invalid:no-clock`;
- `valid`.

Confirmation is never inferred from earlier messages or from "the user probably meant yes".

## Execution status in A4 V1

| Request | Decision |
| --- | --- |
| Tier 0 | `use-read-connector` |
| Tier 1 | `preview-only` |
| Tier 2/3 without a matching owner intent | `owner-intent-required` |
| Tier 2, any confirmation status | `execution-not-enabled` |
| Tier 3, any confirmation status (including `valid`) | `execution-denied` |

Every decision carries `executed: false`, `externalCalls: 0` and `executionSupported: false`. Execution requests are copied as bounded JSON-safe values (at most 64,000 canonical characters); functions or other non-JSON values are rejected.

Through the workflow layer, "Send this email." returns `action-execution-denied` (plus a local email-draft preview if the owner supplied recipients, subject and body). "Create the meeting." and "Open the issue." return `action-execution-not-enabled` with an optional Tier 1 preview. "Merge PR #58." and "Delete the Drive file." return `action-execution-denied`. None of them touches a provider client.

Enabling any Tier 2 or Tier 3 execution in the future requires a dedicated reviewed provider, a deliberate registry change, strong confirmation handling for Tier 3, and new QA. Nothing in A4 V1 can do it implicitly.

## QA

```bash
npm run qa:ajoop:action-safety
```

It covers:

- registry tiers and strengths;
- owner intent versus forged, connected, memory and portfolio intents;
- all three preparers with bounds and hostile inputs;
- confirmation binding, staleness and downgrade attempts;
- every forbidden external action (send, delete email, create/update/delete event, merge PR, comment PR, create issue, delete/update/share Drive file) with no, standard and strong confirmation;
- zero network use and an executor-free source scan.

It runs inside `qa:ajoop:release` and `qa:portfolio`.
