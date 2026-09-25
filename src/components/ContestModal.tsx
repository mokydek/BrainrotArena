"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useApp } from "@/components/AppContext";
import { api, uploadFile } from "@/lib/api";
import type { Contest } from "@/lib/types";

const QUICK: { label: string; secs: number }[] = [
  { label: "1m", secs: 60 },
  { label: "5m", secs: 300 },
  { label: "15m", secs: 900 },
  { label: "30m", secs: 1800 },
  { label: "1h", secs: 3600 },
  { label: "3h", secs: 10800 },
  { label: "24h", secs: 86400 },
  { label: "7d", secs: 604800 },
];

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ContestModal({
  contest,
  onClose,
  onSaved,
}: {
  contest: Contest | null; // null = create
  onClose: () => void;
  onSaved: (c: Contest) => void;
}) {
  const { t } = useApp();
  const [title, setTitle] = useState(contest?.title ?? t("giveaway"));
  const [prize, setPrize] = useState(contest?.prize ?? "");
  const [imageUrl, setImageUrl] = useState(contest?.image_url ?? "");
  const [amount, setAmount] = useState("15");
  const [unit, setUnit] = useState<"m" | "h" | "d">("m");
  const [endAt, setEndAt] = useState(contest ? toLocalInput(new Date(contest.ends_at).getTime()) : "");
  const [endMode, setEndMode] = useState<"duration" | "exact">(contest ? "exact" : "duration");
  const [maxPlayers, setMaxPlayers] = useState(contest?.max_participants ? String(contest.max_participants) : "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    setError("");
    const r = await uploadFile(f, "brainrots");
    setUploading(false);
    if (!r.ok) return setError(t(r.error));
    setImageUrl(r.url);
  }

  function durationSeconds(): number {
    const n = Math.max(0, Number(amount) || 0);
    return Math.round(n * (unit === "m" ? 60 : unit === "h" ? 3600 : 86400));
  }

  async function save() {
    setError("");
    setBusy(true);
    const max = maxPlayers.trim() ? Math.max(1, Math.floor(Number(maxPlayers))) : null;
    let r;
    if (!contest) {
      r = await api<{ contest: Contest }>("/api/contest", {
        body: {
          title,
          prize,
          imageUrl,
          maxParticipants: max,
          ...(endMode === "exact" && endAt ? { endsAt: new Date(endAt).toISOString() } : { durationSeconds: durationSeconds() }),
        },
      });
    } else {
      const body: Record<string, unknown> = { title, prize, imageUrl: imageUrl || null };
      if (contest.status === "active") {
        body.maxParticipants = max;
        const originalLocal = toLocalInput(new Date(contest.ends_at).getTime());
        if (endMode === "exact" && endAt && endAt !== originalLocal) body.endsAt = new Date(endAt).toISOString();
        if (endMode === "duration") body.endsAt = new Date(Date.now() + durationSeconds() * 1000).toISOString();
      }
      r = await api<{ contest: Contest }>(`/api/contest/${contest.id}`, { method: "PATCH", body });
    }
    setBusy(false);
    if (!r.ok) return setError(t(r.error));
    onSaved(r.contest);
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <h2>{contest ? t("editContest") : t("newContest")}</h2>
      {error && <div className="form-error">{error}</div>}

      <div className="field">
        <label>{t("title")}</label>
        <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} data-testid="contest-title-input" />
      </div>
      <div className="field">
        <label>{t("prizeName")}</label>
        <input className="input" value={prize} maxLength={120} onChange={(e) => setPrize(e.target.value)} placeholder="Skibidi Toilet" data-testid="contest-prize-input" />
      </div>

      <div className="field">
        <label>{t("brainrotImage")}</label>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="img-preview" src={imageUrl} alt="" data-testid="contest-image-preview" />
        )}
        <div className="row">
          <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder={t("imageUrl")} data-testid="contest-image-url" />
          <label className="btn btn-yellow file-btn shrink">
            {uploading ? "…" : `⬆ ${t("uploadImage")}`}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile} data-testid="contest-image-file" />
          </label>
        </div>
      </div>

      <div className="field">
        <label>{t("duration")}</label>
        <div className="seg" style={{ marginBottom: 6 }}>
          {QUICK.map((q) => (
            <button
              key={q.label}
              className={endMode === "duration" && durationSeconds() === q.secs ? "on" : ""}
              onClick={() => {
                setEndMode("duration");
                if (q.secs % 86400 === 0) {
                  setAmount(String(q.secs / 86400));
                  setUnit("d");
                } else if (q.secs % 3600 === 0) {
                  setAmount(String(q.secs / 3600));
                  setUnit("h");
                } else {
                  setAmount(String(q.secs / 60));
                  setUnit("m");
                }
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="row">
          <input
            className="input"
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setEndMode("duration");
            }}
            data-testid="contest-duration"
          />
          <select
            className="select"
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value as "m" | "h" | "d");
              setEndMode("duration");
            }}
            data-testid="contest-unit"
          >
            <option value="m">{t("minutes")}</option>
            <option value="h">{t("hours")}</option>
            <option value="d">{t("days")}</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>{t("endAt")}</label>
        <input
          className="input"
          type="datetime-local"
          value={endAt}
          onChange={(e) => {
            setEndAt(e.target.value);
            setEndMode("exact");
          }}
          style={endMode === "exact" ? { borderColor: "var(--yellow-2)" } : undefined}
        />
      </div>
      <div className="field">
        <label>{t("maxPlayers")}</label>
        <input className="input" type="number" min={1} value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} placeholder="∞" data-testid="contest-max" />
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          {t("cancel")}
        </button>
        <button className="btn btn-red" onClick={save} disabled={busy || uploading} data-testid="contest-save">
          {busy ? "…" : contest ? t("saveChanges") : t("start")}
        </button>
      </div>
    </Modal>
  );
}
