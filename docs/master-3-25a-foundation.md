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
`assets-react/` bundle directory, and writes only to `dist-react-production/`.
It derives its targets from the canonical route adapter. With zero React-owned
routes it deliberately emits zero files.

`npm run build:site` performs:

1. canonical legacy generation inputs already present in the checkout;
2. production React prerender for React-owned routes only;
3. the bounded legacy Pages artifact build;
4. an ownership-aware merge into `dist-site/`.

The merge accepts only documents whose registry owner is `react` and bundles
under `assets-react/`. It cannot delete unmatched legacy files, overwrite a
legacy-owned route, or publish the preview root.

## Parity and hydration gates

`npm run qa:m3:foundation` checks ownership validation, five-locale path
derivation, the project-family seam, zero current React production routes,
fail-closed message/data behavior, head byte parity, merge clobber rejection,
and the SSR browser-global boundary.

`npm run qa:m3:parity` builds a legacy-only artifact and the mixed pipeline in
separate temporary directories, then compares the complete file sets and the
SHA-256 of every file. It performs no normalization and excludes nothing.

Future route implementations must supply server markup and the exact matching
client props/state before ownership can flip. Browser-only reads stay behind
the client entry boundary. The visual rule remains:

**REUSE FOR PARITY → CONSOLIDATE AFTER PARITY.**
