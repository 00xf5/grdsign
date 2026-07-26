import { NextRequest, NextResponse } from "next/server";
import { getMailStack } from "@/lib/mail";
import { AuthGrantError, buildRawMime } from "@benchute/mail";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { ensureMigrated, resolveOwnerUserId, userRepo, gmailClient, outlookClient } =
      getMailStack();
    await ensureMigrated();

    const body = (await req.json()) as Record<string, unknown>;
    const provider = typeof body.provider === "string" ? body.provider : "google";
    const to = typeof body.to === "string" ? body.to.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const msgBody = typeof body.body === "string" ? body.body : "";
    const cc = typeof body.cc === "string" ? body.cc.trim() : undefined;
    const threadId = typeof body.threadId === "string" ? body.threadId.trim() : undefined;
    const inReplyTo = typeof body.inReplyTo === "string" ? body.inReplyTo.trim() : undefined;
    const references = typeof body.references === "string" ? body.references.trim() : undefined;
    const replyToMessageId =
      typeof body.replyToMessageId === "string" ? body.replyToMessageId.trim() : undefined;

    if (!msgBody.trim()) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    if (msgBody.length > 200_000) {
      return NextResponse.json({ error: "body_too_large" }, { status: 400 });
    }

    const userId = await resolveOwnerUserId();
    if (!userId) {
      return NextResponse.json({ error: "no_owner_user" }, { status: 404 });
    }

    if (provider === "microsoft") {
      if (replyToMessageId) {
        await outlookClient.reply(userId, replyToMessageId, msgBody);
        return NextResponse.json({ ok: true, id: replyToMessageId, threadId: replyToMessageId });
      }
      if (!to.includes("@")) {
        return NextResponse.json({ error: "invalid_to" }, { status: 400 });
      }
      const sent = await outlookClient.sendMail(userId, {
        to,
        subject: subject || "(no subject)",
        body: msgBody,
        cc: cc || undefined,
      });
      return NextResponse.json({ ok: true, id: sent.id, threadId: sent.id });
    }

    if (!to.includes("@") && !replyToMessageId) {
      return NextResponse.json({ error: "invalid_to" }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ error: "invalid_subject" }, { status: 400 });
    }

    const user = await userRepo.findById(userId);
    const fromEmail = user?.email ?? "";

    const raw = buildRawMime({
      from: fromEmail,
      to,
      cc: cc || undefined,
      subject,
      body: msgBody,
      inReplyTo: inReplyTo || undefined,
      references: references || undefined,
    });

    const sent = await gmailClient.sendMessage(userId, {
      raw,
      threadId: threadId || undefined,
    });

    return NextResponse.json({ ok: true, id: sent.id, threadId: sent.threadId });
  } catch (err) {
    if (err instanceof AuthGrantError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 401 });
    }
    console.error("mail_send_failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}
