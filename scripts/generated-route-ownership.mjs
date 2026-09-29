import fs from "node:fs";
import path from "node:path";

const GENERATED_PAGE_HEADER = /^<!DOCTYPE html>\r?\n<!--\r?\nGENERATED FILE\. Do not edit\.\r?\nLocale: [a-z]{2,3}\r?\nCanonical route: \/[^\r\n]*\r?\nSource: [^\r\n]+\.html\r?\nGenerator: scripts\/generate-localized-routes\.mjs\r?\nCopy: data\/i18n\/packs\/[a-z]{2,3}\/\r?\n-->\r?\n/;
const GENERATED_LEGACY_HEADER = /^<!DOCTYPE html>\r?\n<!--\r?\nGENERATED legacy compatibility stub\. Do not edit\.\r?\nLegacy URL: \/[^\r\n]+\.html\r?\nCanonical route: \/[^\r\n]*\r?\nLocale: [a-z]{2,3}\r?\nGenerator: scripts\/generate-localized-routes\.mjs\r?\nRegistry: data\/site\/routes\.json\r?\n-->\r?\n/;

/** Only documents beginning with a complete, exact generator header are disposable. */
export function isGeneratorOwnedRouteDocument(source) {
  const document = String(source || "");
  return GENERATED_PAGE_HEADER.test(document) || GENERATED_LEGACY_HEADER.test(document);
}

export function classifyRouteOrphans(root, files) {
  return files.map((file) => {
    const absolute = path.join(root, file);
    const source = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
    return { file, owned: isGeneratorOwnedRouteDocument(source) };
  });
}

/** Discover every unplanned document beneath the expected locale prefixes. */
export function findRouteOrphans(root, prefixes, plannedFiles) {
  const files = [];
  const walk = (dir) => {
    const absolute = path.join(root, dir);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const relative = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (!plannedFiles.has(relative)) files.push(relative);
    }
  };
  for (const prefix of prefixes) walk(prefix);
  return classifyRouteOrphans(root, [...new Set(files)].sort());
}

/** Refuse the whole cleanup before deleting anything if ownership is uncertain. */
export function removeOwnedRouteOrphans(root, orphans) {
  const unowned = orphans.filter((orphan) => !orphan.owned);
  if (unowned.length) {
    throw new Error(
      `Refusing to delete unowned locale document(s):\n${unowned.map(({ file }) => `  - ${file}`).join("\n")}`,
    );
  }
  for (const { file } of orphans) fs.rmSync(path.join(root, file), { force: true });
}
