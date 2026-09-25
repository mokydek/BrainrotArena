import { cookies, headers } from "next/headers";
import Link from "next/link";
import HistoryList from "@/components/HistoryList";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from "@/lib/env";
import { detectLang, tr } from "@/lib/i18n";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Contest } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify history — Brainrot Arena" };

export default async function HistoryPage() {
  const jar = await cookies();
  const h = await headers();
  const lang = detectLang(jar.get("ba_lang")?.value, h.get("accept-language"));
  const t = (k: string) => tr(lang, k);

  let contests: Contest[] = [];
  if (isConfigured()) {
    const { data } = await supabaseAdmin().from("contests").select("*").neq("status", "cancelled").order("created_at", { ascending: false }).limit(50);
    contests = (data as Contest[]) ?? [];
  }

  return (
    <div className="page">
      <div className="narrow">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Link href="/" className="btn btn-white btn-sm">
            {t("back")}
          </Link>
          <h1 className="contest-title" style={{ margin: 0, flex: 1, textAlign: "left" }}>
            {t("history")}
          </h1>
        </div>
        <div className="panel" style={{ marginBottom: 16 }}>
          <p className="how" style={{ margin: 0 }}>
            🔒 {t("howItWorks")}
          </p>
        </div>
        <HistoryList contests={contests} lang={lang} supabaseUrl={SUPABASE_URL} supabaseAnonKey={SUPABASE_ANON_KEY} />
      </div>
    </div>
  );
}
