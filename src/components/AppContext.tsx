"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { DICTS, tr, type Lang } from "@/lib/i18n";
import type { Player } from "@/lib/types";
import Modal from "@/components/Modal";
import { useOnline } from "@/components/useOnline";

type Toast = { id: number; text: string; kind: "ok" | "err" };
type ConfirmState = { text: string; resolve: (v: boolean) => void } | null;

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  isAdmin: boolean;
  setIsAdmin: (v: boolean) => void;
  player: Player | null;
  setPlayer: (p: Player | null) => void;
  sb: SupabaseClient;
  now: () => number;
  toast: (text: string, kind?: "ok" | "err") => void;
  confirm: (text: string) => Promise<boolean>;
  focusNickname: () => void;
  registerNicknameFocus: (fn: () => void) => void;
  online: number | null;
};

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

export function AppProvider(props: {
  children: React.ReactNode;
  supabaseUrl: string;
  supabaseAnonKey: string;
  initialLang: Lang;
  initialAdmin: boolean;
  initialPlayer: Player | null;
}) {
  const sb = useMemo(() => supabaseBrowser(props.supabaseUrl, props.supabaseAnonKey), [props.supabaseUrl, props.supabaseAnonKey]);
  const [lang, setLangState] = useState<Lang>(props.initialLang);
  const [isAdmin, setIsAdmin] = useState(props.initialAdmin);
  const [player, setPlayerState] = useState<Player | null>(props.initialPlayer);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const offsetRef = useRef(0);
  const online = useOnline(sb, props.supabaseUrl, props.supabaseAnonKey);
  const nickFocusRef = useRef<() => void>(() => {});

  // server clock offset so every visitor sees the same countdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t0 = Date.now();
      const { data, error } = await sb.rpc("server_now");
      const t1 = Date.now();
      if (!cancelled && !error && data) {
        const server = new Date(data as string).getTime();
        if (Number.isFinite(server)) offsetRef.current = server + (t1 - t0) / 2 - t1;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sb]);

  // cache nickname locally for instant display on next visit
  useEffect(() => {
    try {
      if (player) localStorage.setItem("ba_nick", player.nickname);
    } catch {}
  }, [player]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `ba_lang=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
  }, []);

  const toast = useCallback((text: string, kind: "ok" | "err" = "err") => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2600);
  }, []);

  const confirm = useCallback((text: string) => new Promise<boolean>((resolve) => setConfirmState({ text, resolve })), []);

  const t = useCallback((key: string) => tr(lang, key), [lang]);
  const now = useCallback(() => Date.now() + offsetRef.current, []);
  const focusNickname = useCallback(() => nickFocusRef.current(), []);
  const registerNicknameFocus = useCallback((fn: () => void) => {
    nickFocusRef.current = fn;
  }, []);

  const value: Ctx = {
    lang,
    setLang,
    t,
    isAdmin,
    setIsAdmin,
    player,
    setPlayer: setPlayerState,
    sb,
    now,
    toast,
    confirm,
    focusNickname,
    registerNicknameFocus,
    online,
  };

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <AppCtx.Provider value={value}>
      {props.children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast ${x.kind}`}>
            {x.text}
          </div>
        ))}
      </div>
      {confirmState && (
        <Modal onClose={() => close(false)} small>
          <h2>{confirmState.text}</h2>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => close(false)}>
              {DICTS[lang].cancel}
            </button>
            <button className="btn btn-red" data-testid="confirm-yes" onClick={() => close(true)}>
              OK
            </button>
          </div>
        </Modal>
      )}
    </AppCtx.Provider>
  );
}
