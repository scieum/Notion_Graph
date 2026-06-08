import type { NextRequest } from "next/server";
import { listDataSources } from "@/lib/notion";
import { decryptToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const enc = req.cookies.get("notion_token")?.value;
  if (!enc) {
    return Response.json({ error: "노션에 연결되지 않았습니다." }, { status: 401 });
  }
  try {
    const token = decryptToken(enc);
    const databases = await listDataSources(token);
    return Response.json({ databases });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "목록을 불러오지 못했습니다.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
