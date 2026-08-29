# kaanbalci.com Frontend Runtime Architecture

Established by **BRIEF 03 — Frontend Runtime Modularization**, branch `refactor/frontend-runtime-modularization-v1`.

Before this, one 5,244-line `legacy-script.js` owned navigation, theme, i18n, the project catalog, Ajoop, Recruiter Mode, the command palette, the request form and per-game enhancements — and every page loaded all of it. A game page paid for the request form; the About page paid for the project-detail renderer.

## Goals

1. **Responsibility boundaries.** One file per coherent feature, not one file for the site.
2. **Page isolation.** A page loads only the runtime it can actually use.
3. **Testability.** QA extracts from focused modules instead of grepping a 5,000-line file.
4. **No behaviour change.** The split is a verbatim slice; execution order is preserved exactly.
5. **Still a static site.** No bundler, no build step, no framework, no npm runtime dependency.

Payload reduction was *not* a goal and is modest — see [Payload](#payload).

---

## Runtime Overview

```
HTML page
  <body data-page="works">
  …
  <script src="portfolio-data.js">   canonical project registry (BRIEF 01)
  <script src="script.js">           page-aware loader + module manifest
  <script src="portfolio-v2.js">     V2 rendering layer (must stay last)
        │
        └─ script.js reads data-page and injects, in order:
             14 COMMON modules  +  0–2 page modules
```

Modules are **classic scripts, not ES modules**. That is deliberate: classic scripts share one global lexical scope in load order, which is exactly what lets a single file be split into many without a bundler, and they keep working from a subdirectory and over `file://`. `type="module"` would have forced either a build step or an import graph, both of which the deployment contract rules out.

**Load order is a contract.** It reproduces the original single-file execution order. `scripts/qa-runtime-modules.mjs` asserts the ordering constraints that matter.

---

## Module Tree

```
js/
  core/
    analytics-config.js public Umami Website ID and privacy flags
    analytics.js        funnel taxonomy, sanitization, provider isolation
    shell.js            resume links, overlay/focus-trap utilities, mobile nav, footer year
    theme.js            dark/light state, persistence, toggle
    media.js            image fallback handling
    i18n.js             EN/TR dictionaries and applyLanguage()
  portfolio/
    routing.js          catalog projection, slug resolution, siteUrl/projectUrl
    project-detail.js   detail rendering, prev/next, canonical share link
    works.js            category filters, card navigation, project search
  ajoop/
    matcher.js          DOM-free intent normalization and matching
    assistant.js        Ajoop content, dialogue depth, assistant UI
  features/
    ultimate.js         shared recruiter/palette copy, static label sync
    recruiter.js        Recruiter Mode drawer
    command-palette.js  command palette
    ajoop-nav.js        Ajoop navigation actions + shared feature init sequence
    creative.js         performance pass, easter egg, creative commands
    certificates.js     certificate preview modal
  request/
    submission.js       DOM-free transport, timeout, result interpretation
    form.js             form copy, status UI, submit binding
  pages/
    games.js            adventure, game catalog and Joyday navigation
    labs.js             algorithmic 3D lab
```

21 modules. The original 19-module split remains intact; BRIEF 06 adds two focused common infrastructure modules for analytics configuration and behavior.

---

## Global Namespace

The runtime keeps the pre-existing contract rather than inventing a new one. Project-owned globals are exactly four, all pre-dating this brief:

| Global | Owner | Purpose |
|---|---|---|
| `window.KAAN_PORTFOLIO` | `portfolio-data.js` (generated) | Canonical project/profile registry |
| `window.KAAN_REQUEST_FORM_ENDPOINT` | `request-config.js` | Public Apps Script endpoint |
| `window.KAAN_REQUEST_FORM_EMAIL` | `request-config.js` | Public contact address |
| `window.KAAN_GOOGLE_FORM_URL` | `request-config.js` | Google Form fallback |

`qa-runtime-modules.mjs` fails if any other `window.KAAN*` global appears.

Modules do **not** introduce a `KAAN.*` façade. Wrapping 5,000 verbatim lines in namespace objects would have meant rewriting every call site — a behaviour risk with no functional gain, in a brief whose success criterion is "behaviour identical". Cross-module references use the shared global lexical scope, exactly as they did inside the single file. Namespacing is recorded under [Future Cleanup](#future-cleanup).

---

## Common Modules

Loaded on every page, in this order:

1. `js/core/analytics-config.js`
2. `js/core/analytics.js`
3. `js/core/shell.js`
4. `js/core/theme.js`
5. `js/core/media.js`
6. `js/core/i18n.js`
7. `js/portfolio/routing.js`
8. `js/ajoop/matcher.js`
9. `js/ajoop/assistant.js`
10. `js/features/ultimate.js`
11. `js/features/recruiter.js`
12. `js/features/command-palette.js`
13. `js/features/ajoop-nav.js`
14. `js/features/creative.js`

Analytics is common because page views and conversion entry points span the whole site; its provider remains async and optional. Ajoop, Recruiter Mode and the command palette are common because they **inject their own UI into every page** — that was true before this brief and is unchanged.

---

## Page-Specific Modules

| `data-page` | Extra modules | Pages |
|---|---|---|
| `home`, `about`, `blog`, `now`, `error`, `caseStudy` | — | index, about, blog, now, 404, 5 case studies |
| `works` | `portfolio/works.js` | works.html |
| `games` | `portfolio/works.js`, `pages/games.js` | games.html |
| `game` | `pages/games.js` | adventure, ai-flow-puzzle, joyday-paint |
| `projectDetail` | `portfolio/project-detail.js` | project-detail.html + 25 generated routes |
| `certificates` | `features/certificates.js` | single-work.html |
| `request` | `request/submission.js`, `request/form.js` | request.html |
| `labs` | `pages/labs.js` | labs.html |

---

## Page × Module Matrix

Derived from DOM markers in the source, not assumption.

| Page | Common | works | games | projectDetail | certificates | request | labs |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| index | ✅ | – | – | – | – | – | – |
| about / blog / now / 404 | ✅ | – | – | – | – | – | – |
| case studies (5) | ✅ | – | – | – | – | – | – |
| works | ✅ | ✅ | – | – | – | – | – |
| games | ✅ | ✅ | ✅ | – | – | – | – |
| adventure / ai-flow-puzzle / joyday-paint | ✅ | – | ✅ | – | – | – | – |
| project-detail + `/projects/<slug>/` | ✅ | – | – | ✅ | – | – | – |
| single-work | ✅ | – | – | – | ✅ | – | – |
| request | ✅ | – | – | – | – | ✅ | – |
| labs | ✅ | – | – | – | – | – | ✅ |

---

## Load Order

Three orderings are load-bearing and asserted by QA:

- **`core/i18n.js` before `portfolio/routing.js` before `ajoop/assistant.js`.** `assistant.js` calls `applyLanguage()` at load, which calls `renderProjectDetail()`. Both must already be defined.
- **`ajoop/matcher.js` before `ajoop/assistant.js`.** The matcher is pure declarations; the assistant binds the UI that uses it.
- **`features/ultimate.js` before `features/recruiter.js` / `command-palette.js` / `ajoop-nav.js`.** They read the shared copy in `ultimateContent`.

Page modules are **spliced**, not appended, where position matters. `script.js` declares this explicitly:

```js
const INSERT_BEFORE = {
  "js/portfolio/project-detail.js": "js/ajoop/matcher.js",
  "js/features/certificates.js": "js/core/i18n.js",
  "js/portfolio/works.js": "js/features/recruiter.js",
};
```

`project-detail.js` must be defined before `assistant.js` runs `applyLanguage()`. `certificates.js` must run before `i18n.js` snapshots translatable text nodes. `works.js` must come after `ultimate.js` because its injected search UI reads the shared copy.

`ajoop-nav.js` runs the shared init sequence (`setupProjectSearch`, `setupRecruiterMode`, `setupCommandPalette`, `setupProjectCopyLink`, `enhanceAjoopNavigationActions`, `updateUltimateStaticLabels`) in its original order. The two page-scoped entries are called through a `typeof` guard, the same pattern `applyLanguage()` already used for its optional renderers.

---

## Project Data Dependency

Unchanged from BRIEF 01. `portfolio-data.js` defines `window.KAAN_PORTFOLIO` synchronously before any module runs, and `js/portfolio/routing.js` projects the detail catalog from it:

```js
const projectDetailData =
  (window.KAAN_PORTFOLIO && window.KAAN_PORTFOLIO.projectDetails) || {};
```

**No module holds project facts.** `scripts/qa-project-data.mjs` scans all runtime modules plus `portfolio-v2.js` for reintroduced project literals. Analytics identifiers are derived from the same registry at runtime.

## Project Routing Dependency

Unchanged from BRIEF 02. `js/portfolio/routing.js` owns `siteUrl()`, `projectUrl()` and `resolveCurrentProjectSlug()`; canonical `/projects/<slug>/` still wins over the legacy `?project=` query, and generated pages still declare `data-site-root="../../"`.

Generated project pages now carry three body markers: `data-page="projectDetail"`, `data-project-slug`, `data-site-root`.

---

## Ajoop Architecture

Split along the line BRIEF 00.1 established:

- **`js/ajoop/matcher.js`** — DOM-free. Normalization, accent folding, tokenization, keyword matching, `detectChatbotIntent`. This is what `npm run qa:ajoop` extracts and executes.
- **`js/ajoop/assistant.js`** — content dictionaries, dialogue depth and the UI controller.

**Nothing about matching semantics changed.** Normalization, keyword semantics, intent priority, responses, UI and fallback are byte-identical.

Intent priority is still assembled across several modules and remains order-dependent: `assistant.js` declares the base map, `request/form.js` and `pages/games.js` upsert their own intents, and `portfolio-v2.js` adds four more and promotes `roles` to the front with `{ priority: true }`. `qa:ajoop` locks the resulting 19-intent runtime order via its fixture.

> Because `request/form.js` and `pages/games.js` are now page-scoped, their intents (`request`, `games`, `adventure`) register **only on the pages that load them**. That matches the previous *effective* behaviour — those answers linked to page-specific UI — and all 294 assertions still pass against the full runtime set.

## Request Architecture

Split along the line BRIEF 00.2 established:

- **`js/request/submission.js`** — DOM-free transport: timeout, abort, HTTP/JSON interpretation, `{ok:true}` strict success. Extracted and executed by `npm run qa:request`.
- **`js/request/form.js`** — copy, status UI, validation glue, submit binding.

Every reliability guarantee is preserved: CORS-readable response, strict success, 20s timeout, network/malformed/rejection handling, request ids, duplicate-submit protection, values preserved on failure, reset only after confirmed success. The `no-cors` drift guard now scans both modules.

## Recruiter Mode

Moved to `js/features/recruiter.js` unchanged. It still activates via a body class and **still does not persist** — that is deliberate. Isolation was the objective; behaviour changes belong to a later brief.

---

## Generated Project Pages

The 25 pages under `projects/` are generated from `project-detail.html`, so they inherit its `data-page` marker and script tags automatically.

**After changing script tags or the body marker in `project-detail.html`:**

```bash
npm run generate:projects
```

`npm run qa:seo` fails if generated output falls out of step.

---

## Adding a New Page

1. Create the HTML with `<body data-page="…">`, loading `portfolio-data.js`, `script.js` and `portfolio-v2.js` **at the end of `<body>`** (the loader reads `document.body`).
2. If the page needs only shared behaviour, reuse an existing marker (`about` is the plain-content type).
3. If it needs its own feature, add a module under `js/pages/` and register the marker in `PAGE_MODULES` in `script.js`.
4. Never add `<script src="js/…">` to a page — the manifest owns load order, and QA fails on a direct reference.
5. Run `npm run qa`.

## Adding a New Shared Feature

1. Put it in `js/core/` (infrastructure) or `js/features/` (user-facing) — one file per coherent responsibility.
2. Add it to `COMMON` in `script.js` at the position its dependencies require.
3. If it depends on, or is depended on by, another module, add the constraint to `ORDER` in `scripts/qa-runtime-modules.mjs` so the requirement is enforced rather than remembered.
4. Guard against missing DOM: `const el = document.querySelector(…); if (!el) return;`
5. Run `npm run qa:runtime`.

---

## Remaining legacy-script.js Responsibilities

**None.** It is a 26-line inert stub kept only because it is a public URL — a cached page or external copy may still request `/legacy-script.js`, and an empty valid script beats a 404. It warns once to the console if loaded without the module runtime.

`qa-runtime-modules.mjs` fails if it exceeds 40 lines or redefines any of `applyLanguage`, `renderProjectDetail`, `detectChatbotIntent`, `setupProjectRequestForm`, `i18nTranslations` or `chatbotKeywordMap`.

## Compatibility Globals

No new compatibility layer was needed, but one existing contract is now explicit.

Three pages (`index.html`, `about.html`, `adventure.html`) use an inline `onclick="openDrivePreviews()"`. A function declared at the top level of a classic script becomes a `window` property, so the handler still resolves — but **only while `js/core/shell.js` stays in COMMON**. If that module ever became page-scoped the markup would break silently, so `qa-runtime-modules.mjs` asserts that every inline-handler function is defined by exactly one module and that the module is common.

These are the only inline handlers in the site; every other binding already used `addEventListener`. Converting them was out of scope — the brief asks not to turn this into an HTML modernization pass — and they are recorded as minor debt.

---

## Payload

BRIEF 06 adds 13,908 bytes of local uncompressed JavaScript (`analytics-config.js` + `analytics.js`) to the common path. The configured Umami Cloud tracker measured 2,301 transferred bytes with Brotli on 2026-08-29 and loads asynchronously. The table below remains the historical BRIEF 03 before/after split.

| Page type | Runtime JS before | after | change |
|---|---:|---:|---:|
| home / about / blog / now / 404 / case studies | 239 KB | 198 KB | −17% |
| works | 239 KB | 202 KB | −15% |
| games | 239 KB | 209 KB | −13% |
| game (adventure / puzzle / paint) | 239 KB | 204 KB | −14% |
| projectDetail | 239 KB | 209 KB | −13% |
| certificates | 239 KB | 200 KB | −16% |
| request | 239 KB | 214 KB | −11% |
| labs | 239 KB | 205 KB | −14% |

*(Runtime modules only; `portfolio-data.js` and `portfolio-v2.js` are unchanged and load everywhere.)*

**The reduction is modest, and that is the honest result.** The two largest blocks — i18n (1,200 lines) and the Ajoop assistant (1,046 lines) — are genuinely site-wide, so they cannot be page-scoped without changing behaviour. About 5% of the old file was verified-dead code that was removed; the rest of the win is the ~1,200 lines of request, project-detail, works, games, labs and certificates code that no longer ships to pages that cannot use it.

The real deliverable is the boundary, not the byte count.

---

## Future Cleanup

Not implemented, recorded so the reasoning survives:

- **`KAAN.*` namespace.** Modules still share the global lexical scope. Introducing a façade means touching every call site; worth doing per-module, incrementally, with QA at each step.
- **i18n data extraction.** `js/core/i18n.js` is 1,200 lines, mostly dictionaries. Moving them to JSON like the project catalog would shrink the common payload substantially — but the registry loads synchronously and translations are needed at first paint, so it needs the same generated-artifact treatment BRIEF 01 used.
- **Ajoop content extraction.** `assistant.js` is 1,046 lines, largely response copy. Same pattern applies.
- **Flash-of-wrong-language (P2-3).** Untouched here. It needs a pre-paint snippet like the theme one; extracting the i18n data first would make it tractable.
- **Intent priority.** Still emergent from load order across four modules. A declared precedence would remove the ordering trap.
- **CSS architecture.** `style.css` remains a single 6,608-line file. That is the next phase.
