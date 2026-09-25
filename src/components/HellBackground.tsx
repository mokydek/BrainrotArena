// Decorative hell landscape: sky glow, lava falls, gothic spires, lava river, embers.
// Deterministic (seeded) so server and client render the same markup.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Tower = { d: string; windows: { x: number; y: number; w: number; h: number }[] };

function tower(x: number, w: number, h: number, base: number, r: () => number): Tower {
  const top = base - h;
  const spireH = w * (1.3 + r() * 0.9);
  const eave = w * 0.18;
  const d = [
    `M${x},${base}`,
    `L${x},${top}`,
    `L${x - eave},${top}`,
    `L${x + w / 2},${top - spireH}`,
    `L${x + w + eave},${top}`,
    `L${x + w},${top}`,
    `L${x + w},${base}`,
    "Z",
  ].join(" ");
  const windows: Tower["windows"] = [];
  const rows = Math.max(1, Math.floor(h / 70));
  for (let i = 0; i < rows; i++) {
    if (r() < 0.55) windows.push({ x: x + w / 2 - 3, y: top + 22 + i * 62, w: 6, h: 14 });
  }
  return { d, windows };
}

function castle(startX: number, endX: number, base: number, maxH: number, seed: number) {
  const r = rng(seed);
  const towers: Tower[] = [];
  let x = startX;
  while (x < endX) {
    const w = 26 + r() * 46;
    const h = maxH * (0.35 + r() * 0.65);
    towers.push(tower(x, w, h, base, r));
    x += w * (0.7 + r() * 0.5);
  }
  // connecting wall
  const wall = `M${startX},${base} L${startX},${base - maxH * 0.25} L${endX},${base - maxH * 0.22} L${endX},${base} Z`;
  return { towers, wall };
}

function mountains(seed: number, base: number, amp: number) {
  const r = rng(seed);
  const pts: string[] = [`M0,900`, `L0,${base}`];
  for (let x = 0; x <= 1600; x += 40) {
    pts.push(`L${x},${base - r() * amp - (x % 160 === 0 ? amp * 0.6 : 0)}`);
  }
  pts.push("L1600,900 Z");
  return pts.join(" ");
}

export default function HellBackground() {
  const far = mountains(7, 610, 90);
  const leftFar = castle(-20, 330, 700, 330, 11);
  const rightFar = castle(1270, 1640, 690, 350, 23);
  const leftNear = castle(-40, 230, 790, 420, 31);
  const rightNear = castle(1380, 1660, 800, 440, 47);

  const er = rng(99);
  const embers = Array.from({ length: 34 }, (_, i) => ({
    left: `${(er() * 100).toFixed(2)}%`,
    delay: `${(er() * 12).toFixed(2)}s`,
    dur: `${(7 + er() * 9).toFixed(2)}s`,
    dx: `${Math.round(er() * 160 - 80)}px`,
    size: 2 + Math.round(er() * 3),
    key: i,
  }));

  return (
    <div className="hell-bg" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="hb-lava" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe066" />
            <stop offset="0.45" stopColor="#ff8c00" />
            <stop offset="1" stopColor="#d62800" />
          </linearGradient>
          <linearGradient id="hb-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a0707" />
            <stop offset="1" stopColor="#7a1106" />
          </linearGradient>
          <filter id="hb-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        <path d={far} fill="url(#hb-far)" opacity="0.75" />

        <g fill="#2e0404" opacity="0.92">
          <path d={leftFar.wall} />
          <path d={rightFar.wall} />
          {[...leftFar.towers, ...rightFar.towers].map((t, i) => (
            <path key={`f${i}`} d={t.d} />
          ))}
        </g>
        <g fill="#ff6a00" opacity="0.55">
          {[...leftFar.towers, ...rightFar.towers].flatMap((t, i) =>
            t.windows.map((w, j) => <rect key={`fw${i}-${j}`} x={w.x} y={w.y} width={w.w} height={w.h} rx="3" />),
          )}
        </g>

        <g fill="#150101">
          <path d={leftNear.wall} />
          <path d={rightNear.wall} />
          {[...leftNear.towers, ...rightNear.towers].map((t, i) => (
            <path key={`n${i}`} d={t.d} />
          ))}
        </g>
        <g fill="#ff8a00" opacity="0.8">
          {[...leftNear.towers, ...rightNear.towers].flatMap((t, i) =>
            t.windows.map((w, j) => <rect key={`nw${i}-${j}`} x={w.x} y={w.y} width={w.w} height={w.h} rx="3" />),
          )}
        </g>

        {/* lava river */}
        <path d="M0,842 C220,812 420,868 700,838 C980,808 1220,872 1600,834 L1600,900 L0,900 Z" fill="#ff5a00" filter="url(#hb-glow)" opacity="0.9" />
        <path d="M0,852 C240,826 440,874 720,848 C1000,822 1230,878 1600,846 L1600,900 L0,900 Z" fill="url(#hb-lava)" />
        <path d="M60,870 C200,860 300,878 420,868 M820,866 C960,856 1060,874 1180,864" stroke="#fff3a0" strokeWidth="3" fill="none" opacity="0.6" strokeLinecap="round" />
      </svg>

      <div className="lavafall l1" />
      <div className="lavafall l2" />
      <div className="lavafall r1" />
      <div className="lavafall r2" />
      <div className="lava-glow" />

      {embers.map((e) => (
        <span
          key={e.key}
          className="ember"
          style={
            {
              left: e.left,
              width: e.size,
              height: e.size,
              animationDelay: e.delay,
              animationDuration: e.dur,
              "--dx": e.dx,
            } as React.CSSProperties
          }
        />
      ))}
      <div className="vignette" />
    </div>
  );
}
