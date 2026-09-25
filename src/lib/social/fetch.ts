import type { Platform } from "@/lib/types";
import { parseSocialUrl, type ParsedSocial } from "@/lib/social/url";
import {
  metaContent,
  parseKickChannel,
  parseTikTokCheckAlive,
  parseTikTokLiveApi,
  parseTikTokLivePage,
  parseTikTokProfileHtml,
  parseTwitchGql,
  parseYouTubeChannelHtml,
  parseYouTubeLiveHtml,
  type LiveData,
} from "@/lib/social/parse";

export type SocialProfile = {
  platform: Platform;
  handle: string;
  profileUrl: string;
  displayName: string | null;
  avatarUrl: string | null;
  verified: boolean;
  followers: number | null;
  /** null = could not detect */
  isLive: boolean | null;
  liveUrl: string | null;
  viewers: number | null;
  liveStartedAt: string | null;
  error: string | null;
};

export type LiveStatus = {
  isLive: boolean | null;
  liveUrl: string | null;
  viewers: number | null;
  liveStartedAt: string | null;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

async function get(url: string, opts: { json?: boolean; headers?: Record<string, string>; timeout?: number } = {}) {
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, ...(opts.json ? { Accept: "application/json, text/plain, */*" } : {}), ...opts.headers },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeout ?? 6000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return opts.json ? res.json() : res.text();
}

async function attempt<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function resolveShortLink(url: string): Promise<ParsedSocial | null> {
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(7000) });
  const parsed = parseSocialUrl(res.url);
  return parsed && !parsed.needsResolve ? parsed : null;
}

// ------------------------------------------------------------------ TikTok

async function tiktokLive(handle: string, roomIdHint?: string | null): Promise<LiveData | null> {
  const apiUrl =
    `https://www.tiktok.com/api-live/user/room/?aid=1988&app_name=tiktok_web&device_platform=web_pc` +
    `&app_language=en&browser_language=en-US&browser_name=Mozilla&browser_platform=Win32` +
    `&uniqueId=${encodeURIComponent(handle)}&sourceType=54`;
  const api = await attempt(async () => parseTikTokLiveApi(await get(apiUrl, { json: true, headers: { Referer: `https://www.tiktok.com/@${handle}/live` } })));
  if (api) return api;

  const page = await attempt(async () => parseTikTokLivePage(await get(`https://www.tiktok.com/@${encodeURIComponent(handle)}/live`)));
  if (page) return page;

  if (roomIdHint) {
    const alive = await attempt(async () =>
      parseTikTokCheckAlive(await get(`https://webcast.tiktok.com/webcast/room/check_alive/?aid=1988&room_ids=${roomIdHint}`, { json: true }), roomIdHint),
    );
    if (alive !== null) return { isLive: alive, viewers: null, startedAt: null, roomId: roomIdHint };
  }
  return null;
}

async function tiktokProfile(p: ParsedSocial): Promise<SocialProfile> {
  const handle = p.handle;
  const html = await attempt(() => get(`https://www.tiktok.com/@${encodeURIComponent(handle)}?lang=en`));
  const prof = html ? parseTikTokProfileHtml(html, handle) : null;
  const live = await tiktokLive(handle, prof?.roomId);

  let displayName = prof?.displayName || live?.displayName || null;
  if (!displayName) {
    const o = await attempt(async () =>
      (await get(`https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@${handle}`)}`, { json: true })) as Record<string, string>,
    );
    displayName = o?.author_name || o?.title || null;
  }
  const avatarUrl = prof?.avatarUrl || live?.avatarUrl || `https://unavatar.io/tiktok/${encodeURIComponent(handle)}?fallback=false`;
  const isLive = live ? live.isLive : null;
  const got = Boolean(prof || live);

  return {
    platform: "tiktok",
    handle: prof?.handle || handle,
    profileUrl: `https://www.tiktok.com/@${prof?.handle || handle}`,
    displayName,
    avatarUrl,
    verified: prof?.verified ?? false,
    followers: prof?.followers ?? null,
    isLive,
    liveUrl: `https://www.tiktok.com/@${prof?.handle || handle}/live`,
    viewers: live?.viewers ?? null,
    liveStartedAt: live?.startedAt ?? null,
    error: got ? null : "TIKTOK_UNREACHABLE",
  };
}

// ------------------------------------------------------------------ YouTube

const YT_HEADERS = { Cookie: "CONSENT=YES+cb; SOCS=CAI" };

async function youtubeLive(profileUrl: string): Promise<LiveStatus | null> {
  const html = await attempt(() => get(`${profileUrl.replace(/\/$/, "")}/live`, { headers: YT_HEADERS }));
  if (!html) return null;
  const l = parseYouTubeLiveHtml(html);
  return {
    isLive: l.isLive,
    liveUrl: l.videoId ? `https://www.youtube.com/watch?v=${l.videoId}` : `${profileUrl}/live`,
    viewers: l.viewers,
    liveStartedAt: l.startedAt,
  };
}

async function youtubeProfile(p: ParsedSocial): Promise<SocialProfile> {
  const html = await attempt(() => get(p.profileUrl, { headers: YT_HEADERS }));
  const prof = html ? parseYouTubeChannelHtml(html) : null;
  const live = await youtubeLive(p.profileUrl);
  return {
    platform: "youtube",
    handle: prof?.handle || p.handle,
    profileUrl: p.profileUrl,
    displayName: prof?.displayName || p.handle.replace(/^@/, ""),
    avatarUrl: prof?.avatarUrl || null,
    verified: prof?.verified ?? false,
    followers: prof?.followers ?? null,
    isLive: live?.isLive ?? null,
    liveUrl: live?.liveUrl ?? `${p.profileUrl}/live`,
    viewers: live?.viewers ?? null,
    liveStartedAt: live?.liveStartedAt ?? null,
    error: prof ? null : "YOUTUBE_UNREACHABLE",
  };
}

// ------------------------------------------------------------------ Twitch

const TWITCH_QUERY = (login: string) => [
  {
    query: `query($login:String!){user(login:$login){login displayName profileImageURL(width:300) followers{totalCount} roles{isPartner} stream{viewersCount createdAt}}}`,
    variables: { login },
  },
];

async function twitchData(handle: string) {
  const gql = await attempt(async () => {
    const res = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: { "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko", "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify(TWITCH_QUERY(handle)),
      signal: AbortSignal.timeout(7000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseTwitchGql(await res.json());
  });
  if (gql) return gql;

  // decapi.me fallback
  const [avatar, uptime, viewers] = await Promise.all([
    attempt(() => get(`https://decapi.me/twitch/avatar/${handle}`) as Promise<string>),
    attempt(() => get(`https://decapi.me/twitch/uptime/${handle}`) as Promise<string>),
    attempt(() => get(`https://decapi.me/twitch/viewercount/${handle}`) as Promise<string>),
  ]);
  if (!avatar && !uptime) return null;
  const offline = !uptime || /offline/i.test(uptime);
  return {
    displayName: handle,
    handle,
    avatarUrl: avatar && /^https?:/.test(avatar.trim()) ? avatar.trim() : null,
    verified: false,
    followers: null,
    roomId: null,
    isLive: !offline,
    viewers: !offline && viewers && /^\d+$/.test(viewers.trim()) ? Number(viewers.trim()) : null,
    startedAt: null,
  };
}

async function twitchProfile(p: ParsedSocial): Promise<SocialProfile> {
  const d = await twitchData(p.handle);
  return {
    platform: "twitch",
    handle: d?.handle || p.handle,
    profileUrl: p.profileUrl,
    displayName: d?.displayName || p.handle,
    avatarUrl: d?.avatarUrl || null,
    verified: d?.verified ?? false,
    followers: d?.followers ?? null,
    isLive: d ? d.isLive : null,
    liveUrl: p.profileUrl,
    viewers: d?.viewers ?? null,
    liveStartedAt: d?.startedAt ?? null,
    error: d ? null : "TWITCH_UNREACHABLE",
  };
}

// ------------------------------------------------------------------ Kick

async function kickData(handle: string) {
  for (const v of ["v2", "v1"]) {
    const d = await attempt(async () => parseKickChannel(await get(`https://kick.com/api/${v}/channels/${encodeURIComponent(handle)}`, { json: true })));
    if (d) return d;
  }
  return null;
}

async function kickProfile(p: ParsedSocial): Promise<SocialProfile> {
  const d = await kickData(p.handle);
  return {
    platform: "kick",
    handle: d?.handle || p.handle,
    profileUrl: p.profileUrl,
    displayName: d?.displayName || p.handle,
    avatarUrl: d?.avatarUrl || null,
    verified: d?.verified ?? false,
    followers: d?.followers ?? null,
    isLive: d ? d.isLive : null,
    liveUrl: p.profileUrl,
    viewers: d?.viewers ?? null,
    liveStartedAt: d?.startedAt ?? null,
    error: d ? null : "KICK_UNREACHABLE",
  };
}

// ------------------------------------------------------------------ Instagram / other

async function genericProfile(p: ParsedSocial): Promise<SocialProfile> {
  const html = p.platform === "other" ? await attempt(() => get(p.profileUrl)) : null;
  const title = html ? metaContent(html, "og:title") : null;
  const image = html ? metaContent(html, "og:image") : null;
  return {
    platform: p.platform,
    handle: p.handle,
    profileUrl: p.profileUrl,
    displayName: title || p.handle,
    avatarUrl: image || (p.platform === "instagram" ? `https://unavatar.io/instagram/${encodeURIComponent(p.handle)}?fallback=false` : null),
    verified: false,
    followers: null,
    isLive: null,
    liveUrl: p.profileUrl,
    viewers: null,
    liveStartedAt: null,
    error: null,
  };
}

// ------------------------------------------------------------------ public API

export async function fetchSocialProfile(input: string): Promise<SocialProfile | { error: string }> {
  let parsed = parseSocialUrl(input);
  if (!parsed) return { error: "BAD_LINK" };
  if (parsed.needsResolve) {
    const resolved = await attempt(() => resolveShortLink(parsed!.profileUrl));
    if (!resolved) return { error: "SHORT_LINK_UNRESOLVED" };
    parsed = resolved;
  }
  switch (parsed.platform) {
    case "tiktok":
      return tiktokProfile(parsed);
    case "youtube":
      return youtubeProfile(parsed);
    case "twitch":
      return twitchProfile(parsed);
    case "kick":
      return kickProfile(parsed);
    default:
      return genericProfile(parsed);
  }
}

export async function fetchLiveStatus(s: { platform: Platform; handle: string; profile_url: string }): Promise<LiveStatus> {
  const none: LiveStatus = { isLive: null, liveUrl: null, viewers: null, liveStartedAt: null };
  switch (s.platform) {
    case "tiktok": {
      const l = await tiktokLive(s.handle);
      return l
        ? { isLive: l.isLive, liveUrl: `https://www.tiktok.com/@${s.handle}/live`, viewers: l.viewers, liveStartedAt: l.startedAt }
        : none;
    }
    case "youtube":
      return (await youtubeLive(s.profile_url)) ?? none;
    case "twitch": {
      const d = await twitchData(s.handle);
      return d ? { isLive: d.isLive, liveUrl: s.profile_url, viewers: d.viewers, liveStartedAt: d.startedAt } : none;
    }
    case "kick": {
      const d = await kickData(s.handle);
      return d ? { isLive: d.isLive, liveUrl: s.profile_url, viewers: d.viewers, liveStartedAt: d.startedAt } : none;
    }
    default:
      return none;
  }
}
