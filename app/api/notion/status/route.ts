import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const connected = !!req.cookies.get("notion_token")?.value;
  const ws = req.cookies.get("notion_workspace")?.value;
  return Response.json({
    connected,
    workspace: ws ? decodeURIComponent(ws) : null,
  });
}
