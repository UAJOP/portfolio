import fs from "node:fs";
import path from "node:path";

const GENERATED_ROUTE_MARKERS = [
  "GENERATED FILE. Do not edit.",
  "GENERATED legacy compatibility stub",
];

/** Only documents carrying an explicit route-generator marker are disposable. */
export function isGeneratorOwnedRouteDocument(source) {
  return GENERATED_ROUTE_MARKERS.some((marker) => String(source || "").includes(marker));
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
