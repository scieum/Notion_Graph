import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthorizeUrl } from "@/lib/notion";

export const dynamic = "force-dynamic";

function redirectUri(req: NextRequest): string {
  return (
    process.env.NOTION_REDIRECT_URI ??
    new URL("/api/notion/callback", req.nextUrl.origin).toString()
  );
}

export async function GET(req: NextRequest) {
  const state = randomBytes(16).toString("hex");
  let url: string;
  try {
    url = buildAuthorizeUrl(redirectUri(req), state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth 설정 오류";
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(msg)}`, req.nextUrl.origin),
    );
  }
  const res = NextResponse.redirect(url);
  res.cookies.set("notion_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
