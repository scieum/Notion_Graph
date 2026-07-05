"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Aggregation,
  AxisConfig,
  ChartDatum,
  ChartStyle,
  ChartType,
  DashboardSnapshot,
  FilterJoin,
  FilterRule,
  LegendPosition,
  NotionPropertyMeta,
  SeriesConfig,
  TrendlineType,
  WidgetConfig,
} from "@/lib/types";
import { COUNT_KEY } from "@/lib/types";
import { matchFilter, opsForType } from "@/lib/filters";
import { buildChartData } from "@/lib/chart-data";
import { computeStat } from "@/lib/stats";
import { extractValue } from "@/lib/notion-values";
import { ChartView, DEFAULT_PALETTE } from "@/components/charts/ChartView";
import { DashboardView } from "@/components/DashboardView";

type InspectResult = {
  dataSourceId: string;
  properties: NotionPropertyMeta[];
  title?: string;
  rows: Record<string, unknown>[];
};

const NUMERIC_TYPES = new Set(["number", "formula", "rollup", "checkbox"]);
const DATE_TYPES = new Set(["date", "created_time", "last_edited_time"]);

const DEFAULT_STYLE: ChartStyle = {
  palette: DEFAULT_PALETTE,
  background: "#ffffff",
  showGrid: true,
  legend: "bottom",
  smooth: false,
  showDataLabels: true,
  stacked: false,
  donut: false,
  fillOpacity: 0.25,
  omitZero: false,
};

/** One chart in a multi-tab embed: a display name + chart type + full config. */
type ChartTab = { name: string; t: ChartType; c: WidgetConfig };

/** Editor-side dashboard block (holds config; data is baked at snapshot time). */
type DashBlockEdit =
  | {
      id: number;
      kind: "stat";
      title?: string;
      caption?: string;
      valueKey: string;
      agg: Aggregation;
      groupBy?: string;
      unit?: string;
    }
  | { id: number; kind: "table"; title?: string }
  | { id: number; kind: "chart"; title?: string; t: ChartType; c: WidgetConfig };

/** Base64-encode a payload into a /s embed URL (UTF-8 safe). */
function toSnapshotUrl(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `${window.location.origin}/s#${btoa(bin)}`;
}

/** Shared wrapper for the Lucide-style chart icons (currentColor = inherits text color). */
function ChartIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const CHART_TYPES: { value: ChartType; label: string; icon: React.ReactNode }[] = [
  {
    value: "bar",
    label: "막대",
    icon: (
      <ChartIcon>
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </ChartIcon>
    ),
  },
  {
    value: "line",
    label: "선",
    icon: (
      <ChartIcon>
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="m19 9-5 5-4-4-3 3" />
      </ChartIcon>
    ),
  },
  {
    value: "area",
    label: "영역",
    icon: (
      <ChartIcon>
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="M7 11.207a.5.5 0 0 1 .146-.353l2-2a.5.5 0 0 1 .708 0l3.292 3.292a.5.5 0 0 0 .708 0l4.292-4.292a.5.5 0 0 1 .854.353V16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z" />
      </ChartIcon>
    ),
  },
  {
    value: "scatter",
    label: "산점도",
    icon: (
      <ChartIcon>
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
        <circle cx="18.5" cy="5.5" r=".5" fill="currentColor" />
        <circle cx="11.5" cy="11.5" r=".5" fill="currentColor" />
        <circle cx="7.5" cy="16.5" r=".5" fill="currentColor" />
        <circle cx="17.5" cy="14.5" r=".5" fill="currentColor" />
      </ChartIcon>
    ),
  },
  {
    value: "pie",
    label: "파이",
    icon: (
      <ChartIcon>
        <path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z" />
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      </ChartIcon>
    ),
  },
  {
    value: "combo",
    label: "콤보",
    icon: (
      <ChartIcon>
        <path d="M12 16v5" />
        <path d="M16 14.639V21" />
        <path d="M20 10.656V21" />
        <path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15" />
        <path d="M4 18.463V21" />
        <path d="M8 14.656V21" />
      </ChartIcon>
    ),
  },
  {
    value: "radar",
    label: "방사형",
    icon: (
      <ChartIcon>
        <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
        <path d="M4 6h.01" />
        <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
        <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
        <path d="M12 18h.01" />
        <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" />
        <circle cx="12" cy="12" r="2" />
        <path d="m13.41 10.59 5.66-5.66" />
      </ChartIcon>
    ),
  },
  {
    value: "hbar",
    label: "가로 막대",
    icon: (
      <ChartIcon>
        <path d="M5 3v18" />
        <path d="M9 7h7" />
        <path d="M9 12h11" />
        <path d="M9 17h5" />
      </ChartIcon>
    ),
  },
  {
    value: "bubble",
    label: "버블",
    icon: (
      <ChartIcon>
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <circle cx="9" cy="14" r="2.2" />
        <circle cx="17" cy="8" r="3" />
        <circle cx="15" cy="16" r="1.4" />
      </ChartIcon>
    ),
  },
  {
    value: "radialBar",
    label: "방사형 막대",
    icon: (
      <ChartIcon>
        <path d="M12 12a6 6 0 0 1 6 6" />
        <path d="M12 12a9 9 0 0 1 6.4 2.6" />
        <path d="M12 12a4 4 0 0 0-4 4" />
        <circle cx="12" cy="12" r="1" />
      </ChartIcon>
    ),
  },
  {
    value: "funnel",
    label: "깔때기",
    icon: (
      <ChartIcon>
        <path d="M4 5h16" />
        <path d="M7 10h10" />
        <path d="M10 15h4" />
        <path d="M11 20h2" />
      </ChartIcon>
    ),
  },
];

const PALETTE_PRESETS: { name: string; colors: string[] }[] = [
  { name: "기본", colors: DEFAULT_PALETTE },
  {
    name: "파스텔",
    colors: ["#7dd3fc", "#86efac", "#fdba74", "#d8b4fe", "#fca5a5", "#67e8f9", "#fde047", "#f9a8d4"],
  },
  {
    name: "비비드",
    colors: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"],
  },
  {
    name: "모노 블루",
    colors: ["#1e3a8a", "#1d4ed8", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#0ea5e9", "#38bdf8"],
  },
  {
    name: "어스톤",
    colors: ["#78350f", "#b45309", "#d97706", "#65a30d", "#4d7c0f", "#a16207", "#854d0e", "#9a3412"],
  },
];

const BG_PRESETS = [
  { name: "흰색", color: "#ffffff" },
  { name: "웜그레이", color: "#f6f5f4" },
  { name: "다크", color: "#1f2937" },
  { name: "투명", color: "transparent" },
];

const TRENDLINES: { value: TrendlineType; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "linear", label: "선형" },
  { value: "movingAverage", label: "이동 평균" },
  { value: "polynomial", label: "다항식" },
  { value: "exponential", label: "지수" },
  { value: "logarithmic", label: "로그" },
  { value: "power", label: "거듭제곱" },
];

export function SetupForm() {
  const [token, setToken] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspect, setInspect] = useState<InspectResult | null>(null);

  // OAuth connection state
  const [connected, setConnected] = useState<boolean | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [databases, setDatabases] = useState<{ dataSourceId: string; title: string }[]>([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [loadingDbs, setLoadingDbs] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  // chart configuration
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [title, setTitle] = useState("");
  const [xKey, setXKey] = useState("");
  const [series, setSeries] = useState<SeriesConfig[]>([]);
  const [aggregation, setAggregation] = useState<Aggregation>("sum");
  const [sortBy, setSortBy] = useState<"x" | "y" | "none">("none");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [limit, setLimit] = useState<number>(0);
  const [style, setStyle] = useState<ChartStyle>(DEFAULT_STYLE);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showData, setShowData] = useState(true);
  const [copied, setCopied] = useState(false);
  // Multi-chart embed: each tab is one chart. Empty => single-chart embed.
  // `editingTab` is the tab the editor is currently bound to (null = scratch chart).
  const [tabs, setTabs] = useState<ChartTab[]>([]);
  const [editingTab, setEditingTab] = useState<number | null>(null);
  const [dragTab, setDragTab] = useState<number | null>(null);
  // Dashboard mode: a stack of stat / table / chart blocks in one embed.
  const [mode, setMode] = useState<"chart" | "dashboard">("chart");
  const [dashTitle, setDashTitle] = useState("");
  const [blocks, setBlocks] = useState<DashBlockEdit[]>([]);
  const [statColumns, setStatColumns] = useState(0); // 0 = auto
  // id of the chart block currently being edited inline (dashboard mode), or null
  const [editingBlock, setEditingBlock] = useState<number | null>(null);
  const blockId = useRef(1);
  // table view state — shared by the data table AND the chart
  const [tableSorts, setTableSorts] = useState<SortRule[]>([]);
  const [tableFilters, setTableFilters] = useState<FilterRule[]>([]);
  const [filterJoin, setFilterJoin] = useState<"and" | "or">("and");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const toggleRow = (id: string) => setOpenRow((cur) => (cur === id ? null : id));
  const [xAxis, setXAxis] = useState<AxisConfig>({});
  const [leftAxis, setLeftAxis] = useState<AxisConfig>({});
  const [rightAxis, setRightAxis] = useState<AxisConfig>({});
  // per-chart filters — narrow this chart's rows independently of the table filter
  const [chartFilters, setChartFilters] = useState<FilterRule[]>([]);
  const [chartFilterJoin, setChartFilterJoin] = useState<FilterJoin>("and");

  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const properties = inspect?.properties ?? [];
  const numericProps = useMemo(
    () => properties.filter((p) => NUMERIC_TYPES.has(p.type)),
    [properties],
  );

  const isCartesian = ["bar", "line", "area", "scatter", "bubble", "combo", "hbar"].includes(chartType);
  // "point" charts place one dot per row (numeric X, no aggregation).
  const isScatter = chartType === "scatter" || chartType === "bubble";
  // charts with a left/right dual value axis
  const isDualAxis = ["bar", "line", "area", "combo"].includes(chartType);
  const hasRight = series.some((s) => s.axis === "right");

  const config: WidgetConfig = useMemo(
    () => ({
      title: title || undefined,
      xKey,
      series,
      aggregation,
      sortBy,
      sortDir,
      limit: limit > 0 ? limit : undefined,
      filters: chartFilters.length > 0 ? chartFilters : undefined,
      filterJoin: chartFilterJoin,
      style,
      xAxis,
      leftAxis,
      rightAxis,
    }),
    [title, xKey, series, aggregation, sortBy, sortDir, limit, chartFilters, chartFilterJoin, style, xAxis, leftAxis, rightAxis],
  );

  // Rows after the table's filters + sorts — drives both the table and the chart.
  const processedRows = useMemo(
    () => (inspect ? processRows(inspect.rows, tableFilters, filterJoin, tableSorts) : []),
    [inspect, tableFilters, filterJoin, tableSorts],
  );

  const previewData = useMemo(() => {
    if (!inspect || !xKey) return [];
    try {
      return buildChartData(processedRows, chartType, config);
    } catch {
      return [];
    }
  }, [inspect, xKey, chartType, config, processedRows]);

  const applyInspectResult = useCallback((json: InspectResult) => {
    setInspect(json);
    setSavedId(null);
    setTableSorts([]);
    setTableFilters([]);
    setFilterJoin("and");
    setChartFilters([]);
    setChartFilterJoin("and");
    setTabs([]);
    setEditingTab(null);
    setBlocks([]);
    setDashTitle("");
    setStatColumns(0);
    setEditingBlock(null);
    if (json.title) setTitle(json.title);
    const props = json.properties ?? [];
    if (props[0]) setXKey(props[0].name);
    const firstNum = props.find((p) => NUMERIC_TYPES.has(p.type));
    if (firstNum) {
      setSeries([{ key: firstNum.name, label: firstNum.name, axis: "left" }]);
      setAggregation("sum");
    } else {
      setSeries([{ key: COUNT_KEY, label: "개수", aggregation: "count" }]);
      setAggregation("count");
    }
  }, []);

  const loadDatabases = useCallback(async () => {
    setLoadingDbs(true);
    try {
      const res = await fetch("/api/notion/databases");
      const json = await res.json();
      if (res.ok) {
        const dbs: { dataSourceId: string; title: string }[] = json.databases ?? [];
        setDatabases(dbs);
        if (dbs[0]) setSelectedDb(dbs[0].dataSourceId);
      }
    } finally {
      setLoadingDbs(false);
    }
  }, []);

  // On mount: surface OAuth redirect messages and check connection status.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setError(decodeURIComponent(err));
    fetch("/api/notion/status")
      .then((r) => r.json())
      .then((s) => {
        setConnected(!!s.connected);
        setWorkspace(s.workspace ?? null);
        if (s.connected) loadDatabases();
      })
      .catch(() => setConnected(false));
    if (params.get("connected") || err) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadDatabases]);

  async function handleSelectDatabase() {
    if (!selectedDb) return;
    setError(null);
    setInspecting(true);
    setInspect(null);
    try {
      const res = await fetch("/api/notion/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSourceId: selectedDb }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "불러오기 실패");
      applyInspectResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setInspecting(false);
    }
  }

  async function handleDisconnect() {
    await fetch("/api/notion/disconnect", { method: "POST" });
    setConnected(false);
    setWorkspace(null);
    setDatabases([]);
    setSelectedDb("");
    setInspect(null);
  }

  async function handleInspect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInspecting(true);
    setInspect(null);
    setSavedId(null);
    try {
      const res = await fetch("/api/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, databaseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "조회 실패");
      applyInspectResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setInspecting(false);
    }
  }

  async function handleSave() {
    if (!inspect) return;
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        dataSourceId: inspect.dataSourceId,
        chartType,
        config,
      };
      if (manualMode) {
        payload.token = token;
        payload.databaseId = databaseId;
      }
      const res = await fetch("/api/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "저장 실패");
      setSavedId(json.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setSaving(false);
    }
  }

  // series helpers
  function updateSeries(i: number, patch: Partial<SeriesConfig>) {
    setSeries((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addSeries() {
    const used = new Set(series.map((s) => s.key));
    const next = numericProps.find((p) => !used.has(p.name));
    setSeries((prev) => [
      ...prev,
      next
        ? { key: next.name, label: next.name, axis: "left" }
        : { key: COUNT_KEY, label: "개수", aggregation: "count" },
    ]);
  }
  function removeSeries(i: number) {
    setSeries((prev) => prev.filter((_, idx) => idx !== i));
  }

  // ---- multi-chart tab helpers ----
  // Load a saved tab's config back into all the editor fields.
  const loadIntoEditor = useCallback((tab: ChartTab) => {
    const c = tab.c;
    setChartType(tab.t);
    setTitle(c.title ?? "");
    setXKey(c.xKey);
    setSeries(c.series);
    setAggregation(c.aggregation);
    setSortBy(c.sortBy ?? "none");
    setSortDir(c.sortDir ?? "asc");
    setLimit(c.limit ?? 0);
    setChartFilters(c.filters ?? []);
    setChartFilterJoin(c.filterJoin ?? "and");
    setStyle(c.style ?? DEFAULT_STYLE);
    setXAxis(c.xAxis ?? {});
    setLeftAxis(c.leftAxis ?? {});
    setRightAxis(c.rightAxis ?? {});
  }, []);

  // Add the chart currently in the editor as a new tab and bind the editor to it.
  function addTab() {
    setTabs((prev) => {
      const name = title.trim() || `차트 ${prev.length + 1}`;
      setEditingTab(prev.length);
      return [...prev, { name, t: chartType, c: config }];
    });
  }
  function selectTab(i: number) {
    loadIntoEditor(tabs[i]);
    setEditingTab(i);
  }
  function removeTab(i: number) {
    setTabs((prev) => prev.filter((_, idx) => idx !== i));
    setEditingTab((cur) => (cur === null ? null : cur === i ? null : cur > i ? cur - 1 : cur));
  }
  function renameTab(i: number, name: string) {
    setTabs((prev) => prev.map((t, idx) => (idx === i ? { ...t, name } : t)));
  }
  function moveTab(from: number, to: number) {
    if (from === to) return;
    setTabs((prev) => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
    setEditingTab((cur) => {
      if (cur === null) return null;
      if (cur === from) return to;
      // shift indices that sit between the moved positions
      if (from < cur && cur <= to) return cur - 1;
      if (to <= cur && cur < from) return cur + 1;
      return cur;
    });
  }

  // Keep the bound tab in sync with live editor edits (name is preserved).
  useEffect(() => {
    if (editingTab === null) return;
    setTabs((prev) =>
      prev.map((t, i) => (i === editingTab ? { ...t, t: chartType, c: config } : t)),
    );
  }, [editingTab, chartType, config]);

  // Keep the bound dashboard chart block in sync with live editor edits.
  useEffect(() => {
    if (editingBlock === null) return;
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === editingBlock && b.kind === "chart" ? { ...b, t: chartType, c: config } : b,
      ),
    );
  }, [editingBlock, chartType, config]);

  // ---- dashboard block helpers ----
  // New blocks append to the bottom (natural order); reorder by dragging.
  function addStatBlock() {
    const num = numericProps[0]?.name;
    setBlocks((b) => [
      ...b,
      {
        id: blockId.current++,
        kind: "stat",
        title: num ? `${num} 평균` : "행 개수",
        caption: num ? "평균" : "개수",
        valueKey: num ?? COUNT_KEY,
        agg: num ? "avg" : "count",
      },
    ]);
  }
  function addTableBlock() {
    setBlocks((b) => [...b, { id: blockId.current++, kind: "table", title: inspect?.title ?? "표" }]);
  }
  // Add a chart block from the current editor config and open it for inline editing.
  function addChartBlock() {
    const id = blockId.current++;
    setBlocks((b) => [
      ...b,
      { id, kind: "chart", title: title || undefined, t: chartType, c: config },
    ]);
    setEditingBlock(id);
  }
  // Edit an existing chart block: load its config into the editor + bind to it.
  function editChartBlock(b: DashBlockEdit) {
    if (b.kind !== "chart") return;
    loadIntoEditor({ name: "", t: b.t, c: b.c });
    setEditingBlock(b.id);
  }
  function updateBlock(id: number, patch: Partial<DashBlockEdit>) {
    setBlocks((b) => b.map((x) => (x.id === id ? ({ ...x, ...patch } as DashBlockEdit) : x)));
  }
  function removeBlock(id: number) {
    setBlocks((b) => b.filter((x) => x.id !== id));
    if (id === editingBlock) setEditingBlock(null);
  }
  function moveBlock(i: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function reorderBlock(from: number, to: number) {
    if (from === to) return;
    setBlocks((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }

  const embedUrl =
    typeof window !== "undefined" && savedId
      ? `${window.location.origin}/w/${savedId}`
      : "";

  // Snapshot embed: bake the chart(s) into the URL hash. Multiple tabs → one
  // tabbed embed; otherwise a single chart (backward-compatible shape).
  const snapshotUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      if (tabs.length > 0) {
        const built = tabs
          .map((tb) => {
            let d: ChartDatum[] = [];
            try {
              d = buildChartData(processedRows, tb.t, tb.c);
            } catch {
              d = [];
            }
            return { name: tb.name, t: tb.t, d, c: tb.c };
          })
          .filter((tb) => tb.c.xKey && tb.d.length > 0);
        if (built.length === 0) return "";
        return toSnapshotUrl({ tabs: built });
      }
      if (!xKey || series.length === 0 || previewData.length === 0) return "";
      return toSnapshotUrl({ t: chartType, d: previewData, c: config });
    } catch {
      return "";
    }
  }, [tabs, processedRows, chartType, previewData, config, xKey, series.length]);

  // ---- Dashboard mode: bake blocks + embed URL ----
  const dashboard: DashboardSnapshot = useMemo(
    () => ({
      title: dashTitle || undefined,
      statColumns: statColumns || undefined,
      blocks: blocks.map((b) => {
        if (b.kind === "stat") {
          // Number cards show a single aggregate value (no grouped breakdown).
          const r = computeStat(processedRows, b.valueKey, b.agg);
          return { kind: "stat" as const, title: b.title, caption: b.caption, unit: b.unit, value: r.value };
        }
        if (b.kind === "table") {
          return { kind: "table" as const, title: b.title, properties, rows: processedRows.slice(0, 200) };
        }
        let d: ChartDatum[] = [];
        try {
          d = buildChartData(processedRows, b.t, b.c);
        } catch {
          d = [];
        }
        return { kind: "chart" as const, title: b.title, t: b.t, d, c: b.c };
      }),
    }),
    [blocks, dashTitle, statColumns, processedRows, properties],
  );

  const dashboardUrl = useMemo(() => {
    if (typeof window === "undefined" || blocks.length === 0) return "";
    try {
      return toSnapshotUrl({ dash: dashboard });
    } catch {
      return "";
    }
  }, [blocks.length, dashboard]);

  return (
    <>
      {/* ===================== LANDING — fills one screen ===================== */}
      {!inspect && (
        <div className="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center gap-6 py-10">
          <header className="text-center">
            <h1 className="text-4xl font-bold tracking-[-0.0625em] text-[rgba(0,0,0,0.95)]">
              Notion Charts
            </h1>
            <p className="mt-2 text-[#615d59]">
              노션 데이터베이스를 엑셀급 차트로 만들어 임베드하세요.
            </p>
          </header>

          {/* connect */}
          <Card>
            <CardTitle>노션에 연결</CardTitle>
        <p className="mt-2 text-sm text-[#615d59]">
          데이터베이스를 읽고 차트로 그릴 권한이 필요합니다.
        </p>

        {connected === null ? (
          <p className="mt-4 text-sm text-[#a39e98]">연결 상태 확인 중...</p>
        ) : connected ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-md border border-[#1aae39]/30 bg-[#1aae39]/5 px-3 py-2">
              <span className="text-sm text-[rgba(0,0,0,0.85)]">
                ✓ 연결됨{workspace ? ` · ${workspace}` : ""}
              </span>
              <div className="flex items-center gap-3">
                <a
                  href="/api/notion/connect"
                  className="text-xs font-medium text-[#2383e2] underline hover:text-[#1b6fc4]"
                  title="연결 해제 없이 노션 인증 화면에서 페이지를 추가로 선택합니다"
                >
                  ＋ 페이지 추가 연결
                </a>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="text-xs text-[#615d59] underline hover:text-[#dd5b00]"
                >
                  연결 해제
                </button>
              </div>
            </div>
            <Field label="데이터베이스 선택">
              <div className="flex gap-2">
                <select
                  value={selectedDb}
                  onChange={(e) => setSelectedDb(e.target.value)}
                  className={inputClass}
                  disabled={loadingDbs || databases.length === 0}
                >
                  {databases.length === 0 && (
                    <option value="">
                      {loadingDbs ? "불러오는 중..." : "접근 가능한 DB 없음"}
                    </option>
                  )}
                  {databases.map((d) => (
                    <option key={d.dataSourceId} value={d.dataSourceId}>
                      {d.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => loadDatabases()}
                  disabled={loadingDbs}
                  className="shrink-0 whitespace-nowrap rounded-md border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-sm font-medium text-[#37352f] hover:border-[rgba(0,0,0,0.3)] disabled:opacity-50"
                  title="노션에서 공유를 바꿨다면 목록을 새로고침합니다"
                >
                  {loadingDbs ? "…" : "↻"}
                </button>
                <button
                  type="button"
                  onClick={handleSelectDatabase}
                  disabled={inspecting || !selectedDb}
                  className={`${primaryBtn} shrink-0 whitespace-nowrap`}
                >
                  {inspecting ? "불러오는 중..." : "불러오기"}
                </button>
              </div>
            </Field>
            <p className="text-xs text-[#a39e98]">
              찾는 DB가 없나요? 위의 <span className="font-medium text-[#2383e2]">＋ 페이지 추가 연결</span>로
              노션 인증 화면에서 페이지를 더 선택하면 됩니다(연결 해제 불필요). 노션에서 직접 공유했다면 ↻로 새로고침하세요.
            </p>
            {databases.length === 0 && !loadingDbs && (
              <p className="text-xs text-[#a39e98]">
                아직 권한 준 DB가 없습니다. <span className="font-medium text-[#2383e2]">＋ 페이지 추가 연결</span>을 눌러
                노션 인증 화면에서 사용할 페이지·데이터베이스를 선택하세요.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <a
              href="/api/notion/connect"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#191919] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Notion으로 연결하기
            </a>
            <p className="text-xs text-[#615d59]">
              Notion 인증 화면에서 사용할 페이지·데이터베이스를 선택하면 해당 항목에만 권한이
              부여됩니다.
            </p>
            <button
              type="button"
              onClick={() => setManualMode((v) => !v)}
              className="text-xs text-[#615d59] underline hover:text-[#213183]"
            >
              {manualMode ? "OAuth로 연결하기" : "또는 토큰으로 직접 연결"}
            </button>
            {manualMode && (
              <form
                className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2"
                onSubmit={handleInspect}
              >
                <Field label="Notion Integration 토큰" hint="ntn_... 또는 secret_...로 시작">
                  <input
                    type="password"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className={inputClass}
                    placeholder="ntn_xxxxxxxxxxxx"
                  />
                </Field>
                <Field label="데이터베이스 ID" hint="노션 DB URL의 32자리 hex 부분">
                  <input
                    type="text"
                    required
                    value={databaseId}
                    onChange={(e) => setDatabaseId(e.target.value)}
                    className={inputClass}
                    placeholder="abcdef0123456789..."
                  />
                </Field>
                <div className="md:col-span-2">
                  <button type="submit" disabled={inspecting} className={primaryBtn}>
                    {inspecting ? "조회 중..." : "DB 스키마 조회"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
          </Card>

          {error && (
            <div className="rounded-md border border-[#dd5b00]/30 bg-[#dd5b00]/5 px-4 py-3 text-sm text-[#dd5b00]">
              {error}
            </div>
          )}
        </div>
      )}

      {/* ===================== BUILDER — opens after a DB is loaded ===================== */}
      {inspect && (
        <div className="relative mx-auto max-w-5xl py-6">
          {/* top bar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setInspect(null);
                setSavedId(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-[#787774] transition-colors hover:bg-[rgba(55,53,47,0.06)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m15 18-6-6 6-6" />
              </svg>
              다른 DB 선택
            </button>
            <div className="flex items-center gap-2">
              {/* chart vs dashboard mode */}
              <div className="flex rounded-lg border border-[rgba(0,0,0,0.1)] bg-[#f7f7f5] p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setMode("chart");
                    setEditingBlock(null);
                  }}
                  className={
                    mode === "chart"
                      ? "rounded-md bg-white px-3 py-1 text-[#37352f] shadow-[rgba(15,15,15,0.08)_0px_1px_2px]"
                      : "rounded-md px-3 py-1 text-[#9b9a97] hover:text-[#37352f]"
                  }
                >
                  차트
                </button>
                <button
                  type="button"
                  onClick={() => setMode("dashboard")}
                  className={
                    mode === "dashboard"
                      ? "rounded-md bg-white px-3 py-1 text-[#37352f] shadow-[rgba(15,15,15,0.08)_0px_1px_2px]"
                      : "rounded-md px-3 py-1 text-[#9b9a97] hover:text-[#37352f]"
                  }
                >
                  대시보드{blocks.length > 0 ? ` ${blocks.length}` : ""}
                </button>
              </div>
              {workspace && (
                <span className="rounded-full border border-[#1aae39]/30 bg-[#1aae39]/5 px-2.5 py-0.5 text-xs text-[#1aae39]">
                  ✓ {workspace}
                </span>
              )}
            </div>
          </div>

          {/* hero chart card — shown in chart mode, or when editing a dashboard chart block */}
          {(mode === "chart" || editingBlock !== null) && (
          <div className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.09)] bg-white shadow-[rgba(15,15,15,0.04)_0px_2px_8px]">
            {mode === "dashboard" && editingBlock !== null && (
              <div className="flex items-center justify-between gap-2 border-b border-[#2383e2]/20 bg-[#eaf4fd] px-3 py-1.5">
                <span className="text-xs font-medium text-[#2383e2]">차트 블록 편집 중 — 아래에서 바로 조정하세요</span>
                <button
                  type="button"
                  onClick={() => setEditingBlock(null)}
                  className="rounded-md bg-[#2383e2] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#1b6fc4]"
                >
                  완료
                </button>
              </div>
            )}
            {/* notion-style toolbar */}
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-[rgba(55,53,47,0.06)] px-2.5 py-1">
                <span className="text-[#9b9a97]">
                  <Ic.bar />
                </span>
                <span className="truncate text-[13px] font-medium text-[rgba(0,0,0,0.82)]">
                  {title || inspect.title || "제목 없음"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                className={
                  panelOpen
                    ? "rounded-md bg-[rgba(35,131,226,0.12)] p-1.5 text-[#2383e2] transition-colors"
                    : "rounded-md p-1.5 text-[#9b9a97] transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-[#37352f]"
                }
                aria-label="설정 보기"
                title="설정 보기"
              >
                <Ic.sliders />
              </button>
            </div>

            {/* chart tab strip — build several charts into one embed */}
            {mode === "chart" && (
            <div className="flex items-center gap-1 overflow-x-auto border-t border-[rgba(0,0,0,0.06)] px-2.5 py-1.5">
              {tabs.map((tb, i) => {
                const activeTab = editingTab === i;
                return (
                  <div
                    key={i}
                    draggable
                    onDragStart={() => setDragTab(i)}
                    onDragOver={(e) => {
                      if (dragTab !== null && dragTab !== i) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragTab !== null) moveTab(dragTab, i);
                      setDragTab(null);
                    }}
                    onDragEnd={() => setDragTab(null)}
                    className={`group flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-xs transition-colors ${
                      activeTab
                        ? "border-[#2383e2]/40 bg-[#eaf4fd] text-[#2383e2]"
                        : "border-transparent text-[#787774] hover:bg-[rgba(55,53,47,0.06)]"
                    }`}
                  >
                    {activeTab ? (
                      <input
                        value={tb.name}
                        onChange={(e) => renameTab(i, e.target.value)}
                        size={Math.max(4, tb.name.length)}
                        className="cursor-text bg-transparent font-medium text-[#2383e2] focus:outline-none"
                        aria-label="탭 이름"
                      />
                    ) : (
                      <button type="button" onClick={() => selectTab(i)} className="cursor-pointer font-medium">
                        {tb.name || `차트 ${i + 1}`}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeTab(i)}
                      className="rounded px-0.5 text-[#9b9a97] opacity-0 hover:bg-[rgba(55,53,47,0.12)] group-hover:opacity-100"
                      aria-label="탭 삭제"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addTab}
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#787774] hover:bg-[rgba(55,53,47,0.06)]"
                title="현재 차트를 새 탭으로 추가합니다"
              >
                ＋ {tabs.length === 0 ? "여러 차트(탭)로 만들기" : "차트 탭"}
              </button>
              {tabs.length > 0 && (
                <span className="ml-auto shrink-0 pr-1 text-[11px] text-[#9b9a97]">
                  {tabs.length}개 탭이 한 임베드에 포함됩니다
                </span>
              )}
            </div>
            )}

            {/* per-chart filter bar — always visible, like the dashboard composer's */}
            <div className="border-t border-[rgba(0,0,0,0.06)] px-3 py-2">
              <DashFilterBar
                properties={properties}
                filters={chartFilters}
                setFilters={setChartFilters}
                join={chartFilterJoin}
                setJoin={setChartFilterJoin}
              />
              {chartFilters.length > 0 && (
                <p className="mt-1.5 text-[11px] text-[#9b9a97]">
                  필터는 이 차트에만 적용되어 임베드에 함께 저장됩니다.
                </p>
              )}
            </div>

            {/* chart */}
            <div
              className="px-4 pb-5 pt-1"
              style={{ background: style.background === "transparent" ? "#fff" : style.background }}
            >
              {xKey && series.length > 0 && previewData.length > 0 ? (
                <div className="h-[460px]">
                  <ChartView type={chartType} data={previewData} config={config} />
                </div>
              ) : (
                <div className="flex h-[460px] items-center justify-center text-center">
                  <p className="px-6 text-sm text-[#a39e98]">
                    표시할 데이터가 없습니다.
                    <br />
                    설정에서 X축과 데이터 계열을 골라보세요.
                  </p>
                </div>
              )}
            </div>
          </div>
          )}

          {/* dashboard composer — top of the dashboard tab so it's seen immediately */}
          {mode === "dashboard" && (
            <DashboardComposer
              dashTitle={dashTitle}
              setDashTitle={setDashTitle}
              blocks={blocks}
              numericProps={numericProps}
              properties={properties}
              dashboard={dashboard}
              dashboardUrl={dashboardUrl}
              statColumns={statColumns}
              setStatColumns={setStatColumns}
              editingId={editingBlock}
              filters={tableFilters}
              setFilters={setTableFilters}
              filterJoin={filterJoin}
              setFilterJoin={setFilterJoin}
              onAddStat={addStatBlock}
              onAddTable={addTableBlock}
              onAddChart={addChartBlock}
              onEditChart={editChartBlock}
              onUpdate={updateBlock}
              onRemove={removeBlock}
              onMove={moveBlock}
              onReorder={reorderBlock}
              copied={copied}
              setCopied={setCopied}
            />
          )}

          {/* ===== source database table ===== */}
          <div className="mt-4 overflow-hidden rounded-xl border border-[rgba(0,0,0,0.09)] bg-white shadow-[rgba(15,15,15,0.04)_0px_2px_8px]">
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[#9b9a97]">
                  <Ic.source />
                </span>
                <span className="text-[13px] font-semibold text-[rgba(0,0,0,0.82)]">
                  데이터베이스
                </span>
                <span className="text-xs text-[#9b9a97]">
                  {inspect.title ? `${inspect.title} · ` : ""}
                  {properties.length}개 속성 · {inspect.rows.length}개 행
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowData((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-[#787774] transition-colors hover:bg-[rgba(55,53,47,0.06)]"
              >
                {showData ? "표 숨기기" : "표 보기"}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className={`transition-transform ${showData ? "" : "-rotate-90"}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
            {showData && (
              <DataTable
                properties={properties}
                rows={processedRows}
                totalCount={inspect.rows.length}
                highlight={new Set([xKey, ...series.map((s) => s.key)])}
                sorts={tableSorts}
                setSorts={setTableSorts}
                filters={tableFilters}
                setFilters={setTableFilters}
                join={filterJoin}
                setJoin={setFilterJoin}
              />
            )}
          </div>

          {/* embed bar (chart mode) */}
          {mode === "chart" && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-[rgba(0,0,0,0.09)] bg-white p-3.5 shadow-[rgba(15,15,15,0.04)_0px_2px_8px]">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[rgba(0,0,0,0.85)]">
                    임베드 URL
                    {tabs.length > 0 && (
                      <span className="ml-1.5 rounded-full bg-[#eaf4fd] px-1.5 py-0.5 text-[11px] font-medium text-[#2383e2]">
                        {tabs.length}개 탭
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-[#9b9a97]">
                    노션 <code className="rounded bg-[#f1f1ef] px-1">/embed</code> 블록에 붙여넣으세요. 저장 시점 데이터로 고정됩니다.
                    {tabs.length > 0 && " 임베드 안에서 탭으로 차트를 전환할 수 있습니다."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!snapshotUrl) return;
                    navigator.clipboard.writeText(snapshotUrl);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                  disabled={!snapshotUrl}
                  className={`${primaryBtn} shrink-0`}
                >
                  {copied ? "복사됨 ✓" : "복사"}
                </button>
              </div>
              {snapshotUrl ? (
                <input
                  readOnly
                  value={snapshotUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`${inputClass} mt-2 font-mono text-xs`}
                />
              ) : (
                <p className="mt-2 text-xs text-[#a39e98]">
                  먼저 표시할 데이터를 선택하세요.
                </p>
              )}
            </div>
          </div>
          )}

          {error && (
            <div className="mt-4 rounded-md border border-[#dd5b00]/30 bg-[#dd5b00]/5 px-4 py-3 text-sm text-[#dd5b00]">
              {error}
            </div>
          )}

          {/* ===== Notion-style "설정 보기" floating panel (beside the chart) ===== */}
          {panelOpen && (
            <>
              {/* invisible click-catcher to close on outside click */}
              <div className="fixed inset-0 z-20" onClick={() => setPanelOpen(false)} />
              <div className="absolute right-0 top-[92px] z-30 flex max-h-[78vh] w-[330px] flex-col overflow-hidden rounded-xl border border-[rgba(0,0,0,0.1)] bg-white shadow-[rgba(15,15,15,0.16)_0px_10px_36px]">
                {/* header */}
                <div className="flex items-center justify-between px-4 pb-1.5 pt-3.5">
                  <span className="text-[15px] font-semibold text-[rgba(0,0,0,0.85)]">
                    설정 보기
                  </span>
                  <button
                    type="button"
                    onClick={() => setPanelOpen(false)}
                    aria-label="닫기"
                    className="rounded-full p-1 text-[#9b9a97] hover:bg-[rgba(55,53,47,0.08)]"
                  >
                    <Ic.x />
                  </button>
                </div>

                {/* title row */}
                <div className="px-3 pb-1 pt-1">
                  <div className="flex items-center gap-2 rounded-md border border-[rgba(0,0,0,0.09)] bg-[#f7f7f5] px-2.5 py-2">
                    <span className="text-[#9b9a97]">
                      <Ic.bar />
                    </span>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="제목 없음"
                      className="flex-1 bg-transparent text-sm font-medium text-[rgba(0,0,0,0.85)] placeholder:text-[#9b9a97] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pb-4">
                  {/* layout + chart type */}
                  <PanelSection>
                    <RowStatic icon={<Ic.layout />} label="레이아웃" value="차트" />
                    <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9b9a97]">
                      <span className="px-0.5">차트 유형</span>
                    </div>
                    <div className="px-2 pb-1">
                      <div className="flex flex-wrap gap-1 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#f7f7f5] p-1">
                        {CHART_TYPES.map((t) => (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => setChartType(t.value)}
                            title={t.label}
                            className={
                              chartType === t.value
                                ? "flex h-9 flex-1 items-center justify-center rounded-md bg-white text-[#2383e2] shadow-[rgba(15,15,15,0.1)_0px_1px_2px] [&_svg]:h-[18px] [&_svg]:w-[18px]"
                                : "flex h-9 flex-1 items-center justify-center rounded-md text-[#9b9a97] transition-colors hover:text-[#37352f] [&_svg]:h-[18px] [&_svg]:w-[18px]"
                            }
                          >
                            {t.icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  </PanelSection>

                  <Divider />

                  {/* data */}
                  <PanelSection title="데이터">
                    <PropertyPicker
                      icon={<Ic.target />}
                      label={
                        chartType === "pie" || chartType === "radialBar" || chartType === "funnel"
                          ? "분류 기준"
                          : chartType === "hbar"
                            ? "항목 (세로축)"
                            : "X축 (가로)"
                      }
                      value={xKey}
                      options={isScatter ? numericProps : properties}
                      open={openRow === "xprop"}
                      onToggle={() => toggleRow("xprop")}
                      onSelect={(name) => {
                        setXKey(name);
                        setOpenRow(null);
                      }}
                    />

                    <RowExpand
                      icon={<Ic.yaxis />}
                      label={
                        chartType === "pie" || chartType === "radialBar" || chartType === "funnel"
                          ? "값 (크기 기준)"
                          : "Y축 (데이터 계열)"
                      }
                      value={
                        series.length === 1
                          ? series[0].label ?? series[0].key
                          : `${series.length}개 계열`
                      }
                      open={openRow === "series"}
                      onToggle={() => toggleRow("series")}
                    >
                      <div className="space-y-3">
                        {series.map((s, i) => (
                          <SeriesCard
                            key={i}
                            index={i}
                            series={s}
                            chartType={chartType}
                            isCartesian={isCartesian}
                            isScatter={isScatter}
                            isDualAxis={isDualAxis}
                            numericProps={numericProps}
                            dateProps={properties.filter((p) => DATE_TYPES.has(p.type))}
                            paletteColor={
                              (style.palette ?? DEFAULT_PALETTE)[
                                i % (style.palette ?? DEFAULT_PALETTE).length
                              ]
                            }
                            onChange={(patch) => updateSeries(i, patch)}
                            onRemove={series.length > 1 ? () => removeSeries(i) : undefined}
                          />
                        ))}
                        <button type="button" onClick={addSeries} className={ghostBtn}>
                          + 계열 추가
                        </button>
                        {(chartType === "pie" || chartType === "radialBar" || chartType === "funnel") &&
                          series.length > 1 && (
                            <p className="text-xs text-[#a39e98]">
                              이 차트는 첫 번째 계열만 사용합니다.
                            </p>
                          )}
                        {chartType === "bubble" && (
                          <p className="text-xs text-[#a39e98]">
                            버블: X축·Y축은 숫자 속성, 점 크기는 계열의 “크기 기준”으로 정합니다.
                          </p>
                        )}
                      </div>
                    </RowExpand>

                    {!isScatter && (
                      <RowSelect
                        icon={<Ic.group />}
                        label="집계 방식"
                        value={aggregation}
                        onChange={(e) => setAggregation(e.target.value as Aggregation)}
                      >
                        <option value="sum">합계</option>
                        <option value="count">개수</option>
                        <option value="avg">평균</option>
                        <option value="min">최소</option>
                        <option value="max">최대</option>
                        <option value="median">중앙값</option>
                        <option value="none">집계 안 함</option>
                      </RowSelect>
                    )}

                    {!isScatter && (
                      <RowSelect
                        icon={<Ic.sort />}
                        label="정렬 기준"
                        value={sortBy === "none" ? "none" : `${sortBy}-${sortDir}`}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "none") {
                            setSortBy("none");
                          } else {
                            const [b, d] = v.split("-");
                            setSortBy(b as "x" | "y");
                            setSortDir(d as "asc" | "desc");
                          }
                        }}
                      >
                        <option value="none">정렬 안 함</option>
                        <option value="x-asc">이름 낮음 → 높음</option>
                        <option value="x-desc">이름 높음 → 낮음</option>
                        <option value="y-asc">합계 낮음 → 높음</option>
                        <option value="y-desc">합계 높음 → 낮음</option>
                      </RowSelect>
                    )}

                    <RowExpand
                      icon={<Ic.filter />}
                      label="필터"
                      value={chartFilters.length > 0 ? `${chartFilters.length}개` : "없음"}
                      open={openRow === "filter"}
                      onToggle={() => toggleRow("filter")}
                    >
                      <DashFilterBar
                        properties={properties}
                        filters={chartFilters}
                        setFilters={setChartFilters}
                        join={chartFilterJoin}
                        setJoin={setChartFilterJoin}
                      />
                    </RowExpand>

                    {!isScatter && (
                      <RowToggleRow
                        icon={<Ic.eyeOff />}
                        label="0 값 숨기기"
                        checked={!!style.omitZero}
                        onChange={(v) => setStyle((s) => ({ ...s, omitZero: v }))}
                      />
                    )}

                    {(chartType === "bar" ||
                      chartType === "hbar" ||
                      chartType === "area" ||
                      chartType === "combo") && (
                      <RowToggleRow
                        icon={<Ic.stack />}
                        label="누적"
                        checked={!!style.stacked}
                        onChange={(v) => setStyle((s) => ({ ...s, stacked: v }))}
                      />
                    )}
                    {chartType === "pie" && (
                      <RowToggleRow
                        icon={<Ic.stack />}
                        label="도넛"
                        checked={!!style.donut}
                        onChange={(v) => setStyle((s) => ({ ...s, donut: v }))}
                      />
                    )}

                    {isCartesian && (
                      <RowExpand
                        icon={<Ic.range />}
                        label="범위"
                        value={
                          leftAxis.min != null || leftAxis.max != null ? "사용자 지정" : "자동"
                        }
                        open={openRow === "range"}
                        onToggle={() => toggleRow("range")}
                      >
                        <div className="space-y-2.5">
                          {isScatter && (
                            <AxisEditor title="X 축" axis={xAxis} onChange={setXAxis} showRange />
                          )}
                          <AxisEditor
                            title="왼쪽 Y 축"
                            axis={leftAxis}
                            onChange={setLeftAxis}
                            showRange
                          />
                          {hasRight && (
                            <AxisEditor
                              title="오른쪽 Y 축 (보조)"
                              axis={rightAxis}
                              onChange={setRightAxis}
                              showRange
                            />
                          )}
                        </div>
                      </RowExpand>
                    )}

                    {!isScatter && (
                      <RowExpand
                        icon={<Ic.count />}
                        label="최대 개수"
                        value={limit > 0 ? `${limit}개` : "전체"}
                        open={openRow === "limit"}
                        onToggle={() => toggleRow("limit")}
                      >
                        <input
                          type="number"
                          min={0}
                          value={limit}
                          onChange={(e) => setLimit(Number(e.target.value))}
                          className={inputClass}
                          placeholder="0 = 전체"
                        />
                      </RowExpand>
                    )}
                  </PanelSection>

                  <Divider />

                  {/* style */}
                  <PanelSection title="스타일">
                    <RowExpand
                      icon={<Ic.color />}
                      label="색상"
                      value={
                        PALETTE_PRESETS.find(
                          (p) => JSON.stringify(p.colors) === JSON.stringify(style.palette),
                        )?.name ?? "사용자 지정"
                      }
                      open={openRow === "color"}
                      onToggle={() => toggleRow("color")}
                    >
                      <div className="flex flex-wrap gap-2">
                        {PALETTE_PRESETS.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => setStyle((s) => ({ ...s, palette: p.colors }))}
                            className={
                              JSON.stringify(style.palette) === JSON.stringify(p.colors)
                                ? "flex items-center gap-2 rounded-md border border-[#37352f] bg-white px-2.5 py-1.5"
                                : "flex items-center gap-2 rounded-md border border-[rgba(0,0,0,0.1)] bg-white px-2.5 py-1.5 hover:border-[rgba(0,0,0,0.25)]"
                            }
                          >
                            <span className="flex">
                              {p.colors.slice(0, 5).map((c) => (
                                <span
                                  key={c}
                                  className="h-3.5 w-3.5 rounded-sm"
                                  style={{ background: c, marginLeft: -2, border: "1px solid #fff" }}
                                />
                              ))}
                            </span>
                            <span className="text-xs">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    </RowExpand>

                    <RowExpand
                      icon={<Ic.sliders />}
                      label="스타일 옵션 더 보기"
                      value=""
                      open={openRow === "more"}
                      onToggle={() => toggleRow("more")}
                    >
                      <div className="space-y-3">
                        <Field label="차트 배경">
                          <div className="flex flex-wrap items-center gap-2">
                            {BG_PRESETS.map((b) => (
                              <button
                                key={b.name}
                                type="button"
                                onClick={() => setStyle((s) => ({ ...s, background: b.color }))}
                                className={
                                  style.background === b.color
                                    ? "rounded-md border border-[#37352f] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#37352f]"
                                    : "rounded-md border border-[rgba(0,0,0,0.1)] bg-white px-2.5 py-1.5 text-xs hover:border-[rgba(0,0,0,0.25)]"
                                }
                              >
                                {b.name}
                              </button>
                            ))}
                            <ColorDot
                              value={
                                style.background === "transparent"
                                  ? "#ffffff"
                                  : style.background ?? "#ffffff"
                              }
                              onChange={(c) => setStyle((s) => ({ ...s, background: c }))}
                            />
                          </div>
                        </Field>
                        <div className="flex items-center justify-between">
                          <Toggle
                            label="격자선"
                            checked={style.showGrid !== false}
                            onChange={(v) => setStyle((s) => ({ ...s, showGrid: v }))}
                          />
                          <ColorDot
                            value={style.gridColor ?? "#e5e5e5"}
                            onChange={(c) => setStyle((s) => ({ ...s, gridColor: c }))}
                          />
                        </div>
                        <Field label="범례 위치">
                          <select
                            value={style.legend ?? "bottom"}
                            onChange={(e) =>
                              setStyle((s) => ({ ...s, legend: e.target.value as LegendPosition }))
                            }
                            className={inputClass}
                          >
                            <option value="top">위</option>
                            <option value="bottom">아래</option>
                            <option value="left">왼쪽</option>
                            <option value="right">오른쪽</option>
                            <option value="none">숨김</option>
                          </select>
                        </Field>
                        <Field label="숫자 표시 (소수점 · 반올림)">
                          <div className="flex items-center gap-2">
                            <select
                              value={style.decimals ?? "auto"}
                              onChange={(e) =>
                                setStyle((s) => ({
                                  ...s,
                                  decimals: e.target.value === "auto" ? undefined : Number(e.target.value),
                                }))
                              }
                              className={`${inputClass} flex-1`}
                              title="소수점 자릿수"
                            >
                              <option value="auto">자동</option>
                              <option value="0">정수 (0자리)</option>
                              <option value="1">소수 1자리</option>
                              <option value="2">소수 2자리</option>
                              <option value="3">소수 3자리</option>
                              <option value="4">소수 4자리</option>
                            </select>
                            <select
                              value={style.rounding ?? "round"}
                              onChange={(e) =>
                                setStyle((s) => ({
                                  ...s,
                                  rounding: e.target.value as "round" | "ceil" | "floor",
                                }))
                              }
                              className={`${inputClass} flex-1`}
                              disabled={style.decimals == null}
                              title="반올림 방식"
                            >
                              <option value="round">반올림</option>
                              <option value="ceil">올림</option>
                              <option value="floor">내림</option>
                            </select>
                          </div>
                          <p className="mt-1 text-[11px] text-[#9b9a97]">
                            소수점은 항상 마침표(.)로 표시됩니다. 반올림 방식은 자릿수를 지정해야 적용됩니다.
                          </p>
                        </Field>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <Toggle
                            label="데이터 레이블"
                            checked={!!style.showDataLabels}
                            onChange={(v) => setStyle((s) => ({ ...s, showDataLabels: v }))}
                          />
                          {(chartType === "line" ||
                            chartType === "area" ||
                            chartType === "combo") && (
                            <Toggle
                              label="부드러운 곡선"
                              checked={!!style.smooth}
                              onChange={(v) => setStyle((s) => ({ ...s, smooth: v }))}
                            />
                          )}
                        </div>
                        {(chartType === "area" || chartType === "radar" || chartType === "combo") && (
                          <Field label="채움 투명도">
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={style.fillOpacity ?? 0.25}
                              onChange={(e) =>
                                setStyle((s) => ({ ...s, fillOpacity: Number(e.target.value) }))
                              }
                              className="w-full accent-[#37352f]"
                            />
                          </Field>
                        )}
                      </div>
                    </RowExpand>

                    <RowStatic
                      icon={<Ic.source />}
                      label="데이터 원본"
                      value={inspect.title ?? `${properties.length}개 속성`}
                    />
                  </PanelSection>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/* ---------- Dashboard filter bar (shares the table's filter state) ---------- */

function DashFilterBar({
  properties,
  filters,
  setFilters,
  join,
  setJoin,
}: {
  properties: NotionPropertyMeta[];
  filters: FilterRule[];
  setFilters: React.Dispatch<React.SetStateAction<FilterRule[]>>;
  join: "and" | "or";
  setJoin: (j: "and" | "or") => void;
}) {
  const propType = (k: string) => properties.find((p) => p.name === k)?.type ?? "rich_text";
  function addFilter() {
    const p = properties[0];
    if (!p) return;
    setFilters((f) => [...f, { key: p.name, op: opsForType(p.type)[0][0], value: "" }]);
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 text-xs text-[#9b9a97]">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
        필터
      </span>
      {filters.length > 1 && (
        <div className="flex rounded-md border border-[rgba(0,0,0,0.12)] p-0.5">
          <button type="button" onClick={() => setJoin("and")} className={join === "and" ? "rounded bg-[#2383e2] px-1.5 py-0.5 text-[10px] font-medium text-white" : "rounded px-1.5 py-0.5 text-[10px] font-medium text-[#787774]"}>AND</button>
          <button type="button" onClick={() => setJoin("or")} className={join === "or" ? "rounded bg-[#2383e2] px-1.5 py-0.5 text-[10px] font-medium text-white" : "rounded px-1.5 py-0.5 text-[10px] font-medium text-[#787774]"}>OR</button>
        </div>
      )}
      {filters.map((f, idx) => {
        const ops = opsForType(propType(f.key));
        const needsValue = f.op !== "empty" && f.op !== "nempty";
        return (
          <div key={idx} className="flex items-center gap-1 rounded-md border border-[rgba(0,0,0,0.12)] bg-white px-1 py-0.5">
            <select
              value={f.key}
              onChange={(e) => {
                const nk = e.target.value;
                const nop = opsForType(propType(nk))[0][0];
                setFilters((p) => p.map((x, i) => (i === idx ? { ...x, key: nk, op: nop } : x)));
              }}
              className={tableSelect}
            >
              {properties.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
            <select
              value={f.op}
              onChange={(e) => setFilters((p) => p.map((x, i) => (i === idx ? { ...x, op: e.target.value } : x)))}
              className={tableSelect}
            >
              {ops.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            {needsValue && (
              <input
                value={f.value}
                onChange={(e) => setFilters((p) => p.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))}
                className="w-16 rounded border border-[rgba(0,0,0,0.12)] bg-white px-1 py-0.5 text-xs focus:border-[#2383e2] focus:outline-none"
                placeholder="값"
              />
            )}
            <button type="button" onClick={() => setFilters((p) => p.filter((_, i) => i !== idx))} className="px-0.5 text-[#9b9a97] hover:text-[#dd5b00]" aria-label="필터 삭제">✕</button>
          </div>
        );
      })}
      <button type="button" onClick={addFilter} className="rounded-md border border-[rgba(0,0,0,0.12)] bg-white px-2 py-1 text-xs font-medium text-[#2383e2] hover:border-[#2383e2]/50">
        ＋ 필터
      </button>
    </div>
  );
}

/* ---------- Dashboard composer ---------- */

function DashboardComposer({
  dashTitle,
  setDashTitle,
  blocks,
  numericProps,
  properties,
  dashboard,
  dashboardUrl,
  statColumns,
  setStatColumns,
  editingId,
  filters,
  setFilters,
  filterJoin,
  setFilterJoin,
  onAddStat,
  onAddTable,
  onAddChart,
  onEditChart,
  onUpdate,
  onRemove,
  onMove,
  onReorder,
  copied,
  setCopied,
}: {
  dashTitle: string;
  setDashTitle: (v: string) => void;
  blocks: DashBlockEdit[];
  numericProps: NotionPropertyMeta[];
  properties: NotionPropertyMeta[];
  dashboard: DashboardSnapshot;
  dashboardUrl: string;
  statColumns: number;
  setStatColumns: (v: number) => void;
  editingId: number | null;
  filters: FilterRule[];
  setFilters: React.Dispatch<React.SetStateAction<FilterRule[]>>;
  filterJoin: "and" | "or";
  setFilterJoin: (j: "and" | "or") => void;
  onAddStat: () => void;
  onAddTable: () => void;
  onAddChart: () => void;
  onEditChart: (b: DashBlockEdit) => void;
  onUpdate: (id: number, patch: Partial<DashBlockEdit>) => void;
  onRemove: (id: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onReorder: (from: number, to: number) => void;
  copied: boolean;
  setCopied: (v: boolean) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const kindLabel = (k: DashBlockEdit["kind"]) =>
    k === "stat" ? "숫자 카드" : k === "table" ? "표" : "차트";
  const addBtn =
    "inline-flex items-center gap-1 rounded-md border border-[rgba(0,0,0,0.12)] bg-white px-2.5 py-1.5 text-xs font-medium text-[#37352f] hover:border-[rgba(0,0,0,0.3)]";

  return (
    <div className="mt-4 space-y-4">
      {/* composer header */}
      <div className="rounded-xl border border-[rgba(0,0,0,0.09)] bg-white p-3.5 shadow-[rgba(15,15,15,0.04)_0px_2px_8px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[#9b9a97]">
              <Ic.layout />
            </span>
            <span className="text-sm font-semibold text-[rgba(0,0,0,0.85)]">대시보드 구성</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={onAddStat} className={addBtn}>＋ 숫자 카드</button>
            <button type="button" onClick={onAddTable} className={addBtn}>＋ 표</button>
            <button type="button" onClick={onAddChart} className={addBtn}>＋ 차트</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={dashTitle}
            onChange={(e) => setDashTitle(e.target.value)}
            className={`${inputClass} flex-1`}
            placeholder="대시보드 제목 (선택)"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-[#787774]">
            숫자 카드 단
            <select
              value={statColumns}
              onChange={(e) => setStatColumns(Number(e.target.value))}
              className="cursor-pointer rounded-md border border-[rgba(0,0,0,0.12)] bg-white px-2 py-1.5 text-xs text-[rgba(0,0,0,0.8)] focus:border-[#2383e2] focus:outline-none"
              title="숫자 카드 가로 칸 수"
            >
              <option value={0}>자동</option>
              <option value={1}>1단</option>
              <option value={2}>2단</option>
              <option value={3}>3단</option>
              <option value={4}>4단</option>
            </select>
          </label>
        </div>
        <div className="mt-3 border-t border-[rgba(0,0,0,0.06)] pt-2.5">
          <DashFilterBar
            properties={properties}
            filters={filters}
            setFilters={setFilters}
            join={filterJoin}
            setJoin={setFilterJoin}
          />
          <p className="mt-1.5 text-[11px] text-[#9b9a97]">필터는 모든 숫자 카드·표·차트에 함께 적용됩니다.</p>
        </div>
      </div>

      {/* live preview — drag blocks here to rearrange the layout */}
      {blocks.length > 0 && (
        <div className="rounded-xl border border-[rgba(0,0,0,0.09)] bg-[#fafafa] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#9b9a97]">
            미리보기 · 블록을 드래그해 위치를 바꿀 수 있어요
          </p>
          <DashboardView
            dash={dashboard}
            editable
            onReorder={onReorder}
            onRemove={(i) => onRemove(blocks[i].id)}
          />
        </div>
      )}

      {/* block editors */}
      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[rgba(0,0,0,0.18)] py-8 text-center text-sm text-[#a39e98]">
          블록을 추가하세요. 숫자 카드(평균·합계 등) · 표 · 차트를 한 임베드에 쌓을 수 있습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {blocks.map((b, i) => (
            <div
              key={b.id}
              onDragOver={(e) => {
                if (dragIdx !== null && dragIdx !== i) {
                  e.preventDefault();
                  setOverIdx(i);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null) onReorder(dragIdx, i);
                setDragIdx(null);
                setOverIdx(null);
              }}
              className={`rounded-lg border bg-[#fbfbfa] p-3 transition-colors ${
                overIdx === i && dragIdx !== null && dragIdx !== i
                  ? "border-[#2383e2] ring-1 ring-[#2383e2]/40"
                  : "border-[rgba(0,0,0,0.1)]"
              } ${dragIdx === i ? "opacity-40" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span
                  draggable
                  onDragStart={(e) => {
                    setDragIdx(i);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setOverIdx(null);
                  }}
                  className="cursor-grab select-none px-0.5 text-[#bdbbb7] hover:text-[#787774] active:cursor-grabbing"
                  title="드래그하여 위치 이동"
                  aria-label="드래그 핸들"
                >
                  ⠿
                </span>
                <span className="rounded bg-[rgba(55,53,47,0.06)] px-1.5 py-0.5 text-[11px] font-medium text-[#787774]">
                  {kindLabel(b.kind)}
                </span>
                <input
                  value={b.title ?? ""}
                  onChange={(e) => onUpdate(b.id, { title: e.target.value || undefined })}
                  className={`${inputClass} flex-1`}
                  placeholder="블록 제목"
                />
                <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} className="rounded px-1 text-[#9b9a97] hover:bg-[rgba(55,53,47,0.08)] disabled:opacity-30" aria-label="위로">↑</button>
                <button type="button" onClick={() => onMove(i, 1)} disabled={i === blocks.length - 1} className="rounded px-1 text-[#9b9a97] hover:bg-[rgba(55,53,47,0.08)] disabled:opacity-30" aria-label="아래로">↓</button>
                <button type="button" onClick={() => onRemove(b.id)} className="rounded px-1 text-[#dd5b00] hover:bg-[#dd5b00]/10" aria-label="삭제">✕</button>
              </div>

              {b.kind === "stat" && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <select
                    value={b.valueKey}
                    onChange={(e) => onUpdate(b.id, { valueKey: e.target.value })}
                    className={inputClass}
                    title="값 속성"
                  >
                    <option value={COUNT_KEY}>개수 (count)</option>
                    {numericProps.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    value={b.agg}
                    onChange={(e) => onUpdate(b.id, { agg: e.target.value as Aggregation })}
                    className={inputClass}
                    title="집계"
                  >
                    <option value="avg">평균</option>
                    <option value="sum">합계</option>
                    <option value="count">개수</option>
                    <option value="min">최소</option>
                    <option value="max">최대</option>
                    <option value="median">중앙값</option>
                  </select>
                  <input
                    value={b.caption ?? ""}
                    onChange={(e) => onUpdate(b.id, { caption: e.target.value || undefined })}
                    className={inputClass}
                    placeholder="카드 안 설명 (예: 평균 석차등급)"
                  />
                  <input
                    value={b.unit ?? ""}
                    onChange={(e) => onUpdate(b.id, { unit: e.target.value || undefined })}
                    className={inputClass}
                    placeholder="단위 (예: 점, %)"
                  />
                </div>
              )}
              {b.kind === "chart" && (
                <div className="mt-2 flex items-center gap-2">
                  {editingId === b.id ? (
                    <span className="rounded-md bg-[#eaf4fd] px-2 py-1 text-xs font-medium text-[#2383e2]">
                      편집 중 — 위 차트 편집기에서 조정하세요
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onEditChart(b)}
                      className="rounded-md border border-[rgba(0,0,0,0.12)] bg-white px-2.5 py-1 text-xs font-medium text-[#2383e2] hover:border-[#2383e2]/50"
                    >
                      ✎ 차트 편집
                    </button>
                  )}
                  <span className="text-xs text-[#9b9a97]">{b.t} · 클릭하면 차트 탭처럼 조정합니다</span>
                </div>
              )}
              {b.kind === "table" && (
                <p className="mt-2 text-xs text-[#9b9a97]">
                  현재 데이터표(필터·정렬 반영, 최대 200행)가 들어갑니다.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* embed url */}
      <div className="rounded-xl border border-[rgba(0,0,0,0.09)] bg-white p-3.5 shadow-[rgba(15,15,15,0.04)_0px_2px_8px]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[rgba(0,0,0,0.85)]">대시보드 임베드 URL</p>
            <p className="mt-0.5 text-xs text-[#9b9a97]">
              노션 <code className="rounded bg-[#f1f1ef] px-1">/embed</code> 블록에 붙여넣으세요. 저장 시점 데이터로 고정됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!dashboardUrl) return;
              navigator.clipboard.writeText(dashboardUrl);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
            disabled={!dashboardUrl}
            className={`${primaryBtn} shrink-0`}
          >
            {copied ? "복사됨 ✓" : "복사"}
          </button>
        </div>
        {dashboardUrl ? (
          <input
            readOnly
            value={dashboardUrl}
            onFocus={(e) => e.currentTarget.select()}
            className={`${inputClass} mt-2 font-mono text-xs`}
          />
        ) : (
          <p className="mt-2 text-xs text-[#a39e98]">블록을 한 개 이상 추가하세요.</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Series card ---------- */

function SeriesCard({
  index,
  series,
  chartType,
  isCartesian,
  isScatter,
  isDualAxis,
  numericProps,
  dateProps,
  paletteColor,
  onChange,
  onRemove,
}: {
  index: number;
  series: SeriesConfig;
  chartType: ChartType;
  isCartesian: boolean;
  isScatter: boolean;
  isDualAxis: boolean;
  numericProps: NotionPropertyMeta[];
  dateProps: NotionPropertyMeta[];
  paletteColor: string;
  onChange: (patch: Partial<SeriesConfig>) => void;
  onRemove?: () => void;
}) {
  const trend = series.trendline?.type ?? "none";
  const showTrend = isCartesian && chartType !== "bar" && chartType !== "hbar";
  return (
    <div className="rounded-md border border-[rgba(0,0,0,0.1)] bg-[#fbfbfa] p-3">
      <div className="flex items-center gap-2">
        <ColorDot value={series.color ?? paletteColor} onChange={(c) => onChange({ color: c })} />
        <select
          value={series.key}
          onChange={(e) => {
            const key = e.target.value;
            onChange({
              key,
              label: key === COUNT_KEY ? "개수" : key,
              aggregation: key === COUNT_KEY ? "count" : series.aggregation,
            });
          }}
          className={`${inputClass} flex-1`}
        >
          <option value={COUNT_KEY}>개수 (count)</option>
          {numericProps.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} ({p.type})
            </option>
          ))}
          {isScatter &&
            dateProps.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.type})
              </option>
            ))}
        </select>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-[rgba(0,0,0,0.1)] px-2 py-1.5 text-xs text-[#dd5b00] hover:bg-[#dd5b00]/5"
            aria-label="계열 삭제"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          value={series.label ?? ""}
          onChange={(e) => onChange({ label: e.target.value })}
          className={inputClass}
          placeholder="표시 이름"
        />
        {series.key !== COUNT_KEY && !isScatter && (
          <select
            value={series.aggregation ?? ""}
            onChange={(e) =>
              onChange({ aggregation: (e.target.value || undefined) as SeriesConfig["aggregation"] })
            }
            className={inputClass}
          >
            <option value="">기본 집계</option>
            <option value="sum">합계</option>
            <option value="count">개수</option>
            <option value="avg">평균</option>
            <option value="min">최소</option>
            <option value="max">최대</option>
            <option value="median">중앙값</option>
          </select>
        )}
        {chartType === "combo" && (
          <select
            value={series.type ?? "bar"}
            onChange={(e) => onChange({ type: e.target.value as SeriesConfig["type"] })}
            className={inputClass}
          >
            <option value="bar">막대</option>
            <option value="line">선</option>
            <option value="area">영역</option>
            <option value="step">계단선</option>
            <option value="scatter">점</option>
          </select>
        )}
        {chartType === "bubble" && (
          <select
            value={series.sizeKey ?? ""}
            onChange={(e) => onChange({ sizeKey: e.target.value || undefined })}
            className={inputClass}
            title="점 크기 기준"
          >
            <option value="">크기: 균일</option>
            {numericProps.map((p) => (
              <option key={p.name} value={p.name}>
                크기: {p.name}
              </option>
            ))}
          </select>
        )}
        {isDualAxis && (
          <select
            value={series.axis ?? "left"}
            onChange={(e) => onChange({ axis: e.target.value as "left" | "right" })}
            className={inputClass}
          >
            <option value="left">왼쪽 축</option>
            <option value="right">오른쪽 축 (보조)</option>
          </select>
        )}
      </div>

      {showTrend && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[rgba(0,0,0,0.06)] pt-2">
          <span className="text-xs font-semibold text-[#615d59]">추세선</span>
          <select
            value={trend}
            onChange={(e) => {
              const type = e.target.value as TrendlineType;
              onChange({
                trendline:
                  type === "none"
                    ? undefined
                    : { ...series.trendline, type },
              });
            }}
            className={`${inputClass} w-auto flex-1`}
          >
            {TRENDLINES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {trend === "movingAverage" && (
            <input
              type="number"
              min={2}
              value={series.trendline?.period ?? 3}
              onChange={(e) =>
                onChange({
                  trendline: { ...series.trendline!, period: Number(e.target.value) },
                })
              }
              className={`${inputClass} w-20`}
              title="구간"
            />
          )}
          {trend === "polynomial" && (
            <input
              type="number"
              min={2}
              max={6}
              value={series.trendline?.degree ?? 2}
              onChange={(e) =>
                onChange({
                  trendline: { ...series.trendline!, degree: Number(e.target.value) },
                })
              }
              className={`${inputClass} w-20`}
              title="차수"
            />
          )}
          {trend !== "none" && (
            <ColorDot
              value={series.trendline?.color ?? series.color ?? paletteColor}
              onChange={(c) =>
                onChange({ trendline: { ...series.trendline!, color: c } })
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Source data table (Notion-style sort + filter) ---------- */

type SortRule = { key: string; dir: "asc" | "desc" };

function cmpVal(a: string | number | null, b: string | number | null): number {
  const ae = a === null || a === "";
  const be = b === null || b === "";
  if (ae && be) return 0;
  if (ae) return 1; // nulls last
  if (be) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

/** Apply the table's filters (AND/OR) + multi-sort to raw rows. Used by the table AND the chart. */
function processRows(
  rows: Record<string, unknown>[],
  filters: FilterRule[],
  join: "and" | "or",
  sorts: SortRule[],
): Record<string, unknown>[] {
  let arr = rows.map((row, i) => ({ row, i }));
  const active = filters.filter((f) => f.key);
  if (active.length) {
    arr = arr.filter(({ row }) => {
      const results = active.map((f) => matchFilter(extractValue(row[f.key]), f.op, f.value));
      return join === "or" ? results.some(Boolean) : results.every(Boolean);
    });
  }
  if (sorts.length) {
    arr = [...arr].sort((a, b) => {
      for (const s of sorts) {
        const c = cmpVal(extractValue(a.row[s.key]), extractValue(b.row[s.key]));
        if (c !== 0) return s.dir === "desc" ? -c : c;
      }
      return a.i - b.i;
    });
  }
  return arr.map((x) => x.row);
}

const tableSelect =
  "max-w-[120px] cursor-pointer truncate rounded border border-[rgba(0,0,0,0.12)] bg-white px-1.5 py-1 text-xs text-[rgba(0,0,0,0.8)] focus:border-[#2383e2] focus:outline-none";

function DataTable({
  properties,
  rows,
  totalCount,
  highlight,
  sorts,
  setSorts,
  filters,
  setFilters,
  join,
  setJoin,
}: {
  properties: NotionPropertyMeta[];
  rows: Record<string, unknown>[];
  totalCount: number;
  highlight: Set<string>;
  sorts: SortRule[];
  setSorts: React.Dispatch<React.SetStateAction<SortRule[]>>;
  filters: FilterRule[];
  setFilters: React.Dispatch<React.SetStateAction<FilterRule[]>>;
  join: "and" | "or";
  setJoin: (j: "and" | "or") => void;
}) {
  const [menu, setMenu] = useState<null | "sort" | "filter">(null);

  // User-defined column order (drag to reorder). Reconciled against the live
  // property list so newly added / removed properties never break the table.
  const [colOrder, setColOrder] = useState<string[] | null>(null);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const orderedProps = useMemo(() => {
    if (!colOrder) return properties;
    const byName = new Map(properties.map((p) => [p.name, p]));
    const inOrder = colOrder.filter((n) => byName.has(n));
    const appended = properties.filter((p) => !inOrder.includes(p.name)).map((p) => p.name);
    return [...inOrder, ...appended].map((n) => byName.get(n)!);
  }, [properties, colOrder]);

  function moveColumn(from: string, to: string) {
    if (from === to) return;
    const names = orderedProps.map((p) => p.name);
    const fi = names.indexOf(from);
    const ti = names.indexOf(to);
    if (fi < 0 || ti < 0) return;
    names.splice(fi, 1);
    names.splice(names.indexOf(to) + (ti > fi ? 1 : 0), 0, from);
    setColOrder(names);
  }

  const propType = (k: string) => properties.find((p) => p.name === k)?.type ?? "rich_text";

  if (properties.length === 0 || totalCount === 0) {
    return (
      <div className="border-t border-[rgba(0,0,0,0.06)] px-4 py-6 text-center text-sm text-[#a39e98]">
        표시할 행이 없습니다.
      </div>
    );
  }

  const sortOf = (k: string) => sorts.find((s) => s.key === k);
  const sortIdx = (k: string) => sorts.findIndex((s) => s.key === k);

  function headerClick(k: string) {
    setSorts((prev) => {
      if (prev.length === 1 && prev[0].key === k)
        return prev[0].dir === "asc" ? [{ key: k, dir: "desc" }] : [];
      return [{ key: k, dir: "asc" }];
    });
  }
  function addSort() {
    const used = new Set(sorts.map((s) => s.key));
    const next = properties.find((p) => !used.has(p.name)) ?? properties[0];
    setSorts((s) => [...s, { key: next.name, dir: "asc" }]);
  }
  function moveSort(i: number, d: -1 | 1) {
    setSorts((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addFilter() {
    const p = properties[0];
    setFilters((f) => [...f, { key: p.name, op: opsForType(p.type)[0][0], value: "" }]);
  }

  const tbBtn = (active: boolean) =>
    active
      ? "inline-flex items-center gap-1 rounded-md bg-[#eaf4fd] px-2 py-1 text-xs font-medium text-[#2383e2]"
      : "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#787774] hover:bg-[rgba(55,53,47,0.06)]";

  return (
    <div className="border-t border-[rgba(0,0,0,0.06)]">
      {/* toolbar */}
      <div className="relative flex items-center gap-1 px-3 py-1.5">
        <button type="button" onClick={() => setMenu((m) => (m === "sort" ? null : "sort"))} className={tbBtn(sorts.length > 0)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m3 8 4-4 4 4" /><path d="M7 4v16" /><path d="m21 16-4 4-4-4" /><path d="M17 20V4" />
          </svg>
          정렬{sorts.length > 0 ? ` ${sorts.length}` : ""}
        </button>
        <button type="button" onClick={() => setMenu((m) => (m === "filter" ? null : "filter"))} className={tbBtn(filters.length > 0)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
          </svg>
          필터{filters.length > 0 ? ` ${filters.length}` : ""}
        </button>
        <span className="ml-auto text-xs text-[#9b9a97]">
          {rows.length === totalCount ? `${totalCount}개 행` : `${rows.length} / ${totalCount}개 행`}
        </span>

        {menu && <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />}

        {menu === "sort" && (
          <div className="absolute left-2 top-9 z-30 w-[320px] rounded-lg border border-[rgba(0,0,0,0.1)] bg-white p-2 shadow-[rgba(15,15,15,0.16)_0px_8px_28px]">
            {sorts.length === 0 && (
              <p className="px-1 py-1.5 text-xs text-[#9b9a97]">정렬 기준이 없습니다. 위에서부터 우선 적용됩니다.</p>
            )}
            <div className="space-y-1">
              {sorts.map((s, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <span className="w-4 shrink-0 text-center text-xs text-[#9b9a97]">{idx + 1}</span>
                  <select
                    value={s.key}
                    onChange={(e) => setSorts((p) => p.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x)))}
                    className={`${tableSelect} flex-1`}
                  >
                    {properties.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    value={s.dir}
                    onChange={(e) => setSorts((p) => p.map((x, i) => (i === idx ? { ...x, dir: e.target.value as "asc" | "desc" } : x)))}
                    className={tableSelect}
                  >
                    <option value="asc">오름차순</option>
                    <option value="desc">내림차순</option>
                  </select>
                  <button type="button" onClick={() => moveSort(idx, -1)} disabled={idx === 0} className="rounded px-1 text-[#9b9a97] hover:bg-[rgba(55,53,47,0.08)] disabled:opacity-30" aria-label="위로">↑</button>
                  <button type="button" onClick={() => moveSort(idx, 1)} disabled={idx === sorts.length - 1} className="rounded px-1 text-[#9b9a97] hover:bg-[rgba(55,53,47,0.08)] disabled:opacity-30" aria-label="아래로">↓</button>
                  <button type="button" onClick={() => setSorts((p) => p.filter((_, i) => i !== idx))} className="rounded px-1 text-[#9b9a97] hover:bg-[rgba(55,53,47,0.08)]" aria-label="삭제">✕</button>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <button type="button" onClick={addSort} className="rounded px-1.5 py-1 text-xs font-medium text-[#2383e2] hover:bg-[#eaf4fd]">+ 정렬 추가</button>
              {sorts.length > 0 && (
                <button type="button" onClick={() => setSorts([])} className="rounded px-1.5 py-1 text-xs text-[#9b9a97] hover:bg-[rgba(55,53,47,0.06)]">모두 지우기</button>
              )}
            </div>
          </div>
        )}

        {menu === "filter" && (
          <div className="absolute left-2 top-9 z-30 w-[348px] rounded-lg border border-[rgba(0,0,0,0.1)] bg-white p-2 shadow-[rgba(15,15,15,0.16)_0px_8px_28px]">
            {filters.length === 0 ? (
              <p className="px-1 py-1.5 text-xs text-[#9b9a97]">필터가 없습니다. 아래에서 조건을 추가하세요.</p>
            ) : (
              <div className="mb-1.5 flex items-center gap-1 px-1">
                <span className="text-xs text-[#9b9a97]">조건 결합</span>
                <div className="ml-auto flex rounded-md border border-[rgba(0,0,0,0.12)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setJoin("and")}
                    className={
                      join === "and"
                        ? "rounded bg-[#2383e2] px-2 py-0.5 text-[11px] font-medium text-white"
                        : "rounded px-2 py-0.5 text-[11px] font-medium text-[#787774] hover:bg-[rgba(55,53,47,0.06)]"
                    }
                  >
                    모두 (AND)
                  </button>
                  <button
                    type="button"
                    onClick={() => setJoin("or")}
                    className={
                      join === "or"
                        ? "rounded bg-[#2383e2] px-2 py-0.5 text-[11px] font-medium text-white"
                        : "rounded px-2 py-0.5 text-[11px] font-medium text-[#787774] hover:bg-[rgba(55,53,47,0.06)]"
                    }
                  >
                    하나라도 (OR)
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              {filters.map((f, idx) => {
                const ops = opsForType(propType(f.key));
                const needsValue = f.op !== "empty" && f.op !== "nempty";
                return (
                  <div key={idx} className="flex flex-wrap items-center gap-1">
                    <span className="w-9 shrink-0 text-xs text-[#9b9a97]">
                      {idx === 0 ? "조건" : join === "or" ? "또는" : "그리고"}
                    </span>
                    <select
                      value={f.key}
                      onChange={(e) => {
                        const nk = e.target.value;
                        const nop = opsForType(propType(nk))[0][0];
                        setFilters((p) => p.map((x, i) => (i === idx ? { ...x, key: nk, op: nop } : x)));
                      }}
                      className={`${tableSelect} flex-1`}
                    >
                      {properties.map((p) => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                    <select
                      value={f.op}
                      onChange={(e) => setFilters((p) => p.map((x, i) => (i === idx ? { ...x, op: e.target.value } : x)))}
                      className={tableSelect}
                    >
                      {ops.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    {needsValue && (
                      <input
                        value={f.value}
                        onChange={(e) => setFilters((p) => p.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))}
                        className="w-[88px] rounded border border-[rgba(0,0,0,0.12)] bg-white px-1.5 py-1 text-xs focus:border-[#2383e2] focus:outline-none"
                        placeholder="값"
                      />
                    )}
                    <button type="button" onClick={() => setFilters((p) => p.filter((_, i) => i !== idx))} className="rounded px-1 text-[#9b9a97] hover:bg-[rgba(55,53,47,0.08)]" aria-label="삭제">✕</button>
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <button type="button" onClick={addFilter} className="rounded px-1.5 py-1 text-xs font-medium text-[#2383e2] hover:bg-[#eaf4fd]">+ 필터 추가</button>
              {filters.length > 0 && (
                <button type="button" onClick={() => setFilters([])} className="rounded px-1.5 py-1 text-xs text-[#9b9a97] hover:bg-[rgba(55,53,47,0.06)]">모두 지우기</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* table */}
      <div className="max-h-[420px] overflow-auto border-t border-[rgba(0,0,0,0.06)]">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#f7f7f5]">
              <th className="sticky left-0 z-10 w-10 border-b border-r border-[rgba(0,0,0,0.07)] bg-[#f7f7f5] px-2 py-1.5 text-right font-medium text-[#9b9a97]">
                #
              </th>
              {orderedProps.map((p) => {
                const on = highlight.has(p.name);
                const sr = sortOf(p.name);
                const dragging = dragCol === p.name;
                const dropTarget = overCol === p.name && dragCol !== null && dragCol !== p.name;
                return (
                  <th
                    key={p.name}
                    draggable
                    onClick={() => headerClick(p.name)}
                    onDragStart={(e) => {
                      setDragCol(p.name);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (dragCol && dragCol !== p.name) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setOverCol(p.name);
                      }
                    }}
                    onDragLeave={() => setOverCol((c) => (c === p.name ? null : c))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragCol) moveColumn(dragCol, p.name);
                      setDragCol(null);
                      setOverCol(null);
                    }}
                    onDragEnd={() => {
                      setDragCol(null);
                      setOverCol(null);
                    }}
                    className={`group relative cursor-pointer select-none whitespace-nowrap border-b border-r border-[rgba(0,0,0,0.07)] px-3 py-1.5 text-left font-medium last:border-r-0 hover:bg-[#efefed] ${
                      on ? "bg-[#eaf4fd] text-[#2383e2]" : "text-[#787774]"
                    } ${dragging ? "opacity-40" : ""} ${
                      dropTarget ? "border-l-2 border-l-[#2383e2]" : ""
                    }`}
                    title={`${p.name} (${p.type}) · 클릭: 정렬 · 드래그: 열 이동`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span className="cursor-grab text-[#c9c7c3] opacity-0 group-hover:opacity-100" aria-hidden>⋮⋮</span>
                      {p.name}
                      {sr ? (
                        <span className="text-[#2383e2]">
                          {sr.dir === "asc" ? "↑" : "↓"}
                          {sorts.length > 1 && (
                            <sup className="ml-0.5 text-[9px]">{sortIdx(p.name) + 1}</sup>
                          )}
                        </span>
                      ) : (
                        <span className="text-[#c9c7c3] opacity-0 group-hover:opacity-100">↕</span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, di) => (
              <tr key={di} className="hover:bg-[rgba(55,53,47,0.025)]">
                <td className="sticky left-0 w-10 border-b border-r border-[rgba(0,0,0,0.05)] bg-white px-2 py-1.5 text-right text-[#c2c0bc]">
                  {di + 1}
                </td>
                {orderedProps.map((p) => {
                  const on = highlight.has(p.name);
                  const v = extractValue(row[p.name]);
                  const num = typeof v === "number";
                  return (
                    <td
                      key={p.name}
                      className={`max-w-[220px] truncate border-b border-r border-[rgba(0,0,0,0.05)] px-3 py-1.5 last:border-r-0 ${
                        num ? "text-right tabular-nums" : "text-left"
                      } ${on ? "bg-[#f5fafe] text-[rgba(0,0,0,0.85)]" : "text-[rgba(0,0,0,0.7)]"}`}
                      title={v === null ? "" : String(v)}
                    >
                      {v === null ? <span className="text-[#d3d1cd]">—</span> : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={properties.length + 1} className="px-4 py-6 text-center text-sm text-[#a39e98]">
                  필터 조건에 맞는 행이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Axis editor ---------- */

function AxisEditor({
  title,
  axis,
  onChange,
  showRange,
}: {
  title: string;
  axis: AxisConfig;
  onChange: (a: AxisConfig) => void;
  showRange: boolean;
}) {
  return (
    <div className="rounded-md border border-[rgba(0,0,0,0.08)] p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[rgba(0,0,0,0.8)]">{title}</span>
        <ColorDot value={axis.color ?? "#615d59"} onChange={(c) => onChange({ ...axis, color: c })} />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <input
          value={axis.title ?? ""}
          onChange={(e) => onChange({ ...axis, title: e.target.value || undefined })}
          className={inputClass}
          placeholder="축 제목"
        />
        {showRange && (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={axis.min ?? ""}
              onChange={(e) =>
                onChange({ ...axis, min: e.target.value === "" ? null : Number(e.target.value) })
              }
              className={inputClass}
              placeholder="최소 (자동)"
            />
            <input
              type="number"
              value={axis.max ?? ""}
              onChange={(e) =>
                onChange({ ...axis, max: e.target.value === "" ? null : Number(e.target.value) })
              }
              className={inputClass}
              placeholder="최대 (자동)"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- primitives ---------- */

function ColorDot({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <label
      className="relative inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[rgba(0,0,0,0.15)]"
      style={{ background: value }}
      title={value}
    >
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-[rgba(0,0,0,0.9)]">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-[#213183]" : "bg-[#d4d2cf]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
      {label}
    </label>
  );
}

/* ---------- Notion-style settings panel primitives ---------- */

function PanelSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-1.5">
      {title && (
        <div className="px-2 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9b9a97]">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function Divider() {
  return <div className="mx-3 border-t border-[rgba(0,0,0,0.06)]" />;
}

const rowBase =
  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors";

function RowStatic({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className={rowBase}>
      <span className="shrink-0 text-[#9b9a97]">{icon}</span>
      <span className="text-sm text-[rgba(0,0,0,0.84)]">{label}</span>
      <span className="ml-auto max-w-[150px] truncate text-sm text-[#9b9a97]">{value}</span>
    </div>
  );
}

function RowSelect({
  icon,
  label,
  value,
  onChange,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`${rowBase} hover:bg-[rgba(55,53,47,0.05)]`}>
      <span className="shrink-0 text-[#9b9a97]">{icon}</span>
      <span className="text-sm text-[rgba(0,0,0,0.84)]">{label}</span>
      <div className="relative ml-auto flex items-center">
        <select
          value={value}
          onChange={onChange}
          className="max-w-[160px] cursor-pointer appearance-none truncate bg-transparent pr-4 text-right text-sm text-[#787774] focus:outline-none"
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-0 text-[#9b9a97]">
          <ChevronDownSmall />
        </span>
      </div>
    </div>
  );
}

function RowToggleRow({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={`${rowBase} hover:bg-[rgba(55,53,47,0.05)]`}>
      <span className="shrink-0 text-[#9b9a97]">{icon}</span>
      <span className="text-sm text-[rgba(0,0,0,0.84)]">{label}</span>
      <span className="ml-auto">
        <Switch checked={checked} onChange={onChange} />
      </span>
    </div>
  );
}

function RowExpand({
  icon,
  label,
  value,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`${rowBase} hover:bg-[rgba(55,53,47,0.05)]`}
      >
        <span className="shrink-0 text-[#9b9a97]">{icon}</span>
        <span className="text-sm text-[rgba(0,0,0,0.84)]">{label}</span>
        <span className="ml-auto flex items-center gap-1 text-sm text-[#787774]">
          <span className="max-w-[130px] truncate">{value}</span>
          <span
            className={`text-[#9b9a97] transition-transform ${open ? "rotate-90" : ""}`}
          >
            <ChevronRightSmall />
          </span>
        </span>
      </button>
      {open && (
        <div className="mb-2 ml-1 mt-1 rounded-md bg-[#f7f7f5] p-2.5">{children}</div>
      )}
    </div>
  );
}

/** Notion-style property glyph by type. */
function propIcon(type: string): string {
  switch (type) {
    case "title":
    case "rich_text":
      return "Aa";
    case "number":
      return "#";
    case "formula":
    case "rollup":
      return "Σ";
    case "date":
    case "created_time":
    case "last_edited_time":
      return "◷";
    case "checkbox":
      return "☑";
    case "select":
    case "status":
      return "⊙";
    case "multi_select":
      return "⊞";
    case "people":
      return "☺";
    case "url":
    case "email":
    case "phone_number":
      return "∞";
    default:
      return "•";
  }
}

/** A settings row whose value opens an inline searchable property list (Notion's "표시 대상" dropdown). */
function PropertyPicker({
  icon,
  label,
  value,
  options,
  open,
  onToggle,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: NotionPropertyMeta[];
  open: boolean;
  onToggle: () => void;
  onSelect: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = options.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <button type="button" onClick={onToggle} className={`${rowBase} hover:bg-[rgba(55,53,47,0.05)]`}>
        <span className="shrink-0 text-[#9b9a97]">{icon}</span>
        <span className="text-sm text-[rgba(0,0,0,0.84)]">{label}</span>
        <span className="ml-auto flex items-center gap-1 text-sm text-[#787774]">
          <span className="max-w-[140px] truncate">{value || "선택"}</span>
          <span className={`text-[#9b9a97] transition-transform ${open ? "rotate-90" : ""}`}>
            <ChevronRightSmall />
          </span>
        </span>
      </button>
      {open && (
        <div className="mb-2 ml-1 mt-1 rounded-md border border-[rgba(0,0,0,0.09)] bg-white p-1 shadow-[rgba(15,15,15,0.08)_0px_4px_16px]">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="속성 검색..."
            className="mb-1 w-full rounded border border-[rgba(0,0,0,0.1)] bg-[#f7f7f5] px-2 py-1.5 text-sm text-[rgba(0,0,0,0.85)] placeholder:text-[#9b9a97] focus:border-[#2383e2] focus:bg-white focus:outline-none"
          />
          <div className="max-h-[220px] overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  onSelect(p.name);
                  setQ("");
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[rgba(55,53,47,0.06)]"
              >
                <span className="w-4 shrink-0 text-center text-xs text-[#9b9a97]">{propIcon(p.type)}</span>
                <span className="flex-1 truncate text-[rgba(0,0,0,0.82)]">{p.name}</span>
                {p.name === value && <span className="text-[#2383e2]">✓</span>}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-2 text-xs text-[#9b9a97]">검색 결과가 없습니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[18px] w-[30px] rounded-full transition-colors ${
        checked ? "bg-[#2eaadc]" : "bg-[#d4d2cf]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-[14px] w-[14px] rounded-full bg-white shadow transition-all ${
          checked ? "left-[14px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function ChevronDownSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ChevronRightSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* ---------- 16px line icons for the settings panel ---------- */

function SIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const Ic = {
  bar: () => (
    <SIcon>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <rect x="7" y="10" width="3" height="7" rx="0.5" />
      <rect x="13" y="6" width="3" height="11" rx="0.5" />
    </SIcon>
  ),
  settings: () => (
    <SIcon>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </SIcon>
  ),
  x: () => (
    <SIcon>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </SIcon>
  ),
  layout: () => (
    <SIcon>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </SIcon>
  ),
  xaxis: () => (
    <SIcon>
      <path d="M4 4v11a4 4 0 0 0 4 4h11" />
      <path d="m15 15 4 4-4 4" />
    </SIcon>
  ),
  target: () => (
    <SIcon>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </SIcon>
  ),
  yaxis: () => (
    <SIcon>
      <path d="M20 20H9a4 4 0 0 1-4-4V5" />
      <path d="m9 9-4-4-4 4" />
    </SIcon>
  ),
  sort: () => (
    <SIcon>
      <path d="m3 8 4-4 4 4" />
      <path d="M7 4v16" />
      <path d="m21 16-4 4-4-4" />
      <path d="M17 20V4" />
    </SIcon>
  ),
  filter: () => (
    <SIcon>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </SIcon>
  ),
  eyeOff: () => (
    <SIcon>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="m2 2 20 20" />
    </SIcon>
  ),
  count: () => (
    <SIcon>
      <path d="M4 9h16" />
      <path d="M4 15h16" />
      <path d="M10 3 8 21" />
      <path d="M16 3l-2 18" />
    </SIcon>
  ),
  group: () => (
    <SIcon>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </SIcon>
  ),
  stack: () => (
    <SIcon>
      <path d="m12 2 8 4-8 4-8-4 8-4Z" />
      <path d="m4 10 8 4 8-4" />
      <path d="m4 14 8 4 8-4" />
    </SIcon>
  ),
  range: () => (
    <SIcon>
      <path d="M12 3v18" />
      <path d="m8 7 4-4 4 4" />
      <path d="m8 17 4 4 4-4" />
    </SIcon>
  ),
  color: () => (
    <SIcon>
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
    </SIcon>
  ),
  sliders: () => (
    <SIcon>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M2 14h4" />
      <path d="M10 8h4" />
      <path d="M18 16h4" />
    </SIcon>
  ),
  source: () => (
    <SIcon>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </SIcon>
  ),
};

const inputClass =
  "w-full rounded-md border border-[rgba(0,0,0,0.1)] bg-white px-2.5 py-1.5 text-sm text-[rgba(0,0,0,0.95)] placeholder:text-[#a39e98] focus:border-[#213183] focus:outline-none focus:ring-2 focus:ring-[#213183]/10 disabled:bg-[#f6f5f4] disabled:text-[#a39e98]";

const primaryBtn =
  "rounded-md bg-[#213183] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005bab] disabled:cursor-not-allowed disabled:bg-[#a39e98]";

const ghostBtn =
  "w-full rounded-md border border-dashed border-[rgba(0,0,0,0.2)] px-3 py-2 text-sm font-medium text-[#615d59] hover:border-[#213183] hover:text-[#213183]";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[rgba(0,0,0,0.1)] bg-white p-6 shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.02)_0px_0.8px_2.925px]">
      {children}
    </section>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-bold tracking-[-0.015625em] text-[rgba(0,0,0,0.95)]">
      {children}
    </h2>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-[rgba(0,0,0,0.9)]">{label}</span>
      {hint && <span className="mb-1.5 block text-xs text-[#615d59]">{hint}</span>}
      {children}
    </label>
  );
}
