# kaanbalci.com Multilingual Architecture

## Status

Multilingual Foundation V1 keeps production static and serverless while replacing the historical EN/TR-only language state with one N-locale contract.

Production locales:

- `en` — active, default
- `tr` — active
- `de` — active
- `es` — active
- `fr` — active

English owns the unprefixed canonical tree. Turkish, German, Spanish and French
use `/tr/`, `/de/`, `/es/` and `/fr/` respectively; all five participate in the
production selector, sitemap and reciprocal `hreflang` graph.

## Canonical locale registry

`data/i18n/locales.json` is the locale source of truth. It owns:

- locale id
- English label
- native label
- active/inactive state
- default state
- text direction
- the existing `kaanbalci-site-language` preference key

`data/i18n/ui.json` contains stable-key UI copy for core shell behavior. `data/i18n/glossary.json` defines protected product, technology and career terminology whose canonical casing must not be mutated by locale-sensitive CSS casing.

`npm run i18n:generate` deterministically produces:

- `i18n-data.js` — runtime registry/UI/glossary artifact
- `js/core/locale-bootstrap.js` — tiny parser-blocking first-paint bootstrap

Generated files are committed and guarded by `npm run qa:i18n`.

## Single locale authority

`js/core/locale.js` owns runtime locale state. Features consume:

- `getCurrentLocale()`
- `setCurrentLocale()`
- `getActiveLocales()`
- `getNextActiveLocale()`
- `getLocalizedValue()`
- `getLocalizedCollection()`
- `getUiText()`
- `getI18nText()` for explicit legacy compatibility
- `subscribeSiteLocale()`

No production feature may independently read/write the site-language storage key or assign `document.documentElement.lang`.

The older `currentSiteLanguage` binding and `applyLanguage()` function remain only as compatibility entry points for existing modules. They are fed by the central locale authority rather than owning state themselves.

## Locale resolution priority

V1 resolves the initial locale in this order:

1. Future explicit localized URL locale, when real localized routes exist
2. Valid saved preference
3. First matching **active** browser language
4. Default locale (`en`)

V1 has no localized path prefix yet, so step 1 is intentionally dormant.

Examples:

- saved `tr` + browser `en-US` -> `tr`
- saved `en` + browser `tr-TR` -> `en`
- no saved value + browser `tr-TR` -> `tr`
- no saved value + browser `de-DE` -> `en` because `de` is inactive
- invalid saved `xx` -> browser/default resolution

Only explicit user selection is persisted. Browser detection is not rewritten into storage.

## First paint

Static root HTML remains English. For a saved/detected non-default active locale, `locale-bootstrap.js` runs synchronously in `<head>` before `<body>` is parsed. It sets the locale attributes and marks the document `data-locale-pending="true"`.

CSS temporarily hides body content while the already-local translation data is applied. `js/core/i18n.js` then marks the locale ready and releases the page.

There is no network translation request and no API dependency. A safety timer restores readable English if the main runtime fails before completing language application, preventing an indefinitely blank document or a Turkish `lang` attribute over English copy.

Localized static routes planned for the language-pack phase remove this compatibility compromise entirely.

## Language selector

Historical `EN` / `TR` buttons are treated as serverless fallback markup. `js/core/locale.js` upgrades each `.lang-switch` into one registry-driven selector at runtime.

Rules:

- native language names, never country flags
- only `active: true` locales render
- desktop and mobile share the same registry and state
- keyboard-native `<select>` semantics are used instead of a custom ARIA menu
- adding an active locale does not require changing selector markup

## Localized portfolio data

Language-neutral facts remain stored once:

- ids/slugs
- years
- stacks
- URLs
- image paths
- status identifiers where applicable

Localized content continues to use locale-keyed values such as:

```json
{
  "en": "...",
  "tr": "..."
}
```

Renderers use `getLocalizedValue()` or `getLocalizedCollection()` rather than hard-coding EN/TR state ownership. The resolver is already N-locale capable and falls back defensively to the default locale.

Fallback is a runtime safety net, not an acceptance criterion: active-locale gaps are QA failures.

## Existing phrase dictionaries

`js/core/i18n.js` still contains the historical English-phrase -> Turkish compatibility dictionary. Removing all phrase-keyed translations in one release would create excessive content churn.

This is an explicit compatibility boundary:

- existing authored copy may continue using it
- locale ownership no longer lives there
- new core UI should use stable keys from `data/i18n/ui.json`
- future locale packs may temporarily map existing English compatibility phrases without feature-code changes
- the compatibility surface must not grow through new per-locale HTML attributes

Existing `data-pv2-en` / `data-pv2-tr` markup is similarly treated as compatibility input. `portfolio-v2.js` routes it through the central locale resolver and future compatibility lookup. New `data-pv2-de`, `data-pv2-es`, etc. are forbidden by QA.

## Dynamic surfaces

Locale changes notify subscribers through the central contract. Existing open/runtime surfaces are rerendered without requiring a reload:

- Recruiter Mode
- Ajoop
- Command Palette
- Request form status copy
- canonical/legacy project details
- Portfolio V2 content
- Career Adventure
- AI Flow Puzzle
- Joyday Paint
- case-study translation surfaces
- theme/navigation accessibility labels

The games no longer read the site-language localStorage key or assign the document language themselves.

## Terminology and Turkish casing

Turkish locale-aware uppercase can turn English technical words into strings such as `ENGİNEER`, `GİTHUB` or `JAVASCRİPT` when CSS `text-transform: uppercase` inherits `lang="tr"`.

`data/i18n/glossary.json` marks canonical protected terms. The presentation layer detects protected terms only on elements that actually apply text transforms and adds `data-preserve-case`, disabling locale-sensitive mutation without changing the page language or screen-reader semantics.

This is a general terminology guard, not a one-string `ENGINEER` patch.

## SEO boundary

The production site exposes crawlable static route trees for English, Turkish,
German, Spanish and French. Each indexable document has a same-locale canonical,
reciprocal alternates for all five locales, and `x-default` pointing to the
unprefixed English equivalent. The sitemap contains the same five-locale route
matrix; 404 and legacy compatibility documents remain excluded.

## QA

`npm run qa:i18n` is blocking and is included in `npm run qa` and Site Preflight.

It guards, among other things:

- one default locale
- active EN/TR/DE/ES/FR
- active UI translation parity
- generated registry/bootstrap parity
- single storage owner
- single document-language writer
- parser-blocking bootstrap on all runtime pages
- reciprocal, existing-route `hreflang`
- exactly the five active locale selector options
- no new per-locale `data-pv2-*` attributes
- active-locale coverage in canonical portfolio JSON
- protected terminology and Turkish-casing regressions
- central locale use in standalone games/case studies
- runtime load order
- selector and first-paint CSS contracts

## Adding a new language

A future language must move through these stages in order:

1. Add the locale to `data/i18n/locales.json` as `active: false`.
2. Add and review its UI/content translation pack.
3. Complete canonical project/profile/build/lab/evidence translation coverage.
4. Complete dynamic-surface translations (Ajoop, Recruiter Mode, games and case studies).
5. Run spelling/terminology review and `npm run qa:i18n`.
6. Generate real localized static routes and localized metadata.
7. Add correct canonical/alternate `hreflang` relationships and localized sitemap URLs.
8. Browser-test the new locale on desktop/mobile and dark/light.
9. Only after all checks pass, change the locale to `active: true`.

A language is therefore either fully active or not exposed at all.

## Localized static routes (BRIEF 09C)

V1 had no crawlable localized URLs. V2 generates a real document per (locale,
route):

```
English    /            /works.html            /projects/<slug>/
Turkish    /tr/         /tr/works.html         /tr/projects/<slug>/
German     /de/         /de/works.html         /de/projects/<slug>/
Spanish    /es/         …
French     /fr/         …
```

English keeps the unprefixed root. `/en/` does not exist and `qa:i18n` fails if
it ever appears. The inventory is 42 indexable English routes (17 authored
pages + 25 canonical projects) plus two companion surfaces — `404.html` and the
legacy `project-detail.html` shell — which are localized for readers but never
given SEO treatment.

### The URL is the locale authority

This is the behavioural change V1 deferred. A page served from a localized
route **is** that locale. Neither a saved preference nor a browser language may
override it, because canonical and `hreflang` promise search engines that
`/de/works.html` is the German page.

Resolution order:

1. The route's own locale — absolute
2. Saved preference (active locales only)
3. First matching active browser language
4. Default locale

Steps 2–4 only run on a page that declares no route locale. Every generated
page declares one on `<html data-route-locale>`, and every authored English page
now declares `data-route-locale="en"`, so:

- a German browser opening `/` gets **English**, and is not redirected
- a reader with `tr` saved who opens `/works.html` gets **English**
- a reader who opens `/fr/about.html` with `de` saved gets **French**

Preference and browser detection now only influence where the language selector
takes you, never what the current URL renders as.

### Route mapping

`js/core/locale-routes.js` owns the single answer to *current route + target
locale = equivalent localized route*. `scripts/generate-localized-routes.mjs`
evaluates that same production file in a sandbox, so generation and runtime
cannot disagree about what a localized route is.

It handles the home route, authored `.html` pages, case studies, game pages,
canonical `/projects/<slug>/`, the query-string legacy shell, hash fragments and
safe search parameters. Locale prefixes cannot stack — `/tr/de/works.html`
collapses rather than growing. Fragments survive a language switch; tracking
parameters do not. The legacy `project-detail.html?project=<slug>` shell maps
onto the canonical `/{locale}/projects/<slug>/` route rather than becoming a
query-string duplicate in five languages.

Only paths in the known route inventory take a locale prefix. Assets keep one
root-relative identity: there is no `/de/assets/`, and inventing one would 404
every image on a localized page.

### Two depths, not one

A generated page declares both:

- `data-site-root` — reaches the repository root, where assets live
- `data-locale-root` — reaches the locale's own root, where sibling pages live

On `/de/works.html` these are `../` and ``; on `/de/projects/slug/`,
`../../../` and `../../`. Conflating them is how the BRIEF 09A gallery-path bug
happened, so `qa:i18n` asserts both at every depth and resolves every `src` and
`href` in every generated document against the filesystem.

### The language selector navigates

The selector is no longer a runtime copy switch. Selecting a language persists
it and navigates to the equivalent localized route, falling back to an in-place
switch only if the current page has no localized equivalent, so switching is
never a dead end. It opts out of back/forward form restoration, because browsers
reinstate `<select>` values after scripts run and would otherwise show the
language the reader navigated away to.

## Locale packs

Copy lives under `data/i18n/packs/<locale>/`, split by domain:

| Domain | Contents |
| --- | --- |
| `ui` | stable-key shell copy |
| `pages` | authored page copy: text, attribute and title dictionaries |
| `case-studies` | per-case-study key maps |
| `projects` | per-slug overlays for the 25 canonical projects |
| `content` | remaining canonical copy, as flat registry paths |
| `dynamic` | runtime feature surfaces |
| `meta` | per-route page metadata |

**Packs carry copy, never project truth.** Slugs, URLs, years, stacks, image
paths, analytics ids, command ids and Ajoop intent ids are stripped; the runtime
merges pack copy over the canonical English structure, so an omitted key keeps
its canonical value. That is what keeps intent matching language-neutral: a
translation can change what a quick action says, never what it matches.

`data/i18n/source/` holds generated English snapshots of the two surfaces whose
source lives in code rather than data — dynamic feature copy and page metadata.
English stays canonical where it already is; the snapshots exist so packs have a
stable key space and `qa:i18n` can prove coverage without parsing JavaScript.

### Turkish is derived, not copied

Complete Turkish copy already existed across the runtime. Rather than duplicate
it into a pack and create a second source of Turkish truth, six of the seven
domains are **derived** from the existing sources by `npm run i18n:packs` and
byte-checked by `qa:i18n`. Only `meta` is authored for Turkish, because
localized page metadata is a new surface with no prior source.

German, Spanish and French packs are authored in full.

### Adding a locale needs no feature-code change

Four dynamic surfaces already resolved through `getLocalizedCollection()`; they
now pass a pack namespace, which is a one-line change each. The three games and
the case-study runtime do the same. No feature module contains a `de:`, `es:` or
`fr:` branch, and `qa:i18n` fails if one appears.

## Payload

Five locales must not mean every reader downloads five translations.

Packs are **scope-split**, mirroring the page-scoped module manifest in
`script.js`: a page loads `core` plus whatever its page type renders
(`projects`, `case-studies`, `games`, `request`). English pages load **no pack
at all**, because English is the source language.

`pages.text` travels in reduced form. A generated localized page is already
translated in HTML, so the text-node walker never fires there; only the strings
the runtime looks up *after* render — inline phrase pairs, compat attribute
pairs, project stack labels and the root 404's own copy — need to ship. That is
197 phrases instead of 869.

Measured, gzipped:

| Page | Before 09C | After 09C |
| --- | --- | --- |
| English, any page | baseline | **+10 KB** (route mapper, expanded registry, locale authority) |
| Turkish home | — | baseline + 10 KB + 14.7 KB core pack |
| Turkish works | — | baseline + 10 KB + 22.1 KB (core + projects) |
| Turkish case study | — | baseline + 10 KB + 27.9 KB (core + case-studies) |

Without the scope split a Turkish page would carry 40.8 KB gzipped of copy
regardless of what it renders.

The +10 KB on English pages is a real cost for readers who gain nothing yet. It
is more than offset by an available follow-up: `js/core/i18n.js` still ships
25.6 KB gzipped of Turkish phrase dictionary to every page, and under the
URL-authority contract those dictionaries can no longer fire at runtime. Moving
them to a generator-only data file is tracked separately.

## 404 locale recovery

GitHub Pages serves the root `404.html` at whatever URL failed, at any depth.
That one document therefore:

- declares `data-route-locale-from-path` instead of a fixed locale, so the
  bootstrap derives the locale from the failed pathname — `/de/typo` renders
  German recovery
- loads its stylesheet, scripts and assets **root-absolutely**, because a
  relative path would resolve against the broken URL
- rewrites its recovery links to root-absolute localized URLs at runtime

It stays `noindex` and out of the sitemap. No false canonical localized page is
created for a missing route.

## Activation gate

Generation and exposure are separate switches, in
`data/i18n/locales.json` under `localizedRoutes`:

- `generate` — which locales get a static route tree built
- `indexable` — which are advertised through `robots`, `hreflang` and the
  sitemap

In production both `generate` and `indexable` contain
`["tr", "de", "es", "fr"]`. The four localized trees are therefore
indexable, present in the sitemap, connected by reciprocal `hreflang`, and
reachable from the five-language selector.

A locale below 100% coverage produces **no routes at all** — the generator skips
it and `qa:i18n` fails. There is no half state: a locale is complete or it is
not there.

### hreflang and sitemap, when activated

Adding a locale to `indexable` makes every indexable route in that locale emit
alternates for English plus every indexable locale, plus `x-default` pointing at
the English equivalent. `qa:i18n` verifies that every advertised alternate
resolves to a document that actually exists, that no inactive locale is
advertised, and that the sitemap holds exactly `routes × indexable locales`
URLs with no duplicates, no 404, no legacy shell and no query strings.

With all five locales active that is 42 × 5 = 210 URLs.

## Commands

```
npm run i18n:extract    # refresh English source snapshots
npm run i18n:packs      # re-derive the Turkish pack
npm run i18n:generate   # registry, bootstrap and runtime packs
npm run i18n:routes     # localized static route trees and sitemap
npm run i18n:build      # all four, in order
npm run i18n:coverage   # per-locale, per-domain coverage table
npm run qa:i18n         # blocking contracts
```

Every generator supports `--check`, so CI can prove the committed output is in
step without writing anything. Generated localized routes are never hand-edited;
`qa:i18n` fails on any file in a locale tree that lacks the generator marker or
is not part of the planned route matrix.

## Adding a new language

1. Add the locale to `data/i18n/locales.json` as `active: false`.
2. Author `data/i18n/packs/<locale>/` until `npm run i18n:coverage` reads 100%.
3. Add it to `localizedRoutes.generate` and run `npm run i18n:build`.
4. Review the generated routes and the copy in `docs/language-pack-review-v1.md`.
5. Browser-test desktop and mobile, dark and light.
6. Set `active: true` and add it to `localizedRoutes.indexable`.
7. Regenerate; `hreflang` and the sitemap follow automatically.

A language is fully active or not exposed at all.

## React preview

Unchanged. The isolated React/Vite preview keeps its own preference context
because it is not production runtime, and stays outside the static production
locale authority until an explicit migration decision. Production pages must not
copy that independent state model.
