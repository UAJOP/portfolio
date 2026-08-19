(function () {
  function currentLanguage() {
    return (document.documentElement.lang || "en") === "tr" ? "tr" : "en";
  }

  function applyFlagshipCopy() {
    const lang = currentLanguage();

    document.querySelectorAll("[data-flagship-en][data-flagship-tr]").forEach((node) => {
      const value = lang === "tr" ? node.dataset.flagshipTr : node.dataset.flagshipEn;
      if (typeof value === "string") node.textContent = value;
    });

    document.querySelectorAll("[data-flagship-aria-en][data-flagship-aria-tr]").forEach((node) => {
      const value = lang === "tr" ? node.dataset.flagshipAriaTr : node.dataset.flagshipAriaEn;
      if (typeof value === "string") node.setAttribute("aria-label", value);
    });
  }

  function addUniqueKeywords(entry, keywords) {
    if (!entry) return;
    const known = new Set(entry.keywords.map((keyword) => keyword.toLowerCase()));
    keywords.forEach((keyword) => {
      if (!known.has(keyword.toLowerCase())) {
        entry.keywords.push(keyword);
        known.add(keyword.toLowerCase());
      }
    });
  }

  function syncAjoopWithFlagshipProjects() {
    if (
      typeof portfolioChatbotContent === "undefined" ||
      typeof chatbotKeywordMap === "undefined"
    ) {
      return;
    }

    const sinamaLinks = {
      en: [
        { label: "SINAMA Case Study", url: "sinama-case-study.html" },
        { label: "Open Live Product", url: "https://sinama.kaanbalci.com" },
        { label: "GitHub", url: "https://github.com/UAJOP/sinama" },
      ],
      tr: [
        { label: "SINAMA Vaka Çalışması", url: "sinama-case-study.html" },
        { label: "Canlı Ürünü Aç", url: "https://sinama.kaanbalci.com" },
        { label: "GitHub", url: "https://github.com/UAJOP/sinama" },
      ],
    };
    const mergeRushLinks = {
      en: [{ label: "Merge Rush Case Study", url: "merge-rush-case-study.html" }],
      tr: [{ label: "Merge Rush Vaka Çalışması", url: "merge-rush-case-study.html" }],
    };

    portfolioChatbotContent.en.quicks = [
      { id: "about", label: "Who is Kaan?" },
      { id: "sinama", label: "SINAMA" },
      { id: "mergeRush", label: "Merge Rush" },
      { id: "projects", label: "Best projects" },
      { id: "roles", label: "Role fit" },
      { id: "cv", label: "CV & contact" },
    ];
    portfolioChatbotContent.tr.quicks = [
      { id: "about", label: "Kaan kim?" },
      { id: "sinama", label: "SINAMA" },
      { id: "mergeRush", label: "Merge Rush" },
      { id: "projects", label: "En iyi projeler" },
      { id: "roles", label: "Role uygunluk" },
      { id: "cv", label: "CV & iletişim" },
    ];

    Object.assign(portfolioChatbotContent.en.answers, {
      sinama: {
        text: [
          "SINAMA is Kaan's flagship Applied AI project: a Turkish-first AI Agent Reliability Lab for repeatable multi-turn testing, deterministic workflow evidence, regression comparison, version trends and release-readiness decisions.",
          "SINAMA now proves the same reliability pipeline across insurance and e-commerce, including a typed 14-scenario cross-vertical suite. It can also test compatible external HTTPS agents.",
          "The key SINAMA idea is simple: an agent can execute successfully and still behave incorrectly. The product inspects transcript and Tool Trace evidence rather than treating fluent text as proof of correctness.",
        ],
        links: sinamaLinks.en,
      },
      mergeRush: {
        text: [
          "Merge Rush: Tiny Factory is Kaan's active Phaser 3 + TypeScript game product. Timed orders feed a factory-restoration loop with staged board unlocks, multi-cell items, combos and Endless mode.",
          "The project is also an engineering exercise: deterministic game state, footprint-aware placement, deadlock checks, responsive layouts and platform lifecycle abstractions are separated from presentation code.",
          "Merge Rush is still in active development for a YouTube Playables direction. The private repository is not linked publicly; the portfolio case study documents the real implemented systems without presenting it as a finished release.",
        ],
        links: mergeRushLinks.en,
      },
      projects: {
        text: [
          "Kaan's two current flagship builds are SINAMA and Merge Rush: Tiny Factory. SINAMA is the strongest Applied AI / reliability-engineering proof; Merge Rush is the strongest current game-system and interactive-product proof.",
          "For AI and Solution Engineering roles, start with SINAMA, then AI Chatbot Flow Design. For product/game engineering, start with Merge Rush. Joyday remains the strongest live real-business digital product example.",
          "The broader catalog also includes AI Flow Puzzle, Joyday, C#/.NET hospital systems, Python/Tkinter software, data projects, Android work and Unity/Unreal prototypes.",
        ],
        links: [
          { label: "View Works", url: "works.html" },
          ...sinamaLinks.en.slice(0, 1),
          ...mergeRushLinks.en,
        ],
      },
      roles: {
        text: [
          "Kaan's strongest current direction is Applied AI / AI Solutions / Forward Deployed or Solution Engineering, supported by conversational AI, agent reliability, automation and hands-on software development.",
          "SINAMA adds concrete proof in AI evaluation, backend architecture, test evidence and release discipline; CBOT adds enterprise conversational-AI experience; Joyday adds real product ownership.",
          "For game or interactive-product roles, Merge Rush adds current Phaser 3 + TypeScript work on gameplay state, progression, responsive UI and platform architecture.",
        ],
        links: [
          { label: "Works", url: "works.html" },
          { label: "About", url: "about.html" },
          { label: "Contact", url: "mailto:kaanb8776@gmail.com" },
        ],
      },
    });

    Object.assign(portfolioChatbotContent.tr.answers, {
      sinama: {
        text: [
          "SINAMA, Kaan'ın flagship Applied AI projesi: tekrarlanabilir multi-turn test, deterministic workflow kanıtı, regression karşılaştırması, version trends ve release-readiness kararları için Turkish-first bir AI Agent Reliability Lab.",
          "SINAMA artık aynı reliability pipeline'ını insurance ve e-commerce domain'lerinde kanıtlıyor; ayrıca 14 senaryolu typed cross-vertical suite ve uyumlu external HTTPS agent testing desteği bulunuyor.",
          "SINAMA'nın ana fikri şu: bir agent teknik olarak çalışıp yine de yanlış davranabilir. Ürün akıcı metni başarı kanıtı saymak yerine transcript ve Tool Trace kanıtını inceliyor.",
        ],
        links: sinamaLinks.tr,
      },
      mergeRush: {
        text: [
          "Merge Rush: Tiny Factory, Kaan'ın aktif Phaser 3 + TypeScript oyun ürünü. Süreli siparişler; aşamalı board unlock, multi-cell item'lar, combo ve Endless mode içeren fabrika onarım döngüsünü besliyor.",
          "Proje aynı zamanda mühendislik tarafını gösteriyor: deterministic game state, footprint-aware placement, deadlock kontrolleri, responsive layout'lar ve platform lifecycle abstraction'ları presentation kodundan ayrılıyor.",
          "Merge Rush hâlâ YouTube Playables yönünde aktif geliştirme aşamasında. Private repository public olarak paylaşılmıyor; portfolyo case study'si gerçek sistemleri tamamlanmış release gibi göstermeden belgeliyor.",
        ],
        links: mergeRushLinks.tr,
      },
      projects: {
        text: [
          "Kaan'ın güncel iki flagship ürünü SINAMA ve Merge Rush: Tiny Factory. SINAMA Applied AI / reliability engineering için; Merge Rush ise game-system ve interactive-product engineering için en güçlü güncel kanıt.",
          "AI ve Solution Engineering rolleri için önce SINAMA, ardından AI Chatbot Flow Design; game/product engineering için Merge Rush; gerçek işletme ürünü görmek için Joyday incelenebilir.",
          "Daha geniş katalogda ayrıca AI Flow Puzzle, Joyday, C#/.NET hastane sistemleri, Python/Tkinter yazılımları, data projeleri, Android ve Unity/Unreal çalışmaları bulunuyor.",
        ],
        links: [
          { label: "Projeleri Gör", url: "works.html" },
          ...sinamaLinks.tr.slice(0, 1),
          ...mergeRushLinks.tr,
        ],
      },
      roles: {
        text: [
          "Kaan'ın güncel en güçlü kariyer yönü Applied AI / AI Solutions / Forward Deployed veya Solution Engineering. Bu yön conversational AI, agent reliability, otomasyon ve hands-on yazılım geliştirme ile destekleniyor.",
          "SINAMA AI evaluation, backend architecture, test evidence ve release discipline tarafında somut ürün kanıtı; CBOT enterprise conversational AI deneyimi; Joyday ise gerçek ürün sahipliği sağlıyor.",
          "Game veya interactive-product rolleri için Merge Rush; Phaser 3 + TypeScript, gameplay state, progression, responsive UI ve platform architecture tarafında güncel kanıt sunuyor.",
        ],
        links: [
          { label: "Projeler", url: "works.html" },
          { label: "Hakkımda", url: "about.html" },
          { label: "İletişim", url: "mailto:kaanb8776@gmail.com" },
        ],
      },
    });

    const existingIds = new Set(chatbotKeywordMap.map((entry) => entry.id));
    if (!existingIds.has("sinama")) {
      chatbotKeywordMap.unshift({
        id: "sinama",
        keywords: [
          "sinama",
          "reliability",
          "regression",
          "readiness",
          "scenario pack",
          "test suite",
          "tool trace",
        ],
      });
    }
    if (!existingIds.has("mergeRush")) {
      chatbotKeywordMap.unshift({
        id: "mergeRush",
        keywords: [
          "merge rush",
          "tiny factory",
          "phaser",
          "playables",
          "factory run",
          "endless",
          "merge game",
        ],
      });
    }

    addUniqueKeywords(
      chatbotKeywordMap.find((entry) => entry.id === "ai"),
      ["agent", "agents", "applied ai", "solution engineering"],
    );
    addUniqueKeywords(
      chatbotKeywordMap.find((entry) => entry.id === "stack"),
      ["typescript", "fastapi", "postgresql", "phaser"],
    );

    if (typeof updatePortfolioChatbotLanguage === "function") {
      updatePortfolioChatbotLanguage(currentLanguage());
    }
  }

  applyFlagshipCopy();
  syncAjoopWithFlagshipProjects();

  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.type === "attributes" && record.attributeName === "lang")) {
      applyFlagshipCopy();
      syncAjoopWithFlagshipProjects();
    }
  });

  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
