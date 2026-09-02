/**
 * Deterministic conversation planning for Ajoop (Ajoop 4.1 Conversation layer).
 *
 * Ajoop 4.0 answers a question. This module decides what the visitor can
 * usefully do NEXT: which follow-up actions to offer, when to ask for
 * clarification instead of guessing, and how detailed the answer should be.
 *
 * It plans, it does not render. assistant.js owns the DOM; everything here is a
 * pure function of the route, the stored context and canonical registry data,
 * so the same conversation state always produces the same offer. No model, no
 * API, no generated prose — a follow-up is only offered when the canonical data
 * behind it actually exists.
 *
 * Loads after knowledge.js and router.js, before assistant.js.
 */
/* ajoop-conversation:start
 * Keep this block DOM-free.
 *
 * Label pairs go through the local one-line getI18nText alias below so
 * scripts/i18n-catalog.mjs extracts them into the five-locale packs. The alias
 * is named ajoopPlanText rather than reusing assistant.js's ajoopLabel because
 * these are separate classic scripts sharing one global lexical scope: two
 * top-level `const ajoopLabel` declarations would be a redeclaration error.
 *
 * Interpolated labels use a {name} placeholder so the whole sentence stays one
 * translatable literal instead of being concatenated per language.
 */
const ajoopPlanText = (english, turkish, language) => typeof getI18nText === "function" ? getI18nText(english, turkish, language) : language === "tr" ? turkish : english;

/* ---------- answer depth ---------- */

const AJOOP_DEPTH_LEVELS = ["quick", "normal", "deep"];
const AJOOP_DEFAULT_DEPTH = "normal";

function normalizeAjoopDepth(value) {
  return AJOOP_DEPTH_LEVELS.indexOf(value) === -1 ? AJOOP_DEFAULT_DEPTH : value;
}

/** One step deeper or shorter, clamped at the ends. */
function nextAjoopDepth(current, direction) {
  const index = AJOOP_DEPTH_LEVELS.indexOf(normalizeAjoopDepth(current));
  const step = direction === "less" ? -1 : 1;
  const next = Math.min(AJOOP_DEPTH_LEVELS.length - 1, Math.max(0, index + step));
  return AJOOP_DEPTH_LEVELS[next];
}

/* ---------- continuation phrases ---------- */

/**
 * "tell me more" is not a topic, it is an instruction about the current topic.
 *
 * Routing these through the scorer would land them on whatever intent happens
 * to share a token, so they are detected before routing and answered from the
 * stored subject instead.
 */
const AJOOP_CONTINUATION_KEYWORDS = {
  more: [
    "more", "more detail", "more details", "tell me more", "continue", "go on",
    "expand", "devam", "daha", "biraz daha", "daha detay", "detay", "detaylı",
    "açıkla", "anlat",
  ],
  less: [
    "shorter", "short answer", "briefly", "summary", "summarize",
    "kısa", "kısaca", "özet", "özetle",
  ],
};

/** Longest a message can be and still read as a continuation, not a question. */
const AJOOP_CONTINUATION_MAX_TOKENS = 4;

/**
 * "more"/"less" when the message is a bare continuation, otherwise null.
 *
 * Guarded three ways, because the Turkish cues here are ordinary words —
 * "daha" is a comparative and "anlat" is the everyday verb "tell":
 *
 *   1. the message is short;
 *   2. it names no subject of its own — "SINAMA daha iyi mi?" is a question
 *      about SINAMA, not a request to elaborate;
 *   3. it matches no intent keyword. "projeleri anlat" is a question about the
 *      projects, so it must be scored normally rather than silently re-answering
 *      whatever the previous subject happened to be. A real continuation
 *      ("daha detaylı", "devam", "tell me more") carries no topic keyword at
 *      all, which is exactly what makes it a continuation.
 */
function detectAjoopContinuation(message, registry) {
  const tokens = tokenizeIntentText(message);
  if (!tokens.length || tokens.length > AJOOP_CONTINUATION_MAX_TOKENS) return null;
  if (extractAjoopEntities(tokens, registry).length) return null;
  if (
    typeof scoreAjoopIntents === "function" &&
    scoreAjoopIntents(tokens, null, new Map()).length
  ) {
    return null;
  }
  const direction = Object.keys(AJOOP_CONTINUATION_KEYWORDS).find((key) =>
    AJOOP_CONTINUATION_KEYWORDS[key].some((keyword) => matchesKeyword(tokens, keyword)),
  );
  return direction || null;
}

/* ---------- intent labels ---------- */

/**
 * Short labels for intents offered as buttons.
 *
 * Quick-action labels already exist for the six starter intents and are
 * preferred when present (see ajoopIntentLabel); this map covers the rest so a
 * clarification prompt can name any candidate the router produced.
 */
function ajoopIntentLabelPairs(language) {
  return {
    about: ajoopPlanText("Who is Kaan?", "Kaan kim?", language),
    ai: ajoopPlanText("AI experience", "AI deneyimi", language),
    experience: ajoopPlanText("Work history", "İş geçmişi", language),
    projects: ajoopPlanText("Projects", "Projeler", language),
    stack: ajoopPlanText("Tech stack", "Teknolojiler", language),
    roles: ajoopPlanText("Role fit", "Role uygunluk", language),
    availability: ajoopPlanText("Availability", "Uygunluk", language),
    cv: ajoopPlanText("Resume and contact", "CV ve iletişim", language),
    certificates: ajoopPlanText("Certificates", "Sertifikalar", language),
    education: ajoopPlanText("Education", "Eğitim", language),
    joyday: ajoopPlanText("Atölye Joyday", "Atölye Joyday", language),
    games: ajoopPlanText("Games", "Oyunlar", language),
    adventure: ajoopPlanText("Career Adventure", "Kariyer Macerası", language),
    request: ajoopPlanText("Request a project", "Proje talebi", language),
    latestBuild: ajoopPlanText("Latest build", "Son build", language),
    weather: ajoopPlanText("Weather", "Hava durumu", language),
    greeting: ajoopPlanText("Say hello", "Selam ver", language),
  };
}

/**
 * Label for an intent button. `quickLabels` lets the caller pass the shipped
 * quick-action labels so an intent is never named two different ways.
 */
function ajoopIntentLabel(intentId, language, quickLabels) {
  if (quickLabels && quickLabels[intentId]) return quickLabels[intentId];
  const pairs = ajoopIntentLabelPairs(language);
  return pairs[intentId] || intentId;
}

/* ---------- follow-up construction ---------- */

function ajoopAction(id, label, action, extra) {
  return Object.assign({ id, label, action }, extra || {});
}

/** Facet actions that canonical data can actually back, in a stable order. */
function ajoopProjectFacetActions(project, route, language) {
  const actions = [];
  const facet = route.facet || "overview";
  const linkOf = (kind) => project.links.find((link) => link.kind === kind);

  if (facet !== "overview") {
    actions.push(
      ajoopAction(`${project.id}:overview`, ajoopPlanText("Overview", "Genel bakış", language), "facet", {
        entity: project.id,
        facet: "overview",
      }),
    );
  }
  if (project.stack.length && facet !== "stack") {
    actions.push(
      ajoopAction(`${project.id}:stack`, ajoopPlanText("Tech stack", "Teknolojiler", language), "facet", {
        entity: project.id,
        facet: "stack",
      }),
    );
  }
  if (project.proof.length && facet !== "proof") {
    actions.push(
      ajoopAction(`${project.id}:proof`, ajoopPlanText("Evidence", "Kanıtlar", language), "facet", {
        entity: project.id,
        facet: "proof",
      }),
    );
  }
  /* Link buttons navigate straight there; offering a link Ajoop does not have
   * would be the one place this layer could imply a fact that is not in the
   * registry, so each is gated on the canonical URL existing. */
  const github = linkOf("github");
  if (github) {
    actions.push(ajoopAction(`${project.id}:github`, "GitHub", "nav", { url: github.url }));
  }
  const live = linkOf("live");
  if (live) {
    actions.push(
      ajoopAction(`${project.id}:live`, ajoopPlanText("Live product", "Canlı ürün", language), "nav", {
        url: live.url,
      }),
    );
  }
  const caseStudy = linkOf("caseStudy");
  if (caseStudy) {
    actions.push(
      ajoopAction(`${project.id}:case`, ajoopPlanText("Case study", "Vaka çalışması", language), "nav", {
        url: caseStudy.url,
      }),
    );
  }
  return actions;
}

/**
 * The comparison hand-off.
 *
 * 4.1 only prepares it: the action switches the subject and records the pair
 * the Brain already tracks. Rich side-by-side evidence cards are 4.2.
 */
function ajoopCompareAction(route, language, registry) {
  const other = route.previousEntity;
  if (!other || other === route.entity) return null;
  const project = getAjoopProject(other, language, registry);
  if (!project) return null;
  return ajoopAction(
    `compare:${other}`,
    ajoopPlanText("Compare with {name}", "{name} ile karşılaştır", language).replace("{name}", project.name),
    "compare",
    { entity: other, facet: "overview" },
  );
}

/** Two flagship projects to offer as a subject switch, from canonical data. */
function ajoopSuggestedProjects(language, registry, exclude, limit) {
  const source = getAjoopRegistry(registry);
  const projects = (source && source.projects) || {};
  return Object.keys(projects)
    .filter((id) => id !== exclude)
    .slice(0, typeof limit === "number" ? limit : 2)
    .map((id) => {
      const project = getAjoopProject(id, language, registry);
      return project
        ? ajoopAction(`entity:${id}`, project.name, "entity", { entity: id, facet: "overview" })
        : null;
    })
    .filter(Boolean);
}

function ajoopRoleActions(profile, route, language, registry) {
  const source = getAjoopRegistry(registry);
  const facet = (route && route.facet) || "overview";
  const actions = [];
  if (facet !== "overview") {
    actions.push(
      ajoopAction(`role:${profile.id}:overview`, ajoopPlanText("Role fit", "Role uygunluk", language), "facet", {
        entity: profile.id,
        facet: "overview",
      }),
    );
  }
  actions.push(
    ajoopAction("role:why", ajoopPlanText("Why is this a fit?", "Neden uygun?", language), "intent", {
      intent: "roles",
    }),
  );
  if (profile.evidence.length) {
    actions.push(
      ajoopAction(`role:${profile.id}:evidence`, ajoopPlanText("Strongest evidence", "En güçlü kanıtlar", language), "facet", {
        entity: profile.evidence[0],
        facet: "proof",
      }),
    );
  }
  /* Gaps are offered but never invented: the answer says plainly that the
   * portfolio does not structure weakness data. See ajoopRoleGapAnswer. */
  if (facet !== "gaps") {
    actions.push(
      ajoopAction(`role:${profile.id}:gaps`, ajoopPlanText("Gaps", "Eksik yönler", language), "facet", {
        entity: profile.id,
        facet: "gaps",
      }),
    );
  }
  const resume = source && source.profile && source.profile.resume;
  if (resume) {
    actions.push(ajoopAction("role:cv", ajoopPlanText("Resume", "CV", language), "nav", { url: resume }));
  }
  actions.push(
    ajoopAction("role:recruiter", ajoopPlanText("Recruiter Mode", "İK Modu", language), "nav", {
      url: `index.html?role=${encodeURIComponent(profile.id)}`,
    }),
  );
  return actions;
}

/** Follow-ups for intents that have no entity behind them. */
function ajoopIntentActions(route, language, registry, quickLabels) {
  const source = getAjoopRegistry(registry);
  const profile = (source && source.profile) || {};
  const actions = [];
  switch (route.intent) {
    case "projects":
    case "ai":
      actions.push(...ajoopSuggestedProjects(language, registry, null, 2));
      actions.push(
        ajoopAction("intent:roles", ajoopIntentLabel("roles", language, quickLabels), "intent", { intent: "roles" }),
      );
      break;
    case "experience":
    case "about":
    case "education":
      actions.push(
        ajoopAction("intent:roles", ajoopIntentLabel("roles", language, quickLabels), "intent", { intent: "roles" }),
        ajoopAction("intent:projects", ajoopIntentLabel("projects", language, quickLabels), "intent", { intent: "projects" }),
      );
      if (profile.resume) {
        actions.push(ajoopAction("cv:resume", ajoopPlanText("Resume", "CV", language), "nav", { url: profile.resume }));
      }
      break;
    case "cv":
    case "availability":
      if (profile.resume) {
        actions.push(ajoopAction("cv:resume", ajoopPlanText("Resume", "CV", language), "nav", { url: profile.resume }));
      }
      actions.push(
        ajoopAction("cv:recruiter", ajoopPlanText("Recruiter Mode", "İK Modu", language), "nav", {
          url: "index.html?role=applied-ai",
        }),
        ajoopAction("intent:roles", ajoopIntentLabel("roles", language, quickLabels), "intent", { intent: "roles" }),
      );
      break;
    case "games":
    case "adventure":
      actions.push(
        ajoopAction("nav:games", ajoopIntentLabel("games", language, quickLabels), "nav", { url: "games.html" }),
        ajoopAction("intent:projects", ajoopIntentLabel("projects", language, quickLabels), "intent", { intent: "projects" }),
      );
      break;
    case "request":
      actions.push(
        ajoopAction("nav:request", ajoopPlanText("Open the request form", "Talep formunu aç", language), "nav", {
          url: "request.html",
        }),
      );
      break;
    default:
      actions.push(...ajoopSuggestedProjects(language, registry, null, 2));
      actions.push(
        ajoopAction("intent:roles", ajoopIntentLabel("roles", language, quickLabels), "intent", { intent: "roles" }),
        ajoopAction("intent:cv", ajoopIntentLabel("cv", language, quickLabels), "intent", { intent: "cv" }),
      );
      break;
  }
  return actions;
}

/* ---------- clarification ---------- */

/**
 * Whether Ajoop should ask instead of answer, and with what.
 *
 *   "topics"     nothing matched and no subject is active — offer the map
 *   "facets"     a subject is active but the question did not say what about it
 *   "candidates" two intents tied exactly, so picking one would be a coin flip
 *
 * Deliberately conservative: an intent that matched at all is answered, even at
 * low confidence, because single short keywords ("cv", "hi") legitimately score
 * low and turning those into a prompt would be a regression, not a feature.
 */
function planAjoopFallback(route, language, registry, quickLabels) {
  /* A tapped button already said what it meant; only typed messages can be
   * ambiguous. Without this, every follow-up would land in "topics" mode,
   * because a synthetic route carries no scored candidates. */
  if (route.origin === "action") return null;

  const nothingMatched = !route.candidates || !route.candidates.length;

  if (nothingMatched) {
    if (route.entity) {
      const project = getAjoopProject(route.entity, language, registry);
      if (project) {
        return {
          mode: "facets",
          prompt: ajoopPlanText(
            "I did not catch what you want to know about {name}. Pick one:",
            "{name} hakkında neyi sorduğunu tam çıkaramadım. Birini seç:",
            language,
          ).replace("{name}", project.name),
          actions: ajoopProjectFacetActions(
            project,
            { facet: null, entity: project.id },
            language,
          ),
        };
      }
    }
    return {
      mode: "topics",
      prompt: ajoopPlanText(
        "I could not match that. Here is what I can walk you through:",
        "Bunu eşleştiremedim. Sana şu konularda yardımcı olabilirim:",
        language,
      ),
      actions: ajoopIntentActions({ intent: "default" }, language, registry, quickLabels),
    };
  }

  const [first, second] = route.candidates;
  if (second && first.score === second.score && route.confidence !== "high") {
    return {
      mode: "candidates",
      prompt: ajoopPlanText(
        "I am not fully sure what you mean. Did you mean:",
        "Bunu tam eşleştiremedim. Şunlardan birini mi kastediyorsun?",
        language,
      ),
      actions: route.candidates
        .slice(0, 3)
        .map((candidate) =>
          ajoopAction(
            `candidate:${candidate.id}`,
            ajoopIntentLabel(candidate.id, language, quickLabels),
            "intent",
            { intent: candidate.id },
          ),
        ),
    };
  }
  return null;
}

/* ---------- the plan ---------- */

/** Depth controls available from the current level. */
function planAjoopDepthOptions(depth, language) {
  const current = normalizeAjoopDepth(depth);
  const options = [];
  if (current !== "deep") {
    options.push(
      ajoopAction("depth:more", ajoopPlanText("More detail", "Daha detaylı", language), "depth", {
        depth: nextAjoopDepth(current, "more"),
      }),
    );
  }
  if (current !== "quick") {
    options.push(
      ajoopAction("depth:less", ajoopPlanText("Short answer", "Kısa anlat", language), "depth", {
        depth: nextAjoopDepth(current, "less"),
      }),
    );
  }
  return options;
}

/**
 * The full conversational offer for one answered turn.
 *
 * Returns `{ followups, fallback, depthOptions, depth }`. `followups` is
 * already deduplicated and capped, so the renderer can print it as-is.
 */
function planAjoopConversation(route, options) {
  const settings = options || {};
  const language =
    settings.language ||
    (typeof getCurrentLocale === "function" ? getCurrentLocale() : "en");
  const registry = settings.registry;
  const quickLabels = settings.quickLabels || null;
  const depth = normalizeAjoopDepth(settings.depth || (route && route.depth));

  const fallback = route ? planAjoopFallback(route, language, registry, quickLabels) : null;

  let followups = [];
  if (fallback) {
    followups = fallback.actions.slice();
  } else if (route) {
    const entity = route.entity ? getAjoopEntity(route.entity, registry) : null;
    const profile =
      entity && entity.type === "role" ? getAjoopRoleProfile(route.entity, language, registry) : null;
    const project = profile ? null : getAjoopProject(route.entity, language, registry);

    if (profile) followups = ajoopRoleActions(profile, route, language, registry);
    else if (project) {
      followups = ajoopProjectFacetActions(project, route, language);
      const compare = ajoopCompareAction(route, language, registry);
      if (compare) followups.push(compare);
      followups.push(...ajoopSuggestedProjects(language, registry, project.id, 1));
    } else {
      followups = ajoopIntentActions(route, language, registry, quickLabels);
    }
  }

  /* Depth first (it applies to the answer just given), then subject actions,
   * then the escape hatch. Cap the middle so the row never crowds the input. */
  const depthOptions = fallback ? [] : planAjoopDepthOptions(depth, language);
  const seen = new Set();
  const unique = [];
  [...depthOptions, ...followups].forEach((action) => {
    if (!action || seen.has(action.id)) return;
    seen.add(action.id);
    unique.push(action);
  });
  const capped = unique.slice(0, 7);
  capped.push(
    ajoopAction("reset", ajoopPlanText("Start over", "Baştan başla", language), "reset"),
  );

  return {
    followups: capped,
    fallback,
    depthOptions,
    depth,
  };
}
/* ajoop-conversation:end */
