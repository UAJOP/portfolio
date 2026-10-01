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

Home/About production composition does not read the accepted English source or
localized route output. `scripts/site-head.mjs` builds a structured head model
from canonical route, locale, meta, profile, and social authorities. Reusable
React server components render the static header and footer from canonical
common messages and route URLs, while React renders the complete `<main>`
element tree from the committed semantic structure contract. The accepted
legacy documents remain validation inputs only. The renderer adds an
invocation-specific client module and serialized main props, and hydrates only
that main in place. The preview template and preview `noindex` contract remain
isolated to `/react-preview/`.

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
main is a deterministic semantic element tree reproduced from the accepted
pre-cutover ref and reviewed in
`data/site/m3-25b-home-about-structure.json`.

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
   contract recorded independently from accepted ref
   `34fdfad01f63004ed10d616a7b061e3996c28150`.
3. New public files are permitted only below `assets-react/` and must be
   attested by the current build invocation.
4. Compatibility stubs, sitemap, unrelated HTML, CSS, assets, 404, project
   shells, and non-migrated routes remain byte-identical.
5. EOL canonicalization applies only to declared text classes. Lone CR,
   non-CRLF byte sequences, and binary files remain byte-exact.

The eight reviewed public runtime deltas are separately exact-pinned to
`4d0e37b496f70d851397d9976b2022350d11edd6`: the four `pack-*-core.js` files,
`js/core/locale.js`, `js/core/i18n-runtime.js`, `js/features/creative.js`, and
`portfolio-v2.js`. The generator requires both explicit historical refs; there
is no accept-current mode.

An eventual baseline-advancement tool must take an explicit accepted commit or
ref, rebuild that historical tree deterministically, expose the precise scope
being advanced, and retain the unchanged-file guard. #25-B does not add an
implicit rebaseline shortcut.

## Blocking gates

- G-61 registers its observer before the module bundle, waits for a
  `useEffect` completion signal from the committed production hydration, then
  settles for two animation frames and a macrotask. All ten documents require
  exact pre/post main markup, every descendant node identity, every element
  attribute map, zero mutation records, and no console, page, recoverable React,
  or hydration diagnostics. Negative controls cover no start, no signal,
  descendant replacement, attribute mutation, and recoverable hydration error.
  It also exercises mobile navigation with Escape/focus restoration, theme,
  language, Recruiter Mode, Command Palette, and the AJOOP launcher.
- G-62 compares head, visible text, tag sequence, complete decoded attribute
  maps, localization, html/body, header, main, and footer for all ten accepted legacy/React
  pairs. The head contract separately retains complete parsed JSON-LD objects,
  executable inline-script hashes, script order, metadata, canonical and
  alternate links, and stylesheet order. Missing, duplicate, malformed or
  changed JSON-LD and a changed theme bootstrap are negative controls. Its
  unexplained contract difference must be empty.
- Route-aware artifact parity pins every untouched file and permits only the
  documented migration set plus the attested namespaced client bundle.
- G-63 records raw/gzip client bytes, emitted document bytes, hydration payload
  bytes, and the complete added first-party JavaScript cost under explicit
  ceilings.
- `qa:m3:artifact` runs route HTTP, HTML, locale-leakage, and static
  accessibility checks against the emitted mixed `dist-site`; G-62 covers its
  Home/About SEO/head parity. Site Preflight serves this artifact to Pa11y and
  Lighthouse, and Lighthouse's static root is `dist-site`.
- Manual visual review captures all ten routes at desktop/mobile and dark/light. It
  requires identical dimensions and accepts at most 2% antialias-affected
  pixels with whole-image mean channel delta at most 0.1/255; layout, missing-image,
  color, or substantive rendering drift fails. It is review evidence, not a
  blocking CI claim.

Route ownership may remain `react` only while these gates and the existing
production QA chain pass.

## Adversarial-closeout follow-ups

- The accepted Turkish `home.supporting.mergeRush.body` source at
  `34fdfad` contains literal `&#39;` sequences; historical `tr/index.html`
  consequently emits visible `workflow&amp;#39;lar`-style double encoding.
  This pass leaves the canonical message and accepted parity unchanged. A
  controlled content-correction pass should replace those sequences with
  literal apostrophes and add a semantic-message entity detector through an
  explicit audited content delta, never by rebasing G-62 on current output.
- The accepted About resume button has an inline `openDrivePreviews()`
  fallback; the React document owns the equivalent handler only after
  hydration. Restoring the inline attribute would create competing native and
  delegated handlers or an SSR/client attribute mismatch, so it is recorded
  for a dedicated semantic fallback design instead of weakening G-61/G-62.
- Hardcoded shell labels/URLs in the retained legacy modules, hydration payload
  fields not consumed by `ProductionMain`, and the repository-adjacent SSR
  temporary-directory placement remain technical follow-ups. None caused a
  demonstrated correctness failure in #25-B, and this closeout does not expand
  into legacy deletion, payload redesign, or performance work.
