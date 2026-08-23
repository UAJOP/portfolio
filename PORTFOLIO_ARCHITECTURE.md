# Portfolio Architecture V2

## Why this exists

The portfolio grew from a static personal site into a product with Recruiter Mode, Ajoop, Command Palette, bilingual copy, case studies, games, request intake, accessibility QA and multiple active flagship products.

The previous structure duplicated current project truth across HTML pages, the monolithic runtime and `flagship-copy.js`. That made drift likely whenever SINAMA, Merge Rush or career positioning changed.

## Source-of-truth rule

Since #24 the canonical source of portfolio truth is **JSON**, under `data/portfolio/`.

`portfolio-data.js` is now a **generated compatibility artifact**. Do not edit it by hand: the next generation overwrites the change, and `npm run qa:data` fails on a stale or hand-edited file.

The workflow for any product fact is:

1. edit the relevant file under `data/portfolio/`
2. regenerate the legacy registry:

```bash
npm run data:generate
```

3. commit the JSON change **and** the regenerated `portfolio-data.js`
4. verify with `npm run qa:data`

Do not add a new SINAMA / Merge Rush fact directly to Ajoop or Recruiter Mode without first adding it to the canonical JSON.

### `data/portfolio/*.json`

The canonical data layer. One file per domain:

| File | Owns |
|---|---|
| `meta.json` | registry version and `updatedAt` |
| `profile.json` | name, titles, location, availability, direction, resume, email |
| `socials.json` | the five canonical public destinations — **the only place a social URL is stored** |
| `projects.json` | project truth: status, category, role, summary, stack, proof, links |
| `recruiter-profiles.json` | capability-focused evidence profiles |
| `build-log.json` | build checkpoints |
| `labs.json` | Labs catalog |
| `sinama-evidence.json` | sanitized SINAMA Evidence Explorer examples |

Bilingual values keep the shape they have always had — `{ "en": …, "tr": … }` — so the migration changed the storage format and nothing else.

### Derived fields

The legacy registry exposes GitHub and LinkedIn **twice** — as `profile.github` / `profile.linkedin` and again inside `profile.socials`. Storing them twice in the canonical layer would have left those two URLs with two editable sources, which is the exact drift this data layer exists to remove.

So they are stored **once**, in `socials.json`, and the composer derives the flat fields from it:

```
profile.github   ← socials.github
profile.linkedin ← socials.linkedin
profile.socials  ← socials.json
```

The generated artifact keeps its original shape and key positions; only the number of editable sources changed. `qa:data` asserts the derived fields equal their source, that `profile.json` does not reintroduce them, and that no composed field is either undeclared or silently dropped.

`experience` is deliberately **absent**. No structured experience dataset existed in the registry, and #24 did not invent one. It enters the data layer only when extracted from existing truthful portfolio content.

### `portfolio-data.js` (generated)

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

Blocking: JavaScript syntax, portfolio consistency, asset performance policy, internal links, structural HTML errors, spelling, Pa11y WCAG 2 AA.

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

## React Migration V3 — transitional architecture

As of #23 this repository contains **two architectures at once**. That is intentional and temporary.

### CURRENT — legacy static production

Everything served from `kaanbalci.com` today:

`portfolio-data.js → script.js bootloader → legacy-script.js → portfolio-v2.js`

Flat `.html` files at the repository root, no build step, deployed by GitHub Pages. This is the production reference and remains authoritative until a page has been migrated and proven at parity.

### PARALLEL — React/Vite foundation

A React 19 + Vite 8 + React Router 7 foundation, isolated from production:

- source in `src/react/`, with Vite rooted there so the repository root is not a Vite project
- built by `npm run build:react` into `dist-react/`, which is git-ignored and therefore never published
- mounted under `/react-preview/`, so it cannot resolve to a production route
- `noindex`, absent from `sitemap.xml`, navigation, Recruiter Mode and Ajoop
- pre-rendered to real HTML at build time, then hydrated

It renders no production content. It exists to prove the architecture works before anything depends on it.

### FUTURE — page-by-page migration

Pages move one at a time, each in its own pull request, each preserving its existing public URL.

The phase order is the locked master roadmap in [`REACT_MIGRATION_PLAN.md`](REACT_MIGRATION_PLAN.md) §4, which is the single authoritative statement of it. That roadmap runs every migration phase (#24–#30) before the first removal phase (#31), so the two architectures coexist for the whole migration and separate only at the end.

### The rule that governs the transition

> **A legacy implementation is removed only after the React implementation has proven parity — in content, truth, behavior, accessibility, metadata, URL and performance — and only in a separate pull request from the one that replaced it.**

Nothing is deleted in the same change that replaces it. That keeps every phase reversible by reverting one merge commit.

While both architectures exist, the JSON under `data/portfolio/` stays the one editable canonical source. React imports it directly at build time; the legacy runtime reads the committed `portfolio-data.js` compatibility artifact generated from it. `qa:data` blocks a stale or semantically different artifact, so the two paths cannot diverge quietly.

Removal is concentrated in **#31**, and only once the migration matrix shows zero remaining legacy usage: `legacy-script.js`, the compatibility layers and any duplicate legacy implementation go together, after everything has moved.

### Why the preview does not use SPA routing

GitHub Pages has no rewrite rules and no SPA fallback. A URL that has no file behind it returns `404.html`, whatever the client router would have done with it. Every migrated route therefore has to be pre-rendered to its own file — on this host that is what makes a route directly reachable at all, not a performance nicety.

`vite dev` does answer unmatched paths with the entry HTML, which makes client-side routes look directly navigable. That is a development convenience and proves nothing about production. The preview server is deliberately configured not to do it, so it tests the real deployment behavior: exact file, directory index, or `404.html` with a genuine 404 status.

### SEO under React

Migrated pages keep the metadata contract the static pages already satisfy: `title`, `description`, `canonical`, OpenGraph and JSON-LD. Because these must be present in the served HTML rather than applied by script, they are emitted by the pre-render step per route, from the same route table the router uses. Client-side updates on navigation are an addition to that, never a replacement for it.

## Canonical data layer (#24)

### Why the legacy registry is generated rather than fetched

GitHub Pages serves this repository's files directly. There is no build step before deployment, so the legacy runtime cannot fetch its data:

```js
// Never do this in the legacy runtime.
const data = await fetch("data/portfolio/profile.json");
```

That would make the registry asynchronous, and every consumer — Recruiter Mode, Ajoop, the Build Log, Labs, the SINAMA Evidence Explorer — currently reads `window.KAAN_PORTFOLIO` synchronously during boot.

So the direction is inverted instead. JSON is the source; `portfolio-data.js` is generated from it and **committed**:

```
data/portfolio/*.json
        ↓  npm run data:generate
portfolio-data.js   (committed, classic script)
        ↓
window.KAAN_PORTFOLIO   (synchronous, unchanged contract)
```

The **runtime contract and the semantic registry shape are unchanged**: a classic script that assigns a frozen `window.KAAN_PORTFOLIO` before anything reads it, with the same object shape, the same values and the same top-level freeze behavior. No consumer changed, and no page changed.

The **file itself is not** byte-for-byte what it was — it was regenerated and is now serialized rather than hand-written. What is guaranteed is semantic parity, verified by evaluating both objects and deep-comparing them, key order included.

### Generation is deterministic

`scripts/portfolio-data-model.mjs` is the single definition of how the JSON composes into the legacy shape, including **key order** — the generated file is compared byte-for-byte, so order is part of the contract rather than a formatting preference. Both the generator and `qa-portfolio-data.js` import that one module, so the file that ships and the file that is checked cannot disagree about what correct means.

Same JSON in, byte-identical file out.

### A stale artifact fails the build

`npm run qa:data` verifies that the committed `portfolio-data.js` matches what the canonical JSON would generate. It **never regenerates**. If the two diverge, CI fails and a developer must run `npm run data:generate` and commit the result.

Regenerating in CI and passing would defeat the point: the committed artifact is what GitHub Pages actually serves, so it is the thing that has to be correct in the repository.

The comparison normalizes line endings. This repository uses `* text=auto`, so a Windows checkout is CRLF while the generator emits LF; comparing raw bytes would fail on one platform and pass on the other.

### React consumes the same JSON

`src/react/data/portfolio.js` imports the canonical files through Vite's `@data` alias, at **build time**. Nothing in the React tree fetches portfolio data at runtime — the pre-render step has to see it while generating HTML, and a runtime fetch would produce empty pre-rendered pages.

The temporary parity fixture from #23 (`src/react/data/foundation.js`) is deleted, as the migration plan promised.

Both architectures now **originate from the same canonical JSON source**. React consumes it directly; the legacy runtime consumes a deterministic generated compatibility artifact whose parity is enforced by `qa:data`. That is a guarantee built from three parts — one canonical source, a deterministic generator, and a blocking stale-artifact check — rather than the two runtimes literally reading the same file.

React-shell UI strings moved the same way, into `data/i18n/react-shell.json`. This covers the React shell and its preview only — the production translation system in `legacy-script.js` is untouched, and page copy migrates with each page.

## Shared React shell (#24)

`src/react/components/shell/` holds production-intended components, not preview proofs:

- `SiteShell` — landmarks: skip link, header, `main`, footer, plus a `banner` slot
- `SiteHeader` — brand, navigation, language and theme controls
- `SiteFooter` — brand, positioning line, canonical destinations

The shell holds **no route literals**. Navigation arrives through `navItems` and the brand destination through `brandTo`, which is the single property that lets #25 mount production routes in the same components without editing them.

Preview-only chrome (`PreviewNotice`) lives in `src/react/components/preview/` and is passed through the `banner` slot, so removing the preview touches no shell component. `qa-react-foundation.js` enforces both rules.

The visual system those components are built from is documented in [`V3_DESIGN_SYSTEM.md`](V3_DESIGN_SYSTEM.md).
