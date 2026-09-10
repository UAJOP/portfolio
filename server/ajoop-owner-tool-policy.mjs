/**
 * AJOOP A4.3 owner tool-selection policy: deterministic, pure, no I/O.
 *
 * Being allowed to read a connector is never a reason to. A connector is
 * planned only when the owner's question needs current personal external
 * state, and every A4.1 suppressor (canonical fact, portfolio, conversation)
 * is evaluated first. Plans carry explicit A4.1 tool requests, a bounded
 * budget, and never an invented target: a missing repository, sender, file or
 * search term produces `needs-clarification`, not a guess.
 *
 * Imperative action requests are classified here too, but only from the
 * owner's own question text. Nothing in this module reads connected content,
 * memory or portfolio records, so none of them can create an action intent.
 */
import { foldQuestion, hasPhrase, tokenize } from "./ajoop-text.mjs";
import { mentionsPortfolioOwner } from "./ajoop-entities.mjs";
import {
  AJOOP_READ_CONNECTOR_MAX_PR_NUMBER,
  AJOOP_READ_CONNECTOR_SURFACES,
  AJOOP_READ_CONNECTOR_TOOL_IDS as T,
  evaluateAjoopConnectorRead,
  shouldUseAjoopReadConnector,
} from "./ajoop-read-connector-contract.mjs";
import { AJOOP_OWNER_UNSAFE_MULTILINE_TEXT } from "./ajoop-owner-context.mjs";

export const AJOOP_OWNER_MAX_QUESTION_CHARS = 1200;
export const AJOOP_OWNER_TOOL_BUDGETS = Object.freeze({ SINGLE_SOURCE: 2, MULTI_SOURCE: 4 });
export const AJOOP_OWNER_GMAIL_LOOKBACK_DAYS = 90;

export const AJOOP_OWNER_ROUTES = Object.freeze({
  CONNECTED_READ: "connected-read",
  NO_CONNECTOR: "no-connector",
  ACTION: "action",
  NEEDS_CLARIFICATION: "needs-clarification",
  REJECTED: "rejected",
});

export const AJOOP_OWNER_INTENTS = Object.freeze({
  GMAIL_SENDER_LOOKUP: "gmail-sender-lookup",
  GMAIL_RECENT_INBOX: "gmail-recent-inbox",
  CALENDAR_AGENDA: "calendar-agenda",
  GITHUB_PR_STATUS: "github-pr-status",
  GITHUB_OPEN_PRS: "github-open-prs",
  DRIVE_FILE_DISCOVERY: "drive-file-discovery",
  DRIVE_FILE_READ: "drive-file-read",
  JOB_APPLICATION_STATUS: "job-application-status",
});

export const AJOOP_OWNER_NO_CONNECTOR_REASONS = Object.freeze({
  GENERAL: "general",
  PORTFOLIO: "portfolio",
  CANONICAL_FACT: "canonical-fact",
  CONVERSATION: "conversation",
});

const I = AJOOP_OWNER_INTENTS;
const ROUTES = AJOOP_OWNER_ROUTES;
const VALIDATION_CONTEXT = Object.freeze({ surface: AJOOP_READ_CONNECTOR_SURFACES.OWNER_PRIVATE, authenticatedOwner: true });
const DAY_MS = 24 * 60 * 60 * 1000;
const freeze = (value) => Object.freeze(value);
const anyPhrase = (folded, phrases) => phrases.some((phrase) => hasPhrase(folded, phrase));
const anyToken = (tokens, words) => tokens.some((token) => words.includes(token));
const ENTITY = /^[\p{L}\p{N}][\p{L}\p{N}&._-]{0,59}$/u;
const ALIAS = /^[a-z0-9][a-z0-9-]{1,39}$/;

/* ------------------------------------------------------------------ actions */

const MAIL_NOUNS = ["mail", "mailler", "email", "e posta", "eposta", "mesaj", "message", "cevap", "yanit", "reply"];
const CALENDAR_ACTION_NOUNS = ["toplanti", "meeting", "etkinlik", "event", "randevu", "appointment", "takvim", "calendar", "gorusme", "davet", "invite"];
const ISSUE_NOUNS = ["issue", "sorun kaydi"];
const PR_NOUNS = ["pr", "pull request", "pull requests", "pullrequest"];
const FILE_ACTION_NOUNS = ["dosya", "file", "belge", "dokuman", "document", "cv", "ozgecmis", "resume", "drive", "sunum", "presentation"];

// "reply" is deliberately absent: "Did Zaigo reply?" is a read. Only a leading imperative "reply" is a send request.
const SEND_VERBS = ["gonder", "gonderin", "gondersene", "gonderir", "gonderebilir", "gonderelim", "yolla", "yollar", "yollayabilir", "ilet", "iletir", "iletebilir", "cevapla", "yanitla", "send", "forward"];
const IMPERATIVE_SEND_OPENERS = ["reply", "send", "forward"];
const opensWithImperative = (tokens, verbs) => verbs.includes(tokens[0] === "please" ? tokens[1] : tokens[0]);
const PREPARE_VERBS = ["hazirla", "hazirlar", "hazirlayabilir", "hazirlayin", "taslak", "taslagi", "taslagini", "draft", "prepare", "compose", "yaz", "yazar", "yazabilir", "write"];
const CREATE_VERBS = ["olustur", "olusturur", "olusturabilir", "olusturalim", "ekle", "ekler", "ekleyebilir", "ayarla", "ayarlar", "kur", "planla", "ac", "acar", "acabilir", "acalim", "create", "schedule", "add", "book", "open", "file"];
const DELETE_VERBS = ["sil", "siler", "silebilir", "silelim", "kaldir", "kaldirir", "iptal", "delete", "remove", "trash", "cancel"];
const UPDATE_VERBS = ["guncelle", "gunceller", "degistir", "degistirir", "ertele", "erteler", "tasi", "tasir", "duzenle", "update", "reschedule", "move", "edit", "rename"];
const SHARE_VERBS = ["paylas", "paylasir", "yukle", "yukler", "share", "upload"];
const MERGE_STATUS_FOLLOWERS = ["edildi", "edilmis", "edilmedi", "edilmemis", "oldu", "olmus", "olmadi", "olmamis", "durumu", "mi", "mu", "status"];

const action = (requestedActionType, preparedActionType = null) => freeze({ requestedActionType, preparedActionType });

const hasMergeRequest = (tokens) => {
  if (anyToken(tokens, ["birlestir", "birlestirir", "birlestirebilir"])) return true;
  const index = tokens.indexOf("merge");
  return index >= 0 && !MERGE_STATUS_FOLLOWERS.includes(tokens[index + 1]);
};

/**
 * Classify an imperative owner action request, or return null.
 * The input must be the owner's current question; callers never pass connected content.
 */
export function classifyAjoopOwnerAction(question) {
  if (typeof question !== "string") return null;
  const folded = foldQuestion(question);
  const tokens = tokenize(folded);
  const mail = anyPhrase(folded, MAIL_NOUNS);
  const calendar = anyPhrase(folded, CALENDAR_ACTION_NOUNS);
  const issue = anyPhrase(folded, ISSUE_NOUNS);
  const pr = anyPhrase(folded, PR_NOUNS);
  const file = anyPhrase(folded, FILE_ACTION_NOUNS);

  const sendRequested = anyToken(tokens, SEND_VERBS) || opensWithImperative(tokens, IMPERATIVE_SEND_OPENERS);
  if ((mail && sendRequested) || opensWithImperative(tokens, ["reply"])) return action("email.send", "email.prepare_draft");
  if (mail && anyToken(tokens, PREPARE_VERBS)) return action("email.prepare_draft");
  if (mail && anyToken(tokens, DELETE_VERBS)) return action("gmail.delete_message");
  if (calendar && anyToken(tokens, DELETE_VERBS)) return action("calendar.delete_event");
  if (calendar && anyToken(tokens, UPDATE_VERBS)) return action("calendar.update_event");
  if (calendar && anyToken(tokens, PREPARE_VERBS)) return action("calendar.prepare_event");
  if (calendar && anyToken(tokens, CREATE_VERBS)) return action("calendar.create_event", "calendar.prepare_event");
  if (issue && anyToken(tokens, PREPARE_VERBS)) return action("github.prepare_issue");
  if (issue && anyToken(tokens, CREATE_VERBS)) return action("github.create_issue", "github.prepare_issue");
  if (pr && hasMergeRequest(tokens)) return action("github.merge_pull_request");
  if (pr && (anyToken(tokens, ["comment"]) || (anyToken(tokens, ["yorum"]) && anyToken(tokens, ["yap", "ekle", "birak", "yaz"])))) {
    return action("github.comment_pull_request");
  }
  if (file && anyToken(tokens, DELETE_VERBS)) return action("drive.delete_file");
  if (file && anyToken(tokens, SHARE_VERBS)) return action("drive.share_file");
  if (file && anyToken(tokens, UPDATE_VERBS)) return action("drive.update_file");
  return null;
}

/* ------------------------------------------------------------------ config */

const isValidTimeZone = (value) => {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const isRepository = (value) => {
  const evaluated = evaluateAjoopConnectorRead(
    { toolId: T.GITHUB_SEARCH_PULL_REQUESTS, args: { repository: value, limit: 1 } },
    VALIDATION_CONTEXT,
  );
  return evaluated.ok && evaluated.request.args.repository === value;
};

/** Validate trusted planner configuration. Throws on programmer error; never reads requests. */
export function normalizeAjoopOwnerPolicyConfig({ now, timeZone, repositoryAliases = {} } = {}) {
  if (!Number.isFinite(now)) throw new TypeError("invalid-owner-policy-clock");
  if (!isValidTimeZone(timeZone)) throw new TypeError("invalid-owner-policy-time-zone");
  if (repositoryAliases === null || typeof repositoryAliases !== "object" || Array.isArray(repositoryAliases)) {
    throw new TypeError("invalid-owner-policy-repository-aliases");
  }
  const aliases = {};
  for (const [alias, repository] of Object.entries(repositoryAliases)) {
    if (!ALIAS.test(alias) || !isRepository(repository)) throw new TypeError("invalid-owner-policy-repository-aliases");
    aliases[alias] = repository;
  }
  return freeze({ now, timeZone, repositoryAliases: freeze(aliases) });
}

/* ------------------------------------------------------------------ time windows */

const zonedParts = (milliseconds, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(milliseconds));
  const read = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
  };
};

const zoneOffset = (milliseconds, timeZone) => {
  const parts = zonedParts(milliseconds, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - (milliseconds - (((milliseconds % 1000) + 1000) % 1000));
};

/** UTC instant of local midnight for a civil date in the time zone, DST-safe. */
const localMidnight = (year, month, day, timeZone) => {
  const guess = Date.UTC(year, month - 1, day);
  let instant = guess - zoneOffset(guess, timeZone);
  const corrected = zoneOffset(instant, timeZone);
  if (corrected !== guess - instant) instant = guess - corrected;
  return instant;
};

const civilDate = (year, month, day, addDays = 0) => {
  const date = new Date(Date.UTC(year, month - 1, day + addDays));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() };
};

const isoDate = ({ year, month, day }) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const buildWindow = (config, startOffsetDays, lengthDays, label) => {
  const today = zonedParts(config.now, config.timeZone);
  const start = civilDate(today.year, today.month, today.day, startOffsetDays);
  const end = civilDate(start.year, start.month, start.day, lengthDays);
  return freeze({
    label,
    timeZone: config.timeZone,
    startDate: isoDate(start),
    endDateExclusive: isoDate(end),
    timeMin: new Date(localMidnight(start.year, start.month, start.day, config.timeZone)).toISOString(),
    timeMax: new Date(localMidnight(end.year, end.month, end.day, config.timeZone)).toISOString(),
  });
};

const WEEKDAYS = [
  ["pazartesi", 1], ["monday", 1], ["sali", 2], ["tuesday", 2], ["carsamba", 3], ["wednesday", 3],
  ["persembe", 4], ["thursday", 4], ["cumartesi", 6], ["saturday", 6], ["cuma", 5], ["friday", 5],
  ["pazar", 0], ["sunday", 0],
];

const detectDayReference = (folded) => {
  if (anyPhrase(folded, ["gelecek hafta", "onumuzdeki hafta", "haftaya", "next week"])) return { kind: "week", weeks: 1, label: "next-week" };
  if (anyPhrase(folded, ["bu hafta", "this week"])) return { kind: "week", weeks: 0, label: "this-week" };
  if (anyPhrase(folded, ["bugun", "today"])) return { kind: "offset", days: 0, label: "today" };
  if (anyPhrase(folded, ["yarin", "tomorrow"])) return { kind: "offset", days: 1, label: "tomorrow" };
  for (const [word, weekday] of WEEKDAYS) {
    if (hasPhrase(folded, word)) return { kind: "weekday", weekday, label: word };
  }
  return null;
};

const windowFor = (config, reference, fallbackDays = 7) => {
  const today = zonedParts(config.now, config.timeZone);
  const todayWeekday = civilDate(today.year, today.month, today.day).weekday;
  if (!reference) return buildWindow(config, 0, fallbackDays, "next-7-days");
  if (reference.kind === "offset") return buildWindow(config, reference.days, 1, reference.label);
  if (reference.kind === "weekday") return buildWindow(config, (reference.weekday - todayWeekday + 7) % 7, 1, reference.label);
  const mondayOffset = (todayWeekday + 6) % 7;
  return buildWindow(config, 7 * reference.weeks - mondayOffset, 7, reference.label);
};

/* ------------------------------------------------------------------ read intents */

const tool = (toolId, args) => freeze({ toolId, args: freeze(args) });

const JOB_SIGNALS = ["is basvuru", "is basvurular", "basvuru", "basvurular", "basvurum", "job application", "job applications", "application", "applications", "mulakat", "mulakatlar", "interview", "interviews", "recruiter"];
const STATUS_SIGNALS = ["nerede kaldik", "nerede kaldim", "ne durumda", "son durum", "durum", "durumu", "where are we", "where do we stand", "status", "update", "neler oldu", "what happened", "ozet", "summary"];
export const AJOOP_OWNER_JOB_KEYWORDS = Object.freeze(["basvuru", "application", "mulakat", "interview", "recruiter", "gorusme", "offer", "teklif"]);

const detectJobApplications = (folded, config) => {
  if (!anyPhrase(folded, JOB_SIGNALS) || !anyPhrase(folded, STATUS_SIGNALS)) return null;
  const reference = detectDayReference(folded);
  const window = windowFor(config, reference?.kind === "week" ? reference : { kind: "week", weeks: 0, label: "this-week" });
  return {
    intent: I.JOB_APPLICATION_STATUS,
    sources: ["gmail", "calendar"],
    window,
    tools: [
      tool(T.GMAIL_SEARCH_MESSAGES, { query: "newer_than:7d (başvuru OR basvuru OR application OR mülakat OR interview OR recruiter OR offer)", limit: 20 }),
      tool(T.CALENDAR_LIST_EVENTS, { timeMin: window.timeMin, timeMax: window.timeMax, limit: 50 }),
    ],
  };
};

const PR_NUMBER_PATTERNS = [
  /(?:^| )(?:pr|pull request|pull requests|pullrequest)(?: numarali| no| number)? ?#? ?(\d{1,7})(?!\d)/,
  /(?:^| )#(\d{1,7}) (?:numarali )?(?:pr|pull request)/,
];
const EXPLICIT_REPOSITORY = /(?:^|[\s(])([A-Za-z0-9](?:-?[A-Za-z0-9]){0,38}\/[A-Za-z0-9._-]{1,100})(?=$|[\s),?!]|[.'’](?:\s|$))/;

const resolveRepository = (question, folded, config) => {
  const explicit = EXPLICIT_REPOSITORY.exec(question)?.[1];
  if (explicit) return isRepository(explicit) ? { repository: explicit } : { missing: "repository" };
  const matched = [...new Set(Object.entries(config.repositoryAliases)
    .filter(([alias]) => hasPhrase(folded, alias))
    .map(([, repository]) => repository))];
  return matched.length === 1 ? { repository: matched[0] } : { missing: "repository" };
};

const detectGitHub = (question, folded, config) => {
  const number = PR_NUMBER_PATTERNS.map((pattern) => pattern.exec(folded)?.[1]).find(Boolean);
  const mentionsPr = anyPhrase(folded, PR_NOUNS);
  if (!number && !(mentionsPr && anyPhrase(folded, ["acik", "open", "bekleyen", "pending", ...STATUS_SIGNALS]))) return null;
  const target = resolveRepository(question, folded, config);
  if (number) {
    const prNumber = Number(number);
    const missing = [target.missing, prNumber >= 1 && prNumber <= AJOOP_READ_CONNECTOR_MAX_PR_NUMBER ? null : "pr-number"].filter(Boolean);
    if (missing.length) return { intent: I.GITHUB_PR_STATUS, sources: ["github"], missing };
    return { intent: I.GITHUB_PR_STATUS, sources: ["github"], tools: [tool(T.GITHUB_READ_PULL_REQUEST, { repository: target.repository, prNumber })] };
  }
  if (target.missing) return { intent: I.GITHUB_OPEN_PRS, sources: ["github"], missing: [target.missing] };
  return { intent: I.GITHUB_OPEN_PRS, sources: ["github"], tools: [tool(T.GITHUB_SEARCH_PULL_REQUESTS, { repository: target.repository, state: "open", limit: 10 })] };
};

const DRIVE_SIGNALS = ["drive", "google drive"];
const FILE_NOUNS = ["dosya", "belge", "dokuman", "document", "documents", "file", "files", "cv", "ozgecmis", "resume", "sunum", "presentation", "spreadsheet"];
const CV_WORDS = ["cv", "ozgecmis", "resume"];
const DISCOVERY_SIGNALS = ["son", "en son", "latest", "newest", "most recent", "recent", "hangisi", "hangi", "bul", "find", "nerede", "where", "degistirdigim", "duzenledigim", "listele", "list", "goster", "show"];
const READ_SIGNALS = ["icinde ne", "ne yaziyor", "icerigi", "icerik", "oku", "read", "contents", "content", "what does"];
const DRIVE_URL = /https:\/\/(?:drive|docs)\.google\.com\/(?:open\?id=|file\/d\/|document\/d\/|spreadsheets\/d\/|presentation\/d\/)([A-Za-z0-9_-]{10,200})/;
const DRIVE_STOP_WORDS = new Set([
  "drive", "google", "son", "en", "hangisi", "hangi", "bul", "bulur", "musun", "misin", "find", "latest", "newest", "most", "recent",
  "the", "my", "a", "an", "of", "in", "on", "ile", "ilgili", "about", "related", "to", "for", "benim", "nerede", "where", "is", "which",
  "what", "ne", "mi", "mu", "degistirdigim", "duzenledigim", "listele", "list", "goster", "show", "and", "ve", "icin", "tum", "butun",
  "all", "bana", "me", "file", "files", "document", "documents",
]);

const driveSearchTerm = (question) => {
  const kept = [];
  let cv = false;
  for (const word of question.split(/\s+/)) {
    const stem = word.replace(/^[("'“”‘’]+/, "").split(/['’]/)[0].replace(/[?.!,;:)"“”]+$/, "");
    const folded = foldQuestion(stem);
    if (!folded || DRIVE_STOP_WORDS.has(folded)) continue;
    if (CV_WORDS.some((cvWord) => hasPhrase(folded, cvWord))) {
      cv = true;
      continue;
    }
    if (FILE_NOUNS.some((noun) => hasPhrase(folded, noun))) continue;
    if (ENTITY.test(stem)) kept.push(stem);
  }
  return [...(cv ? ["CV"] : []), ...kept].slice(0, 4).join(" ");
};

const detectDrive = (question, folded) => {
  const fileId = DRIVE_URL.exec(question)?.[1];
  const drive = anyPhrase(folded, DRIVE_SIGNALS);
  const file = anyPhrase(folded, FILE_NOUNS);
  if (fileId) return { intent: I.DRIVE_FILE_READ, sources: ["drive"], tools: [tool(T.DRIVE_READ_FILE, { fileId })] };
  if ((drive || file) && anyPhrase(folded, READ_SIGNALS)) return { intent: I.DRIVE_FILE_READ, sources: ["drive"], missing: ["file"] };
  if (!drive && !(file && anyPhrase(folded, DISCOVERY_SIGNALS))) return null;
  const query = driveSearchTerm(question);
  if (!query) return { intent: I.DRIVE_FILE_DISCOVERY, sources: ["drive"], missing: ["search-term"] };
  return { intent: I.DRIVE_FILE_DISCOVERY, sources: ["drive"], searchTerm: query, tools: [tool(T.DRIVE_SEARCH_FILES, { query, limit: 10 })] };
};

const STRONG_CALENDAR_NOUNS = ["takvim", "calendar", "ajanda", "randevu", "toplanti"];
const WEAK_CALENDAR_NOUNS = ["meeting", "meetings", "event", "events", "etkinlik", "appointment", "agenda", "gorusme"];
const AGENDA_PHRASES = ["ne var", "neler var", "planim", "planlarim", "programim", "my schedule", "what do i have", "whats on", "what is on", "am i free", "musait miyim", "bos muyum"];

const detectCalendar = (folded, config) => {
  const reference = detectDayReference(folded);
  const strong = anyPhrase(folded, STRONG_CALENDAR_NOUNS);
  const weak = anyPhrase(folded, WEAK_CALENDAR_NOUNS) && (reference || anyPhrase(folded, ["my", "benim"]));
  const agenda = anyPhrase(folded, AGENDA_PHRASES) && (reference || anyPhrase(folded, ["my schedule", "programim", "planim"]));
  if (!strong && !weak && !agenda) return null;
  const window = windowFor(config, reference);
  const limit = window.label === "next-7-days" || reference?.kind === "week" ? 50 : 25;
  return { intent: I.CALENDAR_AGENDA, sources: ["calendar"], window, tools: [tool(T.CALENDAR_LIST_EVENTS, { timeMin: window.timeMin, timeMax: window.timeMax, limit })] };
};

const MAIL_READ_NOUNS = ["mail", "mailler", "email", "emails", "e posta", "eposta", "gelen kutusu", "inbox"];
const REPLY_SIGNALS = ["donus geldi", "donus yapti", "donus yapmis", "geri donus", "geri dondu", "cevap geldi", "cevap verdi", "cevap vermis", "yanit geldi", "yanit verdi", "yazdi mi", "yazmis mi", "replied", "reply", "responded", "heard back", "wrote back", "got back", "donus", "cevap", "yanit", "geldi mi"];
const SENDER_TOKEN = "([\\p{L}\\p{N}][\\p{L}\\p{N}&.-]{0,59})";
const SENDER_ABLATIVE = new RegExp(`(?:^|\\s)${SENDER_TOKEN}['’](?:dan|den|tan|ten)(?=$|\\s|[?.!,])`, "gu");
const SENDER_FROM = /(?:^|\s)from\s+([\p{L}\p{N}][\p{L}\p{N}&.-]{0,59})(?=$|\s|[?.!,])/iu;
const NOT_A_SENDER = new Set(["ben", "sen", "o", "biz", "siz", "onlar", "kim", "nere", "bura", "sura", "ora", "hangi", "me", "you", "him", "her", "them", "who", "where"]);

const SENDER_SUBJECT = /(?:^|\s)(?:[Dd]id|[Hh]as|[Hh]ave)\s+([\p{Lu}\p{N}][\p{L}\p{N}&.-]{0,59})\s+(?:reply|replied|respond|responded|write back|written back|get back|gotten back)(?=$|\s|[?.!,])/u;

const TURKISH_COORDINATED_SENDERS = new RegExp(`(?:^|\\s)${SENDER_TOKEN}(?:['’](?:dan|den|tan|ten))?\\s+(?:veya|ve|ya\\s+da|ile)\\s+${SENDER_TOKEN}['’](?:dan|den|tan|ten)(?=$|\\s|[?.!,])`, "giu");
const ENGLISH_COORDINATED_SUBJECTS = new RegExp(`(?:^|\\s)(?:did|has|have)\\s+${SENDER_TOKEN}\\s+(?:or|and)\\s+${SENDER_TOKEN}\\s+(?:reply|replied|respond|responded|write|written|get|gotten)(?=$|\\s|[?.!,])`, "giu");
const ENGLISH_COORDINATED_FROM = new RegExp(`(?:^|\\s)from\\s+${SENDER_TOKEN}\\s+(?:or|and)\\s+${SENDER_TOKEN}(?=$|\\s|[?.!,])`, "giu");
// These shapes detect sender coordination without treating the second target
// as valid. A shape that cannot also be parsed by a strict pattern above must
// fail closed instead of silently falling back to the first safe target.
const COORDINATED_SENDER_SHAPES = [
  /(?:^|\s)\S{1,80}['’](?:dan|den|tan|ten)\s+(?:veya|ve|ya\s+da|ile)\s+\S/iu,
  /(?:^|\s)\S{1,80}\s+(?:veya|ve|ya\s+da|ile)\s+\S{1,160}['’](?:dan|den|tan|ten)(?=$|\s|[?.!,])/iu,
  /(?:^|\s)(?:did|has|have)\s+\S{1,80}\s+(?:or|and)\s+.{1,160}?\s+(?:reply|replied|respond|responded)(?=$|\s|[?.!,])/iu,
  /(?:^|\s)from\s+\S{1,80}\s+(?:or|and)\s+\S/iu,
];

const resolveSenders = (question) => {
  const candidates = [];
  const coordinatedShape = COORDINATED_SENDER_SHAPES.some((pattern) => pattern.test(question));
  let coordinatedSafe = false;
  const add = (candidate) => {
    const cleaned = candidate?.replace(/[.-]+$/, "");
    if (!cleaned || !ENTITY.test(cleaned)) return;
    const folded = foldQuestion(cleaned);
    if (NOT_A_SENDER.has(folded) || detectDayReference(folded)) return;
    if (!candidates.some((entry) => foldQuestion(entry) === folded)) candidates.push(cleaned);
  };
  for (const match of question.matchAll(SENDER_ABLATIVE)) add(match[1]);
  for (const pattern of [TURKISH_COORDINATED_SENDERS, ENGLISH_COORDINATED_SUBJECTS, ENGLISH_COORDINATED_FROM]) {
    for (const match of question.matchAll(pattern)) {
      coordinatedSafe = true;
      add(match[1]);
      add(match[2]);
    }
  }
  add(SENDER_FROM.exec(question)?.[1]);
  add(SENDER_SUBJECT.exec(question)?.[1]);
  return { candidates, coordinatedIncomplete: coordinatedShape && !coordinatedSafe };
};

const detectGmail = (question, folded, { senderSpecificOnly = false } = {}) => {
  const { candidates: senders, coordinatedIncomplete } = resolveSenders(question);
  const reply = anyPhrase(folded, REPLY_SIGNALS);
  const mail = anyPhrase(folded, MAIL_READ_NOUNS);
  if ((reply || mail) && (senders.length > 1 || coordinatedIncomplete)) {
    return { intent: I.GMAIL_SENDER_LOOKUP, sources: ["gmail"], missing: ["ambiguous-sender"], reason: "ambiguous-sender", senderCandidates: senders };
  }
  const sender = senders[0] ?? null;
  if (sender && (reply || mail)) {
    return {
      intent: I.GMAIL_SENDER_LOOKUP,
      sources: ["gmail"],
      sender,
      tools: [tool(T.GMAIL_SEARCH_MESSAGES, { query: `from:${sender} newer_than:${AJOOP_OWNER_GMAIL_LOOKBACK_DAYS}d`, limit: 10 })],
    };
  }
  if (senderSpecificOnly) return null;
  if (mail) return { intent: I.GMAIL_RECENT_INBOX, sources: ["gmail"], tools: [tool(T.GMAIL_SEARCH_MESSAGES, { query: "in:inbox newer_than:7d", limit: 10 })] };
  if (anyPhrase(folded, ["donus geldi", "cevap geldi", "yanit geldi", "heard back", "replied", "responded"])) {
    return { intent: I.GMAIL_SENDER_LOOKUP, sources: ["gmail"], missing: ["sender"] };
  }
  return null;
};

const CANONICAL_FACT_PHRASES = ["mail adresi", "e posta adresi", "eposta adresi", "email address", "e mail address", "telefon", "phone number", "linkedin", "github profili", "github adresi", "github hesabi", "web sitesi", "website"];

/* ------------------------------------------------------------------ plan */

const rejected = (code) => freeze({ route: ROUTES.REJECTED, code, requiresCurrentState: false, tools: freeze([]) });

/**
 * Deterministic owner request plan. Pure: the same question and configuration
 * always produce the same plan, and nothing is executed here.
 */
export function planAjoopOwnerRequest(question, { conversationSufficient = false, ...configInput } = {}) {
  const config = normalizeAjoopOwnerPolicyConfig(configInput);
  if (typeof question !== "string") return rejected("invalid-question");
  const trimmed = question.trim();
  if (!trimmed) return rejected("empty-question");
  if (trimmed.length > AJOOP_OWNER_MAX_QUESTION_CHARS) return rejected("question-too-long");
  if (AJOOP_OWNER_UNSAFE_MULTILINE_TEXT.test(trimmed)) return rejected("unsafe-question");

  const requested = classifyAjoopOwnerAction(trimmed);
  if (requested) return freeze({ route: ROUTES.ACTION, ...requested, requiresCurrentState: false, tools: freeze([]) });

  const folded = foldQuestion(trimmed);
  const detected = detectJobApplications(folded, config)
    ?? detectGitHub(trimmed, folded, config)
    ?? detectDrive(trimmed, folded)
    ?? detectGmail(trimmed, folded, { senderSpecificOnly: true })
    ?? detectCalendar(folded, config)
    ?? detectGmail(trimmed, folded);

  // A repository owner such as "UAJOP/portfolio" names a GitHub target, not the portfolio person.
  const withoutRepositories = trimmed.replace(new RegExp(EXPLICIT_REPOSITORY.source, "g"), " ");
  const suppressors = {
    conversationSufficient: conversationSufficient === true,
    deterministicFactAvailable: anyPhrase(folded, CANONICAL_FACT_PHRASES),
    portfolioSufficient: mentionsPortfolioOwner(withoutRepositories),
  };
  const useConnector = shouldUseAjoopReadConnector({ requiresCurrentPersonalExternalState: Boolean(detected), ...suppressors });
  if (!useConnector) {
    const reason = suppressors.conversationSufficient ? AJOOP_OWNER_NO_CONNECTOR_REASONS.CONVERSATION
      : suppressors.deterministicFactAvailable ? AJOOP_OWNER_NO_CONNECTOR_REASONS.CANONICAL_FACT
        : suppressors.portfolioSufficient ? AJOOP_OWNER_NO_CONNECTOR_REASONS.PORTFOLIO
          : AJOOP_OWNER_NO_CONNECTOR_REASONS.GENERAL;
    return freeze({ route: ROUTES.NO_CONNECTOR, reason, requiresCurrentState: false, tools: freeze([]) });
  }

  const sources = freeze([...detected.sources]);
  const budget = sources.length > 1 ? AJOOP_OWNER_TOOL_BUDGETS.MULTI_SOURCE : AJOOP_OWNER_TOOL_BUDGETS.SINGLE_SOURCE;
  const base = {
    intent: detected.intent,
    requiresCurrentState: true,
    sources,
    budget,
    ...(detected.window ? { window: detected.window } : {}),
    ...(detected.sender ? { sender: detected.sender } : {}),
    ...(detected.senderCandidates ? { senderCandidates: freeze([...detected.senderCandidates]) } : {}),
    ...(detected.searchTerm ? { searchTerm: detected.searchTerm } : {}),
    ...(detected.reason ? { reason: detected.reason } : {}),
  };
  if (detected.missing?.length) {
    return freeze({ route: ROUTES.NEEDS_CLARIFICATION, ...base, missing: freeze([...detected.missing]), tools: freeze([]) });
  }
  const tools = freeze([...detected.tools]);
  if (tools.length > budget) return rejected("tool-budget-exceeded");
  // Every planned read must already satisfy A4.1 exactly; a plan is never repaired later.
  for (const planned of tools) {
    const evaluated = evaluateAjoopConnectorRead({ toolId: planned.toolId, args: { ...planned.args } }, VALIDATION_CONTEXT);
    if (!evaluated.ok || JSON.stringify(evaluated.request.args) !== JSON.stringify(planned.args)) return rejected("plan-invalid");
  }
  return freeze({ route: ROUTES.CONNECTED_READ, ...base, tools, ...(detected.window ? {} : {}), orderedBy: tools.some((planned) => planned.toolId === T.DRIVE_SEARCH_FILES) ? "modifiedTime desc" : null });
}

export const AJOOP_OWNER_DAY_MS = DAY_MS;
