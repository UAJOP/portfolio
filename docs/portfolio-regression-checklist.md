# kaanbalci.com Regression Checklist

Manual regression pass for the static site. Companion to [`portfolio-baseline-audit.md`](portfolio-baseline-audit.md).

**Baseline captured at:** `45d477a` on branch `audit/portfolio-baseline-v1`, 2026-08-29.
**Updated:** BRIEF 00.1 — Ajoop Intent Matching (`fix/ajoop-intent-reliability-v1`); BRIEF 00.2 — Request Submission Reliability (`fix/request-submission-reliability-v1`); BRIEF 01 — Project Data Source of Truth (`refactor/project-data-source-of-truth-v1`); BRIEF 02 — Unique Project Pages & SEO (`seo/unique-project-pages-v1`); BRIEF 03 — Frontend Runtime Modularization (`refactor/frontend-runtime-modularization-v1`); BRIEF 04 — CSS Architecture & Accessibility (`refactor/css-accessibility-responsive-v1`).

## How to use this

Run the automated layer first, then walk the manual checks:

```bash
node scripts/site-audit.mjs
```

```bash
npm run qa:ajoop
```

```bash
npm run qa:request
```

```bash
npm run qa:projects
```

```bash
npm run qa:seo
```

```bash
npm run qa:runtime
```

```bash
npm run qa:css
```

```bash
npm run qa:a11y:static
```

```bash
npm run qa
```

Serve locally for the manual checks:

```bash
npx --yes http-server -p 4173 -c-1
```

### Legend

- `[ ]` — expected to pass. A failure here is a **new regression**.
- **KNOWN BASELINE FAILURE** — fails today, on purpose. Confirm it *still fails in the same way*; do not tick it. If one starts passing, the underlying bug was fixed — update this file and the audit.
- ~~Struck-through baseline results~~ — a former known failure that has since been fixed. The old result is kept so a re-regression is recognisable.
- **UNVERIFIED** — not confirmed at baseline. Establish the result on first run, then treat as a normal check.

Checks marked ✅ **verified at baseline** were confirmed in a browser or by script on 2026-08-29.

---

## Automated gate

- [ ] `node scripts/site-audit.mjs` exits `0` — ✅ *0 failures, 14 warnings after BRIEF 00.1 (was 15 at baseline)*
- [ ] Warning count is **14** or lower (social-metadata coverage only). A rise means new metadata drift.
- [ ] `npm run qa:ajoop` passes — ✅ *294 assertions across 19 intents (added in BRIEF 00.1)*
- [ ] `npm run qa:request` passes — ✅ *84 assertions, no network calls (added in BRIEF 00.2)*
- [ ] `npm run qa:projects` passes — ✅ *1,194 assertions · 25 detail records · 5 flagship (added in BRIEF 01, extended in BRIEF 03)*
- [ ] `npm run qa:seo` passes — ✅ *1,662 assertions · 25 canonical routes · 25 sitemap project URLs (added in BRIEF 02)*
- [ ] `npm run qa:runtime` passes — ✅ *318 assertions · 19 modules · 13 page types (added in BRIEF 03)*
- [ ] `npm run qa:css` passes — ✅ *323 assertions · 7 stylesheets (added in BRIEF 04)*
- [ ] `npm run qa:a11y:static` passes — ✅ *575 assertions across 44 pages (added in BRIEF 04)*
- [ ] `npm run qa:html` → **0 errors, 0 warnings** — ✅ *the 3 baseline aria warnings are fixed*
- [ ] `node qa-js-syntax.js` passes — ✅ *37 files (root scripts + js/ modules since BRIEF 03)*
- [ ] `node qa-assets.js` passes — ✅ *baseline: 63 assets*
- [ ] `node qa-internal-links.js` passes — ✅ *baseline: 453 references*
- [ ] `node qa-portfolio-data.js` passes (canonical JSON ↔ generated `portfolio-data.js` parity)
- [ ] `npm run qa:html` passes — UNVERIFIED at baseline
- [ ] `npm run qa:spelling` passes — UNVERIFIED at baseline
- [ ] `npm run qa:a11y` (pa11y) — UNVERIFIED at baseline; establish a result

> After editing any `data/portfolio/*.json`, run `npm run data:generate && npm run generate:projects` and commit the regenerated `portfolio-data.js`, `projects/**` and `sitemap.xml`. Never hand-edit those — they are generated.

---

## Global

- [ ] Homepage loads — ✅ *verified at baseline*
- [ ] No unexpected console error on `index.html` — ✅ *verified: zero errors*
- [ ] Desktop navigation works
- [ ] Mobile navigation opens/closes; toggle updates `aria-expanded` — ✅ *verified at 375 px*
- [ ] TR → EN switch
- [ ] EN → TR switch
- [ ] Language persists across navigation (`localStorage["kaanbalci-site-language"]`)
- [ ] `<html lang>` updates to match the active language
- [ ] Dark/light theme toggle
- [ ] Theme persists across navigation (`localStorage["kaanbalci-site-theme"]`)
- [ ] **No flash of wrong theme** on reload — the pre-paint `<head>` script handles this
- [ ] Recruiter Mode opens and closes
- [ ] Recruiter Mode persistence — **KNOWN BASELINE FAILURE (P2-7):** it does **not** persist. Only `kaanbalci-site-theme` and `kaanbalci-site-language` are stored; the mode resets on every navigation and reload. Expected behaviour today.
- [ ] Command Palette opens with `Ctrl/Cmd+K`
- [ ] Command Palette: `SINAMA` (uppercase) matches the SINAMA command — ✅ *expected to PASS; the palette uses locale-independent `.toLowerCase()`*
- [ ] Site renders with `localStorage` blocked (theme falls back to dark, no crash)

### Known non-blocking baseline condition

- **Flash of wrong language (P2-3):** the pre-paint script restores theme only. A returning Turkish visitor sees English content on first paint on every page, until `js/core/i18n.js` runs. Expected today — do not log as new.

---

## Ajoop assistant

- [ ] Assistant launcher is visible and the panel opens
- [ ] Panel has `role="dialog"`, `aria-modal="true"`
- [ ] Normal intent matching works (lowercase)
- [ ] Unknown intent returns the fallback answer
- [ ] Quick-action buttons answer their intent
- [ ] Assistant language follows the site language switch

### Intent matrix

Covered automatically:

```bash
npm run qa:ajoop
```

To spot-check the live runtime, run this in the browser console on any page:

```js
["sinama","SINAMA","ai","AI","github","GITHUB","email","hiring"].map(q => [q, detectChatbotIntent(q)])
```

> **P1-1 and P1-2 were fixed by BRIEF 00.1 — Ajoop Intent Matching Reliability Hotfix.**
> The rows below were **KNOWN BASELINE FAILURES** at `45d477a` and are now expected to **pass**. The historical baseline result is kept in the table so a re-regression is recognisable. All rows are also asserted automatically by `npm run qa:ajoop`.

| Input | Expected intent | Baseline (`45d477a`) | Now |
|---|---|---|---|
| `sinama` | `sinama` | `sinama` | - [ ] passes |
| `SINAMA` | `sinama` | ~~`default`~~ *(was P1-1)* | - [ ] passes |
| `Sinama` | `sinama` | `sinama` | - [ ] passes |
| `ai` | `ai` | `ai` | - [ ] passes |
| `AI` | `ai` | ~~`default`~~ *(was P1-1)* | - [ ] passes |
| `github` | `projects` | `projects` | - [ ] passes |
| `GITHUB` | `projects` | ~~`default`~~ *(was P1-1)* | - [ ] passes |
| `EMAIL` | `cv` | ~~`default`~~ *(was P1-1)* | - [ ] passes |
| `HIRING` | `availability` | ~~`default`~~ *(was P1-1)* | - [ ] passes |
| `email` | `cv` | ~~`ai`~~ *(was P1-2)* | - [ ] passes — **must not** resolve to `ai` |
| `hiring` | `availability` | ~~`greeting`~~ *(was P1-2)* | - [ ] passes — **must not** resolve to `greeting` |
| `Tell me about SINAMA` | `sinama` | — | - [ ] passes |
| `What is your GitHub?` | `projects` | — | - [ ] passes |
| `iletişim` | `cv` | `cv` | - [ ] passes |
| `İLETİŞİM` | `cv` | `cv` | - [ ] passes |
| `iletisim` (no diacritics) | `cv` | *(no match)* | - [ ] passes |
| `merge rush` | `mergeRush` | `mergeRush` | - [ ] passes |
| `zxcvbnm qwerty` | `default` | `default` | - [ ] fallback still works |

### Additional collision guards

- [ ] `email` does not false-positive into `ai`
- [ ] `hiring` does not false-positive into `greeting`
- [ ] `robot` does not match `bot`
- [ ] `kontrol` does not match `rol`
- [ ] `knowledge` does not match `now`
- [ ] `profit` does not match `fit`
- [ ] Short keywords still match as whole words: `hi` → `greeting`, `cv` → `cv`, `telegram bot` → `ai`

### Turkish normalization

- [ ] `EĞİTİM` / `eğitim` / `egitim` → `education`
- [ ] `SERTİFİKA` / `sertifika` / `sertifikalar` → `certificates`
- [ ] `OYUN` / `oyun` / `oyunlar` → `games`
- [ ] `HAKKINDA` / `hakkında` → `about`
- [ ] Agglutinated forms resolve: `projeler` → `projects`, `sinamayı anlat` → `sinama`
- [ ] English `is` does **not** trigger `availability` via the Turkish keyword `iş`
- [ ] Turkish `iş` / `İŞ` still matches `availability`

### Multi-word phrases

- [ ] `merge rush`, `tiny factory` → `mergeRush`
- [ ] `ai flow puzzle` → `games`
- [ ] `work history` → `experience`
- [ ] `hava durumu` → `weather`
- [ ] `forward deployed`, `software engineer` → `roles`
- [ ] Non-adjacent phrase words do **not** match (`factory that does merge things` ≠ `mergeRush`)

**How the fix works.** `detectChatbotIntent` now normalizes and tokenizes both sides through one layer (`legacy-script.js`, marked `ajoop-intent-matching`):

- `normalizeIntentText()` — case-folds without `toLocaleLowerCase`, unifying dotted/dotless i so `SINAMA` → `sinama` and `İLETİŞİM` → `iletişim`.
- `foldIntentText()` — additionally strips combining marks so `iletisim` also agrees.
- `matchesKeyword()` — matches whole tokens or consecutive token runs. Keywords of 1–2 chars compare diacritic-sensitively, 3 chars exactly, 4+ chars by prefix (so Turkish suffixes resolve).

> **Do not "simplify" this to `.toLowerCase()`.** That maps `İ` to `i` + U+0307 and breaks every Turkish keyword. `npm run qa:ajoop` and `scripts/site-audit.mjs` both fail if `toLocaleLowerCase("tr-TR")` reappears in executable code.

**Intent priority was not changed** by BRIEF 00.1. Note that the runtime keyword map is assembled across **two** files: `legacy-script.js` declares the base intents and `portfolio-v2.js` (lines 255–258) upserts `sinama`, `mergeRush`, `roles` and `latestBuild`, promoting `roles` to the front. Changes to either file can shift intent priority.

---

## Projects

- [ ] `works.html` renders project cards
- [ ] Category filtering works
- [ ] Project search filters cards (locale-independent; unaffected by the Ajoop bug)
- [ ] Project card → navigates to the correct project
- [ ] Query-string routing: `project-detail.html?project=<slug>` resolves — ✅ *verified*
- [ ] All 25 detail slugs resolve — ✅ *verified in browser; asserted by `qa:projects`*
- [ ] Unknown slug degrades gracefully ("Project Not Found", no console error) — ✅ *verified*
- [ ] GitHub CTA present and correct on project detail
- [ ] Live demo CTA present where the project has one
- [ ] Translated project data switches with the site language — ✅ *verified (TR title differs, reverts on EN)*
- [ ] `window.KAAN_PORTFOLIO` is defined before `portfolio-v2.js` runs
- [ ] Resume/CV links resolve through the single `resumeLink` constant (no hardcoded Drive URLs)

### Canonical project catalog (BRIEF 01)

> Project facts live in `data/portfolio/projects.json` and `data/portfolio/project-details.json`.
> ~~The 25 detail records were two hand-maintained literals inside `legacy-script.js`.~~ They are now projected from the generated registry. See [`project-data-architecture.md`](project-data-architecture.md).

Covered automatically:

```bash
npm run qa:projects
```

- [ ] Canonical project catalog loads (`window.KAAN_PORTFOLIO.projectDetails`) — ✅ *verified: 25 records*
- [ ] Every legacy slug resolves — ✅ *verified: 25/25 against the pre-migration fixture*
- [ ] Slug order preserved (drives Previous/Next navigation) — ✅ *asserted*
- [ ] Homepage selected projects resolve — ✅ *verified*
- [ ] Works cards resolve; all `project-detail` links resolve — ✅ *verified: 10 cards, 11 links, 0 unresolved*
- [ ] Filters resolve — ✅ *verified: 7 filter controls*
- [ ] Project detail resolves — ✅ *verified for both former structures*
- [ ] TR project copy present — ✅ *asserted for every bilingual field*
- [ ] EN project copy present — ✅ *asserted for every bilingual field*
- [ ] GitHub/demo links unchanged — ✅ *asserted against the fixture*
- [ ] Recruiter Mode project selections unchanged — ✅ *verified: 3 evidence links, 4 roles*
- [ ] Ajoop project references unchanged — ✅ *verified*
- [ ] Unknown project fallback unchanged — ✅ *verified*
- [ ] Referenced local media exists — ✅ *asserted*
- [ ] No project facts in `legacy-script.js` / `portfolio-v2.js` — ✅ *drift guard*

> **After editing any `data/portfolio/*.json`:** run `npm run data:generate && npm run generate:projects` and commit the regenerated `portfolio-data.js`, `projects/**` and `sitemap.xml`, or `qa:data` / `qa:seo` fail on a stale artifact. A deliberate change to a title, category, link, image, year or field set also requires updating `scripts/fixtures/project-catalog-baseline.json` in the same commit — that friction is intentional, so data-shape changes are visible in review.
>
> **Never add project facts to `legacy-script.js` or `portfolio-v2.js`.**

### Canonical project routes & SEO (BRIEF 02)

> Canonical: `/projects/<slug>/` (generated, indexable). Legacy: `/project-detail.html?project=<slug>` (still works, `noindex`).
> See [`project-routing-seo-architecture.md`](project-routing-seo-architecture.md).

Covered automatically:

```bash
npm run qa:seo
```

- [ ] Canonical project URL resolves — ✅ *verified: `/projects/ai-chatbot-flow-design/`, `/projects/my-museum/`*
- [ ] All 25 project routes generated — ✅ *verified: 25/25 return HTTP 200*
- [ ] Legacy query route still resolves — ✅ *verified: 25/25 return HTTP 200 and render*
- [ ] Unknown query slug fallback preserved — ✅ *verified: "Project Not Found"*
- [ ] Unique `<title>` per page — ✅ *asserted, uniqueness enforced*
- [ ] Unique meta description — ✅ *asserted, derived from `subtitle`*
- [ ] Canonical unique and self-referential — ✅ *asserted; never points at `project-detail.html`*
- [ ] `og:url` matches canonical — ✅ *asserted*
- [ ] `og:image` absolute and resolves on disk — ✅ *asserted*
- [ ] Twitter metadata present — ✅ *card / title / description / image*
- [ ] JSON-LD valid, typed from canonical data, no fabricated fields — ✅ *asserted (no rating/offers/price/review)*
- [ ] `<meta charset>` within the first 1024 bytes — ✅ *asserted (Turkish titles depend on it)*
- [ ] Exactly one `<h1>`, carrying the project title — ✅ *asserted in raw HTML and verified after render*
- [ ] Sitemap contains all 25 unique project pages — ✅ *asserted*
- [ ] Sitemap excludes project query URLs — ✅ *asserted*
- [ ] Every sitemap URL resolves on disk — ✅ *asserted*
- [ ] Works links use canonical routes — ✅ *verified: 11 links, 0 legacy*
- [ ] Homepage links use canonical routes — ✅ *verified*
- [ ] Recruiter project links use canonical routes — ✅ *verified*
- [ ] Previous/Next use canonical routes — ✅ *verified on both route shapes*
- [ ] Ajoop project links canonical — ✅ *verified; matcher untouched*
- [ ] TR/EN still work on generated pages — ✅ *verified: title + h1 translate, `lang` updates*
- [ ] Theme still works on generated pages — ✅ *verified*
- [ ] No nested-path asset failures — ✅ *asserted: every `../../` target resolves; hero image loads*
- [ ] No console errors on generated pages — ✅ *verified in a clean tab*
- [ ] `robots.txt` does not block `/projects/` — ✅ *asserted*

> **Raw-HTML contract.** All SEO metadata must exist **before JavaScript runs** — that is why these pages are generated. `qa:seo` parses raw HTML only and never boots a browser. Verified over HTTP with `curl` as a non-JS crawler would see it.
>
> **Known limitation:** the full project body still renders client-side, so non-JS crawlers see metadata, title, subtitle and category but not the long-form copy.
>
> **`sinama` and `mergeRush` intentionally have no `/projects/` route** — they have dedicated case-study pages. Do not "fix" this by generating one.
>
> **After editing project data:** `npm run generate:projects`. `qa:seo` fails if generated pages or the sitemap fall out of step with canonical data.

---

## Games

- [ ] Games catalog (`games.html`) renders — ✅ *verified at baseline*
- [ ] Career Adventure boots — ✅ *verified: no console errors*
- [ ] AI Flow Puzzle boots — ✅ *verified: no console errors*
- [ ] Joyday Paint boots — ✅ *verified: canvas 900×900, `touch-action: none`, no console errors*
- [ ] Each game's reset/restart control works
- [ ] Touch interaction works on a real touch device (drawing, dragging, tapping)
- [ ] Keyboard controls work where the game offers them
- [ ] Game layout is usable at 375 px
- [ ] Joyday Paint: strokes land under the pointer at small viewport widths — **UNVERIFIED at baseline.** The canvas has a fixed 900×900 backing store scaled by CSS; check for coordinate mismatch after **any** CSS change near the canvas.
- [ ] No global CSS from `style.css` visibly breaks game layout
- [ ] Game pages still boot if the shared runtime changes (each loads the full `legacy-script.js` first)

---

## Frontend runtime modules (BRIEF 03)

> ~~One 5,244-line `legacy-script.js` loaded on every page.~~ The runtime is now 19 modules under `js/`, loaded per page by the manifest in `script.js` keyed off `<body data-page>`. `legacy-script.js` is a 26-line inert stub kept as a public URL.
> See [`frontend-runtime-architecture.md`](frontend-runtime-architecture.md).

Covered automatically:

```bash
npm run qa:runtime
```

- [ ] Common runtime boots on every page type — ✅ *verified: 12 common modules load*
- [ ] Theme works on representative pages — ✅ *verified: toggles light↔dark on index*
- [ ] TR/EN works — ✅ *verified on index, about, project pages (`lang` + nav copy switch)*
- [ ] Desktop navigation works
- [ ] Mobile navigation works
- [ ] Works filters work — ✅ *verified: 10 cards → 3 on "ai" filter, restored on "all"*
- [ ] Canonical project detail works — ✅ *verified: `/projects/my-museum/`, 1 h1, image loads, prev/next canonical*
- [ ] Legacy project detail works — ✅ *verified: `?project=warehouse-war` renders*
- [ ] Recruiter Mode works — ✅ *verified: opens, 3 evidence links, canonical hrefs*
- [ ] Ajoop works — ✅ *verified: `SINAMA` → `sinama`; matcher untouched*
- [ ] Request works — ✅ *verified: 500 → error + values kept; `{ok:true}` → success + form cleared*
- [ ] Games boot without portfolio-module errors — ✅ *verified: adventure / ai-flow-puzzle / joyday-paint, zero console errors, canvas intact*
- [ ] About/blog load without unrelated runtime errors — ✅ *verified*
- [ ] Certificates modal opens and closes — ✅ *verified on single-work.html (click + Escape)*
- [ ] Labs 3D canvas module loads only on labs.html — ✅ *verified*
- [ ] Generated pages have correct script dependencies — ✅ *asserted for all 25*
- [ ] No removed legacy script reference — ✅ *asserted: no page loads `js/*` directly or `legacy-script.js`*
- [ ] No duplicate script loading — ✅ *asserted*
- [ ] No console errors — ✅ *verified in clean tabs across every page type*
- [ ] Page-specific feature code is not loaded globally — ✅ *asserted: request/works/project-detail/certificates/games/labs absent from COMMON*

### Page-aware loading spot check

| Page | Must load | Must NOT load |
|---|---|---|
| `index.html` | 12 common only | request, works, project-detail, labs |
| `works.html` | + `portfolio/works.js` | request, project-detail |
| `games.html` | + `works.js`, `pages/games.js` | request, project-detail |
| `adventure.html` | + `pages/games.js` | request, project-detail |
| `/projects/<slug>/` | + `portfolio/project-detail.js` | request, works |
| `request.html` | + `request/submission.js`, `request/form.js` | project-detail |
| `single-work.html` | + `features/certificates.js` | request, works |
| `labs.html` | + `pages/labs.js` | request, works |

> **Load order is a contract.** `i18n.js` → `routing.js` → `assistant.js` (which runs `applyLanguage()` at load), `matcher.js` before `assistant.js`, `ultimate.js` before recruiter/palette/ajoop-nav. Page modules are *spliced* via `INSERT_BEFORE`, not appended. `qa:runtime` asserts all of it.
>
> **Never add `<script src="js/…">` to a page.** The manifest owns load order and QA fails on a direct reference.
>
> **After changing `project-detail.html` script tags or its body marker:** run `npm run generate:projects`.
>
> **Inline handlers:** three pages use `onclick="openDrivePreviews()"`, which only resolves while `js/core/shell.js` stays in COMMON. QA asserts that pairing.

---

## Accessibility & responsive (BRIEF 04)

> ~~Skip link on 5 of 19 pages; 3 `aria-label` warnings; page-level overflow at 320 px.~~
> See [`css-accessibility-architecture.md`](css-accessibility-architecture.md).

Covered automatically:

```bash
npm run qa:css && npm run qa:a11y:static && npm run qa:html
```

### Global

- [ ] Skip link is the first Tab stop and becomes visible — ✅ *verified by keyboard*
- [ ] Skip link moves focus to `#main-content` — ✅ *verified: bypasses 15 header controls*
- [ ] Skip link present on all pages — ✅ *44/44 (19 authored + 25 generated)*
- [ ] `<main id="main-content" tabindex="-1">` on every page — ✅ *asserted*
- [ ] Visible keyboard focus on interactive controls — ✅ *verified*
- [ ] Light-theme focus visible — ring uses `var(--brand)`, which is theme-scoped
- [ ] Dark-theme focus visible — ✅ *verified*
- [ ] Mobile nav keyboard usable
- [ ] No page-level overflow at 320 px — ✅ *verified on 11 pages incl. a generated route*
- [ ] No page-level overflow at 375 px — ✅ *verified*
- [ ] Reduced motion honored — ✅ *site-wide; `.reveal` forced visible so nothing stays hidden*
- [ ] Touch targets ≈44 px at ≤820 px — ✅ *primary controls*

### Modals

- [ ] Focus enters the dialog — ✅ *verified (certificate modal)*
- [ ] Tab stays contained — ✅ *shared `trapFocus`; previously every Tab was forced to the close button*
- [ ] Escape closes — ✅ *verified*
- [ ] Focus returns to trigger — ✅ *verified*
- [ ] Background inert while open — ✅ *verified (header `inert`)*
- [ ] Ajoop / command palette / recruiter still use the shared trap — ✅ *asserted*

### Forms

- [ ] Labels valid — ✅ *asserted*
- [ ] Status region announces (`aria-live="polite"`) — ✅ *asserted*
- [ ] Consent is a real checkbox; honeypot out of tab order — ✅ *asserted*
- [ ] Submit behavior preserved — ✅ *Request QA still 84*

### Games / canvas

- [ ] Each `<canvas>` has a role, a name and fallback content — ✅ *asserted*
- [ ] Game boot unchanged — ✅ *verified, zero console errors*
- [ ] Game rendering unchanged — ✅ *computed-style hashes identical to `7d58e6e`*

### CSS architecture

- [ ] Every page loads `style.css` then `css/a11y.css` — ✅ *asserted, order enforced*
- [ ] Game stylesheets load only on their own page — ✅ *asserted*
- [ ] `case-study.css` only on the 5 case studies — ✅ *asserted*
- [ ] No `overflow-x: hidden` band-aid — ✅ *asserted*
- [ ] Colour tokens exist in both themes — ✅ *asserted*
- [ ] Generated pages inherit the accessibility shell — ✅ *25/25*

> **Visual identity must not change.** The BRIEF 04 split was verified by comparing computed styles against `7d58e6e`: identical element counts and style hashes on all three game pages and the homepage. Re-run that comparison after any further CSS extraction.
>
> **Do not split `style.css` by category.** CSS cascade depends on source order; reordering changes equal-specificity ties. Only namespaced, page-scoped extraction is safe.

---

## Request form

- [ ] `request.html` loads — ✅ *verified*
- [ ] Required-field validation blocks an empty submit (`name`, `email`, `serviceType`, `details`, `consent`) — ✅ *verified: 0 requests dispatched*
- [ ] Unchecked consent blocks submission — ✅ *verified: 0 requests dispatched*
- [ ] Invalid email is rejected by `type="email"`
- [ ] Submit does not crash; button disables and relabels during flight — ✅ *verified*
- [ ] Success path shows the success state and resets the form — ✅ *verified*
- [ ] Error path shows the error state (see the state table below)
- [ ] Honeypot (`company_website`) stays hidden and is not tab-reachable
- [ ] `mailto:` fallback link works
- [ ] Google Form fallback link works
- [ ] Status region announces via `aria-live="polite"`
- [ ] Missing/placeholder endpoint falls back to prefilled `mailto:` with a warning state

> **P1-3 was fixed by BRIEF 00.2 — Request Submission Reliability.**
> ~~Success was not verifiable: `mode: "no-cors"` made an Apps Script `500` resolve exactly like success.~~ The endpoint turned out to be CORS-readable, so `no-cors` was removed. Success now requires a non-opaque response, a 2xx status, parseable JSON, and an explicit `{ ok: true }`.

### Submission result states

Automated coverage:

```bash
npm run qa:request
```

| Scenario | Expected state | Form values |
|---|---|---|
| HTTP 2xx + `{"ok":true}` | **success** | cleared |
| HTTP 500 / 4xx | **error** | preserved |
| HTTP 200 + `{"ok":false}` | **error** | preserved |
| HTTP 200 + malformed / HTML body | **error** | preserved |
| Network failure (`fetch` rejects) | **error** | preserved |
| Timeout (> 20 s) | **error** | preserved |
| Opaque response | **error** — never success | preserved |

- [ ] Confirmed server rejection does **not** show success — ✅ *verified in browser (HTTP 500 → error)*
- [ ] Application rejection (`{ok:false}`) does **not** show success — ✅ *verified in browser*
- [ ] Malformed response does **not** show success — ✅ *verified in browser*
- [ ] Network error does **not** show success — ✅ *verified in browser*
- [ ] Timeout does **not** show success — ✅ *covered by `qa:request` (browser check skipped: 20 s wait)*
- [ ] Failed submission preserves every field including the consent checkbox — ✅ *verified in browser*
- [ ] Confirmed success resets the form — ✅ *verified in browser (only on `{"ok":true}`)*
- [ ] Retry after a failure works (button re-enabled, label restored) — ✅ *verified in browser*
- [ ] Duplicate submits blocked while in flight — ✅ *verified: 3 rapid submits → 1 request*
- [ ] Submit button enters and leaves the pending state (`aria-busy`, disabled, "Sending request...") — ✅ *verified in browser*
- [ ] No `no-cors` false-success regression — ✅ *`qa:request` fails if `no-cors` reappears in executable code*
- [ ] No console errors on `request.html` — ✅ *verified*

> **Endpoint contract.** The deployed Apps Script returns `{ ok: true }` on success and `{ ok: false, error }` on failure, over `Content-Type: application/json` with `Access-Control-Allow-Origin: *` on both the `302` and the final `script.googleusercontent.com` hop. **If that contract changes, the form will correctly start reporting errors.** Re-verify with a safe `GET` probe, which is non-destructive (`doGet` neither writes to the sheet nor sends mail):

```bash
curl -sL "$(grep -o 'https://script.google.com[^\"]*' request-config.js)"
```

> **Do not switch the request to `mode: "no-cors"`** to "fix" a CORS error. That reintroduces P1-3 — silently confirming leads that were never stored. If CORS breaks, fix the endpoint or surface an honest error instead.

---

## SEO

- [ ] All 19 pages have exactly one `<h1>` — ✅ *verified*
- [ ] All 19 pages have a `<title>` — ✅ *verified*
- [ ] All 19 pages have a meta description — ✅ *verified*
- [ ] All 18 indexable pages have a self-referential canonical — ✅ *verified*
- [ ] `404.html` has **no** canonical — ✅ *verified (correct)*
- [ ] `sitemap.xml` lists 17 URLs, all resolving to real files — ✅ *verified*
- [ ] `sitemap.xml` omits only `404.html` and `project-detail.html` — ✅ *verified (both correct)*
- [ ] `games.html` is present in the sitemap — ✅ *verified present*
- [ ] `robots.txt` allows crawling and declares the sitemap — ✅ *verified*
- [ ] `project-detail.html` remains `noindex, follow`
- [ ] Social metadata present where expected (14 coverage warnings at baseline — see the audit §6)
- [ ] JSON-LD parses on the 6 pages that carry it (`index` + 5 case studies)

---

## Accessibility

- [ ] Every `<img>` has an `alt` attribute — ✅ *verified: zero exceptions*
- [ ] No duplicate element IDs on any page — ✅ *verified*
- [ ] Keyboard: full nav reachable by Tab, focus visible
- [ ] Ajoop panel traps focus and closes on `Escape`
- [ ] Case-study gallery modal traps focus and closes on `Escape`
- [ ] `prefers-reduced-motion: reduce` suppresses animation
- [ ] Skip link present on the 5 case-study pages — ✅ *verified*
- [ ] Skip link coverage — **KNOWN BASELINE GAP (P2-2):** only 5 of 19 pages. Absent from the homepage, all three game pages, and every other page. Expected today.
- [ ] Touch targets meet minimum size — UNVERIFIED at baseline
- [ ] Canvas games offer a text or keyboard alternative — UNVERIFIED at baseline

---

## Responsive

- [ ] 320 px: no horizontal overflow — ✅ *verified on homepage*
- [ ] 375 px: no horizontal overflow — ✅ *verified on homepage*
- [ ] 768 px: no horizontal overflow — ✅ *verified on homepage*
- [ ] 1024 px and desktop: no horizontal overflow
- [ ] Hero, cards, modals and long content reflow cleanly at each width
- [ ] Project detail pages reflow cleanly
- [ ] Forms usable at 375 px
- [ ] Sticky/fixed elements do not cover content at small heights
- [ ] `.profile-glow` overflow at 320 px stays clipped (cosmetic, P3-4)

---

## External dependencies

- [ ] Site remains usable if `unpkg.com` fails — icons disappear sitewide; **it is render-blocking in `<head>` on all 19 pages** (P2-6)
- [ ] Site remains readable if Google Fonts fails (system-font fallback)
- [ ] Resume link resolves — UNVERIFIED (no outbound requests made at baseline)
- [ ] External project links resolve — UNVERIFIED

---

## Post-change smoke test

Minimum pass after touching `legacy-script.js`, `style.css` or `script.js` — all three load on **every** page, so any edit is a sitewide edit:

1. `node scripts/site-audit.mjs` → exit `0`
2. `npm run qa` → passes
3. Load `index.html`, `works.html`, `games.html` and all three game pages → zero console errors
4. Toggle theme and language on two pages; reload; confirm both persist
5. Open Ajoop, the Command Palette and Recruiter Mode on one page
6. `npm run qa:ajoop` → passes; spot-check `SINAMA`, `email` and `hiring` in the live widget
7. `npm run qa:request` → passes; confirm a stubbed failure shows an error and keeps the form populated
8. `npm run qa:projects` and `npm run qa:seo` → pass; open one `/projects/<slug>/` and one legacy `project-detail.html?project=<slug>` and confirm both render
9. Check 375 px for horizontal overflow on one content page and one game page
