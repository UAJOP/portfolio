import { readFile } from "node:fs/promises";
import { google } from "googleapis";
import {
  AJOOP_DRIVE_CONTENT_UNAVAILABLE_REASONS,
  AJOOP_DRIVE_MAX_CONTENT_CHARS,
  AJOOP_DRIVE_MAX_MIME_TYPE_CHARS,
  AJOOP_DRIVE_MIME_TYPES,
  resolveDriveContentStrategy,
} from "./ajoop-drive-read-adapter.mjs";

export const AJOOP_DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const AJOOP_DRIVE_SEARCH_FIELDS = "nextPageToken,incompleteSearch,files(id,name,mimeType,createdTime,modifiedTime,size,shortcutDetails(targetId,targetMimeType))";
export const AJOOP_DRIVE_READ_FIELDS = "id,name,mimeType,createdTime,modifiedTime,size,trashed,shortcutDetails(targetId,targetMimeType)";
export const AJOOP_DRIVE_MAX_CONTENT_BYTES = 256 * 1024;
export const AJOOP_DRIVE_OPERATION_DEADLINE_MS = 30000;
export const AJOOP_DRIVE_MAX_OPERATION_DEADLINE_MS = 120000;
export const AJOOP_DRIVE_PROVIDER_TIMEOUT = "drive-provider-timeout";

const ENCODING_ERROR = "invalid-provider-content-encoding";
// Google's documented files.export reason for Workspace exports above the export size limit.
const EXPORT_SIZE_LIMIT_REASON = "exportSizeLimitExceeded";
const MAX_ERROR_BODY_CHARS = 65536;

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const ownValue = (source, key) => {
  if (!source || typeof source !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
};

export async function loadStoredDriveReadAuth({ tokenPath }) {
  if (typeof tokenPath !== "string" || !tokenPath) throw new Error("provider-auth-required");
  try {
    const credentials = await readJson(tokenPath);
    if (
      credentials?.type !== "authorized_user" ||
      credentials.scope !== AJOOP_DRIVE_READONLY_SCOPE ||
      typeof credentials.client_id !== "string" || !credentials.client_id ||
      typeof credentials.client_secret !== "string" || !credentials.client_secret ||
      typeof credentials.refresh_token !== "string" || !credentials.refresh_token
    ) throw new Error("provider-auth-required");
    return google.auth.fromJSON(credentials);
  } catch {
    throw new Error("provider-auth-required");
  }
}

// Drive query literals escape backslash first, then apostrophe, so user text can never close the literal.
export const escapeDriveQueryLiteral = (value) => {
  if (typeof value !== "string") throw new TypeError("drive-query-literal-must-be-string");
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
};

export const buildDriveSearchQuery = (query) => {
  const literal = escapeDriveQueryLiteral(query);
  return `(name contains '${literal}' or fullText contains '${literal}') and trashed = false and mimeType != '${AJOOP_DRIVE_MIME_TYPES.FOLDER}'`;
};

const destroyStream = (stream) => {
  try { stream?.destroy?.(); } catch { /* Best-effort cancellation after a local bound. */ }
};

const truncateUtf16Safely = (text, maxChars) => {
  let value = text.slice(0, maxChars);
  if (value && /[\uD800-\uDBFF]/.test(value.at(-1))) value = value.slice(0, -1);
  return value;
};

/**
 * Settles with the provider promise unless the operation deadline aborts first.
 * A provider value that arrives after the deadline is handed to onLateValue so a
 * late stream can still be cancelled; the abort listener is always removed.
 */
const raceAbort = (promise, signal, onLateValue = () => {}) => new Promise((resolve, reject) => {
  let settled = false;
  const onAbort = () => {
    if (settled) return;
    settled = true;
    reject(new Error(AJOOP_DRIVE_PROVIDER_TIMEOUT));
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  Promise.resolve(promise).then(
    (value) => {
      signal.removeEventListener("abort", onAbort);
      if (settled) onLateValue(value);
      else {
        settled = true;
        resolve(value);
      }
    },
    (error) => {
      signal.removeEventListener("abort", onAbort);
      if (!settled) {
        settled = true;
        reject(error);
      }
    },
  );
});

const runWithDeadline = async (deadlineMs, operation) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Reads at most maxBytes from a provider stream and cancels it at the first
 * bound, on failure, or when the optional abort signal fires. Decoding is fatal
 * and streaming, so a multibyte sequence split across chunks survives, a
 * sequence cut by the byte bound is dropped rather than replaced, and malformed
 * UTF-8 is reported instead of silently repaired. Transport failures propagate
 * unchanged for provider error mapping.
 */
export async function readBoundedUtf8Stream(stream, {
  maxBytes = AJOOP_DRIVE_MAX_CONTENT_BYTES,
  maxChars = AJOOP_DRIVE_MAX_CONTENT_CHARS,
  signal = null,
} = {}) {
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") throw new Error("invalid-provider-content-stream");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const decode = (bytes, options) => {
    try { return decoder.decode(bytes, options); } catch { throw new Error(ENCODING_ERROR); }
  };
  let iterator = null;
  const cancel = () => {
    destroyStream(stream);
    try {
      const returned = iterator?.return?.();
      if (returned && typeof returned.then === "function") returned.then(() => {}, () => {});
    } catch { /* Cancellation is best effort. */ }
  };
  let contentText = "";
  let bytesRead = 0;
  let truncated = false;
  try {
    iterator = stream[Symbol.asyncIterator]();
    for (;;) {
      const pending = iterator.next();
      const step = signal ? await raceAbort(pending, signal) : await pending;
      if (!step || typeof step !== "object") throw new Error("invalid-provider-content-stream");
      if (step.done) break;
      const chunk = step.value;
      if (!(chunk instanceof Uint8Array)) throw new Error("invalid-provider-content-stream");
      if (chunk.byteLength === 0) continue;
      const remaining = maxBytes - bytesRead;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const accepted = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
      bytesRead += accepted.byteLength;
      contentText += decode(accepted, { stream: true });
      if (contentText.length > maxChars || accepted.byteLength < chunk.byteLength) {
        truncated = true;
        break;
      }
    }
    if (!truncated) contentText += decode();
  } catch (error) {
    cancel();
    throw error;
  }
  if (truncated) cancel();
  if (contentText.length > maxChars) {
    contentText = truncateUtf16Safely(contentText, maxChars);
    truncated = true;
  }
  return Object.freeze({ contentText, bytesRead, truncated });
}

const isEncodingError = (error) => {
  try { return error?.message === ENCODING_ERROR; } catch { return false; }
};

// Only the documented structured reason is consulted; provider messages are never parsed.
const hasProviderReason = (error, status, reason) => {
  try {
    const response = ownValue(error, "response");
    if (Number(ownValue(response, "status") ?? ownValue(error, "status")) !== status) return false;
    let data = ownValue(response, "data");
    if (typeof data === "string") {
      if (data.length > MAX_ERROR_BODY_CHARS) return false;
      data = JSON.parse(data);
    }
    const errors = ownValue(ownValue(data, "error"), "errors");
    return Array.isArray(errors) && errors.some((entry) => ownValue(entry, "reason") === reason);
  } catch {
    return false;
  }
};

const unavailable = (reason) => Object.freeze({
  contentAvailable: false,
  contentType: null,
  contentText: null,
  contentPartial: false,
  contentUnavailableReason: reason,
  truncated: false,
});

export function createGoogleDriveReadClient({
  auth,
  driveFactory = (options) => google.drive(options),
  deadlineMs = AJOOP_DRIVE_OPERATION_DEADLINE_MS,
}) {
  if (!auth || typeof driveFactory !== "function") throw new Error("provider-auth-required");
  // The deadline is trusted server configuration only; it is never read from requests or environment.
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > AJOOP_DRIVE_MAX_OPERATION_DEADLINE_MS) {
    throw new TypeError("invalid-drive-deadline");
  }
  const drive = driveFactory({ version: "v3", auth });
  if (!drive?.files) throw new Error("provider-auth-required");

  return Object.freeze({
    searchFiles({ query, limit }) {
      return runWithDeadline(deadlineMs, async (signal) => {
        const response = await raceAbort(drive.files.list({
          q: buildDriveSearchQuery(query),
          pageSize: limit,
          orderBy: "modifiedTime desc",
          spaces: "drive",
          fields: AJOOP_DRIVE_SEARCH_FIELDS,
        }, { signal }), signal);
        const data = response?.data;
        if (!data || typeof data !== "object") throw new Error("invalid-provider-response");
        const nextPageToken = ownValue(data, "nextPageToken");
        const incompleteSearch = ownValue(data, "incompleteSearch");
        if (nextPageToken !== undefined && (typeof nextPageToken !== "string" || !nextPageToken)) throw new Error("invalid-provider-response");
        if (incompleteSearch !== undefined && typeof incompleteSearch !== "boolean") throw new Error("invalid-provider-response");
        const files = ownValue(data, "files");
        // The page token is reduced to a boolean here and never leaves this client.
        return Object.freeze({
          files: files === undefined ? [] : files,
          hasMore: nextPageToken !== undefined,
          incompleteSearch: incompleteSearch === true,
        });
      });
    },

    readFile({ fileId }) {
      return runWithDeadline(deadlineMs, async (signal) => {
        const metadataResponse = await raceAbort(drive.files.get({ fileId, fields: AJOOP_DRIVE_READ_FIELDS }, { signal }), signal);
        const metadata = metadataResponse?.data;
        const mimeType = ownValue(metadata, "mimeType");
        // Identity and type are settled before any content request, so a provider
        // answering with a different file never triggers a second download.
        if (ownValue(metadata, "id") !== fileId || typeof mimeType !== "string" || mimeType.length > AJOOP_DRIVE_MAX_MIME_TYPE_CHARS) {
          throw new Error("invalid-provider-file");
        }
        const strategy = resolveDriveContentStrategy(mimeType);
        if (strategy.kind === "unavailable") return Object.freeze({ metadata, content: unavailable(strategy.reason) });

        const contentRequest = strategy.kind === "export"
          ? drive.files.export({ fileId, mimeType: strategy.contentType }, { responseType: "stream", signal })
          : drive.files.get({ fileId, alt: "media" }, { responseType: "stream", signal });
        let response;
        try {
          response = await raceAbort(contentRequest, signal, (late) => destroyStream(late?.data));
        } catch (error) {
          if (strategy.kind === "export" && hasProviderReason(error, 403, EXPORT_SIZE_LIMIT_REASON)) {
            return Object.freeze({ metadata, content: unavailable(AJOOP_DRIVE_CONTENT_UNAVAILABLE_REASONS.EXPORT_SIZE_LIMIT_EXCEEDED) });
          }
          throw error;
        }
        let bounded;
        try {
          bounded = await readBoundedUtf8Stream(response?.data, { signal });
        } catch (error) {
          if (isEncodingError(error)) {
            return Object.freeze({ metadata, content: unavailable(AJOOP_DRIVE_CONTENT_UNAVAILABLE_REASONS.INVALID_UTF8) });
          }
          throw error;
        }
        return Object.freeze({
          metadata,
          content: Object.freeze({
            contentAvailable: true,
            contentType: strategy.contentType,
            contentText: bounded.contentText,
            contentPartial: strategy.contentPartial,
            contentUnavailableReason: null,
            truncated: bounded.truncated,
          }),
        });
      });
    },
  });
}
