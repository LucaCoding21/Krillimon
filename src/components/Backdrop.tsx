"use client";

// The world behind every screen: the biome for your current depth, with the
// time of day moving along the route (morning → sunset → midnight → dawn).
import type { CSSProperties } from "react";
import { rngFrom } from "@/lib/game";
import { BIOMES, MAX_METERS, biomeIndexAt, biomeLayers, cloudArt, moonArt, sunArt } from "./art";
import { PixelArt } from "./pixel";

export { BIOMES, MAX_METERS, biomeIndexAt };
export const biomeAt = (m: number) => BIOMES[biomeIndexAt(m)];

const DAWN = BIOMES[BIOMES.length - 1].from;
const STARS = (() => {
  const rng = rngFrom("stars");
  return Array.from({ length: 80 }, () => ({ x: rng(), y: rng(), s: rng() < 0.2 ? 3 : 2, d: rng() * 3 }));
})();

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ramp = (m: number, a: number, b: number) => clamp01((m - a) / (b - a));
const mix = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
};

/** Time of day for a distance along the route. */
export function timeOfDay(m: number) {
  const dawn = m >= DAWN;
  const sunset = clamp01(m / 1900);
  return {
    sunHeight: dawn ? 0.1 + 0.3 * ramp(m, DAWN, MAX_METERS) : 0.82 - 0.94 * Math.pow(sunset, 1.25),
    sunVisible: dawn || m < 2050,
    sunColor: dawn ? ["#fff1a8", "#ffc24a", "#ffe27a"] : [mix("#fff6b0", "#ff7a3c", sunset), mix("#ffd23f", "#e2402b", sunset), mix("#ffe9a0", "#ff9a5a", sunset)],
    sunSize: dawn ? 1.6 : 1 + sunset * 0.5,
    stars: dawn ? 1 - ramp(m, DAWN, DAWN + 200) : ramp(m, 1850, 2700),
    moon: dawn ? 0 : ramp(m, 2200, 2800),
    tint: dawn ? 0 : 0.1 * ramp(m, 900, 1500) + 0.18 * ramp(m, 1500, 2800) + 0.08 * ramp(m, 3000, 4300),
    night: dawn ? 0 : ramp(m, 1700, 2900),
  };
}

/**
 * Sky, celestial bodies, mountains, forest edge and ground for `meters`.
 * `groundTop` is the horizon in px from the bottom; `drift` pans the far layers.
 */
export function Backdrop({ meters, groundTop, width, height, scale, drift = 0 }: {
  meters: number; groundTop: number; width: number; height: number; scale: number; drift?: number;
}) {
  const bi = biomeIndexAt(meters);
  const tod = timeOfDay(meters);
  const S = scale;
  const skyH = Math.max(1, height - groundTop);
  const stacks = [bi - 1, bi, bi + 1].filter((i) => i >= 0 && i < BIOMES.length);
  const tile = (l: { url: string; w: number; h: number }, k: number): CSSProperties => ({
    backgroundImage: l.url, backgroundRepeat: "repeat-x",
    backgroundSize: `${l.w * S}px ${l.h * S}px`, backgroundPositionX: `${-drift * k + width * 0.13}px`,
  });

  return (
    <div className="absolute inset-0 overflow-hidden bg-navy">
      {stacks.map((i) => {
        const pal = BIOMES[i].pal;
        return (
          <div key={`sky${i}`} className="absolute inset-0 transition-opacity duration-1000" style={{ opacity: i === bi ? 1 : 0 }}>
            <div className="absolute inset-0" style={{ background: `linear-gradient(${pal.sky[0]}, ${pal.sky[1]} 55%, ${pal.sky[2]})` }} />
          </div>
        );
      })}

      <div className="absolute inset-x-0 top-0 transition-opacity duration-1000" style={{ height: skyH, opacity: tod.stars }}>
        {STARS.map((s, i) => (
          <span key={i} className="star absolute bg-white" style={{ left: `${s.x * 100}%`, top: `${s.y * 85}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />
        ))}
      </div>
      <div className="absolute transition-opacity duration-1000" style={{ right: "16%", bottom: groundTop + skyH * 0.6, opacity: tod.moon }}>
        <div className="rounded-full" style={{ boxShadow: "0 0 50px 22px rgba(253,246,216,.18)" }}><PixelArt art={moonArt} scale={S} /></div>
      </div>
      {tod.sunVisible && (
        <div className="absolute transition-[bottom] duration-1000" style={{ left: "58%", bottom: groundTop + 10 + skyH * (1 - tod.sunHeight) * 0.78 - 60, transform: `scale(${tod.sunSize})` }}>
          <div className="rounded-full" style={{ boxShadow: `0 0 70px 30px ${tod.sunColor[2]}66` }}>
            <PixelArt art={sunArt(tod.sunColor[0], tod.sunColor[1], tod.sunColor[2])} scale={S} />
          </div>
        </div>
      )}

      {stacks.map((i) => {
        const L = biomeLayers(i);
        const pal = BIOMES[i].pal;
        return (
          <div key={`land${i}`} className="absolute inset-0 transition-opacity duration-1000" style={{ opacity: i === bi ? 1 : 0 }}>
            {pal.clouds && (
              <>
                <div className="cloud" style={{ top: "8%", animationDuration: "70s", animationDelay: "-30s" }}><PixelArt art={cloudArt} scale={S} /></div>
                <div className="cloud" style={{ top: "20%", animationDuration: "95s", animationDelay: "-70s" }}><PixelArt art={cloudArt} scale={Math.max(1, S - 1)} /></div>
                <div className="cloud" style={{ top: "13%", animationDuration: "130s", animationDelay: "-12s" }}><PixelArt art={cloudArt} scale={S + 1} /></div>
              </>
            )}
            <div className="absolute inset-x-0" style={{ bottom: groundTop + 20, height: L.mountains.h * S, ...tile(L.mountains, 0.15) }} />
            <div className="absolute inset-x-0" style={{ bottom: groundTop - 6, height: L.treeline.h * S, ...tile(L.treeline, 0.4) }} />
            <div className="absolute inset-x-0 bottom-0" style={{ height: groundTop, ...tile(L.ground, 1), backgroundRepeat: "repeat" }} />
            {/* soft shading so the near ground reads as closer */}
            <div className="absolute inset-x-0 bottom-0" style={{ height: groundTop, background: "linear-gradient(rgba(0,0,0,.12), transparent 30%, transparent 70%, rgba(0,0,0,.18))" }} />
          </div>
        );
      })}

      <div className="pointer-events-none absolute inset-0 transition-opacity duration-1000" style={{ background: "#070a1e", opacity: tod.tint }} />
    </div>
  );
}

/** Vertical expedition gauge: your marker sinks from morning toward midnight (and dawn). */
export function DepthGauge({ meters, labels = true }: { meters: number; labels?: boolean }) {
  const pct = Math.min(100, (meters / MAX_METERS) * 100);
  const bi = biomeIndexAt(meters);
  return (
    <div className="flex h-full items-stretch gap-2">
      {labels && (
        <div className="relative w-[118px]">
          {BIOMES.map((b, i) => (
            <span key={b.name} className={`absolute right-0 -translate-y-1/2 whitespace-nowrap text-right text-[11px] font-black transition-colors ${i === bi ? "text-gold" : i < bi ? "text-white/55" : "text-white/30"}`}
              style={{ top: `${((b.from + ((BIOMES[i + 1]?.from ?? MAX_METERS) - b.from) / 2) / MAX_METERS) * 100}%` }}>
              {b.name}
            </span>
          ))}
        </div>
      )}
      <div className="relative w-3 overflow-hidden rounded-full ring-2 ring-white/20">
        {BIOMES.map((b, i) => {
          const end = BIOMES[i + 1]?.from ?? MAX_METERS;
          return <div key={b.name} className="absolute inset-x-0" style={{ top: `${(b.from / MAX_METERS) * 100}%`, height: `${((end - b.from) / MAX_METERS) * 100}%`, background: b.pal.sky[1] }} />;
        })}
        <div className="absolute inset-x-0 bottom-0 bg-navy/55 transition-[top] duration-1000 ease-out" style={{ top: `${pct}%` }} />
      </div>
      <div className="relative w-0">
        <div className="absolute -left-[22px] -translate-y-1/2 transition-[top] duration-1000 ease-out" style={{ top: `${pct}%` }}>
          <div className="h-4 w-4 rounded-full border-[3px] border-navy bg-gold shadow-[0_0_10px_#ffc93c]" />
        </div>
      </div>
    </div>
  );
}

/** Horizontal version for the results screen. */
export function JourneyMap({ meters }: { meters: number }) {
  const pct = Math.min(100, (meters / MAX_METERS) * 100);
  return (
    <div>
      <div className="relative h-5 overflow-hidden rounded-full ring-2 ring-white/15">
        <div className="absolute inset-0 flex">
          {BIOMES.map((b, i) => {
            const end = BIOMES[i + 1]?.from ?? MAX_METERS;
            return <div key={b.name} title={b.name} style={{ flex: end - b.from, background: b.pal.sky[1] }} className="border-r border-black/25 last:border-0" />;
          })}
        </div>
        <div className="absolute inset-y-0 right-0 bg-navy/60" style={{ left: `${pct}%` }} />
        <div className="absolute inset-y-0 w-1 bg-gold shadow-[0_0_8px_#ffc93c]" style={{ left: `calc(${pct}% - 2px)` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-extrabold text-muted">
        <span>Morning</span><span>Midnight</span><span>Dawn · 6,000 m</span>
      </div>
    </div>
  );
}
