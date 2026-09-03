/**
 * Deterministic action planning for Ajoop (Ajoop 4.5 action planner).
 *
 * js/ajoop/response.js decides what to SAY. This module decides what the
 * visitor can usefully do NEXT, and nothing else: which follow-up actions to
 * offer, how detailed the answer should be, and when a short message is an
 * instruction about the current topic rather than a new question.
 *
 * It plans, it does not render. assistant.js owns the DOM; everything here is
 * a pure function of the route, the plan and canonical registry data, so the
 * same conversation state always produces the same offer. No model, no API, no
 * generated prose — an action is only offered when the canonical data behind
 * it actually exists.
 *
 * Loads after knowledge.js, ontology.js and router.js, before assistant.js.
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
    "açıkla", "anlat", "mehr", "weiter", "mas", "plus", "encore",
  ],
  less: [
    "shorter", "short answer", "briefly", "summary", "summarize",
    "kısa", "kısaca", "özet", "özetle", "kurzer", "resumen", "resume court",
  ],
};

/** Longest a message can be and still read as a continuation, not a question. */
const AJOOP_CONTINUATION_MAX_TOKENS = 4;

/**
 * "more"/"less" when the message is a bare continuation, otherwise null.
 *
 * Guarded four ways, because the Turkish cues here are ordinary words —
 * "daha" is a comparative and "anlat" is the everyday verb "tell":
 *
 *   1. the message is short;
 *   2. it is not a question about Ajoop itself;
 *   3. it names no subject of its own — "SINAMA daha iyi mi?" is a question
 *      about SINAMA, not a request to elaborate;
 *   4. it matches no intent in the ontology. "projeleri anlat" is a question
 *      about the projects, so it must be scored normally rather than silently
 *      re-answering whatever the previous subject happened to be. A real
 *      continuation ("daha detaylı", "devam", "tell me more") carries no topic
 *      of its own, which is exactly what makes it a continuation.
 */
function detectAjoopContinuation(message, registry) {
  const tokens = tokenizeIntentText(message);
  if (!tokens.length || tokens.length > AJOOP_CONTINUATION_MAX_TOKENS) return null;
  if (typeof detectAjoopMetaIntent === "function" && detectAjoopMetaIntent(message)) return null;
  if (extractAjoopEntities(tokens, registry).length) return null;
  if (typeof scoreAjoopOntology === "function" && scoreAjoopOntology(tokens).length) return null;
  const direction = Object.keys(AJOOP_CONTINUATION_KEYWORDS).find((key) =>
    AJOOP_CONTINUATION_KEYWORDS[key].some((keyword) => matchesKeyword(tokens, keyword)),
  );
  return direction || null;
}

/* ---------- action construction ---------- */

function ajoopAction(id, label, action, extra) {
  return Object.assign({ id, label, action }, extra || {});
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

/** Short labels for the intents that can appear as a button. */
function ajoopIntentLabelPairs(language) {
  return {
    who_is_kaan: ajoopPlanText("Who is Kaan?", "Kaan kim?", language),
    what_does_kaan_do: ajoopPlanText("What does he do?", "Ne iş yapıyor?", language),
    current_direction: ajoopPlanText("What he is after", "Ne arıyor", language),
    experience: ajoopPlanText("Experience", "Deneyim", language),
    education: ajoopPlanText("Education", "Eğitim", language),
    skills: ajoopPlanText("Capabilities", "Yetkinlikler", language),
    contact: ajoopPlanText("Contact", "İletişim", language),
    cv: ajoopPlanText("Resume", "CV", language),
    best_projects: ajoopPlanText("Best projects", "En iyi projeler", language),
    projects_by_technology: ajoopPlanText("By technology", "Teknolojiye göre", language),
    fit_for_role: ajoopPlanText("Role fit", "Role uygunluk", language),
    current_work: ajoopPlanText("Working on now", "Şu an ne yapıyor", language),
    latest_build: ajoopPlanText("Latest build", "Son build", language),
    project_overview: ajoopPlanText("Overview", "Genel bakış", language),
    project_reasoning: ajoopPlanText("How it works", "Nasıl çalışıyor?", language),
    tech_stack: ajoopPlanText("Tech stack", "Teknolojiler", language),
    evidence: ajoopPlanText("Evidence", "Kanıtlar", language),
    status: ajoopPlanText("Status", "Durum", language),
    capabilities: ajoopPlanText("What can you do?", "Ne yapabilirsin?", language),
  };
}

function ajoopIntentLabel(intentId, language) {
  return ajoopIntentLabelPairs(language)[intentId] || intentId;
}

/** An intent button, carrying the ontology intent id the router understands. */
function ajoopIntentAction(intentId, language, extra) {
  return ajoopAction(`intent:${intentId}`, ajoopIntentLabel(intentId, language), "intent", Object.assign({ intent: intentId }, extra || {}));
}

/**
 * Project follow-ups, best first.
 *
 * The order is what a recruiter reaches for next: how it works, what it is
 * built with, then the page that proves it. Every entry is gated on the
 * canonical data behind it existing, so no button leads anywhere empty.
 */
function ajoopProjectActions(project, route, language) {
  const actions = [];
  const facet = (route && route.facet) || "overview";
  const intent = route && route.intent;
  const linkOf = (kind) => project.links.find((link) => link.kind === kind);

  if (intent !== "project_reasoning" && project.summary) {
    actions.push(
      ajoopAction(`${project.id}:reasoning`, ajoopIntentLabel("project_reasoning", language), "facet", {
        entity: project.id,
        intent: "project_reasoning",
        facet: "reasoning",
      }),
    );
  }
  if (project.stack.length && facet !== "stack") {
    actions.push(
      ajoopAction(`${project.id}:stack`, ajoopIntentLabel("tech_stack", language), "facet", {
        entity: project.id,
        intent: "tech_stack",
        facet: "stack",
      }),
    );
  }
  const sources =
    typeof getAjoopProjectSources === "function"
      ? getAjoopProjectSources(project.id, language)
      : [];
  if ((project.proof.length || sources.length) && facet !== "proof") {
    actions.push(
      ajoopAction(`${project.id}:proof`, ajoopIntentLabel("evidence", language), "facet", {
        entity: project.id,
        intent: "evidence",
        facet: "proof",
      }),
    );
  }
  /* One link, not three. The evidence card already carries the full set, so a
   * second copy of it in the action row is pure duplication. */
  const primaryLink = linkOf("github") || linkOf("caseStudy") || linkOf("live");
  if (primaryLink) {
    const linkLabels = {
      github: "GitHub",
      caseStudy: ajoopPlanText("Case study", "Vaka çalışması", language),
      live: ajoopPlanText("Live product", "Canlı ürün", language),
    };
    actions.push(
      ajoopAction(`${project.id}:${primaryLink.kind}`, linkLabels[primaryLink.kind], "nav", {
        url: primaryLink.url,
      }),
    );
  }
  if (facet !== "overview" && intent !== "project_overview") {
    actions.push(
      ajoopAction(`${project.id}:overview`, ajoopIntentLabel("project_overview", language), "facet", {
        entity: project.id,
        intent: "project_overview",
        facet: "overview",
      }),
    );
  }
  return actions;
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
            intent: "project_overview",
            facet: "overview",
          })
        : null;
    })
    .filter(Boolean);
}

/**
 * The intent-aware action sets.
 *
 * 4.4 derived actions from whether the route had an entity, which meant every
 * entity-less answer got the same three buttons whatever had just been asked.
 * The follow-ups a person wants after "who is Kaan?" and after "what changed
 * recently?" have nothing in common, so the offer is now keyed on the intent
 * that was actually answered.
 */
function ajoopIntentActions(route, language, registry) {
  const source = getAjoopRegistry(registry);
  const profile = (source && source.profile) || {};
  const resumeAction = () =>
    profile.resume
      ? ajoopAction("cv:resume", ajoopIntentLabel("cv", language), "nav", { url: profile.resume })
      : ajoopIntentAction("cv", language);

  switch (route.intent) {
    case "who_is_kaan":
      return [
        ajoopIntentAction("experience", language),
        ajoopIntentAction("best_projects", language),
        resumeAction(),
      ];
    case "what_does_kaan_do":
      return [
        ajoopIntentAction("current_work", language),
        ajoopIntentAction("best_projects", language),
        ajoopIntentAction("fit_for_role", language),
      ];
    case "current_direction":
      return [
        ajoopIntentAction("fit_for_role", language),
        ajoopIntentAction("experience", language),
        resumeAction(),
      ];
    case "experience":
      return [
        ajoopIntentAction("best_projects", language),
        ajoopIntentAction("fit_for_role", language),
        resumeAction(),
      ];
    case "education":
      return [
        ajoopIntentAction("skills", language),
        ajoopIntentAction("experience", language),
        resumeAction(),
      ];
    case "skills":
      return [
        ajoopIntentAction("best_projects", language),
        ajoopIntentAction("fit_for_role", language),
        ajoopIntentAction("experience", language),
      ];
    case "contact":
    case "cv":
      return [
        ajoopIntentAction("fit_for_role", language),
        ajoopIntentAction("best_projects", language),
        ajoopIntentAction("current_direction", language),
      ];
    case "best_projects":
    case "projects_by_technology":
    case "projects_by_domain":
      return [
        ...ajoopSuggestedProjects(language, registry, null, 2),
        ajoopIntentAction("fit_for_role", language),
      ];
    case "current_work":
      return [
        ...ajoopSuggestedProjects(language, registry, null, 1),
        ajoopIntentAction("latest_build", language),
        ajoopIntentAction("best_projects", language),
      ];
    case "latest_build":
    case "recent_updates":
      return [
        ajoopIntentAction("current_work", language),
        ajoopIntentAction("best_projects", language),
        resumeAction(),
      ];
    default:
      return [
        ajoopIntentAction("best_projects", language),
        ajoopIntentAction("fit_for_role", language),
        resumeAction(),
      ];
  }
}

/** Role-fit follow-ups: the receipts, the work, the resume. */
function ajoopRoleActions(profile, route, language, registry) {
  const source = getAjoopRegistry(registry);
  const actions = [];
  if (profile.evidence.length && route.intent !== "evidence") {
    actions.push(
      ajoopAction(`role:${profile.id}:prove`, ajoopIntentLabel("evidence", language), "facet", {
        entity: profile.id,
        intent: "evidence",
        facet: "proof",
      }),
    );
  }
  actions.push(ajoopIntentAction("best_projects", language));
  const resume = source && source.profile && source.profile.resume;
  if (resume) {
    actions.push(ajoopAction("role:cv", ajoopIntentLabel("cv", language), "nav", { url: resume }));
  }
  actions.push(
    ajoopAction("role:recruiter", ajoopPlanText("Recruiter Mode", "İK Modu", language), "nav", {
      url: `index.html?role=${encodeURIComponent(profile.id)}`,
    }),
  );
  return actions;
}

/** After a question about Ajoop, the useful next step is to try it. */
function ajoopMetaActions(route, language, registry) {
  const actions = [];
  if (route.intent !== "capabilities") {
    actions.push(ajoopAction("meta:capabilities", ajoopIntentLabel("capabilities", language), "meta", { meta: "capabilities" }));
  }
  actions.push(...ajoopSuggestedProjects(language, registry, null, 1));
  actions.push(ajoopIntentAction("fit_for_role", language));
  return actions;
}

/** After a greeting, the three doors into the portfolio. */
function ajoopSocialActions(language) {
  return [
    ajoopIntentAction("who_is_kaan", language),
    ajoopIntentAction("best_projects", language),
    ajoopIntentAction("fit_for_role", language),
  ];
}

/**
 * When Ajoop asked a question instead of answering one, the actions ARE the
 * answer options. They are drawn from the intents the router actually ranked,
 * so the choices offered are the ones it was genuinely torn between.
 */
function ajoopClarifyActions(route, language, registry) {
  const alternatives =
    typeof ajoopRouteAlternatives === "function" ? ajoopRouteAlternatives(route, 2) : [];
  const actions = alternatives
    .filter((id) => typeof getAjoopIntent === "function" && getAjoopIntent(id))
    .map((id) => ajoopIntentAction(id, language));
  if (route.entity) {
    const project = getAjoopProject(route.entity, language, registry);
    if (project) return ajoopProjectActions(project, { facet: null }, language).slice(0, 3);
  }
  if (actions.length >= 2) return actions;
  return [
    ...actions,
    ajoopIntentAction("best_projects", language),
    ajoopIntentAction("who_is_kaan", language),
  ];
}

/* ---------- depth ---------- */

/**
 * The one depth control that makes sense from here.
 *
 * Only one direction is ever the obvious next move: you go deeper until you
 * are deep, and from deep the only way is back. Offering that one keeps the
 * control without the wall of two.
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

/* ---------- the plan ---------- */

/**
 * How many action buttons an answer may offer.
 *
 * Three, and the third is usually the depth control. The cap is not cosmetic:
 * the row sits between the transcript and the input on a phone, so every extra
 * button is a line of answer the visitor cannot see.
 */
const AJOOP_MAX_FOLLOWUPS = 3;
const AJOOP_MAX_CONTEXT_ACTIONS = 2;

/**
 * The action offer for one answered turn.
 *
 * Returns `{ actions, secondary, depthOptions, depth }`. `actions` is
 * deduplicated and capped, so the renderer prints it as-is; `secondary` holds
 * the escape hatch, rendered apart from the suggestions rather than competing
 * with them for attention.
 */
function planAjoopActions(route, plan, options) {
  const settings = options || {};
  const language =
    settings.language ||
    (plan && plan.language) ||
    (typeof getCurrentLocale === "function" ? getCurrentLocale() : "en");
  const registry = settings.registry;
  const depth = normalizeAjoopDepth(settings.depth || (route && route.depth));
  const type = (plan && plan.type) || "answer";

  let contextual = [];
  let allowDepth = true;

  if (!route) {
    contextual = ajoopSocialActions(language);
    allowDepth = false;
  } else if (type === "clarify") {
    contextual = ajoopClarifyActions(route, language, registry);
    /* There is no answer yet to make longer or shorter. */
    allowDepth = false;
  } else if (route.family === "social") {
    contextual = ajoopSocialActions(language);
    allowDepth = false;
  } else if (route.family === "meta") {
    contextual = ajoopMetaActions(route, language, registry);
    allowDepth = false;
  } else if (type === "insufficient") {
    contextual = [
      ajoopIntentAction("best_projects", language),
      ajoopIntentAction("contact", language),
    ];
    allowDepth = false;
  } else {
    const entity = route.entity ? getAjoopEntity(route.entity, registry) : null;
    const profile =
      entity && entity.type === "role" ? getAjoopRoleProfile(route.entity, language, registry) : null;
    const project = profile ? null : getAjoopProject(route.entity, language, registry);
    if (profile) contextual = ajoopRoleActions(profile, route, language, registry);
    else if (project && route.family === "project") {
      contextual = ajoopProjectActions(project, route, language);
    } else contextual = ajoopIntentActions(route, language, registry);
  }

  const depthOptions = allowDepth ? planAjoopDepthOptions(depth, language) : [];
  const contextCap = allowDepth ? AJOOP_MAX_CONTEXT_ACTIONS : AJOOP_MAX_FOLLOWUPS;
  const seen = new Set();
  const actions = [];
  [...contextual.slice(0, contextCap), ...depthOptions].forEach((action) => {
    if (!action || seen.has(action.id) || actions.length >= AJOOP_MAX_FOLLOWUPS) return;
    seen.add(action.id);
    actions.push(action);
  });

  return {
    actions,
    /* Always reachable, never one of the three things Ajoop is proposing. */
    secondary: [ajoopAction("reset", ajoopPlanText("Start over", "Baştan başla", language), "reset")],
    depthOptions,
    depth,
  };
}
/* ajoop-conversation:end */
