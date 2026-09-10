import {
  AJOOP_READ_CONNECTOR_ACCESS,
  AJOOP_READ_CONNECTOR_MAX_LIMIT,
  AJOOP_READ_CONNECTOR_MAX_PR_NUMBER,
  AJOOP_READ_CONNECTOR_PROVENANCE,
  AJOOP_READ_CONNECTOR_SCHEMA_VERSION,
  AJOOP_READ_CONNECTOR_TOOL_IDS,
} from "./ajoop-read-connector-contract.mjs";

export const AJOOP_GITHUB_MAX_TITLE_CHARS = 500;
export const AJOOP_GITHUB_MAX_BODY_CHARS = 12000;
export const AJOOP_GITHUB_MAX_LOGIN_CHARS = 100;
export const AJOOP_GITHUB_MAX_REF_CHARS = 255;
export const AJOOP_GITHUB_MAX_MERGEABLE_STATE_CHARS = 100;
export const AJOOP_GITHUB_MAX_RESULT_CHARS = 256000;

const GITHUB_TOOL_IDS = new Set([
  AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_SEARCH_PULL_REQUESTS,
  AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_READ_PULL_REQUEST,
]);
const UNSAFE_DISPLAY_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const REPOSITORY = /^([A-Za-z0-9](?:-?[A-Za-z0-9])*)\/([A-Za-z0-9._-]+)$/;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/;

const freeze = (value) => Object.freeze(value);

const failure = (code, toolId = null) => freeze({
  ok: false,
  toolId,
  connector: "github",
  provenance: AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE,
  error: freeze({ code }),
});

const success = (toolId, data) => freeze({
  ok: true,
  toolId,
  connector: "github",
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

const isRepository = (value) => {
  if (typeof value !== "string" || value.length > 160 || value === "." || value === "..") return false;
  const match = REPOSITORY.exec(value);
  return Boolean(match && match[1].length <= 39 && match[2].length <= 100 && match[2] !== "." && match[2] !== "..");
};

const validateApprovedRequest = (approved) => {
  try {
    if (!isPlainObject(approved) || ownDataValue(approved, "ok") !== true || ownDataValue(approved, "code") !== "accepted") return null;
    const request = ownDataValue(approved, "request");
    if (!isPlainObject(request)) return null;
    if (
      ownDataValue(request, "version") !== AJOOP_READ_CONNECTOR_SCHEMA_VERSION ||
      ownDataValue(request, "connector") !== "github" ||
      ownDataValue(request, "access") !== AJOOP_READ_CONNECTOR_ACCESS.READ_ONLY ||
      ownDataValue(request, "provenance") !== AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE
    ) return null;
    const toolId = ownDataValue(request, "toolId");
    const operation = ownDataValue(request, "operation");
    const args = ownDataValue(request, "args");
    if (!GITHUB_TOOL_IDS.has(toolId) || !isPlainObject(args)) return null;
    const repository = ownDataValue(args, "repository");
    if (!isRepository(repository)) return null;

    if (toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_SEARCH_PULL_REQUESTS) {
      const query = ownDataValue(args, "query");
      const state = ownDataValue(args, "state");
      const limit = ownDataValue(args, "limit");
      if (
        operation !== "search_pull_requests" || (query !== undefined && (typeof query !== "string" || !query)) ||
        !["open", "closed", "all"].includes(state) || !Number.isInteger(limit) || limit < 1 || limit > AJOOP_READ_CONNECTOR_MAX_LIMIT
      ) return null;
      return freeze({ toolId, args: freeze({ repository, ...(query === undefined ? {} : { query }), state, limit }) });
    }

    const prNumber = ownDataValue(args, "prNumber");
    if (operation !== "read_pull_request" || !Number.isInteger(prNumber) || prNumber < 1 || prNumber > AJOOP_READ_CONNECTOR_MAX_PR_NUMBER) return null;
    return freeze({ toolId, args: freeze({ repository, prNumber }) });
  } catch {
    return null;
  }
};

const boundedText = (value, maxChars, { collapseWhitespace = false } = {}) => {
  if (typeof value !== "string") return { text: "", truncated: false };
  let text = value.replace(UNSAFE_DISPLAY_TEXT, " ").replace(/\r\n?/g, "\n");
  if (collapseWhitespace) text = text.replace(/[\t\n ]+/g, " ").trim();
  else text = text.trim();
  const truncated = text.length > maxChars;
  return { text: truncated ? text.slice(0, maxChars) : text, truncated };
};

const isRealDate = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const normalizeTimestamp = (value, { required = false } = {}) => {
  if (value === null || value === undefined) {
    if (required) throw new Error("invalid-provider-timestamp");
    return null;
  }
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

const normalizeLogin = (user) => {
  if (user === null || user === undefined) return { text: "", truncated: false };
  if (!isPlainObject(user)) return { text: "", truncated: true };
  const login = ownDataValue(user, "login");
  if (login !== undefined && typeof login !== "string") return { text: "", truncated: true };
  return boundedText(login, AJOOP_GITHUB_MAX_LOGIN_CHARS, { collapseWhitespace: true });
};

const canonicalHtmlUrl = (repository, prNumber) => `https://github.com/${repository}/pull/${prNumber}`;

const validateRepositoryUrl = (value, repository) => (
  typeof value === "string" && value.toLowerCase() === `https://api.github.com/repos/${repository}`.toLowerCase()
);

const normalizeSearchPullRequest = (item, repository) => {
  if (
    !isPlainObject(item) ||
    !isPlainObject(ownDataValue(item, "pull_request")) ||
    !validateRepositoryUrl(ownDataValue(item, "repository_url"), repository)
  ) {
    throw new Error("invalid-provider-repository");
  }
  const prNumber = ownDataValue(item, "number");
  const state = ownDataValue(item, "state");
  if (!Number.isInteger(prNumber) || prNumber < 1 || prNumber > AJOOP_READ_CONNECTOR_MAX_PR_NUMBER || !["open", "closed"].includes(state)) {
    throw new Error("invalid-provider-pull-request");
  }
  const title = boundedText(ownDataValue(item, "title"), AJOOP_GITHUB_MAX_TITLE_CHARS, { collapseWhitespace: true });
  if (!title.text) throw new Error("invalid-provider-pull-request");
  const author = normalizeLogin(ownDataValue(item, "user"));
  const closedAt = normalizeTimestamp(ownDataValue(item, "closed_at"));
  if ((closedAt !== null) !== (state === "closed")) throw new Error("invalid-provider-pull-request");
  return freeze({
    repository,
    prNumber,
    title: title.text,
    state,
    authorLogin: author.text,
    createdAt: normalizeTimestamp(ownDataValue(item, "created_at"), { required: true }),
    updatedAt: normalizeTimestamp(ownDataValue(item, "updated_at"), { required: true }),
    closedAt,
    htmlUrl: canonicalHtmlUrl(repository, prNumber),
    truncated: title.truncated || author.truncated,
  });
};

const normalizeBranch = (branch, repository, { requireRepository = false } = {}) => {
  if (!isPlainObject(branch)) throw new Error("invalid-provider-branch");
  const ref = boundedText(ownDataValue(branch, "ref"), AJOOP_GITHUB_MAX_REF_CHARS, { collapseWhitespace: true });
  const sha = ownDataValue(branch, "sha");
  if (!ref.text || typeof sha !== "string" || !SHA.test(sha)) throw new Error("invalid-provider-branch");
  if (requireRepository) {
    const repo = ownDataValue(branch, "repo");
    if (!isPlainObject(repo) || typeof ownDataValue(repo, "full_name") !== "string" || ownDataValue(repo, "full_name").toLowerCase() !== repository.toLowerCase()) {
      throw new Error("invalid-provider-repository");
    }
  }
  return { value: freeze({ ref: ref.text, sha }), truncated: ref.truncated };
};

const normalizeReadPullRequest = (pullRequest, repository, expectedPrNumber) => {
  if (!isPlainObject(pullRequest)) throw new Error("invalid-provider-pull-request");
  const prNumber = ownDataValue(pullRequest, "number");
  const state = ownDataValue(pullRequest, "state");
  const draft = ownDataValue(pullRequest, "draft");
  const merged = ownDataValue(pullRequest, "merged");
  const mergeable = ownDataValue(pullRequest, "mergeable");
  if (
    prNumber !== expectedPrNumber || !["open", "closed"].includes(state) || typeof draft !== "boolean" || typeof merged !== "boolean" ||
    (mergeable !== null && typeof mergeable !== "boolean")
  ) throw new Error("invalid-provider-pull-request");
  const title = boundedText(ownDataValue(pullRequest, "title"), AJOOP_GITHUB_MAX_TITLE_CHARS, { collapseWhitespace: true });
  if (!title.text) throw new Error("invalid-provider-pull-request");
  const body = boundedText(ownDataValue(pullRequest, "body"), AJOOP_GITHUB_MAX_BODY_CHARS);
  const author = normalizeLogin(ownDataValue(pullRequest, "user"));
  const mergeableState = boundedText(ownDataValue(pullRequest, "mergeable_state"), AJOOP_GITHUB_MAX_MERGEABLE_STATE_CHARS, { collapseWhitespace: true });
  const base = normalizeBranch(ownDataValue(pullRequest, "base"), repository, { requireRepository: true });
  const head = normalizeBranch(ownDataValue(pullRequest, "head"), repository);
  const closedAt = normalizeTimestamp(ownDataValue(pullRequest, "closed_at"));
  const mergedAt = normalizeTimestamp(ownDataValue(pullRequest, "merged_at"));
  if (
    (closedAt !== null) !== (state === "closed") ||
    (mergedAt !== null) !== merged ||
    (merged && state !== "closed")
  ) throw new Error("invalid-provider-pull-request");
  return freeze({
    repository,
    prNumber,
    title: title.text,
    bodyText: body.text,
    state,
    draft,
    merged,
    mergeable,
    mergeableState: mergeableState.text,
    authorLogin: author.text,
    base: base.value,
    head: head.value,
    createdAt: normalizeTimestamp(ownDataValue(pullRequest, "created_at"), { required: true }),
    updatedAt: normalizeTimestamp(ownDataValue(pullRequest, "updated_at"), { required: true }),
    closedAt,
    mergedAt,
    htmlUrl: canonicalHtmlUrl(repository, prNumber),
    truncated: [title, body, author, mergeableState, base, head].some((field) => field.truncated),
  });
};

const mapProviderError = (error) => {
  try {
    const status = Number(ownDataValue(error, "status") ?? ownDataValue(ownDataValue(error, "response") ?? {}, "status"));
    const rateLimited = ownDataValue(error, "rateLimited") === true;
    if (status === 401) return "provider-auth-expired";
    if (status === 403) return rateLimited ? "provider-rate-limited" : "provider-permission-denied";
    if (status === 404) return "provider-not-found";
    if (status === 429) return "provider-rate-limited";
  } catch {
    // Hostile provider errors remain unavailable without leaking their shape.
  }
  return "provider-unavailable";
};

const isInvalidProviderPayloadError = (error) => {
  try { return typeof error?.message === "string" && error.message.startsWith("invalid-provider"); } catch { return false; }
};

const ensureClient = (githubClient) => {
  if (!githubClient || typeof githubClient.searchPullRequests !== "function" || typeof githubClient.readPullRequest !== "function") {
    return "provider-auth-required";
  }
  return null;
};

const fitRecords = (records, makeData) => {
  const fitted = [];
  for (const record of records) {
    const candidate = [...fitted, record];
    if (JSON.stringify(makeData(candidate)).length > AJOOP_GITHUB_MAX_RESULT_CHARS) break;
    fitted.push(record);
  }
  return fitted;
};

const executeSearch = async (request, githubClient) => {
  const providerResult = await githubClient.searchPullRequests(request.args);
  if (!isPlainObject(providerResult)) throw new Error("invalid-provider-response");
  const pullRequests = ownDataValue(providerResult, "pullRequests");
  const totalCount = ownDataValue(providerResult, "totalCount");
  const incomplete = ownDataValue(providerResult, "incomplete");
  const hasMore = ownDataValue(providerResult, "hasMore");
  if (
    !Array.isArray(pullRequests) || !Number.isSafeInteger(totalCount) || totalCount < pullRequests.length || totalCount < 0 ||
    typeof incomplete !== "boolean" || typeof hasMore !== "boolean"
  ) throw new Error("invalid-provider-response");
  const selected = pullRequests.slice(0, request.args.limit);
  const normalized = selected.map((item) => normalizeSearchPullRequest(item, request.args.repository));
  const fields = (results) => ({
    resultCount: results.length,
    truncated: incomplete || hasMore || results.length < pullRequests.length || results.some((result) => result.truncated),
    totalCount,
    omittedPullRequestCount: incomplete ? null : Math.max(0, totalCount - results.length),
  });
  const makeData = (results) => ({ pullRequests: results, ...fields(results) });
  const fitted = fitRecords(normalized, makeData);
  return success(request.toolId, { pullRequests: freeze(fitted), ...fields(fitted) });
};

const executeRead = async (request, githubClient) => {
  const pullRequest = normalizeReadPullRequest(
    await githubClient.readPullRequest(request.args),
    request.args.repository,
    request.args.prNumber,
  );
  if (JSON.stringify(pullRequest).length > AJOOP_GITHUB_MAX_RESULT_CHARS) throw new Error("invalid-provider-response");
  return success(request.toolId, pullRequest);
};

export async function executeAjoopGitHubRead(approved, options = {}) {
  const request = validateApprovedRequest(approved);
  if (!request) return failure("invalid-approved-request");
  try {
    const githubClient = isPlainObject(options) ? ownDataValue(options, "githubClient") : null;
    const clientError = ensureClient(githubClient);
    if (clientError) return failure(clientError, request.toolId);
    if (request.toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.GITHUB_SEARCH_PULL_REQUESTS) return await executeSearch(request, githubClient);
    return await executeRead(request, githubClient);
  } catch (error) {
    if (isInvalidProviderPayloadError(error)) return failure("provider-response-invalid", request.toolId);
    return failure(mapProviderError(error), request.toolId);
  }
}
