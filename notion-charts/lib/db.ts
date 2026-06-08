import { neon } from "@neondatabase/serverless";
import type { ChartType, Widget, WidgetConfig } from "./types";

const sql = neon(process.env.DATABASE_URL!);

let initialized = false;

async function ensureSchema() {
  if (initialized) return;
  await sql`
    CREATE TABLE IF NOT EXISTS widgets (
      id TEXT PRIMARY KEY,
      database_id TEXT NOT NULL,
      data_source_id TEXT NOT NULL,
      token_ciphertext TEXT NOT NULL,
      chart_type TEXT NOT NULL,
      config JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  initialized = true;
}

export async function createWidget(input: {
  id: string;
  database_id: string;
  data_source_id: string;
  token_ciphertext: string;
  chart_type: ChartType;
  config: WidgetConfig;
}) {
  await ensureSchema();
  await sql`
    INSERT INTO widgets (id, database_id, data_source_id, token_ciphertext, chart_type, config)
    VALUES (${input.id}, ${input.database_id}, ${input.data_source_id},
            ${input.token_ciphertext}, ${input.chart_type}, ${JSON.stringify(input.config)})
  `;
}

export async function getWidgetWithToken(id: string): Promise<
  | (Widget & { token_ciphertext: string })
  | null
> {
  await ensureSchema();
  const rows = (await sql`
    SELECT id, database_id, data_source_id, token_ciphertext, chart_type, config
    FROM widgets WHERE id = ${id}
  `) as Array<{
    id: string;
    database_id: string;
    data_source_id: string;
    token_ciphertext: string;
    chart_type: ChartType;
    config: WidgetConfig;
  }>;
  return rows[0] ?? null;
}
