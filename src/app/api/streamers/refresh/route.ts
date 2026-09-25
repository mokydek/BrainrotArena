import { guardConfigured, json } from "@/lib/http";
import { refreshStale } from "@/lib/streamers";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Public, throttled refresher. Visitors ping it about once a minute;
 * only streamers whose status is older than 60s are re-checked (claimed atomically),
 * and contests whose timer has ended are drawn.
 */
export async function POST() {
  const denied = guardConfigured();
  if (denied) return denied;
  const [streamers, draws] = await Promise.all([
    refreshStale(8),
    supabaseAdmin().rpc("draw_expired_contests"),
  ]);
  return json({ ok: true, ...streamers, drawn: draws.data ?? 0 });
}

export const GET = POST;
