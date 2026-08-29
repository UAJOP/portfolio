/**
 * Ajoop content, dialogue depth and the assistant UI controller.
 *
 * Extracted from legacy-script.js by BRIEF 03 (frontend runtime modularization).
 * Source lines at 891388d: 1974-2820, 2935-3126.
 * Behaviour is unchanged; this file is a verbatim slice.
 */
const portfolioChatbotContent = {
  en: {
    launcher: "Ask Ajoop",
    title: "Ajoop",
    subtitle: "",
    greeting:
      "Hey, I am Ajoop. I can quickly explain Kaan's skills, projects, AI experience, Joyday work, CV and contact options. Choose a question or type a keyword.",
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
      { id: "cv", label: "CV & contact" },
    ],
    answers: {
      about: {
        text: "Kaan Balcı is an AI Designer & Software Developer focused on conversational AI, solution engineering, LLM evaluation, workflow automation and user-centered software products. He has contributed to 50+ academic, personal, freelance and team-based projects.",
        links: [
          { label: "About", url: "about.html" },
          { label: "Experience", url: "blog.html" },
        ],
      },
      ai: {
        text: "Kaan's AI direction is based on chatbot flow design, n8n-style automation logic, IVR and multi-channel workflows, LLM evaluation, prompt analysis and output review. At CBOT, he contributed to enterprise chatbot QA, stabilization, flow restructuring and an insurance claims intake POC.",
        links: [
          {
            label: "AI Case Study",
            url: "projects/ai-chatbot-flow-design/",
          },
          { label: "Experience", url: "blog.html" },
        ],
      },
      projects: {
        text: "The strongest project areas are AI Chatbot Flow Design, Atölye Joyday Official Website, Hospital Appointment System, Hospital Form App, Drivenfinity and Cars Dataset Analysis. The Works page now combines selected case studies and the main public GitHub repository catalog with dynamic detail pages.",
        links: [
          { label: "View Works", url: "works.html" },
          {
            label: "View Atölye Joyday Case Study",
            url: "atolye-joyday-case-study.html",
          },
        ],
      },
      joyday: {
        text: "Atölye Joyday is a real business project. Kaan designed and developed the website experience, service pages, package flow and reservation journey. It shows practical product thinking because it connects customer experience with operational tracking.",
        links: [
          {
            label: "View Atölye Joyday Case Study",
            url: "atolye-joyday-case-study.html",
          },
          {
            label: "Open Atölye Joyday Website",
            url: "https://atolyejoyday.com/",
          },
        ],
      },
      stack: {
        text: "Main stack: Python, C#/.NET, JavaScript, PHP, Java, Kotlin, C++, MySQL, MSSQL, Firebase, Unity, Unreal Engine, n8n, AI Flow and LLM evaluation workflows.",
        links: [
          { label: "About", url: "about.html" },
          { label: "Works", url: "works.html" },
        ],
      },
      cv: {
        text: "You can view Kaan's CV, contact him by email, or reach him through LinkedIn and GitHub from the site footer. For Forward Deployed Engineer opportunities, the fastest path is CV + LinkedIn.",
        links: [
          { label: "View Resume", url: resumeLink },
          { label: "Email", url: "mailto:kaanb8776@gmail.com" },
          { label: "LinkedIn", url: "https://www.linkedin.com/in/balcikaan/" },
          { label: "GitHub", url: "https://github.com/UAJOP" },
        ],
      },
      availability: {
        text: "Kaan is currently positioning primarily as a Forward Deployed Engineer, supported by evidence across Applied AI, AI reliability, solution engineering, automation and product-minded software delivery.",
        links: [
          { label: "Contact", url: "mailto:kaanb8776@gmail.com" },
          { label: "Experience", url: "blog.html" },
        ],
      },
      certificates: {
        text: "Kaan has 25+ certifications across Udemy, Cisco and related platforms. The Certificates page shows a clean gallery with preview modal support.",
        links: [{ label: "Certificates", url: "single-work.html" }],
      },
      default: {
        text: "I could not match that exactly, but I can help with Kaan's AI experience, projects, tech stack, Joyday work, CV, certificates or contact details. Try one of the quick questions below.",
        links: [
          { label: "Works", url: "works.html" },
          { label: "About", url: "about.html" },
        ],
      },
    },
  },
  tr: {
    launcher: "Ajoop'a Sor",
    title: "Ajoop",
    subtitle: "",
    greeting:
      "Selam, ben Ajoop. Kaan'ın yeteneklerini, projelerini, AI deneyimini, Joyday çalışmalarını, CV ve iletişim seçeneklerini hızlıca anlatabilirim. Bir soru seçebilir veya anahtar kelime yazabilirsin.",
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
      { id: "cv", label: "CV & iletişim" },
    ],
    answers: {
      about: {
        text: "Kaan Balcı; conversational AI, solution engineering, LLM değerlendirme, workflow otomasyonu ve kullanıcı odaklı yazılım ürünlerine odaklanan bir AI Designer & Software Developer. 50+ akademik, kişisel, freelance ve ekip projesine katkı sağladı.",
        links: [
          { label: "Hakkımda", url: "about.html" },
          { label: "Deneyim", url: "blog.html" },
        ],
      },
      ai: {
        text: "Kaan'ın AI tarafı chatbot akış tasarımı, n8n tarzı otomasyon mantığı, IVR ve çok kanallı workflow'lar, LLM değerlendirme, prompt analizi ve çıktı inceleme üzerine kurulu. CBOT'ta kurumsal chatbot QA, stabilizasyon, akış yeniden yapılandırma ve sigorta hasar başvuru POC çalışmalarına katkı sağladı.",
        links: [
          {
            label: "AI Case Study",
            url: "projects/ai-chatbot-flow-design/",
          },
          { label: "Deneyim", url: "blog.html" },
        ],
      },
      projects: {
        text: "En güçlü proje alanları: AI Chatbot Flow Design, Atölye Joyday Official Website, Hospital Appointment System, Hospital Form App, Drivenfinity ve Cars Dataset Analysis. Projeler sayfası artık seçili case study’leri ve ana public GitHub repository kataloğunu dinamik detay sayfalarıyla birlikte topluyor.",
        links: [
          { label: "Projeleri Gör", url: "works.html" },
          {
            label: "Atölye Joyday Vaka Çalışmasını Gör",
            url: "atolye-joyday-case-study.html",
          },
        ],
      },
      joyday: {
        text: "Atölye Joyday gerçek bir işletme projesi. Kaan web deneyimini, hizmet sayfalarını, paket akışını ve rezervasyon yolculuğunu tasarlayıp geliştirdi. Müşteri deneyimini operasyon takibiyle bağladığı için güçlü bir canlı işletme vaka çalışması olarak duruyor.",
        links: [
          {
            label: "Atölye Joyday Vaka Çalışmasını Gör",
            url: "atolye-joyday-case-study.html",
          },
          {
            label: "Atölye Joyday Canlı Sitesini Aç",
            url: "https://atolyejoyday.com/",
          },
        ],
      },
      stack: {
        text: "Ana stack: Python, C#/.NET, JavaScript, PHP, Java, Kotlin, C++, MySQL, MSSQL, Firebase, Unity, Unreal Engine, n8n, AI Flow ve LLM değerlendirme iş akışları.",
        links: [
          { label: "Hakkımda", url: "about.html" },
          { label: "Projeler", url: "works.html" },
        ],
      },
      cv: {
        text: "Kaan'ın CV'sini görüntüleyebilir, mail atabilir veya LinkedIn/GitHub üzerinden ulaşabilirsin. Forward Deployed Engineer fırsatları için en hızlı yol CV + LinkedIn.",
        links: [
          { label: "CV'yi Görüntüle", url: resumeLink },
          { label: "E-posta", url: "mailto:kaanb8776@gmail.com" },
          { label: "LinkedIn", url: "https://www.linkedin.com/in/balcikaan/" },
          { label: "GitHub", url: "https://github.com/UAJOP" },
        ],
      },
      availability: {
        text: "Kaan öncelikli olarak Forward Deployed Engineer yönünde konumlanıyor; Applied AI, AI reliability, solution engineering, otomasyon ve ürün odaklı yazılım geliştirme kanıtları bu yönü destekliyor.",
        links: [
          { label: "İletişim", url: "mailto:kaanb8776@gmail.com" },
          { label: "Deneyim", url: "blog.html" },
        ],
      },
      certificates: {
        text: "Kaan'ın Udemy, Cisco ve benzeri platformlardan 25+ sertifikası var. Certificates sayfasında modern galeri ve büyük önizleme modalı bulunuyor.",
        links: [{ label: "Sertifikalar", url: "single-work.html" }],
      },
      default: {
        text: "Bunu tam eşleştiremedim ama Kaan'ın AI deneyimi, projeleri, tech stack'i, Joyday çalışmaları, CV'si, sertifikaları veya iletişim bilgileri hakkında yardımcı olabilirim. Aşağıdaki hazır sorulardan birini deneyebilirsin.",
        links: [
          { label: "Projeler", url: "works.html" },
          { label: "Hakkımda", url: "about.html" },
        ],
      },
    },
  },
};

const chatbotKeywordMap = [
  {
    id: "joyday",
    keywords: [
      "joyday",
      "atolye",
      "atölye",
      "reservation",
      "rezervasyon",
      "workshop",
      "action painting",
      "paket",
    ],
  },
  {
    id: "ai",
    keywords: [
      "ai",
      "yapay",
      "chatbot",
      "bot",
      "cbot",
      "n8n",
      "llm",
      "prompt",
      "ivr",
      "automation",
      "otomasyon",
      "flow",
      "akış",
    ],
  },
  {
    id: "projects",
    keywords: [
      "project",
      "projects",
      "proje",
      "projeler",
      "work",
      "works",
      "portfolio",
      "portfolyo",
      "github",
      "hospital",
      "hastane",
    ],
  },
  {
    id: "stack",
    keywords: [
      "stack",
      "tech",
      "technology",
      "teknoloji",
      "python",
      "c#",
      "javascript",
      "php",
      "unity",
      "unreal",
      "mysql",
      "firebase",
    ],
  },
  {
    id: "cv",
    keywords: [
      "cv",
      "resume",
      "mail",
      "email",
      "contact",
      "iletişim",
      "linkedin",
      "ulaş",
    ],
  },
  {
    id: "availability",
    keywords: [
      "available",
      "iş",
      "job",
      "role",
      "rol",
      "pozisyon",
      "hiring",
      "hire",
      "uygun",
    ],
  },
  {
    id: "certificates",
    keywords: [
      "certificate",
      "certificates",
      "sertifika",
      "sertifikalar",
      "udemy",
      "cisco",
    ],
  },
  {
    id: "about",
    keywords: ["kaan", "kim", "who", "about", "hakkında", "hakkımda", "mezun"],
  },
];

function enhanceAjoopDialogDepth() {
  const linkSets = {
    en: {
      about: [
        { label: "About", url: "about.html" },
        { label: "Experience", url: "blog.html" },
      ],
      projects: [
        { label: "View Works", url: "works.html" },
        {
          label: "View Atölye Joyday Case Study",
          url: "atolye-joyday-case-study.html",
        },
        {
          label: "View Hospital System Case Study",
          url: "hospital-system-case-study.html",
        },
        {
          label: "Open Hospital System Source Archive",
          url: "https://github.com/UAJOP/Hospital-System",
        },
        { label: "GitHub", url: "https://github.com/UAJOP" },
      ],
      ai: [
        {
          label: "AI Case Study",
          url: "projects/ai-chatbot-flow-design/",
        },
        { label: "Experience", url: "blog.html" },
      ],
      contact: [
        { label: "Email", url: "mailto:kaanb8776@gmail.com" },
        { label: "LinkedIn", url: "https://www.linkedin.com/in/balcikaan/" },
        { label: "GitHub", url: "https://github.com/UAJOP" },
      ],
    },
    tr: {
      about: [
        { label: "Hakkımda", url: "about.html" },
        { label: "Deneyim", url: "blog.html" },
      ],
      projects: [
        { label: "Projeleri Gör", url: "works.html" },
        {
          label: "Atölye Joyday Vaka Çalışmasını Gör",
          url: "atolye-joyday-case-study.html",
        },
        {
          label: "Hospital System Vaka Çalışmasını Gör",
          url: "hospital-system-case-study.html",
        },
        {
          label: "Hospital System Kaynak Arşivini Aç",
          url: "https://github.com/UAJOP/Hospital-System",
        },
        { label: "GitHub", url: "https://github.com/UAJOP" },
      ],
      ai: [
        {
          label: "AI Case Study",
          url: "projects/ai-chatbot-flow-design/",
        },
        { label: "Deneyim", url: "blog.html" },
      ],
      contact: [
        { label: "E-posta", url: "mailto:kaanb8776@gmail.com" },
        { label: "LinkedIn", url: "https://www.linkedin.com/in/balcikaan/" },
        { label: "GitHub", url: "https://github.com/UAJOP" },
      ],
    },
  };

  portfolioChatbotContent.en.greeting = [
    "Hey, I am Ajoop. I can explain Kaan's AI, software, projects, CV and contact options. Pick a quick question or type naturally.",
    "Hi! Ajoop here. Ask me about Kaan's AI Designer profile, CBOT experience, Joyday project, tech stack or best portfolio projects.",
    "Welcome. I can give you a quick recruiter-style summary of Kaan or guide you to the right project page.",
    "Hey there. I know Kaan's portfolio structure, strongest projects, AI experience and contact routes. What should we open first?",
    "Hello! You can ask me about AI workflows, automation, web projects, game projects, CV, certificates or role fit.",
  ];
  portfolioChatbotContent.tr.greeting = [
    "Selam, ben Ajoop. Kaan'ın AI, yazılım, projeler, CV ve iletişim tarafını hızlıca anlatabilirim. Hazır sorulardan seçebilir ya da direkt yazabilirsin.",
    "Hoş geldin. Kaan'ın AI Designer profili, CBOT deneyimi, Joyday projesi, teknoloji stack'i ve güçlü projeleri hakkında yardımcı olurum.",
    "Merhaba, Ajoop burada. İstersen sana Kaan'ın profilini İK gözüyle özetleyeyim, istersen direkt proje sayfalarına yönlendireyim.",
    "Selam! Kaan'ın portfolyo yapısını, en güçlü projelerini, AI deneyimini ve iletişim yollarını biliyorum. Nereden başlayalım?",
    "Hey, burada portfolyo asistanı var. AI workflow, otomasyon, web projeleri, oyun projeleri, CV, sertifikalar veya role uygunluk sorabilirsin.",
  ];

  portfolioChatbotContent.en.quicks = [
    { id: "about", label: "Who is Kaan?" },
    { id: "ai", label: "AI experience" },
    { id: "experience", label: "Work history" },
    { id: "projects", label: "Best projects" },
    { id: "roles", label: "Role fit" },
    { id: "joyday", label: "Joyday" },
    { id: "weather", label: "Weather?" },
    { id: "cv", label: "CV & contact" },
  ];
  portfolioChatbotContent.tr.quicks = [
    { id: "about", label: "Kaan kim?" },
    { id: "ai", label: "AI deneyimi" },
    { id: "experience", label: "İş geçmişi" },
    { id: "projects", label: "En iyi projeler" },
    { id: "roles", label: "Role uygunluk" },
    { id: "joyday", label: "Joyday" },
    { id: "weather", label: "Hava?" },
    { id: "cv", label: "CV & iletişim" },
  ];

  Object.assign(portfolioChatbotContent.en.answers, {
    greeting: {
      text: portfolioChatbotContent.en.greeting,
      links: linkSets.en.about,
    },
    about: {
      text: [
        "Kaan Balcı is an AI Designer & Software Developer focused on AI workflows, chatbot logic, automation, backend, web/mobile products and game development. He has experience contributing to 50+ academic, personal, freelance and team-based projects and a Computer Programming background.",
        "Kaan combines software development with AI workflow design. His profile is strongest where chatbot systems, automation logic, backend thinking and usable web products meet.",
        "Kaan is positioned as a practical AI and software builder: he can design flows, build interfaces, evaluate LLM outputs and connect business needs to technical solutions.",
        "In one line: Kaan builds practical AI workflows and software systems, with experience across CBOT, Outlier AI, Joyday, backend tools and game prototypes.",
        "Kaan's profile is not only coding. It also includes client communication, operations, product thinking and turning business requirements into usable digital flows.",
      ],
      links: linkSets.en.about,
    },
    ai: {
      text: [
        "Kaan's AI side covers chatbot flow design, AI Flow logic, n8n-style automation, IVR awareness, LLM response evaluation, prompt review and code-output QA.",
        "At CBOT, Kaan contributed to enterprise chatbot QA, stabilization, channel configuration, large-scale flow restructuring and multi-channel automation. He designed and built the insurance claims intake POC he directly owned.",
        "His AI experience is strongest on the product-flow side: understanding the user journey, mapping intents, planning fallback paths and keeping automation maintainable.",
        "Kaan also evaluates LLM outputs through Outlier-style AI training work: reasoning quality, prompt behavior, code responses and multimodal interactions.",
        "For AI Designer roles, the strongest evidence is his mix of CBOT AI Flow work, LLM evaluation tasks and real product workflows such as Joyday.",
      ],
      links: linkSets.en.ai,
    },
    projects: {
      text: [
        "The strongest projects are AI Chatbot Flow Design, Atölye Joyday Official Website, Hospital Appointment System, Hospital Form App, Drivenfinity and Cars Dataset Analysis.",
        "Hospital System, shown on the portfolio card as Hospital Form App, is a 2024 academic C# Windows Forms and SQL Server project preserved as a source archive.",
        "Hospital Appointment System is a separate Python, Tkinter and MySQL implementation; it is not evidence for the C# Hospital System case study.",
        "For recruiters, I would open these first: Joyday Official Website for real product value, AI Chatbot Flow Design for AI direction, and Hospital System for C#/.NET desktop and database logic.",
        "Kaan's projects show range: enterprise chatbot logic, a live business website, reservation workflows, C# desktop/database workflows, Python data analysis, Unity and Unreal prototypes.",
        "Best project evidence depends on the role: AI role → Chatbot Flow Design; web/product role → Joyday; software/backend role → Hospital Form App and dashboard/data projects.",
      ],
      links: linkSets.en.projects,
    },
    experience: {
      text: [
        "Kaan's experience includes CBOT as AI Designer, Outlier AI as AI Training Specialist, Atölye Joyday as Co-Founder & Digital Product Developer, and earlier operations/software responsibilities at Punto and Ocean's Team.",
        "The career path is hybrid but useful: operations gave client/process awareness, software projects gave implementation skill, and AI work shaped his current AI Designer direction.",
        "CBOT is the most direct AI Designer experience; Joyday is the strongest real product ownership example; Outlier AI supports LLM evaluation and quality-review experience.",
        "Kaan has worked across client-facing operations, chatbot flow design, LLM evaluation, web development and reservation workflows. That mix is good for solution-oriented AI/software roles.",
        "His experience page is useful if you want the timeline: it lists AI work, freelance AI evaluation, Joyday, Punto, Ocean's Team, Gameathon and Mobidictum.",
      ],
      links: [
        { label: "Experience", url: "blog.html" },
        {
          label: "CV",
          url: resumeLink,
        },
      ],
    },
    roles: {
      text: [
        "Kaan's primary target is Forward Deployed Engineer, with capability evidence across Applied AI, AI reliability, solution engineering, automation and product engineering.",
        "Kaan is especially strong for roles that require both technical logic and communication with business/client teams.",
        "For a pure backend senior role he would need deeper production-scale proof, but for AI workflow, solution engineering, chatbot and automation roles the match is much stronger.",
        "Best-fit environments: AI product teams, chatbot/agent platforms, automation teams, solution engineering teams and small product teams where broad execution matters.",
        "If the job mixes AI flows, customer requirements, integrations, dashboards and web/product thinking, Kaan's profile fits well.",
      ],
      links: [
        { label: "Experience", url: "blog.html" },
        { label: "Contact", url: "mailto:kaanb8776@gmail.com" },
      ],
    },
    weather: {
      text: [
        "I cannot fetch live weather inside this static portfolio, but I can guide you around the site without needing an umbrella.",
        "Weather mode is not connected to a live API here. For now I can help with Kaan's AI experience, projects, CV or contact routes.",
        "No live weather feed in Ajoop yet. But if this becomes an agent feature, it could be added with a weather API and user location permission.",
        "I am portfolio-focused, not meteorology-focused. Ask me about projects, AI workflows or Kaan's role fit and I will be much more useful.",
        "Live weather is outside my current static-site scope. Site navigation, CV, projects and recruiter summary are fully in scope.",
      ],
      links: [
        { label: "Projects", url: "works.html" },
        { label: "About", url: "about.html" },
      ],
    },
    cv: {
      text: [
        "You can view Kaan's CV, reach him by email, or check LinkedIn and GitHub. For hiring, CV + LinkedIn + Joyday case study is the fastest review path.",
        "Best contact route: email for direct reach, LinkedIn for professional profile, GitHub for code/projects, and the CV button for full background.",
        "For Forward Deployed Engineer opportunities, I recommend reviewing the CV, SINAMA, AI Chatbot Flow Design and Joyday together.",
        "Kaan's CV highlights AI Designer work, LLM evaluation, 50+ academic, personal, freelance and team-based projects, C#/.NET, Python, JavaScript, PHP/MySQL, Unity and Unreal Engine.",
        "Need the shortest route? Open CV, then Works, then email Kaan. That gives both proof and contact.",
      ],
      links: linkSets.en.contact,
    },
    default: {
      text: [
        "I did not match that exactly, but I can answer about Kaan's AI experience, projects, CV, tech stack, certificates, Joyday work or contact details.",
        "I may not have that exact intent yet. Try asking with words like AI, project, CV, Joyday, experience, stack, contact or role fit.",
        "Good question. I am still rule-based, so I work best with portfolio topics: AI workflows, software projects, certificates, CV and contact.",
        "I could not map that perfectly. I can still take you to Works, About or Email if you want the fastest route.",
        "That is outside my current answer set, but I can expand. For now, ask me about Kaan's projects, AI background, work history or availability.",
      ],
      links: [
        { label: "Works", url: "works.html" },
        { label: "About", url: "about.html" },
      ],
    },
  });

  Object.assign(portfolioChatbotContent.tr.answers, {
    greeting: {
      text: portfolioChatbotContent.tr.greeting,
      links: linkSets.tr.about,
    },
    about: {
      text: [
        "Kaan Balcı; AI workflow, chatbot mantığı, otomasyon, backend, web/mobil ürünler ve oyun geliştirme alanlarına odaklanan bir AI Designer & Software Developer. 50+ akademik, kişisel, freelance ve ekip projesine katkı deneyimi ve Bilgisayar Programcılığı altyapısı var.",
        "Kaan yazılım geliştirme ile AI workflow tasarımını birleştiriyor. En güçlü tarafı chatbot sistemleri, otomasyon mantığı, backend düşüncesi ve kullanılabilir web ürünlerinin kesişimi.",
        "Kaan pratik AI ve yazılım geliştiren bir profil: akış tasarlayabiliyor, arayüz geliştirebiliyor, LLM çıktılarını değerlendirebiliyor ve iş ihtiyacını teknik çözüme çevirebiliyor.",
        "Tek cümleyle: Kaan; CBOT, Outlier AI, Joyday, backend araçları ve oyun prototiplerinden gelen deneyimle pratik AI workflow ve yazılım sistemleri geliştiriyor.",
        "Kaan'ın profili sadece kod değil; müşteri iletişimi, operasyon, ürün düşüncesi ve iş gereksinimini dijital akışa çevirme tarafı da güçlü.",
      ],
      links: linkSets.tr.about,
    },
    ai: {
      text: [
        "Kaan'ın AI tarafı chatbot akış tasarımı, AI Flow mantığı, n8n tarzı otomasyon, IVR farkındalığı, LLM yanıt değerlendirme, prompt inceleme ve kod çıktısı kalite kontrolünü kapsıyor.",
        "CBOT'ta kurumsal chatbot QA, stabilizasyon, kanal yapılandırması, büyük ölçekli akış yeniden yapılandırma ve çok kanallı otomasyona katkı sağladı. Doğrudan sahip olduğu sigorta hasar başvuru POC'sini tasarlayıp geliştirdi.",
        "AI deneyiminde en güçlü taraf ürün-akış mantığı: kullanıcı yolculuğunu anlama, intentleri haritalama, fallback yolları planlama ve otomasyonu sürdürülebilir tutma.",
        "Outlier tarzı AI training çalışmalarında LLM çıktılarının akıl yürütme kalitesi, prompt davranışı, kod cevapları ve multimodal etkileşimlerini değerlendirdi.",
        "AI Designer rolleri için en güçlü kanıtlar: CBOT AI Flow deneyimi, LLM değerlendirme işleri ve Joyday gibi gerçek ürün akışları.",
      ],
      links: linkSets.tr.ai,
    },
    projects: {
      text: [
        "En güçlü projeler: AI Chatbot Akış Tasarımı, Atölye Joyday Resmi Web Sitesi, Hospital Appointment System, Hospital Form App, Drivenfinity ve Cars Dataset Analysis.",
        "Portfolio kartında Hospital Form App adıyla gösterilen Hospital System, kaynak arşivi olarak korunan 2024 tarihli akademik C# Windows Forms ve SQL Server projesidir.",
        "Hospital Appointment System ayrı bir Python, Tkinter ve MySQL uygulamasıdır; C# Hospital System vaka çalışmasının kanıtı değildir.",
        "İK gözüyle ilk açılacak üçlü: gerçek ürün değeri için Joyday, AI yönü için Chatbot Flow Design, C#/.NET masaüstü ve veritabanı mantığı için Hospital System.",
        "Kaan'ın projeleri genişlik gösteriyor: kurumsal chatbot mantığı, canlı işletme sitesi, rezervasyon akışı, C# masaüstü/veritabanı iş akışları, Python veri analizi, Unity ve Unreal prototipleri.",
        "Rol bazlı en iyi kanıt değişir: AI rolü için Chatbot Flow Design, web/product için Joyday, yazılım/backend için Hospital Form App ve dashboard/veri projeleri.",
      ],
      links: linkSets.tr.projects,
    },
    experience: {
      text: [
        "Kaan'ın deneyiminde CBOT AI Designer, Outlier AI Training Specialist, Atölye Joyday Co-Founder & Digital Product Developer ve önceki Punto/Ocean's Team operasyon-yazılım işleri var.",
        "Kariyer yolu hibrit ama avantajlı: operasyon tarafı müşteri/süreç farkındalığı verdi, yazılım projeleri uygulama gücü kazandırdı, AI işleri güncel yönünü oluşturdu.",
        "CBOT en direkt AI Designer deneyimi; Joyday en güçlü gerçek ürün sahipliği örneği; Outlier AI ise LLM değerlendirme ve kalite inceleme tarafını destekliyor.",
        "Kaan; client-facing operasyon, chatbot akış tasarımı, LLM değerlendirme, web geliştirme ve rezervasyon workflow taraflarında çalıştı. Bu karışım solution odaklı AI/yazılım rolleri için iyi duruyor.",
        "Zaman çizelgesi için Deneyim sayfası iyi: AI işleri, freelance AI evaluation, Joyday, Punto, Ocean's Team, Gameathon ve Mobidictum yer alıyor.",
      ],
      links: [
        { label: "Deneyim", url: "blog.html" },
        {
          label: "CV",
          url: resumeLink,
        },
      ],
    },
    roles: {
      text: [
        "Kaan'ın ana hedefi Forward Deployed Engineer; Applied AI, AI reliability, solution engineering, otomasyon ve product engineering kanıtları bu yönü destekliyor.",
        "Kaan özellikle teknik mantık ile iş/müşteri iletişiminin birlikte gerektiği rollerde güçlü duruyor.",
        "Saf senior backend rolü için daha derin production-scale kanıt gerekebilir; ama AI workflow, solution engineering, chatbot ve otomasyon rolleri için eşleşme daha güçlü.",
        "En uygun ortamlar: AI ürün ekipleri, chatbot/agent platformları, otomasyon ekipleri, solution engineering takımları ve geniş sorumluluk isteyen küçük ürün ekipleri.",
        "İş AI akışı, müşteri gereksinimi, entegrasyon, dashboard ve web/product düşüncesini karıştırıyorsa Kaan'ın profili iyi oturur.",
      ],
      links: [
        { label: "Deneyim", url: "blog.html" },
        { label: "İletişim", url: "mailto:kaanb8776@gmail.com" },
      ],
    },
    weather: {
      text: [
        "Bu statik portfolyo içinde canlı hava durumu çekemiyorum ama site içinde seni şemsiyesiz gezdiririm.",
        "Hava durumu modu canlı API'ye bağlı değil. Şimdilik Kaan'ın AI deneyimi, projeleri, CV'si veya iletişim yollarında yardımcı olabilirim.",
        "Ajoop'ta canlı hava durumu yok ama ileride agent özelliği olarak hava durumu API'si ve konum izniyle eklenebilir.",
        "Meteoroloji tarafında değilim, portfolyo tarafında iyiyim. Proje, AI workflow veya Kaan'ın role uygunluğunu sorarsan daha iyi cevap veririm.",
        "Canlı hava durumu şu an statik site kapsamının dışında. Site navigasyonu, CV, projeler ve İK özeti tamamen kapsamımda.",
      ],
      links: [
        { label: "Projeler", url: "works.html" },
        { label: "Hakkımda", url: "about.html" },
      ],
    },
    cv: {
      text: [
        "Kaan'ın CV'sini görebilir, mail atabilir veya LinkedIn/GitHub üzerinden ulaşabilirsin. İşe alım için en hızlı inceleme yolu CV + LinkedIn + Joyday case study.",
        "En iyi iletişim rotası: direkt ulaşmak için e-posta, profesyonel profil için LinkedIn, kod/projeler için GitHub, tam geçmiş için CV butonu.",
        "Forward Deployed Engineer fırsatları için CV, SINAMA, AI Chatbot Flow Design ve Joyday'i birlikte incelemeni öneririm.",
        "Kaan'ın CV'sinde AI Designer deneyimi, LLM değerlendirme, 50+ akademik, kişisel, freelance ve ekip projesi, C#/.NET, Python, JavaScript, PHP/MySQL, Unity ve Unreal Engine öne çıkıyor.",
        "En kısa yol: CV'yi aç, sonra Projeler'e bak, sonra e-posta gönder. Hem kanıtı hem iletişimi hızlı alırsın.",
      ],
      links: linkSets.tr.contact,
    },
    default: {
      text: [
        "Bunu tam eşleştiremedim ama Kaan'ın AI deneyimi, projeleri, CV'si, tech stack'i, sertifikaları, Joyday çalışması veya iletişim bilgileri hakkında cevap verebilirim.",
        "Bu intent henüz net değil. AI, proje, CV, Joyday, deneyim, stack, iletişim veya role uygunluk gibi kelimelerle sorarsan daha iyi yakalarım.",
        "Güzel soru ama ben hâlâ rule-based çalışıyorum. En iyi çalıştığım konular: AI workflow, yazılım projeleri, sertifikalar, CV ve iletişim.",
        "Bunu kusursuz haritalayamadım. İstersen seni Projeler, Hakkımda veya E-posta yoluna hızlıca götürebilirim.",
        "Bu cevap setimin biraz dışında kaldı ama genişletilebilir. Şimdilik Kaan'ın projeleri, AI geçmişi, iş deneyimi veya uygunluğu hakkında sorabilirsin.",
      ],
      links: [
        { label: "Projeler", url: "works.html" },
        { label: "Hakkımda", url: "about.html" },
      ],
    },
  });

  const upsertKeywords = (id, keywords) => {
    const existing = chatbotKeywordMap.find((item) => item.id === id);
    if (existing) {
      existing.keywords = Array.from(
        new Set([...keywords, ...existing.keywords]),
      );
    } else {
      chatbotKeywordMap.unshift({ id, keywords });
    }
  };
  upsertKeywords("greeting", [
    "selam",
    "merhaba",
    "mrb",
    "naber",
    "nasılsın",
    "gunaydin",
    "günaydın",
    "iyi akşamlar",
    "hello",
    "hi",
    "hey",
  ]);
  upsertKeywords("weather", [
    "hava",
    "hava durumu",
    "weather",
    "yağmur",
    "rain",
    "sıcak",
    "soğuk",
    "istanbul hava",
    "izmir hava",
  ]);
  upsertKeywords("experience", [
    "deneyim",
    "experience",
    "iş geçmişi",
    "work history",
    "cbot",
    "outlier",
    "punto",
    "ocean",
    "staj",
    "intern",
  ]);
  upsertKeywords("roles", [
    "role",
    "roles",
    "rol",
    "pozisyon",
    "uygun",
    "fit",
    "işe uygun",
    "hangi iş",
    "hangi rol",
    "solution",
    "developer",
  ]);
  upsertKeywords("education", [
    "education",
    "eğitim",
    "okul",
    "üniversite",
    "university",
    "mezun",
  ]);
}

enhanceAjoopDialogDepth();

(function extendAjoopExtraAnswers() {
  Object.assign(portfolioChatbotContent.en.answers, {
    joyday: {
      text: [
        "Atölye Joyday is Kaan's strongest real-business proof: a live workshop-studio website with service pages, package discovery and reservation CTAs.",
        "Joyday shows product ownership. Kaan did not only build a page; he connected service presentation, package logic, forms and operational follow-up.",
        "The Joyday project is useful for recruiters because it is a real customer-facing product rather than only a school or demo project.",
        "Joyday has one main case view now: the official website case. It still shows UX, frontend and business-process thinking through the live site and reservation-oriented customer journey.",
        "For web/product roles, Joyday is one of the best examples because it combines brand, mobile UX, package structure and reservation flow.",
      ],
      links: [
        {
          label: "View Atölye Joyday Case Study",
          url: "atolye-joyday-case-study.html",
        },
        {
          label: "Open Atölye Joyday Website",
          url: "https://atolyejoyday.com/",
        },
      ],
    },
    stack: {
      text: [
        "Main stack: Python, C#/.NET, JavaScript, PHP, Java, Kotlin, C++, MySQL, MSSQL, Firebase, Unity, Unreal Engine, n8n, AI Flow and LLM evaluation workflows.",
        "Kaan's stack is broad: AI workflow design and LLM evaluation on one side; C#/.NET, Python, PHP/MySQL and JavaScript implementation on the other.",
        "For AI and automation: AI Flow, n8n-style logic, prompt review and LLM output evaluation. For software: Python, C#, JavaScript, PHP/MySQL and Firebase.",
        "For games and interactive work, Kaan uses Unity with C# and Unreal Engine with C++/Blueprints.",
        "The practical stack is strongest around AI flows, web interfaces, database-backed systems, automation and game prototypes.",
      ],
      links: [
        { label: "About", url: "about.html" },
        { label: "Works", url: "works.html" },
      ],
    },
    availability: {
      text: [
        "Kaan is currently positioning primarily as a Forward Deployed Engineer, with capability evidence across Applied AI, AI reliability, solution engineering, automation and product engineering.",
        "The strongest fit is a role mixing AI flows, user needs, automation logic and practical software development.",
        "Kaan is positioned for opportunities where business needs must be translated into chatbot, automation or software workflows.",
        "For pure senior-only roles, more production-scale proof may be needed; for AI/product/solution-oriented junior-mid roles, the profile is strong.",
        "If the team needs someone who can understand users, map logic and build working outputs, Kaan's profile fits well.",
      ],
      links: [
        { label: "Contact", url: "mailto:kaanb8776@gmail.com" },
        { label: "Experience", url: "blog.html" },
      ],
    },
    certificates: {
      text: [
        "Kaan has 25+ certifications across Udemy, Cisco and related platforms, covering software, networking, Linux, web, C#, SQL and game development topics.",
        "The Certificates page includes a gallery with preview modal support, useful for quick validation of learning areas.",
        "Certificates support the profile, but the strongest evidence is still the project portfolio plus CBOT, Outlier and Joyday experience.",
        "For technical breadth, certificates add context around C#, Java, SQL, Linux, web design, Cisco networking and Unreal/Unity learning.",
        "I would treat the certificates as supporting proof; the project case studies are the main proof.",
      ],
      links: [{ label: "Certificates", url: "single-work.html" }],
    },
    education: {
      text: [
        "Kaan graduated from Izmir University of Economics Computer Programming and continues Visual Communication Design at Anadolu University.",
        "His education combines software foundations with an ongoing visual/design direction, which helps with product and portfolio presentation.",
        "The Computer Programming background supports C#, Python, Java, database and web-development work.",
        "The design education side is useful because Kaan's work often mixes technical logic with user-facing interfaces.",
        "Education summary: Computer Programming graduate with ongoing Visual Communication Design studies.",
      ],
      links: [
        { label: "About", url: "about.html" },
        {
          label: "CV",
          url: resumeLink,
        },
      ],
    },
  });

  Object.assign(portfolioChatbotContent.tr.answers, {
    joyday: {
      text: [
        "Atölye Joyday, Kaan'ın en güçlü gerçek işletme kanıtlarından biri: canlı workshop stüdyosu sitesi, hizmet sayfaları, paket keşfi ve rezervasyon CTA'ları var.",
        "Joyday ürün sahipliği gösteriyor. Kaan sadece sayfa yapmadı; hizmet sunumu, paket mantığı, form akışı ve operasyon takibini birbirine bağladı.",
        "Joyday projesi İK açısından değerli çünkü yalnızca okul/demo projesi değil, gerçek müşteriye dokunan canlı bir ürün.",
        "Joyday için artık tek ana vaka var: resmi web sitesi. Canlı site ve rezervasyon odaklı müşteri yolculuğu üzerinden UX, frontend ve iş süreci düşüncesini gösteriyor.",
        "Web/product rolleri için Joyday en iyi örneklerden biri; marka, mobil UX, paket yapısı ve rezervasyon akışını birleştiriyor.",
      ],
      links: [
        {
          label: "Atölye Joyday Vaka Çalışmasını Gör",
          url: "atolye-joyday-case-study.html",
        },
        {
          label: "Atölye Joyday Canlı Sitesini Aç",
          url: "https://atolyejoyday.com/",
        },
      ],
    },
    stack: {
      text: [
        "Ana stack: Python, C#/.NET, JavaScript, PHP, Java, Kotlin, C++, MySQL, MSSQL, Firebase, Unity, Unreal Engine, n8n, AI Flow ve LLM değerlendirme iş akışları.",
        "Kaan'ın stack'i geniş: bir tarafta AI workflow tasarımı ve LLM değerlendirme, diğer tarafta C#/.NET, Python, PHP/MySQL ve JavaScript uygulama tarafı var.",
        "AI ve otomasyon tarafında AI Flow, n8n tarzı mantık, prompt inceleme ve LLM çıktı değerlendirme öne çıkıyor. Yazılımda Python, C#, JavaScript, PHP/MySQL ve Firebase var.",
        "Oyun ve interaktif işler için Unity tarafında C#, Unreal Engine tarafında C++/Blueprints kullanıyor.",
        "Pratik stack en çok AI akışları, web arayüzleri, veritabanı destekli sistemler, otomasyon ve oyun prototiplerinde güçleniyor.",
      ],
      links: [
        { label: "Hakkımda", url: "about.html" },
        { label: "Projeler", url: "works.html" },
      ],
    },
    availability: {
      text: [
        "Kaan öncelikli olarak Forward Deployed Engineer yönünde konumlanıyor; Applied AI, AI reliability, solution engineering, otomasyon ve product engineering kanıtları bu yönü destekliyor.",
        "En güçlü uyum; AI akışları, müşteri gereksinimleri, otomasyon mantığı ve pratik yazılım geliştirmenin birleştiği roller.",
        "Kaan iş ihtiyaçlarını chatbot, otomasyon veya yazılım workflow'una çevirmek gereken fırsatlar için konumlanıyor.",
        "Sadece senior backend isteyen roller için daha fazla production-scale kanıt gerekebilir; AI/product/solution odaklı junior-mid roller için profil güçlü.",
        "Ekip kullanıcıyı anlayan, mantığı haritalayan ve çalışan çıktı üreten birini arıyorsa Kaan'ın profili iyi oturur.",
      ],
      links: [
        { label: "İletişim", url: "mailto:kaanb8776@gmail.com" },
        { label: "Deneyim", url: "blog.html" },
      ],
    },
    certificates: {
      text: [
        "Kaan'ın Udemy, Cisco ve benzeri platformlardan 25+ sertifikası var; yazılım, networking, Linux, web, C#, SQL ve oyun geliştirme alanlarını kapsıyor.",
        "Sertifikalar sayfasında modern galeri ve büyük önizleme modalı var; öğrenme alanlarını hızlı doğrulamak için iyi.",
        "Sertifikalar profili destekliyor ama asıl güçlü kanıt proje portföyü + CBOT, Outlier ve Joyday deneyimi.",
        "Teknik genişlik için sertifikalar C#, Java, SQL, Linux, web tasarım, Cisco networking ve Unreal/Unity öğrenimini destekliyor.",
        "Sertifikaları destekleyici kanıt gibi okumak lazım; ana kanıt case study sayfaları.",
      ],
      links: [{ label: "Sertifikalar", url: "single-work.html" }],
    },
    education: {
      text: [
        "Kaan, İzmir Ekonomi Üniversitesi Bilgisayar Programcılığı mezunu ve Anadolu Üniversitesi Görsel İletişim Tasarımı'na devam ediyor.",
        "Eğitim tarafı yazılım temeli ile devam eden görsel/tasarım yönünü birleştiriyor; bu da ürün ve portfolyo sunumuna katkı sağlıyor.",
        "Bilgisayar Programcılığı altyapısı C#, Python, Java, veritabanı ve web geliştirme çalışmalarını destekliyor.",
        "Tasarım eğitimi tarafı değerli çünkü Kaan'ın işleri teknik mantık ile kullanıcıya görünen arayüzü sık sık birleştiriyor.",
        "Eğitim özeti: Bilgisayar Programcılığı mezuniyeti ve devam eden Görsel İletişim Tasarımı eğitimi.",
      ],
      links: [
        { label: "Hakkımda", url: "about.html" },
        {
          label: "CV",
          url: resumeLink,
        },
      ],
    },
  });
})();

let portfolioChatbotState = {
  initialized: false,
  language: "en",
  open: false,
};

function getPortfolioChatbotContent(language = currentSiteLanguage || "en") {
  return portfolioChatbotContent[language === "tr" ? "tr" : "en"];
}

function createChatbotLinks(links = []) {
  if (!links.length) return "";
  return `<div class="chatbot-message-links">${links.map((link) => `<a href="${escapeProjectHtml(siteUrl(link.url))}" ${link.url.startsWith("http") ? 'target="_blank" rel="noopener"' : ""}>${escapeProjectHtml(link.label)}</a>`).join("")}</div>`;
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

function getRandomChatbotLine(value) {
  if (Array.isArray(value) && value.length) {
    return value[Math.floor(Math.random() * value.length)];
  }
  return value || "";
}

function answerChatbotIntent(intentId) {
  const content = getPortfolioChatbotContent(portfolioChatbotState.language);
  const answer = content.answers[intentId] || content.answers.default;
  addChatbotMessage("bot", getRandomChatbotLine(answer.text), answer.links);
}

function renderChatbotQuickActions() {
  const content = getPortfolioChatbotContent(portfolioChatbotState.language);
  const quickContainer = document.querySelector("[data-chatbot-quicks]");
  if (!quickContainer) return;
  quickContainer.innerHTML = content.quicks
    .map(
      (quick) =>
        `<button type="button" data-chatbot-intent="${escapeProjectHtml(quick.id)}">${escapeProjectHtml(quick.label)}</button>`,
    )
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
  addChatbotMessage("bot", getRandomChatbotLine(content.greeting));
}

function updatePortfolioChatbotLanguage(
  language = currentSiteLanguage || "en",
) {
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
  if (input) {
    input.placeholder = content.inputPlaceholder;
    input.setAttribute("aria-label", content.inputPlaceholder);
  }
  if (send) send.setAttribute("aria-label", content.sendLabel);
  if (toggle) toggle.setAttribute("aria-label", content.openLabel);
  if (close) close.setAttribute("aria-label", content.closeLabel);
  renderChatbotQuickActions();
  resetChatbotMessages();
}

function setChatbotOpen(
  isOpen,
  { restoreFocus = true, trigger = null } = {},
) {
  const widget = document.querySelector("[data-portfolio-chatbot]");
  const panel = document.querySelector("[data-chatbot-panel]");
  const toggle = document.querySelector("[data-chatbot-toggle]");
  if (!widget || !panel || !toggle) return;
  const wasOpen = portfolioChatbotState.open;

  if (isOpen) {
    closeMobileNavigation();
    setCommandPaletteOpen(false, { restoreFocus: false });
    setRecruiterMode(false, { restoreFocus: false });
    rememberOverlayTrigger(panel, trigger || toggle);
  }

  portfolioChatbotState.open = isOpen;
  widget.classList.toggle("is-open", isOpen);
  panel.setAttribute("aria-hidden", String(!isOpen));
  toggle.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    setBackgroundInert(widget);
    setOverlayBodyState(true);
    const input = document.querySelector("[data-chatbot-input]");
    setTimeout(() => input?.focus(), 80);
  } else if (wasOpen) {
    setBackgroundInert();
    setOverlayBodyState(false);
    if (restoreFocus) restoreOverlayFocus(panel);
    else overlayTriggerMap.delete(panel);
  }
}

function setupPortfolioChatbot() {
  if (
    portfolioChatbotState.initialized ||
    document.querySelector("[data-portfolio-chatbot]")
  )
    return;
  portfolioChatbotState.initialized = true;
  const content = getPortfolioChatbotContent(currentSiteLanguage || "en");
  const widget = document.createElement("aside");
  widget.className = "portfolio-chatbot";
  widget.setAttribute("data-portfolio-chatbot", "");
  widget.innerHTML = `
    <div class="chatbot-panel" data-chatbot-panel aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="ajoop-dialog-title">
      <div class="chatbot-header">
        <div class="chatbot-avatar"><i class="bx bx-bot" aria-hidden="true"></i></div>
        <div>
          <h2 id="ajoop-dialog-title" data-chatbot-title>${escapeProjectHtml(content.title)}</h2>
          <p data-chatbot-subtitle>${escapeProjectHtml(content.subtitle)}</p>
        </div>
        <button class="chatbot-close" type="button" data-chatbot-close aria-label="${escapeProjectHtml(content.closeLabel)}"><i class="bx bx-x" aria-hidden="true"></i></button>
      </div>
      <div class="chatbot-messages" data-chatbot-messages aria-live="polite"></div>
      <div class="chatbot-quicks" data-chatbot-quicks></div>
      <form class="chatbot-form" data-chatbot-form>
        <input type="text" data-chatbot-input autocomplete="off" aria-label="${escapeProjectHtml(content.inputPlaceholder)}" placeholder="${escapeProjectHtml(content.inputPlaceholder)}" />
        <button type="submit" data-chatbot-send aria-label="${escapeProjectHtml(content.sendLabel)}"><i class="bx bx-send" aria-hidden="true"></i></button>
      </form>
    </div>
    <button class="chatbot-launcher" type="button" data-chatbot-toggle aria-expanded="false" aria-label="${escapeProjectHtml(content.openLabel)}">
      <span class="chatbot-launcher-icon"><i class="bx bx-message-dots" aria-hidden="true"></i></span>
      <span data-chatbot-launcher-text>${escapeProjectHtml(content.launcher)}</span>
    </button>
  `;
  document.body.appendChild(widget);

  document
    .querySelector("[data-chatbot-toggle]")
    ?.addEventListener("click", (event) =>
      setChatbotOpen(!portfolioChatbotState.open, {
        trigger: event.currentTarget,
      }),
    );
  document
    .querySelector("[data-chatbot-close]")
    ?.addEventListener("click", () => setChatbotOpen(false));
  document
    .querySelector("[data-chatbot-form]")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.querySelector("[data-chatbot-input]");
      const value = input?.value.trim() || "";
      if (!value) return;
      addChatbotMessage("user", value);
      input.value = "";
      answerChatbotIntent(detectChatbotIntent(value));
    });

  document.addEventListener("keydown", (event) => {
    const panel = document.querySelector("[data-chatbot-panel]");
    if (!portfolioChatbotState.open || !panel) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setChatbotOpen(false);
      return;
    }
    trapFocus(event, panel);
  });

  updatePortfolioChatbotLanguage(currentSiteLanguage || "en");
}

setupPortfolioChatbot();

applyLanguage(localStorage.getItem("kaanbalci-site-language") || "en");

/* Ultimate portfolio enhancements: recruiter mode, command palette, project search and Ajoop navigation actions */
