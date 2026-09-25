"use client";

import { useState } from "react";
import Link from "next/link";
import InitDbButton from "@/components/InitDbButton";
import { tr, type Lang } from "@/lib/i18n";

export default function AdminLogin({ lang, isAdmin, configured, missing }: { lang: Lang; isAdmin: boolean; configured: boolean; missing: string[] }) {
  const t = (k: string) => tr(lang, k);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && data.ok) window.location.href = "/";
    else setError(t(data.error || "error"));
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <div className="narrow" style={{ maxWidth: 440, paddingTop: 60 }}>
      <div className="panel">
        <h1 className="contest-title">⚡ {t("adminLogin")}</h1>
        {!configured && (
          <div className="form-error">
            {t("setupText")} {missing.join(", ")}
          </div>
        )}
        {isAdmin ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>
            <Link className="btn btn-yellow" href="/">
              {t("back")}
            </Link>
            <InitDbButton label={`🛠 ${t("initDb")}`} />
            <button className="btn btn-ghost" onClick={logout}>
              {t("logout")}
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {error && <div className="form-error">{error}</div>}
            <div className="field">
              <label>{t("password")}</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus data-testid="admin-password" />
            </div>
            <button className="btn btn-red" style={{ width: "100%" }} disabled={busy || !password} data-testid="admin-login">
              {busy ? "…" : t("login")}
            </button>
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <Link href="/" className="how">
                {t("back")}
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
