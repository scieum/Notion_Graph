"use client";

import { useEffect, useState } from "react";
import { ChartView } from "@/components/charts/ChartView";
import type { ChartDatum, ChartType, WidgetConfig } from "@/lib/types";

type Chart = { name?: string; t: ChartType; d: ChartDatum[]; c: WidgetConfig };
/** Decoded payload: either a single chart or a tabbed set of charts. */
type Snapshot = { charts: Chart[] };

/** Decode a base64 (UTF-8) payload carried in the URL hash fragment. */
function decode(hash: string): Snapshot | null {
  try {
    const b64 = hash.replace(/^#/, "");
    if (!b64) return null;
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    // Multi-tab shape: { tabs: [{ name, t, d, c }] }
    if (Array.isArray(obj.tabs)) {
      const charts = obj.tabs.filter(
        (c: unknown): c is Chart =>
          !!c && typeof c === "object" && !!(c as Chart).t && Array.isArray((c as Chart).d),
      );
      return charts.length > 0 ? { charts } : null;
    }
    // Single-chart shape (backward compatible): { t, d, c }
    if (obj.t && Array.isArray(obj.d)) return { charts: [obj as Chart] };
    return null;
  } catch {
    return null;
  }
}

export default function SnapshotPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const read = () => {
      setSnap(decode(window.location.hash));
      setActive(0);
    };
    read();
    setReady(true);
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const charts = snap?.charts ?? [];
  const current = charts[Math.min(active, charts.length - 1)];
  const tabbed = charts.length > 1;

  const bg = current?.c.style?.background;
  const background = bg && bg !== "transparent" ? bg : "#ffffff";
  const dark = isDark(background);
  const fg = dark ? "#f9fafb" : "rgba(0,0,0,0.95)";

  return (
    <main className="flex h-screen w-screen flex-col p-4" style={{ background }}>
      {!ready ? null : !current ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-[#615d59]">
          스냅샷 데이터를 읽을 수 없습니다.
        </div>
      ) : (
        <>
          {tabbed && (
            <div className="mb-2 flex shrink-0 items-center gap-1 overflow-x-auto">
              {charts.map((c, i) => {
                const on = i === active;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActive(i)}
                    className="shrink-0 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors"
                    style={{
                      background: on
                        ? dark
                          ? "rgba(255,255,255,0.14)"
                          : "rgba(35,131,226,0.12)"
                        : "transparent",
                      color: on ? (dark ? "#f9fafb" : "#2383e2") : dark ? "rgba(255,255,255,0.6)" : "#787774",
                    }}
                  >
                    {c.name || c.c.title || `차트 ${i + 1}`}
                  </button>
                );
              })}
            </div>
          )}
          {current.c.title && (
            <h1 className="mb-3 text-base font-semibold" style={{ color: fg }}>
              {current.c.title}
            </h1>
          )}
          <div className="min-h-0 flex-1">
            <ChartView type={current.t} data={current.d} config={current.c} />
          </div>
        </>
      )}
    </main>
  );
}

function isDark(hex: string): boolean {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}
