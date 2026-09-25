import { PLAYER_COOKIE, cookieBase, hashToken, newPlayerToken, playerTokenFromCookie } from "@/lib/auth";
import { fail, guardConfigured, json, readJson } from "@/lib/http";
import { isReservedNickname, normalizeNickname, validateNickname } from "@/lib/nickname";
import { supabaseAdmin } from "@/lib/supabase/server";

const ONE_YEAR = 60 * 60 * 24 * 365;

async function currentPlayer() {
  const token = await playerTokenFromCookie();
  if (!token) return null;
  const { data } = await supabaseAdmin()
    .from("players")
    .select("id, nickname")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  return data as { id: string; nickname: string } | null;
}

export async function GET() {
  const denied = guardConfigured();
  if (denied) return denied;
  const player = await currentPlayer();
  if (player) {
    await supabaseAdmin().from("players").update({ last_seen_at: new Date().toISOString() }).eq("id", player.id);
  }
  return json({ ok: true, player });
}

export async function POST(req: Request) {
  const denied = guardConfigured();
  if (denied) return denied;

  const body = await readJson<{ nickname?: string }>(req);
  const nickname = normalizeNickname(String(body?.nickname ?? ""));
  const bad = validateNickname(nickname);
  if (bad) return fail(bad, 400);
  if (isReservedNickname(nickname)) return fail("NICK_RESERVED", 400);

  const sb = supabaseAdmin();
  const me = await currentPlayer();

  if (me) {
    if (me.nickname === nickname) return json({ ok: true, player: me });
    const { data, error } = await sb.from("players").update({ nickname }).eq("id", me.id).select("id, nickname").single();
    if (error) return error.code === "23505" ? fail("NICK_TAKEN", 409) : fail("DB_ERROR", 500);
    return json({ ok: true, player: data });
  }

  const token = newPlayerToken();
  const { data, error } = await sb
    .from("players")
    .insert({ nickname, token_hash: hashToken(token) })
    .select("id, nickname")
    .single();
  if (error) return error.code === "23505" ? fail("NICK_TAKEN", 409) : fail("DB_ERROR", 500);

  const res = json({ ok: true, player: data });
  res.cookies.set(PLAYER_COOKIE, token, { ...cookieBase, maxAge: ONE_YEAR });
  return res;
}
