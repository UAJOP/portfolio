(function () {
  const board = document.querySelector("[data-ai-board]");
  const linesLayer = document.querySelector("[data-ai-lines]");
  if (!board || !linesLayer) return;

  const STORAGE_KEY = "kaan-ai-flow-puzzle-score-v2";
  const safeCrypto = window.crypto || {};

  const els = {
    scenarioHolder: document.querySelector("[data-ai-scenarios]"),
    paletteHolder: document.querySelector("[data-ai-palette]"),
    templateHolder: document.querySelector("[data-ai-templates]"),
    objectiveHolder: document.querySelector("[data-ai-objectives]"),
    inspector: document.querySelector("[data-ai-inspector]"),
    resultBox: document.querySelector("[data-ai-result]"),
    statusBox: document.querySelector("[data-ai-flow-status]"),
    scoreNode: document.querySelector("[data-ai-score]"),
    nodeCountNode: document.querySelector("[data-ai-node-count]"),
    linkCountNode: document.querySelector("[data-ai-link-count]"),
    scenarioTitleNode: document.querySelector("[data-ai-scenario-title]"),
    scenarioGoalNode: document.querySelector("[data-ai-scenario-goal]"),
    testMessageSelect: document.querySelector("[data-ai-test-message]"),
    runLog: document.querySelector("[data-ai-run-log]"),
    scoreBreakdown: document.querySelector("[data-ai-score-breakdown]"),
    importInput: document.querySelector("[data-ai-import-input]")
  };

  const copy = {
    en: {
      heroEyebrow: "n8n-inspired logic game",
      heroTitle: "AI Flow Puzzle",
      heroLead: "Build chatbot automations by placing nodes, connecting intent paths, adding fallback logic and validating the final workflow.",
      backToGames: "Back to Games",
      startBuilding: "Start Building",
      heroCardTitle: "Connect clean flows",
      heroCardText: "A lightweight browser game about workflow thinking, chatbot design and automation structure.",
      scenariosEyebrow: "Scenarios",
      chooseChallenge: "Choose a workflow challenge.",
      scenarioHelp: "Each level behaves like a small n8n board: place the required nodes, configure them and run the automation.",
      templatesTitle: "Templates",
      templatesHint: "Start blank or load a ready workflow template, then improve it.",
      nodePalette: "Node palette",
      nodePaletteHint: "Click a node to add it to the board. Drag nodes to organize your flow.",
      builderEyebrow: "Workflow builder",
      scoreLabel: "Score",
      nodesLabel: "Nodes",
      linksLabel: "Links",
      connectTip: "Click a source node, then click a target node to create a connection.",
      testMessageLabel: "Test message",
      runFlow: "Run flow",
      validateFlow: "Validate flow",
      hintButton: "Hint",
      arrangeButton: "Auto arrange",
      resetButton: "Reset",
      objectivesTitle: "Objectives",
      inspectorTitle: "Inspector & config",
      inspectorEmptyTitle: "Select a node",
      inspectorEmptyText: "Click a node on the board to inspect it, configure it or start a connection.",
      executionTitle: "Execution log",
      runLogEmpty: "Run the flow to see each node execute like an n8n workflow.",
      scoreBreakdownTitle: "Quality score",
      resultReady: "Ready to validate.",
      flowToolsTitle: "Flow tools",
      exportJson: "Export JSON",
      importJson: "Import JSON",
      copySummary: "Copy summary",
      downloadReport: "Download report",
      downloadPng: "Download PNG",
      nextScenario: "Next scenario",
      whyEyebrow: "Why this game exists",
      whyTitle: "A playable way to show AI Designer thinking.",
      whyText: "The goal is not only entertainment. The game demonstrates how chatbot flows need triggers, intent logic, branching, response handling, fallback safety and clean automation outputs.",
      viewExperience: "View Experience",
      viewWorks: "View Works",
      activeSource: "Source selected. Click a target node to connect.",
      connected: "Connection added.",
      connectionRemoved: "Connection removed.",
      duplicateConnection: "This connection already exists.",
      selfConnection: "A node cannot connect to itself.",
      nodeAdded: "Node added to the board.",
      nodeRemoved: "Node removed.",
      boardReset: "Board reset.",
      exportDone: "Workflow JSON downloaded.",
      importDone: "Workflow imported.",
      importFailed: "Could not import this JSON.",
      pngDone: "Workflow PNG downloaded.",
      reportDone: "Workflow report downloaded.",
      summaryCopied: "Summary copied.",
      successTitle: "Flow validated!",
      successText: "Clean automation path created. You can run it like a small n8n workflow.",
      missingTitle: "The flow needs a bit more work.",
      hintIntro: "Next logical step:",
      missingNode: "Add node:",
      missingEdge: "Connect:",
      allClear: "All objectives look good. Run the flow.",
      selectedLabel: "Selected",
      removeNode: "Remove node",
      startConnection: "Start connection",
      deleteConnection: "Delete connection",
      connectionList: "Connections",
      noConnections: "No outgoing connection yet.",
      requiredNodes: "Required nodes",
      requiredConnections: "Required connections",
      optionalRule: "Flow rule",
      scenarioCompleted: "Completed",
      scenarioLocked: "Build",
      jsonFilename: "ai-flow-puzzle-workflow.json",
      reportFilename: "ai-flow-puzzle-report.txt",
      pngFilename: "ai-flow-puzzle-board.png",
      templateBlank: "Blank board",
      templateHappy: "Happy path",
      templateSolution: "Full solution",
      templateBlankDesc: "Only trigger and end nodes.",
      templateHappyDesc: "Main branch without every safety path.",
      templateSolutionDesc: "Complete recommended flow.",
      runInvalid: "Flow cannot run yet. Fix the missing pieces first.",
      runStarted: "Execution started.",
      runCompleted: "Execution completed successfully.",
      logicScore: "Logic",
      automationScore: "Automation",
      uxScore: "UX",
      safetyScore: "Safety",
      efficiencyScore: "Efficiency",
      totalScore: "Total",
      configTitle: "Configuration",
      configName: "Display name",
      configSample: "Sample input",
      configThreshold: "Confidence threshold",
      configRule: "Rule / branch logic",
      configPrompt: "Prompt / instruction",
      configSource: "Data source",
      configMessage: "Response message",
      configMode: "Mode",
      edgeLabel: "Connection label",
      debugTitle: "Debug notes",
      noDebug: "No critical debug issue detected.",
      runStepReceived: "Message received",
      runStepIntent: "Intent detected",
      runStepRoute: "Route selected",
      runStepData: "Data checked or saved",
      runStepAI: "AI reasoning completed",
      runStepNotify: "Notification sent",
      runStepResponse: "User response generated",
      runStepSafety: "Safety path ready",
      runStepEnd: "Workflow finished",
      summaryIntro: "This workflow starts with a chat trigger, detects intent, routes the user, handles automation outputs and closes with a safe response path.",
      nodeTypes: {
        trigger: { title: "Chat Trigger", desc: "Starts when the user sends a message.", category: "Input" },
        intent: { title: "Intent Detector", desc: "Understands what the user wants.", category: "AI Logic" },
        router: { title: "Route Switch", desc: "Splits the flow into different paths.", category: "Logic" },
        condition: { title: "Condition", desc: "Checks a rule such as package availability.", category: "Logic" },
        kb: { title: "Knowledge Base", desc: "Reads trusted business information.", category: "Data" },
        llm: { title: "LLM Reasoning", desc: "Generates a context-aware answer.", category: "AI Logic" },
        response: { title: "Response", desc: "Sends a clear answer back to the user.", category: "Output" },
        fallback: { title: "Fallback", desc: "Handles unclear or unsupported requests.", category: "Safety" },
        sheet: { title: "Google Sheets", desc: "Stores reservation or lead data.", category: "Automation" },
        crm: { title: "CRM Update", desc: "Creates or updates a customer record.", category: "Automation" },
        email: { title: "Email Notify", desc: "Notifies the team or customer.", category: "Automation" },
        handoff: { title: "Human Handoff", desc: "Sends risky cases to a real person.", category: "Safety" },
        end: { title: "End", desc: "Closes the automation cleanly.", category: "Output" }
      },
      scenarios: {
        joyday: {
          title: "Joyday Reservation Bot",
          level: "Level 01",
          short: "Reservation flow",
          goal: "Connect a customer message to intent detection, package availability, booking record, confirmation and fallback.",
          objective: "Build the main reservation branch and a safe fallback branch.",
          messages: ["Hi, can we book action painting for two people?", "Do you have availability on Saturday?", "How much is the parent and child package?"]
        },
        support: {
          title: "Enterprise Support Bot",
          level: "Level 02",
          short: "Support triage",
          goal: "Create a support automation where the bot detects the request, routes it, checks knowledge, reasons with an LLM and hands off risky cases.",
          objective: "Use routing, knowledge base, LLM response and human handoff.",
          messages: ["My account is locked and I need help.", "The invoice amount looks wrong.", "I want to speak with a human agent."]
        },
        lead: {
          title: "Lead Capture Automation",
          level: "Level 03",
          short: "Sales lead flow",
          goal: "Build a sales intake workflow that captures the user's intent, records the lead, emails the team, responds to the user and ends safely.",
          objective: "Capture, store, notify, respond and close the lead flow.",
          messages: ["We need an AI chatbot for our website.", "Can you contact me about an automation project?", "I want pricing for a workflow design."]
        }
      }
    },
    tr: {
      heroEyebrow: "n8n mantıklı logic oyunu",
      heroTitle: "AI Flow Puzzle",
      heroLead: "Node'ları yerleştir, intent yollarını bağla, fallback mantığı ekle ve final chatbot workflow'unu doğrula.",
      backToGames: "Oyunlara Dön",
      startBuilding: "Akışı Kur",
      heroCardTitle: "Temiz akışlar bağla",
      heroCardText: "Workflow düşünme, chatbot tasarımı ve otomasyon yapısını anlatan hafif bir tarayıcı oyunu.",
      scenariosEyebrow: "Senaryolar",
      chooseChallenge: "Bir workflow challenge seç.",
      scenarioHelp: "Her seviye küçük bir n8n board'u gibi çalışır: gerekli node'ları koy, ayarla ve otomasyonu çalıştır.",
      templatesTitle: "Şablonlar",
      templatesHint: "Boş başla veya hazır bir workflow şablonu yükleyip geliştir.",
      nodePalette: "Node paleti",
      nodePaletteHint: "Board'a eklemek için node'a tıkla. Akışı düzenlemek için node'ları sürükle.",
      builderEyebrow: "Workflow builder",
      scoreLabel: "Skor",
      nodesLabel: "Node",
      linksLabel: "Link",
      connectTip: "Önce kaynak node'a, sonra hedef node'a tıklayarak bağlantı oluştur.",
      testMessageLabel: "Test mesajı",
      runFlow: "Akışı çalıştır",
      validateFlow: "Akışı doğrula",
      hintButton: "İpucu",
      arrangeButton: "Otomatik diz",
      resetButton: "Sıfırla",
      objectivesTitle: "Hedefler",
      inspectorTitle: "Inspector & ayar",
      inspectorEmptyTitle: "Bir node seç",
      inspectorEmptyText: "İncelemek, ayarlamak veya bağlantı başlatmak için board üzerindeki bir node'a tıkla.",
      executionTitle: "Çalıştırma log'u",
      runLogEmpty: "Akışı çalıştırınca node'ların n8n gibi sırayla çalışmasını burada görürsün.",
      scoreBreakdownTitle: "Kalite skoru",
      resultReady: "Doğrulamaya hazır.",
      flowToolsTitle: "Flow araçları",
      exportJson: "JSON indir",
      importJson: "JSON içe aktar",
      copySummary: "Özeti kopyala",
      downloadReport: "Rapor indir",
      downloadPng: "PNG indir",
      nextScenario: "Sonraki senaryo",
      whyEyebrow: "Bu oyun neden var",
      whyTitle: "AI Designer düşüncesini oynanabilir gösterme yolu.",
      whyText: "Amaç sadece eğlence değil. Oyun; chatbot akışlarında trigger, intent mantığı, dallanma, cevap yönetimi, fallback güvenliği ve temiz otomasyon çıktılarının neden gerektiğini gösterir.",
      viewExperience: "Deneyimi Gör",
      viewWorks: "Projeleri Gör",
      activeSource: "Kaynak seçildi. Bağlamak için hedef node'a tıkla.",
      connected: "Bağlantı eklendi.",
      connectionRemoved: "Bağlantı silindi.",
      duplicateConnection: "Bu bağlantı zaten var.",
      selfConnection: "Bir node kendisine bağlanamaz.",
      nodeAdded: "Node board'a eklendi.",
      nodeRemoved: "Node silindi.",
      boardReset: "Board sıfırlandı.",
      exportDone: "Workflow JSON indirildi.",
      importDone: "Workflow içe aktarıldı.",
      importFailed: "Bu JSON içe aktarılamadı.",
      pngDone: "Workflow PNG indirildi.",
      reportDone: "Workflow raporu indirildi.",
      summaryCopied: "Özet kopyalandı.",
      successTitle: "Akış doğrulandı!",
      successText: "Temiz otomasyon yolu kuruldu. Artık küçük bir n8n workflow'u gibi çalıştırabilirsin.",
      missingTitle: "Akışın biraz daha çalışmaya ihtiyacı var.",
      hintIntro: "Sıradaki mantıklı adım:",
      missingNode: "Node ekle:",
      missingEdge: "Bağla:",
      allClear: "Tüm hedefler iyi görünüyor. Akışı çalıştır.",
      selectedLabel: "Seçilen",
      removeNode: "Node'u sil",
      startConnection: "Bağlantı başlat",
      deleteConnection: "Bağlantıyı sil",
      connectionList: "Bağlantılar",
      noConnections: "Henüz çıkış bağlantısı yok.",
      requiredNodes: "Gerekli node'lar",
      requiredConnections: "Gerekli bağlantılar",
      optionalRule: "Flow kuralı",
      scenarioCompleted: "Tamamlandı",
      scenarioLocked: "Kur",
      jsonFilename: "ai-flow-puzzle-workflow.json",
      reportFilename: "ai-flow-puzzle-rapor.txt",
      pngFilename: "ai-flow-puzzle-board.png",
      templateBlank: "Boş board",
      templateHappy: "Happy path",
      templateSolution: "Tam çözüm",
      templateBlankDesc: "Sadece trigger ve end node'ları.",
      templateHappyDesc: "Tüm güvenlik yolu olmadan ana dal.",
      templateSolutionDesc: "Önerilen tam akış.",
      runInvalid: "Akış henüz çalışamaz. Önce eksikleri düzelt.",
      runStarted: "Çalıştırma başladı.",
      runCompleted: "Akış başarıyla tamamlandı.",
      logicScore: "Mantık",
      automationScore: "Otomasyon",
      uxScore: "UX",
      safetyScore: "Güvenlik",
      efficiencyScore: "Verimlilik",
      totalScore: "Toplam",
      configTitle: "Konfigürasyon",
      configName: "Görünen ad",
      configSample: "Örnek input",
      configThreshold: "Güven skoru eşiği",
      configRule: "Kural / branch mantığı",
      configPrompt: "Prompt / talimat",
      configSource: "Veri kaynağı",
      configMessage: "Cevap mesajı",
      configMode: "Mod",
      edgeLabel: "Bağlantı etiketi",
      debugTitle: "Debug notları",
      noDebug: "Kritik debug sorunu yok.",
      runStepReceived: "Mesaj alındı",
      runStepIntent: "Intent tespit edildi",
      runStepRoute: "Route seçildi",
      runStepData: "Veri kontrol edildi veya kaydedildi",
      runStepAI: "AI reasoning tamamlandı",
      runStepNotify: "Bildirim gönderildi",
      runStepResponse: "Kullanıcı cevabı üretildi",
      runStepSafety: "Güvenlik yolu hazır",
      runStepEnd: "Workflow tamamlandı",
      summaryIntro: "Bu akış chat trigger ile başlar, intent tespit eder, kullanıcıyı route eder, otomasyon çıktılarını yönetir ve güvenli cevap yoluyla kapanır.",
      nodeTypes: {
        trigger: { title: "Chat Trigger", desc: "Kullanıcı mesaj gönderdiğinde başlar.", category: "Input" },
        intent: { title: "Intent Detector", desc: "Kullanıcının ne istediğini anlar.", category: "AI Mantık" },
        router: { title: "Route Switch", desc: "Akışı farklı yollara böler.", category: "Mantık" },
        condition: { title: "Condition", desc: "Paket müsaitliği gibi bir kuralı kontrol eder.", category: "Mantık" },
        kb: { title: "Knowledge Base", desc: "Güvenilir işletme bilgisini okur.", category: "Veri" },
        llm: { title: "LLM Reasoning", desc: "Bağlama uygun cevap üretir.", category: "AI Mantık" },
        response: { title: "Response", desc: "Kullanıcıya net bir cevap gönderir.", category: "Output" },
        fallback: { title: "Fallback", desc: "Net olmayan veya desteklenmeyen istekleri yönetir.", category: "Güvenlik" },
        sheet: { title: "Google Sheets", desc: "Rezervasyon veya lead verisini kaydeder.", category: "Otomasyon" },
        crm: { title: "CRM Update", desc: "Müşteri kaydı oluşturur veya günceller.", category: "Otomasyon" },
        email: { title: "Email Notify", desc: "Ekibe veya müşteriye bildirim gönderir.", category: "Otomasyon" },
        handoff: { title: "Human Handoff", desc: "Riskli durumları gerçek kişiye aktarır.", category: "Güvenlik" },
        end: { title: "End", desc: "Otomasyonu temiz şekilde kapatır.", category: "Output" }
      },
      scenarios: {
        joyday: {
          title: "Joyday Rezervasyon Botu",
          level: "Seviye 01",
          short: "Rezervasyon akışı",
          goal: "Müşteri mesajını intent tespitine, paket müsaitliğine, kayıt işlemine, onay cevabına ve fallback'e bağla.",
          objective: "Ana rezervasyon dalını ve güvenli fallback dalını kur.",
          messages: ["Merhaba, iki kişi action painting rezervasyonu yapabilir miyiz?", "Cumartesi müsaitlik var mı?", "Ebeveyn çocuk paketi ne kadar?"]
        },
        support: {
          title: "Kurumsal Destek Botu",
          level: "Seviye 02",
          short: "Destek triage",
          goal: "Botun isteği algıladığı, route ettiği, knowledge base kontrol ettiği, LLM ile cevapladığı ve riskli durumları insana aktardığı destek otomasyonu kur.",
          objective: "Routing, knowledge base, LLM response ve human handoff kullan.",
          messages: ["Hesabım kilitlendi ve yardım istiyorum.", "Fatura tutarı yanlış görünüyor.", "Bir insan temsilciyle konuşmak istiyorum."]
        },
        lead: {
          title: "Lead Capture Otomasyonu",
          level: "Seviye 03",
          short: "Satış lead akışı",
          goal: "Kullanıcı intent'ini yakalayan, lead'i kaydeden, ekibe mail atan, kullanıcıya dönen ve güvenli kapanan satış akışı kur.",
          objective: "Lead'i yakala, kaydet, bildir, cevapla ve akışı kapat.",
          messages: ["Web sitemiz için AI chatbot istiyoruz.", "Otomasyon projesi için benimle iletişime geçer misiniz?", "Workflow tasarım fiyatı almak istiyorum."]
        }
      }
    }
  };

  const nodeOrder = ["trigger", "intent", "router", "condition", "kb", "llm", "response", "fallback", "sheet", "crm", "email", "handoff", "end"];
  const nodeIcons = {
    trigger: "bx-message-square-dots", intent: "bx-search-alt", router: "bx-git-branch", condition: "bx-slider-alt", kb: "bx-book-open", llm: "bx-brain", response: "bx-send", fallback: "bx-shield-quarter", sheet: "bx-spreadsheet", crm: "bx-id-card", email: "bx-envelope", handoff: "bx-user-voice", end: "bx-check-circle"
  };
  const typeColor = {
    trigger: "#38bdf8", intent: "#818cf8", router: "#f59e0b", condition: "#fbbf24", kb: "#22d3ee", llm: "#a78bfa", response: "#34d399", fallback: "#fb7185", sheet: "#22c55e", crm: "#06b6d4", email: "#60a5fa", handoff: "#f97316", end: "#34d399"
  };

  const scenarios = [
    {
      id: "joyday",
      requiredTypes: ["trigger", "intent", "condition", "sheet", "response", "fallback", "end"],
      requiredEdges: [["trigger", "intent"], ["intent", "condition"], ["condition", "sheet"], ["sheet", "response"], ["response", "end"], ["condition", "fallback"], ["fallback", "end"]],
      starter: [{ type: "trigger", x: 8, y: 42 }, { type: "end", x: 84, y: 42 }],
      happyTypes: ["trigger", "intent", "condition", "sheet", "response", "end"],
      happyEdges: [["trigger", "intent"], ["intent", "condition"], ["condition", "sheet"], ["sheet", "response"], ["response", "end"]]
    },
    {
      id: "support",
      requiredTypes: ["trigger", "intent", "router", "kb", "llm", "response", "fallback", "handoff", "end"],
      requiredEdges: [["trigger", "intent"], ["intent", "router"], ["router", "kb"], ["kb", "llm"], ["llm", "response"], ["response", "end"], ["router", "handoff"], ["handoff", "end"], ["router", "fallback"], ["fallback", "end"]],
      starter: [{ type: "trigger", x: 7, y: 42 }, { type: "end", x: 84, y: 42 }],
      happyTypes: ["trigger", "intent", "router", "kb", "llm", "response", "end"],
      happyEdges: [["trigger", "intent"], ["intent", "router"], ["router", "kb"], ["kb", "llm"], ["llm", "response"], ["response", "end"]]
    },
    {
      id: "lead",
      requiredTypes: ["trigger", "intent", "crm", "email", "response", "fallback", "end"],
      requiredEdges: [["trigger", "intent"], ["intent", "crm"], ["crm", "email"], ["email", "response"], ["response", "end"], ["intent", "fallback"], ["fallback", "end"]],
      starter: [{ type: "trigger", x: 8, y: 42 }, { type: "end", x: 84, y: 42 }],
      happyTypes: ["trigger", "intent", "crm", "email", "response", "end"],
      happyEdges: [["trigger", "intent"], ["intent", "crm"], ["crm", "email"], ["email", "response"], ["response", "end"]]
    }
  ];

  const state = {
    scenarioIndex: 0,
    nodes: [],
    links: [],
    selectedNodeId: null,
    selectedSourceId: null,
    selectedLinkKey: null,
    runningNodeId: null,
    score: Number(localStorage.getItem(STORAGE_KEY) || 0),
    completed: new Set(),
    drag: null,
    lastValidation: null,
    lastQuality: null,
    runTimer: null,
    runSerial: 0
  };

  function lang() {
    return (document.documentElement.lang || localStorage.getItem("kaanbalci-site-language") || "en") === "tr" ? "tr" : "en";
  }
  function t(key) { const active = copy[lang()] || copy.en; return active[key] || copy.en[key] || key; }
  function tNode(type) { return (copy[lang()].nodeTypes && copy[lang()].nodeTypes[type]) || copy.en.nodeTypes[type]; }
  function tScenario(id) { return (copy[lang()].scenarios && copy[lang()].scenarios[id]) || copy.en.scenarios[id]; }
  function uid() { return safeCrypto.randomUUID ? safeCrypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function currentScenario() { return scenarios[state.scenarioIndex]; }

  function safe(value) {
    return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  }

  function defaultConfig(type) {
    const data = tNode(type);
    const base = { name: data.title };
    if (type === "trigger") return { ...base, sample: tScenario(currentScenario().id).messages[0] || "Hello", mode: "chat" };
    if (type === "intent") return { ...base, sample: "reservation, support, lead", threshold: "0.72" };
    if (type === "router") return { ...base, rule: "reservation / support / lead / unknown" };
    if (type === "condition") return { ...base, rule: "if availability == true" };
    if (type === "kb") return { ...base, source: "FAQ + package data" };
    if (type === "llm") return { ...base, prompt: "Answer clearly using only trusted context." };
    if (type === "response") return { ...base, message: "Thanks! I can help with that." };
    if (type === "fallback") return { ...base, message: "I could not understand. Can I ask one more question?" };
    if (type === "sheet") return { ...base, source: "Website Requests / Reservations" };
    if (type === "crm") return { ...base, source: "Leads CRM" };
    if (type === "email") return { ...base, message: "Send internal notification email." };
    if (type === "handoff") return { ...base, mode: "assign to human" };
    return { ...base, mode: "finish" };
  }

  function setStatus(message, tone = "info") {
    if (!els.statusBox) return;
    els.statusBox.dataset.tone = tone;
    const span = els.statusBox.querySelector("span");
    if (span) span.textContent = message;
  }
  function setResult(html, tone = "info") {
    if (!els.resultBox) return;
    els.resultBox.dataset.tone = tone;
    els.resultBox.innerHTML = html;
  }

  function applyText() {
    document.querySelectorAll("[data-ai-flow-text]").forEach((node) => {
      const key = node.getAttribute("data-ai-flow-text");
      if (key && t(key)) node.textContent = t(key);
    });
    renderScenarioCards();
    renderTemplates();
    renderPalette();
    renderTestMessages();
    renderObjectives();
    renderBoard();
    updateScenarioHeader();
    updateInspector();
    updateHud();
    updateScoreBreakdown();
    if (!state.lastValidation) setResult(`<span>${t("resultReady")}</span>`);
    if (!els.runLog?.querySelector("article")) resetRunLog();
    setStatus(t("connectTip"));
  }

  window.updateAiFlowPuzzleLanguage = function updateAiFlowPuzzleLanguage(language) {
    document.documentElement.lang = language === "tr" ? "tr" : "en";
    applyText();
  };

  function resetScenario(index = state.scenarioIndex, template = "blank") {
    state.scenarioIndex = Math.max(0, Math.min(scenarios.length - 1, index));
    state.nodes = [];
    state.links = [];
    state.selectedNodeId = null;
    state.selectedSourceId = null;
    state.selectedLinkKey = null;
    state.runningNodeId = null;
    state.lastValidation = null;
    state.lastQuality = null;
    clearTimeout(state.runTimer);
    resetRunLog();

    if (template === "solution") {
      loadTemplate("solution", false);
    } else if (template === "happy") {
      loadTemplate("happy", false);
    } else {
      currentScenario().starter.forEach((item) => addNode(item.type, item.x, item.y, false));
    }
    renderAll();
    setStatus(t("boardReset"));
  }

  function addNode(type, x, y, shouldRender = true) {
    const existingSameType = state.nodes.filter((node) => node.type === type).length;
    const fallbackX = 14 + ((state.nodes.length * 13) % 62);
    const fallbackY = 20 + ((state.nodes.length * 17) % 54);
    const node = {
      id: uid(),
      type,
      x: typeof x === "number" ? x : Math.min(84, fallbackX + existingSameType * 4),
      y: typeof y === "number" ? y : Math.min(82, fallbackY + existingSameType * 5),
      config: defaultConfig(type)
    };
    state.nodes.push(node);
    if (shouldRender) {
      state.selectedNodeId = node.id;
      renderAll();
      setStatus(t("nodeAdded"), "success");
    }
    return node;
  }

  function removeNode(id) {
    state.nodes = state.nodes.filter((node) => node.id !== id);
    state.links = state.links.filter((link) => link.from !== id && link.to !== id);
    if (state.selectedNodeId === id) state.selectedNodeId = null;
    if (state.selectedSourceId === id) state.selectedSourceId = null;
    renderAll();
    setStatus(t("nodeRemoved"));
  }

  function nodeById(id) { return state.nodes.find((node) => node.id === id); }
  function linkKey(link) { return `${link.from}->${link.to}`; }

  function edgeLabel(fromType, toType) {
    const tr = lang() === "tr";
    const map = {
      "trigger->intent": tr ? "mesaj" : "message",
      "intent->condition": tr ? "rezervasyon" : "reservation",
      "intent->router": "intent",
      "intent->crm": "lead",
      "intent->fallback": tr ? "belirsiz" : "unknown",
      "condition->sheet": tr ? "müsait" : "available",
      "condition->fallback": tr ? "müsait değil" : "not available",
      "sheet->response": tr ? "kaydedildi" : "saved",
      "router->kb": tr ? "bilgi" : "known",
      "router->handoff": tr ? "riskli" : "risky",
      "router->fallback": tr ? "belirsiz" : "unknown",
      "kb->llm": "context",
      "llm->response": tr ? "cevap" : "answer",
      "crm->email": tr ? "kayıt" : "lead saved",
      "email->response": tr ? "bildirim" : "notified",
      "response->end": tr ? "tamam" : "done",
      "fallback->end": "fallback",
      "handoff->end": tr ? "devredildi" : "assigned"
    };
    return map[`${fromType}->${toType}`] || (tr ? "bağlantı" : "link");
  }

  function connectNodes(from, to) {
    if (!from || !to || from === to) { setStatus(t("selfConnection"), "warning"); return; }
    if (state.links.some((link) => link.from === from && link.to === to)) { setStatus(t("duplicateConnection"), "warning"); return; }
    const fromNode = nodeById(from);
    const toNode = nodeById(to);
    state.links.push({ from, to, label: edgeLabel(fromNode?.type, toNode?.type) });
    state.selectedSourceId = null;
    state.selectedNodeId = to;
    state.selectedLinkKey = null;
    renderAll();
    setStatus(t("connected"), "success");
  }

  function removeLink(from, to) {
    state.links = state.links.filter((link) => !(link.from === from && link.to === to));
    state.selectedLinkKey = null;
    renderAll();
    setStatus(t("connectionRemoved"));
  }

  function handleNodeClick(id) {
    if (state.drag && state.drag.moved) return;
    if (state.selectedSourceId && state.selectedSourceId !== id) { connectNodes(state.selectedSourceId, id); return; }
    state.selectedNodeId = id;
    state.selectedSourceId = id;
    state.selectedLinkKey = null;
    renderAll();
    setStatus(t("activeSource"), "active");
  }

  function getBoardRect() { return board.getBoundingClientRect(); }
  function clampNodePosition(x, y) { return { x: Math.max(4, Math.min(88, x)), y: Math.max(8, Math.min(86, y)) }; }

  function renderScenarioCards() {
    if (!els.scenarioHolder) return;
    els.scenarioHolder.innerHTML = scenarios.map((scenario, index) => {
      const item = tScenario(scenario.id);
      const isActive = index === state.scenarioIndex;
      const isDone = state.completed.has(scenario.id);
      return `<button class="ai-scenario-card ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}" type="button" data-ai-scenario="${index}">
        <span>${safe(item.level)}</span><strong>${safe(item.title)}</strong><small>${safe(item.short)}</small><em>${isDone ? t("scenarioCompleted") : t("scenarioLocked")}</em>
      </button>`;
    }).join("");
    els.scenarioHolder.querySelectorAll("[data-ai-scenario]").forEach((button) => button.addEventListener("click", () => resetScenario(Number(button.dataset.aiScenario))));
  }

  function renderTemplates() {
    if (!els.templateHolder) return;
    const buttons = [
      ["blank", t("templateBlank"), t("templateBlankDesc")],
      ["happy", t("templateHappy"), t("templateHappyDesc")],
      ["solution", t("templateSolution"), t("templateSolutionDesc")]
    ];
    els.templateHolder.innerHTML = buttons.map(([id, title, desc]) => `<button class="ai-template-card" type="button" data-ai-template="${id}"><strong>${safe(title)}</strong><small>${safe(desc)}</small></button>`).join("");
    els.templateHolder.querySelectorAll("[data-ai-template]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.aiTemplate;
      if (id === "blank") resetScenario(state.scenarioIndex);
      else loadTemplate(id, true);
    }));
  }

  function renderPalette() {
    if (!els.paletteHolder) return;
    els.paletteHolder.innerHTML = nodeOrder.map((type) => {
      const data = tNode(type);
      return `<button class="ai-palette-node" type="button" data-ai-add-node="${type}" style="--node-color:${typeColor[type]}">
        <i class="bx ${nodeIcons[type]}"></i><span><strong>${safe(data.title)}</strong><small>${safe(data.category)}</small></span>
      </button>`;
    }).join("");
    els.paletteHolder.querySelectorAll("[data-ai-add-node]").forEach((button) => button.addEventListener("click", () => addNode(button.dataset.aiAddNode)));
  }

  function renderTestMessages() {
    if (!els.testMessageSelect) return;
    const scenarioText = tScenario(currentScenario().id);
    const currentValue = els.testMessageSelect.value;
    els.testMessageSelect.innerHTML = (scenarioText.messages || []).map((message, index) => `<option value="${index}">${safe(message)}</option>`).join("");
    if (currentValue && els.testMessageSelect.querySelector(`option[value="${currentValue}"]`)) els.testMessageSelect.value = currentValue;
  }

  function hasType(type) { return state.nodes.some((node) => node.type === type); }
  function hasTypeEdge(fromType, toType) {
    return state.links.some((link) => {
      const from = nodeById(link.from); const to = nodeById(link.to);
      return from?.type === fromType && to?.type === toType;
    });
  }

  function renderObjectives() {
    if (!els.objectiveHolder) return;
    const scenario = currentScenario();
    const labels = tScenario(scenario.id);
    const typesDone = new Set(state.nodes.map((node) => node.type));
    const requiredNodeHtml = scenario.requiredTypes.map((type) => {
      const done = typesDone.has(type);
      return `<li class="${done ? "is-done" : ""}"><i class="bx ${done ? "bx-check" : "bx-circle"}"></i>${safe(tNode(type).title)}</li>`;
    }).join("");
    const requiredLinkHtml = scenario.requiredEdges.map(([from, to]) => {
      const done = hasTypeEdge(from, to);
      return `<li class="${done ? "is-done" : ""}"><i class="bx ${done ? "bx-check" : "bx-circle"}"></i>${safe(tNode(from).title)} → ${safe(tNode(to).title)}</li>`;
    }).join("");
    els.objectiveHolder.innerHTML = `<div class="ai-objective-brief"><strong>${safe(labels.objective)}</strong></div>
      <details open><summary>${t("requiredNodes")}</summary><ul>${requiredNodeHtml}</ul></details>
      <details open><summary>${t("requiredConnections")}</summary><ul>${requiredLinkHtml}</ul></details>
      <p><strong>${t("optionalRule")}:</strong> ${safe(tNode("fallback").desc)}</p>`;
  }

  function updateScenarioHeader() {
    const info = tScenario(currentScenario().id);
    if (els.scenarioTitleNode) els.scenarioTitleNode.textContent = info.title;
    if (els.scenarioGoalNode) els.scenarioGoalNode.textContent = info.goal;
  }

  function renderBoard() {
    board.querySelectorAll(".ai-flow-node").forEach((node) => node.remove());
    state.nodes.forEach((node) => {
      const data = tNode(node.type);
      const element = document.createElement("button");
      element.type = "button";
      element.className = "ai-flow-node";
      element.dataset.nodeId = node.id;
      element.dataset.type = node.type;
      element.style.left = `${node.x}%`;
      element.style.top = `${node.y}%`;
      element.style.setProperty("--node-color", typeColor[node.type]);
      element.classList.toggle("is-selected", state.selectedNodeId === node.id);
      element.classList.toggle("is-source", state.selectedSourceId === node.id);
      element.classList.toggle("is-running", state.runningNodeId === node.id);
      element.innerHTML = `<span class="ai-flow-node-icon"><i class="bx ${nodeIcons[node.type]}"></i></span><span class="ai-flow-node-copy"><strong>${safe(node.config?.name || data.title)}</strong><small>${safe(data.category)}</small></span>`;
      element.addEventListener("pointerdown", (event) => beginDrag(event, node.id));
      element.addEventListener("click", (event) => { event.preventDefault(); handleNodeClick(node.id); });
      board.appendChild(element);
    });
    requestAnimationFrame(renderLines);
  }

  function renderLines() {
    const rect = getBoardRect();
    const defs = `<defs><marker id="ai-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M2,2 L10,6 L2,10 Z" fill="currentColor"></path></marker></defs>`;
    const paths = state.links.map((link) => {
      const fromEl = board.querySelector(`[data-node-id="${link.from}"]`);
      const toEl = board.querySelector(`[data-node-id="${link.to}"]`);
      if (!fromEl || !toEl) return "";
      const a = fromEl.getBoundingClientRect();
      const b = toEl.getBoundingClientRect();
      const x1 = a.left - rect.left + a.width;
      const y1 = a.top - rect.top + a.height / 2;
      const x2 = b.left - rect.left;
      const y2 = b.top - rect.top + b.height / 2;
      const curve = Math.max(60, Math.abs(x2 - x1) * 0.42);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2 - 8;
      const key = linkKey(link);
      const active = state.selectedLinkKey === key ? " is-selected" : "";
      return `<path class="ai-flow-path${active}" d="M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}" marker-end="url(#ai-arrow)"></path><g class="ai-flow-label${active}" data-link-key="${safe(key)}"><rect x="${midX - 46}" y="${midY - 13}" width="92" height="24" rx="12"></rect><text x="${midX}" y="${midY + 4}">${safe(link.label || "link")}</text></g>`;
    }).join("");
    linesLayer.innerHTML = defs + paths;
  }

  function beginDrag(event, id) {
    const node = nodeById(id);
    if (!node) return;
    const rect = getBoardRect();
    state.drag = { id, startX: event.clientX, startY: event.clientY, nodeX: node.x, nodeY: node.y, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const onMove = (moveEvent) => {
      if (!state.drag || state.drag.id !== id) return;
      const dx = ((moveEvent.clientX - state.drag.startX) / rect.width) * 100;
      const dy = ((moveEvent.clientY - state.drag.startY) / rect.height) * 100;
      if (Math.abs(moveEvent.clientX - state.drag.startX) + Math.abs(moveEvent.clientY - state.drag.startY) > 6) state.drag.moved = true;
      const next = clampNodePosition(state.drag.nodeX + dx, state.drag.nodeY + dy);
      node.x = next.x; node.y = next.y;
      const el = board.querySelector(`[data-node-id="${id}"]`);
      if (el) { el.style.left = `${node.x}%`; el.style.top = `${node.y}%`; }
      renderLines();
    };
    const onUp = () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); setTimeout(() => { state.drag = null; }, 0); };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  function updateConfig(id, key, value) {
    const node = nodeById(id);
    if (!node) return;
    node.config = { ...(node.config || defaultConfig(node.type)), [key]: value };
    if (key === "name") renderBoard();
  }

  function configFields(node) {
    const fields = [{ key: "name", label: t("configName"), type: "text" }];
    if (node.type === "trigger" || node.type === "intent") fields.push({ key: "sample", label: t("configSample"), type: "textarea" });
    if (node.type === "intent") fields.push({ key: "threshold", label: t("configThreshold"), type: "range", min: "0.45", max: "0.95", step: "0.01" });
    if (["router", "condition"].includes(node.type)) fields.push({ key: "rule", label: t("configRule"), type: "textarea" });
    if (node.type === "llm") fields.push({ key: "prompt", label: t("configPrompt"), type: "textarea" });
    if (["kb", "sheet", "crm"].includes(node.type)) fields.push({ key: "source", label: t("configSource"), type: "text" });
    if (["response", "fallback", "email"].includes(node.type)) fields.push({ key: "message", label: t("configMessage"), type: "textarea" });
    if (["trigger", "handoff", "end"].includes(node.type)) fields.push({ key: "mode", label: t("configMode"), type: "text" });
    return fields;
  }

  function updateInspector() {
    if (!els.inspector) return;
    const selected = nodeById(state.selectedNodeId);
    if (!selected) {
      els.inspector.innerHTML = `<strong>${t("inspectorEmptyTitle")}</strong><p>${t("inspectorEmptyText")}</p>`;
      return;
    }
    const data = tNode(selected.type);
    const outgoing = state.links.filter((link) => link.from === selected.id);
    const fieldsHtml = configFields(selected).map((field) => {
      const value = selected.config?.[field.key] ?? "";
      if (field.type === "textarea") {
        return `<label>${safe(field.label)}<textarea rows="3" data-ai-config-field="${field.key}">${safe(value)}</textarea></label>`;
      }
      if (field.type === "range") {
        return `<label>${safe(field.label)} <output>${safe(value)}</output><input type="range" min="${field.min}" max="${field.max}" step="${field.step}" value="${safe(value)}" data-ai-config-field="${field.key}"></label>`;
      }
      return `<label>${safe(field.label)}<input type="text" value="${safe(value)}" data-ai-config-field="${field.key}"></label>`;
    }).join("");
    els.inspector.innerHTML = `<div class="ai-inspector-head" style="--node-color:${typeColor[selected.type]}"><i class="bx ${nodeIcons[selected.type]}"></i><div><span>${t("selectedLabel")}</span><strong>${safe(data.title)}</strong></div></div><p>${safe(data.desc)}</p>
      <div class="ai-node-config"><strong>${t("configTitle")}</strong>${fieldsHtml}</div>
      <div class="ai-inspector-actions"><button type="button" data-ai-start-link="${selected.id}">${t("startConnection")}</button><button type="button" data-ai-remove-node="${selected.id}">${t("removeNode")}</button></div>
      <strong class="ai-connections-title">${t("connectionList")}</strong><div class="ai-connection-list">${outgoing.length ? outgoing.map((link) => { const target = nodeById(link.to); if (!target) return ""; return `<button type="button" data-ai-remove-link-from="${link.from}" data-ai-remove-link-to="${link.to}"><span>${safe(link.label || "link")} · ${safe(tNode(selected.type).title)} → ${safe(tNode(target.type).title)}</span><i class="bx bx-x"></i></button>`; }).join("") : `<span>${t("noConnections")}</span>`}</div>`;
    els.inspector.querySelectorAll("[data-ai-config-field]").forEach((input) => {
      input.addEventListener("input", () => {
        updateConfig(selected.id, input.dataset.aiConfigField, input.value);
        if (input.previousElementSibling?.tagName === "OUTPUT") input.previousElementSibling.textContent = input.value;
      });
    });
    els.inspector.querySelectorAll("[data-ai-start-link]").forEach((button) => button.addEventListener("click", () => { state.selectedSourceId = button.dataset.aiStartLink; renderAll(); setStatus(t("activeSource"), "active"); }));
    els.inspector.querySelectorAll("[data-ai-remove-node]").forEach((button) => button.addEventListener("click", () => removeNode(button.dataset.aiRemoveNode)));
    els.inspector.querySelectorAll("[data-ai-remove-link-from]").forEach((button) => button.addEventListener("click", () => removeLink(button.dataset.aiRemoveLinkFrom, button.dataset.aiRemoveLinkTo)));
  }

  function validateCurrentFlow(showResult = true) {
    const scenario = currentScenario();
    const missingNodes = scenario.requiredTypes.filter((type) => !hasType(type));
    const missingEdges = scenario.requiredEdges.filter(([from, to]) => !hasTypeEdge(from, to));
    const debug = [];
    if (!hasType("fallback")) debug.push(`${tNode("fallback").title}: ${tNode("fallback").desc}`);
    if (state.links.some((link) => nodeById(link.from)?.type === "response" && nodeById(link.to)?.type !== "end")) debug.push(lang() === "tr" ? "Response sonrası akış genelde End ile kapanmalı." : "A response should usually close with End.");
    if (state.nodes.length > scenario.requiredTypes.length + 5) debug.push(lang() === "tr" ? "Çok fazla node var; verimlilik düşebilir." : "Too many nodes may reduce efficiency.");
    const valid = missingNodes.length === 0 && missingEdges.length === 0;
    const quality = computeQuality(missingNodes, missingEdges, debug);
    state.lastValidation = { valid, missingNodes, missingEdges, debug };
    state.lastQuality = quality;

    if (showResult) {
      if (valid) {
        state.completed.add(scenario.id);
        const award = Math.max(120, quality.total * 4);
        state.score += award;
        localStorage.setItem(STORAGE_KEY, String(state.score));
        setResult(`<strong>${t("successTitle")}</strong><p>${t("successText")}</p><p><strong>${t("totalScore")}: ${quality.total}/100</strong></p><p>${safe(makeSummary())}</p>`, "success");
        setStatus(t("successTitle"), "success");
      } else {
        const missingHtml = [
          ...missingNodes.map((type) => `<li>${t("missingNode")} <strong>${safe(tNode(type).title)}</strong></li>`),
          ...missingEdges.map(([from, to]) => `<li>${t("missingEdge")} <strong>${safe(tNode(from).title)}</strong> → <strong>${safe(tNode(to).title)}</strong></li>`)
        ].slice(0, 10).join("");
        const debugHtml = debug.length ? `<strong>${t("debugTitle")}</strong><ul>${debug.map((item) => `<li>${safe(item)}</li>`).join("")}</ul>` : `<p>${t("noDebug")}</p>`;
        setResult(`<strong>${t("missingTitle")}</strong><ul>${missingHtml}</ul>${debugHtml}`, "warning");
        setStatus(t("missingTitle"), "warning");
      }
    }
    renderAll(false);
    return state.lastValidation;
  }

  function computeQuality(missingNodes, missingEdges, debug) {
    const scenario = currentScenario();
    const totalReq = scenario.requiredTypes.length + scenario.requiredEdges.length;
    const completedReq = totalReq - missingNodes.length - missingEdges.length;
    const logic = Math.max(0, Math.round((completedReq / Math.max(1, totalReq)) * 100));
    const automationNodes = ["sheet", "crm", "email"].filter(hasType).length;
    const automation = Math.min(100, 35 + automationNodes * 22 + (hasTypeEdge("sheet", "response") || hasTypeEdge("email", "response") ? 12 : 0));
    const ux = Math.min(100, 40 + (hasType("response") ? 25 : 0) + (hasType("router") || hasType("condition") ? 15 : 0) + (els.testMessageSelect?.value !== "" ? 10 : 0));
    const safety = Math.min(100, 30 + (hasType("fallback") ? 40 : 0) + (hasType("handoff") ? 20 : 0) + (hasType("end") ? 10 : 0));
    const efficiencyPenalty = Math.max(0, (state.nodes.length - scenario.requiredTypes.length) * 5 + Math.max(0, state.links.length - scenario.requiredEdges.length) * 3);
    const efficiency = Math.max(45, 100 - efficiencyPenalty);
    const debugPenalty = debug.length * 4;
    const total = Math.max(0, Math.min(100, Math.round((logic * 0.36) + (automation * 0.2) + (ux * 0.16) + (safety * 0.18) + (efficiency * 0.1) - debugPenalty)));
    return { logic, automation, ux, safety, efficiency, total };
  }

  function updateScoreBreakdown() {
    if (!els.scoreBreakdown) return;
    const quality = state.lastQuality || computeQuality(currentScenario().requiredTypes, currentScenario().requiredEdges, []);
    const rows = [[t("logicScore"), quality.logic], [t("automationScore"), quality.automation], [t("uxScore"), quality.ux], [t("safetyScore"), quality.safety], [t("efficiencyScore"), quality.efficiency]];
    els.scoreBreakdown.innerHTML = `<strong>${t("totalScore")}: ${quality.total}/100</strong>${rows.map(([label, value]) => `<div class="ai-score-row"><span>${safe(label)}</span><meter min="0" max="100" value="${value}"></meter><b>${value}</b></div>`).join("")}`;
  }

  function showHint() {
    const result = validateCurrentFlow(false);
    if (!result.missingNodes.length && !result.missingEdges.length) { setResult(`<strong>${t("hintIntro")}</strong><p>${t("allClear")}</p>`, "success"); return; }
    if (result.missingNodes.length) {
      const type = result.missingNodes[0];
      setResult(`<strong>${t("hintIntro")}</strong><p>${t("missingNode")} <strong>${safe(tNode(type).title)}</strong> — ${safe(tNode(type).desc)}</p>`, "info");
      return;
    }
    const [from, to] = result.missingEdges[0];
    setResult(`<strong>${t("hintIntro")}</strong><p>${t("missingEdge")} <strong>${safe(tNode(from).title)}</strong> → <strong>${safe(tNode(to).title)}</strong></p>`, "info");
  }

  function autoArrange() {
    const scenario = currentScenario();
    const types = Array.from(new Set([...scenario.requiredTypes, ...state.nodes.map((node) => node.type)]));
    const columns = Math.max(2, types.length - 1);
    const layout = {};
    types.forEach((type, index) => {
      layout[type] = { x: 7 + (index / columns) * 78, y: index % 2 === 0 ? 34 : 58 };
    });
    state.nodes.forEach((node) => {
      const pos = layout[node.type];
      if (pos) {
        const sameTypeIndex = state.nodes.filter((n) => n.type === node.type).findIndex((n) => n.id === node.id);
        node.x = pos.x;
        node.y = pos.y + sameTypeIndex * 7;
      }
    });
    renderAll();
  }

  function loadTemplate(kind, shouldRender = true) {
    const scenario = currentScenario();
    state.nodes = [];
    state.links = [];
    state.selectedNodeId = null;
    state.selectedSourceId = null;
    state.lastValidation = null;
    state.lastQuality = null;
    const types = kind === "solution" ? scenario.requiredTypes : scenario.happyTypes;
    const edges = kind === "solution" ? scenario.requiredEdges : scenario.happyEdges;
    const columns = Math.max(2, types.length - 1);
    const nodeMap = {};
    types.forEach((type, index) => {
      const node = addNode(type, 7 + (index / columns) * 78, index % 2 === 0 ? 34 : 58, false);
      nodeMap[type] = node.id;
    });
    edges.forEach(([from, to]) => {
      if (nodeMap[from] && nodeMap[to]) state.links.push({ from: nodeMap[from], to: nodeMap[to], label: edgeLabel(from, to) });
    });
    if (shouldRender) {
      renderAll();
      setStatus(kind === "solution" ? t("templateSolution") : t("templateHappy"), "success");
    }
  }

  function updateHud() {
    if (els.scoreNode) els.scoreNode.textContent = String(state.score);
    if (els.nodeCountNode) els.nodeCountNode.textContent = String(state.nodes.length);
    if (els.linkCountNode) els.linkCountNode.textContent = String(state.links.length);
  }

  function resetRunLog() {
    if (!els.runLog) return;
    els.runLog.innerHTML = `<span>${t("runLogEmpty")}</span>`;
  }

  function appendRunLog(title, text, tone = "info") {
    if (!els.runLog) return;
    if (els.runLog.querySelector("span")) els.runLog.innerHTML = "";
    const item = document.createElement("article");
    item.dataset.tone = tone;
    item.innerHTML = `<strong>${safe(title)}</strong><p>${safe(text)}</p>`;
    els.runLog.appendChild(item);
    els.runLog.scrollTop = els.runLog.scrollHeight;
  }

  function runLabelForType(type) {
    if (type === "trigger") return t("runStepReceived");
    if (type === "intent") return t("runStepIntent");
    if (type === "router" || type === "condition") return t("runStepRoute");
    if (type === "sheet" || type === "crm" || type === "kb") return t("runStepData");
    if (type === "llm") return t("runStepAI");
    if (type === "email") return t("runStepNotify");
    if (type === "response") return t("runStepResponse");
    if (type === "fallback" || type === "handoff") return t("runStepSafety");
    return t("runStepEnd");
  }

  function collectExecutionOrder() {
    const trigger = state.nodes.find((node) => node.type === "trigger") || state.nodes[0];
    if (!trigger) return [];
    const visited = new Set();
    const order = [];
    function walk(node) {
      if (!node || visited.has(node.id)) return;
      visited.add(node.id); order.push(node);
      state.links.filter((link) => link.from === node.id)
        .map((link) => nodeById(link.to))
        .filter(Boolean)
        .sort((a, b) => nodeOrder.indexOf(a.type) - nodeOrder.indexOf(b.type))
        .forEach(walk);
    }
    walk(trigger);
    return order;
  }

  function sleep(ms) { return new Promise((resolve) => { state.runTimer = setTimeout(resolve, ms); }); }

  async function runFlow() {
    const serial = ++state.runSerial;
    const validation = validateCurrentFlow(false);
    if (!validation.valid) {
      setResult(`<strong>${t("runInvalid")}</strong><p>${t("missingTitle")}</p>`, "warning");
      setStatus(t("runInvalid"), "warning");
      appendRunLog(t("runInvalid"), validation.missingEdges[0] ? `${t("missingEdge")} ${tNode(validation.missingEdges[0][0]).title} → ${tNode(validation.missingEdges[0][1]).title}` : t("missingTitle"), "warning");
      return;
    }
    resetRunLog();
    const messages = tScenario(currentScenario().id).messages || [];
    const message = messages[Number(els.testMessageSelect?.value || 0)] || messages[0] || "Hello";
    appendRunLog(t("runStarted"), message, "info");
    setStatus(t("runStarted"), "active");
    const order = collectExecutionOrder();
    for (const node of order) {
      if (serial !== state.runSerial) return;
      state.runningNodeId = node.id;
      renderBoard();
      appendRunLog(runLabelForType(node.type), `${tNode(node.type).title}: ${node.config?.name || tNode(node.type).title}`, node.type === "fallback" || node.type === "handoff" ? "warning" : "success");
      await sleep(460);
    }
    state.runningNodeId = null;
    renderBoard();
    validateCurrentFlow(true);
    appendRunLog(t("runCompleted"), makeSummary(), "success");
    setStatus(t("runCompleted"), "success");
  }

  function buildPayload() {
    const scenario = currentScenario();
    return {
      game: "AI Flow Puzzle",
      scenario: scenario.id,
      scenarioTitle: tScenario(scenario.id).title,
      generatedAt: new Date().toISOString(),
      quality: state.lastQuality || computeQuality([], [], []),
      summary: makeSummary(),
      nodes: state.nodes.map((node) => ({ id: node.id, type: node.type, label: node.config?.name || tNode(node.type).title, config: node.config, position: { x: Math.round(node.x), y: Math.round(node.y) } })),
      connections: state.links.map((link) => ({ from: link.from, to: link.to, label: link.label }))
    };
  }

  function downloadBlob(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  function exportJson() {
    downloadBlob(t("jsonFilename"), JSON.stringify(buildPayload(), null, 2), "application/json");
    setStatus(t("exportDone"), "success");
  }

  function importJsonFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        if (!Array.isArray(payload.nodes) || !Array.isArray(payload.connections)) throw new Error("Invalid payload");
        state.nodes = payload.nodes.map((node) => ({ id: node.id || uid(), type: node.type, x: node.position?.x ?? 20, y: node.position?.y ?? 30, config: node.config || defaultConfig(node.type) })).filter((node) => nodeOrder.includes(node.type));
        const ids = new Set(state.nodes.map((node) => node.id));
        state.links = payload.connections.map((link) => ({ from: link.from, to: link.to, label: link.label || "link" })).filter((link) => ids.has(link.from) && ids.has(link.to));
        state.lastValidation = null; state.lastQuality = null; state.selectedNodeId = null; state.selectedSourceId = null;
        renderAll();
        setStatus(t("importDone"), "success");
      } catch (error) { setStatus(t("importFailed"), "warning"); }
    };
    reader.readAsText(file);
  }

  function makeSummary() {
    const scenario = tScenario(currentScenario().id);
    const nodeNames = state.nodes.map((node) => node.config?.name || tNode(node.type).title).join(" → ");
    return `${scenario.title}: ${t("summaryIntro")} ${nodeNames ? `Nodes: ${nodeNames}.` : ""}`;
  }

  async function copySummary() {
    const text = makeSummary();
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const area = document.createElement("textarea"); area.value = text; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
    }
    setStatus(t("summaryCopied"), "success");
  }

  function downloadReport() {
    const payload = buildPayload();
    const report = `${payload.scenarioTitle}\n\n${payload.summary}\n\n${t("totalScore")}: ${payload.quality.total}/100\n${t("logicScore")}: ${payload.quality.logic}\n${t("automationScore")}: ${payload.quality.automation}\n${t("uxScore")}: ${payload.quality.ux}\n${t("safetyScore")}: ${payload.quality.safety}\n${t("efficiencyScore")}: ${payload.quality.efficiency}\n\nNodes:\n${payload.nodes.map((node) => `- ${node.label} (${node.type})`).join("\n")}\n\nConnections:\n${payload.connections.map((link) => { const from = state.nodes.find((node) => node.id === link.from); const to = state.nodes.find((node) => node.id === link.to); return `- ${from?.config?.name || from?.type} -> ${to?.config?.name || to?.type} [${link.label}]`; }).join("\n")}`;
    downloadBlob(t("reportFilename"), report, "text/plain");
    setStatus(t("reportDone"), "success");
  }

  function downloadPng() {
    const canvas = document.createElement("canvas");
    canvas.width = 1600; canvas.height = 1000;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#07111f"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0d1b2f"; ctx.fillRect(60, 90, 1480, 820);
    ctx.strokeStyle = "rgba(56,189,248,.28)"; ctx.lineWidth = 3; roundRect(ctx, 60, 90, 1480, 820, 34); ctx.stroke();
    ctx.fillStyle = "#f8fbff"; ctx.font = "bold 44px Inter, Arial"; ctx.fillText(tScenario(currentScenario().id).title, 80, 58);
    const positions = new Map();
    state.nodes.forEach((node) => positions.set(node.id, { x: 100 + (node.x / 100) * 1400, y: 130 + (node.y / 100) * 740 }));
    state.links.forEach((link) => {
      const a = positions.get(link.from); const b = positions.get(link.to); if (!a || !b) return;
      ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(a.x + 95, a.y); ctx.bezierCurveTo(a.x + 210, a.y, b.x - 210, b.y, b.x - 95, b.y); ctx.stroke();
      ctx.fillStyle = "rgba(7,17,31,.88)"; roundRect(ctx, (a.x + b.x) / 2 - 72, (a.y + b.y) / 2 - 22, 144, 34, 17); ctx.fill();
      ctx.fillStyle = "#f8fbff"; ctx.font = "bold 18px Inter, Arial"; ctx.textAlign = "center"; ctx.fillText(link.label || "link", (a.x + b.x) / 2, (a.y + b.y) / 2 + 3); ctx.textAlign = "left";
    });
    state.nodes.forEach((node) => {
      const pos = positions.get(node.id); if (!pos) return;
      ctx.fillStyle = "#0d1b2f"; roundRect(ctx, pos.x - 105, pos.y - 42, 210, 84, 22); ctx.fill();
      ctx.strokeStyle = typeColor[node.type]; ctx.lineWidth = 4; roundRect(ctx, pos.x - 105, pos.y - 42, 210, 84, 22); ctx.stroke();
      ctx.fillStyle = typeColor[node.type]; roundRect(ctx, pos.x - 92, pos.y - 24, 46, 46, 14); ctx.fill();
      ctx.fillStyle = "#f8fbff"; ctx.font = "bold 19px Inter, Arial"; ctx.fillText(node.config?.name || tNode(node.type).title, pos.x - 34, pos.y - 4, 125);
      ctx.fillStyle = "#a8b7ca"; ctx.font = "bold 14px Inter, Arial"; ctx.fillText(tNode(node.type).category, pos.x - 34, pos.y + 20, 125);
    });
    const anchor = document.createElement("a");
    anchor.download = t("pngFilename");
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
    setStatus(t("pngDone"), "success");
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function nextScenario() { resetScenario((state.scenarioIndex + 1) % scenarios.length); }

  function renderAll(resetResult = true) {
    updateScenarioHeader(); renderScenarioCards(); renderTemplates(); renderObjectives(); renderBoard(); updateInspector(); updateHud(); updateScoreBreakdown(); renderTestMessages();
    if (resetResult && !state.lastValidation) setResult(`<span>${t("resultReady")}</span>`);
  }

  function setupEvents() {
    document.querySelector("[data-ai-run]")?.addEventListener("click", runFlow);
    document.querySelector("[data-ai-validate]")?.addEventListener("click", () => validateCurrentFlow(true));
    document.querySelector("[data-ai-hint]")?.addEventListener("click", showHint);
    document.querySelector("[data-ai-arrange]")?.addEventListener("click", autoArrange);
    document.querySelector("[data-ai-reset]")?.addEventListener("click", () => resetScenario(state.scenarioIndex));
    document.querySelector("[data-ai-export]")?.addEventListener("click", exportJson);
    document.querySelector("[data-ai-import]")?.addEventListener("click", () => els.importInput?.click());
    els.importInput?.addEventListener("change", () => importJsonFile(els.importInput.files?.[0]));
    document.querySelector("[data-ai-copy]")?.addEventListener("click", copySummary);
    document.querySelector("[data-ai-report]")?.addEventListener("click", downloadReport);
    document.querySelector("[data-ai-png]")?.addEventListener("click", downloadPng);
    document.querySelector("[data-ai-next]")?.addEventListener("click", nextScenario);
    document.querySelector("[data-ai-scroll-game]")?.addEventListener("click", () => document.getElementById("ai-flow-puzzle-game")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    window.addEventListener("resize", renderLines);
    document.addEventListener("keydown", (event) => {
      if ((event.key === "Delete" || event.key === "Backspace") && state.selectedNodeId && event.target === document.body) { event.preventDefault(); removeNode(state.selectedNodeId); }
      if (event.key === "Escape") { state.selectedSourceId = null; state.selectedNodeId = null; state.selectedLinkKey = null; renderAll(); setStatus(t("connectTip")); }
    });
  }

  setupEvents();
  resetScenario(0);
  applyText();
})();
