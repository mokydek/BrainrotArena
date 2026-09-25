import type { Platform } from "@/lib/types";

export function VerifiedIcon() {
  return (
    <svg className="verified-ic" viewBox="0 0 24 24" aria-label="verified">
      <path
        fill="#fff"
        d="M12 1.5l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z"
      />
      <path d="M7.5 12.3l3 3 6-6.3" stroke="#b3001b" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlatformIcon({ platform }: { platform: Platform }) {
  switch (platform) {
    case "tiktok":
      return (
        <svg className="platform-ic" viewBox="0 0 24 24" aria-label="TikTok">
          <path
            fill="#fff"
            d="M16.6 2h-3.3v13.2a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9a6.3 6.3 0 1 0 5.3 6.2V8.6a7.9 7.9 0 0 0 4.4 1.3V6.6a4.6 4.6 0 0 1-4.4-4.6z"
          />
        </svg>
      );
    case "youtube":
      return (
        <svg className="platform-ic" viewBox="0 0 24 24" aria-label="YouTube">
          <rect x="1.5" y="5" width="21" height="14" rx="4" fill="#fff" />
          <path d="M10 9l5 3-5 3z" fill="#d10f2b" />
        </svg>
      );
    case "twitch":
      return (
        <svg className="platform-ic" viewBox="0 0 24 24" aria-label="Twitch">
          <path fill="#fff" d="M4 2L2.5 6v14h5v3h3l3-3h4l5-5V2zm16 12l-3 3h-5l-3 3v-3H5V4h15z" />
          <path fill="#fff" d="M15 7h2v5h-2zm-5 0h2v5h-2z" />
        </svg>
      );
    case "kick":
      return (
        <svg className="platform-ic" viewBox="0 0 24 24" aria-label="Kick">
          <path fill="#fff" d="M3 3h6v5h2V6h2V3h6v6h-2v2h-2v2h2v2h2v6h-6v-3h-2v-2H9v5H3z" />
        </svg>
      );
    case "instagram":
      return (
        <svg className="platform-ic" viewBox="0 0 24 24" aria-label="Instagram">
          <rect x="3" y="3" width="18" height="18" rx="5" stroke="#fff" strokeWidth="2" fill="none" />
          <circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="2" fill="none" />
          <circle cx="17.3" cy="6.7" r="1.2" fill="#fff" />
        </svg>
      );
    default:
      return (
        <svg className="platform-ic" viewBox="0 0 24 24" aria-label="link">
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      );
  }
}

export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, "")}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}
