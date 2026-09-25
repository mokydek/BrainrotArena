// Pure parsers (no network) — unit-tested with fixtures.

export type ProfileData = {
  displayName: string | null;
  handle: string | null;
  avatarUrl: string | null;
  verified: boolean;
  followers: number | null;
  roomId: string | null;
};

export type LiveData = {
  isLive: boolean;
  viewers: number | null;
  startedAt: string | null;
  roomId: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function extractScriptJson(html: string, id: string): unknown | null {
  const re = new RegExp(`<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)</script>`, "i");
  const m = html.match(re);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

export function metaContent(html: string, prop: string): string | null {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re1) || html.match(re2);
  return m ? decodeEntities(m[1]) : null;
}

/** "1.2M", "12,3 тыс.", "3 456 subscribers" -> number */
export function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = String(text).replace(/ /g, " ").match(/([\d][\d\s,.]*)\s*([KkMmBb]|тыс|млн|млрд)?/);
  if (!m) return null;
  let numStr = m[1].trim().replace(/\s/g, "");
  const suffix = (m[2] || "").toLowerCase();
  if (suffix) numStr = numStr.replace(",", ".");
  else numStr = numStr.replace(/[,.]/g, "");
  const n = parseFloat(numStr);
  if (!Number.isFinite(n)) return null;
  const mult = suffix === "k" || suffix === "тыс" ? 1e3 : suffix === "m" || suffix === "млн" ? 1e6 : suffix === "b" || suffix === "млрд" ? 1e9 : 1;
  return Math.round(n * mult);
}

type AnyObj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ------------------------------------------------------------------ TikTok

export function parseTikTokProfileHtml(html: string, handle: string): ProfileData | null {
  // Current layout
  const uni = extractScriptJson(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__") as AnyObj | null;
  const detail = uni?.__DEFAULT_SCOPE__?.["webapp.user-detail"];
  const user = detail?.userInfo?.user;
  if (user && (user.uniqueId || user.nickname)) {
    const stats = detail.userInfo.stats || detail.userInfo.statsV2 || {};
    return {
      displayName: user.nickname || null,
      handle: user.uniqueId || handle,
      avatarUrl: user.avatarLarger || user.avatarMedium || user.avatarThumb || null,
      verified: Boolean(user.verified),
      followers: toNum(stats.followerCount),
      roomId: user.roomId ? String(user.roomId) : null,
    };
  }

  // Older layout
  const sigi = extractScriptJson(html, "SIGI_STATE") as AnyObj | null;
  const users = sigi?.UserModule?.users;
  if (users) {
    const key = Object.keys(users).find((k) => k.toLowerCase() === handle.toLowerCase()) || Object.keys(users)[0];
    const u = users[key];
    if (u) {
      const st = sigi?.UserModule?.stats?.[key] || {};
      return {
        displayName: u.nickname || null,
        handle: u.uniqueId || handle,
        avatarUrl: u.avatarLarger || u.avatarMedium || u.avatarThumb || null,
        verified: Boolean(u.verified),
        followers: toNum(st.followerCount),
        roomId: u.roomId ? String(u.roomId) : null,
      };
    }
  }

  // Meta tags fallback
  const title = metaContent(html, "og:title");
  const image = metaContent(html, "og:image");
  if (title || image) {
    const name = title ? title.replace(/\s*\(@[^)]*\).*$/, "").replace(/\s*\|\s*TikTok.*$/i, "").trim() : null;
    const desc = metaContent(html, "description") || metaContent(html, "og:description") || "";
    const fm = desc.match(/([\d.,]+\s*[KMB]?)\s*Followers/i);
    return {
      displayName: name || null,
      handle,
      avatarUrl: image,
      verified: false,
      followers: fm ? parseCount(fm[1]) : null,
      roomId: null,
    };
  }
  return null;
}

/** https://www.tiktok.com/api-live/user/room/?uniqueId=… response */
export function parseTikTokLiveApi(data: AnyObj | null): LiveData | null {
  if (!data || typeof data !== "object") return null;
  const d = data.data;
  if (!d || (!d.user && !d.liveRoom)) return null;
  const userStatus = toNum(d.user?.status);
  const roomStatus = toNum(d.liveRoom?.status);
  const isLive = userStatus === 2 || roomStatus === 2;
  const start = toNum(d.liveRoom?.startTime);
  return {
    isLive,
    viewers: isLive ? toNum(d.liveRoom?.liveRoomStats?.userCount) : null,
    startedAt: isLive && start ? new Date(start * 1000).toISOString() : null,
    roomId: d.user?.roomId ? String(d.user.roomId) : null,
    displayName: d.user?.nickname || null,
    avatarUrl: d.user?.avatarLarger || d.user?.avatarMedium || d.user?.avatarThumb || null,
  };
}

/** https://www.tiktok.com/@user/live page */
export function parseTikTokLivePage(html: string): LiveData | null {
  const sigi = extractScriptJson(html, "SIGI_STATE") as AnyObj | null;
  const info = sigi?.LiveRoom?.liveRoomUserInfo;
  if (info) {
    const status = toNum(info.user?.status ?? info.liveRoom?.status);
    const isLive = status === 2;
    const start = toNum(info.liveRoom?.startTime);
    return {
      isLive,
      viewers: isLive ? toNum(info.liveRoom?.liveRoomStats?.userCount) : null,
      startedAt: isLive && start ? new Date(start * 1000).toISOString() : null,
      roomId: info.user?.roomId ? String(info.user.roomId) : null,
      displayName: info.user?.nickname || null,
      avatarUrl: info.user?.avatarLarger || info.user?.avatarThumb || null,
    };
  }
  return null;
}

/** https://webcast.tiktok.com/webcast/room/check_alive/?room_ids=… */
export function parseTikTokCheckAlive(data: AnyObj | null, roomId: string): boolean | null {
  const arr = data?.data;
  if (!Array.isArray(arr)) return null;
  const row = arr.find((r: AnyObj) => String(r.room_id ?? r.room_id_str) === String(roomId)) || arr[0];
  return row ? Boolean(row.alive) : null;
}

// ------------------------------------------------------------------ YouTube

export function parseYouTubeChannelHtml(html: string): ProfileData | null {
  const title = metaContent(html, "og:title");
  const image = metaContent(html, "og:image");
  if (!title && !image) return null;
  const subs =
    html.match(/"subscriberCountText":\{[\s\S]{0,400}?"simpleText":"([^"]+)"/)?.[1] ||
    html.match(/"content":"([^"]*?subscribers?)"/i)?.[1] ||
    null;
  const handle = html.match(/"canonicalBaseUrl":"\/(@[^"]+)"/)?.[1] || null;
  return {
    displayName: title,
    handle,
    avatarUrl: image,
    verified: /BADGE_STYLE_TYPE_VERIFIED/.test(html) || /"CHECK_CIRCLE_THICK"/.test(html),
    followers: parseCount(subs),
    roomId: null,
  };
}

export function parseYouTubeLiveHtml(html: string): LiveData & { videoId: string | null } {
  const isLive = /"isLiveNow"\s*:\s*true/.test(html);
  const videoId = isLive ? html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1] || null : null;
  const viewers = isLive ? toNum(html.match(/"originalViewCount":"(\d+)"/)?.[1]) : null;
  const startedAt = isLive ? html.match(/"startTimestamp":"([^"]+)"/)?.[1] || null : null;
  return { isLive, viewers, startedAt, roomId: null, videoId };
}

// ------------------------------------------------------------------ Kick

export function parseKickChannel(data: AnyObj | null): (ProfileData & LiveData) | null {
  if (!data || typeof data !== "object" || (!data.user && !data.slug)) return null;
  const ls = data.livestream;
  const isLive = Boolean(ls && (ls.is_live === undefined || ls.is_live));
  return {
    displayName: data.user?.username || data.slug || null,
    handle: data.slug || null,
    avatarUrl: data.user?.profile_pic || null,
    verified: Boolean(data.verified),
    followers: toNum(data.followers_count ?? data.followersCount),
    roomId: null,
    isLive,
    viewers: isLive ? toNum(ls?.viewer_count ?? ls?.viewers) : null,
    startedAt: isLive ? (ls?.created_at ? new Date(ls.created_at.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(ls.created_at) ? "" : "Z")).toISOString() : null) : null,
  };
}

// ------------------------------------------------------------------ Twitch (GQL)

export function parseTwitchGql(data: AnyObj | null): (ProfileData & LiveData) | null {
  const u = Array.isArray(data) ? data[0]?.data?.user : data?.data?.user;
  if (!u) return null;
  const stream = u.stream;
  return {
    displayName: u.displayName || u.login || null,
    handle: u.login || null,
    avatarUrl: u.profileImageURL || null,
    verified: Boolean(u.roles?.isPartner),
    followers: toNum(u.followers?.totalCount),
    roomId: null,
    isLive: Boolean(stream),
    viewers: stream ? toNum(stream.viewersCount) : null,
    startedAt: stream?.createdAt || null,
  };
}

// ------------------------------------------------------------------ utils

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
