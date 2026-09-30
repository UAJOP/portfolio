# Master 3 · #25-A production migration foundation

Status: infrastructure only. No public route is React-owned in #25-A.

## Ownership

`data/site/routes.json` remains the only public route registry. Every page,
the project route family, and every companion document has a required
`renderer` value: `legacy` or `react`. `scripts/site-routes.mjs` rejects a
missing or unknown value. All current values are `legacy`.

`scripts/react-route-adapter.mjs` expands that registry across the active
locale contract. Each record carries route id, locale, canonical trailing-slash
pathname, output document, route kind, and renderer. English stays unprefixed;
TR, DE, ES, and FR use their canonical prefixes. `pyhton-projects` is preserved.

## Shared production contracts

- `scripts/shared-localization.mjs` resolves required semantic messages and
  structured localized values without an implicit English fallback. A value is
  language-neutral only when its caller marks it that way.
- `scripts/production-localization.mjs` loads the canonical five-locale message
  and pack sources for production prerendering.
- `scripts/site-head.mjs` owns canonical, hreflang/x-default, robots, Open
  Graph, Twitter, and JSON-LD rendering used by both legacy generators and the
  future React prerenderer. Both existing generators use it; their checked-in
  output remains byte-stable.

## Build modes and merge

The preview remains isolated at `/react-preview/` in `dist-react/`.
Production migration mode is explicit, uses base `/`, reserves the namespaced
`assets-react/` bundle directory, and writes only to `dist-react-production/`
when invoked on its own. `data/site/public-artifact.json` is the sole authority
for that bundle namespace; Vite and the artifact merger both read it. Validation
requires a single safe relative directory name and rejects collisions with
legacy browser directories, route documents, compatibility stubs, and other
artifact roots.
It derives its targets from the canonical route adapter. With zero React-owned
routes it deliberately emits zero files.

`npm run build:site` performs:

1. five non-mutating freshness gates for `portfolio-data.js`, project pages,
   derived locale packs, the i18n runtime, and localized routes;
2. production React prerender for React-owned routes only into a unique
   invocation-scoped temporary directory;
3. the bounded legacy Pages artifact build;
4. an ownership-aware merge into `dist-site/` using the exact in-process React
   build proof;
5. removal of the temporary React output.

The build fails before artifact assembly when any committed generated output is
stale. React build proofs bind the route set, exact path set, and SHA-256 of
every emitted file to the current Node invocation. Direct artifact-builder use
is therefore legacy-only while there are zero React-owned routes, and fails
closed without a current proof once a route becomes React-owned. An arbitrary
or modified `dist-react-production/` directory has no authority.

The merge accepts only documents whose registry owner is `react` and bundles
under `assets-react/`. It cannot delete unmatched legacy files, overwrite a
legacy-owned route, or publish the preview root.

## Parity and hydration gates

`npm run qa:m3:foundation` checks ownership validation, five-locale path
derivation, the project-family seam, zero current React production routes,
fail-closed message/data behavior, head byte parity, merge clobber rejection,
the full synthetic mixed-ownership matrix, generated-source fail-closed
behavior, invocation-bound React provenance, bundle namespace validation, and
the SSR browser-global boundary.

`data/site/m3-25a-accepted-artifact.json` freezes the complete 498-file artifact
built independently from accepted base commit
`6ca0910ea330d25dcb3873f8b84047666de67fb6`, with a SHA-256 and an explicit
normalization mode for every path. HTML, CSS, JavaScript, SVG, TXT, XML, and
`CNAME` are the complete recognized text set. Their hashes convert only the
byte pair CRLF (`0D 0A`) to LF (`0A`); files are never decoded, trimmed, or
otherwise normalized. Lone CR, non-EOL whitespace, encoding bytes, and all 107
binary entries remain byte-exact.

`npm run qa:m3:parity` invokes the real `buildProductionSite()` orchestrator,
then compares its exact path set and canonical hashes to the immutable
manifest. It separately retains the stricter byte-exact current-tree
legacy-versus-mixed comparison as merge neutrality. Fixture tests prove LF and
CRLF equivalence for recognized text while rejecting content, non-EOL
whitespace, binary-byte, missing-file, and extra-file changes.

`npm run qa:react` includes `npm run qa:m3:parity`. Site Preflight already runs
`qa:react` as a blocking step, so pull requests and main-branch pushes cannot
pass that job without accepted-artifact parity.

Future route implementations must supply server markup and the exact matching
client props/state before ownership can flip. Browser-only reads stay behind
the client entry boundary. The visual rule remains:

**REUSE FOR PARITY → CONSOLIDATE AFTER PARITY.**
