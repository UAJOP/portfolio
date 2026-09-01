/**
 * Shared recruiter/palette copy and static label synchronisation.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 3127-3600.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
const ultimateContent = {
  en: {
    recruiterLabel: "Recruiter Mode",
    recruiterOpenLabel: "Open recruiter mode",
    recruiterCloseLabel: "Close recruiter mode",
    recruiterTitle: "Recruiter snapshot",
    recruiterLead:
      "A concise, evidence-based profile for conversational AI, solution engineering, LLM evaluation, workflow automation and software opportunities.",
    availability: "Open for work",
    skillsTitle: "Top skills",
    projectsTitle: "Best evidence",
    commandsTitle: "Search",
    commandDialogLabel: "Search palette",
    commandPlaceholder: "Search page, project or command...",
    noResults: "No command found.",
    projectSearchPlaceholder: "Search by project, technology or keyword...",
    projectSearchLabel: "Search projects",
    copyDone: "Copied",
    commands: [
      {
        id: "home",
        label: "Go to Home",
        hint: "Landing page",
        keywords: "home landing",
        type: "nav",
        value: "index.html",
      },
      {
        id: "works",
        label: "Open Works",
        hint: "Project catalog",
        keywords: "projects works portfolio",
        type: "nav",
        value: "works.html",
      },
      {
        id: "sinama-case-study",
        label: "View SINAMA Case Study",
        hint: "AI agent reliability lab case study",
        keywords:
          "sinama ai agent reliability lab regression evaluation case study",
        type: "nav",
        value: "sinama-case-study.html",
      },
      {
        id: "sinama-live",
        label: "Open SINAMA Live Product",
        hint: "Live AI agent reliability lab",
        keywords: "sinama live product ai agent reliability lab",
        type: "nav",
        value: "https://sinama.kaanbalci.com",
        external: true,
      },
      {
        id: "games",
        label: "Open Games",
        hint: "Playable mini games",
        keywords: "games oyun mini web canvas",
        type: "nav",
        value: "games.html",
      },
      {
        id: "joyday-paint",
        label: "Open Joyday Painting",
        hint: "Virtual action painting game",
        keywords: "joyday painting action canvas paint game png",
        type: "nav",
        value: "joyday-paint.html",
      },
      {
        id: "ai-flow-puzzle-play",
        label: "Play AI Flow Puzzle",
        hint: "n8n-style chatbot workflow game",
        keywords: "ai flow puzzle n8n chatbot workflow automation game",
        type: "nav",
        value: "ai-flow-puzzle.html",
      },
      {
        id: "ai-flow-puzzle-case-study",
        label: "View AI Flow Puzzle Case Study",
        hint: "Design and technical case study",
        keywords: "ai flow puzzle case study node validation fallback",
        type: "nav",
        value: "ai-flow-puzzle-case-study.html",
      },
      {
        id: "adventure",
        label: "Open Adventure",
        hint: "Career merge mini game",
        keywords: "adventure game mini career merge job kaan",
        type: "nav",
        value: "adventure.html",
      },
      {
        id: "joyday-case-study",
        label: "View Atölye Joyday Case Study",
        hint: "Live business and digital product case study",
        keywords: "atolye joyday case study reservation digital product",
        type: "nav",
        value: "atolye-joyday-case-study.html",
      },
      {
        id: "joyday-live",
        label: "Open Atölye Joyday Website",
        hint: "Live creative workshop website",
        keywords: "atolye joyday live website business",
        type: "nav",
        value: "https://atolyejoyday.com/",
        external: true,
      },
      {
        id: "hospital-system-case-study",
        label: "View Hospital System Case Study",
        hint: "2024 C# Windows Forms source-archive case study",
        keywords:
          "hospital system form app c# windows forms sql server case study",
        type: "nav",
        value: "hospital-system-case-study.html",
      },
      {
        id: "hospital-system-source",
        label: "Open Hospital System Source Archive",
        hint: "Public C# project archive",
        keywords: "hospital system source archive github c# windows forms",
        type: "nav",
        value: "https://github.com/UAJOP/Hospital-System",
        external: true,
      },
      {
        id: "cv",
        label: "View Resume",
        hint: "Google Drive CV",
        keywords: "resume cv",
        type: "resume",
      },
      {
        id: "github",
        label: "Open GitHub",
        hint: "UAJOP repositories",
        keywords: "github repo code",
        type: "nav",
        value: "https://github.com/UAJOP",
        external: true,
      },
      {
        id: "linkedin",
        label: "Open LinkedIn",
        hint: "Professional profile",
        keywords: "linkedin contact",
        type: "nav",
        value: "https://www.linkedin.com/in/balcikaan/",
        external: true,
      },
      {
        id: "theme",
        label: "Switch Theme",
        hint: "Dark / Light",
        keywords: "theme dark light",
        type: "theme",
      },
      {
        id: "language",
        label: "Switch Language",
        hint: "EN / TR",
        keywords: "language tr en",
        type: "language",
      },
      {
        id: "ajoop",
        label: "Open Ajoop",
        hint: "Portfolio assistant",
        keywords: "bot assistant ajoop chat",
        type: "chatbot",
      },
      {
        id: "recruiter",
        label: "Toggle Recruiter Mode",
        hint: "Compact hiring view",
        keywords: "recruiter hiring mode",
        type: "recruiter",
      },
      {
        id: "mathlab",
        label: "Open 3D Math Lab",
        hint: "Interactive canvas model",
        keywords: "3d math canvas model rotate",
        type: "nav",
        value: "labs.html#algorithmic-3d-lab",
      },
      {
        id: "easter",
        label: "Launch Easter Egg",
        hint: "Fireworks surprise",
        keywords: "easter egg fireworks surprise",
        type: "easter",
      },
    ],
  },
  tr: {
    recruiterLabel: "İK Modu",
    recruiterOpenLabel: "Recruiter Mode’u aç",
    recruiterCloseLabel: "Recruiter Mode’u kapat",
    recruiterTitle: "İK özeti",
    recruiterLead:
      "Conversational AI, solution engineering, LLM değerlendirme, workflow otomasyonu ve yazılım fırsatları için kısa ve kanıt odaklı profil özeti.",
    availability: "İşe açık",
    skillsTitle: "Ana yetkinlikler",
    projectsTitle: "Kanıt projeler",
    commandsTitle: "Ara",
    commandDialogLabel: "Arama paleti",
    commandPlaceholder: "Sayfa, proje veya komut ara...",
    noResults: "Komut bulunamadı.",
    projectSearchPlaceholder: "Proje, teknoloji veya anahtar kelime ara...",
    projectSearchLabel: "Projelerde ara",
    copyDone: "Kopyalandı",
    commands: [
      {
        id: "home",
        label: "Ana Sayfaya Git",
        hint: "Landing page",
        keywords: "home ana sayfa",
        type: "nav",
        value: "index.html",
      },
      {
        id: "works",
        label: "Projeleri Aç",
        hint: "Proje kataloğu",
        keywords: "projeler portfolio works",
        type: "nav",
        value: "works.html",
      },
      {
        id: "sinama-case-study",
        label: "SINAMA Vaka Çalışmasını Gör",
        hint: "AI agent reliability lab vaka çalışması",
        keywords:
          "sinama ai agent reliability lab regression evaluation vaka çalışması",
        type: "nav",
        value: "sinama-case-study.html",
      },
      {
        id: "sinama-live",
        label: "SINAMA Canlı Ürününü Aç",
        hint: "Canlı AI agent reliability lab",
        keywords: "sinama canlı ürün ai agent reliability lab",
        type: "nav",
        value: "https://sinama.kaanbalci.com",
        external: true,
      },
      {
        id: "games",
        label: "Oyunları Aç",
        hint: "Oynanabilir mini oyunlar",
        keywords: "oyunlar oyun mini web canvas",
        type: "nav",
        value: "games.html",
      },
      {
        id: "joyday-paint",
        label: "Joyday Painting Aç",
        hint: "Sanal action painting oyunu",
        keywords: "joyday painting action canvas boya oyun png",
        type: "nav",
        value: "joyday-paint.html",
      },
      {
        id: "ai-flow-puzzle-play",
        label: "AI Flow Puzzle Oyna",
        hint: "n8n tarzı chatbot workflow oyunu",
        keywords: "ai flow puzzle n8n chatbot workflow otomasyon oyun",
        type: "nav",
        value: "ai-flow-puzzle.html",
      },
      {
        id: "ai-flow-puzzle-case-study",
        label: "AI Flow Puzzle Vaka Çalışmasını Gör",
        hint: "Tasarım ve teknik vaka çalışması",
        keywords: "ai flow puzzle vaka çalışması node doğrulama fallback",
        type: "nav",
        value: "ai-flow-puzzle-case-study.html",
      },
      {
        id: "adventure",
        label: "Macera\'yı Aç",
        hint: "Kariyer merge mini oyunu",
        keywords: "macera oyun kariyer merge job iş kaan",
        type: "nav",
        value: "adventure.html",
      },
      {
        id: "joyday-case-study",
        label: "Atölye Joyday Vaka Çalışmasını Gör",
        hint: "Canlı işletme ve dijital ürün vaka çalışması",
        keywords: "atölye joyday vaka çalışması rezervasyon dijital ürün",
        type: "nav",
        value: "atolye-joyday-case-study.html",
      },
      {
        id: "joyday-live",
        label: "Atölye Joyday Canlı Sitesini Aç",
        hint: "Canlı yaratıcı atölye web sitesi",
        keywords: "atölye joyday canlı site işletme",
        type: "nav",
        value: "https://atolyejoyday.com/",
        external: true,
      },
      {
        id: "hospital-system-case-study",
        label: "Hospital System Vaka Çalışmasını Gör",
        hint: "2024 C# Windows Forms kaynak arşivi vaka çalışması",
        keywords:
          "hospital system form app c# windows forms sql server vaka çalışması",
        type: "nav",
        value: "hospital-system-case-study.html",
      },
      {
        id: "hospital-system-source",
        label: "Hospital System Kaynak Arşivini Aç",
        hint: "Herkese açık C# proje arşivi",
        keywords: "hospital system kaynak arşivi github c# windows forms",
        type: "nav",
        value: "https://github.com/UAJOP/Hospital-System",
        external: true,
      },
      {
        id: "cv",
        label: "CV'yi Görüntüle",
        hint: "Google Drive CV",
        keywords: "resume cv özgeçmiş",
        type: "resume",
      },
      {
        id: "github",
        label: "GitHub Aç",
        hint: "UAJOP repository'leri",
        keywords: "github repo kod",
        type: "nav",
        value: "https://github.com/UAJOP",
        external: true,
      },
      {
        id: "linkedin",
        label: "LinkedIn Aç",
        hint: "Profesyonel profil",
        keywords: "linkedin iletişim",
        type: "nav",
        value: "https://www.linkedin.com/in/balcikaan/",
        external: true,
      },
      {
        id: "theme",
        label: "Tema Değiştir",
        hint: "Koyu / Açık",
        keywords: "tema koyu açık",
        type: "theme",
      },
      {
        id: "language",
        label: "Dil Değiştir",
        hint: "EN / TR",
        keywords: "dil tr en",
        type: "language",
      },
      {
        id: "ajoop",
        label: "Ajoop'u Aç",
        hint: "Portfolio asistanı",
        keywords: "bot asistan ajoop chat",
        type: "chatbot",
      },
      {
        id: "recruiter",
        label: "İK Modunu Aç/Kapat",
        hint: "Kompakt işe alım görünümü",
        keywords: "ik insan kaynakları recruiter iş mod",
        type: "recruiter",
      },
      {
        id: "mathlab",
        label: "3D Matematik Labını Aç",
        hint: "İnteraktif canvas modeli",
        keywords: "3d matematik canvas model döndür",
        type: "nav",
        value: "labs.html#algorithmic-3d-lab",
      },
      {
        id: "easter",
        label: "Easter Egg Başlat",
        hint: "Havai fişek sürprizi",
        keywords: "easter egg havai fişek sürpriz",
        type: "easter",
      },
    ],
  },
};

function getUltimateContent(language = getCurrentLocale()) {
  return getLocalizedCollection(ultimateContent, language, "ultimate");
}

function getCatalogSearchLabels(language = getCurrentLocale()) {
  const base = getUltimateContent(language);
  const path = (window.location.pathname || "").toLowerCase();
  const isGamesCatalog = path.includes("games.html") || path.endsWith("/games");
  if (!isGamesCatalog)
    return {
      label: base.projectSearchLabel,
      placeholder: base.projectSearchPlaceholder,
    };
  return {
    label: getI18nText("Search games", "Oyunlarda ara", language),
    placeholder: getI18nText("Search by game, category or feature...", "Oyun, kategori veya özellik ara...", language),
  };
}

function updateUltimateStaticLabels(language = getCurrentLocale()) {
  const content = getUltimateContent(language);
  const catalogSearchLabels = getCatalogSearchLabels(language);
  document.querySelectorAll("[data-recruiter-label]").forEach((node) => {
    node.textContent = content.recruiterLabel;
  });
  document.querySelectorAll("[data-recruiter-toggle]").forEach((button) => {
    const isOpen = button.getAttribute("aria-expanded") === "true";
    const label = isOpen
      ? content.recruiterCloseLabel
      : content.recruiterOpenLabel;
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  });
  document.querySelectorAll("[data-command-toggle]").forEach((button) => {
    const label =
      button.getAttribute("aria-expanded") === "true"
        ? getI18nText("Close search palette", "Arama paletini kapat", language)
        : content.commandsTitle;
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    const visibleLabel =
      button.querySelector("[data-command-label]") ||
      button.querySelector("span");
    if (visibleLabel) visibleLabel.textContent = content.commandsTitle;
  });
  document
    .querySelectorAll("[data-availability-badge] strong")
    .forEach((node) => {
      node.textContent = content.availability;
    });
  document.querySelectorAll("[data-command-input]").forEach((node) => {
    node.placeholder = content.commandPlaceholder;
    node.setAttribute("aria-label", content.commandDialogLabel);
  });
  document.querySelectorAll("[data-availability-badge]").forEach((node) => {
    node.setAttribute(
      "aria-label",
      getI18nText("Available for roles", "Rollere açık", language),
    );
  });
  document.querySelectorAll("[data-project-search]").forEach((node) => {
    node.placeholder = catalogSearchLabels.placeholder;
  });
  document.querySelectorAll("[data-project-search-label]").forEach((node) => {
    node.textContent = catalogSearchLabels.label;
  });
  renderRecruiterDrawer(language);
  renderCommandPalette(language);
}

