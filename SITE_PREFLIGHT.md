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
| Accessibility | `npm run qa:a11y` | A genuine WCAG 2 AA failure must not reach production. |

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
