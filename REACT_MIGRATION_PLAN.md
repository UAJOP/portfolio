# React Migration Plan

How `kaanbalci.com` moves from its current static HTML/CSS/JS architecture to React, without a rewrite and without a period where the public site is worse than it is today.

This document is the contract for Portfolio Modernization V3, phases #23 through #33. The phase list in §4 is the **locked master roadmap** agreed with the owner; §4 is authoritative and no other document or pull request may reorder or renumber it.

#23 established the foundation described in "Current state"; everything after it is planned work.

## 1. Target stack

| Layer | Choice |
|---|---|
| UI | React 19 |
| Language | JavaScript + JSX |
| Build | Vite 8 |
| Routing | React Router 7 |
| Data | JSON |
| Styling | CSS with custom properties |
| Output | Static, pre-rendered HTML |

Nothing else. No CSS framework, no state library, no CSS-in-JS, no meta-framework.

## 2. Why React + Vite

The site outgrew its architecture, not its hosting. `legacy-script.js` is a single ~313 KB global-scope file that owns navigation, theming, translations, the project archive, the chatbot shell, the command palette and several per-game behaviors at once. Every feature added to it raises the cost of the next one, and nothing in it can be tested in isolation.

React is chosen for component boundaries and explicit state, not for interactivity the site lacks. Vite is chosen because it is a build tool rather than a framework: it produces static assets, imposes no server runtime, no routing convention and no data-fetching model, so the deployment target stays exactly what it is today — static files behind GitHub Pages.

Deliberately rejected:

- **Next.js / Astro** — both solve problems this site does not have, and both would replace the hosting model along with the UI layer. The cost of a wrong framework choice here is far higher than the cost of writing a ~90-line pre-render script.
- **Tailwind** — the visual system is already expressed as CSS custom properties that work in both themes. Converting it would be churn with no user-visible result.
- **Redux / Zustand** — the only shared client state is theme and language.

## 3. Why JavaScript/JSX

**JavaScript with JSX is the intentional language of Portfolio Modernization V3.** It is the choice for every phase from #23 to #33, not a placeholder for something else.

The reason is that migrating a page and introducing a type system are separate risks, and running them together makes a failure ambiguous: when a migrated page misbehaves, it must be obvious whether the cause is the migration or the tooling. The existing codebase has no types and no build step, so every type would be newly authored during the very pass that moves the markup.

Correctness in V3 comes from executable guards instead: `qa-react-foundation.js` checks the pre-render output and the canonical truth, the pre-render step fails on an empty render, and Pa11y covers both architectures. Those catch the failures this project actually has.

**TypeScript is outside the scope of V3.** No phase in #23–#33 adopts it, and no adoption date is promised. It may be reevaluated after #33 if the owner chooses to; that is a future decision and is not made here.

## 4. Migration phases

This is the locked master roadmap for Portfolio Modernization V3, agreed with the owner. **It is not to be reordered, renumbered or reinterpreted by an implementation pass.** A phase's scope may be clarified; its number and subject may not change.

| Phase | Title | Scope |
|---|---|---|
| **#23** | React Migration Foundation V1 | React + Vite + Router + isolated pre-render foundation. |
| #24 | Shared Shell + JSON Data Foundation | Header/Footer/shared shell, central JSON data foundation, profile/socials/projects/experience/build-log/i18n migration strategy and parity with `portfolio-data.js`. |
| #25 | Home + About React Migration | First real public React pages with visual/content/behavior/SEO parity. |
| #26 | Works + Games React Migration | ProjectCard, JSON-driven rendering, filters/search and data-driven project UI. |
| #27 | Recruiter Mode + Build Log React Migration | Recruiter Mode V2, role/evidence deep links and Build Log. |
| #28 | Ajoop + Command Palette React Migration | Deterministic Ajoop and Command Palette. |
| #29 | Case Studies + Dynamic Project Routes | SINAMA, Merge Rush, Joyday, Hospital, AI Flow Puzzle and shared case-study architecture. |
| #30 | Labs + Mini-game Shell Migration | Labs plus React shells around Adventure / Joyday Paint / AI Flow Puzzle. Gameplay may remain vanilla JS/canvas. |
| #31 | Legacy Runtime Removal | Only after the migration matrix reaches zero legacy usage: `legacy-script.js`, compatibility layers and duplicate legacy implementations. |
| #32 | External Dependency + Bundle Cleanup | Fonts, Boxicons, remaining CDN/dependency/bundle cleanup, based on measurement. |
| #33 | React Architecture Hardening + V3 Final | Final routes, SEO, metadata, accessibility, bundle budgets, visual QA, documentation and the Portfolio Modernization V3 completion checkpoint. |

Each phase is one pull request, reviewed and merged on its own.

Note the shape of this order: **all migration happens before any removal.** Phases #24–#30 move things; #31 is the first phase that deletes anything. That is deliberate, and it is what §9 depends on.

## 5. Production parity rules

A page is migrated only when its React version matches the live page on all of:

1. **Content** — same copy, EN and TR, including every translated string.
2. **Truth** — facts come from the shared source of truth, never re-typed into a component.
3. **Behavior** — theme, language, navigation and any page-specific interaction.
4. **Accessibility** — 0 Pa11y errors at WCAG 2 AA, and no regression in landmarks, focus order or accessible names.
5. **Metadata** — identical `title`, `description`, `canonical`, OpenGraph and JSON-LD.
6. **URL** — the public URL does not change (see §7).
7. **Performance** — Lighthouse performance no worse than the current measured baseline for that page.

Parity is demonstrated in the pull request with measurements, not asserted.

## 6. Static / pre-render policy

**Every public route must exist as real HTML on disk before any JavaScript runs.** A portfolio that renders client-side is invisible to crawlers, loses its metadata and delays first paint for no benefit.

The pipeline established in #23 (`scripts/prerender-react.mjs`) is:

1. `vite build` produces the client bundle and an HTML template.
2. A second `vite build --ssr` compiles a server entry.
3. Each route is rendered with `renderToString` and injected into the template, along with that route's `title` and `description`.
4. One HTML file is written per route.

The client then **hydrates** that markup rather than replacing it. The build fails if any route renders less than 1 KB of markup, so a silently client-only build cannot ship.

### Hydration rule

Server and client must render identically on the first pass. Anything that differs between build time and browser time — stored preferences, the current date, the requested URL — must start at the value the server used and be reconciled in an effect afterwards. `PreferencesContext` does this for theme and language: both start at their defaults, and the blocking inline script in the document head applies the stored theme to `<html>` before first paint so colors never flash.

Target: **0 hydration errors and 0 React warnings** in the console. This is verified, not assumed.

## 7. Route migration policy

The current production URLs are flat files at the site root: `/`, `/works.html`, `/about.html`, `/sinama-case-study.html`, and so on. They are listed in `sitemap.xml` and are the canonical URLs.

**These URLs do not change.** They are indexed, they are what recruiter deep links point at, and there is no SEO benefit that would justify breaking them.

That has a concrete consequence for the pre-render step: migrated routes emit `works.html`, not `works/index.html`. The route table already treats the output path as a per-route decision (`output` in `src/react/routing/routes.jsx`), so this is a configuration choice rather than a rewrite. The preview uses directory-index output only because it is not bound by existing URLs.

### Hosting reality

GitHub Pages serves static files. It offers no rewrite rules, no SPA fallback and no server configuration — there is no `.htaccess` or nginx config in this deployment, and adding one is not possible.

This matters more than it first appears:

- **A client-side route with no matching file returns the 404 page**, not the route. Client-side routing works only for navigation that starts from an already-loaded page.
- Therefore every route must be pre-rendered to its own file. This is not an optimization; on this host it is the only thing that makes a route directly reachable.
- Unknown paths are served the repository's `404.html` with a 404 status. That page stays as it is.

**A Vite dev-server fallback is not evidence about any of this.** `vite dev` answers any unmatched path with the entry HTML, which makes client-side routes look directly navigable. The preview server is deliberately configured *not* to do that (`appType: "mpa"` plus a middleware that resolves exact file → directory index → `404.html` with a real 404 status), so the preview tests the deployment target rather than a development convenience.

## 8. Data migration policy

Today's truth lives in `portfolio-data.js` as a frozen browser global (`window.KAAN_PORTFOLIO`). A Vite module graph cannot import a global, which is why #23 uses a small parity fixture — and why `qa-react-foundation.js` fails the build if that fixture drifts from the registry.

The JSON data foundation in **#24** converts the registry, alongside that phase's shared-shell work:

- A central JSON data foundation becomes the single source of truth, covering profile, socials, projects, experience, build log and i18n.
- A small adapter assigns it to `window.KAAN_PORTFOLIO` so the legacy runtime keeps working unchanged — parity with `portfolio-data.js` is a requirement of that phase, not a later cleanup.
- React imports the JSON directly.
- `src/react/data/foundation.js` is deleted.

Both architectures then read the same bytes, so drift becomes structurally impossible rather than guarded against. Until #24 lands, **no new portfolio fact may be added to the React tree** — it goes in `portfolio-data.js` first.

Translations move the same way, and later: `legacy-script.js` holds two large lookup objects plus the `data-pv2-en` / `data-pv2-tr` attribute pattern. The preview's `src/react/data/translations.js` is shaped as a flat `key -> { en, tr }` map specifically so it can be serialized to JSON unchanged.

## 9. Legacy removal policy

**Legacy code is deleted only after the React version has proven parity in production.**

The sequence for any page or feature is: build the React version → prove parity (§5) → publish it → let it run → then delete the legacy implementation in a **separate** pull request.

Nothing is deleted in the same change that replaces it. That keeps the revert small: if a migrated page misbehaves, restoring the previous behavior is a revert, not a reconstruction.

The roadmap enforces this at the phase level: **#31 is the first phase that removes anything**, and it runs only after the migration matrix shows zero remaining legacy usage. `legacy-script.js`, the compatibility bootloader layers and any duplicate legacy implementation are removed there, together, once nothing references them. External dependency and bundle cleanup is separate again, in #32, so a removal that changes behavior is never mixed with one that only changes delivery.

## 10. Mini-game strategy

The adventure game, Joyday Paint and AI Flow Puzzle are ~120 KB of canvas and DOM code that predate the current architecture and are not React-shaped. They are also secondary to the AI and software positioning, so they must not drive architectural decisions.

They are handled in **#30**, alongside Labs, and only as far as necessary:

- The **page shell** around each game — header, footer, description, metadata — becomes React, like any other page.
- **Gameplay may remain vanilla JS/canvas.** The game stays a plain script, mounted into a container by a thin React wrapper that owns the canvas element's lifecycle.
- No game logic is rewritten. Rewriting working, self-contained game code to satisfy an architecture is churn with real regression risk and no user benefit.

Merge Rush is unaffected: it is a separate product with its own repository and appears here only as a case study.

## 11. QA strategy

Every existing gate stays. The React work adds gates; it never relaxes one.

| Check | Applies to | Blocking |
|---|---|---|
| `qa:js` | root production JS | yes |
| `qa:portfolio` | registry, boot order, footer, truth | yes |
| `qa:assets` | asset budgets and loading policy | yes |
| `qa:links` | internal links, anchors, deep links | yes |
| `qa:html` | production HTML structure | yes |
| `qa:spelling` | EN + TR | yes |
| `qa:a11y` | 11 production pages, WCAG 2 AA | yes |
| `build:react` | React build and pre-render | yes |
| `qa:react` | pre-render proof and production isolation | yes |
| `qa:a11y:react` | preview routes, WCAG 2 AA | yes |
| `qa:lighthouse` | 11 production pages | report-only |
| External links | third-party availability | report-only |

Notes:

- **JSX is validated by the Vite build**, not by `qa-js-syntax.js`. That script parses root `.js` files as classic scripts because production loads them without a build step; forcing JSX through it would mean checking a syntax it cannot represent. A broken JSX file fails `build:react` instead, which is blocking.
- **Production accessibility and Lighthouse coverage stays at 11 pages.** The preview has its own separate config so it adds coverage rather than displacing any. `qa-react-foundation.js` asserts this.
- As pages migrate, each moves from the production HTML checks to the React checks. The page count under `qa:a11y` never drops.

## 12. Rollback principle

**Every phase must be reversible by reverting its merge commit.**

This is what makes the phase list safe to execute. It requires:

- One phase per pull request, never two.
- No deletion in the same change as a replacement (§9).
- No phase depending on a later phase to be correct.
- The data layer readable by both architectures throughout (§8).

If a migrated page is wrong in production, the response is `git revert`, not a hotfix under pressure.

---

## Current state (after #23)

What exists today, and what it does not do.

**Exists:**

- React 19, React DOM, React Router 7, Vite 8 and `@vitejs/plugin-react`, all pinned exactly in one root `package.json`.
- `src/react/` — the React source tree, with Vite rooted there so the repository root stays a pure static site.
- Three preview routes under `/react-preview/`, pre-rendered to real HTML at build time.
- A pre-render pipeline that fails the build if a route renders empty.
- Theme and language proofs using the production storage keys.
- `qa-react-foundation.js` and `.pa11yci-react`, both blocking in CI.

**Does not exist, by design:**

- Any change to a public production page. The live site is byte-identical to before this pass, apart from one build-log entry.
- Any React code on a public route. `dist-react/` is git-ignored, so GitHub Pages cannot serve it.
- Any migrated content, data, or feature.

The preview is an engineering artifact. It is `noindex`, is not linked from any public surface, and is absent from `sitemap.xml`, the navigation, Recruiter Mode and Ajoop.

### Commands

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

The static site is unaffected and still runs the same way:

```bash
python -m http.server 8000
```
