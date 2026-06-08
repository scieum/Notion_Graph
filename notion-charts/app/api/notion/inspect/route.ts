import { z } from "zod";
import type { NextRequest } from "next/server";
import { inspectDataSource } from "@/lib/notion";
import { decryptToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const Body = z.object({ dataSourceId: z.string().min(8) });

export async function POST(req: NextRequest) {
  const enc = req.cookies.get("notion_token")?.value;
  if (!enc) {
    return Response.json({ error: "노션에 연결되지 않았습니다." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "데이터 소스를 선택하세요." }, { status: 400 });
  }
  try {
    const token = decryptToken(enc);
    const result = await inspectDataSource(token, parsed.data.dataSourceId);
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "불러오지 못했습니다.";
    return Response.json({ error: msg }, { status: 400 });
  }
}
