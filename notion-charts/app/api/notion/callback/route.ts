import { NextResponse, type NextRequest } from "next/server";
import { exchangeNotionCode } from "@/lib/notion";
import { encryptToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

function redirectUri(req: NextRequest): string {
  return (
    process.env.NOTION_REDIRECT_URI ??
    new URL("/api/notion/callback", req.nextUrl.origin).toString()
  );
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/?error=${encodeURIComponent(msg)}`, origin));

  if (oauthError) return fail(oauthError);

  const cookieState = req.cookies.get("notion_oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("연결 검증에 실패했습니다. 다시 시도해주세요.");
  }

  try {
    const tok = await exchangeNotionCode(code, redirectUri(req));
    const res = NextResponse.redirect(new URL("/?connected=1", origin));
    res.cookies.set("notion_token", encryptToken(tok.access_token), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    if (tok.workspace_name) {
      res.cookies.set("notion_workspace", encodeURIComponent(tok.workspace_name), {
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    res.cookies.set("notion_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "토큰 교환에 실패했습니다.";
    return fail(msg);
  }
}
