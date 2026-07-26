import { NextRequest, NextResponse } from "next/server";
import { getMailStack } from "@/lib/mail";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { ensureMigrated, resolveOwnerUserId, grantRepo, userRepo } =
      getMailStack();
    await ensureMigrated();

    const body = (await req.json()) as { grantId?: unknown };
    const grantId = typeof body.grantId === "string" ? body.grantId.trim() : "";
    if (!grantId) {
      return NextResponse.json({ error: "missing_grant_id" }, { status: 400 });
    }

    const userId = await resolveOwnerUserId();
    if (!userId) {
      return NextResponse.json({ error: "no_owner_user" }, { status: 404 });
    }

    const grant = await grantRepo.findById(grantId);
    if (!grant || grant.userId !== userId || grant.revokedAt) {
      return NextResponse.json({ error: "grant_not_found" }, { status: 404 });
    }

    await userRepo.setActiveGrant(userId, grantId, grant.provider);

    return NextResponse.json({
      ok: true,
      activeGrantId: grantId,
      provider: grant.provider,
    });
  } catch (err) {
    console.error("active_account_failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
