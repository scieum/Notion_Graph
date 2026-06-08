"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Aggregation,
  AxisConfig,
  ChartStyle,
  ChartType,
  LegendPosition,
  NotionPropertyMeta,
  SeriesConfig,
  TrendlineType,
  WidgetConfig,
} from "@/lib/types";
import { COUNT_KEY } from "@/lib/types";
import { buildChartData } from "@/lib/chart-data";
import { ChartView, DEFAULT_PALETTE } from "@/components/charts/ChartView";

type InspectResult = {
  dataSourceId: string;
  properties: NotionPropertyMeta[];
  title?: string;
  rows: Record<string, unknown>[];
};

const NUMERIC_TYPES = new Set(["number", "formula", "rollup", "checkbox"]);
const DATE_TYPES = new Set(["date", "created_time", "last_edited_time"]);

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
  const [style, setStyle] = useState<ChartStyle>({
    palette: DEFAULT_PALETTE,
    background: "#ffffff",
    showGrid: true,
    legend: "bottom",
    smooth: false,
    showDataLabels: false,
    stacked: false,
    donut: false,
    fillOpacity: 0.25,
  });
  const [xAxis, setXAxis] = useState<AxisConfig>({});
  const [leftAxis, setLeftAxis] = useState<AxisConfig>({});
  const [rightAxis, setRightAxis] = useState<AxisConfig>({});

  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const properties = inspect?.properties ?? [];
  const numericProps = useMemo(
    () => properties.filter((p) => NUMERIC_TYPES.has(p.type)),
    [properties],
  );

  const isCartesian = ["bar", "line", "area", "scatter", "combo"].includes(chartType);
  const isScatter = chartType === "scatter";
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
      style,
      xAxis,
      leftAxis,
      rightAxis,
    }),
    [title, xKey, series, aggregation, sortBy, sortDir, limit, style, xAxis, leftAxis, rightAxis],
  );

  const previewData = useMemo(() => {
    if (!inspect || !xKey) return [];
    try {
      return buildChartData(inspect.rows, chartType, config);
    } catch {
      return [];
    }
  }, [inspect, xKey, chartType, config]);

  const applyInspectResult = useCallback((json: InspectResult) => {
    setInspect(json);
    setSavedId(null);
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

  const embedUrl =
    typeof window !== "undefined" && savedId
      ? `${window.location.origin}/w/${savedId}`
      : "";

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
              <button
                type="button"
                onClick={handleDisconnect}
                className="text-xs text-[#615d59] underline hover:text-[#dd5b00]"
              >
                연결 해제
              </button>
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
                  onClick={handleSelectDatabase}
                  disabled={inspecting || !selectedDb}
                  className={`${primaryBtn} shrink-0 whitespace-nowrap`}
                >
                  {inspecting ? "불러오는 중..." : "불러오기"}
                </button>
              </div>
            </Field>
            {databases.length === 0 && !loadingDbs && (
              <p className="text-xs text-[#a39e98]">
                권한 준 DB가 없습니다. ‘연결 해제’ 후 다시 연결하면서 노션 인증 화면에서 사용할
                페이지·데이터베이스를 선택하세요.
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
        <div className="mx-auto max-w-7xl space-y-6 py-6">
          {/* top bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] pb-4">
            <button
              type="button"
              onClick={() => {
                setInspect(null);
                setSavedId(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.1)] bg-white px-3 py-1.5 text-sm font-medium text-[#615d59] transition-colors hover:border-[#213183]/40 hover:text-[#213183]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m15 18-6-6 6-6" />
              </svg>
              다른 DB 선택
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[rgba(0,0,0,0.85)]">
                {inspect.title ?? "차트 빌더"}
              </span>
              {workspace && (
                <span className="rounded-full border border-[#1aae39]/30 bg-[#1aae39]/5 px-2.5 py-0.5 text-xs text-[#1aae39]">
                  ✓ {workspace}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)] lg:items-start">
          <div className="space-y-6 min-w-0">
            <Card>
              <CardTitle>
                데이터 선택{" "}
                <span className="ml-2 text-sm font-normal text-[#615d59]">
                  ({properties.length}개 속성 · {inspect.rows.length}개 행)
                </span>
              </CardTitle>

              <div className="mt-4 space-y-5">
                <Section title="차트 종류">
                  <div className="grid grid-cols-4 gap-2">
                    {CHART_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setChartType(t.value)}
                        className={
                          chartType === t.value
                            ? "flex flex-col items-center gap-1.5 rounded-lg border border-[#213183] bg-[#f2f9ff] px-2 py-3 text-xs font-semibold text-[#213183]"
                            : "flex flex-col items-center gap-1.5 rounded-lg border border-[rgba(0,0,0,0.1)] bg-white px-2 py-3 text-xs text-[#615d59] transition-colors hover:border-[#213183]/40 hover:text-[#213183]"
                        }
                      >
                        {t.icon}
                        {t.label}
                      </button>
                    ))}
                  </div>
                </Section>

                <Section title="기본">
                  <Field label="제목">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className={inputClass}
                      placeholder="차트 제목"
                    />
                  </Field>
                  <Field label={isScatter ? "X 축 (숫자)" : "X 축 / 카테고리"}>
                    <select
                      value={xKey}
                      onChange={(e) => setXKey(e.target.value)}
                      className={inputClass}
                    >
                      {(isScatter ? numericProps : properties).map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name} ({p.type})
                        </option>
                      ))}
                    </select>
                  </Field>
                  {!isScatter && (
                    <Field label="기본 집계 방식">
                      <select
                        value={aggregation}
                        onChange={(e) => setAggregation(e.target.value as Aggregation)}
                        className={inputClass}
                      >
                        <option value="sum">합계</option>
                        <option value="count">개수</option>
                        <option value="avg">평균</option>
                        <option value="min">최소</option>
                        <option value="max">최대</option>
                        <option value="median">중앙값</option>
                        <option value="none">집계 안 함</option>
                      </select>
                    </Field>
                  )}
                </Section>

                {/* SERIES */}
                <Section title="데이터 계열">
                  <div className="space-y-3">
                    {series.map((s, i) => (
                      <SeriesCard
                        key={i}
                        index={i}
                        series={s}
                        chartType={chartType}
                        isCartesian={isCartesian}
                        isScatter={isScatter}
                        numericProps={numericProps}
                        dateProps={properties.filter((p) => DATE_TYPES.has(p.type))}
                        paletteColor={
                          (style.palette ?? DEFAULT_PALETTE)[i % (style.palette ?? DEFAULT_PALETTE).length]
                        }
                        onChange={(patch) => updateSeries(i, patch)}
                        onRemove={series.length > 1 ? () => removeSeries(i) : undefined}
                      />
                    ))}
                    <button type="button" onClick={addSeries} className={ghostBtn}>
                      + 계열 추가
                    </button>
                    {chartType === "pie" && series.length > 1 && (
                      <p className="text-xs text-[#a39e98]">
                        파이 차트는 첫 번째 계열만 사용합니다.
                      </p>
                    )}
                  </div>
                </Section>

                {/* SORT / LIMIT */}
                {!isScatter && (
                  <Section title="정렬 & 표시 개수" defaultOpen={false}>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="정렬 기준">
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as "x" | "y" | "none")}
                          className={inputClass}
                        >
                          <option value="none">없음</option>
                          <option value="x">X 기준</option>
                          <option value="y">값 기준</option>
                        </select>
                      </Field>
                      <Field label="방향">
                        <select
                          value={sortDir}
                          onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                          className={inputClass}
                          disabled={sortBy === "none"}
                        >
                          <option value="asc">오름차순</option>
                          <option value="desc">내림차순</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="최대 항목 수 (0 = 전체)">
                      <input
                        type="number"
                        min={0}
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                        className={inputClass}
                      />
                    </Field>
                  </Section>
                )}
              </div>
            </Card>

            {/* DESIGN */}
            <Card>
              <CardTitle>디자인 & 축</CardTitle>
              <div className="mt-4 space-y-5">
                <Section title="색상 팔레트" defaultOpen={false}>
                  <div className="flex flex-wrap gap-2">
                    {PALETTE_PRESETS.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => setStyle((s) => ({ ...s, palette: p.colors }))}
                        className={
                          JSON.stringify(style.palette) === JSON.stringify(p.colors)
                            ? "flex items-center gap-2 rounded-md border border-[#213183] bg-[#f2f9ff] px-2.5 py-1.5"
                            : "flex items-center gap-2 rounded-md border border-[rgba(0,0,0,0.1)] px-2.5 py-1.5 hover:border-[rgba(0,0,0,0.25)]"
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
                </Section>

                <Section title="배경 & 격자" defaultOpen={false}>
                  <Field label="차트 배경">
                    <div className="flex flex-wrap items-center gap-2">
                      {BG_PRESETS.map((b) => (
                        <button
                          key={b.name}
                          type="button"
                          onClick={() => setStyle((s) => ({ ...s, background: b.color }))}
                          className={
                            style.background === b.color
                              ? "rounded-md border border-[#213183] bg-[#f2f9ff] px-2.5 py-1.5 text-xs font-semibold text-[#213183]"
                              : "rounded-md border border-[rgba(0,0,0,0.1)] px-2.5 py-1.5 text-xs hover:border-[rgba(0,0,0,0.25)]"
                          }
                        >
                          {b.name}
                        </button>
                      ))}
                      <ColorDot
                        value={style.background === "transparent" ? "#ffffff" : style.background ?? "#ffffff"}
                        onChange={(c) => setStyle((s) => ({ ...s, background: c }))}
                      />
                    </div>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Toggle
                      label="격자선"
                      checked={style.showGrid !== false}
                      onChange={(v) => setStyle((s) => ({ ...s, showGrid: v }))}
                    />
                    <Field label="격자 색상">
                      <ColorDot
                        value={style.gridColor ?? "#e5e5e5"}
                        onChange={(c) => setStyle((s) => ({ ...s, gridColor: c }))}
                      />
                    </Field>
                  </div>
                </Section>

                <Section title="옵션" defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
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
                        className="w-full accent-[#213183]"
                      />
                    </Field>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-y-2">
                    <Toggle
                      label="데이터 레이블"
                      checked={!!style.showDataLabels}
                      onChange={(v) => setStyle((s) => ({ ...s, showDataLabels: v }))}
                    />
                    {(chartType === "line" || chartType === "area" || chartType === "combo") && (
                      <Toggle
                        label="부드러운 곡선"
                        checked={!!style.smooth}
                        onChange={(v) => setStyle((s) => ({ ...s, smooth: v }))}
                      />
                    )}
                    {(chartType === "bar" || chartType === "area" || chartType === "combo") && (
                      <Toggle
                        label="누적"
                        checked={!!style.stacked}
                        onChange={(v) => setStyle((s) => ({ ...s, stacked: v }))}
                      />
                    )}
                    {chartType === "pie" && (
                      <Toggle
                        label="도넛"
                        checked={!!style.donut}
                        onChange={(v) => setStyle((s) => ({ ...s, donut: v }))}
                      />
                    )}
                  </div>
                </Section>

                {/* AXES */}
                {isCartesian && (
                  <Section title="축 설정" defaultOpen={false}>
                    <AxisEditor
                      title="X 축"
                      axis={xAxis}
                      onChange={setXAxis}
                      showRange={isScatter}
                    />
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
                  </Section>
                )}
              </div>
            </Card>
          </div>

          {/* RIGHT — sticky live preview */}
          <div className="lg:sticky lg:top-6">
            {xKey && series.length > 0 ? (
              <Card>
                <div className="flex items-center justify-between">
                  <CardTitle>미리보기</CardTitle>
                  <span className="rounded-full bg-[#f2f9ff] px-2 py-0.5 text-xs font-medium text-[#213183]">
                    실시간
                  </span>
                </div>
                <div
                  className="mt-4 rounded-lg border border-[rgba(0,0,0,0.08)] p-4"
                  style={{ background: style.background === "transparent" ? "#fff" : style.background }}
                >
                  {title && (
                    <h3
                      className="mb-2 text-sm font-semibold"
                      style={{ color: style.background === "#1f2937" ? "#f9fafb" : "rgba(0,0,0,0.9)" }}
                    >
                      {title}
                    </h3>
                  )}
                  <div className="h-[600px]">
                    <ChartView type={chartType} data={previewData} config={config} />
                  </div>
                </div>
                {previewData.length === 0 && (
                  <p className="mt-2 text-xs text-[#a39e98]">
                    선택한 X 축 / 계열에 표시할 수 있는 값이 없습니다. 다른 속성을 골라보세요.
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className={`${primaryBtn} mt-4 w-full`}
                >
                  {saving ? "저장 중..." : "위젯 저장 + 임베드 URL 발급"}
                </button>

                {savedId && (
                  <div className="mt-4 rounded-md bg-[#f6f5f4] p-3">
                    <p className="text-xs text-[#615d59]">
                      노션에서 <code className="rounded bg-white px-1">/embed</code> 블록에 붙여넣으세요.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <input readOnly value={embedUrl} className={`${inputClass} font-mono text-xs`} />
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(embedUrl)}
                        className={primaryBtn}
                      >
                        복사
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card>
                <div className="flex items-center justify-between">
                  <CardTitle>미리보기</CardTitle>
                  <span className="rounded-full bg-[#f6f5f4] px-2 py-0.5 text-xs font-medium text-[#a39e98]">
                    대기 중
                  </span>
                </div>
                <div className="mt-4 flex h-[600px] items-center justify-center rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] text-center">
                  <p className="px-6 text-sm text-[#a39e98]">
                    왼쪽에서 X 축과 데이터 계열을 선택하면
                    <br />
                    여기에 실시간 미리보기가 나타납니다.
                  </p>
                </div>
              </Card>
            )}
          </div>
          </div>

          {error && (
            <div className="rounded-md border border-[#dd5b00]/30 bg-[#dd5b00]/5 px-4 py-3 text-sm text-[#dd5b00]">
              {error}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ---------- Series card ---------- */

function SeriesCard({
  index,
  series,
  chartType,
  isCartesian,
  isScatter,
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
  numericProps: NotionPropertyMeta[];
  dateProps: NotionPropertyMeta[];
  paletteColor: string;
  onChange: (patch: Partial<SeriesConfig>) => void;
  onRemove?: () => void;
}) {
  const trend = series.trendline?.type ?? "none";
  const showTrend = isCartesian && chartType !== "bar";
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
          </select>
        )}
        {isCartesian && (
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

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[rgba(0,0,0,0.06)] pb-3 last:border-0 last:pb-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center justify-between py-1 text-left"
      >
        <span className="text-xs font-bold uppercase tracking-wide text-[#a39e98] transition-colors group-hover:text-[#615d59]">
          {title}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`text-[#a39e98] transition-transform ${open ? "" : "-rotate-90"}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="mt-2 space-y-3">{children}</div>}
    </div>
  );
}

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
