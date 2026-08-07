window.caseStudyPageData = {
  titles: {
    en: "SINAMA — AI Agent Reliability Lab Case Study | Kaan Balcı",
    tr: "SINAMA — AI Agent Reliability Lab Vaka Çalışması | Kaan Balcı",
  },
  translations: {
    en: {
      "skip.content": "Skip to content",
      "hero.eyebrow": "AI Agent Reliability Project",
      "hero.lead":
        "A Turkish-first reliability lab for testing customer-service AI agents before release through multi-turn scenarios, tool-call validation and inspectable regression evidence.",
      "alt.hero": "SINAMA wordmark on a green cover card",
      "hero.statusLabel": "Status",
      "hero.status": "Live MVP",
      "hero.yearLabel": "Year",
      "hero.roleLabel": "Role",
      "hero.role": "Product Designer & Full-Stack Developer",
      "hero.typeLabel": "Project type",
      "hero.type": "Independent Product / Portfolio Project",
      "actions.liveProduct": "Open Live Product",
      "actions.github": "View GitHub",
      "actions.resume": "View Resume",
      "actions.contact": "Contact Me",
      "aria.technologies": "Project technologies",
      "aria.proof": "Project proof",
      "aria.evidenceExample": "Failure evidence example",
      "aria.currentLimitations": "Current limitations",
      "proof.scenarios": "Turkish Test Scenarios",
      "proof.targets": "Agent Targets",
      "proof.baseline": "Healthy Baseline",
      "proof.regressions": "Intentional Regressions Detected",

      "overview.eyebrow": "Overview & Problem",
      "overview.title":
        "AI agents need regression testing, not just prompt tweaking.",
      "overview.body1":
        "Customer-facing AI agents are multi-turn systems: what they say matters, but so do the business rules and tool calls they trigger along the way.",
      "overview.body2":
        "Changing a prompt, a model or a flow can fix one behavior while quietly breaking another. Manual testing is difficult to reproduce, and a conversation that reads as successful can still contain an incorrect tool action underneath.",
      "overview.body3":
        "SINAMA was built to make these failures repeatable and inspectable: run the same Turkish customer scenarios, capture the transcript and tool trace, and evaluate the result against deterministic contracts instead of a gut feeling.",

      "goal.eyebrow": "Product Goal",
      "goal.title": "A simple workflow for release-time confidence.",
      "goal.body":
        "The product hypothesis: give developers and AI teams a simple workflow where they can connect an agent, run repeatable Turkish customer scenarios and understand exactly why a release passed or failed. This is the current product direction, not a claim of proven market leadership.",

      "steps.eyebrow": "How SINAMA Works",
      "steps.title":
        "A six-step loop from agent target to failure evidence.",
      "steps.step1": "Select Agent Target",
      "steps.step2": "Select Scenario Pack",
      "steps.step3": "Execute Multi-Turn Conversations",
      "steps.step4": "Capture Transcript & Tool Trace",
      "steps.step5": "Evaluate Deterministic Contracts",
      "steps.step6": "Inspect Failure Evidence",

      "vertical.eyebrow": "Demo Vertical",
      "vertical.title": "A synthetic insurance claim-intake agent.",
      "vertical.body1":
        "The current demo vertical is a synthetic, fictional insurance claim-intake agent. No private client or customer data is used anywhere in the scenarios or evidence.",
      "vertical.body2": "Its responsibilities inside the scenarios:",
      "vertical.item1": "Collect policy number",
      "vertical.item2": "Collect claim details",
      "vertical.item3": "Request required documents",
      "vertical.item4": "Avoid premature claim submission",
      "vertical.item5":
        "Expose structured tool events for evaluation",
      "vertical.scenariosTitle": "Insurance Reliability Pack v1",
      "vertical.scenariosBody":
        "Five Turkish synthetic scenarios cover the intake flow end to end:",

      "compare.eyebrow": "Healthy vs. Broken",
      "compare.title": "The same evaluator, two agent behaviors.",
      "compare.body":
        "The Broken agent intentionally violates expected behavior so SINAMA can demonstrate that the evaluator detects behavioral regressions rather than merely displaying successful-looking conversations.",
      "compare.healthyTitle": "Healthy",
      "compare.healthyFigures": "5 PASS · 0 FAIL · 0 ERROR",
      "compare.brokenTitle": "Broken (intentional)",
      "compare.brokenFigures": "3 PASS · 2 FAIL · 0 ERROR",
      "compare.brokenListTitle": "Intentional HIGH-severity failures",
      "compare.ins001": "INS-001 — HIGH",
      "compare.ins005": "INS-005 — HIGH",

      "evidence.eyebrow": "Inspectable Failure Evidence",
      "evidence.title": "Every failed scenario shows its work.",
      "evidence.body": "A failed scenario exposes:",
      "evidence.item1": "Scenario result",
      "evidence.item2": "Failed check and category",
      "evidence.item3": "Severity",
      "evidence.item4": "Failure reason",
      "evidence.item5": "Full conversation transcript",
      "evidence.item6": "Structured tool events",
      "evidence.item7": "The offending event / evidence",
      "evidence.example":
        "In the current regression example, submit_claim was triggered before the required damage_photo collection step — exactly the kind of premature action the evaluator is built to catch.",

      "external.eyebrow": "External HTTP Agent",
      "external.title":
        "From a built-in demo to a reusable test surface.",
      "external.body":
        "SINAMA evolved from a single built-in demo agent into a platform that can point the same scenario runner and evaluator at an external agent over HTTP.",
      "external.demoTitle": "Built-in Demo Agent",
      "external.demoBody":
        "The synthetic insurance claim-intake agent used for the current demo vertical and scenario pack.",
      "external.httpTitle": "External HTTP Agent",
      "external.httpBody":
        "A conversational HTTP target you control, tested through the same runner, evaluator and evidence interface.",
      "external.item1": "Endpoint connection testing",
      "external.item2": "Optional runtime bearer token",
      "external.item3": "Response normalization",
      "external.item4": "Same scenario runner",
      "external.item5": "Same evaluator",
      "external.item6": "Same results / evidence interface",

      "security.eyebrow": "Security Design",
      "security.title":
        "Testing external URLs safely is part of the product.",
      "security.body":
        "Letting SINAMA call an external agent turns SINAMA into a URL-testing surface, so these controls were built before public external-agent support shipped:",
      "security.item1": "HTTPS enforced in production",
      "security.item2": "Localhost blocking",
      "security.item3": "Loopback blocking",
      "security.item4": "Private-network blocking",
      "security.item5": "Link-local blocking",
      "security.item6": "Cloud-metadata destination protection",
      "security.item7": "DNS validation",
      "security.item8": "Validated IP connection pinning",
      "security.item9": "Redirects disabled",
      "security.item10": "Bounded timeout",
      "security.item11": "Bounded response size",
      "security.item12": "Credentials not persisted",
      "security.item13": "Credentials not exposed in errors or logs",
      "security.disclaimer":
        "These are implemented engineering controls, not a certification. SINAMA is not described as enterprise-grade, certified, audited or SOC 2 compliant.",

      "architecture.eyebrow": "Architecture",
      "architecture.title":
        "Next.js frontend, FastAPI backend, one evaluator for both agent types.",
      "aria.architectureRequest": "Request and execution path",
      "aria.architectureEval": "Evaluation and results path",
      "architecture.group1": "Request & execution",
      "architecture.step1": "Browser / Next.js",
      "architecture.step2": "FastAPI API",
      "architecture.step3": "Scenario Runner",
      "architecture.step4": "AgentAdapter",
      "architecture.group2": "Evaluation & results",
      "architecture.step5": "Demo Agent or External HTTP Agent",
      "architecture.step6": "Transcript + Tool Events",
      "architecture.step7": "Deterministic Evaluator",
      "architecture.step8": "Run Results + Evidence UI",
      "architecture.note":
        "The current RunStore is bounded and in-memory. There is no persistent PostgreSQL or Supabase database implemented yet.",

      "decisions.eyebrow": "Technical Decisions",
      "decisions.title": "Four choices that shaped the MVP.",
      "decisions.d1title": "Deterministic evaluator first",
      "decisions.d1why":
        "Why: repeatable behavior and no paid LLM required for the core MVP.",
      "decisions.d2title": "AgentAdapter abstraction",
      "decisions.d2why":
        "Why: the same scenario runner and evaluator can test built-in and external targets.",
      "decisions.d3title": "Evidence instead of one opaque score",
      "decisions.d3why":
        "Why: developers need to know exactly what failed.",
      "decisions.d4title":
        "Security before public external-agent support",
      "decisions.d4why":
        "Why: a URL-testing platform must not become an SSRF or open-proxy risk.",

      "limits.eyebrow": "Current Limitations & Next Steps",
      "limits.title": "Transparent about what the MVP does not do yet.",
      "limits.currentTitle": "Current limitations",
      "limits.c1": "Bounded in-memory run history",
      "limits.c2": "No durable persistence",
      "limits.c3": "No run / version comparison",
      "limits.c4": "Deterministic evaluator scope only",
      "limits.c5": "Some semantic expectations may remain unscored",
      "limits.c6": "No authentication",
      "limits.c7": "No billing",
      "limits.c8": "No voice-agent testing",
      "limits.nextTitle": "Next product directions",
      "limits.n1": "Persistent run history",
      "limits.n2": "V1 vs V2 agent comparison",
      "limits.n3": "Regression delta reporting",
      "limits.n4": "More Turkish scenario packs",
      "limits.n5": "Release-readiness reporting",

      "owned.eyebrow": "What I Owned",
      "owned.title": "Product, architecture and delivery, end to end.",
      "owned.body":
        "I defined the product problem and MVP scope, designed the testing workflow and failure-inspection UX, structured the synthetic Turkish scenarios, directed the agent/evaluator architecture, implemented and iterated the frontend/backend system, established regression testing and deployed the product through Vercel and Railway. Development was AI-assisted product and software development, directed and reviewed by me rather than written line by line without tools.",
      "aria.ownedSkills": "Ownership highlights",
      "owned.skill1": "Product Thinking",
      "owned.skill2": "AI Agent Evaluation",
      "owned.skill3": "LLM Reliability",
      "owned.skill4": "Technical Architecture",
      "owned.skill5": "QA",
      "owned.skill6": "Automation",
      "owned.skill7": "Frontend",
      "owned.skill8": "Backend",
      "owned.skill9": "Deployment",
      "owned.skill10": "Security Thinking",

      "related.eyebrow": "Related Projects",
      "related.title":
        "Continue through the AI workflow and evaluation work.",
      "related.puzzle": "AI Flow Puzzle",
      "related.puzzleBody":
        "An interactive chatbot workflow and validation demonstration.",
      "related.chatbot": "AI Chatbot Flow Design",
      "related.chatbotBody":
        "Enterprise conversational-AI evidence across QA, stabilization and workflow restructuring.",

      "cta.eyebrow": "Resume & Contact",
      "cta.title":
        "Looking for AI agent reliability and product engineering?",
      "cta.body":
        "Review my resume or get in touch to discuss AI evaluation, agent testing and full-stack product work.",
    },
    tr: {
      "skip.content": "İçeriğe geç",
      "hero.eyebrow": "AI Agent Reliability Projesi",
      "hero.lead":
        "Müşteri hizmetleri AI agent'larını yayın öncesinde çok turlu senaryolar, tool-call doğrulaması ve incelenebilir regression kanıtlarıyla test eden Türkçe öncelikli bir reliability lab.",
      "alt.hero": "Yeşil kapak kartı üzerinde SINAMA logotype'ı",
      "hero.statusLabel": "Durum",
      "hero.status": "Canlı MVP",
      "hero.yearLabel": "Yıl",
      "hero.roleLabel": "Rol",
      "hero.role": "Ürün Tasarımcısı & Full-Stack Geliştirici",
      "hero.typeLabel": "Proje türü",
      "hero.type": "Bağımsız Ürün / Portfolyo Projesi",
      "actions.liveProduct": "Canlı Ürünü Aç",
      "actions.github": "GitHub'ı Görüntüle",
      "actions.resume": "CV'yi Görüntüle",
      "actions.contact": "İletişime Geç",
      "aria.technologies": "Proje teknolojileri",
      "aria.proof": "Proje kanıtları",
      "aria.evidenceExample": "Hata kanıtı örneği",
      "aria.currentLimitations": "Mevcut sınırlamalar",
      "proof.scenarios": "Türkçe Test Senaryosu",
      "proof.targets": "Agent Hedefi",
      "proof.baseline": "Sağlıklı Baseline",
      "proof.regressions": "Kasıtlı Tespit Edilen Regression",

      "overview.eyebrow": "Genel Bakış & Problem",
      "overview.title":
        "AI agent'lar sadece prompt ince ayarına değil, regression testine ihtiyaç duyar.",
      "overview.body1":
        "Müşteriyle doğrudan konuşan AI agent'lar çok turlu sistemlerdir: söyledikleri kadar, yol boyunca tetikledikleri iş kuralları ve tool call'lar da önemlidir.",
      "overview.body2":
        "Bir prompt'u, modeli veya flow'u değiştirmek bir davranışı düzeltirken sessizce başka bir davranışı bozabilir. Manuel test tekrarlanabilir değildir ve başarılı görünen bir konuşmanın altında yanlış bir tool call gizli olabilir.",
      "overview.body3":
        "SINAMA, bu hataları tekrarlanabilir ve incelenebilir kılmak için geliştirildi: aynı Türkçe müşteri senaryolarını çalıştırır, transcript ve tool trace'i yakalar ve sonucu bir sezgi yerine deterministik kontratlara göre değerlendirir.",

      "goal.eyebrow": "Ürün Hedefi",
      "goal.title": "Yayın anı güveni için basit bir workflow.",
      "goal.body":
        "Ürün hipotezi: geliştiricilere ve AI ekiplerine bir agent'ı bağlayabilecekleri, tekrarlanabilir Türkçe müşteri senaryoları çalıştırabilecekleri ve bir release'in neden geçtiğini veya başarısız olduğunu tam olarak anlayabilecekleri basit bir workflow sunmak. Bu mevcut ürün yönüdür, kanıtlanmış bir pazar liderliği iddiası değildir.",

      "steps.eyebrow": "SINAMA Nasıl Çalışır",
      "steps.title":
        "Agent hedefinden hata kanıtına altı adımlık bir döngü.",
      "steps.step1": "Agent Hedefi Seç",
      "steps.step2": "Senaryo Paketi Seç",
      "steps.step3": "Çok Turlu Konuşmaları Çalıştır",
      "steps.step4": "Transcript & Tool Trace Yakala",
      "steps.step5": "Deterministik Kontratları Değerlendir",
      "steps.step6": "Hata Kanıtını İncele",

      "vertical.eyebrow": "Demo Vertikal",
      "vertical.title": "Kurgusal bir sigorta hasar başvuru agent'ı.",
      "vertical.body1":
        "Mevcut demo vertikal, kurgusal ve sentetik bir sigorta hasar başvuru agent'ıdır. Senaryolarda veya kanıtlarda hiçbir gerçek müşteri verisi kullanılmaz.",
      "vertical.body2": "Senaryolar içindeki sorumlulukları:",
      "vertical.item1": "Poliçe numarasını topla",
      "vertical.item2": "Hasar detaylarını topla",
      "vertical.item3": "Gerekli belgeleri iste",
      "vertical.item4": "Erken hasar gönderimini engelle",
      "vertical.item5":
        "Değerlendirme için yapılandırılmış tool event'leri açığa çıkar",
      "vertical.scenariosTitle": "Insurance Reliability Pack v1",
      "vertical.scenariosBody":
        "Beş Türkçe sentetik senaryo, başvuru akışını uçtan uca kapsar:",

      "compare.eyebrow": "Sağlıklı ve Bozuk Karşılaştırması",
      "compare.title": "Aynı evaluator, iki farklı agent davranışı.",
      "compare.body":
        "Bozuk agent, SINAMA'nın yalnızca başarılı görünen konuşmaları göstermek yerine davranışsal regression'ları gerçekten tespit ettiğini kanıtlamak için beklenen davranışı kasıtlı olarak ihlal eder.",
      "compare.healthyTitle": "Sağlıklı",
      "compare.healthyFigures": "5 PASS · 0 FAIL · 0 ERROR",
      "compare.brokenTitle": "Bozuk (kasıtlı)",
      "compare.brokenFigures": "3 PASS · 2 FAIL · 0 ERROR",
      "compare.brokenListTitle": "Kasıtlı HIGH önem dereceli hatalar",
      "compare.ins001": "INS-001 — HIGH",
      "compare.ins005": "INS-005 — HIGH",

      "evidence.eyebrow": "İncelenebilir Hata Kanıtı",
      "evidence.title": "Her başarısız senaryo kendi kanıtını gösterir.",
      "evidence.body": "Başarısız bir senaryo şunları açığa çıkarır:",
      "evidence.item1": "Senaryo sonucu",
      "evidence.item2": "Başarısız kontrol ve kategori",
      "evidence.item3": "Önem derecesi",
      "evidence.item4": "Hata nedeni",
      "evidence.item5": "Tam konuşma transcript'i",
      "evidence.item6": "Yapılandırılmış tool event'leri",
      "evidence.item7": "Sorumlu event / kanıt",
      "evidence.example":
        "Mevcut regression örneğinde submit_claim, gerekli damage_photo toplama adımından önce tetiklendi — evaluator'ın tam olarak yakalamak üzere tasarlandığı türden erken bir aksiyon.",

      "external.eyebrow": "External HTTP Agent",
      "external.title":
        "Yerleşik demo'dan tekrar kullanılabilir bir test yüzeyine.",
      "external.body":
        "SINAMA, tek bir yerleşik demo agent'tan, aynı senaryo runner'ını ve evaluator'ı HTTP üzerinden harici bir agent'a yöneltebilen bir platforma evrildi.",
      "external.demoTitle": "Yerleşik Demo Agent",
      "external.demoBody":
        "Mevcut demo vertikal ve senaryo paketi için kullanılan kurgusal sigorta hasar başvuru agent'ı.",
      "external.httpTitle": "External HTTP Agent",
      "external.httpBody":
        "Sizin kontrol ettiğiniz, aynı runner, evaluator ve kanıt arayüzü üzerinden test edilen bir conversational HTTP hedefi.",
      "external.item1": "Endpoint bağlantı testi",
      "external.item2": "Opsiyonel runtime bearer token",
      "external.item3": "Yanıt normalizasyonu",
      "external.item4": "Aynı senaryo runner'ı",
      "external.item5": "Aynı evaluator",
      "external.item6": "Aynı sonuç / kanıt arayüzü",

      "security.eyebrow": "Güvenlik Tasarımı",
      "security.title": "Harici URL'leri güvenle test etmek ürünün bir parçası.",
      "security.body":
        "SINAMA'nın harici bir agent'ı çağırabilmesi onu bir URL-test yüzeyine dönüştürür; bu yüzden public external-agent desteği yayınlanmadan önce şu kontroller geliştirildi:",
      "security.item1": "Production'da HTTPS zorunluluğu",
      "security.item2": "Localhost engelleme",
      "security.item3": "Loopback engelleme",
      "security.item4": "Private-network engelleme",
      "security.item5": "Link-local engelleme",
      "security.item6": "Cloud-metadata hedef koruması",
      "security.item7": "DNS doğrulaması",
      "security.item8": "Doğrulanmış IP bağlantı pinleme",
      "security.item9": "Redirect'ler devre dışı",
      "security.item10": "Sınırlı timeout",
      "security.item11": "Sınırlı yanıt boyutu",
      "security.item12": "Credential'lar kalıcı olarak saklanmaz",
      "security.item13": "Credential'lar hata veya loglarda açığa çıkmaz",
      "security.disclaimer":
        "Bunlar uygulanmış mühendislik kontrolleridir, bir sertifikasyon değildir. SINAMA enterprise-grade, sertifikalı, denetlenmiş veya SOC 2 uyumlu olarak tanımlanmaz.",

      "architecture.eyebrow": "Mimari",
      "architecture.title":
        "Next.js frontend, FastAPI backend, iki agent türü için tek evaluator.",
      "aria.architectureRequest": "İstek ve çalıştırma akışı",
      "aria.architectureEval": "Değerlendirme ve sonuç akışı",
      "architecture.group1": "İstek & çalıştırma",
      "architecture.step1": "Browser / Next.js",
      "architecture.step2": "FastAPI API",
      "architecture.step3": "Scenario Runner",
      "architecture.step4": "AgentAdapter",
      "architecture.group2": "Değerlendirme & sonuçlar",
      "architecture.step5": "Demo Agent veya External HTTP Agent",
      "architecture.step6": "Transcript + Tool Event'leri",
      "architecture.step7": "Deterministik Evaluator",
      "architecture.step8": "Run Results + Evidence UI",
      "architecture.note":
        "Mevcut RunStore sınırlı ve in-memory'dir. Henüz kalıcı bir PostgreSQL veya Supabase veritabanı uygulanmamıştır.",

      "decisions.eyebrow": "Teknik Kararlar",
      "decisions.title": "MVP'yi şekillendiren dört karar.",
      "decisions.d1title": "Önce deterministik evaluator",
      "decisions.d1why":
        "Neden: tekrarlanabilir davranış ve MVP çekirdeği için ücretli bir LLM gerekmemesi.",
      "decisions.d2title": "AgentAdapter soyutlaması",
      "decisions.d2why":
        "Neden: aynı senaryo runner'ı ve evaluator, hem yerleşik hem harici hedefleri test edebilir.",
      "decisions.d3title": "Tek bir opak skor yerine kanıt",
      "decisions.d3why":
        "Neden: geliştiricilerin tam olarak neyin başarısız olduğunu bilmesi gerekir.",
      "decisions.d4title":
        "Public external-agent desteğinden önce güvenlik",
      "decisions.d4why":
        "Neden: bir URL-test platformu bir SSRF veya açık proxy riskine dönüşmemelidir.",

      "limits.eyebrow": "Mevcut Sınırlamalar & Sonraki Adımlar",
      "limits.title": "MVP'nin henüz yapmadıkları konusunda şeffaflık.",
      "limits.currentTitle": "Mevcut sınırlamalar",
      "limits.c1": "Sınırlı, in-memory run geçmişi",
      "limits.c2": "Kalıcı persistence yok",
      "limits.c3": "Run / versiyon karşılaştırması yok",
      "limits.c4": "Yalnızca deterministik evaluator kapsamı",
      "limits.c5": "Bazı semantik beklentiler skorlanmamış kalabilir",
      "limits.c6": "Authentication yok",
      "limits.c7": "Billing yok",
      "limits.c8": "Voice-agent testi yok",
      "limits.nextTitle": "Sonraki ürün yönleri",
      "limits.n1": "Kalıcı run geçmişi",
      "limits.n2": "V1'e karşı V2 agent karşılaştırması",
      "limits.n3": "Regression delta raporlaması",
      "limits.n4": "Daha fazla Türkçe senaryo paketi",
      "limits.n5": "Release-readiness raporlaması",

      "owned.eyebrow": "Sahiplendiğim Kısım",
      "owned.title": "Uçtan uca ürün, mimari ve teslimat.",
      "owned.body":
        "Ürün problemini ve MVP kapsamını tanımladım, test workflow'unu ve hata inceleme UX'ini tasarladım, sentetik Türkçe senaryoları yapılandırdım, agent/evaluator mimarisini yönlendirdim, frontend/backend sistemini geliştirip iterasyon yaptım, regression testini kurdum ve ürünü Vercel ve Railway üzerinden yayınladım. Geliştirme süreci, araçsız satır satır yazılmış değil, benim yönlendirdiğim ve gözden geçirdiğim AI destekli bir ürün ve yazılım geliştirme süreciydi.",
      "aria.ownedSkills": "Sahiplenilen alanlar",
      "owned.skill1": "Ürün Düşüncesi",
      "owned.skill2": "AI Agent Evaluation",
      "owned.skill3": "LLM Reliability",
      "owned.skill4": "Teknik Mimari",
      "owned.skill5": "QA",
      "owned.skill6": "Otomasyon",
      "owned.skill7": "Frontend",
      "owned.skill8": "Backend",
      "owned.skill9": "Deployment",
      "owned.skill10": "Güvenlik Düşüncesi",

      "related.eyebrow": "İlgili Projeler",
      "related.title":
        "AI workflow ve evaluation çalışmalarını keşfetmeye devam edin.",
      "related.puzzle": "AI Flow Puzzle",
      "related.puzzleBody":
        "İnteraktif chatbot workflow ve doğrulama demonstrasyonu.",
      "related.chatbot": "AI Chatbot Akış Tasarımı",
      "related.chatbotBody":
        "QA, stabilizasyon ve workflow yeniden yapılandırmayı kapsayan kurumsal conversational-AI kanıtı.",

      "cta.eyebrow": "CV & İletişim",
      "cta.title":
        "AI agent reliability ve ürün mühendisliği mi arıyorsunuz?",
      "cta.body":
        "CV'mi inceleyin veya AI evaluation, agent testing ve full-stack ürün çalışmalarını konuşmak için iletişime geçin.",
    },
  },
};
