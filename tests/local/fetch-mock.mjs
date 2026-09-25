// Loaded with NODE_OPTIONS="--import ./tests/local/fetch-mock.mjs" for e2e runs:
// replaces TikTok / YouTube / Twitch / Kick / CDN responses with fixtures, so the real
// parsing + storage code paths run without internet. Live status is controlled by /tmp/ba-live.json.
import fs from "node:fs";
import zlib from "node:zlib";

const realFetch = globalThis.fetch;
const LIVE_FILE = "/tmp/ba-live.json";

function liveMap() {
  try {
    return JSON.parse(fs.readFileSync(LIVE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(r, g, b, size = 64) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 3 + 1) + 1 + x * 3;
      const ring = (x - size / 2) ** 2 + (y - size / 2) ** 2 < (size / 3) ** 2;
      raw[o] = ring ? 255 : r; raw[o + 1] = ring ? 230 : g; raw[o + 2] = ring ? 120 : b;
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const USERS = {
  kazuhiko_mayuko: { nickname: "KAZ", verified: true, followers: 1523000, color: [200, 30, 60] },
  rickystarsab: { nickname: "RICKYSTARSAB", verified: false, followers: 88000, color: [30, 90, 200] },
  deets_gaming: { nickname: "DEETS GAMING", verified: true, followers: 540200, color: [20, 150, 60], profileBlocked: true },
  frexx180: { nickname: "FREXX", verified: true, followers: 2100000, color: [40, 40, 40] },
  gojobtww: { nickname: "GOJOBTWW", verified: true, followers: 310000, color: [120, 60, 200] },
};

const html = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

function tiktokProfile(handle) {
  const u = USERS[handle];
  if (!u || u.profileBlocked) return html("<html><body>Please wait...</body></html>", 403);
  const data = {
    __DEFAULT_SCOPE__: {
      "webapp.user-detail": {
        userInfo: {
          user: {
            uniqueId: handle,
            nickname: u.nickname,
            avatarLarger: `https://p16-sign-va.tiktokcdn.com/${handle}~c5_1080x1080.png?x-expires=1`,
            verified: u.verified,
            roomId: liveMap()[handle] ? "7419" : "",
          },
          stats: { followerCount: u.followers },
        },
        statusCode: 0,
      },
    },
  };
  return html(`<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script></html>`);
}

function tiktokLiveApi(handle) {
  const u = USERS[handle];
  if (!u) return json({ statusCode: 19881007, message: "user_not_found", data: {} });
  const live = Boolean(liveMap()[handle]);
  return json({
    data: {
      user: { uniqueId: handle, nickname: u.nickname, avatarThumb: `https://p16-sign-va.tiktokcdn.com/${handle}~thumb.png`, status: live ? 2 : 4, roomId: live ? "7419" : "" },
      liveRoom: { status: live ? 2 : 4, startTime: Math.floor(Date.now() / 1000) - 600, liveRoomStats: { userCount: live ? liveMap()[handle] : 0 } },
    },
    statusCode: 0,
  });
}

globalThis.fetch = async function mockedFetch(input, init) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const host = url.hostname;

  if (host === "www.tiktok.com" || host === "tiktok.com") {
    if (url.pathname === "/api-live/user/room/") return tiktokLiveApi(url.searchParams.get("uniqueId"));
    if (url.pathname === "/oembed") return json({ author_name: "oEmbed Name" });
    const m = url.pathname.match(/^\/@([^/]+)(\/live)?/);
    if (m && m[2]) return html("<html>no sigi</html>", 403);
    if (m) return tiktokProfile(m[1]);
    return html("not found", 404);
  }
  if (host === "vm.tiktok.com") {
    const r = new Response("", { status: 200 });
    Object.defineProperty(r, "url", { value: "https://www.tiktok.com/@gojobtww?_t=abc" });
    return r;
  }
  if (host === "webcast.tiktok.com") return json({ data: [] });
  if (host.endsWith("tiktokcdn.com")) {
    const handle = url.pathname.slice(1).split("~")[0];
    const c = USERS[handle]?.color || [128, 128, 128];
    return new Response(png(...c), { status: 200, headers: { "content-type": "image/png" } });
  }
  if (host === "unavatar.io") return new Response(png(90, 90, 90), { status: 200, headers: { "content-type": "image/png" } });
  if (host === "www.youtube.com" || host === "gql.twitch.tv" || host === "decapi.me" || host === "kick.com") {
    return html("blocked in tests", 403);
  }
  return realFetch(input, init);
};
