# AJOOP Read Connectors v1

A4 starts with a strict owner-private read boundary before any provider SDK or credential is wired into runtime.

## Tier 1 connectors

- Gmail
- Google Calendar
- GitHub
- Google Drive / Docs

## Canonical internal read tools

- `gmail.search_messages`
- `gmail.read_thread`
- `calendar.list_events`
- `calendar.read_event`
- `github.search_pull_requests`
- `github.read_pull_request`
- `drive.search_files`
- `drive.read_file`

These are internal AJOOP tool contracts, not provider API names. Provider-specific adapters will map them to the connected services later.

## Trust boundary

Connector reads are allowed only when both are true:

- surface is `owner-private`
- trusted runtime authentication says `authenticatedOwner === true`

The public portfolio surface is never eligible, even if a caller supplies an owner-like flag.

## Selection policy

Use connected reads only when the answer requires current/personal external state and cannot already be answered from:

- deterministic facts
- the curated portfolio corpus
- the current conversation

This prevents connectors from becoming a default retrieval path.

## V1 safety rules

- read-only tool ids only
- operation and argument allowlists
- bounded result limits
- bounded Gmail/Drive/GitHub search strings
- bounded Calendar time ranges
- canonical owner/repo GitHub targets
- policy fields derived by trusted code, never caller-controlled
- connected results carry `connected-source` provenance
- no provider credentials in the contract
- no network access in the contract
- no writes in this phase

## Next slice

Implement provider adapters one at a time, starting with Gmail read workflows, while keeping raw provider responses outside persistent memory and treating connected content as untrusted data rather than instructions.
