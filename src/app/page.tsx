import { cookies, headers } from "next/headers";
import { AppProvider } from "@/components/AppContext";
import Arena, { type ArenaData } from "@/components/Arena";
import SetupScreen from "@/components/SetupScreen";
import { ADMIN_COOKIE, PLAYER_COOKIE, hashToken, verifyAdminToken } from "@/lib/auth";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured, missingEnv } from "@/lib/env";
import { detectLang } from "@/lib/i18n";
import { discordUrl, telegramUrl } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Contest, Entry, Player, Streamer } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const jar = await cookies();
  const h = await headers();
  const lang = detectLang(jar.get("ba_lang")?.value, h.get("accept-language"));
  const isAdmin = verifyAdminToken(jar.get(ADMIN_COOKIE)?.value);

  if (!isConfigured()) return <SetupScreen lang={lang} missing={missingEnv()} dbReady={false} isAdmin={false} />;

  const sb = supabaseAdmin();
  const [streamersRes, contestRes] = await Promise.all([
    sb.from("streamers").select("*"),
    sb.from("contests").select("*").order("created_at", { ascending: false }).limit(1),
  ]);
  if (streamersRes.error || contestRes.error) {
    return <SetupScreen lang={lang} missing={[]} dbReady={false} isAdmin={isAdmin} dbError={(streamersRes.error || contestRes.error)?.message} />;
  }

  let player: Player | null = null;
  const token = jar.get(PLAYER_COOKIE)?.value;
  if (token) {
    const { data } = await sb.from("players").select("id, nickname").eq("token_hash", hashToken(token)).maybeSingle();
    player = (data as Player) ?? null;
  }

  const contest = ((contestRes.data as Contest[]) ?? [])[0] ?? null;
  const [entriesRes, mineRes, winnersRes] = await Promise.all([
    contest
      ? sb.from("contest_entries").select("*").eq("contest_id", contest.id).order("ticket", { ascending: false }).limit(40)
      : Promise.resolve({ data: [] }),
    contest && player
      ? sb.from("contest_entries").select("*").eq("contest_id", contest.id).eq("player_id", player.id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("contests").select("*").eq("status", "finished").not("winner_nickname", "is", null).order("drawn_at", { ascending: false }).limit(2),
  ]);

  const initial: ArenaData = {
    streamers: (streamersRes.data as Streamer[]) ?? [],
    contest,
    entries: (entriesRes.data as Entry[]) ?? [],
    myEntry: (mineRes.data as Entry) ?? null,
    lastWinner: ((winnersRes.data as Contest[]) ?? []).find((c) => c.id !== contest?.id) ?? null,
  };

  return (
    <div className="page">
      <AppProvider supabaseUrl={SUPABASE_URL} supabaseAnonKey={SUPABASE_ANON_KEY} initialLang={lang} initialAdmin={isAdmin} initialPlayer={player}>
        <Arena initial={initial} contactUrl={process.env.CONTACT_URL || process.env.NEXT_PUBLIC_CONTACT_URL || null} discordUrl={discordUrl()} telegramUrl={telegramUrl()} />
      </AppProvider>
    </div>
  );
}
