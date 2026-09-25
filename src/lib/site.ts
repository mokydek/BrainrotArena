export const DEFAULT_DISCORD_URL = "https://discord.gg/mPEwsqbz35";
export const DEFAULT_TELEGRAM_URL = "https://t.me/BrainrotArena";

export function discordUrl(): string {
  return process.env.DISCORD_URL || process.env.NEXT_PUBLIC_DISCORD_URL || DEFAULT_DISCORD_URL;
}

export function telegramUrl(): string {
  return process.env.TELEGRAM_URL || process.env.NEXT_PUBLIC_TELEGRAM_URL || DEFAULT_TELEGRAM_URL;
}
