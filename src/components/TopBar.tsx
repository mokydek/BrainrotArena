"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppContext";
import { DiscordIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { validateNickname, isReservedNickname, normalizeNickname } from "@/lib/nickname";
import type { Player } from "@/lib/types";

function NicknameBar() {
  const { t, player, setPlayer, toast, registerNicknameFocus } = useApp();
  const [editing, setEditing] = useState(!player);
  const [value, setValue] = useState(player?.nickname ?? "");
  const [hint, setHint] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [attention, setAttention] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const checkSeq = useRef(0);

  useEffect(() => {
    registerNicknameFocus(() => {
      setEditing(true);
      setAttention(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 50);
      setTimeout(() => setAttention(false), 900);
    });
  }, [registerNicknameFocus]);

  // live availability check
  useEffect(() => {
    if (!editing) return;
    const nick = normalizeNickname(value);
    if (!nick || (player && nick === player.nickname)) {
      setHint(null);
      return;
    }
    const local = validateNickname(nick) || (isReservedNickname(nick) ? "NICK_RESERVED" : null);
    if (local) {
      setHint({ ok: false, text: t(local) });
      return;
    }
    const seq = ++checkSeq.current;
    const timer = setTimeout(async () => {
      const r = await api<{ available: boolean; error?: string }>(`/api/player/check?nickname=${encodeURIComponent(nick)}`);
      if (seq !== checkSeq.current) return;
      if (r.ok) setHint(r.available ? { ok: true, text: t("nickFree") } : { ok: false, text: t(r.error || "NICK_TAKEN") });
    }, 350);
    return () => clearTimeout(timer);
  }, [value, editing, player, t]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nick = normalizeNickname(value);
    const local = validateNickname(nick) || (isReservedNickname(nick) ? "NICK_RESERVED" : null);
    if (local) {
      setHint({ ok: false, text: t(local) });
      return;
    }
    setBusy(true);
    const r = await api<{ player: Player }>("/api/player", { body: { nickname: nick } });
    setBusy(false);
    if (!r.ok) {
      setHint({ ok: false, text: t(r.error) });
      return;
    }
    setPlayer(r.player);
    setEditing(false);
    setHint(null);
    toast(`${t("yourNick")}: ${r.player.nickname}`, "ok");
  }

  if (player && !editing) {
    return (
      <div className="nick-bar">
        <div className="nick-pill" data-testid="nick-pill">
          <span className="nick-label">👤 {t("yourNick")}:</span>
          <span className="nick-value" data-testid="nick-value">
            {player.nickname}
          </span>
          <button
            className="btn btn-white btn-sm"
            onClick={() => {
              setValue(player.nickname);
              setEditing(true);
              setTimeout(() => inputRef.current?.focus(), 30);
            }}
          >
            ✏️ {t("change")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="nick-bar">
      <form className="nick-form" onSubmit={submit}>
        <div className="nick-input-wrap">
          <input
            ref={inputRef}
            className={`nick-input${attention ? " attention" : ""}`}
            placeholder={t("nickPlaceholder")}
            value={value}
            maxLength={24}
            onChange={(e) => setValue(e.target.value)}
            aria-label={t("nickname")}
            data-testid="nick-input"
            autoComplete="off"
            spellCheck={false}
          />
          {hint && (
            <div className={`nick-hint ${hint.ok ? "ok" : "bad"}`} data-testid="nick-hint">
              {hint.text}
            </div>
          )}
        </div>
        <button className="btn btn-red" disabled={busy || !value.trim()} data-testid="nick-save">
          {t("save")}
        </button>
        {player && (
          <button
            type="button"
            className="btn btn-white"
            onClick={() => {
              setEditing(false);
              setHint(null);
            }}
          >
            ✕
          </button>
        )}
      </form>
    </div>
  );
}

export default function TopBar({ discordUrl }: { discordUrl: string }) {
  const { t, lang, setLang, isAdmin, setIsAdmin } = useApp();

  async function logout() {
    await api("/api/admin/logout", { method: "POST" });
    setIsAdmin(false);
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-mark" src="/logo.jpg" alt="Brainrot Arena" width={40} height={40} />
          {t("siteName")}
        </Link>
        <div className="topbar-spacer" />
        <NicknameBar />
        {isAdmin && (
          <div className="admin-badge" data-testid="admin-badge">
            ⚡ {t("admin")}
            <button onClick={logout}>{t("logout")}</button>
          </div>
        )}
        <a className="discord-btn" href={discordUrl} target="_blank" rel="noopener noreferrer" data-testid="discord-top" aria-label="Discord">
          <DiscordIcon />
          <span>Discord</span>
        </a>
        <div className="lang-toggle">
          <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
            EN
          </button>
          <button className={lang === "ru" ? "on" : ""} onClick={() => setLang("ru")}>
            RU
          </button>
        </div>
      </div>
    </header>
  );
}
