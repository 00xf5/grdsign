import { AuthGrantError, type TokenRefresher } from "../tokens/refresher.js";
import { fetchWithTimeoutRetry } from "../lib/fetchWithTimeout.js";
import { extractMessageBody, headerMap, type ExtractedBody } from "./parse.js";

export type GmailMessageListItem = {
  id: string;
  threadId: string;
};

export type GmailListResult = {
  messages: GmailMessageListItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailPayload = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPayload[];
  headers?: Array<{ name: string; value: string }>;
};

export type GmailMessage = {
  id: string;
  threadId: string;
  snippet: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPayload;
};

export class GmailClient {
  constructor(private refresher: TokenRefresher) {}

  async listMessages(
    userId: string,
    opts: { q?: string; maxResults?: number; pageToken?: string; labelIds?: string[] } = {},
  ): Promise<GmailListResult> {
    const params = new URLSearchParams();
    if (opts.q) params.set("q", opts.q);
    if (opts.maxResults) params.set("maxResults", String(opts.maxResults));
    if (opts.pageToken) params.set("pageToken", opts.pageToken);
    for (const id of opts.labelIds ?? []) params.append("labelIds", id);

    const path = `/gmail/v1/users/me/messages?${params.toString()}`;
    return this.request<GmailListResult>(userId, path);
  }

  async getMessage(
    userId: string,
    messageId: string,
    format: "metadata" | "full" = "metadata",
  ): Promise<GmailMessage> {
    const params = new URLSearchParams({ format });
    if (format === "metadata") {
      for (const h of ["From", "To", "Subject", "Date", "Cc", "Message-ID", "References"]) {
        params.append("metadataHeaders", h);
      }
    }
    const path = `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${params}`;
    return this.request<GmailMessage>(userId, path);
  }

  async getMessageDetail(
    userId: string,
    messageId: string,
  ): Promise<{
    message: GmailMessage;
    headers: Record<string, string>;
    body: ExtractedBody;
  }> {
    const message = await this.getMessage(userId, messageId, "full");
    return {
      message,
      headers: headerMap(message.payload?.headers),
      body: extractMessageBody(message.payload),
    };
  }

  async sendMessage(
    userId: string,
    input: { raw: string; threadId?: string },
  ): Promise<{ id: string; threadId: string; labelIds?: string[] }> {
    const body: Record<string, string> = { raw: input.raw };
    if (input.threadId) body.threadId = input.threadId;

    return this.requestJson(userId, "/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async trashMessage(
    userId: string,
    messageId: string,
  ): Promise<{ id: string; threadId: string; labelIds?: string[] }> {
    return this.requestJson(
      userId,
      `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/trash`,
      { method: "POST" },
    );
  }

  async modifyLabels(
    userId: string,
    messageId: string,
    input: { addLabelIds?: string[]; removeLabelIds?: string[] },
  ): Promise<{ id: string; threadId: string; labelIds?: string[] }> {
    return this.requestJson(
      userId,
      `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addLabelIds: input.addLabelIds ?? [],
          removeLabelIds: input.removeLabelIds ?? [],
        }),
      },
    );
  }

  private async requestJson<T>(
    userId: string,
    path: string,
    init: RequestInit,
    retried = false,
  ): Promise<T> {
    const accessToken = await this.refresher.getValidAccessToken(userId, "google", retried);

    let res: Response;
    try {
      res = await fetchWithTimeoutRetry(
        `https://gmail.googleapis.com${path}`,
        {
          ...init,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(init.headers ?? {}),
          },
        },
        20_000,
      );
    } catch (err) {
      throw new Error(
        `Gmail API unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (res.status === 401 && !retried) {
      return this.requestJson<T>(userId, path, init, true);
    }

    if (res.status === 401 || res.status === 403) {
      const text = await res.text();
      if (text.toLowerCase().includes("insufficient") || res.status === 403) {
        throw new AuthGrantError(
          "Insufficient Gmail scopes. Reconsent required.",
          "reconsent_required",
        );
      }
      throw new AuthGrantError("Gmail auth failed. Reconnect required.", "reconnect_required");
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gmail API ${res.status}: ${text.slice(0, 300)}`);
    }

    return (await res.json()) as T;
  }

  private async request<T>(userId: string, path: string, retried = false): Promise<T> {
    return this.requestJson<T>(userId, path, { method: "GET" }, retried);
  }
}
