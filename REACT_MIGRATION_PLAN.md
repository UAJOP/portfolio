# React Migration Plan

How `kaanbalci.com` moves from its current static HTML/CSS/JS architecture to React, without a rewrite and without a period where the public site is worse than it is today.

This document is the contract for phases #23 through #33. #23 established the foundation described in "Current state"; everything after it is planned work.

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

## 3. Why JavaScript/JSX rather than TypeScript

TypeScript is the right long-term answer and is explicitly deferred, not rejected.

The reason is sequencing. Migrating a page and introducing a type system are separate risks, and running them together makes a failure ambiguous: when a migrated page misbehaves, it must be obvious whether the cause is the migration or the tooling. The existing codebase has no types and no build step, so every type would be newly authored during the same pass that moves the markup.

TypeScript is adopted after the data layer is JSON (#24), where types have real work to do: describing the registry shape and catching drift at build time rather than in a guard script. Adopting it earlier means typing a data structure that is about to change.

## 4. Migration phases

| Phase | Scope | Removes legacy? |
|---|---|---|
| **#23** | React/Vite/Router foundation, pre-render proof, isolated preview | No |
| #24 | Portfolio registry becomes JSON; single source of truth for both architectures | No |
| #25 | Design tokens and real Header/Footer parity components | No |
| #26 | Home migrated and published at `/` | Home only |
| #27 | About and Works migrated | Those pages |
| #28 | Case studies migrated (SINAMA, Merge Rush, hospital, Joyday, AI Flow Puzzle) | Those pages |
| #29 | Blog, Now, Labs, Games, Certificates, Request migrated | Those pages |
| #30 | Recruiter Mode V2 and Command Palette migrated | Those features |
| #31 | Ajoop migrated, deterministic behavior preserved exactly | Ajoop shell |
| #32 | Mini-games integrated (see §10) | Game page shells |
| #33 | `legacy-script.js` deleted, Boxicons and font delivery resolved, final QA baseline | Remainder |

Each phase is one pull request, reviewed and merged on its own.

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

#24 converts the registry to JSON:

- `data/portfolio.json` becomes the single source of truth.
- A small adapter assigns it to `window.KAAN_PORTFOLIO` so the legacy runtime keeps working unchanged.
- React imports the JSON directly.
- `src/react/data/foundation.js` is deleted.

Both architectures then read the same bytes, so drift becomes structurally impossible rather than guarded against. Until #24 lands, **no new portfolio fact may be added to the React tree** — it goes in `portfolio-data.js` first.

Translations move the same way, and later: `legacy-script.js` holds two large lookup objects plus the `data-pv2-en` / `data-pv2-tr` attribute pattern. The preview's `src/react/data/translations.js` is shaped as a flat `key -> { en, tr }` map specifically so it can be serialized to JSON unchanged.

## 9. Legacy removal policy

**Legacy code is deleted only after the React version has proven parity in production.**

The sequence for any page or feature is: build the React version → prove parity (§5) → publish it → let it run → then delete the legacy implementation in a **separate** pull request.

Nothing is deleted in the same change that replaces it. That keeps the revert small: if a migrated page misbehaves, restoring the previous behavior is a revert, not a reconstruction.

`legacy-script.js` shrinks only when a feature has actually moved. It is deleted in #33, when nothing references it.

## 10. Mini-game strategy

The adventure game, Joyday Paint and AI Flow Puzzle are ~120 KB of canvas and DOM code that predate the current architecture and are not React-shaped. They are also secondary to the AI and software positioning, so they must not drive architectural decisions.

They are migrated last (#32), and only as far as necessary:

- The **page shell** around each game — header, footer, description, metadata — becomes React, like any other page.
- The **game itself** stays a plain script, mounted into a container by a thin React wrapper that owns the canvas element's lifecycle.
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
