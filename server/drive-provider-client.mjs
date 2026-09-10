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

const ENCODING_ERROR = "invalid-provider-content-encoding";

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
 * Reads at most maxBytes from a provider stream and cancels it at the first
 * bound. Decoding is fatal and streaming, so a multibyte sequence split across
 * chunks survives, a sequence cut by the byte bound is dropped rather than
 * replaced, and malformed UTF-8 is reported instead of silently repaired.
 * Transport failures propagate unchanged for provider error mapping.
 */
export async function readBoundedUtf8Stream(stream, {
  maxBytes = AJOOP_DRIVE_MAX_CONTENT_BYTES,
  maxChars = AJOOP_DRIVE_MAX_CONTENT_CHARS,
} = {}) {
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") throw new Error("invalid-provider-content-stream");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const decode = (bytes, options) => {
    try { return decoder.decode(bytes, options); } catch { throw new Error(ENCODING_ERROR); }
  };
  let contentText = "";
  let bytesRead = 0;
  let truncated = false;
  try {
    for await (const chunk of stream) {
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
    destroyStream(stream);
    throw error;
  }
  if (truncated) destroyStream(stream);
  if (contentText.length > maxChars) {
    contentText = truncateUtf16Safely(contentText, maxChars);
    truncated = true;
  }
  return Object.freeze({ contentText, bytesRead, truncated });
}

const isEncodingError = (error) => {
  try { return error?.message === ENCODING_ERROR; } catch { return false; }
};

const unavailable = (reason) => Object.freeze({
  contentAvailable: false,
  contentType: null,
  contentText: null,
  contentPartial: false,
  contentUnavailableReason: reason,
  truncated: false,
});

export function createGoogleDriveReadClient({ auth, driveFactory = (options) => google.drive(options) }) {
  if (!auth || typeof driveFactory !== "function") throw new Error("provider-auth-required");
  const drive = driveFactory({ version: "v3", auth });
  if (!drive?.files) throw new Error("provider-auth-required");

  return Object.freeze({
    async searchFiles({ query, limit }) {
      const response = await drive.files.list({
        q: buildDriveSearchQuery(query),
        pageSize: limit,
        orderBy: "modifiedTime desc",
        spaces: "drive",
        fields: AJOOP_DRIVE_SEARCH_FIELDS,
      });
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
    },

    async readFile({ fileId }) {
      const metadataResponse = await drive.files.get({ fileId, fields: AJOOP_DRIVE_READ_FIELDS });
      const metadata = metadataResponse?.data;
      const mimeType = ownValue(metadata, "mimeType");
      // Identity and type are settled before any content request, so a provider
      // answering with a different file never triggers a second download.
      if (ownValue(metadata, "id") !== fileId || typeof mimeType !== "string" || mimeType.length > AJOOP_DRIVE_MAX_MIME_TYPE_CHARS) {
        throw new Error("invalid-provider-file");
      }
      const strategy = resolveDriveContentStrategy(mimeType);
      if (strategy.kind === "unavailable") return Object.freeze({ metadata, content: unavailable(strategy.reason) });

      const response = strategy.kind === "export"
        ? await drive.files.export({ fileId, mimeType: strategy.contentType }, { responseType: "stream" })
        : await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
      let bounded;
      try {
        bounded = await readBoundedUtf8Stream(response?.data);
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
    },
  });
}
