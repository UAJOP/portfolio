# AJOOP Calendar Read Adapter V1

## Boundary

This adapter implements only the already-approved A4.1 tools `calendar.list_events` and `calendar.read_event`. It accepts an A4.1 `accepted` owner-private envelope, reads Google Calendar, returns bounded `connected-source` data, and provides no public route, write operation, model call, or memory persistence.

V1 is deliberately fixed to the authenticated account's `primary` calendar. Multi-calendar discovery and selection are out of scope.

## Local authorization

Enable the Google Calendar API and create a **Desktop app** OAuth client. Store its downloaded JSON outside tracked source at `.ajoop-runtime/calendar/oauth-client.json`, then explicitly run:

```bash
npm run ajoop:calendar:auth
```

The bootstrap requests exactly `https://www.googleapis.com/auth/calendar.events.readonly`. It uses an ephemeral `127.0.0.1` callback, random state, PKCE S256, and an offline refresh token. One authorization deadline bounds browser launch, callback waiting and token exchange; success, rejection, launch failure and timeout all close the loopback server. The credential is created once at `.ajoop-runtime/calendar/oauth-token.json`; an existing or invalid token file is never overwritten. The bootstrap is not run by startup or CI and does not print secrets. Paths can be overridden with `AJOOP_CALENDAR_OAUTH_CLIENT_PATH` and `AJOOP_CALENDAR_TOKEN_PATH`.

Official references:

- <https://developers.google.com/workspace/calendar/api/auth>
- <https://developers.google.com/workspace/calendar/api/v3/reference/events/list>
- <https://developers.google.com/workspace/calendar/api/v3/reference/events>

## List behavior

`calendar.list_events` calls `events.list` with the approved UTC `timeMin`, exclusive `timeMax`, and limit plus these fixed controls:

```js
{
  calendarId: "primary",
  singleEvents: true,
  orderBy: "startTime",
  showDeleted: false
}
```

Recurring series are therefore expanded into instances and provider chronological order is preserved. A provider next-page token becomes `hasMore` internally and is never exposed. Successful data is:

```js
{
  events: [normalizedEvent],
  resultCount,
  truncated,
  omittedEventCount // null when another provider page exists
}
```

## Event normalization

Timed values require strict RFC 3339 date-times with an explicit `Z` or numeric offset and are normalized to UTC ISO instants. Optional time-zone labels are bounded metadata only. All-day values retain `{ kind: "date", date: "YYYY-MM-DD" }`; Google's exclusive all-day end date is preserved unchanged. Ordinary timed and all-day events require an exclusive end strictly after their start.

Each normalized event contains `eventId`, `status`, `tombstone`, `summary`, `description`, `location`, `start`, `end`, `allDay`, `endTimeUnspecified`, `organizer`, `attendees`, `recurringEventId`, `originalStartTime`, and `truncated`. `calendar.read_event` returns that event directly as its success data.

When Google returns a minimal cancelled resource without event timing, the adapter emits `status: "cancelled"`, `tombstone: true`, `start: null`, `end: null`, and `allDay: null`. It does not invent timing or content. Valid recurring series identity and original-start metadata are retained; malformed optional recurring metadata is omitted with `truncated: true`. Non-cancelled events continue to require valid start and end data.

Only literal `endTimeUnspecified: true` activates unspecified-end semantics. Its provider `end` is still shape-validated and retained for structural compatibility, but it is compatibility data and must not be treated as a known exact event end; ordinary interval ordering is therefore not applied. Missing or false values normalize to false, while malformed optional values fail soft and mark truncation.

Optional malformed attendees are skipped and surfaced as truncation; malformed required identity or time structure rejects the provider response. Provider `attendeesOmitted: true`, a malformed omission marker, attendee-count bounding, and malformed response-status data all set event-level `truncated: true`, so an incomplete attendee representation is never presented as complete.

Bounds are 500 summary characters, 1,000 location characters, 12,000 description characters, 50 attendees, and 256,000 serialized JavaScript UTF-16 code units per normalized result. Control, bidi, and invisible display characters are neutralized. Provider text remains inert untrusted data.

## Errors and exclusions

Only sanitized categories are returned: `provider-auth-required`, `provider-auth-expired`, `provider-permission-denied`, `provider-rate-limited`, `provider-not-found`, `provider-unavailable`, `invalid-approved-request`, and `provider-response-invalid`. Provider messages, tokens, OAuth payloads, and private page tokens are never returned.

Creating, updating, deleting, moving, responding to, or otherwise mutating events is out of scope. Gmail behavior is unchanged; GitHub and Drive adapters, public-runtime wiring, production secret infrastructure, deployment, and automatic memory writes are also out of scope.
