import type { Aggregation } from "./types";
import { COUNT_KEY } from "./types";
import { extractValue } from "./notion-values";

type Row = Record<string, unknown>;

export type StatValue = { value?: number; groups?: { label: string; value: number }[] };

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Aggregate a list of numbers. `count` is passed separately (row count). */
export function aggregateNumbers(values: number[], agg: Aggregation, count: number): number {
  if (agg === "count") return count;
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
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }
    default:
      return values.reduce((a, b) => a + b, 0);
  }
}

/**
 * Compute a single aggregate, or — when `groupBy` is set — one aggregate per
 * distinct value of the group property (first-seen order preserved).
 */
export function computeStat(
  rows: Row[],
  valueKey: string,
  agg: Aggregation,
  groupBy?: string,
): StatValue {
  const isCount = agg === "count" || valueKey === COUNT_KEY;
  const pick = (row: Row) => toNum(extractValue(row[valueKey]));

  if (groupBy) {
    const vals = new Map<string, number[]>();
    const counts = new Map<string, number>();
    const order: string[] = [];
    for (const row of rows) {
      const g = extractValue(row[groupBy]);
      if (g === null || g === undefined) continue;
      const key = String(g);
      if (!vals.has(key)) {
        vals.set(key, []);
        order.push(key);
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!isCount) {
        const n = pick(row);
        if (n !== null) vals.get(key)!.push(n);
      }
    }
    return {
      groups: order.map((k) => ({
        label: k,
        value: aggregateNumbers(vals.get(k) ?? [], agg, counts.get(k) ?? 0),
      })),
    };
  }

  let count = 0;
  const values: number[] = [];
  for (const row of rows) {
    count++;
    if (!isCount) {
      const n = pick(row);
      if (n !== null) values.push(n);
    }
  }
  return { value: aggregateNumbers(values, agg, count) };
}
