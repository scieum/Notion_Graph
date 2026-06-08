import type {
  Aggregation,
  ChartDatum,
  ChartType,
  SeriesConfig,
  WidgetConfig,
} from "./types";
import { COUNT_KEY, TREND_PREFIX } from "./types";
import { extractValue } from "./notion-values";
import { fitTrendline } from "./trendline";

type RowProps = Record<string, unknown>;

/** Resolve the effective list of series, falling back to legacy single-series config. */
export function resolveSeries(config: WidgetConfig): SeriesConfig[] {
  if (config.series && config.series.length > 0) return config.series;
  if (config.yKey) return [{ key: config.yKey, label: config.yKey }];
  return [{ key: COUNT_KEY, label: "개수", aggregation: "count" }];
}

export function buildChartData(
  rows: RowProps[],
  chartType: ChartType,
  config: WidgetConfig,
): ChartDatum[] {
  const series = resolveSeries(config);
  const xKey = config.xKey;

  let data: ChartDatum[];

  if (chartType === "scatter") {
    // Each row is an (x, y...) point; no aggregation.
    data = [];
    for (const row of rows) {
      const xn = toNumber(extractValue(row[xKey]));
      if (xn === null) continue;
      const datum: ChartDatum = { x: xn };
      let any = false;
      for (const s of series) {
        const yn = toNumber(extractValue(row[s.key]));
        if (yn !== null) {
          datum[s.key] = yn;
          any = true;
        }
      }
      if (any) data.push(datum);
    }
    data = applySortLimit(data, config, series);
  } else {
    // Aggregate every series by the x category, preserving first-seen order.
    const groups = new Map<string, Map<string, number[]>>();
    const counts = new Map<string, number>();
    const order: string[] = [];
    for (const row of rows) {
      const xv = extractValue(row[xKey]);
      if (xv === null || xv === undefined) continue;
      const key = String(xv);
      if (!groups.has(key)) {
        groups.set(key, new Map());
        order.push(key);
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const g = groups.get(key)!;
      for (const s of series) {
        if (s.key === COUNT_KEY) continue;
        const yn = toNumber(extractValue(row[s.key]));
        const arr = g.get(s.key) ?? [];
        if (yn !== null) arr.push(yn);
        g.set(s.key, arr);
      }
    }
    data = order.map((key) => {
      const g = groups.get(key)!;
      const datum: ChartDatum = { x: key, label: key };
      for (const s of series) {
        const agg = s.aggregation ?? config.aggregation;
        if (s.key === COUNT_KEY) {
          datum[s.key] = counts.get(key) ?? 0;
        } else {
          datum[s.key] = aggregate(g.get(s.key) ?? [], agg, counts.get(key) ?? 0);
        }
      }
      return datum;
    });
    data = applySortLimit(data, config, series);
  }

  addTrendlines(data, series);
  return data;
}

function addTrendlines(data: ChartDatum[], series: SeriesConfig[]): void {
  for (const s of series) {
    const t = s.trendline;
    if (!t || t.type === "none") continue;
    const trendKey = TREND_PREFIX + s.key;

    if (t.type === "movingAverage") {
      const w = Math.max(2, t.period ?? 3);
      for (let i = 0; i < data.length; i++) {
        const slice: number[] = [];
        for (let j = Math.max(0, i - w + 1); j <= i; j++) {
          const v = Number(data[j][s.key]);
          if (Number.isFinite(v)) slice.push(v);
        }
        data[i][trendKey] =
          slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
      }
      continue;
    }

    const pts = data
      .map((d, i) => ({
        x: typeof d.x === "number" ? d.x : i,
        y: Number(d[s.key]),
      }))
      .filter((p) => Number.isFinite(p.y));
    const fn = fitTrendline(pts, t);
    if (!fn) continue;
    for (let i = 0; i < data.length; i++) {
      const x = typeof data[i].x === "number" ? (data[i].x as number) : i;
      const y = fn(x);
      data[i][trendKey] = Number.isFinite(y) ? y : null;
    }
  }
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function aggregate(values: number[], agg: Aggregation, groupSize: number): number {
  if (agg === "count") return groupSize;
  if (values.length === 0) return 0;
  switch (agg) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "median": {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
    case "none":
      return values[0];
    default:
      return values.reduce((a, b) => a + b, 0);
  }
}

function applySortLimit(
  points: ChartDatum[],
  config: WidgetConfig,
  series: SeriesConfig[],
): ChartDatum[] {
  let result = points;
  const primaryKey = series[0]?.key;
  if (config.sortBy && config.sortBy !== "none") {
    const dir = config.sortDir === "desc" ? -1 : 1;
    result = [...result].sort((a, b) => {
      const av = config.sortBy === "x" ? a.x : a[primaryKey];
      const bv = config.sortBy === "x" ? b.x : b[primaryKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }
  if (config.limit && config.limit > 0) result = result.slice(0, config.limit);
  return result;
}
