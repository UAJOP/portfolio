# Career Alignment 2026 — Historical / Superseded

> **This document is historical.** It records the `career-alignment-2026` pass and is kept for provenance only.
>
> **Do not treat anything below as current instructions.** In particular, the "Remaining work" list at the bottom was written before Portfolio Architecture V2 and has since been completed or deliberately replaced. Acting on it today would undo current work.
>
> For the current state, read instead:
>
> - [`README.md`](README.md) — current positioning, page hierarchy and runtime
> - [`PORTFOLIO_ARCHITECTURE.md`](PORTFOLIO_ARCHITECTURE.md) — architecture rules and source-of-truth policy
> - [`portfolio-data.js`](portfolio-data.js) — the live registry of current product, recruiter and build truth
> - [`QA_BASELINE.md`](QA_BASELINE.md) — current measured quality baseline

## What this pass did (2026)

- Repositioned the public profile around **AI Designer & Software Developer**.
- Prioritized Conversational AI, Solution Engineering, LLM Evaluation, Workflow Automation and user-centered software products.
- Removed GPA/GNO from visible and hidden website content.
- Contextualized the 50+ project statement as academic, personal, freelance and team-based contributions.
- Corrected Atölye Joyday, CBOT, Outlier AI, Punto Organization and Ocean's Team titles, dates and descriptions.
- Moved Gameathon and Mobidictum out of the professional employment timeline into a secondary activities section.
- Reworked Recruiter Mode around one profile, evidence, role fit, selected projects and one resume action.
- Centralized every public resume action through one JavaScript constant.
- Removed the old resume ID and all public role-specific resume options.
- Added `games.html` to `sitemap.xml`.

## How it has since been superseded

| Item from this pass | Current state |
|---|---|
| Recruiter Mode single profile | Replaced by Recruiter Mode V2 with four role profiles and `?role=` deep links, sourced from `portfolio-data.js`. |
| Resume centralized in a script constant | Now also mirrored in the registry as `profile.resume`. |
| "Reorganize Works into Selected Work and Project Archive" | Done: Works is tiered flagship → supporting evidence → archive. |
| "Create stronger static case-study pages" | Done: SINAMA and Merge Rush have dedicated case studies. |
| "Complete project-detail SEO/noindex decisions" | Done: `project-detail.html` is `noindex, follow` and excluded from the sitemap, enforced by the consistency guard. |
| "Create and reconnect a revised Portfolio PDF" | Still intentionally not exposed publicly. |

Historical validation notes and deployment steps from the original report are no longer accurate and have been removed to avoid confusion. The current quality baseline lives in [`QA_BASELINE.md`](QA_BASELINE.md).
