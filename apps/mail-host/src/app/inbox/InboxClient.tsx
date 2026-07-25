"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ComposePanel, buildReplyDraft, type ComposeDraft } from "./ComposePanel";

type MailProvider = "google" | "microsoft";

type MailAccount = { grantId: string; email: string };

type MeData = {
  userId: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
  activeMailProvider: MailProvider;
  activeGrantId: string | null;
  gmailAccounts: MailAccount[];
  outlookAccounts: MailAccount[];
};

type MailListItem = {
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

type MailDetail = {
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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignore */ }
    throw Object.assign(new Error(`API ${res.status}`), { status: res.status, body });
  }
  return res.json() as Promise<T>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

type Props = {
  authClientUrl: string;
};

export default function InboxClient({ authClientUrl }: Props) {
  const [me, setMe] = useState<MeData | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MailListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [listBusy, setListBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileShowReader, setMobileShowReader] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [provider, setProvider] = useState<MailProvider>("google");
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  const providerConnected = useMemo(() => {
    if (!me) return false;
    if (provider === "google") return me.gmailAccounts.length > 0;
    return me.outlookAccounts.length > 0;
  }, [me, provider]);

  const loadMe = useCallback(async () => {
    try {
      const data = await apiFetch<MeData>("/api/mail/me");
      setMe(data);
      setProvider(data.activeMailProvider ?? "google");
      setMeError(null);
    } catch {
      setMeError("Could not load account info");
    }
  }, []);

  const loadList = useCallback(
    async (opts?: { preferUnread?: boolean }) => {
      setListBusy(true);
      setError(null);
      try {
        const params = new URLSearchParams({ provider });
        if (search) params.set("q", search);
        const res = await apiFetch<{ messages: MailListItem[] }>(
          `/api/mail/messages?${params}`,
        );
        let msgs = res.messages;
        if (opts?.preferUnread) {
          msgs = [...msgs].sort((a, b) => Number(b.unread) - Number(a.unread));
        }
        setMessages(msgs);
        const unread = msgs.filter((m) => m.unread).length;
        setRefreshNote(
          unread > 0 ? `Refreshed · ${unread} unread` : "Refreshed · inbox up to date",
        );
        setSelectedId((prev) => {
          if (prev && msgs.some((m) => m.id === prev)) return prev;
          const firstUnread = msgs.find((m) => m.unread);
          return firstUnread?.id ?? msgs[0]?.id ?? null;
        });
      } catch (err) {
        const e = err as { body?: { message?: string; error?: string } };
        setError(e?.body?.message ?? e?.body?.error ?? "Failed to load messages");
      } finally {
        setListBusy(false);
      }
    },
    [provider, search],
  );

  async function switchAccount(grantId: string, next: MailProvider) {
    setError(null);
    setProvider(next);
    setSelectedId(null);
    setDetail(null);
    setMessages([]);
    try {
      await apiFetch("/api/mail/active-account", {
        method: "POST",
        body: JSON.stringify({ grantId }),
      });
      await loadMe();
      setReloadKey((k) => k + 1);
    } catch (err) {
      const e = err as { body?: { message?: string; error?: string } };
      setError(e?.body?.message ?? e?.body?.error ?? "Could not switch account");
    }
  }

  async function runAction(
    action: "trash" | "archive" | "star" | "unstar" | "mark_read" | "mark_unread",
  ) {
    if (!selectedId) return;
    setActionBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{
        id: string;
        starred: boolean;
        unread: boolean;
        labelIds: string[];
      }>("/api/mail/messages/actions", {
        method: "POST",
        body: JSON.stringify({ provider, id: selectedId, action }),
      });
      if (action === "trash" || action === "archive") {
        const idx = messages.findIndex((m) => m.id === selectedId);
        const next = messages.filter((m) => m.id !== selectedId);
        setMessages(next);
        setSelectedId(next[Math.min(idx, next.length - 1)]?.id ?? null);
        setDetail(null);
        setMobileShowReader(false);
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === selectedId ? { ...m, starred: res.starred, unread: res.unread } : m,
          ),
        );
        setDetail((d) =>
          d && d.id === selectedId
            ? { ...d, unread: res.unread, labelIds: res.labelIds }
            : d,
        );
      }
    } catch (err) {
      const e = err as { body?: { error?: string; message?: string } };
      setError(e?.body?.message ?? e?.body?.error ?? "Action failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login";
  }

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (!me || !providerConnected) return;
    void loadList({ preferUnread: true });
  }, [me, loadList, reloadKey, providerConnected]);

  useEffect(() => {
    if (!selectedId || !providerConnected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailBusy(true);
      try {
        const params = new URLSearchParams({ provider, id: selectedId });
        const d = await apiFetch<MailDetail>(`/api/mail/messages/open?${params}`);
        if (!cancelled) {
          setDetail(d);
          setMessages((prev) =>
            prev.map((m) => (m.id === selectedId ? { ...m, unread: false } : m)),
          );
        }
      } catch {
        if (!cancelled) {
          setDetail(null);
          setError("Could not open message");
        }
      } finally {
        if (!cancelled) setDetailBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, provider, providerConnected]);

  const unreadCount = useMemo(
    () => messages.filter((m) => m.unread).length,
    [messages],
  );

  if (meError && !me) {
    return (
      <div className="mail-boot">
        <p>{meError}</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="mail-boot">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className={`mail-shell${mobileShowReader ? " reader-open" : ""}`}>
      {/* Sidebar */}
      <aside className="mail-nav">
        <div className="mail-nav-brand">
          <span className="brand">Benchute</span>
          <span className="avatar-fallback" title={me.email}>
            {initials(me.name ?? me.email)}
          </span>
        </div>

        <nav className="mail-folders">
          <button
            type="button"
            className="compose-launch"
            disabled={!providerConnected}
            onClick={() => {
              setComposeDraft({ mode: "new", to: "", subject: "", body: "" });
              setComposeOpen(true);
            }}
          >
            Compose
          </button>

          <p className="mail-nav-label">Gmail accounts</p>
          {me.gmailAccounts.map((acct) => (
            <button
              key={acct.grantId}
              type="button"
              className={`folder account${
                provider === "google" && me.activeGrantId === acct.grantId ? " active" : ""
              }`}
              title={acct.email}
              onClick={() => void switchAccount(acct.grantId, "google")}
            >
              <span className="account-email">{acct.email}</span>
            </button>
          ))}
          <a
            href={authClientUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="folder account-add"
          >
            <span>+ Add Gmail</span>
          </a>

          <p className="mail-nav-label">Outlook accounts</p>
          {me.outlookAccounts.map((acct) => (
            <button
              key={acct.grantId}
              type="button"
              className={`folder account${
                provider === "microsoft" && me.activeGrantId === acct.grantId ? " active" : ""
              }`}
              title={acct.email}
              onClick={() => void switchAccount(acct.grantId, "microsoft")}
            >
              <span className="account-email">{acct.email}</span>
            </button>
          ))}
          <a
            href={authClientUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="folder account-add"
          >
            <span>+ Add Outlook</span>
          </a>

          <p className="mail-nav-label">Folder</p>
          <button type="button" className="folder active">
            <span>Inbox</span>
            {unreadCount > 0 ? <em>{unreadCount}</em> : null}
          </button>
        </nav>

        <div className="mail-nav-footer">
          <button
            type="button"
            className="mail-sync"
            disabled={listBusy || !providerConnected}
            onClick={() => void loadList({ preferUnread: true })}
          >
            {listBusy ? "Refreshing…" : "Refresh"}
          </button>
          {refreshNote && providerConnected ? (
            <p className="mail-refresh-note">{refreshNote}</p>
          ) : null}
          <button
            type="button"
            className="mail-logout"
            onClick={() => void handleLogout()}
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Message list */}
      <section className="mail-list-pane">
        {!providerConnected ? (
          <div className="mail-boot" style={{ minHeight: "60vh" }}>
            <h1>{provider === "microsoft" ? "Connect Outlook" : "Connect Gmail"}</h1>
            <p className="lede">
              {provider === "microsoft"
                ? "Link Microsoft to read and send Outlook mail."
                : "Link Google to use Gmail here."}
            </p>
            <a
              href={authClientUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn primary"
              style={{ display: "inline-flex", marginTop: "1.5rem" }}
            >
              {provider === "microsoft" ? "Connect via Benchute Auth" : "Connect via Benchute Auth"}
            </a>
          </div>
        ) : (
          <>
            <form
              className="mail-search"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(query.trim());
                setMobileShowReader(false);
              }}
            >
              <input
                type="search"
                placeholder="Search mail"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search mail"
              />
            </form>

            {error && (
              <div className="error-box mail-error">
                <p>{error}</p>
              </div>
            )}

            <div className="mail-list" role="listbox" aria-label="Messages">
              {listBusy && <p className="mail-list-status">Loading…</p>}
              {!listBusy && messages.length === 0 && (
                <p className="mail-list-status">No messages</p>
              )}
              {messages.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={m.id === selectedId}
                  className={`mail-row${m.id === selectedId ? " selected" : ""}${m.unread ? " unread" : ""}`}
                  onClick={() => {
                    setSelectedId(m.id);
                    setMobileShowReader(true);
                  }}
                >
                  <span className="mail-row-avatar" aria-hidden>
                    {initials(m.fromName)}
                  </span>
                  <span className="mail-row-main">
                    <span className="mail-row-top">
                      <span className="mail-row-from">{m.fromName}</span>
                      <span className="mail-row-date">{m.dateLabel}</span>
                    </span>
                    <span className="mail-row-subject">{m.subject ?? "(no subject)"}</span>
                    <span className="mail-row-snippet">{m.snippet}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Message reader */}
      <section className="mail-reader">
        <button
          type="button"
          className="mail-back"
          onClick={() => setMobileShowReader(false)}
        >
          ← Inbox
        </button>

        {!providerConnected && (
          <div className="mail-empty-reader">
            <p>Connect a mailbox to read mail</p>
          </div>
        )}

        {providerConnected && !selectedId && (
          <div className="mail-empty-reader">
            <p>Select a message</p>
          </div>
        )}

        {providerConnected && selectedId && detailBusy && (
          <div className="mail-empty-reader">
            <p className="muted">Opening…</p>
          </div>
        )}

        {providerConnected && selectedId && !detailBusy && detail && (
          <article className="mail-article">
            <header className="mail-article-head">
              <div className="mail-article-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={!detail.fromEmail || actionBusy}
                  onClick={() => {
                    setComposeDraft(buildReplyDraft(detail, provider));
                    setComposeOpen(true);
                  }}
                >
                  Reply
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={actionBusy}
                  onClick={() => void runAction("archive")}
                >
                  Archive
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={actionBusy}
                  onClick={() =>
                    void runAction(detail.labelIds.includes("STARRED") ? "unstar" : "star")
                  }
                >
                  {detail.labelIds.includes("STARRED") ? "Unstar" : "Star"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={actionBusy}
                  onClick={() =>
                    void runAction(detail.unread ? "mark_read" : "mark_unread")
                  }
                >
                  {detail.unread ? "Mark read" : "Mark unread"}
                </button>
                <button
                  type="button"
                  className="btn ghost danger"
                  disabled={actionBusy}
                  onClick={() => {
                    if (window.confirm("Move this message to Trash?")) {
                      void runAction("trash");
                    }
                  }}
                >
                  Delete
                </button>
              </div>
              <h1>{detail.subject}</h1>
              <div className="mail-article-meta">
                <span className="mail-article-avatar" aria-hidden>
                  {initials(detail.fromName)}
                </span>
                <div className="mail-article-who">
                  <div className="mail-article-from">
                    <strong>{detail.fromName}</strong>
                    {detail.fromEmail ? <span>&lt;{detail.fromEmail}&gt;</span> : null}
                  </div>
                  <div className="mail-article-to">
                    To {detail.to ?? "me"}
                    {detail.cc ? ` · Cc ${detail.cc}` : ""}
                  </div>
                </div>
                <time className="mail-article-date">{detail.dateLabel || detail.date}</time>
              </div>
            </header>

            {detail.bodyHtml ? (
              <iframe
                className="mail-iframe"
                title={detail.subject}
                sandbox=""
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><base target="_blank" rel="noopener"/><style>body{margin:0;padding:8px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.55;color:#1a1a1a;word-wrap:break-word;}img{max-width:100%;height:auto;}a{color:#0b57d0;}</style></head><body>${detail.bodyHtml}</body></html>`}
              />
            ) : (
              <pre className="mail-plaintext">{detail.bodyText ?? detail.snippet}</pre>
            )}
          </article>
        )}
      </section>

      <ComposePanel
        open={composeOpen}
        draft={composeDraft}
        provider={provider}
        onClose={() => {
          setComposeOpen(false);
          setComposeDraft(null);
        }}
        onSent={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
