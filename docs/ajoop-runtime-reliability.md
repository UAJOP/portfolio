# Ajoop local runtime reliability

## A5.2.2 foundation

`npm run ajoop:runtime:start` starts the local runtime supervisor. It owns a
loopback-only control listener (`127.0.0.1:8790` by default), discovers an
already healthy Ollama and bridge before starting anything, and exposes only a
sanitized machine-readable status through `npm run ajoop:runtime:status`.

The control listener is the singleton mechanism. A second supervisor reports
`supervisor-already-running`; an unrelated process occupying the control port
reports `control-port-occupied`. Neither occupant is terminated.
The CLI validates the fixed supervisor identity and schema before accepting
status or sending stop. This protects against accidental local port collisions;
it is not intended to authenticate against a malicious same-user process.

The supervisor can stop a process only when it spawned that process and still
holds its live child handle. A PID in `.ajoop-runtime/supervisor/status.json`
is diagnostic only. External Ollama and bridge processes remain running when
the supervisor stops. The tunnel/public edge is always external and is never
spawned, searched for, restarted, or stopped here.

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

The shipped bridge health response carries a stable service/protocol marker and
the active generation and embedding model names. An external bridge must match
all four values. Bridge listen conflicts use a dedicated exit result so the
supervisor can report `bridge-bind-conflict` without waiting for the readiness
deadline or touching the process that owns the port.

The public browser health contract remains unchanged. A future slice should
close the known distinction between bridge/index readiness and generation
model functionality, add bounded crash recovery, and define a reviewed
launcher/tunnel policy. Real Windows acceptance still requires an operator to
exercise cold starts, port conflicts, sleep/reboot, and externally managed
services.
