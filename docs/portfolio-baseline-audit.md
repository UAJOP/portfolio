# kaanbalci.com Baseline Audit

**Branch:** `audit/portfolio-baseline-v1`
**Repository HEAD at audit:** `45d477a` — *fix: harden #24 canonical data and shell contracts*
**Date:** 2026-08-29
**Scope:** Baseline capture only. No production HTML, CSS, JS, routing, copy, form or chatbot code was modified.

Evidence in this document is labelled:

- **VERIFIED IN BROWSER** — observed at runtime against a local static server (`http-server` on `:4173`).
- **VERIFIED IN SOURCE** — derived mechanically from repository files or the audit script.
- **SOURCE-LEVEL RISK** — inferred from reading code; plausible but not executed.
- **UNVERIFIED** — could not be confirmed in this environment.

---

## 1. Executive Summary

kaanbalci.com is a static, GitHub Pages–hosted portfolio that has grown a genuine build-and-QA layer around an unchanged legacy runtime core. The current state is **structurally healthy and functionally sound**, with a small number of real defects concentrated in one place: the shared runtime.

What is working well:

- **No structural failures.** All 19 pages have exactly one `<h1>`, a `<title>`, a meta description, and (except `404.html`, correctly) a self-referential canonical. All 453 local references resolve to files on disk. No duplicate element IDs. Every `<img>` carries an `alt` attribute.
- **The canonical data migration has landed.** `data/portfolio/*.json` is now the source of truth, deterministically generated into `portfolio-data.js` and guarded in CI. This is a meaningful architectural improvement over hand-edited registries.
- **All three interactive experiences boot clean** with zero console errors.
- **No horizontal overflow** at 320 / 375 / 768 px.
- **Sitemap coverage is complete** — including `games.html`, which the handoff brief flagged as a suspected omission. That suspicion was incorrect (see §6).

The material problems:

- **P1 — Ajoop intent matching is broken for uppercase input.** Turkish-locale case folding turns ASCII `I` into dotless `ı`, so `SINAMA`, `AI`, `GITHUB`, `EMAIL` and `HIRING` all fall through to the generic fallback answer. Confirmed at runtime.
- **P1 — Ajoop matches keywords as unanchored substrings**, so `email` answers the *AI* intent and `hiring` answers the *greeting* intent. This is a separate defect from the casing bug and is not fixed by fixing the casing.
- **P1 — The request form reports success it cannot verify.** `fetch(..., { mode: "no-cors" })` returns an opaque response, so an Apps Script 500 is indistinguishable from success. A failed lead is silently lost. *(RESOLVED in BRIEF 00.2 — the endpoint turned out to be CORS-readable, so `no-cors` was never needed. See §11.)*
- **P2 — Project data is fragmented across three sources** totalling ~1,700 lines, with overlapping representations of the same projects. This is the direct subject of the next brief.
- **P2 — Skip links exist on only 5 of 19 pages** — all case studies, none of the game pages, and not the homepage.

The dominant architectural risk is concentration: `legacy-script.js` (6,638 lines) and `style.css` (6,608 lines) carry nearly every cross-page behaviour and style on the site, and **every page loads both in full**, including the game pages. Any change to either file is a whole-site change. That is the modularization target for a later phase, not this one.

---

## 2. Repository Map

### 2.1 Runtime — shipped to the browser

| File | Lines | Responsibility | Risk | Notes |
|---|---:|---|---|---|
| `legacy-script.js` | 6,638 | The shared runtime. Nav, theme, i18n, project rendering, filters, modals, Ajoop, Recruiter Mode, Command Palette, request form, per-game enhancements. | **Critical** | Single global scope. Every page loads it in full. Primary regression hotspot. |
| `style.css` | 6,608 | Nearly all site styling: tokens, layout, components, responsive, themes. | **Critical** | 54 `@media` blocks across ~18 ad-hoc breakpoints. Loaded by every page. |
| `script.js` | 66 | Bootstrap shim only. Injects `portfolio-data.js` → `legacy-script.js` → `portfolio-v2.js` and ensures `portfolio-v2.css`. | High | Uses `document.write` on the parser path. Boot-order contract for the whole site. |
| `portfolio-data.js` | 787 | **Generated.** Freezes `window.KAAN_PORTFOLIO`. | Medium | `DO NOT EDIT` header; regenerate via `npm run data:generate`. |
| `portfolio-v2.js` | 381 | V2 rendering layer reading `window.KAAN_PORTFOLIO`. | Medium | Depends on registry being present before it runs. |
| `portfolio-v2.css` | 0 | Empty file, still linked by every page and force-injected by `script.js`. | Low | Dead but load-bearing by convention — see §10. |
| `case-study.js` | 96 | Shared case-study i18n + gallery modal (IIFE, properly scoped). | Low | The cleanest module in the repo; a good model for future extraction. |
| `case-study.css` | 711 | Case-study-only styling. | Low | Correctly scoped to 5 pages. |
| `ai-flow-puzzle.js` | 1,117 | AI Flow Puzzle game logic (DOM-based). | Medium | Reads `kaanbalci-site-language` directly. |
| `joyday-paint.js` | 860 | Joyday Action Painting (canvas). | Medium | Self-contained canvas app. |
| `adventure-game.js` | 495 | Career Adventure (DOM + small canvas). | Low | Smallest game. |
| `request-config.js` | 6 | Public form endpoint config. | Low | **Not secret** — see §11. |

### 2.2 Data — source of truth

| File | Responsibility | Risk | Notes |
|---|---|---|---|
| `data/portfolio/projects.json` | 5 flagship projects: `sinama`, `mergeRush`, `joyday`, `chatbotFlow`, `hospital`. Per-language fields. | Medium | Canonical. |
| `data/portfolio/profile.json`, `socials.json`, `labs.json`, `recruiter-profiles.json`, `sinama-evidence.json`, `build-log.json` | Profile, social links, labs entries, recruiter snapshots, SINAMA evidence, Now-page log. | Low | Canonical. |
| `data/portfolio/meta.json` | Version `2.0.0`, `updatedAt` `2026-08-23`. | Low | Stamped into the generated registry. |
| `data/i18n/react-shell.json` | React shell translations. | Low | Not used by legacy pages. |
| `*-case-study.data.js` (4 files) | Per-case-study `window.caseStudyPageData`. | Medium | Separate from canonical JSON — a second content channel. |

### 2.3 Build & QA — not shipped

| File | Responsibility | Risk |
|---|---|---|
| `scripts/generate-portfolio-data.mjs` | Deterministic JSON → `portfolio-data.js`. | Low |
| `scripts/portfolio-data-model.mjs` | Compose/normalize/render for the generator. | Low |
| `scripts/prerender-react.mjs` | React SSG into `dist-react/`. | Low |
| `scripts/site-audit.mjs` | **Added by this audit.** Read-only structural auditor. | Low |
| `qa-portfolio-data.js` | Guards JSON ↔ generated registry parity. | Low |
| `qa-assets.js`, `qa-internal-links.js`, `qa-js-syntax.js`, `qa-portfolio-consistency.js`, `qa-react-foundation.js` | Asset, link, syntax, consistency and React checks. | Low |
| `.github/workflows/site-preflight.yml` | CI entry point. | Low |
| `.pa11yci`, `.pa11yci-react`, `lighthouserc.json`, `.htmlvalidate.json`, `cspell.json` | A11y, perf, HTML and spelling config. | Low |

### 2.4 Parallel React track — not yet live

`src/react/**` (26 files), `dist-react/`, `vite.config.mjs`. A separate, pre-release migration foundation. **It does not serve production traffic**; GitHub Pages serves the repository root. Treat it as a parallel track, not as the current site.

> **Note on `CLAUDE.md` drift.** `CLAUDE.md` states there is "no build step, no package manager" and describes `script.js` as the ~6.5k-line shared runtime. Both are now stale: `package.json` exists with a full QA/build toolchain, and the runtime has moved to `legacy-script.js` with `script.js` reduced to a 66-line bootstrap. Worth refreshing, but out of scope for this audit (it is a user-owned file).

---

## 3. Page / Route Inventory

19 HTML pages. Matrix reproduced from `node scripts/site-audit.mjs`; every row **VERIFIED IN SOURCE**.

| Page | Purpose | H1 | Desc | Canonical | OG | TW | JSON-LD | Skip |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `index.html` | Home / positioning | 1 | ✅ | `/` | 7 | 2 | 1 | ❌ |
| `about.html` | Background, FDE direction | 1 | ✅ | self | 3 | 0 | 0 | ❌ |
| `works.html` | Project catalog + filter/search | 1 | ✅ | self | 3 | 0 | 0 | ❌ |
| `project-detail.html` | Query-string project shell | 1 | ✅ | self (generic) | 0 | 0 | 0 | ❌ |
| `single-work.html` | Single project layout | 1 | ✅ | self | 8 | 5 | 0 | ❌ |
| `blog.html` | Experience timeline | 1 | ✅ | self | 3 | 0 | 0 | ❌ |
| `now.html` | Build log | 1 | ✅ | self | 0 | 0 | 0 | ❌ |
| `labs.html` | Technical experiments | 1 | ✅ | self | 0 | 0 | 0 | ❌ |
| `games.html` | Games catalog | 1 | ✅ | self | 3 | 0 | 0 | ❌ |
| `adventure.html` | Career Adventure game | 1 | ✅ | self | 8 | 5 | 0 | ❌ |
| `ai-flow-puzzle.html` | AI Flow Puzzle game | 1 | ✅ | self | 8 | 5 | 0 | ❌ |
| `joyday-paint.html` | Joyday Action Painting | 1 | ✅ | self | 8 | 5 | 0 | ❌ |
| `request.html` | Project request form | 1 | ✅ | self | 0 | 0 | 0 | ❌ |
| `sinama-case-study.html` | SINAMA case study | 1 | ✅ | self | 5 | 0 | 1 | ✅ |
| `merge-rush-case-study.html` | Merge Rush case study | 1 | ✅ | self | 5 | 0 | 1 | ✅ |
| `hospital-system-case-study.html` | Hospital system case study | 1 | ✅ | self | 10 | 5 | 1 | ✅ |
| `atolye-joyday-case-study.html` | Joyday case study | 1 | ✅ | self | 10 | 5 | 1 | ✅ |
| `ai-flow-puzzle-case-study.html` | AI Flow Puzzle case study | 1 | ✅ | self | 10 | 5 | 1 | ✅ |
| `404.html` | Error page | 1 | ✅ | *(none — correct)* | 0 | 0 | 0 | ❌ |

**Interactive components by page:** Ajoop chatbot, Recruiter Mode drawer, Command Palette (`Ctrl/Cmd+K`), theme toggle, EN/TR switch and mobile nav are present on all pages that load the shared runtime. `works.html` adds project filter + search; case studies add the gallery modal; `request.html` adds the form; game pages add their own engines.

**Script dependency chain** — identical on every page, **VERIFIED IN BROWSER**:

```
script.js → portfolio-data.js → legacy-script.js → portfolio-v2.js  [→ page-specific game js]
```

---

## 4. Current Architecture

### 4.1 Boot sequence

Each page's `<head>` runs a small blocking IIFE that reads `kaanbalci-site-theme` from `localStorage` and sets `data-theme` on `<html>` before first paint. This correctly prevents a flash of wrong theme.

`script.js` then bootstraps the runtime by one of two paths:

- **Parser path** (normal load): `document.write` of three `<script>` tags, preserving synchronous order.
- **Async path** (deferred/late injection): sequential `loadScript` with `async = false`.

Both paths converge on the same order. This is a real contract: `portfolio-v2.js` reads `window.KAAN_PORTFOLIO`, which `portfolio-data.js` must have defined first.

**SOURCE-LEVEL RISK:** `document.write` after the parser has closed is a no-op and would silently produce a dead page. The `document.readyState === "loading" && current` guard is what prevents this, and it is correct today — but it is a subtle, unguarded invariant with no test.

### 4.2 Data flow

```
data/portfolio/*.json          ← canonical, hand-edited
        │  npm run data:generate  (deterministic)
        ▼
portfolio-data.js              ← generated, committed, frozen as window.KAAN_PORTFOLIO
        │
        ├──→ portfolio-v2.js   (V2 card rendering)
        └──→ legacy-script.js  (partially)

legacy-script.js also carries TWO independent, hand-maintained project stores:
  • projectDetailData                 (lines 1535–2271, 11 slugs)
  • githubRepositoryProjectDetails    (lines 2272+,   14 slugs)
```

The generated artifact is committed deliberately — GitHub Pages serves repository files with no build step, so the registry must exist statically. CI verifies parity rather than regenerating, so a stale artifact fails the build. This is a sound design and should be preserved.

### 4.3 The three-source project problem

**VERIFIED IN SOURCE.** The same projects are represented in more than one place with different slugs:

| Concept | Canonical JSON | `projectDetailData` | `githubRepositoryProjectDetails` |
|---|---|---|---|
| Hospital system | `hospital` | `hospital-form-app` | `hospital-appointment-system` |
| Joyday | `joyday` | `atolye-joyday-official-website` | — |
| Chatbot flow | `chatbotFlow` | `ai-chatbot-flow-design` | — |
| SINAMA | `sinama` | — | — |
| Merge Rush | `mergeRush` | — | — |

Plus 8 archive projects only in `projectDetailData` and 13 only in `githubRepositoryProjectDetails`. Editing a project's description today may require touching up to three files with no mechanism linking them. **This is the core motivation for BRIEF 01.**

---

## 5. Functional Baseline

### 5.1 Language (EN/TR)

- Two lookup objects drive translation: `i18nTranslations` (keyed by `data-i18n`) plus `i18nAttributeTranslations` / `i18nTitleTranslations`.
- `applyLanguage(language)` sets `document.documentElement.lang` (`legacy-script.js:1475`), swaps `<title>` via `i18nTitleTranslations`, updates `[data-lang-switch]` buttons with `aria-pressed`, persists to `localStorage["kaanbalci-site-language"]` (`:1506`), then re-runs dependent renderers (`renderProjectDetail`, `renderAiWorkflowDemo`, `updatePortfolioChatbotLanguage`, `applySiteTheme`).
- Restored at `:4686` via `applyLanguage(localStorage.getItem("kaanbalci-site-language") || "en")`.

**SOURCE-LEVEL RISK — flash of wrong language.** The blocking `<head>` script restores *theme* only. Every page ships `<html lang="en">` with English content and does not switch to Turkish until `legacy-script.js` has parsed and run. A returning Turkish visitor sees English content on first paint on every page. Theme has this solved; language does not.

### 5.2 Theme

- Persisted under `kaanbalci-site-theme`; applied as `data-theme` on `<html>`.
- Restored pre-paint by an inline `<head>` IIFE on all 19 pages, wrapped in `try/catch` with a `dark` fallback — correct handling of blocked storage.
- Default is `dark`. **VERIFIED IN BROWSER** (`data-theme: "dark"` on a fresh load).

### 5.3 Recruiter Mode

- Activation toggles `document.body.classList` `recruiter-mode-active` (`legacy-script.js:5385–5473`).
- **VERIFIED IN SOURCE: it does not persist.** The only `localStorage` keys in the entire runtime are `kaanbalci-site-theme` and `kaanbalci-site-language`. Recruiter Mode resets on every navigation and reload.
- **Coupling risk:** state lives solely in a body class, so any styling depends on `body.recruiter-mode-active` descendant selectors in the shared `style.css`. There is no JS-readable state object, making the mode hard to query or test.

### 5.4 Ajoop assistant

Deterministic keyword matcher — no model, no network. Architecture:

- `chatbotKeywordMap` — array of `{ id, keywords[] }`. **8 intents declared statically** at `:3835`; **19 at runtime** (`VERIFIED IN BROWSER`) after several `upsertKeywords` / `unshift` blocks add `latestBuild`, `roles`, `mergeRush`, `sinama`, `games`, `adventure`, `request`, `education`, `experience`, `weather`, `greeting`.
- `detectChatbotIntent(message)` (`:4489`) folds the message and returns the **first** matching intent, else `"default"`.
- `portfolioChatbotContent.{en,tr}` supplies per-language answers and links.

Two confirmed defects — see §15 for full detail and reproduction.

### 5.5 Projects

- **Rendering:** `portfolio-v2.js` renders cards from `window.KAAN_PORTFOLIO`; `legacy-script.js` renders detail views.
- **Detail resolution:** `renderProjectDetail()` reads a slug from the query string and looks it up in `projectDetailData`, then `githubRepositoryProjectDetails`, injecting localized HTML through `createProjectDetailUrl` / `escapeProjectHtml`.
- **Filter/search:** `works.html` filters cards by normalized text content (`:5180–5185`) using `normalizeI18nText(...).toLowerCase()` — locale-independent, so unaffected by the Ajoop casing bug.
- **Translation:** canonical JSON holds `{en, tr}` objects per field; the two legacy stores hold their own per-language strings.

---

## 6. SEO Baseline

**Sitemap coverage is complete.** 17 URLs, all resolving to real files, with exactly two omissions — both correct:

- `404.html` — must not be indexed.
- `project-detail.html` — a query-string shell, explicitly `noindex, follow`.

> **Correction to the handoff brief:** it flagged `games.html` as suspected missing from `sitemap.xml`. It is present (priority 0.7). No sitemap gap exists.

**Canonicals are healthy.** All 18 indexable pages carry a correct self-referential canonical. `index.html` correctly canonicalizes to `https://kaanbalci.com/`.

**Robots:** `robots.txt` allows all and declares the sitemap. Correct.

### The real SEO limitation: `project-detail.html`

Every archive project — 25 slugs across the two legacy stores — is reachable only as `project-detail.html?project=<slug>`. That page is marked `noindex, follow` and has a single generic canonical. Consequences:

- **No archive project is indexable.** Not a canonical-dilution risk (the `noindex` prevents that), but a total discoverability loss for 25 projects.
- **No per-project social metadata.** Sharing any archive project link yields the generic shell's title and no OG image.
- Content is injected client-side after the runtime boots, so crawlers without JS execution see an empty shell regardless.

This is a deliberate current-state tradeoff, not a bug. Unique routes belong to a future brief.

### Social metadata is uneven

15 warnings from the audit script, all social-metadata coverage:

- **Full OG + Twitter (10 + 5):** the three older case studies.
- **OG + Twitter (8 + 5):** the three game pages and `single-work.html`.
- **OG only, no Twitter:** `index.html` (7+2), `sinama-case-study.html` (5+0), `merge-rush-case-study.html` (5+0), `about.html`, `blog.html`, `games.html`, `works.html` (3+0 each).
- **Neither:** `labs.html`, `now.html`, `request.html`, `project-detail.html`.

Notably the two **newest and highest-priority** case studies (SINAMA and Merge Rush, both sitemap priority 0.9) have *less* social metadata than the older ones and no Twitter card at all. `og:image` is present on both, so link previews degrade rather than break.

**Structured data:** 6 pages carry JSON-LD (`index` + all 5 case studies). Types observed: `SoftwareApplication` (SINAMA), `VideoGame` (Merge Rush). No `Person` or `BreadcrumbList` sitewide.

---

## 7. Accessibility Baseline

### Confirmed strengths (VERIFIED IN SOURCE)

- Exactly one `<h1>` per page, on all 19 pages.
- **Every `<img>` has an `alt` attribute** — zero exceptions across the site.
- **No duplicate element IDs** on any page.
- Mobile nav toggle is a real `<button>` with `aria-expanded` that updates on activation (**VERIFIED IN BROWSER** at 375 px).
- Ajoop panel uses `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
- Request form uses native `required`, real `<label>` wrapping, and an `aria-live="polite"` status region.
- `@media (prefers-reduced-motion: reduce)` is honoured — 3 blocks in `style.css`.
- Theme restoration is `try/catch`-guarded, so storage-blocked browsers still render.

### Gaps

**P2 — Skip link coverage is 5 of 19 pages.** Present only on the five case studies. Absent from the homepage, `works`, `about`, `blog`, `now`, `labs`, `games`, `request`, `single-work`, `project-detail`, `404`, and **all three game pages**.

> **Refinement of the handoff brief:** it described this as "approximately five case/game pages." The exact set is five *case-study* pages; **no game page has a skip link**. Game pages arguably need one most — they sit behind the full shared nav before reaching an interactive canvas.

**P2 — Canvas alternatives.** `joyday-paint.html` uses a 900×900 `<canvas>` and `adventure.html` a smaller one. **UNVERIFIED** whether meaningful text alternatives or keyboard-equivalent controls exist for canvas-only interactions; the drawing surface has `touch-action: none`, which is correct for pointer drawing but removes native scroll/zoom over that region.

**P3 — Focus visibility and touch targets.** Not exhaustively measured. `.pa11yci` exists and `npm run qa:a11y` is available; running it is the right next step rather than re-deriving by hand here.

---

## 8. Responsive Baseline

### VERIFIED IN BROWSER (homepage, local server)

| Width | `scrollWidth` vs `clientWidth` | Horizontal overflow |
|---|---|---|
| 320 px | 320 / 320 | **None** |
| 375 px | 375 / 375 | **None** |
| 768 px | 753 / 753 | **None** |

Mobile nav toggle responds and updates `aria-expanded` at 375 px. One decorative element (`div.profile-glow`) extends past the viewport edge at 320 px but does **not** create document overflow — it is clipped, so this is cosmetic, not a layout break.

### SOURCE-LEVEL RISK

- **No breakpoint scale.** `style.css` contains 54 `@media` blocks across ~18 distinct widths (`560, 620, 640, 720, 820, 900, 980, 1100, 1120, 1180, 1240, 1280, 1360, 1540`), some duplicated with and without the `screen and` prefix (`@media screen and (max-width: 1180px)` and `@media (max-width: 1180px)` both appear). Adding a responsive rule means guessing which of ~18 breakpoints to reuse.
- **Desktop-first, entirely `max-width`.** No `min-width` queries. The narrowest breakpoint is 560 px, so 320–560 px is served by one rule set — it works today, but there is no dedicated small-phone tier.
- **Game canvases.** `joyday-paint` runs a fixed 900×900 backing store scaled by CSS. **UNVERIFIED** how pointer coordinates map at very small widths; a scaling mismatch would misplace strokes. Worth an explicit manual check before any CSS change near the canvas.

---

## 9. JavaScript Risk Map

### Where responsibilities live today

| Responsibility | Current location |
|---|---|
| Boot / script ordering | `script.js` (66 lines) |
| i18n (EN/TR) | `legacy-script.js` — `i18nTranslations`, `applyLanguage` |
| Theme | Inline `<head>` IIFE (all 19 pages) + `legacy-script.js:154–211` |
| Project data (canonical) | `data/portfolio/*.json` → `portfolio-data.js` |
| Project data (legacy) | `legacy-script.js:1535–2271`, `:2272+` |
| Card rendering | `portfolio-v2.js` |
| Detail rendering | `legacy-script.js` — `renderProjectDetail` |
| Filters / search | `legacy-script.js:5180–5185` |
| Recruiter Mode | `legacy-script.js:5385–5473` |
| Chatbot | `legacy-script.js:3644–4700` |
| Navigation / mobile nav | `legacy-script.js` |
| Modals / galleries | `legacy-script.js` + `case-study.js` |
| Command Palette | `legacy-script.js:5489–5588` |
| Forms | `legacy-script.js:6283–6465` |
| Storage | `legacy-script.js` (2 keys) + `ai-flow-puzzle.js:404` |
| Game integrations | `legacy-script.js:6536+`, `:6614+` + three game files |

### Structural risks

1. **One file, one scope.** 6,638 lines in a single global scope. Every top-level `const`/`function` is a global. Name collisions are prevented only by convention.
2. **Every page loads everything.** **VERIFIED IN BROWSER:** `adventure.html`, `ai-flow-puzzle.html` and `joyday-paint.html` each load `portfolio-data.js` + `legacy-script.js` + `portfolio-v2.js` before their own engine. A game page pays for the chatbot, Command Palette, Recruiter Mode and the full project registry.
3. **Initialization-order coupling.** Setup functions are invoked at file bottom in a fixed order. `chatbotKeywordMap` is mutated by at least four separate later blocks via `unshift`/`upsertKeywords`, and because `detectChatbotIntent` returns the *first* match, **intent priority is a function of script execution order** — fragile and untested.
4. **Implicit DOM assumptions.** Behaviour is guarded by `document.querySelector` null-checks so the shared file runs harmlessly everywhere. This works, but means a renamed selector fails silently rather than loudly.
5. **Page-specific logic in global code.** Game enhancements (`:6536+`, `:6614+`) and request-form logic live in the shared runtime rather than beside their pages.
6. **Cross-file coupling via the DOM.** `ai-flow-puzzle.js:404` reads `document.documentElement.lang` *or* `localStorage["kaanbalci-site-language"]` directly instead of a shared accessor, duplicating the language contract.

### FUTURE responsibility map (design target — do not implement here)

```
core/boot.js          script ordering, feature detection
core/storage.js       one typed wrapper over the 2 storage keys
core/i18n.js          applyLanguage + dictionaries (+ pre-paint language restore)
core/theme.js         theme state, shared with the inline head script
data/registry.js      the single project source of truth
features/projects/    cards, filters, detail rendering
features/chatbot/     keyword map + a locale-independent fold + matcher
features/recruiter/   state object, not just a body class
features/palette/     command palette
features/request/     form + verifiable submission
pages/games/          per-game bootstrap, loaded only by game pages
```

---

## 10. CSS Risk Map

| Layer | Location | Notes |
|---|---|---|
| Global tokens, base, components, layout, responsive, themes | `style.css` (6,608 lines) | Everything, for every page. |
| Case-study styling | `case-study.css` (711 lines, 3 media queries) | Correctly scoped to 5 pages. |
| V2 layer | `portfolio-v2.css` (**0 lines**) | Empty. |
| React styles | `src/react/styles/*.css` (6 files) | Not shipped to production. |

Risks:

- **`portfolio-v2.css` is an empty file that every page links and `script.js` force-injects** if absent (`ensureV2Styles`). Every page pays a request for zero bytes of CSS. Harmless today; it is either a placeholder or dead weight, and it should be a deliberate decision which.
- **Specificity and override chains.** With ~6.6k lines in one cascade and page-specific behaviour keyed off body classes (`recruiter-mode-active`) and `data-theme`, overrides accumulate. Not measured in detail here.
- **Duplicated media-query syntax** (`@media screen and (max-width: X)` vs `@media (max-width: X)` for 640, 820 and 1180 px) means a breakpoint change requires finding both forms.
- **Likely dead/legacy blocks.** Suspected but **UNVERIFIED** — proving CSS dead requires coverage tooling across all 19 pages in both themes and both languages. Do not delete on suspicion.

---

## 11. Request / Form Flow

**Files:** `request.html`, `request-config.js`, `legacy-script.js:6283–6465`, `google-apps-script-request-form.gs`.

### What is implemented well

- Required fields use native `required` (`name`, `email`, `serviceType`, `details`, `consent`); `email` uses `type="email"`.
- **Honeypot present:** a visually hidden `company_website` field with `tabindex="-1"`, `autocomplete="off"`, `aria-hidden="true"`.
- Time-based check: `form.__requestFormStartedAt` is stamped, giving a submission-speed signal.
- Explicit consent checkbox.
- Submit is disabled and relabelled during flight; `aria-busy` set; status announced via `aria-live="polite"`.
- Two visible fallback channels: a `mailto:` link and the Google Form.
- Graceful degradation: if the endpoint is missing or still contains `PASTE`, the handler falls back to a prefilled `mailto:` and shows a warning state.

### P1 — Success is reported without verification

```js
await fetch(endpoint, { method: "POST", mode: "no-cors", ... });
form.reset();
setRequestStatus("success", text.success, { showEmail: true });
```

`mode: "no-cors"` yields an **opaque** response: status code, headers and body are all unreadable. The promise resolves for an Apps Script `500`, a revoked deployment, or a quota rejection exactly as it does for success. Only transport-level failures (offline, DNS) reach the `catch`.

Consequence: a broken backend silently shows "success", the form resets, and the lead is lost with no signal to either party. For a portfolio whose purpose is inbound contact, this is a real reliability problem — mitigated, but not solved, by the visible mailto/Google Form fallbacks.

> **RESOLVED in BRIEF 00.2** (branch `fix/request-submission-reliability-v1`).
>
> The audit assumed `no-cors` was necessary. It was not. Verified 2026-08-29 against the deployed Apps Script web app:
>
> - `GET /exec` → `302` to `script.googleusercontent.com` → `200`, `Content-Type: application/json`. **Both hops send `Access-Control-Allow-Origin: *`.**
> - A cross-origin `fetch` from a browser at `http://localhost:4173` returned `type: "cors"` (not `opaque`), `status: 200`, with a fully readable body.
> - A cross-origin **POST** with a form-urlencoded body (a CORS-safelisted content type, so no preflight) returned `type: "cors"`, `status: 200`, body `{"ok":true}` in ~2.9 s.
>
> The checked-in `google-apps-script-request-form.gs` already returned `{ ok: true }` / `{ ok: false, error }` via `ContentService`, and the deployed script matches it — so an application-level success contract existed all along and was simply being discarded by `no-cors`.
>
> **Option A** (direct readable response) was therefore implemented: `no-cors` removed, HTTP status and JSON body both checked. Success now requires a non-opaque response, a 2xx status, a parseable JSON body, and an explicit `{ ok: true }`. Everything else is an error that preserves the user's input for retry. Covered by `npm run qa:request` (84 assertions) and verified in the browser.
>
> Options B and C were not needed. Option B was unavailable regardless: the site is served from GitHub Pages with no serverless capability (no `vercel.json`, no `api/`), and the brief correctly forbids adding hosting architecture to solve this.

### Secret exposure — assessed, and it is not a secret

`window.KAAN_REQUEST_FORM_ENDPOINT` is a Google Apps Script Web App URL. It **must** be public to be callable from the browser; its unguessability is not a security control and it is not a credential. **This is correctly a public configuration value, not a leaked secret.**

The accurate framing is different: it is an **unauthenticated public write endpoint**. Anyone can POST to it directly, bypassing the honeypot and timing checks entirely, since those are client-side only. **UNVERIFIED** whether `google-apps-script-request-form.gs` applies server-side rate limiting or validation — that file is checked in but deployed manually, so the deployed version cannot be confirmed from this repository.

`KAAN_REQUEST_FORM_EMAIL` is the owner's public contact address, already published as a `mailto:` link across the site. Not a disclosure.

---

## 12. External Dependency Map

| Dependency | Class | Failure behaviour |
|---|---|---|
| **GitHub Pages** (hosting) | **Critical** | Site is unreachable. |
| `script.google.com` (Apps Script) | **Critical** *for the form* | Form silently reports success and loses the lead (§11). Mailto/Google Form fallbacks remain usable. |
| `unpkg.com` — boxicons 2.1.4 CSS | **Enhancement** *(but render-blocking)* | Every icon across the site disappears. Linked in `<head>` as a blocking stylesheet on all 19 pages, so an unpkg outage or slowdown also delays first paint. The highest-impact third-party risk on the site. |
| `fonts.googleapis.com` / `fonts.gstatic.com` — Inter | **Enhancement** | Falls back to system fonts; layout shifts but remains readable. `preconnect` is correctly configured. |
| `docs.google.com` (Google Form fallback) | **Optional** | The fallback link 404s; primary form and mailto unaffected. |
| `drive.google.com` (resume) | **Optional** | Resume link fails. Centralized in the `resumeLink` constant. |
| `sinama.kaanbalci.com` | **Optional** | SINAMA live-product CTA fails; case study still renders. |
| `atolyejoyday.com` | **Optional** | Joyday live link fails. |
| `github.com`, `linkedin.com`, `x.com`, `youtube.com`, `instagram.com`, `ude.my` | **Optional** | Individual outbound links fail. |

**All external link targets are UNVERIFIED** — no outbound requests were made during this audit. `.lycheeignore` exists, suggesting external link checking is configured elsewhere.

The notable finding: **boxicons is the only render-blocking third-party dependency**, and it is classed as an enhancement while behaving like a critical one. Self-hosting the icon subset would remove the single largest third-party availability risk.

---

## 13. Known Regression Risks

Ranked by likelihood × blast radius.

1. **Any edit to `legacy-script.js` or `style.css` is a whole-site edit.** Both load on all 19 pages. No module boundaries, no per-page scoping.
2. **Chatbot intent priority depends on script execution order.** Four separate blocks `unshift` into `chatbotKeywordMap`; `.find()` returns the first match. Reordering initialization silently changes answers.
3. **Boot-order contract is unguarded.** `portfolio-v2.js` requires `window.KAAN_PORTFOLIO`; `script.js`'s `document.write` path requires the parser to still be open. Neither is asserted.
4. **Project edits can silently desynchronize** across the canonical JSON and the two legacy stores.
5. **Generated-artifact drift.** Editing `portfolio-data.js` by hand is overwritten and fails `qa:data` — protected, but only if CI runs.
6. **Empty `portfolio-v2.css` is force-injected**, so removing the file would trigger a runtime injection of a 404.
7. **Canvas coordinate mapping** in `joyday-paint.js` under CSS scaling (**UNVERIFIED**) — any responsive CSS change near the canvas warrants a manual draw test.
8. **Ad-hoc breakpoints** make responsive changes likely to miss one of ~18 widths.

---

## 14. Findings by Priority

### P0
**None.** No currently-broken critical functionality and no blocker to safe development or deployment. All pages load, all games boot, no console errors, no broken local links, and the QA suite passes.

### P1

| # | Finding | Evidence | Status |
|---|---|---|---|
| **P1-1** | **Ajoop intent matching fails on uppercase ASCII input.** `detectChatbotIntent` folds with `toLocaleLowerCase("tr-TR")`, turning ASCII `I` into dotless `ı`. `SINAMA`, `AI`, `GITHUB`, `EMAIL`, `HIRING` all return `"default"`. 26 of 67 statically-declared keywords are affected. | VERIFIED IN BROWSER — §15 | **RESOLVED in BRIEF 00.1** |
| **P1-2** | **Ajoop matches keywords as unanchored substrings**, producing confidently wrong answers: `email` → *ai* intent (matched `"ai"` inside "em**ai**l"); `hiring` → *greeting* intent (matched `"hi"` inside "**hi**ring"). Independent of P1-1. | VERIFIED IN BROWSER — §15 | **RESOLVED in BRIEF 00.1** |
| **P1-3** | **Request form reports unverifiable success.** `mode: "no-cors"` makes a backend failure indistinguishable from success; the lead is lost silently. | VERIFIED IN SOURCE — §11 | **RESOLVED in BRIEF 00.2** |

### P2

| # | Finding | Evidence |
|---|---|---|
| **P2-1** | **Project data fragmented across three sources** (~1,700 lines) with overlapping slugs for the same projects. Direct subject of BRIEF 01. | VERIFIED IN SOURCE — §4.3 |
| **P2-2** | **Skip link on only 5 of 19 pages** — all case studies, none of the games, not the homepage. | VERIFIED IN SOURCE — §7 |
| **P2-3** | **Flash of wrong language.** Pre-paint restore covers theme but not language; Turkish visitors see English on first paint on every page. | SOURCE-LEVEL RISK — §5.1 |
| **P2-4** | **Every page loads the entire shared runtime**, including game pages that need almost none of it. | VERIFIED IN BROWSER — §9 |
| **P2-5** | **25 archive projects are unindexable** behind `project-detail.html?project=` with generic canonical and `noindex`. | VERIFIED IN SOURCE — §6 |
| **P2-6** | **boxicons via unpkg is render-blocking** on all 19 pages — an enhancement dependency with critical-path impact. | VERIFIED IN SOURCE — §12 |
| **P2-7** | **Recruiter Mode does not persist** and exists only as a body class with no readable state. | VERIFIED IN SOURCE — §5.3 |
| **P2-8** | **Social metadata uneven**; the two newest flagship case studies have no Twitter card. | VERIFIED IN SOURCE — §6 |

### P3

| # | Finding |
|---|---|
| **P3-1** | ~18 ad-hoc breakpoints with duplicated `@media` syntax; no breakpoint scale. |
| **P3-2** | `portfolio-v2.css` is an empty file linked by every page and force-injected by `script.js`. |
| **P3-3** | `CLAUDE.md` is stale — describes "no build step, no package manager" and mis-attributes the runtime to `script.js`. |
| **P3-4** | `.profile-glow` overflows the viewport edge at 320 px (clipped, cosmetic only). |
| **P3-5** | Canvas text/keyboard alternatives for the two canvas games — UNVERIFIED. |
| **P3-6** | No `Person` or `BreadcrumbList` structured data sitewide. |
| **P3-7** | `ai-flow-puzzle.js` reads the language contract directly rather than through a shared accessor. |

---

## 15. Current Known Baseline Failures

These were the failures captured at baseline (`45d477a`). The original discovery is preserved below for history; remediation status is noted per item.

> **Remediation update — BRIEF 00.1 (Ajoop Intent Matching Reliability Hotfix), branch `fix/ajoop-intent-reliability-v1`.**
> Baseline failures **#1 and #2 are RESOLVED**. `detectChatbotIntent` now runs on a locale-independent normalization + token matching layer (`legacy-script.js`, marked `ajoop-intent-matching`), covered by `scripts/qa-ajoop-intents.mjs` (`npm run qa:ajoop`, 294 assertions) and re-verified in the browser.
> Baseline failure **#3 (request form) remains OPEN** — it is the subject of the next brief.
> The discovery sections below are left unchanged as the historical record.

### KNOWN BASELINE FAILURE #1 — Ajoop Turkish-locale normalization (P1) — RESOLVED in BRIEF 00.1

**Location:** `legacy-script.js:4490`

```js
function detectChatbotIntent(message) {
  const normalized = String(message || "").toLocaleLowerCase("tr-TR");
  const match = chatbotKeywordMap.find((item) =>
    item.keywords.some((keyword) => normalized.includes(keyword)),
  );
  return match?.id || "default";
}
```

**Cause.** Turkish casing rules map uppercase ASCII `I` (U+0049) to dotless `ı` (U+0131), not to `i`. Applying `tr-TR` folding to *all* input corrupts every ASCII identifier containing an uppercase `I`, so it can no longer match its lowercase-ASCII keyword.

**Reproduction** — VERIFIED IN BROWSER, evaluated against the live runtime on `index.html`:

| Input | Folds to | Intent returned | Expected |
|---|---|---|---|
| `sinama` | `sinama` | `sinama` ✅ | `sinama` |
| `SINAMA` | `sınama` | **`default`** ❌ | `sinama` |
| `ai` | `ai` | `ai` ✅ | `ai` |
| `AI` | `aı` | **`default`** ❌ | `ai` |
| `github` | `github` | `projects` ✅ | `projects` |
| `GITHUB` | `gıthub` | **`default`** ❌ | `projects` |
| `HIRING` | `hırıng` | **`default`** ❌ | `availability` |

**Affected functionality.** Ajoop keyword matching only. The Command Palette uses locale-independent `.toLowerCase()` (`:5489–5492`) and is **unaffected** — `SINAMA` typed there matches correctly. Project search (`:5180–5185`) is likewise unaffected. Scope: **26 of 67** statically-declared keywords break on uppercase input, including `ai`, `github`, `email`, `linkedin`, `hiring`, `automation`, `portfolio`, `certificate`.

**Suggested future fix direction.** Introduce a locale-independent fold used only for machine matching, kept separate from any locale-aware casing used for *display*.

The naive fix is wrong and must be avoided: plain `.toLowerCase()` maps Turkish `İ` (U+0130) to `i` + U+0307 (combining dot above), so `İLETİŞİM` becomes `i̇leti̇şi̇m`, which does **not** match the keyword `iletişim` — and does not match even after NFC normalization (verified). Swapping `toLocaleLowerCase("tr-TR")` for `toLowerCase()` would trade an English-input bug for a Turkish-input bug.

A correct fold must handle both directions, for example by pre-mapping `İ → i` before ASCII lowercasing, then applying Unicode normalization — with test coverage for `SINAMA`, `AI`, `İLETİŞİM` and `IŞIK` together. The exact implementation is a decision for the fixing brief; the requirement is that **ASCII identifiers and Turkish text both fold correctly**.

**Do not fix during this audit.** Preserved as the baseline regression.

> **RESOLVED in BRIEF 00.1.** The fix follows the direction recorded above rather than the naive swap. `normalizeIntentText()` unifies dotted/dotless i and case-folds without `toLocaleLowerCase`; `foldIntentText()` additionally strips combining marks so `İLETİŞİM`, `iletişim` and `iletisim` all agree. All four cases named above — `SINAMA`, `AI`, `İLETİŞİM`, `IŞIK` — are covered by `npm run qa:ajoop`.

### KNOWN BASELINE FAILURE #2 — Ajoop substring false positives (P1) — RESOLVED in BRIEF 00.1

**Location:** same function — `normalized.includes(keyword)`.

Keywords are matched as unanchored substrings, and `.find()` returns whichever intent sits earliest in a dynamically-mutated array. **VERIFIED IN BROWSER:**

| Input | All matching intents | Returned | Expected |
|---|---|---|---|
| `email` | `ai` via `"ai"`, `cv` via `"mail"`, `cv` via `"email"` | **`ai`** ❌ | `cv` / contact |
| `hiring` | `greeting` via `"hi"`, `availability` via `"hiring"` | **`greeting`** ❌ | `availability` |
| `iletişim` | `cv` via `"iletişim"`, `availability` via `"iş"` | `cv` ✅ | `cv` |

A user typing "email" is answered about AI work; a recruiter typing "hiring" is greeted. Both are lowercase ASCII, so **this is not fixed by fixing #1** — the two defects are independent and both need addressing.

Aggravating factor: intent order is set by four separate `unshift` blocks, so match priority depends on script execution order rather than on any declared precedence.

**Fix direction:** word-boundary matching, longest-keyword-wins or explicit intent precedence, and a declared rather than emergent ordering.

> **RESOLVED in BRIEF 00.1** via token matching. Keywords now match whole tokens rather than arbitrary substrings: keywords of 1–2 characters compare diacritic-sensitively, 3-character keywords compare exactly, and keywords of 4+ characters allow a prefix match so Turkish suffixes still resolve (`projelerini` → `proje`). Multi-word keywords match as consecutive token runs.
>
> **Intent ordering was deliberately left unchanged** — the fix is entirely in normalization and matching, as the brief required. `email` → `cv` and `hiring` → `availability` now resolve correctly under the existing order.
>
> One detail found while fixing, worth recording: the runtime keyword map is assembled across **two** files, not one. `legacy-script.js` declares the base intents and `portfolio-v2.js` (lines 255–258) upserts four more (`sinama`, `mergeRush`, `roles`, `latestBuild`), promoting `roles` to the front with `{ priority: true }`. This is why the runtime map has 19 intents against 8 declared statically in `legacy-script.js`, and it reinforces §13 risk 2: intent priority is still an emergent property of load order.

### Not a failure — corrections to the handoff brief

Two handoff observations did not survive verification and are corrected here:

1. **`games.html` is *not* missing from `sitemap.xml`.** It is present at priority 0.7. Sitemap coverage is complete.
2. **The skip link is on five *case-study* pages, not "case/game" pages.** No game page has one.

The handoff's core SINAMA reproduction **was accurate** and is confirmed above.

---

## 16. Recommended Next Step

**BRIEF 01 — Project Data Source of Truth.** *(Not implemented here.)*

This audit did not implement any part of it. What follows is only what the migration must preserve.

### What must be preserved

1. **The no-build-step deploy guarantee.** GitHub Pages serves repository files directly. A committed, statically-loadable registry must remain — production must never require CI to boot. This is why `portfolio-data.js` is generated *and* committed.
2. **Deterministic generation.** Same input → byte-identical output, with CI verifying rather than regenerating so a stale artifact fails loudly. Preserve this property and `qa-portfolio-data.js`.
3. **`window.KAAN_PORTFOLIO` availability and timing.** It is read synchronously by `portfolio-v2.js` and frozen with `Object.freeze`. The boot order in `script.js` — registry before runtime before V2 — is a hard contract on both the parser and async paths.
4. **Per-language field shape.** Canonical entries carry `{en, tr}` objects per field. `applyLanguage` re-renders dependent views on language change; any new shape must keep re-rendering cheap and synchronous.
5. **All 25 archive slugs must keep resolving.** `project-detail.html?project=<slug>` URLs may exist in external links and search history. Migrating `projectDetailData` (11 slugs) and `githubRepositoryProjectDetails` (14 slugs) into the canonical source must preserve every existing slug, or provide explicit redirects.
6. **The three-way overlap needs an explicit decision, not a silent merge.** `hospital` / `hospital-form-app` / `hospital-appointment-system` are three representations of related work; likewise `joyday` and `chatbotFlow`. Choose canonical identities deliberately and record the mapping.
7. **Case-study `.data.js` files are a separate content channel.** Decide explicitly whether they fold into the canonical source or stay independent — do not leave it ambiguous.
8. **Factual claims are protected.** Per `CLAUDE.md`, career and project claims were fact-checked in earlier passes. A data migration must move strings verbatim and must not restate roles, dates or scope.

### Suggested sequencing beyond Brief 01

Brief 01 addresses P2-1. The P1 items are independent of it and smaller:

- **P1-1 and P1-2 (Ajoop)** are localized to one function and are good candidates for an early, well-tested fix with the cases in §15 as the test matrix.
- ~~**P1-3 (form success reporting)** needs a decision about the Apps Script response contract (e.g. CORS-enabled JSON) before the client can verify anything.~~ **Done in BRIEF 00.2** — no decision was needed: the deployed script already returned CORS-enabled JSON, and the client was discarding it.

**All three P1 findings are now closed.** BRIEF 01 starts from a baseline with no known P0 or P1 issues.

---

## Appendix A — Audit tooling

`scripts/site-audit.mjs` — added by this audit. Node built-ins only, zero dependencies, read-only, never writes to the repository.

```bash
node scripts/site-audit.mjs
```

```bash
node scripts/site-audit.mjs --json
```

Checks: missing `<title>` / meta description / `<h1>` / canonical, multiple `<h1>`, non-self-referential canonical, duplicate element IDs, `<img>` without `alt`, unresolved local links and assets, sitemap coverage in both directions (with documented exemptions), `robots.txt` sitemap directive, and the Ajoop normalization regression.

Exit code is `1` on structural failure, `0` when only warnings remain.

**Baseline result at `45d477a`:** 19 pages, 453 local references checked, 17 sitemap URLs, **0 failures, 15 warnings** (14 social-metadata coverage + 1 Ajoop normalization).

**After BRIEF 00.1:** **0 failures, 14 warnings** — the Ajoop normalization warning is gone. That check was promoted from a warning to a **failure**, so a reintroduction of `toLocaleLowerCase("tr-TR")` in executable code now breaks the build rather than being tolerated. A second failure check asserts the token matching layer is still present and extractable.

`scripts/qa-ajoop-intents.mjs` — added in BRIEF 00.1. Extracts the matching layer verbatim from `legacy-script.js` between the `ajoop-intent-matching` markers and exercises the shipped implementation rather than a copy.

```bash
npm run qa:ajoop
```

Covers normalization, accent folding, tokenization (punctuation, whitespace, `c#`), uppercase-ASCII positives, substring-collision negatives, multi-word phrases, Turkish casing and agglutination, and the fallback path. **Result: 294 assertions across 19 intents, passing.** A drift guard fails if any fixture intent id or keyword disappears from `legacy-script.js` or `portfolio-v2.js`.

`scripts/qa-request-submission.mjs` — added in BRIEF 00.2. Extracts the submission layer verbatim from `legacy-script.js` between the `request-submission` markers and drives every branch with a mocked transport (no network calls).

```bash
npm run qa:request
```

Covers confirmed success, HTTP failures (400/401/403/404/429/500/502/503), application rejection (`{ok:false}`), non-boolean `ok` values, network rejection, body-read failure, timeout, malformed and non-object JSON, payload shape, double-submit blocking, and form-reset timing. **Result: 84 assertions, passing.** The critical guard asserts that an opaque response can never become success and that `no-cors` does not reappear in executable code — verified non-vacuous by temporarily reintroducing it, which failed the suite.

## Appendix B — Validation performed for this audit

- `node scripts/site-audit.mjs` → 0 failures, 15 warnings, exit 0.
- `node qa-js-syntax.js` → passed, 19 files.
- `node qa-assets.js` → passed, 63 referenced assets exist, 81 images with intrinsic dimensions.
- `node qa-internal-links.js` → passed, 453 internal references, 24 known slugs.
- Browser (local `http-server` on `:4173`): `index.html`, `games.html`, `adventure.html`, `ai-flow-puzzle.html`, `joyday-paint.html` — all load with **zero console errors**.
- Ajoop intent matrix evaluated against the live runtime via `detectChatbotIntent`.
- Viewport probes at 320 / 375 / 768 px on the homepage.
- Mobile nav toggle activated at 375 px.

Not run in this audit: `npm run qa:a11y` (pa11y), `npm run qa:lighthouse`, `npm run qa:html`, `npm run qa:spelling`, and any external link validation.
