export type ChartType =
  | "bar"
  | "line"
  | "area"
  | "scatter"
  | "pie"
  | "combo"
  | "radar"
  | "hbar"
  | "bubble"
  | "radialBar"
  | "funnel";

export type Aggregation =
  | "sum"
  | "count"
  | "avg"
  | "min"
  | "max"
  | "median"
  | "none";

/** Per-series render type, used when chart_type === "combo". */
export type SeriesType = "bar" | "line" | "area" | "scatter" | "step";

export type TrendlineType =
  | "none"
  | "linear"
  | "movingAverage"
  | "polynomial"
  | "exponential"
  | "logarithmic"
  | "power";

export type TrendlineConfig = {
  type: TrendlineType;
  /** moving-average window size */
  period?: number;
  /** polynomial degree (2–6) */
  degree?: number;
  color?: string;
  dashed?: boolean;
};

export type SeriesConfig = {
  /** Notion property name, or "__count__" for a synthetic row-count series. */
  key: string;
  label?: string;
  /** combo charts only; otherwise the chart type is used */
  type?: SeriesType;
  color?: string;
  /** which Y axis this series binds to */
  axis?: "left" | "right";
  /** per-series aggregation; falls back to config.aggregation */
  aggregation?: Aggregation;
  /** bubble charts: property whose value drives each point's size */
  sizeKey?: string;
  trendline?: TrendlineConfig;
};

export type AxisConfig = {
  title?: string;
  color?: string;
  /** null / undefined => auto */
  min?: number | null;
  max?: number | null;
  hide?: boolean;
};

export type LegendPosition = "top" | "bottom" | "left" | "right" | "none";

export type ChartStyle = {
  palette?: string[];
  /** plot/background fill */
  background?: string;
  gridColor?: string;
  showGrid?: boolean;
  legend?: LegendPosition;
  /** curved lines/areas */
  smooth?: boolean;
  /** show numeric labels on data points */
  showDataLabels?: boolean;
  /** stack bars / areas */
  stacked?: boolean;
  /** render pie as a donut */
  donut?: boolean;
  barRadius?: number;
  fillOpacity?: number;
  /** drop categories whose every series value is 0 / empty */
  omitZero?: boolean;
  /** number of decimal places for chart numbers; undefined => auto (max 2) */
  decimals?: number;
  /** how to round to `decimals` places */
  rounding?: "round" | "ceil" | "floor";
};

export type WidgetConfig = {
  title?: string;
  xKey: string;
  /** multi-series spec */
  series: SeriesConfig[];
  /** default aggregation when a series doesn't override it */
  aggregation: Aggregation;
  sortBy?: "x" | "y" | "none";
  sortDir?: "asc" | "desc";
  limit?: number;

  style?: ChartStyle;
  xAxis?: AxisConfig;
  leftAxis?: AxisConfig;
  rightAxis?: AxisConfig;

  // legacy single-series fields (kept for backward compatibility)
  yKey?: string;
  colorKey?: string;
};

export type Widget = {
  id: string;
  database_id: string;
  data_source_id: string;
  chart_type: ChartType;
  config: WidgetConfig;
};

export type NotionPropertyMeta = {
  name: string;
  type: string;
};

/** Wide-format datum: { x, label?, [seriesKey]: number, __trend__<key>: number } */
export type ChartDatum = {
  x: string | number;
  label?: string;
} & Record<string, string | number | null | undefined>;

/* ---- Dashboard (multi-widget) — baked shapes carried in the embed ---- */

export type DashStatBlock = {
  kind: "stat";
  title?: string;
  caption?: string;
  unit?: string;
  /** single aggregate */
  value?: number;
  /** per-group aggregates (when grouped) */
  groups?: { label: string; value: number }[];
};

export type DashTableBlock = {
  kind: "table";
  title?: string;
  properties: NotionPropertyMeta[];
  rows: Record<string, unknown>[];
};

export type DashChartBlock = {
  kind: "chart";
  title?: string;
  t: ChartType;
  d: ChartDatum[];
  c: WidgetConfig;
};

export type DashBlock = DashStatBlock | DashTableBlock | DashChartBlock;

export type DashboardSnapshot = {
  title?: string;
  blocks: DashBlock[];
};

export const TREND_PREFIX = "__trend__";
export const COUNT_KEY = "__count__";
