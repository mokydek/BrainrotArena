import { cookies, headers } from "next/headers";
import AdminLogin from "@/components/AdminLogin";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { detectLang } from "@/lib/i18n";
import { isConfigured, missingEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Brainrot Arena", robots: { index: false } };

export default async function AdminPage() {
  const jar = await cookies();
  const h = await headers();
  const lang = detectLang(jar.get("ba_lang")?.value, h.get("accept-language"));
  return (
    <div className="page">
      <AdminLogin lang={lang} isAdmin={verifyAdminToken(jar.get(ADMIN_COOKIE)?.value)} configured={isConfigured()} missing={missingEnv()} />
    </div>
  );
}
