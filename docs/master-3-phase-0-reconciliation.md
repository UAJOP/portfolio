# Master 3 · Phase 0 — Production ↔ React reconciliation

Status: planning document. No production or React behaviour changes in this phase.
Base: `087b953` (merge of Master 2B, PR #79). Branch: `feat/m3-phase0-reconciliation`.

**Decision rule.** Master 2B production at `087b953` is the visual, content, i18n and behavioural authority. The React foundation from #23/#24 is infrastructure to reuse where it fits. Where the two disagree, production wins unless this document records an architectural reason. M3 moves the accepted product into React. It does not redesign it.

**Gap classes** used throughout:

| Code | Meaning |
|---|---|
| **BLOCKER** | No public route may move to React until this is resolved. |
| **REQ-RM** | Required before route migration: must land in #25 before its first public route cutover. |
| **PHASE** | Resolved inside the phase that migrates the owning surface. |
| **DEFER** | Deferred cleanup (#31–#33). Must not be done earlier. |

Every gap has an ID (`G-xx`). §M (risk register) and §N (plan) refer to these IDs.

---

## A. Current production architecture

### A.1 Delivery pipeline

```
data/portfolio/*.json ─┐                            ┌─► portfolio-data.js (window.KAAN_PORTFOLIO)
data/site/routes.json ─┤  scripts/generate-*.mjs    ├─► i18n-data.js, i18n/pack-<locale>-<scope>.js
data/i18n/**          ─┤  (explicit write commands) ├─► tr|de|es|fr/<route>/index.html   (generated locale trees)
English <route>/index.html (authored) ─┘            ├─► projects/<slug>/index.html + 4 locale copies
                                                    ├─► <legacy>.html stubs (85)
                                                    └─► sitemap.xml
      ↓  npm run qa  (never regenerates)
      ↓  npm run build:site  → dist-site/  (allowlist: data/site/public-artifact.json)
      ↓  npm run qa:site:artifact → upload-pages-artifact → deploy-pages
```

- No bundler for production. Every page is a real file. GitHub Pages has no rewrites and no SPA fallback.
- `dist-site/` forbids `.json`, `.mjs`, `.md`, `src/`, `data/`, `docs/`, `scripts/`, `server/`. **Any runtime `fetch` of canonical JSON is impossible on production by construction.**
- Ownership classes A–L are defined in `docs/architecture/file-ownership-and-deployment.md`.

### A.2 Canonical public routes

`data/site/routes.json` (schema 1) is the only route authority. `scripts/site-routes.mjs` validates it and shares it with the browser through `js/core/locale-routes.js`.

- **18 page routes**: `""`, `works/`, `sinama-case-study/`, `merge-rush-case-study/`, `now/`, `blog/` (public label "Experience"), `about/`, `games/`, `labs/`, `ai-flow-puzzle-case-study/`, `atolye-joyday-case-study/`, `hospital-system-case-study/`, `certificates/` (legacy `single-work.html`), `request/`, `adventure/`, `joyday-paint/`, `ai-flow-puzzle/`, `privacy/`.
- **25 project routes**: `projects/{slug}/` from `data/portfolio/project-details.json`. This includes the historical `pyhton-projects` slug, which must be kept as is.
- **Companions**: `404.html` and `project-detail.html` (the `?project=` compatibility shell).
- **Locales**: EN unprefixed. `/tr/`, `/de/`, `/es/`, `/fr/` are generated and indexable (`data/i18n/locales.json` `localizedRoutes.generate` / `indexable`).
- Totals verified by `qa:routes`: **43 routes × 5 locales = 215 clean URLs**, 85 legacy stubs and 215 sitemap URLs.

### A.3 Locale routing

- **The URL is authoritative** (`js/core/locale.js`). `/de/works/` *is* German. Stored preference (`kaanbalci-site-language`) and browser language only affect where the selector sends the user.
- `js/core/locale-bootstrap.js` is generated and parser-blocking. It sets locale state before first paint.
- The language selector is a `<select>` holding every active locale in its native label. `renderLanguageSelectors()` builds it at runtime and replaces the static `EN | TR` button group in the authored HTML.

### A.4 Message and i18n sources

| Source | Content | Consumed by |
|---|---|---|
| `data/i18n/locales.json` | 5 locales, `htmlLang`, `ogLocale`, prefix, gates | generators, `i18n-data.js` |
| `data/i18n/messages/<locale>/common.json` | 359 stable semantic keys (21 namespaces: `home.*`, `about.*`, `nav.*`, `theme.*`, `language.*`, …), complete in all 5 locales | generator (page copy via `data-message-key` **and** English reverse lookup); `RUNTIME_COMMON_KEYS` allowlist ships to the browser |
| `data/i18n/packs/<locale>/pages.json` | historical phrase-keyed page copy (`text`/`attribute`/`title`; 904 TR text keys), hash-pinned | generator only |
| `packs/<locale>/content.json` | overlays for canonical data by registry path (`profile.primaryTitle`, `projects.sinama.proof[0]`, `buildLog.[3].title`, …) | runtime `getLocalizedValue`, generator |
| `packs/<locale>/projects.json` | per-slug project detail copy | project renderer, generator |
| `packs/<locale>/case-studies.json` | DE/ES/FR case-study copy (EN/TR live in `*-case-study.data.js`) | `case-study.js`, generator |
| `packs/<locale>/dynamic.json` + `data/i18n/source/dynamic.json` | runtime feature copy: `ajoop`, `recruiter`, `recruiterV2`, `ultimate`, `request`, `adventure`, `aiFlowPuzzle`, `joydayPaint`. English stays inline in the JS; `extract-i18n-source` mirrors it | `getLocalizedCollection` at runtime |
| `packs/<locale>/meta.json` + `source/meta.json` | per-route title/description/OG | generator |
| `packs/<locale>/ui.json` | derived from `common.json` | generator |
| `data/i18n/glossary.json` | protected terms allowed to stay English | leakage QA |
| inline `data-pv2-en`/`data-pv2-tr` pairs (and `data-flagship-*`, `data-sinama-*`, `data-mr-*`) | EN/TR compat pairs on authored HTML | generator; `portfolio-v2.js` `applyUnifiedCopy()` |

Static page prose is localized **at generation time**. Only the shell subset is ever runtime data. One page ships one locale pack.

### A.5 Shared shell, runtime and features

- `script.js` (229 lines) is a **page-aware loader**, not the runtime. It holds the `COMMON` manifest of 30 classic scripts plus `PAGE_MODULES` keyed by `<body data-page>`. The order is a contract (`docs/frontend-runtime-architecture.md`). `legacy-script.js` is an inert compatibility stub.
- `portfolio-v2.js` runs after `script.js` and **monkey-patches globals**. It replaces `renderRecruiterDrawer` with `renderRecruiterV2`, mutates `portfolioChatbotContent` and `chatbotKeywordMap` (`syncAjoop`), extends `ultimateContent` commands, and renders at runtime the home build log (`[data-build-log]`), lab cards, the SINAMA evidence explorer and the request receipt. **What production actually does is the patched behaviour.**
- Header (authored per page): brand link; availability badge (`mailto:`); 7-item nav (`#site-navigation`); Recruiter toggle; Command toggle; language group → runtime `<select>`; one theme toggle button (moon/sun icon, `theme.switchToLight` / `theme.switchToDark` aria and title keys); hamburger `.nav-toggle` with `aria-controls` and `aria-expanded`.
- Footer: brand, tagline (`data-pv2` pair), 5 **icon-only** social links named by `aria-label` ("Open GitHub profile", …), `© <span data-year>` filled at runtime, Privacy link.
- Theme: blocking inline `<head>` script reads `kaanbalci-site-theme` and sets `html[data-theme]`. `js/core/theme.js` toggles it. Dark is the default.
- Overlays (all injected at runtime into `<body>`): Recruiter drawer (`recruiter.js` + `renderRecruiterV2`), Command Palette (`command-palette.js`, commands from `ultimate.js` + `creative.js` + `portfolio-v2.js`), public AJOOP shell (`assistant.js` `setupPortfolioChatbot()`: `<aside data-portfolio-chatbot>` with a `role=dialog aria-modal` panel and a launcher), easter-egg trigger and layer (`creative.js`), certificate image modal, case gallery modal.
- Overlay/focus contract (`js/core/shell.js`): `trapFocus`, `rememberOverlayTrigger` / `restoreOverlayFocus`, `setBackgroundInert`, `setOverlayBodyState`, `closeMobileNavigation({restoreFocus})`.

### A.6 Case studies, project detail and games

- Case studies: authored English HTML + `*-case-study.data.js` (EN/TR, `window.caseStudyPageData`) + shared `case-study.js` (IIFE: `data-case-i18n*`, gallery modal). DE/ES/FR come from packs and are **pre-applied** by the generator. Merge Rush has no `.data.js` and uses `data-mr-*` pairs.
- Project detail: `generate-project-pages.mjs` derives `projects/<slug>/index.html` from `project-detail.html`. It injects **metadata only** (title, canonical, hreflang, OG, JSON-LD); `renderProjectDetail()` renders the body at runtime from `window.KAAN_PORTFOLIO`. Without JS a project page shows only the title and summary.
- Games: `adventure/`, `joyday-paint/`, `ai-flow-puzzle/` (`data-page="game"`) load the common runtime, a page-scoped CSS file under `css/games/` and a vanilla game script (`adventure-game.js` 502 lines, `joyday-paint.js` 868, `ai-flow-puzzle.js` 1,123). Each game keeps inline EN/TR copy, and `getLocalizedCollection(copy, locale, "<game>")` overlays DE/ES/FR from `dynamic.json`.

### A.7 SEO, metadata and accessibility contracts

- Every English source carries a hand-authored `<head>`: description, keywords, author, title, theme-color, canonical, 5× `hreflang` + `x-default`, robots, `og:site_name/locale/title/description/type/url/image`, `twitter:card/image`, favicon, and a JSON-LD `Person` on Home. The generator rewrites canonical, hreflang, `og:locale`, localized meta and JSON-LD for each locale.
- Project JSON-LD is generated from project data (`generate-project-pages.mjs`).
- A11y: skip link `.skip-link` → `#main-content` (`<main id="main-content" tabindex="-1">`); overlay focus trap and inert background; `qa:a11y:static` (589 assertions, 45 pages); `.pa11yci` covers 14 production URLs, including `/de/about/` and a light-theme action.

### A.8 Design tokens and CSS ownership

Load order on every page: Google Fonts Inter → Boxicons (unpkg) → `style.css` → `css/a11y.css` → page CSS (`case-study.css`, `css/games/*`) → **`portfolio-v2.css` last**.

- `portfolio-v2.css` (Master 2B, 16 sections) owns the public visual language: 97 custom properties (`--color-*`, `--type-*`, `--space-1…9`, radii 6/10/14/20, `--section-gap`, `--header-height`, `--control-height`, …) plus legacy aliases (`--bg`, `--text`, `--brand`, …). §16 holds guarded compatibility overrides.
- `style.css` (4,432 lines) is the legacy structural baseline. Its 27 tokens are superseded but not removed. **It still owns layout:** `.section-block { padding: 110px 0 0 }` stacks with v2's `margin-top: var(--section-gap)`; `.section-shell` width; `.hero` min-height; `content-visibility: auto` on `.section-block`; and most overlay z-indexes.
- Stacking contract (literal values spread over four sheets, enforced by `qa-master2-design.mjs`):

| Layer | z | Owner |
|---|---|---|
| content | ≤ 3 | `style.css` |
| `.site-header` | 50 | `style.css`, `portfolio-v2.css` |
| `.easter-trigger` | 82 | `style.css` |
| `.portfolio-chatbot` (AJOOP floating) | 120 (`.easter-layer` 120, `.easter-message` 121) | `style.css` |
| `.site-header:has(.nav-links.is-open)` | 130 | `portfolio-v2.css` |
| `.recruiter-drawer`, `.command-palette`, `.case-modal`, `.image-modal`, `.joyday-finish-modal` | 160 | `style.css`, `case-study.css`, `portfolio-v2.css` |
| `.skip-link` | 200 | `css/a11y.css` |

---

## B. Current React architecture

| Area | Actual state (`src/react/`, 2,248 lines) |
|---|---|
| Entry / build | `index.html` template (`noindex, nofollow`, fixed preview title/description, same blocking theme script). `vite.config.mjs`: root `src/react`, base `/react-preview/`, out `dist-react/` (git-ignored, **not** in the Pages artifact), aliases `@data` and `@assets`. |
| Pre-render | `scripts/prerender-react.mjs`: client build → SSR build of `entry-server.jsx` → `renderToString` per target → injects markup, `<title>` and `description` only. The build fails under 1,000 B of markup. |
| Routes | `routing/routes.jsx`: `/` (MigrationHome, a design-system **specimen**), `/about` (MigrationAbout, "system principles"), plus the `404.html` catch-all. Own table; routes have no trailing slash; does not read `routes.json`. |
| Hydration | `main.jsx`: `hydrateRoot` when `data-prerendered="true"`, else `createRoot`. The whole document body is one React root. |
| Shell | `SiteShell` (skip link → `#main`, header, `<main id="main">`, footer, `banner` slot); `SiteHeader` (brand + primaryTitle, `NavLink` nav from props, EN/TR segmented buttons, Dark/Light segmented buttons, **no** mobile toggle, Recruiter, Search or availability badge); `SiteFooter` (tagline from `profile.footerTagline`, **text-label** socials, fixed `© 2026`, location). |
| State | `PreferencesContext`: theme and language in React state, reconciled from `localStorage` after hydration. **Language = stored preference, EN/TR only.** |
| i18n | `i18n/translate.js` imports only `messages/{en,tr}/react-preview.json` (56 preview-only keys). Canonical bilingual fields are read as `value[language] \|\| value.en`. |
| Data | `data/portfolio.js` imports meta, profile, socials, projects, recruiter-profiles, build-log, labs and sinama-evidence at build time. It does **not** import `project-details.json` or any locale pack. `SOCIAL_LABELS` is the only literal map. |
| Styles | `styles/{tokens,base,typography,layout,components,motion}.css`: 76 tokens in the pre-M2B "V3" vocabulary (`--canvas`, `--action-fill`, `--text-primary`, radii 8/12/18/28, different shadows, tracking and mono stack). Classes are `v3-*`. z-index: header 50, skip link **100**. |
| QA | `qa-react-foundation.js` (pre-render proof, isolation, canonical truth in output), `.pa11yci-react` (3 preview URLs), `qa-design-token-parity.mjs` (15 colour tokens × 2 themes pinned equal). |
| Output (verified this phase) | `index.html` 13,468 B of markup, `about/index.html` 6,848 B, `404.html` 4,542 B; 1 JS and 1 CSS bundle. |

**Summary.** The React tree proves pre-rendering, hydration and build-time JSON import. Its routes, locale model, i18n source, visual vocabulary, shell composition and head handling all predate Master 2B, and none of them can be carried forward as is.

---

## C. Route parity matrix

The classification is identical for all five locale variants of a route (EN `/x/`, `/tr/x/`, `/de/x/`, `/es/x/`, `/fr/x/`) because React has **no localized routes at all**.

| Route ID | Public route | Production | React | Classification |
|---|---|---|---|---|
| home | `/` | authored + 4 generated | `/react-preview/` specimen (different content, EN/TR, noindex) | **both, structurally divergent** |
| about | `/about/` | authored + 4 generated | `/react-preview/about` "principles" (different content, no trailing slash) | **both, structurally divergent** |
| works | `/works/` | ✓ | — | production only |
| sinamaCaseStudy | `/sinama-case-study/` | ✓ | — | production only |
| mergeRushCaseStudy | `/merge-rush-case-study/` | ✓ | — | production only |
| now | `/now/` | ✓ | — | production only |
| blog (Experience) | `/blog/` | ✓ | — | production only |
| games | `/games/` | ✓ | — | production only |
| labs | `/labs/` | ✓ | — | production only |
| aiFlowPuzzleCaseStudy | `/ai-flow-puzzle-case-study/` | ✓ | — | production only |
| joydayCaseStudy | `/atolye-joyday-case-study/` | ✓ | — | production only |
| hospitalCaseStudy | `/hospital-system-case-study/` | ✓ | — | production only |
| certificates | `/certificates/` | ✓ | — | production only |
| request | `/request/` | ✓ | — | production only |
| adventure | `/adventure/` | ✓ | — | production only |
| joydayPaint | `/joyday-paint/` | ✓ | — | production only |
| aiFlowPuzzle | `/ai-flow-puzzle/` | ✓ | — | production only |
| privacy | `/privacy/` | ✓ | — | production only |
| projects × 25 | `/projects/{slug}/` (agency-db, ai-chatbot-flow-design, atolye-joyday-official-website, calculator-android-studio, calculator-javascript, cars-dataset-analysis, control-panel, drivenfinity, dunker-madness, escape-island, extract-shoot-zero, hospital-appointment-system, hospital-form-app, ic-supply, legacy-of-the-lost, mandelas-web-site-project, my-java-projects, my-museum, portfolio-website, porto-25, **pyhton-projects**, tank-savage, unity-essentials, warehouse-war, weather-app) | ✓ generated, body runtime-rendered | — | production only |
| notFound | `/404.html` | ✓ (root; GitHub Pages serves only the root 404) | `/react-preview/404.html` (preview copy) | **both, structurally divergent** |
| projectShell | `/project-detail.html?project=` | ✓ compat shell | — | production only |
| legacy stubs × 85 | `*.html` → clean URL | ✓ generated | — | production only |
| — | `/react-preview/*` | — | ✓ | React only (engineering preview, unpublished) |

**Equivalent in both: 0.** No React route is currently a parity candidate.

Route gaps:

| ID | Gap | Class |
|---|---|---|
| G-01 | The React route table is hand-written in `routes.jsx`. It must be **derived from `data/site/routes.json`** through `scripts/site-routes.mjs`, so routes, outputs (`<route>/index.html`, `<locale>/<route>/index.html`) and legacy stubs share one authority. | **BLOCKER** |
| G-02 | React paths lack trailing slashes (`/about`). Production canonical routes are directory routes (`/about/`). The React Router config and `NavLink` targets must emit the canonical form, including locale prefixes. | **BLOCKER** |
| G-03 | No per-route ownership switch. `generate-localized-routes.mjs` treats the English `<route>/index.html` as authored source and regenerates the 4 locale trees from it. React output for a route would collide with both. A `renderer: "legacy" \| "react"` field (or equivalent) is needed in the route registry, honoured by the locale generator, project generator, artifact builder, sitemap and QA. | **BLOCKER** |
| G-04 | `dist-react/` is not part of `dist-site/`. `build-pages-artifact.mjs` must merge React-owned route documents and hashed bundles (at the site root base `/`, not `/react-preview/`) under the same containment guards. | **BLOCKER** |
| G-05 | 404: production keeps a single root `404.html`. React-owned 404 must stay one file that works from any locale depth. | PHASE (#33) |
| G-06 | Legacy `.html` stubs and `project-detail.html?project=` must keep resolving after cutover. The stub generator must not depend on the owner of the target route. | REQ-RM |

---

## D. Locale / i18n parity matrix

| Concern | Production (authority) | React today | Required React behaviour | Class |
|---|---|---|---|---|
| Active locales | EN, TR, DE, ES, FR | EN, TR | all entries of `locales.json` where `active` | **BLOCKER** (G-10) |
| Locale source of truth | URL prefix | `localStorage` preference | locale is a **build-time input per pre-rendered document**. No client-side locale switching of content; the selector navigates to the localized URL (`switchSiteLocale` semantics) | **BLOCKER** (G-11) |
| Shell/UI messages | `messages/<locale>/common.json` (359 keys) | `react-preview.json` (EN/TR, 56 keys) | import `common.json` for the page locale. `react-preview.json` stays preview-only and is deleted in #31 | **BLOCKER** (G-12) |
| Page copy with `data-message-key` | common.json | n/a | render by key | PHASE |
| Page copy matched by English reverse lookup | common.json value equals English text | n/a | React must reference the **key explicitly**. Reverse lookup is a generator adapter, not a React API | REQ-RM for Home/About (G-13) |
| `data-pv2-*` / `data-mr-*` / `data-flagship-*` pairs | inline EN/TR; DE/ES/FR through packs | n/a | convert each pair on a migrating page to a semantic key in all 5 `common.json` files, with **byte-identical** generated output, before the React version renders it | REQ-RM for Home/About (G-14); PHASE for others |
| Phrase-keyed `pages.json` copy | generator-only adapter (hash-pinned) | n/a | same as G-14: promote to semantic keys page by page; the adapter shrinks and is deleted in #31 | PHASE (G-15); adapter removal DEFER |
| Canonical data fields (`{en,tr}`) | `getLocalizedValue` + `content.json` / `projects.json` overlays for DE/ES/FR | `value[lang] \|\| value.en` → **German page would show English** | one shared, pure `localizeRecord(registryPath, value, locale)` module used by the React build and the Node generators | **BLOCKER** (G-16) |
| Runtime feature copy (`dynamic.json`) | EN inline in JS, DE/ES/FR overlays | n/a | extract English to canonical JSON when the feature migrates (#27, #28, #30); React reads JSON, never JS literals | PHASE (G-17) |
| Case-study copy | `.data.js` EN/TR + `case-studies.json` packs | n/a | move EN/TR into JSON beside the DE/ES/FR packs; React reads one keyed catalog | PHASE #29 (G-18) |
| Meta/OG per route | `source/meta.json` + `packs/*/meta.json` | hard-coded preview strings | read the same meta catalogs | **BLOCKER** (see H) |
| Formatting | `formatting.json` + `js/core/i18n-format.js` (`Intl`) | none | reuse `formatting.json` through the same `Intl` wrappers (as an ESM export) | PHASE |
| Fallback policy | production fallback forbidden (blocking QA); dev shows the key | falls back to EN, then the key | production build must **fail** on a missing key in any active locale | **BLOCKER** (G-19) |
| Leakage guards | `qa-i18n` (36,336 assertions), `qa-rendered-locale-copy` (7,366) incl. short-label guard | none | the same guards run over React-emitted documents (see K) | **BLOCKER** (G-40) |
| Glossary | `glossary.json` | none | same file, same semantics | PHASE |
| `<html lang>` / `data-route-locale` | set per generated document | `useEffect` sets `lang` after hydration | emitted statically by pre-render, never changed by an effect | **BLOCKER** (G-20) |

**React must not create a second translation system.** In practice: no new message files for production surfaces, no EN/TR-only helpers, no `lt(en, tr)` equivalents, and no runtime locale packs beyond what production already ships.

### D.1 Master 2B game-internal localization debt (recorded, not fixed)

Recorded by 2d799b1 and enforced by `KNOWN_ARIA_DEBT` in `scripts/qa-rendered-locale-copy.mjs`. Game routes are checked on the portfolio shell only.

| Game | Known English strings on localized routes |
|---|---|
| Adventure (`adventure/index.html`) | aria-labels "Game stats", "Kaan career merge mini game" |
| AI Flow Puzzle (`ai-flow-puzzle/index.html`) | aria-labels "Puzzle stats", "AI workflow board" |
| Joyday Paint (`joyday-paint/index.html`) | aria-labels "Stroke thickness", "Paint intensity", "Export style", "Joyday artwork preview" |
| All three | in-game labels are runtime-localized from inline EN/TR plus `dynamic.json` overlays. Canvas-drawn text (e.g. `adventure-game.js` `ctx.fillText`) is not covered by static QA |

Class: **PHASE #30** for the shell-level aria-labels, which move to message keys when the outer shell becomes React. Canvas and gameplay copy stays **DEFER** unless the owner prioritises it. `KNOWN_ARIA_DEBT` may only shrink.

---

## E. Data ownership matrix

| Fact domain | Canonical source | Production consumers | React today | Duplication / divergence | Class |
|---|---|---|---|---|---|
| Profile (name, titles, location, availability, direction, resume, email, footer tagline) | `data/portfolio/profile.json` (+ `content.json` overlays) | `portfolio-data.js`; **also hard-coded in HTML**: availability badge text + `mailto:`, footer tagline `data-pv2` pair, about badge, JSON-LD | imported ✓ | HTML copies are unguarded duplicates. React must render them from JSON | PHASE #25 (G-21) |
| Resume URL | `profile.resume` | `const resumeLink` in `js/core/shell.js` (same value, second literal) | not used | two literals. React uses `profile.resume`; the JS constant goes in #31 | DEFER (G-22) |
| Socials | `socials.json` (5) | footer icon links (literal `href`s in every authored page), JSON-LD `sameAs` (only GitHub and LinkedIn) | imported ✓ | footer `aria-label` strings ("Open GitHub profile") are UI copy with no message keys; React `SOCIAL_LABELS` are a different vocabulary | REQ-RM (G-23) |
| Flagship projects (5) | `projects.json` | registry; Home/Works cards partly authored in HTML | imported ✓ | Home "Selected work" and "Supporting evidence" cards duplicate category, role and summary in HTML/pairs | PHASE #25/#26 (G-24) |
| Project details (25) | `project-details.json` + `packs/*/projects.json` | generator (meta), `renderProjectDetail` (body) | **not imported** | none yet | PHASE #29 (G-25) |
| Recruiter profiles | `recruiter-profiles.json` | `recruiter.js`, `renderRecruiterV2` | imported ✓ | drawer chrome copy inline EN/TR in `portfolio-v2.js` `recruiterCopy` | PHASE #27 |
| Build log | `build-log.json` (+ index-keyed `content.json` overlays `buildLog.[n]`) | runtime-rendered on Home and Now | imported ✓ | overlays are **keyed by array index**, so inserting an entry shifts every translation. Needs a stable id key before React consumes it | REQ-RM for Home (G-26) |
| Labs | `labs.json` | `renderLabCards` | imported ✓ | "Open experiment" CTA via inline `lt()` | PHASE #30 |
| SINAMA evidence | `sinama-evidence.json` | evidence explorer | imported ✓ | explorer labels inline EN/TR | PHASE #29 |
| Experience / timeline | **none**. Authored HTML only (Home "Experience" ledger, About "Milestone journey", `/blog/`) | static HTML | n/a | #24 deliberately did not invent an `experience` dataset. The CLAUDE.md fact-check rule applies | owner decision (G-27): REQ-RM for Home/About, default = keep as semantic page copy, no new dataset |
| Person JSON-LD | hand-authored in `index.html` `<head>`, localized by the generator | crawlers | n/a | duplicates profile and socials. React should **derive** it from JSON, but the emitted JSON-LD must stay value-identical at cutover | REQ-RM (G-28) |
| AJOOP knowledge | `ajoop-master-knowledge.json` (server-only) + inline answers in `js/ajoop/assistant.js` + `syncAjoop` patch | AJOOP | none | out of scope (§J). React must not import either | — |
| Case-study facts | `*-case-study.data.js` + packs | case-study pages | none | EN/TR in JS, DE/ES/FR in JSON | PHASE #29 (G-18) |
| Command palette entries | inline in `ultimate.js`, `creative.js`, `portfolio-v2.js` | palette | none | three sources merged at runtime | PHASE #28 |
| React-only | `react-preview.json`, `MigrationHome`/`MigrationAbout` copy | — | preview | no product facts; preview-only | DEFER #31 (delete) |

Rules for M3: React imports canonical JSON at build time only; no runtime fetch (the artifact forbids `.json`). `portfolio-data.js` stays generated and committed as long as any legacy consumer exists. No React-only dossier or fact file.

---

## F. Design / token ownership matrix

| Token group | Production (`portfolio-v2.css`, M2B authority) | React (`tokens.css`) | Status |
|---|---|---|---|
| Colour: canvas, raised, surface, inset, text ×3, accent, accent-strong, action, action-hover, on-action, success, warning, danger | `--color-*` | `--canvas`, `--text-primary`, `--action-fill`, … | **equivalent values, divergent names** (pinned by `qa-design-token-parity`, 15 × 2 themes) |
| Colour: raised surface, soft/strong/border variants, `--color-border-control`, `--color-header`, `--color-scrim`, `--color-*-strong`, `--color-*-border` | present | missing, or approximated (`--accent-line`, `--border-default`) | **production only** |
| Colour: `--surface-elevated`, `--surface-interactive`, `--accent-text`, `--accent-alt(-soft)`, `--sheen`, `--text-on-accent` | absent | present | **React only, pre-M2B**; no M2B equivalent (M2B: accent = action/selection/focus only) |
| Spacing `--space-1…9` | 0.25rem…6rem | same | **equivalent** |
| Radius | 6 / 10 / 14 / 20 / 999 | 8 / 12 / 18 / 28 / 999 | **divergent, same names** (collision risk) |
| Shadows | M2B values (overlays only) | different values, used on cards | **divergent, same names** |
| Type scale | `--type-display/h1/h2/h3/feature/lead/body/small/caption/eyebrow` (ceilings guarded by `qa-master2-design`) | `--text-display/…/label` (larger display clamp) | **divergent** (React predates the M2B "no billboard headings" rule) |
| Leading / tracking | `--leading-tight/heading/body`, tracking −0.025em / 0.1em | `--leading-tight/snug/normal`, −0.022em / 0.08em | **divergent** |
| Fonts | Inter (Google Fonts) + system; mono without JetBrains | Inter not loaded; mono lists JetBrains Mono | **divergent** |
| Layout | `--content-width`, `--reading-width`, `--page-gutter`, `--section-gap`, `--header-height`, `--control-height` | `--width-content`, `--width-text`, `--gutter` | **duplicate vocabulary** |
| Motion | `--duration-fast` 140ms, `--ease-standard` | 150ms, `--easing-*` | **divergent** |
| Legacy aliases | `--bg`, `--surface`, `--text`, `--brand`, `--line`, … defined in v2 for `style.css` | `--surface` **same name, different meaning** | **collision**: both sheets on one page would override each other |
| Stacking | literal z-indexes over 4 sheets (§A.8) | header 50, skip link **100**, no overlay layers | **divergent** (G-35) |

CSS ownership gaps:

| ID | Gap | Class |
|---|---|---|
| G-30 | **Visual authority decision.** React pages in #25–#30 must render the **M2B DOM and class contract** (`.site-header`, `.section-shell`, `.section-block`, `.hero`, `.evidence-card`, …) and load the **same production stylesheets in the same order** (`style.css` → `css/a11y.css` → page CSS → `portfolio-v2.css`). `src/react/styles/*` and the `v3-*` classes are **not** used on production routes. Reason: M2B is the visual authority, and the only way to guarantee pixel parity before legacy removal is to reuse the exact cascade that production has already accepted. | **BLOCKER** (decision) |
| G-31 | `style.css` still owns layout that M2B depends on: `.section-block` 110px padding stacked on `--section-gap`, `.section-shell` width, `.hero` min-height, `content-visibility`, overlay z-indexes, game-adjacent structure. It cannot be removed until every route is React **and** these rules have been restated in `portfolio-v2.css` (or its successor) with visual diffs at zero. Do not delete it before then. | DEFER #31 |
| G-32 | `portfolio-v2.css` §16 "measured compatibility overrides" exist only to beat `style.css`. They leave together with G-31. | DEFER #31 |
| G-33 | One token vocabulary. After G-30, React needs no tokens of its own. `tokens.css` and the parity guard stay (the preview still builds) until #31 deletes the preview; the M2B `--color-*` vocabulary is the survivor. | DEFER #31/#33 |
| G-34 | Same-name / different-value tokens (`--radius-*`, `--shadow-*`, `--surface`) make it unsafe to load `src/react/styles` and production CSS on one document. Enforce by rule: production React routes must not import `src/react/styles/index.css`. | REQ-RM (guard) |
| G-35 | The stacking contract is literal numbers in 4 sheets. React overlays (#27, #28) must reuse the **same selectors**, or the guard in `qa-master2-design.mjs` must learn the React selectors before any React overlay ships. React's skip link at z 100 is wrong (must be 200). | REQ-RM (skip link, via G-30); PHASE #27/#28 (overlays) |
| G-36 | Boxicons (unpkg) and Google Fonts are production dependencies. React routes load them the same way until #32. | DEFER #32 |

---

## G. Interaction / shell parity matrix

| Surface | Production behaviour (must be preserved) | React today | Parity requirement | Class |
|---|---|---|---|---|
| Skip link | first focusable, `.skip-link` → `#main-content`, z 200, text "Skip to content" (localized) | `.v3-skip-link` → `#main`, z 100, key `shell.skipLink` "Skip to main content" | same target id, class, z and message key | REQ-RM (G-40a) |
| Header brand | `<a aria-label="Kaan Balcı home page">` with logo `alt="Kaan Balcı logo"` + name | decorative logo + name + primaryTitle | production markup and accessible names | REQ-RM |
| Availability badge | `mailto:` link, "Open for work", `aria-label="Available for roles"` | absent | from `profile.availability` / `profile.email` | REQ-RM |
| Primary nav | 7 links, locale-prefixed, `.selected` on the current page, `#site-navigation` | `NavLink` from props, `aria-current` | same links (from `routes.json` + `nav.*` keys), same current-page marker **and** `aria-current` | REQ-RM |
| Mobile nav | `.nav-toggle` with `aria-controls/expanded`, `.nav-links.is-open`, header rises to z 130, Escape/focus restore via `closeMobileNavigation` | none (horizontally scrolling nav) | identical behaviour | REQ-RM (G-41) |
| Language selector | native `<select>` of 5 native labels, visually hidden label, `aria-label` from `language.selectorAria`; changing it navigates to the localized URL, preserving allowed query/hash | EN/TR `aria-pressed` buttons that swap state in place | server-render the `<select>` (no runtime DOM replacement); navigation semantics as production | **BLOCKER** (G-11) |
| Theme | one toggle button; icon + label reflect the current theme; `aria-label`/`title` = `theme.switchToLight/Dark`; blocking head script; key `kaanbalci-site-theme` | segmented Dark/Light buttons | production control, same keys and storage; the first render must match the head-script theme without a hydration mismatch | REQ-RM (G-42) |
| Recruiter Mode | toggle in header and hero; drawer (z 160) = `renderRecruiterV2`; `?role=` deep links; focus trap, inert background, focus restore | absent | #25: keep legacy runtime driving it (see §N boundary). #27: React port with identical deep links | PHASE #27 |
| Command Palette | toggle + keyboard shortcut; merged command sets; z 160 | absent | #25: legacy. #28: React port | PHASE #28 |
| Public AJOOP shell | runtime-injected `<aside>`; launcher + dialog panel; z 120; covered by the open mobile menu (130) | absent | #25: legacy. #28: React shell only (§J) | PHASE #28 |
| Easter trigger/layer | z 82 / 120 / 121 | absent | stays legacy until #30/#31 | PHASE |
| Footer | icon-only socials with localized `aria-label`s; tagline; `© {runtime year}`; Privacy link | text socials, fixed `© 2026`, location line, no Privacy link | production markup. The year must not cause a hydration mismatch: render the build year statically and keep `data-year` for the legacy updater, or reconcile in an effect | REQ-RM (G-43) |
| `.reveal` entrance classes | CSS-driven `reveal`, `delay-n` | none | same classes. No JS may mutate classes inside a hydrated subtree | REQ-RM |
| Overlay/focus contract | `trapFocus`, inert background, `setOverlayBodyState`, restore focus to the trigger | none | one shared implementation. React overlays must not bring a second focus-trap library | PHASE #27/#28 |
| Stacking | content ≤3, header 50, easter 82, AJOOP 120, open nav 130, dialogs 160, skip 200 | header 50, skip 100 | exact contract (G-35) | REQ-RM / PHASE |

---

## H. Static-render / SEO contract and current React gaps

The M3 contract (unchanged from production):

1. Every public URL × locale is a real `…/index.html` on disk, readable without JavaScript.
2. `<html lang>` and `data-route-locale` are static and correct.
3. The head carries production-identical canonical, 5× hreflang + `x-default`, robots, description, keywords, author, theme-color, `og:*`, `twitter:*`, favicon and JSON-LD.
4. `sitemap.xml` stays generated from the route registry, not from React.
5. Hydration is deterministic: 0 mismatches, 0 React warnings.
6. GitHub Pages clean routes. No rewrite rules, no SPA fallback.

| ID | Current React gap | Class |
|---|---|---|
| G-50 | Pre-render replaces only `<title>` and `description`. The template hard-codes `robots: noindex, nofollow` and has no canonical, hreflang, OG, Twitter, keywords, author, favicon or JSON-LD. Needs a **head renderer** fed by `routes.json`, `locales.json`, `source/meta.json` + `packs/*/meta.json` and profile/socials, producing output identical to the current generator. The cleanest way: extract the head logic of `generate-localized-routes.mjs` / `generate-project-pages.mjs` into a shared ESM module that both call. | **BLOCKER** |
| G-51 | The `<html lang>` attribute is set by an effect, and `data-route-locale` is absent. | **BLOCKER** |
| G-52 | Bundles are emitted under `/react-preview/`. Production needs base `/` with hashed assets in a namespaced directory (e.g. `/assets-react/…` or `/r/…`) that cannot collide with `assets/` filenames, is allowlisted in `public-artifact.json`, and resolves from every locale depth. | **BLOCKER** |
| G-53 | `locale-bootstrap.js` (parser-blocking) and the blocking theme script must be present in React documents in the same position. | **BLOCKER** |
| G-54 | Home content that production renders only at runtime (build log `[data-build-log]`) and project detail bodies are empty without JS. React pre-render should emit them statically. The content stays the same and gets strictly better for no-JS readers, which is consistent with the static-HTML requirement. | PHASE #25 (build log) / #29 (projects) |
| G-55 | `qa-react-foundation.js` asserts preview-specific facts (3 routes, `/react-preview/`, isolation). It has to become a production React route gate (see K). The isolation assertions stay for the preview until #31. | REQ-RM |
| G-56 | Sitemap, robots and legacy stubs must not care who renders a route (G-03). | REQ-RM |
| G-57 | The `x-default` / hreflang set is per locale gate (`indexable`). React must read the gate, not assume 5. | REQ-RM |

---

## I. Game ownership boundary

| Layer | Owner after M3 (#30) | Notes |
|---|---|---|
| Document head, header, footer, skip link, masthead/intro copy, "Back to Games" link, metadata | **React** (pre-rendered per locale) | same M2B classes; page CSS `css/games/<game>.css` still loaded |
| Game container element and lifecycle (mount/unmount, one instance, no double init under StrictMode) | **React** thin wrapper | the wrapper owns the container. There is **no callable entry point today**: see the lifecycle seam below |
| Gameplay, canvas, DOM game UI, inline EN/TR copy, `getLocalizedCollection` overlays | **vanilla** (`adventure-game.js`, `joyday-paint.js`, `ai-flow-puzzle.js`) | not rewritten in M3 |
| Game CSS | `css/games/*.css` | unchanged; loaded only on its route (`qa-css-architecture` contract) |
| Shell aria debt (§D.1) | React shell (#30) | moves to message keys |

**Lifecycle seam (#30 implementation requirement, G-58).** `adventure-game.js`, `ai-flow-puzzle.js` and `joyday-paint.js` are self-executing IIFEs (`(function () { … })();`). Each one queries its DOM, binds listeners and starts immediately on load (`loop()`, `setScenario(0)`, `updatePreview()`). None of them exports or exposes an init or destroy function. #30 must choose one of two options:

1. **Client-only script load.** The wrapper injects the existing vanilla script on the client only, after the React-owned game container is in the DOM. A one-instance guard (a module-level flag or a marker on the container) prevents a second load under StrictMode double effects, re-renders or client navigation. Because the script cannot be torn down, the game route is left through a full document navigation, not a client-side route change. **Or:**
2. **Explicit init/destroy seam.** Extract a minimal `init(container)` / `destroy()` pair from each IIFE, with behaviour parity proven before the wrapper owns lifecycle. The body stays vanilla and is not rewritten; only the start-up and teardown become callable. `destroy()` must release listeners, animation frames and timers.

Either way, gameplay itself stays vanilla. The existing requirements also still hold:
- Game code never executes server-side: no import in the SSR bundle, and no `window` or `document` access during pre-render.
- The React wrapper must not re-render the container subtree after the game has mutated it.
- The static route must still show intro copy and controls help without JS.

---

## J. AJOOP boundary

React M3 may migrate **only the public AJOOP UI shell** (launcher, dialog chrome, message list container, quick-question chips, input form, status line, mascot markup and its stacking/focus behaviour), and only in #28.

Out of scope for every M3 phase: the prompts; routing (`router.js`, `ontology.js`, `matcher.js`, `language.js`); retrieval, evidence and knowledge (`knowledge.js`, `evidence.js`, `rag-client.js`, `ajoop-master-knowledge.json`); the Bridge (`server/`, `ai-bridge.js`, `ajoop-ai-config.js` endpoint); Qdrant; Ollama; connectors; private memory; owner authority; Gmail, Calendar, Drive and GitHub actions; and the public/private boundary.

**UI lifecycle seam (#28 implementation requirement, G-59).** A React-rendered shell **cannot** simply reuse `setupPortfolioChatbot()`. That function returns early when `portfolioChatbotState.initialized` is set or when `[data-portfolio-chatbot]` already exists in the document. It returns before it attaches any listener, so pre-rendered markup would stay inert. #28 therefore needs a small seam in the public UI layer of `assistant.js`:

- **Split shell creation from shell binding.** Separate the markup-injecting part of `setupPortfolioChatbot()` from a binder (for example `bindPortfolioChatbot(root)`). The binder attaches the existing listeners and turn lifecycle to the given `[data-portfolio-chatbot]` element, whether the element was injected by the legacy path or rendered by React. The binder is idempotent and binds one instance only.
- **Change nothing behind the UI.** AJOOP brain, routing, retrieval, evidence, response planning, the Bridge/RAG transport and the public/private boundary stay unchanged. The seam touches only DOM creation and binding.
- **No duplicate brain.** React renders chrome only. It does not reimplement or import routing, knowledge or answers, and turns keep flowing through the existing `assistant.js` lifecycle.
- **Legacy parity.** Until the React shell ships, the legacy path must behave exactly as today: create, then bind.

`syncAjoop()` in `portfolio-v2.js` (which patches public AJOOP content from the registry) keeps working until #31. The AJOOP QA suites in `qa:portfolio` (18 scripts) must pass unchanged. No React phase may edit their fixtures.

---

## K. QA migration requirements

Current production gates (all passing at base, see §O): `qa:data`, `qa:i18n` (4 steps), `qa:routes`, `qa:routes:http`, `qa:foundation`, `qa:projects`, `qa:seo`, `qa:runtime`, `qa:performance`, `qa:css`, `qa:design` (M2B design + token parity), `qa:a11y:static`, `qa:recruiter`, `qa:analytics`, `qa:automation`, `qa:js`, `qa:portfolio` (+18 AJOOP suites), `qa:assets`, `qa:links`, `qa:html`, `qa:spelling`. CI adds Pa11y (14 production URLs + 3 preview URLs), Lighthouse (11 pages, report-only), lychee broken links, and `build:site` + `qa:site:artifact` in the deploy job.

**Principle.** Gates run over **emitted documents**, not over the authoring source. Then a route passes or fails the same way regardless of who rendered it. No production threshold is lowered, and no page leaves a gate's coverage.

| Gate | Today reads | Must become | Class |
|---|---|---|---|
| route integrity (`qa:routes`, `qa:routes:http`) | committed tree + Pages-shaped server | the **merged `dist-site`** (legacy + React), same 215/85/215 counts | **BLOCKER** (G-60) |
| i18n coverage (`qa:i18n`) | catalogs + generated HTML | + React consumes only catalogued keys; a missing key fails the React build | **BLOCKER** |
| short-label locale leakage (`qa-rendered-locale-copy`) | generated locale documents | run over React-emitted locale documents. `KNOWN_ARIA_DEBT` may only shrink | **BLOCKER** |
| static HTML integrity (`qa:html`, `qa:seo`, `qa:a11y:static`) | 310 published documents | the same documents from `dist-site`, including React ones; a byte/DOM parity diff at each cutover | **BLOCKER** |
| accessibility (Pa11y) | 14 URLs | unchanged URL list (it covers migrated routes automatically) + localized React samples | REQ-RM |
| design invariants (`qa-master2-design`) | CSS files + authored HTML | also React-emitted HTML (class contract, lead-paragraph rule, type ceilings) | REQ-RM |
| overlay stacking | CSS declarations | unchanged selectors (G-35). React overlays add their selectors to the same guard | PHASE #27/#28 |
| artifact checks (`qa:foundation`, `qa:site:artifact`) | allowlist + containment | + React bundle directory allowlisted; still no `.json`, `src/`, `data/` | **BLOCKER** (G-04) |
| Lighthouse | 11 pages, `staticDistDir: "."` | point at `dist-site`, same pages; per-page score no worse than the legacy baseline (plan §5.7) | REQ-RM |
| broken links (lychee) | HTML/MD in repo | + `dist-site` | REQ-RM |
| runtime modules (`qa:runtime`) | `script.js` manifest | React routes still load `script.js` COMMON until #27/#28; the manifest check must accept React pages declaring a `data-page` | REQ-RM |
| hydration | none | new: headless load of each React route per locale, asserting 0 console errors/warnings and no DOM change between SSR and first client render | REQ-RM (G-61) |
| parity diff | none | new: normalized DOM text + head diff between the legacy document and the React document for every locale of a route at cutover. Must be empty, or each difference explained in the PR | REQ-RM (G-62) |
| React foundation (`qa:react`) | preview | split: preview isolation (until #31) + production React route proof | REQ-RM (G-55) |

---

## L. Legacy deletion prerequisites (for #31)

Nothing below may be deleted before **all** of its conditions hold. Each deletion is its own revertible commit.

| Artifact | Prerequisites |
|---|---|
| authored English `<route>/index.html` for route X | X renders from React in all active locales, parity diff G-62 is empty, and X has shipped to production and run there |
| `generate-localized-routes.mjs` page-copy transforms (`localized-html.mjs`, reverse lookup, `pages.json` adapter) | zero legacy-owned routes; `pages.json` has no key still read; legacy stubs + sitemap generation kept or moved |
| `data-pv2-*` / compat pairs + `applyUnifiedCopy()` | no emitted document contains any `data-*-en` attribute |
| `portfolio-v2.js` | Recruiter V2 (#27), commands (#28), build log/labs/evidence explorer/request receipt (#25–#30) and `syncAjoop` have React or retained-module owners |
| `script.js` COMMON modules | each module's features have a React owner; AJOOP brain modules (§J) are **kept** and loaded by the React AJOOP shell |
| `portfolio-data.js` / `window.KAAN_PORTFOLIO` | no retained vanilla module (AJOOP brain, games) reads it, or it is kept as their input |
| `i18n-data.js`, `i18n/pack-*.js`, `getLocalizedCollection` | games and AJOOP brain no longer need runtime packs, or they are kept for them explicitly |
| `style.css` | G-31 restated rules in place with zero visual diff on every route × both themes × mobile/desktop |
| `portfolio-v2.css` §16 compat overrides | `style.css` removed |
| `src/react/styles/*`, `v3-*`, `react-preview.json`, preview routes, `qa-design-token-parity.mjs` | production React uses M2B CSS (G-30); preview retired |
| `legacy-script.js` stub, `.html` legacy stubs | The `.html` stubs are **kept** (public entry points; removing them is a URL change, and that is not permitted). The `legacy-script.js` stub was removed in #31-A: it was never published, so it was not a public entry point |
| `resumeLink` constant | all resume links read `profile.resume` |

---

## M. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Hydration mismatch because the legacy runtime mutates the React tree (i18n runtime relabels, `applyUnifiedCopy`, `data-year`, selector replacement, `.selected`/`is-open` classes) | high | high | Hydrate **only React-owned islands** in #25 (§N boundary). Leave the header/footer static and legacy-driven until #27/#28. G-61 gate |
| R2 | A second, divergent site emerges (React styles/copy drifting from M2B) | high | high | G-30 decision; G-62 parity diff; no `src/react/styles` on production routes |
| R3 | Locale leakage on React pages (EN fallback for DE/ES/FR data fields) | high | high | G-16 shared localizer; G-19 fail-closed build; leakage guard over React output |
| R4 | SEO regression (lost hreflang/JSON-LD/canonical) at cutover | medium | high | G-50 shared head module; head diff in G-62; `qa:seo` on `dist-site` |
| R5 | Route/URL change (trailing slash, `pyhton-projects`, legacy stubs) | medium | high | G-01/02/06; `qa:routes:http` on the merged artifact |
| R6 | Artifact leaks (React build emits source maps or JSON into `dist-site`) | medium | medium | G-04 containment; `.json` stays forbidden; no source maps in production |
| R7 | Stacking regression when React overlays arrive | medium | medium | G-35 guard extended before #27/#28 |
| R8 | Copy change during key promotion (G-13/14) | medium | medium | promotion commits must produce byte-identical generated HTML (checked by `qa:i18n --check` + git diff of generated trees) |
| R9 | Index-keyed build-log overlays mistranslate after an insert | medium | medium | G-26 stable ids before React renders the build log |
| R10 | Game double-init, un-teardown-able IIFE, or SSR crash | medium | low | §I lifecycle seam G-58 (client-only load with a one-instance guard, or an extracted init/destroy seam); game code never in the SSR bundle |
| R11 | AJOOP behaviour change through shell migration; a React-rendered shell left inert because `setupPortfolioChatbot()` returns early | medium | high | §J UI lifecycle seam G-59 (separate creation from binding); brain untouched; AJOOP suites unchanged |
| R12 | Performance regression (React bundle added on top of the full legacy runtime during the hybrid period) | high | medium | measure per route against the legacy baseline; island hydration keeps the bundle small; `qa:performance` budget applies to React pages |
| R13 | Factual drift while moving HTML-authored facts (timeline, capability lists) | medium | high | G-27: move as copy, not as a new dataset, without editing wording; owner confirmation before any factual edit |
| R14 | Documentation drift: the working-copy `CLAUDE.md` still describes a 6.5k-line `script.js` and EN/TR-only i18n | high | low | refresh project docs in #33 (not in this phase) |

---

## N. Ordered implementation plan for #25–#33

The locked roadmap order and numbering (`REACT_MIGRATION_PLAN.md` §4) is unchanged. #25 is split into two reviewable stages inside the same phase number, because every BLOCKER in this document is shared infrastructure that must exist before any public route moves.

### Recommended #25 starting boundary

**#25-A — migration infrastructure, zero public change.**
Exit criterion: `dist-site/` is **byte-identical** to the current build, and all gates stay green.

1. G-03 route ownership field in `routes.json` (every route `legacy`), honoured by the generators, artifact builder, sitemap and QA.
2. G-01/G-02 React routes derived from `routes.json` via `site-routes.mjs` (the preview keeps working).
3. G-16/G-12/G-19 a shared, pure ESM i18n + localization module (common messages, content/projects/meta overlays, glossary, formatting) imported by the Vite build and the Node generators. It fails closed in production.
4. G-50/G-51/G-53/G-57 a shared head renderer extracted from the generators. The generators switch to it with byte-identical output.
5. G-04/G-52 React production build mode: base `/`, namespaced hashed bundle dir, allowlisted, merged into `dist-site` only for `react`-owned routes (none yet).
6. G-60/G-61/G-62/G-55 gates retargeted at `dist-site`, plus the new hydration and parity-diff gates, proven against a throwaway fixture route.

**#25-B — Home + About cutover.**

1. G-13/G-14/G-26/G-27 on Home and About: promote reverse-lookup, `data-pv2`, phrase-keyed and build-log copy to stable keys/ids with byte-identical legacy output (a separate commit before any React page code).
2. React Home and About render the **M2B DOM/class contract** with production CSS (G-30), for all 5 locales, from canonical JSON + `common.json`.
3. Header and footer are rendered statically by React using the production markup (G-40a, G-41, G-42, G-43). **Hydration scope for #25 is `<main>` only.** Header controls, mobile nav, the language selector, theme, Recruiter Mode, the Command Palette and AJOOP stay driven by the existing `script.js` COMMON runtime. Header/footer hydration moves to React in #27/#28 when their overlays do.
4. Flip `home` and `about` to `react` ownership only after G-62 is empty for all 10 documents.

### Remaining phases

| Phase | Scope | Entry gaps closed |
|---|---|---|
| #26 Works + Games | Works cards/filters/search, Games index; flagship data rendered from JSON | G-24, key promotion for `works`/`games` |
| #27 Recruiter + Build Log | React Recruiter drawer (V2 behaviour, `?role=` deep links), `/now/`, React-owned header controls start hydrating; overlay stacking guard extended | G-35 (drawer), R1 retirement for the header |
| #28 AJOOP shell + Command Palette | React palette (merged command sets from JSON), React public AJOOP shell over the unchanged brain (§J), via the create/bind seam | G-17 (palette, ajoop UI copy), G-35, G-59 |
| #29 Case studies + project routes | 5 case studies from JSON catalogs; 25 `/projects/{slug}/` bodies pre-rendered (no-JS content); `project-detail.html` compat shell kept | G-18, G-25, G-54 (projects) |
| #30 Labs + game shells | Labs; React shells + thin wrappers for the 3 games (client-only load or extracted init/destroy seam); shell aria debt to message keys | §D.1, §I, G-58 |
| #31 Legacy removal | §L in order: authored HTML → compat pairs/adapters → `portfolio-v2.js` → retired COMMON modules → `style.css` (after G-31 restatement) → preview styles/tokens | G-22, G-31, G-32, G-33 |
| #32 Dependency/bundle cleanup | Boxicons, Google Fonts, bundle budgets, measured | G-36 |
| #33 Hardening + V3 final | final SEO/a11y/Lighthouse/visual QA, 404 ownership, docs refresh (incl. `CLAUDE.md`) | G-05, R14 |

### Blockers before route migration (summary)

G-01, G-02, G-03, G-04, G-10, G-11, G-12, G-16, G-19, G-20, G-30, G-40, G-50, G-51, G-52, G-53, G-60. All of them are closed by #25-A, except G-30, which is a decision recorded here and applied in #25-B.

---

## O. Phase 0 validation record

Run on the unmodified base `087b953` before this document was added:

| Command | Result |
|---|---|
| `npm run qa` | pass: every sub-gate green (i18n 36,336 assertions; clean routes 24,640; route HTTP 1,706; M2B design 10,309; token parity 30; a11y static 589 over 45 pages; HTML 310 documents; CSpell 0 issues; 18 AJOOP suites) |
| `npm run build:react` | pass: 3 pre-rendered routes |
| `npm run qa:react` | pass: 3 routes · 1 JS · 1 CSS · isolation verified |
| `git diff --check` | clean |

This phase adds only this document. It adds no tooling and makes no behavioural change.
