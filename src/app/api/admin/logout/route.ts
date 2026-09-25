import { ADMIN_COOKIE, cookieBase } from "@/lib/auth";
import { json } from "@/lib/http";

export async function POST() {
  const res = json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { ...cookieBase, maxAge: 0 });
  return res;
}
