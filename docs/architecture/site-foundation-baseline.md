# Site foundation baseline

Recorded from merged `main` at `5f8bd0c54f427ca7c64030b4c08f47ad2bec5658` before the Master 1 implementation began.

## Baseline verification

- `npm run qa`: pass
- `npm run build:react`: pass; three prerendered preview routes
- `npm run qa:react`: pass
- Active production locales: `en`, `tr`, `de`, `es`, `fr`
- Clean route registry: `data/site/routes.json`
- Canonical portfolio facts: ten JSON files under `data/portfolio/`
- Generated locale output: 180 localized route documents plus compatibility documents
- Generated project output: 25 English project routes and their localized equivalents

## Repository and runtime shape

The live site is a static, progressively enhanced HTML application. English clean-route documents are authored at directory `index.html` paths. Locale documents, project pages, legacy `.html` compatibility stubs, locale-pack JavaScript, `portfolio-data.js`, `i18n-data.js`, and `sitemap.xml` are committed generated artifacts. Browser code is split between root runtime files, `js/`, `css/`, and `i18n/`. The React application under `src/react/` is a prerendered migration preview and is deliberately excluded from production.

`server/` and the AJOOP operational scripts are private/local runtime code. They are versioned with the site but are not browser dependencies. `automation/`, `scripts/`, tests, reports, and Markdown documentation are engineering inputs rather than public-site resources.

## Baseline deployment boundary

GitHub Pages reports `build_type: legacy` with source `main:/`. Therefore the repository root is also the Pages source. Any tracked file that Pages/Jekyll accepts can become reachable merely by being committed. This includes engineering documentation, QA/build tooling, server source, automation fixtures, canonical source data, and development configuration. The current model does not satisfy `repository != public deployment artifact`.

The target migration is a generated, uncommitted Pages artifact containing only route documents, compatibility documents, browser runtime code, public assets, `CNAME`, `robots.txt`, `sitemap.xml`, and the custom `404.html`.

## Baseline i18n ownership

`data/i18n/locales.json` is the locale and localized-route gate. `data/site/routes.json` remains the only route authority.

The current translation catalog has seven domains:

- `ui`: stable semantic keys, currently stored in `data/i18n/ui.json`
- `meta`: stable route IDs and metadata field keys
- `dynamic`: stable feature namespaces and object paths
- `case-studies`: stable case-study IDs and field keys
- `projects`: stable project slugs and field paths
- `content`: stable canonical registry paths
- `pages`: historical English-phrase identity for static page text and attributes

All five active locales currently pass 100% catalog coverage. Locale generation and QA reject missing locale routes and stale generated output. Generator-owned route documents carry an exact header marker; unowned locale files block cleanup.

The architectural weakness is not missing translation coverage. It is that historical page translation still depends on English source phrases, and stable UI messages are stored in a cross-locale matrix while other translated domains are stored per locale. Master 1 will establish a per-locale stable-message source for shared UI and the React shell, explicitly quarantine the phrase dictionary as a compatibility layer, and enforce key/placeholder/formatting parity without rewriting editorial page copy.

## Baseline source/generated boundaries

| Surface | Baseline owner | Baseline output |
| --- | --- | --- |
| Portfolio facts | `data/portfolio/*.json` | `portfolio-data.js`, project HTML, sitemap inputs |
| Routes/locales | `data/site/routes.json`, `data/i18n/locales.json` | clean/localized route documents and legacy stubs |
| Shared UI messages | `data/i18n/ui.json` | `i18n-data.js`, locale-pack UI payloads |
| Historical page translations | `data/i18n/packs/*/pages.json` | localized route HTML and scoped runtime packs |
| Metadata translations | `data/i18n/source/meta.json`, locale pack metadata | localized `<head>` output |
| Browser locale packs | canonical sources plus authored locale packs | `i18n/pack-*.js` |
| React preview | `src/react/`, canonical portfolio data | ignored `dist-react/` |
| Public deployment | repository root | legacy Pages publication of the repository source |

## Constraints carried into implementation

- No visual redesign, font change, or broad copy rewrite.
- No AJOOP runtime, Bridge, Qdrant, connector, or tunnel work.
- No second route registry.
- Generated output stays deterministic and QA never silently regenerates it.
- Unowned files are never generator cleanup targets.
- The React preview remains isolated from the production site until a later migration phase.
