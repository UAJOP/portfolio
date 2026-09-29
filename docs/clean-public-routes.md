# Clean Public URLs V1

Every public page on kaanbalci.com is a clean directory URL. Nothing a reader,
a crawler or Ajoop is handed ends in `.html`.

```
/                 /tr/               /de/   /es/   /fr/
/works/           /tr/works/         /de/works/   …
/certificates/    /tr/certificates/  …
/projects/<slug>/ /tr/projects/<slug>/ …          (unchanged since BRIEF 02)
```

Slugs are never translated: a language switch only ever changes the prefix, so
it is deterministic in both directions.

## One route contract

`data/site/routes.json` is the only place a page's route is declared. Four
things that used to be one string are kept apart:

| Concept | Example | Meaning |
| --- | --- | --- |
| `id` | `works` | stable name; also keys the locale `meta` packs |
| `route` | `works/` | public URL key → `/works/`, `/tr/works/` |
| source | `works/index.html` | the authored English document |
| output | `tr/works/index.html` | the file serving a locale |
| `legacy` | `works.html` | pre-migration URL → compatibility stub |

Everything else derives from it:

- **`scripts/site-routes.mjs`** — validates the registry, evaluates the browser's
  route module against it, renders the sitemap (shared by both generators) and
  the legacy stubs.
- **`scripts/i18n-catalog.mjs`** — `STATIC_ROUTES`, `COMPANION_ROUTES`,
  `indexableRoutes()` and `authoredHtmlFiles()` are projections of the registry.
- **`i18n-data.js`** (generated) — carries `routeTable`, the browser's copy.
- **`js/core/locale-routes.js`** — the one URL implementation, used by the
  browser, both generators and QA:

  ```js
  KAAN_LOCALE_ROUTES.routeFor("works", "tr");                  // "/tr/works/"
  KAAN_LOCALE_ROUTES.routeForProject("hospital-form-app", "de"); // "/de/projects/hospital-form-app/"
  KAAN_LOCALE_ROUTES.documentPathFor("/tr/works/", "tr");      // "tr/works/index.html"
  ```

- **`scripts/qa-site-routes.cjs`** — the same module for the CommonJS QA scripts.

Adding a page means one registry entry, one authored `<route>/index.html`, one
`meta` entry per locale pack, then `npm run i18n:build`.

## Physical layout on GitHub Pages

The site deploys straight from `main` (`build_type: legacy`), so there is no
build step and no rewrite rule to lean on. Every URL is a real file:

```
works/index.html            ← authored English source, served at /works/
tr/works/index.html         ← generated
works.html                  ← generated legacy stub
tr/works.html               ← generated legacy stub
```

A direct load, a refresh, an external link and a crawler all get a real
document. GitHub Pages may resolve `/works` through `works.html` before the
directory route; that generated compatibility document forwards to `/works/`.
The canonical `/works/` URL still direct-loads its real `works/index.html`.
There is no SPA fallback and no 404 interception.

`index.html` and `404.html` keep their names: the first is the home document
(`/`), the second is the file GitHub Pages serves for every failed URL.

## Root-relative URLs, no depth

Every first-party `href`, `src`, `data-cert`, `data-case-gallery`,
`data-project-link` and `data-game-link` is root-relative: `/style.css`,
`/assets/…`, `/about/`. Pages live at three depths (`/`, `/works/`,
`/tr/projects/<slug>/`) and the 404 page is served at any depth, so a relative
path would mean something different on each. Root-relative paths mean the same
thing everywhere, so pages no longer declare `data-site-root`/`data-locale-root`
and nothing computes `../` chains.

`siteUrl()` accepts root-relative routes (`/works/`) and site-relative paths
(`projects/<slug>/`, `assets/…`), localizes page routes into the current
locale and leaves assets and external URLs alone. Runtime data (Ajoop answers,
Recruiter Mode, the Command Palette, canonical project/lab links) stores the
English root-relative route and always renders through `siteUrl()`.

`file://` browsing is not supported: directory URLs need an HTTP server. Use
`python -m http.server 8000` (or the `portfolio-static` launch config).

## Legacy `.html` URLs

GitHub Pages cannot send a real 301. Each pre-migration URL — `/works.html`,
`/tr/about.html`, `/single-work.html`, … (17 pages × 5 locales = 85 stubs) —
is a tiny generated document that:

1. declares `rel=canonical` to the clean URL, so search engines consolidate
   instead of indexing a duplicate;
2. runs `location.replace(target + location.search + location.hash)`, so
   `/works.html?role=applied-ai#cards` lands on `/works/?role=applied-ai#cards`
   without leaving the stub in history;
3. carries a zero-second meta refresh for readers without JavaScript (search
   engines treat it as a permanent redirect);
4. shows a plain link as the last resort.

Stubs are deliberately **not** `noindex`: combining noindex with a canonical is
a conflicting signal, and the canonical plus the instant refresh is what moves
existing ranking to the clean URL. They are never linked internally, never in
the sitemap, and load no site runtime.

`/index.html` and `/tr/index.html` are the home documents themselves; their
canonical already names `/` and `/tr/`.

### The legacy project shell

`project-detail.html` stays: it is the template the project generator derives
`projects/<slug>/index.html` from, and the compatibility endpoint for old
`/project-detail.html?project=<slug>` links. When opened with a known slug the
runtime forwards to `/{locale}/projects/<slug>/`, preserving meaningful query
parameters and the fragment while dropping `project` and tracking noise; an
unknown slug stays on its not-found state. It is `noindex`, has no canonical,
and there is no `/project-detail/` route.

## SEO

- canonical, `og:url`, hreflang (including `x-default`), JSON-LD `url` /
  `mainEntityOfPage` and the sitemap all use clean URLs
- companions (`404.html`, `project-detail.html` and their localized copies)
  carry `noindex` and no canonical — they are not destinations
- the sitemap lists canonical, indexable routes only: 43 routes × 5 locales

## Locale switching

The switch preserves the query and fragment. Only identity already expressed in
the path (`project`) and tracking noise (`utm_*`, `gclid`, `fbclid`, `msclkid`,
`dclid`, `mc_cid`, `mc_eid`) are dropped:

```
/about/?x=1&utm_source=li#skills  → /fr/about/?x=1#skills
/?role=applied-ai                 → /tr/?role=applied-ai
/projects/foo/?source=ajoop       → /de/projects/foo/?source=ajoop
```

Legacy input is normalized on the way in (`/tr/about.html` → `about/` →
`/de/about/`); nothing the router returns ever ends in `.html`.

## QA

| Script | Guards |
| --- | --- |
| `qa:routes` | registry = migration table; project slugs unchanged; `routeFor`/`routeForProject`; every language switch (including legacy input, query, hash); every (locale, route) document exists at its directory; every stub forwards correctly; no `.html` in any first-party link, canonical, hreflang, og:url, JSON-LD or the sitemap; every first-party src/href resolves; Ajoop, Recruiter Mode, Command Palette and canonical data carry clean destinations |
| `qa:routes:http` | the same site over real HTTP from a GitHub Pages-shaped server: every clean route 200 with its own canonical, every legacy URL forwards, trailing-slash redirects, assets, sitemap URLs, real 404s. `--base <url>` targets any server (CI runs it against `python -m http.server`); `--sample` smoke-tests production |
| `qa:html` | validates every published document, derived from the registry |
| `qa:i18n`, `qa:seo`, `qa:links`, … | updated to the clean contract — they assert clean root-relative URLs rather than tolerating `.html` |

Filesystem assertions may name `.html` files. Public-URL assertions never
accept one.

## Operational notes

The canonical checkout is also the production AJOOP Bridge working directory.
The clean URLs in `ajoop-master-knowledge.json` must not reach retrieval before
the matching Pages routes are live. Release in this order, without overlap:

1. merge and deploy the site;
2. run the production route smoke test;
3. ingest the Qdrant collection;
4. restart AJOOP Bridge;
5. run AJOOP health and link acceptance.

- Ajoop's server-side answers take links from
  `data/portfolio/ajoop-master-knowledge.json`, which now carries clean URLs. A
  Qdrant collection built before this change no longer matches the corpus
  fingerprint, so the bridge fails closed to its in-memory index (correct
  answers, clean links) until `npm run ajoop:qdrant:ingest` is re-run.
- Project slugs are unchanged, including `pyhton-projects`; renaming one is a
  separate migration because it changes a public URL.
