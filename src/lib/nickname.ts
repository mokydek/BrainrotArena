export const NICK_MIN = 3;
export const NICK_MAX = 16;

// letters (any alphabet), digits, underscore, dot, dash
const NICK_RE = /^[\p{L}\p{N}_.\-]+$/u;

export type NickError = "NICK_TOO_SHORT" | "NICK_TOO_LONG" | "NICK_BAD_CHARS";

export function normalizeNickname(raw: string): string {
  return raw.normalize("NFC").trim();
}

const RESERVED = new Set(["admin", "administrator", "moderator", "mod", "owner", "system", "support", "brainrotarena", "winner"]);

export function isReservedNickname(raw: string): boolean {
  return RESERVED.has(normalizeNickname(raw).toLowerCase().replace(/[_.\-]/g, ""));
}

export function validateNickname(raw: string): NickError | null {
  const nick = normalizeNickname(raw);
  const len = [...nick].length;
  if (len < NICK_MIN) return "NICK_TOO_SHORT";
  if (len > NICK_MAX) return "NICK_TOO_LONG";
  if (!NICK_RE.test(nick)) return "NICK_BAD_CHARS";
  return null;
}
