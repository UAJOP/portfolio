# V4-E06.5 — GitHub / Works / case-study coverage

Every UAJOP repository has one explicit disposition. Auditing a repository
does not make it a project: only work with real, inspectable scope is a
standalone public identity. The public pages stay curated.

Audited 2026-10-09 against `gh repo list UAJOP` (32 repositories: 24 public, 8
private). For each one the file tree was read through the GitHub API, and the
source files named below were read; READMEs were treated as claims to check,
not as evidence.

## Result

| | Count |
| --- | ---: |
| Repositories audited | 32 / 32 |
| Standalone public project identities | 22 |
| Learning collection (one entry on Works) | 1, with 9 member artifacts |
| Repositories not represented at all | 6 |

Dispositions: featured 3 · project 5 · game 7 · archive 1 · learning 7 ·
superseded 3 · private 3 · exclude 3.

The 22 identities: SINAMA, AJOOP, kaanbalci.com, Atölye Joyday, AI Chatbot Flow
Design, Merge Rush, AI Flow Puzzle, Career Adventure, Joyday Action Painting,
Hospital Form App; MyMuseum, Hospital Appointment System, Agency DB, Cars
Dataset Analysis, Control Panel; Escape Island, Warehouse War, Drivenfinity,
Dunker Madness, Tank Savage, Extract Shoot: Zero, Legacy of the Lost. Twelve of
them come from a public repository; the other ten are portfolio-native
products or products whose source is private.

## Where it lives

| Piece | File |
| --- | --- |
| Coverage registry: identities, the collection, relations, the 32 repositories | `data/portfolio/catalog.json` (build-time only; never bundled) |
| Source-audited corrections to project copy, five locales | `scripts/v4-e06-5-project-truth.mjs` |
| Catalog section on Works, native archive on Games | `scripts/v4-e06-5-catalog.mjs`, `css/v4-catalog.css` |
| New and updated case studies | `scripts/v4-e06-5-case-studies.mjs` |
| Coverage gate | `scripts/qa-v4-works-coverage.mjs` (`npm run qa:v4:works-coverage`) |
| Browser QA and review pack | `scripts/v4-e06-6-works-presentation-review.mjs` (supersedes the E06.5 script; see `docs/v4-e06-6-works-presentation.md`) |
| Retired project pages, with reasons | `retired` in `scripts/fixtures/project-catalog-baseline.json` |

## Why each non-project repository is not a standalone project

| Repository | Disposition | Why it is not a standalone project | Where it is represented |
| --- | --- | --- | --- |
| UAJOP/UAJOP | exclude | A profile README. | Nowhere |
| UAJOP/desktop-tutorial | exclude | GitHub's tutorial repository; one README. | Nowhere |
| UAJOP/Dashboard | exclude | Unmodified AdminLTE 3.0.5 by Colorlib; no authored code was found. | Nowhere |
| UAJOP/ActionPainting | private | A saved mirror of a third-party Shopify site kept as reference; not authored work. | Nowhere |
| UAJOP/Joyday | superseded | A byte-identical copy of Mandelas-Web-site-Project (45 of 46 files). | Nowhere (duplicate) |
| UAJOP/Porto9 | superseded | A single Tailwind page; an older, private iteration of the portfolio. | Nowhere; kaanbalci.com stands in its place |
| UAJOP/Joydayv2 | private | Private source. The project is the live business site, not the repository. | Through the Atölye Joyday identity |
| UAJOP/merge-rush-tiny-factory | featured (private) | Private source. The project is the playable game. | Through the Merge Rush identity |
| UAJOP/Weather-App | learning | One 241-byte HTML skeleton with an empty body. Nothing was built. | Collection member, no page |
| UAJOP/Calculator-JavaScript | learning | Keypad markup and CSS; `script.js` is 0 bytes, so nothing calculates. | Collection member, no page |
| UAJOP/My-java-projects | learning | About fifty unrelated course exercises; a collection, not a project. | Collection member, archive page |
| UAJOP/Pyhton-Projects | learning | Beginner-course scripts followed lesson by lesson; a collection. | Collection member, archive page |
| UAJOP/Calculator-Android-Studio | learning | A single-activity exercise. | Collection member, archive page |
| UAJOP/Mandelas-Web-site-Project | learning | A course exercise built on tutorial content with placeholder data. | Collection member, archive page |
| UAJOP/UnityEssentials | learning | Unity's own learning project with a few small authored scripts. | Collection member, archive page |
| UAJOP/Porto-25 | superseded | A single Tailwind page superseded by kaanbalci.com. | Collection member, archive page |
| UAJOP/Ic-Supply | private | A third-party storefront copy plus two authored PHP scripts; private. | Collection member, archive page, no repository link |

## The 32 repositories

**W** Works surface, **G** Games surface, **CS** case study, **GH** public
GitHub link shown. "Curated" is a card in the Works explorer; "catalog" is a
row in the complete catalog; "member" is a line in the learning collection.

| # | Repository | Visibility | Evidence inspected | Classification | Canonical identity | Public status | W | G | CS | Play | Live | GH | Download / video | Superseded / private relation | Missing assets | Action taken | Notes / limitations |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | UAJOP/UAJOP | public | tree (1 README) | exclude | — | not published | — | — | — | — | — | — | — | — | — | recorded | Profile README |
| 2 | UAJOP/desktop-tutorial | private | tree (1 README) | exclude | — | not published | — | — | — | — | — | — | — | — | — | recorded | GitHub Desktop tutorial |
| 3 | UAJOP/MyMuseum | public | tree, README audit section, Gradle files | project | `my-museum` | Academic Project | catalog | — | — | — | — | yes | — | — | — | status relabelled | Debug build verified by the repo's own 2026-07-29 audit |
| 4 | UAJOP/Hospital-Appointment-System | public | tree, README verification table, schema | project | `hospital-appointment-system` | Academic Project | curated + catalog | — | — | — | — | yes | — | same domain as Hospital System, different project | — | status relabelled | Compiles; end-to-end flows not run against MySQL |
| 5 | UAJOP/Agency-Db | public | tree, README, SQL listing | project | `agency-db` | Academic Project | catalog | — | — | — | — | yes | — | — | — | copy rewritten from source | 11 tables, 7 FKs, 10 procedures, 3 triggers; synthetic data |
| 6 | UAJOP/Cars-Dataset-Analysis | public | tree, README, notebook listing | project | `cars-dataset-analysis` | Academic Project | curated + catalog | — | — | — | — | yes | video (YouTube, 200) | — | — | status relabelled; video link added | 100-row educational dataset |
| 7 | UAJOP/My-java-projects | public | tree (50 IntelliJ projects, 146 `.java`) | learning | — (collection) | Learning Project | member | — | — | — | — | yes | — | — | — | copy rewritten | README names applications the tree does not show; not repeated |
| 8 | UAJOP/Calculator-Android-Studio | public | tree (one `MainActivity.kt`) | learning | — (collection) | Learning Project | member | — | — | — | — | yes | — | — | — | copy rewritten | README says Java; the source is Kotlin |
| 9 | UAJOP/Calculator-JavaScript | public | `index.html`, tree | learning | — (collection) | Incomplete | member, no page | — | — | — | — | yes | — | — | working logic | **page retired** | `script.js` is 0 bytes |
| 10 | UAJOP/Dashboard | public | tree (2,181 files), `package.json`, licences | exclude | — | not published | — | — | — | — | — | — | — | — | — | recorded | Unmodified AdminLTE 3.0.5 |
| 11 | UAJOP/Weather-App | public | `index.html` (241 bytes) | learning | — (collection) | Incomplete | member, no page | — | — | — | — | yes | — | — | everything | **page retired**; `Wheather-App` fixed | Empty HTML skeleton |
| 12 | UAJOP/Porto-25 | public | tree, page title | superseded | — (collection) | Superseded | member | — | — | — | — | yes | — | superseded by kaanbalci.com | — | status relabelled | Single Tailwind page |
| 13 | UAJOP/Ic-Supply | private | tree, `db.sql`, `giris.php`, `kayit.php`, `index.php` head | private | — (collection) | Private Archive | member | — | — | — | — | **removed** | — | private; no link | — | copy rewritten to authored scope | Third-party storefront copy; authored PHP login/registration |
| 14 | UAJOP/portfolio | public | this repository | featured | `portfolio-v4` | In production | catalog | hosts 4 games | `/portfolio-case-study/` (new) | — | kaanbalci.com | yes | — | stands in place of Porto-25, Porto9 | — | case study written | — |
| 15 | UAJOP/Control-Panel | public | tree, `create.sql`, `api/user/login.php` | project | `control-panel` | Academic Project | catalog | — | — | — | — | yes | — | — | — | copy rewritten from source | Code read, not run |
| 16 | UAJOP/Pyhton-Projects | public | tree (164 `.py`) | learning | — (collection) | Learning Project | member | — | — | — | — | yes | — | — | — | copy rewritten | Mostly a beginner course |
| 17 | UAJOP/Mandelas-Web-site-Project | public | `index.html`, tree | learning | — (collection) | Learning Project | member | — | — | — | — | yes | — | duplicated by private `Joyday` | — | copy rewritten | Static HTML/CSS; README's JavaScript and Bootstrap are not in the source |
| 18 | UAJOP/Porto9 | private | tree, page title | superseded | — | not published | — | — | — | — | — | — | — | superseded by kaanbalci.com | — | recorded | Single Tailwind page |
| 19 | UAJOP/Hospital-System | public | tree, README | archive | `hospital-system` | Source Archive | curated + catalog | — | `/hospital-system-case-study/` | — | — | yes | — | same domain as Hospital Appointment System | — | unchanged | — |
| 20 | UAJOP/Warehouse-War | public | tree, `.uproject` | game | `warehouse-war` | Prototype | catalog | native archive | — | — | — | yes | Drive folder not published (unverified) | — | gameplay media | copy rewritten | UE 5.4, Blueprint only |
| 21 | UAJOP/EscapeIsland | public | tree, `.uproject`, `MovingPlatform.cpp` | game | `escape-island` | Prototype | catalog | native archive | — | — | — | yes | — | — | — | copy rewritten | UE 5.4; one C++ actor |
| 22 | UAJOP/UnityEssentials | public | README, tree, `ProjectVersion.txt`, script list | learning | — (collection) | Learning Project | member | — | — | — | — | yes | — | **unrelated to AJOOP** | — | retitled; disambiguation added | README calls it "Ajoop" |
| 23 | UAJOP/ExtractShoot-Zero | public | tree (media + README) | game | `extract-shoot-zero` | Media Archive | catalog | native archive | — | — | — | yes | Drive folder not published (unverified) | — | project source | copy rewritten; C++ claim removed | No source in the repository |
| 24 | UAJOP/LegacyOfTheLost | public | tree (media, 3 PDFs) | game | `legacy-of-the-lost` | Media Archive | curated + catalog | native archive | — | — | — | yes | Drive folder not published (unverified) | — | project source | copy rewritten | No source in the repository |
| 25 | UAJOP/TankSavage | public | tree (media, 3 PDFs) | game | `tank-savage` | Media Archive | catalog | native archive | — | — | — | yes | Drive folder not published (unverified) | — | project source | copy rewritten; C++ claim removed | No source in the repository |
| 26 | UAJOP/DunkerMadness | public | tree, `BallHandler.cs`, `ProjectVersion.txt` | game | `dunker-madness` | Prototype | catalog | native archive | — | — | — | yes | — | — | — | copy rewritten | Unity 2020.2; one script, one scene |
| 27 | UAJOP/Drivenfinity | public | tree, 4 scripts, `ProjectVersion.txt` | game | `drivenfinity` | Prototype | catalog | native archive | — | — | — | yes | video file in repo, not published | — | — | copy corrected | Four authored scripts on a third-party art pack |
| 28 | UAJOP/ActionPainting | private | tree (`theactionpainters.com/…`) | private | — | not published | — | — | — | — | — | — | — | not authored; not the Joyday game | — | recorded | Third-party site mirror |
| 29 | UAJOP/Joyday | private | tree, blob hashes | superseded | — | not published | — | — | — | — | — | — | — | duplicate of Mandelas-Web-site-Project | — | recorded | Not an earlier Joyday site |
| 30 | UAJOP/Joydayv2 | private | tree | private | `atolye-joyday` | In production (the live site) | curated + catalog | — | `/atolye-joyday-case-study/` | — | atolyejoyday.com | — | — | private source of the live site | — | unchanged | — |
| 31 | UAJOP/sinama | public | tree | featured | `sinama` | In production | curated + catalog | — | `/sinama-case-study/` | — | sinama.kaanbalci.com | yes | — | — | — | unchanged | — |
| 32 | UAJOP/merge-rush-tiny-factory | private | full source (E06.4) | featured | `merge-rush` | Playable | curated + catalog | browser playable | `/merge-rush-case-study/` | `/merge-rush/` | — | — | — | private source → public build | — | canonical record normalised | — |

## Portfolio-native products (no repository of their own)

| Product | Canonical identity | Works | Games | Case study | Play | Live |
| --- | --- | --- | --- | --- | --- | --- |
| AJOOP | `ajoop` | catalog | — | `/ajoop-case-study/` | `/ajoop/` | — |
| AI Flow Puzzle | `ai-flow-puzzle` | curated + catalog | browser playable | `/ai-flow-puzzle-case-study/` (V4 section added) | `/ai-flow-puzzle/` | — |
| Career Adventure | `career-adventure` | catalog | browser playable | `/career-adventure-case-study/` (new) | `/adventure/` | — |
| Joyday Action Painting | `joyday-action-painting` | catalog | browser playable | `/atolye-joyday-case-study/` (section added) | `/joyday-paint/` | — |
| kaanbalci.com V4 | `portfolio-v4` | catalog | — | `/portfolio-case-study/` (new) | — | kaanbalci.com |
| AI Chatbot Flow Design | `ai-chatbot-flow-design` | curated + catalog | — | `/projects/ai-chatbot-flow-design/` | — | — |
| Atölye Joyday | `atolye-joyday` | curated + catalog | — | `/atolye-joyday-case-study/` | — | atolyejoyday.com |
| SINAMA | `sinama` | curated + catalog | — | `/sinama-case-study/` | — | sinama.kaanbalci.com |
| Merge Rush | `merge-rush` | curated + catalog | browser playable | `/merge-rush-case-study/` | `/merge-rush/` | — |

## Hierarchy

- **Works, first read (unchanged):** the curated explorer of ten cards with
  its filter, Grid, System Map and Capability View. The System Map and the
  Capability View show those ten projects and nothing else.
- **Works, behind it:** "Complete catalog": Current work (10), Software, data
  & mobile (5), Native game archive (7), then one collection, "Earlier
  learning & small experiments" (9 member lines), then the factual relations
  (8) and the capability evidence. Every group is collapsed on load and is a
  native `<details>`.
- **Games:** four browser games, each with Play and Case Study; below them the
  native archive (7), none of which runs in the browser.
- **Home:** unchanged.

## Truth corrections

- Weather App and Calculator JavaScript: project pages retired in five
  locales; both are named in the learning collection as incomplete, with no
  page. `Wheather-App` is corrected to `Weather-App` everywhere.
- Calculator Android: Kotlin, not Java.
- Mandelas: static HTML/CSS; no JavaScript, Bootstrap or contact-form claims.
- IC Supply: no longer an "inventory system"; authored scope only; the private
  link is removed (it returned 404 to visitors).
- Extract Shoot: Zero, Tank Savage: C++ claims removed (no source published).
- Dunker Madness: "enemy tower destruction" removed.
- Unity Essentials: retitled; the page states the old "Ajoop" name is
  unrelated to AJOOP; it is a collection member, not an identity beside AJOOP.
- Merge Rush canonical record: Playable V1, five factory levels, no footprint
  claim.
- Twelve pages shared one boilerplate "challenge" and "solution" paragraph;
  the ten that remain are rewritten. The project template no longer invents
  an "impact" paragraph or a four-step "process".
- Status "Repository" is replaced by what the project is.
- The assistant's public knowledge (`data/portfolio/ajoop-master-knowledge.json`,
  data only): Merge Rush status and proof; the stacks and categories of
  Weather App, Calculator JavaScript, Calculator Android, IC Supply, Mandelas,
  the eight native games, the portfolio and Career Adventure.

## Gates

- `npm run qa:v4:works-coverage`: 714 checks. It now also fails if a learning,
  incomplete, private-archive or superseded artifact is a standalone identity.
- Browser QA at E06.5: 63 checks on the production build. Since E06.6 the
  catalog is cards and the browser QA is
  `scripts/v4-e06-6-works-presentation-review.mjs`.
- Pass: `qa:data`, `qa:i18n`, `qa:routes`, `qa:foundation`, `qa:projects`,
  `qa:seo`, `qa:performance`, `qa:css`, `qa:design`, `qa:a11y:static`,
  `qa:recruiter`, `qa:analytics`, `qa:js`, `qa:assets`, `qa:links`, `qa:html`,
  `qa:spelling`, `qa:portfolio`, `qa:ajoop:knowledge`, `qa:ajoop:facts`,
  `qa:ajoop:retrieval`, `qa:ajoop:answer`.
- **Owner-connector check** (`scripts/qa-ajoop-turn-feedback.mjs`, section 11):
  a lazy `import()` is no longer a finding by syntax. It is judged by what it
  can load: a literal target, or a target declared by the build for a `data-*`
  attribute, must be a published, owner-free module of this site. Anything
  computed, remote, unpublished or owner-related is still a finding; six
  controls in the gate prove each case. No file is named in the rule.
- **Pinned slug counts.** Four gates pinned 25 project slugs. They now read
  the two retirements from `retired` in the baseline fixture (`qa:projects`,
  `qa:analytics`) or state 23 with the reason (`qa:i18n`, `qa:routes`). A slug
  can leave the catalog only by being named there with its reason.
- Inherited, not rewritten, not re-run here: `qa:runtime`, `qa:m3:foundation`
  (see `docs/v4-e06-4-merge-rush.md`), and the `qa:m3` parity gates.

## For E07 / E08

- **Intermittent view-transition error.** Once in three runs of the E06.4
  browser checks, the navigation from `/merge-rush-case-study/` to
  `/merge-rush/` logged `AbortError: Transition was skipped`. After the
  E06.5 changes it did not occur in three further runs, and nothing in E06.5
  touches either page's transition, so it is not treated as a regression. It
  is the browser skipping a cross-document view transition; the incoming page
  carries the script that is meant to absorb that rejection.
- **GitHub "homepage" fields** of Weather-App and Calculator-JavaScript still
  point at their retired project pages. They are repository settings, outside
  this repository.
- **Assistant index.** The knowledge file changed; a deployed vector index
  would need re-ingesting from it.
- Legacy source documents for the accepted case studies still carry their old
  copy; they are not what the production build serves.
- Download links found in READMEs (Google Drive folders) are not published;
  they could not be verified without signing in.
