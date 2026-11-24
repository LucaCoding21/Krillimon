// Original pixel art, drawn from character grids. Each character maps to a colour
// in the palette; "." is transparent.
import type { CSSProperties } from "react";
import { TIERS, type TierId } from "@/lib/game";
import { BALL_FOR_TIER, BallIcon } from "./sprites";

type Art = { grid: string[]; palette: Record<string, string> };

export function PixelArt({ art, scale = 4, className, style, title }: {
  art: Art; scale?: number; className?: string; style?: CSSProperties; title?: string;
}) {
  const h = art.grid.length;
  const w = Math.max(...art.grid.map((r) => r.length));
  const rects = [];
  for (let y = 0; y < h; y++) {
    const row = art.grid[y];
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === "." || !art.palette[c]) continue;
      // merge runs of the same colour into one rect
      let run = 1;
      while (row[x + run] === c) run++;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={art.palette[c]} />);
      x += run - 1;
    }
  }
  return (
    <svg className={`px ${className ?? ""}`} style={style} width={w * scale} height={h * scale}
      viewBox={`0 0 ${w} ${h}`} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {rects}
    </svg>
  );
}

const K = "#1d2236";

export const PUFF: Art = {
  palette: { l: "#f1f5f9", g: "#b6c2d4" },
  grid: [
    "...ll.....",
    ".llllll.l.",
    "llllgllll.",
    "lllgggllll",
    ".llgggll..",
    "lllllllll.",
    ".l.llll.l.",
    "...l..l...",
  ],
};

export const TIER_ICONS: Record<TierId, Art> = {
  common: {
    palette: { g: "#4caf50", l: "#8be07d", d: "#1f6b33", b: "#9a6532", c: "#6b4423" },
    grid: [
      "..........",
      ".ll....ll.",
      "lggl..lggl",
      ".ggdddgg..",
      "....dd....",
      "....dd....",
      "..bbbbbb..",
      ".bbbbbbbb.",
      ".cccccccc.",
    ],
  },
  meme: {
    palette: { y: "#ffd59a", r: "#e2504b", k: K, w: "#ffffff", o: "#f08a30" },
    grid: [
      ".o......o.",
      "oyyyyyyyyo",
      ".ykkyykky.",
      ".ywkyywky.",
      ".yyyrryyy.",
      ".yyyrryyy.",
      ".ykyyyyky.",
      "..ykkkky..",
      "...yyyy...",
    ],
  },
  uncommon: {
    palette: { g: "#3a9e48", l: "#8be07d", d: "#1f6b33" },
    grid: [
      ".......gg.",
      ".....gggg.",
      "...gggglg.",
      "..gggglgg.",
      ".gggglggg.",
      ".gglgggg..",
      "gglggg....",
      "dlgg......",
      "d.........",
    ],
  },
  rare: {
    palette: { b: "#3d7fe0", l: "#a9cdfb", w: "#ffffff", d: "#1e3f8f" },
    grid: [
      "..dddddd..",
      ".dwllbbbd.",
      "dwlllbbbbd",
      "dbbbbbbbbd",
      ".dbbbbbbd.",
      "..dbbbbd..",
      "...dbbd...",
      "....dd....",
      "..........",
    ],
  },
  ultra: {
    palette: { p: "#9b5de5", l: "#e4d1fb", d: "#5f2b9e", k: K, g: "#6b7392" },
    grid: [
      "...pppp...",
      "..plpppp..",
      ".plpppppp.",
      ".pppppppd.",
      ".ppppppdd.",
      "..dddddd..",
      "..gggggg..",
      ".kkkkkkkk.",
      "kkkkkkkkkk",
    ],
  },
  shiny: {
    palette: { y: "#f6c736", l: "#fff3a6", o: "#c98a0b" },
    grid: [
      "....yy....",
      "....ly....",
      "...yllo...",
      "yyyylllyyo",
      ".oyylllyo.",
      "..oyyyyo..",
      "..yyoyyo..",
      ".yo...oyo.",
      ".o.....oo.",
    ],
  },
  miss: PUFF,
};

export function TierIcon({ tier, scale = 3, className }: { tier: TierId; scale?: number; className?: string }) {
  return <PixelArt art={TIER_ICONS[tier]} scale={scale} className={className} title={TIERS[tier].name} />;
}

// Background gradients per tier (cards, chips).
export const TIER_GRADIENT: Record<TierId, string> = {
  common: "linear-gradient(180deg, #8fa3c0, #5b6d8c)",
  meme: "linear-gradient(180deg, #ffb35c, #f07a1a)",
  uncommon: "linear-gradient(180deg, #5fd36a, #2c9a45)",
  rare: "linear-gradient(180deg, #5cb8ff, #2f74e0)",
  ultra: "linear-gradient(180deg, #b48cff, #7444e0)",
  shiny: "linear-gradient(180deg, #ffe066, #f2a516)",
  miss: "linear-gradient(180deg, #4a5480, #2b3360)",
};

export function TierChip({ tier, points = true }: { tier: TierId; points?: boolean }) {
  const t = TIERS[tier];
  return (
    <span className="chip h-8 gap-1.5 pl-1 pr-3 text-[13px]" style={{ background: TIER_GRADIENT[tier], color: tier === "shiny" ? "#3a2400" : "#fff" }}>
      {tier === "miss" ? <TierIcon tier="miss" scale={2} /> : <BallIcon ball={BALL_FOR_TIER[tier]} size={26} />}
      {t.name}{points && <span className="opacity-80">· {t.score}</span>}
    </span>
  );
}

const TYPE_COLORS: Record<string, string> = {
  normal: "#9fa19f", fire: "#e62829", water: "#2980ef", grass: "#3fa129", electric: "#e0ad00",
  ice: "#3dc7ef", fighting: "#ff8000", poison: "#9141cb", ground: "#915121", flying: "#81b9ef",
  psychic: "#ef4179", bug: "#91a119", rock: "#afa981", ghost: "#704170", dragon: "#5060e1",
  dark: "#624d4e", steel: "#60a1b8", fairy: "#ef70ef",
};

export function TypeChip({ type }: { type: string }) {
  return <span className="chip" style={{ background: TYPE_COLORS[type] ?? "#666" }}>{type[0].toUpperCase() + type.slice(1)}</span>;
}

// Rounded countdown bar.
export function TimerBar({ value, seconds, low }: { value: number; seconds: number | null; low?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  const fill = v > 0.5 ? "linear-gradient(180deg, #7ee787, #2fb24c)" : v > 0.2 ? "linear-gradient(180deg, #ffe066, #f2a516)" : "linear-gradient(180deg, #ff8a8a, #e8445a)";
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-[18px] flex-1 overflow-hidden rounded-full bg-[#0c1029] shadow-[inset_0_2px_0_rgba(0,0,0,.45)]">
        <div className={`h-full rounded-full transition-[width] duration-100 ease-linear ${low ? "timer-low" : ""}`} style={{ width: `${v * 100}%`, background: fill }}>
          <div className="mx-2 mt-[3px] h-[5px] rounded-full bg-white/35" />
        </div>
      </div>
      <span className="w-9 text-right font-display text-xl font-black tabular-nums">{seconds ?? ""}</span>
    </div>
  );
}
