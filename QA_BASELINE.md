# Portfolio QA Baseline

Current measured baseline, extended on `perf/asset-lcp-v1` after the canonical-footer, QA-hardening and Asset/LCP V1 passes.

All numbers below are actual local runs of the committed checks against the pinned toolchain in `package-lock.json`. Lighthouse performance is reported from a local run and is CDN-bound; see the note under Lighthouse.

## Summary

| Check | Result |
|---|---|
| JavaScript syntax | 17/17 files pass |
| Portfolio consistency guard | pass |
| Asset performance policy | pass: 63 references, 81 intrinsic image dimensions, critical budgets met |
| Internal links | 0 broken across 453 references |
| HTML validation | **0 errors**, 3 accepted warnings |
| Spelling | 0 issues across 26 files |
| Pa11y (WCAG 2 AA, 390×844) | **11/11 pages pass, 0 errors** |
| Lighthouse accessibility / best practices / SEO | **100 / 100 / 100** on all 11 pages |

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
