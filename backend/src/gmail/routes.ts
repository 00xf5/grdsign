import { Router } from "express";
import { requireSession, type AuthedRequest } from "../auth/session.js";
import { asyncHandler } from "../lib/http.js";
import { AuthGrantError } from "../tokens/refresher.js";
import type { GmailClient } from "./client.js";
import type { GrantRepository } from "../tokens/grantRepository.js";
import { formatMailDate, headerMap, parseFrom } from "./parse.js";
import { buildRawMime } from "./mime.js";

export type GmailDeps = {
  gmail: GmailClient;
  grants: GrantRepository;
};

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function requireGmailGrant(
  grant: Awaited<ReturnType<GrantRepository["findActiveByUserId"]>>,
): boolean {
  return Boolean(grant?.scopes.some((s) => s.includes("gmail")));
}

function hasSendScope(
  grant: Awaited<ReturnType<GrantRepository["findActiveByUserId"]>>,
): boolean {
  return Boolean(
    grant?.scopes.some(
      (s) =>
        s.includes("gmail.send") || s === "https://www.googleapis.com/auth/gmail",
    ),
  );
}

/** trash / archive / star need modify (or full gmail). */
function hasModifyScope(
  grant: Awaited<ReturnType<GrantRepository["findActiveByUserId"]>>,
): boolean {
  return Boolean(
    grant?.scopes.some(
      (s) =>
        s.includes("gmail.modify") || s === "https://www.googleapis.com/auth/gmail",
    ),
  );
}

const MAIL_ACTIONS = [
  "trash",
  "archive",
  "star",
  "unstar",
  "mark_read",
  "mark_unread",
] as const;
type MailAction = (typeof MAIL_ACTIONS)[number];

function isMailAction(v: unknown): v is MailAction {
  return typeof v === "string" && (MAIL_ACTIONS as readonly string[]).includes(v);
}

export function createGmailRouter(deps: GmailDeps): Router {
  const router = Router();

  router.use(requireSession);

  router.get(
    "/messages",
    asyncHandler(async (req, res) => {
      const { session } = req as AuthedRequest;
      const grant = await deps.grants.findActiveByUserId(session.userId, "google");
      if (!requireGmailGrant(grant)) {
        res.status(409).json({
          error: "gmail_not_connected",
          message: "Connect Gmail with the required scopes first.",
        });
        return;
      }

      try {
        const q =
          typeof req.query.q === "string" && req.query.q.trim()
            ? req.query.q.slice(0, 500)
            : "in:inbox";
        const pageToken =
          typeof req.query.pageToken === "string" ? req.query.pageToken.slice(0, 256) : undefined;
        const maxResults = clampInt(req.query.maxResults, 25, 1, 50);

        const list = await deps.gmail.listMessages(session.userId, {
          q,
          pageToken,
          maxResults,
        });

        const details = await Promise.all(
          (list.messages ?? []).slice(0, maxResults).map(async (m) => {
            const full = await deps.gmail.getMessage(session.userId, m.id, "metadata");
            const headers = headerMap(full.payload?.headers);
            const fromRaw = headers.from ?? null;
            const parsed = parseFrom(fromRaw);
            const labels = full.labelIds ?? [];
            return {
              id: full.id,
              threadId: full.threadId,
              snippet: full.snippet,
              subject: headers.subject ?? null,
              from: fromRaw,
              fromName: parsed.name,
              fromEmail: parsed.email,
              date: headers.date ?? null,
              dateLabel: formatMailDate(headers.date ?? null),
              unread: labels.includes("UNREAD"),
              starred: labels.includes("STARRED"),
              labelIds: labels,
            };
          }),
        );

        res.json({
          folder: "inbox",
          messages: details,
          nextPageToken: list.nextPageToken ?? null,
          resultSizeEstimate: list.resultSizeEstimate ?? null,
        });
      } catch (err) {
        if (err instanceof AuthGrantError) {
          res.status(401).json({ error: err.code, message: err.message });
          return;
        }
        console.error("gmail_list_failed", err instanceof Error ? err.message : err);
        res.status(502).json({ error: "gmail_upstream_error" });
      }
    }),
  );

  router.get(
    "/messages/:id",
    asyncHandler(async (req, res) => {
      const { session } = req as AuthedRequest;
      const grant = await deps.grants.findActiveByUserId(session.userId, "google");
      if (!requireGmailGrant(grant)) {
        res.status(409).json({ error: "gmail_not_connected" });
        return;
      }

      const id = req.params.id;
      if (!id || id.length > 256) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }

      try {
        const detail = await deps.gmail.getMessageDetail(session.userId, id);
        const h = detail.headers;
        const fromRaw = h.from ?? null;
        const parsed = parseFrom(fromRaw);
        const labels = detail.message.labelIds ?? [];

        res.json({
          id: detail.message.id,
          threadId: detail.message.threadId,
          snippet: detail.message.snippet,
          subject: h.subject ?? "(no subject)",
          from: fromRaw,
          fromName: parsed.name,
          fromEmail: parsed.email,
          to: h.to ?? null,
          cc: h.cc ?? null,
          date: h.date ?? null,
          dateLabel: formatMailDate(h.date ?? null),
          messageIdHeader: h["message-id"] ?? null,
          references: h.references ?? null,
          unread: labels.includes("UNREAD"),
          bodyText: detail.body.text,
          bodyHtml: detail.body.html,
          labelIds: labels,
        });
      } catch (err) {
        if (err instanceof AuthGrantError) {
          res.status(401).json({ error: err.code, message: err.message });
          return;
        }
        console.error("gmail_get_failed", err instanceof Error ? err.message : err);
        res.status(502).json({ error: "gmail_upstream_error" });
      }
    }),
  );

  router.post(
    "/messages/:id/actions",
    asyncHandler(async (req, res) => {
      const { session } = req as AuthedRequest;
      const grant = await deps.grants.findActiveByUserId(session.userId, "google");
      if (!requireGmailGrant(grant)) {
        res.status(409).json({ error: "gmail_not_connected" });
        return;
      }
      if (!hasModifyScope(grant)) {
        res.status(403).json({
          error: "reconsent_required",
          message: "Sign in again to grant gmail.modify (delete/archive/star).",
        });
        return;
      }

      const id = req.params.id;
      if (!id || id.length > 256) {
        res.status(400).json({ error: "invalid_id" });
        return;
      }
      if (!isMailAction(req.body?.action)) {
        res.status(400).json({ error: "invalid_action" });
        return;
      }
      const action = req.body.action as MailAction;

      try {
        let result: { id: string; threadId: string; labelIds?: string[] };

        switch (action) {
          case "trash":
            result = await deps.gmail.trashMessage(session.userId, id);
            break;
          case "archive":
            result = await deps.gmail.modifyLabels(session.userId, id, {
              removeLabelIds: ["INBOX"],
            });
            break;
          case "star":
            result = await deps.gmail.modifyLabels(session.userId, id, {
              addLabelIds: ["STARRED"],
            });
            break;
          case "unstar":
            result = await deps.gmail.modifyLabels(session.userId, id, {
              removeLabelIds: ["STARRED"],
            });
            break;
          case "mark_read":
            result = await deps.gmail.modifyLabels(session.userId, id, {
              removeLabelIds: ["UNREAD"],
            });
            break;
          case "mark_unread":
            result = await deps.gmail.modifyLabels(session.userId, id, {
              addLabelIds: ["UNREAD"],
            });
            break;
        }

        res.json({
          ok: true,
          action,
          id: result.id,
          threadId: result.threadId,
          labelIds: result.labelIds ?? [],
          starred: (result.labelIds ?? []).includes("STARRED"),
          unread: (result.labelIds ?? []).includes("UNREAD"),
        });
      } catch (err) {
        if (err instanceof AuthGrantError) {
          res.status(401).json({ error: err.code, message: err.message });
          return;
        }
        console.error("gmail_action_failed", err instanceof Error ? err.message : err);
        res.status(502).json({ error: "gmail_upstream_error" });
      }
    }),
  );

  router.post(
    "/send",
    asyncHandler(async (req, res) => {
      const { session } = req as AuthedRequest;
      const grant = await deps.grants.findActiveByUserId(session.userId, "google");
      if (!requireGmailGrant(grant)) {
        res.status(409).json({ error: "gmail_not_connected" });
        return;
      }
      const hasSend = hasSendScope(grant);
      if (!hasSend) {
        res.status(403).json({
          error: "reconsent_required",
          message: "Sign in again to grant gmail.send permission.",
        });
        return;
      }

      const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
      const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
      const body = typeof req.body?.body === "string" ? req.body.body : "";
      const cc = typeof req.body?.cc === "string" ? req.body.cc.trim() : undefined;
      const threadId =
        typeof req.body?.threadId === "string" ? req.body.threadId.trim() : undefined;
      const inReplyTo =
        typeof req.body?.inReplyTo === "string" ? req.body.inReplyTo.trim() : undefined;
      const references =
        typeof req.body?.references === "string" ? req.body.references.trim() : undefined;

      const firstTo = to.split(",")[0]?.trim() ?? "";
      if (!firstTo.includes("@")) {
        res.status(400).json({ error: "invalid_to" });
        return;
      }
      if (!subject) {
        res.status(400).json({ error: "invalid_subject" });
        return;
      }
      if (!body.trim()) {
        res.status(400).json({ error: "invalid_body" });
        return;
      }
      if (body.length > 200_000) {
        res.status(400).json({ error: "body_too_large" });
        return;
      }

      try {
        const raw = buildRawMime({
          from: session.email,
          to,
          cc: cc || undefined,
          subject,
          body,
          inReplyTo: inReplyTo || undefined,
          references: references || undefined,
        });

        const sent = await deps.gmail.sendMessage(session.userId, {
          raw,
          threadId: threadId || undefined,
        });

        res.json({
          ok: true,
          id: sent.id,
          threadId: sent.threadId,
        });
      } catch (err) {
        if (err instanceof AuthGrantError) {
          res.status(401).json({ error: err.code, message: err.message });
          return;
        }
        console.error("gmail_send_failed", err instanceof Error ? err.message : err);
        res.status(502).json({ error: "gmail_upstream_error" });
      }
    }),
  );

  return router;
}
