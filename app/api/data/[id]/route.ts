import type { NextRequest } from "next/server";
import { buildChartData } from "@/lib/chart-data";
import { decryptToken } from "@/lib/crypto";
import { getWidgetWithToken } from "@/lib/db";
import { fetchAllRows } from "@/lib/notion";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/data/[id]">) {
  const { id } = await ctx.params;
  const widget = await getWidgetWithToken(id);
  if (!widget) {
    return Response.json({ error: "위젯을 찾을 수 없습니다." }, { status: 404 });
  }
  try {
    const token = decryptToken(widget.token_ciphertext);
    const rows = await fetchAllRows(token, widget.data_source_id);
    const data = buildChartData(rows, widget.chart_type, widget.config);
    return Response.json({
      chartType: widget.chart_type,
      config: widget.config,
      data,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return Response.json({ error: msg }, { status: 500 });
  }
}
