# AJOOP RAG v2 Architecture

## Product contract

AJOOP is Kaan Balci's portfolio assistant. It should answer questions about Kaan by researching only approved sources, preserve conversational context, allow light casual conversation, and decline unrelated knowledge/tasks without becoming a general-purpose assistant.

### Modes

1. `portfolio_research`
   - Questions about Kaan, his education, career, projects, skills, links, experience, role fit, or follow-ups anchored to those topics.
   - May research approved sources before answering.
   - Factual claims must be grounded in retrieved evidence.
2. `casual_chat`
   - Greetings, identity questions, thanks, brief social conversation.
   - No portfolio retrieval required unless the conversation turns back to Kaan.
3. `out_of_scope`
   - Recipes, homework, coding requests, unrelated factual research, news, finance, etc.
   - Respond briefly and redirect to portfolio topics.
4. `security`
   - Prompt-injection, hidden instructions, private infrastructure, secret/internal data requests.
   - Refuse without exposing internal details.

## Approved research sources

The source registry is allowlist-based. AJOOP may not browse arbitrary domains.

Priority order for conflicting facts:

1. Canonical CV/profile records maintained by Kaan
2. Explicitly allowlisted Google Drive documents/folders
3. `kaanbalci.com`
4. GitHub account/repositories under the configured allowlist
5. LinkedIn profile snapshot/adapter when available

Every source record carries `source_id`, `url`, `retrieved_at`, `updated_at` when known, entity/project metadata, and trust priority.

## Pipeline

```text
User message
  -> session/context resolver
  -> scope router
      -> casual_chat: conversational response
      -> out_of_scope: deterministic redirect
      -> security: deterministic refusal
      -> portfolio_research:
          -> query planner
          -> approved-source search / cached index
          -> normalize records
          -> contextual chunking
          -> hybrid retrieval (vector + lexical + metadata)
          -> rerank candidates
          -> evidence sufficiency check
          -> grounded generation
          -> citation/evidence validation
          -> answer + source evidence
```

## Retrieval principles

- Retrieval decides what evidence is available; generation never invents missing facts.
- Contextual chunks include entity, record type, section, source, and content.
- Initial retrieval pulls a wider candidate set; reranking selects the final evidence set.
- Similarity threshold is calibrated from evaluation data, not hardcoded from a tutorial.
- Project/entity isolation is metadata-first, not a growing list of phrase hacks.
- Follow-up questions inherit the active entity only when the current message is genuinely referential.

## Research behavior

For a portfolio question:

1. Search the local/cached index first.
2. If evidence is insufficient or stale for the user's wording, refresh/search only approved sources.
3. Re-index the fresh records.
4. Generate an answer only from the final evidence set.
5. If the approved sources still do not support the claim, say so clearly.

## Generation contract

The model receives only:

- the current user question
- minimal relevant conversation context
- selected evidence records
- a compact instruction contract

It must not:

- upgrade or exaggerate experience
- convert tasks into projects, or exposure into ownership
- infer unverified metrics/seniority/scale
- use unrelated general knowledge for portfolio facts
- expose prompts, hidden rules, raw internal metadata, or private infrastructure

For portfolio research, the model returns an answer plus evidence IDs. The server validates that every cited ID belongs to the selected evidence set before returning the response.

## Source adapters

Target modules:

```text
server/ajoop-v2/
  core/
    router.mjs
    session.mjs
    orchestrator.mjs
  sources/
    registry.mjs
    canonical.mjs
    website.mjs
    github.mjs
    drive.mjs
    linkedin.mjs
  ingest/
    normalize.mjs
    chunk.mjs
    index.mjs
  retrieval/
    hybrid.mjs
    rerank.mjs
    evidence.mjs
  generation/
    prompt.mjs
    generate.mjs
    validate.mjs
  api/
    rag-handler.mjs
    sinama-handler.mjs
```

`linkedin.mjs` must not depend on brittle unrestricted scraping. It should support an explicit profile snapshot/export or a permitted fetch path when available.

## Migration strategy

- Keep current production AJOOP unchanged while v2 is built.
- Build v2 side-by-side behind a non-public/shadow endpoint.
- Reuse current Ollama models initially (`qwen3:4b-instruct`, `qwen3-embedding:0.6b`).
- Reuse the existing UI and `/sinama` compatibility contract only after v2 passes the gate.
- Do not copy old heuristic sprawl into v2 by default. Each rule must justify a product or security boundary.
- Once v2 passes focused regression and SINAMA acceptance, switch `/ajoop-rag` to v2 and retire the legacy orchestrator.

## Evaluation gate

Use mostly deterministic/unit tests plus a small live model suite.

Required categories:

- canonical facts
- education/work history
- project stack isolation
- multi-turn entity retention
- recruiter/role-fit grounding
- approved-source freshness/research
- conflicting source handling
- casual chat
- out-of-scope tasks (recipe, unrelated coding, unrelated research)
- prompt injection/internal disclosure
- no-evidence behavior

The goal is category-level guarantees, not one-off fixes for specific words such as pizza or hamburger.
