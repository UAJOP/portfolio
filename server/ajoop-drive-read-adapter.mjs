import {
  AJOOP_READ_CONNECTOR_ACCESS,
  AJOOP_READ_CONNECTOR_MAX_ID_CHARS,
  AJOOP_READ_CONNECTOR_MAX_LIMIT,
  AJOOP_READ_CONNECTOR_MAX_QUERY_CHARS,
  AJOOP_READ_CONNECTOR_PROVENANCE,
  AJOOP_READ_CONNECTOR_SCHEMA_VERSION,
  AJOOP_READ_CONNECTOR_TOOL_IDS,
} from "./ajoop-read-connector-contract.mjs";

export const AJOOP_DRIVE_MAX_NAME_CHARS = 500;
export const AJOOP_DRIVE_MAX_MIME_TYPE_CHARS = 200;
export const AJOOP_DRIVE_MAX_CONTENT_CHARS = 120000;
export const AJOOP_DRIVE_MAX_RESULT_CHARS = 256000;

export const AJOOP_DRIVE_MIME_TYPES = Object.freeze({
  DOCUMENT: "application/vnd.google-apps.document",
  PRESENTATION: "application/vnd.google-apps.presentation",
  SPREADSHEET: "application/vnd.google-apps.spreadsheet",
  FOLDER: "application/vnd.google-apps.folder",
  SHORTCUT: "application/vnd.google-apps.shortcut",
});

export const AJOOP_DRIVE_CONTENT_UNAVAILABLE_REASONS = Object.freeze({
  FOLDER: "folder",
  SHORTCUT: "shortcut",
  UNSUPPORTED_BINARY_TYPE: "unsupported-binary-type",
  UNSUPPORTED_GOOGLE_WORKSPACE_TYPE: "unsupported-google-workspace-type",
  INVALID_UTF8: "invalid-utf8",
});

const MIME = AJOOP_DRIVE_MIME_TYPES;
const REASONS = AJOOP_DRIVE_CONTENT_UNAVAILABLE_REASONS;
const GOOGLE_WORKSPACE_PREFIX = "application/vnd.google-apps.";
const DRIVE_TOOL_IDS = new Set([
  AJOOP_READ_CONNECTOR_TOOL_IDS.DRIVE_SEARCH_FILES,
  AJOOP_READ_CONNECTOR_TOOL_IDS.DRIVE_READ_FILE,
]);
const SAFE_IDENTIFIER = /^[A-Za-z0-9._~+=@-]+$/;
const SAFE_MIME_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;
const STRUCTURED_TEXT_MIME_TYPE = /^application\/[a-z0-9][a-z0-9!#$&^_.-]*\+(?:json|xml)$/;
const SAFE_DECIMAL = /^(?:0|[1-9]\d*)$/;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/;
const UNSAFE_INPUT_TEXT = /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF]/;
const UNSAFE_DISPLAY_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const RATE_LIMIT_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded", "quotaExceeded"]);
const MAX_ERROR_BODY_CHARS = 65536;
const SEARCH_RESULT_KEYS = ["files", "hasMore", "incompleteSearch"];
const READ_RESULT_KEYS = ["metadata", "content"];
const CONTENT_KEYS = ["contentAvailable", "contentType", "contentText", "contentPartial", "contentUnavailableReason", "truncated"];

const freeze = (value) => Object.freeze(value);
const failure = (code, toolId = null) => freeze({
  ok: false,
  toolId,
  connector: "drive",
  provenance: AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE,
  error: freeze({ code }),
});
const success = (toolId, data) => freeze({
  ok: true,
  toolId,
  connector: "drive",
  provenance: AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE,
  data: freeze(data),
});

const isPlainObject = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
};

const ownDataValue = (source, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value")) return undefined;
  return descriptor.value;
};

const hasCanonicalOwnDataKeys = (source, required) => {
  const keys = Reflect.ownKeys(source);
  if (keys.length !== required.length || keys.some((key) => typeof key !== "string" || !required.includes(key))) return false;
  return required.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value") && descriptor.value !== undefined;
  });
};

const isProviderId = (value) => (
  typeof value === "string" && value.length > 0 && value.length <= AJOOP_READ_CONNECTOR_MAX_ID_CHARS &&
  value !== "." && value !== ".." && SAFE_IDENTIFIER.test(value)
);

const isTextLikeMimeType = (mimeType) => {
  const lower = mimeType.toLowerCase();
  return lower.startsWith("text/") || lower === "application/json" || lower === "application/xml" || STRUCTURED_TEXT_MIME_TYPE.test(lower);
};

const unavailableStrategy = (reason) => freeze({ kind: "unavailable", contentType: null, contentPartial: false, reason });
const EXPORT_PLAIN_TEXT = freeze({ kind: "export", contentType: "text/plain", contentPartial: false, reason: null });
// A Sheets CSV export carries a single sheet, so it is never the whole workbook.
const EXPORT_SHEET_CSV = freeze({ kind: "export", contentType: "text/csv", contentPartial: true, reason: null });

/**
 * The single V1 content policy. The provider client uses it to decide which
 * request to make; the adapter uses it to reject content the policy could not
 * have produced, so a provider cannot smuggle binary or complete-workbook claims.
 */
export const resolveDriveContentStrategy = (mimeType) => {
  if (typeof mimeType !== "string") return unavailableStrategy(REASONS.UNSUPPORTED_BINARY_TYPE);
  if (mimeType === MIME.FOLDER) return unavailableStrategy(REASONS.FOLDER);
  if (mimeType === MIME.SHORTCUT) return unavailableStrategy(REASONS.SHORTCUT);
  if (mimeType === MIME.DOCUMENT || mimeType === MIME.PRESENTATION) return EXPORT_PLAIN_TEXT;
  if (mimeType === MIME.SPREADSHEET) return EXPORT_SHEET_CSV;
  if (mimeType.toLowerCase().startsWith(GOOGLE_WORKSPACE_PREFIX)) return unavailableStrategy(REASONS.UNSUPPORTED_GOOGLE_WORKSPACE_TYPE);
  if (isTextLikeMimeType(mimeType)) return freeze({ kind: "media", contentType: mimeType, contentPartial: false, reason: null });
  return unavailableStrategy(REASONS.UNSUPPORTED_BINARY_TYPE);
};

const validateApprovedRequest = (approved) => {
  try {
    if (!isPlainObject(approved) || ownDataValue(approved, "ok") !== true || ownDataValue(approved, "code") !== "accepted") return null;
    const request = ownDataValue(approved, "request");
    if (!isPlainObject(request) ||
      ownDataValue(request, "version") !== AJOOP_READ_CONNECTOR_SCHEMA_VERSION ||
      ownDataValue(request, "connector") !== "drive" ||
      ownDataValue(request, "access") !== AJOOP_READ_CONNECTOR_ACCESS.READ_ONLY ||
      ownDataValue(request, "provenance") !== AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE
    ) return null;
    const toolId = ownDataValue(request, "toolId");
    const operation = ownDataValue(request, "operation");
    const args = ownDataValue(request, "args");
    if (!DRIVE_TOOL_IDS.has(toolId) || !isPlainObject(args)) return null;
    if (toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.DRIVE_SEARCH_FILES) {
      if (!hasCanonicalOwnDataKeys(args, ["query", "limit"])) return null;
      const query = ownDataValue(args, "query");
      const limit = ownDataValue(args, "limit");
      if (
        operation !== "search_files" || typeof query !== "string" || !query || query.trim() !== query ||
        query.length > AJOOP_READ_CONNECTOR_MAX_QUERY_CHARS || UNSAFE_INPUT_TEXT.test(query) ||
        !Number.isInteger(limit) || limit < 1 || limit > AJOOP_READ_CONNECTOR_MAX_LIMIT
      ) return null;
      return freeze({ toolId, args: freeze({ query, limit }) });
    }
    if (!hasCanonicalOwnDataKeys(args, ["fileId"])) return null;
    const fileId = ownDataValue(args, "fileId");
    if (operation !== "read_file" || !isProviderId(fileId)) return null;
    return freeze({ toolId, args: freeze({ fileId }) });
  } catch {
    return null;
  }
};

const truncateUtf16Safely = (text, maxChars) => {
  let value = text.slice(0, maxChars);
  if (value && /[\uD800-\uDBFF]/.test(value.at(-1))) value = value.slice(0, -1);
  return value;
};

const boundedText = (value, maxChars, { collapseWhitespace = false } = {}) => {
  if (typeof value !== "string") throw new Error("invalid-provider-text");
  // Neutralization never lengthens text and CRLF folding at most halves it, so a
  // bounded prefix is enough to decide the output without scanning huge input.
  const inputLimit = maxChars * 2 + 2;
  const preTruncated = value.length > inputLimit;
  let text = (preTruncated ? truncateUtf16Safely(value, inputLimit) : value)
    .toWellFormed()
    .replace(UNSAFE_DISPLAY_TEXT, " ")
    .replace(/\r\n?/g, "\n");
  if (collapseWhitespace) text = text.replace(/[\t\n ]+/g, " ").trim();
  const overLimit = text.length > maxChars;
  return { text: overLimit ? truncateUtf16Safely(text, maxChars) : text, truncated: preTruncated || overLimit };
};

const isRealDate = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const normalizeTimestamp = (value) => {
  if (typeof value !== "string") throw new Error("invalid-provider-timestamp");
  const match = RFC3339.exec(value);
  if (!match) throw new Error("invalid-provider-timestamp");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone, offsetHourText, offsetMinuteText] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  if (!isRealDate(year, month, day) || hour > 23 || minute > 59 || second > 59) throw new Error("invalid-provider-timestamp");
  if (zone !== "Z" && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59)) throw new Error("invalid-provider-timestamp");
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error("invalid-provider-timestamp");
  return new Date(milliseconds).toISOString();
};

const normalizeMimeType = (value) => {
  if (typeof value !== "string" || value.length > AJOOP_DRIVE_MAX_MIME_TYPE_CHARS || !SAFE_MIME_TYPE.test(value)) {
    throw new Error("invalid-provider-mime-type");
  }
  return value;
};

// Drive reports int64 sizes as decimal strings; they stay strings so no size is
// silently rounded through an unsafe JavaScript number.
const normalizeSize = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 100 || !SAFE_DECIMAL.test(value)) throw new Error("invalid-provider-size");
  return value;
};

const normalizeShortcut = (file, mimeType) => {
  const raw = ownDataValue(file, "shortcutDetails");
  if (mimeType !== MIME.SHORTCUT) {
    if (raw !== undefined) throw new Error("invalid-provider-shortcut");
    return null;
  }
  if (!isPlainObject(raw)) throw new Error("invalid-provider-shortcut");
  const targetFileId = ownDataValue(raw, "targetId");
  if (!isProviderId(targetFileId)) throw new Error("invalid-provider-shortcut");
  return freeze({ targetFileId, targetMimeType: normalizeMimeType(ownDataValue(raw, "targetMimeType")) });
};

const canonicalWebUrl = (fileId) => {
  const url = new URL("https://drive.google.com/open");
  url.searchParams.set("id", fileId);
  return url.href;
};

const normalizeMetadata = (file, { expectedFileId = null, search = false } = {}) => {
  if (!isPlainObject(file)) throw new Error("invalid-provider-file");
  const fileId = ownDataValue(file, "id");
  if (!isProviderId(fileId) || (expectedFileId !== null && fileId !== expectedFileId)) throw new Error("invalid-provider-file");
  const name = boundedText(ownDataValue(file, "name"), AJOOP_DRIVE_MAX_NAME_CHARS, { collapseWhitespace: true });
  const mimeType = normalizeMimeType(ownDataValue(file, "mimeType"));
  const trashed = ownDataValue(file, "trashed");
  if (search) {
    // The fixed search query excludes folders and trash; a result violating it is not trustworthy.
    if (mimeType === MIME.FOLDER || (trashed !== undefined && trashed !== false)) throw new Error("invalid-provider-file");
  } else if (typeof trashed !== "boolean") {
    throw new Error("invalid-provider-file");
  }
  return {
    value: freeze({
      fileId,
      name: name.text,
      mimeType,
      createdAt: normalizeTimestamp(ownDataValue(file, "createdTime")),
      modifiedAt: normalizeTimestamp(ownDataValue(file, "modifiedTime")),
      sizeBytes: normalizeSize(ownDataValue(file, "size")),
      ...(search ? {} : { trashed }),
      webUrl: canonicalWebUrl(fileId),
      shortcut: normalizeShortcut(file, mimeType),
    }),
    truncated: name.truncated,
  };
};

const normalizeContent = (raw, mimeType) => {
  if (!isPlainObject(raw) || !hasCanonicalOwnDataKeys(raw, CONTENT_KEYS)) throw new Error("invalid-provider-content");
  const strategy = resolveDriveContentStrategy(mimeType);
  const contentAvailable = ownDataValue(raw, "contentAvailable");
  const contentType = ownDataValue(raw, "contentType");
  const contentText = ownDataValue(raw, "contentText");
  const contentPartial = ownDataValue(raw, "contentPartial");
  const reason = ownDataValue(raw, "contentUnavailableReason");
  const providerTruncated = ownDataValue(raw, "truncated");
  if (typeof contentAvailable !== "boolean" || typeof contentPartial !== "boolean" || typeof providerTruncated !== "boolean") {
    throw new Error("invalid-provider-content");
  }
  if (!contentAvailable) {
    const expectedReason = strategy.kind === "unavailable" ? strategy.reason : REASONS.INVALID_UTF8;
    if (reason !== expectedReason || contentType !== null || contentText !== null || contentPartial || providerTruncated) {
      throw new Error("invalid-provider-content");
    }
    return {
      value: { contentAvailable: false, contentType: null, contentText: null, contentPartial: false, contentUnavailableReason: reason },
      truncated: false,
    };
  }
  if (
    strategy.kind === "unavailable" || contentType !== strategy.contentType || contentPartial !== strategy.contentPartial ||
    reason !== null || typeof contentText !== "string"
  ) throw new Error("invalid-provider-content");
  const text = boundedText(contentText, AJOOP_DRIVE_MAX_CONTENT_CHARS);
  return {
    value: { contentAvailable: true, contentType, contentText: text.text, contentPartial, contentUnavailableReason: null },
    truncated: providerTruncated || text.truncated,
  };
};

const resultChars = (data) => JSON.stringify(data).length;

const fitRecords = (records, makeData) => {
  const fitted = [];
  for (const record of records) {
    if (resultChars(makeData([...fitted, record])) > AJOOP_DRIVE_MAX_RESULT_CHARS) break;
    fitted.push(record);
  }
  return fitted;
};

// Escaping can expand serialized text, so content is shortened to the longest
// prefix whose complete result still fits, and that shortening is reported.
const fitReadResult = (data) => {
  if (resultChars(data) <= AJOOP_DRIVE_MAX_RESULT_CHARS) return data;
  if (typeof data.contentText !== "string") throw new Error("invalid-provider-response");
  const withPrefix = (length) => ({ ...data, contentText: truncateUtf16Safely(data.contentText, length), truncated: true });
  let low = 0;
  let high = data.contentText.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (resultChars(withPrefix(middle)) <= AJOOP_DRIVE_MAX_RESULT_CHARS) low = middle;
    else high = middle - 1;
  }
  const fitted = withPrefix(low);
  if (resultChars(fitted) > AJOOP_DRIVE_MAX_RESULT_CHARS) throw new Error("invalid-provider-response");
  return fitted;
};

// Stream-mode requests leave Google's JSON error body as an unparsed string.
const parseErrorBody = (data) => {
  if (typeof data !== "string") return data;
  if (data.length > MAX_ERROR_BODY_CHARS) return undefined;
  try { return JSON.parse(data); } catch { return undefined; }
};

const hasRateLimitReason = (response) => {
  try {
    const data = response && typeof response === "object" ? parseErrorBody(ownDataValue(response, "data")) : undefined;
    const providerError = isPlainObject(data) ? ownDataValue(data, "error") : undefined;
    if (!isPlainObject(providerError)) return false;
    if (ownDataValue(providerError, "status") === "RESOURCE_EXHAUSTED") return true;
    const errors = ownDataValue(providerError, "errors");
    return Array.isArray(errors) && errors.some((entry) => isPlainObject(entry) && RATE_LIMIT_REASONS.has(ownDataValue(entry, "reason")));
  } catch {
    return false;
  }
};

const mapProviderError = (error) => {
  try {
    const response = error && typeof error === "object" ? ownDataValue(error, "response") : undefined;
    const responseStatus = response && typeof response === "object" ? ownDataValue(response, "status") : undefined;
    const status = Number(responseStatus ?? ownDataValue(error, "status") ?? ownDataValue(error, "code"));
    if (status === 401) return "provider-auth-expired";
    if (status === 403) return hasRateLimitReason(response) ? "provider-rate-limited" : "provider-permission-denied";
    if (status === 404) return "provider-not-found";
    if (status === 429) return "provider-rate-limited";
  } catch {
    // Hostile provider errors are sanitized as unavailable.
  }
  return "provider-unavailable";
};

const isInvalidProviderPayloadError = (error) => {
  try { return typeof error?.message === "string" && error.message.startsWith("invalid-provider"); } catch { return false; }
};

const ensureClient = (driveClient) => (
  driveClient && typeof driveClient.searchFiles === "function" && typeof driveClient.readFile === "function"
    ? null : "provider-auth-required"
);

const executeSearch = async (request, driveClient) => {
  const providerResult = await driveClient.searchFiles(request.args);
  if (!isPlainObject(providerResult) || !hasCanonicalOwnDataKeys(providerResult, SEARCH_RESULT_KEYS)) {
    throw new Error("invalid-provider-response");
  }
  const files = ownDataValue(providerResult, "files");
  const hasMore = ownDataValue(providerResult, "hasMore");
  const incompleteSearch = ownDataValue(providerResult, "incompleteSearch");
  if (!Array.isArray(files) || typeof hasMore !== "boolean" || typeof incompleteSearch !== "boolean") {
    throw new Error("invalid-provider-response");
  }
  const normalized = files.slice(0, request.args.limit).map((file) => normalizeMetadata(file, { search: true }));
  // Drive exposes no exact total, so an unfetched page or incomplete search leaves the omission count unknown.
  const totalUnknown = hasMore || incompleteSearch;
  const fields = (records) => ({
    resultCount: records.length,
    truncated: totalUnknown || records.length < files.length || records.some(({ truncated }) => truncated),
    omittedFileCount: totalUnknown ? null : files.length - records.length,
  });
  const makeData = (records) => ({ files: records.map(({ value }) => value), ...fields(records) });
  const fitted = fitRecords(normalized, makeData);
  return success(request.toolId, { files: freeze(fitted.map(({ value }) => value)), ...fields(fitted) });
};

const executeRead = async (request, driveClient) => {
  const providerResult = await driveClient.readFile(request.args);
  if (!isPlainObject(providerResult) || !hasCanonicalOwnDataKeys(providerResult, READ_RESULT_KEYS)) {
    throw new Error("invalid-provider-response");
  }
  const metadata = normalizeMetadata(ownDataValue(providerResult, "metadata"), { expectedFileId: request.args.fileId });
  const content = normalizeContent(ownDataValue(providerResult, "content"), metadata.value.mimeType);
  return success(request.toolId, fitReadResult({
    ...metadata.value,
    ...content.value,
    truncated: metadata.truncated || content.truncated,
  }));
};

export async function executeAjoopDriveRead(approved, options = {}) {
  const request = validateApprovedRequest(approved);
  if (!request) return failure("invalid-approved-request");
  try {
    const driveClient = isPlainObject(options) ? ownDataValue(options, "driveClient") : null;
    const clientError = ensureClient(driveClient);
    if (clientError) return failure(clientError, request.toolId);
    if (request.toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.DRIVE_SEARCH_FILES) return await executeSearch(request, driveClient);
    return await executeRead(request, driveClient);
  } catch (error) {
    if (isInvalidProviderPayloadError(error)) return failure("provider-response-invalid", request.toolId);
    return failure(mapProviderError(error), request.toolId);
  }
}
