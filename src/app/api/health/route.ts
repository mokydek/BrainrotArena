import { isConfigured, missingEnv } from "@/lib/env";
import { json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  if (!isConfigured()) return json({ ok: false, configured: false, missing: missingEnv(), dbReady: false });
  const { error } = await supabaseAdmin().from("contests").select("id", { head: true, count: "exact" }).limit(1);
  return json({ ok: !error, configured: true, dbReady: !error, dbError: error?.message ?? null });
}
