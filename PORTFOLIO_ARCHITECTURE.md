# Portfolio Architecture V2

## Why this exists

The portfolio grew from a static personal site into a product with Recruiter Mode, Ajoop, Command Palette, bilingual copy, case studies, games, request intake, accessibility QA and multiple active flagship products.

The previous structure duplicated current project truth across HTML pages, `script.js` and `flagship-copy.js`. That made drift likely whenever SINAMA, Merge Rush or career positioning changed.

## Source-of-truth rule

For new portfolio work, **current product facts, recruiter profiles, build status and evidence summaries live in `portfolio-data.js` first**.

Do not add a new SINAMA / Merge Rush fact directly to Ajoop or Recruiter Mode without first adding it to the registry.

### `portfolio-data.js`

Owns:

- Profile and contact truth
- Flagship project summaries
- Project status / stack / proof
- Role-specific recruiter profiles
- Build log entries
- Labs catalog
- Sanitized SINAMA Evidence Explorer examples

### `portfolio-v2.js`

Owns:

- Unified EN/TR attribute copy (`data-pv2-en` / `data-pv2-tr`)
- Runtime synchronization of legacy Ajoop with registry facts
- Recruiter Mode V2 rendering
- Role-specific URLs such as `?role=applied-ai`
- Build Log rendering
- Labs rendering
- SINAMA Evidence Explorer rendering
- Browser-side request receipt note
- Command Palette extensions for Labs, Build Log and recruiter deep links

### `portfolio-v2.css`

Owns UI for the V2 runtime surfaces. New V2 components should be styled here instead of growing `style.css` unless they are true global primitives.

## Role deep links

Supported role ids:

- `applied-ai`
- `solution-engineering`
- `software`
- `game`

Example:

`https://kaanbalci.com/?role=applied-ai`

On V2-enabled pages, a valid role parameter selects that evidence profile and opens Recruiter Mode.

## Page hierarchy

### Professional narrative

1. `index.html` — concise landing page
2. `works.html` — curated professional evidence
3. `sinama-case-study.html` — flagship Applied AI proof
4. `merge-rush-case-study.html` — flagship game / interactive product proof
5. `blog.html` — professional timeline
6. `about.html` — profile and capability map
7. `request.html` — project inquiry

### Supporting surfaces

- `now.html` — living build log
- `labs.html` — technical experiments that should not dilute the main career story
- `games.html` — actual game / playable work
- `project-detail.html` — dynamic archive detail route; intentionally `noindex`
- `single-work.html` — training / certificates

## Evidence policy

Prefer evidence over quantity metrics.

Good proof:

- Implemented product behavior
- Test suites / regression logic
- Release-readiness rules
- Real customer workflows
- Responsive QA evidence
- Architecture boundaries
- Live product links

Weak proof should not lead the homepage:

- Tutorial-scale repositories
- Calculator / weather practice apps
- Unbuilt concepts
- Raw certificate counts

These can remain in GitHub, Labs or archive surfaces.

## SINAMA Evidence Explorer

The explorer uses simplified, sanitized static examples. It is not a live evaluator and must never be presented as one.

Its purpose is to make the product model understandable quickly:

`Conversation → Tool Trace → Deterministic Findings → Release Verdict`

## Merge Rush media policy

The public case study may describe verified QA states from the private development record, but it must not invent gameplay screenshots.

When real public screenshots or video are approved, add them to the public portfolio `assets/` folder and reference them from the case study. Keep the private repository private.

## Request-form truth

The current direct request endpoint uses Google Apps Script with `no-cors` browser submission. The browser cannot verify server-side receipt.

The UI may show a **browser submission reference**, but must not call it a server confirmation until the endpoint returns a verifiable response with appropriate CORS handling.

## QA

The Site Preflight workflow remains the release safety net. V2 adds `labs.html` and `now.html` to Pa11y and Lighthouse coverage.

Before merge:

1. HTML validation
2. spelling
3. mobile Pa11y
4. Lighthouse
5. broken-link scan
6. manual smoke test for Recruiter Mode V2, language switch, Ajoop, role deep links and SINAMA Evidence Explorer

## Migration note

`flagship-copy.js` was removed. Its responsibilities are now handled by the registry + V2 runtime. `script.js` still contains legacy data needed by older pages and dynamic archive features; V2 treats that layer as compatibility code and overwrites current flagship/recruiter/Ajoop surfaces at runtime on migrated pages.

Future cleanup should gradually extract remaining large legacy modules from `script.js` into focused files without changing behavior.
