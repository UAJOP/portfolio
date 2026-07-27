# Kaan Balcı — Portfolio

Source code for [kaanbalci.com](https://kaanbalci.com), the professional portfolio of **Kaan Balcı — AI Designer & Software Developer**.

## Professional focus

- Conversational AI and chatbot flow design
- Solution engineering
- LLM response, reasoning, code and multimodal evaluation
- Workflow automation and n8n-style logic
- User-centered software products
- Python, C#/.NET, JavaScript, PHP and SQL

Game development, mobile development and interactive projects remain part of the wider portfolio, while the main public positioning is centered on AI and software roles.

## Main pages

- `index.html` — Landing page, focus areas, recent experience, selected work and contact hub
- `works.html` — Filterable project catalog
- `games.html` — Interactive web games catalog
- `adventure.html` — Career Adventure mini game
- `joyday-paint.html` — Joyday Action Painting experience
- `ai-flow-puzzle.html` — n8n-inspired chatbot workflow puzzle
- `project-detail.html` — Dynamic project detail page
- `blog.html` — Professional experience timeline
- `single-work.html` — Training and course certificate gallery
- `about.html` — Professional profile and capability map
- `request.html` — Project request form
- `script.js` — Navigation, EN/TR translation, Ajoop, Recruiter Mode, Command Palette and dynamic project content
- `style.css` — Responsive site styling

## Resume

All public resume actions use one centralized resume URL in `script.js`:

```js
const resumeLink = "https://drive.google.com/file/d/1eERVaYoP-ICuP3xfbzpaDaCo5amwqA8u/view?usp=sharing";
```

Public buttons use labels such as **View Resume** or **Download Resume**. Role-specific application CVs are intentionally not exposed on the website.

## Current links

- Portfolio: [kaanbalci.com](https://kaanbalci.com)
- Resume: [View Resume](https://drive.google.com/file/d/1eERVaYoP-ICuP3xfbzpaDaCo5amwqA8u/view?usp=sharing)
- LinkedIn: [linkedin.com/in/balcikaan](https://www.linkedin.com/in/balcikaan/)
- GitHub: [github.com/UAJOP](https://github.com/UAJOP)
- Email: [kaanb8776@gmail.com](mailto:kaanb8776@gmail.com)

## Deployment

The repository is configured for GitHub Pages with the custom domain in `CNAME`.

Keep the existing `assets` directory unchanged when replacing the updated code files, because the HTML pages reference the current portfolio images, certificates and logos from that directory.
