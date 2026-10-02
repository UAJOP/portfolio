/* Master 3 #28 performance budget for the Ajoop shell and Command Palette
 * roots every React production document now carries. Shared by G-63 (Home/
 * About) and G-66 (Works/Games); earlier budgets are unchanged and the #28
 * document increment is added on top of them, as #27's was. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./i18n-catalog.mjs";

const phase28 = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site/m3-28-performance-budget.json"), "utf8"));
assert.equal(phase28.schemaVersion, 1);
assert.equal(phase28.acceptedBaseCommit, "0543fce4537d5f3d6c90c46cca1eb3d442c7fb8c");
export const phase28Limits = phase28.budgets;

/** Byte sizes of the #28 SSR roots and payloads in one emitted document. */
export function measureOverlays(source, pathname) {
  const ajoopStart = source.indexOf('<div id="react-ajoop-root"');
  const commandStart = source.indexOf('<div id="react-command-root"', ajoopStart);
  const scriptsStart = source.indexOf('<script src="/portfolio-data.js"', commandStart);
  const ajoopPayload = source.match(/<script id="react-ajoop-props" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  const commandPayload = source.match(/<script id="react-command-props" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(ajoopStart >= 0 && commandStart > ajoopStart && scriptsStart > commandStart, `${pathname}: #28 overlay SSR roots missing`);
  assert.ok(ajoopPayload && commandPayload, `${pathname}: #28 overlay payloads missing`);
  return {
    ajoopSsrBytes: Buffer.byteLength(source.slice(ajoopStart, commandStart)),
    commandSsrBytes: Buffer.byteLength(source.slice(commandStart, scriptsStart)),
    ajoopPayloadBytes: Buffer.byteLength(ajoopPayload),
    commandPayloadBytes: Buffer.byteLength(commandPayload),
  };
}

export function overlayMaxima(documents) {
  const max = (key) => Math.max(...documents.map((item) => item.overlays[key]));
  return {
    ajoopSsrBytes: max("ajoopSsrBytes"),
    commandSsrBytes: max("commandSsrBytes"),
    ajoopPayloadBytes: max("ajoopPayloadBytes"),
    commandPayloadBytes: max("commandPayloadBytes"),
  };
}

export function assertOverlayBudget(maxima) {
  assert.ok(maxima.ajoopSsrBytes <= phase28Limits.ajoopSsrMaxBytes, "#28 Ajoop shell SSR byte budget exceeded");
  assert.ok(maxima.commandSsrBytes <= phase28Limits.commandSsrMaxBytes, "#28 Command Palette SSR byte budget exceeded");
  assert.ok(maxima.ajoopPayloadBytes <= phase28Limits.ajoopPayloadMaxBytes, "#28 Ajoop shell payload byte budget exceeded");
  assert.ok(maxima.commandPayloadBytes <= phase28Limits.commandPayloadMaxBytes, "#28 Command Palette payload byte budget exceeded");
}
