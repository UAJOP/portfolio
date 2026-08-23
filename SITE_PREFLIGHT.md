# Site Preflight

Automated quality checks for `kaanbalci.com`, run by the `Site Preflight` GitHub Actions workflow on every pull request, every push to `main`, and manual dispatches.

## Enforcement model

The workflow was originally report-first so a clean baseline could be established. That baseline now holds, so checks whose outcome is fully determined by the repository are real gates. Checks that depend on the network or on runner load stay report-only, because a flaky third party must never block a merge.

### Blocking

| Check | Command | Why it blocks |
|---|---|---|
| JavaScript syntax | `npm run qa:js` | The compatibility bootloader loads these files at runtime; there is no build step to catch a syntax error. |
| Portfolio consistency | `npm run qa:portfolio` | Guards the V2 architecture, boot order, canonical footer, portfolio truth and QA reproducibility. |
| Asset performance policy | `npm run qa:assets` | Guards referenced asset existence, intrinsic image dimensions, critical image budgets and intentional loading priority. |
| Internal links | `npm run qa:links` | Page targets, anchors, footer brand links, recruiter role deep links and project slugs are all decided by this repository, so it cannot flake. |
| HTML structural errors | `npm run qa:html` | `html-validate` exits non-zero only on structural errors, so this gates real breakage while intentional warnings still print. |
| Spelling | `npm run qa:spelling` | The baseline is genuinely clean, so any new issue is a real mistake. |
| Accessibility | `npm run qa:a11y` | A genuine WCAG 2 AA failure must not reach production. Still covers the same 11 production pages. |
| React foundation build | `npm run build:react` | Also the JSX gate: `qa:js` parses root files as classic scripts and cannot represent JSX, so a broken React source has to fail here. |
| React foundation guard | `npm run qa:react` | Proves the build really pre-renders and that no production file was touched. |
| React preview accessibility | `npm run qa:a11y:react` | The new architecture must not start out less accessible than the one it will replace. |

### Report-only

| Check | Why it does not block |
|---|---|
| Lighthouse | Performance depends on runner load and third-party CDN latency. Scores are summarized in the job log and uploaded as an artifact. |
| External links (Lychee) | Social platforms rate-limit and block bots, and remote outages are outside this repository's control. Deterministic internal links are covered by the blocking `qa:links` step. |

## Known accepted warnings

HTML validation currently reports **3 warnings and 0 errors**. All three are `aria-label` on a `<canvas>` element, which `html-validate` flags only as "not recommended". `aria-label` is the correct way to give a canvas an accessible name, so removing it would reduce accessibility. These are deliberate and are not suppressed at the rule level.

## Reports

Download the `site-preflight-reports` artifact from a workflow run. It contains:

- `html-validation.txt`
- `spelling.txt`
- `asset-policy.txt`
- `internal-links.txt`
- `accessibility.json`
- `accessibility-errors.txt`
- `lighthouse.txt`
- `lighthouse-summary.json`
- `react-build.txt`
- `react-foundation.txt`
- `react-accessibility.txt`
- `react-preview-server.log`
- `local-server.log`

The broken-link summary appears directly in the workflow run summary.

## Run locally

```bash
npm ci
npm run qa
```

`npm run qa` runs every blocking check that does not need a server: JS syntax, portfolio consistency, asset policy, internal links, HTML and spelling.

The accessibility and Lighthouse checks need the site served first:

```bash
python3 -m http.server 4173
npm run qa:a11y
npm run qa:lighthouse
```

Use `npm ci` rather than `npm install` so the pinned toolchain in `package-lock.json` is reproduced exactly.

## React foundation checks

The workflow runs the React steps in this order, after the deterministic static-site checks and before the accessibility pipeline:

1. `npm run build:react` — Vite client build, SSR build, and pre-render of every preview route.
2. `npm run qa:react` — inspects `dist-react/` and the repository.
3. `npm run qa:a11y:react` — Pa11y against the running preview server.

All three block. None of them changes an existing gate, and no existing blocking check was converted to `continue-on-error`. Lighthouse and the external link scan remain the only report-only checks.

### Why the React build is the JSX gate

`qa-js-syntax.js` parses every root-level `.js` file with `new vm.Script()`, because production loads those files directly with no build step. JSX is not valid script syntax, so forcing React sources through that check would be meaningless. `vite build` performs the real syntax and transform validation instead, and it blocks.

For the same reason the React tooling deliberately avoids adding root-level `.js` files: `vite.config.mjs` uses the `.mjs` extension and the pre-render script lives in `scripts/`, so neither is picked up by the production glob. `qa-react-foundation.js` *is* a root `.js` file and is intentionally CommonJS, so it passes `qa:js` like every other guard.

### Production coverage is not displaced

`qa:a11y` and Lighthouse still audit the same 11 production pages. The preview has its own config (`.pa11yci-react`) covering its three routes, so it adds coverage rather than replacing any. `qa-react-foundation.js` asserts both URL lists still have 11 entries and that neither contains a preview URL, so this cannot regress silently.
