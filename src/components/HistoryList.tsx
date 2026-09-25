"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { verifyContest, type VerifyResult } from "@/lib/fair";
import { tr, type Lang } from "@/lib/i18n";
import type { Contest, Entry } from "@/lib/types";

async function fetchAllEntries(url: string, key: string, contestId: string): Promise<Entry[]> {
  const sb = supabaseBrowser(url, key);
  const all: Entry[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from("contest_entries")
      .select("*")
      .eq("contest_id", contestId)
      .order("ticket", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    all.push(...((data as Entry[]) ?? []));
    if (!data || data.length < page) break;
  }
  return all;
}

function Item({ c, lang, url, anonKey }: { c: Contest; lang: Lang; url: string; anonKey: string }) {
  const t = (k: string) => tr(lang, k);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function verify() {
    if (!c.server_seed) return;
    setBusy(true);
    setErr("");
    try {
      const entries = await fetchAllEntries(url, anonKey, c.id);
      setResult(
        await verifyContest({
          code: c.code,
          serverSeed: c.server_seed,
          serverSeedHash: c.server_seed_hash,
          clientSeed: c.client_seed,
          winnerIndex: c.winner_index,
          winnerNickname: c.winner_nickname,
          entries,
        }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const ok = result && result.seedHashOk && result.clientSeedOk && result.winnerOk;
  const date = new Date(c.drawn_at || c.ends_at).toLocaleString(lang === "ru" ? "ru-RU" : "en-US");

  return (
    <div className="panel history-item" id={c.code} data-testid="history-item">
      <div className="hi-top">
        {c.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="hi-img" src={c.image_url} alt="" />
        ) : (
          <div className="hi-img" style={{ display: "grid", placeItems: "center", fontSize: 30 }}>
            🧠
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>{c.title}</h3>
          <div className="meta">
            ID: <b>{c.code}</b> · {date} · 👥 {c.entries_count}
            {c.prize ? ` · 🏆 ${c.prize}` : ""}
          </div>
          <div className="meta">
            {c.status === "finished" ? (
              c.winner_nickname ? (
                <>
                  {t("winner")}: <span className="win">{c.winner_nickname}</span> ({t("ticket")} #{(c.winner_index ?? 0) + 1})
                </>
              ) : (
                t("noEntries")
              )
            ) : (
              <>⏳ {t("endsIn")}…</>
            )}
          </div>
        </div>
        {c.status === "finished" && c.server_seed && (
          <button className="btn btn-yellow btn-sm" onClick={verify} disabled={busy} data-testid="verify-btn">
            {busy ? "…" : t("verify")}
          </button>
        )}
      </div>
      <div className="seeds">
        <div>
          {t("serverSeedHash")}
          <code>{c.server_seed_hash}</code>
        </div>
        <div>
          {t("serverSeed")}
          <code>{c.server_seed || `🔒 ${t("hidden")}`}</code>
        </div>
        {c.client_seed && (
          <div>
            {t("clientSeed")}
            <code>{c.client_seed}</code>
          </div>
        )}
      </div>
      {err && <div className="verify-result bad">{err}</div>}
      {result && (
        <div className={`verify-result ${ok ? "ok" : "bad"}`} data-testid="verify-result">
          {ok ? t("verified") : t("notVerified")} — sha256(seed) {result.seedHashOk ? "✔" : "✖"} · client seed {result.clientSeedOk ? "✔" : "✖"} · {t("winnerIndex")} #
          {(result.expectedIndex ?? -1) + 1} {result.expectedNickname ? `(${result.expectedNickname})` : ""} {result.winnerOk ? "✔" : "✖"}
        </div>
      )}
    </div>
  );
}

export default function HistoryList({ contests, lang, supabaseUrl, supabaseAnonKey }: { contests: Contest[]; lang: Lang; supabaseUrl: string; supabaseAnonKey: string }) {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  if (!contests.length) return <div className="panel empty-note">{tr(lang, "noHistory")}</div>;
  return (
    <>
      {contests.map((c) => (
        <Item key={c.id} c={c} lang={lang} url={supabaseUrl} anonKey={supabaseAnonKey} />
      ))}
    </>
  );
}
