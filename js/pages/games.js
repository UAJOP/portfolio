/**
 * Adventure, game catalog and Joyday navigation enhancements.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 5081-5244.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
function enhanceAdventureNavigation() {
  if (typeof ultimateContent !== "undefined") {
    const addCommand = (language, command) => {
      if (
        !ultimateContent[language]?.commands?.some(
          (item) => item.id === command.id,
        )
      ) {
        ultimateContent[language].commands.splice(2, 0, command);
      }
    };
    addCommand("en", {
      id: "adventure",
      label: "Open Adventure",
      hint: "Career merge mini game",
      keywords: "adventure game mini career merge job kaan",
      type: "nav",
      value: "adventure.html",
    });
    addCommand("tr", {
      id: "adventure",
      label: "Macera'yı Aç",
      hint: "Kariyer merge mini oyunu",
      keywords: "macera oyun kariyer merge job iş kaan",
      type: "nav",
      value: "adventure.html",
    });
  }

  if (typeof portfolioChatbotContent !== "undefined") {
    const en = portfolioChatbotContent.en;
    const tr = portfolioChatbotContent.tr;
    if (en && !en.quicks.some((item) => item.id === "adventure")) {
      en.quicks.splice(4, 0, { id: "adventure", label: "Mini game" });
      en.answers.adventure = {
        text: [
          "Kaan's Career Adventure is an interactive merge mini game: learning objects become tools, tools become software skills, skills become portfolio proof and the final merge creates a Job Offer.",
          "The Adventure page turns Kaan's career growth into a small web game. It is built with HTML, CSS, JavaScript and Canvas, so it also works as a playful frontend proof.",
          "In the mini game, you merge books, keyboard, mouse, monitor, JavaScript, Python, C#, database, AI Flow, portfolio and interview steps until Job Offer appears.",
        ],
        links: [
          { label: "Play Adventure", url: "adventure.html" },
          { label: "View Works", url: "works.html" },
        ],
      };
    }
    if (tr && !tr.quicks.some((item) => item.id === "adventure")) {
      tr.quicks.splice(4, 0, { id: "adventure", label: "Mini oyun" });
      tr.answers.adventure = {
        text: [
          "Kaan'ın Kariyer Macerası interaktif bir merge mini oyunu: öğrenme nesneleri araçlara, araçlar yazılım becerilerine, beceriler portfolyo kanıtına ve finalde Job Offer'a dönüşüyor.",
          "Macera sayfası Kaan'ın kariyer gelişimini küçük bir web oyununa çeviriyor. HTML, CSS, JavaScript ve Canvas ile çalıştığı için eğlenceli bir frontend kanıtı gibi de duruyor.",
          "Mini oyunda kitap, klavye, mouse, monitör, JavaScript, Python, C#, veritabanı, AI Flow, portfolyo ve mülakat adımlarını birleştirerek Job Offer seviyesine ulaşıyorsun.",
        ],
        links: [
          { label: "Macera'yı Oyna", url: "adventure.html" },
          { label: "Projeleri Gör", url: "works.html" },
        ],
      };
    }
    if (
      typeof chatbotKeywordMap !== "undefined" &&
      !chatbotKeywordMap.some((item) => item.id === "adventure")
    ) {
      chatbotKeywordMap.unshift({
        id: "adventure",
        keywords: [
          "adventure",
          "macera",
          "oyun",
          "game",
          "mini game",
          "merge",
          "kariyer oyunu",
          "job offer",
        ],
      });
    }
    updatePortfolioChatbotLanguage?.(currentSiteLanguage || "en");
  }
}

enhanceAdventureNavigation();

/* Games catalog and Joyday Action Painting navigation helpers */
function setupGameCards() {
  document.querySelectorAll("[data-game-link]").forEach((card) => {
    if (card.dataset.gameCardReady === "true") return;
    card.dataset.gameCardReady = "true";
    card.addEventListener("click", (event) => {
      if (shouldIgnoreCardActivation(event)) return;
      const url = card.dataset.gameLink;
      if (url) window.location.href = url;
    });
  });
}
setupGameCards();

function enhanceJoydayGameNavigation() {
  if (typeof portfolioChatbotContent !== "undefined") {
    const en = portfolioChatbotContent.en;
    const tr = portfolioChatbotContent.tr;
    if (en && !en.quicks.some((item) => item.id === "games")) {
      en.quicks.splice(4, 0, { id: "games", label: "Games" });
      en.answers.games = {
        text: [
          "The Games page collects small playable web experiments in the portfolio.",
          "It includes Kaan's Career Adventure, Joyday Action Painting and AI Flow Puzzle, an n8n-style chatbot workflow logic game.",
        ],
        links: [
          { label: "Open Games", url: "games.html" },
          { label: "Play AI Flow Puzzle", url: "ai-flow-puzzle.html" },
          {
            label: "View AI Flow Puzzle Case Study",
            url: "ai-flow-puzzle-case-study.html",
          },
          { label: "Play Joyday Painting", url: "joyday-paint.html" },
        ],
      };
    }
    if (tr && !tr.quicks.some((item) => item.id === "games")) {
      tr.quicks.splice(4, 0, { id: "games", label: "Oyunlar" });
      tr.answers.games = {
        text: [
          "Oyunlar sayfası portfolyodaki küçük oynanabilir web deneylerini topluyor.",
          "İçinde Kaan'ın Kariyer Macerası, PNG çıktı alabilen Joyday Action Painting ve n8n mantıklı chatbot workflow oyunu AI Flow Puzzle yer alıyor.",
        ],
        links: [
          { label: "Oyunları Aç", url: "games.html" },
          { label: "AI Flow Puzzle Oyna", url: "ai-flow-puzzle.html" },
          {
            label: "AI Flow Puzzle Vaka Çalışmasını Gör",
            url: "ai-flow-puzzle-case-study.html",
          },
          { label: "Joyday Painting Oyna", url: "joyday-paint.html" },
        ],
      };
    }
    if (
      typeof chatbotKeywordMap !== "undefined" &&
      !chatbotKeywordMap.some((item) => item.id === "games")
    ) {
      chatbotKeywordMap.unshift({
        id: "games",
        keywords: [
          "games",
          "oyunlar",
          "oyun",
          "joyday painting",
          "action painting",
          "paint",
          "canvas",
          "png",
          "ai flow puzzle",
          "n8n",
          "workflow",
          "chatbot",
        ],
      });
    }
    updatePortfolioChatbotLanguage?.(currentSiteLanguage || "en");
  }
}
enhanceJoydayGameNavigation();
