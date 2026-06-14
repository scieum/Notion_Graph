"use client";

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

/** Render a baked dashboard. Shared by the builder preview and the /s embed. */
export function DashboardView({
  dash,
  dark = false,
}: {
  dash: DashboardSnapshot;
  dark?: boolean;
}) {
  const fg = dark ? "#f9fafb" : "rgba(0,0,0,0.92)";
  const sub = dark ? "rgba(255,255,255,0.55)" : "#787774";
  const cardBg = dark ? "rgba(255,255,255,0.04)" : "#ffffff";
  const cardBorder = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.09)";

  // Group consecutive stat blocks so they flow in one responsive row.
  const rows: ({ kind: "stats"; items: DashStatBlock[] } | { kind: "block"; block: DashBlock })[] = [];
  for (const b of dash.blocks) {
    if (b.kind === "stat") {
      const last = rows[rows.length - 1];
      if (last && last.kind === "stats") last.items.push(b);
      else rows.push({ kind: "stats", items: [b] });
    } else {
      rows.push({ kind: "block", block: b });
    }
  }

  return (
    <div className="flex flex-col gap-4">
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
          <div key={ri} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {row.items.map((s, i) => (
              <StatCard key={i} block={s} fg={fg} sub={sub} cardBg={cardBg} cardBorder={cardBorder} />
            ))}
          </div>
        ) : row.block.kind === "table" ? (
          <TableCard key={ri} block={row.block} fg={fg} sub={sub} cardBg={cardBg} cardBorder={cardBorder} dark={dark} />
        ) : (
          <ChartCard key={ri} block={row.block as DashChartBlock} fg={fg} sub={sub} cardBg={cardBg} cardBorder={cardBorder} />
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
  return (
    <CardShell title={block.title} cardBg={cardBg} cardBorder={cardBorder} sub={sub}>
      {block.groups ? (
        <div className="flex flex-col gap-1.5 pt-1">
          {block.caption && (
            <p className="text-center text-sm" style={{ color: sub }}>
              {block.caption}
            </p>
          )}
          {block.groups.map((g, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 border-b border-[rgba(0,0,0,0.05)] pb-1 last:border-0">
              <span className="truncate text-sm" style={{ color: sub }}>
                {g.label}
              </span>
              <span className="text-base font-semibold tabular-nums" style={{ color: fg }}>
                {fmtNum(g.value)}
                {block.unit ? <span className="ml-0.5 text-xs font-normal" style={{ color: sub }}>{block.unit}</span> : null}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[96px] flex-col items-center justify-center gap-1 py-3">
          {block.caption && (
            <p className="text-sm" style={{ color: sub }}>
              {block.caption}
            </p>
          )}
          <p className="text-4xl font-bold tabular-nums" style={{ color: fg }}>
            {fmtNum(block.value)}
            {block.unit ? <span className="ml-1 text-lg font-medium" style={{ color: sub }}>{block.unit}</span> : null}
          </p>
        </div>
      )}
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
