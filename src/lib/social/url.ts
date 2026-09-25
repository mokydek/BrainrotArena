import type { Platform } from "@/lib/types";

export type ParsedSocial = {
  platform: Platform;
  handle: string;
  profileUrl: string;
  /** short links (vm.tiktok.com/…) must be resolved with a request first */
  needsResolve?: boolean;
};

const TIKTOK_HANDLE = /^[A-Za-z0-9_.]{2,24}$/;
const GENERIC_HANDLE = /^[A-Za-z0-9_.\-]{2,40}$/;

export function parseSocialUrl(raw: string): ParsedSocial | null {
  let input = (raw || "").trim();
  if (!input) return null;

  // "@name" => TikTok by default
  if (/^@[A-Za-z0-9_.]{2,24}$/.test(input)) {
    const handle = input.slice(1);
    return { platform: "tiktok", handle, profileUrl: `https://www.tiktok.com/@${handle}` };
  }

  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));

  // ---- TikTok
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    if (host === "vm.tiktok.com" || host === "vt.tiktok.com" || parts[0] === "t") {
      return { platform: "tiktok", handle: "", profileUrl: url.toString(), needsResolve: true };
    }
    const at = parts.find((p) => p.startsWith("@"));
    if (!at) return null;
    const handle = at.slice(1);
    if (!TIKTOK_HANDLE.test(handle)) return null;
    return { platform: "tiktok", handle, profileUrl: `https://www.tiktok.com/@${handle}` };
  }

  // ---- YouTube
  if (host === "youtube.com" || host === "youtu.be") {
    if (host === "youtu.be" || !parts.length) return null;
    if (parts[0].startsWith("@")) {
      const handle = parts[0];
      return { platform: "youtube", handle, profileUrl: `https://www.youtube.com/${handle}` };
    }
    if ((parts[0] === "channel" || parts[0] === "c" || parts[0] === "user") && parts[1]) {
      return { platform: "youtube", handle: parts[1], profileUrl: `https://www.youtube.com/${parts[0]}/${parts[1]}` };
    }
    return null;
  }

  // ---- Twitch
  if (host === "twitch.tv") {
    const handle = parts[0];
    if (!handle || !/^[A-Za-z0-9_]{2,25}$/.test(handle)) return null;
    return { platform: "twitch", handle: handle.toLowerCase(), profileUrl: `https://www.twitch.tv/${handle.toLowerCase()}` };
  }

  // ---- Kick
  if (host === "kick.com") {
    const handle = parts[0];
    if (!handle || !GENERIC_HANDLE.test(handle)) return null;
    return { platform: "kick", handle: handle.toLowerCase(), profileUrl: `https://kick.com/${handle.toLowerCase()}` };
  }

  // ---- Instagram
  if (host === "instagram.com") {
    const handle = parts[0];
    if (!handle || !GENERIC_HANDLE.test(handle)) return null;
    return { platform: "instagram", handle, profileUrl: `https://www.instagram.com/${handle}` };
  }

  // ---- anything else
  if (!host.includes(".")) return null;
  const handle = parts[parts.length - 1]?.replace(/^@/, "") || host;
  return { platform: "other", handle, profileUrl: url.toString() };
}
