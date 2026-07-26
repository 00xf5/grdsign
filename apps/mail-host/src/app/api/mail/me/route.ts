import { NextResponse } from "next/server";
import { getMailStack } from "@/lib/mail";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { ensureMigrated, resolveOwnerUserId, userRepo, grantRepo } =
      getMailStack();
    await ensureMigrated();

    const userId = await resolveOwnerUserId();
    if (!userId) {
      return NextResponse.json({ error: "no_owner_user" }, { status: 404 });
    }

    const [user, grants] = await Promise.all([
      userRepo.findById(userId),
      grantRepo.listActiveByUserId(userId),
    ]);

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const gmailAccounts = grants
      .filter((g) => g.provider === "google")
      .map((g) => ({ grantId: g.id, email: g.accountEmail ?? "" }));

    const outlookAccounts = grants
      .filter((g) => g.provider === "microsoft")
      .map((g) => ({ grantId: g.id, email: g.accountEmail ?? "" }));

    return NextResponse.json({
      userId: user.id,
      email: user.email,
      name: user.name,
      pictureUrl: user.pictureUrl,
      activeMailProvider: user.activeMailProvider,
      activeGrantId: user.activeGrantId,
      gmailAccounts,
      outlookAccounts,
    });
  } catch (err) {
    console.error("mail_me_failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
