# Ajoop local AI bridge

Ajoop answers deterministically from canonical portfolio data. This optional
bridge lets a **local** Ollama model restate an already-computed answer in
natural language, grounded in the evidence Ajoop 4.2 produced.

The model never supplies portfolio facts. It receives the evidence and is
instructed to present only that.

```
kaanbalci.com → HTTPS edge/tunnel → 127.0.0.1:8787 Node bridge → 127.0.0.1:11434 Ollama
```

**The bridge is never a dependency.** When it is off, unreachable, busy, slow or
returns something malformed, Ajoop shows the deterministic answer it had already
planned. The portfolio is fully usable with this machine switched off.

## What changed in 5.1

The rest of this document describes the 4.3 `/ajoop-chat` endpoint, which is
still shipped by `server/ajoop-bridge.mjs` and still covered by
`npm run qa:ajoop:bridge`. The path the browser actually uses is now
`/ajoop-rag` in `server/ajoop-rag.mjs`. Two things about it differ from
everything below.

**Retrieval replaced grounding.** The browser no longer serializes evidence and
asks the model to restate it. It sends the question, the locale and a bounded
in-memory conversation history; the bridge retrieves from the canonical
portfolio JSON itself and decides, per turn, whether the question is
`PORTFOLIO` or `GENERAL`. There is no intent gate in front of the model — every
ordinary typed turn is eligible for generation, while Brief 3 makes the
portfolio retrieval context conditional. A general question is answered as
ordinary conversation without exposing portfolio records. The bridge has no
web access and says so rather than guessing when a question needs live data.

**The lifecycle inverted.** 4.3 rendered the deterministic answer and let the
model overwrite it, which showed the visitor two answers per turn. 5.1 opens one
container in a thinking state, plans the deterministic answer without showing
it, and commits once — model prose when the bridge answers, the deterministic
plan when it does not. Canonical cards, links and provenance still come from the
registry and are attached to a `PORTFOLIO` answer only; a `GENERAL` answer is
prose and nothing else. One turn is one container in `js/ajoop/assistant.js`
(`openAjoopTurn` → `finishAjoopTurn`); `js/ajoop/rag-client.js` is the
DOM-free request source and reuses the transport in `js/ajoop/ai-bridge.js`.

The cost of that inversion is that a turn waits for the bridge instead of
showing a deterministic answer instantly. It is bounded by `timeoutMs` in
`ajoop-ai-config.js`, and an unreachable bridge fails once and then
short-circuits on its own backoff.

## What changed in 5.2: the canonical knowledge corpus

The retrieval corpus is now two sources built into one in-memory index at
startup by `buildPortfolioChunks()` in `server/ajoop-rag.mjs`:

1. The seven portfolio datasets under `data/portfolio/`, flattened and chunked
   exactly as in 5.1.
2. `data/portfolio/ajoop-master-knowledge.json`, the canonical professional
   knowledge, turned into semantic records by `server/ajoop-knowledge.mjs`.

The master file is **not** a prompt and is never handed to the model whole. It
becomes roughly seventy records of one concept or entity each — `identity`,
`skills:programming`, `experience:cbot`, `project:sinama`,
`certifications:summary`, `github:summary` — so that retrieval returns the fact
a question is about rather than a slab of everything. Each record carries
`entityType`, `visibility`, `priority`, `tags` and `metadata` alongside the
fields every chunk has always had. Brief 3 consumes them for hybrid ranking,
record-family reservation and project affinity without having to rewrite
ingestion.

Two properties are load-bearing and are covered by `npm run qa:ajoop:knowledge`:

**Restricted material is physically absent, not merely discouraged.**
`sanitizeKnowledge()` deletes any node whose `visibility` is not `public` or
`public_on_request` — and any node whose key names a credential — from the
parsed tree *before* a single record exists, so the record builders cannot see
it. An unrecognised visibility marker is treated as restricted, so a new marker
fails closed. Record text is then rendered from an explicit field list rather
than by walking whatever keys are present, which means a key added to the JSON
later reaches the corpus only if someone writes a line for it. Finally
`loadMasterKnowledge()` searches the finished records for every value it
removed and throws if one reappears: a leak takes the index down, and the
browser falls back to its deterministic answers, rather than being served.

**Project entities never merge.** Hospital Form App is C#/.NET/Windows Forms and
Hospital Appointment System is Python/Tkinter/MySQL; SINAMA is Next.js/FastAPI
and Merge Rush is Phaser 3/TypeScript. Each is its own record with its own stack
line, and the tests assert the negative — that neither record contains the
other's stack.

Canonical URLs live in `metadata.links`, never in embedding text, so the
embedding stays about the subject and later evidence UI still has the link. A
project whose repository is private records that fact and offers no link.

The added corpus costs about 1.7s of one-time startup embedding and nothing per
turn: the file is read, sanitized and recordized once. `num_ctx`, `topK` and the
generation token budget are unchanged.

## What changed in 5.2: exact facts and aliases

Two mechanisms sit in front of retrieval. They are deliberately separate, and
neither is an intent router.

**Exact facts** (`server/ajoop-facts.mjs`) answer the questions that have one
right answer — CV, LinkedIn, GitHub, email, phone, location, availability, the
channel headlines, education, GPA, spoken languages, programming languages, the
certificate total, the project-contribution total and the GitHub repository
snapshot. Twenty-two facts, all read out of the sanitized master knowledge:
no factual value is written in code, so editing the canonical JSON changes the
answer. A resolved fact is rendered as localized prose and returned without
retrieval, embedding or generation — measured at a median of 1ms against a
normal turn's ~4s.

The router works by SUBTRACTION rather than keyword presence. The topic phrase
is struck out of the normalized question and the fact fires only if every
remaining word is a question particle. `question.includes("github")` would
answer "GitHub nedir?" with Kaan's profile URL; subtraction leaves `nedir`
standing, which is a content word, so the question falls through to ordinary
retrieval. The same rule is why "Kaan GitHub Actions biliyor mu?" is a skills
question rather than a request for a link. A missed route costs a slower answer;
a false route costs a confident wrong one, so the list of tolerated particles is
short and is not the place to fix a missed question.

`nedir` and `what is` are tolerated only when the question also carries a
possessive — "Kaan'ın LinkedIn'i nedir?" asks for his profile, "LinkedIn nedir?"
asks what LinkedIn is.

**The phone** is the one `public_on_request` fact. It is reachable only by
explicitly asking for a phone, telephone, mobile or `telefon`; "Kaan'a nasıl
ulaşırım?" resolves to a different fact that offers email, LinkedIn and the
portfolio and never the number.

That gate would be worth little on its own, because ordinary retrieval ranks by
cosine similarity and similarity has no notion of consent: a question that never
asked for a number could still rank the on-request chunk into the model's
context and have it read back out in prose. So **`public_on_request` records are
excluded from semantic retrieval entirely**. They are still embedded and still
part of the canonical corpus — `chunks` counts them, `retrievableChunks` does
not — but the ranking loop never sees them, and the only way to reach on-request
material is the narrow deterministic route that requires an explicit ask.

The cost is that the other on-request record, Kaan's interests outside work, is
no longer reachable from ordinary questions either. That is the intended trade:
on-request means a person decides, and a retrieval score is not a person.

**Aliases** (`server/ajoop-entities.mjs`) index the master's own
`aliases_and_typos` so `linkdin`, `git hub`, `c sharp`, `dot net`, `sinamayı`
and `cbot'ta` reach the right records. This is RETRIEVAL ONLY: the visitor's
message is never rewritten, and canonical names are appended to the embedding
query alone, so the model still reads what was actually typed.

There is no fuzzy matching — no edit distance, no near-miss scoring, because
that is how `sinema` becomes SINAMA. The only tolerance is curated aliases plus
a bounded Turkish suffix (`ajoop-text.mjs`), which is what lets `GitHub'ı`,
`sertifikası` and `üniversitelerde` match without letting anything else in.

Four entities are **context-sensitive**: GitHub, LinkedIn, C# and .NET are
things visitors ask ordinary general questions about, so their names alone do
not resolve. "GitHub nedir?" and "C# nedir?" reach general generation with no
embedding and no canonical tail; "Kaan GitHub Actions biliyor mu?", "c sharp
ile ne yaptı?" and "Kaan'ın LinkedIn deneyimi nasıl?" resolve because the
question independently says it is about his work. Only these four are gated — SINAMA,
CBOT and Merge Rush are not subjects of general conversation, and gating every
alias would cost recall for nothing. A bare "GitHub" or "linkdin" is still
answered, by the exact-fact route, before retrieval is involved.

The signals that open that gate are deliberately independent of the entity they
license: "github" and "repo" are not among them, or naming GitHub would be its
own excuse for pulling in Kaan's records.

One further ambiguity rule exists, and it is small: `sınama` with the dotless ı
is the ordinary noun "testing", while `sinama` is not a Turkish word at all. A
question using the ordinary-word spelling resolves to the project only if it
also carries a portfolio signal, which is why `ajoop-text.mjs` keeps a second
fold that preserves ı. This governs alias resolution; the eligibility and
ranking policy below separately keeps an ordinary-word question out of the
portfolio corpus.

## What changed in 5.2: retrieval precision and conversation state

`server/ajoop-retrieval.mjs` decides three things before a byte is embedded:
which entities the turn is about, whether portfolio records may be shown at
all, and which records are eligible. The MODEL still chooses PORTFOLIO vs
GENERAL — this is not an intent router in front of it.

**Context eligibility** is the narrow question of whether to retrieve. Semantic
similarity is deliberately not one of the reasons: an explicit entity, an
explicit professional framing, or a genuine follow-up are. That is what finally
fixes "sınama ve değerlendirme arasındaki fark nedir", which used to rank SINAMA
chunks on lexical closeness and come back scoped as a portfolio answer. It is now
GENERAL with zero retrieval and zero embedding calls. A definition frame with no
entity is never eligible, so "proje yönetimi nedir?" stays general despite
containing a professional noun.

**Project isolation is a filter, not a penalty.** When the visitor names SINAMA,
Merge Rush's records are removed from the candidate set, so no similarity score
can put a Phaser stack into a SINAMA answer. Records belonging to no project —
skills, positioning, recruiter evidence — are cross-cutting and stay eligible.
Naming two projects lifts the lock for both, so a comparison sees both. Chunk
affinity is derived once at startup from each chunk's source, id, title, tags and
structural identifiers such as `detailSlug` or build-log `area`, never from its
body prose. That is why a record that merely mentions four projects in prose
belongs to none of them, while the legacy `projects/hospital` card remains owned
by Hospital Form App.

Organizations work the same way; technologies deliberately do not. Naming C#
boosts relevance without locking to one project, because C# legitimately spans
several.

**Reserved slots** solve a problem a weight could not. "Kaan hangi şirketlerde
çalıştı?" shares almost no vocabulary with "CBOT — AI Designer", so the embedding
can rank every experience record below unrelated ones — which is how a question
with a good answer in the corpus came back as "the portfolio does not record it".
Mapping the framing to a record TYPE is a structural guarantee, and it needs no
hardcoded career facts. A work-history overview expands the usual four-record
window just enough to include one chunk from every canonical role (currently six
roles across five organizations); an internship question reserves the matching
internship role first. An explicitly named entity instead reserves slots for its
own records.

**History is now two separate things.** The retrieval query is the current
question plus canonical entity names and nothing else — raw prose from earlier
turns is never concatenated in, which is what made a new question embed as a
continuation of the old one. Generation history is sent only for a genuine
follow-up; a self-contained question gets none, so "RAG nedir?" after a
dollar-rate refusal reads as if it were the first thing anyone asked.

**Only user turns establish entity memory.** An assistant message is text this
system generated, and letting it set conversational state means the model's own
guess about the subject becomes the reason the next turn retrieves those records
— a loop with no ground truth in it. The inheritance walk stops at the first
self-contained user question that named no entity, so
"SINAMA nedir? → RAG nedir? → peki neden önemli?" does not reach back past the
RAG question.

Per-turn cost is unchanged: an exact fact still costs nothing upstream, a
quarantined general question costs one generation and no embedding, and a
portfolio turn costs one embedding and one generation. Hybrid ordering combines
semantic similarity with bounded entity, lexical, canonical-source and requested
record-family bonuses; no second model or reranker call exists.

Brief 2's privacy boundary remains intact: `public_on_request` records are still
removed before semantic ranking, the phone remains available only through its
explicit exact-fact route, and a self-contained turn receives no earlier model
answer that could replay a sensitive value.

## What changed in 5.2: answer quality and evidence

`server/ajoop-answer.mjs` is the pure policy layer after the Brief 3 retrieval
plan. It selects a small answer mode (`general`, project, experience,
comparison, self, follow-up or recruiter), supplies a short mode-specific
instruction to the same generation call, validates the reply and chooses the
evidence the browser may show. It does not ingest knowledge, embed text or
change candidate eligibility.

Recruiter questions are classified by question type — fit, hire, strengths,
gaps, risk, differentiation, best role, environment or supporting evidence —
and by a small role family. Forward Deployed, Applied AI, Software Engineering
and AI Product questions receive different canonical record combinations from
the index already built at startup. The answer instruction asks for a
bottom-line assessment, concrete evidence, the best-fit environment and a real
unknown or thin area. It also prohibits numeric fit scores, guaranteed hiring
claims and seniority not established by the records. This is reusable decision
support, not one hardcoded answer per role.

**Retrieved sources and displayed evidence are separate.** `sources` is the
complete set of records the answer was allowed to use; `retrievedSources` is
the semantic retrieval diagnostic; `evidence` is the compact UI selection.
Evidence is filtered by active project or organization, ordered toward
canonical records, deduplicated by logical entity and capped at two or three
cards normally and four for recruiter answers. Build-log chunks yield to a
canonical project record. Links come only from structured `metadata.links`;
the model's prose is never mined for a URL. Exact facts return one canonical
record, and GENERAL always returns an empty evidence list.

The browser validates this additive `evidence` contract and matches selected
entities to its existing rich cards when possible. Otherwise it renders a
small text-only record card with the server-supplied canonical title and
summary. A model answer no longer inherits every card and link from the
deterministic plan, so its prose and its displayed proof stay aligned. Older
bridge responses that omit `evidence` retain the previous deterministic-card
fallback.

**Generation has a bounded quality gate.** The parser requires exactly one
`SCOPE` and one `ANSWER` marker and rejects an empty or overlong answer instead
of truncating a claim. The validator additionally rejects an unexpected scope,
extra contract text, repeated sentences/paragraphs/phrases, residual reasoning
or meta-commentary, obvious language-template leakage, and the narrow
contradiction where an answer denies a requested stack or experience field
that is explicitly present in its records.

A rejected draft is never shown. The bridge makes at most one repair call with
the same retrieved context and a compact prompt; it never embeds again and
there is no third generation. If repair also fails, a localized deterministic
fallback names only the allowed portfolio record titles, or asks the visitor
to retry for a GENERAL question. Raw drafts, prompts and validator internals
stay server-side; the response exposes only attempt count and short diagnostic
flags for testing.

TR, EN, DE, ES and FR have localized fallback copies. Generated answers are
explicitly requested in the selected locale, while company, project and
technology names remain the canonical text in their records. The successful
path still costs one chat call: zero embeddings for GENERAL, one for portfolio
and recruiter questions. Only a malformed answer pays for the second chat;
pure JavaScript validation adds no network step.

The deterministic suite for this layer is `npm run qa:ajoop:answer`. It covers
answer modes, recruiter role families, evidence alignment and deduplication,
contract/repetition/contradiction guards, all five fallback locales, exact-fact
evidence, one-retry enforcement and no-second-embedding behavior without a
network or Ollama.

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
