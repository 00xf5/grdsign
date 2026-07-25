import { Router } from "express";
import { requireSession, type AuthedRequest } from "../auth/session.js";
import { asyncHandler } from "../lib/http.js";
import { AuthGrantError } from "../tokens/refresher.js";
import type { OutlookClient } from "./client.js";
import type { GrantRepository } from "../tokens/grantRepository.js";

export type OutlookDeps = {
  outlook: OutlookClient;
  grants: GrantRepository;
};

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function createOutlookRouter(deps: OutlookDeps): Router {
  const router = Router();
  router.use(requireSession);

  async function requireOutlook(userId: string) {
    const grant = await deps.grants.findActiveByUserId(userId, "microsoft");
    if (!grant) {
      return { ok: false as const, status: 409 as const, error: "outlook_not_connected" };
    }
    return { ok: true as const, grant };
  }

  router.get(
    "/messages",
    asyncHandler(async (req, res) => {
      const { session } = req as AuthedRequest;
      const check = await requireOutlook(session.userId);
      if (!check.ok) {
        res.status(check.status).json({ error: check.error });
        return;
      }

      try {
        const q = typeof req.query.q === "string" ? req.query.q.slice(0, 200) : undefined;
        const maxResults = clampInt(req.query.maxResults, 30, 1, 50);
        const list = await deps.outlook.listInbox(session.userId, {
          top: maxResults,
          search: q,
        });
        res.json({
          folder: "inbox",
          messages: list.messages,
          nextPageToken: null,
          resultSizeEstimate: list.messages.length,
        });
      } catch (err) {
        if (err instanceof AuthGrantError) {
          res.status(401).json({ error: err.code, message: err.message });
          return;
        }
        console.error("outlook_list_failed", err instanceof Error ? err.message : err);
        res.status(502).json({ error: "outlook_upstream_error" });
      }
    }),
  );

  // Graph message ids often contain "/" — never put them in a path segment
  // (Express truncates at "/", Graph then returns ErrorInvalidIdMalformed).
  router.get(
    "/messages/open",
    asyncHandler(async (req, res) => {
      const { session } = req as AuthedRequest;
      const check = await requireOutlook(session.userId);
      if (!check.ok) {
        res.status(check.status).json({ error: check.error });
        return;
      }
      const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
      if (!id) {
        res.status(400).json({ error: "missing_id" });
        return;
      }
      try {
        const detail = await deps.outlook.getMessage(session.userId, id);
        res.json(detail);
      } catch (err) {
        if (err instanceof AuthGrantError) {
          res.status(401).json({ error: err.code, message: err.message });
          return;
        }
        console.error("outlook_get_failed", err instanceof Error ? err.message : err);
        res.status(502).json({ error: "outlook_upstream_error" });
      }
    }),
  );

  router.post(
    "/send",
    asyncHandler(async (req, res) => {
      const { session } = req as AuthedRequest;
      const check = await requireOutlook(session.userId);
      if (!check.ok) {
        res.status(check.status).json({ error: check.error });
        return;
      }

      const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
      const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
      const body = typeof req.body?.body === "string" ? req.body.body : "";
      const replyToMessageId =
        typeof req.body?.replyToMessageId === "string"
          ? req.body.replyToMessageId.trim()
          : "";

      if (!to.includes("@") && !replyToMessageId) {
        res.status(400).json({ error: "invalid_to" });
        return;
      }
      if (!body.trim()) {
        res.status(400).json({ error: "invalid_body" });
        return;
      }

      try {
        if (replyToMessageId) {
          await deps.outlook.reply(session.userId, replyToMessageId, body);
          res.json({ ok: true, id: replyToMessageId, threadId: replyToMessageId });
          return;
        }
        const sent = await deps.outlook.sendMail(session.userId, {
          to,
          subject: subject || "(no subject)",
          body,
          cc: typeof req.body?.cc === "string" ? req.body.cc : undefined,
        });
        res.json({ ok: true, id: sent.id, threadId: sent.id });
      } catch (err) {
        if (err instanceof AuthGrantError) {
          res.status(401).json({ error: err.code, message: err.message });
          return;
        }
        console.error("outlook_send_failed", err instanceof Error ? err.message : err);
        res.status(502).json({ error: "outlook_upstream_error" });
      }
    }),
  );

  router.post(
    "/messages/actions",
    asyncHandler(async (req, res) => {
      const { session } = req as AuthedRequest;
      const check = await requireOutlook(session.userId);
      if (!check.ok) {
        res.status(check.status).json({ error: check.error });
        return;
      }

      const id = typeof req.body?.id === "string" ? req.body.id.trim() : "";
      const action = req.body?.action;
      const allowed = [
        "trash",
        "archive",
        "star",
        "unstar",
        "mark_read",
        "mark_unread",
      ] as const;
      if (!id) {
        res.status(400).json({ error: "missing_id" });
        return;
      }
      if (!allowed.includes(action)) {
        res.status(400).json({ error: "invalid_action" });
        return;
      }

      try {
        const result = await deps.outlook.action(session.userId, id, action);
        res.json({
          ok: true,
          action,
          id: result.id,
          threadId: result.id,
          labelIds: result.labelIds,
          starred: result.starred,
          unread: result.unread,
        });
      } catch (err) {
        if (err instanceof AuthGrantError) {
          res.status(401).json({ error: err.code, message: err.message });
          return;
        }
        console.error("outlook_action_failed", err instanceof Error ? err.message : err);
        res.status(502).json({ error: "outlook_upstream_error" });
      }
    }),
  );

  return router;
}
