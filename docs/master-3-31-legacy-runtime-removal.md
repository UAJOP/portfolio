# Master 3 #31 — Legacy Runtime Removal

Base: `main` at `094216c` (#30.5). #30.5 is stable in production: Site Preflight #230 passed, GitHub Pages deployed `094216c`, and the 25 migrated documents were accepted live (HTTP, SSR, hydration, console, certificate dialog, request controller; no form was submitted).

## Outcome

All 215 canonical documents are React-owned, but almost none of the vanilla runtime is unused. Every published runtime file executes on at least one production document. #31 therefore removes one file.

| Part | Scope | Status |
| --- | --- | --- |
| #31-A | Delete the `legacy-script.js` stub | **Done** |
| #31-B | Remove about 9 KB of legacy-document writers from shipped modules | **Rejected for now** — deferred pending a measured benefit and a safe oracle strategy |

## #31-A

`legacy-script.js` was a 26-line inert stub left by BRIEF 03. It was removed because nothing used it:

- no document loads it, and `qa:runtime` and `qa:portfolio` fail any document that does;
- `script.js` and its module manifest do not reference it;
- it was never listed in `data/site/public-artifact.json`, so it was never published: `/legacy-script.js` already answered 404 in production, and no public URL changed;
- it is absent from the accepted artifact baseline, so no parity pin or reviewed-edit record refers to it.

Four QA scripts depended on the file existing. `qa-runtime-modules.mjs` now asserts that it stays retired (not on disk, not in the loader, not in the manifest, not in the artifact list) and `qa-portfolio-consistency.js` that it is not on disk; `qa-project-data.mjs` and `qa-react-foundation.js` drop it from their file lists. No baseline pin, reviewed-edit module, parity gate or negative control changed.

## Dependency classification (audit at `094216c`)

Every React document loads 34 classic scripts — the 30-module COMMON manifest plus `locale-bootstrap.js`, `portfolio-data.js`, `script.js` and `portfolio-v2.js` — and then its page modules; `404.html` is the only fully legacy-rendered document; the 85 `.html` redirect stubs load no runtime.

| Script(s) | Consumer | Class |
| --- | --- | --- |
| `script.js`, `portfolio-data.js`, `i18n-data.js`, `i18n/pack-*` | Every document | Active React integration dependency |
| `js/core/*` except `i18n.js` | Every document. The header and footer are server-rendered but not hydrated, so navigation, theme, language switch, overlay focus/inert and analytics live here | Active React integration dependency |
| `js/ajoop/*`, `ajoop-ai-config.js` | Every document | Required engine |
| `js/features/recruiter.js`, `command-palette.js`, `ultimate.js`, `ajoop-nav.js`, `creative.js`, `portfolio-v2.js`, `js/portfolio/routing.js` | Every document; React adopts their engines, and their own DOM builders run on `404.html` | Active dependency and legacy companion fallback |
| `js/pages/labs.js`, `engine-host.js`, `games.js`, `adventure-game.js`, `joyday-paint.js`, `ai-flow-puzzle.js` | Labs and game pages | Required engines |
| `js/request/*`, `request-config.js` | Request | Required controller |
| `js/features/certificates.js` | Certificates | Required controller |
| `case-study.js`, three `*-case-study.data.js` | Joyday, Hospital, AI Flow case studies | Required controller (gallery) |
| `js/portfolio/project-detail.js` | Project routes, `project-detail.html` | Required: project-shell redirect and copy link |
| `js/portfolio/works.js` | Works, Games; stands down under React | Dead in production, QA oracle for the accepted documents |
| `sinama-case-study.data.js` | No document; read by `scripts/i18n-catalog.mjs` | Build-time authority (published, unloaded) |
| `js/core/i18n.js` | No document; not published; read by QA | QA-only authority |
| Legacy source documents in the repository | Structure generators and differential gates | Build-time and QA authority |
| `legacy-script.js` | Nothing | Proven unused — removed |

## #31-B, deferred

Candidates: the body of `js/portfolio/works.js`, `renderBuildLogs` / `buildLogMarkup` / `renderLabCards` in `portfolio-v2.js`, the `renderProjectDetail` body in `js/portfolio/project-detail.js`, and `setupGameCards` in `js/pages/games.js`. All stand down on React documents.

Why it is not done:

- **Benefit is small and unmeasured:** about 9 KB of roughly 950 KB of runtime JavaScript.
- **The code is a live QA oracle.** The differential gates (G-65, G-70, G-71, G-72, and the #27/#28 gates) run the shipped runtime against the accepted legacy documents. Removing these writers breaks those comparisons unless the gates first serve a reconstructed accepted runtime.
- **Baselines pin the files.** The accepted artifact pins every published file, CI may not read git history, and five of these files already carry reviewed edits from #26–#30, so each removal needs a reversible reviewed-edit record layered in the right order.

It can be revisited with a measured benefit and an oracle strategy agreed first. Unpublishing `sinama-case-study.data.js` and dropping the case-study data files from React case pages are deferred for the same reasons.

The larger legacy surface — the Recruiter, Command Palette and Ajoop DOM builders — is needed by `404.html` and stays.
