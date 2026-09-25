"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { useApp } from "@/components/AppContext";
import { StreamerCard } from "@/components/StreamerPanel";
import { api, uploadFile } from "@/lib/api";
import type { SocialProfile } from "@/lib/social/fetch";
import type { Side, Streamer } from "@/lib/types";

type Props =
  | { mode: "add"; side: Side; onClose: () => void; onSaved: () => void }
  | { mode: "edit"; streamer: Streamer; onClose: () => void; onSaved: () => void };

const PAID_OPTIONS = [1, 3, 7, 14, 30] as const;

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function StreamerModal(props: Props) {
  const { t, toast, confirm } = useApp();
  const editing = props.mode === "edit" ? props.streamer : null;

  const [url, setUrl] = useState(editing?.profile_url ?? "");
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [displayName, setDisplayName] = useState(editing?.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(editing?.avatar_url ?? "");
  const [side, setSide] = useState<Side>(editing?.side ?? (props.mode === "add" ? props.side : "left"));
  const [paidMode, setPaidMode] = useState<"forever" | "date">(editing?.paid_until ? "date" : "forever");
  const [paidUntil, setPaidUntil] = useState(toLocalInput(editing?.paid_until ?? null));
  const [manualLive, setManualLive] = useState<boolean | null>(editing?.manual_live ?? null);
  const [busy, setBusy] = useState<"" | "fetch" | "save" | "refresh" | "delete" | "upload">("");
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");

  async function doFetch() {
    if (!url.trim()) return;
    setBusy("fetch");
    setError("");
    setWarn("");
    const r = await api<{ profile: SocialProfile }>("/api/streamers/preview", { body: { url } });
    setBusy("");
    if (!r.ok) {
      setError(t(r.error));
      return;
    }
    setProfile(r.profile);
    setDisplayName(r.profile.displayName || r.profile.handle);
    setAvatarUrl(r.profile.avatarUrl || "");
    if (r.profile.error) setWarn(t("fetchFailed"));
  }

  function setDays(days: number) {
    setPaidMode("date");
    setPaidUntil(toLocalInput(new Date(Date.now() + days * 86400_000).toISOString()));
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy("upload");
    const r = await uploadFile(f, "avatars");
    setBusy("");
    if (!r.ok) return setError(t(r.error));
    setAvatarUrl(r.url);
  }

  const paidIso = paidMode === "forever" || !paidUntil ? null : new Date(paidUntil).toISOString();

  async function save() {
    setError("");
    setBusy("save");
    const r = editing
      ? await api<{ streamer: Streamer }>(`/api/streamers/${editing.id}`, {
          method: "PATCH",
          body: {
            url: url.trim() !== editing.profile_url ? url.trim() : undefined,
            displayName,
            avatarUrl: avatarUrl !== editing.avatar_url ? avatarUrl : undefined,
            side,
            manualLive,
            paidUntil: paidIso,
          },
        })
      : await api<{ streamer: Streamer }>("/api/streamers", {
          body: { url: url.trim(), side, displayName, avatarUrl, paidUntil: paidIso, manualLive, profile: profile ?? undefined },
        });
    setBusy("");
    if (!r.ok) return setError(t(r.error));
    toast(t("saved"), "ok");
    props.onSaved();
    props.onClose();
  }

  async function refresh() {
    if (!editing) return;
    setBusy("refresh");
    const r = await api<{ streamer: Streamer }>(`/api/streamers/${editing.id}`, { method: "PATCH", body: { action: "refresh" } });
    setBusy("");
    if (!r.ok) return setError(t(r.error));
    setDisplayName(r.streamer.display_name ?? "");
    setAvatarUrl(r.streamer.avatar_url ?? "");
    if (r.streamer.fetch_error) setWarn(t("fetchFailed"));
    else setWarn("");
    props.onSaved();
  }

  async function remove() {
    if (!editing || !(await confirm(t("confirmDelete")))) return;
    setBusy("delete");
    const r = await api(`/api/streamers/${editing.id}`, { method: "DELETE" });
    setBusy("");
    if (!r.ok) return setError(t(r.error));
    props.onSaved();
    props.onClose();
  }

  // live preview card
  const preview: Streamer | null = useMemo(() => {
    const base = editing ?? null;
    const p = profile;
    if (!base && !p) return null;
    const now = new Date().toISOString();
    return {
      id: base?.id ?? "preview",
      side,
      platform: p?.platform ?? base!.platform,
      handle: p?.handle ?? base!.handle,
      profile_url: p?.profileUrl ?? base!.profile_url,
      display_name: displayName || p?.displayName || base?.display_name || null,
      avatar_url: avatarUrl || null,
      verified: p?.verified ?? base?.verified ?? false,
      followers: p?.followers ?? base?.followers ?? null,
      is_live: p ? Boolean(p.isLive) : base!.is_live,
      live_url: p?.liveUrl ?? base?.live_url ?? null,
      viewers: p?.viewers ?? base?.viewers ?? null,
      live_started_at: null,
      manual_live: manualLive,
      live_checked_at: null,
      profile_checked_at: null,
      fetch_error: null,
      sort_order: 0,
      paid_until: null,
      created_at: base?.created_at ?? now,
      updated_at: now,
    };
  }, [editing, profile, displayName, avatarUrl, manualLive, side]);

  const canSave = editing ? Boolean(url.trim()) : Boolean(url.trim() && profile);

  return (
    <Modal onClose={props.onClose}>
      <h2>{editing ? t("editStreamer") : t("addStreamer")}</h2>
      {error && <div className="form-error">{error}</div>}
      {warn && <div className="form-warn">{warn}</div>}

      <div className="field">
        <label>{t("socialLink")}</label>
        <div className="row">
          <input
            className="input"
            placeholder="https://www.tiktok.com/@username"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !editing && doFetch()}
            data-testid="streamer-url"
            autoFocus
          />
          {!editing && (
            <button className="btn btn-yellow shrink" onClick={doFetch} disabled={!url.trim() || busy !== ""} data-testid="streamer-fetch">
              {busy === "fetch" ? t("fetching") : t("fetch")}
            </button>
          )}
        </div>
      </div>

      {preview && (
        <div className="preview-box">
          <StreamerCard s={preview} />
        </div>
      )}

      {(profile || editing) && (
        <>
          <div className="row">
            <div className="field">
              <label>{t("displayName")}</label>
              <input className="input" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} data-testid="streamer-name-input" />
            </div>
          </div>
          <div className="field">
            <label>{t("avatarUrl")}</label>
            <div className="row">
              <input className="input" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
              <label className="btn btn-ghost file-btn shrink">
                {busy === "upload" ? "…" : "⬆"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onUpload} />
              </label>
            </div>
          </div>

          <div className="field">
            <label>{t("side")}</label>
            <div className="seg">
              <button className={side === "left" ? "on" : ""} onClick={() => setSide("left")}>
                ⬅ {t("left")}
              </button>
              <button className={side === "right" ? "on" : ""} onClick={() => setSide("right")}>
                {t("right")} ➡
              </button>
            </div>
          </div>

          <div className="field">
            <label>{t("paidFor")}</label>
            <div className="seg">
              <button className={paidMode === "forever" ? "on" : ""} onClick={() => setPaidMode("forever")}>
                {t("forever")}
              </button>
              {PAID_OPTIONS.map((d) => (
                <button key={d} onClick={() => setDays(d)}>
                  {d} {d === 1 ? t("day") : t("days")}
                </button>
              ))}
            </div>
            {paidMode === "date" && (
              <input className="input" type="datetime-local" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} style={{ marginTop: 6 }} />
            )}
          </div>

          <div className="field">
            <label>{t("liveMode")}</label>
            <div className="seg">
              <button className={manualLive === null ? "on" : ""} onClick={() => setManualLive(null)}>
                {t("auto")}
              </button>
              <button className={manualLive === true ? "on" : ""} onClick={() => setManualLive(true)}>
                🔴 {t("forceLive")}
              </button>
              <button className={manualLive === false ? "on" : ""} onClick={() => setManualLive(false)}>
                {t("forceOffline")}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="modal-actions">
        {editing && (
          <>
            <button className="btn btn-danger btn-sm left" onClick={remove} disabled={busy !== ""} data-testid="streamer-delete">
              {t("delete")}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={busy !== ""}>
              {busy === "refresh" ? "…" : `↻ ${t("refreshNow")}`}
            </button>
          </>
        )}
        <button className="btn btn-ghost" onClick={props.onClose}>
          {t("cancel")}
        </button>
        <button className="btn btn-red" onClick={save} disabled={!canSave || busy !== ""} data-testid="streamer-save">
          {busy === "save" ? "…" : editing ? t("saveChanges") : t("add")}
        </button>
      </div>
    </Modal>
  );
}
