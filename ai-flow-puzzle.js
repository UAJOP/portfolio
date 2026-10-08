function startAiFlowPuzzle(lifecycle) {
  const board = document.querySelector("[data-ai-board]");
  const linesLayer = document.querySelector("[data-ai-lines]");
  if (!board || !linesLayer) return;

  /* V4-E06.2: progress is kept per level — its best quality and the award that
   * quality earned — and the score is the sum of those awards. Validating a
   * solved level again can raise its best; it can never add to the score
   * twice. The v2 key held one running total that grew on every validation
   * and is no longer read. */
  const PROGRESS_KEY = "kaan-ai-flow-puzzle-progress-v3";
  const safeCrypto = window.crypto || {};
  const html = document.documentElement;
  /* The game shell this board sits in (js/pages/flow-puzzle-game.js). The
   * board pans, zooms and takes port gestures only while that shell is open. */
  const gameRoot = board.closest("[data-afp-root]");
  let gameLabels = {};
  try { gameLabels = JSON.parse(gameRoot?.getAttribute("data-afp-labels") || "{}"); } catch (error) { gameLabels = {}; }
  /* Everything on the board lives in one world layer, so one transform moves
   * the nodes and their wires together. */
  let world = board.querySelector("[data-ai-world]");
  if (!world) {
    world = document.createElement("div");
    world.className = "ai-flow-world";
    world.setAttribute("data-ai-world", "");
    board.appendChild(world);
    world.appendChild(linesLayer);
  }
  const view = { x: 0, y: 0, k: 1 };
  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 1.8;
  function emit(name, detail) { document.dispatchEvent(new CustomEvent(`aiflow:${name}`, { detail: detail || {} })); }
  function interactive() { return Boolean(gameRoot) && html.hasAttribute("data-afp-state"); }
  function reducedMotion() { return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

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
    score: 0,
    completed: new Set(),
    drag: null,
    lastValidation: null,
    lastQuality: null,
    runTimer: null,
    runSerial: 0,
    running: false,
    /* What the current run has passed through, and what a verdict or a hint
     * is pointing at. */
    visited: new Set(),
    doneLinks: new Set(),
    liveLinkKey: null,
    flagged: new Set(),
    hintsUsed: 0,
    assisted: false,
    wire: null
  };

  function readProgress() {
    const levels = {};
    try {
      const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
      scenarios.forEach((scenario) => {
        const record = raw && raw.levels && raw.levels[scenario.id];
        if (!record || !Number.isFinite(record.best) || !Number.isFinite(record.award)) return;
        levels[scenario.id] = { best: Math.max(0, Math.min(100, Math.round(record.best))), award: Math.max(0, Math.min(400, Math.round(record.award))) };
      });
    } catch (error) { /* no stored progress, or storage is unavailable */ }
    return { levels };
  }
  function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (error) { /* progress lasts for this visit only */ }
  }
  function totalScore() { return Object.values(progress.levels).reduce((sum, record) => sum + record.award, 0); }
  const progress = readProgress();
  state.score = totalScore();
  Object.keys(progress.levels).forEach((id) => state.completed.add(id));
  /* One completion, recorded once: the level keeps its best result. */
  function recordCompletion(id, quality) {
    const award = Math.max(120, quality.total * 4);
    const previous = progress.levels[id] || null;
    const improved = !previous || award > previous.award;
    if (improved) { progress.levels[id] = { best: quality.total, award }; saveProgress(); }
    state.completed.add(id);
    state.score = totalScore();
    return { award, improved, first: !previous, best: progress.levels[id].best };
  }

  function lang() {
    return typeof getCurrentLocale === "function" ? getCurrentLocale() : (document.documentElement.lang || "en");
  }
  /* The shipped locale pack supplies any language beyond the inline EN/TR pair,
   * so adding a locale never edits this file. */
  function activeCopy() {
    return (typeof getLocalizedCollection === "function"
      ? getLocalizedCollection(copy, lang(), "aiFlowPuzzle")
      : copy[lang()]) || copy.en;
  }
  function t(key) { const active = activeCopy(); return active[key] || copy.en[key] || key; }
  function tNode(type) { const active = activeCopy(); return (active.nodeTypes && active.nodeTypes[type]) || copy.en.nodeTypes[type]; }
  function tScenario(id) { const active = activeCopy(); return (active.scenarios && active.scenarios[id]) || copy.en.scenarios[id]; }
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

  window.updateAiFlowPuzzleLanguage = function updateAiFlowPuzzleLanguage() {
    applyText();
    emit("language");
  };

  function resetScenario(index = state.scenarioIndex, template = "blank") {
    state.scenarioIndex = Math.max(0, Math.min(scenarios.length - 1, index));
    state.nodes = [];
    state.links = [];
    state.selectedNodeId = null;
    state.selectedSourceId = null;
    state.selectedLinkKey = null;
    state.lastValidation = null;
    state.lastQuality = null;
    state.hintsUsed = 0;
    state.assisted = false;
    stopRun();
    clearMarks();
    resetRunLog();

    if (template === "solution") {
      loadTemplate("solution", false);
    } else if (template === "happy") {
      loadTemplate("happy", false);
    } else {
      /* A tall board (a phone) starts the flow at the top and ends it at the bottom. */
      currentScenario().starter.forEach((item) => (portrait() ? addNode(item.type, 50, item.x, false) : addNode(item.type, item.x, item.y, false)));
    }
    renderAll();
    fitView();
    setStatus(t("boardReset"));
    emit("level", { index: state.scenarioIndex });
  }

  /* A run in progress ends here: its pending step never resumes. */
  function stopRun() {
    state.runSerial += 1;
    clearTimeout(state.runTimer);
    state.running = false;
    state.runningNodeId = null;
    state.liveLinkKey = null;
  }
  function clearMarks() {
    state.visited.clear();
    state.doneLinks.clear();
    state.flagged.clear();
    els.paletteHolder?.querySelectorAll(".is-hinted").forEach((button) => button.classList.remove("is-hinted"));
  }
  /* The board changed, so what the last run or verdict showed is stale. */
  function touched() {
    if (state.running) stopRun();
    clearMarks();
    state.lastValidation = null;
    state.lastQuality = null;
  }

  function worldSize() { return { w: world.clientWidth || board.clientWidth || 1, h: world.clientHeight || board.clientHeight || 1 }; }
  function portrait() { const size = worldSize(); return size.h > size.w * 1.15; }
  /* Where the visitor is looking, in board percentages. */
  function viewCenter() {
    const rect = board.getBoundingClientRect();
    const size = worldSize();
    return { x: (((rect.width / 2) - view.x) / view.k / size.w) * 100, y: (((rect.height / 2) - view.y) / view.k / size.h) * 100 };
  }

  function addNode(type, x, y, shouldRender = true) {
    const existingSameType = state.nodes.filter((node) => node.type === type).length;
    let fallbackX = Math.min(84, 14 + ((state.nodes.length * 13) % 62) + existingSameType * 4);
    let fallbackY = Math.min(82, 20 + ((state.nodes.length * 17) % 54) + existingSameType * 5);
    if (interactive() && typeof x !== "number") {
      /* In the workspace a new node lands where the visitor is looking. */
      const center = viewCenter();
      const step = (state.nodes.length % 5) - 2;
      fallbackX = center.x + step * 2.5;
      fallbackY = center.y + step * 4;
    }
    const node = {
      id: uid(),
      type,
      x: typeof x === "number" ? x : fallbackX,
      y: typeof y === "number" ? y : fallbackY,
      config: defaultConfig(type)
    };
    state.nodes.push(node);
    if (shouldRender) {
      const place = clampNodePosition(node.x, node.y);
      node.x = place.x; node.y = place.y;
      touched();
      state.selectedNodeId = node.id;
      state.selectedLinkKey = null;
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
    touched();
    renderAll();
    setStatus(t("nodeRemoved"));
  }

  function nodeById(id) { return state.nodes.find((node) => node.id === id); }
  function linkKey(link) { return `${link.from}->${link.to}`; }

  function edgeLabel(fromType, toType) {
    const text = (en, tr) => getI18nText(en, tr, lang());
    /* The three labels below read this flag; without it every connection threw. */
    const tr = lang() === "tr";
    const map = {
      "trigger->intent": text("message", "mesaj"),
      "intent->condition": text("reservation", "rezervasyon"),
      "intent->router": "intent",
      "intent->crm": "lead",
      "intent->fallback": text("unknown", "belirsiz"),
      "condition->sheet": text("available", "müsait"),
      "condition->fallback": text("not available", "müsait değil"),
      "sheet->response": text("saved", "kaydedildi"),
      "router->kb": text("known", "bilgi"),
      "router->handoff": text("risky", "riskli"),
      "router->fallback": text("unknown", "belirsiz"),
      "kb->llm": "context",
      "llm->response": text("answer", "cevap"),
      "crm->email": text("lead saved", "kayıt"),
      "email->response": text("notified", "bildirim"),
      "response->end": tr ? "tamam" : "done",
      "fallback->end": "fallback",
      "handoff->end": tr ? "devredildi" : "assigned"
    };
    return map[`${fromType}->${toType}`] || (tr ? "bağlantı" : "link");
  }

  /* Why a connection cannot be made, or null when it can. A trigger starts
   * the flow and takes no input; End closes it and has no output. */
  function connectionProblem(from, to) {
    const fromNode = nodeById(from);
    const toNode = nodeById(to);
    if (!fromNode || !toNode || from === to) return "self";
    if (state.links.some((link) => link.from === from && link.to === to)) return "duplicate";
    if (toNode.type === "trigger") return "triggerInput";
    if (fromNode.type === "end") return "endOutput";
    return null;
  }

  function rejectConnection(problem, targetId) {
    const text = problem === "self" ? t("selfConnection") : problem === "duplicate" ? t("duplicateConnection") : (gameLabels[problem] || t("selfConnection"));
    setStatus(text, "warning");
    const element = nodeElement(targetId);
    if (element) {
      element.classList.add("is-rejected");
      setTimeout(() => element.classList.remove("is-rejected"), 520);
    }
    emit("reject", { problem, text });
  }

  function connectNodes(from, to) {
    const problem = connectionProblem(from, to);
    if (problem) { state.selectedSourceId = null; renderAll(); rejectConnection(problem, to); return false; }
    const fromNode = nodeById(from);
    const toNode = nodeById(to);
    state.links.push({ from, to, label: edgeLabel(fromNode?.type, toNode?.type) });
    touched();
    state.selectedSourceId = null;
    state.selectedNodeId = to;
    state.selectedLinkKey = null;
    renderAll();
    setStatus(t("connected"), "success");
    return true;
  }

  function removeLink(from, to) {
    state.links = state.links.filter((link) => !(link.from === from && link.to === to));
    state.selectedLinkKey = null;
    touched();
    renderAll();
    setStatus(t("connectionRemoved"));
  }

  /* A node's body selects it. A connection starts from its output port: by
   * dragging the port to a node, or by pressing the port and then the target. */
  function handleNodeClick(id) {
    if (state.drag && state.drag.moved) return;
    if (state.running) return;
    if (state.selectedSourceId && state.selectedSourceId !== id) { connectNodes(state.selectedSourceId, id); return; }
    state.selectedNodeId = id;
    state.selectedSourceId = null;
    state.selectedLinkKey = null;
    renderAll();
    emit("select", { node: id });
  }

  function armSource(id) {
    if (state.running) return;
    state.selectedSourceId = state.selectedSourceId === id ? null : id;
    state.selectedLinkKey = null;
    renderAll();
    setStatus(state.selectedSourceId ? t("activeSource") : t("connectTip"), state.selectedSourceId ? "active" : "info");
  }

  function selectLink(key) {
    if (state.running) return;
    state.selectedLinkKey = key;
    state.selectedNodeId = null;
    state.selectedSourceId = null;
    renderAll();
    emit("select", { link: key });
  }

  function clearSelection() {
    if (!state.selectedNodeId && !state.selectedSourceId && !state.selectedLinkKey) return;
    state.selectedSourceId = null; state.selectedNodeId = null; state.selectedLinkKey = null;
    renderAll();
    setStatus(t("connectTip"));
    emit("select", {});
  }

  const nodeElements = new Map();
  function nodeElement(id) { return nodeElements.get(id) || null; }
  function getWorldRect() { return world.getBoundingClientRect(); }
  /* A client point, in the world's own pixels. */
  function toWorld(clientX, clientY) {
    const rect = getWorldRect();
    const scale = gameRoot ? view.k : 1;
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  }
  /* Positions are a node's centre, as a percentage of the world. */
  function clampNodePosition(x, y) {
    const size = worldSize();
    const sample = board.querySelector(".ai-flow-node");
    const halfW = (((sample?.offsetWidth || 188) / 2) / size.w) * 100;
    const halfH = (((sample?.offsetHeight || 76) / 2) / size.h) * 100;
    return { x: Math.max(halfW, Math.min(100 - halfW, x)), y: Math.max(halfH, Math.min(100 - halfH, y)) };
  }

  /* ---- the view: pan, zoom, fit ---- */
  function applyView() {
    if (!gameRoot) return;
    world.style.transformOrigin = "0 0";
    world.style.transform = `translate(${Math.round(view.x * 100) / 100}px, ${Math.round(view.y * 100) / 100}px) scale(${Math.round(view.k * 1000) / 1000})`;
    board.style.setProperty("--ai-zoom", String(view.k));
    board.style.backgroundPosition = `${view.x}px ${view.y}px`;
    emit("view", { k: view.k });
  }
  /* Part of the world always stays in reach. */
  function boundView() {
    const rect = board.getBoundingClientRect();
    const size = worldSize();
    const keep = 90;
    view.x = Math.max(keep - size.w * view.k, Math.min(rect.width - keep, view.x));
    view.y = Math.max(keep - size.h * view.k, Math.min(rect.height - keep, view.y));
  }
  function zoomTo(k, clientX, clientY) {
    const rect = board.getBoundingClientRect();
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));
    const px = (typeof clientX === "number" ? clientX : rect.left + rect.width / 2) - rect.left;
    const py = (typeof clientY === "number" ? clientY : rect.top + rect.height / 2) - rect.top;
    const wx = (px - view.x) / view.k;
    const wy = (py - view.y) / view.k;
    view.k = next;
    view.x = px - wx * next;
    view.y = py - wy * next;
    boundView();
    applyView();
  }
  function nodeBox(node) {
    const size = worldSize();
    const element = nodeElement(node.id);
    return { cx: (node.x / 100) * size.w, cy: (node.y / 100) * size.h, w: element?.offsetWidth || 188, h: element?.offsetHeight || 76 };
  }
  /* Everything on the board, in view, at the largest comfortable size. */
  function fitView() {
    if (!gameRoot) return;
    const rect = board.getBoundingClientRect();
    if (!rect.width || !rect.height || !state.nodes.length) return;
    const boxes = state.nodes.map(nodeBox);
    const left = Math.min(...boxes.map((box) => box.cx - box.w / 2));
    const right = Math.max(...boxes.map((box) => box.cx + box.w / 2));
    const top = Math.min(...boxes.map((box) => box.cy - box.h / 2));
    const bottom = Math.max(...boxes.map((box) => box.cy + box.h / 2));
    const pad = Math.min(72, rect.width * 0.08);
    view.k = Math.max(MIN_ZOOM, Math.min(1, (rect.width - pad * 2) / Math.max(1, right - left), (rect.height - pad * 2) / Math.max(1, bottom - top)));
    view.x = rect.width / 2 - ((left + right) / 2) * view.k;
    view.y = rect.height / 2 - ((top + bottom) / 2) * view.k;
    applyView();
  }
  function focusNode(id) {
    const node = nodeById(id);
    if (!node || !gameRoot) return;
    const rect = board.getBoundingClientRect();
    const box = nodeBox(node);
    view.x = rect.width / 2 - box.cx * view.k;
    view.y = rect.height / 2 - box.cy * view.k;
    boundView();
    applyView();
  }

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
    els.scenarioHolder.querySelectorAll("[data-ai-scenario]").forEach((button) => button.addEventListener("click", () => resetScenario(Number(button.dataset.aiScenario)), { signal: lifecycle }));
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
    }, { signal: lifecycle }));
  }

  function renderPalette() {
    if (!els.paletteHolder) return;
    /* Grouped by the role each node already states, in the order the roles
     * first appear. */
    const groups = [];
    nodeOrder.forEach((type) => {
      const category = tNode(type).category;
      let group = groups.find((entry) => entry.category === category);
      if (!group) { group = { category, types: [] }; groups.push(group); }
      group.types.push(type);
    });
    els.paletteHolder.innerHTML = groups.map((group) => `<div class="ai-palette-group" role="group" aria-label="${safe(group.category)}"><span class="ai-palette-group-title">${safe(group.category)}</span>${group.types.map((type) => {
      const data = tNode(type);
      return `<button class="ai-palette-node" type="button" data-ai-add-node="${type}" title="${safe(data.desc)}" style="--node-color:${typeColor[type]}">
        <i class="bx ${nodeIcons[type]}"></i><span><strong>${safe(data.title)}</strong><small>${safe(data.category)}</small></span>
      </button>`;
    }).join("")}</div>`).join("");
    els.paletteHolder.querySelectorAll("[data-ai-add-node]").forEach((button) => {
      button.addEventListener("click", () => { if (button.dataset.aiDragged) { delete button.dataset.aiDragged; return; } addNode(button.dataset.aiAddNode); }, { signal: lifecycle });
      button.addEventListener("pointerdown", (event) => beginPaletteDrag(event, button), { signal: lifecycle });
    });
  }

  /* With a mouse, a library node can also be carried onto the board and
   * dropped where it should go. */
  function beginPaletteDrag(event, button) {
    if (!interactive() || event.pointerType !== "mouse" || event.button !== 0 || state.running) return;
    const type = button.dataset.aiAddNode;
    let ghost = null;
    const onMove = (moveEvent) => {
      if (!ghost) {
        if (Math.abs(moveEvent.clientX - event.clientX) + Math.abs(moveEvent.clientY - event.clientY) < 8) return;
        ghost = document.createElement("div");
        ghost.className = "ai-palette-ghost";
        ghost.style.setProperty("--node-color", typeColor[type]);
        ghost.textContent = tNode(type).title;
        (gameRoot || document.body).appendChild(ghost);
      }
      ghost.style.left = `${moveEvent.clientX}px`;
      ghost.style.top = `${moveEvent.clientY}px`;
    };
    const onUp = (upEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (!ghost) return;
      ghost.remove();
      button.dataset.aiDragged = "1";
      setTimeout(() => { delete button.dataset.aiDragged; }, 0);
      const rect = board.getBoundingClientRect();
      if (upEvent.clientX < rect.left || upEvent.clientX > rect.right || upEvent.clientY < rect.top || upEvent.clientY > rect.bottom) return;
      const point = toWorld(upEvent.clientX, upEvent.clientY);
      const size = worldSize();
      const place = clampNodePosition((point.x / size.w) * 100, (point.y / size.h) * 100);
      const node = addNode(type, place.x, place.y, false);
      touched();
      state.selectedNodeId = node.id;
      state.selectedLinkKey = null;
      renderAll();
      setStatus(t("nodeAdded"), "success");
    };
    document.addEventListener("pointermove", onMove, { signal: lifecycle });
    document.addEventListener("pointerup", onUp, { signal: lifecycle });
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
    /* Rebuilding the board must not take the keyboard's place on it. */
    const active = document.activeElement && board.contains(document.activeElement) ? document.activeElement : null;
    const focusId = active?.closest(".ai-flow-node")?.dataset.nodeId || null;
    const focusPart = active?.hasAttribute("data-ai-port") ? "[data-ai-port='out']" : "[data-ai-node-body]";
    board.querySelectorAll(".ai-flow-node").forEach((node) => node.remove());
    nodeElements.clear();
    state.nodes.forEach((node) => {
      const data = tNode(node.type);
      const name = node.config?.name || data.title;
      const element = document.createElement("div");
      element.className = "ai-flow-node";
      element.dataset.nodeId = node.id;
      element.dataset.type = node.type;
      element.style.left = `${node.x}%`;
      element.style.top = `${node.y}%`;
      element.style.setProperty("--node-color", typeColor[node.type]);
      element.classList.toggle("is-selected", state.selectedNodeId === node.id);
      element.classList.toggle("is-source", state.selectedSourceId === node.id);
      element.classList.toggle("is-running", state.runningNodeId === node.id);
      element.classList.toggle("is-visited", state.visited.has(node.id));
      element.classList.toggle("is-flagged", state.flagged.has(node.id));
      /* A trigger takes no input and End gives no output, so neither has that port. */
      const inPort = node.type === "trigger" ? "" : `<span class="ai-flow-port ai-flow-port-in" data-ai-port="in" aria-hidden="true"></span>`;
      const outPort = node.type === "end" ? "" : `<button type="button" class="ai-flow-port ai-flow-port-out" data-ai-port="out" aria-pressed="${state.selectedSourceId === node.id}" aria-label="${safe(`${t("startConnection")}: ${name}`)}"></button>`;
      element.innerHTML = `${inPort}<button type="button" class="ai-flow-node-body" data-ai-node-body aria-pressed="${state.selectedNodeId === node.id}"><span class="ai-flow-node-icon"><i class="bx ${nodeIcons[node.type]}"></i></span><span class="ai-flow-node-copy"><strong>${safe(name)}</strong><small>${safe(data.category)}</small></span></button>${outPort}`;
      const body = element.querySelector("[data-ai-node-body]");
      body.addEventListener("pointerdown", (event) => beginDrag(event, node.id), { signal: lifecycle });
      body.addEventListener("click", (event) => { event.preventDefault(); handleNodeClick(node.id); }, { signal: lifecycle });
      const out = element.querySelector("[data-ai-port='out']");
      if (out) {
        out.addEventListener("pointerdown", (event) => beginWire(event, node.id, null), { signal: lifecycle });
        /* A press without a pointer is the keyboard: it arms this node as the source. */
        out.addEventListener("click", (event) => { if (event.detail === 0) armSource(node.id); }, { signal: lifecycle });
      }
      element.querySelector("[data-ai-port='in']")?.addEventListener("pointerdown", (event) => pickUpLink(event, node.id), { signal: lifecycle });
      world.appendChild(element);
      nodeElements.set(node.id, element);
    });
    if (focusId) nodeElement(focusId)?.querySelector(focusPart)?.focus({ preventScroll: true });
    renderLines();
  }

  /* Where a wire leaves or enters a node: its sides on a wide board, its
   * bottom and top on a tall one. */
  function anchor(node, side) {
    const box = nodeBox(node);
    if (portrait()) return { x: box.cx, y: box.cy + (side === "out" ? box.h / 2 : -box.h / 2) };
    return { x: box.cx + (side === "out" ? box.w / 2 : -box.w / 2), y: box.cy };
  }
  function wirePath(a, b) {
    if (portrait()) {
      const curve = Math.max(36, Math.abs(b.y - a.y) * 0.42);
      return `M ${a.x} ${a.y} C ${a.x} ${a.y + curve}, ${b.x} ${b.y - curve}, ${b.x} ${b.y}`;
    }
    const curve = Math.max(60, Math.abs(b.x - a.x) * 0.42);
    return `M ${a.x} ${a.y} C ${a.x + curve} ${a.y}, ${b.x - curve} ${b.y}, ${b.x} ${b.y}`;
  }

  function renderLines() {
    const tall = portrait();
    const paths = state.links.map((link) => {
      const from = nodeById(link.from);
      const to = nodeById(link.to);
      if (!from || !to) return "";
      const a = anchor(from, "out");
      const b = anchor(to, "in");
      const d = wirePath(a, b);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2 - (tall ? 0 : 8);
      const key = linkKey(link);
      const marks = `${state.selectedLinkKey === key ? " is-selected" : ""}${state.liveLinkKey === key ? " is-live" : ""}${state.doneLinks.has(key) ? " is-done" : ""}`;
      const arrow = tall ? `M ${b.x - 6} ${b.y - 10} L ${b.x} ${b.y - 1} L ${b.x + 6} ${b.y - 10} Z` : `M ${b.x - 10} ${b.y - 6} L ${b.x - 1} ${b.y} L ${b.x - 10} ${b.y + 6} Z`;
      return `<g class="ai-flow-link${marks}" data-link-key="${safe(key)}" style="--link-color:${typeColor[from.type]}"><path class="ai-flow-hit" d="${d}"></path><path class="ai-flow-path${state.selectedLinkKey === key ? " is-selected" : ""}" d="${d}"></path><path class="ai-flow-arrow" d="${arrow}"></path><path class="ai-flow-pulse" d="${d}" pathLength="1"></path><g class="ai-flow-label${state.selectedLinkKey === key ? " is-selected" : ""}"><rect x="${midX - 46}" y="${midY - 13}" width="92" height="24" rx="12"></rect><text x="${midX}" y="${midY + 4}">${safe(link.label || "link")}</text></g></g>`;
    }).join("");
    linesLayer.innerHTML = `${paths}<path class="ai-flow-path ai-flow-wire" data-ai-wire d=""></path>`;
    renderWire();
  }

  /* The wire in the hand, from its source to the pointer. */
  function renderWire() {
    const path = linesLayer.querySelector("[data-ai-wire]");
    if (!path) return;
    const source = state.wire && nodeById(state.wire.from);
    if (!source || !state.wire.moved) { path.setAttribute("d", ""); return; }
    path.style.setProperty("--link-color", typeColor[source.type]);
    path.setAttribute("d", wirePath(anchor(source, "out"), { x: state.wire.x, y: state.wire.y }));
  }

  function wireTarget(clientX, clientY) {
    const hit = document.elementFromPoint(clientX, clientY);
    return hit?.closest?.(".ai-flow-node")?.dataset.nodeId || null;
  }

  /* A connection drawn from an output port to the node it is released on.
   * `detached` is a link picked up from its target end: released on another
   * node it is rewired there, released on the empty board it is gone. */
  function beginWire(event, fromId, detached) {
    if (state.running || pointers.size > 1 || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    const start = toWorld(event.clientX, event.clientY);
    const wire = { from: fromId, x: start.x, y: start.y, moved: Boolean(detached), dragged: false, over: null };
    state.wire = wire;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    board.classList.add("is-wiring");
    const mark = (overId) => {
      nodeElements.forEach((element, id) => {
        const on = id === overId && id !== fromId;
        element.classList.toggle("is-target", on && !connectionProblem(fromId, id));
        element.classList.toggle("is-blocked", on && Boolean(connectionProblem(fromId, id)));
      });
    };
    const onMove = (moveEvent) => {
      if (state.wire !== wire) return;
      if (Math.abs(moveEvent.clientX - event.clientX) + Math.abs(moveEvent.clientY - event.clientY) > 6) { wire.moved = true; wire.dragged = true; }
      const point = toWorld(moveEvent.clientX, moveEvent.clientY);
      wire.x = point.x; wire.y = point.y;
      wire.over = wireTarget(moveEvent.clientX, moveEvent.clientY);
      mark(wire.over);
      renderWire();
    };
    const onUp = (upEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      board.classList.remove("is-wiring");
      if (state.wire !== wire) return;
      state.wire = null;
      mark(null);
      const target = upEvent.type === "pointerup" ? wireTarget(upEvent.clientX, upEvent.clientY) : null;
      if (wire.moved && target && target !== fromId) {
        if (!connectNodes(fromId, target) && detached) { state.links.push(detached); renderAll(); }
        return;
      }
      if (detached) {
        /* Let go over nothing: the picked-up link stays removed. Not moved at
         * all: it was only a press, and the link goes back. */
        if (wire.dragged && !target && upEvent.type === "pointerup") { touched(); renderAll(); setStatus(t("connectionRemoved")); return; }
        state.links.push(detached);
        renderAll();
        return;
      }
      renderWire();
      if (!wire.moved && upEvent.type === "pointerup") armSource(fromId);
    };
    document.addEventListener("pointermove", onMove, { signal: lifecycle });
    document.addEventListener("pointerup", onUp, { signal: lifecycle });
    document.addEventListener("pointercancel", onUp, { signal: lifecycle });
    if (detached) renderWire();
  }

  /* An input port with a link on it: the link comes away in the hand. With a
   * source armed, the port is simply the target. */
  function pickUpLink(event, nodeId) {
    if (state.running || pointers.size > 1) return;
    if (state.selectedSourceId && state.selectedSourceId !== nodeId) { event.stopPropagation(); connectNodes(state.selectedSourceId, nodeId); return; }
    const incoming = state.links.filter((link) => link.to === nodeId);
    const link = incoming[incoming.length - 1];
    if (!link) return;
    event.preventDefault();
    state.links = state.links.filter((entry) => entry !== link);
    renderLines();
    beginWire(event, link.from, link);
  }

  function beginDrag(event, id) {
    const node = nodeById(id);
    if (!node || state.running || pointers.size > 1 || (event.pointerType === "mouse" && event.button !== 0)) return;
    const rect = getWorldRect();
    state.drag = { id, startX: event.clientX, startY: event.clientY, nodeX: node.x, nodeY: node.y, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const onMove = (moveEvent) => {
      if (!state.drag || state.drag.id !== id) return;
      const dx = ((moveEvent.clientX - state.drag.startX) / rect.width) * 100;
      const dy = ((moveEvent.clientY - state.drag.startY) / rect.height) * 100;
      if (Math.abs(moveEvent.clientX - state.drag.startX) + Math.abs(moveEvent.clientY - state.drag.startY) > 6) state.drag.moved = true;
      if (!state.drag.moved) return;
      const next = clampNodePosition(state.drag.nodeX + dx, state.drag.nodeY + dy);
      node.x = next.x; node.y = next.y;
      const el = nodeElement(id);
      if (el) { el.style.left = `${node.x}%`; el.style.top = `${node.y}%`; el.classList.add("is-dragging"); }
      renderLines();
    };
    /* The deferred clear belongs to this drag: a press that follows the release
     * before the timer runs has already started the next one. */
    const onUp = () => { const drag = state.drag; document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); document.removeEventListener("pointercancel", onUp); nodeElement(id)?.classList.remove("is-dragging"); setTimeout(() => { if (state.drag === drag) state.drag = null; }, 0); };
    document.addEventListener("pointermove", onMove, { signal: lifecycle });
    document.addEventListener("pointerup", onUp, { signal: lifecycle });
    document.addEventListener("pointercancel", onUp, { signal: lifecycle });
  }

  /* ---- the board's own gestures: pan with one pointer, pinch with two ---- */
  const pointers = new Map();
  let pan = null;
  let pinch = null;
  const spread = () => { const [a, b] = [...pointers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  board.addEventListener("pointerdown", (event) => {
    if (!interactive()) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      /* A second finger turns whatever the first was doing into a pinch. */
      state.drag = null; pan = null;
      pinch = { d: spread().d, k: view.k };
      return;
    }
    if (event.target.closest(".ai-flow-node, [data-link-key]")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pan = { id: event.pointerId, startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y, moved: false };
    board.setPointerCapture?.(event.pointerId);
  }, { signal: lifecycle, capture: true });
  document.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size === 2) { const now = spread(); zoomTo(pinch.k * (now.d / pinch.d), now.x, now.y); return; }
    if (!pan || pan.id !== event.pointerId) return;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) pan.moved = true;
    if (!pan.moved) return;
    view.x = pan.viewX + dx; view.y = pan.viewY + dy;
    boundView();
    applyView();
    board.classList.add("is-panning");
  }, { signal: lifecycle });
  const endPointer = (event) => {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size < 2) pinch = null;
    if (pan && pan.id === event.pointerId) {
      /* A press on the empty board that went nowhere lets go of the selection. */
      if (!pan.moved && event.type === "pointerup") clearSelection();
      pan = null;
      board.classList.remove("is-panning");
    }
  };
  document.addEventListener("pointerup", endPointer, { signal: lifecycle });
  document.addEventListener("pointercancel", endPointer, { signal: lifecycle });
  board.addEventListener("wheel", (event) => {
    if (!interactive()) return;
    event.preventDefault();
    zoomTo(view.k * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX, event.clientY);
  }, { signal: lifecycle, passive: false });
  linesLayer.addEventListener("click", (event) => {
    const link = event.target.closest?.("[data-link-key]");
    if (link) selectLink(link.getAttribute("data-link-key"));
  }, { signal: lifecycle });

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
    const chosenLink = !selected && state.selectedLinkKey ? state.links.find((link) => linkKey(link) === state.selectedLinkKey) : null;
    if (chosenLink) {
      const from = nodeById(chosenLink.from);
      const to = nodeById(chosenLink.to);
      els.inspector.innerHTML = `<div class="ai-inspector-head" style="--node-color:${typeColor[from?.type] || "#38bdf8"}"><i class="bx bx-git-branch"></i><div><span>${t("selectedLabel")}</span><strong>${safe(tNode(from?.type)?.title || "")} → ${safe(tNode(to?.type)?.title || "")}</strong></div></div><p>${safe(t("edgeLabel"))}: ${safe(chosenLink.label || "link")}</p>
        <div class="ai-inspector-actions"><button type="button" data-ai-remove-link-from="${safe(chosenLink.from)}" data-ai-remove-link-to="${safe(chosenLink.to)}">${t("deleteConnection")}</button></div>`;
      els.inspector.querySelector("[data-ai-remove-link-from]").addEventListener("click", () => removeLink(chosenLink.from, chosenLink.to), { signal: lifecycle });
      return;
    }
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
      }, { signal: lifecycle });
    });
    els.inspector.querySelectorAll("[data-ai-start-link]").forEach((button) => button.addEventListener("click", () => { if (state.running) return; state.selectedSourceId = button.dataset.aiStartLink; renderAll(); setStatus(t("activeSource"), "active"); emit("arm", { node: state.selectedSourceId }); }, { signal: lifecycle }));
    els.inspector.querySelectorAll("[data-ai-remove-node]").forEach((button) => button.addEventListener("click", () => removeNode(button.dataset.aiRemoveNode), { signal: lifecycle }));
    els.inspector.querySelectorAll("[data-ai-remove-link-from]").forEach((button) => button.addEventListener("click", () => removeLink(button.dataset.aiRemoveLinkFrom, button.dataset.aiRemoveLinkTo), { signal: lifecycle }));
  }

  /* Every node the signal can reach from a trigger. */
  function reachableIds() {
    const seen = new Set();
    const queue = state.nodes.filter((node) => node.type === "trigger").map((node) => node.id);
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      state.links.forEach((link) => { if (link.from === id && !seen.has(link.to)) queue.push(link.to); });
    }
    return seen;
  }

  /* What is wrong with a flow that did not validate, in terms the board can
   * point at. The verdict itself is still the level's required nodes and
   * connections; this only says where to look. */
  function diagnose(missingNodes, missingEdges) {
    const reach = reachableIds();
    const idsOf = (type) => state.nodes.filter((node) => node.type === type).map((node) => node.id);
    const issues = missingNodes.map((type) => ({ kind: "missingNode", type }));
    missingEdges.forEach(([from, to]) => {
      /* A link to a node that is not there yet is already covered by that node. */
      if (missingNodes.includes(from) || missingNodes.includes(to)) return;
      issues.push({ kind: "missingLink", from, to, nodes: [...idsOf(from), ...idsOf(to)] });
    });
    const loose = state.nodes.filter((node) => !reach.has(node.id));
    if (loose.length) issues.push({ kind: "unreachable", nodes: loose.map((node) => node.id), types: loose.map((node) => node.type) });
    const stops = state.nodes.filter((node) => reach.has(node.id) && node.type !== "end" && !state.links.some((link) => link.from === node.id));
    if (stops.length) issues.push({ kind: "deadEnd", nodes: stops.map((node) => node.id), types: stops.map((node) => node.type) });
    return issues;
  }

  /* The level's closing branches — every required node that hands over to
   * End — and whether this flow really carries the signal through each. */
  function outcomes() {
    const reach = reachableIds();
    return currentScenario().requiredEdges.filter(([, to]) => to === "end").map(([type]) => ({
      type,
      reached: state.nodes.some((node) => node.type === type && reach.has(node.id) && state.links.some((link) => link.from === node.id && nodeById(link.to)?.type === "end"))
    }));
  }

  function validateCurrentFlow(showResult = true, source = "validate") {
    const scenario = currentScenario();
    const missingNodes = scenario.requiredTypes.filter((type) => !hasType(type));
    const missingEdges = scenario.requiredEdges.filter(([from, to]) => !hasTypeEdge(from, to));
    const debug = [];
    if (!hasType("fallback")) debug.push(`${tNode("fallback").title}: ${tNode("fallback").desc}`);
    if (state.links.some((link) => nodeById(link.from)?.type === "response" && nodeById(link.to)?.type !== "end")) debug.push(getI18nText("A response should usually close with End.", "Response sonrası akış genelde End ile kapanmalı.", lang()));
    if (state.nodes.length > scenario.requiredTypes.length + 5) debug.push(getI18nText("Too many nodes may reduce efficiency.", "Çok fazla node var; verimlilik düşebilir.", lang()));
    const valid = missingNodes.length === 0 && missingEdges.length === 0;
    const quality = computeQuality(missingNodes, missingEdges, debug);
    state.lastValidation = { valid, missingNodes, missingEdges, debug };
    state.lastQuality = quality;

    let resultDetail = null;
    if (showResult) {
      const issues = valid ? [] : diagnose(missingNodes, missingEdges);
      state.flagged.clear();
      issues.forEach((issue) => (issue.nodes || []).forEach((id) => state.flagged.add(id)));
      const completion = valid ? recordCompletion(scenario.id, quality) : null;
      resultDetail = {
        valid, source, level: state.scenarioIndex, quality, issues, debug, outcomes: outcomes(),
        hints: state.hintsUsed, assisted: state.assisted, nodes: state.nodes.length, links: state.links.length,
        required: { nodes: scenario.requiredTypes.length, links: scenario.requiredEdges.length },
        completion, score: state.score
      };
      if (valid) {
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
    if (resultDetail) emit("result", resultDetail);
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

  /* A hint names the next missing piece and points at it: the library entry
   * for a missing node, the two nodes of a missing connection. Each one asked
   * for is counted and reported with the result; none changes the score. */
  function showHint() {
    if (state.running) return;
    const result = validateCurrentFlow(false);
    clearMarks();
    if (!result.missingNodes.length && !result.missingEdges.length) {
      setResult(`<strong>${t("hintIntro")}</strong><p>${t("allClear")}</p>`, "success");
      renderBoard();
      emit("hint", { kind: "clear", text: t("allClear"), hints: state.hintsUsed });
      return;
    }
    state.hintsUsed += 1;
    if (result.missingNodes.length) {
      const type = result.missingNodes[0];
      setResult(`<strong>${t("hintIntro")}</strong><p>${t("missingNode")} <strong>${safe(tNode(type).title)}</strong> — ${safe(tNode(type).desc)}</p>`, "info");
      els.paletteHolder?.querySelector(`[data-ai-add-node="${type}"]`)?.classList.add("is-hinted");
      renderBoard();
      emit("hint", { kind: "node", type, text: `${t("missingNode")} ${tNode(type).title} — ${tNode(type).desc}`, hints: state.hintsUsed });
      return;
    }
    const [from, to] = result.missingEdges[0];
    setResult(`<strong>${t("hintIntro")}</strong><p>${t("missingEdge")} <strong>${safe(tNode(from).title)}</strong> → <strong>${safe(tNode(to).title)}</strong></p>`, "info");
    state.nodes.forEach((node) => { if (node.type === from || node.type === to) state.flagged.add(node.id); });
    renderBoard();
    emit("hint", { kind: "link", from, to, text: `${t("missingEdge")} ${tNode(from).title} → ${tNode(to).title}`, hints: state.hintsUsed });
  }

  /* Where the nth step of a flow sits: left to right on a wide board, top to
   * bottom in two staggered columns on a tall one. */
  function slot(index, columns) {
    if (portrait()) return { x: index % 2 === 0 ? 30 : 70, y: 7 + (index / columns) * 86 };
    return { x: 7 + (index / columns) * 78, y: index % 2 === 0 ? 34 : 58 };
  }

  function autoArrange() {
    const scenario = currentScenario();
    const types = Array.from(new Set([...scenario.requiredTypes, ...state.nodes.map((node) => node.type)]));
    const columns = Math.max(2, types.length - 1);
    const layout = {};
    types.forEach((type, index) => {
      layout[type] = slot(index, columns);
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
    fitView();
  }

  function loadTemplate(kind, shouldRender = true) {
    const scenario = currentScenario();
    state.nodes = [];
    state.links = [];
    state.selectedNodeId = null;
    state.selectedSourceId = null;
    state.selectedLinkKey = null;
    touched();
    /* A flow that was handed over is reported as such with its result. */
    if (kind === "solution") state.assisted = true;
    const types = kind === "solution" ? scenario.requiredTypes : scenario.happyTypes;
    const edges = kind === "solution" ? scenario.requiredEdges : scenario.happyEdges;
    const columns = Math.max(2, types.length - 1);
    const nodeMap = {};
    types.forEach((type, index) => {
      const place = slot(index, columns);
      const node = addNode(type, place.x, place.y, false);
      nodeMap[type] = node.id;
    });
    edges.forEach(([from, to]) => {
      if (nodeMap[from] && nodeMap[to]) state.links.push({ from: nodeMap[from], to: nodeMap[to], label: edgeLabel(from, to) });
    });
    if (shouldRender) {
      renderAll();
      fitView();
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

  /* The order the flow executes in: depth first from the trigger, each node
   * once, with the connection the signal arrived on. */
  function collectExecutionSteps() {
    const trigger = state.nodes.find((node) => node.type === "trigger") || state.nodes[0];
    if (!trigger) return [];
    const visited = new Set();
    const steps = [];
    function walk(node, via) {
      if (!node || visited.has(node.id)) return;
      visited.add(node.id); steps.push({ node, via });
      state.links.filter((link) => link.from === node.id)
        .map((link) => ({ link, target: nodeById(link.to) }))
        .filter((entry) => entry.target)
        .sort((a, b) => nodeOrder.indexOf(a.target.type) - nodeOrder.indexOf(b.target.type))
        .forEach((entry) => walk(entry.target, entry.link));
    }
    walk(trigger, null);
    return steps;
  }

  function sleep(ms) { return new Promise((resolve) => { state.runTimer = setTimeout(resolve, ms); }); }

  /* Run flow: the signal leaves the trigger and travels the flow as it is
   * built — along each connection, into each node, in execution order — as
   * far as the connections take it. Only then is the flow judged against the
   * level's rules. Nothing here is staged: a wire lights because the walk
   * above crossed it. */
  async function runFlow() {
    if (state.running) return;
    stopRun();
    clearMarks();
    const serial = state.runSerial;
    state.running = true;
    state.selectedSourceId = null;
    state.lastValidation = null;
    resetRunLog();
    const messages = tScenario(currentScenario().id).messages || [];
    const message = messages[Number(els.testMessageSelect?.value || 0)] || messages[0] || "Hello";
    appendRunLog(t("runStarted"), message, "info");
    setStatus(t("runStarted"), "active");
    const steps = collectExecutionSteps();
    renderAll(false);
    emit("run-start", { steps: steps.length, message });
    const still = reducedMotion();
    const travel = still ? 60 : 340;
    const dwell = still ? 90 : 300;
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (step.via) {
        state.runningNodeId = null;
        state.liveLinkKey = linkKey(step.via);
        renderBoard();
        await sleep(travel);
        if (serial !== state.runSerial) return;
        state.doneLinks.add(state.liveLinkKey);
        state.liveLinkKey = null;
      }
      state.runningNodeId = step.node.id;
      state.visited.add(step.node.id);
      renderBoard();
      appendRunLog(runLabelForType(step.node.type), `${tNode(step.node.type).title}: ${step.node.config?.name || tNode(step.node.type).title}`, step.node.type === "fallback" || step.node.type === "handoff" ? "warning" : "success");
      emit("run-step", { index, total: steps.length, node: step.node.id, type: step.node.type, via: step.via ? linkKey(step.via) : null });
      await sleep(dwell);
      if (serial !== state.runSerial) return;
    }
    state.runningNodeId = null;
    state.running = false;
    const validation = validateCurrentFlow(true, "run");
    if (validation.valid) {
      appendRunLog(t("runCompleted"), makeSummary(), "success");
      setStatus(t("runCompleted"), "success");
    } else {
      appendRunLog(t("runInvalid"), validation.missingEdges[0] ? `${t("missingEdge")} ${tNode(validation.missingEdges[0][0]).title} → ${tNode(validation.missingEdges[0][1]).title}` : t("missingTitle"), "warning");
      setStatus(t("runInvalid"), "warning");
    }
    emit("run-end", { valid: validation.valid });
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

  /* File reads this engine started and that have not finished. Disposal aborts
   * them, and a completion that was already on its way is ignored: it must not
   * write into the board of an engine mounted afterwards. */
  const pendingReaders = new Set();

  function importJsonFile(file) {
    if (!file || lifecycle.aborted) return;
    const reader = new FileReader();
    pendingReaders.add(reader);
    reader.onloadend = () => { pendingReaders.delete(reader); };
    reader.onload = () => {
      if (lifecycle.aborted) return;
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        if (!Array.isArray(payload.nodes) || !Array.isArray(payload.connections)) throw new Error("Invalid payload");
        state.nodes = payload.nodes.map((node) => ({ id: node.id || uid(), type: node.type, x: node.position?.x ?? 20, y: node.position?.y ?? 30, config: node.config || defaultConfig(node.type) })).filter((node) => nodeOrder.includes(node.type));
        const ids = new Set(state.nodes.map((node) => node.id));
        state.links = payload.connections.map((link) => ({ from: link.from, to: link.to, label: link.label || "link" })).filter((link) => ids.has(link.from) && ids.has(link.to));
        touched();
        state.selectedNodeId = null; state.selectedSourceId = null; state.selectedLinkKey = null;
        renderAll();
        fitView();
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
      if (lifecycle.aborted) return;
      const area = document.createElement("textarea"); area.value = text; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
    }
    if (lifecycle.aborted) return;
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
    emit("change");
  }

  function setupEvents() {
    document.querySelector("[data-ai-run]")?.addEventListener("click", runFlow, { signal: lifecycle });
    document.querySelector("[data-ai-validate]")?.addEventListener("click", () => { if (!state.running) validateCurrentFlow(true); }, { signal: lifecycle });
    document.querySelector("[data-ai-hint]")?.addEventListener("click", showHint, { signal: lifecycle });
    document.querySelector("[data-ai-arrange]")?.addEventListener("click", autoArrange, { signal: lifecycle });
    document.querySelector("[data-ai-reset]")?.addEventListener("click", () => resetScenario(state.scenarioIndex), { signal: lifecycle });
    document.querySelector("[data-ai-export]")?.addEventListener("click", exportJson, { signal: lifecycle });
    document.querySelector("[data-ai-import]")?.addEventListener("click", () => els.importInput?.click(), { signal: lifecycle });
    els.importInput?.addEventListener("change", () => importJsonFile(els.importInput.files?.[0]), { signal: lifecycle });
    document.querySelector("[data-ai-copy]")?.addEventListener("click", copySummary, { signal: lifecycle });
    document.querySelector("[data-ai-report]")?.addEventListener("click", downloadReport, { signal: lifecycle });
    document.querySelector("[data-ai-png]")?.addEventListener("click", downloadPng, { signal: lifecycle });
    document.querySelector("[data-ai-next]")?.addEventListener("click", nextScenario, { signal: lifecycle });
    document.querySelector("[data-ai-scroll-game]")?.addEventListener("click", () => document.getElementById("ai-flow-puzzle-game")?.scrollIntoView({ behavior: "smooth", block: "start" }), { signal: lifecycle });
    window.addEventListener("resize", () => { renderLines(); if (gameRoot) { boundView(); applyView(); } }, { signal: lifecycle });
    document.addEventListener("keydown", (event) => {
      /* An open overlay makes the page behind it inert; its keys are not game input. */
      if (board.closest("[inert]")) return;
      /* Board keys answer on the board (or with nothing focused), never while
       * the visitor is typing in a field. */
      const onBoard = event.target === document.body || board.contains(event.target);
      if (!onBoard || state.running) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        const link = state.selectedLinkKey ? state.links.find((entry) => linkKey(entry) === state.selectedLinkKey) : null;
        if (link) { event.preventDefault(); removeLink(link.from, link.to); }
        else if (state.selectedNodeId) { event.preventDefault(); removeNode(state.selectedNodeId); }
      }
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      const moving = step && board.contains(event.target) ? nodeById(event.target.closest?.(".ai-flow-node")?.dataset.nodeId) : null;
      if (moving) {
        event.preventDefault();
        const size = worldSize();
        const stride = event.shiftKey ? 48 : 16;
        const next = clampNodePosition(moving.x + ((step[0] * stride) / size.w) * 100, moving.y + ((step[1] * stride) / size.h) * 100);
        moving.x = next.x; moving.y = next.y;
        const element = nodeElement(moving.id);
        if (element) { element.style.left = `${moving.x}%`; element.style.top = `${moving.y}%`; }
        renderLines();
      }
      if (event.key === "Escape" && (state.selectedSourceId || state.selectedNodeId || state.selectedLinkKey)) clearSelection();
    }, { signal: lifecycle });
  }

  /* What the game shell (js/pages/flow-puzzle-game.js) reads and asks for. The
   * rules stay here; the shell only presents them. */
  const api = {
    levels: () => scenarios.map((scenario, index) => {
      const text = tScenario(scenario.id);
      const record = progress.levels[scenario.id] || null;
      return {
        index, id: scenario.id, level: text.level, title: text.title, short: text.short, goal: text.goal, objective: text.objective,
        messages: (text.messages || []).slice(), nodes: scenario.requiredTypes.length, links: scenario.requiredEdges.length,
        outcomes: scenario.requiredEdges.filter(([, to]) => to === "end").map(([type]) => tNode(type).title),
        solved: Boolean(record), best: record ? record.best : null, award: record ? record.award : null
      };
    }),
    state: () => ({ level: state.scenarioIndex, nodes: state.nodes.length, links: state.links.length, hints: state.hintsUsed, running: state.running, score: state.score, selectedNode: state.selectedNodeId, selectedLink: state.selectedLinkKey, source: state.selectedSourceId, zoom: view.k, portrait: portrait() }),
    open: (index) => resetScenario(index),
    nodeTitle: (type) => tNode(type).title,
    text: (key) => t(key),
    run: () => runFlow(),
    stop: () => { if (!state.running) return; stopRun(); clearMarks(); renderAll(false); setStatus(t("connectTip")); },
    fit: () => fitView(),
    zoom: (factor) => zoomTo(view.k * factor),
    focusNode: (id) => { focusNode(id); nodeElement(id)?.querySelector("[data-ai-node-body]")?.focus({ preventScroll: true }); },
    refresh: () => { renderLines(); boundView(); applyView(); }
  };

  setupEvents();
  resetScenario(0);
  applyText();
  window.KaanFlowPuzzle = api;
  emit("ready");
  lifecycle.addEventListener("abort", () => {
    stopRun();
    delete window.KaanFlowPuzzle;
    clearTimeout(state.runTimer);
    pendingReaders.forEach((reader) => reader.abort());
    pendingReaders.clear();
    delete window.updateAiFlowPuzzleLanguage;
  }, { once: true });
}
/* Master 3 #30: a React-owned document hosts this engine through
 * js/pages/engine-host.js, which starts it after hydration and can stop it.
 * A legacy document boots it immediately, exactly as before. */
if (document.querySelector("main[data-react-main]")) (window.KaanEngineQueue = window.KaanEngineQueue || []).push(["aiFlowPuzzle", startAiFlowPuzzle]);
else startAiFlowPuzzle(new AbortController().signal);
