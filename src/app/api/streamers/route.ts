import { fail, guardAdmin, json, readJson } from "@/lib/http";
import { fetchSocialProfile, type SocialProfile } from "@/lib/social/fetch";
import { parseSocialUrl } from "@/lib/social/url";
import { mirrorAvatar } from "@/lib/storage";
import { profileToColumns } from "@/lib/streamers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { httpUrl, isoDate, str } from "@/lib/validate";

export const maxDuration = 60;

type Body = {
  url?: string;
  side?: string;
  displayName?: string;
  avatarUrl?: string;
  paidUntil?: string | null;
  manualLive?: boolean | null;
  profile?: SocialProfile;
};

/** Admin: add a streamer to the left / right leaderboard. */
export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const body = await readJson<Body>(req);
  if (!body) return fail("BAD_REQUEST");

  const side = body.side === "right" ? "right" : "left";
  const parsed = parseSocialUrl(String(body.url ?? ""));
  if (!parsed) return fail("BAD_LINK");

  let profile: SocialProfile | null = null;
  if (body.profile && typeof body.profile === "object" && body.profile.platform && body.profile.handle && body.profile.profileUrl) {
    profile = body.profile;
  } else {
    const fetched = await fetchSocialProfile(String(body.url));
    if ("error" in fetched && !("platform" in fetched)) return fail(fetched.error);
    profile = fetched as SocialProfile;
  }

  const sb = supabaseAdmin();

  const { data: dup } = await sb
    .from("streamers")
    .select("id")
    .eq("platform", profile.platform)
    .ilike("handle", profile.handle.replace(/[%_\\]/g, "\\$&"))
    .limit(1);
  if (dup && dup.length) return fail("DUPLICATE_STREAMER", 409);

  const { data: last } = await sb.from("streamers").select("sort_order").eq("side", side).order("sort_order", { ascending: false }).limit(1);
  const sortOrder = (last?.[0]?.sort_order ?? -1) + 1;

  const cols = profileToColumns(profile);
  const customName = str(body.displayName, 60);
  const customAvatar = httpUrl(body.avatarUrl);
  const manualLive = body.manualLive === true || body.manualLive === false ? body.manualLive : null;

  const { data: row, error } = await sb
    .from("streamers")
    .insert({
      ...cols,
      display_name: customName || cols.display_name || profile.handle,
      avatar_url: customAvatar || profile.avatarUrl,
      side,
      sort_order: sortOrder,
      manual_live: manualLive,
      paid_until: body.paidUntil ? isoDate(body.paidUntil) : null,
    })
    .select("*")
    .single();
  if (error || !row) return fail("DB_ERROR", 500, { message: error?.message });

  // permanent copy of the avatar (TikTok CDN links expire after a few days)
  const mirrored = await mirrorAvatar(row.id, customAvatar || profile.avatarUrl);
  if (mirrored) {
    const { data: updated } = await sb.from("streamers").update({ avatar_url: mirrored }).eq("id", row.id).select("*").single();
    return json({ ok: true, streamer: updated ?? row });
  }
  return json({ ok: true, streamer: row });
}
