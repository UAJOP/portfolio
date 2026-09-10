import { readFile, stat } from "node:fs/promises";
import process from "node:process";

export const AJOOP_GITHUB_API_VERSION = "2026-03-10";
export const AJOOP_GITHUB_TOKEN_ENV_PATH = "AJOOP_GITHUB_TOKEN_PATH";
export const AJOOP_GITHUB_DEFAULT_TOKEN_PATH = ".ajoop-runtime/github/token.txt";

const TOKEN_MAX_CHARS = 512;
const ERROR_BODY_MAX_CHARS = 4096;

const isSafeToken = (value) => (
  typeof value === "string" && value.length >= 20 && value.length <= TOKEN_MAX_CHARS && !/[\s\u0000-\u001F\u007F]/.test(value)
);

export async function loadStoredGitHubToken({
  tokenPath = process.env[AJOOP_GITHUB_TOKEN_ENV_PATH] || AJOOP_GITHUB_DEFAULT_TOKEN_PATH,
} = {}) {
  if (typeof tokenPath !== "string" || !tokenPath) throw new Error("provider-auth-required");
  try {
    const file = await stat(tokenPath);
    if (!file.isFile()) throw new Error("provider-auth-required");
    if (process.platform !== "win32" && (file.mode & 0o077) !== 0) throw new Error("provider-auth-required");
    const token = (await readFile(tokenPath, "utf8")).trim();
    if (!isSafeToken(token)) throw new Error("provider-auth-required");
    return token;
  } catch {
    throw new Error("provider-auth-required");
  }
}

const readErrorSignal = async (response) => {
  try {
    const text = (await response.text()).slice(0, ERROR_BODY_MAX_CHARS).toLowerCase();
    return text.includes("secondary rate limit") || text.includes("rate limit exceeded") || text.includes("abuse detection");
  } catch {
    return false;
  }
};

const headerValue = (headers, name) => {
  try { return headers?.get?.(name) ?? null; } catch { return null; }
};

const throwProviderError = async (response) => {
  const status = Number(response?.status);
  const rateLimited = status === 429 || headerValue(response?.headers, "x-ratelimit-remaining") === "0" ||
    headerValue(response?.headers, "retry-after") !== null || await readErrorSignal(response);
  const error = new Error("github-provider-error");
  Object.defineProperties(error, {
    status: { value: status, enumerable: false },
    rateLimited: { value: rateLimited, enumerable: false },
  });
  throw error;
};

const parseJsonResponse = async (response) => {
  if (!response?.ok) await throwProviderError(response);
  try {
    return await response.json();
  } catch {
    throw new Error("invalid-provider-response");
  }
};

const buildSearchQuery = ({ repository, query, state }) => [
  ...(query === undefined ? [] : [query]),
  `repo:${repository}`,
  "is:pr",
  ...(state === "all" ? [] : [`state:${state}`]),
].join(" ");

export function createGitHubReadClient({ token, fetchImpl = globalThis.fetch, apiBaseUrl = "https://api.github.com" }) {
  if (!isSafeToken(token) || typeof fetchImpl !== "function") throw new Error("provider-auth-required");
  const base = new URL(apiBaseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("provider-auth-required");
  const headers = Object.freeze({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": AJOOP_GITHUB_API_VERSION,
    "User-Agent": "AJOOP",
  });

  const getJson = async (pathname, searchParams = null) => {
    const url = new URL(pathname, base);
    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) url.searchParams.set(key, String(value));
    }
    const response = await fetchImpl(url, { method: "GET", headers });
    return parseJsonResponse(response);
  };

  return Object.freeze({
    async searchPullRequests({ repository, query, state, limit }) {
      const data = await getJson("/search/issues", {
        q: buildSearchQuery({ repository, query, state }),
        per_page: limit,
        page: 1,
      });
      const pullRequests = data?.items;
      const totalCount = data?.total_count;
      const incomplete = data?.incomplete_results;
      return Object.freeze({
        pullRequests,
        totalCount,
        incomplete,
        hasMore: Number.isSafeInteger(totalCount) && Array.isArray(pullRequests) && totalCount > pullRequests.length,
      });
    },

    async readPullRequest({ repository, prNumber }) {
      const [owner, name] = repository.split("/");
      return getJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls/${prNumber}`);
    },
  });
}
