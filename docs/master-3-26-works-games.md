# Master 3 #26 — Works + Games production React ownership

## Accepted authority

- Historical acceptance ref: `24be2f8159a0925dc00f29375ea8740738214df3`.
- Scope: `/works/` and `/games/` in `en`, `tr`, `de`, `es`, and `fr` (10 documents).
- The structure generator resolves the requested ref to a commit and refuses every ref other than the fixed acceptance SHA.
- `qa:m3:works-games:parity` reproduces the generated structure in a temporary directory and byte-compares it with the committed structure before it evaluates emitted documents.

## Ownership boundary

- React owns the complete Works/Games `<main>` subtree, including SSR markup, hydration, filters, catalog search, empty-result state, and inert-card navigation.
- The static header and footer remain outside the hydration root. COMMON continues to own theme, mobile navigation, locale switching, Recruiter Mode, Command Palette, and public AJOOP.
- `js/portfolio/works.js` and `js/pages/games.js` retain their legacy behavior for legacy documents. Their catalog initializers stand down only when `main[data-react-main]` declares React ownership.
- Home/About retain the independently accepted #25-B renderer and gates. Case studies, actual games, project detail bodies, Recruiter Mode, Command Palette, and AJOOP remain outside #26.

## Search audit and decision

The accepted Works/Games runtime inserted `.project-search-wrap` after `.filter-bar`, then mutated card and tier classes for combined category and text matching. Because those nodes live inside `<main>`, leaving the mutation in the legacy runtime would create competing ownership and break exact hydration identity.

#26 therefore renders the same search control during SSR as normal JSX and reproduces the accepted visual hierarchy, matching inputs, category combination, and no-result behavior. The runtime's invalid block-inside-label nesting is replaced by an explicit `for`/`id` association so the emitted HTML remains valid; the field receives the label's typographic context in CSS so its rendering is unchanged. Four stable search keys retain the accepted English/Turkish copy and close the legacy English fallback in German, Spanish, and French with reviewed translations.

The input keeps the accepted native `type="search"`. A `role="searchbox"` text input was evaluated and rejected: on the accepted page Escape clears a search field and restores every card, which a text input does not do. React 19 hydrates an input by assigning `element.type = props.type` (`initInput`), which rewrites `search` with itself. G-65 tolerates exactly that one record, only on the catalog search input, and only while old value, final value, and declared type are all `search`; every value-changing or other write still fails.

Search matching is owned by React and is equivalent to the accepted runtime: whitespace-collapsed, trimmed, lower-cased card text (no diacritic folding) and raw destination-attribute substring matching. The generated structure records where the accepted source had whitespace as non-rendering `space` nodes, so card search text equals the accepted `textContent`, including adjacent elements with no whitespace between them.

## Runtime presentation contract

COMMON stands down inside React-owned main, so the attributes it applied to the accepted documents after load are carried by the structure: `decoding="async"` on images (the structural rule from `js/features/creative.js`) and the one protected-term casing marker the accepted runtime set (`works.category.pythonSoftware`, identical in all five locales). `applyProtectedTermCasing()` in `js/core/i18n-runtime.js` previously stripped casing markers document-wide before its existing React-main skip; it now leaves React-owned markers alone, matching its other React-main stand-downs. The legacy `data-game-card-ready` idempotence marker has no style effect and is not emitted, because React owns card activation.

## Canonical and localized data

- `data/site/m3-26-works-games-structure.json` is reproducibly generated from the ten accepted historical documents.
- Its 159 phrase-derived semantic locale keys retain the five accepted translations without embedding page facts in JSX.
- Flagship names and destinations that exactly match `data/portfolio/projects.json` resolve through that canonical portfolio authority at build time.
- Accepted index-only card copy, order, categories, status labels, archive facts, and tags remain in the generated historical structure. They are not falsely promoted into canonical portfolio facts.
- Internal anchor destinations are localized through the route runtime. Historical `data-project-link` and `data-game-link` attributes remain byte-semantic matches to the accepted documents, preserving the legacy navigation contract.

## Rendering and delivery

- `data/site/routes.json` assigns only `works` and `games` to the existing production React renderer in addition to Home/About.
- Production continues to emit an invocation-scoped `assets-react/` namespace and merge it into `dist-site` only after legacy generation.
- The catalog structure is carried in the per-document hydration payload instead of the shared client bundle. This keeps the shared client bundle within the unchanged #25-B G-63 limits.
- Hydration remains limited to exactly one `main[data-react-main]`.

## Blocking gates

- G-64 (`qa:m3:works-games:parity`): exact fixed-ref structure reproduction; complete head/document/header/main/footer contract for 10 documents; only the React ownership attributes, selected-route `aria-current`, explicit English `dir`,, the accepted runtime search enhancement (asserted as exact markup), and the pinned runtime presentation attributes (removed pairwise only where the accepted static document lacks them) are migration deltas. Eleven mutation controls must fail.
- The route-aware artifact gate pins the four scoped public runtime/style files in `m3-26-public-delta.json` with bytewise CRLF-to-LF hashes, and also rebuilds each one from `git show 24be2f8:<path>` plus an explicit list of reviewed edits, so the pinned bytes are anchored to the immutable acceptance commit rather than to the current tree. Every other legacy artifact remains protected.
- G-65 (`qa:m3:works-games:hydration`): zero recoverable errors, stable node identity/attributes/markup, and zero mutations inside main from before hydration until after load-time COMMON work (except the single idempotent search `type` write above), on desktop and mobile for all 10 documents. In every document it drives keyboard (Enter/Space) and touch filters against an attribute-derived oracle, multi-category cards, typed positive search, Escape and Backspace clearing, empty results, combined category/search state, accessible role/name, and inert card-surface navigation to the localized destination. 16 synthetic and 6 live in-browser negative controls (attribute mutation, late legacy mutation, missing signal, subtree replacement, recoverable error, type rewrite) must fail.
- G-65 differential (`qa:m3:works-games:differential`): builds the accepted artifact from the fixed SHA and compares live post-runtime main DOM, accessible search role/name, every category × a corpus of search queries derived from accepted card text and destinations, and element geometry/computed style at desktop/mobile × dark/light. Five live negative controls must fail.
- G-66 (`qa:m3:works-games:performance`): shared client bundle, emitted document, and hydration payload budgets tied to the fixed #26 acceptance ref.
- `qa:m3:cutover` runs G-61/G-62/G-63 unchanged before G-64/G-65/G-65 differential/G-66.
- `qa:m3:artifact` repeats Home/About and Works/Games parity/hydration against the emitted `dist-site`, after route, HTTP, HTML, locale, and static accessibility audits.

## Preservation contract

The production artifact must still contain 215 canonical routes and 85 compatibility stubs. The historical `/projects/pyhton-projects/` slug remains unchanged. No route family other than Home/About/Works/Games changes renderer ownership in #26.
