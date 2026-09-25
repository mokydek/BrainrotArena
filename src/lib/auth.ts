import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { adminPassword, serviceRoleKey } from "@/lib/env";

export const ADMIN_COOKIE = "ba_admin";
export const PLAYER_COOKIE = "ba_player";
const ADMIN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function adminSecret(): string {
  return (
    process.env.ADMIN_SECRET ||
    createHash("sha256").update(`${adminPassword()}::${serviceRoleKey()}::brainrot-arena`).digest("hex")
  );
}

function sign(value: string): string {
  return createHmac("sha256", adminSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function checkAdminPassword(input: string): boolean {
  const real = adminPassword();
  if (!real) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(real).digest();
  return timingSafeEqual(a, b);
}

export function makeAdminToken(): { value: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_TTL_SECONDS;
  const payload = `admin.${exp}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: ADMIN_TTL_SECONDS };
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token || !adminPassword()) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "admin") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(parts[2], sign(`${parts[0]}.${parts[1]}`));
}

export async function isAdminRequest(): Promise<boolean> {
  const jar = await cookies();
  return verifyAdminToken(jar.get(ADMIN_COOKIE)?.value);
}

export function newPlayerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function playerTokenFromCookie(): Promise<string | null> {
  const jar = await cookies();
  const t = jar.get(PLAYER_COOKIE)?.value;
  return t && t.length >= 20 && t.length <= 200 ? t : null;
}

export const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
  path: "/",
};
