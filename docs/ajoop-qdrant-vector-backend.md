# Ajoop 5.3 — persistent vector backend (Qdrant)

Ajoop 5.2 retrieval is an in-memory index built at bridge startup, and it stays
the production source of truth. This brief adds Qdrant Cloud as a **persistent**
vector backend and wires it in **shadow mode first**: the store runs the same
query beside the authoritative index so the two rankings can be compared before
anything is switched over.

Nothing a visitor sees changes.

## Backend modes

`AJOOP_VECTOR_BACKEND` selects one of three. Anything absent, unrecognised,
half-configured, or failing runtime validation resolves to `memory`.

| Mode | Retrieval source | Qdrant failure | Visitor impact |
| --- | --- | --- | --- |
| `memory` | in-memory index (5.2 behaviour) | n/a — never contacted | none |
| `shadow` | in-memory index | recorded, ignored | none |
| `qdrant` | Qdrant candidates, re-ranked by the existing policy | falls back to the memory ranking | none |

Three properties hold in every mode:

- **One query embedding per turn.** The visitor question is embedded once, and
  both retrieval paths read that same vector.
- **One retrieval policy.** Entity isolation, framed-type slot reservation, the
  per-entity cap, the hybrid score, the `public_on_request` exclusion, exact
  facts, the live-data guard, evidence validation and the deterministic fallback
  are unchanged and are applied to *whatever candidates arrive*.
- **Fail closed.** `qdrant` mode does not serve from an unverified corpus; it
  degrades to the in-memory index exactly as `shadow` does.

In `shadow` mode the Qdrant query is deliberately **not awaited**. The visitor is
already waiting on generation, and a slow cluster must not add its latency to a
turn it is not allowed to influence.

## Retrieval parity — correctness first

Ajoop applies its deterministic policy **after** semantic scoring, so a
truncated ANN shortlist is not "slightly different": it can omit the very record
the policy was about to promote, and the two backends then rank differently for
reasons that have nothing to do with the embedding.

So for 5.3 a search is **exact** (`params.exact = true`) and its `limit` is the
**size of the validated active corpus**. There is no tunable shortlist.

Qdrant contributes the candidate **set** and nothing else. Its scores are
discarded and its hit order is discarded; the semantic score is recomputed
locally as `dotProduct(queryVector, localRecord.vector)` — the identical
function the in-memory path uses — so float differences and upstream tie
ordering cannot reach a visitor.

Ranking is then a **total order** with no dependence on input order:

```
finalScore desc → semanticScore desc → canonical ordinal asc → chunk_id lexical
```

The canonical ordinal is each record's position in the local retrieval index,
assigned once. A stable sort alone was not enough: it preserves *input* order
among equals, and the two backends do not share one.

At ~190 public chunks this costs nothing worth measuring. A future large-corpus
release may push deterministic filters into Qdrant and reintroduce ANN, but only
once parity benchmarks exist.

### Every response is checked for completeness

Startup readiness proves the collection *holds* N records. It proves nothing
about what any individual search *returned*. Because the deterministic policy
reserves slots, isolates entities and caps per record, a shortlist missing one
candidate does not produce a slightly different ranking — it can produce a
different answer. So each response must satisfy:

```
raw hits == N · unique chunk ids == N · mapped local records == N
unknown ids == 0 · duplicate ids == 0
```

If any condition fails the candidate set is **discarded whole** and the
authoritative in-memory ranking serves the turn. A partial set is never ranked.
Reason codes: `incomplete-candidate-set`, `unknown-candidate-id`,
`duplicate-candidate-id`.

In shadow mode the visitor answer was already memory's; the failure is recorded
as a comparison error. In `qdrant` mode the turn falls back to memory. Neither
costs a second query embedding — the memory ranking was already computed from
the same vector.

## Architecture

```
canonical Ajoop knowledge (data/portfolio/*.json + ajoop-master-knowledge.json)
        ↓  server/ajoop-knowledge.mjs  (sanitize → semantic records)
        ↓  server/ajoop-rag.mjs        (buildPortfolioChunks — the SAME chunker)
        ↓  unique-chunk-id invariant   (a collision throws, never continues)
        ↓  server/ajoop-embedding.mjs  (qwen3-embedding:0.6b, unit-normalised)
        ↓  server/ajoop-qdrant-ingest.mjs → staged build → alias promotion

user query
        ↓  ONE query embedding
        ├── in-memory ranking            (authoritative in memory/shadow)
        └── Qdrant exact search          (whole active corpus)
                ↓
        the SAME deterministic rankCandidates()
```

There is no second knowledge system. Ingestion imports the existing chunker and
projects each chunk into a point; a payload field is always a chunk field.

## Corpus identity

A chunk id is the corpus primary key, and it must be unique.

Item collections (`build-log.json`, `labs.json`) previously derived identity from
`record.id || record.date || arrayIndex`. Build-log entries had no `id`, three
share `2026-08-23` and three share `2026-08-22`, so **six records collided into
two chunk ids and four canonical records vanished at ingestion**. The in-memory
index hid it — an array tolerates two entries with one id — but a keyed store
does not.

Fixed at the source:

- every `build-log.json` entry now carries a stable kebab-case `id`
  (`react-migration-foundation-v1`, `asset-lcp-optimization-v1`, …)
- `qa-portfolio-data.js` requires those ids to exist and be unique
- the chunker **refuses** an item record with no `id` — no date fallback, no
  index fallback, because neither survives a reorder
- `assertUniqueChunkIds()` throws at corpus build, and `assertUniquePointIds()`
  throws at the ingestion boundary. Never a silent `continue`.

Accounting invariant, asserted against the real corpus:
`public chunks = unique ingestable ids + intentionally excluded records`.

## Ingestion — staged build, atomic promotion

```bash
npm run ajoop:qdrant:ingest              # build, verify, promote
npm run ajoop:qdrant:ingest -- --dry-run # plan only; reads, never writes
```

`ajoop_portfolio_v1` is a logical **alias**. Every build writes a new physical
collection `ajoop_portfolio_v1_<build-id>` and moves the alias onto it:

```
create staging physical collection
      ↓  embed and write the COMPLETE desired corpus
      ↓  write the manifest LAST (the completion marker)
      ↓  validate vector config, owner, schema/index version, point count
      ↓  read/search sanity check through the runtime filter
      ↓  move the alias atomically, in ONE request
      ↓  STOP — the previous collection is reported, never deleted
```

If anything fails before promotion the alias never moves and visitors keep using
the previous complete corpus. The failed staging collection is removed; nothing
else is touched.

This replaces "scan the live collection → upsert → delete stale". That design
mutated what visitors were querying, left an undesigned half-state on a crash,
and its sweep — *delete points not in my desired set* — turned any bug in the
desired set into a command to destroy data.

Build id: `s<schema>i<index>-<corpus fingerprint prefix>-<base36 clock>`, and it
is validated by CONTENT, not shape: the encoded schema version, index version
and fingerprint prefix must each equal what the running process expects, so a
syntactically perfect forgery like `s99i77-000000000000-abc` is refused. Point id:
`uuidv5(namespace, "chunk:" + chunkId)` — stable across runs, machines and
processes.

## Ownership and deletion safety

Every point carries `corpus_owner: "ajoop-portfolio"`, plus `record_kind`,
`build_id`, `schema_version` and `index_version`.

**Ajoop 5.3 deletes no old collection. At all.**

A successful ingestion ends at the alias promotion:

```
create staging → write corpus → write manifest last → verify
→ search probe → atomic alias promotion → STOP
```

Two earlier designs tried to make automatic cleanup safe — first by scanning for
names and manifests that looked owned, then by narrowing to the alias's own
previous target with a strict re-verification. The second was far safer than the
first, and it was still a rebuild that ends by deleting a production collection
based on a check it wrote itself.

The trade is not close. An orphan collection costs a few megabytes and is
removed by a person in one command. A wrong automatic deletion costs data,
silently, when nobody is watching. So the run **reports** what it left behind:

```
previousPhysicalCollection: "ajoop_portfolio_v1_s2i2-…"
cleanupRequired: true
```

and the CLI prints a manual-cleanup notice. Removing an old build is an explicit
operator action taken by someone looking at the cluster.

After a promotion there is **no** deletion, no prefix scanning, no ownership
guessing, no orphan sweeping — and no collection listing either, because nothing
goes looking.

The one deletion that remains is a run removing its **own** staging collection
after its **own** failure, before any promotion. That collection was created
seconds earlier by this process, its name is in a local variable, and no alias
ever pointed at it — direct provenance, not inference.

### Operator maintenance: removing an old build

After a successful ingestion, list collections, confirm the alias resolves to
the new build and that the old one is no longer aliased, satisfy yourself the
new corpus is answering correctly, and only then delete the old physical
collection by name. A future release may add an explicit, opt-in
`ajoop:qdrant:prune` command; it is deliberately not part of 5.3.

## Readiness — remote must equal local

`qdrantReady` does not mean "a client object exists", and it does not mean "the
manifest says the collection is fine". A manifest checked against itself proves
only internal consistency: a stale build, a corpus from another branch, a
half-restored snapshot and a forged collection all pass that test.

The runtime already holds the canonical corpus, so **the local retrieval index
is the source of truth** and readiness is a comparison. At bridge init, three
read-only stages must all pass against the live alias:

**1 — the local descriptor.** Built from `retrievalIndex`:
`expectedCorpusPoints` and an order-independent `expectedCorpusFingerprint` over
sorted, percent-encoded `chunk_id | content_hash | schema_version |
index_version` lines, plus a content hash per chunk id.

**2 — the manifest**, field by field against that descriptor:

```
record_kind = manifest · corpus_owner · valid build_id · parseable built_at ·
complete = true · schema_version · index_version · embedding_model ·
vector_size · distance · corpus_points == LOCAL count ·
corpus_fingerprint == LOCAL fingerprint
```

**3 — every stored point**, read back in one bounded scroll (~191 records) and
checked against the local chunk it claims to be: unique `chunk_id`, every local
id present exactly once, no unexpected record, matching `content_hash`, matching
`corpus_owner`, `build_id` equal to the manifest's, matching schema and index
versions, valid `public_safe`, and `record_kind` = chunk. The remote fingerprint
is then **recomputed from those payloads** — independently of anything the
manifest claimed — and must equal the local one.

Failure codes: `descriptor-missing`, `corpus-exceeds-ceiling`, `missing`,
`unreachable`, `incomplete-scan`, `dimension-mismatch`, `distance-mismatch`,
`named-vectors`, `manifest-missing`, `manifest-malformed`, `owner-mismatch`,
`build-id-invalid`, `build-id-schema-mismatch`, `build-id-index-mismatch`,
`build-id-fingerprint-mismatch`, `built-at-invalid`, `incomplete-build`,
`schema-version-mismatch`, `index-version-mismatch`,
`embedding-model-mismatch`, `empty-corpus`, `corpus-size-mismatch`,
`corpus-fingerprint-missing`, `corpus-fingerprint-mismatch`,
`point-count-mismatch`, `record-kind-invalid`, `point-owner-mismatch`,
`build-id-mismatch`, `point-schema-mismatch`, `point-index-mismatch`,
`public-safe-invalid`, `chunk-id-missing`, `duplicate-chunk-id`,
`unexpected-chunk`, `missing-chunk`, `content-hash-mismatch`,
`payload-fingerprint-mismatch`.

Any of them: `qdrantReady = false`, effective backend `memory`.

The runtime **never creates or repairs** a collection: a request path that could
provision its own store would answer a misconfigured deployment with an empty
index and zero results, which looks exactly like a working system with nothing
to say.

### The candidate ceiling fails closed

`candidateCeiling` (default 4096) is **not** a truncation limit. A corpus larger
than one search may request cannot be retrieved completely, and complete
retrieval is what makes the two backends provably identical. So readiness
refuses `expectedCorpusPoints > candidateCeiling` outright — before any request
is issued — rather than quietly querying 4096 of 5000 records and calling it
parity. When ready, the search limit equals the validated corpus count exactly
(~191 today), never a clamped value.

## Shadow diagnostics

Each turn claims a monotonic internal diagnostic id **before** its query starts,
so concurrent turns stay distinct and completion order cannot change identity.
In-flight promises are tracked per turn in a bounded map and are always
`.catch()`-guarded.

- `rag.shadowSettled(turnId)` → `{ turnId, status, settled }` where status is
  `completed`, `evicted` or `unknown`. An **evicted** turn is one whose handle
  was dropped to keep tracking bounded; it reports `settled: false` and is never
  claimed to have finished. Silently resolving for a query still running is
  worse than admitting the diagnostic lost track.
- `rag.shadowSettled()` settles a snapshot of what is currently in flight and
  returns `{ status: "settled", turns }`
- `rag.shadowReport()` returns bounded entries: `turnId`, memory top ids, Qdrant
  top ids, overlap, `identical`, rank differences, latency, error code

No question, answer, locale, origin or timestamp is stored. Module API only —
never through `handle()`, so never through the public HTTPS edge.

## Configuration

```
QDRANT_URL              # origin only: no path, query, fragment or credentials
QDRANT_API_KEY
QDRANT_COLLECTION=ajoop_portfolio_v1   # the ALIAS; max 32 chars
QDRANT_VECTOR_SIZE=1024
QDRANT_DISTANCE=Cosine
AJOOP_VECTOR_BACKEND=memory|qdrant|shadow
AJOOP_QDRANT_TIMEOUT_MS          # optional, default 4000
AJOOP_QDRANT_CANDIDATE_CEILING   # optional fail-closed bound, default 4096
```

`.env.local` fills in only variables the shell left **undefined**. An explicitly
empty variable (`QDRANT_URL=`) is a decision and wins — it is the way to turn a
configured backend off without editing the file.

## Security

- Key travels in one place, the `api-key` header; never in a URL.
- `QdrantError` carries code + status + request *path* — never base URL, headers
  or response body.
- `describeQdrantConfig()` is the only printable view; `apiKeyPresent: true`
  replaces the key.
- Public health body: `vectorBackend` (what is actually live),
  `vectorBackendRequested`, `qdrantReady`. No host, collection, build id or
  reason code.
- No transcript persistence, no raw visitor logging. Origin controls, body
  limits, concurrency, rate limits, live-data guard, evidence validation and the
  deterministic fallback are untouched.
- `scrollAllPoints()` throws `incomplete-scan` rather than returning a partial
  corpus while claiming completion.

## Testing

```bash
npm run qa:ajoop:qdrant   # deterministic, mocked Qdrant HTTP, no cluster
npm run qa:ajoop:release  # existing release gate
npm run qa                # full site gate
```

The live check is opt-in and never part of `npm run qa`:

```bash
npm run ajoop:qdrant:smoke          # prints what it would do, touches nothing
npm run ajoop:qdrant:smoke -- --run # connectivity, alias, build, readiness, count, search
```

## Follow-up: build-log locale keys (deferred, not in 5.3)

`data/i18n/packs/*/content.json` still keys build-log translations by **array
position**:

```
buildLog.[0].title   buildLog.[0].detail
buildLog.[1].title   buildLog.[1].detail
```

Now that every entry carries a stable `id`, reordering the log would shift every
translation after the move — the same class of defect that lost four records
from the embedding corpus, in a different layer.

It is **not** fixed here, deliberately. Rendering and QA are green, no reorder
has occurred, and turning a persistent-vector-store release into an i18n
migration would put two unrelated risks in one change. The target shape is:

```
buildLog.<stable-id>.title   buildLog.<stable-id>.detail
```

touching `scripts/i18n-catalog.mjs`, the generated packs and
`scripts/build-locale-packs.mjs`. To be scheduled after 5.3 ships.

### Migration note

The cluster currently holds an **empty physical collection** named
`ajoop_portfolio_v1`. Qdrant will not let an alias share a name with a
collection, so ingestion detects this and refuses with `alias-name-occupied`
before writing anything. That empty collection must be deleted (or
`QDRANT_COLLECTION` pointed at an unused name) before the first staged build.
