# Site Preflight

This repository includes automated quality checks for `kaanbalci.com`.

## What is checked

- English and Turkish spelling with CSpell
- HTML validity with HTML Validate
- WCAG 2 AA accessibility issues on a mobile viewport with Pa11y CI
- Performance, accessibility, best-practices and SEO scores with Lighthouse CI
- Broken internal and external links with Lychee

## How it runs

The `Site Preflight` GitHub Actions workflow runs on every pull request, every push to `main`, and manual workflow dispatches.

The first version is intentionally report-first: spelling, HTML, accessibility and Lighthouse findings are collected without blocking deployment. This makes it possible to establish a clean baseline before stricter quality gates are enabled.

## Reports

Open the relevant GitHub Actions run and download the `site-preflight-reports` artifact. It contains:

- `html-validation.txt`
- `spelling.txt`
- `accessibility.json`
- `accessibility-errors.txt`
- `lighthouse.txt`
- `local-server.log`

The broken-link summary appears directly in the workflow run summary.

## Run locally

```bash
npm install
npm run qa:html
npm run qa:spelling
python3 -m http.server 4173
npm run qa:a11y
npm run qa:lighthouse
```
