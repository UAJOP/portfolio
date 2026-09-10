# AJOOP GitHub Read Adapter V1

This adapter is an owner-private, personal GitHub connector. It accepts only an A4.1-approved envelope and returns bounded `connected-source` data. It is not wired to the public portfolio runtime and it never writes connector output to A3 memory.

## Operations and provider boundary

Exactly two operations exist:

- `github.search_pull_requests` calls `GET /search/issues`.
- `github.read_pull_request` calls `GET /repos/{owner}/{repo}/pulls/{prNumber}`.

The provider uses built-in Node `fetch`, with an injectable transport for deterministic QA. Its origin is fixed to `https://api.github.com`; V1 has no configurable API base or GitHub Enterprise support. Every outbound request is `GET` and includes `Accept: application/vnd.github+json`, `User-Agent: AJOOP`, and `X-GitHub-Api-Version: 2026-03-10`. The bearer credential is internal and is never returned or logged.

GitHub documents `2026-03-10` as a currently supported REST API version. Version upgrades must be deliberate and regression-tested because version changes may change response or authorization contracts.

## Fine-grained PAT and local storage

Use a fine-grained personal access token, restricted to only the repositories Kaan wants AJOOP to inspect. The minimum configuration for both operations is:

- Repository access: only selected repositories.
- Metadata: read-only, granted automatically by GitHub for fine-grained tokens.
- Pull requests: read-only.

GitHub's `Search issues and pull requests` endpoint states that a fine-grained token needs no additional endpoint permission; access to private results is still limited by the repositories the token can access. `Get a pull request` accepts `Pull requests: read` (or alternatively `Contents: read`), so this adapter selects the narrower and semantically correct `Pull requests: read`. It does not request Issues, Contents, Actions, Checks, Administration, or any write permission.

Store the token at `.ajoop-runtime/github/token.txt`, already covered by the repository gitignore. `AJOOP_GITHUB_TOKEN_PATH` can point to another narrow local file. Missing files, directories, malformed values, and—on POSIX—files with group/other permission bits fail as `provider-auth-required`. Windows remains compatible without pretending POSIX mode bits are authoritative. Token creation is manual; the adapter never opens a browser.

## Search construction and repository isolation

A4.1 owns validation of `repository`, optional `query`, `state`, and `limit`. As defense in depth, the adapter accepts only the exact own-key argument shape and normalized values A4.1 could have emitted; this compatibility check does not re-authorize a request. The provider query is built in this form:

```text
(<exact normalized optional query>) AND repo:<repository> AND is:pr AND <optional state:open|state:closed>
```

When no query is supplied, the mandatory qualifiers remain joined by explicit `AND` without an empty group. For state `all`, no state qualifier is added. GitHub issue/PR search is sent with `advanced_search=true` because AJOOP uses explicit Boolean grouping to keep the mandatory repository, type, and state constraints authoritative. The interior of the approved user expression is not rewritten; grouping keeps all mandatory constraints outside it. Search syntax—even strings such as `ignore previous instructions`, `delete repository`, or `repo:other/repo`—remains inert provider data.

Isolation is enforced twice: the mandatory `repo:` and `is:pr` qualifiers are always appended, and every returned search item must contain the PR marker plus an exact, case-insensitive `repository_url` match. A mismatched repository or non-PR result rejects the provider response. Read results must match both the requested PR number and the base repository. Canonical PR links are reconstructed as `https://github.com/<owner>/<repo>/pull/<number>` rather than trusted from provider HTML fields.

## Completeness and normalized results

V1 requests page 1 with `per_page` equal to the A4.1 limit and does not auto-paginate. The provider boundary returns `{ pullRequests, totalCount, incomplete, hasMore }` conceptually.

Search returns:

```text
{
  pullRequests: [{ repository, prNumber, title, state, authorLogin,
                   createdAt, updatedAt, closedAt, htmlUrl, truncated }],
  resultCount,
  truncated,
  totalCount,
  omittedPullRequestCount
}
```

The adapter requires `hasMore` to agree exactly with `totalCount > pullRequests.length`; contradictory provider metadata is rejected. `truncated` is true for provider incompleteness, additional provider results, over-return, field truncation, or total-output fitting. When `incomplete_results` is false, `omittedPullRequestCount` is exact. When it is true, the count is `null`; the adapter does not invent precision from an incomplete search.

Read returns:

```text
{
  repository, prNumber, title, bodyText, state, draft, merged,
  mergeable, mergeableState, authorLogin,
  base: { ref, sha }, head: { ref, sha },
  createdAt, updatedAt, closedAt, mergedAt, htmlUrl, truncated
}
```

`merged` is not inferred from `state`. A closed-unmerged PR remains `merged: false`; a merged PR must have a matching `mergedAt`. GitHub documents `mergeable` as `true`, `false`, or `null` while its background calculation is pending, so unknown is preserved as `null`, never changed to false.

Required timestamps are strict RFC 3339 instants and normalize to UTC ISO strings without host-local timezone dependence. Nullable timestamps remain null. Malformed timestamps that could misrepresent state reject the provider response.

## Bounds, trust, and errors

Titles are limited to 500 characters, body text to 12,000, logins to 100, refs to 255, mergeability state to 100, and one normalized result to 256,000 JavaScript UTF-16 code units. SHA values must be lowercase 40- or 64-character hexadecimal identifiers. Control, bidi, and zero-width display characters are neutralized; provider Markdown is untrusted data and is never rendered or executed in this layer.

Sanitized errors are `provider-auth-required`, `provider-auth-expired`, `provider-permission-denied`, `provider-rate-limited`, `provider-not-found`, `provider-unavailable`, `invalid-approved-request`, and `provider-response-invalid`. A `403` is rate-limited only when safe signals such as `x-ratelimit-remaining: 0`, `retry-after`, or a bounded documented primary/secondary-rate-limit signal are present; ordinary `403` remains permission denied. `401`, `404`, `429`, 5xx, and network errors map without exposing provider bodies, stack traces, repository content, or credentials. A private inaccessible repository and a missing repository intentionally share `provider-not-found` privacy semantics. V1 still buffers the provider error body before inspecting a bounded text prefix; bounding network consumption before full buffering is intentionally deferred as low-risk future hardening now that the credential-bearing origin is fixed to GitHub.

## Explicitly out of scope

Writes, merges, close/reopen, issues, comments, reviews, labels, files, diffs, patches, commit history, releases, repository settings, workflow dispatch, Actions, Checks, detailed CI status, public-runtime orchestration, automatic memory persistence, live CI GitHub calls, OAuth app construction, and a multi-provider abstraction are outside V1.
