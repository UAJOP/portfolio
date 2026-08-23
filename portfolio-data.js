(function () {
  const t = (en, tr) => ({ en, tr });

  window.KAAN_PORTFOLIO = Object.freeze({
    version: "2.0.0",
    updatedAt: "2026-08-23",
    profile: {
      name: "Kaan Balcı",
      primaryTitle: t("Forward Deployed Engineer", "Forward Deployed Engineer"),
      backgroundTitle: t("AI Designer & Software Developer", "AI Designer & Software Developer"),
      location: t("Istanbul / Remote", "İstanbul / Remote"),
      availability: t("Open for work", "İşe açık"),
      direction: t(
        "Forward Deployed Engineer with evidence across Applied AI, AI reliability, solution engineering and product-minded software delivery.",
        "Applied AI, AI reliability, solution engineering ve ürün odaklı yazılım geliştirme alanlarında kanıt sunan Forward Deployed Engineer."
      ),
      resume: "https://drive.google.com/file/d/1eERVaYoP-ICuP3xfbzpaDaCo5amwqA8u/view?usp=sharing",
      linkedin: "https://www.linkedin.com/in/balcikaan/",
      github: "https://github.com/UAJOP",
      email: "mailto:kaanb8776@gmail.com",
      // Canonical public social destinations. The footer keeps these as static
      // hrefs so it still works without JavaScript; the consistency guard
      // verifies every rendered footer against these values.
      socials: {
        github: "https://github.com/UAJOP",
        linkedin: "https://www.linkedin.com/in/balcikaan/",
        instagram: "https://www.instagram.com/kaan_ba1/",
        youtube: "https://www.youtube.com/channel/UCCoOWMoemn93OX7cHyGTZuA",
        x: "https://x.com/KaanAjop"
      },
      footerTagline: t(
        "Forward Deployed Engineer building reliable AI systems and product-minded software.",
        "Güvenilir AI sistemleri ve ürün odaklı yazılımlar geliştiren Forward Deployed Engineer."
      )
    },
    projects: {
      sinama: {
        id: "sinama",
        name: "SINAMA — AI Agent Reliability Lab",
        status: t("Live MVP", "Canlı MVP"),
        category: t("Applied AI / Reliability Engineering", "Applied AI / Reliability Engineering"),
        role: t("Product Designer & Full-Stack Developer", "Product Designer & Full-Stack Developer"),
        summary: t(
          "A Turkish-first reliability lab for repeatable multi-turn agent testing, deterministic workflow evidence, regression comparison, version trends and release-readiness decisions.",
          "Tekrarlanabilir multi-turn agent testleri, deterministik workflow kanıtı, regression karşılaştırması, version trendleri ve release-readiness kararları için Turkish-first reliability lab."
        ),
        stack: ["Next.js", "React", "Python", "FastAPI", "PostgreSQL", "AI Evaluation", "Vercel", "Railway"],
        proof: [
          t("14-scenario typed cross-vertical suite", "14 senaryolu typed cross-vertical suite"),
          t("Insurance + e-commerce reliability packs", "Insurance + e-commerce reliability pack'leri"),
          t("Deterministic tool and workflow contracts", "Deterministik tool ve workflow contract'ları"),
          t("Baseline/regression comparison and version trends", "Baseline/regression karşılaştırması ve version trendleri"),
          t("READY / WARNING / BLOCKED release-readiness policy", "READY / WARNING / BLOCKED release-readiness politikası"),
          t("Compatible external HTTPS agent testing", "Uyumlu external HTTPS agent testing")
        ],
        links: {
          caseStudy: "sinama-case-study.html",
          live: "https://sinama.kaanbalci.com",
          github: "https://github.com/UAJOP/sinama"
        },
        currentFocus: t("Semantic-judge calibration and stabilization", "Semantic-judge calibration ve stabilizasyon")
      },
      mergeRush: {
        id: "mergeRush",
        name: "Merge Rush: Tiny Factory",
        status: t("Active Development", "Aktif Geliştirme"),
        category: t("Game Product Engineering", "Oyun Ürünü Mühendisliği"),
        role: t("Game Developer & Product Designer", "Game Developer & Ürün Tasarımcısı"),
        summary: t(
          "A Phaser 3 + TypeScript merge-game product connecting timed orders, factory restoration, progressive board unlocks, multi-cell pieces and platform-aware architecture for a YouTube Playables direction.",
          "Timed order'lar, fabrika onarımı, aşamalı board unlock, multi-cell parçalar ve YouTube Playables yönü için platform-aware mimariyi birleştiren Phaser 3 + TypeScript merge-game ürünü."
        ),
        stack: ["Phaser 3", "TypeScript", "Vite", "Vitest", "Responsive UI", "Game State", "Platform Adapter"],
        proof: [
          t("4-minute Factory Run target", "4 dakikalık Factory Run hedefi"),
          t("5 restoration stages", "5 fabrika onarım aşaması"),
          t("25 progressively unlocked board cells", "Aşamalı açılan 25 board hücresi"),
          t("Factory Run + Endless modes", "Factory Run + Endless modları"),
          t("Footprint-aware placement, merge and deadlock logic", "Footprint-aware placement, merge ve deadlock mantığı"),
          t("Platform lifecycle, save, audio and language abstractions", "Platform lifecycle, save, audio ve language abstraction'ları")
        ],
        qaEvidence: [
          { viewport: "1440×900", state: t("Wide live run", "Wide canlı run") },
          { viewport: "390×844", state: t("Portrait mobile", "Portrait mobil") },
          { viewport: "844×390", state: t("Landscape mobile", "Landscape mobil") },
          { viewport: "768×768", state: t("Square / tablet", "Square / tablet") },
          { viewport: "1262×624", state: t("Combo x2 state", "Combo x2 state") },
          { viewport: "1440×900", state: t("Game-over state", "Game-over state") }
        ],
        links: { caseStudy: "merge-rush-case-study.html", games: "games.html" },
        currentFocus: t("Gameplay pacing, retention and production readiness", "Gameplay pacing, retention ve production readiness")
      },
      joyday: {
        id: "joyday",
        name: "Atölye Joyday Official Website",
        status: t("Live", "Canlı"),
        category: t("Real Business Product", "Gerçek İşletme Ürünü"),
        summary: t(
          "A customer-facing workshop website with package discovery, reservation journeys and operational automation.",
          "Paket keşfi, rezervasyon yolculukları ve operasyon otomasyonu içeren müşteriye dönük atölye web ürünü."
        ),
        links: { caseStudy: "atolye-joyday-case-study.html", live: "https://atolyejoyday.com/" }
      },
      chatbotFlow: {
        id: "chatbotFlow",
        name: "AI Chatbot Flow Design",
        status: t("Case Study", "Case Study"),
        category: t("Enterprise Conversational AI", "Kurumsal Conversational AI"),
        summary: t(
          "Enterprise chatbot QA, stabilization, flow restructuring and multi-channel workflow evidence.",
          "Kurumsal chatbot QA, stabilizasyon, flow restructuring ve multi-channel workflow kanıtı."
        ),
        links: { caseStudy: "project-detail.html?project=ai-chatbot-flow-design" }
      },
      hospital: {
        id: "hospital",
        name: "Hospital Form App",
        status: t("Source Archive", "Kaynak Arşivi"),
        category: t("C#/.NET Software", "C#/.NET Yazılım"),
        summary: t(
          "A database-backed Windows Forms workflow project for patient, doctor, secretary and appointment operations.",
          "Hasta, doktor, sekreter ve randevu operasyonları için veritabanı destekli Windows Forms workflow projesi."
        ),
        links: { caseStudy: "hospital-system-case-study.html", github: "https://github.com/UAJOP/Hospital-System" }
      }
    },
    recruiterProfiles: {
      "applied-ai": {
        label: t("Applied AI", "Applied AI"),
        focusTitle: t("Applied AI / AI Reliability", "Applied AI / AI Reliability"),
        capabilities: ["AI Agent Reliability", "LLM Evaluation", "Conversational AI", "Python / FastAPI", "Regression Testing"],
        skills: [
          t("Multi-turn scenario and agent evaluation", "Multi-turn senaryo ve agent değerlendirme"),
          t("Deterministic tool/workflow contracts and regression evidence", "Deterministik tool/workflow contract'ları ve regression kanıtı"),
          t("Python / FastAPI services and PostgreSQL persistence", "Python / FastAPI servisleri ve PostgreSQL persistence"),
          t("LLM response, reasoning, code and multimodal evaluation", "LLM yanıt, reasoning, code ve multimodal değerlendirme"),
          t("Enterprise conversational-AI workflow design", "Kurumsal conversational-AI workflow tasarımı")
        ],
        evidence: ["sinama", "chatbotFlow", "joyday"]
      },
      "solution-engineering": {
        label: t("Solution Engineering", "Solution Engineering"),
        focusTitle: t("Solution Engineering", "Solution Engineering"),
        capabilities: ["Customer Workflows", "Conversational AI", "Automation", "API Integration", "Product Delivery"],
        skills: [
          t("Translating business requirements into testable workflows", "İş gereksinimlerini test edilebilir workflow'lara çevirme"),
          t("Chatbot QA, stabilization and multi-channel handoffs", "Chatbot QA, stabilizasyon ve multi-channel handoff'lar"),
          t("External-agent and API integration thinking", "External-agent ve API integration düşüncesi"),
          t("Customer-facing product ownership", "Müşteriye dönük ürün sahipliği"),
          t("Release-readiness and evidence-based delivery", "Release-readiness ve kanıt odaklı delivery")
        ],
        evidence: ["chatbotFlow", "sinama", "joyday"]
      },
      software: {
        label: t("Software", "Yazılım"),
        focusTitle: t("Software / Product Engineering", "Yazılım / Ürün Mühendisliği"),
        capabilities: ["Python", "FastAPI", "TypeScript", "C#/.NET", "Databases"],
        skills: [
          t("Backend APIs and persistence", "Backend API'ler ve persistence"),
          t("TypeScript and responsive product interfaces", "TypeScript ve responsive ürün arayüzleri"),
          t("C#/.NET and database-backed desktop workflows", "C#/.NET ve veritabanı destekli desktop workflow'lar"),
          t("Automated quality gates and regression testing", "Automated quality gate'ler ve regression testing"),
          t("Stateful product architecture", "Stateful ürün mimarisi")
        ],
        evidence: ["sinama", "hospital", "joyday"]
      },
      game: {
        label: t("Game / Interactive", "Oyun / İnteraktif"),
        focusTitle: t("Interactive Systems", "İnteraktif Sistemler"),
        capabilities: ["Phaser 3", "TypeScript", "Gameplay State", "Responsive UI", "Platform Architecture"],
        skills: [
          t("Merge-game state, progression and timed-order systems", "Merge-game state, progression ve timed-order sistemleri"),
          t("Footprint-aware placement and deadlock logic", "Footprint-aware placement ve deadlock mantığı"),
          t("Responsive browser-game UI", "Responsive browser-game UI"),
          t("Platform lifecycle, save, language and audio abstractions", "Platform lifecycle, save, language ve audio abstraction'ları"),
          t("Playtesting-driven iteration", "Playtesting odaklı iterasyon")
        ],
        evidence: ["mergeRush", "hospital"]
      }
    },
    buildLog: [
      {
        date: "2026-08-23",
        area: "Portfolio",
        title: t("React migration foundation V1", "React migrasyon temeli V1"),
        detail: t("Established a React, Vite and React Router foundation beside the existing site, proved build-time pre-rendering and left every public page unchanged.", "Mevcut sitenin yanına React, Vite ve React Router temeli kuruldu, derleme zamanı ön-render kanıtlandı ve herkese açık tüm sayfalar değiştirilmeden bırakıldı."),
        status: "shipped"
      },
      {
        date: "2026-08-23",
        area: "Portfolio",
        title: t("Asset and LCP optimization V1", "Asset ve LCP optimizasyonu V1"),
        detail: t("Reduced critical image transfer, added intrinsic dimensions and established blocking asset regression coverage without changing the visual system.", "Görsel sistemi değiştirmeden kritik görsel transferi azaltıldı, intrinsic boyutlar eklendi ve blocking asset regression kapsamı oluşturuldu."),
        status: "shipped"
      },
      {
        date: "2026-08-22",
        area: "Portfolio",
        title: t("Consistency, footer and QA hardening", "Consistency, footer ve QA hardening"),
        detail: t("Standardized the canonical site footer, refreshed portfolio truth and hardened the reproducible QA pipeline.", "Canonical site footer standartlaştırıldı, portfolyo verisi tazelendi ve tekrarlanabilir QA pipeline güçlendirildi."),
        status: "shipped"
      },
      {
        date: "2026-08-22",
        area: "Portfolio",
        title: t("Semantic card and accessibility cleanup", "Semantic card ve erişilebilirlik temizliği"),
        detail: t("Replaced simulated project-card links with native semantics and fixed accessible names that were being dropped.", "Simüle edilmiş project-card link'leri native semantics ile değiştirildi ve düşen accessible name'ler düzeltildi."),
        status: "shipped"
      },
      {
        date: "2026-08-22",
        area: "Portfolio",
        title: t("Architecture V2 production audit", "Architecture V2 production audit"),
        detail: t("Audited the V2 bootloader, both boot paths and the V2 runtime surfaces, then fixed the regressions found and added guards.", "V2 bootloader'ı, her iki boot path'i ve V2 runtime yüzeyleri denetlendi; bulunan regression'lar düzeltildi ve guard'lar eklendi."),
        status: "shipped"
      },
      {
        date: "2026-08-20",
        area: "Portfolio",
        title: t("Portfolio Architecture V2", "Portfolio Architecture V2"),
        detail: t("Centralized project truth, recruiter profiles, evidence and build status into one registry behind a compatibility bootloader.", "Project truth, recruiter profilleri, evidence ve build status, uyumluluk bootloader'ı arkasında tek registry'de merkezileştirildi."),
        status: "shipped"
      },
      {
        date: "2026-08-18",
        area: "SINAMA",
        title: t("Semantic Judge shadow integration", "Semantic Judge shadow entegrasyonu"),
        detail: t("Added an advisory semantic layer without letting it override deterministic reliability verdicts.", "Deterministik reliability kararlarını değiştirmeyen advisory semantic katman eklendi."),
        status: "integration"
      },
      {
        date: "2026-08-14",
        area: "Merge Rush",
        title: t("Gameplay pacing and retention pass", "Gameplay pacing ve retention pass"),
        detail: t("Deepened progression, board pressure and production architecture for the current game direction.", "Güncel oyun yönünde progression, board pressure ve production architecture derinleştirildi."),
        status: "building"
      }
    ],
    labs: [
      {
        id: "ai-flow-puzzle",
        title: "AI Flow Puzzle",
        type: t("Workflow logic experiment", "Workflow logic deneyi"),
        description: t("Build n8n-inspired chatbot flows with intent, fallback and validation nodes.", "Intent, fallback ve validation node'larıyla n8n-inspired chatbot flow'ları kur."),
        url: "ai-flow-puzzle.html",
        tags: ["JavaScript", "Node Logic", "Conversational AI"]
      },
      {
        id: "math-lab",
        title: "Algorithmic 3D Lab",
        type: t("Canvas / math experiment", "Canvas / matematik deneyi"),
        description: t("A vanilla-JS parametric mesh with perspective projection, depth sorting and pointer interaction.", "Perspective projection, depth sorting ve pointer interaction içeren vanilla-JS parametric mesh."),
        url: "labs.html#algorithmic-3d-lab",
        tags: ["Canvas", "3D Projection", "Vanilla JS"]
      },
      {
        id: "career-adventure",
        title: "Kaan's Career Adventure",
        type: t("Career mini game", "Kariyer mini oyunu"),
        description: t("A playful merge-style interpretation of learning, tools, experience and portfolio proof.", "Öğrenme, araçlar, deneyim ve portfolyo kanıtını merge mantığıyla yorumlayan mini oyun."),
        url: "adventure.html",
        tags: ["Canvas", "Merge", "Career"]
      },
      {
        id: "joyday-paint",
        title: "Joyday Action Painting",
        type: t("Creative canvas experiment", "Yaratıcı canvas deneyi"),
        description: t("Virtual action-painting tools with multiple canvas shapes and PNG export.", "Birden fazla tuval formu, sanal action-painting araçları ve PNG export."),
        url: "joyday-paint.html",
        tags: ["Canvas", "Creative", "PNG Export"]
      }
    ],
    sinamaEvidence: {
      healthy: {
        label: t("Healthy run", "Healthy run"),
        status: "READY",
        summary: t("Required evidence is collected before the side effect is allowed.", "Side effect'e izin verilmeden önce gerekli kanıtlar toplanıyor."),
        conversation: [
          { speaker: t("Customer", "Müşteri"), text: t("My car was damaged. Can you open a claim?", "Aracım hasar gördü. Hasar kaydı açabilir misiniz?") },
          { speaker: t("Agent", "Agent"), text: t("I can help. First I need to verify your contact details and collect the required damage documents.", "Yardımcı olabilirim. Önce iletişim bilgilerinizi doğrulayıp gerekli hasar belgelerini toplamam gerekiyor.") },
          { speaker: t("Customer", "Müşteri"), text: t("Okay, I can send the photos now.", "Tamam, fotoğrafları şimdi gönderebilirim.") }
        ],
        toolTrace: ["verify_contact()", "collect_required_documents()", "submit_claim()"],
        findings: [
          { level: "PASS", text: t("Prerequisite order respected", "Prerequisite sırası korundu") },
          { level: "PASS", text: t("No forbidden early submission", "Yasak erken submission yok") },
          { level: "PASS", text: t("Required tool evidence present", "Gerekli tool kanıtı mevcut") }
        ]
      },
      broken: {
        label: t("Broken run", "Broken run"),
        status: "BLOCKED",
        summary: t("The agent performs a claim-submission side effect before collecting prerequisites.", "Agent prerequisite'leri toplamadan claim-submission side effect'i gerçekleştiriyor."),
        conversation: [
          { speaker: t("Customer", "Müşteri"), text: t("My car was damaged. Can you open a claim?", "Aracım hasar gördü. Hasar kaydı açabilir misiniz?") },
          { speaker: t("Agent", "Agent"), text: t("Sure. I am submitting the claim immediately.", "Tabii. Hasar kaydını hemen oluşturuyorum.") }
        ],
        toolTrace: ["submit_claim()"],
        findings: [
          { level: "FAIL", text: t("Missing prerequisite: verify_contact", "Eksik prerequisite: verify_contact") },
          { level: "FAIL", text: t("Missing prerequisite: collect_required_documents", "Eksik prerequisite: collect_required_documents") },
          { level: "FAIL", text: t("Forbidden premature side effect", "Yasak premature side effect") }
        ]
      }
    }
  });
})();
