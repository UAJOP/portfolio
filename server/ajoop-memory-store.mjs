import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AJOOP_MEMORY_KINDS,
  AJOOP_MEMORY_SURFACES,
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
  if (!row) return null;
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
 * revalidates persisted rows through the A3.1 memory contract before returning
 * them. The default database lives under `.ajoop-runtime/`, which is ignored by
 * Git and never belongs in the public portfolio repository.
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
  `);

  const selectById = db.prepare(`
    SELECT id, version, kind, text, audience, authority, provenance,
           sensitivity, tags_json, created_at, expires_at
      FROM ajoop_memory_v1
     WHERE id = ?
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

  const deleteByIdStatement = db.prepare("DELETE FROM ajoop_memory_v1 WHERE id = ?");
  const selectAll = db.prepare(`
    SELECT id, version, kind, text, audience, authority, provenance,
           sensitivity, tags_json, created_at, expires_at
      FROM ajoop_memory_v1
     ORDER BY created_at DESC, id ASC
  `);

  const listAny = db.prepare(`
    SELECT id, version, kind, text, audience, authority, provenance,
           sensitivity, tags_json, created_at, expires_at
      FROM ajoop_memory_v1
     WHERE expires_at > ?
     ORDER BY created_at DESC, id ASC
     LIMIT ?
  `);

  const listByKind = db.prepare(`
    SELECT id, version, kind, text, audience, authority, provenance,
           sensitivity, tags_json, created_at, expires_at
      FROM ajoop_memory_v1
     WHERE expires_at > ? AND kind = ?
     ORDER BY created_at DESC, id ASC
     LIMIT ?
  `);

  let closed = false;
  const ensureOpen = () => {
    if (closed) throw new Error("AJOOP memory store is closed");
  };

  const write = (candidate, writerContext = {}) => {
    ensureOpen();
    const writeNow = Number(writerContext.now ?? now());
    const evaluation = evaluateAjoopMemoryWrite(candidate, { ...writerContext, now: writeNow });
    if (!evaluation.ok) return evaluation;

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

    return Object.freeze({
      ok: true,
      code: existed ? "refreshed" : "stored",
      id,
      record: Object.freeze({ id, ...record }),
    });
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
    const result = deleteByIdStatement.run(id);
    return Object.freeze({ ok: true, code: "deleted", deleted: Number(result.changes) === 1 });
  };

  const purgeInactive = ({ context = {}, at = now() } = {}) => {
    ensureOpen();
    if (!hasOwnerAccess(context)) return accessDenied();
    const current = Number(at);
    if (!Number.isFinite(current)) return Object.freeze({ ok: false, code: "invalid-clock" });

    const inactiveIds = selectAll.all()
      .map(rowToStoredRecord)
      .filter((stored) => !stored || !isAjoopMemoryRecordActive(contractRecordFromStored(stored), { now: current }))
      .map((stored, index) => stored?.id ?? selectAll.all()[index]?.id)
      .filter((id) => typeof id === "string");

    if (!inactiveIds.length) {
      return Object.freeze({ ok: true, code: "purged", removed: 0 });
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      let removed = 0;
      for (const id of inactiveIds) removed += Number(deleteByIdStatement.run(id).changes);
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
    dbPath: resolvedPath,
    write,
    listActive,
    deleteMemory,
    purgeInactive,
    close,
  });
}

export const AJOOP_MEMORY_STORE_OWNER_CONTEXT = Object.freeze({
  surface: AJOOP_MEMORY_SURFACES.OWNER_PRIVATE,
  authenticatedOwner: true,
});
