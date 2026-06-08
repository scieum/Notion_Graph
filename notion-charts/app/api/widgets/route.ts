import { nanoid } from "nanoid";
import { z } from "zod";
import { encryptToken } from "@/lib/crypto";
import { createWidget } from "@/lib/db";

const Aggregation = z.enum(["sum", "count", "avg", "min", "max", "median", "none"]);

const Trendline = z.object({
  type: z.enum([
    "none",
    "linear",
    "movingAverage",
    "polynomial",
    "exponential",
    "logarithmic",
    "power",
  ]),
  period: z.number().int().positive().optional(),
  degree: z.number().int().min(2).max(6).optional(),
  color: z.string().optional(),
  dashed: z.boolean().optional(),
});

const Series = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  type: z.enum(["bar", "line", "area"]).optional(),
  color: z.string().optional(),
  axis: z.enum(["left", "right"]).optional(),
  aggregation: Aggregation.optional(),
  trendline: Trendline.optional(),
});

const Axis = z.object({
  title: z.string().optional(),
  color: z.string().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  hide: z.boolean().optional(),
});

const Style = z.object({
  palette: z.array(z.string()).optional(),
  background: z.string().optional(),
  gridColor: z.string().optional(),
  showGrid: z.boolean().optional(),
  legend: z.enum(["top", "bottom", "left", "right", "none"]).optional(),
  smooth: z.boolean().optional(),
  showDataLabels: z.boolean().optional(),
  stacked: z.boolean().optional(),
  donut: z.boolean().optional(),
  barRadius: z.number().optional(),
  fillOpacity: z.number().optional(),
});

const Body = z.object({
  token: z.string().min(10),
  databaseId: z.string().min(8),
  dataSourceId: z.string().min(8),
  chartType: z.enum(["bar", "line", "area", "scatter", "pie", "combo", "radar"]),
  config: z.object({
    title: z.string().optional(),
    xKey: z.string().min(1),
    series: z.array(Series).default([]),
    aggregation: Aggregation,
    sortBy: z.enum(["x", "y", "none"]).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
    limit: z.number().int().positive().optional(),
    style: Style.optional(),
    xAxis: Axis.optional(),
    leftAxis: Axis.optional(),
    rightAxis: Axis.optional(),
    yKey: z.string().optional(),
    colorKey: z.string().optional(),
  }),
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
    return Response.json({ error: "필수 필드가 누락되었습니다." }, { status: 400 });
  }
  try {
    const id = nanoid(10);
    await createWidget({
      id,
      database_id: parsed.data.databaseId,
      data_source_id: parsed.data.dataSourceId,
      token_ciphertext: encryptToken(parsed.data.token),
      chart_type: parsed.data.chartType,
      config: parsed.data.config,
    });
    return Response.json({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return Response.json({ error: msg }, { status: 500 });
  }
}
