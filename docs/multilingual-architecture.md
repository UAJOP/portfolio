# kaanbalci.com Multilingual Architecture

## Status

Multilingual Foundation V1 keeps production static and serverless while replacing the historical EN/TR-only language state with one N-locale contract.

Production locales in V1:

- `en` — active, default
- `tr` — active

Planned but intentionally inactive:

- `de` — Deutsch
- `es` — Español
- `fr` — Français

Inactive locales are configuration only. They are not selectable, do not create URLs, do not appear in the sitemap and do not emit `hreflang`.

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

V1 does **not** claim multilingual crawlable SEO.

There are no `/tr/`, `/de/`, `/es/` or `/fr/` static route trees yet, so V1 emits no `hreflang` entries and adds no localized sitemap URLs. JavaScript language switching alone is not presented to search engines as separate localized pages.

The existing English canonical URLs remain canonical until real localized static routes ship.

## QA

`npm run qa:i18n` is blocking and is included in `npm run qa` and Site Preflight.

It guards, among other things:

- one default locale
- active EN/TR
- inactive DE/ES/FR
- active UI translation parity
- generated registry/bootstrap parity
- single storage owner
- single document-language writer
- parser-blocking bootstrap on all runtime pages
- no fake `hreflang`
- no inactive locale selector options
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

## BRIEF 09C

The next language-pack phase can add Deutsch, Español and Français without redesigning:

- locale state
- persistence
- browser detection
- selector architecture
- project localized-value resolver
- first-paint bootstrap
- event/subscriber model
- QA ownership rules

09C should primarily add reviewed translation data, localized static routes, localized metadata, `hreflang` and sitemap entries. If those additions require another language-state architecture, this foundation has regressed.

## React preview

The isolated React/Vite preview retains its own preference context because it is not production runtime. It is deliberately outside the static production locale authority until a future explicit migration decision. Production pages must not copy that independent state model.
