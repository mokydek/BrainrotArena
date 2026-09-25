"use client";

import { useEffect, useState } from "react";

const COLORS = ["#ffd400", "#ff2d55", "#0a33ff", "#067d0a", "#ff8800", "#ffffff"];

export default function Confetti({ count = 90, onEnd }: { count?: number; onEnd?: () => void }) {
  const [pieces, setPieces] = useState<React.CSSProperties[]>([]);

  useEffect(() => {
    setPieces(
      Array.from({ length: count }, () => ({
        left: `${Math.random() * 100}%`,
        background: COLORS[Math.floor(Math.random() * COLORS.length)],
        animationDuration: `${2.2 + Math.random() * 2.2}s`,
        animationDelay: `${Math.random() * 0.6}s`,
        width: 6 + Math.random() * 8,
        height: 8 + Math.random() * 10,
        ["--dx" as string]: `${Math.round(Math.random() * 300 - 150)}px`,
        ["--rot" as string]: `${Math.round(Math.random() * 1080 - 540)}deg`,
      })),
    );
    const tm = setTimeout(() => onEnd?.(), 5000);
    return () => clearTimeout(tm);
  }, [count, onEnd]);

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((s, i) => (
        <i key={i} style={s} />
      ))}
    </div>
  );
}
