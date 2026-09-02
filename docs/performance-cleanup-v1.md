# kaanbalci.com V1 — Runtime Performance Cleanup

## Scope

This cleanup removes the historical EN/TR translation dictionary from the browser's common runtime path without changing translation copy, locale URLs, SEO, analytics, Request transport, Ajoop matching, or visual design.

It also closes the Algorithmic 3D Labs startup regression found during live production review.

## Baseline

Before this pass, `js/core/i18n.js` served two jobs at once:

1. historical EN/TR dictionary source for build/compatibility tooling;
2. browser language-presentation runtime.

Because the file lived in `script.js` `COMMON`, every runtime page paid for the full historical dictionary.

Measured in GitHub CI:

| Resource | Raw | Gzip |
| --- | ---: | ---: |
| Historical `js/core/i18n.js` | 89,947 B | 25,870 B |

The dictionary contains roughly 700 historical phrase/attribute entries. Most user-facing translation delivery now comes from the five-language static locale-pack architecture created by BRIEF 09B/09C.

## Findings

The legacy dictionary is still useful as a **build-time compatibility source**: catalog/pack tooling derives historical Turkish coverage from it. Deleting it outright would couple a performance cleanup to a large build-tool migration.

It is no longer necessary as common browser payload.

The browser already has scoped locale packs and central helpers such as `getPackPhrase()` / `getPackAttribute()`, so presentation logic can operate without the historical global dictionary.

## Changes

### Browser runtime split

`js/core/i18n-runtime.js` now owns browser presentation logic only.

The historical `js/core/i18n.js` remains in the repository as build-time input but is absent from `COMMON` and every page scope.

### Scoped project labels

Project display-label translation now resolves through the loaded locale pack instead of the historical `i18nTranslations` global.

### Deterministic performance gate

`scripts/qa-performance-budget.mjs` blocks regressions by checking:

- compact browser runtime byte budgets;
- historical dictionary exclusion from common/page-scoped loading;
- common i18n-chain raw/gzip budgets;
- minimum real gzip savings;
- single-locale pack loading;
- page-scope split preservation.

The performance gate runs from both `npm run qa` and GitHub Site Preflight.

## Before / After

GitHub CI measurement:

| Resource / path | Before Raw | Before Gzip | After Raw | After Gzip | Delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| Common i18n presentation file | 89,947 B | 25,870 B | 5,941 B | 1,925 B | **-23,945 B gzip** |
| Common i18n chain | — | — | 45,004 B | 15,035 B | within blocking budget |

The old 89,947-byte source still exists in Git for build tooling, but the browser no longer requests it through the page-aware runtime manifest.

This is a real common-load reduction, not a filename move: the new performance QA fails if the legacy source re-enters either `COMMON` or a page scope.

## Locale-pack loading

The existing page-aware pack contract is preserved:

- English pages load no non-English locale pack.
- A localized page loads exactly its current locale.
- Home/common pages do not load case-study/project/game scopes they do not render.
- One locale never eagerly loads the other locale packs.

## Labs Algorithmic 3D reliability

Live review found the 3D Canvas stage blank even though the hint and canvas shell rendered.

Root cause:

- `js/features/creative.js` is a COMMON module and tried to call `setupAlgorithmic3DLab()` before the page-scoped `js/pages/labs.js` module had loaded.
- `labs.js` defined the implementation later but had no startup invocation of its own.

Fix:

- `js/pages/labs.js` now initializes the 3D lab after defining it.
- `creative.js` no longer owns cross-module startup.
- runtime QA requires Labs to load its page-scoped module, requires self-initialization, and forbids the old COMMON-module call.

This keeps the ~250-line Canvas/math implementation page-scoped while making lifecycle ownership explicit.

## Remaining debt

### Historical dictionary as build input

`js/core/i18n.js` remains an 89 KB source file because build tooling still derives legacy Turkish compatibility data from it. It is no longer a browser-performance issue. A future tooling cleanup may migrate those source dictionaries into canonical data and delete the historical file entirely, but that is not required for V1 runtime performance.

### External dependencies

Google Fonts and Boxicons remain external dependencies. They should be evaluated only if real measurement shows meaningful user impact; this V1 pass intentionally avoids dependency churn.

### Broader UX polish

Spacing, cards, header presentation, fixed-widget positioning and other visible polish are explicitly separate from this runtime cleanup.

## QA / release gate

The release is accepted only when:

- multilingual QA stays green;
- deterministic performance budgets stay green;
- runtime/module ownership QA stays green;
- HTML/link/accessibility checks stay green;
- Labs remains page-scoped and self-booting;
- production Pages deployment succeeds.
