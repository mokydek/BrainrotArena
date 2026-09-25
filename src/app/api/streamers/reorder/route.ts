import { fail, guardAdmin, json, readJson } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Admin: { ids: [...] } in the desired order for one side. */
export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const body = await readJson<{ ids?: unknown }>(req);
  const ids = Array.isArray(body?.ids) ? body!.ids.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  if (!ids.length) return fail("BAD_REQUEST");
  const sb = supabaseAdmin();
  const results = await Promise.all(ids.map((id, i) => sb.from("streamers").update({ sort_order: i }).eq("id", id)));
  if (results.some((r) => r.error)) return fail("DB_ERROR", 500);
  return json({ ok: true });
}
