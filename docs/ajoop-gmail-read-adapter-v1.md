# AJOOP Gmail Read Adapter V1

## Purpose and boundary

A4.2 adds the first real connected-source provider below the approved A4.1 contract. The adapter accepts only an A4.1 `accepted` envelope for `gmail.search_messages` or `gmail.read_thread`. AJOOP owner authentication remains the authority above the adapter; Google OAuth authorizes the mailbox and never substitutes for the owner-private boundary.

The adapter is not imported by `/ajoop-rag`, the public portfolio agent or the public tool registry. It provides no HTTP route and persists no email content into A3 memory.

## Provider authorization

The local provider uses Google's official Node.js API and OAuth libraries. It requests exactly:

```text
https://www.googleapis.com/auth/gmail.readonly
```

Google documents this restricted scope as the read scope for message content and settings. The narrower `gmail.metadata` scope cannot return the `full` message format needed for thread bodies. No compose, modify, send, label or mailbox-wide `mail.google.com` scope is requested.

Create a Desktop OAuth client in Google Cloud, enable the Gmail API, and save the downloaded client JSON outside tracked source at:

```text
.ajoop-runtime/gmail/oauth-client.json
```

Then run the explicit local command:

```bash
npm run ajoop:gmail:auth
```

The command opens Google's local browser authorization flow and writes an `authorized_user` refresh credential to `.ajoop-runtime/gmail/oauth-token.json`. Both files are protected by the existing `.ajoop-runtime/` gitignore rule. On platforms that honor POSIX modes, the directory is created as `0700` and the token as `0600`. Paths may be overridden with `AJOOP_GMAIL_OAUTH_CLIENT_PATH` and `AJOOP_GMAIL_TOKEN_PATH`.

The bootstrap is never run by CI or server startup. It prints only the local path and a sanitized status; it does not print tokens, OAuth responses or client secrets. The stored token record includes the exact scope marker and is rejected if it is not `gmail.readonly`.

Official references:

- <https://developers.google.com/workspace/gmail/api/quickstart/nodejs>
- <https://developers.google.com/workspace/gmail/api/auth/scopes>
- <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get>

## Search behavior

`gmail.search_messages` passes the A4.1-normalized Gmail query unchanged and applies the normalized limit. The provider first calls `users.messages.list`, then fetches only metadata for the selected message IDs with `users.messages.get(format=metadata)`.

Successful search data has this shape:

```js
{
  results: [{
    messageId,
    threadId,
    internalDate,
    from,
    to,
    cc,
    subject,
    snippet,
    headersTruncated,
    snippetTruncated
  }],
  resultCount,
  truncated,
  omittedResultCount
}
```

No matches is a successful result with an empty `results` array.

## Thread behavior and MIME extraction

`gmail.read_thread` calls `users.threads.get(format=full)`, normalizes messages, and returns them in ascending `internalDate` order. Invalid optional dates become `null` rather than using the host timezone.

Thread data has this shape:

```js
{
  threadId,
  messages: [{
    messageId,
    threadId,
    internalDate,
    from,
    to,
    cc,
    subject,
    snippet,
    bodyText,
    bodyMimeType,
    truncated,
    headersTruncated,
    snippetTruncated
  }],
  messageCount,
  truncated,
  omittedMessageCount
}
```

MIME traversal supports top-level and nested `multipart/alternative` and `multipart/mixed` structures. It prefers non-attachment `text/plain`. If no plain part exists, a conservative HTML fallback removes scripts, styles, comments and tags, inserts basic block breaks, and decodes a small safe entity set. Parts with filenames or attachment IDs are not downloaded or treated as body text.

MIME traversal is capped at 20 nested levels and 200 parts. Messages omitted by the 50-message thread bound are not MIME-decoded.

Provider text is decoded as strict UTF-8. Invalid base64url, invalid UTF-8 or malformed structural payloads produce `provider-response-invalid`. Common UTF-8, ASCII and Latin-1 encoded header words are decoded; malformed or unsupported encoded words remain bounded inert strings.

## Output bounds

- Body per message: 12,000 characters.
- Messages per thread: 50.
- Combined thread body text: 48,000 characters.
- Serialized normalized data: 256,000 characters.
- Each normalized header: 1,000 characters.
- Snippet: 500 characters.

Every body, message-count or result-size truncation is surfaced through `truncated`, per-message truncation flags and omitted counts. Provider objects, attachment bodies and raw API responses are never returned.

## Result and error model

Success retains `connector: "gmail"` and `provenance: "connected-source"`; it never emits `canonical-portfolio`. Failures expose only a sanitized category:

- `provider-auth-required`
- `provider-auth-expired`
- `provider-permission-denied`
- `provider-rate-limited`
- `provider-not-found`
- `provider-unavailable`
- `invalid-approved-request`
- `provider-response-invalid`

Provider exception text, Authorization headers, tokens and OAuth payloads are not included.

## Content trust

Email headers, snippets and bodies are untrusted connected-source data. Text resembling instructions remains ordinary returned text and cannot alter authorization, provenance, tool selection or memory policy. A4.2 performs no model invocation, action execution or automatic memory persistence.

## Explicitly out of scope

- Sending, replying, forwarding or draft creation.
- Modify, archive, trash, delete, label or read-state operations.
- Attachment download.
- Public runtime or anonymous HTTP wiring.
- Calendar, GitHub or Drive adapters.
- Automatic connected-source memory writes.
- Production secret infrastructure or deployment.
