import { NextResponse } from "next/server";
import { getDb, centralizeGrantsToOwner } from "@benchute/db";
import { getMailStack } from "@/lib/mail";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Single-tenant recovery: move every active oauth_grant onto INBOX_OWNER_USER_ID
 * so mailboxes connected under a different Turso user show up in /inbox.
 *
 * POST /api/mail/adopt-orphans
 */
export async function POST() {
  try {
    const env = getEnv();
    const ownerId = env.INBOX_OWNER_USER_ID?.trim();
    if (!ownerId) {
      return NextResponse.json(
        {
          error: "inbox_owner_required",
          message: "Set INBOX_OWNER_USER_ID on mail-host before adopting grants.",
        },
        { status: 400 },
      );
    }

    const { ensureMigrated, userRepo } = getMailStack();
    await ensureMigrated();

    const owner = await userRepo.findById(ownerId);
    if (!owner) {
      return NextResponse.json({ error: "owner_not_found" }, { status: 404 });
    }

    const db = getDb();
    const { moved, revoked } = await centralizeGrantsToOwner(db, ownerId);

    return NextResponse.json({ ok: true, moved, revoked, ownerId });
  } catch (err) {
    console.error("adopt_orphans_failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
