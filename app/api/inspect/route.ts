import { z } from "zod";
import { inspectDatabase } from "@/lib/notion";

const Body = z.object({
  token: z.string().min(10),
  databaseId: z.string().min(8),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "토큰과 DB ID를 확인하세요." }, { status: 400 });
  }
  try {
    const result = await inspectDatabase(parsed.data.token, parsed.data.databaseId);
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return Response.json({ error: msg }, { status: 400 });
  }
}
