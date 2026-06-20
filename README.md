# Kaan Balcı - Modern Portfolio

This repository contains the source code for **[kaanbalci.com](https://kaanbalci.com)**, a modern personal portfolio website for Kaan Balcı.

## Focus

The website presents Kaan Balcı as an **AI Designer & Software Developer** with experience in:

- AI workflow and chatbot design
- n8n-based automation logic
- LLM response, prompt and code output evaluation
- Backend, web and mobile development
- Python, C#, JavaScript, PHP, MySQL and Firebase projects
- Unity and Unreal Engine game development

## Pages

- `index.html` — Modern landing page with hero, stats, services, tech stack matrix, AI workflow demo, featured case study, experience preview and featured works
- `works.html` — Filterable project catalog with cards linking into dynamic case study pages
- `project-detail.html` — Single dynamic project detail page powered by query parameters and JavaScript data
- `request.html` — Project/service request page with frontend validation, mailto fallback and Google Apps Script endpoint support
- `request-config.js` — Request form endpoint configuration
- `google-apps-script-request-form.gs` — Optional Google Apps Script handler for direct email sending and confirmation emails
- `blog.html` — Experience timeline page; kept as `blog.html` for existing URL compatibility
- `single-work.html` — Certificates gallery; kept as `single-work.html` for existing URL compatibility
- `about.html` — Professional profile, capability map, process and toolbox
- `style.css` — Full responsive modern UI styling
- `script.js` — Mobile navigation, project filters, certificate modal, language switcher, dynamic project detail rendering, Ajoop assistant, theme switching, recruiter mode, command palette, easter egg, Algorithmic 3D Lab and dynamic year
- `CNAME` — GitHub Pages custom domain configuration

## Notes

The ZIP contains code files only. Keep the existing `assets` folder in the repository unchanged, because the pages reference the current portfolio images, certificates and logo files from that folder.

## Local Usage

Open `index.html` directly in your browser or use a local server such as VS Code Live Server.

## Contact

- Website: [kaanbalci.com](https://kaanbalci.com)
- Resume: [Google Drive CV](https://drive.google.com/file/d/1vihEXLism6UzQXP70XxWbJboeiaPllgH/view?usp=drive_link)
- LinkedIn: [linkedin.com/in/balcikaan](https://www.linkedin.com/in/balcikaan/)
- GitHub: [github.com/UAJOP](https://github.com/UAJOP)
- Email: [kaanb8776@gmail.com](mailto:kaanb8776@gmail.com)


## Final enhancement pass

This version also adds:

- Featured Atölye Joyday case study on the homepage
- Tech stack matrix and Currently Building sections
- Interactive AI workflow demo
- GitHub experiments section
- Stronger contact hub
- Result / Impact and Process Timeline blocks for dynamic project details
- Dedicated Atölye Joyday Official Website project card and case study
- Additional Joyday preview images under `assets/`


## Latest polish

- Added persistent dark/light theme toggle.
- Renamed the frontend portfolio chatbot to **Ajoop**.
- Removed the visible intent/rule-based subtitle from the chatbot header.
- Added small frontend performance polish while keeping the site static and GitHub Pages friendly.


## Ultimate additions

- Recruiter Mode drawer for a compact hiring-focused profile view
- Ctrl/Cmd + K command palette for fast site navigation
- Project search on the Works page
- Downloadable portfolio PDF at `assets/kaan-balci-portfolio.pdf`
- Custom `404.html`, `robots.txt`, `sitemap.xml` and JSON-LD SEO metadata
- Copy Project Link action on dynamic project detail pages
- Availability badge in the header
- Milestone Journey section on the About page
- Ajoop chatbot navigation actions with direct links to key pages and files


## Latest Creative Enhancements

- Hidden Ajoop-style easter egg with fireworks, screen shake and congratulation message.
- Homepage Algorithmic 3D Lab built with vanilla JavaScript canvas, triangular mesh generation, perspective projection and mouse interaction.
- Small optimization pass using lazy images, async decoding, content-visibility and IntersectionObserver-based rendering.


## Request Form Email Setup

The request page is static-site friendly. By default it opens a mail draft as a fallback. To make it send email directly from the website, deploy `google-apps-script-request-form.gs` as a Google Apps Script Web App and paste the Web App URL into `request-config.js` as `window.KAAN_REQUEST_FORM_ENDPOINT`.

## Request Form Connection

This version connects the portfolio request page to the provided Google Apps Script Web App endpoint and adds a Google Forms fallback button.

- Website form endpoint: configured in `request-config.js`
- Google Forms fallback: configured in `request-config.js`
- Apps Script file: `google-apps-script-request-form.gs`

The Apps Script saves website form submissions into a `Website Talepleri` sheet, sends a notification email to the owner, and sends a confirmation email to the requester. The optional `onFormSubmit` trigger supports Google Forms submissions as a fallback flow.


## Visual QA Fixes

- Joyday project images replaced with clean official website/reservation visuals.
- Contact hub layout adjusted to prevent oversized text wrapping.
- Joyday gallery images use contain-fit to avoid cropping.

## Publish-ready visual fix pass

This version fixes the Atölye Joyday reservation workflow detail page image issue by standardizing the image references to the existing `assets/joyday-homepage-preview.webp`, `assets/joyday-reservation-preview.webp` and `assets/joyday-brand-logo.webp` files. It also includes compatibility aliases for the previous `*-clean.webp` filenames and adds a small global image fallback for broken preview images.



## Final consolidated adventure polish

- Merged the Adventure page with the previous contact, search, recruiter drawer and Ajoop improvements.
- Added Adventure/Macera to every site navigation header.
- Standardized the command/search button as `Ara` across pages while keeping the keyboard palette behavior.
- Fixed duplicated chatbot panel markup created during iterative updates.
- Kept the contact hub button grid balanced and the Career Merge mobile/merge fixes active.


## GitHub repository catalog expansion

- Expanded the Works page with additional public GitHub repositories from `github.com/UAJOP`.
- Added dynamic project detail data for the newly surfaced repositories.
- Fixed the Dunker Madness card path and removed the stray slash character before project tags.
- Preserved Adventure mini game, Ajoop improvements, IK Mode, search palette and contact hub layout fixes.

## Live-ready final polish

- Standardized English header labels; `Search` is now English in EN mode and `Ara` in TR mode.
- Aligned Outlier AI dates with the uploaded CV: Apr 2025 – Aug 2025.
- Converted remaining relative Open Graph images to absolute `kaanbalci.com` URLs for stronger social previews.
- Added Turkish aria-label coverage for the expanded GitHub project catalog.
- Made request-form success copy safer for the static-site Google Apps Script `no-cors` flow.



## Final repository cleanup

- Updated Hospital Appointment System with accurate Python / Tkinter / MySQL case-study content and GitHub link alignment.
- Updated Porto 25 as a Tailwind CSS portfolio / landing page UI practice project.
- Removed extra Joyday-related cards including `Joyday Repository` and the separate Atölye Joyday Reservation Workflow card, keeping one main Atölye Joyday official website case study.
