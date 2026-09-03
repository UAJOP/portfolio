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
  /* A question about Ajoop is a new subject, not a request to elaborate on the
   * old one; it outranks every continuation cue. */
  if (typeof detectAjoopMetaIntent === "function" && detectAjoopMetaIntent(message)) return null;
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

/**
 * Project follow-ups, best first.
 *
 * Ajoop 4.4 cut this from "every action canonical data can back" to a ranked
 * list the caller trims to two. The old row printed facets, a comparison, up
 * to three link buttons and a suggested project at once: eight or nine
 * controls under every answer, which reads as a menu rather than as a next
 * step. Ranking here, capping there, keeps the decision in one place.
 *
 * The order is what a recruiter reaches for next: the receipts, then how it
 * was built, then the page that proves it. Every entry is still gated on the
 * canonical data behind it existing, so no button leads anywhere empty.
 */
function ajoopProjectFacetActions(project, route, language) {
  const actions = [];
  const facet = route.facet || "overview";
  const linkOf = (kind) => project.links.find((link) => link.kind === kind);

  /* Ajoop 4.2: the evidence-card entry point rather than a text facet. Offered
   * only when the registry has proof points or a citable source behind it. */
  const sources =
    typeof getAjoopProjectSources === "function"
      ? getAjoopProjectSources(project.id, language)
      : [];
  if ((project.proof.length || sources.length) && facet !== "proof") {
    actions.push(
      ajoopAction(`${project.id}:proof`, ajoopPlanText("Evidence", "Kanıtlar", language), "evidence", {
        entity: project.id,
        facet: "proof",
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
  if (facet !== "overview") {
    actions.push(
      ajoopAction(`${project.id}:overview`, ajoopPlanText("Overview", "Genel bakış", language), "facet", {
        entity: project.id,
        facet: "overview",
      }),
    );
  }
  /* One link, not three. The evidence card already carries the full set, so a
   * second copy of it in the action row is pure duplication; this is the
   * single strongest destination for the project. */
  const primaryLink = linkOf("caseStudy") || linkOf("live") || linkOf("github");
  if (primaryLink) {
    const linkLabels = {
      caseStudy: ajoopPlanText("Case study", "Vaka çalışması", language),
      live: ajoopPlanText("Live product", "Canlı ürün", language),
      github: "GitHub",
    };
    actions.push(
      ajoopAction(`${project.id}:${primaryLink.kind}`, linkLabels[primaryLink.kind], "nav", {
        url: primaryLink.url,
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
    ajoopPlanText("Compare with {name}", "{name} ile karşılaştır", language).replace(
      "{name}",
      ajoopShortProjectName(project.name),
    ),
    "compare",
    { entity: other, facet: "overview", compareWith: route.entity },
  );
}

/**
 * A project name short enough to be a button.
 *
 * Canonical names carry their positioning — "SINAMA — AI Agent Reliability
 * Lab", "Merge Rush: Tiny Factory" — which belongs in a card title and wraps
 * to three lines in a chip. The identifying head is what a person would say
 * out loud, and it is taken from the same canonical string rather than being
 * a second name maintained by hand.
 */
function ajoopShortProjectName(name) {
  const head = String(name || "").split(/[—–:|(]/)[0].trim();
  return head || String(name || "");
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
        ? ajoopAction(`entity:${id}`, ajoopShortProjectName(project.name), "entity", {
            entity: id,
            facet: "overview",
          })
        : null;
    })
    .filter(Boolean);
}

/**
 * Role follow-ups, best first. Trimmed by the caller the same way the project
 * list is: the strongest two survive, the rest stay reachable by typing.
 */
function ajoopRoleActions(profile, route, language, registry) {
  const source = getAjoopRegistry(registry);
  const facet = (route && route.facet) || "overview";
  const actions = [];
  /* Ajoop 4.2: "Prove it" renders the profile's own canonical evidence
   * projects as cards. The order is the registry's curated `evidence` list, not
   * a computed ranking, so no fit score is implied. */
  if (profile.evidence.length) {
    actions.push(
      ajoopAction(`role:${profile.id}:prove`, ajoopPlanText("Prove it", "Kanıtla", language), "evidence", {
        entity: profile.id,
        facet: "proof",
      }),
    );
  }
  actions.push(
    ajoopAction("role:recruiter", ajoopPlanText("Recruiter Mode", "İK Modu", language), "nav", {
      url: `index.html?role=${encodeURIComponent(profile.id)}`,
    }),
  );
  if (facet !== "overview") {
    actions.push(
      ajoopAction(`role:${profile.id}:overview`, ajoopPlanText("Role fit", "Role uygunluk", language), "facet", {
        entity: profile.id,
        facet: "overview",
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
  return actions;
}

/**
 * Follow-ups after a question about Ajoop itself.
 *
 * A meta answer explains the assistant; the useful next step is to try it, so
 * these point back at the portfolio rather than deeper into the machinery.
 */
function ajoopMetaActions(route, language, registry, quickLabels) {
  const actions = [];
  if (route.meta !== "capabilities") {
    actions.push(
      ajoopAction("meta:capabilities", ajoopPlanText("What can you do?", "Ne yapabilirsin?", language), "meta", {
        meta: "capabilities",
      }),
    );
  }
  actions.push(...ajoopSuggestedProjects(language, registry, null, 1));
  actions.push(
    ajoopAction("intent:roles", ajoopIntentLabel("roles", language, quickLabels), "intent", {
      intent: "roles",
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
  /* A meta route scores no intents by design — it is resolved before the
   * scorer runs — so "no candidates" says nothing about it being ambiguous. */
  if (route.meta) return null;

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

/**
 * The one depth control that makes sense from here.
 *
 * 4.1 offered both directions on every answer, so "More detail" and "Short
 * answer" sat under every reply whether or not either was wanted. Only one of
 * them is ever the obvious next move: you go deeper until you are deep, and
 * from deep the only way is back. Offering that one keeps the control without
 * the wall.
 */
function planAjoopDepthOptions(depth, language) {
  const current = normalizeAjoopDepth(depth);
  if (current === "deep") {
    return [
      ajoopAction("depth:less", ajoopPlanText("Short answer", "Kısa anlat", language), "depth", {
        depth: nextAjoopDepth(current, "less"),
      }),
    ];
  }
  return [
    ajoopAction("depth:more", ajoopPlanText("More detail", "Daha detaylı", language), "depth", {
      depth: nextAjoopDepth(current, "more"),
    }),
  ];
}

/**
 * How many action buttons an answer may offer.
 *
 * Three, and the third is the depth control. The cap is not cosmetic: the row
 * sits between the transcript and the input on a phone, so every extra button
 * is a line of answer the visitor cannot see. Two contextual actions is enough
 * to suggest a direction; more is a menu, and a menu is what the visitor came
 * here to avoid.
 */
const AJOOP_MAX_FOLLOWUPS = 3;
const AJOOP_MAX_CONTEXT_ACTIONS = 2;

/**
 * The full conversational offer for one answered turn.
 *
 * Returns `{ followups, secondary, fallback, depthOptions, depth }`.
 * `followups` is deduplicated and capped, so the renderer prints it as-is;
 * `secondary` holds the escape hatch, which is rendered apart from the
 * suggestions rather than competing with them for attention.
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

  let contextual = [];
  if (fallback) {
    contextual = fallback.actions.slice();
  } else if (route && route.meta) {
    contextual = ajoopMetaActions(route, language, registry, quickLabels);
  } else if (route) {
    const entity = route.entity ? getAjoopEntity(route.entity, registry) : null;
    const profile =
      entity && entity.type === "role" ? getAjoopRoleProfile(route.entity, language, registry) : null;
    const project = profile ? null : getAjoopProject(route.entity, language, registry);

    if (profile) contextual = ajoopRoleActions(profile, route, language, registry);
    else if (project) {
      /* A comparison is only offered when a second subject is genuinely in
       * play. 4.1 also proposed an arbitrary flagship as a partner, which
       * turned a contextual action into a permanent one; a visitor who wants
       * to compare can name the two projects. */
      const compare = ajoopCompareAction(route, language, registry);
      contextual = [
        ...ajoopProjectFacetActions(project, route, language),
        ...(compare ? [compare] : []),
      ];
    } else {
      contextual = ajoopIntentActions(route, language, registry, quickLabels);
    }
  }

  /* Two contextual actions, then the depth control. A clarification prompt is
   * a question about what the visitor meant, so it gets its own choices and no
   * depth control — there is no answer yet to make longer or shorter. */
  const depthOptions = fallback || (route && route.meta) ? [] : planAjoopDepthOptions(depth, language);
  const seen = new Set();
  const followups = [];
  [
    ...contextual.slice(0, fallback ? AJOOP_MAX_FOLLOWUPS : AJOOP_MAX_CONTEXT_ACTIONS),
    ...depthOptions,
  ].forEach((action) => {
    if (!action || seen.has(action.id) || followups.length >= AJOOP_MAX_FOLLOWUPS) return;
    seen.add(action.id);
    followups.push(action);
  });

  return {
    followups,
    /* Rendered apart from the suggestions: always reachable, never one of the
     * three things Ajoop is actually proposing. */
    secondary: [ajoopAction("reset", ajoopPlanText("Start over", "Baştan başla", language), "reset")],
    fallback,
    depthOptions,
    depth,
  };
}
/* ajoop-conversation:end */
