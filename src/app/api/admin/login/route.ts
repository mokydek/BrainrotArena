import { ADMIN_COOKIE, checkAdminPassword, cookieBase, makeAdminToken } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { adminPassword } from "@/lib/env";

export async function POST(req: Request) {
  if (!adminPassword()) return fail("ADMIN_PASSWORD_NOT_SET", 503);
  const body = await readJson<{ password?: string }>(req);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!checkAdminPassword(password)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down brute force
    return fail("WRONG_PASSWORD", 401);
  }
  const token = makeAdminToken();
  const res = json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token.value, { ...cookieBase, maxAge: token.maxAge });
  return res;
}
