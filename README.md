# Kaan Balcı — Portfolio

Source code for [kaanbalci.com](https://kaanbalci.com), the professional portfolio of **Kaan Balcı — Forward Deployed Engineer**. **AI Designer & Software Developer** is retained as the background/professional description.

## Current positioning

The public portfolio is centered on:

- Applied AI and AI Agent Reliability
- AI Solutions / Solution Engineering
- Conversational AI and workflow design
- LLM evaluation and evidence-based QA
- Python / FastAPI / PostgreSQL product work
- TypeScript product and interactive systems

Two current flagship products lead the portfolio:

- **SINAMA — AI Agent Reliability Lab**
- **Merge Rush: Tiny Factory**

## Portfolio Architecture V2

Current product truth is centralized in canonical JSON under `data/portfolio/`. `portfolio-data.js` is **generated** from it by `npm run data:generate` and committed, so the legacy runtime keeps getting `window.KAAN_PORTFOLIO` synchronously with no build step. It is consumed by `portfolio-v2.js` exactly as before.

Edit the JSON, regenerate, commit both. Never edit `portfolio-data.js` by hand — `npm run qa:data` fails on a stale or hand-edited artifact.

This registry powers or synchronizes:

- Recruiter Mode V2
- Capability-focused recruiter deep links with one canonical target title
- Ajoop evidence answers
- Build Log
- Kaan Labs
- SINAMA Evidence Explorer
- Shared bilingual V2 copy

See [`PORTFOLIO_ARCHITECTURE.md`](PORTFOLIO_ARCHITECTURE.md) before adding new flagship facts or recruiter evidence.

## Runtime boot sequence

`script.js` is now a small compatibility bootloader rather than the monolithic application runtime.

On pages already migrated to V2 it keeps parser order intact and loads the legacy runtime between the registry and the explicit V2 runtime:

`portfolio-data.js → script.js bootloader → legacy-script.js → portfolio-v2.js`

On older pages that still include only `script.js`, the bootloader injects the full stack automatically:

`portfolio-data.js → legacy-script.js → portfolio-v2.js`

It also injects `portfolio-v2.css` when a legacy page does not already include it. This keeps Recruiter Mode, Ajoop and current portfolio evidence synchronized across older case studies, certificates, 404 and mini-game pages without rewriting every HTML file at once.

## Main pages

- `index.html` — concise landing page led by flagship evidence
- `works.html` — curated professional project catalog
- `sinama-case-study.html` — Applied AI / reliability flagship case study + evidence explorer
- `merge-rush-case-study.html` — game / interactive flagship case study + QA evidence
- `blog.html` — professional experience timeline
- `about.html` — profile and capability map
- `request.html` — structured project inquiry
- `now.html` — living product / engineering build log
- `labs.html` — technical experiments separated from the main professional narrative
- `games.html` — active game product + playable browser work
- `single-work.html` — training and certificates
- `project-detail.html` — dynamic archive project detail route (`noindex`)

## Core files

- `data/portfolio/*.json` — **canonical source of truth** for flagship/project/recruiter/build/labs data
- `data/i18n/react-shell.json` — React-shell UI strings
- `portfolio-data.js` — generated legacy compatibility artifact (do not edit by hand)
- `scripts/generate-portfolio-data.mjs` — regenerates it deterministically from the JSON
- `portfolio-v2.js` — V2 runtime and evidence surfaces
- `portfolio-v2.css` — V2 component styling
- `script.js` — global compatibility bootloader
- `legacy-script.js` — preserved pre-V2 global runtime: navigation, theme, historical translations, dynamic archive details, chatbot shell, command palette, request/game utilities and other established interactions
- `style.css` — global styling primitives and legacy component styles

`flagship-copy.js` has been retired; its responsibilities moved to the registry + V2 runtime.

## Recruiter deep links

- `/?role=applied-ai`
- `/?role=solution-engineering`
- `/?role=software`
- `/?role=game`

A valid legacy `role` parameter selects the matching evidence focus and opens Recruiter Mode. Every focus keeps **Forward Deployed Engineer** as the primary target.

## Ajoop scope

Ajoop remains deterministic and portfolio-focused. V2 grounds its current SINAMA, Merge Rush, role-fit and build-status answers in the central registry. It is **not** presented as a live LLM/RAG assistant in this release.

## Resume

The public resume URL is mirrored in the registry and in the preserved legacy runtime:

`https://drive.google.com/file/d/1eERVaYoP-ICuP3xfbzpaDaCo5amwqA8u/view?usp=sharing`

Role-specific private application CVs are intentionally not exposed.

## Site footer

Every public page renders the same footer component: the Kaan Balcı brand linked to the homepage, the current positioning sentence, the canonical set of five public social destinations (GitHub, LinkedIn, Instagram, YouTube, X) and the copyright line.

Canonical social URLs and the footer positioning copy live in `portfolio-data.js` under `profile.socials` and `profile.footerTagline`. The HTML keeps static `href`s so the footer still works without JavaScript, and the consistency guard verifies every rendered footer against the registry values. Add or change a social destination in the registry first, then update the footers.

## QA

Run everything locally with the pinned toolchain:

```bash
npm ci
npm run qa
```

GitHub Actions Site Preflight enforces these as **blocking** checks:

- canonical data contract and generated-registry parity (`qa:data`)
- JavaScript syntax for every root `.js` file (`qa:js`)
- portfolio architecture, footer and truth consistency (`qa:portfolio`)
- critical asset existence, budgets, intrinsic dimensions and loading policy (`qa:assets`)
- deterministic internal links, anchors, role deep links and project slugs (`qa:links`)
- structural HTML errors (`qa:html`)
- English and Turkish spelling (`qa:spelling`)
- mobile WCAG 2 AA across 11 pages with Pa11y (`qa:a11y`)

These stay **report-only** because they depend on the network or runner load:

- Lighthouse performance / accessibility / best practices / SEO
- external link availability

See [`SITE_PREFLIGHT.md`](SITE_PREFLIGHT.md) for the enforcement rationale and [`QA_BASELINE.md`](QA_BASELINE.md) for the current measured baseline.

## React migration foundation

As of #23 the repository also contains a React foundation, running **beside** the production site rather than replacing any part of it.

Nothing public changed. Every page listed above is still served by the existing static architecture, and the React preview is `noindex`, unlinked and absent from `sitemap.xml`.

- source: `src/react/` (Vite is rooted there, so the repository root stays a plain static site)
- output: `dist-react/`, git-ignored, so GitHub Pages cannot publish it
- mounted under `/react-preview/`, never at a production route
- pre-rendered to real HTML at build time, then hydrated

```bash
npm run dev:react
```

```bash
npm run build:react
```

```bash
npm run preview:react
```

```bash
npm run qa:react
```

`npm run build:react`, `npm run qa:react` and `npm run qa:a11y:react` are **blocking** in CI. The React build doubles as the JSX syntax gate, because `qa:js` parses root files as classic scripts and cannot represent JSX.

See [`REACT_MIGRATION_PLAN.md`](REACT_MIGRATION_PLAN.md) for the phase plan, the parity rules and the static/pre-render policy, and [`V3_DESIGN_SYSTEM.md`](V3_DESIGN_SYSTEM.md) for the design system the shared shell is built from.

## Deployment

The repository is configured for GitHub Pages with the custom domain in `CNAME`.
