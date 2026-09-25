export const DEFAULT_DISCORD_URL = "https://discord.gg/nnnhQW3z54";

export function discordUrl(): string {
  return process.env.DISCORD_URL || process.env.NEXT_PUBLIC_DISCORD_URL || DEFAULT_DISCORD_URL;
}
