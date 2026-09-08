#!/usr/bin/env node
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AJOOP_MEMORY_KINDS,
  AJOOP_MEMORY_PROVENANCE,
  AJOOP_MEMORY_SENSITIVITY,
  AJOOP_MEMORY_SURFACES,
} from "../server/ajoop-memory-contract.mjs";
import {
  AJOOP_MEMORY_DB_FILENAME,
  AJOOP_MEMORY_LIST_MAX,
  createAjoopMemoryStore,
  defaultAjoopMemoryDbPath,
} from "../server/ajoop-memory-store.mjs";

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (Object.is(actual, expected)) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
};
const ok = (label, condition) => check(label, Boolean(condition), true);

const NOW = Date.parse("2026-09-08T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const OWNER_CONTEXT = Object.freeze({
  surface: AJOOP_MEMORY_SURFACES.OWNER_PRIVATE,
  authenticatedOwner: true,
});
const WRITE_CONTEXT = Object.freeze({
  ...OWNER_CONTEXT,
  consent: "explicit",
  provenance: AJOOP_MEMORY_PROVENANCE.OWNER_STATED,
  sensitivity: AJOOP_MEMORY_SENSITIVITY.NORMAL,
});
const preference = Object.freeze({
  kind: AJOOP_MEMORY_KINDS.PREFERENCE,
  text: "  Prefer concise implementation steps   during live operations.  ",
  tags: ["Workflow", "live ops", "workflow"],
});
const projectState = Object.freeze({
  kind: AJOOP_MEMORY_KINDS.PROJECT_STATE,
  text: "A3 memory persistence is the current implementation focus.",
  tags: ["ajoop", "a3"],
});

const tempRoot = mkdtempSync(join(tmpdir(), "ajoop-memory-store-"));
const dbPath = join(tempRoot, AJOOP_MEMORY_DB_FILENAME);
let store;

try {
  ok("default db path lives under the ignored runtime directory", defaultAjoopMemoryDbPath().includes(".ajoop-runtime"));
  ok("default db path uses the v1 sqlite filename", defaultAjoopMemoryDbPath().endsWith(AJOOP_MEMORY_DB_FILENAME));
  check("test database does not exist before store creation", existsSync(dbPath), false);

  store = createAjoopMemoryStore({ dbPath, now: () => NOW });
  check("sqlite database is created on first store open", existsSync(dbPath), true);

  check("private reads require owner auth", store.listActive().code, "owner-private-auth-required");
  check(
    "public surface cannot read even with owner flag",
    store.listActive({ context: { surface: AJOOP_MEMORY_SURFACES.PUBLIC_PORTFOLIO, authenticatedOwner: true } }).code,
    "owner-private-auth-required",
  );

  check("writes require explicit trusted context", store.write(preference, OWNER_CONTEXT).code, "explicit-consent-required");
  check(
    "public surface cannot write",
    store.write(preference, { ...WRITE_CONTEXT, surface: AJOOP_MEMORY_SURFACES.PUBLIC_PORTFOLIO }).code,
    "owner-private-auth-required",
  );
  check(
    "raw transcript payloads never reach persistence",
    store.write({ ...preference, history: [] }, WRITE_CONTEXT).code,
    "raw-conversation-forbidden",
  );
  check(
    "caller policy injection still fails before persistence",
    store.write({ ...preference, consent: "explicit" }, WRITE_CONTEXT).code,
    "caller-policy-field-forbidden",
  );

  const first = store.write(preference, WRITE_CONTEXT);
  check("valid memory is stored", first.code, "stored");
  ok("stored memory id is opaque and bounded", /^mem_[a-f0-9]{24}$/.test(first.id));
  check("stored text is normalized", first.record.text, "Prefer concise implementation steps during live operations.");
  check("stored tags are normalized", JSON.stringify(first.record.tags), JSON.stringify(["workflow", "live ops"]));

  const listed = store.listActive({ context: OWNER_CONTEXT, at: NOW + 1 });
  check("authorized owner can list memory", listed.code, "listed");
  check("one active record is returned", listed.records.length, 1);
  check("listed record keeps the stable id", listed.records[0].id, first.id);
  check("listed records expose advisory persisted text only", listed.records[0].text, first.record.text);

  const refreshedAt = NOW + 7 * DAY_MS;
  const refreshed = store.write(preference, { ...WRITE_CONTEXT, now: refreshedAt });
  check("same normalized memory refreshes instead of duplicating", refreshed.code, "refreshed");
  check("refresh preserves deterministic id", refreshed.id, first.id);
  check("refresh advances creation time", refreshed.record.createdAt, new Date(refreshedAt).toISOString());
  check("refresh leaves one active record", store.listActive({ context: OWNER_CONTEXT, at: refreshedAt + 1 }).records.length, 1);

  const second = store.write(projectState, WRITE_CONTEXT);
  check("a different memory is stored separately", second.code, "stored");
  check("two active records are now visible", store.listActive({ context: OWNER_CONTEXT, at: NOW + 1 }).records.length, 2);
  check(
    "kind filter stays deterministic",
    store.listActive({ context: OWNER_CONTEXT, kind: AJOOP_MEMORY_KINDS.PREFERENCE, at: refreshedAt + 1 }).records.length,
    1,
  );
  check("unknown list kind is rejected", store.listActive({ context: OWNER_CONTEXT, kind: "misc" }).code, "invalid-kind");
  check("list limit is respected", store.listActive({ context: OWNER_CONTEXT, limit: 1 }).records.length, 1);
  ok("hard maximum list size is bounded", AJOOP_MEMORY_LIST_MAX <= 200);

  check("invalid memory ids are rejected", store.deleteMemory("not-an-id", { context: OWNER_CONTEXT }).code, "invalid-memory-id");
  check(
    "public surface cannot delete",
    store.deleteMemory(second.id, { context: { surface: AJOOP_MEMORY_SURFACES.PUBLIC_PORTFOLIO, authenticatedOwner: true } }).code,
    "owner-private-auth-required",
  );
  check("owner delete removes a record", store.deleteMemory(second.id, { context: OWNER_CONTEXT }).deleted, true);
  check("repeated delete is idempotent", store.deleteMemory(second.id, { context: OWNER_CONTEXT }).deleted, false);

  store.close();
  store = createAjoopMemoryStore({ dbPath, now: () => refreshedAt + 1 });
  const afterReopen = store.listActive({ context: OWNER_CONTEXT });
  check("memory survives closing and reopening the sqlite store", afterReopen.records.length, 1);
  check("reopened record preserves id", afterReopen.records[0].id, first.id);

  store.close();
  store = null;
  const tamperDb = new DatabaseSync(dbPath);
  tamperDb.prepare("UPDATE ajoop_memory_v1 SET expires_at = ? WHERE id = ?").run("2099-01-01T00:00:00.000Z", first.id);
  const columns = tamperDb.prepare("PRAGMA table_info(ajoop_memory_v1)").all().map((row) => row.name);
  check("sqlite schema contains no transcript column", columns.includes("transcript"), false);
  check("sqlite schema contains no history column", columns.includes("history"), false);
  check("sqlite schema contains no question column", columns.includes("question"), false);
  check("sqlite schema contains no answer column", columns.includes("answer"), false);
  tamperDb.close();

  store = createAjoopMemoryStore({ dbPath, now: () => refreshedAt + 1 });
  check(
    "tampered retention ceiling is rejected on read",
    store.listActive({ context: OWNER_CONTEXT }).records.length,
    0,
  );
  check("purge requires owner auth", store.purgeInactive().code, "owner-private-auth-required");
  check("purge removes tampered inactive row", store.purgeInactive({ context: OWNER_CONTEXT }).removed, 1);
  check("purge is idempotent when store is clean", store.purgeInactive({ context: OWNER_CONTEXT }).removed, 0);

  const expiring = store.write(projectState, { ...WRITE_CONTEXT, now: NOW });
  check("fresh project state can be stored after purge", expiring.code, "stored");
  check(
    "expired project state is hidden from reads",
    store.listActive({ context: OWNER_CONTEXT, at: NOW + 31 * DAY_MS }).records.length,
    0,
  );
  check(
    "expiry sweep physically removes stale memory",
    store.purgeInactive({ context: OWNER_CONTEXT, at: NOW + 31 * DAY_MS }).removed,
    1,
  );

  store.close();
  store = null;

  const finalDb = new DatabaseSync(dbPath, { readOnly: true });
  check("database is empty after delete and expiry sweep", Number(finalDb.prepare("SELECT COUNT(*) AS count FROM ajoop_memory_v1").get().count), 0);
  finalDb.close();
} catch (error) {
  failures.push(`unexpected exception\n      ${error?.stack || error}`);
} finally {
  try {
    store?.close();
  } catch {
    // Best-effort cleanup only.
  }
  rmSync(tempRoot, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`Ajoop memory store QA failed. ${failures.length} failure(s):`);
  failures.forEach((failure) => console.error(`\n- ${failure}`));
  process.exit(1);
}

console.log(
  `Ajoop memory store passed. ${passed} assertions · local SQLite · owner-private CRUD · deterministic refresh · hostile-row revalidation · bounded expiry · no runtime wiring.`,
);
