import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchLiveStatus, fetchSocialProfile, type SocialProfile } from "@/lib/social/fetch";
import { mirrorAvatar } from "@/lib/storage";
import type { Streamer } from "@/lib/types";

export const LIVE_CHECK_SECONDS = 60; // how often live status is re-checked
export const PROFILE_REFRESH_HOURS = 12; // how often avatar / name / followers are re-fetched

export function profileToColumns(p: SocialProfile) {
  return {
    platform: p.platform,
    handle: p.handle,
    profile_url: p.profileUrl,
    display_name: p.displayName,
    verified: p.verified,
    followers: p.followers,
    is_live: p.isLive ?? false,
    live_url: p.liveUrl,
    viewers: p.viewers,
    live_started_at: p.liveStartedAt,
    fetch_error: p.error,
    live_checked_at: new Date().toISOString(),
    profile_checked_at: new Date().toISOString(),
  };
}

/** Full refresh: profile + avatar + live. Keeps admin-entered values when fetch fails. */
export async function refreshStreamerFull(s: Streamer): Promise<Partial<Streamer>> {
  const p = await fetchSocialProfile(s.profile_url);
  if ("error" in p && !("platform" in p)) {
    return { fetch_error: p.error, profile_checked_at: new Date().toISOString() };
  }
  const prof = p as SocialProfile;
  const patch: Partial<Streamer> = {
    fetch_error: prof.error,
    profile_checked_at: new Date().toISOString(),
    live_checked_at: new Date().toISOString(),
  };
  if (!prof.error) {
    if (prof.displayName) patch.display_name = prof.displayName;
    patch.verified = prof.verified;
    if (prof.followers !== null) patch.followers = prof.followers;
  }
  if (prof.isLive !== null) {
    patch.is_live = prof.isLive;
    patch.viewers = prof.viewers;
    patch.live_url = prof.liveUrl;
    patch.live_started_at = prof.isLive ? prof.liveStartedAt ?? s.live_started_at ?? new Date().toISOString() : null;
  }
  const mirrored = await mirrorAvatar(s.id, prof.avatarUrl);
  if (mirrored) patch.avatar_url = mirrored;
  else if (!s.avatar_url && prof.avatarUrl) patch.avatar_url = prof.avatarUrl;
  return patch;
}

export async function refreshStreamerLive(s: Streamer): Promise<Partial<Streamer>> {
  const l = await fetchLiveStatus(s);
  if (l.isLive === null) return {};
  return {
    is_live: l.isLive,
    viewers: l.viewers,
    live_url: l.liveUrl ?? s.live_url,
    live_started_at: l.isLive ? l.liveStartedAt ?? s.live_started_at ?? new Date().toISOString() : null,
  };
}

/** Claims stale rows (atomic, so parallel visitors don't duplicate work) and refreshes them. */
export async function refreshStale(limit = 8): Promise<{ checked: number; updated: number }> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("claim_stale_streamers", { p_age_seconds: LIVE_CHECK_SECONDS, p_limit: limit });
  if (error || !data) return { checked: 0, updated: 0 };
  const rows = data as Streamer[];
  const profileCutoff = Date.now() - PROFILE_REFRESH_HOURS * 3600_000;

  const results = await Promise.all(
    rows.map(async (s) => {
      const needFull = !s.profile_checked_at || new Date(s.profile_checked_at).getTime() < profileCutoff;
      const patch = needFull ? await refreshStreamerFull(s) : await refreshStreamerLive(s);
      if (!Object.keys(patch).length) return false;
      const { error: upErr } = await sb.from("streamers").update(patch).eq("id", s.id);
      return !upErr;
    }),
  );
  return { checked: rows.length, updated: results.filter(Boolean).length };
}
