# kaanbalci.com Project Data Architecture

Established by **BRIEF 01 — Project Data Source of Truth**, branch `refactor/project-data-source-of-truth-v1`.

Before this migration, project facts lived in three independently maintained places, ~1,730 lines of them inside `legacy-script.js`. They now live in one directory, flow through one generator, and reach the browser through one registry.

---

## Canonical Source

**All project facts live in `data/portfolio/`.** Nothing else is a source of truth.

| File | Owns | Records |
|---|---|---|
| `data/portfolio/projects.json` | Flagship project cards — homepage, Works highlights, Recruiter Mode evidence, Ajoop | 5 |
| `data/portfolio/project-details.json` | Detail records rendered by `project-detail.html?project=<slug>` | 25 |

These two files describe **different record types for different consumers**, not two copies of the same thing. A flagship project is a positioning card; a detail record is an archive case-study page. Only three projects have both, and their shared field is stored once (see *Compatibility Layer*).

### How the data reaches the browser

```
data/portfolio/*.json          ← canonical, hand-edited, reviewed in Git
        │
        │  npm run data:generate   (scripts/generate-portfolio-data.mjs,
        │                           composed by scripts/portfolio-data-model.mjs)
        ▼
portfolio-data.js              ← GENERATED, committed, Object.freeze'd
        │                        window.KAAN_PORTFOLIO
        │
        ├──→ portfolio-v2.js    registry.projects, registry.recruiterProfiles
        └──→ legacy-script.js   projectDetailData ← registry.projectDetails
```

### Why generated JavaScript rather than runtime JSON fetch

This was a deliberate decision, not an aesthetic one.

The site is served from GitHub Pages with **no build step** — the repository is the deployment. Consumers read project data **synchronously during script initialization**: `portfolio-v2.js` touches `registry.projects` at module scope, and `legacy-script.js` binds `projectDetailData` at top level. Switching to `fetch()` would make every one of those an async race, on a site with no module system to sequence them.

`data:generate` keeps the editable source as reviewable JSON while shipping a classic script that defines `window.KAAN_PORTFOLIO` synchronously. `qa-portfolio-data.js` regenerates the model in memory and compares it byte-for-byte against the committed artifact, so a stale `portfolio-data.js` fails CI rather than shipping.

**The generated file is committed on purpose. Never hand-edit `portfolio-data.js`.**

---

## Schema

### `projects.json` — flagship card records

Keyed by project id (`sinama`, `mergeRush`, `joyday`, `chatbotFlow`, `hospital`).

| Field | Type | Notes |
|---|---|---|
| `id` | string | Matches the key. |
| `name` | string | Card title. **Omitted when `detailSlug` is present** — projected from the detail record instead. |
| `detailSlug` | string | Cross-reference into `project-details.json`. Replaces `name` for linked projects. |
| `status` | `{en, tr}` | e.g. Live MVP / Canlı MVP. |
| `category` | `{en, tr}` | Positioning category. Deliberately differs from the detail record's technical category. |
| `role` | `{en, tr}` | Optional. |
| `summary` | `{en, tr}` | Card copy. Deliberately differs from the detail record's `subtitle`. |
| `stack` | string[] | Optional. |
| `proof`, `qaEvidence` | `{en, tr}`[] | Optional evidence bullets. |
| `links` | `{caseStudy?, live?, github?, games?}` | Role-keyed URLs. |
| `currentFocus` | `{en, tr}` | Optional. |

### `project-details.json` — archive detail records

Keyed by URL slug. **The slug is the public contract** — it appears in `project-detail.html?project=<slug>`.

| Field | Type | Present |
|---|---|---|
| `title`, `subtitle`, `category`, `role`, `type`, `status` | `{en, tr}` | all 25 |
| `overview`, `challenge`, `solution` | `{en, tr}` | all 25 |
| `features` | `{en: string[], tr: string[]}` | all 25 |
| `year` | string | all 25 |
| `image` | string (repo-relative) | all 25 |
| `gallery` | string[] (repo-relative) | all 25 |
| `stack` | string[] | all 25 |
| `links` | `{label: {en, tr}, url}[]` | all 25 |
| `impact` | `{en, tr}` | 3 records — optional |
| `process` | `{en: {title, text}[], tr: {...}[]}` | 4 records — optional |

Record order in the file **is** the site's Previous/Next navigation order. Reordering changes visible behaviour, so `qa:projects` asserts the order.

---

## Localization

Language-independent facts are stored **once**, never duplicated per language:

```jsonc
{
  "my-museum": {
    "title":  { "en": "...", "tr": "..." },   // localized
    "year":   "2024",                          // language-independent, stored once
    "image":  "assets/....webp",               // language-independent
    "stack":  ["Kotlin", "Firebase"],          // language-independent
    "links":  [{ "label": { "en": "...", "tr": "..." }, "url": "https://..." }]
  }
}
```

Slugs, ids, years, image paths, stack entries and link URLs have **no** language variants. Only human-facing prose is bilingual, as `{en, tr}` on the field itself.

There is no separate Turkish catalog. `applyLanguage()` re-renders from the same records.

---

## Consumers

| Consumer | Reads | Via |
|---|---|---|
| **Homepage** (`index.html`) | `registry.projects` | `portfolio-v2.js` |
| **Works** (`works.html`) | `registry.projects` + static cards linking to detail slugs | `portfolio-v2.js` |
| **Project Detail** (`project-detail.html`) | `registry.projectDetails` | `legacy-script.js` → `projectDetailData` |
| **Recruiter Mode** | `registry.recruiterProfiles[role].evidence[]` → `registry.projects[id]` | `portfolio-v2.js` |
| **Ajoop** | `registry.projects` for project answers | `portfolio-v2.js syncAjoop()` |
| **Build log / Labs / SINAMA evidence** | their own canonical JSON | `portfolio-v2.js` |
| **`qa-internal-links.js`** | `registry.projectDetails` for valid slugs | direct |

Ajoop's *conversational phrasing* is not project data and stays in the runtime — see below.

---

## Presentation Configuration

Deliberately **outside** the catalog. Do not migrate these in:

- **Homepage ordering and section headlines** — which project appears where is layout, not a project fact.
- **Recruiter role→evidence selection** (`recruiter-profiles.json:evidence`) — an editorial choice per role. It stores project *ids*, not project *facts*.
- **Ajoop conversational copy** — greetings, phrasing and fallback text are chatbot voice, not project facts. Ajoop reads project facts from the registry but keeps its own wording.
- **Card vs detail copy divergence** — `projects.json:category` is positioning ("Real Business Product"); `project-details.json:category` is technical ("Web Development"). Same for `summary` vs `subtitle` and some `status.tr` values. These are intentionally different strings for different audiences and were **not** collapsed.
- **Filters, animation, card layout** — CSS and markup.

---

## Compatibility Layer

**Yes, one — and it holds no project facts.**

`legacy-script.js` still exposes a `projectDetailData` binding because `renderProjectDetail()` and the Previous/Next navigation read it. It is now a single projection, not data:

```js
const projectDetailData =
  (window.KAAN_PORTFOLIO && window.KAAN_PORTFOLIO.projectDetails) || {};
```

The old `githubRepositoryProjectDetails` object and its `Object.assign` merge are gone; the split between "site projects" and "GitHub projects" was arbitrary — both used an identical schema and had zero overlapping slugs.

There is also one derivation in `scripts/portfolio-data-model.mjs`. Three projects appear in both catalogs and previously stored their title twice:

| Flagship id | Detail slug | Was duplicated |
|---|---|---|
| `joyday` | `atolye-joyday-official-website` | title |
| `hospital` | `hospital-form-app` | title |
| `chatbotFlow` | `ai-chatbot-flow-design` | title |

The detail record owns the title (it carries both languages). `projects.json` stores `detailSlug` instead of `name`, and `composeProjects()` projects `name` from `projectDetails[slug].title.en` — the same technique already used for `profile.github` / `profile.linkedin`. The generated output is byte-identical to before.

Shared **link URLs** between a flagship record and its detail record are still stored in both shapes, because the two link models differ (role-keyed object vs labelled array) and a derivation would have been fragile. `qa:projects` asserts they agree, so they cannot drift silently. This is the one remaining piece of guarded duplication.

---

## Adding a Project

**A detail page** (`project-detail.html?project=<slug>`):

1. Add a record to `data/portfolio/project-details.json`. Copy the shape of an existing entry — all 15 required fields, both languages.
2. Put images in `assets/` and reference them repo-relative.
3. Append the record where you want it in Previous/Next order.
4. Add the slug to `scripts/fixtures/project-catalog-baseline.json` (`slugOrder` and `records`) — this fixture is the anti-data-loss snapshot, so a genuinely new project is a deliberate update.
5. Run:

```bash
npm run data:generate && npm run qa:projects
```

**A flagship card** (homepage / Works / Recruiter evidence):

1. Add an entry to `data/portfolio/projects.json`. If it also has a detail record, use `detailSlug` instead of `name`.
2. Reference its id from `recruiter-profiles.json:evidence` if it should appear in Recruiter Mode.
3. Regenerate and run QA as above.

---

## Editing a Project

Edit the JSON, regenerate, run QA:

```bash
npm run data:generate && npm run qa:projects
```

- Titles, copy, links, stack, media → the record in `data/portfolio/`.
- For a linked project, the **title lives in the detail record only**; the card name follows automatically.
- Never edit `portfolio-data.js` — it is regenerated and `qa:data` will fail.
- Never add project facts to `legacy-script.js` or `portfolio-v2.js` — `qa:projects` has a drift guard for this.

Changing a title, category, link, image, year, or the field set of a record will fail `qa:projects` against the baseline fixture. That is intentional: update the fixture in the same commit so the change is visible in review.

## Removing / Archiving a Project

**Archiving is not deletion.** A project that no longer appears on the homepage keeps its detail record — its URL may be linked externally or indexed.

- **To hide from the homepage/Works**: remove it from `projects.json` and from any `recruiter-profiles.json:evidence` list. Keep the `project-details.json` record.
- **To truly remove**: delete the `project-details.json` record *and* its entry in the baseline fixture, *and* remove every internal link to `project-detail.html?project=<slug>` (`qa:links` will fail otherwise). Removing a slug breaks any external link to it — treat it as a breaking change.
- Never delete a record just because it is old or unfeatured.

---

## Future Automation Contract

A later roadmap phase may generate or update project records automatically (GitHub → n8n → Gemini → human review → PR).

The contract for any such tooling:

1. **Write to `data/portfolio/*.json` only.** Never to `portfolio-data.js`, `legacy-script.js` or `portfolio-v2.js`.
2. **Open a pull request.** No direct pushes — every factual change stays human-reviewed, consistent with the fact-checking rule in `CLAUDE.md`.
3. **Run `npm run data:generate` and commit the regenerated registry** in the same PR, or CI fails on a stale artifact.
4. **Update `scripts/fixtures/project-catalog-baseline.json`** when a change is intentional, so the diff shows exactly which project contracts moved.
5. **Preserve every existing slug** unless a human explicitly approves a removal.

None of this is implemented. It is recorded so the data layer stays automation-ready without anyone guessing at the rules later.
