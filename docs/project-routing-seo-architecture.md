# kaanbalci.com Project Routing & SEO Architecture

Established by **BRIEF 02 — Unique Project Pages & SEO Architecture**, branch `seo/unique-project-pages-v1`.

Before this, every archive project was reachable only as `project-detail.html?project=<slug>` — one static file serving 25 different projects, marked `noindex`, with a single generic canonical. None of them were indexable or shareable. Each project now has its own static page with its own metadata.

---

## Canonical Project URL

```
https://kaanbalci.com/projects/<slug>/
```

One static page per project, at `projects/<slug>/index.html`. **25 routes**, one per record in `data/portfolio/project-details.json`.

These are the indexable, shareable, canonical URLs. Every internal link points here.

### Why some projects have no `/projects/` route

`sinama` and `mergeRush` are flagship projects in `projects.json` but have **no detail record**, so they get no generated route. They already have hand-authored case-study pages (`sinama-case-study.html`, `merge-rush-case-study.html`) with their own metadata and JSON-LD. Generating `/projects/sinama/` would create a second competing page for the same project — the exact duplication this brief exists to remove.

Routes are generated from the detail registry, never from a guess about which projects "should" have one.

---

## Legacy Compatibility

```
https://kaanbalci.com/project-detail.html?project=<slug>
```

**All 25 legacy URLs still resolve and render identically.** They are kept because they may exist in bookmarks, search results, LinkedIn posts and CVs. There are no redirects — direct access keeps working.

`project-detail.html` was already `noindex, follow` before this brief and stays that way. That is the correct posture: a single static file cannot carry per-query metadata, so it is inherently a weak SEO surface. It remains a functional compatibility route while the generated pages are the indexable ones. `follow` is retained so link equity still flows to `works.html` and the projects themselves.

**One preferred indexable URL per project.** Query-string URLs are compatibility endpoints, not competitors.

---

## Static Generation

```
data/portfolio/project-details.json     ← canonical project facts
project-detail.html                     ← the one maintained page shell
            │
            │  npm run generate:projects
            ▼
projects/<slug>/index.html   × 25       ← committed, served directly
sitemap.xml                             ← regenerated in the same run
```

`scripts/generate-project-pages.mjs`, Node built-ins only, no dependencies.

**The shell is derived from `project-detail.html` at generation time**, not kept as a second template. There is exactly one maintained layout: edit the header, footer or script tags in `project-detail.html` and all 25 pages inherit the change on the next run. This is why no `templates/` directory was introduced — a template would have been a second copy to keep in sync.

The generator injects only:

- project-specific `<head>` metadata,
- `data-project-slug` and `data-site-root` on `<body>`,
- the project title/subtitle into the hero section,
- a generated-file notice.

**No project facts are copied into the HTML as an editable source.** The visible body is still rendered at runtime from `window.KAAN_PORTFOLIO` by the existing renderer.

### Determinism

Identical input always produces byte-identical output — no timestamps, no random values. `npm run qa:seo` runs the generator in `--check` mode and fails if the checked-in files differ from what the canonical data would produce. The generator writes; QA only validates.

### Safety

- Slugs must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` before any write.
- Duplicate slugs abort the run.
- Every resolved output path must be a direct child of `projects/`, so path traversal aborts.
- Stale cleanup removes a directory **only** if its `index.html` carries the generator's notice. Nothing else in `projects/` is ever touched.

---

## Project Slug Resolution

One resolver in `legacy-script.js` (marked `project-routing`) serves both routes:

```js
function resolveCurrentProjectSlug() {
  const declared = document.body && document.body.dataset.projectSlug;
  if (declared) return declared;                                   // generated page
  return new URLSearchParams(window.location.search).get("project"); // legacy route
}
```

The generated page states its slug declaratively — no pathname parsing. The marker wins over the query string, so `/projects/sinama/?project=weather-app` cannot render the wrong project.

An unknown or missing slug falls through to the existing **Project Not Found** state. Nothing throws.

### Path depth

Generated pages sit two directories deep, so every repo-relative URL needs a prefix. The page declares it:

```html
<body data-project-slug="my-museum" data-site-root="../../">
```

`siteUrl(path)` rebases repo-relative paths and `projectUrl(slug)` builds `<prefix>projects/<slug>/`. Root pages declare nothing, get `""`, and behave exactly as before.

The prefix is **relative (`../../`), not root-absolute (`/`)**, on purpose: root-absolute paths break when the site is served from a subdirectory or over `file://`, and the repository's local QA workflow serves static files directly.

---

## SEO Metadata Source

Everything derives from canonical data. No copy was written or rewritten for this brief.

| Tag | Source |
|---|---|
| `<title>` | `title.en` + `" \| Kaan Balcı"` — matches the site's existing title convention |
| `meta description` | `subtitle.en`, falling back to `overview.en`, truncated to 160 chars on a word boundary |
| `link canonical` | `https://kaanbalci.com/projects/<slug>/` |
| `meta robots` | `index, follow` |
| `og:title` / `twitter:title` | same as `<title>` |
| `og:description` / `twitter:description` | same as the meta description |
| `og:url` | the canonical URL |
| `og:image` / `twitter:image` | `project.image`, made absolute; falls back to the site cover if absent |
| `twitter:card` | `summary_large_image` |

`og:image` is absolute (`https://kaanbalci.com/...`) because social crawlers do not reliably resolve relative image paths.

**`<meta charset>` is re-emitted as the first tag in `<head>`.** The injected metadata block exceeds 1KB, and the spec requires the charset declaration within the first 1024 bytes — otherwise the Turkish characters in the titles can mis-decode. QA asserts the byte offset.

---

## Raw HTML Contract

For every generated page, **before any JavaScript runs**, the HTML already contains the title, description, canonical, OpenGraph, Twitter and JSON-LD tags, plus a real `<h1>` with the project title. That is the entire point of generating static pages: a crawler that does not execute JS still receives meaningful, project-specific metadata.

The **visible body is still rendered at runtime** by `renderProjectDetail()`. The raw shell carries the project title and subtitle in the hero section; the renderer replaces that whole section on boot, so there is exactly one `<h1>` at all times — never a duplicate.

### Known limitation

The full project body (overview, challenge, solution, features, gallery, stack) exists only after JS runs. Crawlers that execute JavaScript see everything; those that do not see the title, subtitle, category and complete metadata. This was accepted rather than pre-rendering the body, which would have copied project prose into 25 HTML files and recreated exactly the duplication BRIEF 01 removed.

---

## Sitemap

`sitemap.xml` is generated by the same script — project routes are never maintained by hand.

- **17** static pages (unchanged from before)
- **25** canonical project URLs
- **42** total

Legacy `project-detail.html?project=` URLs are deliberately **absent**: they are compatibility endpoints, not indexable pages. `project-detail.html` itself stays out too, since it is `noindex`.

QA asserts every sitemap URL resolves to a real file on disk, that there are no duplicates, and that the static pages were not dropped.

`robots.txt` needed no change — it allows everything and declares the sitemap. QA asserts `/projects/` is not disallowed.

---

## Structured Data

Each page carries one JSON-LD object. The type is chosen from the canonical data rather than forced:

| Type | Count | Chosen when |
|---|---|---|
| `SoftwareApplication` | 11 | software, desktop, database or automation signals in category/type/stack |
| `VideoGame` | 9 | game signals (Unity, Unreal, "game", "oyun") |
| `WebSite` | 5 | website / landing / front-end signals |
| `CreativeWork` | 0 | generic fallback when nothing else fits |

Fields: `name`, `description`, `url`, `image`, `dateCreated`, `inLanguage`, `genre`, `creator`, `keywords` (from `stack`), and `sameAs` **only** for `https://` URLs the project's own `links` already contain.

**No fabricated data.** QA explicitly asserts the absence of `aggregateRating`, `review`, `offers`, `price`, `interactionCount` and `ratingValue`, and that every `sameAs` URL traces back to canonical link data.

`creator` is `Kaan Balcı` for all records, consistent with the portfolio's existing authorship claims. If a project's ownership is ever more nuanced, that belongs in canonical data first.

---

## Language

TR and EN share one URL. The language switch operates in place and `document.documentElement.lang` updates correctly, exactly as before.

**No `hreflang` tags were added.** There are no separate `/tr/` or `/en/` routes, so any `hreflang` would point at URLs that do not exist. Emitting fake alternates is worse than emitting none. Recorded below as optional future work.

---

## Adding a New Project

1. Add the record to `data/portfolio/project-details.json`.
2. Add its slug to `scripts/fixtures/project-catalog-baseline.json` (`slugOrder` and `records`).
3. Regenerate:

```bash
npm run data:generate && npm run generate:projects
```

4. Validate:

```bash
npm run qa
```

5. Review the generated `projects/<slug>/index.html` — metadata only; the body is runtime-rendered.
6. Commit the canonical data **and** the generated output together.

The sitemap entry, the static page and every project consumer follow automatically. There is no SEO HTML to write by hand.

---

## Editing a Project

Edit `data/portfolio/*.json`, then regenerate:

```bash
npm run data:generate && npm run generate:projects && npm run qa
```

Regeneration is required whenever a change touches anything the page metadata derives from: `title`, `subtitle`, `overview`, `image`, `category`, `type`, `year`, `stack` or `links`. When in doubt, regenerate — the output is deterministic, so a no-op change produces no diff.

`npm run qa:seo` fails if canonical data changed and the generated pages were not refreshed, so this cannot be forgotten silently.

**Never edit `projects/<slug>/index.html` by hand.** It is overwritten on the next run.

---

## Removing / Archiving

- **Archiving is not deletion.** A project dropped from the homepage keeps its detail record and its canonical route. Old portfolio pages are useful long-tail entries.
- **Removing a project**: delete its record from `project-details.json` and its fixture entry, then regenerate. The generator removes the stale directory — but only because that directory carries the generator's notice.
- Removing a slug **breaks its public URL**, both the canonical route and the legacy query URL. Treat it as a breaking change. There is no redirect layer today.

---

## Legacy URLs

They stay. `project-detail.html?project=<slug>` may exist in:

- search engine results indexed before this change,
- links shared on LinkedIn and in messages,
- the CV,
- browser bookmarks.

Breaking them would lose real traffic for no benefit. The cost of keeping them is one `noindex` page and one branch in the slug resolver.

---

## Future Considerations

Not implemented, recorded so the reasoning is not lost:

- **`hreflang` / language-specific URLs** — would require `/tr/projects/<slug>/` routes and doubling the generated output. Only worth it if Turkish search traffic justifies it.
- **Pre-rendering the project body** — would improve non-JS crawler coverage but duplicates project prose into HTML. Only worth it with a build step that treats the HTML as disposable.
- **Redirecting legacy URLs to canonical routes** — impossible on GitHub Pages without a meta-refresh or JS hop, both of which are worse than the current `noindex` compatibility page. Revisit only if hosting changes.
- **`/projects/` index page** — a browsable listing at the namespace root. `works.html` covers this today.
- **Case-study pages joining the `/projects/` namespace** — `sinama-case-study.html` and friends predate it. Consolidating would mean redirects, so it needs the hosting question answered first.
