/**
 * Ajoop intent ontology (Ajoop 4.5).
 *
 * Ajoop 4.0-4.4 routed against one flat keyword map inherited from the very
 * first chatbot. It had no notion of what KIND of question was being asked, so
 * every new failure was fixed by appending another keyword, and every keyword
 * appended made the next collision more likely. "Kaan ne yapıyor?" and "Kaan şu
 * an ne üzerinde çalışıyor?" were the same intent to it; so were "what does he
 * do" and "what changed in the portfolio".
 *
 * This module replaces that map with a structured ontology:
 *
 *   FAMILY   what sort of question this is (social, meta, person, project…)
 *   INTENT   the specific question inside that family
 *   PHRASES  multilingual phrase families, weighted by specificity
 *   SIGNALS  cross-cutting cues (a time marker, a reasoning marker) that shift
 *            weight between neighbouring intents instead of needing a new
 *            phrase for every combination
 *   VETO     phrases that disqualify an intent outright
 *   EVIDENCE what evidence this intent is allowed to show
 *
 * Everything is data. Adding a language or a paraphrase is an edit to a list,
 * never an edit to the scorer, and the scorer has no per-intent special cases.
 *
 * Loads after matcher.js (whose tokenizer it reuses) and before router.js.
 */
/* ajoop-ontology:start
 * Keep this block DOM-free and pure: tokens in, ranked candidates out, so the
 * behaviour matrix in scripts/qa-ajoop-behavior.mjs can drive it headless.
 */

/** The seven families a portfolio question can belong to. */
const AJOOP_FAMILY = Object.freeze({
  SOCIAL: "social",
  META: "meta",
  PERSON: "person",
  PROJECT: "project",
  ROLE: "role",
  DISCOVERY: "discovery",
  CURRENT: "current",
});

/**
 * What an intent may put on screen as evidence.
 *
 *   none          the answer stands alone; attaching "Portfolio evidence" to a
 *                 greeting or to Ajoop's own description would be noise at
 *                 best and a false citation at worst
 *   supporting    evidence is welcome when it is genuinely relevant, and the
 *                 answer is complete without it
 *   required      the answer IS the evidence; without a canonical record there
 *                 is nothing honest to say
 *   insufficiency the portfolio does not structure this fact, and the answer
 *                 says so rather than improvising
 */
const AJOOP_EVIDENCE = Object.freeze({
  NONE: "none",
  SUPPORTING: "supporting",
  REQUIRED: "required",
  INSUFFICIENCY: "insufficiency",
});

/**
 * Cross-cutting signals.
 *
 * These are the difference between "what does Kaan do" and "what is Kaan doing
 * right now": one time marker, not a separate phrase list per verb tense per
 * language. An intent declares which signals it wants and which it refuses,
 * and the scorer applies the same rule to all of them.
 */
const AJOOP_SIGNALS = {
  /* "right now", "currently", "these days" */
  now: [
    "şu an", "şu anda", "simdi", "suan", "guncel", "bugunlerde", "aktif olarak",
    "now", "currently", "right now", "these days", "at the moment", "today",
    "aktuell", "gerade", "momentan", "zurzeit",
    "ahora", "actualmente", "en este momento",
    "actuellement", "en ce moment", "maintenant",
  ],
  /* "latest", "most recent", "last change" */
  latest: [
    "en son", "son", "sonuncu", "yeni", "yenilik", "degisti", "degisiklik", "guncelleme",
    "latest", "last", "recent", "recently", "newest", "changed", "update", "updates",
    "neueste", "letzte", "zuletzt", "anderung", "aktualisierung",
    "ultimo", "ultima", "reciente", "cambio", "novedades",
    "dernier", "derniere", "recent", "changement", "nouveautes",
  ],
  /* "why", "how come", "what was the thinking" */
  reasoning: [
    "neden", "nicin", "niye", "sebep", "mantik", "nasil calisiyor", "nasil isliyor",
    "why", "how come", "reasoning", "rationale", "how does it work", "what problem",
    "warum", "wieso", "weshalb", "wie funktioniert",
    "por que", "porque", "razon", "como funciona",
    "pourquoi", "raison", "comment ca marche", "comment fonctionne",
  ],
  /* An explicit request for a list rather than for one thing. */
  list: [
    "hangi", "neler", "listele", "goster", "tumu", "hepsi", "butun",
    "which", "what", "list", "show", "all", "every",
    "welche", "zeig", "zeige", "alle",
    "cuales", "muestra", "muestrame", "todos", "todas",
    "quels", "quelles", "montre", "tous", "toutes",
  ],
};

/**
 * The ontology.
 *
 * `phrases` are matched as consecutive token runs and weighted by length, so a
 * four-word paraphrase always outranks a two-word one without anybody hand-
 * tuning numbers.
 *
 * `decisive` is for single words that are a whole question in this domain.
 * "cv", "stack?" and "github?" are not hints towards an intent, they ARE the
 * intent, and scoring them in the weak tier is what sent them to clarification
 * in the first cut of 4.5. They score as one-word phrases.
 *
 * `tokens` is the genuinely weak tier: words that point at an intent without
 * settling it, and which only decide a turn when nothing else does.
 *
 * `answer` names the composer or the prepared-answer key that owns the copy;
 * `facet` is the aspect this intent asks about, which the evidence layer reads.
 */
const AJOOP_INTENTS = [
  /* ---------- SOCIAL ---------- */
  {
    id: "greeting",
    family: AJOOP_FAMILY.SOCIAL,
    evidence: AJOOP_EVIDENCE.NONE,
    answer: "social_greeting",
    phrases: [
      "iyi gunler", "iyi aksamlar", "gunaydin", "nasil gidiyor", "ne haber",
      "good morning", "good evening", "good afternoon", "how are you", "whats up",
      "guten morgen", "guten tag", "guten abend", "wie gehts",
      "buenos dias", "buenas tardes", "que tal", "que pasa", "como estas",
      "bonne journee", "ca va", "comment ca va",
    ],
    tokens: [
      "selam", "selamlar", "merhaba", "mrb", "sa", "slm", "naber", "hey",
      "hello", "hi", "hiya", "yo", "greetings",
      "hallo", "servus", "moin",
      "hola", "buenas",
      "bonjour", "salut", "coucou",
    ],
  },
  {
    id: "thanks",
    family: AJOOP_FAMILY.SOCIAL,
    evidence: AJOOP_EVIDENCE.NONE,
    answer: "social_thanks",
    phrases: [
      "cok tesekkur", "tesekkur ederim", "eline saglik", "sag ol",
      "thank you", "thanks a lot", "much appreciated", "cheers mate",
      "vielen dank", "danke schon",
      "muchas gracias", "te lo agradezco",
      "merci beaucoup", "je te remercie",
    ],
    tokens: [
      "tesekkurler", "tesekkur", "sagol", "eyvallah",
      "thanks", "thx", "ty",
      "danke",
      "gracias",
      "merci",
    ],
  },
  {
    id: "goodbye",
    family: AJOOP_FAMILY.SOCIAL,
    evidence: AJOOP_EVIDENCE.NONE,
    answer: "social_goodbye",
    phrases: [
      "gorusuruz", "kendine iyi bak", "iyi calismalar", "hosca kal",
      "see you", "see ya", "take care", "good bye", "have a good one",
      "bis bald", "auf wiedersehen", "schonen tag",
      "hasta luego", "nos vemos", "hasta pronto",
      "a bientot", "au revoir", "bonne continuation",
    ],
    tokens: [
      "bye", "goodbye", "cya", "ciao",
      "tschuss",
      "adios", "chau",
      "salut2",
    ],
  },

  /* ---------- AJOOP META ----------
   * These are the "global" intents: the router resolves them before entity
   * extraction, so no previous subject and no page can reach them. */
  {
    id: "identity",
    family: AJOOP_FAMILY.META,
    evidence: AJOOP_EVIDENCE.NONE,
    answer: "meta_identity",
    global: true,
    phrases: [
      "sen kimsin", "sen nesin", "kim oluyorsun", "adin ne", "senin adin ne",
      "ajoop nedir", "ajoop kim", "ajoop ne", "kendini tanit",
      "who are you", "what are you", "what is ajoop", "whats ajoop",
      "who is ajoop", "introduce yourself", "tell me about yourself",
      "wer bist du", "was bist du", "was ist ajoop", "wer ist ajoop", "stell dich vor",
      "quien eres", "que eres", "que es ajoop", "quien es ajoop", "preséntate",
      "qui es tu", "qui etes vous", "quest ce que ajoop", "cest quoi ajoop",
      "qui est ajoop", "presente toi",
    ],
    tokens: ["kimsin", "nesin"],
  },
  {
    id: "capabilities",
    family: AJOOP_FAMILY.META,
    evidence: AJOOP_EVIDENCE.NONE,
    answer: "meta_capabilities",
    global: true,
    phrases: [
      "ne yapabilirsin", "neler yapabilirsin", "ne işe yarıyorsun", "nasil yardim edebilirsin",
      "neler biliyorsun", "ne sorabilirim", "sana ne sorabilirim", "ne konuda yardimci",
      "what can you do", "what do you do", "how can you help", "what can i ask",
      "what do you know", "what are you for", "what can you help with",
      "was kannst du", "wobei kannst du helfen", "was weisst du", "wie kannst du helfen",
      "que puedes hacer", "en que puedes ayudar", "que sabes", "como puedes ayudar",
      "que peux tu faire", "comment peux tu aider", "que sais tu faire",
    ],
  },
  {
    id: "how_it_works",
    family: AJOOP_FAMILY.META,
    evidence: AJOOP_EVIDENCE.NONE,
    answer: "meta_howItWorks",
    global: true,
    phrases: [
      "nasil calisiyorsun", "nasil calisirsin", "nasil cevap veriyorsun",
      "bilgileri nereden aliyorsun", "kaynagin ne", "verilerin nereden",
      "how do you work", "how does this work", "how do you know",
      "where do you get", "how are you built", "what powers you",
      "wie funktionierst du", "wie funktioniert das", "woher weisst du",
      "como funcionas", "como funciona esto", "de donde sacas",
      "comment fonctionnes tu", "comment ca marche", "ou trouves tu",
    ],
  },
  {
    id: "is_ai",
    family: AJOOP_FAMILY.META,
    evidence: AJOOP_EVIDENCE.NONE,
    answer: "meta_isAi",
    global: true,
    phrases: [
      "yapay zeka misin", "ai misin", "bot musun", "gercek misin", "insan misin",
      "chatgpt misin", "bu yapay zeka mi", "bu ai mi", "robot musun",
      "is this ai", "are you ai", "are you an ai", "are you a bot", "are you a robot",
      "are you real", "are you human", "are you chatgpt", "is this a bot", "is this real",
      "bist du eine ki", "bist du ein bot", "ist das ki", "bist du echt",
      "eres una ia", "eres un bot", "esto es ia", "eres real",
      "es tu une ia", "es tu un bot", "cest une ia", "es tu reel",
    ],
  },

  /* ---------- PERSON ---------- */
  {
    id: "who_is_kaan",
    family: AJOOP_FAMILY.PERSON,
    evidence: AJOOP_EVIDENCE.SUPPORTING,
    answer: "person_who",
    phrases: [
      "kaan kim", "kaan kimdir", "kaan balci kim", "kimdir kaan", "kaan hakkinda",
      "who is kaan", "who is kaan balci", "about kaan", "tell me about kaan",
      "wer ist kaan", "uber kaan",
      "quien es kaan", "sobre kaan",
      "qui est kaan", "a propos de kaan",
    ],
    tokens: ["hakkinda", "hakkimda", "about"],
    tokenWeight: 1,
  },
  {
    id: "what_does_kaan_do",
    family: AJOOP_FAMILY.PERSON,
    evidence: AJOOP_EVIDENCE.SUPPORTING,
    answer: "person_role",
    phrases: [
      "kaan ne yapiyor", "ne yapiyor kaan", "kaan ne iş yapıyor", "ne iş yapıyor",
      "kaanın işi ne", "işi ne", "meslegi ne", "kaanin meslegi", "ne iş yapar",
      "unvani ne", "pozisyonu ne", "hangi alanda calisiyor",
      "what does kaan do", "what does he do", "what kind of work does kaan do",
      "what is his job", "what is kaans job", "what is his profession",
      "what does kaan work as", "what is his title", "what field",
      "was macht kaan", "was macht kaan beruflich", "was ist sein beruf",
      "was arbeitet kaan", "welchen beruf",
      "que hace kaan", "a que se dedica", "cual es su trabajo", "cual es su profesion",
      "que fait kaan", "quel est son metier", "quel est son travail",
      "il fait quoi",
    ],
    /* A time marker turns this into current_work, which is a different
     * question with a different answer and different evidence. */
    refuseSignals: ["now", "latest"],
  },
  {
    id: "current_direction",
    family: AJOOP_FAMILY.PERSON,
    evidence: AJOOP_EVIDENCE.SUPPORTING,
    answer: "person_direction",
    phrases: [
      "hangi role bakiyor", "ne ariyor", "hedefi ne", "yonelimi ne", "nereye gidiyor",
      "kariyer hedefi", "ne olmak istiyor", "is ariyor mu", "musait mi",
      "what role is he looking for", "what is he aiming for", "career direction",
      "is he available", "is he open to work", "what is he targeting",
      "welche rolle sucht er", "ist er verfugbar", "welches ziel",
      "que rol busca", "esta disponible", "cual es su objetivo",
      "quel poste cherche", "est il disponible", "quel objectif",
    ],
  },
  {
    id: "experience",
    family: AJOOP_FAMILY.PERSON,
    evidence: AJOOP_EVIDENCE.SUPPORTING,
    answer: "experience",
    phrases: [
      "iş geçmişi", "calisma gecmisi", "nerede calisti", "hangi sirketlerde",
      "kac yil deneyim", "deneyimi ne", "profesyonel gecmis",
      "work history", "work experience", "where has he worked", "which companies",
      "professional background", "how many years",
      "berufserfahrung", "wo hat er gearbeitet", "welche unternehmen",
      "experiencia laboral", "donde ha trabajado", "que empresas",
      "experience professionnelle", "ou a t il travaille", "quelles entreprises",
    ],
    decisive: ["deneyim", "experience", "erfahrung", "experiencia"],
    tokens: ["cbot", "outlier", "punto", "staj", "intern"],
  },
  {
    id: "education",
    family: AJOOP_FAMILY.PERSON,
    evidence: AJOOP_EVIDENCE.NONE,
    answer: "education",
    phrases: [
      "nerede okudu", "hangi universite", "egitimi ne", "mezun mu", "okul gecmisi",
      "where did he study", "which university", "his education", "did he graduate",
      "wo hat er studiert", "welche universitat", "seine ausbildung",
      "donde estudio", "que universidad", "su educacion",
      "ou a t il etudie", "quelle universite", "sa formation",
    ],
    decisive: [
      "eğitim", "education", "ausbildung", "studium", "educacion", "formation",
      "üniversite", "university", "universitat", "universidad",
    ],
    tokens: ["okul", "mezun", "lisans", "school", "degree", "graduated", "estudios", "etudes"],
  },
  {
    id: "skills",
    family: AJOOP_FAMILY.PERSON,
    evidence: AJOOP_EVIDENCE.SUPPORTING,
    answer: "skills",
    phrases: [
      "hangi teknolojileri biliyor", "neler biliyor kaan", "yetkinlikleri ne",
      "hangi dilleri biliyor", "becerileri ne", "guclu yanlari",
      "what technologies does he know", "what are his skills", "what can he build",
      "which languages does he know", "his strengths",
      "welche technologien kann er", "was sind seine fahigkeiten",
      "que tecnologias conoce", "cuales son sus habilidades",
      "quelles technologies connait il", "quelles sont ses competences",
    ],
    decisive: [
      "yetkinlik", "yetkinlikler", "skills", "fahigkeiten", "habilidades", "competences",
      "biliyor", "bilir",
    ],
    tokens: ["beceri"],
  },
  {
    id: "contact",
    family: AJOOP_FAMILY.PERSON,
    evidence: AJOOP_EVIDENCE.NONE,
    answer: "contact",
    facet: "links",
    phrases: [
      "nasil ulasabilirim", "iletisim bilgileri", "mail adresi", "e posta adresi",
      "how can i reach him", "how do i contact", "contact details", "email address",
      "wie kann ich ihn erreichen", "kontaktdaten",
      "como puedo contactar", "datos de contacto",
      "comment le contacter", "coordonnees",
    ],
    decisive: ["iletişim", "contact", "kontakt", "contacto", "linkedin", "eposta"],
    tokens: ["ulas", "mail", "email", "reach"],
  },
  {
    id: "cv",
    family: AJOOP_FAMILY.PERSON,
    evidence: AJOOP_EVIDENCE.NONE,
    answer: "cv",
    facet: "links",
    phrases: [
      "cv sini gorebilir miyim", "ozgecmis", "cv linki", "resume link",
      "can i see his cv", "his resume", "download cv", "send me his cv",
      "seinen lebenslauf", "lebenslauf sehen",
      "su curriculum", "ver su cv",
      "son cv", "voir son cv",
    ],
    decisive: ["cv", "resume", "özgeçmiş", "lebenslauf", "curriculum"],
  },

  /* ---------- PROJECT ---------- */
  {
    id: "project_overview",
    family: AJOOP_FAMILY.PROJECT,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "project_overview",
    facet: "overview",
    needsEntity: true,
    phrases: [
      "ne ise yariyor", "ne yapiyor bu proje", "bu proje nedir", "anlatir misin",
      "what is it", "what does it do", "tell me about it", "give me an overview",
      "was ist das", "was macht es",
      "que es esto", "que hace",
      "cest quoi", "que fait il",
    ],
    tokens: ["genel", "overview", "ubersicht", "resumen", "apercu"],
  },
  {
    id: "project_reasoning",
    family: AJOOP_FAMILY.PROJECT,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "project_reasoning",
    facet: "reasoning",
    needsEntity: true,
    wantSignals: ["reasoning"],
    phrases: [
      "neden yapildi", "neden boyle", "hangi problemi cozuyor", "nasil calisiyor bu",
      "arkasindaki mantik", "neden bu yaklasim",
      "why was it built", "what problem does it solve", "how does it work",
      "what was the thinking", "why this approach",
      "warum wurde es gebaut", "welches problem lost es", "wie funktioniert es",
      "por que se construyo", "que problema resuelve", "como funciona",
      "pourquoi a t il ete construit", "quel probleme resout il", "comment fonctionne t il",
    ],
    /* A bare "neden?" is a complete follow-up when a subject is in play, and
     * `needsEntity` is what stops it being answered when one is not. Without
     * these the reasoning SIGNAL had nothing to attach itself to, because a
     * signal only ever adds weight to an intent that already matched. */
    decisive: ["neden", "niçin", "niye", "why", "warum", "wieso", "pourquoi"],
  },
  {
    id: "tech_stack",
    family: AJOOP_FAMILY.PROJECT,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "tech_stack",
    facet: "stack",
    needsEntity: true,
    phrases: [
      "hangi teknolojiler", "hangi teknolojiyle", "ne ile yapildi", "hangi dil",
      "teknoloji yigini", "hangi framework",
      "tech stack", "what technologies", "what is it built with", "which framework",
      "what language", "built with",
      "welcher stack", "welche technologien", "womit gebaut",
      "que tecnologias", "con que esta hecho",
      "quelle stack", "quelles technologies", "construit avec",
    ],
    decisive: ["stack", "teknoloji", "teknolojiler", "technologien", "tecnologias"],
    tokens: ["tech", "technologies", "framework"],
  },
  {
    id: "evidence",
    family: AJOOP_FAMILY.PROJECT,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "evidence",
    facet: "proof",
    needsEntity: true,
    phrases: [
      "kanitla bunu", "kaniti ne", "nasil emin olabilirim", "sonuclari ne",
      "prove it", "show me proof", "what is the evidence", "what were the results",
      "beweise es", "was ist der beleg",
      "demuestralo", "cual es la evidencia",
      "prouve le", "quelle est la preuve",
    ],
    /* Decisive on their own: promoted from the weak token tier. */
    decisive: [
      "kanıt", "kanıtla", "ispat", "proof", "prove", "evidence", "beleg",
      "beweis", "evidencia", "preuve",
    ],
    tokens: ["sonuc", "metrics", "results"],
  },
  {
    id: "status",
    family: AJOOP_FAMILY.PROJECT,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "status",
    facet: "status",
    needsEntity: true,
    phrases: [
      "hangi asamada", "bitti mi", "canli mi", "yayinda mi", "durumu ne",
      "what stage is it", "is it live", "is it finished", "what is the status",
      "in welchem stadium", "ist es live", "wie ist der status",
      "en que etapa", "esta en vivo", "cual es el estado",
      "a quelle etape", "est ce en ligne", "quel est le statut",
    ],
    decisive: ["durum", "status", "estado", "statut"],
    tokens: ["asama"],
  },
  {
    id: "links",
    family: AJOOP_FAMILY.PROJECT,
    /* Navigation, not a claim: a link needs no citation under it. */
    evidence: AJOOP_EVIDENCE.NONE,
    answer: "links",
    facet: "links",
    needsEntity: true,
    phrases: [
      "linki var mi", "nereden bakabilirim", "kaynak kodu", "canli link",
      "where can i see it", "is there a link", "source code", "live link",
      "gibt es einen link", "wo kann ich es sehen", "quellcode",
      "hay un enlace", "donde puedo verlo", "codigo fuente",
      "y a t il un lien", "ou puis je le voir", "code source",
    ],
    decisive: ["github", "repo", "repository", "kaynak kodu"],
    tokens: ["link", "links", "demo", "live", "canlı", "website", "kaynak", "source", "adres", "url"],
  },
  {
    id: "compare_projects",
    family: AJOOP_FAMILY.PROJECT,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "compare",
    facet: "overview",
    phrases: [
      "ile karsilastir", "karsilastirir misin", "farki ne", "hangisi daha",
      "compare with", "compare them", "what is the difference", "which one is",
      "vergleiche mit", "was ist der unterschied",
      "compara con", "cual es la diferencia",
      "compare avec", "quelle est la difference",
    ],
    decisive: ["karşılaştır", "kıyasla", "compare", "versus", "vergleich", "comparar"],
    tokens: ["vs"],
  },
  {
    id: "unsupported_claim",
    family: AJOOP_FAMILY.PROJECT,
    evidence: AJOOP_EVIDENCE.INSUFFICIENCY,
    answer: "unsupported_claim",
    phrases: [
      "donusum orani", "kullanici sayisi", "indirme sayisi", "musteri sayisi",
      "conversion rate", "number of users", "user count", "download count",
      "customer count", "annual revenue", "funding amount",
      "konversionsrate", "anzahl der nutzer", "jahresumsatz",
      "tasa de conversion", "numero de usuarios", "ingresos anuales",
      "taux de conversion", "nombre d utilisateurs", "chiffre d affaires",
    ],
    decisive: [
      "ciro", "gelir", "maas", "maaş", "yatirim", "yatırım", "degerleme", "değerleme",
      "revenue", "salary", "funding", "valuation", "downloads",
      "umsatz", "gehalt", "finanzierung", "bewertung",
      "ingresos", "salario", "financiacion", "valoracion", "descargas",
      "revenus", "salaire", "financement", "valorisation", "telechargements",
    ],
  },

  /* ---------- ROLE FIT ---------- */
  {
    id: "fit_for_role",
    family: AJOOP_FAMILY.ROLE,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "role_fit",
    facet: "overview",
    phrases: [
      "hangi role uygun", "bu role uygun mu", "role uygunlugu", "işimize uygun mu",
      "hangi pozisyon", "bizim icin uygun mu", "ekibe uyar mi",
      "what role fits", "is he a fit", "role fit", "would he fit",
      "is he right for", "good fit for",
      "welche rolle passt", "passt er zu", "ist er geeignet",
      "que rol le queda", "encaja en", "es adecuado para",
      "quel poste lui convient", "convient il pour", "est il adapte",
    ],
    tokens: ["rol", "role", "pozisyon", "position", "fit", "uygun", "eignung", "encaje"],
  },
  {
    id: "applied_ai_fit",
    family: AJOOP_FAMILY.ROLE,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "role_fit",
    roleId: "applied-ai",
    facet: "overview",
    phrases: [
      "applied ai", "ai engineer", "ai muhendisi", "yapay zeka muhendisi",
      "machine learning engineer", "llm engineer", "ai reliability",
      "ki ingenieur", "ingeniero de ia", "ingenieur ia",
    ],
  },
  {
    id: "solution_engineering_fit",
    family: AJOOP_FAMILY.ROLE,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "role_fit",
    roleId: "solution-engineering",
    facet: "overview",
    phrases: [
      "solution engineer", "solution engineering", "forward deployed",
      "forward deployed engineer", "cozum muhendisi", "solutions architect",
      "ingenieur de solutions", "ingeniero de soluciones",
    ],
  },
  {
    id: "software_fit",
    family: AJOOP_FAMILY.ROLE,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "role_fit",
    roleId: "software",
    facet: "overview",
    phrases: [
      "software engineer", "software developer", "backend engineer",
      "yazilim muhendisi", "yazilim gelistirici", "full stack",
      "softwareentwickler", "desarrollador de software", "developpeur logiciel",
    ],
  },

  /* ---------- PORTFOLIO DISCOVERY ---------- */
  {
    id: "best_projects",
    family: AJOOP_FAMILY.DISCOVERY,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "best_projects",
    phrases: [
      "en iyi projeler", "en guclu projeler", "hangi projeleri gormeliyim",
      "one cikan isler", "en onemli projeler", "projelerini goster",
      "best projects", "strongest work", "what should i look at",
      "top projects", "show me his projects", "flagship projects",
      "beste projekte", "starkste arbeiten", "zeig mir seine projekte",
      "mejores proyectos", "trabajos mas solidos", "muestrame sus proyectos",
      "meilleurs projets", "montre moi ses projets",
    ],
    decisive: ["projeler", "projelerini", "projects", "projekte", "proyectos", "projets"],
    tokens: ["portfolio", "portfolyo"],
    tokenWeight: 2,
  },
  {
    id: "projects_by_technology",
    family: AJOOP_FAMILY.DISCOVERY,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "filter_technology",
    wantSignals: ["list"],
    phrases: [
      "hangi projelerde kullandi", "kullandigi projeler", "ile yaptigi projeler",
      "which projects use", "projects using", "projects built with", "where did he use",
      "welche projekte nutzen", "projekte mit",
      "que proyectos usan", "proyectos con",
      "quels projets utilisent", "projets avec",
    ],
  },
  {
    id: "projects_by_domain",
    family: AJOOP_FAMILY.DISCOVERY,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "filter_domain",
    wantSignals: ["list"],
    phrases: [
      "hangi alanlarda", "oyun projeleri", "ai projeleri", "web projeleri",
      "hangi sektorlerde",
      "game projects", "ai projects", "web projects", "which domains",
      "spieleprojekte", "ki projekte",
      "proyectos de juegos", "proyectos de ia",
      "projets de jeux", "projets ia",
    ],
  },

  /* ---------- CURRENT ---------- */
  {
    id: "current_work",
    family: AJOOP_FAMILY.CURRENT,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "current_work",
    wantSignals: ["now"],
    phrases: [
      "şu an ne üzerinde çalışıyor", "şu anda ne yapıyor", "simdi ne yapiyor",
      "neler uzerinde calisiyor", "şu an ne yapıyor", "aktif olarak ne yapiyor",
      "uzerinde calistigi", "guncel olarak ne",
      "what is kaan working on", "what is he working on", "currently working on",
      "what is he building", "what is he up to", "current work",
      "woran arbeitet er", "woran arbeitet kaan gerade", "was baut er gerade",
      "en que esta trabajando", "que esta construyendo",
      "sur quoi travaille t il", "que construit il",
    ],
  },
  {
    id: "latest_build",
    family: AJOOP_FAMILY.CURRENT,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "latest_build",
    wantSignals: ["latest"],
    phrases: [
      "en son ne degisti", "son degisiklik", "son build", "en son ne eklendi",
      "portfolyoda en son", "son guncelleme", "neler degisti",
      "latest build", "what changed", "what changed recently", "last update",
      "recent changes", "what is new", "whats new",
      "neueste anderung", "was hat sich geandert", "letztes update",
      "ultimo cambio", "que ha cambiado", "ultima actualizacion",
      "dernier changement", "quoi de neuf", "derniere mise a jour",
    ],
  },
  {
    id: "recent_updates",
    family: AJOOP_FAMILY.CURRENT,
    evidence: AJOOP_EVIDENCE.REQUIRED,
    answer: "recent_updates",
    wantSignals: ["latest"],
    phrases: [
      "son gunlerde neler", "gelisim gunlugu", "build log", "degisiklik gecmisi",
      "development log", "changelog", "release notes", "progress log",
      "entwicklungsprotokoll", "registro de cambios", "journal de developpement",
    ],
  },
];

/** Fast lookup by id. */
const AJOOP_INTENT_BY_ID = AJOOP_INTENTS.reduce((map, intent) => {
  map[intent.id] = intent;
  return map;
}, {});

function getAjoopIntent(id) {
  return AJOOP_INTENT_BY_ID[id] || null;
}

/** Every intent the router resolves before entity extraction. */
function isAjoopGlobalIntent(id) {
  const intent = getAjoopIntent(id);
  return Boolean(intent && intent.global);
}

function ajoopIntentFamily(id) {
  const intent = getAjoopIntent(id);
  return intent ? intent.family : null;
}

/** The evidence policy for an intent, defaulting to the safest option. */
function ajoopEvidencePolicy(id) {
  const intent = getAjoopIntent(id);
  return intent ? intent.evidence : AJOOP_EVIDENCE.NONE;
}

/* ---------- scoring ---------- */

/**
 * Phrase weight, from length alone.
 *
 * Specificity is the only thing a rule-based matcher can trust, and phrase
 * length is the cleanest proxy for it: "kaan ne iş yapıyor" beats "ne yapiyor"
 * beats "yapiyor" without anybody assigning numbers by hand. Hand-tuned
 * per-phrase weights are how the old keyword map became unmaintainable.
 */
function ajoopPhraseWeight(phrase) {
  const count = getKeywordTokens(phrase).length;
  if (!count) return 0;
  return 6 + 4 * count;
}

/** Which cross-cutting signals this message carries. */
function detectAjoopSignals(tokens) {
  const found = new Set();
  if (!tokens || !tokens.length) return found;
  Object.keys(AJOOP_SIGNALS).forEach((name) => {
    if (AJOOP_SIGNALS[name].some((cue) => matchesKeyword(tokens, cue))) found.add(name);
  });
  return found;
}

/** How much a wanted signal is worth, and how much a refused one costs. */
const AJOOP_SIGNAL_BONUS = 9;
const AJOOP_SIGNAL_PENALTY = 12;

/**
 * Scores every intent against one message.
 *
 * Returns candidates sorted by score, then by the specificity of the longest
 * phrase they matched, then by declaration order — fully deterministic, so the
 * same message always produces the same ranking.
 */
function scoreAjoopOntology(tokens, options) {
  const settings = options || {};
  if (!tokens || !tokens.length) return [];
  const signals = settings.signals || detectAjoopSignals(tokens);
  const candidates = [];

  AJOOP_INTENTS.forEach((intent, order) => {
    if (Array.isArray(intent.veto) && intent.veto.some((phrase) => matchesKeyword(tokens, phrase))) {
      return;
    }

    let score = 0;
    let specificity = 0;
    const matched = [];

    [...(intent.phrases || []), ...(intent.decisive || [])].forEach((phrase) => {
      if (!matchesKeyword(tokens, phrase)) return;
      matched.push(phrase);
      score += ajoopPhraseWeight(phrase);
      specificity = Math.max(specificity, getKeywordTokens(phrase).length);
    });
    const tokenWeight = typeof intent.tokenWeight === "number" ? intent.tokenWeight : 3;
    (intent.tokens || []).forEach((token) => {
      if (!matchesKeyword(tokens, token)) return;
      matched.push(token);
      score += tokenWeight;
      specificity = Math.max(specificity, 1);
    });

    if (!matched.length) return;

    /* Signals move weight between neighbouring intents. "ne yapiyor" matches
     * both what_does_kaan_do and current_work; the time marker is what decides
     * which of them the visitor actually asked. */
    (intent.wantSignals || []).forEach((name) => {
      if (signals.has(name)) score += AJOOP_SIGNAL_BONUS;
    });
    (intent.refuseSignals || []).forEach((name) => {
      if (signals.has(name)) score -= AJOOP_SIGNAL_PENALTY;
    });

    if (score <= 0) return;
    candidates.push({
      id: intent.id,
      family: intent.family,
      evidence: intent.evidence,
      facet: intent.facet || null,
      roleId: intent.roleId || null,
      needsEntity: intent.needsEntity === true,
      global: intent.global === true,
      score,
      specificity,
      matched,
      order,
    });
  });

  return candidates.sort(
    (a, b) => b.score - a.score || b.specificity - a.specificity || a.order - b.order,
  );
}

/* ---------- confidence ---------- */

/**
 * Confidence bands.
 *
 * The gap to the runner-up matters as much as the absolute score: two intents
 * tied at 14 is a coin flip however high 14 is, and answering a coin flip
 * confidently is exactly the failure mode this gate exists to stop.
 */
const AJOOP_CONFIDENCE = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  NONE: "none",
});

function ajoopRouteConfidence(candidates, context) {
  if (!candidates || !candidates.length) return AJOOP_CONFIDENCE.NONE;
  const settings = context || {};
  const top = candidates[0].score;
  const runnerUp = candidates[1] ? candidates[1].score : 0;
  const gap = top - runnerUp;
  /* A named entity is corroboration: "SINAMA stack" is not ambiguous even
   * though "stack" alone would be. */
  const entityBonus = settings.hasEntity ? 4 : 0;
  const effective = top + entityBonus;

  /* A tie is ambiguity, not medium confidence. Declaration order makes the
   * ranking deterministic, but it is not evidence that the first declaration
   * is what the visitor meant. The response planner turns LOW into a focused
   * clarification instead of answering a coin flip. */
  if (candidates[1] && gap === 0) return AJOOP_CONFIDENCE.LOW;
  if (effective >= 14 && gap >= 3) return AJOOP_CONFIDENCE.HIGH;
  if (effective >= 10 && gap >= 1) return AJOOP_CONFIDENCE.HIGH;
  if (effective >= 6) return AJOOP_CONFIDENCE.MEDIUM;
  if (effective >= 3) return AJOOP_CONFIDENCE.LOW;
  return AJOOP_CONFIDENCE.NONE;
}
/* ajoop-ontology:end */
