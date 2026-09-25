"use client";

import { useState } from "react";

export default function InitDbButton({ label }: { label: string }) {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  async function run() {
    setState("busy");
    const res = await fetch("/api/admin/setup", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      setState("ok");
      setTimeout(() => (window.location.href = "/"), 700);
    } else {
      setState("err");
      setMsg(data.message || data.error || `HTTP ${res.status}`);
    }
  }

  return (
    <div style={{ margin: "12px 0" }}>
      <button className="btn btn-yellow" onClick={run} disabled={state === "busy"} data-testid="init-db">
        {state === "busy" ? "…" : state === "ok" ? "✔" : label}
      </button>
      {state === "err" && <div className="form-error" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}
