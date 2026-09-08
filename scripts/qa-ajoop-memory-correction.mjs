#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
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
  createAjoopMemoryStore,
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

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-08T00:00:00.000Z");
const OWNER = Object.freeze({
  surface: AJOOP_MEMORY_SURFACES.OWNER_PRIVATE,
  authenticatedOwner: true,
});
const WRITE = Object.freeze({
  ...OWNER,
  consent: "explicit",
  provenance: AJOOP_MEMORY_PROVENANCE.OWNER_STATED,
  sensitivity: AJOOP_MEMORY_SENSITIVITY.NORMAL,
});

const originalCandidate = Object.freeze({
  kind: AJOOP_MEMORY_KINDS.PREFERENCE,
  text: "Prefer concise implementation steps during live operations.",
  tags: ["workflow", "live ops"],
});
const correctedCandidate = Object.freeze({
  kind: AJOOP_MEMORY_KINDS.PREFERENCE,
  text: "Prefer exactly one implementation step at a time during live operations.",
  tags: ["workflow", "live ops"],
});
const secondCorrectionCandidate = Object.freeze({
  kind: AJOOP_MEMORY_KINDS.PREFERENCE,
  text: "Prefer one safe command at a time during production operations.",
  tags: ["workflow", "production"],
});

const root = mkdtempSync(join(tmpdir(), "ajoop-memory-correction-"));
const dbPath = join(root, AJOOP_MEMORY_DB_FILENAME);
let store;

try {
  store = createAjoopMemoryStore({ dbPath, now: () => NOW });

  const original = store.write(originalCandidate, { ...WRITE, now: NOW });
  check("original memory is stored", original.code, "stored");

  check(
    "public surface cannot replace memory",
    store.replaceMemory(original.id, correctedCandidate, {
      ...WRITE,
      surface: AJOOP_MEMORY_SURFACES.PUBLIC_PORTFOLIO,
      now: NOW + DAY_MS,
    }).code,
    "owner-private-auth-required",
  );
  check(
    "owner-private replacement still requires authentication",
    store.replaceMemory(original.id, correctedCandidate, {
      ...WRITE,
      authenticatedOwner: false,
      now: NOW + DAY_MS,
    }).code,
    "owner-private-auth-required",
  );
  check(
    "invalid replacement id is rejected",
    store.replaceMemory("not-a-memory-id", correctedCandidate, { ...WRITE, now: NOW + DAY_MS }).code,
    "invalid-memory-id",
  );
  check(
    "replacement candidate still requires explicit consent",
    store.replaceMemory(original.id, correctedCandidate, { ...OWNER, now: NOW + DAY_MS }).code,
    "explicit-consent-required",
  );

  const refreshed = store.replaceMemory(original.id, originalCandidate, { ...WRITE, now: NOW + DAY_MS });
  check("identical correction becomes a refresh", refreshed.code, "refreshed");
  check("identical correction keeps the same id", refreshed.id, original.id);
  check("identical correction creates no replacement edge", refreshed.previousId, original.id);

  const correctedAt = NOW + 2 * DAY_MS;
  const corrected = store.replaceMemory(original.id, correctedCandidate, { ...WRITE, now: correctedAt });
  check("changed owner statement replaces the memory", corrected.code, "replaced");
  check("replacement reports the retired source id", corrected.previousId, original.id);
  ok("replacement receives a new content-derived id", corrected.id !== original.id);

  const afterCorrection = store.listActive({ context: OWNER, at: correctedAt + 1 });
  check("correction leaves exactly one active preference", afterCorrection.records.length, 1);
  check("retired source is hidden from active reads", afterCorrection.records[0].id, corrected.id);
  check("corrected text is the only active truth", afterCorrection.records[0].text, correctedCandidate.text);

  const retiredWrite = store.write(originalCandidate, { ...WRITE, now: NOW + 3 * DAY_MS });
  check("ordinary write cannot resurrect a retired memory", retiredWrite.code, "memory-retired");
  check(
    "already-retired source cannot be replaced again",
    store.replaceMemory(original.id, secondCorrectionCandidate, { ...WRITE, now: NOW + 3 * DAY_MS }).code,
    "memory-retired",
  );
  check(
    "replacement cannot target a retired id and create a cycle",
    store.replaceMemory(corrected.id, originalCandidate, { ...WRITE, now: NOW + 3 * DAY_MS }).code,
    "replacement-target-retired",
  );

  const secondAt = NOW + 4 * DAY_MS;
  const second = store.replaceMemory(corrected.id, secondCorrectionCandidate, { ...WRITE, now: secondAt });
  check("active corrected memory can be corrected again", second.code, "replaced");
  check("second correction retires the prior active id", second.previousId, corrected.id);
  const afterSecond = store.listActive({ context: OWNER, at: secondAt + 1 });
  check("replacement chain still exposes one active truth", afterSecond.records.length, 1);
  check("latest correction is the active id", afterSecond.records[0].id, second.id);

  store.close();
  store = null;

  const db = new DatabaseSync(dbPath);
  const edges = db.prepare(`
    SELECT old_id, new_id, replaced_at
      FROM ajoop_memory_replacements_v1
     ORDER BY replaced_at ASC
  `).all();
  check("two correction edges preserve bounded provenance", edges.length, 2);
  check("first correction edge preserves original source", edges[0].old_id, original.id);
  check("first correction edge points to first correction", edges[0].new_id, corrected.id);
  check("second correction edge preserves first correction", edges[1].old_id, corrected.id);
  check("second correction edge points to latest correction", edges[1].new_id, second.id);

  const originalRow = db.prepare("SELECT created_at FROM ajoop_memory_v1 WHERE id = ?").get(original.id);
  check(
    "failed resurrection attempt did not mutate retired source",
    originalRow.created_at,
    new Date(NOW + DAY_MS).toISOString(),
  );
  db.close();

  store = createAjoopMemoryStore({ dbPath, now: () => secondAt + 1 });
  const reopened = store.listActive({ context: OWNER, at: secondAt + 1 });
  check("correction state survives sqlite reopen", reopened.records.length, 1);
  check("reopened store still exposes latest correction", reopened.records[0].id, second.id);

  check("deleting current correction succeeds", store.deleteMemory(second.id, { context: OWNER }).deleted, true);
  check(
    "deleting replacement target does not resurrect retired ancestors",
    store.listActive({ context: OWNER, at: secondAt + 1 }).records.length,
    0,
  );

  const farFuture = NOW + 400 * DAY_MS;
  ok("bounded purge removes retained correction history", store.purgeInactive({ context: OWNER, at: farFuture }).removed >= 2);
  store.close();
  store = null;

  const finalDb = new DatabaseSync(dbPath, { readOnly: true });
  check(
    "replacement edges disappear when their retired sources leave bounded storage",
    Number(finalDb.prepare("SELECT COUNT(*) AS count FROM ajoop_memory_replacements_v1").get().count),
    0,
  );
  finalDb.close();
} catch (error) {
  failures.push(`unexpected exception\n      ${error?.stack || error}`);
} finally {
  try { store?.close(); } catch { /* best-effort cleanup */ }
  rmSync(root, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`Ajoop memory correction QA failed. ${failures.length} failure(s):`);
  failures.forEach((failure) => console.error(`\n- ${failure}`));
  process.exit(1);
}

console.log(
  `Ajoop memory correction passed. ${passed} assertions · explicit replacement · no competing active truths · bounded provenance · cycle prevention · no retired-memory resurrection.`,
);
