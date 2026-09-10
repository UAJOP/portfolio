/**
 * AJOOP A4.2 owner-private connected workflows.
 *
 *   owner request -> A4.3 deterministic plan -> A4.1 approval -> read adapter
 *   -> bounded connected context -> deterministic grounded answer
 *
 * This is an integration seam for the trusted owner-private boundary. It owns
 * no HTTP route and is not imported by the public bridge. Its exported runtime
 * authenticates first, then privately mints a runtime-scoped context. Contexts
 * never escape and a separate runtime has a separate authority scope.
 *
 * Connected data is held only in local variables for the current request. It
 * is never written to memory, a file or telemetry. Free-form generation is
 * not used for A4 V1 current-state facts. Action requests go to the action
 * contract, which has no executor.
 */
import {
  AJOOP_READ_CONNECTOR_PROVENANCE,
  AJOOP_READ_CONNECTOR_SURFACES,
  AJOOP_READ_CONNECTOR_TOOL_IDS as T,
  canUseAjoopReadConnectors,
  evaluateAjoopConnectorRead,
} from "./ajoop-read-connector-contract.mjs";
import { executeAjoopGmailRead } from "./ajoop-gmail-read-adapter.mjs";
import { executeAjoopCalendarRead } from "./ajoop-calendar-read-adapter.mjs";
import { executeAjoopGitHubRead } from "./ajoop-github-read-adapter.mjs";
import { executeAjoopDriveRead } from "./ajoop-drive-read-adapter.mjs";
import {
  AJOOP_OWNER_GMAIL_LOOKBACK_DAYS,
  AJOOP_OWNER_INTENTS as I,
  AJOOP_OWNER_JOB_KEYWORDS,
  AJOOP_OWNER_ROUTES as ROUTES,
  normalizeAjoopOwnerPolicyConfig,
  planAjoopOwnerRequest,
} from "./ajoop-owner-tool-policy.mjs";
import { buildAjoopConnectedContext, cleanConnectedText, inspectAjoopConnectorResult } from "./ajoop-connected-context.mjs";
import {
  createAjoopActionContract,
  getAjoopActionPolicy,
  listAjoopActionTypes,
} from "./ajoop-action-contract.mjs";
import { foldQuestion, hasPhrase } from "./ajoop-text.mjs";

export const AJOOP_OWNER_WORKFLOW_MAX_ANSWER_CHARS = 6000;
export const AJOOP_OWNER_WORKFLOW_MAX_LISTED_ITEMS = 10;
export const AJOOP_OWNER_WORKFLOW_READ_DEADLINE_MS = 45000;
export const AJOOP_OWNER_WORKFLOW_GENERATION_DEADLINE_MS = 60000;
export const AJOOP_OWNER_WORKFLOW_MAX_DEADLINE_MS = 120000;
const TIMED_OUT = Symbol("ajoop-owner-workflow-timed-out");

/**
 * Resolve with the task's value, or with TIMED_OUT once the deadline passes.
 * The timer is always cleared; a late value or rejection is ignored.
 */
const withDeadline = (task, deadlineMs) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => resolve(TIMED_OUT), deadlineMs);
  let pending;
  try {
    pending = Promise.resolve(task());
  } catch (error) {
    clearTimeout(timer);
    reject(error);
    return;
  }
  pending.then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});

const isDeadline = (value) => Number.isInteger(value) && value >= 1 && value <= AJOOP_OWNER_WORKFLOW_MAX_DEADLINE_MS;

const freeze = (value) => Object.freeze(value);
const CONNECTED = AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE;
const ACCESS_DENIED = freeze({ ok: false, code: "owner-private-auth-required", toolCalls: 0 });
const CLIENT_KEYS = freeze({ gmail: "gmailClient", calendar: "calendarClient", github: "githubClient", drive: "driveClient" });
const EXECUTORS = freeze({
  gmail: executeAjoopGmailRead,
  calendar: executeAjoopCalendarRead,
  github: executeAjoopGitHubRead,
  drive: executeAjoopDriveRead,
});
const KNOWN_TOOL_IDS = new Set(Object.values(T));
const KNOWN_INTENTS = new Set(Object.values(I));
const KNOWN_ROUTES = new Set(Object.values(ROUTES));
const KNOWN_ACTION_TYPES = new Set(listAjoopActionTypes());

const own = (source, key) => {
  if (!source || typeof source !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
};

/* ------------------------------------------------------------------ locale and formatting */

const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
const TURKISH_WORDS = ["mi", "mu", "ne", "var", "hangisi", "geldi", "nerede", "bul", "durumda", "takvimimde", "kaldik", "bu", "son"];
const detectLocale = (question) => (TURKISH_LETTERS.test(question) || foldQuestion(question).split(" ").some((token) => TURKISH_WORDS.includes(token)) ? "tr" : "en");

const quote = (value, maxChars = 120) => `"${cleanConnectedText(value, maxChars)}"`;

const zonedParts = (milliseconds, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(milliseconds));
  const read = (type) => parts.find((part) => part.type === type)?.value;
  return { date: `${read("year")}-${read("month")}-${read("day")}`, time: `${read("hour")}:${read("minute")}` };
};

const localDate = (iso, timeZone) => (typeof iso === "string" && Number.isFinite(Date.parse(iso)) ? zonedParts(Date.parse(iso), timeZone).date : null);

const previousDate = (isoDateText) => {
  const [year, month, day] = isoDateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
};

const WINDOW_LABELS = {
  tr: { today: "Bugün", tomorrow: "Yarın", "this-week": "Bu hafta", "next-week": "Gelecek hafta", "next-7-days": "Önümüzdeki 7 gün", pazartesi: "Pazartesi", sali: "Salı", carsamba: "Çarşamba", persembe: "Perşembe", cuma: "Cuma", cumartesi: "Cumartesi", pazar: "Pazar" },
  en: { today: "Today", tomorrow: "Tomorrow", "this-week": "This week", "next-week": "Next week", "next-7-days": "The next 7 days" },
};

const windowLabel = (window, locale) => {
  const named = WINDOW_LABELS[locale][window.label] ?? WINDOW_LABELS.tr[window.label] ?? window.label;
  const last = previousDate(window.endDateExclusive);
  const range = last === window.startDate ? window.startDate : `${window.startDate} – ${last}`;
  return `${named.charAt(0).toUpperCase()}${named.slice(1)} (${range})`;
};

const SOURCE_NAMES = { gmail: "Gmail", calendar: { tr: "Takvim", en: "Calendar" }, github: "GitHub", drive: "Drive" };
const sourceName = (source, locale) => (typeof SOURCE_NAMES[source] === "string" ? SOURCE_NAMES[source] : SOURCE_NAMES[source][locale]);

const unavailableSentence = (source, code, locale) => (locale === "tr"
  ? `${sourceName(source, locale)} şu an okunamadı (${code}); bu yüzden doğrulayamıyorum.`
  : `${sourceName(source, locale)} could not be read right now (${code}), so I cannot verify this.`);

const partialNote = (locale) => (locale === "tr" ? " Not: sonuçlar kısmi; daha fazla kayıt olabilir." : " Note: results are partial; more records may exist.");

const MIME_LABELS = {
  "application/pdf": "PDF",
  "application/vnd.google-apps.document": "Google Docs",
  "application/vnd.google-apps.spreadsheet": "Google Sheets",
  "application/vnd.google-apps.presentation": "Google Slides",
  "application/vnd.google-apps.shortcut": "Drive shortcut",
};

/* ------------------------------------------------------------------ composers */

const byTool = (entries, toolId) => entries.find((entry) => entry.toolId === toolId)?.inspected
  ?? freeze({ valid: false, code: "not-called" });

const sourceState = (inspected) => (inspected.valid && inspected.ok ? null : inspected.code);

const sortedMessages = (data) => [...(Array.isArray(own(data, "results")) ? own(data, "results") : [])]
  .sort((left, right) => (Date.parse(own(right, "internalDate") ?? "") || 0) - (Date.parse(own(left, "internalDate") ?? "") || 0));

const composeGmail = (plan, entries, locale, timeZone) => {
  const inspected = byTool(entries, T.GMAIL_SEARCH_MESSAGES);
  const failure = sourceState(inspected);
  if (failure) return { answered: false, answer: unavailableSentence("gmail", failure, locale), claims: { source: "gmail", sourceAvailable: false } };
  const data = inspected.data;
  const messages = sortedMessages(data);
  const count = messages.length;
  const incomplete = own(data, "truncated") === true;
  const latest = messages[0];
  const claims = { source: "gmail", sourceAvailable: true, found: count > 0, resultCount: count, complete: !incomplete, latestMessageId: latest ? own(latest, "messageId") : null };
  const who = plan.sender ? quote(plan.sender, 60) : null;
  let answer;
  if (plan.intent === I.GMAIL_SENDER_LOOKUP) {
    if (!count) {
      answer = locale === "tr"
        ? `Hayır. Gmail'de son ${AJOOP_OWNER_GMAIL_LOOKBACK_DAYS} günde ${who} göndereniyle eşleşen bir e-posta bulunamadı.`
        : `No. Gmail has no email matching sender ${who} in the last ${AJOOP_OWNER_GMAIL_LOOKBACK_DAYS} days.`;
    } else {
      const date = localDate(own(latest, "internalDate"), timeZone);
      answer = locale === "tr"
        ? `Evet. Gmail'de son ${AJOOP_OWNER_GMAIL_LOOKBACK_DAYS} günde ${who} göndereniyle eşleşen ${count}${incomplete ? "+" : ""} e-posta var. En yenisi: ${quote(own(latest, "subject"))} — ${quote(own(latest, "from"), 80)}${date ? `, ${date}` : ""}.`
        : `Yes. Gmail has ${count}${incomplete ? "+" : ""} email(s) matching sender ${who} in the last ${AJOOP_OWNER_GMAIL_LOOKBACK_DAYS} days. Latest: ${quote(own(latest, "subject"))} from ${quote(own(latest, "from"), 80)}${date ? `, ${date}` : ""}.`;
    }
  } else if (!count) {
    answer = locale === "tr" ? "Gelen kutusunda son 7 günde e-posta bulunamadı." : "No inbox email was found in the last 7 days.";
  } else {
    const lines = messages.slice(0, 3).map((message) => `- ${quote(own(message, "subject"))} — ${quote(own(message, "from"), 80)}`);
    answer = `${locale === "tr" ? `Gelen kutusunda son 7 günde ${count}${incomplete ? "+" : ""} e-posta var:` : `The inbox has ${count}${incomplete ? "+" : ""} email(s) from the last 7 days:`}\n${lines.join("\n")}`;
  }
  return { answered: true, answer: `${answer}${incomplete ? partialNote(locale) : ""}`, claims };
};

const liveEvents = (data) => (Array.isArray(own(data, "events")) ? own(data, "events") : [])
  .filter((event) => own(event, "tombstone") !== true && own(event, "status") !== "cancelled");

const eventLine = (event, timeZone, locale, withDate) => {
  const start = own(event, "start");
  const end = own(event, "end");
  let when;
  if (own(start, "kind") === "date") {
    when = `${withDate ? `${own(start, "date")} ` : ""}${locale === "tr" ? "tüm gün" : "all day"}`;
  } else {
    const from = zonedParts(Date.parse(own(start, "dateTime")), timeZone);
    const to = own(end, "kind") === "date-time" ? zonedParts(Date.parse(own(end, "dateTime")), timeZone) : null;
    when = `${withDate ? `${from.date} ` : ""}${from.time}${to ? `–${to.time}` : ""}`;
  }
  return `- ${when} ${quote(own(event, "summary"))}`;
};

const composeCalendar = (plan, entries, locale, timeZone) => {
  const inspected = byTool(entries, T.CALENDAR_LIST_EVENTS);
  const failure = sourceState(inspected);
  if (failure) return { answered: false, answer: unavailableSentence("calendar", failure, locale), claims: { source: "calendar", sourceAvailable: false } };
  const events = liveEvents(inspected.data);
  const incomplete = own(inspected.data, "truncated") === true;
  const label = windowLabel(plan.window, locale);
  const claims = { source: "calendar", sourceAvailable: true, found: events.length > 0, eventCount: events.length, complete: !incomplete };
  if (!events.length) {
    return { answered: true, claims, answer: `${label}: ${locale === "tr" ? "takviminde etkinlik yok." : "no calendar events."}${incomplete ? partialNote(locale) : ""}` };
  }
  const multiDay = plan.window.endDateExclusive !== plan.window.startDate && previousDate(plan.window.endDateExclusive) !== plan.window.startDate;
  const lines = events.slice(0, AJOOP_OWNER_WORKFLOW_MAX_LISTED_ITEMS).map((event) => eventLine(event, timeZone, locale, multiDay));
  const more = events.length - lines.length;
  const heading = locale === "tr" ? `${label}: takviminde ${events.length} etkinlik var:` : `${label}: ${events.length} calendar event(s):`;
  const tail = more > 0 ? `\n${locale === "tr" ? `… ve ${more} etkinlik daha.` : `… and ${more} more.`}` : "";
  return { answered: true, claims, answer: `${heading}\n${lines.join("\n")}${tail}${incomplete ? partialNote(locale) : ""}` };
};

const composeGitHubStatus = (plan, entries, locale, timeZone) => {
  const inspected = byTool(entries, T.GITHUB_READ_PULL_REQUEST);
  const failure = sourceState(inspected);
  if (failure) return { answered: false, answer: unavailableSentence("github", failure, locale), claims: { source: "github", sourceAvailable: false } };
  const data = inspected.data;
  const prNumber = own(data, "prNumber");
  const repository = own(data, "repository");
  const merged = own(data, "merged") === true;
  const mergeable = own(data, "mergeable") === true ? true : own(data, "mergeable") === false ? false : null;
  const state = own(data, "state");
  const draft = own(data, "draft") === true;
  const title = quote(own(data, "title"));
  const claims = { source: "github", sourceAvailable: true, prNumber, repository, state, merged, mergeable, draft };
  const label = `PR #${prNumber} (${repository})`;
  let answer;
  if (merged) {
    const date = localDate(own(data, "mergedAt"), timeZone);
    answer = locale === "tr" ? `${label} merge edilmiş${date ? ` (${date})` : ""}: ${title}.` : `${label} is merged${date ? ` (${date})` : ""}: ${title}.`;
  } else if (state === "closed") {
    answer = locale === "tr" ? `${label} kapatılmış ama merge edilmemiş: ${title}.` : `${label} is closed without being merged: ${title}.`;
  } else {
    answer = locale === "tr"
      ? `${label} açık ve henüz merge edilmemiş${draft ? " (taslak)" : ""}: ${title}.`
      : `${label} is open and not merged yet${draft ? " (draft)" : ""}: ${title}.`;
  }
  if (!merged) {
    const mergeability = mergeable === true
      ? (locale === "tr" ? " Birleştirilebilirlik: uygun." : " Mergeability: mergeable.")
      : mergeable === false
        ? (locale === "tr" ? " Birleştirilebilirlik: uygun değil." : " Mergeability: not mergeable.")
        : (locale === "tr" ? " Birleştirilebilirlik henüz bilinmiyor." : " Mergeability is still unknown.");
    answer += mergeability;
  }
  return { answered: true, answer, claims };
};

const composeGitHubOpen = (plan, entries, locale) => {
  const inspected = byTool(entries, T.GITHUB_SEARCH_PULL_REQUESTS);
  const failure = sourceState(inspected);
  if (failure) return { answered: false, answer: unavailableSentence("github", failure, locale), claims: { source: "github", sourceAvailable: false } };
  const pullRequests = Array.isArray(own(inspected.data, "pullRequests")) ? own(inspected.data, "pullRequests") : [];
  const incomplete = own(inspected.data, "truncated") === true;
  const claims = { source: "github", sourceAvailable: true, found: pullRequests.length > 0, resultCount: pullRequests.length, complete: !incomplete };
  if (!pullRequests.length) return { answered: true, claims, answer: locale === "tr" ? "Açık PR bulunamadı." : "No open pull requests were found." };
  const lines = pullRequests.slice(0, AJOOP_OWNER_WORKFLOW_MAX_LISTED_ITEMS).map((pullRequest) => `- #${own(pullRequest, "prNumber")} ${quote(own(pullRequest, "title"))}`);
  const heading = locale === "tr" ? `${pullRequests.length}${incomplete ? "+" : ""} açık PR var:` : `${pullRequests.length}${incomplete ? "+" : ""} open pull request(s):`;
  return { answered: true, claims, answer: `${heading}\n${lines.join("\n")}${incomplete ? partialNote(locale) : ""}` };
};

const composeDriveDiscovery = (plan, entries, locale, timeZone) => {
  const inspected = byTool(entries, T.DRIVE_SEARCH_FILES);
  const failure = sourceState(inspected);
  if (failure) return { answered: false, answer: unavailableSentence("drive", failure, locale), claims: { source: "drive", sourceAvailable: false } };
  const files = Array.isArray(own(inspected.data, "files")) ? own(inspected.data, "files") : [];
  const incomplete = own(inspected.data, "truncated") === true;
  const term = quote(plan.searchTerm, 60);
  const latest = files[0];
  const claims = {
    source: "drive",
    sourceAvailable: true,
    found: files.length > 0,
    resultCount: files.length,
    complete: !incomplete,
    orderedBy: plan.orderedBy,
    latestFileId: latest ? own(latest, "fileId") : null,
    latestFileName: latest ? cleanConnectedText(own(latest, "name"), 120) : null,
  };
  if (!latest) {
    return { answered: true, claims, answer: locale === "tr" ? `Drive'da ${term} aramasıyla eşleşen dosya bulunamadı.` : `No Drive file matched the search ${term}.` };
  }
  const mimeType = own(latest, "mimeType");
  const kind = MIME_LABELS[mimeType] ?? mimeType;
  const date = localDate(own(latest, "modifiedAt"), timeZone);
  const shortcut = own(latest, "shortcut") ? (locale === "tr" ? " Bu bir kısayol; hedef dosya ayrıca okunmadı." : " This is a shortcut; its target was not read.") : "";
  const count = files.length > 1
    ? (locale === "tr" ? ` Toplam ${files.length}${incomplete ? "+" : ""} eşleşme var.` : ` ${files.length}${incomplete ? "+" : ""} matches in total.`)
    : "";
  const answer = locale === "tr"
    ? `Drive'da ${term} aramasına göre en son değiştirilen dosya: ${quote(own(latest, "name"))} (${kind}, son değişiklik ${date}). Bağlantı: ${own(latest, "webUrl")}.${shortcut}${count}`
    : `The most recently modified Drive file matching ${term} is ${quote(own(latest, "name"))} (${kind}, modified ${date}). Link: ${own(latest, "webUrl")}.${shortcut}${count}`;
  return { answered: true, claims, answer };
};

const composeDriveRead = (plan, entries, locale) => {
  const inspected = byTool(entries, T.DRIVE_READ_FILE);
  const failure = sourceState(inspected);
  if (failure) return { answered: false, answer: unavailableSentence("drive", failure, locale), claims: { source: "drive", sourceAvailable: false } };
  const data = inspected.data;
  const name = quote(own(data, "name"));
  if (own(data, "contentAvailable") !== true) {
    const reason = own(data, "contentUnavailableReason");
    return {
      answered: true,
      claims: { source: "drive", sourceAvailable: true, contentAvailable: false, complete: false },
      answer: locale === "tr" ? `${name} dosyasının içeriği okunamıyor (${reason}); yalnızca üst verisi mevcut.` : `The content of ${name} is not available (${reason}); only its metadata is.`,
    };
  }
  const text = cleanConnectedText(own(data, "contentText"), 600, { multiline: true });
  const complete = own(data, "truncated") !== true && own(data, "contentPartial") !== true && text.length === String(own(data, "contentText")).trim().length;
  const heading = locale === "tr"
    ? `${name} dosyasının ${complete ? "metni" : "metninin yalnızca bir kısmı (kısmi)"}:`
    : `${complete ? "Text" : "Partial text only"} of ${name}:`;
  return { answered: true, claims: { source: "drive", sourceAvailable: true, contentAvailable: true, complete }, answer: `${heading}\n${JSON.stringify(text)}` };
};

const composeJobApplications = (plan, entries, locale, timeZone) => {
  const gmail = byTool(entries, T.GMAIL_SEARCH_MESSAGES);
  const calendar = byTool(entries, T.CALENDAR_LIST_EVENTS);
  const lines = [];
  const claims = { sources: {}, complete: true };
  if (sourceState(gmail)) {
    lines.push(`- ${unavailableSentence("gmail", gmail.code, locale)}`);
    claims.sources.gmail = { available: false };
    claims.complete = false;
  } else {
    const messages = sortedMessages(gmail.data);
    const incomplete = own(gmail.data, "truncated") === true;
    claims.sources.gmail = { available: true, count: messages.length };
    claims.complete &&= !incomplete;
    const latest = messages[0];
    lines.push(locale === "tr"
      ? `- Gmail: ${messages.length}${incomplete ? "+" : ""} ilgili e-posta${latest ? `; en yenisi ${quote(own(latest, "subject"))} — ${quote(own(latest, "from"), 80)}` : ""}.`
      : `- Gmail: ${messages.length}${incomplete ? "+" : ""} related email(s)${latest ? `; latest ${quote(own(latest, "subject"))} from ${quote(own(latest, "from"), 80)}` : ""}.`);
  }
  if (sourceState(calendar)) {
    lines.push(`- ${unavailableSentence("calendar", calendar.code, locale)}`);
    claims.sources.calendar = { available: false };
    claims.complete = false;
  } else {
    const related = liveEvents(calendar.data).filter((event) => {
      const folded = foldQuestion(own(event, "summary"));
      return AJOOP_OWNER_JOB_KEYWORDS.some((keyword) => hasPhrase(folded, keyword));
    });
    const incomplete = own(calendar.data, "truncated") === true;
    claims.sources.calendar = { available: true, count: related.length };
    claims.complete &&= !incomplete;
    lines.push(`- ${locale === "tr" ? "Takvim" : "Calendar"}: ${related.length} ${locale === "tr" ? "ilgili etkinlik" : "related event(s)"}${related.length ? ":" : "."}`);
    for (const event of related.slice(0, 5)) lines.push(`  ${eventLine(event, timeZone, locale, true)}`);
  }
  const anyAvailable = Object.values(claims.sources).some((source) => source.available);
  const heading = locale === "tr" ? `${windowLabel(plan.window, "tr")} iş başvuruları özeti:` : `Job applications, ${windowLabel(plan.window, "en")}:`;
  const scope = locale === "tr"
    ? "Bu özet yalnızca Gmail ve Takvim verisine dayanır; ayrı bir başvuru takip kaydı yok."
    : "This summary uses only Gmail and Calendar data; there is no separate application tracker.";
  return {
    answered: anyAvailable,
    claims,
    answer: `${heading}\n${lines.join("\n")}\n${scope}${claims.complete ? "" : partialNote(locale)}`,
  };
};

const COMPOSERS = freeze({
  [I.GMAIL_SENDER_LOOKUP]: composeGmail,
  [I.GMAIL_RECENT_INBOX]: composeGmail,
  [I.CALENDAR_AGENDA]: composeCalendar,
  [I.GITHUB_PR_STATUS]: composeGitHubStatus,
  [I.GITHUB_OPEN_PRS]: composeGitHubOpen,
  [I.DRIVE_FILE_DISCOVERY]: composeDriveDiscovery,
  [I.DRIVE_FILE_READ]: composeDriveRead,
  [I.JOB_APPLICATION_STATUS]: composeJobApplications,
});

/* ------------------------------------------------------------------ observer */

const safeKey = (value, allowed) => (typeof value === "string" && allowed.has(value) ? value : "unknown");
const safeCode = (value) => (typeof value === "string" && /^[a-z0-9:-]{2,60}$/.test(value) ? value : "unknown");

/** Only bounded metadata is ever emitted: no question, content, recipient, query or token. */
const makeEmitter = (observe) => (event) => {
  if (typeof observe !== "function") return;
  let payload;
  if (event.event === "connector-read") {
    payload = {
      event: "connector-read",
      connector: safeKey(event.connector, new Set(Object.keys(EXECUTORS))),
      toolId: safeKey(event.toolId, KNOWN_TOOL_IDS),
      outcome: safeCode(event.outcome),
      latencyMs: Number.isFinite(event.latencyMs) && event.latencyMs >= 0 ? Math.round(event.latencyMs) : 0,
    };
  } else if (event.event === "action") {
    payload = {
      event: "action",
      actionType: safeKey(event.actionType, KNOWN_ACTION_TYPES),
      tier: Number.isInteger(event.tier) ? event.tier : null,
      decision: safeCode(event.decision),
    };
  } else {
    payload = {
      event: "workflow",
      route: safeKey(event.route, KNOWN_ROUTES),
      intent: event.intent ? safeKey(event.intent, KNOWN_INTENTS) : null,
      outcome: safeCode(event.outcome),
      toolCalls: Number.isInteger(event.toolCalls) ? event.toolCalls : 0,
    };
  }
  try {
    observe(freeze(payload));
  } catch {
    // Observers can never break or alter a workflow.
  }
};

/* ------------------------------------------------------------------ workflows */

const CLARIFICATIONS = {
  tr: {
    repository: "Hangi repository? (ör. sahip/repo)",
    "pr-number": "Geçerli bir PR numarası gerekli.",
    sender: "Kimden gelen dönüşü kontrol edeyim?",
    "ambiguous-sender": "Hangi gönderenden gelen dönüşü kontrol edeyim?",
    file: "Hangi Drive dosyası? Dosyanın Drive bağlantısını paylaşır mısın?",
    "search-term": "Drive'da hangi dosyayı arayayım?",
  },
  en: {
    repository: "Which repository? (for example owner/repo)",
    "pr-number": "A valid pull request number is required.",
    sender: "Whose reply should I check for?",
    "ambiguous-sender": "Which sender should I check for?",
    file: "Which Drive file? Please share its Drive link.",
    "search-term": "What should I search for in Drive?",
  },
};

const ACTION_NAMES = {
  "email.send": { tr: "e-posta gönderme", en: "sending email" },
  "gmail.delete_message": { tr: "e-posta silme", en: "deleting email" },
  "calendar.create_event": { tr: "takvim etkinliği oluşturma", en: "creating a calendar event" },
  "calendar.update_event": { tr: "takvim etkinliği güncelleme", en: "updating a calendar event" },
  "calendar.delete_event": { tr: "takvim etkinliği silme", en: "deleting a calendar event" },
  "github.create_issue": { tr: "GitHub issue açma", en: "opening a GitHub issue" },
  "github.merge_pull_request": { tr: "PR merge etme", en: "merging a pull request" },
  "github.comment_pull_request": { tr: "PR'a yorum yazma", en: "commenting on a pull request" },
  "drive.delete_file": { tr: "Drive dosyası silme", en: "deleting a Drive file" },
  "drive.update_file": { tr: "Drive dosyası değiştirme", en: "changing a Drive file" },
  "drive.share_file": { tr: "Drive dosyası paylaşma", en: "sharing a Drive file" },
};

const createAjoopOwnerConnectedWorkflows = ({
  isTrustedOwnerContext,
  actionContract,
  clients = {},
  timeZone,
  now = () => Date.now(),
  repositoryAliases = {},
  generate = null,
  memoryStore = null,
  observe = null,
  clock = () => performance.now(),
  readDeadlineMs = AJOOP_OWNER_WORKFLOW_READ_DEADLINE_MS,
  generationDeadlineMs = AJOOP_OWNER_WORKFLOW_GENERATION_DEADLINE_MS,
} = {}) => {
  if (typeof now !== "function" || typeof clock !== "function") throw new TypeError("AJOOP owner workflows require trusted clocks");
  if (typeof isTrustedOwnerContext !== "function" || !actionContract) throw new TypeError("AJOOP owner workflows require a private authority scope");
  // Deadlines are trusted server configuration only; they are never read from requests or environment.
  if (!isDeadline(readDeadlineMs) || !isDeadline(generationDeadlineMs)) throw new TypeError("invalid-owner-workflow-deadline");
  normalizeAjoopOwnerPolicyConfig({ now: now(), timeZone, repositoryAliases });
  if (generate !== null && typeof generate !== "function") throw new TypeError("AJOOP owner workflows generate must be a function");
  if (memoryStore !== null && typeof memoryStore?.listActive !== "function") throw new TypeError("AJOOP owner workflows memory store must be readable");
  const {
    createOwnerActionIntent,
    evaluateExecution,
    prepareAction,
  } = actionContract;
  const clientFor = (source) => own(clients, CLIENT_KEYS[source]);
  const emit = makeEmitter(observe);

  const finish = (result, plan, toolCalls = 0) => {
    emit({ event: "workflow", route: plan?.route, intent: plan?.intent ?? null, outcome: result.code, toolCalls });
    return freeze(result);
  };

  const runAction = (plan, { question, context, actionArguments, current, locale }) => {
    const minted = createOwnerActionIntent(context, question);
    if (!minted.ok) return finish({ ok: false, code: minted.code, route: plan.route, toolCalls: 0, externalCalls: 0 }, plan);
    const policy = getAjoopActionPolicy(plan.requestedActionType);
    const args = actionArguments === undefined ? {} : actionArguments;
    if (policy.preparationSupported) {
      const prepared = prepareAction({ actionType: policy.actionType, arguments: args }, { context, intent: minted.intent });
      emit({ event: "action", actionType: policy.actionType, tier: policy.tier, decision: prepared.ok ? "prepared" : prepared.code });
      const code = prepared.ok ? "action-preview-prepared" : prepared.code === "needs-clarification" ? "action-needs-clarification" : "action-invalid";
      return finish({
        ok: prepared.ok,
        code,
        route: plan.route,
        actionType: policy.actionType,
        tier: policy.tier,
        ...(prepared.ok ? { action: prepared.action } : { preparation: prepared }),
        executed: false,
        externalCalls: 0,
        toolCalls: 0,
      }, plan);
    }
    const execution = evaluateExecution(
      { actionType: policy.actionType, target: {}, arguments: {} },
      { context, intent: minted.intent, now: current },
    );
    emit({ event: "action", actionType: policy.actionType, tier: policy.tier, decision: execution.code });
    let alternative = null;
    if (policy.preparedAlternative) {
      alternative = prepareAction({ actionType: policy.preparedAlternative, arguments: args }, { context, intent: minted.intent });
    }
    const name = ACTION_NAMES[policy.actionType]?.[locale] ?? policy.actionType;
    const answer = locale === "tr"
      ? `${name.charAt(0).toUpperCase()}${name.slice(1)} A4 V1'de yürütülmez; hiçbir dış değişiklik yapılmadı.${alternative ? (alternative.ok ? " Bunun yerine yerel bir önizleme hazırlandı." : " İstersen yalnızca yerel bir önizleme hazırlayabilirim.") : ""}`
      : `${name.charAt(0).toUpperCase()}${name.slice(1)} is not executed in A4 V1; no external change was made.${alternative ? (alternative.ok ? " A local preview was prepared instead." : " I can prepare a local preview only.") : ""}`;
    return finish({
      ok: false,
      code: `action-${execution.code}`,
      route: plan.route,
      actionType: policy.actionType,
      tier: policy.tier,
      execution,
      ...(alternative ? { preparedAlternative: alternative.ok ? freeze({ ok: true, action: alternative.action }) : alternative } : {}),
      answer,
      executed: false,
      externalCalls: 0,
      toolCalls: 0,
    }, plan);
  };

  const readSources = async (plan, context) => {
    const entries = [];
    let calls = 0;
    for (const planned of plan.tools) {
      if (calls >= plan.budget) break;
      const source = planned.toolId.split(".")[0];
      const approved = evaluateAjoopConnectorRead({ toolId: planned.toolId, args: { ...planned.args } }, context);
      if (!approved.ok) {
        const result = freeze({ ok: false, toolId: planned.toolId, connector: source, provenance: CONNECTED, error: freeze({ code: "invalid-approved-request" }) });
        entries.push({ toolId: planned.toolId, result, inspected: inspectAjoopConnectorResult(planned.toolId, result) });
        continue;
      }
      calls += 1;
      const started = clock();
      let result = null;
      try {
        const outcome = await withDeadline(() => EXECUTORS[source](approved, { [CLIENT_KEYS[source]]: clientFor(source) }), readDeadlineMs);
        result = outcome === TIMED_OUT
          ? freeze({ ok: false, toolId: planned.toolId, connector: source, provenance: CONNECTED, error: freeze({ code: "provider-unavailable" }) })
          : outcome;
      } catch {
        result = null;
      }
      const inspected = inspectAjoopConnectorResult(planned.toolId, result);
      emit({ event: "connector-read", connector: source, toolId: planned.toolId, outcome: inspected.valid ? (inspected.ok ? "success" : inspected.code) : inspected.code, latencyMs: clock() - started });
      entries.push({ toolId: planned.toolId, result: inspected.valid ? result : null, inspected });
    }
    return { entries, calls };
  };

  const run = async ({ question, context, actionArguments, conversationSufficient = false } = {}) => {
    if (!isTrustedOwnerContext(context)) return ACCESS_DENIED;
    const current = now();
    let plan;
    try {
      plan = planAjoopOwnerRequest(question, { now: current, timeZone, repositoryAliases, conversationSufficient: conversationSufficient === true });
    } catch {
      return finish({ ok: false, code: "planning-failed", route: ROUTES.REJECTED, toolCalls: 0 }, null);
    }
    const locale = typeof question === "string" ? detectLocale(question) : "en";

    if (plan.route === ROUTES.REJECTED) return finish({ ok: false, code: plan.code, route: plan.route, toolCalls: 0 }, plan);
    if (plan.route === ROUTES.NO_CONNECTOR) {
      return finish({ ok: true, code: "no-connector", route: plan.route, reason: plan.reason, answer: null, toolCalls: 0 }, plan);
    }
    if (plan.route === ROUTES.NEEDS_CLARIFICATION) {
      const answer = plan.missing.map((field) => CLARIFICATIONS[locale][field]).join(" ");
      return finish({ ok: true, code: "needs-clarification", route: plan.route, intent: plan.intent, missing: plan.missing, ...(plan.reason ? { reason: plan.reason } : {}), answer, toolCalls: 0 }, plan);
    }
    if (plan.route === ROUTES.ACTION) return runAction(plan, { question: question.trim(), context, actionArguments, current, locale });

    const { entries, calls } = await readSources(plan, context);
    const composed = COMPOSERS[plan.intent](plan, entries, locale, timeZone);
    const summary = buildAjoopConnectedContext(entries.filter((entry) => entry.result).map(({ toolId, result }) => ({ toolId, result })));
    const failedSources = entries.filter((entry) => !(entry.inspected.valid && entry.inspected.ok));
    const code = !composed.answered ? "connected-source-unavailable" : failedSources.length ? "answered-with-source-failures" : "answered";
    return finish({
      ok: composed.answered,
      code,
      route: plan.route,
      intent: plan.intent,
      answer: composed.answer.slice(0, AJOOP_OWNER_WORKFLOW_MAX_ANSWER_CHARS),
      answerSource: "deterministic",
      generation: "not-used",
      evidence: freeze({
        sources: freeze(entries.map(({ toolId, inspected }) => freeze({
          source: toolId.split(".")[0],
          toolId,
          ok: inspected.valid && inspected.ok,
          code: inspected.valid && inspected.ok ? "ok" : inspected.code,
        }))),
        claims: freeze(JSON.parse(JSON.stringify(composed.claims))),
        ...(plan.window ? { window: plan.window } : {}),
      }),
      incomplete: failedSources.length > 0 || summary.incomplete === true || composed.claims.complete === false,
      toolCalls: calls,
      budget: plan.budget,
      provenance: CONNECTED,
    }, plan, calls);
  };

  return freeze({ run });
};

/**
 * High-level A4 owner runtime. Authentication is injected because production
 * owner authentication is intentionally unwired until A5. The authority
 * context and its mint remain inside this runtime closure.
 */
export function createAjoopOwnerWorkflowRuntime({ authenticateOwnerRequest, ...options } = {}) {
  if (typeof authenticateOwnerRequest !== "function") throw new TypeError("AJOOP owner runtime requires authenticateOwnerRequest");
  const trustedContexts = new WeakSet();
  const isTrustedOwnerContext = (value) => {
    try {
      return value !== null && typeof value === "object" && trustedContexts.has(value) && canUseAjoopReadConnectors(value);
    } catch {
      return false;
    }
  };
  const actionContract = createAjoopActionContract({ isTrustedOwnerContext });
  const workflows = createAjoopOwnerConnectedWorkflows({ ...options, isTrustedOwnerContext, actionContract });

  const handleOwnerRequest = async (input = {}) => {
    const authenticationProof = own(input, "authenticationProof");
    let authenticated = false;
    try {
      const outcome = await withDeadline(() => authenticateOwnerRequest(authenticationProof), options.readDeadlineMs ?? AJOOP_OWNER_WORKFLOW_READ_DEADLINE_MS);
      authenticated = outcome !== TIMED_OUT && outcome === true;
    } catch {
      authenticated = false;
    }
    if (!authenticated) return ACCESS_DENIED;
    const context = freeze({ surface: AJOOP_READ_CONNECTOR_SURFACES.OWNER_PRIVATE, authenticatedOwner: true });
    trustedContexts.add(context);
    return workflows.run({
      question: own(input, "question"),
      actionArguments: own(input, "actionArguments"),
      conversationSufficient: own(input, "conversationSufficient") === true,
      context,
    });
  };

  return freeze({ handleOwnerRequest });
}
