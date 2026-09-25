import { fail, guardAdmin, isMissingColumn, json, readJson } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/server";
import { httpUrl, intOrNull, isoDate, lines, str } from "@/lib/validate";

type Body = {
  title?: string;
  prize?: string;
  imageUrl?: string;
  durationSeconds?: number;
  endsAt?: string;
  maxParticipants?: number | null;
  conditions?: string;
};

const MIN_SECONDS = 10;
const MAX_SECONDS = 365 * 24 * 3600;

/** Admin: start a new contest. */
export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const body = await readJson<Body>(req);
  if (!body) return fail("BAD_REQUEST");

  const sb = supabaseAdmin();
  const { data: active } = await sb.from("contests").select("id").eq("status", "active").limit(1);
  if (active && active.length) return fail("ACTIVE_CONTEST_EXISTS", 409);

  let endsAt: string | null = null;
  if (body.endsAt) {
    endsAt = isoDate(body.endsAt);
    if (!endsAt || new Date(endsAt).getTime() < Date.now() + MIN_SECONDS * 1000) return fail("BAD_END_TIME");
  } else {
    const secs = intOrNull(body.durationSeconds, MIN_SECONDS, MAX_SECONDS);
    if (!secs) return fail("BAD_END_TIME");
    endsAt = new Date(Date.now() + secs * 1000).toISOString();
  }

  const { data, error } = await sb.rpc("create_contest", {
    p_title: str(body.title, 80) || str(body.prize, 80) || "BRAINROT GIVEAWAY",
    p_prize: str(body.prize, 120) || "",
    p_image_url: httpUrl(body.imageUrl) || "",
    p_ends_at: endsAt,
    p_max_participants: intOrNull(body.maxParticipants, 1, 1_000_000),
    p_starts_at: null,
  });
  if (error) return fail("DB_ERROR", 500, { message: error.message });

  const conditions = lines(body.conditions);
  if (conditions) {
    const upd = await sb.from("contests").update({ conditions }).eq("id", data.id).select("*").single();
    if (upd.error) {
      if (isMissingColumn(upd.error)) return json({ ok: true, contest: data, warning: "MIGRATION_NEEDED" });
      return fail("DB_ERROR", 500, { message: upd.error.message });
    }
    return json({ ok: true, contest: upd.data });
  }
  return json({ ok: true, contest: data });
}
