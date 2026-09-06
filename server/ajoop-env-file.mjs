/**
 * A twenty-line .env.local reader, so the Qdrant commands can find local
 * credentials without a dependency and without a secret in the repository.
 *
 * The configuration contract is unchanged: every module reads its settings from
 * an ENV OBJECT. This only fills that object from an untracked file when the
 * shell did not already provide the value, which is what makes
 * `npm run ajoop:qdrant:ingest` work on Kaan's laptop and in a CI job that
 * exports real environment variables, with no branch between them.
 *
 * A real environment variable ALWAYS WINS. A file that could override the
 * shell is a file that can silently redirect a command at a different cluster
 * than the operator believes they configured.
 *
 * Nothing here logs a value. Parse failures are silent by design: this runs at
 * the top of a CLI, and a malformed line printed with its contents is a
 * credential printed with its contents.
 */
import { readFileSync } from "node:fs";

/** Keys look like shell identifiers. Anything else is not a variable. */
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * `KEY=value` pairs from an .env-style string.
 *
 * Handles the three things these files actually contain: comments, an optional
 * `export ` prefix, and single- or double-quoted values. It deliberately does
 * NOT interpolate `${OTHER}` or interpret escapes — an API key is an opaque
 * token, and a parser that rewrites part of it is worse than one that does not
 * understand it.
 */
export function parseEnvFile(source) {
  const values = {};
  for (const rawLine of String(source || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = withoutExport.indexOf("=");
    if (separator <= 0) continue;
    const key = withoutExport.slice(0, separator).trim();
    if (!KEY_PATTERN.test(key)) continue;
    let value = withoutExport.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      /* An unquoted trailing comment is a comment; a quoted one is part of the
       * value and was already taken above. */
      const comment = value.indexOf(" #");
      if (comment >= 0) value = value.slice(0, comment).trim();
    }
    values[key] = value;
  }
  return values;
}

/**
 * `base` with any keys it does not DEFINE filled in from `path`.
 *
 * "Does not define" means `undefined` — nothing else. An earlier version also
 * treated an empty or whitespace-only variable as unset, which quietly removed
 * the only way to turn a setting off:
 *
 *     QDRANT_URL= npm run start:ajoop:bridge
 *
 * is an operator saying "ignore whatever the file says, run without it", and
 * the file overrode them. An explicitly empty variable is a decision, and a
 * decision the shell makes always beats a file on disk — so it stands, the
 * config validator sees the empty value, and the backend degrades to memory
 * exactly as the operator intended.
 *
 * Returns a new object and the list of KEY NAMES that were filled, so a CLI can
 * say "loaded 6 keys from .env.local" without saying what any of them are.
 * A missing or unreadable file is not an error: the shell may well have
 * supplied everything already.
 */
export function loadEnvFile(path, base = {}) {
  let parsed = {};
  try {
    parsed = parseEnvFile(readFileSync(path, "utf8"));
  } catch (error) {
    return { env: { ...base }, loaded: [], present: false };
  }
  const env = { ...base };
  const loaded = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] !== undefined) continue;
    env[key] = value;
    loaded.push(key);
  }
  return { env, loaded, present: true };
}
