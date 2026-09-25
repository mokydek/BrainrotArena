import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/env";
import { isAdminRequest } from "@/lib/auth";

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function fail(code: string, status = 400, extra?: Record<string, unknown>) {
  return json({ ok: false, error: code, ...extra }, status);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Returns an error response if not configured / not admin, otherwise null. */
export async function guardAdmin() {
  if (!isConfigured()) return fail("NOT_CONFIGURED", 503);
  if (!(await isAdminRequest())) return fail("NOT_ADMIN", 401);
  return null;
}

export function guardConfigured() {
  if (!isConfigured()) return fail("NOT_CONFIGURED", 503);
  return null;
}

/** Postgres raise exception message -> short code */
export function pgErrorCode(err: { message?: string; code?: string } | null | undefined): string {
  const msg = err?.message || "";
  const known = msg.match(/[A-Z][A-Z_]{3,}/);
  if (err?.code === "23505") return "DUPLICATE";
  if (err?.code === "22P02") return "CONTEST_NOT_FOUND";
  return known ? known[0] : "DB_ERROR";
}
