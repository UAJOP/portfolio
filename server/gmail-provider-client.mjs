import { readFile } from "node:fs/promises";
import { google } from "googleapis";

export const AJOOP_GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const readJson = async (filePath) => {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
};

export async function loadStoredGmailReadAuth({ tokenPath }) {
  if (typeof tokenPath !== "string" || !tokenPath) throw new Error("provider-auth-required");
  try {
    const credentials = await readJson(tokenPath);
    if (
      credentials?.type !== "authorized_user" ||
      credentials.scope !== AJOOP_GMAIL_READONLY_SCOPE ||
      typeof credentials.client_id !== "string" ||
      typeof credentials.client_secret !== "string" ||
      typeof credentials.refresh_token !== "string"
    ) throw new Error("provider-auth-required");
    return google.auth.fromJSON(credentials);
  } catch {
    throw new Error("provider-auth-required");
  }
}

export function createGoogleGmailReadClient({ auth }) {
  if (!auth) throw new Error("provider-auth-required");
  const gmail = google.gmail({ version: "v1", auth });

  return Object.freeze({
    async searchMessages({ query, limit }) {
      const response = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: limit,
        includeSpamTrash: false,
      });
      const data = response.data ?? {};
      const estimatedResultCount = Number.isSafeInteger(data.resultSizeEstimate) && data.resultSizeEstimate >= 0
        ? data.resultSizeEstimate
        : null;
      return Object.freeze({
        references: data.messages ?? [],
        hasMore: Boolean(data.nextPageToken),
        ...(estimatedResultCount === null ? {} : { estimatedResultCount }),
      });
    },

    async getMessageMetadata({ messageId }) {
      const response = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "metadata",
        metadataHeaders: ["From", "To", "Cc", "Subject"],
      });
      return response.data;
    },

    async readThread({ threadId }) {
      const response = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });
      return response.data;
    },
  });
}
