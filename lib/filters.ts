import type { FilterJoin, FilterRule } from "./types";
import { extractValue } from "./notion-values";

const NUM_PROP_TYPES = new Set(["number", "formula", "rollup", "checkbox"]);
const DATE_PROP_TYPES = new Set(["date", "created_time", "last_edited_time"]);

/** Operators available for a property type, as [value, label] pairs. */
export function opsForType(type: string): [string, string][] {
  if (NUM_PROP_TYPES.has(type))
    return [
      ["eq", "="],
      ["neq", "≠"],
      ["gt", ">"],
      ["gte", "≥"],
      ["lt", "<"],
      ["lte", "≤"],
      ["empty", "비어 있음"],
      ["nempty", "값 있음"],
    ];
  if (DATE_PROP_TYPES.has(type))
    return [
      ["eq", "같음"],
      ["gte", "이후 ≥"],
      ["lte", "이전 ≤"],
      ["empty", "비어 있음"],
      ["nempty", "값 있음"],
    ];
  return [
    ["contains", "포함"],
    ["ncontains", "미포함"],
    ["eq", "같음"],
    ["neq", "다름"],
    ["empty", "비어 있음"],
    ["nempty", "값 있음"],
  ];
}

/** Test a single extracted value against one filter operator + comparison value. */
export function matchFilter(v: string | number | null, op: string, value: string): boolean {
  const empty = v === null || v === "";
  if (op === "empty") return empty;
  if (op === "nempty") return !empty;
  if (value.trim() === "") return true;
  const sv = String(v ?? "");
  const nv = Number(v);
  const nq = Number(value);
  const bothNum = Number.isFinite(nv) && Number.isFinite(nq);
  switch (op) {
    case "contains":
      return sv.toLowerCase().includes(value.toLowerCase());
    case "ncontains":
      return !sv.toLowerCase().includes(value.toLowerCase());
    case "eq":
      return bothNum ? nv === nq : sv === value;
    case "neq":
      return bothNum ? nv !== nq : sv !== value;
    case "gt":
      return bothNum ? nv > nq : sv > value;
    case "gte":
      return bothNum ? nv >= nq : sv >= value;
    case "lt":
      return bothNum ? nv < nq : sv < value;
    case "lte":
      return bothNum ? nv <= nq : sv <= value;
    default:
      return true;
  }
}

/**
 * Filter raw Notion rows by a set of rules combined with AND / OR.
 * Rules without a `key` are ignored; an empty rule set returns rows unchanged.
 * Shared by the source-data table, the dashboard, and per-chart filtering.
 */
export function applyFilters(
  rows: Record<string, unknown>[],
  filters: FilterRule[] | undefined,
  join: FilterJoin = "and",
): Record<string, unknown>[] {
  const active = (filters ?? []).filter((f) => f.key);
  if (active.length === 0) return rows;
  return rows.filter((row) => {
    const results = active.map((f) => matchFilter(extractValue(row[f.key]), f.op, f.value));
    return join === "or" ? results.some(Boolean) : results.every(Boolean);
  });
}
