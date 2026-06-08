function openDrivePreviews() {
  const driveFileId = "1Uvb0jqeYiesN_W2b5M7H6MIWdLtyE8oR";
  const drivePreviewLink = `https://drive.google.com/file/d/${driveFileId}/view?usp=sharing`;
  window.open(drivePreviewLink, "_blank", "noopener,noreferrer");
}

const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector("[data-nav]");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("is-open");
    navToggle.classList.toggle("is-open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("is-open");
      navToggle.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = new Date().getFullYear();
});

const siteThemeState = {
  current: "dark",
};

function getStoredSiteTheme() {
  try {
    return localStorage.getItem("kaanbalci-site-theme") === "light" ? "light" : "dark";
  } catch (error) {
    return "dark";
  }
}

function applySiteTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  siteThemeState.current = nextTheme;
  document.documentElement.setAttribute("data-theme", nextTheme);

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const icon = button.querySelector("i");
    const label = button.querySelector("[data-theme-label]");
    const isLight = nextTheme === "light";
    const isTurkish = (document.documentElement.lang || "en") === "tr";

    if (icon) {
      icon.className = isLight ? "bx bx-sun" : "bx bx-moon";
    }

    if (label) {
      label.textContent = isLight ? (isTurkish ? "Açık" : "Light") : (isTurkish ? "Koyu" : "Dark");
    }

    button.setAttribute("aria-label", isLight ? (isTurkish ? "Koyu temaya geç" : "Switch to dark theme") : (isTurkish ? "Açık temaya geç" : "Switch to light theme"));
    button.setAttribute("title", isLight ? (isTurkish ? "Koyu temaya geç" : "Switch to dark theme") : (isTurkish ? "Açık temaya geç" : "Switch to light theme"));
    button.setAttribute("aria-pressed", String(isLight));
  });

  try {
    localStorage.setItem("kaanbalci-site-theme", nextTheme);
  } catch (error) {
    // Ignore storage errors.
  }
}

function setupSiteThemeToggle() {
  applySiteTheme(getStoredSiteTheme());

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      applySiteTheme(siteThemeState.current === "light" ? "dark" : "light");
    });
  });
}

setupSiteThemeToggle();


function setupPortfolioImageFallbacks() {
  document.addEventListener("error", (event) => {
    const image = event.target;
    if (!image || image.tagName !== "IMG" || image.dataset.fallbackApplied === "true") return;

    image.dataset.fallbackApplied = "true";
    const currentSource = image.getAttribute("src") || "";
    const fallbackSource = currentSource.toLowerCase().includes("joyday")
      ? "assets/joyday-homepage-preview.webp"
      : "assets/KAAN BALCI-BÜYÜK LOGO PNG.png";

    if (currentSource !== fallbackSource) {
      image.src = fallbackSource;
    }
  }, true);
}

setupPortfolioImageFallbacks();


const filterButtons = document.querySelectorAll("[data-filter-btn]");
const projectCards = document.querySelectorAll(".project-card[data-category]");

if (filterButtons.length && projectCards.length) {
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedCategory = button.dataset.filterBtn;

      filterButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      projectCards.forEach((card) => {
        const categories = card.dataset.category.split(" ");
        const shouldShow = selectedCategory === "all" || categories.includes(selectedCategory);
        card.classList.toggle("is-hidden", !shouldShow);
      });
    });
  });
}

const modal = document.querySelector("[data-modal]");
const modalImg = document.querySelector("[data-modal-img]");
const modalClose = document.querySelector("[data-modal-close]");
const certificateCards = document.querySelectorAll("[data-cert]");

function closeModal() {
  if (!modal || !modalImg) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modalImg.src = "";
}

if (modal && modalImg && certificateCards.length) {
  certificateCards.forEach((card) => {
    card.addEventListener("click", () => {
      modalImg.src = card.dataset.cert;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
    });
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}


const i18nTranslations = {
  "tr": {
    "Home": "Ana Sayfa",
    "Works": "Projeler",
    "Experience": "Deneyim",
    "Certificates": "Sertifikalar",
    "About": "Hakkımda",
    "Request": "Talep",
    "Request a Project": "Proje Talebi Gönder",
    "Project request": "Proje talebi",
    "Tell me what you want to build.": "Ne geliştirmek istediğini anlat.",
    "Fill out a short request form for AI workflows, automation, websites, dashboards or software projects. I will review the details and get back to you with the next steps.": "AI iş akışları, otomasyon, web siteleri, dashboardlar veya yazılım projeleri için kısa talep formunu doldur. Detayları inceleyip sonraki adımlarla dönüş yapacağım.",
    "How it works": "Nasıl çalışır",
    "Simple request flow.": "Basit talep akışı.",
    "Share the idea": "Fikri paylaş",
    "Describe what you need, your goal, timeline and contact information.": "Neye ihtiyacın olduğunu, hedefini, zaman planını ve iletişim bilgilerini anlat.",
    "I review the scope": "Kapsamı incelerim",
    "I check the technical direction, project type and possible next steps.": "Teknik yönü, proje türünü ve olası sonraki adımları kontrol ederim.",
    "You get a reply": "Dönüş alırsın",
    "Your request is sent by email, and you receive a confirmation message.": "Talebin e-posta ile iletilir ve sana onay mesajı gelir.",
    "Good for": "Uygun alanlar",
    "For urgent requests, you can also use the email and LinkedIn buttons after submitting the form.": "Acil talepler için formu gönderdikten sonra e-posta ve LinkedIn butonlarını da kullanabilirsin.",
    "Full Name *": "Ad Soyad *",
    "Your name": "Adın soyadın",
    "Email *": "E-posta *",
    "Phone / WhatsApp": "Telefon / WhatsApp",
    "Company / Brand": "Şirket / Marka",
    "Optional": "İsteğe bağlı",
    "Project Type *": "Proje Türü *",
    "Select a project type": "Proje türü seç",
    "AI workflow / chatbot flow": "AI workflow / chatbot akışı",
    "Website / portfolio / landing page": "Web sitesi / portfolyo / landing page",
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
    "Timeline": "Zaman Planı",
    "Flexible": "Esnek",
    "1-2 weeks": "1-2 hafta",
    "1 month": "1 ay",
    "Long-term collaboration": "Uzun vadeli iş birliği",
    "Preferred Contact": "Tercih Edilen İletişim",
    "Project Details *": "Proje Detayları *",
    "What do you want to build? What problem should it solve?": "Ne geliştirmek istiyorsun? Hangi problemi çözmeli?",
    "I agree that this information can be used to contact me about my request.": "Bu bilgilerin talebim hakkında benimle iletişime geçmek için kullanılmasını kabul ediyorum.",
    "Send Request": "Talebi Gönder",
    "Email Instead": "E-posta ile Gönder",

    "View Resume": "CV'yi Görüntüle",
    "View Projects": "Projeleri Gör",
    "Contact Me": "İletişime Geç",
    "Open GitHub": "GitHub'da Aç",
    "Open Website": "Siteyi Aç",
    "View Experience": "Deneyimi Gör",
    "View Details": "Detayları Gör",
    "Online Form": "Online Form",
    "If you prefer Google Forms, you can use the Online Form option as an alternative.": "Google Forms üzerinden doldurmayı tercih edersen alternatif olarak Online Form seçeneğini kullanabilirsin.",
    "Project Detail": "Proje Detayı",
    "Loading project...": "Proje yükleniyor...",
    "Please wait while the selected project details are prepared.": "Seçilen proje detayları hazırlanırken lütfen bekle.",
    "See Experience": "Deneyimi Gör",
    "View All Works": "Tüm Projeleri Gör",
    "Send Email": "E-posta Gönder",
    "LinkedIn": "LinkedIn",
    "Contact": "İletişim",
    "Get in Touch": "İletişime Geç",
    "Company Website": "Şirket Sitesi",
    "Event Page": "Etkinlik Sayfası",
    "Event Website": "Etkinlik Sitesi",
    "AI Designer & Software Developer building practical AI workflows and scalable software systems.": "Pratik AI iş akışları ve ölçeklenebilir yazılım sistemleri geliştiren AI Designer & Software Developer.",
    "Kaan Balcı. All rights reserved.": "Kaan Balcı. Tüm hakları saklıdır.",
    "AI Designer • Software Developer • Automation Builder": "AI Designer • Software Developer • Otomasyon Geliştirici",
    "I design AI workflows and build software products that turn ideas into": "AI iş akışları tasarlıyor ve fikirleri",
    "scalable systems.": "ölçeklenebilir sistemlere dönüştüren yazılım ürünleri geliştiriyorum.",
    "I am a result-oriented AI Designer and Software Developer with hands-on experience across AI, automation, backend systems, responsive web/mobile development, and game development. I focus on practical AI workflows, chatbot logic, clean software architecture, and product-oriented solutions.": "AI, otomasyon, backend sistemleri, responsive web/mobil geliştirme ve oyun geliştirme alanlarında uygulamalı deneyime sahip, sonuç odaklı bir AI Designer ve Software Developer'ım. Pratik AI iş akışları, chatbot mantığı, temiz yazılım mimarisi ve ürün odaklı çözümler üzerine çalışıyorum.",
    "Available for AI & Software roles": "AI & Software rolleri için uygun",
    "Istanbul / Remote": "İstanbul / Remote",
    "Projects": "Proje",
    "GPA / Computer Programming": "GNO / Bilgisayar Programcılığı",
    "CBOT AI Designer experience": "CBOT AI Designer deneyimi",
    "Chatbot, IVR and automation workflows": "Chatbot, IVR ve otomasyon iş akışları",
    "Web, backend, mobile and game systems": "Web, backend, mobil ve oyun sistemleri",
    "What I do": "Neler yapıyorum",
    "From AI workflows to working software.": "AI iş akışlarından çalışan yazılım ürünlerine.",
    "I combine software logic, automation thinking, and practical AI experience to design systems that are clear, usable, and maintainable.": "Net, kullanılabilir ve sürdürülebilir sistemler tasarlamak için yazılım mantığını, otomasyon bakış açısını ve pratik AI deneyimini birleştiriyorum.",
    "AI Workflow Design": "AI İş Akışı Tasarımı",
    "Chatbot flows, prompt logic, response quality evaluation, IVR and multi-channel automation design.": "Chatbot akışları, prompt mantığı, yanıt kalitesi değerlendirmesi, IVR ve çok kanallı otomasyon tasarımı.",
    "Software Development": "Yazılım Geliştirme",
    "Backend logic, C#/.NET automation, Python workflows, PHP/MySQL systems and clean web interfaces.": "Backend mantığı, C#/.NET otomasyonları, Python iş akışları, PHP/MySQL sistemleri ve temiz web arayüzleri.",
    "Web & Mobile Products": "Web & Mobil Ürünler",
    "Responsive websites, reservation flows, Android apps, data collection systems and product interfaces.": "Responsive web siteleri, rezervasyon akışları, Android uygulamaları, veri toplama sistemleri ve ürün arayüzleri.",
    "Game Development": "Oyun Geliştirme",
    "Unity and Unreal Engine projects using C#, C++, Blueprints, gameplay systems and OOP principles.": "C#, C++, Blueprints, gameplay sistemleri ve OOP prensipleriyle Unity ve Unreal Engine projeleri.",
    "Recent experience": "Son deneyimler",
    "AI, automation and product-focused work.": "AI, otomasyon ve ürün odaklı çalışmalar.",
    "My recent work is centered around AI-powered chatbot systems, LLM evaluation, automation flows, and real business websites.": "Son çalışmalarım AI destekli chatbot sistemleri, LLM değerlendirme, otomasyon akışları ve gerçek işletme web siteleri üzerine yoğunlaşıyor.",
    "Designed chatbot solutions and n8n-based AI Flow automations for banks, municipalities and enterprise clients.": "Bankalar, belediyeler ve kurumsal müşteriler için chatbot çözümleri ve n8n tabanlı AI Flow otomasyonları tasarladım.",
    "Evaluating AI responses, code outputs, prompts and multimodal interactions for modern LLM workflows.": "Modern LLM iş akışları için AI yanıtlarını, kod çıktılarını, promptları ve multimodal etkileşimleri değerlendiriyorum.",
    "Built the studio website and digital reservation workflow for package selection and customer tracking.": "Paket seçimi ve müşteri takibi için stüdyo web sitesini ve dijital rezervasyon akışını geliştirdim.",
    "Featured works": "Öne çıkan projeler",
    "Selected projects with real product value.": "Gerçek ürün değeri taşıyan seçili projeler.",
    "A focused selection of AI, web, data, mobile and game projects that best represent my technical direction.": "Teknik yönümü en iyi temsil eden AI, web, veri, mobil ve oyun projelerinden seçilmiş odaklı bir liste.",
    "Mobile Game": "Mobil Oyun",
    "A hyper-casual 3D mobile driving simulation game focused on score, reflexes and obstacle navigation.": "Skor, refleks ve engellerden kaçınma üzerine kurulu hyper-casual 3D mobil sürüş simülasyonu.",
    "A Windows Forms hospital appointment automation system with a complex multi-form structure.": "Karmaşık çok formlu yapıya sahip Windows Forms hastane randevu otomasyon sistemi.",
    "Cars Dataset Analysis": "Cars Veri Seti Analizi",
    "A Python-based data analysis project exploring insights from the Cars dataset.": "Cars veri setinden içgörüler çıkarmaya odaklanan Python tabanlı veri analizi projesi.",
    "Let’s build something useful": "Gel işe yarar bir şey geliştirelim",
    "Looking for an AI Designer or Software Developer?": "AI Designer veya Software Developer mı arıyorsunuz?",
    "I can contribute to AI workflow design, chatbot systems, automation logic, web products, backend tools and software development teams.": "AI iş akışı tasarımı, chatbot sistemleri, otomasyon mantığı, web ürünleri, backend araçları ve yazılım geliştirme ekiplerine katkı sağlayabilirim.",
    "Portfolio": "Portfolyo",
    "Works that show my range across AI, software and games.": "AI, yazılım ve oyun alanlarındaki genişliğimi gösteren projeler.",
    "A curated project catalog designed for recruiters and technical teams to quickly understand what I build, which technologies I use, and how each project fits into my long-term direction.": "Recruiter'ların ve teknik ekiplerin ne geliştirdiğimi, hangi teknolojileri kullandığımı ve projelerin uzun vadeli yönüme nasıl oturduğunu hızlıca anlaması için hazırlanmış seçili proje kataloğu.",
    "All": "Tümü",
    "AI & Automation": "AI & Otomasyon",
    "Web": "Web",
    "Game": "Oyun",
    "Mobile": "Mobil",
    "Data / Backend": "Veri / Backend",
    "AI Chatbot Flow Design": "AI Chatbot Akış Tasarımı",
    "Enterprise chatbot flow design experience including requirement analysis, automation logic and multi-channel AI flow planning.": "Gereksinim analizi, otomasyon mantığı ve çok kanallı AI akış planlamasını içeren kurumsal chatbot akışı tasarım deneyimi.",
    "Atölye Joyday Website & Reservation Workflow": "Atölye Joyday Web Sitesi & Rezervasyon Akışı",
    "Business website and digital reservation workflow for package selection, customer data collection and operational tracking.": "Paket seçimi, müşteri veri toplama ve operasyon takibi için işletme web sitesi ve dijital rezervasyon akışı.",
    "A hyper-casual 3D mobile driving simulation game focused on obstacle avoidance, score and reflex-based gameplay.": "Engellerden kaçınma, skor ve refleks odaklı oynanışa sahip hyper-casual 3D mobil sürüş simülasyonu.",
    "A 2D physics-based projectile game inspired by precision aiming, tower destruction and strategic shots.": "Hassas nişan alma, kule yıkımı ve stratejik atışlardan ilham alan 2D fizik tabanlı fırlatma oyunu.",
    "A Unity learning project containing multiple scenes, each focused on different gameplay fundamentals and mechanics.": "Her biri farklı gameplay temellerine ve mekaniklere odaklanan çok sahneli Unity öğrenme projesi.",
    "A third-person action shooter prototype with enemy AI, health management and combat-focused gameplay systems.": "Düşman AI, sağlık yönetimi ve savaş odaklı gameplay sistemleri içeren üçüncü şahıs aksiyon shooter prototipi.",
    "A third-person tank combat game prototype built with Unreal Engine, Blueprints, C++ and physics-based gameplay.": "Unreal Engine, Blueprints, C++ ve fizik tabanlı gameplay ile geliştirilen üçüncü şahıs tank savaş oyunu prototipi.",
    "A comprehensive appointment automation system written in C# with MSSQL and a complex multi-form structure.": "C# ve MSSQL ile geliştirilmiş, karmaşık çok formlu yapıya sahip kapsamlı randevu otomasyon sistemi.",
    "A Python-based dataset analysis project built to explore, process and present insights from automotive data.": "Otomotiv verilerini keşfetmek, işlemek ve içgörü sunmak için geliştirilmiş Python tabanlı veri analizi projesi.",
    "Instagram Clone App – My Museum": "Instagram Clone App – My Museum",
    "An Android application built with Kotlin and Firebase to replicate core Instagram-style content features.": "Instagram tarzı temel içerik özelliklerini yeniden oluşturan Kotlin ve Firebase ile geliştirilmiş Android uygulaması.",
    "A detailed e-commerce control panel project designed with a team for a school project using web and database tools.": "Web ve veritabanı araçları kullanılarak ekip ile okul projesi kapsamında tasarlanmış detaylı e-ticaret kontrol paneli.",
    "A JavaScript weather application that fetches forecast data and presents location-based weather information.": "Hava durumu verilerini çeken ve konuma göre hava bilgisi sunan JavaScript uygulaması.",
    "More code": "Daha fazla kod",
    "Want to inspect the full repository list?": "Tüm repository listesini incelemek ister misin?",
    "My GitHub contains additional learning projects, school projects, experiments and archived builds.": "GitHub hesabımda ek öğrenme projeleri, okul projeleri, deneyler ve arşivlenmiş çalışmalar bulunuyor.",
    "Professional timeline shaped by AI, software, operations and product thinking.": "AI, yazılım, operasyon ve ürün düşüncesiyle şekillenen profesyonel zaman çizelgesi.",
    "I have worked across AI workflows, software development, event operations and entrepreneurship. This combination helps me understand both technical systems and real business processes.": "AI iş akışları, yazılım geliştirme, etkinlik operasyonları ve girişimcilik alanlarında çalıştım. Bu kombinasyon hem teknik sistemleri hem de gerçek iş süreçlerini anlamamı sağlıyor.",
    "Core direction": "Ana yönelim",
    "My current career direction is AI Designer / Software Developer roles where I can design chatbot systems, automate workflows, evaluate LLM quality, and build useful software products.": "Güncel kariyer yönelimim; chatbot sistemleri tasarlayabileceğim, iş akışlarını otomatikleştirebileceğim, LLM kalitesini değerlendirebileceğim ve faydalı yazılım ürünleri geliştirebileceğim AI Designer / Software Developer rolleri.",
    "Istanbul | Sep 2025 – Oct 2025": "İstanbul | Eyl 2025 – Eki 2025",
    "Designed and delivered customized chatbot solutions for private companies, municipalities, and banks using CBOT's AI Flow platform across multiple chatbot frameworks. Collaborated with clients to gather requirements, supported internal teams on high-impact projects, and gained hands-on experience in IVR integration and multi-channel AI flow design.": "CBOT'un AI Flow platformunu kullanarak özel şirketler, belediyeler ve bankalar için birden fazla chatbot framework'ünde özelleştirilmiş chatbot çözümleri tasarladım ve teslim ettim. Müşteri gereksinimlerini topladım, yüksek etkili projelerde iç ekipleri destekledim ve IVR entegrasyonu ile çok kanallı AI akış tasarımında uygulamalı deneyim kazandım.",
    "n8n-based Logic": "n8n Tabanlı Mantık",
    "Enterprise Chatbots": "Kurumsal Chatbotlar",
    "Remote | Apr 2025 – Present": "Remote | Nis 2025 – Günümüz",
    "Evaluating and improving AI-generated responses, voice interactions, prompts, and code outputs for modern LLM workflows. Focused on response quality assessment, reasoning accuracy, multimodal interaction review, and code output validation.": "Modern LLM iş akışları için AI tarafından üretilen yanıtları, sesli etkileşimleri, promptları ve kod çıktılarını değerlendirip iyileştiriyorum. Yanıt kalitesi değerlendirmesi, akıl yürütme doğruluğu, multimodal etkileşim incelemesi ve kod çıktısı doğrulamasına odaklanıyorum.",
    "Prompt Review": "Prompt İnceleme",
    "Code QA": "Kod QA",
    "AI Quality": "AI Kalitesi",
    "Istanbul | 2026 – Present": "İstanbul | 2026 – Günümüz",
    "Atölye Joyday – Co-Founder & Web Developer": "Atölye Joyday – Co-Founder & Web Developer",
    "Co-founded a creative workshop studio offering action painting, creative drama, workshops, and private event experiences. Designed and developed the official website using HTML, CSS, JavaScript, and responsive web design principles while building a digital reservation workflow for package selection, customer data collection, and operational tracking.": "Action painting, yaratıcı drama, workshoplar ve özel etkinlik deneyimleri sunan yaratıcı atölyenin kurucu ortaklarından biri oldum. HTML, CSS, JavaScript ve responsive web tasarım prensipleriyle resmi web sitesini tasarlayıp geliştirdim; paket seçimi, müşteri veri toplama ve operasyon takibi için dijital rezervasyon akışı kurdum.",
    "Entrepreneurship": "Girişimcilik",
    "Website": "Web Sitesi",
    "Reservation Flow": "Rezervasyon Akışı",
    "Operations": "Operasyon",
    "Izmir | Jan 2023 – Apr 2025": "İzmir | Oca 2023 – Nis 2025",
    "Punto Organization – Junior Software Developer": "Punto Organization – Junior Software Developer",
    "Developed predictive algorithms to support internal decision-making using Python. Optimized database architecture to enhance performance and integrity. Took part in hybrid workflows combining software development with operational processes.": "Python kullanarak iç karar alma süreçlerini destekleyen tahmine dayalı algoritmalar geliştirdim. Performans ve veri bütünlüğünü artırmak için veritabanı mimarisini optimize ettim. Yazılım geliştirme ile operasyonel süreçleri birleştiren hibrit iş akışlarında görev aldım.",
    "Database": "Veritabanı",
    "Izmir | Jul 2024 – Sep 2024": "İzmir | Tem 2024 – Eyl 2024",
    "Punto Organization – Database Developer Intern": "Punto Organization – Database Developer Intern",
    "Built a web-based event tracking dashboard using PHP, JavaScript, HTML, CSS, and MySQL. Applied academic knowledge in a real-world context and gained hands-on experience in full-stack development and database management.": "PHP, JavaScript, HTML, CSS ve MySQL kullanarak web tabanlı etkinlik takip dashboard'u geliştirdim. Akademik bilgimi gerçek iş ortamında uyguladım; full-stack geliştirme ve veritabanı yönetiminde uygulamalı deneyim kazandım.",
    "Izmir | Jul 2022 – Present": "İzmir | Tem 2022 – Günümüz",
    "Punto Organization – Event Operations Supervisor": "Punto Organization – Event Operations Supervisor",
    "Led on-site operations for congresses, seminars, and product launches for top pharmaceutical companies in Turkey. Managed staff and ensured high levels of client satisfaction throughout planning and execution phases.": "Türkiye'deki önde gelen ilaç firmaları için kongre, seminer ve ürün lansmanlarında saha operasyonlarını yönettim. Personel yönetimi yaptım ve planlama ile uygulama aşamalarında yüksek müşteri memnuniyeti sağladım.",
    "Leadership": "Liderlik",
    "Client Management": "Müşteri Yönetimi",
    "Istanbul | Jan 2020 – Jun 2022": "İstanbul | Oca 2020 – Haz 2022",
    "Ocean’s Team – Event Operations & Website Specialist": "Ocean’s Team – Event Operations & Website Specialist",
    "Managed operational workflows for corporate events involving high-profile clients including Sabancı, Koç Group, and major banks. Supervised teams and contributed to the company’s web content and digital presence.": "Sabancı, Koç Group ve büyük bankalar gibi yüksek profilli müşterilerin kurumsal etkinliklerinde operasyonel iş akışlarını yönettim. Ekipleri koordine ettim ve şirketin web içeriği ile dijital varlığına katkı sağladım.",
    "Web Content": "Web İçeriği",
    "Team Management": "Ekip Yönetimi",
    "Izmir University of Economics | Dec 2023": "İzmir Ekonomi Üniversitesi | Ara 2023",
    "Gameathon – Game Development Hackathon": "Gameathon – Oyun Geliştirme Hackathon'u",
    "Led a team during a 24-hour game development competition. Focused on game logic, design, and presentation using visual scripting tools. Ranked 4th out of 15 teams.": "24 saatlik oyun geliştirme yarışmasında ekibe liderlik ettim. Görsel scripting araçlarıyla oyun mantığı, tasarım ve sunuma odaklandım. 15 takım arasında 4. olduk.",
    "Game Design": "Oyun Tasarımı",
    "Team Lead": "Takım Liderliği",
    "Izmir – May 2022 | Istanbul – Sep 2022": "İzmir – May 2022 | İstanbul – Eyl 2022",
    "Mobidictum Conference": "Mobidictum Konferansı",
    "Participated in Turkey’s leading game development conferences, attended sessions on game economy, development tools, and studio management, and expanded my professional network in the game industry.": "Türkiye'nin önde gelen oyun geliştirme konferanslarına katıldım; oyun ekonomisi, geliştirme araçları ve stüdyo yönetimi oturumlarını takip ederek oyun sektöründeki profesyonel ağımı genişlettim.",
    "Game Industry": "Oyun Sektörü",
    "Networking": "Network",
    "Conference": "Konferans",
    "Software logic, AI workflows and product thinking in one profile.": "Yazılım mantığı, AI iş akışları ve ürün düşüncesi tek profilde.",
    "I am building a career at the intersection of artificial intelligence, automation and software development. My strength is combining technical execution with practical business understanding.": "Yapay zeka, otomasyon ve yazılım geliştirmenin kesişiminde bir kariyer inşa ediyorum. Güçlü tarafım teknik uygulamayı pratik iş anlayışıyla birleştirmek.",
    "AI Designer & Software Developer": "AI Designer & Software Developer",
    "Istanbul / Turkey": "İstanbul / Türkiye",
    "Professional profile": "Profesyonel profil",
    "Result-oriented developer focused on intelligent and scalable systems.": "Akıllı ve ölçeklenebilir sistemlere odaklanan sonuç odaklı geliştirici.",
    "I graduated from Izmir University of Economics, Computer Programming, with a 3.07 GPA. I have taken active roles in 50+ projects across AI, backend, automation, web/mobile development and game development. My work combines hands-on software development with AI workflow design, chatbot logic and response quality evaluation.": "İzmir Ekonomi Üniversitesi Bilgisayar Programcılığı bölümünden 3.07 GNO ile mezun oldum. AI, backend, otomasyon, web/mobil geliştirme ve oyun geliştirme alanlarında 50+ projede aktif rol aldım. Çalışmalarım uygulamalı yazılım geliştirmeyi AI iş akışı tasarımı, chatbot mantığı ve yanıt kalitesi değerlendirmesiyle birleştiriyor.",
    "In 2025, I worked as an AI Designer at CBOT, where I designed chatbot solutions and automation flows for banks, municipalities and enterprise clients. I also work with LLM-based systems such as ChatGPT, Gemini, LLaMA, Claude and Grok by evaluating responses, improving prompts and reviewing code outputs.": "2025 yılında CBOT'ta AI Designer olarak çalıştım; bankalar, belediyeler ve kurumsal müşteriler için chatbot çözümleri ve otomasyon akışları tasarladım. Ayrıca ChatGPT, Gemini, LLaMA, Claude ve Grok gibi LLM tabanlı sistemlerde yanıtları değerlendiriyor, promptları iyileştiriyor ve kod çıktılarını inceliyorum.",
    "My long-term goal is to build intelligent, scalable and impactful products that combine strong software architecture with practical AI capabilities.": "Uzun vadeli hedefim güçlü yazılım mimarisini pratik AI yetenekleriyle birleştiren akıllı, ölçeklenebilir ve etkili ürünler geliştirmek.",
    "Email Me": "E-posta Gönder",
    "Capability map": "Yetkinlik haritası",
    "The areas I can contribute to.": "Katkı sağlayabileceğim alanlar.",
    "I can work across product logic, automation design, backend implementation, web interfaces and AI quality workflows.": "Ürün mantığı, otomasyon tasarımı, backend geliştirme, web arayüzleri ve AI kalite iş akışlarında çalışabilirim.",
    "Chatbot flow design": "Chatbot akışı tasarımı",
    "n8n-based automation logic": "n8n tabanlı otomasyon mantığı",
    "LLM response evaluation": "LLM yanıt değerlendirmesi",
    "Prompt and code output review": "Prompt ve kod çıktısı inceleme",
    "IVR and multi-channel flow awareness": "IVR ve çok kanallı akış farkındalığı",
    "Python data analysis and automation": "Python veri analizi ve otomasyon",
    "C#/.NET Windows Forms systems": "C#/.NET Windows Forms sistemleri",
    "PHP and MySQL web systems": "PHP ve MySQL web sistemleri",
    "JavaScript interfaces": "JavaScript arayüzleri",
    "Database design and dashboards": "Veritabanı tasarımı ve dashboardlar",
    "Web, Mobile & Games": "Web, Mobil & Oyun",
    "Responsive websites": "Responsive web siteleri",
    "Android apps with Java/Kotlin": "Java/Kotlin ile Android uygulamaları",
    "Unity development with C#": "C# ile Unity geliştirme",
    "Unreal Engine with C++ and Blueprints": "C++ ve Blueprints ile Unreal Engine",
    "Product-oriented project presentation": "Ürün odaklı proje sunumu",
    "How I work": "Nasıl çalışıyorum",
    "I prefer clear requirements, testable logic and usable output.": "Net gereksinimler, test edilebilir mantık ve kullanılabilir çıktı tercih ederim.",
    "Whether it is a chatbot flow, a dashboard, a website or a game mechanic, my process is to understand the user, structure the logic, build the system and refine it through testing.": "İster chatbot akışı, ister dashboard, ister web sitesi ya da oyun mekaniği olsun; sürecim kullanıcıyı anlamak, mantığı yapılandırmak, sistemi kurmak ve testlerle geliştirmek üzerine kurulu.",
    "Understand the goal": "Hedefi anla",
    "Clarify the user need, business requirement, data source and expected result.": "Kullanıcı ihtiyacını, iş gereksinimini, veri kaynağını ve beklenen sonucu netleştir.",
    "Design the logic": "Mantığı tasarla",
    "Map the flow, system structure, edge cases and core interaction path.": "Akışı, sistem yapısını, edge case'leri ve temel etkileşim yolunu haritala.",
    "Build and improve": "Geliştir ve iyileştir",
    "Implement, test, refine and keep the output maintainable for real usage.": "Uygula, test et, iyileştir ve çıktıyı gerçek kullanım için sürdürülebilir tut.",
    "Toolbox": "Araç Kutusu",
    "Technologies I use.": "Kullandığım teknolojiler.",
    "Languages": "Diller",
    "Python, C#, JavaScript, PHP, Java, Kotlin, C++": "Python, C#, JavaScript, PHP, Java, Kotlin, C++",
    "ChatGPT, Gemini, LLaMA, Claude, Grok, n8n, AI Flow, prompt evaluation": "ChatGPT, Gemini, LLaMA, Claude, Grok, n8n, AI Flow, prompt değerlendirme",
    "Databases": "Veritabanları",
    "MySQL, MSSQL, SQLite, Firebase, Google Sheets workflows": "MySQL, MSSQL, SQLite, Firebase, Google Sheets iş akışları",
    "Game Engines": "Oyun Motorları",
    "Unity, Unreal Engine, Blueprints, OOP, gameplay logic": "Unity, Unreal Engine, Blueprints, OOP, gameplay mantığı",
    "Continuous learning across software, game development and networking.": "Yazılım, oyun geliştirme ve networking alanlarında sürekli öğrenme.",
    "A cleaner certificate gallery grouped into modern cards. Click any certificate to preview it in a larger view.": "Modern kartlara ayrılmış daha temiz bir sertifika galerisi. Herhangi bir sertifikaya tıklayarak büyük önizleme açabilirsin.",
    "Web Design": "Web Tasarım",
    "Linux Essentials": "Linux Essentials",
    "Network Essentials": "Network Essentials",
    "Packet Tracer": "Packet Tracer"
  }
};

Object.assign(i18nTranslations.tr, {
  "Available for roles": "Roller için uygun",
  "Recruiter Mode": "Recruiter Modu",
  "Download Portfolio PDF": "Portfolyo PDF İndir",
  "Milestone journey": "Dönüm noktaları",
  "From operations to AI-driven software products.": "Operasyondan AI odaklı yazılım ürünlerine.",
  "My background combines field operations, software projects, AI workflow design and real business product experience.": "Geçmişim saha operasyonları, yazılım projeleri, AI iş akışı tasarımı ve gerçek işletme ürün deneyimini birleştiriyor.",
  "Operations & web content": "Operasyon & web içeriği",
  "Worked on event operations, team coordination and digital content responsibilities.": "Etkinlik operasyonları, ekip koordinasyonu ve dijital içerik sorumlulukları üzerinde çalıştım.",
  "Software foundations": "Yazılım temelleri",
  "Built university and personal projects across Java, Python, web interfaces and databases.": "Java, Python, web arayüzleri ve veritabanları alanlarında üniversite ve kişisel projeler geliştirdim.",
  "Backend, data and game systems": "Backend, veri ve oyun sistemleri",
  "Focused on C#, MSSQL, Python data analysis and Unreal Engine / Unity prototypes.": "C#, MSSQL, Python veri analizi ve Unreal Engine / Unity prototiplerine odaklandım.",
  "AI Designer direction": "AI Designer yönelimi",
  "Worked on chatbot flows, AI Flow logic, IVR awareness and LLM response quality evaluation.": "Chatbot akışları, AI Flow mantığı, IVR farkındalığı ve LLM yanıt kalitesi değerlendirmesi üzerinde çalıştım.",
  "Real product ownership": "Gerçek ürün sahipliği",
  "Built Atölye Joyday web and reservation workflows while shaping a stronger AI portfolio.": "Daha güçlü bir AI portföyü oluştururken Atölye Joyday web ve rezervasyon akışlarını geliştirdim.",
  "This route is not deployed yet.": "Bu rota henüz yayında değil.",
  "The page you are looking for may have moved, but the portfolio is still online. Use the shortcuts below or ask Ajoop.": "Aradığın sayfa taşınmış olabilir ama portfolyo hâlâ yayında. Aşağıdaki kısayolları kullanabilir veya Ajoop'a sorabilirsin.",
  "Go Home": "Ana Sayfaya Git",
  "View Works": "Projeleri Gör",
  "Ask Ajoop": "Ajoop'a Sor",
  "Copy Project Link": "Proje Linkini Kopyala",
  "Copied": "Kopyalandı"
});


Object.assign(i18nTranslations.tr, {
  "Algorithmic 3D lab": "Algoritmik 3D laboratuvarı",
  "Drag the model and see code turn math into motion.": "Modeli sürükle ve kodun matematiği harekete dönüştürmesini gör.",
  "A lightweight canvas demo built with vanilla JavaScript. The shape is generated from a triangular parametric mesh and rendered with perspective projection, depth sorting and mouse-controlled rotation.": "Vanilla JavaScript ile geliştirilmiş hafif bir canvas demosu. Şekil üçgensel parametrik mesh üzerinden üretilir; perspektif projeksiyon, derinlik sıralama ve mouse kontrollü dönüşle çizilir.",
  "Drag to rotate • Scroll to zoom": "Döndürmek için sürükle • Yakınlaşmak için kaydır",
  "Vanilla JS": "Vanilla JS",
  "Triangular surface generated by an algorithm.": "Algoritma ile üretilen üçgensel yüzey.",
  "The mesh is calculated with barycentric coordinates, animated through a wave function and projected onto the canvas without any external 3D library.": "Mesh barycentric koordinatlarla hesaplanır, dalga fonksiyonu ile animasyonlanır ve harici 3D kütüphane olmadan canvas üzerine projekte edilir.",
  "Canvas": "Canvas",
  "3D Projection": "3D Projeksiyon",
  "Parametric Mesh": "Parametrik Mesh",
  "Mouse Interaction": "Mouse Etkileşimi"
});
const i18nTitleTranslations = {
  "tr": {
    "Kaan Balcı | AI Designer & Software Developer": "Kaan Balcı | AI Designer & Software Developer",
    "Works | Kaan Balcı": "Projeler | Kaan Balcı",
    "Experience | Kaan Balcı": "Deneyim | Kaan Balcı",
    "About | Kaan Balcı": "Hakkımda | Kaan Balcı",
    "Certificates | Kaan Balcı": "Sertifikalar | Kaan Balcı",
    "Project Detail | Kaan Balcı": "Proje Detayı | Kaan Balcı",
    "Request a Project | Kaan Balcı": "Proje Talebi | Kaan Balcı"
  }
};
const i18nAttributeTranslations = {
  "tr": {
    "Kaan Balcı home page": "Kaan Balcı ana sayfası",
    "Kaan Balcı logo": "Kaan Balcı logosu",
    "Open navigation": "Menüyü aç",
    "Open details for AI Chatbot Flow Design": "AI Chatbot Akış Tasarımı detaylarını aç",
    "Open details for Atölye Joyday Website & Reservation Workflow": "Atölye Joyday Web Sitesi & Rezervasyon Akışı detaylarını aç",
    "Open details for Drivenfinity": "Drivenfinity detaylarını aç",
    "Open details for Dunker Madness": "Dunker Madness detaylarını aç",
    "Open details for Unity Essentials": "Unity Essentials detaylarını aç",
    "Open details for Extract Shoot: Zero": "Extract Shoot: Zero detaylarını aç",
    "Open details for Tank Savage": "Tank Savage detaylarını aç",
    "Open details for Hospital Form App": "Hospital Form App detaylarını aç",
    "Open details for Cars Dataset Analysis": "Cars Veri Seti Analizi detaylarını aç",
    "Open details for Instagram Clone App – My Museum": "Instagram Clone App – My Museum detaylarını aç",
    "Open details for Dashboard V2": "Dashboard V2 detaylarını aç",
    "Open details for Weather App": "Weather App detaylarını aç",
    "Language selector": "Dil seçici",
    "Profile highlight card": "Profil öne çıkan kartı",
    "Core technologies": "Temel teknolojiler",
    "Portfolio highlights": "Portfolyo öne çıkanlar",
    "Drivenfinity project preview": "Drivenfinity proje önizlemesi",
    "Hospital Form App preview": "Hospital Form App önizlemesi",
    "Cars dataset analysis preview": "Cars veri seti analizi önizlemesi",
    "Social links": "Sosyal bağlantılar"
  }
};
Object.assign(i18nTranslations.tr, {
  "Tech stack matrix": "Teknoloji matrisi",
  "Tools I use across AI, web, data and games.": "AI, web, veri ve oyun alanlarında kullandığım araçlar.",
  "A quick matrix that shows where each technology fits in my workflow and how I use it in real projects.": "Her teknolojinin iş akışımda nereye oturduğunu ve gerçek projelerde nasıl kullandığımı gösteren hızlı bir matris.",
  "AI & Automation": "AI & Otomasyon",
  "Chatbot flow design, AI Flow logic, n8n-style automation planning and LLM quality evaluation.": "Chatbot akışı tasarımı, AI Flow mantığı, n8n tarzı otomasyon planlama ve LLM kalite değerlendirmesi.",
  "Software & Backend": "Yazılım & Backend",
  "Automation systems, database-backed applications, dashboards and backend logic.": "Otomasyon sistemleri, veritabanı destekli uygulamalar, dashboardlar ve backend mantığı.",
  "Web & Mobile": "Web & Mobil",
  "Responsive websites, reservation flows, Android apps and product-focused interfaces.": "Responsive web siteleri, rezervasyon akışları, Android uygulamaları ve ürün odaklı arayüzler.",
  "Gameplay prototypes, OOP practice, physics logic, Unity projects and Unreal Engine systems.": "Gameplay prototipleri, OOP pratiği, fizik mantığı, Unity projeleri ve Unreal Engine sistemleri.",
  "Currently building": "Şu anda geliştirdiklerim",
  "Active directions I am improving right now.": "Şu anda geliştirdiğim aktif yönler.",
  "I keep the portfolio alive by turning real business needs, AI workflow ideas and software experiments into structured projects.": "Gerçek iş ihtiyaçlarını, AI iş akışı fikirlerini ve yazılım denemelerini düzenli projelere dönüştürerek portföyü canlı tutuyorum.",
  "AI workflow portfolio projects": "AI workflow portföy projeleri",
  "Designing sample chatbot and automation flows for recruiter-friendly AI Designer case studies.": "Recruiter dostu AI Designer case study'leri için örnek chatbot ve otomasyon akışları tasarlıyorum.",
  "Joyday data & reservation analysis": "Joyday veri & rezervasyon analizi",
  "Planning dashboards around reservation data, package demand, customer flow and operational tracking.": "Rezervasyon verisi, paket talebi, müşteri akışı ve operasyon takibi etrafında dashboardlar planlıyorum.",
  "Web product improvements": "Web ürün iyileştirmeleri",
  "Improving real websites with better UX, responsive layouts, form flows, SEO and performance checks.": "Gerçek web sitelerini daha iyi UX, responsive düzenler, form akışları, SEO ve performans kontrolleriyle geliştiriyorum.",
  "AI workflow demo": "AI workflow demosu",
  "See how I think through chatbot flow logic.": "Chatbot akış mantığını nasıl düşündüğümü gör.",
  "Select a scenario and the page will generate a simple AI flow map. This is a lightweight demo of how I structure intents, steps and user journeys.": "Bir senaryo seçtiğinde sayfa basit bir AI akış haritası oluşturur. Bu, kullanıcı amaçlarını, adımları ve kullanıcı yolculuklarını nasıl yapılandırdığımı gösteren hafif bir demodur.",
  "Bank": "Banka",
  "Municipality": "Belediye",
  "Workshop Studio": "Atölye Stüdyosu",
  "E-commerce": "E-ticaret",
  "Featured case study": "Öne çıkan vaka çalışması",
  "Atölye Joyday official website and reservation journey.": "Atölye Joyday resmi web sitesi ve rezervasyon yolculuğu.",
  "A real business project where I designed and built the website experience for a creative workshop studio. The project connects service presentation, package selection, reservation flow and operational tracking into one usable customer journey.": "Yaratıcı atölye stüdyosu için web deneyimini tasarlayıp geliştirdiğim gerçek bir işletme projesi. Proje; hizmet anlatımı, paket seçimi, rezervasyon akışı ve operasyon takibini tek kullanılabilir müşteri yolculuğunda birleştirir.",
  "Business website": "İşletme web sitesi",
  "Frontend stack": "Frontend stack",
  "Customer flow": "Müşteri akışı",
  "View Case Study": "Vaka Çalışmasını Gör",
  "Open Live Website": "Canlı Siteyi Aç",
  "More experiments on GitHub": "GitHub'da daha fazla deney",
  "Additional learning projects and archived builds.": "Ek öğrenme projeleri ve arşivlenmiş çalışmalar.",
  "The main catalog highlights selected projects, but my GitHub includes more practice repositories, university projects and experiments.": "Ana katalog seçili projeleri öne çıkarıyor; GitHub hesabımda ise daha fazla pratik repository, üniversite projesi ve deney bulunuyor.",
  "Java Projects": "Java Projeleri",
  "University and OOP practice repositories.": "Üniversite ve OOP pratik repository'leri.",
  "Python Projects": "Python Projeleri",
  "Automation, data and learning projects.": "Otomasyon, veri ve öğrenme projeleri.",
  "Calculator JS": "Calculator JS",
  "Frontend logic and UI practice.": "Frontend mantığı ve UI pratiği.",
  "JavaScript API and interface practice.": "JavaScript API ve arayüz pratiği.",
  "Contact hub": "İletişim merkezi",
  "Let’s talk about AI workflows, automation or software projects.": "AI iş akışları, otomasyon veya yazılım projeleri hakkında konuşalım.",
  "I am open to AI Designer, Software Developer and automation-focused roles where I can design useful flows and build practical software products.": "Faydalı akışlar tasarlayabileceğim ve pratik yazılım ürünleri geliştirebileceğim AI Designer, Software Developer ve otomasyon odaklı rollere açığım.",
  "Download CV": "CV'yi İndir",
  "Atölye Joyday Official Website": "Atölye Joyday Resmi Web Sitesi",
  "Live business website for a creative workshop studio with service pages, package presentation, responsive UX and reservation CTAs.": "Yaratıcı atölye stüdyosu için hizmet sayfaları, paket sunumu, responsive UX ve rezervasyon CTA'ları içeren canlı işletme web sitesi.",
  "Atölye Joyday Reservation Workflow": "Atölye Joyday Rezervasyon Akışı",
  "Dynamic reservation workflow for package selection, selected-package context, customer form data and operational tracking.": "Paket seçimi, seçili paket bağlamı, müşteri form verisi ve operasyon takibi için dinamik rezervasyon akışı."
});
Object.assign(i18nAttributeTranslations.tr, {
  "Open details for Atölye Joyday Official Website": "Atölye Joyday Resmi Web Sitesi detaylarını aç",
  "Open details for Atölye Joyday Reservation Workflow": "Atölye Joyday Rezervasyon Akışı detaylarını aç",
  "AI workflow scenarios": "AI workflow senaryoları",
  "Atölye Joyday package selection preview": "Atölye Joyday paket seçimi önizlemesi",
  "Atölye Joyday official website preview": "Atölye Joyday resmi web sitesi önizlemesi",
  "Atölye Joyday reservation workflow preview": "Atölye Joyday rezervasyon akışı önizlemesi",
  "Atölye Joyday official website preview": "Atölye Joyday resmi web sitesi önizlemesi",
  "Atölye Joyday reservation workflow preview": "Atölye Joyday rezervasyon akışı önizlemesi"
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
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }

      const key = normalizeI18nText(node.nodeValue);
      if (key && i18nTranslations.tr[key]) {
        node.__i18nKey = key;
        nodes.push(node);
      }
      return NodeFilter.FILTER_SKIP;
    },
  });

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
    const nextValue = activeLanguage === "tr" ? i18nAttributeTranslations.tr[item.key] : item.key;
    item.element.setAttribute(item.attributeName, nextValue);
  });

  document.title = activeLanguage === "tr"
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
}

document.querySelectorAll("[data-lang-switch]").forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.langSwitch));
});


const projectDetailData = {
  "ai-chatbot-flow-design": {
    category: { en: "AI & Automation", tr: "AI & Otomasyon" },
    title: { en: "AI Chatbot Flow Design", tr: "AI Chatbot Akış Tasarımı" },
    subtitle: {
      en: "Enterprise chatbot flow design experience shaped around requirements, automation logic, IVR awareness and multi-channel user journeys.",
      tr: "Gereksinimler, otomasyon mantığı, IVR farkındalığı ve çok kanallı kullanıcı yolculukları etrafında şekillenen kurumsal chatbot akış tasarımı deneyimi."
    },
    role: { en: "AI Designer", tr: "AI Designer" },
    year: "2025",
    type: { en: "Professional Experience", tr: "Profesyonel Deneyim" },
    status: { en: "Case Study", tr: "Vaka Çalışması" },
    image: "assets/KAAN BALCI-BÜYÜK LOGO PNG.png",
    gallery: ["assets/KAAN BALCI-BÜYÜK LOGO PNG.png"],
    stack: ["AI Flow", "n8n", "Chatbot Logic", "IVR", "Requirement Analysis", "Workflow Design"],
    links: [{ label: { en: "View Experience", tr: "Deneyimi Gör" }, url: "blog.html" }],
    overview: {
      en: "This project detail presents my enterprise chatbot flow design experience. The focus is not a single public repository, but a professional workflow area where I designed AI-powered chatbot flows for business needs.",
      tr: "Bu proje detayı kurumsal chatbot akış tasarımı deneyimimi anlatır. Odak tek bir public repository değil; iş ihtiyaçlarına göre AI destekli chatbot akışları tasarladığım profesyonel bir çalışma alanıdır."
    },
    challenge: {
      en: "Enterprise chatbot projects require clear intent structures, maintainable flow logic, user-friendly fallback paths and coordination between client requirements and internal implementation teams.",
      tr: "Kurumsal chatbot projeleri net intent yapıları, sürdürülebilir akış mantığı, kullanıcı dostu fallback yolları ve müşteri gereksinimleriyle iç ekip uygulamaları arasında koordinasyon gerektirir."
    },
    solution: {
      en: "I focused on mapping user journeys, structuring conversation logic, planning automation steps and translating business requirements into practical chatbot flows.",
      tr: "Kullanıcı yolculuklarını haritalamaya, konuşma mantığını yapılandırmaya, otomasyon adımlarını planlamaya ve iş gereksinimlerini pratik chatbot akışlarına dönüştürmeye odaklandım."
    },
    features: {
      en: ["Requirement-based chatbot flow planning", "Multi-channel AI flow awareness", "IVR integration experience", "n8n-based automation logic understanding", "Client communication and internal coordination"],
      tr: ["Gereksinim bazlı chatbot akışı planlama", "Çok kanallı AI akışı farkındalığı", "IVR entegrasyonu deneyimi", "n8n tabanlı otomasyon mantığı anlayışı", "Müşteri iletişimi ve iç ekip koordinasyonu"]
    }
  },
  "atolye-joyday-official-website": {
    category: { en: "Web Development", tr: "Web Geliştirme" },
    title: { en: "Atölye Joyday Official Website", tr: "Atölye Joyday Resmi Web Sitesi" },
    subtitle: {
      en: "A live business website for a creative workshop studio, built around service presentation, package discovery, reservation CTAs and mobile-first user experience.",
      tr: "Yaratıcı atölye stüdyosu için hizmet anlatımı, paket keşfi, rezervasyon CTA'ları ve mobil öncelikli kullanıcı deneyimi etrafında geliştirilen canlı işletme web sitesi."
    },
    role: { en: "Co-Founder & Web Developer", tr: "Kurucu Ortak & Web Developer" },
    year: "2026",
    type: { en: "Live Business Website", tr: "Canlı İşletme Web Sitesi" },
    status: { en: "Live", tr: "Canlı" },
    image: "assets/joyday-homepage-preview.webp",
    gallery: ["assets/joyday-homepage-preview.webp", "assets/joyday-reservation-preview.webp", "assets/joyday-brand-logo.webp"],
    stack: ["HTML", "CSS", "JavaScript", "Responsive Design", "UX Flow", "SEO Basics", "Reservation CTA"],
    links: [{ label: { en: "Open Live Website", tr: "Canlı Siteyi Aç" }, url: "https://atolyejoyday.com/" }],
    overview: {
      en: "Atölye Joyday is a real creative workshop studio website built to present services such as Action Painting, Creative Drama, Workshops and Private Events. The site turns a physical studio experience into a clear digital journey where visitors can discover services, compare packages and move toward reservation.",
      tr: "Atölye Joyday; Action Painting, Yaratıcı Drama, Workshoplar ve Özel Etkinlikler gibi hizmetleri sunmak için geliştirilen gerçek bir yaratıcı atölye web sitesidir. Site, fiziksel stüdyo deneyimini ziyaretçilerin hizmetleri keşfedebileceği, paketleri karşılaştırabileceği ve rezervasyona ilerleyebileceği net bir dijital yolculuğa dönüştürür."
    },
    challenge: {
      en: "The main challenge was presenting multiple service categories without confusing visitors, while keeping the reservation action visible and simple across desktop and mobile screens.",
      tr: "Temel zorluk, birden fazla hizmet kategorisini ziyaretçiyi yormadan sunmak ve masaüstü/mobil ekranlarda rezervasyon aksiyonunu görünür ve basit tutmaktı."
    },
    solution: {
      en: "I built a responsive multi-page structure with clear navigation, service-specific sections, package cards, visual hierarchy and reservation CTAs. The design keeps the brand colorful and friendly while maintaining a clean operational flow.",
      tr: "Net navigasyon, hizmete özel bölümler, paket kartları, görsel hiyerarşi ve rezervasyon CTA'ları içeren responsive çok sayfalı bir yapı geliştirdim. Tasarım markanın renkli ve samimi karakterini korurken operasyonel akışı temiz tutar."
    },
    impact: {
      en: "The website gave Atölye Joyday a professional digital presence and created a smoother path from discovery to reservation for real customers.",
      tr: "Web sitesi Atölye Joyday'e profesyonel bir dijital varlık kazandırdı ve gerçek müşteriler için keşiften rezervasyona daha akıcı bir yol oluşturdu."
    },
    process: {
      en: [
        { title: "Service mapping", text: "Structured the main service categories and decided how each one should be presented." },
        { title: "UX and layout", text: "Designed page sections, navigation, package cards and reservation CTAs around customer decisions." },
        { title: "Frontend build", text: "Implemented responsive pages with HTML, CSS and JavaScript." },
        { title: "Testing and polish", text: "Checked desktop, mobile, package flow and reservation entry points before launch." }
      ],
      tr: [
        { title: "Hizmet haritalama", text: "Ana hizmet kategorilerini yapılandırdım ve her birinin nasıl sunulacağını netleştirdim." },
        { title: "UX ve layout", text: "Sayfa bölümlerini, navigasyonu, paket kartlarını ve rezervasyon CTA'larını müşteri kararlarına göre tasarladım." },
        { title: "Frontend geliştirme", text: "HTML, CSS ve JavaScript ile responsive sayfaları geliştirdim." },
        { title: "Test ve polish", text: "Yayından önce masaüstü, mobil, paket akışı ve rezervasyon giriş noktalarını kontrol ettim." }
      ]
    },
    features: {
      en: ["Live real-business website", "Responsive service pages", "Action Painting package presentation", "Reservation-oriented customer journey", "Clear brand and visual hierarchy"],
      tr: ["Canlı gerçek işletme web sitesi", "Responsive hizmet sayfaları", "Action Painting paket sunumu", "Rezervasyon odaklı müşteri yolculuğu", "Net marka ve görsel hiyerarşi"]
    }
  },
  "atolye-joyday-reservation-workflow": {
    category: { en: "Web & Workflow", tr: "Web & İş Akışı" },
    title: { en: "Atölye Joyday Reservation Workflow", tr: "Atölye Joyday Rezervasyon Akışı" },
    subtitle: {
      en: "A real business website and package-based reservation workflow for a creative workshop studio.",
      tr: "Yaratıcı atölye stüdyosu için gerçek işletme web sitesi ve paket bazlı rezervasyon akışı."
    },
    role: { en: "Co-Founder & Web Developer", tr: "Kurucu Ortak & Web Developer" },
    year: "2026",
    type: { en: "Business Website", tr: "İşletme Web Sitesi" },
    status: { en: "Live", tr: "Canlı" },
    image: "assets/joyday-reservation-preview.webp",
    gallery: ["assets/joyday-reservation-preview.webp", "assets/joyday-homepage-preview.webp", "assets/joyday-brand-logo.webp"],
    stack: ["HTML", "CSS", "JavaScript", "Responsive Design", "Google Forms", "Google Sheets", "Workflow"],
    links: [{ label: { en: "Open Website", tr: "Siteyi Aç" }, url: "https://atolyejoyday.com/" }],
    overview: {
      en: "Atölye Joyday is a creative workshop studio offering action painting, creative drama, workshops and private event experiences. I designed the website experience and built a reservation flow that guides users from package selection to form submission.",
      tr: "Atölye Joyday; action painting, yaratıcı drama, workshoplar ve özel etkinlik deneyimleri sunan yaratıcı bir atölye. Web deneyimini tasarladım ve kullanıcıyı paket seçiminden form gönderimine taşıyan rezervasyon akışını geliştirdim."
    },
    challenge: {
      en: "The site needed to communicate different services clearly while keeping reservation steps simple for customers and trackable for operations.",
      tr: "Site farklı hizmetleri net anlatmalı, aynı zamanda müşteriler için rezervasyon adımlarını kolay ve operasyon tarafı için takip edilebilir hale getirmeliydi."
    },
    solution: {
      en: "I designed package cards, reservation CTAs and a dynamic package-selection logic similar to a product flow. The selected package context is carried into the reservation page to make the form experience clearer.",
      tr: "Paket kartları, rezervasyon CTA'ları ve ürün akışına benzeyen dinamik paket seçim mantığı tasarladım. Seçilen paket bilgisi rezervasyon sayfasına taşınarak form deneyimi daha net hale getirildi."
    },
    impact: {
      en: "The reservation workflow reduced friction by keeping package context visible and making the customer form feel connected to the selected experience.",
      tr: "Rezervasyon akışı, seçili paket bilgisini görünür tutarak ve müşteri formunu seçilen deneyimle bağlantılı hissettirerek sürtünmeyi azalttı."
    },
    process: {
      en: [
        { title: "Package logic", text: "Defined how each package should transfer its name, price and participant defaults into the reservation page." },
        { title: "Dynamic page design", text: "Used one reservation page that updates content according to the selected package." },
        { title: "Form experience", text: "Structured form fields around contact, participant count, date, time and notes." },
        { title: "Operational follow-up", text: "Aligned the flow with customer tracking and manual WhatsApp follow-up after submission." }
      ],
      tr: [
        { title: "Paket mantığı", text: "Her paketin ad, fiyat ve katılımcı varsayılanlarını rezervasyon sayfasına nasıl taşıyacağını tanımladım." },
        { title: "Dinamik sayfa tasarımı", text: "Seçilen pakete göre içeriği güncellenen tek bir rezervasyon sayfası kullandım." },
        { title: "Form deneyimi", text: "Form alanlarını iletişim, katılımcı sayısı, tarih, saat ve not akışı etrafında yapılandırdım." },
        { title: "Operasyon takibi", text: "Akışı müşteri takibi ve gönderim sonrası WhatsApp dönüş süreciyle uyumlu hale getirdim." }
      ]
    },
    features: {
      en: ["Responsive multi-page website", "Package-based reservation journey", "Customer data collection workflow", "Google Sheets operational tracking", "Mobile-first layout checks"],
      tr: ["Responsive çok sayfalı web sitesi", "Paket bazlı rezervasyon yolculuğu", "Müşteri veri toplama akışı", "Google Sheets operasyon takibi", "Mobil öncelikli görünüm kontrolleri"]
    }
  },
  "drivenfinity": {
    category: { en: "Game Development", tr: "Oyun Geliştirme" },
    title: { en: "Drivenfinity", tr: "Drivenfinity" },
    subtitle: {
      en: "A hyper-casual 3D mobile driving simulation game focused on obstacle avoidance, reflexes and score improvement.",
      tr: "Engellerden kaçınma, refleks ve skor geliştirme odaklı hyper-casual 3D mobil sürüş simülasyonu."
    },
    role: { en: "Unity Developer", tr: "Unity Developer" },
    year: "2025",
    type: { en: "Mobile Game", tr: "Mobil Oyun" },
    status: { en: "Repository", tr: "Repository" },
    image: "assets/DrivenfinityPng.png",
    gallery: ["assets/DrivenfinityPng.png"],
    stack: ["Unity", "C#", "3D", "Mobile", "Gameplay Logic"],
    links: [{ label: { en: "Open GitHub", tr: "GitHub'da Aç" }, url: "https://github.com/UAJOP/Drivenfinity" }],
    overview: {
      en: "Drivenfinity is a mobile-focused driving game where the player tries to survive as long as possible and increase the score by avoiding obstacles.",
      tr: "Drivenfinity, oyuncunun engellerden kaçarak mümkün olduğunca uzun süre hayatta kalmaya ve skorunu artırmaya çalıştığı mobil odaklı bir sürüş oyunudur."
    },
    challenge: {
      en: "The main design challenge was to keep the gameplay simple enough for hyper-casual play while still making the loop feel responsive and replayable.",
      tr: "Temel tasarım zorluğu, oynanışı hyper-casual kadar basit tutarken döngüyü akıcı ve tekrar oynanabilir hissettirmekti."
    },
    solution: {
      en: "I structured the game around clear movement, obstacle navigation, scoring and fast restart logic to support short mobile sessions.",
      tr: "Oyunu net hareket, engel navigasyonu, skor sistemi ve hızlı yeniden başlatma mantığı etrafında yapılandırdım."
    },
    features: {
      en: ["3D driving gameplay", "Obstacle avoidance loop", "Score-based progression", "Unity C# scripts", "Mobile-friendly gameplay idea"],
      tr: ["3D sürüş oynanışı", "Engelden kaçınma döngüsü", "Skor bazlı ilerleme", "Unity C# scriptleri", "Mobil dostu oyun fikri"]
    }
  },
  "dunker-madness": {
    category: { en: "Game Development", tr: "Oyun Geliştirme" },
    title: { en: "Dunker Madness", tr: "Dunker Madness" },
    subtitle: {
      en: "A 2D physics-based projectile game inspired by aiming, tower destruction and strategic shots.",
      tr: "Nişan alma, kule yıkımı ve stratejik atışlardan ilham alan 2D fizik tabanlı fırlatma oyunu."
    },
    role: { en: "Unity Developer", tr: "Unity Developer" },
    year: "2025",
    type: { en: "2D Game", tr: "2D Oyun" },
    status: { en: "Repository", tr: "Repository" },
    image: "assets/Ekran görüntüsü 2025-02-25 202336.png",
    gallery: ["assets/Ekran görüntüsü 2025-02-25 202336.png"],
    stack: ["Unity", "C#", "2D Physics", "Projectile Logic"],
    links: [{ label: { en: "Open GitHub", tr: "GitHub'da Aç" }, url: "https://github.com/UAJOP/DunkerMadness" }],
    overview: { en: "Dunker Madness explores a physics-based shooting mechanic where the player launches projectiles to destroy enemy structures.", tr: "Dunker Madness, oyuncunun düşman yapılarını yıkmak için fırlatma yaptığı fizik tabanlı bir atış mekaniğini araştırır." },
    challenge: { en: "Physics games need satisfying feedback, readable trajectories and a balance between precision and fun.", tr: "Fizik tabanlı oyunlarda tatmin edici geri bildirim, okunabilir atış yolları ve hassasiyet-eğlence dengesi gerekir." },
    solution: { en: "The project focuses on simple projectile control, target interaction and structure destruction logic inside Unity.", tr: "Proje Unity içinde basit fırlatma kontrolü, hedef etkileşimi ve yapı yıkım mantığına odaklanır." },
    features: { en: ["2D projectile gameplay", "Physics-based interactions", "Enemy tower destruction", "C# gameplay scripts", "Angry Birds-style inspiration"], tr: ["2D fırlatma oynanışı", "Fizik tabanlı etkileşimler", "Düşman kulesi yıkımı", "C# gameplay scriptleri", "Angry Birds tarzı ilham"] }
  },
  "unity-essentials": {
    category: { en: "Game Development", tr: "Oyun Geliştirme" },
    title: { en: "Unity Essentials", tr: "Unity Essentials" },
    subtitle: { en: "A multi-scene Unity learning project focused on core mechanics and gameplay fundamentals.", tr: "Temel mekanikler ve gameplay temellerine odaklanan çok sahneli Unity öğrenme projesi." },
    role: { en: "Unity Developer", tr: "Unity Developer" },
    year: "2025",
    type: { en: "Learning Project", tr: "Öğrenme Projesi" },
    status: { en: "Repository", tr: "Repository" },
    image: "assets/converted_image.png",
    gallery: ["assets/converted_image.png"],
    stack: ["Unity 6", "C#", "Scenes", "Gameplay Fundamentals"],
    links: [{ label: { en: "Open GitHub", tr: "GitHub'da Aç" }, url: "https://github.com/UAJOP/UnityEssentials" }],
    overview: { en: "Unity Essentials is a learning-focused project containing multiple scenes that each explore a different Unity concept or mechanic.", tr: "Unity Essentials, her biri farklı bir Unity konseptini veya mekaniğini araştıran çok sahneli öğrenme odaklı bir projedir." },
    challenge: { en: "The goal was to strengthen Unity fundamentals by isolating mechanics into clear scenes and building them step by step.", tr: "Amaç mekanikleri net sahnelere ayırarak Unity temellerini adım adım güçlendirmekti." },
    solution: { en: "I structured the project as a practical learning environment with scene-based experimentation and reusable gameplay logic.", tr: "Projeyi sahne bazlı denemeler ve tekrar kullanılabilir gameplay mantığıyla pratik bir öğrenme ortamı olarak yapılandırdım." },
    features: { en: ["Multiple Unity scenes", "Core mechanic experiments", "C# implementation", "Learning-focused structure", "Gameplay fundamentals"], tr: ["Çoklu Unity sahneleri", "Temel mekanik denemeleri", "C# uygulama", "Öğrenme odaklı yapı", "Gameplay temelleri"] }
  },
  "extract-shoot-zero": {
    category: { en: "Game Development", tr: "Oyun Geliştirme" },
    title: { en: "Extract Shoot: Zero", tr: "Extract Shoot: Zero" },
    subtitle: { en: "A third-person action shooter prototype with enemy AI, health management and combat-focused gameplay systems.", tr: "Düşman AI, sağlık yönetimi ve savaş odaklı gameplay sistemleri içeren üçüncü şahıs aksiyon shooter prototipi." },
    role: { en: "Unreal Engine Developer", tr: "Unreal Engine Developer" },
    year: "2024",
    type: { en: "Shooter Prototype", tr: "Shooter Prototipi" },
    status: { en: "Repository", tr: "Repository" },
    image: "assets/9b869e78-ccdd-41a1-b9bd-e2047dc7c245.jpg",
    gallery: ["assets/9b869e78-ccdd-41a1-b9bd-e2047dc7c245.jpg"],
    stack: ["Unreal Engine", "C++", "Blueprints", "Enemy AI", "Combat Systems"],
    links: [{ label: { en: "Open GitHub", tr: "GitHub'da Aç" }, url: "https://github.com/UAJOP/ExtractShoot-Zero" }],
    overview: { en: "Extract Shoot: Zero is a third-person action shooter prototype built to practice combat systems, AI behavior and player health logic.", tr: "Extract Shoot: Zero; savaş sistemleri, AI davranışı ve oyuncu sağlık mantığını çalışmak için geliştirilmiş üçüncü şahıs aksiyon shooter prototipidir." },
    challenge: { en: "A shooter prototype requires multiple systems to work together: movement, enemy behavior, health, damage and combat feedback.", tr: "Bir shooter prototipinde hareket, düşman davranışı, sağlık, hasar ve savaş geri bildirimi gibi birçok sistem birlikte çalışmalıdır." },
    solution: { en: "I built the project using Unreal Engine with C++ and Blueprints, focusing on clear game state and combat interaction logic.", tr: "Projeyi Unreal Engine üzerinde C++ ve Blueprints ile geliştirerek net oyun durumu ve savaş etkileşimi mantığına odaklandım." },
    features: { en: ["Third-person combat", "Enemy AI logic", "Health and damage systems", "Unreal Engine workflow", "Blueprint and C++ usage"], tr: ["Üçüncü şahıs savaş", "Düşman AI mantığı", "Sağlık ve hasar sistemleri", "Unreal Engine iş akışı", "Blueprint ve C++ kullanımı"] }
  },
  "tank-savage": {
    category: { en: "Game Development", tr: "Oyun Geliştirme" },
    title: { en: "Tank Savage", tr: "Tank Savage" },
    subtitle: { en: "A third-person tank combat prototype built with Unreal Engine, Blueprints, C++ and physics-based gameplay ideas.", tr: "Unreal Engine, Blueprints, C++ ve fizik tabanlı gameplay fikirleriyle geliştirilen üçüncü şahıs tank savaş prototipi." },
    role: { en: "Unreal Engine Developer", tr: "Unreal Engine Developer" },
    year: "2024",
    type: { en: "Combat Game Prototype", tr: "Savaş Oyunu Prototipi" },
    status: { en: "Repository", tr: "Repository" },
    image: "assets/maxresdefault.jpg",
    gallery: ["assets/maxresdefault.jpg"],
    stack: ["Unreal Engine", "C++", "Blueprints", "Physics", "Combat"],
    links: [{ label: { en: "Open GitHub", tr: "GitHub'da Aç" }, url: "https://github.com/UAJOP/TankSavage" }],
    overview: { en: "Tank Savage focuses on tank movement, combat interaction and Unreal Engine gameplay prototyping.", tr: "Tank Savage; tank hareketi, savaş etkileşimi ve Unreal Engine gameplay prototiplemesine odaklanır." },
    challenge: { en: "Vehicle-style combat requires different control feel, collision behavior and combat pacing compared to character-based games.", tr: "Araç tabanlı savaş; karakter tabanlı oyunlara göre farklı kontrol hissi, çarpışma davranışı ve savaş temposu gerektirir." },
    solution: { en: "I approached the project as a prototype for tank control, environment interaction and combat rules using Unreal workflows.", tr: "Projeye Unreal iş akışlarıyla tank kontrolü, çevre etkileşimi ve savaş kuralları prototipi olarak yaklaştım." },
    features: { en: ["Tank control logic", "Combat prototype", "Physics-based interaction", "Blueprint/C++ workflow", "Unreal Engine 5 practice"], tr: ["Tank kontrol mantığı", "Savaş prototipi", "Fizik tabanlı etkileşim", "Blueprint/C++ iş akışı", "Unreal Engine 5 pratiği"] }
  },
  "hospital-form-app": {
    category: { en: "Data / Backend", tr: "Veri / Backend" },
    title: { en: "Hospital Form App", tr: "Hospital Form App" },
    subtitle: { en: "A C# Windows Forms hospital appointment automation system with MSSQL and a complex multi-form structure.", tr: "C# Windows Forms, MSSQL ve çok formlu yapı içeren hastane randevu otomasyon sistemi." },
    role: { en: "C# Developer", tr: "C# Developer" },
    year: "2024",
    type: { en: "Desktop Automation", tr: "Masaüstü Otomasyon" },
    status: { en: "Repository", tr: "Repository" },
    image: "assets/hospital.avif",
    gallery: ["assets/hospital.avif"],
    stack: ["C#", ".NET", "Windows Forms", "MSSQL", "Database Design"],
    links: [{ label: { en: "Open GitHub", tr: "GitHub'da Aç" }, url: "https://github.com/UAJOP/Hospital-System" }],
    overview: { en: "Hospital Form App is a desktop automation system built to manage appointment-related workflows through multiple Windows Forms screens and a relational database.", tr: "Hospital Form App, randevu odaklı iş akışlarını çoklu Windows Forms ekranları ve ilişkisel veritabanı ile yönetmek için geliştirilen masaüstü otomasyon sistemidir." },
    challenge: { en: "The project required organizing many forms, user actions and database operations without losing clarity in the application flow.", tr: "Proje; çok sayıda form, kullanıcı aksiyonu ve veritabanı işlemini uygulama akışındaki netliği kaybetmeden organize etmeyi gerektirdi." },
    solution: { en: "I structured the application around clear form responsibilities, MSSQL-backed data operations and practical desktop automation logic.", tr: "Uygulamayı net form sorumlulukları, MSSQL destekli veri işlemleri ve pratik masaüstü otomasyon mantığı etrafında yapılandırdım." },
    features: { en: ["C# Windows Forms", "MSSQL database usage", "Multi-form structure", "Appointment automation logic", "Desktop application workflow"], tr: ["C# Windows Forms", "MSSQL veritabanı kullanımı", "Çok formlu yapı", "Randevu otomasyon mantığı", "Masaüstü uygulama akışı"] }
  },
  "cars-dataset-analysis": {
    category: { en: "Data Analysis", tr: "Veri Analizi" },
    title: { en: "Cars Dataset Analysis", tr: "Cars Veri Seti Analizi" },
    subtitle: { en: "A Python-based data analysis project built to explore, process and present insights from automotive data.", tr: "Otomotiv verilerini keşfetmek, işlemek ve içgörü sunmak için geliştirilmiş Python tabanlı veri analizi projesi." },
    role: { en: "Python Developer", tr: "Python Developer" },
    year: "2024",
    type: { en: "Data Project", tr: "Veri Projesi" },
    status: { en: "Repository", tr: "Repository" },
    image: "assets/what-is-data-analyst.jpg",
    gallery: ["assets/what-is-data-analyst.jpg"],
    stack: ["Python", "Data Analysis", "Pandas", "Exploration", "Visualization"],
    links: [{ label: { en: "Open GitHub", tr: "GitHub'da Aç" }, url: "https://github.com/UAJOP/Cars-Dataset-Analysis" }],
    overview: { en: "This project focuses on exploring a Cars dataset with Python and presenting meaningful observations through data analysis steps.", tr: "Bu proje, Cars veri setini Python ile incelemeye ve veri analizi adımlarıyla anlamlı gözlemler sunmaya odaklanır." },
    challenge: { en: "A data project needs clean exploration, understandable outputs and a structure that makes the analysis easy to follow.", tr: "Bir veri projesi temiz keşif, anlaşılır çıktılar ve analizin kolay takip edilebilir olduğu bir yapı gerektirir." },
    solution: { en: "I used Python-based analysis logic to inspect the data, understand patterns and present findings in a readable way.", tr: "Veriyi incelemek, kalıpları anlamak ve bulguları okunabilir şekilde sunmak için Python tabanlı analiz mantığı kullandım." },
    features: { en: ["Dataset exploration", "Python analysis workflow", "Data cleaning mindset", "Insight presentation", "Automotive data context"], tr: ["Veri seti keşfi", "Python analiz iş akışı", "Veri temizleme bakış açısı", "İçgörü sunumu", "Otomotiv verisi bağlamı"] }
  },
  "my-museum": {
    category: { en: "Mobile Development", tr: "Mobil Geliştirme" },
    title: { en: "Instagram Clone App – My Museum", tr: "Instagram Clone App – My Museum" },
    subtitle: { en: "An Android application built with Kotlin and Firebase to recreate core Instagram-style content features.", tr: "Instagram tarzı temel içerik özelliklerini yeniden oluşturmak için Kotlin ve Firebase ile geliştirilmiş Android uygulaması." },
    role: { en: "Android Developer", tr: "Android Developer" },
    year: "2023",
    type: { en: "Android App", tr: "Android Uygulaması" },
    status: { en: "Repository", tr: "Repository" },
    image: "assets/insatagram.webp",
    gallery: ["assets/insatagram.webp"],
    stack: ["Kotlin", "Android Studio", "Firebase", "Mobile UI", "Database"],
    links: [{ label: { en: "Open GitHub", tr: "GitHub'da Aç" }, url: "https://github.com/UAJOP/MyMuseum" }],
    overview: { en: "My Museum is an Android application project inspired by Instagram-style content sharing and mobile database usage.", tr: "My Museum, Instagram tarzı içerik paylaşımı ve mobil veritabanı kullanımından ilham alan Android uygulama projesidir." },
    challenge: { en: "The project required connecting mobile UI screens with Firebase-backed content logic.", tr: "Proje, mobil UI ekranlarını Firebase destekli içerik mantığıyla bağlamayı gerektirdi." },
    solution: { en: "I built the app using Kotlin in Android Studio, focusing on core mobile flow and Firebase integration.", tr: "Uygulamayı Android Studio'da Kotlin ile geliştirerek temel mobil akışa ve Firebase entegrasyonuna odaklandım." },
    features: { en: ["Kotlin Android app", "Firebase database", "Instagram-style concept", "Mobile content flow", "Android Studio workflow"], tr: ["Kotlin Android uygulaması", "Firebase veritabanı", "Instagram tarzı konsept", "Mobil içerik akışı", "Android Studio iş akışı"] }
  },
  "dashboard-v2": {
    category: { en: "Web & Data", tr: "Web & Veri" },
    title: { en: "Dashboard V2", tr: "Dashboard V2" },
    subtitle: { en: "A detailed e-commerce control panel project designed with a team using web and database tools.", tr: "Web ve veritabanı araçları kullanılarak ekip ile tasarlanmış detaylı e-ticaret kontrol paneli projesi." },
    role: { en: "Web Developer", tr: "Web Developer" },
    year: "2023",
    type: { en: "Dashboard", tr: "Dashboard" },
    status: { en: "Repository", tr: "Repository" },
    image: "assets/Energy_Dashboard_2x.jpg.png",
    gallery: ["assets/Energy_Dashboard_2x.jpg.png"],
    stack: ["HTML", "CSS", "JavaScript", "JSON", "MySQL", "Dashboard UI"],
    links: [{ label: { en: "Open GitHub", tr: "GitHub'da Aç" }, url: "https://github.com/UAJOP/Control-Panel" }],
    overview: { en: "Dashboard V2 is a control panel project focused on representing e-commerce style data and management screens.", tr: "Dashboard V2, e-ticaret tarzı veri ve yönetim ekranlarını temsil etmeye odaklanan kontrol paneli projesidir." },
    challenge: { en: "Dashboard projects require information hierarchy, readable UI and a layout that supports management tasks.", tr: "Dashboard projeleri bilgi hiyerarşisi, okunabilir UI ve yönetim görevlerini destekleyen düzen gerektirir." },
    solution: { en: "The project uses web technologies and database thinking to present a management-oriented interface.", tr: "Proje, yönetim odaklı bir arayüz sunmak için web teknolojileri ve veritabanı bakış açısı kullanır." },
    features: { en: ["Dashboard layout", "E-commerce control panel concept", "Web interface", "MySQL awareness", "Team project structure"], tr: ["Dashboard düzeni", "E-ticaret kontrol paneli konsepti", "Web arayüzü", "MySQL farkındalığı", "Ekip projesi yapısı"] }
  },
  "weather-app": {
    category: { en: "Web Development", tr: "Web Geliştirme" },
    title: { en: "Weather App", tr: "Weather App" },
    subtitle: { en: "A JavaScript weather application that fetches forecast data and presents location-based weather information.", tr: "Hava durumu verilerini çeken ve konuma göre hava bilgisi sunan JavaScript uygulaması." },
    role: { en: "Frontend Developer", tr: "Frontend Developer" },
    year: "2023",
    type: { en: "Web App", tr: "Web Uygulaması" },
    status: { en: "Repository", tr: "Repository" },
    image: "assets/7477790.png",
    gallery: ["assets/7477790.png"],
    stack: ["HTML", "CSS", "JavaScript", "API", "Frontend"],
    links: [{ label: { en: "Open GitHub", tr: "GitHub'da Aç" }, url: "https://github.com/UAJOP/Wheather-App" }],
    overview: { en: "Weather App is a frontend project focused on retrieving weather data and presenting it through a simple user interface.", tr: "Weather App, hava durumu verilerini alıp basit bir kullanıcı arayüzü üzerinden sunmaya odaklanan frontend projesidir." },
    challenge: { en: "The main challenge was connecting user-facing UI with external weather data in a clear and usable way.", tr: "Temel zorluk kullanıcı arayüzünü dış hava durumu verisiyle net ve kullanılabilir şekilde bağlamaktı." },
    solution: { en: "I built a JavaScript-based interface that fetches and displays weather information for the user.", tr: "Kullanıcı için hava durumu bilgisini çeken ve gösteren JavaScript tabanlı bir arayüz geliştirdim." },
    features: { en: ["JavaScript data fetching", "Weather information display", "Frontend UI", "Location-based concept", "API-oriented practice"], tr: ["JavaScript veri çekme", "Hava bilgisi gösterimi", "Frontend UI", "Konum bazlı konsept", "API odaklı pratik"] }
  }
};

function translateProjectField(field, language) {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field[language] || field.en || "";
}

function createProjectDetailUrl(slug) {
  return `project-detail.html?project=${encodeURIComponent(slug)}`;
}

function escapeProjectHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderProjectDetail(language = currentSiteLanguage || "en") {
  const root = document.querySelector("[data-project-detail]");
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("project") || "drivenfinity";
  const project = projectDetailData[slug];

  if (!project) {
    root.innerHTML = `
      <section class="page-hero section-shell reveal">
        <p class="eyebrow">${language === "tr" ? "Proje Bulunamadı" : "Project Not Found"}</p>
        <h1>${language === "tr" ? "Bu proje için detay sayfası henüz hazırlanmadı." : "This project detail page is not available yet."}</h1>
        <p>${language === "tr" ? "Projeler sayfasına dönüp başka bir çalışma seçebilirsin." : "Go back to the works page and choose another project."}</p>
        <div class="hero-actions left"><a class="btn primary" href="works.html">${language === "tr" ? "Projelere Dön" : "Back to Works"}</a></div>
      </section>
    `;
    document.title = language === "tr" ? "Proje Bulunamadı | Kaan Balcı" : "Project Not Found | Kaan Balcı";
    return;
  }

  const projectEntries = Object.keys(projectDetailData);
  const currentIndex = projectEntries.indexOf(slug);
  const previousSlug = projectEntries[(currentIndex - 1 + projectEntries.length) % projectEntries.length];
  const nextSlug = projectEntries[(currentIndex + 1) % projectEntries.length];
  const title = translateProjectField(project.title, language);
  const subtitle = translateProjectField(project.subtitle, language);
  const category = translateProjectField(project.category, language);
  const role = translateProjectField(project.role, language);
  const type = translateProjectField(project.type, language);
  const status = translateProjectField(project.status, language);
  const overview = translateProjectField(project.overview, language);
  const challenge = translateProjectField(project.challenge, language);
  const solution = translateProjectField(project.solution, language);
  const features = project.features?.[language] || project.features?.en || [];
  const links = project.links || [];
  const gallery = project.gallery?.length ? project.gallery : [project.image];
  const impact = translateProjectField(project.impact, language) || (language === "tr"
    ? "Bu proje; teknik pratiği, kullanıcı ihtiyacını ve ürün odaklı düşünmeyi birleştiren portföy çalışmalarımdan biridir."
    : "This project represents my ability to combine technical practice, user needs and product-oriented thinking.");
  const processSteps = project.process?.[language] || project.process?.en || [
    { title: language === "tr" ? "Analiz" : "Analysis", text: language === "tr" ? "Projenin hedefini, kullanıcı ihtiyacını ve temel akışını netleştirdim." : "Clarified the project goal, user need and core flow." },
    { title: language === "tr" ? "Tasarım" : "Design", text: language === "tr" ? "Sistem mantığını, ekranları veya gameplay yapısını planladım." : "Planned the system logic, screens or gameplay structure." },
    { title: language === "tr" ? "Geliştirme" : "Development", text: language === "tr" ? "Teknik uygulamayı geliştirip temel özellikleri çalışır hale getirdim." : "Built the technical implementation and made the core features work." },
    { title: language === "tr" ? "İyileştirme" : "Iteration", text: language === "tr" ? "Test, düzenleme ve sunum tarafını portföye uygun hale getirdim." : "Refined the result through testing, cleanup and portfolio presentation." }
  ];

  document.title = `${title} | Kaan Balcı`;

  root.innerHTML = `
    <section class="project-detail-hero section-shell reveal">
      <div class="project-detail-copy">
        <a class="back-link" href="works.html"><i class="bx bx-arrow-back"></i>${language === "tr" ? "Projelere dön" : "Back to works"}</a>
        <p class="eyebrow">${escapeProjectHtml(category)}</p>
        <h1>${escapeProjectHtml(title)}</h1>
        <p>${escapeProjectHtml(subtitle)}</p>
        <div class="project-detail-actions">
          ${links.map((link) => `<a class="btn primary" href="${escapeProjectHtml(link.url)}" ${link.url.startsWith("http") ? 'target="_blank" rel="noopener"' : ""}>${escapeProjectHtml(translateProjectField(link.label, language))}</a>`).join("")}
          <a class="btn ghost" href="mailto:kaanb8776@gmail.com">${language === "tr" ? "Benzer Proje İçin Yaz" : "Ask for Similar Work"}</a>
          <button class="btn ghost" type="button" data-copy-project-link>${language === "tr" ? "Proje Linkini Kopyala" : "Copy Project Link"}</button>
        </div>
      </div>
      <div class="project-detail-visual reveal delay-1">
        <img src="${escapeProjectHtml(project.image)}" alt="${escapeProjectHtml(title)} preview" decoding="async" fetchpriority="high" />
      </div>
    </section>

    <section class="section-shell project-detail-meta reveal delay-2">
      <article><span>${language === "tr" ? "Rol" : "Role"}</span><strong>${escapeProjectHtml(role)}</strong></article>
      <article><span>${language === "tr" ? "Yıl" : "Year"}</span><strong>${escapeProjectHtml(project.year)}</strong></article>
      <article><span>${language === "tr" ? "Tür" : "Type"}</span><strong>${escapeProjectHtml(type)}</strong></article>
      <article><span>${language === "tr" ? "Durum" : "Status"}</span><strong>${escapeProjectHtml(status)}</strong></article>
    </section>

    <section class="section-shell section-block project-detail-grid">
      <div class="project-detail-main">
        <article class="detail-panel reveal">
          <p class="eyebrow">${language === "tr" ? "Genel Bakış" : "Overview"}</p>
          <h2>${language === "tr" ? "Projenin olayı" : "What this project is about"}</h2>
          <p>${escapeProjectHtml(overview)}</p>
        </article>

        <article class="detail-panel reveal delay-1">
          <p class="eyebrow">${language === "tr" ? "Problem" : "Challenge"}</p>
          <h2>${language === "tr" ? "Çözülmesi gereken taraf" : "The part that needed solving"}</h2>
          <p>${escapeProjectHtml(challenge)}</p>
        </article>

        <article class="detail-panel reveal delay-2">
          <p class="eyebrow">${language === "tr" ? "Çözüm" : "Solution"}</p>
          <h2>${language === "tr" ? "Nasıl ele aldım" : "How I approached it"}</h2>
          <p>${escapeProjectHtml(solution)}</p>
        </article>

        <article class="detail-panel reveal">
          <p class="eyebrow">${language === "tr" ? "Sonuç / Etki" : "Result / Impact"}</p>
          <h2>${language === "tr" ? "Projeye kattığı değer" : "The value created"}</h2>
          <p>${escapeProjectHtml(impact)}</p>
        </article>

        <article class="detail-panel reveal delay-1">
          <p class="eyebrow">${language === "tr" ? "Süreç" : "Process"}</p>
          <h2>${language === "tr" ? "Nasıl ilerledi" : "How the work moved forward"}</h2>
          <div class="process-steps">
            ${processSteps.map((step, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeProjectHtml(step.title)}</h3><p>${escapeProjectHtml(step.text)}</p></div></article>`).join("")}
          </div>
        </article>
      </div>

      <aside class="project-detail-side reveal delay-1">
        <div class="detail-panel compact-panel">
          <h3>${language === "tr" ? "Teknolojiler" : "Tech Stack"}</h3>
          <div class="project-tags detail-tags">
            ${project.stack.map((item) => `<span>${escapeProjectHtml(item)}</span>`).join("")}
          </div>
        </div>

        <div class="detail-panel compact-panel">
          <h3>${language === "tr" ? "Öne çıkanlar" : "Highlights"}</h3>
          <ul class="detail-list">
            ${features.map((item) => `<li>${escapeProjectHtml(item)}</li>`).join("")}
          </ul>
        </div>
      </aside>
    </section>

    <section class="section-shell section-block">
      <div class="section-heading reveal">
        <p class="eyebrow">${language === "tr" ? "Görseller" : "Gallery"}</p>
        <h2>${language === "tr" ? "Projeden görsel alanı." : "Visual context from the project."}</h2>
        <p>${language === "tr" ? "Şimdilik mevcut portfolio görselleri kullanılıyor. Yeni ekran görüntüleri ekledikçe bu alan otomatik daha güçlü hale gelir." : "Current portfolio assets are used for now. As new screenshots are added, this area becomes stronger automatically."}</p>
      </div>
      <div class="detail-gallery">
        ${gallery.map((image) => `<img class="reveal" src="${escapeProjectHtml(image)}" alt="${escapeProjectHtml(title)} gallery image" loading="lazy" decoding="async" />`).join("")}
      </div>
    </section>

    <section class="section-shell detail-navigation reveal">
      <a class="btn ghost" href="${createProjectDetailUrl(previousSlug)}"><i class="bx bx-left-arrow-alt"></i>${language === "tr" ? "Önceki Proje" : "Previous Project"}</a>
      <a class="btn primary" href="works.html">${language === "tr" ? "Tüm Projeler" : "All Works"}</a>
      <a class="btn ghost" href="${createProjectDetailUrl(nextSlug)}">${language === "tr" ? "Sonraki Proje" : "Next Project"}<i class="bx bx-right-arrow-alt"></i></a>
    </section>
  `;
}


const aiWorkflowDemoData = {
  bank: {
    title: { en: "Banking support chatbot", tr: "Banka destek chatbot'u" },
    description: { en: "A safe flow for account-related questions, intent routing and escalation.", tr: "Hesapla ilgili sorular, intent yönlendirme ve canlı desteğe aktarma için güvenli akış." },
    steps: {
      en: ["Greet user", "Detect intent", "Verify safe request", "Collect required info", "Route to answer or agent", "Confirm resolution"],
      tr: ["Kullanıcıyı karşıla", "Intent'i algıla", "Güvenli talebi doğrula", "Gerekli bilgiyi topla", "Yanıt veya temsilciye yönlendir", "Çözümü onayla"]
    }
  },
  municipality: {
    title: { en: "Municipality service assistant", tr: "Belediye hizmet asistanı" },
    description: { en: "A flow for citizens to find service information, create requests and track status.", tr: "Vatandaşların hizmet bilgisi bulması, talep oluşturması ve durum takip etmesi için akış." },
    steps: {
      en: ["Ask service category", "Clarify district/topic", "Show required documents", "Create request", "Share tracking channel", "Close with next step"],
      tr: ["Hizmet kategorisini sor", "İlçe/konuyu netleştir", "Gerekli belgeleri göster", "Talep oluştur", "Takip kanalını paylaş", "Sonraki adımla kapat"]
    }
  },
  workshop: {
    title: { en: "Workshop reservation assistant", tr: "Atölye rezervasyon asistanı" },
    description: { en: "A customer journey for package choice, date preference and reservation follow-up.", tr: "Paket seçimi, tarih tercihi ve rezervasyon takibi için müşteri yolculuğu." },
    steps: {
      en: ["Show packages", "Select package", "Collect contact info", "Ask date/time", "Send reservation summary", "Trigger operation follow-up"],
      tr: ["Paketleri göster", "Paketi seçtir", "İletişim bilgisini al", "Tarih/saat sor", "Rezervasyon özetini gönder", "Operasyon takibini tetikle"]
    }
  },
  ecommerce: {
    title: { en: "E-commerce product support", tr: "E-ticaret ürün desteği" },
    description: { en: "A flow for product discovery, order questions and return support.", tr: "Ürün keşfi, sipariş soruları ve iade desteği için akış." },
    steps: {
      en: ["Understand product need", "Recommend category", "Answer stock/delivery", "Check order status", "Handle return intent", "Offer human support"],
      tr: ["Ürün ihtiyacını anla", "Kategori öner", "Stok/teslimat yanıtla", "Sipariş durumunu kontrol et", "İade intent'ini yönet", "İnsan desteği sun"]
    }
  }
};

let selectedAiWorkflowScenario = "bank";

function renderAiWorkflowDemo(language = currentSiteLanguage || "en") {
  const stage = document.querySelector("[data-ai-demo-stage]");
  if (!stage) return;
  const scenario = aiWorkflowDemoData[selectedAiWorkflowScenario] || aiWorkflowDemoData.bank;
  const title = translateProjectField(scenario.title, language);
  const description = translateProjectField(scenario.description, language);
  const steps = scenario.steps?.[language] || scenario.steps?.en || [];

  document.querySelectorAll("[data-ai-demo]").forEach((button) => {
    button.classList.toggle("active", button.dataset.aiDemo === selectedAiWorkflowScenario);
  });

  stage.innerHTML = `
    <div class="ai-demo-summary">
      <span>${language === "tr" ? "Seçilen senaryo" : "Selected scenario"}</span>
      <h3>${escapeProjectHtml(title)}</h3>
      <p>${escapeProjectHtml(description)}</p>
    </div>
    <div class="ai-flow-map">
      ${steps.map((step, index) => `<article class="flow-step"><strong>${String(index + 1).padStart(2, "0")}</strong><span>${escapeProjectHtml(step)}</span></article>`).join("")}
    </div>
  `;
}

document.querySelectorAll("[data-ai-demo]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedAiWorkflowScenario = button.dataset.aiDemo || "bank";
    renderAiWorkflowDemo(currentSiteLanguage || "en");
  });
});

function setupProjectCardNavigation() {
  document.querySelectorAll("[data-project-link]").forEach((card) => {
    const slug = card.getAttribute("data-project-link");
    if (!slug) return;
    const url = createProjectDetailUrl(slug);

    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      window.location.href = url;
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        window.location.href = url;
      }
    });
  });
}

setupProjectCardNavigation();


const portfolioChatbotContent = {
  en: {
    launcher: "Ask Ajoop",
    title: "Ajoop",
    subtitle: "",
    greeting: "Hey, I am Ajoop. I can quickly explain Kaan's skills, projects, AI experience, Joyday work, CV and contact options. Choose a question or type a keyword.",
    inputPlaceholder: "Ask about projects, AI, CV...",
    sendLabel: "Send",
    closeLabel: "Close chatbot",
    openLabel: "Open portfolio chatbot",
    quicks: [
      { id: "about", label: "Who is Kaan?" },
      { id: "ai", label: "AI / chatbot experience" },
      { id: "projects", label: "Best projects" },
      { id: "joyday", label: "Joyday website" },
      { id: "stack", label: "Tech stack" },
      { id: "cv", label: "CV & contact" }
    ],
    answers: {
      about: {
        text: "Kaan Balcı is an AI Designer & Software Developer focused on AI workflows, chatbot logic, automation, web/mobile products, backend systems and game development. He has worked across 50+ projects and graduated from Izmir University of Economics Computer Programming with a 3.07 GPA.",
        links: [{ label: "About", url: "about.html" }, { label: "Experience", url: "blog.html" }]
      },
      ai: {
        text: "Kaan's AI direction is based on chatbot flow design, n8n-style automation logic, IVR awareness, LLM response evaluation, prompt review and code output quality checks. His CBOT experience included chatbot solutions for enterprise clients, municipalities and banks.",
        links: [{ label: "AI Case Study", url: "project-detail.html?project=ai-chatbot-flow-design" }, { label: "Experience", url: "blog.html" }]
      },
      projects: {
        text: "The strongest project areas are AI Chatbot Flow Design, Atölye Joyday Official Website, Joyday Reservation Workflow, Hospital Form App, Drivenfinity and Cars Dataset Analysis. The Works page has all project cards with dynamic case study pages.",
        links: [{ label: "View Works", url: "works.html" }, { label: "Joyday Case", url: "project-detail.html?project=atolye-joyday-official-website" }]
      },
      joyday: {
        text: "Atölye Joyday is a real business project. Kaan designed and developed the website experience, service pages, package flow and reservation journey. It shows practical product thinking because it connects customer experience with operational tracking.",
        links: [{ label: "Official Website Case", url: "project-detail.html?project=atolye-joyday-official-website" }, { label: "Reservation Workflow", url: "project-detail.html?project=atolye-joyday-reservation-workflow" }]
      },
      stack: {
        text: "Main stack: Python, C#/.NET, JavaScript, PHP, Java, Kotlin, C++, MySQL, MSSQL, Firebase, Unity, Unreal Engine, n8n, AI Flow and LLM evaluation workflows.",
        links: [{ label: "About", url: "about.html" }, { label: "Works", url: "works.html" }]
      },
      cv: {
        text: "You can view Kaan's CV, contact him by email, or reach him through LinkedIn and GitHub from the site footer. For AI Designer or Software Developer roles, the fastest path is CV + LinkedIn.",
        links: [{ label: "Email", url: "mailto:kaanb8776@gmail.com" }, { label: "LinkedIn", url: "https://www.linkedin.com/in/balcikaan/" }, { label: "GitHub", url: "https://github.com/UAJOP" }]
      },
      availability: {
        text: "Kaan is positioned for AI Designer, Software Developer, AI Workflow Designer, Chatbot Designer, Automation Builder, Web Developer and junior/mid-level software roles depending on the scope.",
        links: [{ label: "Contact", url: "mailto:kaanb8776@gmail.com" }, { label: "Experience", url: "blog.html" }]
      },
      certificates: {
        text: "Kaan has 25+ certifications across Udemy, Cisco and related platforms. The Certificates page shows a clean gallery with preview modal support.",
        links: [{ label: "Certificates", url: "single-work.html" }]
      },
      default: {
        text: "I could not match that exactly, but I can help with Kaan's AI experience, projects, tech stack, Joyday work, CV, certificates or contact details. Try one of the quick questions below.",
        links: [{ label: "Works", url: "works.html" }, { label: "About", url: "about.html" }]
      }
    }
  },
  tr: {
    launcher: "Ajoop'a Sor",
    title: "Ajoop",
    subtitle: "",
    greeting: "Selam, ben Ajoop. Kaan'ın yeteneklerini, projelerini, AI deneyimini, Joyday çalışmalarını, CV ve iletişim seçeneklerini hızlıca anlatabilirim. Bir soru seçebilir veya anahtar kelime yazabilirsin.",
    inputPlaceholder: "Proje, AI, CV hakkında sor...",
    sendLabel: "Gönder",
    closeLabel: "Chatbot'u kapat",
    openLabel: "Portfolio chatbot'u aç",
    quicks: [
      { id: "about", label: "Kaan kim?" },
      { id: "ai", label: "AI / chatbot deneyimi" },
      { id: "projects", label: "En iyi projeler" },
      { id: "joyday", label: "Joyday web sitesi" },
      { id: "stack", label: "Tech stack" },
      { id: "cv", label: "CV & iletişim" }
    ],
    answers: {
      about: {
        text: "Kaan Balcı; AI workflow, chatbot mantığı, otomasyon, web/mobil ürünler, backend sistemler ve oyun geliştirme alanlarına odaklanan bir AI Designer & Software Developer. 50+ projede aktif rol aldı ve İzmir Ekonomi Üniversitesi Bilgisayar Programcılığı bölümünden 3.07 GNO ile mezun oldu.",
        links: [{ label: "Hakkımda", url: "about.html" }, { label: "Deneyim", url: "blog.html" }]
      },
      ai: {
        text: "Kaan'ın AI tarafı chatbot akış tasarımı, n8n tarzı otomasyon mantığı, IVR farkındalığı, LLM yanıt değerlendirme, prompt inceleme ve kod çıktısı kalite kontrolü üzerine kurulu. CBOT deneyiminde kurumsal müşteriler, belediyeler ve bankalar için chatbot çözümleri üzerinde çalıştı.",
        links: [{ label: "AI Case Study", url: "project-detail.html?project=ai-chatbot-flow-design" }, { label: "Deneyim", url: "blog.html" }]
      },
      projects: {
        text: "En güçlü proje alanları: AI Chatbot Flow Design, Atölye Joyday Official Website, Joyday Reservation Workflow, Hospital Form App, Drivenfinity ve Cars Dataset Analysis. Works sayfasında tüm proje kartları dinamik detay sayfalarına bağlı.",
        links: [{ label: "Projeleri Gör", url: "works.html" }, { label: "Joyday Case", url: "project-detail.html?project=atolye-joyday-official-website" }]
      },
      joyday: {
        text: "Atölye Joyday gerçek bir işletme projesi. Kaan web deneyimini, hizmet sayfalarını, paket akışını ve rezervasyon yolculuğunu tasarlayıp geliştirdi. Müşteri deneyimini operasyon takibiyle bağladığı için güçlü bir real-time business case olarak duruyor.",
        links: [{ label: "Official Website Case", url: "project-detail.html?project=atolye-joyday-official-website" }, { label: "Rezervasyon Akışı", url: "project-detail.html?project=atolye-joyday-reservation-workflow" }]
      },
      stack: {
        text: "Ana stack: Python, C#/.NET, JavaScript, PHP, Java, Kotlin, C++, MySQL, MSSQL, Firebase, Unity, Unreal Engine, n8n, AI Flow ve LLM değerlendirme iş akışları.",
        links: [{ label: "Hakkımda", url: "about.html" }, { label: "Projeler", url: "works.html" }]
      },
      cv: {
        text: "Kaan'ın CV'sini görüntüleyebilir, mail atabilir veya LinkedIn/GitHub üzerinden ulaşabilirsin. AI Designer ya da Software Developer rolleri için en hızlı yol CV + LinkedIn.",
        links: [{ label: "E-posta", url: "mailto:kaanb8776@gmail.com" }, { label: "LinkedIn", url: "https://www.linkedin.com/in/balcikaan/" }, { label: "GitHub", url: "https://github.com/UAJOP" }]
      },
      availability: {
        text: "Kaan; AI Designer, Software Developer, AI Workflow Designer, Chatbot Designer, Automation Builder, Web Developer ve kapsamına göre junior/mid-level yazılım rolleri için konumlanıyor.",
        links: [{ label: "İletişim", url: "mailto:kaanb8776@gmail.com" }, { label: "Deneyim", url: "blog.html" }]
      },
      certificates: {
        text: "Kaan'ın Udemy, Cisco ve benzeri platformlardan 25+ sertifikası var. Certificates sayfasında modern galeri ve büyük önizleme modalı bulunuyor.",
        links: [{ label: "Sertifikalar", url: "single-work.html" }]
      },
      default: {
        text: "Bunu tam eşleştiremedim ama Kaan'ın AI deneyimi, projeleri, tech stack'i, Joyday çalışmaları, CV'si, sertifikaları veya iletişim bilgileri hakkında yardımcı olabilirim. Aşağıdaki hazır sorulardan birini deneyebilirsin.",
        links: [{ label: "Projeler", url: "works.html" }, { label: "Hakkımda", url: "about.html" }]
      }
    }
  }
};

const chatbotKeywordMap = [
  { id: "joyday", keywords: ["joyday", "atolye", "atölye", "reservation", "rezervasyon", "workshop", "action painting", "paket"] },
  { id: "ai", keywords: ["ai", "yapay", "chatbot", "bot", "cbot", "n8n", "llm", "prompt", "ivr", "automation", "otomasyon", "flow", "akış"] },
  { id: "projects", keywords: ["project", "projects", "proje", "projeler", "work", "works", "portfolio", "portfolyo", "github"] },
  { id: "stack", keywords: ["stack", "tech", "technology", "teknoloji", "python", "c#", "javascript", "php", "unity", "unreal", "mysql", "firebase"] },
  { id: "cv", keywords: ["cv", "resume", "mail", "email", "contact", "iletişim", "linkedin", "ulaş"] },
  { id: "availability", keywords: ["available", "iş", "job", "role", "rol", "pozisyon", "hiring", "hire", "uygun"] },
  { id: "certificates", keywords: ["certificate", "certificates", "sertifika", "sertifikalar", "udemy", "cisco"] },
  { id: "about", keywords: ["kaan", "kim", "who", "about", "hakkında", "hakkımda", "mezun", "gpa", "gno"] }
];

let portfolioChatbotState = {
  initialized: false,
  language: "en",
  open: false
};

function getPortfolioChatbotContent(language = currentSiteLanguage || "en") {
  return portfolioChatbotContent[language === "tr" ? "tr" : "en"];
}

function detectChatbotIntent(message) {
  const normalized = String(message || "").toLocaleLowerCase("tr-TR");
  const match = chatbotKeywordMap.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)));
  return match?.id || "default";
}

function createChatbotLinks(links = []) {
  if (!links.length) return "";
  return `<div class="chatbot-message-links">${links.map((link) => `<a href="${escapeProjectHtml(link.url)}" ${link.url.startsWith("http") ? 'target="_blank" rel="noopener"' : ""}>${escapeProjectHtml(link.label)}</a>`).join("")}</div>`;
}

function addChatbotMessage(type, text, links = []) {
  const messageList = document.querySelector("[data-chatbot-messages]");
  if (!messageList) return;
  const message = document.createElement("div");
  message.className = `chatbot-message ${type === "user" ? "user" : "bot"}`;
  message.innerHTML = `<p>${escapeProjectHtml(text)}</p>${type === "bot" ? createChatbotLinks(links) : ""}`;
  messageList.appendChild(message);
  messageList.scrollTop = messageList.scrollHeight;
}

function answerChatbotIntent(intentId) {
  const content = getPortfolioChatbotContent(portfolioChatbotState.language);
  const answer = content.answers[intentId] || content.answers.default;
  addChatbotMessage("bot", answer.text, answer.links);
}

function renderChatbotQuickActions() {
  const content = getPortfolioChatbotContent(portfolioChatbotState.language);
  const quickContainer = document.querySelector("[data-chatbot-quicks]");
  if (!quickContainer) return;
  quickContainer.innerHTML = content.quicks
    .map((quick) => `<button type="button" data-chatbot-intent="${escapeProjectHtml(quick.id)}">${escapeProjectHtml(quick.label)}</button>`)
    .join("");

  quickContainer.querySelectorAll("[data-chatbot-intent]").forEach((button) => {
    button.addEventListener("click", () => {
      addChatbotMessage("user", button.textContent.trim());
      answerChatbotIntent(button.dataset.chatbotIntent || "default");
    });
  });
}

function resetChatbotMessages() {
  const content = getPortfolioChatbotContent(portfolioChatbotState.language);
  const messageList = document.querySelector("[data-chatbot-messages]");
  if (!messageList) return;
  messageList.innerHTML = "";
  addChatbotMessage("bot", content.greeting);
}

function updatePortfolioChatbotLanguage(language = currentSiteLanguage || "en") {
  portfolioChatbotState.language = language === "tr" ? "tr" : "en";
  const content = getPortfolioChatbotContent(portfolioChatbotState.language);
  const launcherText = document.querySelector("[data-chatbot-launcher-text]");
  const title = document.querySelector("[data-chatbot-title]");
  const subtitle = document.querySelector("[data-chatbot-subtitle]");
  const input = document.querySelector("[data-chatbot-input]");
  const send = document.querySelector("[data-chatbot-send]");
  const toggle = document.querySelector("[data-chatbot-toggle]");
  const close = document.querySelector("[data-chatbot-close]");

  if (launcherText) launcherText.textContent = content.launcher;
  if (title) title.textContent = content.title;
  if (subtitle) subtitle.textContent = content.subtitle;
  if (input) input.placeholder = content.inputPlaceholder;
  if (send) send.setAttribute("aria-label", content.sendLabel);
  if (toggle) toggle.setAttribute("aria-label", content.openLabel);
  if (close) close.setAttribute("aria-label", content.closeLabel);
  renderChatbotQuickActions();
  resetChatbotMessages();
}

function setChatbotOpen(isOpen) {
  const widget = document.querySelector("[data-portfolio-chatbot]");
  const panel = document.querySelector("[data-chatbot-panel]");
  const toggle = document.querySelector("[data-chatbot-toggle]");
  if (!widget || !panel || !toggle) return;
  portfolioChatbotState.open = isOpen;
  widget.classList.toggle("is-open", isOpen);
  panel.setAttribute("aria-hidden", String(!isOpen));
  toggle.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    const input = document.querySelector("[data-chatbot-input]");
    setTimeout(() => input?.focus(), 80);
  }
}

function setupPortfolioChatbot() {
  if (portfolioChatbotState.initialized || document.querySelector("[data-portfolio-chatbot]")) return;
  portfolioChatbotState.initialized = true;
  const content = getPortfolioChatbotContent(currentSiteLanguage || "en");
  const widget = document.createElement("aside");
  widget.className = "portfolio-chatbot";
  widget.setAttribute("data-portfolio-chatbot", "");
  widget.innerHTML = `
    <div class="chatbot-panel" data-chatbot-panel aria-hidden="true">
      <div class="chatbot-header">
        <div class="chatbot-avatar"><i class="bx bx-bot"></i></div>
        <div>
          <h2 data-chatbot-title>${escapeProjectHtml(content.title)}</h2>
          <p data-chatbot-subtitle>${escapeProjectHtml(content.subtitle)}</p>
        </div>
        <button class="chatbot-close" type="button" data-chatbot-close aria-label="${escapeProjectHtml(content.closeLabel)}"><i class="bx bx-x"></i></button>
      </div>
      <div class="chatbot-messages" data-chatbot-messages aria-live="polite"></div>
      <div class="chatbot-quicks" data-chatbot-quicks></div>
      <form class="chatbot-form" data-chatbot-form>
        <input type="text" data-chatbot-input autocomplete="off" placeholder="${escapeProjectHtml(content.inputPlaceholder)}" />
        <button type="submit" data-chatbot-send aria-label="${escapeProjectHtml(content.sendLabel)}"><i class="bx bx-send"></i></button>
      </form>
    </div>
    <button class="chatbot-launcher" type="button" data-chatbot-toggle aria-expanded="false" aria-label="${escapeProjectHtml(content.openLabel)}">
      <span class="chatbot-launcher-icon"><i class="bx bx-message-dots"></i></span>
      <span data-chatbot-launcher-text>${escapeProjectHtml(content.launcher)}</span>
    </button>
  `;
  document.body.appendChild(widget);

  document.querySelector("[data-chatbot-toggle]")?.addEventListener("click", () => setChatbotOpen(!portfolioChatbotState.open));
  document.querySelector("[data-chatbot-close]")?.addEventListener("click", () => setChatbotOpen(false));
  document.querySelector("[data-chatbot-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector("[data-chatbot-input]");
    const value = input?.value.trim() || "";
    if (!value) return;
    addChatbotMessage("user", value);
    input.value = "";
    answerChatbotIntent(detectChatbotIntent(value));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && portfolioChatbotState.open) setChatbotOpen(false);
  });

  updatePortfolioChatbotLanguage(currentSiteLanguage || "en");
}

setupPortfolioChatbot();


applyLanguage(localStorage.getItem("kaanbalci-site-language") || "en");


/* Ultimate portfolio enhancements: recruiter mode, command palette, project search and Ajoop navigation actions */
const ultimateContent = {
  en: {
    recruiterLabel: "Recruiter Mode",
    recruiterTitle: "Recruiter snapshot",
    recruiterLead: "A compact view of Kaan's profile for AI Designer and Software Developer opportunities.",
    availability: "Open for work",
    skillsTitle: "Top skills",
    projectsTitle: "Best evidence",
    commandsTitle: "Command palette",
    commandPlaceholder: "Search commands, pages, projects...",
    noResults: "No command found.",
    projectSearchPlaceholder: "Search by project, technology or keyword...",
    projectSearchLabel: "Search projects",
    copyDone: "Copied",
    commands: [
      { id: "home", label: "Go to Home", hint: "Landing page", keywords: "home landing", type: "nav", value: "index.html" },
      { id: "works", label: "Open Works", hint: "Project catalog", keywords: "projects works portfolio", type: "nav", value: "works.html" },
      { id: "joyday", label: "Open Joyday Case Study", hint: "Real business website", keywords: "joyday case study reservation", type: "nav", value: "project-detail.html?project=atolye-joyday-official-website" },
      { id: "cv", label: "View Resume", hint: "Google Drive CV", keywords: "resume cv", type: "resume" },
      { id: "pdf", label: "Download Portfolio PDF", hint: "Visual portfolio summary", keywords: "pdf portfolio download", type: "nav", value: "assets/kaan-balci-portfolio.pdf", external: true },
      { id: "github", label: "Open GitHub", hint: "UAJOP repositories", keywords: "github repo code", type: "nav", value: "https://github.com/UAJOP", external: true },
      { id: "linkedin", label: "Open LinkedIn", hint: "Professional profile", keywords: "linkedin contact", type: "nav", value: "https://www.linkedin.com/in/balcikaan/", external: true },
      { id: "theme", label: "Switch Theme", hint: "Dark / Light", keywords: "theme dark light", type: "theme" },
      { id: "language", label: "Switch Language", hint: "EN / TR", keywords: "language tr en", type: "language" },
      { id: "ajoop", label: "Open Ajoop", hint: "Portfolio assistant", keywords: "bot assistant ajoop chat", type: "chatbot" },
      { id: "recruiter", label: "Toggle Recruiter Mode", hint: "Compact hiring view", keywords: "recruiter hiring mode", type: "recruiter" },
      { id: "mathlab", label: "Open 3D Math Lab", hint: "Interactive canvas model", keywords: "3d math canvas model rotate", type: "scroll", value: "algorithmic-3d-lab" },
      { id: "easter", label: "Launch Easter Egg", hint: "Fireworks surprise", keywords: "easter egg fireworks surprise", type: "easter" }
    ]
  },
  tr: {
    recruiterLabel: "Recruiter Modu",
    recruiterTitle: "Recruiter özeti",
    recruiterLead: "AI Designer ve Software Developer fırsatları için Kaan'ın profilinin kompakt görünümü.",
    availability: "İşe açık",
    skillsTitle: "Öne çıkan yetenekler",
    projectsTitle: "En güçlü kanıtlar",
    commandsTitle: "Komut paleti",
    commandPlaceholder: "Komut, sayfa, proje ara...",
    noResults: "Komut bulunamadı.",
    projectSearchPlaceholder: "Proje, teknoloji veya anahtar kelime ara...",
    projectSearchLabel: "Projelerde ara",
    copyDone: "Kopyalandı",
    commands: [
      { id: "home", label: "Ana Sayfaya Git", hint: "Landing page", keywords: "home ana sayfa", type: "nav", value: "index.html" },
      { id: "works", label: "Projeleri Aç", hint: "Proje kataloğu", keywords: "projeler portfolio works", type: "nav", value: "works.html" },
      { id: "joyday", label: "Joyday Case Study Aç", hint: "Gerçek işletme web sitesi", keywords: "joyday case study rezervasyon", type: "nav", value: "project-detail.html?project=atolye-joyday-official-website" },
      { id: "cv", label: "CV'yi Görüntüle", hint: "Google Drive CV", keywords: "resume cv özgeçmiş", type: "resume" },
      { id: "pdf", label: "Portfolyo PDF İndir", hint: "Görsel portfolyo özeti", keywords: "pdf portfolyo indir", type: "nav", value: "assets/kaan-balci-portfolio.pdf", external: true },
      { id: "github", label: "GitHub Aç", hint: "UAJOP repository'leri", keywords: "github repo kod", type: "nav", value: "https://github.com/UAJOP", external: true },
      { id: "linkedin", label: "LinkedIn Aç", hint: "Profesyonel profil", keywords: "linkedin iletişim", type: "nav", value: "https://www.linkedin.com/in/balcikaan/", external: true },
      { id: "theme", label: "Tema Değiştir", hint: "Koyu / Açık", keywords: "tema koyu açık", type: "theme" },
      { id: "language", label: "Dil Değiştir", hint: "EN / TR", keywords: "dil tr en", type: "language" },
      { id: "ajoop", label: "Ajoop'u Aç", hint: "Portfolio asistanı", keywords: "bot asistan ajoop chat", type: "chatbot" },
      { id: "recruiter", label: "Recruiter Modunu Aç/Kapat", hint: "Kompakt işe alım görünümü", keywords: "recruiter iş mod", type: "recruiter" },
      { id: "mathlab", label: "3D Matematik Labını Aç", hint: "İnteraktif canvas modeli", keywords: "3d matematik canvas model döndür", type: "scroll", value: "algorithmic-3d-lab" },
      { id: "easter", label: "Easter Egg Başlat", hint: "Havai fişek sürprizi", keywords: "easter egg havai fişek sürpriz", type: "easter" }
    ]
  }
};

function getUltimateContent(language = currentSiteLanguage || "en") {
  return ultimateContent[language === "tr" ? "tr" : "en"];
}

function updateUltimateStaticLabels(language = currentSiteLanguage || "en") {
  const content = getUltimateContent(language);
  document.querySelectorAll("[data-recruiter-label]").forEach((node) => { node.textContent = content.recruiterLabel; });
  document.querySelectorAll("[data-availability-badge] strong").forEach((node) => { node.textContent = content.availability; });
  document.querySelectorAll("[data-command-input]").forEach((node) => { node.placeholder = content.commandPlaceholder; });
  document.querySelectorAll("[data-project-search]").forEach((node) => { node.placeholder = content.projectSearchPlaceholder; });
  document.querySelectorAll("[data-project-search-label]").forEach((node) => { node.textContent = content.projectSearchLabel; });
  renderRecruiterDrawer(language);
  renderCommandPalette(language);
}

function setupProjectSearch() {
  const grid = document.querySelector(".catalog-grid");
  const filterBar = document.querySelector(".filter-bar");
  if (!grid || !filterBar || document.querySelector("[data-project-search]")) return;
  const content = getUltimateContent();
  const searchWrap = document.createElement("div");
  searchWrap.className = "project-search-wrap reveal";
  searchWrap.innerHTML = `<label><span data-project-search-label>${escapeProjectHtml(content.projectSearchLabel)}</span><div><i class="bx bx-search"></i><input type="search" data-project-search placeholder="${escapeProjectHtml(content.projectSearchPlaceholder)}" /></div></label>`;
  filterBar.insertAdjacentElement("afterend", searchWrap);
  const input = searchWrap.querySelector("[data-project-search]");

  function applyEnhancedProjectFilter() {
    const activeCategory = document.querySelector("[data-filter-btn].active")?.dataset.filterBtn || "all";
    const query = normalizeI18nText(input.value || "").toLowerCase();
    projectCards.forEach((card) => {
      const categories = (card.dataset.category || "").split(" ");
      const categoryMatch = activeCategory === "all" || categories.includes(activeCategory);
      const text = normalizeI18nText(card.textContent || "").toLowerCase();
      const keywordMatch = !query || text.includes(query) || (card.dataset.projectLink || "").includes(query);
      card.classList.toggle("is-hidden", !(categoryMatch && keywordMatch));
    });
  }

  input.addEventListener("input", applyEnhancedProjectFilter);
  filterButtons.forEach((button) => button.addEventListener("click", () => setTimeout(applyEnhancedProjectFilter, 0)));
  applyEnhancedProjectFilter();
}

const recruiterItems = {
  en: {
    skills: ["AI Flow & chatbot design", "n8n-style automation", "Python / C# / JavaScript", "PHP / MySQL / Firebase", "Unity & Unreal Engine"],
    projects: [
      ["Atölye Joyday Official Website", "project-detail.html?project=atolye-joyday-official-website"],
      ["AI Chatbot Flow Design", "project-detail.html?project=ai-chatbot-flow-design"],
      ["Hospital Form App", "project-detail.html?project=hospital-form-app"]
    ],
    buttons: { cv: "View Resume", pdf: "Portfolio PDF", contact: "Email Me", close: "Close" }
  },
  tr: {
    skills: ["AI Flow & chatbot tasarımı", "n8n tarzı otomasyon", "Python / C# / JavaScript", "PHP / MySQL / Firebase", "Unity & Unreal Engine"],
    projects: [
      ["Atölye Joyday Official Website", "project-detail.html?project=atolye-joyday-official-website"],
      ["AI Chatbot Akış Tasarımı", "project-detail.html?project=ai-chatbot-flow-design"],
      ["Hospital Form App", "project-detail.html?project=hospital-form-app"]
    ],
    buttons: { cv: "CV'yi Gör", pdf: "Portfolyo PDF", contact: "E-posta", close: "Kapat" }
  }
};

function renderRecruiterDrawer(language = currentSiteLanguage || "en") {
  const drawer = document.querySelector("[data-recruiter-drawer]");
  if (!drawer) return;
  const content = getUltimateContent(language);
  const data = recruiterItems[language === "tr" ? "tr" : "en"];
  drawer.innerHTML = `
    <div class="recruiter-card">
      <button class="recruiter-close" type="button" data-recruiter-close aria-label="${escapeProjectHtml(data.buttons.close)}"><i class="bx bx-x"></i></button>
      <p class="eyebrow">${escapeProjectHtml(content.recruiterLabel)}</p>
      <h2>${escapeProjectHtml(content.recruiterTitle)}</h2>
      <p>${escapeProjectHtml(content.recruiterLead)}</p>
      <div class="recruiter-status"><span></span>${escapeProjectHtml(content.availability)}</div>
      <h3>${escapeProjectHtml(content.skillsTitle)}</h3>
      <div class="mini-stack">${data.skills.map((item) => `<span>${escapeProjectHtml(item)}</span>`).join("")}</div>
      <h3>${escapeProjectHtml(content.projectsTitle)}</h3>
      <div class="recruiter-links">${data.projects.map((item) => `<a href="${escapeProjectHtml(item[1])}">${escapeProjectHtml(item[0])}</a>`).join("")}</div>
      <div class="recruiter-actions">
        <button class="btn primary" type="button" onclick="openDrivePreviews()">${escapeProjectHtml(data.buttons.cv)}</button>
        <a class="btn ghost" href="assets/kaan-balci-portfolio.pdf" target="_blank" rel="noopener">${escapeProjectHtml(data.buttons.pdf)}</a>
        <a class="btn ghost" href="mailto:kaanb8776@gmail.com">${escapeProjectHtml(data.buttons.contact)}</a>
      </div>
    </div>`;
  drawer.querySelector("[data-recruiter-close]")?.addEventListener("click", () => setRecruiterMode(false));
}

function setRecruiterMode(isOpen) {
  document.body.classList.toggle("recruiter-mode-active", Boolean(isOpen));
  document.querySelector("[data-recruiter-drawer]")?.setAttribute("aria-hidden", String(!isOpen));
}

function setupRecruiterMode() {
  if (document.querySelector("[data-recruiter-drawer]")) return;
  const drawer = document.createElement("div");
  drawer.className = "recruiter-drawer";
  drawer.setAttribute("data-recruiter-drawer", "");
  drawer.setAttribute("aria-hidden", "true");
  document.body.appendChild(drawer);
  renderRecruiterDrawer();
  document.querySelectorAll("[data-recruiter-toggle]").forEach((button) => button.addEventListener("click", () => setRecruiterMode(!document.body.classList.contains("recruiter-mode-active"))));
  drawer.addEventListener("click", (event) => { if (event.target === drawer) setRecruiterMode(false); });
}

function executeCommand(command) {
  if (!command) return;
  setCommandPaletteOpen(false);
  if (command.type === "nav") {
    if (command.external) window.open(command.value, "_blank", "noopener,noreferrer"); else window.location.href = command.value;
  } else if (command.type === "resume") {
    openDrivePreviews();
  } else if (command.type === "theme") {
    applySiteTheme(siteThemeState.current === "light" ? "dark" : "light");
  } else if (command.type === "language") {
    applyLanguage((currentSiteLanguage || "en") === "tr" ? "en" : "tr");
  } else if (command.type === "chatbot") {
    setChatbotOpen(true);
  } else if (command.type === "recruiter") {
    setRecruiterMode(!document.body.classList.contains("recruiter-mode-active"));
  } else if (command.type === "scroll") {
    document.getElementById(command.value)?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (command.type === "easter") {
    launchEasterEgg();
  }
}

function renderCommandPalette(language = currentSiteLanguage || "en") {
  const palette = document.querySelector("[data-command-palette]");
  if (!palette) return;
  const content = getUltimateContent(language);
  const query = palette.querySelector("[data-command-input]")?.value?.toLowerCase() || "";
  const results = content.commands.filter((cmd) => `${cmd.label} ${cmd.hint} ${cmd.keywords}`.toLowerCase().includes(query)).slice(0, 9);
  const list = palette.querySelector("[data-command-results]");
  const title = palette.querySelector("[data-command-title]");
  const input = palette.querySelector("[data-command-input]");
  if (title) title.textContent = content.commandsTitle;
  if (input) input.placeholder = content.commandPlaceholder;
  if (!list) return;
  list.innerHTML = results.length ? results.map((cmd) => `<button type="button" data-command-id="${escapeProjectHtml(cmd.id)}"><strong>${escapeProjectHtml(cmd.label)}</strong><span>${escapeProjectHtml(cmd.hint)}</span></button>`).join("") : `<p class="command-empty">${escapeProjectHtml(content.noResults)}</p>`;
  list.querySelectorAll("[data-command-id]").forEach((button) => {
    button.addEventListener("click", () => executeCommand(content.commands.find((cmd) => cmd.id === button.dataset.commandId)));
  });
}

function setCommandPaletteOpen(isOpen) {
  const palette = document.querySelector("[data-command-palette]");
  if (!palette) return;
  palette.classList.toggle("is-open", Boolean(isOpen));
  palette.setAttribute("aria-hidden", String(!isOpen));
  if (isOpen) {
    const input = palette.querySelector("[data-command-input]");
    input.value = "";
    renderCommandPalette();
    setTimeout(() => input.focus(), 40);
  }
}

function setupCommandPalette() {
  if (document.querySelector("[data-command-palette]")) return;
  const content = getUltimateContent();
  const palette = document.createElement("div");
  palette.className = "command-palette";
  palette.setAttribute("data-command-palette", "");
  palette.setAttribute("aria-hidden", "true");
  palette.innerHTML = `<div class="command-box" role="dialog" aria-label="Command palette"><div class="command-head"><i class="bx bx-search"></i><input type="search" data-command-input placeholder="${escapeProjectHtml(content.commandPlaceholder)}" /><kbd>Esc</kbd></div><div class="command-title" data-command-title>${escapeProjectHtml(content.commandsTitle)}</div><div class="command-results" data-command-results></div></div>`;
  document.body.appendChild(palette);
  palette.querySelector("[data-command-input]")?.addEventListener("input", () => renderCommandPalette());
  palette.addEventListener("click", (event) => { if (event.target === palette) setCommandPaletteOpen(false); });
  document.querySelectorAll("[data-command-toggle]").forEach((button) => button.addEventListener("click", () => setCommandPaletteOpen(true)));
  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName;
    const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandPaletteOpen(true); }
    if (event.key === "Escape") { setCommandPaletteOpen(false); setRecruiterMode(false); }
  });
  renderCommandPalette();
}

function setupProjectCopyLink() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-project-link]");
    if (!button) return;
    const original = button.textContent;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      const temp = document.createElement("textarea"); temp.value = url; document.body.appendChild(temp); temp.select(); document.execCommand("copy"); temp.remove();
    }
    button.textContent = getUltimateContent().copyDone;
    setTimeout(() => { button.textContent = original; }, 1400);
  });
}

function enhanceAjoopNavigationActions() {
  if (!window.portfolioChatbotContent && typeof portfolioChatbotContent === "undefined") return;
  const resumeUrl = "https://drive.google.com/file/d/1Uvb0jqeYiesN_W2b5M7H6MIWdLtyE8oR/view?usp=sharing";
  ["en", "tr"].forEach((lang) => {
    const content = portfolioChatbotContent[lang];
    if (!content || content.__enhancedActions) return;
    content.__enhancedActions = true;
    const labels = lang === "tr"
      ? { works: "Projeler", about: "Hakkımda", cv: "CV", pdf: "Portfolyo PDF", mail: "E-posta", joyday: "Joyday Case Study", live: "Canlı Site", github: "GitHub", recruiter: "Recruiter Modu" }
      : { works: "Works", about: "About", cv: "Resume", pdf: "Portfolio PDF", mail: "Email", joyday: "Joyday Case Study", live: "Live Website", github: "GitHub", recruiter: "Recruiter Mode" };
    if (content.answers?.who) content.answers.who.links = [{ label: labels.about, url: "about.html" }, { label: labels.cv, url: resumeUrl }];
    if (content.answers?.projects) content.answers.projects.links = [{ label: labels.works, url: "works.html" }, { label: labels.joyday, url: "project-detail.html?project=atolye-joyday-official-website" }, { label: labels.github, url: "https://github.com/UAJOP" }];
    if (content.answers?.joyday) content.answers.joyday.links = [{ label: labels.joyday, url: "project-detail.html?project=atolye-joyday-official-website" }, { label: labels.live, url: "https://atolyejoyday.com/" }];
    if (content.answers?.contact) content.answers.contact.links = [{ label: labels.cv, url: resumeUrl }, { label: labels.pdf, url: "assets/kaan-balci-portfolio.pdf" }, { label: labels.mail, url: "mailto:kaanb8776@gmail.com" }];
    if (content.answers?.default) content.answers.default.links = [{ label: labels.works, url: "works.html" }, { label: labels.about, url: "about.html" }, { label: labels.mail, url: "mailto:kaanb8776@gmail.com" }];
  });
}

document.querySelectorAll("[data-open-chatbot]").forEach((button) => button.addEventListener("click", () => setChatbotOpen(true)));
setupProjectSearch();
setupRecruiterMode();
setupCommandPalette();
setupProjectCopyLink();
enhanceAjoopNavigationActions();
updateUltimateStaticLabels(currentSiteLanguage || "en");
document.querySelectorAll("[data-lang-switch]").forEach((button) => button.addEventListener("click", () => setTimeout(() => updateUltimateStaticLabels(currentSiteLanguage || "en"), 0)));


/* Creative final add-ons: easter egg, interactive 3D model and tiny performance pass */
(function setupPortfolioOptimizationPass() {
  document.querySelectorAll("img").forEach((img, index) => {
    if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
    if (!img.hasAttribute("loading") && !img.closest(".hero")) img.setAttribute("loading", "lazy");
    if (index === 0 || img.closest(".hero")) img.setAttribute("fetchpriority", "high");
  });
})();

function getCreativeText() {
  const tr = (currentSiteLanguage || "en") === "tr";
  return tr ? {
    surprise: "Sürpriz",
    title: "Tebrikler maceracı!",
    body: "Bu kadar gezdiğine göre portfolyonun gizli köşesini de hak ettin. Kod, tasarım ve biraz kaos: hepsi burada.",
    close: "Devam edelim",
    hint: "Gizli sürprizi başlat"
  } : {
    surprise: "Surprise",
    title: "Congrats, explorer!",
    body: "You explored deep enough to unlock the hidden corner of this portfolio. Code, design and a little chaos: all in one place.",
    close: "Keep exploring",
    hint: "Launch hidden surprise"
  };
}

function setupEasterEgg() {
  if (document.querySelector("[data-easter-trigger]")) return;
  const text = getCreativeText();
  const trigger = document.createElement("button");
  trigger.className = "easter-trigger";
  trigger.type = "button";
  trigger.setAttribute("data-easter-trigger", "");
  trigger.setAttribute("aria-label", text.hint);
  trigger.setAttribute("title", text.hint);
  trigger.innerHTML = '<i class="bx bxs-party"></i>';
  document.body.appendChild(trigger);
  trigger.addEventListener("click", launchEasterEgg);

  let logoClicks = 0;
  document.querySelectorAll(".brand img, .footer-brand img").forEach((logo) => {
    logo.addEventListener("click", () => {
      logoClicks += 1;
      clearTimeout(logo.__easterTimer);
      logo.__easterTimer = setTimeout(() => { logoClicks = 0; }, 1200);
      if (logoClicks >= 3) {
        logoClicks = 0;
        launchEasterEgg();
      }
    });
  });
}

function launchEasterEgg() {
  const text = getCreativeText();
  let layer = document.querySelector("[data-easter-layer]");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "easter-layer";
    layer.setAttribute("data-easter-layer", "");
    layer.innerHTML = '<canvas></canvas><div class="easter-message" data-easter-message><h2></h2><p></p><button class="btn primary easter-close" type="button"></button></div>';
    document.body.appendChild(layer);
    layer.querySelector(".easter-close")?.addEventListener("click", () => closeEasterEgg(layer));
  }

  const canvas = layer.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const message = layer.querySelector("[data-easter-message]");
  message.querySelector("h2").textContent = text.title;
  message.querySelector("p").textContent = text.body;
  message.querySelector("button").textContent = text.close;
  layer.classList.add("is-active");
  requestAnimationFrame(() => message.classList.add("is-visible"));
  document.body.classList.remove("site-shake");
  void document.body.offsetWidth;
  document.body.classList.add("site-shake");

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const particles = [];
  const colors = ["#38bdf8", "#22d3ee", "#818cf8", "#34d399", "#fbbf24", "#fb7185", "#ffffff"];
  const burst = (x, y, amount = 86) => {
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 7;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 70 + Math.random() * 45,
        age: 0,
        size: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  };

  const positions = [0.18, 0.38, 0.62, 0.82];
  positions.forEach((pos, index) => setTimeout(() => burst(window.innerWidth * pos, window.innerHeight * (0.24 + Math.random() * 0.42), 74), index * 220));
  const interval = setInterval(() => burst(80 + Math.random() * (window.innerWidth - 160), 90 + Math.random() * (window.innerHeight * 0.5), 54), 420);
  setTimeout(() => clearInterval(interval), 2200);

  const start = performance.now();
  function frame(now) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.globalCompositeOperation = "lighter";
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.age += 1;
      p.vy += 0.045;
      p.vx *= 0.992;
      p.vy *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      if (p.age >= p.life) particles.splice(i, 1);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (now - start < 5200 || particles.length) requestAnimationFrame(frame);
    else closeEasterEgg(layer);
  }
  requestAnimationFrame(frame);
  setTimeout(() => document.body.classList.remove("site-shake"), 900);
}

function closeEasterEgg(layer = document.querySelector("[data-easter-layer]")) {
  if (!layer) return;
  layer.querySelector("[data-easter-message]")?.classList.remove("is-visible");
  setTimeout(() => layer.classList.remove("is-active"), 220);
}

function setupAlgorithmic3DLab() {
  const canvas = document.getElementById("math-3d-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const state = { rx: -0.62, ry: 0.72, rz: 0.05, zoom: 1, dragging: false, lastX: 0, lastY: 0, visible: false, raf: null, t: 0 };
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pointFromBarycentric(i, j, n, time) {
    const u = i / n;
    const v = j / n;
    const w = 1 - u - v;
    const ax = -1.75, ay = -1.12;
    const bx = 1.75, by = -1.12;
    const cx = 0, cy = 1.72;
    const x = ax * w + bx * u + cx * v;
    const y = ay * w + by * u + cy * v;
    const z = 0.46 * Math.sin((u * 4.4 + time) * Math.PI) * Math.cos((v * 3.8 - time * 0.7) * Math.PI) + 0.18 * Math.sin((w * 5.2 + time * 0.5) * Math.PI);
    return { x, y, z };
  }

  function rotate(p) {
    const cx = Math.cos(state.rx), sx = Math.sin(state.rx);
    const cy = Math.cos(state.ry), sy = Math.sin(state.ry);
    const cz = Math.cos(state.rz), sz = Math.sin(state.rz);
    let y = p.y * cx - p.z * sx;
    let z = p.y * sx + p.z * cx;
    let x = p.x * cy + z * sy;
    z = -p.x * sy + z * cy;
    const x2 = x * cz - y * sz;
    const y2 = x * sz + y * cz;
    return { x: x2, y: y2, z };
  }

  function project(p, width, height) {
    const camera = 5.2;
    const scale = Math.min(width, height) * 0.31 * state.zoom;
    const perspective = camera / (camera - p.z);
    return { x: width / 2 + p.x * scale * perspective, y: height / 2 - p.y * scale * perspective, z: p.z, perspective };
  }

  function buildFaces(time) {
    const n = 18;
    const vertices = [];
    const index = new Map();
    for (let i = 0; i <= n; i += 1) {
      for (let j = 0; j <= n - i; j += 1) {
        index.set(`${i},${j}`, vertices.length);
        vertices.push(pointFromBarycentric(i, j, n, time));
      }
    }
    const faces = [];
    const get = (i, j) => vertices[index.get(`${i},${j}`)];
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n - i; j += 1) {
        faces.push([get(i, j), get(i + 1, j), get(i, j + 1)]);
        if (j < n - i - 1) faces.push([get(i + 1, j), get(i + 1, j + 1), get(i, j + 1)]);
      }
    }
    return faces;
  }

  function drawAxes(width, height) {
    const axes = [
      [{ x: 0, y: 0, z: 0 }, { x: 2.25, y: 0, z: 0 }, "X"],
      [{ x: 0, y: 0, z: 0 }, { x: 0, y: 2.25, z: 0 }, "Y"],
      [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1.8 }, "Z"]
    ];
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.font = "700 12px Inter, system-ui";
    axes.forEach(([a, b, label]) => {
      const pa = project(rotate(a), width, height);
      const pb = project(rotate(b), width, height);
      ctx.strokeStyle = label === "X" ? "rgba(56,189,248,.75)" : label === "Y" ? "rgba(52,211,153,.75)" : "rgba(251,191,36,.8)";
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.fillText(label, pb.x + 6, pb.y + 4);
    });
    ctx.restore();
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createRadialGradient(width * 0.45, height * 0.35, 20, width * 0.5, height * 0.5, Math.max(width, height) * 0.62);
    gradient.addColorStop(0, "rgba(56,189,248,.16)");
    gradient.addColorStop(1, "rgba(7,17,31,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const faces = buildFaces(state.t).map((face) => {
      const rp = face.map(rotate);
      const pp = rp.map((p) => project(p, width, height));
      const depth = rp.reduce((sum, p) => sum + p.z, 0) / rp.length;
      const heightValue = face.reduce((sum, p) => sum + p.z, 0) / face.length;
      return { points: pp, depth, heightValue };
    }).sort((a, b) => a.depth - b.depth);

    drawAxes(width, height);
    faces.forEach((face) => {
      const light = Math.max(0, Math.min(1, (face.heightValue + 0.75) / 1.5));
      const alpha = 0.32 + light * 0.38;
      ctx.beginPath();
      ctx.moveTo(face.points[0].x, face.points[0].y);
      ctx.lineTo(face.points[1].x, face.points[1].y);
      ctx.lineTo(face.points[2].x, face.points[2].y);
      ctx.closePath();
      ctx.fillStyle = `rgba(${Math.round(50 + light * 80)}, ${Math.round(150 + light * 80)}, 248, ${alpha})`;
      ctx.strokeStyle = "rgba(210, 235, 255, 0.15)";
      ctx.lineWidth = 0.8;
      ctx.fill();
      ctx.stroke();
    });
  }

  function animate() {
    if (!state.visible) return;
    if (!state.dragging && !prefersReducedMotion) state.ry += 0.0025;
    state.t += prefersReducedMotion ? 0 : 0.004;
    draw();
    state.raf = requestAnimationFrame(animate);
  }

  function start() {
    if (state.visible) return;
    state.visible = true;
    resizeCanvas();
    animate();
  }

  function stop() {
    state.visible = false;
    if (state.raf) cancelAnimationFrame(state.raf);
  }

  canvas.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.ry += dx * 0.008;
    state.rx += dy * 0.008;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    draw();
  });
  canvas.addEventListener("pointerup", () => { state.dragging = false; });
  canvas.addEventListener("pointercancel", () => { state.dragging = false; });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    state.zoom = Math.max(0.72, Math.min(1.7, state.zoom + (event.deltaY > 0 ? -0.06 : 0.06)));
    draw();
  }, { passive: false });

  window.addEventListener("resize", () => { resizeCanvas(); draw(); }, { passive: true });
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.isIntersecting ? start() : stop());
    }, { threshold: 0.12 });
    observer.observe(canvas);
  } else {
    start();
  }
}

function extendCreativeCommands() {
  if (typeof ultimateContent === "undefined") return;
  const hasCommand = (lang, id) => ultimateContent[lang]?.commands?.some((command) => command.id === id);
  if (!hasCommand("en", "mathlab")) ultimateContent.en.commands.push({ id: "mathlab", label: "Open 3D Math Lab", hint: "Interactive canvas model", keywords: "3d math canvas model rotate", type: "scroll", value: "algorithmic-3d-lab" });
  if (!hasCommand("en", "easter")) ultimateContent.en.commands.push({ id: "easter", label: "Launch Easter Egg", hint: "Fireworks surprise", keywords: "easter egg fireworks surprise", type: "easter" });
  if (!hasCommand("tr", "mathlab")) ultimateContent.tr.commands.push({ id: "mathlab", label: "3D Matematik Labını Aç", hint: "İnteraktif canvas modeli", keywords: "3d matematik canvas model döndür", type: "scroll", value: "algorithmic-3d-lab" });
  if (!hasCommand("tr", "easter")) ultimateContent.tr.commands.push({ id: "easter", label: "Easter Egg Başlat", hint: "Havai fişek sürprizi", keywords: "easter egg havai fişek sürpriz", type: "easter" });
}

extendCreativeCommands();
setupEasterEgg();
setupAlgorithmic3DLab();


/* Project request page and service inquiry flow */
function getRequestFormText() {
  const tr = (currentSiteLanguage || "en") === "tr";
  return tr ? {
    sending: "Talep gönderiliyor...",
    success: "Talebin alındı. Bilgiler tabloya kaydedildi; bana bilgilendirme maili, sana da onay maili gönderilecek.",
    fallback: "Mail gönderim endpointi henüz bağlanmadığı için e-posta taslağı açıldı. Google Apps Script URL'si request-config.js içine eklenince form direkt mail atacak.",
    error: "Talep gönderilirken bir sorun oluştu. Lütfen tekrar dene veya e-posta butonunu kullan.",
    consent: "Devam etmek için iletişim iznini onaylamalısın.",
    subject: "Yeni proje talebi",
    button: "Talebi Gönder"
  } : {
    sending: "Sending request...",
    success: "Your request has been received. The details are saved to the tracking sheet; I will receive a notification and you will receive a confirmation email.",
    fallback: "The direct email endpoint is not connected yet, so an email draft was opened. After adding the Google Apps Script URL into request-config.js, the form will send emails directly.",
    error: "Something went wrong while sending the request. Please try again or use the email button.",
    consent: "Please confirm the consent checkbox to continue.",
    subject: "New project request",
    button: "Send Request"
  };
}

function setRequestStatus(type, message) {
  const status = document.querySelector("[data-request-status]");
  if (!status) return;
  status.className = `request-status is-visible ${type || ""}`.trim();
  status.textContent = message;
}

function buildRequestMailto(payload) {
  const owner = window.KAAN_REQUEST_FORM_EMAIL || "kaanb8776@gmail.com";
  const subject = `${getRequestFormText().subject}: ${payload.serviceType || "Portfolio"}`;
  const body = [
    `Name: ${payload.name || ""}`,
    `Email: ${payload.email || ""}`,
    `Phone: ${payload.phone || ""}`,
    `Company: ${payload.company || ""}`,
    `Project Type: ${payload.serviceType || ""}`,
    `Budget: ${payload.budget || ""}`,
    `Timeline: ${payload.timeline || ""}`,
    `Preferred Contact: ${payload.preferredContact || ""}`,
    "",
    "Project Details:",
    payload.details || "",
    "",
    `Source: ${payload.source || "kaanbalci.com"}`
  ].join("\n");
  return `mailto:${encodeURIComponent(owner)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function setupProjectRequestForm() {
  const form = document.querySelector("[data-request-form]");
  if (!form || form.__requestFormReady) return;
  form.__requestFormReady = true;
  const submit = form.querySelector("[data-request-submit]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = getRequestFormText();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.pageUrl = window.location.href;
    payload.submittedAt = new Date().toISOString();

    if (!form.querySelector('input[name="consent"]')?.checked) {
      setRequestStatus("warning", text.consent);
      return;
    }

    const endpoint = String(window.KAAN_REQUEST_FORM_ENDPOINT || "").trim();
    if (submit) {
      submit.disabled = true;
      submit.textContent = text.sending;
    }

    try {
      if (endpoint && !endpoint.includes("PASTE") && endpoint.startsWith("http")) {
        await fetch(endpoint, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: new URLSearchParams(payload).toString()
        });
        form.reset();
        setRequestStatus("success", text.success);
      } else {
        window.location.href = buildRequestMailto(payload);
        setRequestStatus("warning", text.fallback);
      }
    } catch (error) {
      console.error("Request form error", error);
      setRequestStatus("error", text.error);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = text.button;
      }
    }
  });
}


function setupGoogleFormLinks() {
  const url = String(window.KAAN_GOOGLE_FORM_URL || "").trim();
  if (!url) return;
  document.querySelectorAll("[data-google-form-link]").forEach((link) => {
    link.setAttribute("href", url);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener");
  });
}

function enhanceRequestCommandsAndAjoop() {
  if (typeof ultimateContent !== "undefined") {
    const addCommand = (lang, command) => {
      if (!ultimateContent[lang]?.commands?.some((item) => item.id === command.id)) ultimateContent[lang].commands.push(command);
    };
    addCommand("en", { id: "request", label: "Request a Project", hint: "Send a website, AI or automation request", keywords: "request form project hire job service website ai automation", type: "nav", value: "request.html" });
    addCommand("tr", { id: "request", label: "Proje Talebi Gönder", hint: "Web, AI veya otomasyon talebi gönder", keywords: "talep form proje iş hizmet web sitesi ai otomasyon", type: "nav", value: "request.html" });
  }

  if (typeof portfolioChatbotContent !== "undefined") {
    const en = portfolioChatbotContent.en;
    const tr = portfolioChatbotContent.tr;
    if (en && !en.quicks.some((item) => item.id === "request")) {
      en.quicks.push({ id: "request", label: "Request a project" });
      en.answers.request = { text: "You can send a project request directly from the new Request page. It is designed for websites, AI workflows, chatbot flows, automation, dashboards and similar software work.", links: [{ label: "Open Request Form", url: "request.html" }, { label: "Online Form", url: window.KAAN_GOOGLE_FORM_URL || "https://docs.google.com/forms/d/e/1FAIpQLSdaC7iDV1f6aU3S3kKhJfHTEue9n8KRtwj-j7k6cT0i98lbiQ/viewform?usp=dialog" }, { label: "Email", url: "mailto:kaanb8776@gmail.com" }] };
    }
    if (tr && !tr.quicks.some((item) => item.id === "request")) {
      tr.quicks.push({ id: "request", label: "Proje talebi" });
      tr.answers.request = { text: "Yeni Talep sayfasından web sitesi, AI workflow, chatbot akışı, otomasyon, dashboard ve benzeri yazılım işleri için proje talebi gönderebilirsin.", links: [{ label: "Talep Formunu Aç", url: "request.html" }, { label: "Online Form", url: window.KAAN_GOOGLE_FORM_URL || "https://docs.google.com/forms/d/e/1FAIpQLSdaC7iDV1f6aU3S3kKhJfHTEue9n8KRtwj-j7k6cT0i98lbiQ/viewform?usp=dialog" }, { label: "E-posta", url: "mailto:kaanb8776@gmail.com" }] };
    }
    if (!chatbotKeywordMap.some((item) => item.id === "request")) chatbotKeywordMap.unshift({ id: "request", keywords: ["request", "talep", "form", "iş talebi", "proje talebi", "hire", "service", "hizmet", "teklif"] });
    updatePortfolioChatbotLanguage?.(currentSiteLanguage || "en");
  }
}

enhanceRequestCommandsAndAjoop();
setupGoogleFormLinks();
setupProjectRequestForm();
document.querySelectorAll("[data-lang-switch]").forEach((button) => button.addEventListener("click", () => setTimeout(setupProjectRequestForm, 0)));
