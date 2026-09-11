# Ajoop local runtime reliability

## A5.2.3 recovery and readiness hardening

`npm run ajoop:runtime:start` starts the local runtime supervisor. It owns a
loopback-only control listener (`127.0.0.1:8790` by default), discovers an
already healthy Ollama and bridge before starting anything, and exposes only a
sanitized machine-readable status through `npm run ajoop:runtime:status`.

The control listener is the singleton mechanism. A second supervisor reports
`supervisor-already-running`; an unrelated process occupying the control port
reports `control-port-occupied`. Neither occupant is terminated.
Only the instance that acquired the listener writes the shared diagnostic
status file. Requests must carry the exact configured IPv4 loopback Host and
port; missing or malformed Host values receive `400`, while a syntactically
valid foreign host or wrong port receives `421`. Malformed request targets also
receive a bounded `400`, without stopping the listener or exposing an error.
The CLI validates the fixed supervisor identity and schema before accepting
status or sending stop. This protects against accidental local port collisions;
it is not intended to authenticate against a malicious same-user process.

The supervisor can stop a process only when it spawned that process and still
holds its live child handle. A PID in `.ajoop-runtime/supervisor/status.json`
is diagnostic only. External Ollama and bridge processes remain running when
the supervisor stops. The tunnel/public edge is always external and is never
spawned, searched for, restarted, or stopped here; A5.2.4 below only observes
the public route.

Startup verifies the generation and embedding model tags from the actual bridge
and RAG runtime defaults before bridge startup. Missing models produce a
category-specific failure and never trigger a pull. Qdrant is optional: a
memory backend or a safely reported degraded backend does not block
`localReady`.

There is no automatic restart loop in this slice. An owned child exit changes
the status to `failed` and does not respawn it. Shutdown uses the same owned
child cleanup path for CLI signals and the local `stop` command. Windows may
only terminate the exact owned child process handle; no process-tree or
executable-name kill is attempted.
Synchronous spawn throws use the same sanitized component-specific failure as
asynchronous spawn errors, create no ownership record, and clean up only any
earlier child handle owned by this supervisor. A repeated `start()` while
`starting` shares that attempt; while `ready` it reports current readiness; and
after `failed` it reports the current failure instead of an earlier success.
Once the same supervisor instance is `stopping` or actually `stopped`, a new
start is rejected; explicit recovery requires a fresh supervisor instance or
process.

Owned child stdout and stderr use independent, stateful line framers. A normal
line is buffered across arbitrary stream chunks and inspected only when its
newline or EOF arrives. Credential-like header, assignment, bearer, and OAuth
JSON syntax is replaced before operator output; harmless diagnostic vocabulary
is preserved. A line exceeding 1,024 characters emits one fixed marker, drops
its buffered prefix, and discards through the next newline, keeping state
bounded and preventing a late credential from leaking. Raw child output is
never retained in the status file. Spawn errors and startup exits invalidate
the active startup generation, so an older readiness continuation cannot
restore `ready`.

All `start`, `status`, and `stop` commands load `.env.local` through the same
path. Explicit process environment keys win; absent keys are filled from the
private file; validated defaults apply last. Values and file contents are never
printed. Status writes are serialized in transition order. A reset connection
is treated as evidence of an unknown occupant, not an unused port, so the
supervisor does not spawn over it.

The shipped bridge health response carries a stable service/protocol marker and
the active generation and embedding model names. An external bridge must match
all four values. Bridge listen conflicts use a dedicated exit result so the
supervisor can report `bridge-bind-conflict` without waiting for the readiness
deadline or touching the process that owns the port.

The public browser health contract remains unchanged. A future slice should
close the known distinction between bridge/index readiness and generation
model functionality and add bounded crash recovery. Real Windows acceptance
still requires an operator to exercise cold starts, port conflicts,
sleep/reboot, and externally managed services.

## A5.2.4 observe-only public reachability

A5.2.4 is **observe only**. The Cloudflare named tunnel `ajoop` is owned by the
Windows Scheduled Task `\AJOOP Tunnel`, which launches it at user logon and
applies its own retry policy. The tunnel forwards
`https://ajoop.kaanbalci.com/ajoop-rag` to the bridge origin
`http://127.0.0.1:8787`.

### Authority

The supervisor may only send a bounded, credential-free HTTPS request to the
public route and report what it saw. It never starts, stops, restarts, or adopts
the tunnel. It does not enumerate processes, query or change Scheduled Tasks,
read tunnel configuration or credential files, call a Cloudflare API, or change
DNS. The process-termination rule above is unchanged: A5.2.4 adds no process
authority, and no public result can create ownership. `components.tunnel` is
always `ownership: "external"` with `pid: null`, whatever the input.

### `localReady` is not `publicReachable`

- `localReady` means the local Ollama models, the bridge and the runtime are
  ready.
- `publicReachable` means a bounded HTTPS request through the public route
  reached the expected AJOOP bridge identity.

Neither value is derived from the other. A reachable public identity whose
health body reports `ready: false` is still `publicReachable: true`, because
readiness is local truth.

| Situation | `localReady` | `publicReachable` | `components.tunnel.state` |
|---|---|---|---|
| Not READY yet, failed, stopping or stopped | `false` | `null` | `not-checked` |
| READY, first public probe has not settled | `true` | `null` | `not-checked` |
| READY, expected identity through the public route | `true` | `true` | `reachable` |
| READY, DNS, connect or TLS failure | `true` | `false` | `unreachable` |
| READY, deadline exceeded (headers or body) | `true` | `false` | `timeout` |
| READY, HTTP 502, 503, 504 or 520 to 530 | `true` | `false` | `edge-error` |
| READY, JSON object without the expected identity or models | `true` | `false` | `identity-mismatch` |
| READY, redirect, non-JSON, oversized, non-object JSON or any other non-2xx | `true` | `false` | `malformed` |

`publicCheckedAt` is the time of the last applied observation, or `null`
whenever `tunnel.state` is `not-checked`. The status sanitizer derives all
three public fields from the tunnel state, and only while the runtime is READY.
The tunnel states describe the observed **public route**. They make no claim
about a cloudflared process, its PID, or the Scheduled Task.

### Probe

`probePublicBridge` sends `POST {"version":1,"mode":"health"}` with only
`Content-Type: application/json`. It sends no Origin, Authorization, Cookie,
question or owner field, so the bridge answers it in RAG admission's health
branch, before planner, model, tools and connectors run.

The target is fixed to `https://ajoop.kaanbalci.com/ajoop-rag` and cannot be
changed through the environment. An HTTP target, or one with userinfo, is never
requested and reports `not-checked`.

The response is read under a single deadline that covers headers and body,
with a 64 KiB cap enforced while the body streams. The read is cancelled as
soon as the cap is exceeded, so a chunked body without Content-Length cannot
grow unbounded. Redirects are never followed. Identity validation uses the same
predicate as the loopback bridge probe: service, protocol version, `rag` mode,
field types, and matching generation and embedding models.

### Scheduling

- The first probe is scheduled only after READY, and READY never waits for it.
- Probes then re-arm with `setTimeout` every 300 s. The next timer is armed
  only after the current probe settles, so at most one probe is ever in flight.
- Leaving READY (failed, stopping or stopped) starts a new observation
  generation, clears the next timer, and resets the public fields.
- A probe that settles for an older generation is discarded before it mutates
  or persists anything, so a late success cannot overwrite failed or stopped
  truth.
- A public failure never changes `state`, `localReady`, `lastError`, models, or
  the Ollama and bridge components.

### Operator caveats (external, not fixed in code)

- The tunnel and bridge tasks start only at user logon, not at boot, and end at
  logoff.
- The two tasks share a logon trigger and have no ordering or dependency. The
  tunnel can connect before the bridge listens; public requests then fail with
  an edge error until it does.
- Both tasks are configured not to start on battery and to stop when the
  machine switches to battery.
- Ollama currently has no autostart owner. A connected tunnel therefore does
  not mean AJOOP is locally ready.
- Whether Task Scheduler restarts a cloudflared process that crashes after a
  successful launch is externally owned and unverified.

### Live acceptance precondition

Live A5.2.4 acceptance has not been run. The production bridge that was running
on 8787 during the audit predates the A5.2.3 identity markers, so a strict
public probe truthfully reports `identity-mismatch` against it. The identity
check is intentionally not weakened. Live acceptance requires the production
bridge to run a build that contains the current identity markers (A5.2.3 or
current main), under a separate explicit deployment gate.
