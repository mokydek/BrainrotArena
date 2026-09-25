import { hashToken, playerTokenFromCookie } from "@/lib/auth";
import { fail, guardConfigured, json, pgErrorCode } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

const STATUS: Record<string, number> = {
  CONTEST_NOT_FOUND: 404,
  CONTEST_CLOSED: 409,
  CONTEST_FULL: 409,
  CONTEST_NOT_STARTED: 409,
  ALREADY_JOINED: 409,
  PLAYER_NOT_FOUND: 401,
};

/** Player joins the contest (needs a nickname first). */
export async function POST(_req: Request, ctx: Ctx) {
  const denied = guardConfigured();
  if (denied) return denied;
  const { id } = await ctx.params;

  const token = await playerTokenFromCookie();
  if (!token) return fail("NO_NICKNAME", 401);
  const sb = supabaseAdmin();
  const { data: player } = await sb.from("players").select("id").eq("token_hash", hashToken(token)).maybeSingle();
  if (!player) return fail("NO_NICKNAME", 401);

  const { data, error } = await sb.rpc("join_contest", { p_contest: id, p_player: player.id });
  if (error) {
    const code = pgErrorCode(error);
    return fail(code, STATUS[code] ?? 500);
  }
  return json({ ok: true, entry: data });
}
