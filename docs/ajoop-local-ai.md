# Ajoop local AI bridge

Ajoop answers deterministically from canonical portfolio data. This optional
bridge lets a **local** Ollama model restate an already-computed answer in
natural language, grounded in the evidence Ajoop 4.2 produced.

The model never supplies portfolio facts. It receives the evidence and is
instructed to present only that.

```
kaanbalci.com → HTTPS edge/tunnel → 127.0.0.1:8787 Node bridge → 127.0.0.1:11434 Ollama
```

**The bridge is never a dependency.** It ships disabled. When it is off,
unreachable, busy, slow or returns something malformed, Ajoop shows the
deterministic answer it had already rendered. The portfolio is fully usable with
this machine switched off — that is its normal state.

## Why n8n left the public path

Ajoop 4.3 routed the browser through a local n8n webhook. n8n can persist
execution data, which includes the visitor's question. A local n8n 2.37.7
verification retained a probe marker **even with** `saveManualExecutions: false`,
`saveDataSuccessExecution: "none"`, `saveDataErrorExecution: "none"` and the
corresponding global flags set. An assistant on a public site must not slowly
accumulate a transcript of what strangers asked it.

Ajoop 5.0 replaces that hop with a small, dependency-free Node service in
`server/`: it holds a request in memory for the length of one generation and
writes nothing, anywhere.

`automation/n8n/ajoop-local-ai.template.json` is retained and marked
**LEGACY / LOCAL EXPERIMENTATION — NOT THE PUBLIC AJOOP REQUEST PATH**. Nothing
the site loads points at it.

---

## 1. Start Ollama

```bash
ollama serve
ollama pull qwen3:4b   # only if it is missing
```

Ollama listens on `http://127.0.0.1:11434`. **Leave it on loopback.** Nothing
outside this machine should reach port 11434, now or after a tunnel exists —
publish the bridge, never Ollama.

> **`think: true` is deliberate and load-bearing.** With `think: false` qwen3
> streams *untagged* chain-of-thought straight into `message.content` — a
> visitor would read "Hmm, the user is asking…" as Ajoop's answer, and no tag
> stripping can catch it because there are no tags. `think: true` makes Ollama
> put reasoning in a separate `message.thinking` field, which the bridge reads
> never and returns never. If `message.content` nevertheless contains a
> `<think>` marker, the bridge rejects the whole optional answer; trying to
> recover text around malformed tags would create a false security guarantee.
> `/no_think` in the prompt does not work here.
>
> The system prompt is deliberately terse. An earlier version with eight
> prohibitions made the model ruminate past its token budget and return nothing.
>
> For lower latency, a non-reasoning instruct model (`qwen2.5:3b-instruct`,
> `llama3.2:3b`) skips the thinking phase. Set `AJOOP_AI_MODEL`; no code change.

## 2. Start the bridge

```powershell
$env:AJOOP_AI_ALLOWED_ORIGINS = "https://kaanbalci.com,http://localhost:4173"
npm run start:ajoop:bridge
```

```
Ajoop bridge listening on 127.0.0.1:8787/ajoop
Ajoop bridge model qwen3:4b · 2 allowed origin(s)
```

That is the entire log surface. No request content is ever printed.

## 3. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `AJOOP_AI_ALLOWED_ORIGINS` | `https://kaanbalci.com,http://localhost:4173` | Browser origins allowed to call the bridge. Never `*`. |
| `AJOOP_AI_PORT` | `8787` | Listen port. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Loopback Ollama. |
| `AJOOP_AI_MODEL` | `qwen3:4b` | Model tag. |
| `AJOOP_AI_TIMEOUT_MS` | `45000` | Abort a generation after this. |
| `AJOOP_AI_MAX_BODY_BYTES` | `65536` | Hard request-body cap. |
| `AJOOP_AI_MAX_QUESTION_CHARS` | `500` | Rejects oversized questions before inference. |
| `AJOOP_AI_MAX_EVIDENCE` | `3` | Evidence cards passed to the model. |
| `AJOOP_AI_MAX_CONCURRENT` | `1` | Simultaneous generations. A second one gets 429. |
| `AJOOP_AI_RATE_MAX` | `20` | Generations per window. |
| `AJOOP_AI_RATE_WINDOW_MS` | `60000` | Rate window. |
| `AJOOP_AI_TEMPERATURE` | `0.2` | Low, because the model is restating, not composing. |

An empty allowlist resolves to the shipped defaults, **never** to "allow
everyone" — the one interpretation that would turn a typo into an open relay.
The listener and route are fixed at `127.0.0.1` and `/ajoop`; environment
variables cannot turn the bridge into a `0.0.0.0` listener or expose another
route. Numeric settings are parsed strictly and bounded; malformed or unsafe
values fall back to the defaults.

`http://localhost:4173` is included intentionally for the local preview server.
An allowed browser origin is echoed exactly, credentials are never enabled, and
`Vary: Origin` is sent with that response. A non-browser request without an
`Origin` header gets no CORS header. The in-process rate guard is deliberately a
single fixed-size global counter: it trusts neither `X-Forwarded-For` nor any
other visitor-controlled identity header. CORS is not authentication, so the
release edge must enforce its own network-level abuse controls too.

## 4. Point Ajoop at it

Edit `ajoop-ai-config.js` **locally**:

```js
window.KAAN_AJOOP_AI = {
  enabled: true,
  endpoint: "http://127.0.0.1:8787/ajoop",
  timeoutMs: 30000,
  retryAfterMs: 60000,
};
```

> Keep `enabled: false` and `endpoint: ""` on the committed file. It is public,
> served to every visitor, and is not a place for a secret. A committed
> localhost endpoint would make every visitor's browser attempt a loopback
> request that only ever fails.

## 5. Test

```bash
# health — never wakes the model
curl -s -X POST http://127.0.0.1:8787/ajoop \
  -H "Content-Type: application/json" -H "Origin: http://localhost:4173" \
  -d '{"version":1,"mode":"health"}'
# → {"ok":true,"model":"qwen3:4b"}

# grounded generation
curl -s -X POST http://127.0.0.1:8787/ajoop \
  -H "Content-Type: application/json" -H "Origin: http://localhost:4173" \
  -d '{"version":1,"question":"Why is SINAMA strong evidence?","locale":"en",
       "grounding":{"evidence":[{"title":"SINAMA — AI Agent Reliability Lab",
       "summary":"A reliability lab for repeatable multi-turn agent testing.",
       "tags":["FastAPI","PostgreSQL"],
       "proof":["14-scenario typed cross-vertical suite"]}],"comparison":null}}'
# → {"ok":true,"answer":"…","model":"qwen3:4b"}
```

**Check the answer invents nothing** — no user counts, no revenue, no dates, no
employers that were not supplied.

Then stop the bridge and ask Ajoop something. You should get a normal
deterministic answer with evidence cards intact, no error and no spinner. That
is the whole point; verify it deliberately, not by accident.

`npm run qa:ajoop:bridge` covers every branch above with no network, no Ollama
and no socket.

## 6. Contract

Request (the browser payload, built by `buildAjoopAiPayload()` from
`serializeAjoopEvidence()` — there is no second evidence collector):

```json
{ "version": 1, "question": "...", "locale": "en|tr|de|es|fr",
  "intent": "...", "entity": "...", "facet": "...", "depth": "normal",
  "grounding": { "evidence": [...], "comparison": null } }
```

Success: `{ "ok": true, "answer": "...", "model": "qwen3:4b" }`
Health: `{ "ok": true, "model": "qwen3:4b" }`
Failure: `{ "ok": false, "error": "short reason" }`

| Status | When |
|---|---|
| 400 | invalid JSON, unsupported version, bad locale, question > 500, no grounding |
| 403 | origin not on the allowlist |
| 404 | any path other than `/ajoop` |
| 405 | any method other than POST/OPTIONS |
| 413 | body over the cap |
| 415 | POST body is not `application/json` |
| 429 | already generating (`busy`), or over the rate window (`rate limited`) |
| 502 / 503 / 504 | Ollama unreachable, missing, malformed, or timed out |

No failure body carries a stack trace, a prompt, a local path, an environment
value, Ollama's own response or its port. The browser treats every `ok: false`,
timeout, CORS failure, non-JSON body and empty answer identically: keep the
deterministic answer. A 429 is the one failure that does **not** count toward
the bridge's unavailability streak — a bridge that says "not now" is a healthy
bridge, and a visitor typing quickly should not be able to talk it into looking
offline.

## Privacy

The browser and Node bridge persist **no visitor conversation data**.
`sessionStorage` holds only structured routing metadata (intent, entity ids,
facet, depth), exactly as in 4.0–4.2.

The Node bridge is stateless by construction:

- no question, evidence, prompt or answer is written to disk
- no request history, no database, no analytics event
- nothing is logged but the startup line and generic error codes
- the rate guard is in memory and resets on restart, because a counter that
  survived a restart would be state the bridge promised not to keep

When AI mode is on, the visitor's question **is transmitted** through the
configured HTTPS edge to the local bridge, which forwards it to local Ollama.
The Node and Ollama processes stay on the operator's machine, but a hosted edge
or tunnel may process the request before it reaches them. Its request-body
logging and retention must therefore be disabled and verified before release.

`scripts/qa-ajoop-bridge.mjs` asserts the logging guarantee directly: it drives
a request carrying a marker string through success and failure paths with the
console captured, and fails if the marker, the evidence, the prompt or the
answer appears anywhere in it.

## Release step: the HTTPS edge

`endpoint` is intentionally empty in the committed config and **no tunnel
provider, URL or secret is committed**. Exposing the bridge is a release
decision, made once the implementation is approved:

1. Put an HTTPS edge in front of `127.0.0.1:8787` — any tunnel or reverse proxy.
2. Add the site origin to `AJOOP_AI_ALLOWED_ORIGINS`.
3. Set `enabled: true` and `endpoint` to the HTTPS URL in `ajoop-ai-config.js`.
4. Keep Ollama on loopback. Publish the bridge, never port 11434.
5. Disable and verify request-body logging/retention at the edge or tunnel.
6. Add rate limiting at the edge as well — the bridge's own guard protects the
   GPU, not the uplink.

When the machine is off the health probe fails and the site serves deterministic
Ajoop. Nothing to switch off, nothing to deploy.
