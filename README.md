# Kaan Balcı — Portfolio

Source code for [kaanbalci.com](https://kaanbalci.com), the professional portfolio of **Kaan Balcı — AI Designer & Software Developer**.

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

Current product truth is centralized in `portfolio-data.js` and consumed by `portfolio-v2.js`.

This registry powers or synchronizes:

- Recruiter Mode V2
- Role-specific recruiter deep links
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

- `portfolio-data.js` — source of truth for current flagship/project/recruiter/build data
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

A valid role parameter selects the matching evidence profile and opens Recruiter Mode.

## Ajoop scope

Ajoop remains deterministic and portfolio-focused. V2 grounds its current SINAMA, Merge Rush, role-fit and build-status answers in the central registry. It is **not** presented as a live LLM/RAG assistant in this release.

## Resume

The public resume URL is mirrored in the registry and in the preserved legacy runtime:

`https://drive.google.com/file/d/1eERVaYoP-ICuP3xfbzpaDaCo5amwqA8u/view?usp=sharing`

Role-specific private application CVs are intentionally not exposed.

## QA

GitHub Actions Site Preflight checks:

- JavaScript syntax for every root `.js` file
- HTML validation
- spelling
- mobile WCAG 2 AA with Pa11y
- Lighthouse performance / accessibility / best practices / SEO
- broken links

V2 adds `labs.html` and `now.html` to automated accessibility and Lighthouse coverage.

## Deployment

The repository is configured for GitHub Pages with the custom domain in `CNAME`.
