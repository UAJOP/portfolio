/**
 * EN/TR dictionaries and applyLanguage().
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 342-1534.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
const i18nTranslations = {
  tr: {
    Home: "Ana Sayfa",
    Works: "Projeler",
    Adventure: "Macera",
    Experience: "Deneyim",
    Certificates: "Sertifikalar",
    About: "Hakkımda",
    Request: "Talep",
    Search: "Ara",
    "Request a Project": "Proje Talebi Gönder",
    "Project request": "Proje talebi",
    "Tell me what you want to build.": "Ne geliştirmek istediğini anlat.",
    "Fill out a short request form for AI workflows, automation, websites, dashboards or software projects. I will review the details and get back to you with the next steps.":
      "AI iş akışları, otomasyon, web siteleri, dashboardlar veya yazılım projeleri için kısa talep formunu doldur. Detayları inceleyip sonraki adımlarla dönüş yapacağım.",
    "How it works": "Nasıl çalışır",
    "Simple request flow.": "Basit talep akışı.",
    "Share the idea": "Fikri paylaş",
    "Describe what you need, your goal, timeline and contact information.":
      "Neye ihtiyacın olduğunu, hedefini, zaman planını ve iletişim bilgilerini anlat.",
    "I review the scope": "Kapsamı incelerim",
    "I check the technical direction, project type and possible next steps.":
      "Teknik yönü, proje türünü ve olası sonraki adımları kontrol ederim.",
    "You get a follow-up": "Geri dönüş alırsınız",
    "After submission, I review your request and follow up using your preferred contact method.":
      "Gönderimden sonra talebinizi inceler ve tercih ettiğiniz iletişim yöntemiyle geri dönüş yaparım.",
    "Good for": "Uygun alanlar",
    "For urgent requests, you can also use the email and LinkedIn buttons after submitting the form.":
      "Acil talepler için formu gönderdikten sonra e-posta ve LinkedIn butonlarını da kullanabilirsin.",
    "Full Name *": "Ad Soyad *",
    "Your name": "Adın soyadın",
    "Email *": "E-posta *",
    "Phone / WhatsApp": "Telefon / WhatsApp",
    "Company / Brand": "Şirket / Marka",
    Optional: "İsteğe bağlı",
    "Project Type *": "Proje Türü *",
    "Select a project type": "Proje türü seç",
    "AI workflow / chatbot flow": "AI workflow / chatbot akışı",
    "Website / portfolio / landing page":
      "Web sitesi / portfolyo / landing page",
    "Automation / n8n-style workflow": "Otomasyon / n8n tarzı iş akışı",
    "Dashboard / data analysis": "Dashboard / veri analizi",
    "Mobile / game prototype": "Mobil / oyun prototipi",
    "Other software request": "Diğer yazılım talebi",
    "Estimated Budget": "Tahmini Bütçe",
    "Not sure yet": "Henüz emin değilim",
    "Small scope": "Küçük kapsam",
    "Medium scope": "Orta kapsam",
    "Large scope": "Büyük kapsam",
    "Need consultation": "Danışmamız gerekiyor",
    Timeline: "Zaman Planı",
    Flexible: "Esnek",
    "1-2 weeks": "1-2 hafta",
    "1 month": "1 ay",
    "Long-term collaboration": "Uzun vadeli iş birliği",
    "Preferred Contact": "Tercih Edilen İletişim",
    "Project Details *": "Proje Detayları *",
    "What do you want to build? What problem should it solve?":
      "Ne geliştirmek istiyorsun? Hangi problemi çözmeli?",
    "I agree that this information can be used to contact me about my request.":
      "Bu bilgilerin talebim hakkında benimle iletişime geçmek için kullanılmasını kabul ediyorum.",
    "Send Request": "Talebi Gönder",
    "Email Instead": "E-posta ile Gönder",

    "View Resume": "CV'yi Görüntüle",
    "AI Designer & Software Developer": "AI Designer & Software Developer",
    "I design conversational AI workflows and build software products that turn":
      "Conversational AI iş akışları tasarlıyor ve",
    "complex needs into practical systems.":
      "karmaşık ihtiyaçları pratik sistemlere dönüştüren yazılım ürünleri geliştiriyorum.",
    "My work connects conversational AI, solution engineering, LLM evaluation, workflow automation and user-centered software development. I focus on building clear, practical and maintainable digital systems.":
      "Çalışmalarım conversational AI, solution engineering, LLM değerlendirme, workflow otomasyonu ve kullanıcı odaklı yazılım geliştirmeyi bir araya getiriyor. Net, pratik ve sürdürülebilir dijital sistemler geliştirmeye odaklanıyorum.",
    "Academic, personal, freelance & team projects":
      "Akademik, kişisel, freelance ve ekip projeleri",
    "Conversational AI": "Conversational AI",
    "Chatbot flows and enterprise AI workflows":
      "Chatbot akışları ve kurumsal AI iş akışları",
    "LLM Evaluation": "LLM Değerlendirme",
    "Response, reasoning, code and multimodal assessment":
      "Yanıt, akıl yürütme, kod ve multimodal değerlendirme",
    "Workflow Automation": "Workflow Otomasyonu",
    "Multi-step logic, integrations and operational flows":
      "Çok adımlı mantık, entegrasyonlar ve operasyonel akışlar",
    "Software Products": "Yazılım Ürünleri",
    "Web, desktop, mobile and database-backed applications":
      "Web, masaüstü, mobil ve veritabanı destekli uygulamalar",
    "Conversational AI & Flow Design": "Conversational AI & Akış Tasarımı",
    "Chatbot flows, intent and response logic, QA, fallback paths, IVR and multi-channel interaction design.":
      "Chatbot akışları, intent ve yanıt mantığı, QA, fallback yolları, IVR ve çok kanallı etkileşim tasarımı.",
    "Multi-step business logic, forms, integrations, notifications, data collection and operational workflows.":
      "Çok adımlı iş mantığı, formlar, entegrasyonlar, bildirimler, veri toplama ve operasyonel iş akışları.",
    "Digital Product & User Experience": "Dijital Ürün & Kullanıcı Deneyimi",
    "Responsive interfaces, reservation journeys and user-centered products shaped around real operational needs.":
      "Gerçek operasyonel ihtiyaçlara göre şekillenen responsive arayüzler, rezervasyon yolculukları ve kullanıcı odaklı ürünler.",
    "Digital Product & UX": "Dijital Ürün & UX",
    "Customer-facing interfaces, reservation journeys, product flows and practical user experience improvements.":
      "Müşteriye dönük arayüzler, rezervasyon yolculukları, ürün akışları ve pratik kullanıcı deneyimi geliştirmeleri.",
    "Building the studio’s website, reservation journey, automation workflows and digital product experience.":
      "Stüdyonun web sitesini, rezervasyon yolculuğunu, otomasyon akışlarını ve dijital ürün deneyimini geliştiriyorum.",
    "Contributed to enterprise chatbot QA, flow restructuring, multi-channel automation and an insurance claims intake POC.":
      "Kurumsal chatbot QA, akış yeniden yapılandırma, çok kanallı otomasyon ve sigorta hasar başvuru POC çalışmalarına katkı sağladım.",
    "Evaluated LLM responses, reasoning, code and multimodal outputs through structured quality-assessment tasks.":
      "Yapılandırılmış kalite değerlendirme görevleriyle LLM yanıtlarını, akıl yürütmeyi, kod ve multimodal çıktıları değerlendirdim.",
    "Atölye Joyday – Co-Founder & Digital Product Developer":
      "Atölye Joyday – Kurucu Ortak & Dijital Ürün Geliştirici",
    "A recruiter-focused case study covering enterprise chatbot QA, stabilization, flow restructuring and multi-channel workflow logic.":
      "Kurumsal chatbot QA, stabilizasyon, akış yeniden yapılandırma ve çok kanallı workflow mantığını kapsayan recruiter odaklı case study.",
    "A live n8n-inspired browser game demonstrating chatbot flow structure, fallback logic, validation and user journey thinking.":
      "Chatbot akış yapısı, fallback mantığı, doğrulama ve kullanıcı yolculuğu düşüncesini gösteren canlı, n8n ilhamlı tarayıcı oyunu.",
    "Play Live": "Canlı Oyna",
    "A live customer-facing website with package-based reservation journeys, application forms and operational automation.":
      "Paket bazlı rezervasyon yolculukları, başvuru formları ve operasyonel otomasyon içeren canlı, müşteriye dönük web sitesi.",
    "A database-backed desktop appointment automation system with multi-form workflows and operational logic.":
      "Çok formlu iş akışları ve operasyonel mantık içeren veritabanı destekli masaüstü randevu otomasyon sistemi.",
    "A database-backed C# Windows Forms project demonstrating patient, doctor, secretary and appointment workflows.":
      "Hasta, doktor, sekreter ve randevu iş akışlarını gösteren veritabanı destekli C# Windows Forms projesi.",
    "View Source Archive": "Kaynak Arşivini Gör",
    "Desktop Application": "Masaüstü Uygulama",
    "Source Archive": "Kaynak Arşivi",
    "A Python-based analysis project focused on processing, exploring and presenting insights from automotive data.":
      "Otomotiv verilerini işleme, keşfetme ve içgörüleri sunmaya odaklanan Python tabanlı analiz projesi.",
    "Co-Founder & Digital Product Developer":
      "Kurucu Ortak & Dijital Ürün Geliştirici",
    "AI Training Specialist — Freelance / Project-Based":
      "AI Eğitim Uzmanı — Freelance / Proje Bazlı",
    "Software Development Intern": "Yazılım Geliştirme Stajyeri",
    "Event Operations Supervisor — Part-Time":
      "Etkinlik Operasyonları Süpervizörü — Yarı Zamanlı",
    "Event Operations Specialist — Part-Time":
      "Etkinlik Operasyonları Uzmanı — Yarı Zamanlı",
    "Co-founded a creative workshop studio and developed its digital product and operational experience. Built the responsive website, package-based reservation journey, application forms and automated notification workflows using HTML, CSS, JavaScript, Google Forms, Google Sheets and Apps Script.":
      "Yaratıcı bir workshop stüdyosunun kurucu ortağı oldum ve dijital ürün ile operasyon deneyimini geliştirdim. HTML, CSS, JavaScript, Google Forms, Google Sheets ve Apps Script kullanarak responsive web sitesini, paket bazlı rezervasyon yolculuğunu, başvuru formlarını ve otomatik bildirim akışlarını oluşturdum.",
    "Worked on enterprise conversational AI projects across banking, insurance, municipal services and employee benefits. Contributed to live-chat QA, chatbot stabilization, channel configuration, large-scale flow restructuring and multi-channel automation processes. Designed, built, tested and presented an insurance claims intake POC involving voice interaction, phone verification, WhatsApp handoff, photo and document collection, and workflow coordination.":
      "Bankacılık, sigorta, belediye hizmetleri ve çalışan yan hakları alanlarındaki kurumsal conversational AI projelerinde çalıştım. Live-chat QA, chatbot stabilizasyonu, kanal yapılandırması, büyük ölçekli akış yeniden yapılandırma ve çok kanallı otomasyon süreçlerine katkı sağladım. Sesli etkileşim, telefon doğrulama, WhatsApp aktarımı, fotoğraf ve belge toplama ile workflow koordinasyonu içeren bir sigorta hasar başvuru POC’sini tasarladım, geliştirdim, test ettim ve sundum.",
    "Evaluated LLM responses, reasoning, code outputs and multimodal interactions through structured AI training and quality-assessment tasks, focusing on correctness, clarity, instruction following and user relevance.":
      "Yapılandırılmış AI eğitim ve kalite değerlendirme görevleriyle LLM yanıtlarını, akıl yürütmeyi, kod çıktılarını ve multimodal etkileşimleri; doğruluk, açıklık, talimat takibi ve kullanıcıya uygunluk açısından değerlendirdim.",
    "Developed a web-based event-management dashboard using PHP, JavaScript, HTML, CSS and MySQL. Built a database-backed interface for event creation, editing, tracking and reporting during a software development internship.":
      "Yazılım geliştirme stajı sırasında PHP, JavaScript, HTML, CSS ve MySQL kullanarak web tabanlı bir etkinlik yönetim paneli geliştirdim; etkinlik oluşturma, düzenleme, takip ve raporlama için veritabanı destekli bir arayüz oluşturdum.",
    "Coordinated on-site event operations, team supervision, logistics, customer experience and time-sensitive execution for congresses, seminars, corporate meetings and product launches.":
      "Kongre, seminer, kurumsal toplantı ve ürün lansmanlarında saha operasyonları, ekip yönetimi, lojistik, müşteri deneyimi ve zaman kritik uygulama süreçlerini koordine ettim.",
    "Supported event logistics, on-site coordination, task distribution and team supervision in fast-paced corporate event environments.":
      "Hızlı tempolu kurumsal etkinlik ortamlarında lojistik, saha koordinasyonu, görev dağılımı ve ekip yönetimini destekledim.",
    "Activities & Industry Events": "Aktiviteler & Sektör Etkinlikleri",
    "Additional learning, competition and community experience.":
      "Ek öğrenme, yarışma ve topluluk deneyimi.",
    "These activities support my technical development but are separate from the professional experience timeline.":
      "Bu aktiviteler teknik gelişimimi destekliyor ancak profesyonel deneyim zaman çizelgesinden ayrı tutuluyor.",
    "Led a four-person team during a 24-hour competition, supporting game mechanics, Git workflows and rapid Unreal Engine prototyping. The team placed 4th among 15 teams.":
      "24 saatlik yarışmada dört kişilik ekibe liderlik ettim; oyun mekanikleri, Git iş akışları ve hızlı Unreal Engine prototiplemesini destekledim. Ekip 15 takım arasında 4. oldu.",
    "Attended game-industry sessions focused on development tools, game economy and studio operations, expanding practical industry awareness and professional connections.":
      "Geliştirme araçları, oyun ekonomisi ve stüdyo operasyonlarına odaklanan sektör oturumlarına katılarak pratik sektör farkındalığımı ve profesyonel bağlantılarımı geliştirdim.",
    "Building practical AI workflows and user-centered software products.":
      "Pratik AI iş akışları ve kullanıcı odaklı yazılım ürünleri geliştiriyorum.",
    "I am an AI Designer and Software Developer focused on conversational AI, workflow automation, LLM evaluation and user-centered software products. My background combines software development with AI flow design, product thinking and practical digital operations.":
      "Conversational AI, workflow otomasyonu, LLM değerlendirme ve kullanıcı odaklı yazılım ürünlerine odaklanan bir AI Designer ve Software Developer’ım. Yazılım geliştirme altyapımı AI akış tasarımı, ürün düşüncesi ve pratik dijital operasyon deneyimiyle birleştiriyorum.",
    "At CBOT, I worked on enterprise conversational AI projects involving chatbot QA, flow restructuring, multi-channel automation and an insurance claims intake POC. My work included testing, stabilization, channel configuration, voice and WhatsApp transitions, document collection and multi-step workflow logic.":
      "CBOT’ta chatbot QA, akış yeniden yapılandırma, çok kanallı otomasyon ve sigorta hasar başvuru POC’si içeren kurumsal conversational AI projelerinde çalıştım. Çalışmalarım test, stabilizasyon, kanal yapılandırması, ses ve WhatsApp geçişleri, belge toplama ve çok adımlı workflow mantığını kapsadı.",
    "Through project-based AI training work, I evaluated LLM responses, reasoning, code and multimodal outputs. As a co-founder of Atölye Joyday, I also built a live website, package-based reservation journey and automated operational workflows for a real customer-facing business.":
      "Proje bazlı AI eğitim çalışmalarında LLM yanıtlarını, akıl yürütmeyi, kod ve multimodal çıktıları değerlendirdim. Atölye Joyday’in kurucu ortağı olarak gerçek müşterilere hizmet veren bir işletme için canlı web sitesi, paket bazlı rezervasyon yolculuğu ve otomatik operasyon akışları geliştirdim.",
    "I am currently interested in AI Designer, Conversational AI, Solution Engineering, LLM Evaluation, Workflow Automation and software development opportunities.":
      "AI Designer, Conversational AI, Solution Engineering, LLM Evaluation, Workflow Automation ve yazılım geliştirme fırsatlarıyla ilgileniyorum.",
    "Event operations foundations": "Etkinlik operasyonları temeli",
    "Built practical experience in logistics, on-site coordination, team supervision and time-sensitive execution.":
      "Lojistik, saha koordinasyonu, ekip yönetimi ve zaman kritik uygulama süreçlerinde pratik deneyim kazandım.",
    "Digital product ownership": "Dijital ürün sahipliği",
    "Co-founded Atölye Joyday and built its website, reservation journey and operational automation workflows.":
      "Atölye Joyday’in kurucu ortağı oldum; web sitesini, rezervasyon yolculuğunu ve operasyonel otomasyon akışlarını geliştirdim.",
    "Digital Products & Additional Capabilities":
      "Dijital Ürünler & Ek Yetkinlikler",
    "Responsive websites and user journeys":
      "Responsive web siteleri ve kullanıcı yolculukları",
    "Reservation and application workflows": "Rezervasyon ve başvuru akışları",
    "Interactive web and game prototypes":
      "İnteraktif web ve oyun prototipleri",
    "View Projects": "Projeleri Gör",
    "Contact Me": "İletişime Geç",
    "Open GitHub": "GitHub'da Aç",
    "Open Website": "Siteyi Aç",
    "View Experience": "Deneyimi Gör",
    "View Details": "Detayları Gör",
    "Online Form": "Online Form",
    "If you prefer Google Forms, you can use the Online Form option as an alternative.":
      "Google Forms üzerinden doldurmayı tercih edersen alternatif olarak Online Form seçeneğini kullanabilirsin.",
    "Project Detail": "Proje Detayı",
    "Loading project...": "Proje yükleniyor...",
    "Please wait while the selected project details are prepared.":
      "Seçilen proje detayları hazırlanırken lütfen bekle.",
    "See Experience": "Deneyimi Gör",
    "View All Works": "Tüm Projeleri Gör",
    "Send Email": "E-posta Gönder",
    LinkedIn: "LinkedIn",
    Contact: "İletişim",
    "Get in Touch": "İletişime Geç",
    "Company Website": "Şirket Sitesi",
    "Event Page": "Etkinlik Sayfası",
    "Event Website": "Etkinlik Sitesi",
    "AI Designer & Software Developer building practical AI workflows and scalable software systems.":
      "Pratik AI iş akışları ve ölçeklenebilir yazılım sistemleri geliştiren AI Designer & Software Developer.",
    "Kaan Balcı. All rights reserved.": "Kaan Balcı. Tüm hakları saklıdır.",
    "AI Designer • Software Developer • Automation Builder":
      "AI Designer • Software Developer • Otomasyon Geliştirici",
    "I design AI workflows and build software products that turn ideas into":
      "AI iş akışları tasarlıyor ve fikirleri",
    "scalable systems.":
      "ölçeklenebilir sistemlere dönüştüren yazılım ürünleri geliştiriyorum.",
    "I am a result-oriented AI Designer and Software Developer with hands-on experience across AI, automation, backend systems, responsive web/mobile development, and game development. I focus on practical AI workflows, chatbot logic, clean software architecture, and product-oriented solutions.":
      "AI, otomasyon, backend sistemleri, responsive web/mobil geliştirme ve oyun geliştirme alanlarında uygulamalı deneyime sahip, sonuç odaklı bir AI Designer ve Software Developer'ım. Pratik AI iş akışları, chatbot mantığı, temiz yazılım mimarisi ve ürün odaklı çözümler üzerine çalışıyorum.",
    "Available for AI & Software roles": "AI & Software rolleri için uygun",
    "Istanbul / Remote": "İstanbul / Remote",
    Projects: "Proje",
    "CBOT AI Designer experience": "CBOT AI Designer deneyimi",
    "Chatbot, IVR and automation workflows":
      "Chatbot, IVR ve otomasyon iş akışları",
    "Web, backend, mobile and game systems":
      "Web, backend, mobil ve oyun sistemleri",
    "What I do": "Neler yapıyorum",
    "From AI workflows to working software.":
      "AI iş akışlarından çalışan yazılım ürünlerine.",
    "I combine software logic, automation thinking, and practical AI experience to design systems that are clear, usable, and maintainable.":
      "Net, kullanılabilir ve sürdürülebilir sistemler tasarlamak için yazılım mantığını, otomasyon bakış açısını ve pratik AI deneyimini birleştiriyorum.",
    "AI Workflow Design": "AI İş Akışı Tasarımı",
    "Chatbot flows, prompt logic, response quality evaluation, IVR and multi-channel automation design.":
      "Chatbot akışları, prompt mantığı, yanıt kalitesi değerlendirmesi, IVR ve çok kanallı otomasyon tasarımı.",
    "Software Development": "Yazılım Geliştirme",
    "Backend logic, C#/.NET automation, Python workflows, PHP/MySQL systems and clean web interfaces.":
      "Backend mantığı, C#/.NET otomasyonları, Python iş akışları, PHP/MySQL sistemleri ve temiz web arayüzleri.",
    "Web & Mobile Products": "Web & Mobil Ürünler",
    "Responsive websites, reservation flows, Android apps, data collection systems and product interfaces.":
      "Responsive web siteleri, rezervasyon akışları, Android uygulamaları, veri toplama sistemleri ve ürün arayüzleri.",
    "Game Development": "Oyun Geliştirme",
    "Unity and Unreal Engine projects using C#, C++, Blueprints, gameplay systems and OOP principles.":
      "C#, C++, Blueprints, gameplay sistemleri ve OOP prensipleriyle Unity ve Unreal Engine projeleri.",
    "Recent experience": "Son deneyimler",
    "AI, automation and product-focused work.":
      "AI, otomasyon ve ürün odaklı çalışmalar.",
    "My recent work is centered around AI-powered chatbot systems, LLM evaluation, automation flows, and real business websites.":
      "Son çalışmalarım AI destekli chatbot sistemleri, LLM değerlendirme, otomasyon akışları ve gerçek işletme web siteleri üzerine yoğunlaşıyor.",
    "Contributed to enterprise chatbot QA, flow restructuring, multi-channel automation and an insurance claims intake POC.":
      "Kurumsal chatbot QA, akış yeniden yapılandırma, çok kanallı otomasyon ve sigorta hasar başvuru POC çalışmalarına katkı sağladım.",
    "Evaluated LLM responses, reasoning, code and multimodal outputs through structured quality-assessment tasks.":
      "Yapılandırılmış kalite değerlendirme görevleriyle LLM yanıtlarını, akıl yürütmeyi, kod ve multimodal çıktıları değerlendirdim.",
    "Built the studio website and digital reservation workflow for package selection and customer tracking.":
      "Paket seçimi ve müşteri takibi için stüdyo web sitesini ve dijital rezervasyon akışını geliştirdim.",
    "Featured works": "Öne çıkan projeler",
    "Selected projects with real product value.":
      "Gerçek ürün değeri taşıyan seçili projeler.",
    "A focused selection of AI, web, data, mobile and game projects that best represent my technical direction.":
      "Teknik yönümü en iyi temsil eden AI, web, veri, mobil ve oyun projelerinden seçilmiş odaklı bir liste.",
    "Mobile Game": "Mobil Oyun",
    "A hyper-casual 3D mobile driving simulation game focused on score, reflexes and obstacle navigation.":
      "Skor, refleks ve engellerden kaçınma üzerine kurulu hyper-casual 3D mobil sürüş simülasyonu.",
    "A Windows Forms hospital appointment automation system with a complex multi-form structure.":
      "Karmaşık çok formlu yapıya sahip Windows Forms hastane randevu otomasyon sistemi.",
    "Cars Dataset Analysis": "Cars Veri Seti Analizi",
    "A Python-based data analysis project exploring insights from the Cars dataset.":
      "Cars veri setinden içgörüler çıkarmaya odaklanan Python tabanlı veri analizi projesi.",
    "Let’s build something useful": "Gel işe yarar bir şey geliştirelim",
    "Looking for an AI Designer or Software Developer?":
      "AI Designer veya Software Developer mı arıyorsunuz?",
    "I can contribute to AI workflow design, chatbot systems, automation logic, web products, backend tools and software development teams.":
      "AI iş akışı tasarımı, chatbot sistemleri, otomasyon mantığı, web ürünleri, backend araçları ve yazılım geliştirme ekiplerine katkı sağlayabilirim.",
    Portfolio: "Portfolyo",
    "Works that show my range across AI, software and games.":
      "AI, yazılım ve oyun alanlarındaki genişliğimi gösteren projeler.",
    "A curated project catalog designed for recruiters and technical teams to quickly understand what I build, which technologies I use, and how each project fits into my long-term direction.":
      "Recruiter'ların ve teknik ekiplerin ne geliştirdiğimi, hangi teknolojileri kullandığımı ve projelerin uzun vadeli yönüme nasıl oturduğunu hızlıca anlaması için hazırlanmış seçili proje kataloğu.",
    All: "Tümü",
    "AI & Automation": "AI & Otomasyon",
    Web: "Web",
    Game: "Oyun",
    Mobile: "Mobil",
    "Data / Backend": "Veri / Backend",
    "AI Chatbot Flow Design": "AI Chatbot Akış Tasarımı",
    "Enterprise conversational AI experience covering chatbot QA, stabilization, flow restructuring and multi-channel workflow logic.":
      "Chatbot QA, stabilizasyon, akış yeniden yapılandırma ve çok kanallı workflow mantığını kapsayan kurumsal conversational AI deneyimi.",

    "Business website and digital reservation workflow for package selection, customer data collection and operational tracking.":
      "Paket seçimi, müşteri veri toplama ve operasyon takibi için işletme web sitesi ve dijital rezervasyon akışı.",
    "A hyper-casual 3D mobile driving simulation game focused on obstacle avoidance, score and reflex-based gameplay.":
      "Engellerden kaçınma, skor ve refleks odaklı oynanışa sahip hyper-casual 3D mobil sürüş simülasyonu.",
    "A 2D physics-based projectile game inspired by precision aiming, tower destruction and strategic shots.":
      "Hassas nişan alma, kule yıkımı ve stratejik atışlardan ilham alan 2D fizik tabanlı fırlatma oyunu.",
    "A Unity learning project containing multiple scenes, each focused on different gameplay fundamentals and mechanics.":
      "Her biri farklı gameplay temellerine ve mekaniklere odaklanan çok sahneli Unity öğrenme projesi.",
    "A third-person action shooter prototype with enemy AI, health management and combat-focused gameplay systems.":
      "Düşman AI, sağlık yönetimi ve savaş odaklı gameplay sistemleri içeren üçüncü şahıs aksiyon shooter prototipi.",
    "A third-person tank combat game prototype built with Unreal Engine, Blueprints, C++ and physics-based gameplay.":
      "Unreal Engine, Blueprints, C++ ve fizik tabanlı gameplay ile geliştirilen üçüncü şahıs tank savaş oyunu prototipi.",
    "A comprehensive appointment automation system written in C# with MSSQL and a complex multi-form structure.":
      "C# ve MSSQL ile geliştirilmiş, karmaşık çok formlu yapıya sahip kapsamlı randevu otomasyon sistemi.",
    "A Python-based dataset analysis project built to explore, process and present insights from automotive data.":
      "Otomotiv verilerini keşfetmek, işlemek ve içgörü sunmak için geliştirilmiş Python tabanlı veri analizi projesi.",
    "A JavaScript weather application that fetches forecast data and presents location-based weather information.":
      "Hava durumu verilerini çeken ve konuma göre hava bilgisi sunan JavaScript uygulaması.",
    "More code": "Daha fazla kod",
    "Want to inspect the full repository list?":
      "Tüm repository listesini incelemek ister misin?",
    "My GitHub contains additional learning projects, school projects, experiments and archived builds.":
      "GitHub hesabımda ek öğrenme projeleri, okul projeleri, deneyler ve arşivlenmiş çalışmalar bulunuyor.",
    "Professional timeline shaped by AI, software, operations and product thinking.":
      "AI, yazılım, operasyon ve ürün düşüncesiyle şekillenen profesyonel zaman çizelgesi.",
    "I have worked across AI workflows, software development, event operations and entrepreneurship. This combination helps me understand both technical systems and real business processes.":
      "AI iş akışları, yazılım geliştirme, etkinlik operasyonları ve girişimcilik alanlarında çalıştım. Bu kombinasyon hem teknik sistemleri hem de gerçek iş süreçlerini anlamamı sağlıyor.",
    "Core direction": "Ana yönelim",
    "My current career direction is AI Designer / Software Developer roles where I can design chatbot systems, automate workflows, evaluate LLM quality, and build useful software products.":
      "Güncel kariyer yönelimim; chatbot sistemleri tasarlayabileceğim, iş akışlarını otomatikleştirebileceğim, LLM kalitesini değerlendirebileceğim ve faydalı yazılım ürünleri geliştirebileceğim AI Designer / Software Developer rolleri.",
    "Istanbul | Sep 2025 – Oct 2025": "İstanbul | Eyl 2025 – Eki 2025",

    "n8n-based Logic": "n8n Tabanlı Mantık",
    "Enterprise Chatbots": "Kurumsal Chatbotlar",
    "Remote | Apr 2025 – Aug 2025": "Remote | Nis 2025 – Ağu 2025",
    "Evaluated and improved AI-generated responses, voice interactions, prompts, and code outputs for modern LLM workflows. Focused on response quality assessment, reasoning accuracy, multimodal interaction review, and code output validation.":
      "Modern LLM iş akışları için AI tarafından üretilen yanıtları, sesli etkileşimleri, promptları ve kod çıktılarını değerlendirdim ve iyileştirdim. Yanıt kalitesi, akıl yürütme doğruluğu, multimodal etkileşim ve kod çıktısı doğrulamasına odaklandım.",
    "Prompt Review": "Prompt İnceleme",
    "Code QA": "Kod QA",
    "AI Quality": "AI Kalitesi",
    "Istanbul | 2026 – Present": "İstanbul | 2026 – Günümüz",
    "Co-founded a creative workshop studio offering action painting, creative drama, workshops, and private event experiences. Designed and developed the official website using HTML, CSS, JavaScript, and responsive web design principles while building a digital reservation workflow for package selection, customer data collection, and operational tracking.":
      "Action painting, yaratıcı drama, workshoplar ve özel etkinlik deneyimleri sunan yaratıcı atölyenin kurucu ortaklarından biri oldum. HTML, CSS, JavaScript ve responsive web tasarım prensipleriyle resmi web sitesini tasarlayıp geliştirdim; paket seçimi, müşteri veri toplama ve operasyon takibi için dijital rezervasyon akışı kurdum.",
    Entrepreneurship: "Girişimcilik",
    Website: "Web Sitesi",
    "Reservation Flow": "Rezervasyon Akışı",
    Operations: "Operasyon",
    Database: "Veritabanı",
    "Izmir | Jul 2024 – Sep 2024": "İzmir | Tem 2024 – Eyl 2024",
    "Built a web-based event tracking dashboard using PHP, JavaScript, HTML, CSS, and MySQL. Applied academic knowledge in a real-world context and gained hands-on experience in full-stack development and database management.":
      "PHP, JavaScript, HTML, CSS ve MySQL kullanarak web tabanlı etkinlik takip dashboard'u geliştirdim. Akademik bilgimi gerçek iş ortamında uyguladım; full-stack geliştirme ve veritabanı yönetiminde uygulamalı deneyim kazandım.",
    "Punto Organization – Event Operations Supervisor":
      "Punto Organization – Event Operations Supervisor",
    Leadership: "Liderlik",
    "Client Management": "Müşteri Yönetimi",
    "Istanbul | Jan 2020 – Jun 2022": "İstanbul | Oca 2020 – Haz 2022",
    "Web Content": "Web İçeriği",
    "Team Management": "Ekip Yönetimi",
    "Izmir University of Economics | Dec 2023":
      "İzmir Ekonomi Üniversitesi | Ara 2023",
    "Gameathon – Game Development Hackathon":
      "Gameathon – Oyun Geliştirme Hackathon'u",
    "Led a team during a 24-hour game development competition. Focused on game logic, design, and presentation using visual scripting tools. Ranked 4th out of 15 teams.":
      "24 saatlik oyun geliştirme yarışmasında ekibe liderlik ettim. Görsel scripting araçlarıyla oyun mantığı, tasarım ve sunuma odaklandım. 15 takım arasında 4. olduk.",
    "Game Design": "Oyun Tasarımı",
    "Team Lead": "Takım Liderliği",
    "Izmir – May 2022 | Istanbul – Sep 2022":
      "İzmir – May 2022 | İstanbul – Eyl 2022",
    "Mobidictum Conference": "Mobidictum Konferansı",
    "Participated in Turkey’s leading game development conferences, attended sessions on game economy, development tools, and studio management, and expanded my professional network in the game industry.":
      "Türkiye'nin önde gelen oyun geliştirme konferanslarına katıldım; oyun ekonomisi, geliştirme araçları ve stüdyo yönetimi oturumlarını takip ederek oyun sektöründeki profesyonel ağımı genişlettim.",
    "Game Industry": "Oyun Sektörü",
    Networking: "Network",
    Conference: "Konferans",
    "Software logic, AI workflows and product thinking in one profile.":
      "Yazılım mantığı, AI iş akışları ve ürün düşüncesi tek profilde.",
    "I am building a career at the intersection of artificial intelligence, automation and software development. My strength is combining technical execution with practical business understanding.":
      "Yapay zeka, otomasyon ve yazılım geliştirmenin kesişiminde bir kariyer inşa ediyorum. Güçlü tarafım teknik uygulamayı pratik iş anlayışıyla birleştirmek.",
    "AI Designer & Software Developer": "AI Designer & Software Developer",
    "Istanbul / Turkey": "İstanbul / Türkiye",
    "Professional profile": "Profesyonel profil",
    "Result-oriented developer focused on intelligent and scalable systems.":
      "Akıllı ve ölçeklenebilir sistemlere odaklanan sonuç odaklı geliştirici.",
    "My long-term goal is to build intelligent, scalable and impactful products that combine strong software architecture with practical AI capabilities.":
      "Uzun vadeli hedefim güçlü yazılım mimarisini pratik AI yetenekleriyle birleştiren akıllı, ölçeklenebilir ve etkili ürünler geliştirmek.",
    "Email Me": "E-posta Gönder",
    "Capability map": "Yetkinlik haritası",
    "The areas I can contribute to.": "Katkı sağlayabileceğim alanlar.",
    "I can work across product logic, automation design, backend implementation, web interfaces and AI quality workflows.":
      "Ürün mantığı, otomasyon tasarımı, backend geliştirme, web arayüzleri ve AI kalite iş akışlarında çalışabilirim.",
    "Chatbot flow design": "Chatbot akışı tasarımı",
    "n8n-based automation logic": "n8n tabanlı otomasyon mantığı",
    "LLM response evaluation": "LLM yanıt değerlendirmesi",
    "Prompt and code output review": "Prompt ve kod çıktısı inceleme",
    "IVR and multi-channel flow awareness":
      "IVR ve çok kanallı akış farkındalığı",
    "Python data analysis and automation": "Python veri analizi ve otomasyon",
    "C#/.NET Windows Forms systems": "C#/.NET Windows Forms sistemleri",
    "PHP and MySQL web systems": "PHP ve MySQL web sistemleri",
    "JavaScript interfaces": "JavaScript arayüzleri",
    "Database design and dashboards": "Veritabanı tasarımı ve dashboardlar",
    "Web, Mobile & Games": "Web, Mobil & Oyun",
    "Responsive websites": "Responsive web siteleri",
    "Android apps with Java/Kotlin": "Java/Kotlin ile Android uygulamaları",
    "Unity development with C#": "C# ile Unity geliştirme",
    "Unreal Engine with C++ and Blueprints":
      "C++ ve Blueprints ile Unreal Engine",
    "Product-oriented project presentation": "Ürün odaklı proje sunumu",
    "How I work": "Nasıl çalışıyorum",
    "I prefer clear requirements, testable logic and usable output.":
      "Net gereksinimler, test edilebilir mantık ve kullanılabilir çıktı tercih ederim.",
    "Whether it is a chatbot flow, a dashboard, a website or a game mechanic, my process is to understand the user, structure the logic, build the system and refine it through testing.":
      "İster chatbot akışı, ister dashboard, ister web sitesi ya da oyun mekaniği olsun; sürecim kullanıcıyı anlamak, mantığı yapılandırmak, sistemi kurmak ve testlerle geliştirmek üzerine kurulu.",
    "Understand the goal": "Hedefi anla",
    "Clarify the user need, business requirement, data source and expected result.":
      "Kullanıcı ihtiyacını, iş gereksinimini, veri kaynağını ve beklenen sonucu netleştir.",
    "Design the logic": "Mantığı tasarla",
    "Map the flow, system structure, edge cases and core interaction path.":
      "Akışı, sistem yapısını, edge case'leri ve temel etkileşim yolunu haritala.",
    "Build and improve": "Geliştir ve iyileştir",
    "Implement, test, refine and keep the output maintainable for real usage.":
      "Uygula, test et, iyileştir ve çıktıyı gerçek kullanım için sürdürülebilir tut.",
    Toolbox: "Araç Kutusu",
    "Technologies I use.": "Kullandığım teknolojiler.",
    Languages: "Diller",
    "Python, C#, JavaScript, PHP, Java, Kotlin, C++":
      "Python, C#, JavaScript, PHP, Java, Kotlin, C++",
    "ChatGPT, Gemini, LLaMA, Claude, Grok, n8n, AI Flow, prompt evaluation":
      "ChatGPT, Gemini, LLaMA, Claude, Grok, n8n, AI Flow, prompt değerlendirme",
    Databases: "Veritabanları",
    "MySQL, MSSQL, SQLite, Firebase, Google Sheets workflows":
      "MySQL, MSSQL, SQLite, Firebase, Google Sheets iş akışları",
    "Game Engines": "Oyun Motorları",
    "Unity, Unreal Engine, Blueprints, OOP, gameplay logic":
      "Unity, Unreal Engine, Blueprints, OOP, gameplay mantığı",
    "Continuous learning across software, game development and networking.":
      "Yazılım, oyun geliştirme ve networking alanlarında sürekli öğrenme.",
    "A cleaner certificate gallery grouped into modern cards. Click any certificate to preview it in a larger view.":
      "Modern kartlara ayrılmış daha temiz bir sertifika galerisi. Herhangi bir sertifikaya tıklayarak büyük önizleme açabilirsin.",
    "Web Design": "Web Tasarım",
    "Linux Essentials": "Linux Essentials",
    "Network Essentials": "Network Essentials",
    "Packet Tracer": "Packet Tracer",
  },
};

Object.assign(i18nTranslations.tr, {
  "Available for roles": "Roller için uygun",
  "Recruiter Mode": "İK Modu",
  "Milestone journey": "Dönüm noktaları",
  "From operations to AI-driven software products.":
    "Operasyondan AI odaklı yazılım ürünlerine.",
  "My background combines field operations, software projects, AI workflow design and real business product experience.":
    "Geçmişim saha operasyonları, yazılım projeleri, AI iş akışı tasarımı ve gerçek işletme ürün deneyimini birleştiriyor.",
  "Worked on event operations, team coordination and digital content responsibilities.":
    "Etkinlik operasyonları, ekip koordinasyonu ve dijital içerik sorumlulukları üzerinde çalıştım.",
  "Software foundations": "Yazılım temelleri",
  "Built university and personal projects across Java, Python, web interfaces and databases.":
    "Java, Python, web arayüzleri ve veritabanları alanlarında üniversite ve kişisel projeler geliştirdim.",
  "Backend, data and game systems": "Backend, veri ve oyun sistemleri",
  "Focused on C#, MSSQL, Python data analysis and Unreal Engine / Unity prototypes.":
    "C#, MSSQL, Python veri analizi ve Unreal Engine / Unity prototiplerine odaklandım.",
  "AI Designer direction": "AI Designer yönelimi",
  "Worked on chatbot flows, AI Flow logic, IVR awareness and LLM response quality evaluation.":
    "Chatbot akışları, AI Flow mantığı, IVR farkındalığı ve LLM yanıt kalitesi değerlendirmesi üzerinde çalıştım.",
  "Real product ownership": "Gerçek ürün sahipliği",
  "Built Atölye Joyday web and reservation workflows while shaping a stronger AI portfolio.":
    "Daha güçlü bir AI portföyü oluştururken Atölye Joyday web ve rezervasyon akışlarını geliştirdim.",
  "This route is not deployed yet.": "Bu rota henüz yayında değil.",
  "The page you are looking for may have moved, but the portfolio is still online. Use the shortcuts below or ask Ajoop.":
    "Aradığın sayfa taşınmış olabilir ama portfolyo hâlâ yayında. Aşağıdaki kısayolları kullanabilir veya Ajoop'a sorabilirsin.",
  "Go Home": "Ana Sayfaya Git",
  "View Works": "Projeleri Gör",
  "Ask Ajoop": "Ajoop'a Sor",
  "Copy Project Link": "Proje Linkini Kopyala",
  Copied: "Kopyalandı",
});

Object.assign(i18nTranslations.tr, {
  "Algorithmic 3D lab": "Algoritmik 3D laboratuvarı",
  "Drag the model and see code turn math into motion.":
    "Modeli sürükle ve kodun matematiği harekete dönüştürmesini gör.",
  "A lightweight canvas demo built with vanilla JavaScript. The shape is generated from a triangular parametric mesh and rendered with perspective projection, depth sorting and mouse-controlled rotation.":
    "Vanilla JavaScript ile geliştirilmiş hafif bir canvas demosu. Şekil üçgensel parametrik mesh üzerinden üretilir; perspektif projeksiyon, derinlik sıralama ve mouse kontrollü dönüşle çizilir.",
  "Drag to rotate • Scroll to zoom":
    "Döndürmek için sürükle • Yakınlaşmak için kaydır",
  "Vanilla JS": "Vanilla JS",
  "Triangular surface generated by an algorithm.":
    "Algoritma ile üretilen üçgensel yüzey.",
  "The mesh is calculated with barycentric coordinates, animated through a wave function and projected onto the canvas without any external 3D library.":
    "Mesh barycentric koordinatlarla hesaplanır, dalga fonksiyonu ile animasyonlanır ve harici 3D kütüphane olmadan canvas üzerine projekte edilir.",
  Canvas: "Canvas",
  "3D Projection": "3D Projeksiyon",
  "Parametric Mesh": "Parametrik Mesh",
  "Mouse Interaction": "Mouse Etkileşimi",
});
Object.assign(i18nTranslations.tr, {
  "Selected Work": "Seçili Projeler",
  "Projects across AI, automation and software products.":
    "AI, otomasyon ve yazılım ürünleri alanındaki projeler.",
  "A focused selection of projects that demonstrate my work in conversational AI, workflow automation, software development, digital products and interactive systems.":
    "Conversational AI, workflow otomasyonu, yazılım geliştirme, dijital ürünler ve interaktif sistemler alanındaki çalışmalarımı gösteren seçili bir proje koleksiyonu.",
  "Selected Projects": "Seçili Projeler",
  "Additional Projects": "Ek Projeler",
  "Project Archive & Learning Builds": "Proje Arşivi ve Öğrenme Çalışmaları",
  "Focused evidence across AI, software and digital products.":
    "AI, yazılım ve dijital ürünler alanındaki odaklı çalışmalar.",
  "More product, database and interactive work.":
    "Diğer ürün, veritabanı ve interaktif çalışmalar.",
  "Earlier university projects, technical exercises and small prototypes that document my learning process.":
    "Öğrenme sürecimi belgeleyen önceki üniversite projeleri, teknik alıştırmalar ve küçük prototipler.",
  Software: "Yazılım",
  "Web & Product": "Web & Ürün",
  Data: "Veri",
  "Games & Interactive": "Oyunlar & İnteraktif",
  Live: "Canlı",
  Completed: "Tamamlandı",
  Prototype: "Prototip",
  "Learning Project": "Öğrenme Projesi",
  Archive: "Arşiv",
  "Play Live": "Canlı Oyna",
  "Open GitHub": "GitHub'da Aç",
  "Open Live Website": "Canlı Siteyi Aç",
  "AI & Interactive": "AI & İnteraktif",
  "AI Flow Puzzle": "AI Flow Puzzle",
  "MyMuseum — Mobile Content App": "MyMuseum — Mobil İçerik Uygulaması",
  "A case study based on enterprise conversational AI work involving chatbot QA, stabilization, large-scale flow restructuring, channel configuration and multi-channel automation logic.":
    "Chatbot QA, stabilizasyon, büyük ölçekli akış yeniden yapılandırma, kanal yapılandırması ve çok kanallı otomasyon mantığını kapsayan kurumsal conversational AI çalışmalarına dayalı bir vaka çalışması.",
  "A live n8n-inspired browser experience demonstrating chatbot flow structure, node validation, fallback paths and user journey thinking.":
    "Chatbot akış yapısını, node doğrulamasını, fallback yollarını ve kullanıcı yolculuğu düşüncesini gösteren n8n ilhamlı canlı tarayıcı deneyimi.",
  "A live digital product for a creative workshop studio combining service presentation, package-based reservation journeys, automated notifications and operational workflows.":
    "Hizmet sunumu, paket bazlı rezervasyon yolculukları, otomatik bildirimler ve operasyonel akışları birleştiren yaratıcı atölye stüdyosu için canlı dijital ürün.",
  "A C#/.NET Windows Forms application designed to manage hospital appointment and operational workflows through a database-backed multi-form structure.":
    "Veritabanı destekli çok formlu yapı üzerinden hastane randevu ve operasyon akışlarını yönetmek için tasarlanmış C#/.NET Windows Forms uygulaması.",
  "A Python and Tkinter hospital appointment application with patient, doctor and staff workflows, appointment-slot logic and MySQL-backed data operations.":
    "Hasta, doktor ve personel akışları, randevu slot mantığı ve MySQL destekli veri işlemleri içeren Python ve Tkinter hastane randevu uygulaması.",
  "A Python data project combining exploratory analysis and visualization with a small linear-regression experiment for car-price estimation.":
    "Keşifsel analiz ve görselleştirmeyi araç fiyatı tahmini için küçük bir doğrusal regresyon deneyiyle birleştiren Python veri projesi.",
  "A first-person environmental puzzle prototype featuring object manipulation, pressure plates, physics-based interactions and modular level design.":
    "Nesne manipülasyonu, basınç plakaları, fizik tabanlı etkileşimler ve modüler bölüm tasarımı içeren birinci şahıs çevresel bulmaca prototipi.",
  "An Android content-sharing application built with Kotlin and Firebase around mobile user flows and database-backed interactions.":
    "Mobil kullanıcı akışları ve veritabanı destekli etkileşimler etrafında Kotlin ve Firebase ile geliştirilen Android içerik paylaşım uygulaması.",
  "A PHP and MySQL based administration dashboard with database-backed management screens and operational control flows.":
    "Veritabanı destekli yönetim ekranları ve operasyonel kontrol akışları içeren PHP ve MySQL tabanlı yönetim paneli.",
  "A solo third-person platforming and escape prototype built with Unreal Engine 5, C++ and Blueprints.":
    "Unreal Engine 5, C++ ve Blueprints ile geliştirilen solo üçüncü şahıs platform ve kaçış prototipi.",
  "A relational database project covering normalized agency records, data modeling, stored procedures and triggers.":
    "Normalize edilmiş ajans kayıtları, veri modelleme, stored procedure ve trigger yapılarını kapsayan ilişkisel veritabanı projesi.",
  "A hyper-casual 3D mobile driving prototype focused on obstacle avoidance, score and reflex-based gameplay.":
    "Engellerden kaçınma, skor ve refleks odaklı hyper-casual 3D mobil sürüş prototipi.",
  "A third-person action shooter prototype with enemy behavior, health management and combat-focused gameplay systems.":
    "Düşman davranışı, sağlık yönetimi ve savaş odaklı oynanış sistemleri içeren üçüncü şahıs aksiyon shooter prototipi.",
  "A third-person tank combat prototype built with Unreal Engine, C++, Blueprints and physics-based gameplay.":
    "Unreal Engine, C++, Blueprints ve fizik tabanlı oynanışla geliştirilen üçüncü şahıs tank savaş prototipi.",
  "A 2D physics-based projectile learning prototype.":
    "2D fizik tabanlı fırlatma mekaniğine odaklanan öğrenme prototipi.",
  "Multiple scenes exploring gameplay fundamentals and mechanics.":
    "Oynanış temellerini ve mekaniklerini keşfeden çoklu sahneler.",
  "A location-based weather API learning application.":
    "Konum tabanlı hava durumu API öğrenme uygulaması.",
  "A mobile calculator exercise focused on interface structure and app logic.":
    "Arayüz yapısı ve uygulama mantığına odaklanan mobil hesap makinesi alıştırması.",
  "A DOM interaction and frontend state exercise.":
    "DOM etkileşimi ve frontend durum yönetimi alıştırması.",
  "A warehouse-themed combat and environment prototype.":
    "Depo temalı savaş ve çevre prototipi.",
  "A responsive portfolio and landing-page experiment.":
    "Responsive portfolyo ve landing page deneyi.",
  "A collection of Java programming exercises and console applications.":
    "Java programlama alıştırmaları ve konsol uygulamaları koleksiyonu.",
  "A static website and frontend layout exercise.":
    "Statik web sitesi ve frontend layout alıştırması.",
  "A repository of programming, automation and data-oriented exercises.":
    "Programlama, otomasyon ve veri odaklı alıştırmalar içeren repository.",
  "An inventory-style data structure and tracking exercise.":
    "Envanter tarzı veri yapısı ve takip alıştırması.",
  "AI Agent Evaluation": "AI Agent Değerlendirme",
  "Regression Testing": "Regression Testi",
  "Open Live Product": "Canlı Ürünü Aç",
  "A live Turkish-first reliability lab for customer-service AI agents, combining multi-turn scenario execution, deterministic tool-call evaluation, regression detection and inspectable failure evidence.":
    "Müşteri hizmetleri AI agent'larını çok turlu Türkçe senaryolar, deterministik tool-call değerlendirmesi, regression tespiti ve incelenebilir hata kanıtlarıyla test eden canlı bir AI Agent Reliability Lab.",
  "Expanding SINAMA with persistent run history, V1 vs V2 agent comparison and more Turkish scenario packs.":
    "SINAMA'yı kalıcı run geçmişi, V1'e karşı V2 agent karşılaştırması ve daha fazla Türkçe senaryo paketiyle genişletiyorum.",
  "A Turkish-first reliability testing platform for customer-service AI agents, built around repeatable multi-turn scenarios, deterministic tool-call evaluation and inspectable regression evidence.":
    "Müşteri hizmetleri AI agent'ları için tekrarlanabilir çok turlu senaryolar, deterministik tool-call değerlendirmesi ve incelenebilir regression kanıtları etrafında kurulan Türkçe öncelikli bir reliability test platformu.",
  "Live MVP": "Canlı MVP",
  "Product status": "Ürün Durumu",
  "Tech stack": "Teknoloji Yığını",
  "Core capability": "Temel Yetenek",
});

Object.assign(i18nTranslations.tr, {
  Training: "Eğitimler",
  "Training and course completions across software, technical systems and interactive technologies.":
    "Yazılım, teknik sistemler ve interaktif teknolojiler alanındaki eğitimler ve kurs tamamlamaları.",
  "A selection of completed courses and technical training that support my work in software development, databases, web technologies, game development, cybersecurity and networking fundamentals.":
    "Yazılım geliştirme, veritabanları, web teknolojileri, oyun geliştirme, siber güvenlik ve ağ temelleri alanındaki çalışmalarımı destekleyen tamamlanmış kurs ve teknik eğitimlerden oluşan bir seçki.",
  "Software Development": "Yazılım Geliştirme",
  "Data & Database": "Veri & Veritabanı",
  "Web Development": "Web Geliştirme",
  "Game Development": "Oyun Geliştirme",
  Cybersecurity: "Siber Güvenlik",
  "Networking & Systems": "Ağ & Sistemler",
  "Course Completion": "Kurs Tamamlama",
  Instructor: "Eğitmen",
  Instructors: "Eğitmenler",
  Provider: "Sağlayıcı",
  Academy: "Akademi",
  Completed: "Tamamlanma",
  Preview: "Önizle",
  "View Credential": "Doğrulamayı Gör",
  "Jan 24, 2025": "24 Ocak 2025",
  "Jan 11, 2025": "11 Ocak 2025",
  "Mar 29, 2024": "29 Mart 2024",
  "Jan 3, 2024": "3 Ocak 2024",
  "Dec 1, 2023": "1 Aralık 2023",
});

const i18nTitleTranslations = {
  tr: {
    "Kaan Balcı | AI Designer & Software Developer":
      "Kaan Balcı | AI Designer & Software Developer",
    "Works | Kaan Balcı": "Projeler | Kaan Balcı",
    "Projects | Kaan Balcı": "Projeler | Kaan Balcı",
    "Adventure | Kaan Balcı": "Macera | Kaan Balcı",
    "Experience | Kaan Balcı": "Deneyim | Kaan Balcı",
    "About | Kaan Balcı": "Hakkımda | Kaan Balcı",
    "About Kaan Balcı | AI Designer & Software Developer":
      "Kaan Balcı Hakkında | AI Designer & Software Developer",
    "Certificates | Kaan Balcı": "Sertifikalar | Kaan Balcı",
    "Project Detail | Kaan Balcı": "Proje Detayı | Kaan Balcı",
    "Request a Project | Kaan Balcı": "Proje Talebi | Kaan Balcı",
    "Games | Kaan Balcı": "Oyunlar | Kaan Balcı",
    "Joyday Action Painting | Kaan Balcı":
      "Joyday Action Painting | Kaan Balcı",
  },
};
const i18nAttributeTranslations = {
  tr: {
    "Kaan Balcı home page": "Kaan Balcı ana sayfası",
    "Kaan Balcı logo": "Kaan Balcı logosu",
    "Open navigation": "Menüyü aç",
    "Open details for AI Chatbot Flow Design":
      "AI Chatbot Akış Tasarımı detaylarını aç",

    "Open details for Drivenfinity": "Drivenfinity detaylarını aç",
    "Open details for Dunker Madness": "Dunker Madness detaylarını aç",
    "Open details for Unity Essentials": "Unity Essentials detaylarını aç",
    "Open details for Extract Shoot: Zero":
      "Extract Shoot: Zero detaylarını aç",
    "Open details for Tank Savage": "Tank Savage detaylarını aç",
    "Open details for Hospital Form App": "Hospital Form App detaylarını aç",
    "Open details for Cars Dataset Analysis":
      "Cars Veri Seti Analizi detaylarını aç",
    "Open details for Weather App": "Weather App detaylarını aç",
    "Language selector": "Dil seçici",
    "Profile highlight card": "Profil öne çıkan kartı",
    "Core technologies": "Temel teknolojiler",
    "Portfolio highlights": "Portfolyo öne çıkanlar",
    "Drivenfinity project preview": "Drivenfinity proje önizlemesi",
    "Hospital Form App preview": "Hospital Form App önizlemesi",
    "Cars dataset analysis preview": "Cars veri seti analizi önizlemesi",
    "Social links": "Sosyal bağlantılar",
  },
};
Object.assign(i18nTranslations.tr, {
  "Tech stack matrix": "Teknoloji matrisi",
  "Tools I use across AI, web, data and games.":
    "AI, web, veri ve oyun alanlarında kullandığım araçlar.",
  "A quick matrix that shows where each technology fits in my workflow and how I use it in real projects.":
    "Her teknolojinin iş akışımda nereye oturduğunu ve gerçek projelerde nasıl kullandığımı gösteren hızlı bir matris.",
  "AI & Automation": "AI & Otomasyon",
  "Chatbot flow design, AI Flow logic, n8n-style automation planning and LLM quality evaluation.":
    "Chatbot akışı tasarımı, AI Flow mantığı, n8n tarzı otomasyon planlama ve LLM kalite değerlendirmesi.",
  "Software & Backend": "Yazılım & Backend",
  "Automation systems, database-backed applications, dashboards and backend logic.":
    "Otomasyon sistemleri, veritabanı destekli uygulamalar, dashboardlar ve backend mantığı.",
  "Web & Mobile": "Web & Mobil",
  "Responsive websites, reservation flows, Android apps and product-focused interfaces.":
    "Responsive web siteleri, rezervasyon akışları, Android uygulamaları ve ürün odaklı arayüzler.",
  "Gameplay prototypes, OOP practice, physics logic, Unity projects and Unreal Engine systems.":
    "Gameplay prototipleri, OOP pratiği, fizik mantığı, Unity projeleri ve Unreal Engine sistemleri.",
  "Currently building": "Şu anda geliştirdiklerim",
  "Active directions I am improving right now.":
    "Şu anda geliştirdiğim aktif yönler.",
  "I keep the portfolio alive by turning real business needs, AI workflow ideas and software experiments into structured projects.":
    "Gerçek iş ihtiyaçlarını, AI iş akışı fikirlerini ve yazılım denemelerini düzenli projelere dönüştürerek portföyü canlı tutuyorum.",
  "AI workflow portfolio projects": "AI workflow portföy projeleri",
  "Designing sample chatbot and automation flows for recruiter-friendly AI Designer case studies.":
    "Recruiter dostu AI Designer case study'leri için örnek chatbot ve otomasyon akışları tasarlıyorum.",
  "Joyday data & reservation analysis": "Joyday veri & rezervasyon analizi",
  "Planning dashboards around reservation data, package demand, customer flow and operational tracking.":
    "Rezervasyon verisi, paket talebi, müşteri akışı ve operasyon takibi etrafında dashboardlar planlıyorum.",
  "Web product improvements": "Web ürün iyileştirmeleri",
  "Improving real websites with better UX, responsive layouts, form flows, SEO and performance checks.":
    "Gerçek web sitelerini daha iyi UX, responsive düzenler, form akışları, SEO ve performans kontrolleriyle geliştiriyorum.",
  "AI workflow demo": "AI workflow demosu",
  "See how I think through chatbot flow logic.":
    "Chatbot akış mantığını nasıl düşündüğümü gör.",
  "Select a scenario and the page will generate a simple AI flow map. This is a lightweight demo of how I structure intents, steps and user journeys.":
    "Bir senaryo seçtiğinde sayfa basit bir AI akış haritası oluşturur. Bu, kullanıcı amaçlarını, adımları ve kullanıcı yolculuklarını nasıl yapılandırdığımı gösteren hafif bir demodur.",
  Bank: "Banka",
  Municipality: "Belediye",
  "Workshop Studio": "Atölye Stüdyosu",
  "E-commerce": "E-ticaret",
  "Featured case study": "Öne çıkan vaka çalışması",
  "Atölye Joyday official website and reservation journey.":
    "Atölye Joyday resmi web sitesi ve rezervasyon yolculuğu.",
  "A real business project where I designed and built the website experience for a creative workshop studio. The project connects service presentation, package selection, reservation flow and operational tracking into one usable customer journey.":
    "Yaratıcı atölye stüdyosu için web deneyimini tasarlayıp geliştirdiğim gerçek bir işletme projesi. Proje; hizmet anlatımı, paket seçimi, rezervasyon akışı ve operasyon takibini tek kullanılabilir müşteri yolculuğunda birleştirir.",
  "Business website": "İşletme web sitesi",
  Reservation: "Rezervasyon",
  "Responsive Design": "Responsive Tasarım",
  "UX Flow": "Kullanıcı Akışı",
  "SEO Basics": "Temel SEO",
  "Reservation CTA": "Rezervasyon CTA’sı",
  "Test and polish": "Test ve İyileştirme",
  "Frontend stack": "Frontend Teknolojileri",
  "Project Type": "Proje Türü",
  "Live Business Website": "Canlı İşletme Web Sitesi",
  "Workflow Design": "Akış Tasarımı",
  "Testing & Validation": "Test ve Doğrulama",
  "Human Handoff": "İnsan Temsilciye Aktarım",
  "Multi-channel Automation": "Çok Kanallı Otomasyon",
  "Customer flow": "Müşteri akışı",
  "View Case Study": "Vaka Çalışmasını Gör",
  "Open Live Website": "Canlı Siteyi Aç",
  "More experiments on GitHub": "GitHub'da daha fazla deney",
  "Additional learning projects and archived builds.":
    "Ek öğrenme projeleri ve arşivlenmiş çalışmalar.",
  "The main catalog highlights selected projects, but my GitHub includes more practice repositories, university projects and experiments.":
    "Ana katalog seçili projeleri öne çıkarıyor; GitHub hesabımda ise daha fazla pratik repository, üniversite projesi ve deney bulunuyor.",
  "Java Projects": "Java Projeleri",
  "University and OOP practice repositories.":
    "Üniversite ve OOP pratik repository'leri.",
  "Python Projects": "Python Projeleri",
  "Automation, data and learning projects.":
    "Otomasyon, veri ve öğrenme projeleri.",
  "Calculator JS": "Calculator JS",
  "Frontend logic and UI practice.": "Frontend mantığı ve UI pratiği.",
  "JavaScript API and interface practice.": "JavaScript API ve arayüz pratiği.",
  "Contact hub": "İletişim merkezi",
  "Let’s talk about AI workflows, automation or software projects.":
    "AI iş akışları, otomasyon veya yazılım projeleri hakkında konuşalım.",
  "I am open to AI Designer, Software Developer and automation-focused roles where I can design useful flows and build practical software products.":
    "Faydalı akışlar tasarlayabileceğim ve pratik yazılım ürünleri geliştirebileceğim AI Designer, Software Developer ve otomasyon odaklı rollere açığım.",
  "Download CV": "CV'yi İndir",
  "Atölye Joyday Official Website": "Atölye Joyday Resmi Web Sitesi",
  "Live business website for a creative workshop studio with service pages, package presentation, responsive UX and reservation CTAs.":
    "Yaratıcı atölye stüdyosu için hizmet sayfaları, paket sunumu, responsive UX ve rezervasyon CTA'ları içeren canlı işletme web sitesi.",

  "Dynamic reservation workflow for package selection, selected-package context, customer form data and operational tracking.":
    "Paket seçimi, seçili paket bağlamı, müşteri form verisi ve operasyon takibi için dinamik rezervasyon akışı.",
});
Object.assign(i18nAttributeTranslations.tr, {
  "Open details for Atölye Joyday Official Website":
    "Atölye Joyday Resmi Web Sitesi detaylarını aç",
  "Open Atölye Joyday case study": "Atölye Joyday vaka çalışmasını aç",

  "AI workflow scenarios": "AI workflow senaryoları",
  "Atölye Joyday package selection preview":
    "Atölye Joyday paket seçimi önizlemesi",
  "Atölye Joyday official website preview":
    "Atölye Joyday resmi web sitesi önizlemesi",
  "Atölye Joyday reservation workflow preview":
    "Atölye Joyday rezervasyon akışı önizlemesi",
  "Atölye Joyday official website preview":
    "Atölye Joyday resmi web sitesi önizlemesi",
  "Atölye Joyday reservation workflow preview":
    "Atölye Joyday rezervasyon akışı önizlemesi",
});

/* GitHub project card translations */
Object.assign(i18nTranslations.tr, {
  "Want to inspect the complete project catalog?":
    "Tüm proje kataloğunu incelemek ister misin?",
  "This page now includes the main public GitHub repositories, selected case studies, learning projects and archived builds in one catalog.":
    "Bu sayfa artık ana public GitHub repository’lerini, seçili case study’leri, öğrenme projelerini ve arşivlenmiş çalışmaları tek katalogda topluyor.",
  "Control Panel": "Control Panel",
  "A web-based control panel project focused on admin screens, interface structure and dashboard-style management flows.":
    "Admin ekranları, arayüz yapısı ve dashboard tarzı yönetim akışlarına odaklanan web tabanlı kontrol paneli projesi.",
  "Hospital Appointment System": "Hospital Appointment System",
  "A Python and Tkinter hospital appointment automation system with MySQL-backed patient, doctor, staff and appointment workflows.":
    "Python, Tkinter ve MySQL ile hasta, doktor, personel ve randevu akışlarını yöneten masaüstü hastane otomasyonu.",

  "Escape Island": "Escape Island",
  "A game prototype focused on island escape mechanics, environment setup and gameplay exploration.":
    "Ada kaçış mekanikleri, çevre kurulumu ve oynanış denemelerine odaklanan oyun prototipi.",
  "Calculator Android Studio": "Calculator Android Studio",
  "A mobile calculator app built in Android Studio to practice interface structure and basic app logic.":
    "Arayüz yapısı ve temel uygulama mantığı pratiği için Android Studio’da geliştirilen mobil hesap makinesi uygulaması.",
  "Calculator JavaScript": "Calculator JavaScript",
  "A JavaScript calculator project focused on DOM interaction, UI state and basic frontend logic.":
    "DOM etkileşimi, UI state ve temel frontend mantığına odaklanan JavaScript hesap makinesi projesi.",
  "Warehouse War": "Warehouse War",
  "A warehouse-themed game prototype exploring combat, environment layout and gameplay systems.":
    "Savaş, çevre yerleşimi ve gameplay sistemlerini deneyen depo temalı oyun prototipi.",
  "Legacy of the Lost": "Legacy of the Lost",
  "A game prototype with a darker adventure atmosphere, built around exploration and scene presentation.":
    "Keşif ve sahne sunumu etrafında geliştirilen, daha karanlık macera atmosferine sahip oyun prototipi.",
  "Porto 25": "Porto 25",
  "A Tailwind CSS portfolio / landing page experiment focused on responsive UI, modern layout and personal branding.":
    "Tailwind CSS odaklı kişisel portfolyo / landing page denemesi; responsive arayüz, modern layout ve marka sunumu pratiği.",
  "My Java Projects": "My Java Projects",
  "A collection of Java practice projects focused on object-oriented programming, algorithms and core language fundamentals.":
    "Nesne yönelimli programlama, algoritmalar ve temel dil yapılarına odaklanan Java pratik projeleri koleksiyonu.",
  "Agency DB": "Agency DB",
  "A database-focused project for modeling agency-style records, relations and structured data operations.":
    "Ajans tarzı kayıtları, ilişkileri ve yapılandırılmış veri işlemlerini modellemeye odaklanan veritabanı projesi.",
  "Mandelas Website Project": "Mandelas Website Project",
  "A website project focused on content structure, frontend layout and static page development.":
    "İçerik yapısı, frontend layout ve statik sayfa geliştirmeye odaklanan web sitesi projesi.",
  "Python Projects": "Python Projects",
  "A Python practice repository containing learning projects around programming fundamentals, automation and data-oriented logic.":
    "Programlama temelleri, otomasyon ve veri odaklı mantık etrafında öğrenme projeleri içeren Python pratik deposu.",
  "IC Supply": "IC Supply",
  "A supply-oriented project focused on inventory-style data structure, tracking logic and backend thinking.":
    "Stok/envanter tarzı veri yapısı, takip mantığı ve backend düşüncesine odaklanan tedarik projesi.",

  "The GitHub repository side of the Atölye Joyday website work, focused on real business presentation and reservation-oriented UX.":
    "Atölye Joyday web sitesi çalışmasının GitHub depo tarafı; gerçek işletme sunumu ve rezervasyon odaklı UX üzerine kurulu.",
  "Portfolio Website": "Portfolio Website",
  "The live personal portfolio repository combining project catalog, AI assistant, recruiter mode, request form and interactive mini game features.":
    "Proje kataloğu, AI asistan, İK modu, talep formu ve interaktif mini oyun özelliklerini birleştiren canlı kişisel portfolyo deposu.",
});

Object.assign(i18nAttributeTranslations.tr, {
  Search: "Ara",
  "Open details for Control Panel": "Control Panel detaylarını aç",
  "Open details for Hospital Appointment System":
    "Hospital Appointment System detaylarını aç",
  "Open details for Escape Island": "Escape Island detaylarını aç",
  "Open details for Calculator Android Studio":
    "Calculator Android Studio detaylarını aç",
  "Open details for Calculator JavaScript":
    "Calculator JavaScript detaylarını aç",
  "Open details for Warehouse War": "Warehouse War detaylarını aç",
  "Open details for Legacy of the Lost": "Legacy of the Lost detaylarını aç",
  "Open details for Porto 25": "Porto 25 detaylarını aç",
  "Open details for My Java Projects": "My Java Projects detaylarını aç",
  "Open details for Agency DB": "Agency DB detaylarını aç",
  "Open details for Mandelas Website Project":
    "Mandelas Website Project detaylarını aç",
  "Open details for Python Projects": "Python Projects detaylarını aç",
  "Open details for IC Supply": "IC Supply detaylarını aç",

  "Open details for Portfolio Website": "Portfolio Website detaylarını aç",
});

/* Games and Joyday Action Painting translations */
Object.assign(i18nTranslations.tr, {
  Games: "Oyunlar",
  "Web games": "Web oyunları",
  "Playable portfolio experiments about learning, projects and career growth.":
    "Öğrenme, projeler ve kariyer gelişimi üzerine oynanabilir portfolyo deneyleri.",
  "This page collects small web games that turn my personal journey into interactive experiences. Each game is designed to be lightweight, portfolio-friendly and playable directly in the browser.":
    "Bu sayfa kişisel yolculuğumu interaktif deneyimlere dönüştüren küçük web oyunlarını toplar. Her oyun hafif, portfolyo dostu ve doğrudan tarayıcıda oynanabilir olacak şekilde tasarlanır.",
  "Play Joyday Painting": "Joyday Painting Oyna",
  "Play Career Adventure": "Career Adventure Oyna",
  "Game catalog": "Oyun kataloğu",
  "Minimal web games with a career-story angle.":
    "Kariyer hikayesi açısına sahip minimal web oyunları.",
  "The catalog now includes Career Adventure and Joyday Action Painting, and it can grow into a full interactive game shelf over time.":
    "Katalog artık Career Adventure ve Joyday Action Painting oyunlarını içeriyor; zamanla tam bir interaktif oyun rafına dönüşebilir.",
  Career: "Kariyer",
  Creative: "Yaratıcı",
  "Coming Soon": "Yakında",
  Live: "Canlı",
  Concept: "Konsept",
  "Mini Game": "Mini Oyun",
  "Career Journey": "Kariyer Yolculuğu",
  Merge: "Birleştirme",
  "Kaan's Career Adventure": "Kaan'ın Kariyer Macerası",
  "Combine learning objects, software tools, AI workflow experience and portfolio proof until the final Job Offer object appears.":
    "Öğrenme nesnelerini, yazılım araçlarını, AI workflow deneyimini ve portfolyo kanıtlarını final Job Offer nesnesi çıkana kadar birleştir.",
  "Play Game": "Oyunu Oyna",
  "Joyday Action Painting": "Joyday Action Painting",
  "Choose a square, circle or rectangle canvas, pick colors and use virtual action painting tools to create a downloadable PNG artwork.":
    "Kare, daire veya dikdörtgen tuval seç; renkleri belirle ve sanal action painting araçlarıyla indirilebilir PNG eser oluştur.",
  "Action Painting": "Action Painting",
  "PNG Export": "PNG Çıktı",
  "AI Flow Puzzle": "AI Flow Puzzle",
  "Interview Run": "Interview Run",
  "A planned quick decision game about answering interview questions, managing time and choosing the strongest response path.":
    "Mülakat sorularını cevaplama, zamanı yönetme ve en güçlü cevap yolunu seçme üzerine planlanan hızlı karar oyunu.",
  "Ready as a future expansion idea.": "Gelecek genişletme fikri olarak hazır.",
  "Next direction": "Sonraki yön",
  "This page is designed to grow with new playable portfolio ideas.":
    "Bu sayfa yeni oynanabilir portfolyo fikirleriyle büyüyecek şekilde tasarlandı.",
  "New games can be added as separate pages, while this catalog stays as the main entry point for all interactive web game experiments.":
    "Yeni oyunlar ayrı sayfalar olarak eklenebilir; bu katalog ise tüm interaktif web oyunları için ana giriş noktası olarak kalır.",
  "Virtual studio game": "Sanal atölye oyunu",
  "Joyday Action Painting experience.": "Joyday Action Painting deneyimi.",
  "Choose a canvas, pick a color, select a tool and create your own action painting artwork directly in the browser.":
    "Tuvalini seç, rengini belirle, ekipmanını seç ve kendi action painting eserini doğrudan tarayıcıda oluştur.",
  "Start Painting": "Boyamaya Başla",
  "Back to Games": "Oyunlara Dön",
  "Touch Friendly": "Dokunmatik Uyumlu",
  "Pick • Splash • Download": "Seç • Sıçrat • İndir",
  "Action painting wall": "Action painting duvarı",
  "Your canvas is ready.": "Tuvalin hazır.",
  "50x50 Square Canvas": "50x50 Kare Tuval",
  "Throw Bottle": "Fırlatma Şişesi",
  Undo: "Geri Al",
  Redo: "İleri Al",
  Clear: "Temizle",
  "Download PNG": "PNG İndir",
  "Canvas type": "Tuval tipi",
  "50x50 Square": "50x50 Kare",
  "Classic Joyday canvas": "Klasik Joyday tuvali",
  "52 cm Circle": "52 cm Daire",
  "Round composition": "Yuvarlak kompozisyon",
  "40x60 Rectangle": "40x60 Dikdörtgen",
  "Vertical poster feel": "Dikey poster hissi",
  "Color palette": "Renk paleti",
  "Custom color": "Özel renk",
  Equipment: "Ekipman",
  "Pick a tool, then paint directly on the canvas.":
    "Bir ekipman seç, sonra doğrudan tuvalin üzerinde boya.",
  "Start with any color and equipment.": "İstediğin renk ve ekipmanla başla.",
  "Choose your canvas, then use the toolbelt below to splash, spray, brush or burst color onto it.":
    "Tuvalini seç, sonra alttaki ekipman barıyla sıçrat, püskürt, fırçala veya patlat.",
  "Choose your canvas, then use the toolbelt below to draw paint lines, spray, brush or burst color onto it.":
    "Tuvalini seç, sonra alttaki ekipman barıyla boya çizgisi çek, püskürt, fırçala veya patlat.",
  "Quick tip": "Kısa ipucu",
  "Choose your canvas, then use the toolbelt below to splash, spray, brush or burst color onto it. You can close this tip anytime.":
    "Tuvalini seçtikten sonra alttaki ekipman barıyla sıçrat, püskürt, fırçala veya patlat. Bu bilgiyi istediğin zaman kapatabilirsin.",
  "Choose your canvas, then use the toolbelt below. For the bottle, press and release to throw one clean paint line. You can close this tip anytime.":
    "Tuvalini seçtikten sonra alttaki ekipman barını kullan. Şişede basıp bırakarak tuvale tek hamlede temiz bir boya çizgisi fırlat. Bu bilgiyi istediğin zaman kapatabilirsin.",
  "Choose your canvas, then use the toolbelt below. For the bottle, press and release to throw one clean paint line.":
    "Tuvalini seçtikten sonra alttaki ekipman barını kullan. Şişede basıp bırakarak tuvale tek hamlede temiz bir boya çizgisi fırlat.",
  Spray: "Fısfıs",
  Brush: "Fırça",
  "Water Balloon": "Su Balonu",
  "Medium splashes": "Orta sıçramalar",
  "Straight paint line": "Düz boya çizgisi",
  "One-shot paint throw": "Tek hamle boya atışı",
  "Soft mist": "Yumuşak püskürtme",
  "Drag strokes": "Sürükleme izleri",
  "Large burst": "Büyük patlama",
  "Stroke thickness": "İncelik ayarı",
  Thin: "İnce",
  Medium: "Orta",
  Thick: "Kalın",
  "How to play": "Nasıl oynanır",
  "Choose a canvas and color, then click or drag on the canvas. Bottle and balloon create instant splashes, spray and brush work best while dragging.":
    "Tuval ve renk seç, sonra tuvale tıkla veya sürükle. Şişe ve balon anlık sıçrama oluşturur; fısfıs ve fırça sürüklerken en iyi çalışır.",
  "Choose a canvas and color, then click or drag on the canvas. Bottle draws a straight paint line, balloon creates a burst, and spray or brush work best while dragging.":
    "Tuval ve renk seç, sonra tuvale tıkla veya sürükle. Şişe düz boya çizgisi çeker, balon patlama efekti verir; fısfıs ve fırça sürüklerken en iyi çalışır.",
  "Choose a canvas and color, then click or drag on the canvas. Bottle creates a one-shot straight paint throw when you release, balloon creates a burst, and spray or brush work best while dragging.":
    "Tuval ve renk seç, sonra tuvale tıkla veya sürükle. Şişe bırakınca tek hamlede düz boya atışı yapar, balon patlama efekti verir; fısfıs ve fırça sürüklerken en iyi çalışır.",
  "Select a canvas type": "Tuval tipini seç",
  "Then use colors and tools to paint.":
    "Sonra renk ve ekipmanlarla boyamaya başla.",
  "Sep 2025 – Oct 2025": "Eyl 2025 – Eki 2025",
  "Apr 2025 – Aug 2025": "Nis 2025 – Ağu 2025",
  "2026 – Present": "2026 – Günümüz",
  "Outlier AI – AI Training Specialist": "Outlier AI – AI Eğitim Uzmanı",
});
Object.assign(i18nAttributeTranslations.tr, {
  "Open Joyday Action Painting game": "Joyday Action Painting oyununu aç",
  "Joyday Action Painting game preview":
    "Joyday Action Painting oyun önizlemesi",
  "Joyday action painting preview": "Joyday action painting önizlemesi",
  "Joyday game features": "Joyday oyun özellikleri",
  "Virtual Joyday painting wall": "Sanal Joyday boyama duvarı",
  "Canvas type": "Tuval tipi",
  "Color palette": "Renk paleti",
  "Action painting equipment": "Action painting ekipmanları",
  "Joyday painting canvas": "Joyday boyama tuvali",
  "Close hint": "İpucunu kapat",
});

Object.assign(i18nTranslations.tr, {
  "Play AI Flow Puzzle": "AI Flow Puzzle Oyna",
  "View AI Flow Puzzle Case Study": "AI Flow Puzzle Vaka Çalışmasını Gör",
  "The catalog now includes Career Adventure, Joyday Action Painting and AI Flow Puzzle, and it can grow into a full interactive game shelf over time.":
    "Katalog artık Career Adventure, Joyday Action Painting ve AI Flow Puzzle oyunlarını içeriyor; zamanla tam bir interaktif oyun rafına dönüşebilir.",
  "Build n8n-inspired chatbot workflows by placing trigger, intent, response, fallback and automation nodes on a visual board.":
    "Trigger, intent, response, fallback ve otomasyon node'larını görsel board üzerine yerleştirerek n8n mantıklı chatbot workflow'ları kur.",
  "n8n Logic • JavaScript": "n8n Mantığı • JavaScript",
  "Open AI Flow Puzzle game": "AI Flow Puzzle oyununu aç",
  "AI Flow Puzzle game preview": "AI Flow Puzzle oyun önizlemesi",
});
Object.assign(i18nTitleTranslations.tr, {
  "AI Flow Puzzle | Kaan Balcı": "AI Flow Puzzle | Kaan Balcı",
  "Training & Course Certifications | Kaan Balcı":
    "Eğitimler ve Kurs Sertifikaları | Kaan Balcı",
});
Object.assign(i18nAttributeTranslations.tr, {
  "Open AI Flow Puzzle game": "AI Flow Puzzle oyununu aç",
  "AI Flow Puzzle game preview": "AI Flow Puzzle oyun önizlemesi",
  "Open AI Flow Puzzle case study": "AI Flow Puzzle vaka çalışmasını aç",
  "AI Flow Puzzle case study preview":
    "AI Flow Puzzle vaka çalışması önizlemesi",
  "AI Chatbot Flow Design multi-channel conversational workflow cover":
    "AI Chatbot Flow Design çok kanallı conversational workflow kapağı",
  "AI Flow Puzzle node-based chatbot workflow cover":
    "AI Flow Puzzle node tabanlı chatbot workflow kapağı",
  "Hospital Form App appointment management interface cover":
    "Hospital Form App randevu yönetimi arayüz kapağı",
  "Open Hospital System case study": "Hospital System vaka çalışmasını aç",
  "Control Panel PHP and MySQL administration dashboard cover":
    "Control Panel PHP ve MySQL yönetim paneli kapağı",
  "Agency DB relational database schema cover":
    "Agency DB ilişkisel veritabanı şeması kapağı",
  "Kaan Balcı portfolio website homepage cover":
    "Kaan Balcı portfolyo web sitesi ana sayfa kapağı",
  "Porto 25 responsive Tailwind landing page cover":
    "Porto 25 responsive Tailwind açılış sayfası kapağı",
  "IC Supply inventory tracking data system cover":
    "IC Supply envanter takip veri sistemi kapağı",
  "Kaan's Career Adventure career workflow cover":
    "Kaan’ın Kariyer Macerası kariyer workflow kapağı",
  "Certificate preview": "Sertifika önizlemesi",
  "Close preview": "Önizlemeyi kapat",
  "Open SINAMA case study": "SINAMA vaka çalışmasını aç",
  "SINAMA wordmark on a dark cover card":
    "Koyu kapak kartı üzerinde SINAMA logotype'ı",
});

/* Final bilingual content and accessibility consistency */
Object.assign(i18nTranslations.tr, {
  "A live digital product combining package-based reservation journeys, automated notifications and operational workflows.":
    "Paket bazlı rezervasyon yolculuklarını, otomatik bildirimleri ve operasyonel iş akışlarını birleştiren canlı dijital ürün.",
  "A Python data project combining exploratory analysis and visualization with a small linear-regression experiment.":
    "Keşifsel analiz ve veri görselleştirmeyi küçük bir doğrusal regresyon deneyiyle birleştiren Python veri projesi.",
  "AI Designer & Software Developer building practical AI workflows and software products.":
    "Pratik yapay zekâ iş akışları ve yazılım ürünleri geliştiren AI Designer & Software Developer.",
});

Object.assign(i18nAttributeTranslations.tr, {
  "Available for roles": "Rollere açık",
  "Core specialties": "Temel uzmanlıklar",
  "Project filters": "Proje filtreleri",
  "Game filters": "Oyun filtreleri",
  "Game themes": "Oyun temaları",
  "Search palette": "Arama paleti",
  "Open navigation": "Navigasyonu aç",
  "Close navigation": "Navigasyonu kapat",
  "Open recruiter mode": "Recruiter Mode’u aç",
  "Close recruiter mode": "Recruiter Mode’u kapat",
  "Kaan Balcı profile photo": "Kaan Balcı profil fotoğrafı",
  "Open Career Adventure game": "Career Adventure oyununu aç",
  "Interview Run game preview": "Interview Run oyun önizlemesi",
  "Python Hospital Appointment System preview":
    "Python Hospital Appointment System önizlemesi",
  "Cars dataset analysis project preview":
    "Cars veri seti analizi proje önizlemesi",
  "Legacy of the Lost environmental puzzle preview":
    "Legacy of the Lost çevresel bulmaca önizlemesi",
  "Open details for MyMuseum Mobile Content App":
    "MyMuseum mobil içerik uygulaması detaylarını aç",
  "My Museum app preview": "My Museum uygulama önizlemesi",
  "Open details for Extract Shoot Zero":
    "Extract Shoot Zero detaylarını aç",
  "Extract Shoot Zero project preview":
    "Extract Shoot Zero proje önizlemesi",
  "Escape Island Unreal Engine platforming preview":
    "Escape Island Unreal Engine platform önizlemesi",
  "Tank Savage Unreal Engine combat preview":
    "Tank Savage Unreal Engine savaş önizlemesi",
  "Dunker Madness project preview": "Dunker Madness proje önizlemesi",
  "Unity Essentials project preview": "Unity Essentials proje önizlemesi",
  "Weather App project preview": "Weather App proje önizlemesi",
  "Calculator Android Studio project preview":
    "Calculator Android Studio proje önizlemesi",
  "Calculator JavaScript project preview":
    "Calculator JavaScript proje önizlemesi",
  "Warehouse War project preview": "Warehouse War proje önizlemesi",
  "My Java Projects preview": "My Java Projects önizlemesi",
  "Mandelas Website Project preview":
    "Mandelas Website Project önizlemesi",
  "Python Projects preview": "Python Projects önizlemesi",
  "C sharp Udemy course completion certificate":
    "C Sharp Udemy kurs tamamlama sertifikası",
  "SQL Udemy course completion certificate":
    "SQL Udemy kurs tamamlama sertifikası",
  "HTML and CSS Udemy course completion certificate":
    "HTML ve CSS Udemy kurs tamamlama sertifikası",
  "Java Udemy course completion certificate":
    "Java Udemy kurs tamamlama sertifikası",
  "Ethical Hacker Udemy course completion certificate":
    "Etik Hacker Udemy kurs tamamlama sertifikası",
  "Unreal Engine Udemy course completion certificate":
    "Unreal Engine Udemy kurs tamamlama sertifikası",
  "Cisco Networking Essentials course completion certificate":
    "Cisco Networking Essentials eğitim tamamlama sertifikası",
  "Cisco Introduction to Packet Tracer course completion certificate":
    "Cisco Introduction to Packet Tracer eğitim tamamlama sertifikası",
  "NDG Linux Essentials training certificate":
    "NDG Linux Essentials eğitim sertifikası",
  "Open GitHub profile": "GitHub profilini aç",
  "Open LinkedIn profile": "LinkedIn profilini aç",
  "Open Instagram profile": "Instagram profilini aç",
  "Open YouTube channel": "YouTube kanalını aç",
  "Open X profile": "X profilini aç",
});

const originalDocumentTitle = document.title;

function normalizeI18nText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function preserveWhitespace(originalValue, translatedValue) {
  const leading = originalValue.match(/^\s*/)?.[0] || "";
  const trailing = originalValue.match(/\s*$/)?.[0] || "";
  return `${leading}${translatedValue}${trailing}`;
}

function collectTranslatableTextNodes() {
  const nodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (
          !parent ||
          ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        const key = normalizeI18nText(node.nodeValue);
        if (key && i18nTranslations.tr[key]) {
          node.__i18nKey = key;
          nodes.push(node);
        }
        return NodeFilter.FILTER_SKIP;
      },
    },
  );

  while (walker.nextNode()) {}
  return nodes;
}

const translatableTextNodes = collectTranslatableTextNodes();
const translatableAttributes = [];

["aria-label", "alt", "title", "placeholder"].forEach((attributeName) => {
  document.querySelectorAll(`[${attributeName}]`).forEach((element) => {
    const key = element.getAttribute(attributeName);
    if (key && i18nAttributeTranslations.tr[key]) {
      translatableAttributes.push({ element, attributeName, key });
    }
  });
});

let currentSiteLanguage = "en";

function applyLanguage(language) {
  const activeLanguage = language === "tr" ? "tr" : "en";
  currentSiteLanguage = activeLanguage;
  document.documentElement.lang = activeLanguage;

  translatableTextNodes.forEach((node) => {
    const key = node.__i18nKey;
    const nextValue = activeLanguage === "tr" ? i18nTranslations.tr[key] : key;
    node.nodeValue = preserveWhitespace(node.nodeValue, nextValue);
  });

  translatableAttributes.forEach((item) => {
    const nextValue =
      activeLanguage === "tr"
        ? i18nAttributeTranslations.tr[item.key]
        : item.key;
    item.element.setAttribute(item.attributeName, nextValue);
  });

  document.querySelectorAll("[data-training-type]").forEach((element) => {
    element.textContent = activeLanguage === "tr" ? "Eğitim" : "Training";
  });

  document.title =
    activeLanguage === "tr"
      ? i18nTitleTranslations.tr[originalDocumentTitle] || originalDocumentTitle
      : originalDocumentTitle;

  document.querySelectorAll("[data-lang-switch]").forEach((button) => {
    const isActive = button.dataset.langSwitch === activeLanguage;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  localStorage.setItem("kaanbalci-site-language", activeLanguage);

  if (typeof applySiteTheme === "function") {
    applySiteTheme(siteThemeState.current);
  }

  if (typeof renderProjectDetail === "function") {
    renderProjectDetail(activeLanguage);
  }

  if (typeof renderAiWorkflowDemo === "function") {
    renderAiWorkflowDemo(activeLanguage);
  }

  if (typeof updatePortfolioChatbotLanguage === "function") {
    updatePortfolioChatbotLanguage(activeLanguage);
  }

  if (typeof updateAiFlowPuzzleLanguage === "function") {
    updateAiFlowPuzzleLanguage(activeLanguage);
  }
}

document.querySelectorAll("[data-lang-switch]").forEach((button) => {
  button.addEventListener("click", () =>
    applyLanguage(button.dataset.langSwitch),
  );
});

