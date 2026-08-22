# Portfolio QA Baseline

Current measured baseline, captured on the `fix/portfolio-consistency-qa-v1` branch after the canonical-footer and QA-hardening pass.

All numbers below are actual local runs of the committed checks against the pinned toolchain in `package-lock.json`. Lighthouse performance is reported from a local run and is CDN-bound; see the note under Lighthouse.

## Summary

| Check | Result |
|---|---|
| JavaScript syntax | 16/16 files pass |
| Portfolio consistency guard | pass |
| Internal links | 0 broken across 453 references |
| HTML validation | **0 errors**, 3 accepted warnings |
| Spelling | 0 issues across 25 files |
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

Accessibility, best practices and SEO score **100 on all 11 configured pages**. Cumulative layout shift is ≤ 0.017 everywhere.

Local performance measures 62–67. That is a property of the measurement environment, not a regression: a controlled experiment during the V2 production audit showed that removing the two third-party stylesheets (Google Fonts, unpkg Boxicons) moves `index.html` from 62 to 92, while removing the entire V2 JavaScript runtime moves it only from 62 to 67. Render-blocking is four CSS files and zero JS. GitHub Actions runners report noticeably higher performance for the same commits. Self-hosting fonts and icons is deliberately deferred to a dedicated asset/performance pass.

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
