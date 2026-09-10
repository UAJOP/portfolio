import {
  AJOOP_READ_CONNECTOR_ACCESS,
  AJOOP_READ_CONNECTOR_PROVENANCE,
  AJOOP_READ_CONNECTOR_SCHEMA_VERSION,
  AJOOP_READ_CONNECTOR_TOOL_IDS,
} from "./ajoop-read-connector-contract.mjs";

export const AJOOP_CALENDAR_MAX_SUMMARY_CHARS = 500;
export const AJOOP_CALENDAR_MAX_LOCATION_CHARS = 1000;
export const AJOOP_CALENDAR_MAX_DESCRIPTION_CHARS = 12000;
export const AJOOP_CALENDAR_MAX_ATTENDEES = 50;
export const AJOOP_CALENDAR_MAX_RESULT_CHARS = 256000;

const MAX_PROVIDER_ID_CHARS = 240;
const MAX_PERSON_FIELD_CHARS = 500;
const MAX_TIME_ZONE_CHARS = 200;
const MAX_STATUS_CHARS = 64;
const CALENDAR_TOOL_IDS = new Set([
  AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_LIST_EVENTS,
  AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_READ_EVENT,
]);
const UNSAFE_DISPLAY_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const freeze = (value) => Object.freeze(value);

const failure = (code, toolId = null) => freeze({
  ok: false,
  toolId,
  connector: "calendar",
  provenance: AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE,
  error: freeze({ code }),
});

const success = (toolId, data) => freeze({
  ok: true,
  toolId,
  connector: "calendar",
  provenance: AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE,
  data: freeze(data),
});

const isPlainObject = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
};

const ownDataValue = (source, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value")) return undefined;
  return descriptor.value;
};

const isProviderId = (value) => (
  typeof value === "string" && value.length > 0 && value.length <= MAX_PROVIDER_ID_CHARS && /^[A-Za-z0-9._~+=@-]+$/.test(value)
);

const isRealDate = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const parseRfc3339 = (value) => {
  if (typeof value !== "string") return null;
  const match = RFC3339.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone, offsetHourText, offsetMinuteText] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  if (!isRealDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
  if (zone !== "Z" && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
};

const isCanonicalUtc = (value) => CANONICAL_UTC.test(value) && parseRfc3339(value) === value;

const validateApprovedRequest = (approved) => {
  try {
    if (!isPlainObject(approved) || ownDataValue(approved, "ok") !== true || ownDataValue(approved, "code") !== "accepted") return null;
    const request = ownDataValue(approved, "request");
    if (!isPlainObject(request)) return null;
    if (
      ownDataValue(request, "version") !== AJOOP_READ_CONNECTOR_SCHEMA_VERSION ||
      ownDataValue(request, "connector") !== "calendar" ||
      ownDataValue(request, "access") !== AJOOP_READ_CONNECTOR_ACCESS.READ_ONLY ||
      ownDataValue(request, "provenance") !== AJOOP_READ_CONNECTOR_PROVENANCE.CONNECTED_SOURCE
    ) return null;

    const toolId = ownDataValue(request, "toolId");
    const operation = ownDataValue(request, "operation");
    const args = ownDataValue(request, "args");
    if (!CALENDAR_TOOL_IDS.has(toolId) || !isPlainObject(args)) return null;

    if (toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_LIST_EVENTS) {
      const timeMin = ownDataValue(args, "timeMin");
      const timeMax = ownDataValue(args, "timeMax");
      const limit = ownDataValue(args, "limit");
      if (
        operation !== "list_events" || !isCanonicalUtc(timeMin) || !isCanonicalUtc(timeMax) ||
        Date.parse(timeMax) <= Date.parse(timeMin) || !Number.isInteger(limit) || limit < 1 || limit > 100
      ) return null;
      return freeze({ toolId, args: freeze({ timeMin, timeMax, limit }) });
    }

    const eventId = ownDataValue(args, "eventId");
    if (operation !== "read_event" || !isProviderId(eventId)) return null;
    return freeze({ toolId, args: freeze({ eventId }) });
  } catch {
    return null;
  }
};

const boundedText = (value, maxChars, { collapseWhitespace = false } = {}) => {
  if (typeof value !== "string") return { text: "", truncated: false };
  let text = value.replace(UNSAFE_DISPLAY_TEXT, " ").replace(/\r\n?/g, "\n");
  if (collapseWhitespace) text = text.replace(/[\t\n ]+/g, " ").trim();
  else text = text.trim();
  const truncated = text.length > maxChars;
  return { text: truncated ? text.slice(0, maxChars) : text, truncated };
};

const normalizeEventTime = (value) => {
  if (!isPlainObject(value)) throw new Error("invalid-provider-event-time");
  const date = ownDataValue(value, "date");
  const dateTime = ownDataValue(value, "dateTime");
  const timeZoneValue = ownDataValue(value, "timeZone");
  if (typeof date === "string" && dateTime === undefined) {
    const match = DATE_ONLY.exec(date);
    if (!match || !isRealDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
      throw new Error("invalid-provider-event-time");
    }
    return { value: freeze({ kind: "date", date }), truncated: false };
  }
  if (typeof dateTime !== "string" || date !== undefined) throw new Error("invalid-provider-event-time");
  const normalized = parseRfc3339(dateTime);
  if (!normalized) throw new Error("invalid-provider-event-time");
  const timeZone = boundedText(timeZoneValue, MAX_TIME_ZONE_CHARS, { collapseWhitespace: true });
  return {
    value: freeze({ kind: "date-time", dateTime: normalized, ...(timeZone.text ? { timeZone: timeZone.text } : {}) }),
    truncated: timeZone.truncated,
  };
};

const normalizePerson = (person) => {
  if (!isPlainObject(person)) return { value: null, truncated: false };
  const email = boundedText(ownDataValue(person, "email"), MAX_PERSON_FIELD_CHARS, { collapseWhitespace: true });
  const displayName = boundedText(ownDataValue(person, "displayName"), MAX_PERSON_FIELD_CHARS, { collapseWhitespace: true });
  if (!email.text && !displayName.text && ownDataValue(person, "self") !== true) return { value: null, truncated: email.truncated || displayName.truncated };
  return {
    value: freeze({ email: email.text, displayName: displayName.text, self: ownDataValue(person, "self") === true }),
    truncated: email.truncated || displayName.truncated,
  };
};

const normalizeAttendees = (attendees) => {
  if (attendees === undefined) return { values: freeze([]), truncated: false };
  if (!Array.isArray(attendees)) throw new Error("invalid-provider-attendees");
  const values = [];
  let truncated = attendees.length > AJOOP_CALENDAR_MAX_ATTENDEES;
  for (const attendee of attendees.slice(0, AJOOP_CALENDAR_MAX_ATTENDEES)) {
    if (!isPlainObject(attendee)) {
      truncated = true;
      continue;
    }
    const person = normalizePerson(attendee);
    const responseStatus = boundedText(ownDataValue(attendee, "responseStatus"), MAX_STATUS_CHARS, { collapseWhitespace: true });
    if (!person.value && !responseStatus.text) {
      truncated = true;
      continue;
    }
    values.push(freeze({
      ...(person.value ?? { email: "", displayName: "", self: false }),
      responseStatus: responseStatus.text,
    }));
    truncated ||= person.truncated || responseStatus.truncated;
  }
  return { values: freeze(values), truncated };
};

const normalizeEvent = (event, expectedEventId = null) => {
  if (!isPlainObject(event)) throw new Error("invalid-provider-event");
  const eventId = ownDataValue(event, "id");
  if (!isProviderId(eventId) || (expectedEventId !== null && eventId !== expectedEventId)) throw new Error("invalid-provider-event");
  const start = normalizeEventTime(ownDataValue(event, "start"));
  const end = normalizeEventTime(ownDataValue(event, "end"));
  if (start.value.kind !== end.value.kind) throw new Error("invalid-provider-event-time");

  const summary = boundedText(ownDataValue(event, "summary"), AJOOP_CALENDAR_MAX_SUMMARY_CHARS, { collapseWhitespace: true });
  const description = boundedText(ownDataValue(event, "description"), AJOOP_CALENDAR_MAX_DESCRIPTION_CHARS);
  const location = boundedText(ownDataValue(event, "location"), AJOOP_CALENDAR_MAX_LOCATION_CHARS, { collapseWhitespace: true });
  const status = boundedText(ownDataValue(event, "status"), MAX_STATUS_CHARS, { collapseWhitespace: true });
  const organizer = normalizePerson(ownDataValue(event, "organizer"));
  const attendees = normalizeAttendees(ownDataValue(event, "attendees"));
  const recurringEventIdValue = ownDataValue(event, "recurringEventId");
  const recurringEventId = recurringEventIdValue === undefined ? null : (isProviderId(recurringEventIdValue) ? recurringEventIdValue : null);
  const originalStartValue = ownDataValue(event, "originalStartTime");
  let originalStart = null;
  let optionalMetadataTruncated = recurringEventIdValue !== undefined && recurringEventId === null;
  if (originalStartValue !== undefined) {
    try {
      originalStart = normalizeEventTime(originalStartValue);
      if (originalStart.value.kind !== start.value.kind) throw new Error("invalid-provider-event-time");
      optionalMetadataTruncated ||= originalStart.truncated;
    } catch {
      optionalMetadataTruncated = true;
      originalStart = null;
    }
  }
  const truncated = [summary, description, location, status, organizer, attendees, start, end].some((field) => field.truncated) || optionalMetadataTruncated;
  return freeze({
    eventId,
    status: status.text,
    summary: summary.text,
    description: description.text,
    location: location.text,
    start: start.value,
    end: end.value,
    allDay: start.value.kind === "date",
    organizer: organizer.value,
    attendees: attendees.values,
    recurringEventId,
    originalStartTime: originalStart?.value ?? null,
    truncated,
  });
};

const hasRateLimitReason = (response) => {
  try {
    const data = response && typeof response === "object" ? ownDataValue(response, "data") : undefined;
    const providerError = isPlainObject(data) ? ownDataValue(data, "error") : undefined;
    const errors = isPlainObject(providerError) ? ownDataValue(providerError, "errors") : undefined;
    const rateLimitedReasons = new Set(["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded"]);
    return Array.isArray(errors) && errors.some((entry) => isPlainObject(entry) && rateLimitedReasons.has(ownDataValue(entry, "reason")));
  } catch {
    return false;
  }
};

const mapProviderError = (error) => {
  try {
    const response = error && typeof error === "object" ? ownDataValue(error, "response") : undefined;
    const responseStatus = response && typeof response === "object" ? ownDataValue(response, "status") : undefined;
    const status = Number(responseStatus ?? ownDataValue(error, "status") ?? ownDataValue(error, "code"));
    if (status === 401) return "provider-auth-expired";
    if (status === 403) return hasRateLimitReason(response) ? "provider-rate-limited" : "provider-permission-denied";
    if (status === 404) return "provider-not-found";
    if (status === 429) return "provider-rate-limited";
  } catch {
    // Hostile provider errors are sanitized as unavailable.
  }
  return "provider-unavailable";
};

const isInvalidProviderPayloadError = (error) => {
  try { return typeof error?.message === "string" && error.message.startsWith("invalid-provider"); } catch { return false; }
};

const ensureClient = (calendarClient) => {
  if (!calendarClient || typeof calendarClient.listEvents !== "function" || typeof calendarClient.readEvent !== "function") {
    return "provider-auth-required";
  }
  return null;
};

const fitEvents = (events, makeData) => {
  const fitted = [];
  for (const event of events) {
    const candidate = [...fitted, event];
    if (JSON.stringify(makeData(candidate)).length > AJOOP_CALENDAR_MAX_RESULT_CHARS) break;
    fitted.push(event);
  }
  return fitted;
};

const executeList = async (request, calendarClient) => {
  const providerResult = await calendarClient.listEvents(request.args);
  if (!isPlainObject(providerResult)) throw new Error("invalid-provider-response");
  const providerEvents = ownDataValue(providerResult, "events");
  const hasMore = ownDataValue(providerResult, "hasMore");
  if (!Array.isArray(providerEvents) || typeof hasMore !== "boolean") throw new Error("invalid-provider-response");
  const selected = providerEvents.slice(0, request.args.limit);
  const normalized = selected.map((event) => normalizeEvent(event));
  const makeData = (events) => ({
    events,
    resultCount: events.length,
    truncated: hasMore || events.length < providerEvents.length || events.some((event) => event.truncated),
    omittedEventCount: hasMore ? null : Math.max(0, providerEvents.length - events.length),
  });
  const fitted = fitEvents(normalized, makeData);
  return success(request.toolId, {
    events: freeze(fitted),
    resultCount: fitted.length,
    truncated: hasMore || fitted.length < providerEvents.length || normalized.some((event) => event.truncated),
    omittedEventCount: hasMore ? null : Math.max(0, providerEvents.length - fitted.length),
  });
};

const executeRead = async (request, calendarClient) => {
  const event = normalizeEvent(await calendarClient.readEvent({ eventId: request.args.eventId }), request.args.eventId);
  if (JSON.stringify(event).length > AJOOP_CALENDAR_MAX_RESULT_CHARS) throw new Error("invalid-provider-response");
  return success(request.toolId, event);
};

export async function executeAjoopCalendarRead(approved, options = {}) {
  const request = validateApprovedRequest(approved);
  if (!request) return failure("invalid-approved-request");
  try {
    const calendarClient = isPlainObject(options) ? ownDataValue(options, "calendarClient") : null;
    const clientError = ensureClient(calendarClient);
    if (clientError) return failure(clientError, request.toolId);
    if (request.toolId === AJOOP_READ_CONNECTOR_TOOL_IDS.CALENDAR_LIST_EVENTS) return await executeList(request, calendarClient);
    return await executeRead(request, calendarClient);
  } catch (error) {
    if (isInvalidProviderPayloadError(error)) return failure("provider-response-invalid", request.toolId);
    return failure(mapProviderError(error), request.toolId);
  }
}
