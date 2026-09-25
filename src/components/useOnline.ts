"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

const PING_MS = 20_000;

function sessionId(): string {
  const fresh = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
          (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
        );
  try {
    let id = localStorage.getItem("ba_sid");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = fresh();
      localStorage.setItem("ba_sid", id);
    }
    return id;
  } catch {
    return fresh();
  }
}

/**
 * "Online now": every open page sends a heartbeat to Supabase (presence_ping) every 20 s
 * and gets back how many visitors were seen in the last 90 s. Returns null until known
 * or when the database has not been updated with the online-counter SQL yet.
 */
export function useOnline(sb: SupabaseClient, supabaseUrl: string, anonKey: string): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const id = sessionId();
    let stopped = false;
    let failures = 0;

    const ping = async () => {
      if (stopped) return;
      const { data, error } = await sb.rpc("presence_ping", { p_session: id });
      if (stopped) return;
      if (!error && typeof data === "number") {
        failures = 0;
        setCount(data);
      } else if (++failures >= 3) {
        setCount(null); // function missing / offline: hide the counter
      }
    };

    const leave = () => {
      try {
        fetch(`${supabaseUrl}/rest/v1/rpc/presence_leave`, {
          method: "POST",
          keepalive: true,
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_session: id }),
        }).catch(() => {});
      } catch {}
    };
    const onShow = () => document.visibilityState === "visible" && ping();

    ping();
    const timer = setInterval(ping, PING_MS);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [sb, supabaseUrl, anonKey]);

  return count;
}
