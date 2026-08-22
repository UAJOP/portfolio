# Portfolio Architecture V2

## Why this exists

The portfolio grew from a static personal site into a product with Recruiter Mode, Ajoop, Command Palette, bilingual copy, case studies, games, request intake, accessibility QA and multiple active flagship products.

The previous structure duplicated current project truth across HTML pages, the monolithic runtime and `flagship-copy.js`. That made drift likely whenever SINAMA, Merge Rush or career positioning changed.

## Source-of-truth rule

For new portfolio work, **current product facts, recruiter profiles, build status and evidence summaries live in `portfolio-data.js` first**.

Do not add a new SINAMA / Merge Rush fact directly to Ajoop or Recruiter Mode without first adding it to the registry.

### `portfolio-data.js`

Owns:

- Profile and contact truth
- Flagship project summaries
- Project status / stack / proof
- One canonical target title plus capability-focused recruiter evidence profiles
- Build log entries
- Labs catalog
- Sanitized SINAMA Evidence Explorer examples

### `portfolio-v2.js`

Owns:

- Unified EN/TR attribute copy (`data-pv2-en` / `data-pv2-tr`)
- Runtime synchronization of Ajoop with registry facts
- Recruiter Mode V2 rendering
- Backward-compatible evidence-focus URLs such as `?role=applied-ai`
- Build Log rendering
- Labs rendering
- SINAMA Evidence Explorer rendering
- Browser-side request receipt note
- Command Palette extensions for Labs, Build Log and recruiter deep links

### `portfolio-v2.css`

Owns UI for the V2 runtime surfaces. New V2 components should be styled here instead of growing `style.css` unless they are true global primitives.

## Runtime compatibility layer

The old monolithic runtime is preserved byte-for-byte as `legacy-script.js`.

`script.js` is now a small bootloader.

On pages explicitly migrated to V2, the HTML already declares `portfolio-data.js` before `script.js` and `portfolio-v2.js` after it. The bootloader detects that setup and synchronously inserts only `legacy-script.js`, preserving execution order.

On older pages that still contain only `<script src="script.js"></script>`, the bootloader inserts:

`portfolio-data.js → legacy-script.js → portfolio-v2.js`

It also adds `portfolio-v2.css` when missing.

This keeps current Recruiter Mode and Ajoop evidence available on older case studies, certificates, 404 and mini-game pages without forcing a risky all-at-once HTML rewrite.

Future refactors can extract focused modules from `legacy-script.js`; the compatibility bootloader gives that work a stable migration boundary.

## Ajoop scope

Ajoop is deterministic in this release. It maps portfolio questions to curated evidence-backed answers and links.

V2 improves its grounding by sourcing current SINAMA, Merge Rush, role-fit and build-status facts from the central registry, but **does not claim a live LLM, semantic retrieval or RAG backend**.

A future semantic assistant should be a separate, explicit product step with source citation, safe fallbacks and clear runtime boundaries.

## Role deep links

Supported evidence-focus ids (the legacy `role` query key remains stable):

- `applied-ai`
- `solution-engineering`
- `software`
- `game`

Example:

`https://kaanbalci.com/?role=applied-ai`

A valid parameter selects that evidence focus and opens Recruiter Mode. It must never replace the canonical `profile.primaryTitle` value: **Forward Deployed Engineer**. `profile.backgroundTitle` stores **AI Designer & Software Developer** as professional background, not as a competing target.

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

## Canonical site footer

Every public page renders one footer component. It is intentionally plain HTML, not a JS-rendered component, so it survives a JavaScript failure.

Contract:

- Kaan Balcı logo and name, linked to `index.html`
- the current positioning sentence, translated through the V2 `data-pv2-en` / `data-pv2-tr` pattern
- exactly five public social destinations: GitHub, LinkedIn, Instagram, YouTube, X
- the copyright line

Canonical truth lives in `portfolio-data.js`:

- `profile.socials` — the five canonical URLs
- `profile.footerTagline` — the bilingual positioning sentence

The HTML keeps static `href`s; `qa-portfolio-consistency.js` verifies every rendered footer against the registry. Change the registry first, then the footers, so drift is caught rather than merged.

Each icon-only link carries an accessible name and an `aria-hidden` icon, and external links use `target="_blank"` with `rel="noopener noreferrer"`.

## QA

The Site Preflight workflow is the release gate. Checks whose outcome is fully determined by the repository block a merge; checks that depend on the network or runner load are report-only.

Blocking: JavaScript syntax, portfolio consistency, internal links, structural HTML errors, spelling, Pa11y WCAG 2 AA.

Report-only: Lighthouse, external link availability.

The QA toolchain is pinned in `package.json` with a committed `package-lock.json`, and CI installs with `npm ci`, so a given revision reproduces the same checks later. See `SITE_PREFLIGHT.md` for the rationale and `QA_BASELINE.md` for the current measured baseline.

Before merge:

1. `npm ci`
2. `npm run qa`
3. Pa11y and Lighthouse against a locally served copy
4. interaction review for Recruiter Mode V2, language switch, Ajoop, role deep links and the SINAMA Evidence Explorer

## Migration note

`flagship-copy.js` was removed. Its responsibilities are now handled by the registry + V2 runtime.

`legacy-script.js` is compatibility code, not the preferred home for new product facts. New current-state logic should enter through the registry or focused V2 modules first.
