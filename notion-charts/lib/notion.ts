import { Client } from "@notionhq/client";
import type { NotionPropertyMeta } from "./types";
import { extractValue } from "./notion-values";

export { extractValue };

export function notionClient(token: string) {
  return new Client({ auth: token });
}

export async function inspectDatabase(token: string, databaseId: string) {
  const notion = notionClient(token);
  const db = await notion.databases.retrieve({ database_id: databaseId });

  const dataSources =
    "data_sources" in db && Array.isArray(db.data_sources) ? db.data_sources : [];
  if (dataSources.length === 0) {
    throw new Error(
      "이 데이터베이스에 접근할 수 있는 데이터 소스가 없습니다. Integration이 DB에 연결되었는지 확인하세요.",
    );
  }
  const dataSourceId = dataSources[0].id;

  const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  const propsRecord =
    "properties" in ds && ds.properties ? ds.properties : {};
  const properties: NotionPropertyMeta[] = Object.entries(propsRecord).map(
    ([name, value]) => ({
      name,
      type: (value as { type: string }).type,
    }),
  );

  const title =
    "title" in db && Array.isArray(db.title) && db.title[0]?.plain_text
      ? (db.title[0].plain_text as string)
      : undefined;

  // Pull a capped sample of rows so the client can build live previews
  // without hitting Notion on every config tweak.
  const rows = await fetchAllRows(token, dataSourceId, 2000);

  return { dataSourceId, properties, title, rows };
}

export async function fetchAllRows(
  token: string,
  dataSourceId: string,
  maxRows = Infinity,
) {
  const notion = notionClient(token);
  const all: Array<Record<string, unknown>> = [];
  let cursor: string | undefined = undefined;
  do {
    const res: Awaited<ReturnType<typeof notion.dataSources.query>> =
      await notion.dataSources.query({
        data_source_id: dataSourceId,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
    for (const r of res.results) {
      if ("properties" in r) {
        all.push(r.properties as Record<string, unknown>);
      }
    }
    if (all.length >= maxRows) return all.slice(0, maxRows);
    cursor = res.next_cursor ?? undefined;
    if (!res.has_more) break;
  } while (cursor);
  return all;
}

