import { NextRequest, NextResponse } from "next/server";
import {
  resolveOwnerUserId,
  gmailClient,
  outlookClient,
  ensureMigrated,
} from "@/lib/mail";
import { AuthGrantError, headerMap, parseFrom, formatMailDate } from "@benchute/mail";

export async function GET(req: NextRequest) {
  try {
    await ensureMigrated();

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider") ?? "google";
    const id = searchParams.get("id")?.trim() ?? "";

    if (!id || id.length > 512) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }

    const userId = await resolveOwnerUserId();
    if (!userId) {
      return NextResponse.json({ error: "no_owner_user" }, { status: 404 });
    }

    if (provider === "microsoft") {
      const detail = await outlookClient.getMessage(userId, id);
      return NextResponse.json(detail);
    }

    // Google
    const detail = await gmailClient.getMessageDetail(userId, id);
    const h = detail.headers;
    const fromRaw = h.from ?? null;
    const parsed = parseFrom(fromRaw);
    const labels = detail.message.labelIds ?? [];

    return NextResponse.json({
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
      return NextResponse.json({ error: err.code, message: err.message }, { status: 401 });
    }
    console.error("mail_open_failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}
