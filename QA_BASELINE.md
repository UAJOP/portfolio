# Portfolio QA Baseline

Current measured baseline, extended on `feat/shared-shell-json-data-v1` after the canonical-footer, QA-hardening, Asset/LCP V1, React foundation and shared-shell/JSON-data passes.

All numbers below are actual local runs of the committed checks against the pinned toolchain in `package-lock.json`. Lighthouse performance is reported from a local run and is CDN-bound; see the note under Lighthouse.

## Summary

| Check | Result |
|---|---|
| Portfolio data contract | pass: 8 canonical files, generated adapter in step |
| JavaScript syntax | 19/19 files pass |
| Portfolio consistency guard | pass |
| Asset performance policy | pass: 63 references, 81 intrinsic image dimensions, critical budgets met |
| Internal links | 0 broken across 453 references |
| HTML validation | **0 errors**, 3 accepted warnings |
| Spelling | 0 issues across 28 files |
| Pa11y (WCAG 2 AA, 390×844) | **11/11 pages pass, 0 errors** |
| Lighthouse accessibility / best practices / SEO | **100 / 100 / 100** on all 11 pages |
| React foundation build + guard | pass: 3 routes pre-rendered, production isolation verified |
| Pa11y React preview (WCAG 2 AA, 390×844) | **3/3 routes pass, 0 errors** |

## Accessibility

Pa11y CI checks 11 pages at a 390 × 844 mobile viewport against WCAG 2 AA: `index`, `works`, `games`, `sinama-case-study`, `merge-rush-case-study`, `labs`, `now`, `blog`, `single-work`, `request`, `about`. All 11 pass with zero reported issues.

The semantic card cleanup removed simulated `role="link"` cards and restored native anchors, and this pass gave every previously unnamed labelled container a role that supports an accessible name.

## HTML

- **0 structural errors**
- **3 warnings**, all accepted

The three remaining warnings are `aria-label` on `<canvas>` in `adventure.html`, `joyday-paint.html` and `labs.html`. `html-validate` reports these as "strictly allowed but not recommended". `aria-label` is the correct way to name a canvas, so they are kept deliberately rather than suppressed at the rule level.

This is down from 67 warnings before the semantic cleanup (14 `prefer-native-element` from simulated card links, 53 `aria-label-misuse` from labels that browsers silently dropped).

## Links

Internal links are validated deterministically by `npm run qa:links`: 453 internal references, 17 recruiter role deep links, 15 project links and every registry case-study route resolve, with 0 broken. Footer brand links resolve on all 19 pages.

External availability is scanned by Lychee in a separate report-only job, because social platforms rate-limit and block bots.

## Lighthouse

Accessibility, best practices and SEO score **100 on all 11 configured pages**. Targeted Index/About CLS remains 0.000079. The full Lighthouse run still reports the pre-existing Labs CLS value of 0.130 (unchanged from the production baseline); the next-highest value is Merge Rush at 0.01658, also unchanged.

Asset/LCP V1 uses three local LHCI desktop runs per page and compares medians under the same static-server configuration:

| Page | Performance | FCP | LCP | CLS | Image transfer | Total transfer |
|---|---:|---:|---:|---:|---:|---:|
| Index before | 93 | 819 ms | 1,666 ms | 0.000079 | 1,010,286 B | 1,438,157 B |
| Index after | 98 | 840 ms | 931 ms | 0.000079 | 66,798 B | 494,649 B |
| About before | 93 | 857 ms | 1,626 ms | 0.000079 | 1,010,286 B | 1,437,391 B |
| About after | 98 | 820 ms | 912 ms | 0.000079 | 66,798 B | 493,985 B |

The LCP element remains the page heading on both pages. Index FCP changed by +21 ms, which is normal run noise; no FCP improvement is claimed there. Image transfer fell 93.4% and total transfer fell 65.6%. Google Fonts and unpkg Boxicons remain externally hosted and are deliberately deferred to a separate pass.

## Toolchain

QA dependencies are pinned exactly and `package-lock.json` is committed, so the same revision reproduces the same toolchain:

| Package | Version |
|---|---|
| `@cspell/dict-tr-tr` | 3.0.6 |
| `@lhci/cli` | 0.15.1 |
| `cspell` | 10.0.1 |
| `html-validate` | 11.6.2 |
| `pa11y-ci` | 4.1.1 |

CI installs with `npm ci`.

## Enforcement

See [`SITE_PREFLIGHT.md`](SITE_PREFLIGHT.md) for which checks block a merge and which are report-only.

## React migration foundation

Measured on `feat/react-foundation-v1`. These numbers describe the isolated preview, **not** production: `dist-react/` is git-ignored and is never served from `kaanbalci.com`, so none of it is production bundle cost today.

### Build output

| File | Raw | Gzip |
|---|---:|---:|
| `assets/index-[hash].js` | 240,950 B | 76,368 B |
| `assets/index-[hash].css` | 4,983 B | 1,685 B |
| `index.html` (pre-rendered) | 5,176 B | 1,939 B |
| `about/index.html` (pre-rendered) | 5,074 B | 1,932 B |
| `404.html` (pre-rendered) | 4,428 B | 1,654 B |
| **Total** | **260,611 B** (254.5 KB) | **83,578 B** (81.6 KB) |

One JS chunk, one CSS chunk, three HTML files. The JS is essentially React 19 plus React Router 7; the foundation's own code is a small fraction of it.

This is deliberately not compared against the legacy production bundle. The preview renders three placeholder routes and production renders the real site, so any such comparison would be meaningless in both directions.

### Pre-render proof

Each route contains real rendered markup before any JavaScript executes:

| Route | Pre-rendered markup |
|---|---:|
| `/react-preview/` | 3,452 B |
| `/react-preview/about` | 3,343 B |
| `404.html` | 2,784 B |

Every file carries its own `<title>`, `<meta name="description">`, `robots noindex`, and semantic `header` / `nav` / `main` / `footer` markup. `npm run build:react` fails if any route renders under 1 KB, and `npm run qa:react` fails if a file ships an empty `<div id="root"></div>`. Both failure paths were exercised deliberately and confirmed to exit non-zero.

### Hydration

0 errors and 0 React warnings in the browser console across every preview route, including a reload with non-default preferences (TR + light theme) stored, and including `404.html` served at an arbitrary unknown URL.

Theme and language start at their server-rendered defaults and reconcile in an effect after hydration, so the first client render matches the pre-rendered markup exactly. The blocking inline theme script in the document head applies the stored theme to `<html>` before first paint, so colors never flash.

### Routing behavior

| URL | Status | Served |
|---|---|---|
| `/react-preview/` | 200 | pre-rendered home |
| `/react-preview/about` | 200 | pre-rendered about |
| `/react-preview/about/` | 200 | pre-rendered about |
| `/react-preview/does-not-exist` | **404** | pre-rendered NotFound |
| `/react-preview/deep/nested/nope` | **404** | pre-rendered NotFound |

Client-side navigation, browser Back and browser Forward were each confirmed to be real client transitions — a value set on `window` survived them, so no document reload occurred.

The preview server is configured to behave like a static host rather than an SPA server. `vite dev` keeps its SPA fallback, which is a development convenience and is not evidence about production hosting; see `REACT_MIGRATION_PLAN.md` §7.

### Contrast

Every text/background pair in the preview was measured in both themes. Minimum ratio: **4.61:1 light**, **6.06:1 dark**, against a WCAG AA threshold of 4.5:1.

Two failures found during this pass were fixed rather than accepted: the preview badge (2.87:1 on dark) and accent text using `--brand` on the light background (3.94:1). Both now use dedicated tokens.

### Production impact

None. No public page, runtime file or stylesheet changed. The only production-visible edit in this pass is one Build Log entry in `portfolio-data.js`.

Production Lighthouse, measured locally before the change on the same static server:

| Page | Performance | Accessibility | Best practices | SEO | CLS |
|---|---:|---:|---:|---:|---:|
| `index.html` | 95 | 100 | 100 | 100 | 0.000079 |
| `about.html` | 95 | 100 | 100 | 100 | 0.000079 |
| `works.html` | 93 | 100 | 100 | 100 | 0.000079 |
| `labs.html` | 91 | 100 | 100 | 100 | 0.129998 |

The Labs CLS value is the known pre-existing figure recorded in the Asset/LCP V1 pass and is unchanged. Since this pass edits no production page, no production performance change is expected or claimed.

## Shared shell and JSON data foundation (#24)

Measured on `feat/shared-shell-json-data-v1`.

### Data migration parity

The canonical JSON was extracted **programmatically** from the live registry, then composed back and compared to the pre-migration object from baseline `23345d6`:

```
baseline JSON bytes: 17347
composed JSON bytes: 17347
semantic differences: 0
```

Zero differences, **key order included**, before the intentional edits below. The comparison walks values, array lengths, key sets and key order.

Intentional differences after that check:

| Difference | Reason |
|---|---|
| build log gains the #24 entry | this pass, recorded truthfully |
| build log length 8 → 9 | consequence of the above |

Nothing else changed. No wording was "cleaned up" during the migration.

### Generated adapter

| Property | Result |
|---|---|
| Deterministic | byte-identical across repeated runs (27,012 B) |
| Evaluates as classic script | yes |
| `window.KAAN_PORTFOLIO` synchronous | yes |
| Top-level frozen | yes, matching the previous artifact |
| Deep-equals composed JSON | yes |

### Failure injection

Five deliberate regressions, each reverted immediately. All exited non-zero:

| Injected failure | Caught by |
|---|---|
| stale generated `portfolio-data.js` | staleness comparison |
| wrong `primaryTitle` | protected truth check |
| non-canonical social URL | canonical socials check |
| recruiter evidence citing a missing project | reference integrity check |
| malformed JSON | parse check |

### React preview build output

| File | Raw | Gzip |
|---|---:|---:|
| `assets/index-[hash].js` | 263,416 B | 82,849 B |
| `assets/index-[hash].css` | 14,365 B | 3,648 B |
| `assets/kaan-balci-logo-128-[hash].webp` | 16,534 B | — |
| `index.html` (pre-rendered) | 15,061 B | 3,677 B |
| `about/index.html` (pre-rendered) | 8,545 B | 2,777 B |
| `404.html` (pre-rendered) | 6,200 B | 2,126 B |
| **Total** | **324,121 B** (316.5 KB) | **111,639 B** (109.0 KB) |

One JS chunk, one CSS chunk, three HTML files, one imported image.

Against #23, as architecture-cost context only — the preview gained a full design system, a shared shell and real canonical data:

| | #23 | #24 | Δ |
|---|---:|---:|---:|
| JS gzip | 76,368 B | 82,849 B | +6,481 B |
| CSS gzip | 1,685 B | 3,648 B | +1,963 B |
| Pre-rendered markup (home) | 3,452 B | 13,261 B | +9,809 B |

The JS increase is the data layer plus the larger component tree; no dependency was added. This is not production bundle cost — no public page is React.

### Pre-render

| Route | Pre-rendered markup |
|---|---:|
| `/react-preview/` | 13,261 B |
| `/react-preview/about` | 6,800 B |
| `404.html` | 4,518 B |

### Accessibility and contrast

| Check | Result |
|---|---|
| Pa11y production, 11 pages | **11/11, 0 errors** |
| Pa11y React preview, 3 routes | **3/3, 0 errors** |
| Contrast minimum, dark | **5.10:1** |
| Contrast minimum, light | **4.61:1** |

Every text/background pair was measured with alpha compositing against the real backdrop, in both themes, after a genuine page load. Three light-theme near-misses found this way were fixed rather than accepted: the primary action fill (4.33:1), the accent chip (4.43:1) and the warning chip (4.38:1). The light accent and warning tokens were deepened accordingly.

### Production regression

No public page, stylesheet or runtime file changed. Verified in-browser across `index`, `works`, `games`, `labs`, `now`, `sinama-case-study` and `merge-rush-case-study`:

- generated registry boots synchronously and frozen, with 5 projects / 4 recruiter profiles / 9 build checkpoints / 4 labs
- Recruiter Mode renders registry-backed capabilities
- Build Log renders the new #24 entry alongside the existing history
- Labs renders all four entries
- SINAMA Evidence Explorer renders from `sinamaEvidence`
- Command Palette opens
- theme toggle and EN/TR switching behave as before
- 5 canonical footer destinations on every page; 0 broken images; **0 console errors**

Production Lighthouse, same static server:

| Page | Performance | Accessibility | Best practices | SEO |
|---|---:|---:|---:|---:|
| `index.html` | 95 | 100 | 100 | 100 |
| `about.html` | 96 | 100 | 100 | 100 |
| `works.html` | 95 | 100 | 100 | 100 |
| `labs.html` | 98 | 100 | 100 | 100 |

Unchanged within run-to-run noise, as expected — no public page was migrated.
