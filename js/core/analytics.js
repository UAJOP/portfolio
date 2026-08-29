/**
 * Privacy-conscious recruiter-funnel analytics (BRIEF 06).
 *
 * Umami owns normal page views. This module owns only nine deliberate funnel
 * events, a small property vocabulary and failure isolation. It never reads or
 * sends form values, chatbot input, visible copy, raw query strings or storage.
 */

const ANALYTICS_EVENTS = Object.freeze({
  RECRUITER_MODE_OPEN: "recruiter_mode_open",
  SELECTED_WORK_OPEN: "selected_work_open",
  PROJECT_OPEN: "project_open",
  GITHUB_OPEN: "github_open",
  LIVE_DEMO_OPEN: "live_demo_open",
  CV_OPEN: "cv_open",
  CONTACT_OPEN: "contact_open",
  REQUEST_START: "request_start",
  REQUEST_SUBMIT: "request_submit",
});

const ANALYTICS_EVENT_NAMES = new Set(Object.values(ANALYTICS_EVENTS));
const ANALYTICS_SOURCES = new Set([
  "hero",
  "selected_work",
  "works",
  "project",
  "recruiter_mode",
  "ajoop",
  "header",
  "footer",
  "contact",
  "request",
  "about",
  "games",
]);
const ANALYTICS_PAGE_TYPES = new Set([
  "home",
  "about",
  "blog",
  "now",
  "labs",
  "error",
  "caseStudy",
  "works",
  "games",
  "game",
  "projectDetail",
  "certificates",
  "request",
]);
const ANALYTICS_CONTACT_TYPES = new Set(["email", "request"]);
const ANALYTICS_PROJECT_EVENTS = new Set([
  ANALYTICS_EVENTS.SELECTED_WORK_OPEN,
  ANALYTICS_EVENTS.PROJECT_OPEN,
  ANALYTICS_EVENTS.LIVE_DEMO_OPEN,
]);
const ANALYTICS_QUEUE_LIMIT = 40;

/* analytics-core:start — extracted and behavior-tested by qa:analytics. */
function analyticsKebab(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function analyticsUrlKey(rawUrl, baseUrl = "https://kaanbalci.com/") {
  try {
    const url = new URL(String(rawUrl || ""), baseUrl);
    if (!/^https?:$/.test(url.protocol)) return url.protocol;
    const pathname = url.pathname.replace(/\/{2,}/g, "/");
    const ownHost = /^(www\.)?kaanbalci\.com$/i.test(url.hostname);
    return ownHost
      ? pathname.replace(/\/index\.html$/i, "/")
      : `${url.origin.toLowerCase()}${pathname}`;
  } catch (error) {
    return "";
  }
}

function analyticsLinkKind(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ""), "https://kaanbalci.com/");
    if (/^(www\.)?github\.com$/i.test(url.hostname)) return "github";
    if (/^(www\.)?kaanbalci\.com$/i.test(url.hostname)) {
      if (/\/projects\/[^/]+\/?$/i.test(url.pathname)) return "project";
      if (/case-study\.html$/i.test(url.pathname)) return "project";
      return "";
    }
    return /^https?:$/.test(url.protocol) ? "live" : "";
  } catch (error) {
    return "";
  }
}

function buildAnalyticsProjectCatalog(registry) {
  const routes = new Map();
  const slugs = new Set();
  const details = registry?.projectDetails || {};
  const projects = registry?.projects || {};

  const addRoute = (rawUrl, slug, kind, { replace = false } = {}) => {
    const key = analyticsUrlKey(rawUrl);
    if (!key || !slug || !kind) return;
    if (replace || !routes.has(key)) routes.set(key, { slug, kind });
  };

  for (const [slug, detail] of Object.entries(details)) {
    slugs.add(slug);
    addRoute(`projects/${slug}/`, slug, "project", { replace: true });
    for (const link of detail.links || []) {
      const kind = analyticsLinkKind(link?.url);
      if (kind) addRoute(link.url, slug, kind, { replace: true });
    }
  }

  for (const [id, project] of Object.entries(projects)) {
    const links = project?.links || {};
    const linkedDetail = Object.values(links)
      .map((url) => routes.get(analyticsUrlKey(url)))
      .find((match) => match?.slug);
    const canonicalRoute = String(links.caseStudy || "").match(
      /(?:^|\/)projects\/([^/]+)\/?$/i,
    );
    const slug = canonicalRoute?.[1] || linkedDetail?.slug || analyticsKebab(id);
    if (!slug) continue;
    slugs.add(slug);
    if (links.caseStudy)
      addRoute(links.caseStudy, slug, "project", { replace: !linkedDetail });
    if (links.github)
      addRoute(links.github, slug, "github", { replace: !linkedDetail });
    if (links.live)
      addRoute(links.live, slug, "live", { replace: !linkedDetail });
  }

  return { routes, slugs };
}

function analyticsProjectForUrl(rawUrl, registry) {
  const catalog = buildAnalyticsProjectCatalog(registry);
  return catalog.routes.get(analyticsUrlKey(rawUrl)) || null;
}

function normalizeAnalyticsEvent(name, properties = {}, context = {}) {
  if (!ANALYTICS_EVENT_NAMES.has(name)) return null;

  const registry = context.registry || {};
  const catalog = buildAnalyticsProjectCatalog(registry);
  const normalized = {};
  const projectSlug = String(properties.project_slug || "").trim();
  if (projectSlug && catalog.slugs.has(projectSlug)) {
    normalized.project_slug = projectSlug;
  }

  const source = String(properties.source || "").trim();
  if (ANALYTICS_SOURCES.has(source)) normalized.source = source;

  const contactType = String(properties.contact_type || "").trim();
  if (name === ANALYTICS_EVENTS.CONTACT_OPEN && ANALYTICS_CONTACT_TYPES.has(contactType)) {
    normalized.contact_type = contactType;
  }

  const pageType = String(context.pageType || properties.page_type || "").trim();
  if (ANALYTICS_PAGE_TYPES.has(pageType)) normalized.page_type = pageType;
  normalized.recruiter_mode = Boolean(context.recruiterMode);

  if (ANALYTICS_PROJECT_EVENTS.has(name) && !normalized.project_slug) return null;
  return { name, properties: normalized };
}

function isLocalAnalyticsEnvironment(locationLike) {
  const protocol = String(locationLike?.protocol || "").toLowerCase();
  const hostname = String(locationLike?.hostname || "").toLowerCase();
  return (
    protocol === "file:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

function hasProductionAnalyticsConfiguration(config, locationLike) {
  if (!config || config.enabled !== true || config.provider !== "umami") return false;
  if (isLocalAnalyticsEnvironment(locationLike)) return false;
  const hostname = String(locationLike?.hostname || "").toLowerCase();
  if (!config.domains?.includes(hostname)) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(config.websiteId || ""),
  );
}
/* analytics-core:end */

let analyticsInitialized = false;
let analyticsProviderReady = false;
const analyticsPendingEvents = [];

function currentAnalyticsContext() {
  return {
    registry: window.KAAN_PORTFOLIO || {},
    pageType: document.body?.dataset.page || "",
    recruiterMode: document.body?.classList.contains("recruiter-mode-active") || false,
  };
}

function emitLocalAnalyticsDebug(event) {
  try {
    const safeCopy = JSON.parse(JSON.stringify(event));
    console.debug("[analytics:debug]", safeCopy);
    if (typeof CustomEvent === "function") {
      document.dispatchEvent(
        new CustomEvent("portfolio:analytics-debug", { detail: safeCopy }),
      );
    }
  } catch (error) {
    /* Debug transport is optional too. */
  }
}

function sendAnalyticsEvent(event) {
  try {
    if (typeof window.umami?.track === "function") {
      window.umami.track(event.name, event.properties);
      return true;
    }
  } catch (error) {
    return false;
  }
  return false;
}

function trackAnalyticsEvent(name, properties = {}) {
  try {
    const event = normalizeAnalyticsEvent(name, properties, currentAnalyticsContext());
    if (!event) return false;

    if (isLocalAnalyticsEnvironment(window.location)) {
      if (portfolioAnalyticsConfig.debugLocal) emitLocalAnalyticsDebug(event);
      return true;
    }

    if (!hasProductionAnalyticsConfiguration(portfolioAnalyticsConfig, window.location)) {
      return false;
    }
    if (analyticsProviderReady && sendAnalyticsEvent(event)) return true;
    if (analyticsPendingEvents.length < ANALYTICS_QUEUE_LIMIT) {
      analyticsPendingEvents.push(event);
    }
    return false;
  } catch (error) {
    return false;
  }
}

function flushAnalyticsQueue() {
  analyticsProviderReady = typeof window.umami?.track === "function";
  if (!analyticsProviderReady) {
    analyticsPendingEvents.length = 0;
    return;
  }
  while (analyticsPendingEvents.length) {
    const event = analyticsPendingEvents.shift();
    sendAnalyticsEvent(event);
  }
}

function analyticsSourceForElement(element) {
  const explicit = element?.dataset?.analyticsSource || "";
  if (ANALYTICS_SOURCES.has(explicit)) return explicit;
  if (element?.closest?.("[data-recruiter-drawer]")) return "recruiter_mode";
  if (element?.closest?.("[data-portfolio-chatbot]")) return "ajoop";
  if (element?.closest?.("[data-command-palette], .site-header")) return "header";
  if (element?.closest?.("footer")) return "footer";
  if (element?.closest?.(".contact-hub")) return "contact";
  const pageType = document.body?.dataset.page || "";
  if (pageType === "works") return "works";
  if (pageType === "projectDetail" || pageType === "caseStudy") return "project";
  if (pageType === "request") return "request";
  if (pageType === "games" || pageType === "game") return "games";
  if (pageType === "about") return "about";
  return "contact";
}

function trackAnalyticsNavigation(rawUrl, source, overrides = {}) {
  try {
    const registry = window.KAAN_PORTFOLIO || {};
    const project = analyticsProjectForUrl(rawUrl, registry);
    if (project) {
      const eventName =
        project.kind === "github"
          ? ANALYTICS_EVENTS.GITHUB_OPEN
          : project.kind === "live"
            ? ANALYTICS_EVENTS.LIVE_DEMO_OPEN
            : ANALYTICS_EVENTS.PROJECT_OPEN;
      return trackAnalyticsEvent(eventName, {
        project_slug: project.slug,
        source,
        ...overrides,
      });
    }

    const url = new URL(String(rawUrl || ""), window.location.href);
    if (/^(www\.)?github\.com$/i.test(url.hostname)) {
      return trackAnalyticsEvent(ANALYTICS_EVENTS.GITHUB_OPEN, { source });
    }
    if (url.protocol === "mailto:") {
      return trackAnalyticsEvent(ANALYTICS_EVENTS.CONTACT_OPEN, {
        source,
        contact_type: "email",
      });
    }
    if (/\/request\.html$/i.test(url.pathname)) {
      return trackAnalyticsEvent(ANALYTICS_EVENTS.CONTACT_OPEN, {
        source,
        contact_type: "request",
      });
    }
  } catch (error) {
    return false;
  }
  return false;
}

function trackRequestStartOnce(form) {
  if (!form || form.__analyticsRequestStarted) return false;
  form.__analyticsRequestStarted = true;
  return trackAnalyticsEvent(ANALYTICS_EVENTS.REQUEST_START, {
    source: "request",
  });
}

function handleAnalyticsClick(event) {
  try {
    const element = event.target?.closest?.(
      '[data-analytics-event], a[href], button[onclick*="openDrivePreviews"]',
    );
    if (!element) return;
    const source = analyticsSourceForElement(element);
    const explicitEvent = element.dataset?.analyticsEvent || "";
    if (explicitEvent) {
      trackAnalyticsEvent(explicitEvent, {
        project_slug: element.dataset.analyticsProject || "",
        source,
        contact_type: element.dataset.analyticsContactType || "",
      });
      return;
    }

    const inlineHandler = element.getAttribute?.("onclick") || "";
    if (inlineHandler.includes("openDrivePreviews")) {
      trackAnalyticsEvent(ANALYTICS_EVENTS.CV_OPEN, { source });
      return;
    }

    const rawUrl = element.getAttribute?.("href") || "";
    if (!rawUrl) return;
    if (
      typeof resumeLink !== "undefined" &&
      analyticsUrlKey(rawUrl) === analyticsUrlKey(resumeLink)
    ) {
      trackAnalyticsEvent(ANALYTICS_EVENTS.CV_OPEN, { source });
      return;
    }
    trackAnalyticsNavigation(rawUrl, source);
  } catch (error) {
    /* Analytics can never interfere with the action being measured. */
  }
}

function initializePortfolioAnalytics() {
  if (analyticsInitialized) return;
  analyticsInitialized = true;

  try {
    document.addEventListener("click", handleAnalyticsClick, true);
  } catch (error) {
    /* Event delegation is optional infrastructure. */
  }

  if (!hasProductionAnalyticsConfiguration(portfolioAnalyticsConfig, window.location)) {
    return;
  }
  try {
    if (document.querySelector('script[data-portfolio-analytics-provider="umami"]')) return;
    const script = document.createElement("script");
    script.src = portfolioAnalyticsConfig.scriptUrl;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-portfolio-analytics-provider", "umami");
    script.setAttribute("data-website-id", portfolioAnalyticsConfig.websiteId);
    script.setAttribute("data-domains", portfolioAnalyticsConfig.domains.join(","));
    if (portfolioAnalyticsConfig.excludeSearch)
      script.setAttribute("data-exclude-search", "true");
    if (portfolioAnalyticsConfig.excludeHash)
      script.setAttribute("data-exclude-hash", "true");
    if (portfolioAnalyticsConfig.respectDoNotTrack)
      script.setAttribute("data-do-not-track", "true");
    script.addEventListener("load", flushAnalyticsQueue, { once: true });
    script.addEventListener(
      "error",
      () => {
        analyticsPendingEvents.length = 0;
      },
      { once: true },
    );
    document.head.appendChild(script);
  } catch (error) {
    analyticsPendingEvents.length = 0;
  }
}

initializePortfolioAnalytics();
