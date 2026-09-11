import { readFile } from "node:fs/promises";
import { google } from "googleapis";

export const AJOOP_CALENDAR_EVENTS_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

export async function loadStoredCalendarReadAuth({ tokenPath }) {
  if (typeof tokenPath !== "string" || !tokenPath) throw new Error("provider-auth-required");
  try {
    const credentials = await readJson(tokenPath);
    if (
      credentials?.type !== "authorized_user" ||
      credentials.scope !== AJOOP_CALENDAR_EVENTS_READONLY_SCOPE ||
      typeof credentials.client_id !== "string" ||
      typeof credentials.client_secret !== "string" ||
      typeof credentials.refresh_token !== "string"
    ) throw new Error("provider-auth-required");
    return google.auth.fromJSON(credentials);
  } catch {
    throw new Error("provider-auth-required");
  }
}

export function createGoogleCalendarReadClient({ auth }) {
  if (!auth) throw new Error("provider-auth-required");
  const calendar = google.calendar({ version: "v3", auth });

  return Object.freeze({
    async listEvents({ timeMin, timeMax, limit }) {
      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        maxResults: limit,
        singleEvents: true,
        orderBy: "startTime",
        showDeleted: false,
      });
      const data = response.data ?? {};
      return Object.freeze({
        events: data.items ?? [],
        hasMore: Boolean(data.nextPageToken),
      });
    },

    async readEvent({ eventId }) {
      const response = await calendar.events.get({
        calendarId: "primary",
        eventId,
      });
      return response.data;
    },
  });
}
