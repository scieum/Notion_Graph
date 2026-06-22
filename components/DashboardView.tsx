"use client";

import { Fragment, useState } from "react";
import { ChartView } from "@/components/charts/ChartView";
import { extractValue } from "@/lib/notion-values";
import type {
  DashBlock,
  DashChartBlock,
  DashStatBlock,
  DashTableBlock,
  DashboardSnapshot,
} from "@/lib/types";

function fmtNum(v: number | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const rounded = Math.round(v * 100) / 100;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Literal class strings so Tailwind generates them (no dynamic `grid-cols-${n}`).
const STAT_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

/** Auto (setting falsy) grows 1→2→3 with card count; otherwise honour the fixed setting. */
function statGridClass(setting: number | undefined, count: number): string {
  const cols =
    setting && setting >= 1 && setting <= 4 ? setting : Math.min(Math.max(count, 1), 3);
  return STAT_COLS[cols] ?? STAT_COLS[3];
}

/**
 * Render a baked dashboard. Shared by the builder preview and the /s embed.
 * When `editable`, each block gets a drag handle + remove button so the user can
 * rearrange the layout directly in the preview.
 */
export function DashboardView({
  dash,
  dark = false,
  editable = false,
  onReorder,
  onRemove,
}: {
  dash: DashboardSnapshot;
  dark?: boolean;
  editable?: boolean;
  onReorder?: (from: number, to: number) => void;
  onRemove?: (index: number) => void;
}) {
  const fg = dark ? "#f9fafb" : "rgba(0,0,0,0.92)";
  const sub = dark ? "rgba(255,255,255,0.55)" : "#787774";
  const cardBg = dark ? "rgba(255,255,255,0.04)" : "#ffffff";
  const cardBorder = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.09)";

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // Group consecutive stat blocks so they flow in one responsive row.
  // Each entry carries the block's original index for drag-reordering.
  type StatItem = { block: DashStatBlock; index: number };
  const rows: ({ kind: "stats"; items: StatItem[] } | { kind: "block"; block: DashBlock; index: number })[] = [];
  dash.blocks.forEach((b, index) => {
    if (b.kind === "stat") {
      const last = rows[rows.length - 1];
      if (last && last.kind === "stats") last.items.push({ block: b, index });
      else rows.push({ kind: "stats", items: [{ block: b, index }] });
    } else {
      rows.push({ kind: "block", block: b, index });
    }
  });

  // Wrap a rendered block with drag handle + remove controls (editable mode only).
  const frame = (node: React.ReactNode, index: number) => {
    if (!editable) return node;
    const dragging = dragIdx === index;
    const over = overIdx === index && dragIdx !== null && dragIdx !== index;
    return (
      <div
        onDragOver={(e) => {
          if (dragIdx !== null && dragIdx !== index) {
            e.preventDefault();
            setOverIdx(index);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragIdx !== null) onReorder?.(dragIdx, index);
          setDragIdx(null);
          setOverIdx(null);
        }}
        className={`group relative rounded-xl transition ${over ? "ring-2 ring-[#2383e2]" : ""} ${dragging ? "opacity-40" : ""}`}
      >
        <span
          draggable
          onDragStart={(e) => {
            setDragIdx(index);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDragIdx(null);
            setOverIdx(null);
          }}
          className="absolute left-1.5 top-1.5 z-10 cursor-grab select-none rounded bg-white/85 px-1 text-sm text-[#9b9a97] opacity-0 shadow-sm transition group-hover:opacity-100 active:cursor-grabbing"
          title="드래그하여 위치 이동"
          aria-label="드래그 핸들"
        >
          ⠿
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="absolute right-1.5 top-1.5 z-10 rounded bg-white/85 px-1 text-sm text-[#dd5b00] opacity-0 shadow-sm transition group-hover:opacity-100"
            title="삭제"
            aria-label="블록 삭제"
          >
            ✕
          </button>
        )}
        {node}
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {dash.title && (
        <h1 className="text-lg font-semibold" style={{ color: fg }}>
          {dash.title}
        </h1>
      )}
      {dash.blocks.length === 0 && (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm" style={{ borderColor: cardBorder, color: sub }}>
          블록을 추가하세요 (숫자 카드 · 표 · 차트).
        </div>
      )}
      {rows.map((row, ri) =>
        row.kind === "stats" ? (
          <div key={ri} className={`grid gap-4 ${statGridClass(dash.statColumns, row.items.length)}`}>
            {row.items.map((s) => (
              <Fragment key={s.index}>
                {frame(
                  <StatCard block={s.block} fg={fg} sub={sub} cardBg={cardBg} cardBorder={cardBorder} />,
                  s.index,
                )}
              </Fragment>
            ))}
          </div>
        ) : row.block.kind === "table" ? (
          <div key={ri}>
            {frame(
              <TableCard block={row.block} fg={fg} sub={sub} cardBg={cardBg} cardBorder={cardBorder} dark={dark} />,
              row.index,
            )}
          </div>
        ) : (
          <div key={ri}>
            {frame(
              <ChartCard block={row.block as DashChartBlock} fg={fg} sub={sub} cardBg={cardBg} cardBorder={cardBorder} />,
              row.index,
            )}
          </div>
        ),
      )}
    </div>
  );
}

function CardShell({
  title,
  children,
  cardBg,
  cardBorder,
  sub,
}: {
  title?: string;
  children: React.ReactNode;
  cardBg: string;
  cardBorder: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border p-4 shadow-[rgba(15,15,15,0.04)_0px_2px_8px]" style={{ background: cardBg, borderColor: cardBorder }}>
      {title && (
        <p className="mb-2 text-xs font-medium" style={{ color: sub }}>
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

function StatCard({
  block,
  fg,
  sub,
  cardBg,
  cardBorder,
}: {
  block: DashStatBlock;
  fg: string;
  sub: string;
  cardBg: string;
  cardBorder: string;
}) {
  // Number card: a single aggregate value (numbers only).
  const value = block.value ?? block.groups?.[0]?.value;
  return (
    <CardShell title={block.title} cardBg={cardBg} cardBorder={cardBorder} sub={sub}>
      <div className="flex min-h-[96px] flex-col items-center justify-center gap-1 py-3">
        {block.caption && (
          <p className="text-sm" style={{ color: sub }}>
            {block.caption}
          </p>
        )}
        <p className="text-4xl font-bold tabular-nums" style={{ color: fg }}>
          {fmtNum(value)}
          {block.unit ? <span className="ml-1 text-lg font-medium" style={{ color: sub }}>{block.unit}</span> : null}
        </p>
      </div>
    </CardShell>
  );
}

function TableCard({
  block,
  fg,
  sub,
  cardBg,
  cardBorder,
  dark,
}: {
  block: DashTableBlock;
  fg: string;
  sub: string;
  cardBg: string;
  cardBorder: string;
  dark: boolean;
}) {
  const headBg = dark ? "rgba(255,255,255,0.06)" : "#f7f7f5";
  const line = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  return (
    <CardShell title={block.title} cardBg={cardBg} cardBorder={cardBorder} sub={sub}>
      <div className="max-h-[360px] overflow-auto rounded-md border" style={{ borderColor: line }}>
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: headBg }}>
              <th className="border-b border-r px-2 py-1.5 text-right font-medium" style={{ borderColor: line, color: sub }}>
                #
              </th>
              {block.properties.map((p) => (
                <th key={p.name} className="whitespace-nowrap border-b border-r px-3 py-1.5 text-left font-medium last:border-r-0" style={{ borderColor: line, color: sub }}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, di) => (
              <tr key={di}>
                <td className="border-b border-r px-2 py-1.5 text-right" style={{ borderColor: line, color: sub }}>
                  {di + 1}
                </td>
                {block.properties.map((p) => {
                  const v = extractValue(row[p.name]);
                  const num = typeof v === "number";
                  return (
                    <td
                      key={p.name}
                      className={`max-w-[220px] truncate border-b border-r px-3 py-1.5 last:border-r-0 ${num ? "text-right tabular-nums" : "text-left"}`}
                      style={{ borderColor: line, color: fg }}
                      title={v === null ? "" : String(v)}
                    >
                      {v === null ? <span style={{ color: sub }}>—</span> : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}

function ChartCard({
  block,
  fg,
  sub,
  cardBg,
  cardBorder,
}: {
  block: DashChartBlock;
  fg: string;
  sub: string;
  cardBg: string;
  cardBorder: string;
}) {
  const title = block.title || block.c.title;
  return (
    <CardShell cardBg={cardBg} cardBorder={cardBorder} sub={sub}>
      {title && (
        <p className="mb-2 text-sm font-semibold" style={{ color: fg }}>
          {title}
        </p>
      )}
      <div className="h-[320px]">
        <ChartView type={block.t} data={block.d} config={block.c} />
      </div>
    </CardShell>
  );
}
