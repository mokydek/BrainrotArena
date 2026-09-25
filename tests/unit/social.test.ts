import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSocialUrl } from "../../src/lib/social/url.ts";
import {
  parseCount,
  parseKickChannel,
  parseTikTokCheckAlive,
  parseTikTokLiveApi,
  parseTikTokLivePage,
  parseTikTokProfileHtml,
  parseTwitchGql,
  parseYouTubeChannelHtml,
  parseYouTubeLiveHtml,
} from "../../src/lib/social/parse.ts";
import { tiktokProfileHtml, tiktokSigiHtml, tiktokLiveApi, youtubeChannelHtml, youtubeLiveHtml, youtubeOfflineHtml } from "../fixtures/social.ts";

test("parseSocialUrl: tiktok variants", () => {
  assert.deepEqual(parseSocialUrl("https://www.tiktok.com/@kazuhiko_mayuko"), {
    platform: "tiktok",
    handle: "kazuhiko_mayuko",
    profileUrl: "https://www.tiktok.com/@kazuhiko_mayuko",
  });
  assert.equal(parseSocialUrl("tiktok.com/@rip_guuhyt?lang=en")?.handle, "rip_guuhyt");
  assert.equal(parseSocialUrl("https://m.tiktok.com/@deets_gaming/live")?.handle, "deets_gaming");
  assert.equal(parseSocialUrl("https://www.tiktok.com/@ps99game/video/7300000000000000000")?.handle, "ps99game");
  assert.equal(parseSocialUrl("@frexx180")?.platform, "tiktok");
  assert.equal(parseSocialUrl("@frexx180")?.handle, "frexx180");
  assert.equal(parseSocialUrl("https://vm.tiktok.com/ZMabc123/")?.needsResolve, true);
  assert.equal(parseSocialUrl("https://www.tiktok.com/t/ZT8abc/")?.needsResolve, true);
  assert.equal(parseSocialUrl("https://www.tiktok.com/explore"), null);
});

test("parseSocialUrl: other platforms", () => {
  assert.deepEqual(parseSocialUrl("https://www.youtube.com/@MrBeast/streams"), { platform: "youtube", handle: "@MrBeast", profileUrl: "https://www.youtube.com/@MrBeast" });
  assert.equal(parseSocialUrl("youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA")?.profileUrl, "https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA");
  assert.deepEqual(parseSocialUrl("https://twitch.tv/Kai_Cenat"), { platform: "twitch", handle: "kai_cenat", profileUrl: "https://www.twitch.tv/kai_cenat" });
  assert.deepEqual(parseSocialUrl("kick.com/xQc"), { platform: "kick", handle: "xqc", profileUrl: "https://kick.com/xqc" });
  assert.equal(parseSocialUrl("https://instagram.com/some.user/")?.platform, "instagram");
  assert.equal(parseSocialUrl("https://example.com/u/streamer")?.platform, "other");
  assert.equal(parseSocialUrl(""), null);
  assert.equal(parseSocialUrl("not a link"), null);
  assert.equal(parseSocialUrl("javascript:alert(1)"), null);
});

test("TikTok profile: universal data", () => {
  const p = parseTikTokProfileHtml(tiktokProfileHtml, "kazuhiko_mayuko");
  assert.ok(p);
  assert.equal(p.displayName, "KAZ 🔥");
  assert.equal(p.handle, "kazuhiko_mayuko");
  assert.equal(p.verified, true);
  assert.equal(p.followers, 1523000);
  assert.equal(p.roomId, "7419000000000000001");
  assert.match(p.avatarUrl!, /avatar-large/);
});

test("TikTok profile: SIGI_STATE and meta fallback", () => {
  const p = parseTikTokProfileHtml(tiktokSigiHtml, "rickystarsab");
  assert.equal(p?.displayName, "RickyStarSab");
  assert.equal(p?.followers, 88000);
  assert.equal(p?.verified, false);
  const m = parseTikTokProfileHtml(
    `<meta property="og:title" content="Deets Gaming (@deets_gaming) | TikTok"><meta property="og:image" content="https://cdn/x.jpg"><meta name="description" content="Deets Gaming (@deets_gaming) on TikTok | 12.5M Likes. 540.2K Followers.">`,
    "deets_gaming",
  );
  assert.equal(m?.displayName, "Deets Gaming");
  assert.equal(m?.avatarUrl, "https://cdn/x.jpg");
  assert.equal(m?.followers, 540200);
  assert.equal(parseTikTokProfileHtml("<html>captcha</html>", "x"), null);
});

test("TikTok live api: live and offline", () => {
  const live = parseTikTokLiveApi(tiktokLiveApi(2));
  assert.equal(live?.isLive, true);
  assert.equal(live?.viewers, 1234);
  assert.equal(live?.startedAt, new Date(1727260000 * 1000).toISOString());
  assert.equal(live?.displayName, "KAZ 🔥");
  const off = parseTikTokLiveApi(tiktokLiveApi(4));
  assert.equal(off?.isLive, false);
  assert.equal(off?.viewers, null);
  assert.equal(parseTikTokLiveApi({ statusCode: 19881007, data: {} }), null);
  assert.equal(parseTikTokLiveApi(null), null);
});

test("TikTok live page + check_alive", () => {
  const html = `<script id="SIGI_STATE" type="application/json">${JSON.stringify({
    LiveRoom: { liveRoomUserInfo: { user: { status: 2, roomId: "99", nickname: "N" }, liveRoom: { status: 2, startTime: 1727260000, liveRoomStats: { userCount: 50 } } } },
  })}</script>`;
  const l = parseTikTokLivePage(html);
  assert.equal(l?.isLive, true);
  assert.equal(l?.viewers, 50);
  assert.equal(parseTikTokCheckAlive({ data: [{ alive: true, room_id: 99 }] }, "99"), true);
  assert.equal(parseTikTokCheckAlive({ data: [{ alive: false, room_id: 99 }] }, "99"), false);
  assert.equal(parseTikTokCheckAlive({}, "99"), null);
});

test("YouTube channel + live", () => {
  const c = parseYouTubeChannelHtml(youtubeChannelHtml);
  assert.equal(c?.displayName, "Brainrot Channel");
  assert.equal(c?.avatarUrl, "https://yt3.googleusercontent.com/avatar=s900");
  assert.equal(c?.followers, 1250000);
  assert.equal(c?.verified, true);
  assert.equal(c?.handle, "@brainrotchannel");
  const l = parseYouTubeLiveHtml(youtubeLiveHtml);
  assert.equal(l.isLive, true);
  assert.equal(l.videoId, "abcdefghijk");
  assert.equal(l.viewers, 4321);
  assert.equal(parseYouTubeLiveHtml(youtubeOfflineHtml).isLive, false);
});

test("Kick + Twitch", () => {
  const k = parseKickChannel({
    slug: "xqc",
    user: { username: "xQc", profile_pic: "https://files.kick.com/p.webp" },
    verified: { id: 1 },
    followers_count: 900000,
    livestream: { is_live: true, viewer_count: 42000, created_at: "2026-09-25 10:00:00" },
  });
  assert.equal(k?.isLive, true);
  assert.equal(k?.viewers, 42000);
  assert.equal(k?.verified, true);
  assert.equal(k?.startedAt, "2026-09-25T10:00:00.000Z");
  assert.equal(parseKickChannel({ slug: "a", user: { username: "a" }, livestream: null })?.isLive, false);

  const tw = parseTwitchGql([
    { data: { user: { login: "kai", displayName: "Kai", profileImageURL: "https://x/p.png", followers: { totalCount: 10 }, roles: { isPartner: true }, stream: { viewersCount: 7, createdAt: "2026-09-25T10:00:00Z" } } } },
  ]);
  assert.equal(tw?.isLive, true);
  assert.equal(tw?.viewers, 7);
  assert.equal(parseTwitchGql([{ data: { user: null } }]), null);
});

test("parseCount", () => {
  assert.equal(parseCount("1.2M subscribers"), 1200000);
  assert.equal(parseCount("540.2K"), 540200);
  assert.equal(parseCount("3,456 subscribers"), 3456);
  assert.equal(parseCount("12,3 тыс. подписчиков"), 12300);
  assert.equal(parseCount("2 млн"), 2000000);
  assert.equal(parseCount(null), null);
});
