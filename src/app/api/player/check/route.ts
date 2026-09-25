import { hashToken, playerTokenFromCookie } from "@/lib/auth";
import { guardConfigured, json } from "@/lib/http";
import { isReservedNickname, normalizeNickname, validateNickname } from "@/lib/nickname";
import { supabaseAdmin } from "@/lib/supabase/server";

/** GET /api/player/check?nickname=… -> { available, error? } */
export async function GET(req: Request) {
  const denied = guardConfigured();
  if (denied) return denied;
  const nickname = normalizeNickname(new URL(req.url).searchParams.get("nickname") || "");
  const bad = validateNickname(nickname) || (isReservedNickname(nickname) ? "NICK_RESERVED" : null);
  if (bad) return json({ ok: true, available: false, error: bad });

  const { data } = await supabaseAdmin()
    .from("players")
    .select("id, token_hash")
    .eq("nickname_key", nickname.toLowerCase())
    .maybeSingle();

  if (!data) return json({ ok: true, available: true });
  const token = await playerTokenFromCookie();
  const mine = token ? data.token_hash === hashToken(token) : false;
  return json({ ok: true, available: mine, mine, error: mine ? null : "NICK_TAKEN" });
}
