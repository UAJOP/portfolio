# Ajoop local AI bridge

Ajoop answers deterministically from canonical portfolio data. This optional
bridge lets a **local** n8n + Ollama pair restate an already-computed answer in
natural language, grounded in the evidence Ajoop 4.2 produced.

The model never supplies portfolio facts. It receives the evidence and is
instructed to present only that.

```
browser → n8n webhook → Ollama (loopback) → grounded prose → browser
```

**The bridge is never a dependency.** It ships disabled. When it is off,
unreachable, slow or returns something malformed, Ajoop shows the deterministic
answer it had already rendered. The portfolio is fully usable with this machine
switched off — that is its normal state.

---

## 1. Start Ollama

```bash
ollama serve
```

Ollama listens on `http://127.0.0.1:11434`. **Leave it on loopback.** Nothing
outside this machine should reach port 11434, now or after a tunnel exists.

## 2. Confirm the model

```bash
ollama list
ollama pull qwen3:4b   # only if it is missing
```

> **Two qwen3 behaviours the workflow depends on.** Both were found by live
> testing on an RTX 4050 (model 100% GPU-resident, ~9–15s per grounded answer).
>
> **1. `think: true` is deliberate and load-bearing.** With `think: false` this
> model streams *untagged* chain-of-thought straight into `message.content` — a
> visitor would read "Hmm, the user is asking…" as Ajoop's answer, and no tag
> stripping can catch it because there are no tags. Setting `think: true` is
> what makes Ollama put reasoning in a separate `message.thinking` field, which
> the workflow discards. `/no_think` in the prompt does **not** work here, and
> neither does `/api/generate`.
>
> **2. The answer is plain prose, so read `message.content` directly.** Nothing
> asks the model for JSON, so `Validate Model Output` must not try to parse it
> as JSON. A revision that did returned `empty model response` for *every*
> reply, including correct ones, which silently disabled the whole AI path while
> looking like a model problem. If you change the output contract, change the
> prompt and the Ollama request together.
>
> Prompt length also matters: an earlier system prompt with eight prohibitions
> made the model ruminate past its token budget. The shipped wording is
> deliberately terse — keep it short.
>
> If you want lower latency, a non-reasoning instruct model
> (`qwen2.5:3b-instruct`, `llama3.2:3b`) avoids the thinking phase entirely.
> Set `AJOOP_AI_MODEL`; no code change is needed.

## 3. Start n8n

Run n8n in production mode and keep its listener on loopback. For PowerShell:

```powershell
$env:NODE_ENV = "production"
$env:N8N_LISTEN_ADDRESS = "127.0.0.1"
npx n8n
```

Default UI: `http://127.0.0.1:5678`.

`NODE_ENV=production` is a security requirement, not an optimization. In
development mode, n8n's own JSON parser can include a stack trace and local
installation paths when it rejects syntactically invalid JSON.

## 4. Set the environment variables

Set these for the n8n process before importing (n8n reads them at execution
time):

| Variable | Example | Purpose |
|---|---|---|
| `AJOOP_AI_ALLOWED_ORIGINS` | `https://kaanbalci.com,http://localhost:4173` | Browser origins allowed to call the bridge. Never `*`. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Loopback Ollama. |
| `AJOOP_AI_MODEL` | `qwen3:4b` | Model tag. |
| `AJOOP_AI_MAX_QUESTION_CHARS` | `500` | Rejects oversized questions before inference. |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false` | **Required.** See below. |

An empty allowlist is treated as *misconfigured*, not as "allow everyone".

> **`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` is not optional.** This template is
> configured entirely through environment variables, and current n8n blocks
> `$env` inside nodes by default. Leave the default and the Code nodes see no
> allowlist (every request is rejected as `bridge not configured`) and the
> Ollama nodes cannot resolve their URL.
>
> The Webhook node no longer reads `$env` at all, for a related reason: it
> resolves parameters *outside* a Code node, and a blocked expression there
> throws before the workflow starts — n8n answers
> `HTTP 500 Workflow could not be started!` and the bridge is dead rather than
> degraded. Its `allowedOrigins` is therefore a literal list, governing only the
> CORS/preflight headers; the authoritative origin check stays in
> `Validate Request`, driven by `AJOOP_AI_ALLOWED_ORIGINS`. Edit that literal
> when the site's origins change.

## 5. Import and activate the workflow

Import `automation/n8n/ajoop-local-ai.template.json`, then **Activate** it.

The production webhook is:

```
POST http://127.0.0.1:5678/webhook/ajoop-ai
```

While testing in the editor, n8n exposes `/webhook-test/ajoop-ai` instead, and
only for one execution after you press *Test workflow*.

> **Publish it from the editor UI, not the CLI.** On n8n 2.37.7 the production
> webhook is gated behind the workflow being *published*, which is a separate
> thing from being *active*. `n8n import:workflow` followed by
> `n8n publish:workflow` leaves the workflow active but unpublished — n8n logs
> `Activated workflow …` and still answers `404 Cannot POST /webhook/ajoop-ai`,
> because `workflow_publication_trigger_status` is never populated. Open the
> workflow in the editor and use **Publish** there. Also note that importing a
> workflow with an id that already exists overwrites it *and* clears its
> published state, so re-publish after every import.

## 6. Point Ajoop at it

Edit `ajoop-ai-config.js` locally:

```js
window.KAAN_AJOOP_AI = {
  enabled: true,
  endpoint: "http://127.0.0.1:5678/webhook/ajoop-ai",
  timeoutMs: 12000,
  retryAfterMs: 60000,
};
```

> Keep `enabled: false` on the committed file. This file is public: it is served
> to every visitor and is **not** a place for a secret. A token here would be
> readable by anyone who opens devtools. Access control belongs at the bridge.

## 7. Test health

```bash
curl -s -X POST http://127.0.0.1:5678/webhook/ajoop-ai \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:4173" \
  -d '{"version":1,"mode":"health"}'
```

Expected:

```json
{ "ok": true, "mode": "health", "model": "qwen3:4b" }
```

Open Ajoop and the header should read **✦ AI Enhanced**. Anything else reads
**● Evidence Mode**.

## 8. Test a grounded request

```bash
curl -s -X POST http://127.0.0.1:5678/webhook/ajoop-ai \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:4173" \
  -d '{
    "version": 1,
    "question": "Why is SINAMA a strong Applied AI project?",
    "locale": "en",
    "depth": "normal",
    "grounding": {
      "evidence": [{
        "title": "SINAMA — AI Agent Reliability Lab",
        "summary": "A Turkish-first reliability lab for repeatable multi-turn agent testing.",
        "tags": ["Next.js", "Python", "FastAPI", "PostgreSQL"],
        "proof": ["14-scenario typed cross-vertical suite", "Deterministic tool and workflow contracts"],
        "sources": [{ "kind": "github" }]
      }],
      "comparison": null
    }
  }'
```

Expected: `{ "ok": true, "mode": "ai", "answer": "…", "model": "qwen3:4b" }`.

**Check the answer invents nothing** — no user counts, no revenue, no dates, no
employers that were not supplied.

## 9. Confirm the fallback

Stop Ollama (or n8n) and ask Ajoop something. You should see:

- a normal deterministic answer, with evidence cards intact
- **● Evidence Mode** in the header
- no error, no spinner, no broken conversation

That is the whole point. Verify it deliberately, not by accident.

## 10. Future: public demo topology

```
kaanbalci.com → HTTPS tunnel → local n8n → local Ollama
```

Point `endpoint` at the tunnel URL and add `https://kaanbalci.com` to
`AJOOP_AI_ALLOWED_ORIGINS`. No tunnel provider is assumed or hardcoded.

When the machine is off, the tunnel is down, the health probe fails and the site
serves deterministic Ajoop. Nothing to switch off, nothing to deploy.

Before exposing anything publicly:

- keep Ollama on loopback — publish the **n8n webhook**, never port 11434
- keep the origin allowlist narrow
- add rate limiting at the tunnel or reverse proxy
- the workflow already caps question length and requires grounding

---

## Privacy

Ajoop persists **no** conversation data: not the question, not the answer, not
the evidence text. `sessionStorage` holds only structured routing metadata
(intent, entity ids, facet, depth), exactly as in 4.0–4.2.

When AI mode is on, the visitor's question **is transmitted** to your local n8n,
which is the one thing this feature changes. It is not stored by the browser.

**One operational caveat:** n8n can save execution data, which would include the
question. The shipped template sets `saveManualExecutions: false`,
`saveDataSuccessExecution: "none"` and `saveDataErrorExecution: "none"`, but do
not assume those workflow settings alone guarantee that no data is retained.
Before exposing a tunnel, send a unique probe question, stop n8n, and inspect
both its execution history and its backing database for that marker. A local n8n
2.37.7 verification retained the marker even with the workflow settings and the
corresponding global save flags set to `none`/`false`; treat any such retention
as a release blocker, or adopt an isolated/ephemeral n8n data directory with an
explicit retention policy. Do not use real visitor traffic until this check is
clean.

## Contract

Request:

```json
{ "version": 1, "question": "...", "locale": "tr", "intent": "...",
  "entity": "...", "depth": "normal",
  "grounding": { "evidence": [...], "comparison": null } }
```

Success:

```json
{ "ok": true, "mode": "ai", "answer": "...", "model": "qwen3:4b" }
```

Validated JSON failures use HTTP 200 with a short reason and no stack trace:

```json
{ "ok": false, "error": "no grounding supplied" }
```

Syntactically invalid JSON is rejected earlier by n8n's request parser with
HTTP 422. Keep n8n in production mode so that parser response remains short and
does not expose a stack trace or local paths.

The browser treats every `ok: false`, timeout, CORS failure, non-JSON body and
empty answer identically: keep the deterministic answer.
