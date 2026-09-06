/**
 * The one embedding implementation.
 *
 * Extracted from server/ajoop-rag.mjs unchanged, because ingestion now needs
 * the same thing the request path needs and two copies of "how Ajoop turns text
 * into a vector" is one copy too many. The normalisation in particular is not a
 * detail: every stored vector is unit length, so the in-memory ranking can use
 * a dot product and Qdrant Cosine over the same numbers agrees with it. A
 * second implementation that skipped the normalise step would produce a store
 * whose scores are quietly on a different scale from the memory index it is
 * being compared against.
 *
 * `fetchImpl` is injectable for the same reason it is everywhere else in this
 * server: the QA suites run with no network and no Ollama.
 */

/** Inputs per /api/embed call. Ollama handles this comfortably in one pass. */
export const EMBED_BATCH_SIZE = 24;

/** Unit-length copy of a vector, or null when it is not a usable vector. */
export function normalizeVector(vector) {
  if (!Array.isArray(vector) || !vector.length) return null;
  let magnitude = 0;
  for (const value of vector) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    magnitude += number * number;
  }
  magnitude = Math.sqrt(magnitude);
  if (!magnitude) return null;
  return vector.map((value) => Number(value) / magnitude);
}

/** Cosine similarity for two already-normalised vectors. */
export function dotProduct(left, right) {
  const limit = Math.min(left.length, right.length);
  let score = 0;
  for (let i = 0; i < limit; i += 1) score += left[i] * right[i];
  return score;
}

/**
 * A batching embedder over one Ollama endpoint.
 *
 * Throws on a malformed response rather than returning a short array: a missing
 * vector would otherwise become an index entry paired with the wrong chunk, and
 * that failure is invisible until an answer cites the wrong record.
 */
export function createEmbedder({
  baseUrl,
  model,
  fetchImpl = globalThis.fetch,
  batchSize = EMBED_BATCH_SIZE,
  timeoutMs = 60000,
} = {}) {
  const fetchJson = async (url, body) => {
    if (typeof fetchImpl !== "function") throw new TypeError("fetch unavailable");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response?.ok) throw new Error(`upstream ${response?.status || 0}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  };

  return async function embedInputs(inputs) {
    const vectors = [];
    for (let offset = 0; offset < inputs.length; offset += batchSize) {
      const batch = inputs.slice(offset, offset + batchSize);
      const parsed = await fetchJson(`${baseUrl}/api/embed`, {
        model,
        input: batch,
        truncate: true,
        keep_alive: -1,
      });
      if (!Array.isArray(parsed?.embeddings) || parsed.embeddings.length !== batch.length) {
        throw new Error("malformed embedding response");
      }
      parsed.embeddings.forEach((vector) => {
        const normalized = normalizeVector(vector);
        if (!normalized) throw new Error("malformed embedding vector");
        vectors.push(normalized);
      });
    }
    return vectors;
  };
}
