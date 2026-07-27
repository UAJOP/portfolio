# Kaanbalci.com — Career Alignment 2026

Branch: `career-alignment-2026`

## Scope completed

- Repositioned the public profile around **AI Designer & Software Developer**.
- Prioritized Conversational AI, Solution Engineering, LLM Evaluation, Workflow Automation and user-centered software products.
- Removed GPA/GNO from visible and hidden website content.
- Contextualized the 50+ project statement as academic, personal, freelance and team-based contributions.
- Corrected Atölye Joyday, CBOT, Outlier AI, Punto Organization and Ocean’s Team titles, dates and descriptions.
- Moved Gameathon and Mobidictum out of the professional employment timeline into a secondary activities section.
- Reworked Recruiter Mode around one profile, evidence, role fit, selected projects and one resume action.
- Updated Ajoop, Command Palette, translations and dynamic content to use the same career truth set.
- Centralized every public resume action through one JavaScript constant:

```js
const resumeLink = "https://drive.google.com/file/d/1eERVaYoP-ICuP3xfbzpaDaCo5amwqA8u/view?usp=sharing";
```

- Removed the old resume ID and all public role-specific resume options.
- Removed the outdated Portfolio PDF action until a revised portfolio PDF is available.
- Added `games.html` to `sitemap.xml`.

## Changed files

- `index.html`
- `blog.html`
- `about.html`
- `works.html`
- `script.js`
- `style.css`
- `sitemap.xml`
- `README.md`

## Validation performed

- JavaScript syntax validation for all `.js` files.
- Static HTML validation across all pages.
- Checked for duplicate IDs, missing internal page links and missing page titles/H1 elements.
- Forbidden-claim scan for GPA/GNO, outdated titles, predictive-algorithm claims, old resume IDs and outdated portfolio PDF links.
- Responsive browser tests at 1440, 1024, 768, 430, 390 and 360 px widths.
- Desktop and mobile smoke tests for `index.html`, `blog.html` and `about.html`.
- Interaction tests for:
  - Theme switching
  - Turkish/English switching
  - Mobile navigation
  - Recruiter Mode
  - Command Palette
  - Ajoop resume response
  - Hero and About resume buttons
- No horizontal overflow, JavaScript console errors or page errors were detected in the tested flows.

## Deployment notes

- Keep the existing repository `assets/` folder unchanged.
- Upload/merge the changed source files from this package.
- Confirm that the Google Drive resume is publicly viewable in an incognito browser before production deployment.
- After deployment, run a live smoke test on `https://kaanbalci.com` because external CDN resources and GitHub Pages routing cannot be fully reproduced in the local package.

## Remaining work for later stages

- Reorganize Works into Selected Work and Project Archive.
- Create stronger static case-study pages for the most important projects.
- Review certificate names, issuers, dates and URLs against official records.
- Complete project-detail SEO/noindex and sitemap decisions.
- Create and reconnect a revised Portfolio PDF only after its content matches the website, CV, LinkedIn and GitHub.
