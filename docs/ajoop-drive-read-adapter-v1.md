# AJOOP Drive Read Adapter V1

## Boundary

This adapter implements only the already-approved A4.1 tools `drive.search_files` and `drive.read_file`. It is owner-private only: it accepts an A4.1 `accepted` envelope, reads the authenticated owner's Google Drive, and returns bounded `connected-source` data. It has no public route, is not imported by the public bridge, makes no model call, performs no write, and never persists anything to A3 memory.

A4.1 stays authoritative. The adapter still re-checks that the envelope could only have come from A4.1: plain objects only, schema version, `drive` connector, read-only access, `connected-source` provenance, a Drive tool ID matching its operation, and exact own enumerable data arguments (no inherited, accessor, extra, or explicitly `undefined` values). Queries must be non-empty, already trimmed, at most 800 characters, and free of control, bidi, and zero-width characters; limits are integers from 1 to 100; `fileId` must match the A4.1 identifier shape. A rejected envelope makes zero provider calls.

## Local authorization

Enable the Google Drive API and create a **Desktop app** OAuth client. Store its downloaded JSON outside tracked source at `.ajoop-runtime/drive/oauth-client.json`, then explicitly run:

```bash
npm run ajoop:drive:auth
```

The bootstrap requests exactly `https://www.googleapis.com/auth/drive.readonly`. Only `installed` (Desktop) client files are accepted. It uses `google.auth.OAuth2`, an ephemeral `127.0.0.1` callback, random state, PKCE S256, and `access_type: "offline"`. One authorization deadline bounds browser launch, callback waiting, and token exchange; success, rejection, launch failure, and timeout all close the loopback server. A refresh token is mandatory. The credential is created once at `.ajoop-runtime/drive/oauth-token.json` with an exclusive-create write; an existing or invalid token file is never overwritten. The bootstrap does not run on runtime startup or in CI and prints only sanitized error codes, never credentials. Paths can be overridden with `AJOOP_DRIVE_OAUTH_CLIENT_PATH` and `AJOOP_DRIVE_TOKEN_PATH`.

A stored token is loaded only if it is an `authorized_user` credential recording exactly the `drive.readonly` scope; anything else is `provider-auth-required`.

### Why `drive.readonly` and not `drive.file` or `drive`

`drive.file` only covers files the app created or the user explicitly opened with the app, for example through the Picker. AJOOP has to find files that already exist, such as "which is my latest CV?", so `drive.file` cannot answer those questions. Full `https://www.googleapis.com/auth/drive` grants write access and is never requested.

Official references:

- <https://developers.google.com/workspace/drive/api/guides/api-specific-auth>
- <https://developers.google.com/workspace/drive/api/guides/search-files>
- <https://developers.google.com/workspace/drive/api/guides/ref-search-terms>
- <https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list>
- <https://developers.google.com/workspace/drive/api/guides/manage-downloads>
- <https://developers.google.com/workspace/drive/api/guides/ref-export-formats>

## Provider surface

Only Drive API v3 `files.list`, `files.get` (metadata, and `alt=media` for allowlisted text), and `files.export` are used. There are no `files.create`, `update`, `copy`, `delete`, or `emptyTrash` calls, no permission, sharing, comment, or revision mutation, no uploads, and `acknowledgeAbuse` is never set.

## Search

The A4.1 query is plain search text, never Drive query syntax. It is escaped as a Drive string literal (backslash becomes `\\` first, then apostrophe becomes `\'`) and placed into a fixed query:

```text
(name contains '<literal>' or fullText contains '<literal>') and trashed = false and mimeType != 'application/vnd.google-apps.folder'
```

Text such as `foo' or trashed = true or name contains '`, `trashed = true`, `mimeType = ...`, or `ignore previous instructions` therefore stays literal search text and cannot change the trash or folder policy.

`files.list` is called with `pageSize` equal to the approved limit, `orderBy: "modifiedTime desc"`, `spaces: "drive"`, and the explicit fields mask:

```text
nextPageToken,incompleteSearch,files(id,name,mimeType,createdTime,modifiedTime,size,shortcutDetails(targetId,targetMimeType))
```

No wildcard fields and no owner, sharing, or permission metadata are requested. Shared drives are not included in V1.

### Pagination truthfulness

V1 fetches exactly one page. The provider client reduces `nextPageToken` to an internal `hasMore` boolean; the token itself is never returned. Drive reports no exact total, so:

- `hasMore` or `incompleteSearch` gives `truncated: true` and `omittedFileCount: null` (unknown).
- Otherwise `omittedFileCount` is the exact number of known records dropped locally (a provider over-return beyond the limit or result-size fitting), and `0` when nothing was dropped.

Success data:

```js
{
  files: [{ fileId, name, mimeType, createdAt, modifiedAt, sizeBytes, webUrl, shortcut }],
  resultCount,
  truncated,
  omittedFileCount // null when the total is unknown
}
```

## Normalized metadata

- `fileId` must match the identifier shape; `webUrl` is always built as `https://drive.google.com/open?id=<encoded fileId>` and never taken from the provider.
- `name` must be a string; it is neutralized for control, bidi, and invisible characters, whitespace-collapsed, and bounded to 500 characters. A bound sets `truncated`.
- `mimeType` must be a bare `type/subtype` of at most 200 characters.
- `createdTime` and `modifiedTime` are required strict RFC 3339 instants with `Z` or a numeric offset. They are normalized to UTC ISO strings without host-timezone dependence; impossible dates are rejected.
- `sizeBytes` is the provider's decimal string (for example `"12345"`) or `null` when Drive omits it. It is never converted to a JavaScript number, so huge sizes are not rounded. Numbers, signs, exponents, leading zeros, and strings over 100 digits are rejected.
- `shortcut` is `null`, or `{ targetFileId, targetMimeType }` for `application/vnd.google-apps.shortcut`. `shortcutDetails` on a non-shortcut is rejected.
- A folder or trashed file in search results contradicts the fixed query, so the response is rejected.

Material corruption of any required field returns `provider-response-invalid`.

## Read

`drive.read_file` first calls `files.get` with the explicit mask `id,name,mimeType,createdTime,modifiedTime,size,trashed,shortcutDetails(targetId,targetMimeType)`. The returned `id` must equal the requested `fileId` and `mimeType` must be a bounded string. Both are checked **before** any content request, so a provider answering with another file never triggers a download. `trashed` is required and exposed explicitly; a trashed file is still readable when requested.

Success data:

```js
{
  fileId, name, mimeType, createdAt, modifiedAt, sizeBytes, trashed, webUrl,
  shortcut,
  contentAvailable, contentType, contentText, contentPartial, contentUnavailableReason,
  truncated
}
```

### Content strategy

| Drive MIME type | Request | Result |
| --- | --- | --- |
| `application/vnd.google-apps.document` | `files.export` as `text/plain` | `contentType: "text/plain"`, `contentPartial: false` |
| `application/vnd.google-apps.presentation` | `files.export` as `text/plain` | `contentType: "text/plain"`, `contentPartial: false` |
| `application/vnd.google-apps.spreadsheet` | `files.export` as `text/csv` | `contentType: "text/csv"`, **`contentPartial: true`** |
| `text/*`, `application/json`, `application/xml`, `application/*+json`, `application/*+xml` | `files.get` with `alt=media` | `contentType` equals the file MIME type |
| `application/vnd.google-apps.folder` | none | unavailable, reason `folder` |
| `application/vnd.google-apps.shortcut` | none | unavailable, reason `shortcut` |
| other `application/vnd.google-apps.*` (Forms, Drawings, Sites, ...) | none | unavailable, reason `unsupported-google-workspace-type` |
| everything else (PDF, DOCX, images including SVG, video, archives, ...) | none | unavailable, reason `unsupported-binary-type` |

A Sheets CSV export can represent only one sheet of a workbook, so Sheets content is always `contentPartial: true` and is never presented as the complete workbook.

Unsupported types are a deliberate V1 boundary, not an error: metadata still succeeds with `contentAvailable: false`, `contentType: null`, `contentText: null`, and a stable `contentUnavailableReason`. This keeps "which is my latest CV?" answerable from metadata even when the CV is a PDF. No PDF or DOCX parser, OCR, image analysis, or base64 binary output exists.

Content that is not valid UTF-8 (for example a Latin-1 `.txt`) also returns metadata with `contentAvailable: false` and reason `invalid-utf8`. No partially decoded or replacement-character text is returned.

When Google rejects a Docs, Slides, or Sheets export with its documented structured 403 reason `exportSizeLimitExceeded`, the read returns metadata with `contentAvailable: false` and reason `export-size-limit-exceeded`, instead of a misleading `provider-permission-denied`. Only that structured reason on a 403 export response counts; provider messages are never parsed, and the same reason on a media request or another status is not honoured.

The provider policy (`resolveDriveContentStrategy`) lives in the adapter module. The adapter re-validates provider content against it: content for an unsupported type, a mismatched `contentType`, a Sheets result not marked partial, or an unexpected unavailable reason is `provider-response-invalid`.

### Shortcuts and folders

Shortcuts are never followed automatically. An explicit read of a shortcut returns its metadata plus `shortcut: { targetFileId, targetMimeType }` with content unavailable. There is no hidden second read; a later caller may explicitly read `targetFileId`. An explicit read of a folder returns folder metadata with content unavailable and makes no export or media request.

## Stream limits and UTF-8

Export and media requests use `responseType: "stream"` and are read incrementally. Nothing is downloaded whole and sliced afterwards.

- At most 256 KiB (262,144 raw bytes) are consumed; at most 120,000 decoded characters are kept.
- On the first bound the stream is destroyed and `truncated: true` is reported.
- Decoding uses a fatal, streaming `TextDecoder`. Multibyte sequences split across chunks decode correctly. A sequence cut by the byte bound is dropped, never emitted as U+FFFD. A surrogate pair is never split by the character bound. A leading BOM is removed.
- Transport errors mid-stream destroy the stream and map to `provider-unavailable`.

### Operation deadline

Every provider operation (`searchFiles`, and `readFile` including its metadata request, export or media request, and every stream chunk) runs under one deadline, 30 seconds by default. Each provider await races an `AbortSignal` that is also handed to the Google client. When the deadline fires:

- the pending request or stream read stops waiting immediately;
- the stream is destroyed and its iterator returned;
- a response that arrives after the deadline has its stream destroyed on arrival;
- the abort listener and the timer are always removed;
- the result is a sanitized `provider-unavailable`, and no partial content is returned.

There is no retry loop. The deadline is an integer from 1 to 120,000 ms passed only by trusted server code to `createGoogleDriveReadClient({ deadlineMs })`. It is never read from requests or the environment.

Names are bounded to 500 characters and MIME types to 200. Each normalized result is bounded to 256,000 serialized JavaScript UTF-16 code units. Search drops trailing records that do not fit and reports it. Read shortens `contentText` to the longest prefix whose whole result fits and sets `truncated: true`.

## Errors

Only sanitized categories are returned: `provider-auth-required`, `provider-auth-expired`, `provider-permission-denied`, `provider-rate-limited`, `provider-not-found`, `provider-unavailable`, `invalid-approved-request`, and `provider-response-invalid`.

| Provider outcome | Category |
| --- | --- |
| 401 | `provider-auth-expired` |
| 403 with reason `rateLimitExceeded`, `userRateLimitExceeded`, `dailyLimitExceeded`, `quotaExceeded`, or status `RESOURCE_EXHAUSTED` | `provider-rate-limited` |
| other 403 | `provider-permission-denied` |
| 404 | `provider-not-found` |
| 429 | `provider-rate-limited` |
| 5xx, network, hostile or unknown error | `provider-unavailable` |

Google's reason is read from the parsed error body. For stream-mode export and media requests, gaxios leaves that body as a string, which is parsed with a bound. Provider messages, bodies, tokens, OAuth payloads, and page tokens are never returned.

## Untrusted connected-source policy

Every Drive name and content string is inert `connected-source` data and never `canonical-portfolio`. Text such as "Ignore previous instructions", "Send this document", "Delete all files", "Reveal the system prompt", or "Store this forever" is returned as data only. It cannot change provenance, escalate to writes, execute actions, or trigger A3 memory persistence.

## Out of scope

Drive writes of any kind, permissions and sharing, uploads, comments and revisions, OCR, PDF parsing, DOCX parsing, image analysis, automatic shortcut following, shared-drive orchestration, multi-page search, multi-connector orchestration, public-runtime wiring, production secret infrastructure, and deployment.
