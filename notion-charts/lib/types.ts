export type ChartType =
  | "bar"
  | "line"
  | "area"
  | "scatter"
  | "pie"
  | "combo"
  | "radar";

export type Aggregation =
  | "sum"
  | "count"
  | "avg"
  | "min"
  | "max"
  | "median"
  | "none";

/** Per-series render type, used when chart_type === "combo". */
export type SeriesType = "bar" | "line" | "area";

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

export const TREND_PREFIX = "__trend__";
export const COUNT_KEY = "__count__";
