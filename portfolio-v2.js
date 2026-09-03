(function () {
  const registry = window.KAAN_PORTFOLIO;
  if (!registry) return;

  const state = {
    role: "applied-ai",
    evidenceScenario: "healthy"
  };

  const lang = () => (typeof getCurrentLocale === "function" ? getCurrentLocale() : (document.documentElement.lang || "en"));
  const pick = (value, language = lang()) => {
    if (typeof getLocalizedValue === "function") return getLocalizedValue(value, language);
    if (value && typeof value === "object") return value[language] || value.en || Object.values(value)[0] || "";
    return value ?? "";
  };
  const lt = (english, turkish, language = lang()) =>
    typeof getI18nText === "function" ? getI18nText(english, turkish, language) : (language === "tr" ? turkish : english);
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function applyUnifiedCopy() {
    const language = lang();
    const pairs = [
      ["pv2", "data-pv2-en", "data-pv2-tr"],
      ["flagship", "data-flagship-en", "data-flagship-tr"],
      ["sinama", "data-sinama-en", "data-sinama-tr"],
      ["mr", "data-mr-en", "data-mr-tr"]
    ];
    pairs.forEach(([, enAttr, trAttr]) => {
      document.querySelectorAll(`[${enAttr}][${trAttr}]`).forEach((node) => {
        const enValue = node.getAttribute(enAttr) || "";
        const trValue = node.getAttribute(trAttr) || enValue;
        node.textContent = lt(enValue, trValue, language);
      });
    });
    document.querySelectorAll("[data-pv2-aria-en][data-pv2-aria-tr]").forEach((node) => {
      const enValue = node.getAttribute("data-pv2-aria-en") || "";
      const trValue = node.getAttribute("data-pv2-aria-tr") || enValue;
      node.setAttribute("aria-label", lt(enValue, trValue, language));
    });
  }

  function projectLinkMarkup(projectId, language = lang(), openEvidence = "Open evidence") {
    const project = registry.projects[projectId];
    if (!project) return "";
    const href = project.links?.caseStudy || project.links?.live || "works.html";
    return `<a href="${esc(href)}"><strong>${esc(project.name)}</strong><small>${esc(pick(project.summary, language))}</small><span>${esc(openEvidence)}</span></a>`;
  }

  function getRoleFromUrl() {
    const requested = new URLSearchParams(window.location.search).get("role");
    return requested && registry.recruiterProfiles[requested] ? requested : null;
  }

  function setRole(roleId, { updateUrl = true, rerender = true } = {}) {
    if (!registry.recruiterProfiles[roleId]) return;
    state.role = roleId;
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("role", roleId);
      history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    if (rerender && typeof renderRecruiterDrawer === "function") renderRecruiterDrawer(lang());
  }

  function recruiterCopy(language) {
    const copy = {
      en: {
        label: "RECRUITER MODE V2", title: "Evidence summary by capability focus",
        lead: "Keeps the Forward Deployed Engineer target fixed while prioritizing project and experience evidence for the selected capability.",
        choose: "Evidence focus", primary: "Primary target", focus: "Evidence focus", capabilities: "Capability areas",
        skills: "Core capabilities", proof: "Recommended evidence", cv: "View Resume", email: "Email Me", close: "Close", updated: "Portfolio data", openEvidence: "Open evidence"
      },
      tr: {
        label: "İK MODU V2", title: "Yetkinlik odağına göre kanıt özeti",
        lead: "Forward Deployed Engineer hedefini sabit tutar; aynı portfolyoda seçilen yetkinliğe ait proje ve deneyim kanıtını öne çıkarır.",
        choose: "Kanıt odağı", primary: "Ana hedef", focus: "Kanıt odağı", capabilities: "Yetkinlik alanları",
        skills: "Ana yetkinlikler", proof: "Önerilen kanıt", cv: "CV'yi Görüntüle", email: "E-posta", close: "Kapat", updated: "Portfolyo verisi", openEvidence: "Kanıtı aç"
      }
    };
    return getLocalizedCollection(copy, language, "recruiterV2");
  }

  function renderRecruiterV2(language = lang()) {
    const drawer = document.querySelector("[data-recruiter-drawer]");
    if (!drawer) return;
    const hadFocus = drawer.contains(document.activeElement);
    const profile = registry.recruiterProfiles[state.role] || registry.recruiterProfiles["applied-ai"];
    const copy = recruiterCopy(language);
    drawer.innerHTML = `
      <div class="recruiter-card recruiter-card-v2">
        <button class="recruiter-close" type="button" data-recruiter-close aria-label="${esc(copy.close)}"><i class="bx bx-x" aria-hidden="true"></i></button>
        <p class="eyebrow">${esc(copy.label)}</p>
        <h2 id="recruiter-dialog-title">${esc(copy.title)}</h2>
        <p id="recruiter-dialog-description">${esc(copy.lead)}</p>
        <div class="recruiter-status"><span></span>${esc(pick(registry.profile.availability, language))}</div>
        <div class="recruiter-data-note"><i class="bx bx-data"></i>${esc(copy.updated)} · ${esc(registry.updatedAt)}</div>
        <h3>${esc(copy.choose)}</h3>
        <div class="recruiter-role-switch" role="group" aria-label="${esc(copy.choose)}">
          ${Object.entries(registry.recruiterProfiles).map(([id, item]) => `<button type="button" data-recruiter-role="${esc(id)}" class="${id === state.role ? "active" : ""}" aria-pressed="${id === state.role}">${esc(pick(item.label, language))}</button>`).join("")}
        </div>
        <h3>${esc(copy.primary)}</h3>
        <div class="recruiter-primary-profile">${esc(pick(registry.profile.primaryTitle, language))}</div>
        <h3>${esc(copy.focus)}</h3>
        <div class="recruiter-primary-profile recruiter-focus-title">${esc(pick(profile.focusTitle, language))}</div>
        <h3>${esc(copy.capabilities)}</h3>
        <div class="mini-stack">${profile.capabilities.map((item) => `<span>${esc(item)}</span>`).join("")}</div>
        <h3>${esc(copy.skills)}</h3>
        <ul class="recruiter-proof-list recruiter-capability-list">${profile.skills.map((item) => `<li>${esc(pick(item, language))}</li>`).join("")}</ul>
        <h3>${esc(copy.proof)}</h3>
        <div class="recruiter-links">${profile.evidence.map((id) => projectLinkMarkup(id, language, copy.openEvidence)).join("")}</div>
        <div class="recruiter-actions">
          <a class="btn primary" href="${esc(registry.profile.resume)}" target="_blank" rel="noopener">${esc(copy.cv)}</a>
          <a class="btn ghost" href="${esc(registry.profile.email)}">${esc(copy.email)}</a>
          <a class="btn ghost" href="${esc(registry.profile.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>
        </div>
      </div>`;
    drawer.querySelector("[data-recruiter-close]")?.addEventListener("click", () => setRecruiterMode(false));
    drawer.querySelectorAll("[data-recruiter-role]").forEach((button) => {
      button.addEventListener("click", () => setRole(button.dataset.recruiterRole));
    });
    if (hadFocus) drawer.querySelector("[data-recruiter-close]")?.focus();
  }

  function installRecruiterV2() {
    if (typeof renderRecruiterDrawer !== "function" || typeof setRecruiterMode !== "function") return;
    try {
      renderRecruiterDrawer = renderRecruiterV2;
      const initialRole = getRoleFromUrl();
      if (initialRole) state.role = initialRole;
      renderRecruiterDrawer(lang());
      if (initialRole) setTimeout(() => setRecruiterMode(true, { restoreFocus: false }), 120);
    } catch (error) {
      console.warn("Recruiter Mode V2 could not replace legacy renderer", error);
    }
  }

  function syncAjoop() {
    if (typeof portfolioChatbotContent === "undefined" || typeof chatbotKeywordMap === "undefined") return;
    const p = registry.projects;
    const focusSummary = (language) => Object.values(registry.recruiterProfiles)
      .map((item) => pick(item.focusTitle, language))
      .join(" · ");

    const copy = {
      en: {
        /* Ajoop 4.4 copy pass: the greeting used to open with a version
         * number and the words "evidence registry", which tells a recruiter
         * about the implementation instead of about Kaan. */
        greeting: "Hi — I am Ajoop, the copilot for this portfolio. I answer from Kaan's own project records: what he built, the stack behind it and the evidence for it. Ask about SINAMA, Merge Rush, how he maps to a role, or anything else here.",
        quicks: [
          { id: "sinama", label: "SINAMA evidence" },
          { id: "mergeRush", label: "Merge Rush evidence" },
          { id: "roles", label: "Role fit" },
          { id: "latestBuild", label: "Latest build" },
          { id: "projects", label: "Best projects" },
          { id: "cv", label: "CV & contact" }
        ]
      },
      tr: {
        greeting: "Selam — ben Ajoop, bu portfolyonun asistanıyım. Cevaplarımı Kaan'ın kendi proje kayıtlarından veriyorum: ne yaptı, hangi teknolojiyle, kanıtı ne. SINAMA, Merge Rush, role uygunluk ya da aklına gelen başka bir şeyi sorabilirsin.",
        quicks: [
          { id: "sinama", label: "SINAMA kanıtı" },
          { id: "mergeRush", label: "Merge Rush kanıtı" },
          { id: "roles", label: "Role uygunluk" },
          { id: "latestBuild", label: "Son build" },
          { id: "projects", label: "En iyi projeler" },
          { id: "cv", label: "CV & iletişim" }
        ]
      }
    };

    ["en", "tr"].forEach((language) => {
      const target = portfolioChatbotContent[language];
      if (!target) return;
      target.greeting = copy[language].greeting;
      target.quicks = copy[language].quicks;
      target.answers.about = {
        ...target.answers.about,
        text: lt("Kaan is currently positioning primarily as a Forward Deployed Engineer; his AI Designer & Software Developer background brings together evidence across Applied AI, AI reliability, conversational AI, automation and product-minded software delivery.", "Kaan öncelikli olarak Forward Deployed Engineer yönünde konumlanıyor; AI Designer & Software Developer geçmişi Applied AI, AI reliability, conversational AI, automation ve ürün odaklı yazılım geliştirme kanıtlarını bir araya getiriyor.", language)
      };
      target.answers.cv = {
        ...target.answers.cv,
        text: lt("You can review Kaan's CV or contact him through LinkedIn and email. The primary target is Forward Deployed Engineer; capability focuses lead to the relevant project evidence.", "Kaan'ın CV'sini görüntüleyebilir veya LinkedIn ve e-posta üzerinden iletişime geçebilirsiniz. Ana hedef Forward Deployed Engineer; yetkinlik odakları ilgili proje kanıtına yönlendirir.", language)
      };
      target.answers.sinama = {
        text: [
          `${p.sinama.name}: ${pick(p.sinama.summary, language)} Evidence: ${p.sinama.proof.slice(0, 3).map((item) => pick(item, language)).join("; ")}.`,
          lt("SINAMA's strongest proof is that it connects transcript + Tool Trace + workflow-contract evidence to a release decision.", "SINAMA'nın güçlü tarafı yalnızca chat çıktısını değil transcript + Tool Trace + workflow contract kanıtını release kararına bağlaması.", language)
        ],
        links: [
          { label: lt("SINAMA Case Study", "SINAMA Vaka Çalışması", language), url: p.sinama.links.caseStudy },
          { label: lt("Live Product", "Canlı Ürün", language), url: p.sinama.links.live },
          { label: "GitHub", url: p.sinama.links.github }
        ]
      };
      target.answers.mergeRush = {
        text: [
          `${p.mergeRush.name}: ${pick(p.mergeRush.summary, language)} Evidence: ${p.mergeRush.proof.slice(0, 4).map((item) => pick(item, language)).join("; ")}.`,
          lt("The project is in active development; the public case study exposes implemented systems and QA evidence without exposing the private repository.", "Proje aktif geliştirmede; public case study gerçek implementasyon ve QA kanıtını gösteriyor, private repo'yu açmıyor.", language)
        ],
        links: [{ label: lt("Merge Rush Case Study", "Merge Rush Vaka Çalışması", language), url: p.mergeRush.links.caseStudy }]
      };
      target.answers.roles = {
        text: lt(`Kaan is currently positioning primarily as a Forward Deployed Engineer. Evidence focuses: ${focusSummary(language)}. SINAMA + CBOT lead for Applied AI and AI reliability; CBOT + SINAMA + Joyday for solution engineering; SINAMA backend + Hospital for software / product engineering; and Merge Rush for interactive systems.`, `Kaan öncelikli olarak Forward Deployed Engineer yönünde konumlanıyor. Kanıt odakları: ${focusSummary(language)}. Applied AI ve AI reliability için SINAMA + CBOT; solution engineering için CBOT + SINAMA + Joyday; software / product engineering için SINAMA backend + Hospital; interactive systems için Merge Rush öne çıkar.`, language),
        links: [{ label: lt("Open Recruiter Mode", "İK Modunu aç", language), url: "index.html?role=applied-ai" }, { label: lt("About", "Hakkımda", language), url: "about.html" }]
      };
      target.answers.availability = target.answers.roles;
      target.answers.latestBuild = {
        text: registry.buildLog.slice(0, 3).map((entry) => `${entry.date} · ${entry.area} · ${pick(entry.title, language)} — ${pick(entry.detail, language)}`),
        links: [{ label: "Build Log", url: "now.html" }]
      };
      target.answers.projects = {
        text: [
          lt("The two current flagship products are SINAMA and Merge Rush. SINAMA is the main Applied AI / reliability-engineering proof; Merge Rush is the main game-system / interactive-product proof. Joyday adds real-business product ownership and AI Chatbot Flow Design adds enterprise conversational-AI evidence.", "Güncel iki flagship ürün SINAMA ve Merge Rush. SINAMA Applied AI / reliability engineering; Merge Rush game-system / interactive product engineering tarafının ana kanıtı. Joyday gerçek işletme ürünü, AI Chatbot Flow Design ise enterprise conversational-AI deneyiminin güçlü desteği.", language)
        ],
        links: [{ label: lt("Works", "Projeler", language), url: "works.html" }, { label: "SINAMA", url: p.sinama.links.caseStudy }, { label: "Merge Rush", url: p.mergeRush.links.caseStudy }]
      };
    });

    const upsert = (id, keywords, { priority = false } = {}) => {
      let entry = chatbotKeywordMap.find((item) => item.id === id);
      if (!entry) {
        entry = { id, keywords: [] };
        chatbotKeywordMap.unshift(entry);
      }
      const known = new Set(entry.keywords.map((item) => item.toLowerCase()));
      keywords.forEach((keyword) => {
        if (!known.has(keyword.toLowerCase())) entry.keywords.push(keyword);
      });
      if (priority) {
        const currentIndex = chatbotKeywordMap.indexOf(entry);
        if (currentIndex > 0) chatbotKeywordMap.unshift(...chatbotKeywordMap.splice(currentIndex, 1));
      }
    };
    upsert("sinama", ["sinama", "reliability", "regression", "readiness", "tool trace", "agent test"]);
    upsert("mergeRush", ["merge rush", "tiny factory", "phaser", "playables", "factory run", "endless"]);
    upsert("roles", ["forward deployed", "ai engineer", "solution engineer", "software engineer", "role fit", "career fit", "hiring fit", "pozisyon", "rol uyumu", "uygunluk"], { priority: true });
    upsert("latestBuild", ["latest", "build", "now", "son build", "güncel", "ne yapıyor"]);
    if (typeof updatePortfolioChatbotLanguage === "function") updatePortfolioChatbotLanguage(lang());
  }

  function extendCommands() {
    if (typeof ultimateContent === "undefined") return;
    const commands = {
      en: [
        { id: "labs-v2", label: "Open Kaan Labs", hint: "Technical experiments", keywords: "labs experiments canvas ai flow", type: "nav", value: "labs.html" },
        { id: "now-v2", label: "Open Build Log", hint: "What is being built now", keywords: "now build log latest status", type: "nav", value: "now.html" },
        { id: "applied-ai-role", label: "Applied AI Evidence View", hint: "Open capability-focused evidence", keywords: "applied ai evidence recruiter", type: "nav", value: "index.html?role=applied-ai" }
      ],
      tr: [
        { id: "labs-v2", label: "Kaan Labs'i Aç", hint: "Teknik deneyler", keywords: "labs deneyler canvas ai flow", type: "nav", value: "labs.html" },
        { id: "now-v2", label: "Build Log'u Aç", hint: "Şu an ne geliştiriliyor", keywords: "now build log son durum güncel", type: "nav", value: "now.html" },
        { id: "applied-ai-role", label: "Applied AI Kanıt Görünümü", hint: "Yetkinlik odaklı kanıt görünümü", keywords: "applied ai kanıt ik recruiter", type: "nav", value: "index.html?role=applied-ai" }
      ]
    };
    ["en", "tr"].forEach((language) => {
      commands[language].forEach((command) => {
        if (!ultimateContent[language].commands.some((item) => item.id === command.id)) ultimateContent[language].commands.push(command);
      });
    });
    if (typeof renderCommandPalette === "function") renderCommandPalette(lang());
  }

  function buildLogMarkup(entry, language) {
    // Release-state names are product terms and stay identical in both languages.
    const statusLabel = { shipped: "Shipped", building: "Building", integration: "Integration" }[entry.status] || entry.status;
    return `<article class="build-log-item"><time datetime="${esc(entry.date)}">${esc(entry.date)}</time><div><div class="build-log-meta"><span>${esc(entry.area)}</span><span class="build-log-status is-${esc(entry.status)}">${esc(statusLabel)}</span></div><h3>${esc(pick(entry.title, language))}</h3><p>${esc(pick(entry.detail, language))}</p></div></article>`;
  }

  function renderBuildLogs() {
    document.querySelectorAll("[data-build-log]").forEach((container) => {
      const limit = Number(container.dataset.buildLogLimit || registry.buildLog.length);
      container.innerHTML = registry.buildLog.slice(0, limit).map((entry) => buildLogMarkup(entry, lang())).join("");
    });
  }

  function renderLabCards() {
    document.querySelectorAll("[data-labs-grid]").forEach((container) => {
      container.innerHTML = registry.labs.map((item) => `<article class="lab-card"><div class="lab-card-top"><span>${esc(pick(item.type))}</span><i class="bx bx-flask"></i></div><h3>${esc(item.title)}</h3><p>${esc(pick(item.description))}</p><div class="project-tags">${item.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div><a href="${esc(item.url)}">${lt("Open experiment", "Deneyi aç")}<i class="bx bx-right-arrow-alt"></i></a></article>`).join("");
    });
  }

  function renderEvidenceExplorer() {
    const root = document.querySelector("[data-sinama-evidence]");
    if (!root) return;
    const language = lang();
    const scenario = registry.sinamaEvidence[state.evidenceScenario];
    // Keep focus inside the explorer when a scenario switch re-renders the markup.
    const hadFocus = root.contains(document.activeElement);
    const labels = getLocalizedCollection({
      en: { conversation: "Conversation", tools: "Tool Trace", evaluation: "Evaluation", verdict: "Release verdict", group: "SINAMA example run" },
      tr: { conversation: "Konuşma", tools: "Tool Trace", evaluation: "Değerlendirme", verdict: "Release kararı", group: "SINAMA örnek çalıştırması" }
    }, language);
    // Scenario button labels stay registry-owned so the explorer cannot drift from portfolio-data.js.
    const scenarioButton = (id) => {
      const isActive = state.evidenceScenario === id;
      return `<button type="button" data-evidence-scenario="${esc(id)}" class="${isActive ? "active" : ""}" aria-pressed="${isActive}">${esc(pick(registry.sinamaEvidence[id].label, language))}</button>`;
    };
    root.innerHTML = `
      <div class="evidence-toolbar" role="group" aria-label="${esc(labels.group)}">
        ${scenarioButton("healthy")}
        ${scenarioButton("broken")}
      </div>
      <div class="evidence-verdict is-${scenario.status.toLowerCase()}"><span>${esc(labels.verdict)}</span><strong>${esc(scenario.status)}</strong><p>${esc(pick(scenario.summary, language))}</p></div>
      <div class="evidence-grid">
        <article><p class="eyebrow">${esc(labels.conversation)}</p><div class="evidence-conversation">${scenario.conversation.map((turn) => `<div><strong>${esc(pick(turn.speaker, language))}</strong><p>${esc(pick(turn.text, language))}</p></div>`).join("")}</div></article>
        <article><p class="eyebrow">${esc(labels.tools)}</p><ol class="evidence-tools">${scenario.toolTrace.map((tool) => `<li><code>${esc(tool)}</code></li>`).join("")}</ol></article>
        <article><p class="eyebrow">${esc(labels.evaluation)}</p><ul class="evidence-findings">${scenario.findings.map((finding) => `<li class="is-${finding.level.toLowerCase()}"><strong>${esc(finding.level)}</strong><span>${esc(pick(finding.text, language))}</span></li>`).join("")}</ul></article>
      </div>`;
    root.querySelectorAll("[data-evidence-scenario]").forEach((button) => {
      button.addEventListener("click", () => {
        state.evidenceScenario = button.dataset.evidenceScenario;
        renderEvidenceExplorer();
      });
    });
    if (hadFocus) root.querySelector(`[data-evidence-scenario="${state.evidenceScenario}"]`)?.focus();
  }

  function installRequestReceipt() {
    const status = document.querySelector("[data-request-status]");
    if (!status || !window.MutationObserver) return;
    const observer = new MutationObserver(() => {
      if (!status.classList.contains("success") || status.querySelector("[data-request-receipt]")) return;
      const receipt = document.createElement("div");
      receipt.className = "request-receipt";
      receipt.dataset.requestReceipt = "";
      const stamp = new Date();
      const reference = `KB-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}-${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}`;
      receipt.innerHTML = `<strong>${lt("Browser submission reference", "Tarayıcı gönderim referansı")}: ${esc(reference)}</strong><span>${lt("This is not a server confirmation; the browser cannot verify delivery through the Apps Script no-cors flow.", "Bu referans server confirmation değildir; Apps Script no-cors akışı nedeniyle tarayıcı teslimatı doğrulayamaz.")}</span>`;
      status.appendChild(receipt);
    });
    observer.observe(status, { childList: true, subtree: true, attributes: true });
  }

  function installLanguageObserver() {
    if (typeof subscribeSiteLocale !== "function") return;
    subscribeSiteLocale(() => {
      applyUnifiedCopy();
      syncAjoop();
      renderBuildLogs();
      renderLabCards();
      renderEvidenceExplorer();
      if (typeof renderRecruiterDrawer === "function") renderRecruiterDrawer(lang());
    });
  }

  function init() {
    applyUnifiedCopy();
    installRecruiterV2();
    syncAjoop();
    extendCommands();
    renderBuildLogs();
    renderLabCards();
    renderEvidenceExplorer();
    installRequestReceipt();
    installLanguageObserver();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
