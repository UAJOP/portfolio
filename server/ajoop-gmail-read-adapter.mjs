import {
  AJOOP_READ_CONNECTOR_ACCESS,
  AJOOP_READ_CONNECTOR_PROVENANCE,
  AJOOP_READ_CONNECTOR_SCHEMA_VERSION,
  AJOOP_READ_CONNECTOR_TOOL_IDS,
} from "./ajoop-read-connector-contract.mjs";

export const AJOOP_GMAIL_MAX_BODY_CHARS = 12000;
export const AJOOP_GMAIL_MAX_THREAD_MESSAGES = 50;
export const AJOOP_GMAIL_MAX_THREAD_BODY_CHARS = 48000;
export const AJOOP_GMAIL_MAX_RESULT_CHARS = 256000;
export const AJOOP_GMAIL_MAX_HEADER_CHARS = 1000;
export const AJOOP_GMAIL_MAX_SNIPPET_CHARS = 500;

const MAX_PROVIDER_ID_CHARS = 240;
const MAX_ENCODED_PART_CHARS = 256000;
const MAX_PROVIDER_HEADER_INPUT_CHARS = 4000;
const MAX_MIME_DEPTH = 20;
const MAX_MIME_PARTS = 200;
const GMAIL_TOOL_IDS = new Set([
  AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES,
  AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_READ_THREAD,
]);
const HEADER_NAMES = Object.freeze(["from", "to", "cc", "subject"]);
const UNSAFE_DISPLAY_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF]/g;

const freeze = (value) => Object.freeze(value);

const failure = (code, toolId = null) => freeze({
  ok: false,
  toolId,
  connector: "gmail",
  provenance: AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE,
  error: freeze({ code }),
});

const success = (toolId, data) => freeze({
  ok: true,
  toolId,
  connector: "gmail",
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

const validateApprovedRequest = (approved) => {
  try {
    if (!isPlainObject(approved) || ownDataValue(approved, "ok") !== true || ownDataValue(approved, "code") !== "accepted") {
      return null;
    }
    const request = ownDataValue(approved, "request");
    if (!isPlainObject(request)) return null;
    if (
      ownDataValue(request, "version") !== AJOOP_READ_CONNECTOR_SCHEMA_VERSION ||
      ownDataValue(request, "connector") !== "gmail" ||
      ownDataValue(request, "access") !== AJOOP_READ_CONNECTOR_ACCESS.READ_ONLY ||
      ownDataValue(request, "provenance") !== AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE
    ) return null;

    const toolId = ownDataValue(request, "toolId");
    const operation = ownDataValue(request, "operation");
    const args = ownDataValue(request, "args");
    if (!GMAIL_TOOL_IDS.has(toolId) || !isPlainObject(args)) return null;

    if (toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES) {
      const query = ownDataValue(args, "query");
      const limit = ownDataValue(args, "limit");
      if (operation !== "search_messages" || typeof query !== "string" || !query || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        return null;
      }
      return freeze({ toolId, args: freeze({ query, limit }) });
    }

    const threadId = ownDataValue(args, "threadId");
    if (operation !== "read_thread" || !isProviderId(threadId)) return null;
    return freeze({ toolId, args: freeze({ threadId }) });
  } catch {
    return null;
  }
};

const isProviderId = (value) => (
  typeof value === "string" && value.length > 0 && value.length <= MAX_PROVIDER_ID_CHARS && /^[A-Za-z0-9._~+=@-]+$/.test(value)
);

const boundedText = (value, maxChars, { collapseWhitespace = false } = {}) => {
  if (typeof value !== "string") return { text: "", truncated: false };
  let text = value.replace(UNSAFE_DISPLAY_TEXT, " ").replace(/\r\n?/g, "\n");
  if (collapseWhitespace) text = text.replace(/[\t\n ]+/g, " ").trim();
  else text = text.trim();
  const truncated = text.length > maxChars;
  return { text: truncated ? text.slice(0, maxChars) : text, truncated };
};

const decodeEncodedWord = (charset, encoding, payload) => {
  try {
    const normalizedCharset = charset.toLowerCase();
    if (!["utf-8", "utf8", "us-ascii", "ascii", "iso-8859-1", "latin1"].includes(normalizedCharset)) return null;
    let bytes;
    if (encoding.toLowerCase() === "b") {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) return null;
      bytes = Buffer.from(payload, "base64");
    } else {
      const q = payload.replace(/_/g, " ");
      if (/(?:^|[^=])%(?![0-9A-Fa-f]{2})/.test(q)) return null;
      const decoded = q.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
      bytes = Buffer.from(decoded, "latin1");
    }
    const decoder = new TextDecoder(normalizedCharset.startsWith("iso-") || normalizedCharset === "latin1" ? "windows-1252" : "utf-8", { fatal: true });
    return decoder.decode(bytes);
  } catch {
    return null;
  }
};

const decodeHeaderWords = (value) => value.replace(
  /=\?([^?\s]+)\?([bBqQ])\?([^?]*)\?=/g,
  (original, charset, encoding, payload) => decodeEncodedWord(charset, encoding, payload) ?? original,
);

const normalizeHeaders = (headers) => {
  const buckets = Object.fromEntries(HEADER_NAMES.map((name) => [name, []]));
  let inputTruncated = false;
  if (Array.isArray(headers)) {
    for (const header of headers) {
      if (!isPlainObject(header)) continue;
      const name = ownDataValue(header, "name");
      const value = ownDataValue(header, "value");
      if (typeof name !== "string" || typeof value !== "string") continue;
      const key = name.toLowerCase();
      if (Object.hasOwn(buckets, key)) {
        inputTruncated ||= value.length > MAX_PROVIDER_HEADER_INPUT_CHARS;
        buckets[key].push(decodeHeaderWords(value.slice(0, MAX_PROVIDER_HEADER_INPUT_CHARS)));
      }
    }
  }

  let truncated = inputTruncated;
  const normalized = {};
  for (const name of HEADER_NAMES) {
    const bounded = boundedText(buckets[name].join(", "), AJOOP_GMAIL_MAX_HEADER_CHARS, { collapseWhitespace: true });
    normalized[name] = bounded.text;
    truncated ||= bounded.truncated;
  }
  return { ...normalized, headersTruncated: truncated };
};

const normalizeInternalDate = (value) => {
  if (typeof value !== "string" || !/^\d{1,16}$/.test(value)) return null;
  const milliseconds = Number(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) return null;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const decodeBase64Url = (value) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*={0,2}$/.test(value) || value.length % 4 === 1) {
    throw new Error("invalid-provider-body");
  }
  const sourceTruncated = value.length > MAX_ENCODED_PART_CHARS;
  let source = sourceTruncated ? value.slice(0, MAX_ENCODED_PART_CHARS) : value;
  source = source.replace(/=+$/g, "");
  if (sourceTruncated) source = source.slice(0, source.length - (source.length % 4));
  const unpadded = source.replace(/-/g, "+").replace(/_/g, "/");
  const base64 = `${unpadded}${"=".repeat((4 - (unpadded.length % 4)) % 4)}`;
  const bytes = Buffer.from(base64, "base64");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { text, sourceTruncated };
};

const decodeHtmlEntities = (html) => html.replace(/&(#x?[0-9A-Fa-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, token) => {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  const lower = token.toLowerCase();
  if (Object.hasOwn(named, lower)) return named[lower];
  const radix = lower.startsWith("#x") ? 16 : 10;
  const digits = lower.replace(/^#x?/, "");
  const codePoint = Number.parseInt(digits, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) return entity;
  try { return String.fromCodePoint(codePoint); } catch { return entity; }
});

const htmlToText = (html) => {
  const withoutExecutable = html
    .replace(/<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?(?:<\/style\s*>|$)/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ");
  const withBreaks = withoutExecutable
    .replace(/<(?:br|hr)\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, "\n");
  return decodeHtmlEntities(withBreaks.replace(/<[^>]*>/g, " "))
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const collectBodyCandidates = (part, candidates, state, depth = 0) => {
  if (depth > MAX_MIME_DEPTH || ++state.parts > MAX_MIME_PARTS) throw new Error("invalid-provider-body");
  if (!isPlainObject(part)) throw new Error("invalid-provider-body");
  const filename = ownDataValue(part, "filename");
  const body = ownDataValue(part, "body");
  const mimeType = ownDataValue(part, "mimeType");
  if (typeof filename === "string" && filename.trim()) return;
  if (isPlainObject(body) && typeof ownDataValue(body, "attachmentId") === "string") return;

  if ((mimeType === "text/plain" || mimeType === "text/html") && isPlainObject(body)) {
    const data = ownDataValue(body, "data");
    if (typeof data === "string") {
      const decoded = decodeBase64Url(data);
      candidates[mimeType === "text/plain" ? "plain" : "html"].push(decoded);
    }
  }

  const parts = ownDataValue(part, "parts");
  if (parts !== undefined && !Array.isArray(parts)) throw new Error("invalid-provider-body");
  if (Array.isArray(parts)) {
    for (const child of parts) collectBodyCandidates(child, candidates, state, depth + 1);
  }
};

const extractBodyText = (payload) => {
  const candidates = { plain: [], html: [] };
  collectBodyCandidates(payload, candidates, { parts: 0 });
  const selected = candidates.plain.length ? candidates.plain : candidates.html;
  const source = candidates.plain.length ? "text/plain" : candidates.html.length ? "text/html" : null;
  const combined = selected.map((entry) => source === "text/html" ? htmlToText(entry.text) : entry.text).filter(Boolean).join("\n\n");
  const bounded = boundedText(combined, AJOOP_GMAIL_MAX_BODY_CHARS);
  return {
    bodyText: bounded.text,
    bodyMimeType: source,
    truncated: bounded.truncated || selected.some((entry) => entry.sourceTruncated),
  };
};

const normalizeMessage = (message, { includeBody }) => {
  if (!isPlainObject(message)) throw new Error("invalid-provider-message");
  const messageId = ownDataValue(message, "id");
  const threadId = ownDataValue(message, "threadId");
  if (!isProviderId(messageId) || !isProviderId(threadId)) throw new Error("invalid-provider-message");
  const payload = ownDataValue(message, "payload");
  if (!isPlainObject(payload)) throw new Error("invalid-provider-message");
  const headers = normalizeHeaders(ownDataValue(payload, "headers"));
  const snippet = boundedText(ownDataValue(message, "snippet"), AJOOP_GMAIL_MAX_SNIPPET_CHARS, { collapseWhitespace: true });
  const base = {
    messageId,
    threadId,
    internalDate: normalizeInternalDate(ownDataValue(message, "internalDate")),
    from: headers.from,
    to: headers.to,
    cc: headers.cc,
    subject: headers.subject,
    snippet: snippet.text,
    headersTruncated: headers.headersTruncated,
    snippetTruncated: snippet.truncated,
  };
  if (!includeBody) return freeze(base);
  const body = extractBodyText(payload);
  return freeze({ ...base, ...body });
};

const mapProviderError = (error) => {
  try {
    const status = Number(error?.response?.status ?? error?.status ?? error?.code);
    if (status === 401) return "provider-auth-expired";
    if (status === 403) return "provider-permission-denied";
    if (status === 404) return "provider-not-found";
    if (status === 429) return "provider-rate-limited";
  } catch {
    // Hostile provider errors are still sanitized as unavailable.
  }
  return "provider-unavailable";
};

const isInvalidProviderPayloadError = (error) => {
  try {
    return typeof error?.message === "string" && error.message.startsWith("invalid-provider");
  } catch {
    return false;
  }
};

const ensureClient = (gmailClient) => {
  if (!gmailClient) return "provider-auth-required";
  if (
    typeof gmailClient.searchMessages !== "function" ||
    typeof gmailClient.getMessageMetadata !== "function" ||
    typeof gmailClient.readThread !== "function"
  ) return "provider-auth-required";
  return null;
};

const fitRecords = (records, makeData) => {
  const fitted = [];
  for (const record of records) {
    const candidate = [...fitted, record];
    if (JSON.stringify(makeData(candidate)).length > AJOOP_GMAIL_MAX_RESULT_CHARS) break;
    fitted.push(record);
  }
  return fitted;
};

const executeSearch = async (request, gmailClient) => {
  const references = await gmailClient.searchMessages({ query: request.args.query, limit: request.args.limit });
  if (!Array.isArray(references)) throw new Error("invalid-provider-response");
  const selected = references.slice(0, request.args.limit);
  const normalized = [];
  for (const reference of selected) {
    if (!isPlainObject(reference) || !isProviderId(ownDataValue(reference, "id"))) throw new Error("invalid-provider-response");
    const message = await gmailClient.getMessageMetadata({ messageId: ownDataValue(reference, "id") });
    normalized.push(normalizeMessage(message, { includeBody: false }));
  }
  const makeData = (results) => ({
    results,
    resultCount: results.length,
    truncated: results.length < references.length,
    omittedResultCount: Math.max(0, references.length - results.length),
  });
  const fitted = fitRecords(normalized, makeData);
  const truncated = fitted.length < normalized.length || references.length > selected.length;
  return success(request.toolId, {
    results: freeze(fitted),
    resultCount: fitted.length,
    truncated,
    omittedResultCount: Math.max(0, references.length - fitted.length),
  });
};

const executeThreadRead = async (request, gmailClient) => {
  const thread = await gmailClient.readThread({ threadId: request.args.threadId });
  if (!isPlainObject(thread) || ownDataValue(thread, "id") !== request.args.threadId) throw new Error("invalid-provider-response");
  const providerMessages = ownDataValue(thread, "messages");
  if (!Array.isArray(providerMessages)) throw new Error("invalid-provider-response");
  const orderedProviderMessages = providerMessages.map((message) => {
    if (!isPlainObject(message) || !isProviderId(ownDataValue(message, "id"))) {
      throw new Error("invalid-provider-message");
    }
    const internalDate = normalizeInternalDate(ownDataValue(message, "internalDate"));
    return { message, internalDate, messageId: ownDataValue(message, "id") };
  }).sort((left, right) => {
    const leftTime = left.internalDate ? Date.parse(left.internalDate) : Number.POSITIVE_INFINITY;
    const rightTime = right.internalDate ? Date.parse(right.internalDate) : Number.POSITIVE_INFINITY;
    return leftTime - rightTime || left.messageId.localeCompare(right.messageId);
  });
  const ordered = orderedProviderMessages
    .slice(0, AJOOP_GMAIL_MAX_THREAD_MESSAGES)
    .map(({ message }) => normalizeMessage(message, { includeBody: true }));

  let remainingBodyChars = AJOOP_GMAIL_MAX_THREAD_BODY_CHARS;
  const bodyBounded = ordered.map((message) => {
    const bodyText = message.bodyText.slice(0, remainingBodyChars);
    const truncated = message.truncated || bodyText.length < message.bodyText.length;
    remainingBodyChars -= bodyText.length;
    return freeze({ ...message, bodyText, truncated });
  });
  const makeData = (messages) => ({
    threadId: request.args.threadId,
    messages,
    messageCount: messages.length,
    truncated: messages.length < providerMessages.length || messages.some((message) => message.truncated),
    omittedMessageCount: Math.max(0, providerMessages.length - messages.length),
  });
  const fitted = fitRecords(bodyBounded, makeData);
  const truncated = fitted.length < providerMessages.length || bodyBounded.some((message) => message.truncated);
  return success(request.toolId, {
    threadId: request.args.threadId,
    messages: freeze(fitted),
    messageCount: fitted.length,
    truncated,
    omittedMessageCount: Math.max(0, providerMessages.length - fitted.length),
  });
};

export async function executeAjoopGmailRead(approved, options = {}) {
  const request = validateApprovedRequest(approved);
  if (!request) return failure("invalid-approved-request");

  try {
    const gmailClient = isPlainObject(options) ? ownDataValue(options, "gmailClient") : null;
    const clientError = ensureClient(gmailClient);
    if (clientError) return failure(clientError, request.toolId);
    if (request.toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.GMAIL_SEARCH_MESSAGES) {
      return await executeSearch(request, gmailClient);
    }
    return await executeThreadRead(request, gmailClient);
  } catch (error) {
    if (isInvalidProviderPayloadError(error)) return failure("provider-response-invalid", request.toolId);
    return failure(mapProviderError(error), request.toolId);
  }
}
