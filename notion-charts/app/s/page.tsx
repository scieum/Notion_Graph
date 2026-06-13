"use client";

import { useEffect, useState } from "react";
import { ChartView } from "@/components/charts/ChartView";
import type { ChartDatum, ChartType, WidgetConfig } from "@/lib/types";

type Snapshot = { t: ChartType; d: ChartDatum[]; c: WidgetConfig };

/** Decode a base64 (UTF-8) payload carried in the URL hash fragment. */
function decode(hash: string): Snapshot | null {
  try {
    const b64 = hash.replace(/^#/, "");
    if (!b64) return null;
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object" || !obj.t || !Array.isArray(obj.d)) return null;
    return obj as Snapshot;
  } catch {
    return null;
  }
}

export default function SnapshotPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => setSnap(decode(window.location.hash));
    read();
    setReady(true);
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const bg = snap?.c.style?.background;
  const background = bg && bg !== "transparent" ? bg : "#ffffff";
  const dark = isDark(background);

  return (
    <main className="flex h-screen w-screen flex-col p-4" style={{ background }}>
      {!ready ? null : !snap ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-[#615d59]">
          스냅샷 데이터를 읽을 수 없습니다.
        </div>
      ) : (
        <>
          {snap.c.title && (
            <h1
              className="mb-3 text-base font-semibold"
              style={{ color: dark ? "#f9fafb" : "rgba(0,0,0,0.95)" }}
            >
              {snap.c.title}
            </h1>
          )}
          <div className="min-h-0 flex-1">
            <ChartView type={snap.t} data={snap.d} config={snap.c} />
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
