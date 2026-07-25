/**
 * API boundary — frontend never talks to Google/Microsoft directly.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/$/,
  "",
) ?? "";

export type MailProvider = "google" | "microsoft";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, body);
  }

  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}`);
    this.name = "ApiError";
  }
}

export type MailAccount = {
  grantId: string;
  email: string;
  provider: MailProvider;
};

export type MeResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      user: {
        id: string;
        email: string;
        name: string | null;
        pictureUrl: string | null;
      };
      gmailConnected: boolean;
      outlookConnected: boolean;
      activeMailProvider: MailProvider;
      activeGrantId: string | null;
      gmailAccounts: MailAccount[];
      outlookAccounts: MailAccount[];
      connectedProviders: MailProvider[];
      scopes: string[];
    };

export type MailListItem = {
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

export type MailMessagesResponse = {
  folder: string;
  messages: MailListItem[];
  nextPageToken: string | null;
  resultSizeEstimate: number | null;
};

export type MailDetail = {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string | null;
  fromName: string;
  fromEmail: string;
  to: string | null;
  cc: string | null;
  date: string | null;
  dateLabel: string;
  messageIdHeader: string | null;
  references: string | null;
  unread: boolean;
  bodyText: string | null;
  bodyHtml: string | null;
  labelIds: string[];
};

export type SendMailInput = {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  replyToMessageId?: string;
};

function mailBase(provider: MailProvider): string {
  return provider === "microsoft" ? "/api/outlook" : "/api/gmail";
}

export const apiClient = {
  me: () => api<MeResponse>("/auth/me"),
  logout: () => api<{ ok: true }>("/auth/logout", { method: "POST" }),
  setActiveProvider: (provider: MailProvider) =>
    api<{ ok: true; activeMailProvider: MailProvider; activeGrantId: string | null }>(
      "/auth/active-provider",
      {
        method: "POST",
        body: JSON.stringify({ provider }),
      },
    ),
  setActiveAccount: (grantId: string) =>
    api<{
      ok: true;
      activeMailProvider: MailProvider;
      activeGrantId: string;
      accountEmail: string | null;
    }>("/auth/active-account", {
      method: "POST",
      body: JSON.stringify({ grantId }),
    }),
  disconnectGoogle: (grantId?: string) =>
    api<{ ok: true }>("/auth/google/disconnect", {
      method: "POST",
      body: JSON.stringify(grantId ? { grantId } : {}),
    }),
  disconnectMicrosoft: (grantId?: string) =>
    api<{ ok: true }>("/auth/microsoft/disconnect", {
      method: "POST",
      body: JSON.stringify(grantId ? { grantId } : {}),
    }),
  listMessages: (provider: MailProvider, q?: string) => {
    const params = new URLSearchParams({ maxResults: "30" });
    if (q) params.set("q", q);
    return api<MailMessagesResponse>(`${mailBase(provider)}/messages?${params}`);
  },
  getMessage: (provider: MailProvider, id: string) => {
    if (provider === "microsoft") {
      const params = new URLSearchParams({ id });
      return api<MailDetail>(`/api/outlook/messages/open?${params}`);
    }
    return api<MailDetail>(`${mailBase(provider)}/messages/${encodeURIComponent(id)}`);
  },
  sendMail: (provider: MailProvider, input: SendMailInput) =>
    api<{ ok: true; id: string; threadId: string }>(`${mailBase(provider)}/send`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  messageAction: (
    provider: MailProvider,
    id: string,
    action: "trash" | "archive" | "star" | "unstar" | "mark_read" | "mark_unread",
  ) => {
    if (provider === "microsoft") {
      return api<{
        ok: true;
        action: string;
        id: string;
        threadId: string;
        labelIds: string[];
        starred: boolean;
        unread: boolean;
      }>("/api/outlook/messages/actions", {
        method: "POST",
        body: JSON.stringify({ id, action }),
      });
    }
    return api<{
      ok: true;
      action: string;
      id: string;
      threadId: string;
      labelIds: string[];
      starred: boolean;
      unread: boolean;
    }>(`${mailBase(provider)}/messages/${encodeURIComponent(id)}/actions`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  },
};

export function startGoogleSignIn(returnTo = "/") {
  const url = new URL(`${API_BASE}/auth/google/start`);
  url.searchParams.set("return_to", returnTo);
  window.location.assign(url.toString());
}

export function startMicrosoftSignIn(returnTo = "/inbox") {
  const url = new URL(`${API_BASE}/auth/microsoft/start`);
  url.searchParams.set("return_to", returnTo);
  window.location.assign(url.toString());
}
