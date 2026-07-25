import { AuthGrantError, type TokenRefresher } from "../tokens/refresher.js";
import { fetchWithTimeoutRetry } from "../lib/fetchWithTimeout.js";
import { formatMailDate, parseFrom } from "../gmail/parse.js";

export type OutlookListItem = {
  id: string;
  threadId: string;
  snippet: string;
  subject: string | null;
  from: string | null;
  fromName: string;
  fromEmail: string;
  date: string | null;
  dateLabel: string;
  unread: boolean;
  starred: boolean;
  labelIds: string[];
};

type GraphMessage = {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  receivedDateTime?: string;
  isRead?: boolean;
  flag?: { flagStatus?: string };
  internetMessageId?: string;
};

function recipientList(
  list: Array<{ emailAddress?: { name?: string; address?: string } }> | undefined,
): string | null {
  if (!list?.length) return null;
  return list
    .map((r) => {
      const name = r.emailAddress?.name;
      const addr = r.emailAddress?.address;
      if (name && addr) return `${name} <${addr}>`;
      return addr ?? name ?? "";
    })
    .filter(Boolean)
    .join(", ");
}

function extractGraphMessage(text: string): string | null {
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string; code?: string };
    };
    const msg = json.error?.message?.trim();
    if (msg) return msg.slice(0, 180);
    const code = json.error?.code?.trim();
    if (code) return code;
  } catch {
    /* ignore */
  }
  return null;
}

function mapListItem(m: GraphMessage): OutlookListItem {
  const addr = m.from?.emailAddress?.address ?? null;
  const name = m.from?.emailAddress?.name ?? addr ?? "Unknown";
  const fromRaw = addr ? (name !== addr ? `${name} <${addr}>` : addr) : name;
  const parsed = parseFrom(fromRaw);
  const starred = m.flag?.flagStatus === "flagged";
  return {
    id: m.id,
    threadId: m.conversationId ?? m.id,
    snippet: m.bodyPreview ?? "",
    subject: m.subject ?? null,
    from: fromRaw,
    fromName: parsed.name,
    fromEmail: parsed.email || addr || "",
    date: m.receivedDateTime ?? null,
    dateLabel: formatMailDate(m.receivedDateTime ?? null),
    unread: m.isRead === false,
    starred,
    labelIds: [
      ...(m.isRead === false ? ["UNREAD"] : []),
      ...(starred ? ["STARRED"] : []),
      "INBOX",
    ],
  };
}

export class OutlookClient {
  constructor(private refresher: TokenRefresher) {}

  async listInbox(
    userId: string,
    opts: { top?: number; search?: string } = {},
  ): Promise<{ messages: OutlookListItem[]; nextLink: string | null }> {
    const top = opts.top ?? 30;
    const search = opts.search?.trim();

    // Graph: do not combine $search with $orderby.
    const params = new URLSearchParams({
      $top: String(top),
      $select:
        "id,conversationId,subject,bodyPreview,from,receivedDateTime,isRead,flag",
    });
    const headers: Record<string, string> = {};

    let path: string;
    if (search) {
      params.set("$search", `"${search.replace(/"/g, "")}"`);
      headers.ConsistencyLevel = "eventual";
      path = `/v1.0/me/messages?${params.toString()}`;
    } else {
      params.set("$orderby", "receivedDateTime desc");
      path = `/v1.0/me/mailFolders/inbox/messages?${params.toString()}`;
    }

    const data = await this.request<{
      value?: GraphMessage[];
      "@odata.nextLink"?: string;
    }>(userId, path, { headers });
    return {
      messages: (data.value ?? []).map(mapListItem),
      nextLink: data["@odata.nextLink"] ?? null,
    };
  }

  async getMessage(userId: string, id: string) {
    const select =
      "id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,isRead,flag,internetMessageId";
    const m = await this.request<GraphMessage>(
      userId,
      `/v1.0/me/messages/${encodeURIComponent(id)}?$select=${select}`,
    );
    const item = mapListItem(m);
    const html = m.body?.contentType === "html" ? m.body.content ?? null : null;
    const text =
      m.body?.contentType === "text" ? m.body.content ?? null : m.bodyPreview ?? null;

    return {
      id: m.id,
      threadId: m.conversationId ?? m.id,
      snippet: m.bodyPreview ?? "",
      subject: m.subject ?? "(no subject)",
      from: item.from,
      fromName: item.fromName,
      fromEmail: item.fromEmail,
      to: recipientList(m.toRecipients),
      cc: recipientList(m.ccRecipients),
      date: m.receivedDateTime ?? null,
      dateLabel: formatMailDate(m.receivedDateTime ?? null),
      messageIdHeader: m.internetMessageId ?? null,
      references: null as string | null,
      unread: item.unread,
      bodyText: text,
      bodyHtml: html,
      labelIds: item.labelIds,
    };
  }

  async sendMail(
    userId: string,
    input: { to: string; subject: string; body: string; cc?: string },
  ): Promise<{ id: string }> {
    const toList = input.to.split(",").map((s) => s.trim()).filter(Boolean);
    const ccList = input.cc
      ? input.cc.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const payload = {
      message: {
        subject: input.subject,
        body: { contentType: "Text", content: input.body },
        toRecipients: toList.map((address) => ({ emailAddress: { address } })),
        ccRecipients: ccList.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    };

    await this.request(userId, "/v1.0/me/sendMail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return { id: "sent" };
  }

  async reply(
    userId: string,
    messageId: string,
    comment: string,
  ): Promise<void> {
    await this.request(userId, `/v1.0/me/messages/${encodeURIComponent(messageId)}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    });
  }

  async action(
    userId: string,
    messageId: string,
    action: "trash" | "archive" | "star" | "unstar" | "mark_read" | "mark_unread",
  ) {
    const id = encodeURIComponent(messageId);
    switch (action) {
      case "trash":
        await this.request(userId, `/v1.0/me/messages/${id}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinationId: "deleteditems" }),
        });
        break;
      case "archive":
        await this.request(userId, `/v1.0/me/messages/${id}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinationId: "archive" }),
        });
        break;
      case "star":
        await this.request(userId, `/v1.0/me/messages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flag: { flagStatus: "flagged" } }),
        });
        break;
      case "unstar":
        await this.request(userId, `/v1.0/me/messages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flag: { flagStatus: "notFlagged" } }),
        });
        break;
      case "mark_read":
        await this.request(userId, `/v1.0/me/messages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isRead: true }),
        });
        break;
      case "mark_unread":
        await this.request(userId, `/v1.0/me/messages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isRead: false }),
        });
        break;
    }

    if (action === "trash" || action === "archive") {
      return {
        id: messageId,
        starred: false,
        unread: false,
        labelIds: [] as string[],
      };
    }

    const detail = await this.getMessage(userId, messageId);
    return {
      id: detail.id,
      starred: detail.labelIds.includes("STARRED"),
      unread: detail.unread,
      labelIds: detail.labelIds,
    };
  }

  private async request<T>(
    userId: string,
    path: string,
    init: RequestInit = {},
    retried = false,
  ): Promise<T> {
    const accessToken = await this.refresher.getValidAccessToken(
      userId,
      "microsoft",
      retried,
    );

    let res: Response;
    try {
      res = await fetchWithTimeoutRetry(
        `https://graph.microsoft.com${path}`,
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
        `Graph unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (res.status === 401 && !retried) {
      return this.request<T>(userId, path, init, true);
    }

    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => "");
      console.error("outlook_graph_auth", res.status, text.slice(0, 400));
      const graphMsg = extractGraphMessage(text);
      throw new AuthGrantError(
        graphMsg
          ? `Outlook Graph ${res.status}: ${graphMsg}`
          : "Outlook auth failed. Reconnect required.",
        res.status === 403 ? "reconsent_required" : "reconnect_required",
      );
    }

    if (res.status === 202 || res.status === 204) {
      return {} as T;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph ${res.status}: ${text.slice(0, 300)}`);
    }

    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }
}
