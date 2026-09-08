import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AJOOP_MEMORY_KINDS,
  canUseAjoopMemory,
  evaluateAjoopMemoryWrite,
  isAjoopMemoryRecordActive,
} from "./ajoop-memory-contract.mjs";

export const AJOOP_MEMORY_DB_FILENAME = "ajoop-memory-v1.sqlite";
export const AJOOP_MEMORY_LIST_LIMIT = 50;
export const AJOOP_MEMORY_LIST_MAX = 200;

const MEMORY_ID_PATTERN = /^mem_[a-f0-9]{24}$/;
const KNOWN_KINDS = new Set(Object.values(AJOOP_MEMORY_KINDS));

export const defaultAjoopMemoryDbPath = () =>
  resolve(process.cwd(), ".ajoop-runtime", AJOOP_MEMORY_DB_FILENAME);

const accessDenied = () => Object.freeze({ ok: false, code: "owner-private-auth-required" });

const hasOwnerAccess = ({ surface, authenticatedOwner = false } = {}) =>
  canUseAjoopMemory({ surface, authenticatedOwner });

const normalizeLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return AJOOP_MEMORY_LIST_LIMIT;
  return Math.min(parsed, AJOOP_MEMORY_LIST_MAX);
};

const memoryIdFor = (record) => {
  const identity = JSON.stringify({
    kind: record.kind,
    text: record.text,
    tags: [...record.tags].sort(),
  });
  return `mem_${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
};

const parseTags = (value) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const rowToStoredRecord = (row) => {
  if (!row || typeof row.id !== "string" || !MEMORY_ID_PATTERN.test(row.id)) return null;
  const tags = parseTags(row.tags_json);
  if (!tags) return null;
  return {
    id: row.id,
    version: row.version,
    kind: row.kind,
    text: row.text,
    audience: row.audience,
    authority: row.authority,
    provenance: row.provenance,
    sensitivity: row.sensitivity,
    tags,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
};

const contractRecordFromStored = (stored) => {
  if (!stored) return null;
  const { id: _id, ...record } = stored;
  return record;
};

/**
 * Local-only persistence for owner memory.
 *
 * This module intentionally has no HTTP route, model integration or RAG wiring.
 * Every operation re-checks the owner-private trust boundary, and every read
 * revalidates persisted rows through the memory contract before returning them.
 * The default database lives under `.ajoop-runtime/`, which is ignored by Git
 * and never belongs in the public portfolio repository.
 *
 * Corrections are explicit and provenance-preserving. Replacing a memory does
 * not silently overwrite its old row: the old id is retired through a bounded
 * replacement edge and the corrected record gets its own content-derived id.
 * Active reads hide retired rows, while the old record and its edge remain only
 * until normal retention/purge removes them. This avoids competing truths
 * without turning correction history into an immortal audit log.
 */
export function createAjoopMemoryStore({ dbPath = defaultAjoopMemoryDbPath(), now = () => Date.now() } = {}) {
  if (typeof dbPath !== "string" || !dbPath.trim()) {
    throw new TypeError("AJOOP memory dbPath must be a non-empty string");
  }
  if (typeof now !== "function") {
    throw new TypeError("AJOOP memory now must be a function");
  }

  const resolvedPath = dbPath === ":memory:" ? dbPath : resolve(dbPath);
  if (resolvedPath !== ":memory:") mkdirSync(dirname(resolvedPath), { recursive: true });

  const db = new DatabaseSync(resolvedPath);
  db.exec("PRAGMA busy_timeout = 1000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ajoop_memory_v1 (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      audience TEXT NOT NULL,
      authority TEXT NOT NULL,
      provenance TEXT NOT NULL,
      sensitivity TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ajoop_memory_v1_expires_at
      ON ajoop_memory_v1(expires_at);
    CREATE INDEX IF NOT EXISTS idx_ajoop_memory_v1_kind_created_at
      ON ajoop_memory_v1(kind, created_at DESC);

    CREATE TABLE IF NOT EXISTS ajoop_memory_replacements_v1 (
      old_id TEXT PRIMARY KEY,
      new_id TEXT NOT NULL,
      replaced_at TEXT NOT NULL,
      CHECK (old_id <> new_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ajoop_memory_replacements_v1_new_id
      ON ajoop_memory_replacements_v1(new_id);
  `);

  const selectById = db.prepare(`
    SELECT id, version, kind, text, audience, authority, provenance,
           sensitivity, tags_json, created_at, expires_at
      FROM ajoop_memory_v1
     WHERE id = ?
  `);

  const selectReplacementByOld = db.prepare(`
    SELECT old_id, new_id, replaced_at
      FROM ajoop_memory_replacements_v1
     WHERE old_id = ?
  `);

  const upsert = db.prepare(`
    INSERT INTO ajoop_memory_v1 (
      id, version, kind, text, audience, authority, provenance, sensitivity,
      tags_json, created_at, expires_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      version = excluded.version,
      kind = excluded.kind,
      text = excluded.text,
      audience = excluded.audience,
      authority = excluded.authority,
      provenance = excluded.provenance,
      sensitivity = excluded.sensitivity,
      tags_json = excluded.tags_json,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `);

  const insertReplacement = db.prepare(`
    INSERT INTO ajoop_memory_replacements_v1 (old_id, new_id, replaced_at)
    VALUES (?, ?, ?)
  `);

  const deleteByIdStatement = db.prepare("DELETE FROM ajoop_memory_v1 WHERE id = ?");
  /* A missing replacement target must NOT resurrect its source. Keep the edge
   * as the retirement marker until the old row itself leaves bounded storage. */
  const cleanupReplacementEdges = db.prepare(`
    DELETE FROM ajoop_memory_replacements_v1
     WHERE old_id NOT IN (SELECT id FROM ajoop_memory_v1)
  `);

  const selectAll = db.prepare(`
    SELECT id, version, kind, text, audience, authority, provenance,
           sensitivity, tags_json, created_at, expires_at
      FROM ajoop_memory_v1
     ORDER BY created_at DESC, id ASC
  `);

  const listAny = db.prepare(`
    SELECT m.id, m.version, m.kind, m.text, m.audience, m.authority, m.provenance,
           m.sensitivity, m.tags_json, m.created_at, m.expires_at
      FROM ajoop_memory_v1 AS m
 LEFT JOIN ajoop_memory_replacements_v1 AS r ON r.old_id = m.id
     WHERE m.expires_at > ? AND r.old_id IS NULL
     ORDER BY m.created_at DESC, m.id ASC
     LIMIT ?
  `);

  const listByKind = db.prepare(`
    SELECT m.id, m.version, m.kind, m.text, m.audience, m.authority, m.provenance,
           m.sensitivity, m.tags_json, m.created_at, m.expires_at
      FROM ajoop_memory_v1 AS m
 LEFT JOIN ajoop_memory_replacements_v1 AS r ON r.old_id = m.id
     WHERE m.expires_at > ? AND m.kind = ? AND r.old_id IS NULL
     ORDER BY m.created_at DESC, m.id ASC
     LIMIT ?
  `);

  let closed = false;
  const ensureOpen = () => {
    if (closed) throw new Error("AJOOP memory store is closed");
  };

  const persistEvaluated = (evaluation, writeNow) => {
    const id = memoryIdFor(evaluation.record);
    const existed = Boolean(selectById.get(id));
    const updatedAt = new Date(writeNow).toISOString();
    const record = evaluation.record;

    upsert.run(
      id,
      record.version,
      record.kind,
      record.text,
      record.audience,
      record.authority,
      record.provenance,
      record.sensitivity,
      JSON.stringify(record.tags),
      record.createdAt,
      record.expiresAt,
      updatedAt,
    );

    return { id, existed, record };
  };

  const write = (candidate, writerContext = {}) => {
    ensureOpen();
    const writeNow = Number(writerContext.now ?? now());
    const evaluation = evaluateAjoopMemoryWrite(candidate, { ...writerContext, now: writeNow });
    if (!evaluation.ok) return evaluation;

    const id = memoryIdFor(evaluation.record);
    if (selectReplacementByOld.get(id)) {
      return Object.freeze({ ok: false, code: "memory-retired" });
    }

    const persisted = persistEvaluated(evaluation, writeNow);
    return Object.freeze({
      ok: true,
      code: persisted.existed ? "refreshed" : "stored",
      id: persisted.id,
      record: Object.freeze({ id: persisted.id, ...persisted.record }),
    });
  };

  /**
   * Explicitly replace one active memory with a corrected owner statement.
   *
   * The replacement candidate passes through the exact same write contract as
   * a normal memory. The source id must still be active and not already retired.
   * A content-identical correction is just a refresh and creates no self-edge.
   * A target id that is already retired is rejected to prevent replacement
   * cycles. The old row is retained only within its original TTL and hidden from
   * active reads immediately after the transaction commits.
   */
  const replaceMemory = (id, candidate, writerContext = {}) => {
    ensureOpen();
    if (!hasOwnerAccess(writerContext)) return accessDenied();
    if (typeof id !== "string" || !MEMORY_ID_PATTERN.test(id)) {
      return Object.freeze({ ok: false, code: "invalid-memory-id" });
    }

    const writeNow = Number(writerContext.now ?? now());
    if (!Number.isFinite(writeNow)) return Object.freeze({ ok: false, code: "invalid-clock" });

    const sourceRow = selectById.get(id);
    const source = rowToStoredRecord(sourceRow);
    if (!source || !isAjoopMemoryRecordActive(contractRecordFromStored(source), { now: writeNow })) {
      return Object.freeze({ ok: false, code: "memory-not-active" });
    }
    if (selectReplacementByOld.get(id)) {
      return Object.freeze({ ok: false, code: "memory-retired" });
    }

    const evaluation = evaluateAjoopMemoryWrite(candidate, { ...writerContext, now: writeNow });
    if (!evaluation.ok) return evaluation;
    const newId = memoryIdFor(evaluation.record);

    if (newId === id) {
      const persisted = persistEvaluated(evaluation, writeNow);
      return Object.freeze({
        ok: true,
        code: "refreshed",
        id,
        previousId: id,
        record: Object.freeze({ id, ...persisted.record }),
      });
    }

    if (selectReplacementByOld.get(newId)) {
      return Object.freeze({ ok: false, code: "replacement-target-retired" });
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      const persisted = persistEvaluated(evaluation, writeNow);
      insertReplacement.run(id, persisted.id, new Date(writeNow).toISOString());
      db.exec("COMMIT");
      return Object.freeze({
        ok: true,
        code: "replaced",
        id: persisted.id,
        previousId: id,
        record: Object.freeze({ id: persisted.id, ...persisted.record }),
      });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };

  const listActive = ({ context = {}, kind = null, limit = AJOOP_MEMORY_LIST_LIMIT, at = now() } = {}) => {
    ensureOpen();
    if (!hasOwnerAccess(context)) return accessDenied();
    if (kind !== null && !KNOWN_KINDS.has(kind)) {
      return Object.freeze({ ok: false, code: "invalid-kind" });
    }

    const current = Number(at);
    if (!Number.isFinite(current)) return Object.freeze({ ok: false, code: "invalid-clock" });
    const currentIso = new Date(current).toISOString();
    const boundedLimit = normalizeLimit(limit);
    const rows = kind === null
      ? listAny.all(currentIso, boundedLimit)
      : listByKind.all(currentIso, kind, boundedLimit);

    const records = rows
      .map(rowToStoredRecord)
      .filter(Boolean)
      .filter((stored) => isAjoopMemoryRecordActive(contractRecordFromStored(stored), { now: current }))
      .map((stored) => Object.freeze({ ...stored, tags: Object.freeze([...stored.tags]) }));

    return Object.freeze({ ok: true, code: "listed", records: Object.freeze(records) });
  };

  const deleteMemory = (id, { context = {} } = {}) => {
    ensureOpen();
    if (!hasOwnerAccess(context)) return accessDenied();
    if (typeof id !== "string" || !MEMORY_ID_PATTERN.test(id)) {
      return Object.freeze({ ok: false, code: "invalid-memory-id" });
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = deleteByIdStatement.run(id);
      cleanupReplacementEdges.run();
      db.exec("COMMIT");
      return Object.freeze({ ok: true, code: "deleted", deleted: Number(result.changes) === 1 });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };

  const purgeInactive = ({ context = {}, at = now() } = {}) => {
    ensureOpen();
    if (!hasOwnerAccess(context)) return accessDenied();
    const current = Number(at);
    if (!Number.isFinite(current)) return Object.freeze({ ok: false, code: "invalid-clock" });

    const rows = selectAll.all();
    const inactiveIds = rows
      .filter((row) => {
        const stored = rowToStoredRecord(row);
        return !stored || !isAjoopMemoryRecordActive(contractRecordFromStored(stored), { now: current });
      })
      .map((row) => row.id)
      .filter((id) => typeof id === "string");

    if (!inactiveIds.length) {
      cleanupReplacementEdges.run();
      return Object.freeze({ ok: true, code: "purged", removed: 0 });
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      let removed = 0;
      for (const id of inactiveIds) removed += Number(deleteByIdStatement.run(id).changes);
      cleanupReplacementEdges.run();
      db.exec("COMMIT");
      return Object.freeze({ ok: true, code: "purged", removed });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };

  const close = () => {
    if (closed) return;
    db.close();
    closed = true;
  };

  return Object.freeze({
    write,
    replaceMemory,
    listActive,
    deleteMemory,
    purgeInactive,
    close,
  });
}
