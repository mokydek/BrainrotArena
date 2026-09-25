"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { PlatformIcon, VerifiedIcon, formatCount } from "@/components/icons";
import { effectiveLive, isVisible, sortStreamers, type Side, type Streamer } from "@/lib/types";

function Avatar({ s }: { s: Streamer }) {
  const [broken, setBroken] = useState(false);
  const name = s.display_name || s.handle;
  if (!s.avatar_url || broken) {
    return <div className="avatar fallback">{[...name][0]?.toUpperCase() || "?"}</div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="avatar" src={s.avatar_url} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

function handleLabel(s: Streamer): string {
  if (s.platform === "youtube") return s.handle.startsWith("@") ? s.handle : `@${s.handle}`;
  if (s.platform === "other") return s.handle;
  return `@${s.handle}`;
}

export function StreamerCard({
  s,
  onEdit,
  onMove,
}: {
  s: Streamer;
  onEdit?: (s: Streamer) => void;
  onMove?: (s: Streamer, dir: -1 | 1) => void;
}) {
  const { t, isAdmin } = useApp();
  const live = effectiveLive(s);
  const expired = !isVisible(s);
  const href = (live && s.live_url) || s.profile_url;
  return (
    <div className={`streamer-card${live ? " is-live" : ""}${expired ? " expired" : ""}`} data-testid="streamer-card" data-live={live ? "1" : "0"}>
      <a className="sc-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={s.display_name || s.handle} />
      <div className="avatar-wrap">
        <Avatar s={s} />
        {live && <span className="live-pill">{t("live")}</span>}
      </div>
      <div className="sc-text">
        <div className="sc-name">
          <span className="n" data-testid="streamer-name">
            {s.display_name || s.handle}
          </span>
          {s.verified && <VerifiedIcon />}
        </div>
        <div className="sc-handle">{handleLabel(s)}</div>
      </div>
      <div className="sc-meta">
        <PlatformIcon platform={s.platform} />
        {live && s.viewers ? <span className="viewers">👁 {formatCount(s.viewers)}</span> : s.followers ? <span>{formatCount(s.followers)}</span> : null}
        {expired && <span className="sc-tag">{t("expired")}</span>}
      </div>
      {isAdmin && onEdit && onMove && (
        <div className="sc-admin">
          <button title={t("moveUp")} onClick={() => onMove(s, -1)}>
            ▲
          </button>
          <button title={t("editStreamer")} onClick={() => onEdit(s)} data-testid="streamer-edit">
            ✏️
          </button>
          <button title={t("moveDown")} onClick={() => onMove(s, 1)}>
            ▼
          </button>
        </div>
      )}
    </div>
  );
}

export default function StreamerPanel({
  side,
  streamers,
  onAdd,
  onEdit,
  onReorder,
  contactUrl,
  children,
}: {
  side: Side;
  streamers: Streamer[];
  onAdd: (side: Side) => void;
  onEdit: (s: Streamer) => void;
  onReorder: (side: Side, ids: string[]) => void;
  contactUrl: string | null;
  children?: React.ReactNode;
}) {
  const { t, isAdmin } = useApp();
  const mine = streamers.filter((s) => s.side === side && (isAdmin || isVisible(s)));
  const sorted = sortStreamers(mine);

  function move(s: Streamer, dir: -1 | 1) {
    // reorder by admin order (ignores live priority, which is applied on display)
    const byOrder = [...mine].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    const i = byOrder.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= byOrder.length) return;
    [byOrder[i], byOrder[j]] = [byOrder[j], byOrder[i]];
    onReorder(side, byOrder.map((x) => x.id));
  }

  return (
    <section className="panel" data-testid={`panel-${side}`}>
      {children}
      <div className="panel-head">
        <h2 className="panel-title">{t("topStreamers")}</h2>
        {isAdmin && (
          <button className="plus-btn" title={t("addStreamer")} aria-label={t("addStreamer")} onClick={() => onAdd(side)} data-testid={`add-streamer-${side}`}>
            +
          </button>
        )}
      </div>
      <div className="streamer-list">
        {sorted.map((s) => (
          <StreamerCard key={s.id} s={s} onEdit={onEdit} onMove={move} />
        ))}
        {!sorted.length && <div className="empty-note">{t("noStreamers")}</div>}
        {contactUrl && (
          <a className="promo-card" href={contactUrl} target="_blank" rel="noopener noreferrer">
            ➕ {t("yourStreamHere")}
          </a>
        )}
      </div>
    </section>
  );
}
