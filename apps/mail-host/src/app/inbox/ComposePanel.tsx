"use client";

import { useEffect, useState } from "react";

export type ComposeMode = "new" | "reply";

export type ComposeDraft = {
  mode: ComposeMode;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  replyToMessageId?: string;
};

type Props = {
  open: boolean;
  draft: ComposeDraft | null;
  provider: string;
  onClose: () => void;
  onSent: () => void;
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

export function ComposePanel({ open, draft, provider, onClose, onSent }: Props) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    setTo(draft.to);
    setSubject(draft.subject);
    setBody(draft.body);
    setError(null);
  }, [draft]);

  if (!open || !draft) return null;

  async function send() {
    setSending(true);
    setError(null);
    try {
      await apiFetch("/api/mail/send", {
        method: "POST",
        body: JSON.stringify({
          provider,
          to: to.trim(),
          subject: subject.trim(),
          body,
          threadId: draft?.threadId,
          inReplyTo: draft?.inReplyTo,
          references: draft?.references,
          replyToMessageId: draft?.replyToMessageId,
        }),
      });
      onSent();
      onClose();
    } catch (err) {
      const e = err as { body?: { error?: string; message?: string } };
      setError(e?.body?.message ?? e?.body?.error ?? "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="compose-backdrop" role="presentation" onClick={onClose}>
      <div
        className="compose-panel"
        role="dialog"
        aria-label={draft.mode === "reply" ? "Reply" : "New message"}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="compose-head">
          <strong>{draft.mode === "reply" ? "Reply" : "New message"}</strong>
          <button type="button" className="compose-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <label className="compose-field">
          <span>To</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} autoComplete="email" />
        </label>
        <label className="compose-field">
          <span>Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <textarea
          className="compose-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          rows={12}
        />

        {error && (
          <div className="compose-error">
            <p>{error}</p>
          </div>
        )}

        <footer className="compose-foot">
          <button
            type="button"
            className="btn primary"
            disabled={sending}
            onClick={() => void send()}
          >
            {sending ? "Sending…" : "Send"}
          </button>
          <button type="button" className="btn ghost" onClick={onClose} disabled={sending}>
            Discard
          </button>
        </footer>
      </div>
    </div>
  );
}

export function buildReplyDraft(
  detail: {
    id: string;
    fromEmail: string;
    subject: string;
    threadId: string;
    messageIdHeader: string | null;
    references: string | null;
    bodyText: string | null;
    snippet: string;
    fromName: string;
    date: string | null;
  },
  provider: string,
): ComposeDraft {
  const re = /^re:/i.test(detail.subject) ? detail.subject : `Re: ${detail.subject}`;
  const quoted = (detail.bodyText ?? detail.snippet)
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  const when = detail.date ? ` on ${detail.date}` : "";
  const refs = [detail.references, detail.messageIdHeader].filter(Boolean).join(" ").trim();

  return {
    mode: "reply",
    to: detail.fromEmail,
    subject: re,
    body: `\n\nOn ${detail.fromName}${when} wrote:\n${quoted}`,
    threadId: detail.threadId,
    inReplyTo: detail.messageIdHeader ?? undefined,
    references: refs || undefined,
    replyToMessageId: provider === "microsoft" ? detail.id : undefined,
  };
}
