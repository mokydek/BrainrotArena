"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppContext";
import TopBar from "@/components/TopBar";
import StreamerPanel from "@/components/StreamerPanel";
import StreamerModal from "@/components/StreamerModal";
import ContestCard from "@/components/ContestCard";
import ContestModal from "@/components/ContestModal";
import { api } from "@/lib/api";
import { DiscordIcon } from "@/components/icons";
import type { Contest, Entry, Side, Streamer } from "@/lib/types";

export type ArenaData = {
  streamers: Streamer[];
  contest: Contest | null;
  entries: Entry[];
  myEntry: Entry | null;
  lastWinner: Contest | null;
};

const ENTRIES_SHOWN = 40;

export default function Arena({ initial, contactUrl, discordUrl }: { initial: ArenaData; contactUrl: string | null; discordUrl: string }) {
  const { sb, t, player } = useApp();
  const [streamers, setStreamers] = useState<Streamer[]>(initial.streamers);
  const [contest, setContest] = useState<Contest | null>(initial.contest);
  const [entries, setEntries] = useState<Entry[]>(initial.entries);
  const [myEntry, setMyEntry] = useState<Entry | null>(initial.myEntry);
  const [lastWinner, setLastWinner] = useState<Contest | null>(initial.lastWinner);
  const [realtimeOk, setRealtimeOk] = useState(false);
  const [streamerModal, setStreamerModal] = useState<{ mode: "add"; side: Side } | { mode: "edit"; streamer: Streamer } | null>(null);
  const [contestModal, setContestModal] = useState<{ contest: Contest | null } | null>(null);

  const contestRef = useRef(contest);
  contestRef.current = contest;
  const playerRef = useRef(player);
  playerRef.current = player;

  // ------------------------------------------------------------ fetchers (public, via Supabase anon key)

  const fetchStreamers = useCallback(async () => {
    const { data, error } = await sb.from("streamers").select("*");
    if (!error && data) setStreamers(data as Streamer[]);
  }, [sb]);

  const fetchEntries = useCallback(
    async (c: Contest | null) => {
      if (!c) {
        setEntries([]);
        setMyEntry(null);
        return;
      }
      const { data } = await sb.from("contest_entries").select("*").eq("contest_id", c.id).order("ticket", { ascending: false }).limit(ENTRIES_SHOWN);
      if (data) setEntries(data as Entry[]);
      const me = playerRef.current;
      if (me) {
        const { data: mine } = await sb.from("contest_entries").select("*").eq("contest_id", c.id).eq("player_id", me.id).maybeSingle();
        setMyEntry((mine as Entry) ?? null);
      } else setMyEntry(null);
    },
    [sb],
  );

  const fetchLastWinner = useCallback(
    async (currentId: string | null) => {
      const { data } = await sb
        .from("contests")
        .select("*")
        .eq("status", "finished")
        .not("winner_nickname", "is", null)
        .order("drawn_at", { ascending: false })
        .limit(2);
      const list = (data as Contest[] | null) ?? [];
      setLastWinner(list.find((c) => c.id !== currentId) ?? null);
    },
    [sb],
  );

  const fetchContest = useCallback(async () => {
    const { data, error } = await sb.from("contests").select("*").order("created_at", { ascending: false }).limit(1);
    if (error) return;
    const c = ((data as Contest[]) ?? [])[0] ?? null;
    setContest(c);
    await Promise.all([fetchEntries(c), fetchLastWinner(c?.id ?? null)]);
  }, [sb, fetchEntries, fetchLastWinner]);

  const refetchAll = useCallback(() => Promise.all([fetchStreamers(), fetchContest()]), [fetchStreamers, fetchContest]);

  // ------------------------------------------------------------ realtime

  useEffect(() => {
    let streamTimer: ReturnType<typeof setTimeout> | undefined;
    let contestTimer: ReturnType<typeof setTimeout> | undefined;
    const ch = sb
      .channel("arena-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "streamers" }, () => {
        clearTimeout(streamTimer);
        streamTimer = setTimeout(fetchStreamers, 400);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "contests" }, (payload) => {
        const row = payload.new as Contest | undefined;
        const cur = contestRef.current;
        if (payload.eventType === "UPDATE" && row && cur && row.id === cur.id) {
          setContest((c) => (c && c.id === row.id ? { ...c, ...row } : c));
          if (row.status === "finished") fetchLastWinner(row.id);
          return;
        }
        clearTimeout(contestTimer);
        contestTimer = setTimeout(fetchContest, 300);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contest_entries" }, (payload) => {
        const e = payload.new as Entry;
        const cur = contestRef.current;
        if (!cur || e.contest_id !== cur.id) return;
        setEntries((list) => (list.some((x) => x.id === e.id) ? list : [e, ...list].slice(0, ENTRIES_SHOWN)));
        setContest((c) => (c && c.id === e.contest_id ? { ...c, entries_count: Math.max(c.entries_count, e.ticket + 1) } : c));
      })
      .subscribe((status) => setRealtimeOk(status === "SUBSCRIBED"));
    return () => {
      clearTimeout(streamTimer);
      clearTimeout(contestTimer);
      sb.removeChannel(ch);
    };
  }, [sb, fetchStreamers, fetchContest, fetchLastWinner]);

  // ------------------------------------------------------------ polling fallback

  useEffect(() => {
    const contestEvery = realtimeOk ? 30_000 : 4_000;
    const streamEvery = realtimeOk ? 60_000 : 15_000;
    const visible = () => document.visibilityState === "visible";
    const a = setInterval(() => visible() && fetchContest(), contestEvery);
    const b = setInterval(() => visible() && fetchStreamers(), streamEvery);
    const onVis = () => visible() && refetchAll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(a);
      clearInterval(b);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [realtimeOk, fetchContest, fetchStreamers, refetchAll]);

  // ------------------------------------------------------------ live-status refresher (server throttles it)

  useEffect(() => {
    const ping = () => document.visibilityState === "visible" && fetch("/api/streamers/refresh", { method: "POST" }).catch(() => {});
    const first = setTimeout(ping, 1500);
    const id = setInterval(ping, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // my entry depends on who I am
  useEffect(() => {
    fetchEntries(contestRef.current);
  }, [player, fetchEntries]);

  // ------------------------------------------------------------ handlers

  const onContest = useCallback(
    (c: Contest) => {
      const cur = contestRef.current;
      if (!cur || cur.id === c.id) {
        setContest(c);
        if (c.status === "finished") fetchLastWinner(c.id);
        if (!cur) fetchEntries(c);
      } else {
        fetchContest();
      }
    },
    [fetchContest, fetchEntries, fetchLastWinner],
  );

  const onJoined = useCallback((e: Entry) => {
    setMyEntry(e);
    setEntries((list) => (list.some((x) => x.id === e.id) ? list : [e, ...list].slice(0, ENTRIES_SHOWN)));
    setContest((c) => (c && c.id === e.contest_id ? { ...c, entries_count: Math.max(c.entries_count, e.ticket + 1) } : c));
  }, []);

  async function reorder(side: Side, ids: string[]) {
    setStreamers((list) => list.map((s) => (s.side === side && ids.includes(s.id) ? { ...s, sort_order: ids.indexOf(s.id) } : s)));
    await api("/api/streamers/reorder", { body: { ids } });
    fetchStreamers();
  }

  return (
    <>
      <TopBar discordUrl={discordUrl} />
      <main className="arena">
        <div className="side-col left-col">
          <StreamerPanel
            side="left"
            streamers={streamers}
            onAdd={(side) => setStreamerModal({ mode: "add", side })}
            onEdit={(s) => setStreamerModal({ mode: "edit", streamer: s })}
            onReorder={reorder}
            contactUrl={contactUrl}
          >
            <a className="discord-card" href={discordUrl} target="_blank" rel="noopener noreferrer" data-testid="discord-card">
              <span className="dc-ic">
                <DiscordIcon size={26} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="dc-title">{t("joinDiscord")}</span>
                <span className="dc-sub">{t("discordSub")}</span>
              </span>
            </a>
          </StreamerPanel>
        </div>

        <div className="contest-col">
          <ContestCard
            contest={contest}
            entries={entries}
            myEntry={myEntry}
            onContest={onContest}
            onJoined={onJoined}
            onEdit={() => setContestModal({ contest })}
            onNew={() => setContestModal({ contest: null })}
            onChanged={fetchContest}
          />
        </div>

        <div className="side-col right-col">
          <StreamerPanel
            side="right"
            streamers={streamers}
            onAdd={(side) => setStreamerModal({ mode: "add", side })}
            onEdit={(s) => setStreamerModal({ mode: "edit", streamer: s })}
            onReorder={reorder}
            contactUrl={contactUrl}
          >
            {lastWinner && (
              <>
                <h2 className="panel-title">🏆 {t("lastWinner")}</h2>
                <div className="winner-card" style={{ marginBottom: 18 }} data-testid="last-winner">
                  <div className="wc-ic">
                    {lastWinner.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={lastWinner.image_url} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      "🏆"
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="wc-nick">{lastWinner.winner_nickname}</div>
                    <div className="wc-prize">{lastWinner.prize || lastWinner.title}</div>
                  </div>
                </div>
              </>
            )}
          </StreamerPanel>
        </div>
      </main>

      {streamerModal && (
        <StreamerModal
          {...(streamerModal.mode === "add"
            ? { mode: "add" as const, side: streamerModal.side }
            : { mode: "edit" as const, streamer: streamerModal.streamer })}
          onClose={() => setStreamerModal(null)}
          onSaved={fetchStreamers}
        />
      )}
      {contestModal && (
        <ContestModal
          contest={contestModal.contest}
          discordUrl={discordUrl}
          onClose={() => setContestModal(null)}
          onSaved={(c) => {
            setContest(c);
            fetchEntries(c);
            fetchLastWinner(c.id);
          }}
        />
      )}
    </>
  );
}
