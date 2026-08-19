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
- Ajoop 3.0 evidence answers
- Build Log
- Kaan Labs
- SINAMA Evidence Explorer
- Shared bilingual V2 copy

See [`PORTFOLIO_ARCHITECTURE.md`](PORTFOLIO_ARCHITECTURE.md) before adding new flagship facts or recruiter evidence.

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
- `script.js` — legacy/global site runtime: navigation, theme, existing translations, dynamic archive details, chatbot shell, command palette and interactive utilities
- `style.css` — global styling primitives and legacy component styles

`flagship-copy.js` has been retired; its responsibilities moved to the registry + V2 runtime.

## Recruiter deep links

- `/?role=applied-ai`
- `/?role=solution-engineering`
- `/?role=software`
- `/?role=game`

A valid role parameter selects the matching evidence profile and opens Recruiter Mode on V2-enabled pages.

## Resume

The public resume URL is still centralized by the legacy runtime and mirrored in the V2 registry:

`https://drive.google.com/file/d/1eERVaYoP-ICuP3xfbzpaDaCo5amwqA8u/view?usp=sharing`

Role-specific private application CVs are intentionally not exposed.

## QA

GitHub Actions runs Site Preflight checks for:

- HTML validation
- spelling
- mobile WCAG 2 AA with Pa11y
- Lighthouse performance / accessibility / best practices / SEO
- broken links

V2 adds `labs.html` and `now.html` to automated accessibility and Lighthouse coverage.

## Deployment

The repository is configured for GitHub Pages with the custom domain in `CNAME`.
