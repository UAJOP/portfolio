# Master 3 #25-B — Home/About production React cutover

## Scope and authority

The accepted Master 2B production artifact remains the content, visual, SEO,
accessibility, and runtime authority. This phase changes ownership only for the
`home` and `about` route families. It does not redesign either page and it does
not start Works/Games, case-study, Recruiter, Command Palette, AJOOP, or game
migrations.

The ten React-owned documents are:

- `/`, `/tr/`, `/de/`, `/es/`, `/fr/`
- `/about/`, `/tr/about/`, `/de/about/`, `/es/about/`, `/fr/about/`

Every other route remains legacy-owned.

## Production build and document contract

`build-production-site.mjs` creates an invocation-scoped temporary React output
directory, calls the production Vite client and SSR builds, then merges their
attested output into the legacy artifact. The production Vite base is `/`, the
client bundle is emitted only below `assets-react/`, source maps are disabled,
and no repository-level production build directory is reused.

The accepted localized legacy document supplies the head, header, footer,
common scripts, and stylesheet order. The production renderer replaces only
the document's `<main>` markup with static React SSR, adds an invocation-specific
client module and serialized main props, and hydrates that main in place. The
preview template and preview `noindex` contract remain isolated to
`/react-preview/`.

## Data and i18n authority

`data/i18n/home-about-semantic-keys.json` maps the accepted Home/About source
bindings to stable semantic keys. The same keys exist in all five common locale
catalogs, and every value was promoted from already accepted localized page
output. Missing semantic copy fails generation; React has no second catalog and
does not fall back to English for DE, ES, or FR.

Build-log translations are addressed as `buildLogById.<stable-id>.*` rather
than by array position. Canonical `build-log.json` still owns visible order.
The promotion gate proves all ten legacy documents byte-identical before and
after promotion.

## Hydration and legacy runtime boundary

`<main data-react-main>` is the only hydration root. Header and footer are
static production markup and remain under the common legacy runtime. The React
main is a deterministic list of accepted top-level blocks; their accepted
inner production markup remains opaque during this first parity cutover.

The common runtime continues to own mobile navigation, localized URL
navigation, theme, Recruiter Mode, Command Palette, AJOOP, the easter egg, and
the footer year. It does not translate, image-optimize, or rewrite page copy
inside the hydrated main. Home build-log markup is generated statically from
canonical data, and `portfolio-v2.js` explicitly skips React-owned build logs
and compatibility copy. Recruiter triggers inside Home retain their existing
event behavior; interaction state remains legacy-owned until #27, without a
second React listener or duplicate drawer.

## Route-aware frozen-artifact contract

The accepted #25-A artifact is always rebuilt from the explicit historical ref
recorded in the parity manifest. There is no command that accepts the current
working tree as a new baseline.

The final artifact is partitioned as follows:

1. All #25-A files except the ten migrated documents and explicitly reviewed
   generated/runtime files remain byte-pinned.
2. The ten migrated documents must pass the Home/About semantic cutover
   contract against their accepted legacy equivalents.
3. New public files are permitted only below `assets-react/` and must be
   attested by the current build invocation.
4. Compatibility stubs, sitemap, unrelated HTML, CSS, assets, 404, project
   shells, and non-migrated routes remain byte-identical.
5. EOL canonicalization applies only to declared text classes. Lone CR,
   non-CRLF byte sequences, and binary files remain byte-exact.

An eventual baseline-advancement tool must take an explicit accepted commit or
ref, rebuild that historical tree deterministically, expose the precise scope
being advanced, and retain the unchanged-file guard. #25-B does not add an
implicit rebaseline shortcut.

## Blocking gates

- G-61 loads all ten documents in a browser and requires no console, page,
  React, or hydration diagnostics; it also proves main-node identity survives
  hydration.
- G-62 compares head, visible text, tag sequence, important attributes,
  localization, header, main, and footer for all ten accepted legacy/React
  pairs. Its unexplained contract difference must be empty.
- Route-aware artifact parity pins every untouched file and permits only the
  documented migration set plus the attested namespaced client bundle.
- Visual parity captures all ten routes at desktop/mobile and dark/light. It
  requires identical dimensions and accepts at most 2% antialias-affected
  pixels with whole-image mean channel delta at most 0.1/255; layout, missing-image,
  color, or substantive rendering drift fails.

Route ownership may remain `react` only while these gates and the existing
production QA chain pass.
