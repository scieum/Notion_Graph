import { ChartView } from "@/components/charts/ChartView";
import { buildChartData } from "@/lib/chart-data";
import { decryptToken } from "@/lib/crypto";
import { getWidgetWithToken } from "@/lib/db";
import { fetchAllRows } from "@/lib/notion";

export const dynamic = "force-dynamic";

export default async function WidgetPage(props: PageProps<"/w/[id]">) {
  const { id } = await props.params;
  const widget = await getWidgetWithToken(id);

  if (!widget) {
    return (
      <Shell background="#ffffff">
        <Empty message="위젯을 찾을 수 없습니다." />
      </Shell>
    );
  }

  let errorMsg: string | null = null;
  let data: Awaited<ReturnType<typeof buildChartData>> = [];
  try {
    const token = decryptToken(widget.token_ciphertext);
    const rows = await fetchAllRows(token, widget.data_source_id);
    data = buildChartData(rows, widget.chart_type, widget.config);
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "데이터 로드 실패";
  }

  const bg = widget.config.style?.background;
  const background = bg && bg !== "transparent" ? bg : "#ffffff";
  const dark = background === "#1f2937" || isDark(background);

  return (
    <Shell background={background}>
      {widget.config.title && (
        <h1
          className="mb-3 text-base font-semibold"
          style={{ color: dark ? "#f9fafb" : "rgba(0,0,0,0.95)" }}
        >
          {widget.config.title}
        </h1>
      )}
      <div className="flex-1 min-h-0">
        {errorMsg ? (
          <Empty message={errorMsg} />
        ) : (
          <ChartView type={widget.chart_type} data={data} config={widget.config} />
        )}
      </div>
    </Shell>
  );
}

function isDark(hex: string): boolean {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  // perceived luminance
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

function Shell({
  background,
  children,
}: {
  background: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex h-screen w-screen flex-col p-4" style={{ background }}>
      {children}
    </main>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-[#615d59]">
      {message}
    </div>
  );
}
