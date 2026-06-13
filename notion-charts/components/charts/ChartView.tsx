"use client";

import { useId } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type {
  AxisConfig,
  ChartDatum,
  ChartType,
  LegendPosition,
  SeriesConfig,
  WidgetConfig,
} from "@/lib/types";
import { TREND_PREFIX } from "@/lib/types";
import { resolveSeries } from "@/lib/chart-data";

// Notion-style soft palette — cycled per category for single-series charts.
export const DEFAULT_PALETTE = [
  "#4a90d9", // blue
  "#e9b949", // gold
  "#67b87a", // green
  "#b285d6", // purple
  "#e8965c", // orange
  "#e87ea6", // pink
  "#56bdbd", // teal
  "#e07a6e", // red
  "#7986cb", // indigo
  "#9ccc65", // light green
];

const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "inherit",
  color: "rgba(0,0,0,0.95)",
  boxShadow: "rgba(0,0,0,0.08) 0px 6px 24px",
};

function fmt(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value ?? "");
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function colorFor(series: SeriesConfig, index: number, palette: string[]): string {
  return series.color ?? palette[index % palette.length];
}

function domainFor(axis?: AxisConfig): [number | string, number | string] {
  const min = axis?.min ?? null;
  const max = axis?.max ?? null;
  return [min === null ? "auto" : min, max === null ? "auto" : max];
}

function legendProps(pos: LegendPosition) {
  switch (pos) {
    case "top":
      return { layout: "horizontal", align: "center", verticalAlign: "top" } as const;
    case "left":
      return { layout: "vertical", align: "left", verticalAlign: "middle" } as const;
    case "right":
      return { layout: "vertical", align: "right", verticalAlign: "middle" } as const;
    default:
      return { layout: "horizontal", align: "center", verticalAlign: "bottom" } as const;
  }
}

export function ChartView({
  type,
  data,
  config,
}: {
  type: ChartType;
  data: ChartDatum[];
  config: WidgetConfig;
}) {
  const style = config.style ?? {};
  const palette = style.palette && style.palette.length > 0 ? style.palette : DEFAULT_PALETTE;
  const background = style.background ?? "transparent";
  const gridColor = style.gridColor ?? "rgba(55,53,47,0.09)";
  const showGrid = style.showGrid !== false;
  const series = resolveSeries(config);
  // Notion hides the legend for a single series — it's redundant with the title.
  const legendPos: LegendPosition =
    (style.legend ?? "bottom") !== "none" && series.length <= 1 && type !== "pie"
      ? "none"
      : style.legend ?? "bottom";
  const fillOpacity = style.fillOpacity ?? 0.25;
  const uid = useId().replace(/:/g, "");

  const axisTickStyle = (axis?: AxisConfig) => ({
    fontSize: 12,
    fill: axis?.color ?? "#9b9a97",
    fontFamily: "inherit",
  });
  const singleSeries = series.length === 1;

  if (data.length === 0) {
    return (
      <Wrapper background={background}>
        <div className="flex h-full w-full items-center justify-center text-sm text-[#615d59]">
          표시할 데이터가 없습니다.
        </div>
      </Wrapper>
    );
  }

  // ---- Pie / Donut ----
  if (type === "pie") {
    const s = series[0];
    return (
      <Wrapper background={background}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt(v)} />
            {legendPos !== "none" && (
              <Legend
                {...legendProps(legendPos)}
                wrapperStyle={{ fontSize: 12, color: "#615d59" }}
              />
            )}
            <Pie
              data={data}
              dataKey={s.key}
              nameKey="label"
              outerRadius="78%"
              innerRadius={style.donut ? "55%" : 0}
              paddingAngle={style.donut ? 2 : 0}
              stroke="#ffffff"
              strokeWidth={2}
              isAnimationActive={false}
              label={
                style.showDataLabels
                  ? (e: { value?: number }) => fmt(e.value)
                  : undefined
              }
            >
              {data.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </Wrapper>
    );
  }

  // ---- Radar ----
  if (type === "radar") {
    return (
      <Wrapper background={background}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke={gridColor} />
            <PolarAngleAxis dataKey="label" tick={axisTickStyle(config.xAxis)} />
            <PolarRadiusAxis tick={axisTickStyle(config.leftAxis)} domain={domainFor(config.leftAxis)} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmt(v)} />
            {legendPos !== "none" && (
              <Legend {...legendProps(legendPos)} wrapperStyle={{ fontSize: 12, color: "#615d59" }} />
            )}
            {series.map((s, i) => {
              const c = colorFor(s, i, palette);
              return (
                <Radar
                  key={s.key}
                  name={s.label ?? s.key}
                  dataKey={s.key}
                  stroke={c}
                  fill={c}
                  fillOpacity={fillOpacity}
                  isAnimationActive={false}
                />
              );
            })}
          </RadarChart>
        </ResponsiveContainer>
      </Wrapper>
    );
  }

  // ---- Cartesian: bar / line / area / scatter / combo ----
  const isScatter = type === "scatter";
  const hasRight = series.some((s) => s.axis === "right");

  return (
    <Wrapper background={background}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 28, right: hasRight ? 16 : 20, bottom: 8, left: 4 }}>
          <defs>
            {series.map((s, i) => {
              const c = colorFor(s, i, palette);
              return (
                <linearGradient key={s.key} id={`${uid}-area-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c} stopOpacity={Math.min(0.9, fillOpacity + 0.4)} />
                  <stop offset="92%" stopColor={c} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>
          {showGrid && (
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={isScatter} horizontal />
          )}
          <XAxis
            dataKey="x"
            type={isScatter ? "number" : "category"}
            name={config.xAxis?.title}
            padding={{ left: 24, right: 24 }}
            tick={axisTickStyle(config.xAxis)}
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            hide={config.xAxis?.hide}
          >
            {config.xAxis?.title && (
              <Label value={config.xAxis.title} position="insideBottom" offset={-4} style={{ fontSize: 12, fill: config.xAxis?.color ?? "#615d59" }} />
            )}
          </XAxis>
          <YAxis
            yAxisId="left"
            type="number"
            domain={domainFor(config.leftAxis)}
            tick={axisTickStyle(config.leftAxis)}
            tickLine={false}
            axisLine={false}
            hide={config.leftAxis?.hide}
            allowDataOverflow={config.leftAxis?.min != null || config.leftAxis?.max != null}
          >
            {config.leftAxis?.title && (
              <Label value={config.leftAxis.title} angle={-90} position="insideLeft" style={{ fontSize: 12, fill: config.leftAxis?.color ?? "#615d59", textAnchor: "middle" }} />
            )}
          </YAxis>
          {hasRight && (
            <YAxis
              yAxisId="right"
              type="number"
              orientation="right"
              domain={domainFor(config.rightAxis)}
              tick={axisTickStyle(config.rightAxis)}
              tickLine={false}
              axisLine={false}
              hide={config.rightAxis?.hide}
              allowDataOverflow={config.rightAxis?.min != null || config.rightAxis?.max != null}
            >
              {config.rightAxis?.title && (
                <Label value={config.rightAxis.title} angle={90} position="insideRight" style={{ fontSize: 12, fill: config.rightAxis?.color ?? "#615d59", textAnchor: "middle" }} />
              )}
            </YAxis>
          )}
          {isScatter && <ZAxis range={[50, 50]} />}
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={isScatter ? { strokeDasharray: "3 3" } : { fill: "rgba(0,0,0,0.04)" }}
            formatter={(v) => fmt(v)}
          />
          {legendPos !== "none" && (
            <Legend {...legendProps(legendPos)} wrapperStyle={{ fontSize: 12, color: "#615d59" }} />
          )}

          {series.map((s, i) =>
            renderSeries(s, i, type, palette, style, isScatter, fillOpacity, uid, data, singleSeries),
          )}
          {series.map((s, i) => renderTrendline(s, i, palette))}
        </ComposedChart>
      </ResponsiveContainer>
    </Wrapper>
  );
}

function renderSeries(
  s: SeriesConfig,
  i: number,
  type: ChartType,
  palette: string[],
  style: NonNullable<WidgetConfig["style"]>,
  isScatter: boolean,
  fillOpacity: number,
  uid: string,
  data: ChartDatum[],
  singleSeries: boolean,
) {
  const color = colorFor(s, i, palette);
  const yAxisId = s.axis === "right" ? "right" : "left";
  const name = s.label ?? s.key;
  const curve = style.smooth ? "monotone" : "linear";
  const labels = style.showDataLabels ? (
    <LabelList
      dataKey={s.key}
      position="top"
      offset={8}
      style={{ fontSize: 12, fill: "#787774", fontWeight: 500 }}
      formatter={(v: unknown) => fmt(v)}
    />
  ) : null;

  if (isScatter) {
    return (
      <Scatter key={s.key} name={name} dataKey={s.key} fill={color} yAxisId={yAxisId} isAnimationActive={false}>
        {labels}
      </Scatter>
    );
  }

  const kind = type === "combo" ? s.type ?? "bar" : type;

  if (kind === "line") {
    return (
      <Line
        key={s.key}
        type={curve}
        dataKey={s.key}
        name={name}
        yAxisId={yAxisId}
        stroke={color}
        strokeWidth={2.5}
        dot={{ r: 3.5, fill: "#fff", stroke: color, strokeWidth: 2 }}
        activeDot={{ r: 5.5, fill: color, stroke: "#fff", strokeWidth: 2 }}
        isAnimationActive={false}
        connectNulls
      >
        {labels}
      </Line>
    );
  }

  if (kind === "area") {
    return (
      <Area
        key={s.key}
        type={curve}
        dataKey={s.key}
        name={name}
        yAxisId={yAxisId}
        stroke={color}
        fill={`url(#${uid}-area-${i})`}
        fillOpacity={1}
        strokeWidth={2.5}
        dot={false}
        activeDot={{ r: 5, fill: color, stroke: "#fff", strokeWidth: 2 }}
        stackId={style.stacked ? "stack" : undefined}
        isAnimationActive={false}
        connectNulls
      >
        {labels}
      </Area>
    );
  }

  // bar — Notion cycles a different palette colour per category for a single series.
  const perCategory = singleSeries && !style.stacked && !s.color;
  return (
    <Bar
      key={s.key}
      dataKey={s.key}
      name={name}
      yAxisId={yAxisId}
      fill={color}
      radius={[style.barRadius ?? 4, style.barRadius ?? 4, 0, 0]}
      maxBarSize={32}
      stackId={style.stacked ? "stack" : undefined}
      isAnimationActive={false}
    >
      {perCategory &&
        data.map((_, di) => <Cell key={di} fill={palette[di % palette.length]} />)}
      {labels}
    </Bar>
  );
}

function renderTrendline(s: SeriesConfig, i: number, palette: string[]) {
  const t = s.trendline;
  if (!t || t.type === "none") return null;
  const color = t.color ?? colorFor(s, i, palette);
  const yAxisId = s.axis === "right" ? "right" : "left";
  return (
    <Line
      key={TREND_PREFIX + s.key}
      type="monotone"
      dataKey={TREND_PREFIX + s.key}
      name={`${s.label ?? s.key} 추세선`}
      yAxisId={yAxisId}
      stroke={color}
      strokeWidth={2}
      strokeDasharray={t.dashed === false ? undefined : "6 4"}
      dot={false}
      activeDot={false}
      isAnimationActive={false}
      connectNulls
      legendType="none"
    />
  );
}

function Wrapper({
  background,
  children,
}: {
  background: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full w-full" style={{ background }}>
      {children}
    </div>
  );
}
