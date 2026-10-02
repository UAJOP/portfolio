# Master 3 #26 — Works + Games production React ownership

## Accepted authority

- Historical acceptance ref: `24be2f8159a0925dc00f29375ea8740738214df3`.
- Scope: `/works/` and `/games/` in `en`, `tr`, `de`, `es`, and `fr` (10 documents).
- QA never reads git history. `data/site/m3-26-accepted-snapshot.json` holds the ten accepted Works/Games documents verbatim and bundle-normalized hashes of the ten accepted Home/About documents. Each Works/Games document is verified on load against its recorded hash and against the independently accepted #25-A artifact manifest, which already pins the same bytes. The Home/About hashes have no such anchor: they are self-recorded, so the snapshot alone cannot detect a drift re-pinned into it. The Home/About hydration payload is therefore also held to the separately derived #25-B payload contract below. The 24be2f8 state of every other artifact file is the #25-A manifest overridden by the #25-B public delta.
- `m3:26:accepted-snapshot` (maintainer only, needs full history) writes or `--check`s the snapshot from git and an accepted 24be2f8 build.
- `data/site/m3-25b-home-about-payload.json` is the #25-B Home/About payload contract: per document, the SHA-256 of the exact `#react-main-props` payload text and its top-level key order. It holds digests only, no copy. `m3:25b:home-about-payload` (maintainer only, needs full history) derives it by exporting 24be2f8 with `git archive` and running that commit's own production build, never the current renderer, and `--check`s it the same way.
- `qa:m3:works-games:parity` reproduces the generated structure in a temporary directory and byte-compares it with the committed structure before it evaluates emitted documents.

## Ownership boundary

- React owns the complete Works/Games `<main>` subtree, including SSR markup, hydration, filters, catalog search, empty-result state, and card activation.
- The static header and footer remain outside the hydration root. COMMON continues to own theme, mobile navigation, locale switching, Recruiter Mode, Command Palette, and public AJOOP. Dialogs may toggle `inert` / `aria-hidden` on the main container itself and must restore it; COMMON may not touch any React-owned descendant.
- COMMON stand-downs inside `[data-react-main]`: `js/portfolio/works.js` and `js/pages/games.js` catalog initializers; `applyProtectedTermCasing()` in `js/core/i18n-runtime.js`; and `updateUltimateStaticLabels()` in `js/features/ultimate.js`, which previously rewrote the React-rendered search label and placeholder before hydration and again on every Recruiter Mode, Command Palette, or locale refresh.
- Home/About retain the independently accepted #25-B renderer and gates; their emitted documents are byte-identical to 24be2f8 except for the content-addressed React bundle name. Case studies, actual games, project detail bodies, Recruiter Mode, Command Palette, and AJOOP remain outside #26.

## Search audit and decision

The accepted Works/Games runtime inserted `.project-search-wrap` after `.filter-bar`, then mutated card and tier classes for combined category and text matching. Because those nodes live inside `<main>`, leaving the mutation in the legacy runtime would create competing ownership and break exact hydration identity.

#26 therefore renders the same search control during SSR as normal JSX and reproduces the accepted visual hierarchy, matching inputs, category combination, and no-result behavior. The runtime's invalid block-inside-label nesting is replaced by an explicit `for`/`id` association so the emitted HTML remains valid; the field receives the label's typographic context in CSS so its rendering is unchanged.

The input keeps the accepted native `type="search"`. A `role="searchbox"` text input was evaluated and rejected: on the accepted page Escape clears a search field and restores every card, which a text input does not do. React 19 hydrates an input by assigning `element.type = props.type` (`initInput`), which rewrites `search` with itself. G-65 tolerates exactly that one record, only during hydration, only on the catalog search input, and only while old value, final value, and declared type are all `search`.

Search matching is owned by React and is equivalent to the accepted runtime: whitespace-collapsed, trimmed, lower-cased card text (no diacritic folding) and raw destination-attribute substring matching. The generated structure records where the accepted source had whitespace as non-rendering `space` nodes, so card search text equals the accepted `textContent`.

### Search copy authority

Search copy is rendered from exactly the authorities the accepted runtime used (`scripts/m3-works-games-catalog-copy.mjs`); nothing holds a second copy:

- Works: the `ultimate` structured-runtime surface. English and Turkish are the `js/features/ultimate.js` literals (`loadDynamicSurface`); German, Spanish, and French are the authored `data/i18n/packs/{locale}/dynamic.json` overlays (`packs/tr/dynamic.json` is derived from the same literal and checked by `build-locale-packs --check`).
- Games: `getI18nText` phrases. English is the phrase itself; every other locale is the authored phrase-compatibility pack `data/i18n/packs/{locale}/pages.json`, which the runtime consults first.

The accepted German, Spanish, and French pages displayed these pack translations (for example `Nach Projekt, Technologie oder Stichwort suchen …`); there was no English fallback. Missing copy fails the build.

## Card activation

Whole-card navigation follows the accepted per-page contract exactly. On Works, `js/portfolio/works.js` authorized only `data-project-link` (a path is a page route; a bare slug is `/projects/<slug>/`) and sent Works analytics. On Games, `js/pages/games.js` authorized only `data-game-link` and sent no analytics. Every other card, including the Works AI Flow Puzzle card that carries `data-game-link`, is inert. Destinations are localized at build time. Modifier clicks, clicks on nested interactive elements, and clicks with an active text selection do not activate a card.

## Runtime presentation contract

COMMON stands down inside React-owned main, so the attributes it applied to the accepted documents after load are carried by the structure: `decoding="async"` on images (the structural rule from `js/features/creative.js`) and the one protected-term casing marker the accepted runtime set (`works.category.pythonSoftware`, identical in all five locales). The legacy `data-game-card-ready` idempotence marker has no style effect and is not emitted.

## Canonical and localized data

- `data/site/m3-26-works-games-structure.json` is reproducibly generated from the accepted English documents. It binds copy by key or reference only and carries no localized strings.
- Copy resolves through the canonical common message domain (`data/i18n/messages/{locale}/common.json`) via the same production resolver as Home/About; missing copy fails the build.
- `data/i18n/works-games-semantic-keys.json` is the explicit binding of every accepted string: 43 keys the accepted markup already declared (`data-message-key` / `data-message-alt-key`), 12 reused keys for the same page fact or shared copy, 95 promoted `works.*` / `games.*` keys, and 9 canonical project-role bindings. Coincidental matches with Home, About, or Labs copy are intentionally not reused.
- Project roles are project facts. A Works role line renders the localized `works.card.roleLabel` followed by the canonical role: flagships use `data/portfolio/projects.json` plus the `packs/{locale}/content.json` overlay; other projects use `data/portfolio/project-details.json` (via `detailSlug`) plus `packs/{locale}/projects.json`, resolved exactly like generated project pages. AI Flow Puzzle has no project record, so its role line remains an index-only key.
- `data-pv2-en` / `data-pv2-tr` repeat an element's own copy in English and Turkish; they are bound to the element's key or role at a fixed locale and carry no independent copy.
- `scripts/promote-works-games-semantic-keys.mjs` (`m3:works-games:semantic-keys`) is idempotent: it copies promoted values verbatim from the accepted documents, never translates, inserts keys without reordering existing entries, retires keys it previously promoted that are no longer bound, and fails on unbound, double-bound, colliding, or drifted copy. Promoted keys are excluded from the implicit English reverse map used by legacy localized documents.
- Shared keys are listed with their meaning in the manifest's `sharedKeys`: one meaning, one accepted wording per locale. A key is split only when a translation must differ by position.

### Reviewed copy deltas

The owner decided (2026-10-02) that project data is the source of truth for role facts and that Spanish and French render the project-data wording as-is, without a sentence-case rule. That changes exactly twelve role lines on `/es/works/` and `/fr/works/`, recorded in `data/site/m3-26-reviewed-copy-deltas.json` with their authority. Each delta must match exactly once on its document in G-64 and is applied to the accepted page before the differential comparison; no other copy may differ.

## Rendering and delivery

- `data/site/routes.json` assigns only `works` and `games` to the existing production React renderer in addition to Home/About.
- Production continues to emit an invocation-scoped `assets-react/` namespace and merge it into `dist-site` only after legacy generation.
- Catalog-only props (structure, search copy, roles, fixed-locale copy, card destinations) appear only in Works/Games payloads; Home/About payloads keep their accepted shape.
- Hydration remains limited to exactly one `main[data-react-main]`.

## Blocking gates

- G-64 (`qa:m3:works-games:parity`): exact structure reproduction, portable across LF and CRLF checkouts (only CRLF pairs in the checked-out structure are folded; a changed key in either convention, a lone CR or an extra line still fails); complete head/document/header/main/footer contract for 10 documents. Migration deltas are accepted only where they belong: React markers on the single `<main>` tag, `aria-current` on exactly the selected header link, explicit English `dir`, the exact search control markup with the accepted runtime wording, pairwise runtime presentation attributes, and the twelve reviewed copy deltas. Nineteen negative controls must fail.
- G-64 source authority (`qa:m3:works-games:i18n-authority`): the structure holds keys and references only; props take copy only from the canonical authorities (canary sources) and fail closed; every emitted document renders exactly the authorities' values, including roles, `data-pv2-*`, and search copy. Negative controls include canonical, role-label, project-role, structured-runtime, and phrase-pack updates with a stale render, and rendered edits with unchanged sources.
- Route-aware artifact gate (`qa:m3:parity`): the five scoped public files in `m3-26-public-delta.json` are pinned by hash, and reversing their reviewed edits (`scripts/m3-26-public-edits.mjs`) must reproduce the base hashes the #25-A / #25-B manifests already pin. Home/About must equal the accepted snapshot hashes and the #25-B payload contract. Every other legacy artifact remains protected.
- G-65 (`qa:m3:works-games:hydration`): observation starts as soon as `<main>` is parsed (with a server-rendered template comparison) and continues through hydration, load-time COMMON work, Recruiter Mode, Command Palette, a forced locale refresh, and the theme toggle; only the single idempotent search `type` write and dialog container isolation are tolerated. It also drives keyboard and touch filters, typed search, Escape/Backspace clearing, combined state, accessible role/name, contract-derived card activation, and no-JS SSR. Synthetic and live controls must fail, including the pre-fix `ultimate.js` behavior.
- G-65 differential (`qa:m3:works-games:differential`): composes the accepted artifact hermetically (proven byte-equal to the accepted manifests) and compares live DOM, search copy (SSR = live = accepted), accessible name, the search/filter corpus, every card's activation with analytics, and geometry/style at desktop/mobile × dark/light. Card navigations are recorded in the page by the identical Navigation API `navigate` recorder on both runtimes, synchronously with the click, and cancelled, so recording never races a CDP network event. A navigation that lands after its click was recorded, cannot be cancelled, or reaches the network fails the gate. Live negative controls cover an inert card made navigable, a missing whole-card navigation, a changed whole-card or nested-link destination, and unexpected Games or modifier-click analytics.
- G-66 (`qa:m3:works-games:performance`): shared client bundle, emitted document, and hydration payload budgets.
- Home/About payload (`qa:m3:home-about:payload`): all ten Home/About payloads are byte-exact to the #25-B payload contract, both after a fresh build and against the emitted `dist-site`. Negative controls change every payload (a leaked catalog prop, an unreviewed field, a changed copy value, reordered keys) while re-pinning the #26 snapshot hashes to the drifted documents. The re-pinned snapshot accepts each one, and the gate must still reject it. Other controls cover another locale's payload, a missing or duplicate payload, and a contract with a missing document or the wrong ref.
- Reproducibility: `qa:react` runs the static hermetic guard (no CI-reachable script may read git history); `qa:m3:hermetic` additionally runs the history-sensitive gates in an exported checkout where the accepted commits are proven absent.
- `qa:m3:cutover` runs G-61/G-62/G-63 unchanged, plus the Home/About payload gate, before the #26 gates; `qa:m3:artifact` repeats them against the emitted `dist-site`.

## Preservation contract

The production artifact must still contain 215 canonical routes and 85 compatibility stubs. The historical `/projects/pyhton-projects/` slug remains unchanged. No route family other than Home/About/Works/Games changes renderer ownership in #26.
