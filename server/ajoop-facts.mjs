/**
 * Exact facts: the answers that must not depend on cosine similarity.
 *
 * "What is Kaan's LinkedIn?" has one correct answer, and asking a 4B model to
 * find it among four retrieved chunks is a coin flip that occasionally lands on
 * a plausible wrong URL. So a narrow set of stable canonical facts is resolved
 * deterministically and answered without retrieval, embedding or generation.
 *
 * VALUES ARE NEVER WRITTEN HERE. Every fact reads its value out of the
 * sanitized master knowledge, so the certificate total is whatever the
 * canonical file says and changing the file changes the answer. This module
 * owns fact ids, the phrases that route to them, and the localized sentence
 * around the value — nothing else.
 *
 * THE ROUTER IS DELIBERATELY NARROW, and it works by SUBTRACTION rather than by
 * keyword presence. `question.includes("github")` would answer "GitHub nedir?"
 * with Kaan's profile URL. Instead the topic phrase is struck out of the
 * normalized question, and the fact only fires when every word left over is a
 * question particle. Any unexpected content word — "Actions", "nedir",
 * "validation", "seçerken" — blocks the route and the question falls through to
 * ordinary retrieval, which is the outcome a miss should have. A missed route
 * costs a slower answer; a false route costs a confidently wrong one.
 */
import { foldQuestion, hasPhrase, removePhrase } from "./ajoop-text.mjs";

/** Intl tags for the five supported locales. Formatting only, no facts. */
const INTL_LOCALES = Object.freeze({
  en: "en-GB",
  tr: "tr-TR",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
});

/**
 * Words that carry no topic of their own: question particles, Turkish suffix
 * fragments left behind by the fold, and polite scaffolding.
 *
 * Anything NOT in here is a content word, and a content word blocks the route.
 * That is the whole conservatism budget, so this list stays short and is not
 * the place to fix a missed question.
 */
const BASE_FILLERS = new Set([
  "ne", "neresi", "hangi", "hangileri", "kac", "kaci", "var", "yok",
  "mi", "mu", "mısın", "misin", "musun", "acaba", "peki",
  "si", "su", "sy", "i", "in", "nin", "ni", "na", "da", "de", "ta", "te", "ile", "icin",
  "bana", "lutfen", "soyle", "soyler", "soyleyebilir", "verir", "ver", "goster", "paylas",
  "link", "linki", "url", "adres", "adresi", "hesap", "hesabi", "profil", "profili",
  "sayfa", "sayfasi", "bilgi", "bilgileri", "bilgisi", "sayisi", "adet", "tane", "toplam",
  "please", "give", "show", "tell", "me", "the", "his", "him", "kaans", "of", "for",
  "list", "address", "account", "profile", "page", "info", "details", "number", "count", "total",
]);

/**
 * Filler only when the question already says it is about Kaan.
 *
 * "LinkedIn nedir?" asks what LinkedIn is. "Kaan'ın LinkedIn'i nedir?" asks for
 * his profile. The difference is entirely the possessive, so `nedir` and `what
 * is` count as scaffolding in the second sentence and as the whole question in
 * the first.
 */
const POSSESSIVE_FILLERS = new Set([
  "nedir", "nelerdir", "kimdir", "hakkinda", "what", "whats", "is", "are", "was", "about",
]);

/** Phrases that say the question is about Kaan rather than about a concept. */
const SUBJECT_SIGNALS = Object.freeze(["kaan", "balci", "balcikaan", "uajop", "his", "onun"]);

const asText = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && "value" in value) return asText(value.value);
  return "";
};

const listOf = (locale, items, type = "conjunction") => {
  const values = (items || []).map(asText).filter(Boolean);
  try {
    return new Intl.ListFormat(INTL_LOCALES[locale] || INTL_LOCALES.en, { style: "long", type }).format(values);
  } catch (error) {
    return values.join(", ");
  }
};

/* ---------- localized sentences ---------- */

/**
 * Connective text only. Every value interpolated below comes from the canonical
 * knowledge; technology, product and credential names are never translated.
 */
const COPY = Object.freeze({
  en: {
    labels: { email: "email", portfolio: "portfolio site", resume: "CV", linkedin: "LinkedIn", github: "GitHub", instagram: "Instagram", youtube: "YouTube", x: "X", twitch: "Twitch" },
    link: (label, value) => `Kaan Balcı's ${label} is ${value}.`,
    email: (value) => `Kaan Balcı's email address is ${value}.`,
    phone: (value) => `Kaan Balcı's phone number is ${value}. He shares it on request — email or LinkedIn are the usual first contact.`,
    channels: (items) => `You can reach Kaan Balcı by ${items}.`,
    fullName: (value) => `His full name is ${value}.`,
    location: (value) => `Kaan Balcı is based in ${value}.`,
    availability: (value) => `Kaan Balcı is currently ${value.toLowerCase()}.`,
    headlines: (h) => `Kaan Balcı describes himself differently by channel, and all of them are current: his portfolio leads with ${h.portfolio}, his CV with ${h.cv}, and his LinkedIn headline is ${h.linkedin}. His broader background is ${h.background}.`,
    education: (items) => `Kaan Balcı studied at ${items}.`,
    educationEntry: (e) => `${e.institution} — ${e.program} (${e.degree}, ${e.period})`,
    gpa: (value, institution, honors) =>
      `Kaan Balcı's GPA at ${institution} was ${value}${honors ? `, and he graduated as an ${honors}` : ""}.`,
    spoken: (items) => `Kaan Balcı speaks ${items}.`,
    spokenEntry: (e) => `${e.language} (${e.level})`,
    programming: (items) => `The programming languages Kaan Balcı works in are ${items}.`,
    certifications: (total, providers) => `Kaan Balcı holds ${total} certificates, from providers including ${providers}.`,
    projectTotal: (total) => `Kaan Balcı has contributed to ${total} projects. That is his overall project contribution count across academic, personal, freelance and team work — not the number of repositories on his GitHub account.`,
    githubRepos: (web, all, date) => `Ajoop's most recent snapshot, taken on ${date}, records ${web} public code and project repositories plus his profile repository, ${all} in total. I have no live data access, so I cannot confirm the count as it stands right now.`,
  },
  tr: {
    labels: { email: "e-posta", portfolio: "portfolyo sitesi", resume: "CV'si", linkedin: "LinkedIn profili", github: "GitHub profili", instagram: "Instagram hesabı", youtube: "YouTube kanalı", x: "X hesabı", twitch: "Twitch kanalı" },
    link: (label, value) => `Kaan Balcı'nın ${label}: ${value}`,
    email: (value) => `Kaan Balcı'nın e-posta adresi: ${value}`,
    phone: (value) => `Kaan Balcı'nın telefon numarası: ${value} — bu numarayı talep üzerine paylaşıyor; ilk temas için genelde e-posta ya da LinkedIn kullanılıyor.`,
    channels: (items) => `Kaan Balcı'ya şu kanallardan ulaşabilirsin: ${items}.`,
    fullName: (value) => `Tam adı ${value}.`,
    location: (value) => `Kaan Balcı ${value} merkezli çalışıyor.`,
    availability: (value) => `Kaan Balcı şu anda yeni iş fırsatlarına açık (${value}).`,
    headlines: (h) => `Kaan Balcı kendini kanala göre farklı tanımlıyor ve hepsi güncel: portfolyosunda ${h.portfolio}, CV'sinde ${h.cv}, LinkedIn başlığında ise ${h.linkedin} yazıyor. Genel arka planı ${h.background}.`,
    education: (items) => `Kaan Balcı şu okullarda okudu: ${items}.`,
    educationEntry: (e) => `${e.institution} — ${e.program} (${e.degree}, ${e.period})`,
    gpa: (value, institution, honors) =>
      `Kaan Balcı'nın ${institution} not ortalaması ${value}${honors ? ` ve ${honors} olarak mezun oldu` : ""}.`,
    spoken: (items) => `Kaan Balcı şu dilleri konuşuyor: ${items}.`,
    spokenEntry: (e) => `${e.language} (${e.level})`,
    programming: (items) => `Kaan Balcı'nın kullandığı programlama dilleri: ${items}.`,
    certifications: (total, providers) => `Kaan Balcı'nın ${total} sertifikası var; sağlayıcılar arasında ${providers} yer alıyor.`,
    projectTotal: (total) => `Kaan Balcı ${total} projeye katkı verdi. Bu, akademik, kişisel, serbest ve ekip çalışmalarını kapsayan toplam proje katkısı — GitHub hesabındaki depo sayısı değil.`,
    githubRepos: (web, all, date) => `Ajoop'un kayıtlı en güncel anlık görüntüsü (${date}) ${web} herkese açık kod/proje deposu ve bunlara ek olarak profil deposunu, toplam ${all} depoyu gösteriyor. Canlı veri erişimim yok, bu yüzden şu andaki sayıyı doğrulayamam.`,
  },
  de: {
    labels: { email: "E-Mail", portfolio: "Portfolio-Website", resume: "Lebenslauf", linkedin: "LinkedIn-Profil", github: "GitHub-Profil", instagram: "Instagram", youtube: "YouTube-Kanal", x: "X-Konto", twitch: "Twitch-Kanal" },
    link: (label, value) => `Kaan Balcıs ${label}: ${value}`,
    email: (value) => `Die E-Mail-Adresse von Kaan Balcı lautet ${value}.`,
    phone: (value) => `Die Telefonnummer von Kaan Balcı lautet ${value}. Er gibt sie auf Anfrage weiter — der übliche Erstkontakt läuft über E-Mail oder LinkedIn.`,
    channels: (items) => `Sie erreichen Kaan Balcı über ${items}.`,
    fullName: (value) => `Sein vollständiger Name ist ${value}.`,
    location: (value) => `Kaan Balcı ist in ${value} ansässig.`,
    availability: (value) => `Kaan Balcı ist derzeit offen für neue Aufgaben (${value}).`,
    headlines: (h) => `Kaan Balcı beschreibt sich je nach Kanal unterschiedlich, und alle Varianten sind aktuell: im Portfolio ${h.portfolio}, im Lebenslauf ${h.cv}, auf LinkedIn ${h.linkedin}. Sein breiterer Hintergrund ist ${h.background}.`,
    education: (items) => `Kaan Balcı hat an folgenden Hochschulen studiert: ${items}.`,
    educationEntry: (e) => `${e.institution} — ${e.program} (${e.degree}, ${e.period})`,
    gpa: (value, institution, honors) =>
      `Der Notendurchschnitt von Kaan Balcı an der ${institution} lag bei ${value}${honors ? `, und er schloss als ${honors} ab` : ""}.`,
    spoken: (items) => `Kaan Balcı spricht ${items}.`,
    spokenEntry: (e) => `${e.language} (${e.level})`,
    programming: (items) => `Die Programmiersprachen von Kaan Balcı sind ${items}.`,
    certifications: (total, providers) => `Kaan Balcı hat ${total} Zertifikate, unter anderem von ${providers}.`,
    projectTotal: (total) => `Kaan Balcı hat an ${total} Projekten mitgewirkt. Das ist die Gesamtzahl seiner Projektbeiträge aus Studium, eigenen Arbeiten, Freelance- und Teamprojekten — nicht die Zahl der Repositories in seinem GitHub-Konto.`,
    githubRepos: (web, all, date) => `Der letzte in Ajoop gespeicherte Stand vom ${date} verzeichnet ${web} öffentliche Code- und Projekt-Repositories plus sein Profil-Repository, insgesamt ${all}. Ich habe keinen Zugriff auf Live-Daten und kann den aktuellen Stand daher nicht bestätigen.`,
  },
  es: {
    labels: { email: "correo", portfolio: "sitio de portafolio", resume: "CV", linkedin: "perfil de LinkedIn", github: "perfil de GitHub", instagram: "Instagram", youtube: "canal de YouTube", x: "cuenta de X", twitch: "canal de Twitch" },
    link: (label, value) => `El ${label} de Kaan Balcí es ${value}.`,
    email: (value) => `La dirección de correo de Kaan Balcı es ${value}.`,
    phone: (value) => `El número de teléfono de Kaan Balcı es ${value}. Lo comparte a petición: el primer contacto suele ser por correo o LinkedIn.`,
    channels: (items) => `Puedes contactar con Kaan Balcı por ${items}.`,
    fullName: (value) => `Su nombre completo es ${value}.`,
    location: (value) => `Kaan Balcı reside en ${value}.`,
    availability: (value) => `Kaan Balcı está actualmente abierto a nuevas oportunidades (${value}).`,
    headlines: (h) => `Kaan Balcı se describe de forma distinta según el canal, y todas son actuales: su portafolio encabeza con ${h.portfolio}, su CV con ${h.cv} y su titular de LinkedIn es ${h.linkedin}. Su trayectoria más amplia es ${h.background}.`,
    education: (items) => `Kaan Balcı estudió en ${items}.`,
    educationEntry: (e) => `${e.institution} — ${e.program} (${e.degree}, ${e.period})`,
    gpa: (value, institution, honors) =>
      `La nota media de Kaan Balcı en ${institution} fue ${value}${honors ? `, y se graduó como ${honors}` : ""}.`,
    spoken: (items) => `Kaan Balcı habla ${items}.`,
    spokenEntry: (e) => `${e.language} (${e.level})`,
    programming: (items) => `Los lenguajes de programación que usa Kaan Balcı son ${items}.`,
    certifications: (total, providers) => `Kaan Balcı tiene ${total} certificados, de proveedores como ${providers}.`,
    projectTotal: (total) => `Kaan Balcı ha contribuido a ${total} proyectos. Es su total de contribuciones a proyectos académicos, personales, freelance y de equipo, no el número de repositorios de su cuenta de GitHub.`,
    githubRepos: (web, all, date) => `La instantánea más reciente registrada en Ajoop, del ${date}, indica ${web} repositorios públicos de código y proyectos más su repositorio de perfil, ${all} en total. No tengo acceso a datos en vivo, así que no puedo confirmar el recuento actual.`,
  },
  fr: {
    labels: { email: "e-mail", portfolio: "site de portfolio", resume: "CV", linkedin: "profil LinkedIn", github: "profil GitHub", instagram: "Instagram", youtube: "chaîne YouTube", x: "compte X", twitch: "chaîne Twitch" },
    link: (label, value) => `Le ${label} de Kaan Balcı est ${value}.`,
    email: (value) => `L'adresse e-mail de Kaan Balcı est ${value}.`,
    phone: (value) => `Le numéro de téléphone de Kaan Balcı est ${value}. Il le communique sur demande — le premier contact passe généralement par e-mail ou LinkedIn.`,
    channels: (items) => `Vous pouvez joindre Kaan Balcı par ${items}.`,
    fullName: (value) => `Son nom complet est ${value}.`,
    location: (value) => `Kaan Balcı est basé à ${value}.`,
    availability: (value) => `Kaan Balcı est actuellement ouvert à de nouvelles opportunités (${value}).`,
    headlines: (h) => `Kaan Balcı se présente différemment selon le canal, et toutes ces formulations sont à jour : son portfolio met en avant ${h.portfolio}, son CV ${h.cv}, et son titre LinkedIn est ${h.linkedin}. Son parcours plus large est ${h.background}.`,
    education: (items) => `Kaan Balcı a étudié à ${items}.`,
    educationEntry: (e) => `${e.institution} — ${e.program} (${e.degree}, ${e.period})`,
    gpa: (value, institution, honors) =>
      `La moyenne de Kaan Balcı à ${institution} était de ${value}${honors ? `, et il a obtenu son diplôme comme ${honors}` : ""}.`,
    spoken: (items) => `Kaan Balcı parle ${items}.`,
    spokenEntry: (e) => `${e.language} (${e.level})`,
    programming: (items) => `Les langages de programmation utilisés par Kaan Balcı sont ${items}.`,
    certifications: (total, providers) => `Kaan Balcı possède ${total} certificats, auprès de fournisseurs comme ${providers}.`,
    projectTotal: (total) => `Kaan Balcı a contribué à ${total} projets. C'est son total de contributions — travaux académiques, personnels, freelance et en équipe — et non le nombre de dépôts de son compte GitHub.`,
    githubRepos: (web, all, date) => `Le dernier instantané enregistré par Ajoop, daté du ${date}, indique ${web} dépôts publics de code et de projets plus son dépôt de profil, soit ${all} au total. Je n'ai pas accès aux données en direct et ne peux donc pas confirmer le compte actuel.`,
  },
});

const copyFor = (locale) => COPY[locale] || COPY.en;

/* ---------- the fact store ---------- */

/**
 * Every exact fact, read out of the sanitized knowledge.
 *
 * `topics` are the phrases that route to the fact. `fillers` are the extra
 * words this particular fact tolerates: an education question may say "okudu"
 * and a skills question may say "biliyor", but a channel question may not — a
 * verb of knowing next to "GitHub" means the visitor asked about a skill, not
 * about a URL.
 */
export function buildExactFacts(knowledge, aliasIndex) {
  const contact = knowledge?.contact_and_channels || {};
  const identity = knowledge?.identity || {};
  const headlines = identity.channel_specific_headlines || {};
  const capabilities = knowledge?.technical_capabilities || {};
  const certifications = knowledge?.certifications || {};
  const github = knowledge?.github || {};
  const signals = knowledge?.achievements_and_signals || {};
  const education = knowledge?.education || [];
  const languages = knowledge?.spoken_languages || [];

  /* Channel topics reuse the master's own alias list, so `linkdin` and
   * `git hub` route without this file keeping a second copy of them. */
  const aliasTopics = (canonical) =>
    aliasIndex?.entities?.find((entity) => entity.canonical === canonical)?.aliases || [];

  const KNOWS = ["biliyor", "bilir", "biliyormu", "kullaniyor", "kullanir", "konusuyor", "konusur", "knows", "speaks", "speak", "uses", "use"];
  const STUDIED = ["okudu", "okumus", "okuyor", "bitirdi", "mezun", "studied", "graduated", "went", "attended"];
  const HAS = ["var", "sahip", "has", "have", "got", "aldi", "tamamladi", "completed"];

  const facts = [
    {
      id: "contact:phone",
      kind: "phone",
      visibility: "public_on_request",
      value: asText(contact.phone),
      sourceRecordId: "contacts:on-request",
      topics: ["telefon", "telefon numarasi", "cep telefonu", "cep", "phone", "phone number", "telephone", "mobile", "gsm", "numarasi"],
      fillers: [],
    },
    {
      id: "contact:channels",
      kind: "channels",
      visibility: "public",
      value: {
        email: asText(contact.primary_email),
        linkedin: asText(contact.linkedin),
        portfolio: asText(contact.portfolio),
      },
      sourceRecordId: "contacts",
      topics: ["iletisim", "iletisime gecmek", "nasil ulasirim", "nasil ulasabilirim", "ulasabilirim", "ulasirim", "contact", "get in touch", "reach", "how can i contact"],
      fillers: ["nasil", "gecebilirim", "gecerim", "can", "i", "you", "kurabilirim"],
    },
    {
      id: "contact:email",
      kind: "email",
      visibility: "public",
      value: asText(contact.primary_email),
      sourceRecordId: "contacts",
      topics: ["email", "e mail", "mail", "eposta", "e posta", "elektronik posta"],
      fillers: [],
    },
    {
      id: "contact:linkedin",
      kind: "link",
      label: "linkedin",
      visibility: "public",
      value: asText(contact.linkedin),
      sourceRecordId: "contacts",
      topics: aliasTopics("LinkedIn"),
      fillers: [],
    },
    {
      id: "contact:github",
      kind: "link",
      label: "github",
      visibility: "public",
      value: asText(contact.github),
      sourceRecordId: "contacts",
      topics: aliasTopics("GitHub"),
      fillers: [],
    },
    {
      id: "contact:resume",
      kind: "link",
      label: "resume",
      visibility: "public",
      value: asText(contact.resume),
      sourceRecordId: "contacts",
      topics: ["cv", "ozgecmis", "resume", "curriculum vitae"],
      fillers: [],
    },
    {
      id: "contact:portfolio",
      kind: "link",
      label: "portfolio",
      visibility: "public",
      value: asText(contact.portfolio),
      sourceRecordId: "contacts",
      topics: ["portfolyo", "portfolio", "web sitesi", "websitesi", "website", "kisisel site", "personal site"],
      fillers: ["site", "sitesi", "sitesini", "web"],
    },
    {
      id: "contact:instagram",
      kind: "link",
      label: "instagram",
      visibility: "public",
      value: asText(contact.instagram),
      sourceRecordId: "contacts",
      topics: ["instagram", "insta"],
      fillers: [],
    },
    {
      id: "contact:youtube",
      kind: "link",
      label: "youtube",
      visibility: "public",
      value: asText(contact.youtube),
      sourceRecordId: "contacts",
      topics: ["youtube", "yt kanali"],
      fillers: ["kanal", "kanali", "channel"],
    },
    {
      id: "contact:x",
      kind: "link",
      label: "x",
      visibility: "public",
      value: asText(contact.x),
      sourceRecordId: "contacts",
      topics: ["twitter", "x hesabi", "x profili", "x account"],
      fillers: [],
    },
    {
      id: "contact:twitch",
      kind: "link",
      label: "twitch",
      visibility: "public",
      value: asText(contact.twitch),
      sourceRecordId: "contacts",
      topics: ["twitch"],
      fillers: ["kanal", "kanali", "channel"],
    },
    {
      id: "identity:full-name",
      kind: "fullName",
      visibility: "public",
      value: asText(identity.full_name),
      sourceRecordId: "identity",
      topics: ["tam adi", "tam ismi", "full name", "adi", "ismi", "soyadi", "surname"],
      fillers: [],
    },
    {
      id: "identity:location",
      kind: "location",
      visibility: "public",
      value: asText(identity.location),
      sourceRecordId: "identity",
      topics: ["nerede yasiyor", "nerede oturuyor", "nerede calisiyor", "nerede yasar", "nerede", "nerelisin", "konum", "sehir", "memleket", "location", "where does he live", "where is he based", "based", "lives"],
      fillers: ["yasiyor", "oturuyor", "calisiyor", "yasar", "does", "he", "live", "in"],
    },
    {
      id: "identity:availability",
      kind: "availability",
      visibility: "public",
      value: asText(identity.availability),
      sourceRecordId: "identity",
      topics: ["is ariyor", "is arayisi", "ise musait", "musait", "available", "availability", "open for work", "looking for work", "ise alinabilir"],
      fillers: ["mi", "mu", "he", "currently", "su anda"],
    },
    {
      id: "identity:headlines",
      kind: "headlines",
      visibility: "public",
      value: {
        portfolio: asText(headlines.portfolio_primary),
        cv: asText(headlines.current_cv),
        linkedin: asText(headlines.linkedin),
        background: asText(headlines.background_descriptor),
      },
      sourceRecordId: "identity",
      topics: ["unvan", "unvani", "title", "headline", "pozisyon", "meslegi", "meslek", "ne is yapiyor", "job title", "role"],
      fillers: ["ne", "yapiyor", "is"],
    },
    {
      id: "education:list",
      kind: "education",
      visibility: "public",
      value: education.map((entry) => ({
        institution: asText(entry.institution),
        program: asText(entry.program),
        degree: asText(entry.degree),
        period: asText(entry.canonical_period),
      })),
      sourceRecordId: "education:izmir-university-of-economics",
      topics: ["universite", "egitim", "okul", "mezun", "education", "university", "degree", "bolum", "school"],
      fillers: STUDIED,
    },
    {
      id: "education:gpa",
      kind: "gpa",
      visibility: "public",
      value: {
        gpa: asText(education[0]?.gpa),
        institution: asText(education[0]?.institution),
        honors: (education[0]?.honors || []).map(asText).filter(Boolean)[0] || "",
      },
      sourceRecordId: "education:izmir-university-of-economics",
      topics: ["gpa", "not ortalamasi", "ortalama", "grade point average"],
      fillers: ["kac", "kacti", "neydi"],
    },
    {
      id: "languages:spoken",
      kind: "spoken",
      visibility: "public",
      value: languages.map((entry) => ({ language: asText(entry.language), level: asText(entry.level) })),
      sourceRecordId: "spoken-languages",
      topics: ["hangi dilleri", "konustugu dil", "yabanci dil", "spoken languages", "languages he speaks", "dil", "diller", "language"],
      fillers: KNOWS,
    },
    {
      id: "skills:programming-languages",
      kind: "programming",
      visibility: "public",
      value: (capabilities.core_programming_languages || []).map(asText).filter(Boolean),
      sourceRecordId: "skills:programming",
      topics: ["programlama dili", "programlama dilleri", "programlama dil", "kodlama dili", "yazilim dili", "programming languages", "programming language", "coding languages"],
      fillers: KNOWS,
    },
    {
      id: "certifications:total",
      kind: "certifications",
      visibility: "public",
      value: {
        total: asText(certifications.canonical_total),
        providers: (certifications.providers || []).map(asText).filter(Boolean),
      },
      sourceRecordId: "certifications:summary",
      topics: ["sertifika", "sertifikalari", "certificate", "certificates", "certification", "certifications"],
      fillers: HAS,
    },
    {
      id: "projects:contributed-total",
      kind: "projectTotal",
      visibility: "public",
      value: asText(signals.projects_contributed),
      sourceRecordId: "achievements",
      topics: ["kac proje", "proje sayisi", "kac projesi", "project count", "how many projects", "kac tane proje"],
      fillers: HAS,
    },
    {
      id: "github:repository-count",
      kind: "githubRepos",
      visibility: "public",
      value: {
        web: asText(github.github_web_visible_repository_count),
        all: asText(github.connector_public_repositories_including_profile_repo),
        date: asText(github.snapshot_date),
      },
      sourceRecordId: "github:summary",
      topics: ["kac repo", "repo sayisi", "kac repository", "repository count", "how many repositories", "how many repos", "kac tane repo", "depo sayisi", "kac depo"],
      /* "GitHub'da" is scaffolding in a repo-count question, not a request for
       * the profile URL — this is the one fact where naming GitHub adds
       * nothing, because the count is already GitHub's. Inflected forms are
       * spelled out rather than prefix-matched: fillers are compared exactly,
       * so that "link" can never quietly swallow "linkedin". */
      fillers: [...HAS, "github", "githubda", "githubta", "githubunda", "hesabinda", "on", "does"],
    },
  ];

  /* A fact with no value is not a fact. This is also the privacy backstop: a
   * value removed by sanitizeKnowledge() leaves an empty node, and the fact it
   * would have fed simply does not exist. */
  return facts.filter((fact) => hasValue(fact.value)).map((fact) => ({
    ...fact,
    topics: [...new Set(fact.topics.map(foldQuestion).filter(Boolean))].sort((a, b) => b.length - a.length),
    fillers: new Set(fact.fillers.map(foldQuestion).filter(Boolean)),
  }));
}

function hasValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some((item) => hasValue(item));
  return true;
}

/* ---------- the router ---------- */

const mentionsSubject = (folded) => SUBJECT_SIGNALS.some((signal) => hasPhrase(folded, signal));

/**
 * The fact this question asks for, or null.
 *
 * For each candidate the topic phrase is struck out; whatever survives must be
 * scaffolding. The winner is the fact whose topic phrase matched the most
 * words, so "kaç repo var" resolves to the repository count rather than to the
 * GitHub profile link.
 */
export function resolveExactFact(question, facts) {
  const folded = foldQuestion(question);
  if (!folded || !facts?.length) return null;
  const subject = mentionsSubject(folded);

  let best = null;
  for (const fact of facts) {
    for (const topic of fact.topics) {
      const rest = removePhrase(folded, topic);
      if (rest === null) continue;
      const leftover = rest.split(" ").filter(Boolean);
      const allowed = leftover.every(
        (word) =>
          BASE_FILLERS.has(word) ||
          fact.fillers.has(word) ||
          (subject && POSSESSIVE_FILLERS.has(word)) ||
          SUBJECT_SIGNALS.some((signal) => hasPhrase(word, signal)),
      );
      if (!allowed) continue;
      const weight = topic.split(" ").length * 1000 + topic.length;
      if (!best || weight > best.weight) best = { fact, topic, weight };
      break;
    }
  }
  return best ? best.fact : null;
}

/** The localized sentence for a resolved fact. */
export function renderExactFact(fact, locale) {
  const copy = copyFor(locale);
  const value = fact.value;
  switch (fact.kind) {
    case "link":
      return copy.link(copy.labels[fact.label] || fact.label, value);
    case "email":
      return copy.email(value);
    case "phone":
      return copy.phone(value);
    case "channels":
      return copy.channels(
        listOf(locale, [
          `${copy.labels.email} (${value.email})`,
          `${copy.labels.linkedin} (${value.linkedin})`,
          `${copy.labels.portfolio} (${value.portfolio})`,
        ], "disjunction"),
      );
    case "fullName":
      return copy.fullName(value);
    case "location":
      return copy.location(value);
    case "availability":
      return copy.availability(value);
    case "headlines":
      return copy.headlines(value);
    case "education":
      return copy.education(listOf(locale, value.map(copy.educationEntry)));
    case "gpa":
      return copy.gpa(value.gpa, value.institution, value.honors);
    case "spoken":
      return copy.spoken(listOf(locale, value.map(copy.spokenEntry)));
    case "programming":
      return copy.programming(listOf(locale, value));
    case "certifications":
      /* The canonical provider list ends in a lower-case catch-all ("other
       * learning platforms"). "including" already says the list is partial, and
       * an English catch-all reads badly inside a Turkish sentence, so only the
       * named providers are listed. */
      return copy.certifications(
        value.total,
        listOf(locale, value.providers.filter((provider) => /^[A-Z0-9]/.test(provider))),
      );
    case "projectTotal":
      return copy.projectTotal(value);
    case "githubRepos":
      return copy.githubRepos(value.web, value.all, value.date);
    default:
      return "";
  }
}
