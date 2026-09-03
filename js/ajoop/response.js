/**
 * Deterministic response planner for Ajoop (Ajoop 4.5).
 *
 * One route in, one structured RESPONSE PLAN out:
 *
 *   { type, language, intent, entity, depth, evidenceMode, text, links,
 *     cards, comparison, provenance, fallback }
 *
 * Ajoop 4.4 decided what to say inside the renderer, in a chain of if/else
 * branches that each knew a little about evidence, a little about prepared
 * copy and a little about the DOM. That is why the deterministic voice drifted
 * between branches and why the evidence rules were impossible to state in one
 * place. The decision now happens here, in one pure function, and assistant.js
 * does nothing but render what it is handed.
 *
 * Nothing in this module invents a portfolio fact. Every value it interpolates
 * comes from js/ajoop/knowledge.js or js/ajoop/evidence.js, both of which read
 * window.KAAN_PORTFOLIO; when the canonical record cannot support an answer,
 * the plan says so rather than filling the gap.
 *
 * Loads after evidence.js and before assistant.js, which renders its plans.
 */
/* ajoop-response:start
 * Keep this block DOM-free.
 *
 * Label pairs go through the local one-line getI18nText alias so
 * scripts/i18n-catalog.mjs extracts them into the five-locale packs. The alias
 * is named ajoopSay because assistant.js, conversation.js and evidence.js each
 * already declare their own in this shared classic-script scope.
 */
const ajoopSay = (english, turkish, language) => typeof getI18nText === "function" ? getI18nText(english, turkish, language) : language === "tr" ? turkish : english;

/** The kinds of turn Ajoop can produce. The renderer branches on nothing else. */
const AJOOP_RESPONSE = Object.freeze({
  SOCIAL: "social",
  META: "meta",
  ANSWER: "answer",
  CLARIFY: "clarify",
  INSUFFICIENT: "insufficient",
});

/**
 * The fallback taxonomy.
 *
 * Three genuinely different situations that 4.4 answered with one sentence:
 *
 *   UNKNOWN     nothing matched — Ajoop does not know what was asked
 *   AMBIGUOUS   the topic is clear but the question is not — two intents tied,
 *               or an aspect question with no subject to attach it to
 *   UNSUPPORTED the question was understood perfectly and the portfolio does
 *               not hold the fact
 *
 * Telling a visitor "I could not match that" when the real answer is "the data
 * does not exist" is a small lie that makes Ajoop look worse than it is.
 */
const AJOOP_FALLBACK = Object.freeze({
  UNKNOWN: "unknown",
  AMBIGUOUS: "ambiguous",
  UNSUPPORTED: "unsupported",
});

/* ---------- social copy ---------- */

/**
 * Social replies, inline in all five languages.
 *
 * Same reasoning as the identity copy in language.js: a greeting is very often
 * the FIRST message of a conversation, before any locale pack could have been
 * fetched, and greeting somebody back in the wrong language is a bad first
 * impression that no later answer undoes.
 */
const AJOOP_SOCIAL_COPY = {
  greeting: {
    en: "Hey — good to see you. I can walk you through Kaan's projects, the evidence behind them, or how he maps to a role. Where would you like to start?",
    tr: "Selam — hoş geldin. Kaan'ın projelerini, arkalarındaki kanıtı ya da bir role nasıl oturduğunu anlatabilirim. Nereden başlayalım?",
    de: "Hallo — schön, dass Sie da sind. Ich kann Ihnen Kaans Projekte zeigen, die Belege dahinter oder wie er zu einer Rolle passt. Womit fangen wir an?",
    es: "Hola — me alegro de verte. Puedo contarte los proyectos de Kaan, la evidencia que los respalda o cómo encaja en un rol. ¿Por dónde empezamos?",
    fr: "Bonjour — ravi de vous voir. Je peux vous présenter les projets de Kaan, les preuves qui les appuient ou son adéquation à un poste. Par où commençons-nous ?",
  },
  thanks: {
    en: "Any time. If you want to go deeper on a project or check how Kaan fits a specific role, just say the word.",
    tr: "Ne demek. Bir projeye daha derin bakmak ya da Kaan'ın belirli bir role uygunluğunu görmek istersen söylemen yeterli.",
    de: "Jederzeit gern. Wenn Sie tiefer in ein Projekt einsteigen oder die Eignung für eine bestimmte Rolle prüfen wollen, sagen Sie einfach Bescheid.",
    es: "Cuando quieras. Si te interesa profundizar en un proyecto o ver cómo encaja Kaan en un rol concreto, solo dilo.",
    fr: "Avec plaisir. Si vous voulez approfondir un projet ou vérifier son adéquation à un poste précis, dites-le simplement.",
  },
  goodbye: {
    en: "Take care. Kaan's resume and contact details are one question away whenever you need them.",
    tr: "Görüşürüz. Kaan'ın CV'si ve iletişim bilgileri istediğin an bir soru uzağında.",
    de: "Bis bald. Kaans Lebenslauf und Kontaktdaten sind jederzeit eine Frage entfernt.",
    es: "Hasta luego. El currículum y los datos de contacto de Kaan están a una pregunta de distancia.",
    fr: "À bientôt. Le CV et les coordonnées de Kaan sont à une question près, quand vous voudrez.",
  },
};

function ajoopSocialText(intent, language) {
  const entry = AJOOP_SOCIAL_COPY[intent];
  if (!entry) return "";
  return entry[language] || entry.en;
}

/* ---------- person composers ---------- */

/**
 * Every person-level answer is composed from window.KAAN_PORTFOLIO's profile
 * record, not from prepared prose, so it cannot drift from what the rest of
 * the site says about Kaan.
 */
function ajoopProfileFacts(language, registry) {
  const source = typeof getAjoopRegistry === "function" ? getAjoopRegistry(registry) : null;
  const profile = (source && source.profile) || {};
  const value = (field) =>
    typeof ajoopLocalized === "function" ? ajoopLocalized(profile[field], language) : "";
  return {
    name: profile.name || "Kaan Balcı",
    primaryTitle: value("primaryTitle"),
    backgroundTitle: value("backgroundTitle"),
    location: value("location"),
    availability: value("availability"),
    direction: value("direction"),
    resume: profile.resume || "",
    email: profile.email || "",
    linkedin: profile.linkedin || "",
    github: profile.github || "",
  };
}

function ajoopPersonAnswer(intent, language, registry) {
  const facts = ajoopProfileFacts(language, registry);
  const links = [];

  switch (intent) {
    case "who_is_kaan": {
      const parts = [
        ajoopSay(
          "{name} is a {primary}, with an {background} background behind it.",
          "{name}, {background} geçmişine dayanan bir {primary}.",
          language,
        )
          .replace("{name}", facts.name)
          .replace("{primary}", facts.primaryTitle)
          .replace("{background}", facts.backgroundTitle),
      ];
      if (facts.direction) parts.push(facts.direction);
      if (facts.location) {
        parts.push(
          ajoopSay("He is based in {location}.", "{location} merkezli çalışıyor.", language).replace(
            "{location}",
            facts.location,
          ),
        );
      }
      return { text: parts.join(" "), links };
    }

    /* The distinction this whole release turns on: what Kaan DOES for a
     * living, which is a stable fact about the person, as opposed to what he
     * is working on this week, which is current_work. */
    case "what_does_kaan_do": {
      const parts = [
        ajoopSay(
          "Kaan works as a {primary}.",
          "Kaan {primary} olarak çalışıyor.",
          language,
        ).replace("{primary}", facts.primaryTitle),
      ];
      if (facts.backgroundTitle) {
        parts.push(
          ajoopSay(
            "The background he brings to it is {background}.",
            "Bu role getirdiği geçmiş: {background}.",
            language,
          ).replace("{background}", facts.backgroundTitle),
        );
      }
      if (facts.direction) parts.push(facts.direction);
      return { text: parts.join(" "), links };
    }

    case "current_direction": {
      const parts = [];
      if (facts.direction) parts.push(facts.direction);
      if (facts.availability) {
        parts.push(
          ajoopSay("Current status: {availability}.", "Güncel durum: {availability}.", language).replace(
            "{availability}",
            facts.availability,
          ),
        );
      }
      if (!parts.length) return null;
      if (facts.resume) {
        links.push({ label: ajoopSay("Resume", "CV", language), url: facts.resume });
      }
      return { text: parts.join(" "), links };
    }

    case "contact": {
      if (facts.email) links.push({ label: ajoopSay("Email", "E-posta", language), url: facts.email });
      if (facts.linkedin) links.push({ label: "LinkedIn", url: facts.linkedin });
      if (facts.github) links.push({ label: "GitHub", url: facts.github });
      if (!links.length) return null;
      return {
        text: ajoopSay(
          "The quickest routes to Kaan are email and LinkedIn — both go straight to him.",
          "Kaan'a en hızlı yollar e-posta ve LinkedIn; ikisi de doğrudan ona gidiyor.",
          language,
        ),
        links,
      };
    }

    case "cv": {
      if (!facts.resume) return null;
      links.push({ label: ajoopSay("Resume", "CV", language), url: facts.resume });
      if (facts.email) links.push({ label: ajoopSay("Email", "E-posta", language), url: facts.email });
      return {
        text: ajoopSay(
          "Here is Kaan's resume. For a role conversation, the resume plus LinkedIn is the fastest path.",
          "Kaan'ın CV'si burada. Bir rol görüşmesi için en hızlı yol CV artı LinkedIn.",
          language,
        ),
        links,
      };
    }

    case "skills": {
      const source = typeof getAjoopRegistry === "function" ? getAjoopRegistry(registry) : null;
      const profiles = (source && source.recruiterProfiles) || {};
      const capabilities = [];
      Object.keys(profiles).forEach((id) => {
        (profiles[id].capabilities || []).forEach((item) => {
          if (!capabilities.includes(item)) capabilities.push(item);
        });
      });
      if (!capabilities.length) return null;
      return {
        text: ajoopSay(
          "Across the portfolio, the capabilities that come up repeatedly are {list}.",
          "Portfolyo genelinde tekrar tekrar öne çıkan yetkinlikler: {list}.",
          language,
        ).replace("{list}", capabilities.slice(0, 8).join(", ")),
        links,
      };
    }

    default:
      return null;
  }
}

/* ---------- fallback copy ---------- */

function ajoopFallbackPlan(kind, language, options) {
  const settings = options || {};
  if (kind === AJOOP_FALLBACK.UNSUPPORTED) {
    return {
      kind,
      text:
        settings.text ||
        ajoopSay(
          "The portfolio data does not record that, so I will not improvise an answer. Kaan can tell you directly.",
          "Portfolyo verisi bunu tutmuyor, bu yüzden uydurmuyorum. Kaan doğrudan anlatabilir.",
          language,
        ),
    };
  }
  if (kind === AJOOP_FALLBACK.AMBIGUOUS) {
    return {
      kind,
      text:
        settings.subject
          ? ajoopSay(
              "I have {name} in front of me — what would you like to know about it?",
              "{name} elimde — onun hakkında neyi öğrenmek istersin?",
              language,
            ).replace("{name}", settings.subject)
          : ajoopSay(
              "I can tell that is about Kaan's work — which part of it did you mean?",
              "Bunun Kaan'ın işiyle ilgili olduğunu anlıyorum — hangi kısmını kastettin?",
              language,
            ),
    };
  }
  return {
    kind: AJOOP_FALLBACK.UNKNOWN,
    text: ajoopSay(
      "I did not catch that one. I am on solid ground with Kaan's projects, his experience, how he fits a role, and how to reach him — try one of those.",
      "Bunu tam çıkaramadım. Kaan'ın projeleri, deneyimi, role uygunluğu ve iletişim bilgileri konusunda sağlam zemindeyim — bunlardan birini dene.",
      language,
    ),
  };
}

/* ---------- the plan ---------- */

/**
 * A response plan for one routed turn.
 *
 * `options` accepts `language`, `message`, `registry` and `preparedAnswer` —
 * the last being the assistant's prepared-copy lookup, injected rather than
 * imported so this module stays free of the content layer and testable
 * without it.
 */
function planAjoopResponse(route, options) {
  const settings = options || {};
  const language =
    settings.language || (typeof getCurrentLocale === "function" ? getCurrentLocale() : "en");
  const registry = settings.registry;
  const message = settings.message || "";
  const base = {
    type: AJOOP_RESPONSE.ANSWER,
    language,
    intent: route ? route.intent : null,
    family: route ? route.family : null,
    entity: route ? route.entity : null,
    depth: (route && route.depth) || "normal",
    evidenceMode: (route && route.evidencePolicy) || AJOOP_EVIDENCE.NONE,
    text: "",
    links: [],
    cards: [],
    comparison: null,
    /* Only an answer that makes a portfolio claim carries a provenance line.
     * Greetings, meta answers and clarifications are not claims. */
    provenance: "evidence",
    fallback: null,
    groundable: true,
  };

  if (!route) return Object.assign(base, ajoopUnknownPlan(language));

  /* SOCIAL — no evidence, no provenance, no model. */
  if (route.family === "social") {
    return Object.assign(base, {
      type: AJOOP_RESPONSE.SOCIAL,
      text: ajoopSocialText(route.intent, language),
      provenance: null,
      groundable: false,
      evidenceMode: AJOOP_EVIDENCE.NONE,
    });
  }

  /* META — Ajoop describing itself. Never grounded, never cited: the one
   * answer a language model must not paraphrase is the one about what it is. */
  if (route.family === "meta") {
    return Object.assign(base, {
      type: AJOOP_RESPONSE.META,
      text:
        typeof getAjoopMetaAnswer === "function" ? getAjoopMetaAnswer(route.intent, language) : "",
      provenance: null,
      groundable: false,
      evidenceMode: AJOOP_EVIDENCE.NONE,
    });
  }

  /* CONFIDENCE GATE. Below this line Ajoop is guessing, and a confident guess
   * is the single worst thing a portfolio assistant can produce. */
  if (!route.intent || route.confidence === AJOOP_CONFIDENCE.NONE) {
    return Object.assign(base, ajoopUnknownPlan(language));
  }
  if (route.unresolved) {
    return Object.assign(base, ajoopClarifyPlan(language, { subject: null }));
  }
  if (route.confidence === AJOOP_CONFIDENCE.LOW) {
    const subject =
      route.entity && typeof getAjoopProject === "function"
        ? (getAjoopProject(route.entity, language, registry) || {}).name
        : null;
    return Object.assign(base, ajoopClarifyPlan(language, { subject: subject || null }));
  }

  /* The ontology understood the question and also knows the registry cannot
   * support the requested claim. Keep this distinct from unknown/ambiguous:
   * the honest answer is about missing data, not failed comprehension. */
  if (route.evidencePolicy === AJOOP_EVIDENCE.INSUFFICIENCY) {
    return Object.assign(base, ajoopUnsupportedPlan(language));
  }

  /* The evidence this family and intent are allowed to show. */
  const evidence =
    typeof selectAjoopEvidence === "function"
      ? selectAjoopEvidence(route, language, message, registry)
      : null;

  /* PERSON — composed from the profile record. */
  if (route.family === "person") {
    const answer = ajoopPersonAnswer(route.intent, language, registry);
    if (!answer) {
      const prepared = settings.preparedAnswer ? settings.preparedAnswer(route, language) : null;
      if (prepared && prepared.text) {
        return Object.assign(base, { text: prepared.text, links: prepared.links || [] });
      }
      return Object.assign(base, ajoopUnsupportedPlan(language));
    }
    return Object.assign(base, {
      text: answer.text,
      links: answer.links,
      /* Supporting evidence is welcome but never required here. */
      cards: (evidence && evidence.cards) || [],
    });
  }

  /* CURRENT and DISCOVERY are answered entirely by the evidence layer. */
  if (route.family === "current" || route.family === "discovery") {
    if (!evidence) return Object.assign(base, ajoopUnsupportedPlan(language));
    return Object.assign(base, {
      text: evidence.text,
      cards: evidence.cards || [],
      comparison: evidence.comparison || null,
    });
  }

  /* ROLE FIT — the profile answer plus its own curated evidence. */
  if (route.family === "role") {
    const profile =
      typeof getAjoopRoleProfile === "function"
        ? getAjoopRoleProfile(route.entity, language, registry)
        : null;
    if (!profile) return Object.assign(base, ajoopClarifyPlan(language, { subject: null }));
    const parts = [
      ajoopSay(
        "For {name}, this is what the portfolio actually documents.",
        "{name} için portfolyonun gerçekten kayıt altına aldığı şey şu.",
        language,
      ).replace("{name}", profile.focusTitle || profile.label),
    ];
    if (profile.capabilities.length) {
      parts.push(
        ajoopSay("Strongest areas: {list}.", "En güçlü alanlar: {list}.", language).replace(
          "{list}",
          profile.capabilities.join(", "),
        ),
      );
    }
    return Object.assign(base, {
      text: parts.join(" "),
      cards: (evidence && evidence.cards) || [],
    });
  }

  /* PROJECT — evidence carries the structure, prose carries the answer. */
  if (route.family === "project") {
    if (route.intent === "compare_projects") {
      if (!evidence) {
        return Object.assign(
          base,
          ajoopClarifyPlan(language, {
            subject: null,
            text: ajoopSay(
              "Name the two projects you want side by side and I will lay them out.",
              "Yan yana görmek istediğin iki projeyi söyle, karşılaştırayım.",
              language,
            ),
          }),
        );
      }
      return Object.assign(base, {
        text: evidence.text,
        comparison: evidence.comparison || null,
        cards: evidence.cards || [],
      });
    }
    if (!route.entity) {
      return Object.assign(base, ajoopClarifyPlan(language, { subject: null }));
    }
    /* Prose from the entity composer in assistant.js, which already knows how
     * to phrase a project at each facet and depth. */
    const composed = settings.entityAnswer ? settings.entityAnswer(route, language) : null;
    const text = (evidence && evidence.text) || (composed && composed.text) || "";
    if (!text) return Object.assign(base, ajoopUnsupportedPlan(language));
    const cards = (evidence && evidence.cards) || [];
    return Object.assign(base, {
      text,
      /* The evidence card already carries this project's links. Rendering them
       * again under the message is the same three buttons twice, which is what
       * made an evidence answer twice as tall as it needed to be. */
      links: cards.length ? [] : (composed && composed.links) || [],
      cards,
      comparison: (evidence && evidence.comparison) || null,
    });
  }

  return Object.assign(base, ajoopUnknownPlan(language));
}

function ajoopUnknownPlan(language) {
  const fallback = ajoopFallbackPlan(AJOOP_FALLBACK.UNKNOWN, language);
  return {
    type: AJOOP_RESPONSE.CLARIFY,
    text: fallback.text,
    fallback,
    provenance: null,
    groundable: false,
    cards: [],
    comparison: null,
    evidenceMode: AJOOP_EVIDENCE.NONE,
  };
}

function ajoopClarifyPlan(language, options) {
  const settings = options || {};
  const fallback = ajoopFallbackPlan(AJOOP_FALLBACK.AMBIGUOUS, language, settings);
  return {
    type: AJOOP_RESPONSE.CLARIFY,
    text: settings.text || fallback.text,
    fallback,
    provenance: null,
    groundable: false,
    cards: [],
    comparison: null,
    evidenceMode: AJOOP_EVIDENCE.NONE,
  };
}

function ajoopUnsupportedPlan(language, topic) {
  const fallback = ajoopFallbackPlan(AJOOP_FALLBACK.UNSUPPORTED, language, { topic });
  return {
    type: AJOOP_RESPONSE.INSUFFICIENT,
    text: fallback.text,
    fallback,
    /* An insufficiency answer IS an evidence statement — it reports what the
     * portfolio data does and does not hold — so it keeps its provenance. */
    provenance: "evidence",
    groundable: false,
    cards: [],
    comparison: null,
    evidenceMode: AJOOP_EVIDENCE.INSUFFICIENCY,
  };
}
/* ajoop-response:end */
