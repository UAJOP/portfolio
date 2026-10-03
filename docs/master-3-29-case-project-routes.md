# Master 3 #29 — Case Studies and Project Detail Routes

## Ownership inventory

| Surface | Canonical source before and after #29 | Before | After |
| --- | --- | --- | --- |
| Five case-study route identities | `data/site/routes.json` | `renderer: legacy` | `renderer: react` |
| Case-study content and route-local variants | Accepted canonical `*/index.html` documents, captured by `scripts/generate-m3-case-studies-structure.mjs` | Static document main | Shared React semantic renderer, preserving each document's distinct structure |
| Case-study `.html` files | Compatibility redirect stubs | Redirect | Redirect; never used as content authority |
| `/projects/{slug}/` route family | `data/site/routes.json` | `renderer: legacy` | `renderer: react` |
| Project records | `data/portfolio/project-details.json`, joined to the canonical project registry and locale packs | Generator template plus DOM renderer | One data-driven SSR `ProjectDetail` structure; no per-slug JSX branch |
| Shared header/footer/Recruiter/AJOOP/Command Palette | Existing production React models | React on previously migrated routes | Same owners on every new React document |
| Case gallery/modal behavior | Existing case data scripts and `case-study.js` | Legacy document owner | React owns main markup; retained script owns only the interaction and does not rewrite React markup |
| SINAMA evidence explorer | `portfolio-data.js` registry rendered by `portfolio-v2.js` | Runtime-populated empty root | Unchanged owner. React emits the same empty `[data-sinama-evidence]` root and cedes its subtree (`dangerouslySetInnerHTML` + `suppressHydrationWarning` in the generated contract), so `portfolio-v2.js` is not edited by #29 |
| Project-detail runtime | `js/portfolio/project-detail.js` | Builds legacy main | Retained for legacy compatibility; exits when the React ownership marker is present |

The registered scope is derived from the route, locale, and project registries. At implementation time it resolves to five case studies and 25 project slugs across `en`, `tr`, `de`, `es`, and `fr`: 150 route-documents. Adding a canonical project record extends the route family without adding a JSX branch.

## Architecture decision

The production pipeline remains route-registry driven. `scripts/react-route-adapter.mjs` supplies the route records and `productionDocumentProps` extends the existing SSR/hydration document contract. There is no second public route table.

Case studies use a shared recursive semantic React renderer over a generated, reviewable structure contract. The contract is captured from the accepted canonical clean-route documents, not from redirect stubs. This retains route-specific sections, attributes, galleries, links, inter-node whitespace (a run collapses to one space, as the browser renders it, but text that the accepted document separates only by whitespace stays separated), code/preformatted whitespace, SEO fields, body classes, scripts, and after-main modal markup instead of forcing five products into one generic content schema.

Project details are assembled at build time from `data/portfolio/project-details.json` and existing locale authorities. The resulting per-route structure is serialized only into that document's hydration payload; the complete 25-project registry is not embedded in the shared client bundle. Unknown and invalid slugs never produce a route record or fall back to another project. Each project document declares its slug on `<body data-project-slug>`, as the accepted pages do, because the retained runtime (project routing and the AJOOP page context) resolves the current project from it.

All 150 URLs are statically prerendered. The server markup contains the complete main content with JavaScript disabled, and hydration reuses the same structure without replacing nodes or changing markup. Canonical, hreflang, OpenGraph, Twitter, robots, JSON-LD, sitemap, internal links, external-link safety, overlays, theme, and locale behavior remain in the existing production document pipeline.

## Verification boundary

`qa:m3:case-project-routes` validates registry coverage, emitted files, SSR content, localized truth, metadata, compatibility redirects, invalid/unknown slugs, the `<body>` project-slug declaration, whitespace-sensitive case-study copy, bundle budgets, and eight negative controls. Each control mutates a real emitted document or the real route set, must change it, and must be rejected by the assertion it targets. `qa:m3:case-project-hydration` validates all 25 localized case-study documents, one project sample in every locale, accepted-vs-React desktop/mobile geometry for all five case-study types and for one representative project-detail route (scripts enabled, measured once both pages are settled), interactions (including the SINAMA evidence explorer rendering and switching scenarios inside the hydrated main in every locale), the declared project slug as the runtime resolves it, deterministic hydration, and four hydration negative controls. Each of those drifts the served document before hydration (appended copy, a changed attribute, a replaced node, changed text) and counts only when the in-page probe reports the contract that drift breaks. The gate always serves the artifact as built and refuses to run when `M3_DISABLE_SCRIPT` is set. The hydration identity snapshot covers the evidence root element but not its legacy-owned subtree. Project routes are additionally held to the accepted documents' title, description and OpenGraph description. Both gates run in the blocking Master 3 artifact chain.

## Known runtime differences from the accepted documents

The prerendered markup of both differences below is identical to the accepted static documents; only what legacy scripts did afterwards differs.

- The Atölye Joyday and AI Flow Puzzle hero images carry no `decoding="async"`. The accepted pages gained it at runtime from `js/features/creative.js`, which has stood down below `[data-react-main]` since the earlier React phases. Layout, loading priority and `loading` attributes are unchanged.
- The English Hospital System "View Source Archive" button keeps its GitHub icon. On the accepted page `case-study.js` replaced the button's `textContent` and dropped the icon; that translation pass no longer rewrites React-owned markup.
- Project-detail and case-study asides carry an `aria-label` (required for multiple named landmarks), and the Ajoop aside is labelled on these routes only, so the 20 earlier React documents stay byte-stable.
- Localized project routes now emit the same OpenGraph/Twitter set and JSON-LD as English; the accepted localized documents had a reduced set. English JSON-LD is value-identical (key order of `sameAs`/`keywords` differs).
- The header marks Works as the current section on these routes; the accepted pages marked none.

Legacy source documents, redirect stubs, generator/runtime compatibility code, game mechanics, AJOOP engine behavior, and SINAMA product code remain in place.
