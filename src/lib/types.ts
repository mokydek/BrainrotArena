export type Platform = "tiktok" | "youtube" | "twitch" | "kick" | "instagram" | "other";
export type Side = "left" | "right";

export type Streamer = {
  id: string;
  side: Side;
  platform: Platform;
  handle: string;
  profile_url: string;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  followers: number | null;
  is_live: boolean;
  live_url: string | null;
  viewers: number | null;
  live_started_at: string | null;
  manual_live: boolean | null;
  live_checked_at: string | null;
  profile_checked_at: string | null;
  fetch_error: string | null;
  sort_order: number;
  paid_until: string | null;
  created_at: string;
  updated_at: string;
};

export type ContestStatus = "active" | "finished" | "cancelled";

export type Contest = {
  id: string;
  code: string;
  title: string;
  prize: string | null;
  image_url: string | null;
  max_participants: number | null;
  starts_at: string;
  ends_at: string;
  status: ContestStatus;
  entries_count: number;
  server_seed_hash: string;
  server_seed: string | null;
  client_seed: string | null;
  winner_entry_id: string | null;
  winner_player_id: string | null;
  winner_nickname: string | null;
  winner_index: number | null;
  drawn_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Entry = {
  id: string;
  contest_id: string;
  player_id: string;
  nickname: string;
  ticket: number;
  created_at: string;
};

export type Player = { id: string; nickname: string };

export function effectiveLive(s: Pick<Streamer, "is_live" | "manual_live">): boolean {
  return s.manual_live === null || s.manual_live === undefined ? s.is_live : s.manual_live;
}

export function isVisible(s: Pick<Streamer, "paid_until">, now = Date.now()): boolean {
  return !s.paid_until || new Date(s.paid_until).getTime() > now;
}

/** Live streamers first (priority), then admin order, then oldest first. */
export function sortStreamers<T extends Streamer>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const la = effectiveLive(a) ? 1 : 0;
    const lb = effectiveLive(b) ? 1 : 0;
    if (la !== lb) return lb - la;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    if (la && lb) {
      const va = a.viewers ?? -1;
      const vb = b.viewers ?? -1;
      if (va !== vb) return vb - va;
    }
    return a.created_at.localeCompare(b.created_at);
  });
}
