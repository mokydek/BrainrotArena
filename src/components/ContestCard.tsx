"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppContext";
import WinnerReel from "@/components/WinnerReel";
import Confetti from "@/components/Confetti";
import { api } from "@/lib/api";
import type { Contest, Entry } from "@/lib/types";

function useTick(now: () => number, ms = 250): number | null {
  const [t, setT] = useState<number | null>(null);
  useEffect(() => {
    setT(now());
    const id = setInterval(() => setT(now()), ms);
    return () => clearInterval(id);
  }, [now, ms]);
  return t;
}

function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function ContestCard({
  contest,
  entries,
  myEntry,
  onContest,
  onJoined,
  onEdit,
  onNew,
  onChanged,
}: {
  contest: Contest | null;
  entries: Entry[];
  myEntry: Entry | null;
  onContest: (c: Contest) => void;
  onJoined: (e: Entry) => void;
  onEdit: () => void;
  onNew: () => void;
  onChanged: () => void;
}) {
  const { t, sb, now, player, isAdmin, toast, confirm, focusNickname } = useApp();
  const tick = useTick(now);
  const [joining, setJoining] = useState(false);
  const [reelFor, setReelFor] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [confetti, setConfetti] = useState(0);
  const sawActive = useRef<Set<string>>(new Set());
  const drawing = useRef<string | null>(null);

  const endsAt = contest ? new Date(contest.ends_at).getTime() : 0;
  const remaining = tick === null || !contest ? null : endsAt - tick;
  const running = contest?.status === "active" && remaining !== null && remaining > 0;
  const awaitingDraw = contest?.status === "active" && remaining !== null && remaining <= 0;
  const finished = contest?.status === "finished";

  if (contest?.status === "active") sawActive.current.add(contest.id);

  // timer is over -> ask the database to draw (idempotent, anyone may call it)
  useEffect(() => {
    if (!awaitingDraw || !contest || drawing.current === contest.id) return;
    drawing.current = contest.id;
    let tries = 0;
    let stop = false;
    const run = async () => {
      if (stop) return;
      tries++;
      const { data } = await sb.rpc("draw_contest", { p_contest: contest.id });
      const c = data as Contest | null;
      if (c && c.status !== "active") {
        onContest(c);
        return;
      }
      if (tries < 30) setTimeout(run, 1500);
    };
    run();
    return () => {
      stop = true;
      drawing.current = null;
    };
  }, [awaitingDraw, contest, sb, onContest]);

  // play the reel once when the winner appears
  useEffect(() => {
    if (!contest || !finished || revealed.has(contest.id) || reelFor === contest.id) return;
    if (!contest.winner_nickname) {
      setRevealed((s) => new Set(s).add(contest.id));
      return;
    }
    const drawnAgo = contest.drawn_at ? now() - new Date(contest.drawn_at).getTime() : Infinity;
    let seen = false;
    try {
      seen = localStorage.getItem(`ba_reel_${contest.id}`) === "1";
    } catch {}
    if (!seen && (sawActive.current.has(contest.id) || drawnAgo < 15_000)) {
      setReelFor(contest.id);
    } else {
      setRevealed((s) => new Set(s).add(contest.id));
    }
  }, [contest, finished, revealed, reelFor, now]);

  const onReelDone = useCallback(() => {
    if (!contest) return;
    try {
      localStorage.setItem(`ba_reel_${contest.id}`, "1");
    } catch {}
    setRevealed((s) => new Set(s).add(contest.id));
    setReelFor(null);
    setConfetti((c) => c + 1);
  }, [contest]);

  async function join() {
    if (!contest) return;
    if (!player) {
      toast(t("setNickFirst"));
      focusNickname();
      return;
    }
    setJoining(true);
    const r = await api<{ entry: Entry }>(`/api/contest/${contest.id}/join`, { method: "POST" });
    setJoining(false);
    if (!r.ok) {
      if (r.error === "NO_NICKNAME") focusNickname();
      toast(t(r.error));
      if (r.error === "ALREADY_JOINED") onChanged();
      return;
    }
    onJoined(r.entry);
    toast(`${t("joined")} ${t("ticket")} #${r.entry.ticket + 1}`, "ok");
  }

  async function adjust(seconds: number) {
    if (!contest) return;
    const r = await api<{ contest: Contest }>(`/api/contest/${contest.id}`, { method: "PATCH", body: { addSeconds: seconds } });
    if (!r.ok) return toast(t(r.error));
    onContest(r.contest);
  }

  async function endNow() {
    if (!contest || !(await confirm(t("confirmEnd")))) return;
    const r = await api<{ contest: Contest }>(`/api/contest/${contest.id}`, { method: "PATCH", body: { action: "end" } });
    if (!r.ok) return toast(t(r.error));
    onContest(r.contest);
  }

  async function cancel() {
    if (!contest || !(await confirm(t("confirmCancel")))) return;
    const r = await api<{ contest: Contest }>(`/api/contest/${contest.id}`, { method: "PATCH", body: { action: "cancel" } });
    if (!r.ok) return toast(t(r.error));
    onContest(r.contest);
  }

  async function remove() {
    if (!contest || !(await confirm(t("confirmDelete")))) return;
    const r = await api(`/api/contest/${contest.id}`, { method: "DELETE" });
    if (!r.ok) return toast(t(r.error));
    onChanged();
  }

  const parts = split(running && remaining !== null ? remaining : 0);
  const count = contest?.entries_count ?? 0;
  const full = Boolean(contest?.max_participants && count >= contest.max_participants);
  const iWon = Boolean(finished && player && contest?.winner_player_id === player.id);
  const showWinner = Boolean(finished && contest && revealed.has(contest.id));
  const reelNames = entries.map((e) => e.nickname);

  let joinLabel = t("join");
  let joinDisabled = joining;
  if (myEntry) {
    joinLabel = `✔ ${t("joined")}`;
    joinDisabled = true;
  } else if (!contest) {
    joinLabel = t("soon");
    joinDisabled = true;
  } else if (contest.status === "cancelled") {
    joinLabel = t("closed");
    joinDisabled = true;
  } else if (awaitingDraw || (finished && !showWinner)) {
    joinLabel = t("drawing");
    joinDisabled = true;
  } else if (finished) {
    joinLabel = t("closed");
    joinDisabled = true;
  } else if (full) {
    joinLabel = t("full");
    joinDisabled = true;
  }

  const statusChip = !contest ? (
    <div className="chip end-chip">—</div>
  ) : running ? (
    <div className="chip live-chip">
      <span>● {t("stLive")}</span>
    </div>
  ) : awaitingDraw ? (
    <div className="chip">⏳</div>
  ) : contest.status === "cancelled" ? (
    <div className="chip end-chip">✖</div>
  ) : (
    <div className="chip end-chip">
      <span>✔ {t("stEnded")}</span>
    </div>
  );

  return (
    <section className="panel contest" data-testid="contest">
      <h1 className="contest-title" data-testid="contest-title">
        {contest?.title || t("giveaway")}
      </h1>

      <div className="chips">
        <div className="chip" title={t("participants")} data-testid="contest-count">
          👥 <span>{contest ? `${count}/${contest.max_participants ?? t("unlimited")}` : "—"}</span>
        </div>
        <div className="chip" title={contest?.prize || t("prize")}>
          🏆 <span>{contest?.prize || "—"}</span>
        </div>
        {statusChip}
      </div>

      <div className={`dice-row${running && remaining !== null && remaining < 10_000 ? " urgent" : ""}`} data-testid="countdown">
        {[
          { v: parts.d, l: t("dDays") },
          { v: parts.h, l: t("dHrs") },
          { v: parts.m, l: t("dMin") },
          { v: parts.s, l: t("dSec") },
        ].map((p, i) => (
          <div key={p.l} className={`die d${i + 1}`}>
            <div className="die-face">
              {tick === null || !contest ? "–" : pad(p.v)}
              <small>{p.l}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="ends-label">{running ? t("endsIn") : " "}</div>

      {contest && (
        <div className="contest-id">
          ID: <b data-testid="contest-code">{contest.code}</b>
        </div>
      )}
      <Link className="verify-btn" href={contest ? `/history#${contest.code}` : "/history"}>
        ⏱️ <span>{t("verifyHistory")}</span>
      </Link>

      <div className="stage" data-testid="stage">
        {contest?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="brainrot" src={contest.image_url} alt={contest.title} />
        ) : (
          <div className="placeholder">
            <div>
              <div className="big">🧠</div>
              {!contest || contest.status === "cancelled" ? (contest ? t("cancelled") : t("noContest")) : "BRAINROT"}
            </div>
          </div>
        )}

        {(awaitingDraw || (finished && contest?.winner_nickname && !showWinner && reelFor !== contest.id)) && (
          <div className="stage-overlay">
            <div className="label">{t("drawing")}</div>
          </div>
        )}

        {finished && contest?.winner_nickname && reelFor === contest.id && (
          <div className="stage-overlay" style={{ background: "rgba(20,0,0,0.45)" }}>
            <WinnerReel names={reelNames} winner={contest.winner_nickname} seed={contest.code} onDone={onReelDone} />
          </div>
        )}

        {showWinner && contest && (
          <div className="stage-overlay" data-testid="winner-box">
            {contest.winner_nickname ? (
              <>
                <div className="trophy">🏆</div>
                <div className="label">{t("winner")}</div>
                <div className="winner-nick" data-testid="winner-nick">
                  {contest.winner_nickname}
                </div>
                <div className="sub">
                  {t("ticket")} #{(contest.winner_index ?? 0) + 1} / {count}
                  {contest.prize ? ` · ${contest.prize}` : ""}
                </div>
                {iWon && <div className="you-won">🎉 {t("youWon")}</div>}
              </>
            ) : (
              <div className="label">{t("noEntries")}</div>
            )}
          </div>
        )}
      </div>

      <button className={`join-btn${myEntry ? " joined" : ""}`} onClick={join} disabled={joinDisabled} data-testid="join-btn">
        {joining ? "…" : joinLabel}
      </button>
      <div className="join-sub" data-testid="join-sub">
        {myEntry ? `${t("ticket")} #${myEntry.ticket + 1}` : running && !player ? t("setNickFirst") : ""}
      </div>

      {isAdmin && contest?.status === "active" && (
        <>
          <div className="admin-timer" data-testid="admin-timer">
            <div className="col">
              <button onClick={() => adjust(-60)} data-testid="timer-minus-1">
                -1
              </button>
              <button onClick={() => adjust(-600)}>-10</button>
            </div>
            <div className="mid">
              <div>
                {remaining !== null && remaining > 0
                  ? parts.d
                    ? `${parts.d}d ${pad(parts.h)}:${pad(parts.m)}`
                    : `${parts.h ? `${pad(parts.h)}:` : ""}${pad(parts.m)}:${pad(parts.s)}`
                  : "00:00"}
                <small>
                  {t("timer")} · {t("dMin")}
                </small>
              </div>
            </div>
            <div className="col">
              <button onClick={() => adjust(60)} data-testid="timer-plus-1">
                +1
              </button>
              <button onClick={() => adjust(600)} data-testid="timer-plus-10">
                +10
              </button>
            </div>
          </div>
          <div className="admin-actions">
            <button className="btn btn-white btn-sm" onClick={onEdit} data-testid="contest-edit">
              ⚙️ {t("editContest")}
            </button>
            <button className="btn btn-yellow btn-sm" onClick={endNow} data-testid="contest-end">
              ⏹ {t("endNow")}
            </button>
            <button className="btn btn-danger btn-sm" onClick={cancel}>
              ✖ {t("cancelContest")}
            </button>
          </div>
        </>
      )}

      {isAdmin && contest?.status !== "active" && (
        <div className="admin-actions">
          <button className="btn btn-yellow" onClick={onNew} data-testid="contest-new">
            ➕ {t("newContest")}
          </button>
          {contest && (
            <button className="btn btn-danger btn-sm" onClick={remove}>
              {t("deleteContest")}
            </button>
          )}
        </div>
      )}

      {contest && (
        <div className="players">
          <div className="players-head">
            <h3>{t("latestPlayers")}</h3>
            <span>
              👥 {count}
              {contest.max_participants ? ` / ${contest.max_participants}` : ""}
            </span>
          </div>
          <div className="player-chips" data-testid="player-chips">
            {entries.map((e) => (
              <span
                key={e.id}
                className={`player-chip${player && e.player_id === player.id ? " me" : ""}${showWinner && e.id === contest.winner_entry_id ? " win" : ""}`}
              >
                {showWinner && e.id === contest.winner_entry_id ? "🏆 " : ""}
                {e.nickname} <small>#{e.ticket + 1}</small>
              </span>
            ))}
            {!entries.length && <div className="empty-note" style={{ width: "100%" }}>{t("nobodyYet")}</div>}
          </div>
        </div>
      )}

      {confetti > 0 && <Confetti key={confetti} count={iWon ? 160 : 90} />}
    </section>
  );
}
