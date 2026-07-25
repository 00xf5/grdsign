import { NextRequest, NextResponse } from "next/server";
import {
  resolveOwnerUserId,
  gmailClient,
  outlookClient,
  ensureMigrated,
} from "@/lib/mail";
import { AuthGrantError } from "@benchute/mail";

const ALLOWED_ACTIONS = [
  "trash",
  "archive",
  "star",
  "unstar",
  "mark_read",
  "mark_unread",
] as const;
type MailAction = (typeof ALLOWED_ACTIONS)[number];

function isMailAction(v: unknown): v is MailAction {
  return typeof v === "string" && (ALLOWED_ACTIONS as readonly string[]).includes(v);
}

export async function POST(req: NextRequest) {
  try {
    await ensureMigrated();

    const body = await req.json() as Record<string, unknown>;
    const provider = typeof body.provider === "string" ? body.provider : "google";
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const action = body.action;

    if (!id || id.length > 512) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }
    if (!isMailAction(action)) {
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }

    const userId = await resolveOwnerUserId();
    if (!userId) {
      return NextResponse.json({ error: "no_owner_user" }, { status: 404 });
    }

    if (provider === "microsoft") {
      const result = await outlookClient.action(userId, id, action);
      return NextResponse.json({
        ok: true,
        action,
        id: result.id,
        threadId: result.id,
        labelIds: result.labelIds,
        starred: result.starred,
        unread: result.unread,
      });
    }

    // Google
    let result: { id: string; threadId: string; labelIds?: string[] };

    switch (action) {
      case "trash":
        result = await gmailClient.trashMessage(userId, id);
        break;
      case "archive":
        result = await gmailClient.modifyLabels(userId, id, { removeLabelIds: ["INBOX"] });
        break;
      case "star":
        result = await gmailClient.modifyLabels(userId, id, { addLabelIds: ["STARRED"] });
        break;
      case "unstar":
        result = await gmailClient.modifyLabels(userId, id, { removeLabelIds: ["STARRED"] });
        break;
      case "mark_read":
        result = await gmailClient.modifyLabels(userId, id, { removeLabelIds: ["UNREAD"] });
        break;
      case "mark_unread":
        result = await gmailClient.modifyLabels(userId, id, { addLabelIds: ["UNREAD"] });
        break;
    }

    return NextResponse.json({
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
      return NextResponse.json({ error: err.code, message: err.message }, { status: 401 });
    }
    console.error("mail_action_failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}
