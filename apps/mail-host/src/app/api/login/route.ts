import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { signToken, COOKIE_NAME, SESSION_DURATION_S } from "@/lib/session";

export async function POST(request: NextRequest) {
  let username: string | null = null;
  let password: string | null = null;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    username = typeof body.username === "string" ? body.username : null;
    password = typeof body.password === "string" ? body.password : null;
  } else {
    const form = await request.formData();
    username = form.get("username") as string | null;
    password = form.get("password") as string | null;
  }

  const loginUrl = new URL("/login", request.url);

  if (
    !username ||
    !password ||
    username !== env.INBOX_USER ||
    password !== env.INBOX_PASSWORD
  ) {
    loginUrl.searchParams.set("error", "invalid");
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const token = await signToken({
    ok: true,
    exp: Date.now() + SESSION_DURATION_S * 1000,
  });

  const response = NextResponse.redirect(new URL("/inbox", request.url), {
    status: 303,
  });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_S,
  });
  return response;
}
