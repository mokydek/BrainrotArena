// Fixtures shaped like real responses (trimmed).

export const tiktokProfileHtml = `<!DOCTYPE html><html><head><title>KAZ (@kazuhiko_mayuko) | TikTok</title></head><body>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
  __DEFAULT_SCOPE__: {
    "webapp.app-context": { language: "en" },
    "webapp.user-detail": {
      userInfo: {
        user: {
          id: "6800000000000000000",
          uniqueId: "kazuhiko_mayuko",
          nickname: "KAZ 🔥",
          avatarLarger: "https://p16-sign-va.tiktokcdn.com/avatar-large.jpeg?x-expires=1&x-signature=a",
          avatarMedium: "https://p16-sign-va.tiktokcdn.com/avatar-medium.jpeg",
          avatarThumb: "https://p16-sign-va.tiktokcdn.com/avatar-thumb.jpeg",
          signature: "LIVE every day 🎮",
          verified: true,
          secUid: "MS4wLjABAAAA",
          roomId: "7419000000000000001",
        },
        stats: { followerCount: 1523000, followingCount: 12, heartCount: 9000000, videoCount: 300 },
      },
      statusCode: 0,
      statusMsg: "",
    },
  },
})}</script></body></html>`;

export const tiktokSigiHtml = `<html><script id="SIGI_STATE" type="application/json">${JSON.stringify({
  UserModule: {
    users: { rickystarsab: { uniqueId: "rickystarsab", nickname: "RickyStarSab", avatarLarger: "https://cdn/r.jpg", verified: false, roomId: "" } },
    stats: { rickystarsab: { followerCount: 88000 } },
  },
})}</script></html>`;

export function tiktokLiveApi(status: 2 | 4) {
  return {
    data: {
      user: {
        avatarThumb: "https://p16-sign-va.tiktokcdn.com/avatar-thumb.jpeg",
        id: "6800000000000000000",
        nickname: "KAZ 🔥",
        roomId: status === 2 ? "7419000000000000001" : "",
        secUid: "MS4wLjABAAAA",
        status,
        uniqueId: "kazuhiko_mayuko",
      },
      liveRoom: {
        coverUrl: "https://cdn/cover.jpg",
        liveRoomStats: { userCount: 1234 },
        startTime: 1727260000,
        status,
        title: "ROBLOX GIVEAWAY",
      },
    },
    message: "",
    statusCode: 0,
  };
}

export const youtubeChannelHtml = `<html><head>
<meta property="og:title" content="Brainrot Channel">
<meta property="og:image" content="https://yt3.googleusercontent.com/avatar=s900">
</head><body><script>var ytInitialData = {"header":{"c4TabbedHeaderRenderer":{"badges":[{"metadataBadgeRenderer":{"style":"BADGE_STYLE_TYPE_VERIFIED"}}],"subscriberCountText":{"accessibility":{"accessibilityData":{"label":"1.25 million subscribers"}},"simpleText":"1.25M subscribers"}}},"metadata":{"channelMetadataRenderer":{"vanityChannelUrl":"x"}},"navigationEndpoint":{"browseEndpoint":{"canonicalBaseUrl":"/@brainrotchannel"}}};</script></body></html>`;

export const youtubeLiveHtml = `<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=abcdefghijk"></head><body><script>var ytInitialPlayerResponse = {"microformat":{"playerMicroformatRenderer":{"liveBroadcastDetails":{"isLiveNow":true,"startTimestamp":"2026-09-25T09:00:00+00:00"}}},"videoDetails":{"isLive":true}}; var ytInitialData = {"viewCount":{"videoViewCountRenderer":{"originalViewCount":"4321"}}};</script></body></html>`;

export const youtubeOfflineHtml = `<html><head><link rel="canonical" href="https://www.youtube.com/@brainrotchannel"></head><body>nothing live</body></html>`;
