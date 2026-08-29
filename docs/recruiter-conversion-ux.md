# kaanbalci.com Recruiter Conversion UX

Established by **BRIEF 05 — Recruiter Conversion & Portfolio UX**, branch `feat/recruiter-conversion-ux-v1`.

## Goal

A recruiter should be able to identify Kaan's direction, find the strongest evidence, understand what he actually did on each project, and reach the CV or a conversation — quickly, on any device.

> **Important framing:** the audit for this brief found the site was **already strongly recruiter-oriented**. The homepage already had positioning, flagship products, capability-grouped skills, experience, supporting proof and a contact hub, and the CTA hierarchy was already tiered correctly. This brief therefore fixed the *specific* gaps that remained rather than restructuring what already worked. Three changes, all evidence-driven — see [What actually changed](#what-actually-changed).

## Target Audience

| Audience | What they need first |
|---|---|
| **Recruiter / sourcer** | Direction, availability, CV, contact — in seconds |
| **Hiring manager** | Role fit, strongest 2–4 projects, what Kaan personally did |
| **Technical lead** | Architecture, stack, reliability approach, GitHub, live demos |
| **Potential client** | Real-business delivery evidence, then the request form |

## Positioning

**Forward Deployed Engineer**, supported by an AI Designer & Software Developer background across Applied AI, agent reliability, solution engineering and hands-on product delivery.

This wording is the site's existing, fact-checked positioning and was **not** rewritten. It already avoids the generic "passionate developer" register the brief warns about, and it unifies the AI, software and interactive work under one direction rather than presenting parallel job hunts.

## Recruiter Journey

```
Landing (index.html)
  └─ Hero: name · direction · positioning · availability
       ├─ View Projects   (primary)   → works.html
       ├─ Recruiter View  (secondary) → evidence drawer
       ├─ View Resume     (secondary) → CV
       └─ Contact         (tertiary)  → mailto
  └─ Flagship pair: SINAMA · Merge Rush        + role per project
  └─ Capability groups: AI Reliability · Solution Engineering ·
     Software & Product · Interactive Systems
  └─ Experience: Atölye Joyday · CBOT · Outlier AI
  └─ Supporting proof: AI Chatbot Flow Design · Joyday · Hospital Form App
  └─ Build log ("what is being built now")
  └─ Contact hub: "Hiring a Forward Deployed Engineer?"
```

Every page's header carries **Recruiter Mode** and the **command palette**, so the CV and contact are one click away from anywhere — including the 25 generated project routes.

## Homepage Hierarchy

Verified in-browser at 1280×800, 1366×768 and 1440×900, and at 320/375/768:

| Attention level | What the visitor gets |
|---|---|
| **5 seconds** | Name, "Forward Deployed Engineer", the headline, availability, and all four CTAs — all inside the first viewport |
| **15 seconds** | Flagship pair (SINAMA, Merge Rush) with Kaan's role on each |
| **30 seconds** | Capability groups, experience with roles, supporting proof, contact hub |
| **2 minutes** | Case studies with problem / role / architecture / evidence |
| **5 minutes** | GitHub, live products, test and reliability evidence |

## Selected Work Strategy

The homepage deliberately does **not** show every project equally:

1. **Flagship pair** — SINAMA (Applied AI / reliability) and Merge Rush (interactive product / gameplay systems). These carry the engineering narrative.
2. **Supporting proof** — AI Chatbot Flow Design (enterprise conversational AI), Atölye Joyday (real-business product ownership), Hospital Form App (software fundamentals).
3. **Full catalog** — `works.html`, with filters, for anyone who wants depth.
4. **Archive** — 25 canonical `/projects/<slug>/` routes.

Selection comes from `data/portfolio/projects.json` and `recruiter-profiles.json`, not from hard-coded page markup.

## Project Evidence Contract

Every recruiter-facing project card now answers:

- **What it is** — title and category
- **What problem** — one-line summary
- **What Kaan did** — `My role: …` *(added by this brief)*
- **Stack** — technology tags
- **Evidence** — case study, GitHub and/or live demo

## Case Study Structure

The flagship case studies already follow a recruiter-readable arc — overview, problem, role, approach, what was built, challenges, current state, evidence. `qa:a11y:static` and `qa:seo` guard their structure. **No case-study copy was rewritten in this brief**; thin archive projects were deliberately left thin rather than padded with invented depth.

## Recruiter Mode

An accelerated, evidence-first path: role fit, selected evidence, skills, availability, CV and contact, filtered by one of four role profiles (`applied-ai`, `solution-engineering`, `software`, `game`).

It is a modal dialog (`role="dialog"`, `aria-modal="true"`) using the shared focus trap from BRIEF 04.

### Persistence

**Session-scoped intent, not a sticky dialog.**

`sessionStorage["kaanbalci-recruiter-intent"]` records that this visitor is evaluating Kaan for a role. On the next page the toggle is marked active so **one click resumes** — but the dialog is **never re-opened automatically**.

That restraint is deliberate. Auto-opening a focus-trapping modal on every navigation would hijack focus and behave like popup spam, which the brief explicitly rules out. `sessionStorage` rather than `localStorage` because evaluating a candidate is a single sitting; a flag surviving for weeks would confuse rather than help.

Blocked storage degrades silently — Recruiter Mode still works, it just forgets.

## CTA Hierarchy

Already correct before this brief; verified and left alone:

| Tier | Style | Action |
|---|---|---|
| Primary | `.btn.primary` | View Projects |
| Secondary | `.btn.ghost` | Recruiter View · View Resume |
| Tertiary | `.btn.text` | Contact |

`qa:recruiter` asserts exactly one primary CTA in the hero and that every hero CTA destination resolves.

## CV Path

One constant, `resumeLink` in `js/core/shell.js` (a rule inherited from `CLAUDE.md`). Reached via the hero "View Resume" button, Recruiter Mode, the command palette and Ajoop.

The CV is **not** repeated on every page. The header exposes Recruiter Mode everywhere, which carries it, and the brief warns against spamming every section.

## Contact Path

- **Recruiters** — direct `mailto:` in the hero, contact hub and Recruiter Mode. No form required to discuss a role.
- **Project inquiries** — `request.html`, the structured form stabilised in BRIEF 00.2.

Keeping these separate matters: sending a recruiter through a project-request form to ask about a role is friction with no purpose.

## Skills Architecture

Grouped by capability, not a wall of logos — the structure the brief asks for already existed:

| Group | Proof |
|---|---|
| AI Reliability & Evaluation | SINAMA |
| Solution Engineering | CBOT / AI Chatbot Flow Design |
| Software & Product Engineering | Hospital Form App, Atölye Joyday |
| Interactive Systems | Merge Rush, AI Flow Puzzle |

Hero chips give the fast version: AI Agent Reliability, Applied AI, Solution Engineering, FastAPI, TypeScript, LLM Evaluation.

## Games / Playground Positioning

Already framed as engineering rather than filler: `games.html` leads with *"One active game product, three playable portfolio experiments"* and *"Merge Rush is the current game-development priority"*, and routes technical experiments to Kaan Labs. Merge Rush sits in the flagship pair as interactive-product and gameplay-state evidence. No repositioning was needed.

## Mobile Recruiter Experience

Verified at 320 / 375 / 768: no horizontal overflow, primary CTA inside the first viewport at every width, role lines wrap cleanly, and BRIEF 04's 44px touch targets and header wrapping are intact.

## Accessibility Considerations

BRIEF 04's baseline is preserved: 44/44 skip links, 0 html-validate errors and warnings, shared focus trap, reduced motion, touch targets. The new role line is a plain `<p>` inside the existing card heading order, so it adds no landmark or heading noise. The recruiter-intent marker is a class on the existing toggle — no new control, no new tab stop.

## Recruiter Funnel Measurement

BRIEF 06 implemented a privacy-conscious, production-configurable event layer for the recruiter journey. The small event model is `recruiter_mode_open`, `selected_work_open`, `project_open`, `github_open`, `live_demo_open`, `cv_open`, `contact_open`, `request_start`, and confirmed `request_submit`.

It collects controlled identifiers and funnel context, never form/chat text. See [`analytics-recruiter-funnel.md`](analytics-recruiter-funnel.md) for provider choice, privacy boundaries, exact triggers, production configuration, and future metrics.

## What actually changed

| # | Change | Why | Evidence source |
|---|---|---|---|
| 1 | **Role on every project card** (5 homepage + 10 Works, EN/TR) | Recruiters had to infer whether Kaan designed, built, evaluated or contributed | Existing `role` in `projects.json` and `project-details.json`; AI Flow Puzzle's role taken verbatim from its own case study |
| 2 | **Recruiter Mode session persistence** | BRIEF 00 recorded it did not persist | New `sessionStorage` intent flag, no auto-open |
| 3 | **Hero headline cap 86px → 70px** | The primary CTA sat below the fold at 1280×800 and 1366×768 | Measured: headline occupied 451px, actions at y=820 in an 800px viewport |

Three canonical `role` values (joyday, chatbotFlow, hospital) were **derived** from their detail records by the composer — the same projection pattern BRIEF 01 used for `name` — so no role is stored twice and none was invented.

## Remaining UX Debt

- **Production analytics configuration is pending**, so the measurement architecture is testable but no live conversion rate exists yet. See BRIEF 06.
- **Recruiter Mode content is role-filtered but not deep-linkable** — there is no shareable URL for "the Applied AI view" beyond the existing `?role=` deep link.
- **Case-study depth is uneven** by design: flagship studies are rich, archive projects are thin. Padding them would mean inventing content.
- **No `hreflang`** — TR and EN share one URL (BRIEF 02 decision), so Turkish-language recruiters are not separately targetable in search.
- **The 5- and 30-second tests are qualitative**, run by one reader against one build. They are not user research.
- **Testimonials / references are absent.** Nothing in the source data supports them, and inventing social proof was out of the question.
