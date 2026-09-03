/**
 * Conversation language and global meta intents for Ajoop (Ajoop 4.4).
 *
 * Two jobs, both about the RAW MESSAGE rather than about the portfolio:
 *
 *   1. Which language the visitor is writing in, so Ajoop answers in that
 *      language without touching the site locale. A German recruiter reading
 *      the English site gets a German answer and an English page around it.
 *   2. Which questions are about AJOOP ITSELF ("sen kimsin", "what can you
 *      do", "is this AI"). Those must never inherit the project the visitor
 *      was just discussing, so they are recognized before routing and answered
 *      from the copy below instead of from portfolio data.
 *
 * Both are deterministic: word lists and character hints, no model, no network
 * (the one fetch here loads an already-generated translation pack). The same
 * message always resolves to the same language and the same meta intent.
 *
 * Loads after matcher.js, whose tokenizer it reuses, and before router.js,
 * which consults it first.
 */
/* ajoop-language:start
 * Keep this block DOM-free and pure. Everything below takes a string and
 * returns a verdict, so QA can drive it without a browser.
 *
 * WHY WORD LISTS AND NOT A LIBRARY. A statistical detector needs a corpus and
 * a dependency, and it is least reliable exactly where Ajoop needs it most:
 * three-word questions. Function words are the strongest short-message signal
 * available offline, and being wrong is cheap here — an undecided message
 * simply keeps the language the conversation is already in.
 */

/** The languages Ajoop will hold a conversation in. */
const AJOOP_LANGUAGES = ["en", "tr", "de", "es", "fr"];

/**
 * Function words, scored in two tiers.
 *
 * `strong` words are ones that rarely appear in the other four languages;
 * `common` words are shared or weak and only ever break ties. Every entry is
 * stored accent-folded, because visitors type "quien" as often as "quién".
 */
const AJOOP_LANGUAGE_MARKERS = {
  en: {
    strong: [
      "what", "who", "how", "why", "which", "this", "that", "your", "you",
      "does", "did", "tell", "show", "about", "there", "have", "were", "would",
      "could", "should", "please", "projects", "experience", "skills", "work",
      "hello", "hi", "hey", "annual", "revenue", "salary", "valuation",
      "funding", "downloads", "users", "details",
    ],
    common: ["is", "are", "the", "and", "with", "can", "do", "of", "for", "me", "in", "on", "to"],
  },
  tr: {
    strong: [
      "kimsin", "nedir", "nasil", "neler", "hangi", "hakkinda", "yapabilir",
      "calisiyor", "anlat", "goster", "projeler", "projelerini", "teknolojiler",
      "deneyim", "neden", "niye", "degil", "senin", "benim", "bunu", "sence",
      "kanit", "kanitla", "ozetle", "biraz", "yani", "daha", "sen",
      "misin", "musun",
      "merhaba", "selam", "gunaydin",
      "yapiyor", "yapar",
    ],
    common: ["ne", "mi", "mu", "bir", "ile", "bana", "icin", "var", "yok", "cok"],
  },
  de: {
    strong: [
      "was", "wer", "wie", "warum", "welche", "welches", "kannst",
      "bist", "dein", "deine", "sind", "nicht", "uber", "zeig", "zeige",
      "erzahl", "projekte", "erfahrung", "funktionierst",
      "machst", "ich", "mir", "bitte", "danke", "und", "berufserfahrung",
      "hallo", "guten", "wetter", "ausbildung", "studium",
      "woran", "arbeitet", "arbeitest", "gebaut", "gemacht", "seine", "seinen",
      "lebenslauf",
    ],
    common: ["ist", "du", "der", "die", "das", "mit", "ein", "eine", "im", "er"],
  },
  es: {
    strong: [
      "quien", "eres", "como", "cuales", "cual", "puedes", "muestrame",
      "proyectos", "experiencia", "habilidades", "trabajo", "hola", "gracias",
      "haces", "hace", "sobre", "porque", "donde", "cuanto", "esto", "tus",
      "funcionas", "sabes", "curriculum",
      "tiempo", "clima", "educacion", "estudios",
    ],
    common: ["que", "es", "el", "la", "los", "las", "con", "un", "una", "de", "en", "tu", "me"],
  },
  fr: {
    strong: [
      "qui", "comment", "pourquoi", "quel", "quelle", "quelles", "peux",
      "montre", "projets", "competences", "bonjour", "merci",
      "fais", "fait", "faites", "etes", "votre", "vos", "cest", "quoi", "fonctionnes",
      "sais", "parle", "dis", "voir", "professionnelle",
      "experience", "formation", "meteo",
    ],
    common: ["que", "est", "le", "la", "les", "et", "avec", "un", "une", "de", "sur", "tu", "je", "moi"],
  },
};

/**
 * Character evidence, read from the normalized (still accented) message.
 *
 * Only characters that genuinely narrow the field are listed: "ö" and "ü" are
 * shared by German and Turkish and carry no signal, while "ş"/"ğ", "ß" and
 * "ñ" each belong to one language among these five.
 */
const AJOOP_LANGUAGE_SCRIPT_HINTS = {
  en: [],
  tr: [{ pattern: /[şğ]/, weight: 3 }],
  de: [
    { pattern: /ß/, weight: 3 },
    { pattern: /ä/, weight: 2 },
  ],
  es: [{ pattern: /[ñ¿¡]/, weight: 3 }],
  fr: [{ pattern: /[àèùâêîôœ]/, weight: 2 }],
};

/**
 * Turkish verb endings. Agglutination means a single word can carry the whole
 * question ("çalışıyorsun"), which no word list can enumerate, so these few
 * unambiguous suffixes are matched directly.
 */
const AJOOP_TURKISH_SUFFIXES = /(misin|musun|miyim|abilirsin|ebilirsin|iyorsun|iyorum|abilir|ebilir|lardir|lerdir)$/;

/** Below this the message is treated as undecided and the language is kept. */
const AJOOP_LANGUAGE_MIN_SCORE = 3;

/**
 * Words that settle the language on their own.
 *
 * Ajoop 4.5. Function-word scoring is built for sentences and says nothing
 * about "selam" or "hola" — a one-word greeting carries no articles, no verbs
 * and no question words, so 4.4 scored every language at zero and left the
 * conversation in whatever language it was already in. That is the wrong
 * default for the FIRST message of a conversation, which is very often exactly
 * a one-word greeting.
 *
 * Each entry below belongs to one language and to no other among these five,
 * so seeing it is enough. Everything ambiguous stays out: "ciao" (Italian),
 * "ok", "hmm" and any word that is a name.
 */
const AJOOP_DECISIVE_WORDS = {
  en: [
    "hello", "hey", "hiya", "thanks", "thank", "please", "goodbye", "cheers",
    "morning", "welcome", "sure", "okay",
  ],
  tr: [
    "selam", "selamlar", "merhaba", "mrb", "slm", "naber", "gunaydin", "kolay",
    "tesekkurler", "tesekkur", "sagol", "sagolun", "eyvallah", "eyw",
    "gorusuruz", "tamam", "peki", "evet", "hayir", "lutfen",
  ],
  de: [
    "hallo", "servus", "moin", "danke", "bitte", "tschuss", "guten",
    "wiedersehen", "gerne", "genau",
  ],
  es: [
    "hola", "buenas", "gracias", "adios", "vale", "claro", "por favor",
    "hasta luego", "chau",
  ],
  fr: [
    "bonjour", "salut", "coucou", "merci", "revoir", "bien sur", "voila",
    "bonsoir", "svp",
  ],
};

/**
 * A decisive word only decides while the message is SHORT.
 *
 * "sa" is a Turkish greeting and also the French word for "his"; "peki" is
 * Turkish and "genau" is German, and either could appear inside a longer
 * sentence in another language. Restricting the shortcut to short messages is
 * what makes it safe: a greeting is short by nature, and a long sentence has
 * enough function words for the scorer to decide properly.
 */
const AJOOP_DECISIVE_MAX_TOKENS = 3;

/** Turkish greetings written as initialisms. Whole-message match only. */
const AJOOP_TURKISH_SHORTHAND = new Set(["sa", "as", "slm", "mrb", "gunaydin"]);

/**
 * The language a short message states outright, or null.
 *
 * Returns null the moment two languages both claim a word, because a tie here
 * would flip a conversation on the weakest possible evidence.
 */
function detectDecisiveAjoopLanguage(tokens) {
  if (!tokens.length || tokens.length > AJOOP_DECISIVE_MAX_TOKENS) return null;

  /* A one-word Turkish greeting initialism. Only as the whole message: "sa"
   * inside a French sentence is the possessive, not a greeting. */
  if (tokens.length === 1 && AJOOP_TURKISH_SHORTHAND.has(tokens[0].folded)) return "tr";

  const claimed = AJOOP_LANGUAGES.filter((id) =>
    AJOOP_DECISIVE_WORDS[id].some((word) => matchesKeyword(tokens, word)),
  );
  return claimed.length === 1 ? claimed[0] : null;
}

/** Scores every supported language against one message. */
function scoreAjoopLanguages(message) {
  const normalized = normalizeIntentText(message);
  const tokens = tokenizeIntentText(message);
  const folded = new Set(tokens.map((token) => token.folded));
  const scores = {};

  AJOOP_LANGUAGES.forEach((id) => {
    const markers = AJOOP_LANGUAGE_MARKERS[id];
    let score = 0;
    markers.strong.forEach((word) => {
      if (folded.has(word)) score += 3;
    });
    markers.common.forEach((word) => {
      if (folded.has(word)) score += 1;
    });
    AJOOP_LANGUAGE_SCRIPT_HINTS[id].forEach((hint) => {
      if (hint.pattern.test(normalized)) score += hint.weight;
    });
    scores[id] = score;
  });

  if (
    tokens.some(
      (token) => token.folded.length >= 6 && AJOOP_TURKISH_SUFFIXES.test(token.folded),
    )
  ) {
    scores.tr += 3;
  }
  return scores;
}

/**
 * The language of one message, or null when it does not say.
 *
 * "github?" and "SINAMA" are language-neutral, and guessing on them would flip
 * a Turkish conversation into English mid-thread. Null means "carry on in the
 * language we were already using", which is the behaviour a visitor expects.
 */
function detectAjoopMessageLanguage(message) {
  const text = String(message || "").trim();
  if (!text) return null;
  const tokens = tokenizeIntentText(text);
  if (!tokens.length) return null;

  /* A short message that names its language outright settles it. This is the
   * greeting path, and it runs first because greetings score nothing. */
  const decisive = detectDecisiveAjoopLanguage(tokens);
  if (decisive) return decisive;

  const scores = scoreAjoopLanguages(text);
  const ranked = AJOOP_LANGUAGES.slice().sort(
    (a, b) =>
      scores[b] - scores[a] || AJOOP_LANGUAGES.indexOf(a) - AJOOP_LANGUAGES.indexOf(b),
  );
  const [best, second] = ranked;
  if (scores[best] < AJOOP_LANGUAGE_MIN_SCORE) return null;
  if (scores[best] === scores[second]) return null;
  return best;
}

/**
 * True when a message carries no language information at all.
 *
 * "SINAMA?", "github?", "stack?" are the shape of a follow-up: a bare noun and
 * a question mark. They must never move the conversation language, and saying
 * so explicitly is clearer than inferring it from a null detection result.
 */
function isAjoopLanguageNeutral(message) {
  return detectAjoopMessageLanguage(message) === null;
}

/**
 * The language this turn should be answered in.
 *
 * Sticky by design: the conversation language changes only when a message
 * clearly states a different one. `fallback` is the language to start from,
 * which the assistant passes as the site locale.
 */
function resolveAjoopReplyLanguage(message, options) {
  const settings = options || {};
  const detected = detectAjoopMessageLanguage(message);
  if (detected) return detected;
  return settings.current || settings.fallback || "en";
}

/* ---------- global meta intents ---------- */

/**
 * Which meta intent a message asks for, or null.
 *
 * Ajoop 4.5 moved the phrase lists into js/ajoop/ontology.js, where every
 * other intent already lives — two parallel tables of "questions about Ajoop"
 * was one table too many, and this copy had already drifted from it. The
 * function stays as the named entry point the router and planner call.
 */
function detectAjoopMetaIntent(message) {
  const tokens = tokenizeIntentText(message);
  if (!tokens.length) return null;
  if (typeof scoreAjoopOntology !== "function") return null;
  const winner = scoreAjoopOntology(tokens).find((candidate) => candidate.global);
  return winner ? winner.id : null;
}

/**
 * What Ajoop says about itself, in every language it will answer in.
 *
 * Written inline rather than through the locale packs on purpose: "sen
 * kimsin?" has to answer in Turkish on the English site, before any pack has
 * loaded, and an identity answer is the one answer that must never fall back
 * to the wrong language. Everything claimed here is true of the shipped
 * implementation — see docs/ajoop-local-ai.md.
 */
const AJOOP_META_ANSWERS = {
  identity: {
    en: "I am Ajoop, the copilot for Kaan Balcı's portfolio. I answer from this site's own project records — what Kaan built, which stack, what came out of it — and I point you at the page that backs each answer up.",
    tr: "Ben Ajoop, Kaan Balcı'nın portfolyo asistanıyım. Cevaplarımı bu sitenin kendi proje kayıtlarından veriyorum — Kaan ne yaptı, hangi teknolojiyle, sonuç ne oldu — ve her cevabın dayandığı sayfayı da gösteriyorum.",
    de: "Ich bin Ajoop, der Copilot für das Portfolio von Kaan Balcı. Ich antworte aus den Projektdaten dieser Website — was Kaan gebaut hat, mit welchem Stack, mit welchem Ergebnis — und verweise auf die Seite, die das belegt.",
    es: "Soy Ajoop, el copiloto del portafolio de Kaan Balcı. Respondo a partir de los datos de proyecto de este sitio — qué construyó Kaan, con qué stack y qué resultado tuvo — y te enlazo la página que lo respalda.",
    fr: "Je suis Ajoop, le copilote du portfolio de Kaan Balcı. Je réponds à partir des données de projet de ce site — ce que Kaan a construit, avec quelle stack, pour quel résultat — et je vous indique la page qui l'atteste.",
  },
  capabilities: {
    en: "I can walk you through Kaan's projects and the evidence behind them, put two projects side by side, summarise how he fits a role, and hand you his resume or contact details. Ask in your own words — I answer in English, Turkish, German, Spanish or French.",
    tr: "Kaan'ın projelerini ve arkalarındaki kanıtı anlatabilirim, iki projeyi yan yana koyabilirim, bir role uygunluğunu özetleyebilirim, CV'sini veya iletişim bilgilerini verebilirim. Kendi cümlelerinle sor — İngilizce, Türkçe, Almanca, İspanyolca ve Fransızca yanıtlıyorum.",
    de: "Ich kann Kaans Projekte und die Belege dahinter erklären, zwei Projekte gegenüberstellen, seine Eignung für eine Rolle zusammenfassen und den Lebenslauf oder Kontaktdaten liefern. Fragen Sie frei — ich antworte auf Englisch, Türkisch, Deutsch, Spanisch oder Französisch.",
    es: "Puedo explicarte los proyectos de Kaan y la evidencia que los respalda, comparar dos proyectos, resumir su encaje en un rol y darte su currículum o sus datos de contacto. Pregunta con tus palabras — respondo en inglés, turco, alemán, español o francés.",
    fr: "Je peux présenter les projets de Kaan et les preuves qui les appuient, comparer deux projets, résumer son adéquation à un poste et vous donner son CV ou ses coordonnées. Posez la question librement — je réponds en anglais, turc, allemand, espagnol ou français.",
  },
  howItWorks: {
    en: "Every answer starts from this site's structured portfolio data, so the facts match what the pages publish. When a local language model is running it rewrites that same answer more naturally; when it is not, you get the same facts in plain form. The line under each answer tells you which one happened.",
    tr: "Her cevap bu sitenin yapılandırılmış portfolyo verisinden başlıyor, yani bilgiler sayfalarda yayınlananla aynı. Yerelde bir dil modeli çalışıyorsa aynı cevabı daha doğal biçimde yeniden yazıyor; çalışmıyorsa aynı bilgiyi sade haliyle alıyorsun. Cevabın altındaki satır hangisinin olduğunu söylüyor.",
    de: "Jede Antwort beginnt bei den strukturierten Portfoliodaten dieser Website, die Fakten entsprechen also dem, was die Seiten veröffentlichen. Läuft lokal ein Sprachmodell, formuliert es dieselbe Antwort natürlicher; läuft keines, bekommen Sie dieselben Fakten schlicht formuliert. Die Zeile unter jeder Antwort sagt, was der Fall war.",
    es: "Cada respuesta parte de los datos estructurados de este portafolio, así que los hechos coinciden con lo que publican las páginas. Si hay un modelo de lenguaje local en marcha, reescribe esa misma respuesta de forma más natural; si no, recibes los mismos hechos en formato simple. La línea bajo cada respuesta indica cuál ha sido el caso.",
    fr: "Chaque réponse part des données structurées de ce portfolio : les faits correspondent donc à ce que publient les pages. Si un modèle de langage local tourne, il reformule la même réponse plus naturellement ; sinon, vous obtenez les mêmes faits en clair. La ligne sous chaque réponse indique ce qui s'est passé.",
  },
  isAi: {
    en: "Partly, and I would rather be precise about it. The facts come from a deterministic lookup over Kaan's portfolio data — no model invents them. A local language model may rephrase the wording when it is available, and the line under each answer says whether that happened.",
    tr: "Kısmen — ve bu konuda net olmayı tercih ederim. Bilgiler Kaan'ın portfolyo verisi üzerinde deterministik bir aramadan geliyor, hiçbir model onları uydurmuyor. Yerel bir dil modeli varsa ifadeyi yeniden yazabiliyor; cevabın altındaki satır bunun olup olmadığını söylüyor.",
    de: "Teilweise — und das sage ich lieber genau. Die Fakten stammen aus einer deterministischen Abfrage von Kaans Portfoliodaten, kein Modell erfindet sie. Ein lokales Sprachmodell kann die Formulierung übernehmen, wenn es verfügbar ist; die Zeile unter jeder Antwort sagt, ob das passiert ist.",
    es: "En parte, y prefiero ser preciso. Los hechos salen de una búsqueda determinista sobre los datos del portafolio de Kaan: ningún modelo los inventa. Un modelo de lenguaje local puede reformular la redacción cuando está disponible, y la línea bajo cada respuesta indica si ha ocurrido.",
    fr: "En partie, et autant être précis. Les faits proviennent d'une recherche déterministe dans les données du portfolio de Kaan : aucun modèle ne les invente. Un modèle de langage local peut reformuler le texte lorsqu'il est disponible, et la ligne sous chaque réponse le précise.",
  },
};

/**
 * Ontology intent ids for the meta family, mapped onto the copy keys above.
 *
 * The ontology names intents in snake_case like every other intent it holds;
 * this copy predates it. One small table beats renaming five locales' worth of
 * strings, and it accepts either spelling so no caller has to care.
 */
const AJOOP_META_ANSWER_KEYS = {
  identity: "identity",
  capabilities: "capabilities",
  how_it_works: "howItWorks",
  howItWorks: "howItWorks",
  is_ai: "isAi",
  isAi: "isAi",
};

/** The meta answer text for a language, falling back to English. */
function getAjoopMetaAnswer(kind, language) {
  const entry = AJOOP_META_ANSWERS[AJOOP_META_ANSWER_KEYS[kind] || kind];
  if (!entry) return "";
  return entry[language] || entry.en;
}
/* ajoop-language:end */

/* ---------- on-demand translation packs ---------- */
/*
 * A page ships only its own locale's copy (see script.js). That is the right
 * default for a static site and the wrong one for a conversation: a visitor
 * writing German on the English site would otherwise be answered from the
 * English copy.
 *
 * So the core pack for a language is fetched the first time a conversation
 * actually turns to it — never on load, never for the page's own locale, and
 * never more than once. English and Turkish are inline in assistant.js and
 * cost nothing here.
 */
const AJOOP_INLINE_LANGUAGES = new Set(["en", "tr"]);

/** Repo root, resolved from this module's own URL so subdirectories work. */
const AJOOP_PACK_BASE_URL = (() => {
  try {
    const src = document.currentScript && document.currentScript.src;
    return src ? new URL("../../", src).href : null;
  } catch (error) {
    return null;
  }
})();

const ajoopPackRequests = new Map();

/** True when the copy for this language is already available to render. */
function hasAjoopLanguageCopy(language) {
  if (AJOOP_INLINE_LANGUAGES.has(language)) return true;
  return Boolean(window.KAAN_I18N_PACKS && window.KAAN_I18N_PACKS[language]);
}

/**
 * Loads the core pack for a language, once. Always resolves — a pack that
 * fails to load leaves Ajoop answering from the English copy, which is a
 * degraded answer rather than a broken one.
 */
function ensureAjoopLanguagePack(language) {
  const id = String(language || "");
  if (!id || hasAjoopLanguageCopy(id) || !AJOOP_PACK_BASE_URL) return Promise.resolve(false);
  if (ajoopPackRequests.has(id)) return ajoopPackRequests.get(id);

  const request = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `${AJOOP_PACK_BASE_URL}i18n/pack-${id}-core.js`;
    script.async = false;
    script.addEventListener("load", () => resolve(true), { once: true });
    script.addEventListener("error", () => resolve(false), { once: true });
    document.head.appendChild(script);
  });
  ajoopPackRequests.set(id, request);
  return request;
}
