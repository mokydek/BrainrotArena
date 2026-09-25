import { fail, guardAdmin, json, readJson } from "@/lib/http";
import { parseSocialUrl } from "@/lib/social/url";
import { mirrorAvatar } from "@/lib/storage";
import { refreshStreamerFull } from "@/lib/streamers";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Streamer } from "@/lib/types";
import { httpUrl, isoDate, str } from "@/lib/validate";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

type Body = {
  side?: string;
  displayName?: string;
  avatarUrl?: string;
  manualLive?: boolean | null;
  paidUntil?: string | null;
  url?: string;
  action?: "refresh";
};

/** Admin: edit a streamer / force refresh. */
export async function PATCH(req: Request, ctx: Ctx) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await readJson<Body>(req);
  if (!body) return fail("BAD_REQUEST");

  const sb = supabaseAdmin();
  const { data: current } = await sb.from("streamers").select("*").eq("id", id).maybeSingle();
  if (!current) return fail("NOT_FOUND", 404);
  const s = current as Streamer;

  const patch: Partial<Streamer> = {};

  if (body.side === "left" || body.side === "right") {
    if (body.side !== s.side) {
      const { data: last } = await sb.from("streamers").select("sort_order").eq("side", body.side).order("sort_order", { ascending: false }).limit(1);
      patch.side = body.side;
      patch.sort_order = (last?.[0]?.sort_order ?? -1) + 1;
    }
  }
  if ("displayName" in body) patch.display_name = str(body.displayName, 60) || s.handle;
  if ("manualLive" in body) patch.manual_live = body.manualLive === true || body.manualLive === false ? body.manualLive : null;
  if ("paidUntil" in body) patch.paid_until = body.paidUntil ? isoDate(body.paidUntil) : null;

  if ("url" in body && body.url && body.url !== s.profile_url) {
    const parsed = parseSocialUrl(body.url);
    if (!parsed || parsed.needsResolve) return fail("BAD_LINK");
    patch.platform = parsed.platform;
    patch.handle = parsed.handle;
    patch.profile_url = parsed.profileUrl;
    patch.profile_checked_at = null;
    patch.live_checked_at = null;
  }

  if ("avatarUrl" in body) {
    const url = httpUrl(body.avatarUrl);
    if (url) patch.avatar_url = url.includes("/storage/v1/object/public/") ? url : (await mirrorAvatar(s.id, url)) || url;
  }

  if (body.action === "refresh") {
    Object.assign(patch, await refreshStreamerFull({ ...s, ...patch } as Streamer));
  }

  if (!Object.keys(patch).length) return json({ ok: true, streamer: s });
  const { data, error } = await sb.from("streamers").update(patch).eq("id", id).select("*").single();
  if (error) return fail("DB_ERROR", 500, { message: error.message });
  return json({ ok: true, streamer: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { error } = await sb.from("streamers").delete().eq("id", id);
  if (error) return fail("DB_ERROR", 500);
  await sb.storage.from("media").remove([`avatars/${id}.jpg`, `avatars/${id}.png`, `avatars/${id}.webp`, `avatars/${id}.gif`, `avatars/${id}.avif`]).catch(() => {});
  return json({ ok: true });
}
