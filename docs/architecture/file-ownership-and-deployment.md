# File ownership and deployment contract

This contract applies to the static production site and the React migration preview. The route authority is `data/site/routes.json`; the locale authority is `data/i18n/locales.json`.

## Ownership classes

| Class | Meaning | Current owners |
| --- | --- | --- |
| A | Canonical authored source | English clean-route `index.html` files, root runtime JS/CSS, `src/react/` |
| B | Canonical structured data | `data/portfolio/*.json`, `data/site/*.json`, canonical i18n sources under `data/i18n/` |
| C | Generated committed artifact | locale route trees, project route trees, legacy `.html` stubs, `portfolio-data.js`, `i18n-data.js`, `i18n/pack-*.js`, `sitemap.xml` |
| D | Generated deployment artifact | ignored `dist-site/` and its generated `.nojekyll` |
| E | Compatibility artifact | root/localized legacy `.html` stubs and `project-detail.html` query shell |
| F | Browser/public runtime | allowlisted files and directories in `data/site/public-artifact.json` |
| G | Server/private runtime | `server/`, `.ajoop-runtime/`, local provider and Bridge configuration |
| H | QA/test code | `qa-*.js`, `scripts/qa-*`, fixtures used only by QA |
| I | Generation/build tooling | generators and builders under `scripts/`, Vite/prerender configuration |
| J | Documentation | Markdown under `docs/` and root architecture/runbook documents |
| K | Public assets | `assets/` and browser styles under `css/` |
| L | Development-only files | `.github/`, automation sources, `src/react/`, ignored build/report directories |

The repository may contain every class. The Pages artifact may contain only C, D, E, F, and K files that are explicitly selected by `data/site/public-artifact.json` or derived from the route registry.

## Generated artifact matrix

| Artifact | Canonical source | Generator | Committed | Human edits | Freshness guard | Safe deletion rule |
| --- | --- | --- | --- | --- | --- | --- |
| `portfolio-data.js` | `data/portfolio/*.json` | `scripts/generate-portfolio-data.mjs` | yes | no | `qa:data` | exact generated target only |
| `projects/*/index.html` | project data + project template | `scripts/generate-project-pages.mjs` | yes | no | project/SEO QA | exact generated project slugs only |
| locale route trees | English route sources + locale packs | `scripts/generate-localized-routes.mjs` | yes | no | `qa:i18n`, `qa:routes` | exact generated header/legacy marker only; unknown files block cleanup |
| legacy `.html` stubs | route registry | `scripts/generate-localized-routes.mjs` | yes | no | `qa:routes` | exact legacy-stub header only |
| `i18n-data.js` | locale registry, stable common messages, glossary, formatting | `scripts/generate-i18n.mjs` | yes | no | `qa:i18n` | exact target only |
| `i18n/pack-*.js` | canonical/locale pack sources | `scripts/generate-i18n.mjs` | yes | no | `qa:i18n` | exact scoped target only |
| locale-pack `ui.json` | `data/i18n/messages/*/common.json` | `scripts/build-locale-packs.mjs` | yes | no | `qa:i18n` | exact derived target only |
| `sitemap.xml` | route registry + project slugs + locale gate | route generators | yes | no | route/SEO QA | exact target only |
| `dist-react/` | `src/react/` + canonical data | `scripts/prerender-react.mjs` | no | no | `qa:react` | ignored build directory only |
| `dist-site/` | public artifact allowlist + route outputs | `scripts/build-pages-artifact.mjs` | no | no | `qa:foundation` + HTTP route QA | ignored build directory only |

QA checks never regenerate committed output. `i18n:build` and other generation commands are explicit write operations; `qa:i18n` uses `--check`. Building `dist-site/` is an ephemeral deployment build, not a source mutation.

## Deployment boundary

Production now has a code-level artifact boundary:

`canonical source -> explicit generation -> blocking QA -> dist-site -> upload-pages-artifact -> deploy-pages`

The artifact excludes documentation, canonical JSON, automation, QA scripts, build scripts, server source, React source, credentials, and local runtime state. `qa:foundation` builds the artifact in a disposable directory, executes the full Pages-shaped route suite against it, and proves containment guards reject representative server, documentation, and custom-domain mutations.

GitHub repository settings must be switched from legacy branch publication to GitHub Actions only during the deliberate merge/deploy acceptance step. Feature-branch work does not change the live Pages source.
