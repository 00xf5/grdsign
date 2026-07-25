import { NextRequest, NextResponse } from "next/server";
import {
  resolveOwnerUserId,
  gmailClient,
  outlookClient,
  ensureMigrated,
} from "@/lib/mail";
import { AuthGrantError, headerMap, parseFrom, formatMailDate } from "@benchute/mail";

function clamp(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export async function GET(req: NextRequest) {
  try {
    await ensureMigrated();

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider") ?? "google";
    const q = searchParams.get("q")?.slice(0, 500) ?? undefined;
    const maxResults = clamp(searchParams.get("maxResults"), 30, 1, 50);
    const pageToken = searchParams.get("pageToken")?.slice(0, 256) ?? undefined;

    const userId = await resolveOwnerUserId();
    if (!userId) {
      return NextResponse.json({ error: "no_owner_user" }, { status: 404 });
    }

    if (provider === "microsoft") {
      const list = await outlookClient.listInbox(userId, {
        top: maxResults,
        search: q,
      });
      return NextResponse.json({
        folder: "inbox",
        messages: list.messages,
        nextPageToken: null,
        resultSizeEstimate: list.messages.length,
      });
    }

    // Google
    const gmailQ = q?.trim() ? q : "in:inbox";
    const list = await gmailClient.listMessages(userId, {
      q: gmailQ,
      maxResults,
      pageToken,
    });

    const details = await Promise.all(
      (list.messages ?? []).slice(0, maxResults).map(async (m) => {
        const full = await gmailClient.getMessage(userId, m.id, "metadata");
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

    return NextResponse.json({
      folder: "inbox",
      messages: details,
      nextPageToken: list.nextPageToken ?? null,
      resultSizeEstimate: list.resultSizeEstimate ?? null,
    });
  } catch (err) {
    if (err instanceof AuthGrantError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 401 });
    }
    console.error("mail_messages_failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}
