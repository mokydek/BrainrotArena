"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const ITEM = 128; // 120px tile + 8px margins
const WIN_INDEX = 44;
const TOTAL = 52;
export const REEL_MS = 5600;

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export default function WinnerReel({ names, winner, seed, onDone }: { names: string[]; winner: string; seed: string; onDone: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<number | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const { items, jitter } = useMemo(() => {
    const r = seeded(seed);
    const pool = names.length ? names : [winner];
    const list = Array.from({ length: TOTAL }, () => pool[Math.floor(r() * pool.length)]);
    list[WIN_INDEX] = winner;
    return { items: list, jitter: Math.round(r() * 80 - 40) };
  }, [names, winner, seed]);

  useEffect(() => {
    const w = wrapRef.current?.clientWidth ?? 320;
    const target = WIN_INDEX * ITEM + ITEM / 2 - w / 2 + jitter;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOffset(target)));
    const tm = setTimeout(() => doneRef.current(), REEL_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(tm);
    };
  }, [jitter]);

  return (
    <div className="reel" ref={wrapRef} data-testid="winner-reel">
      <div className="reel-marker" />
      <div
        className="reel-track"
        style={{
          transform: `translateX(${-(offset ?? 0)}px)`,
          transition: offset === null ? "none" : `transform ${REEL_MS - 400}ms cubic-bezier(0.1, 0.75, 0.15, 1)`,
        }}
      >
        {items.map((n, i) => (
          <div key={i} className="reel-item">
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}
