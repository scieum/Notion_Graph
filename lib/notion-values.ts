// Pure value extraction for Notion property objects.
// Kept dependency-free (no @notionhq/client import) so it can run in the browser
// for live chart previews.

export function extractValue(prop: unknown): string | number | null {
  if (!prop || typeof prop !== "object") return null;
  const p = prop as { type?: string } & Record<string, unknown>;
  switch (p.type) {
    case "title":
    case "rich_text": {
      const arr = p[p.type] as Array<{ plain_text?: string }> | undefined;
      return arr?.map((t) => t.plain_text ?? "").join("") || null;
    }
    case "number":
      return (p.number as number | null) ?? null;
    case "select": {
      const sel = p.select as { name?: string } | null;
      return sel?.name ?? null;
    }
    case "status": {
      const s = p.status as { name?: string } | null;
      return s?.name ?? null;
    }
    case "multi_select": {
      const arr = p.multi_select as Array<{ name?: string }> | undefined;
      return arr?.map((s) => s.name).join(", ") || null;
    }
    case "date": {
      const d = p.date as { start?: string } | null;
      return d?.start ?? null;
    }
    case "checkbox":
      return (p.checkbox as boolean) ? 1 : 0;
    case "created_time":
      return (p.created_time as string) ?? null;
    case "last_edited_time":
      return (p.last_edited_time as string) ?? null;
    case "url":
      return (p.url as string) ?? null;
    case "email":
      return (p.email as string) ?? null;
    case "phone_number":
      return (p.phone_number as string) ?? null;
    case "people": {
      const arr = p.people as Array<{ name?: string }> | undefined;
      return arr?.map((u) => u.name ?? "").join(", ") || null;
    }
    case "formula": {
      const f = p.formula as { type?: string } & Record<string, unknown>;
      if (!f) return null;
      if (f.type === "number") return (f.number as number) ?? null;
      if (f.type === "string") return (f.string as string) ?? null;
      if (f.type === "boolean") return (f.boolean as boolean) ? 1 : 0;
      if (f.type === "date") {
        const d = f.date as { start?: string } | null;
        return d?.start ?? null;
      }
      return null;
    }
    case "rollup": {
      const r = p.rollup as { type?: string } & Record<string, unknown>;
      if (!r) return null;
      if (r.type === "number") return (r.number as number) ?? null;
      return null;
    }
    default:
      return null;
  }
}
