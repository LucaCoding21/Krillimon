"use client";

// The Expedition: your party walks deeper into the wild as you score.
// Distance = score × 10 m. Layers scroll at different speeds (parallax), each
// biome has its own palette, backgrounds cross-fade at biome boundaries, and the
// time of day moves with you: the sun sets, stars come out, night falls, and only
// the best runs reach dawn at the Sky Sanctuary.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { rngFrom, type TierId } from "@/lib/game";
import { sfx } from "@/lib/sfx";
import { BIOMES, MAX_METERS, biomeAt, biomeIndexAt, biomeLayers, cloudArt, moonArt, propArt, signArt, sunArt } from "./art";
import { PUFF, PixelArt } from "./pixel";
import { PmdSprite, type Direction } from "./PmdSprite";

export { BIOMES, MAX_METERS, biomeAt, biomeIndexAt };

const PX_PER_M = 4; // wide enough that the next biome stays off-screen until you earn it
const WORLD_PX = (MAX_METERS + 900) * PX_PER_M;
const DAWN = BIOMES[BIOMES.length - 1].from;

// Scenery placed once along the whole route (positions are world pixels).
type Prop = { x: number; kind: "tree" | "berry" | "rock" | "crystal" | "pillar" | "lava" | "flower" | "grass"; biome: number; depth: number; tiles?: number };
const SCENERY: Prop[] = (() => {
  const rng = rngFrom("expedition-v3");
  const out: Prop[] = [];
  for (let x = 90; x < WORLD_PX; x += 46 + rng() * 120) {
    const biome = biomeIndexAt(x / PX_PER_M);
    const kinds = BIOMES[biome].pal.props;
    out.push({ x, kind: kinds[Math.floor(rng() * kinds.length)], biome, depth: rng() });
  }
  for (let x = 260; x < WORLD_PX; x += 220 + rng() * 320) {
    out.push({ x, kind: "grass", biome: biomeIndexAt(x / PX_PER_M), depth: rng() * 0.6, tiles: 2 + Math.floor(rng() * 3) });
  }
  return out.sort((a, b) => b.depth - a.depth); // far first
})();
const STARS = (() => {
  const rng = rngFrom("stars");
  return Array.from({ length: 70 }, () => ({ x: rng(), y: rng(), s: rng() < 0.2 ? 3 : 2, d: rng() * 3 }));
})();
const FIREFLIES = (() => {
  const rng = rngFrom("fireflies");
  return Array.from({ length: 12 }, () => ({ x: rng(), y: rng(), d: rng() * 4, t: 3 + rng() * 3 }));
})();

const SPARKLES = [
  { left: "10%", top: "8%", delay: "0s" }, { left: "82%", top: "4%", delay: ".3s" },
  { left: "90%", top: "50%", delay: ".6s" }, { left: "0%", top: "55%", delay: ".15s" },
];

export type Encounter = "idle" | "rustle" | "reveal" | "miss" | "gone";
export type Wanderer = { id: number; left: string; lane: "path" | "field"; facing: Direction; scale?: number };

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ramp = (m: number, a: number, b: number) => clamp01((m - a) / (b - a));
const mix = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
};

// Time of day along the route.
function sky(m: number) {
  const dawn = m >= DAWN;
  const sunset = clamp01(m / 1900); // the sun travels down to the horizon by ~1,900 m
  const night = dawn ? 1 - ramp(m, DAWN, DAWN + 150) : ramp(m, 1700, 2900);
  return {
    // 0 = high in the sky, 1 = on the horizon (sets just after that)
    sunHeight: dawn ? 0.08 + 0.3 * ramp(m, DAWN, MAX_METERS) : 0.8 - 0.92 * Math.pow(sunset, 1.25),
    sunVisible: dawn || m < 2050,
    sunColor: dawn ? ["#fff1a8", "#ffc24a", "#ffe27a"] : [mix("#fff6b0", "#ff7a3c", sunset), mix("#ffd23f", "#e2402b", sunset), mix("#ffe9a0", "#ff9a5a", sunset)],
    sunSize: dawn ? 1.6 : 1 + sunset * 0.5,
    stars: dawn ? 1 - ramp(m, DAWN, DAWN + 200) : ramp(m, 1850, 2700),
    moon: dawn ? 0 : ramp(m, 2200, 2800),
    tint: dawn ? 0 : 0.12 * ramp(m, 900, 1500) + 0.2 * ramp(m, 1500, 2800) + 0.08 * ramp(m, 3000, 4300),
    lantern: night,
  };
}

export function Trek({
  meters, party, encounter = "gone", pokemonId, tier, encounterKey, replay = false,
  hud = true, markers = true, readoutTop = 12, floor, floorFrac = 0, wanderers = [],
  height = "clamp(260px, 40vh, 360px)",
}: {
  meters: number; party: number[]; encounter?: Encounter; pokemonId?: number | null; tier?: TierId | null;
  encounterKey?: string | number; replay?: boolean;
  /** distance readout chip */ hud?: boolean;
  /** signposts, flavour notes and distance posts */ markers?: boolean;
  readoutTop?: number;
  /** px (or fraction of the height) kept clear at the bottom, e.g. for a docked panel */ floor?: number; floorFrac?: number;
  wanderers?: Wanderer[]; height?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 720, h: 320 });
  const [shown, setShown] = useState(replay ? 0 : meters);
  const [banner, setBanner] = useState<{ name: string; key: number } | null>(null);
  const lastBiome = useRef(biomeIndexAt(replay ? 0 : meters));

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Walk from where we are to the new distance.
  useEffect(() => {
    const from = shown;
    const to = meters;
    if (Math.abs(to - from) < 0.5) return;
    const px = Math.abs(to - from) * PX_PER_M;
    const duration = Math.min(replay ? 5000 : 2300, Math.max(800, 500 + px * (replay ? 0.3 : 0.6)));
    const startAt = performance.now() + (replay ? 600 : 0);
    let raf = 0;
    let lastStep = 0;
    const tick = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - startAt) / duration));
      const m = from + (to - from) * easeInOut(p);
      setShown(m);
      if (p > 0 && p < 1 && now - lastStep > 190) { sfx.step(); lastStep = now; }
      const bi = biomeIndexAt(m);
      if (bi !== lastBiome.current) {
        lastBiome.current = bi;
        if (bi > 0) { setBanner({ name: BIOMES[bi].name, key: now }); sfx.biome(); }
      }
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meters]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1900);
    return () => clearTimeout(t);
  }, [banner]);

  const walking = Math.abs(meters - shown) > 0.5;
  const bi = biomeIndexAt(shown);
  const cam = shown * PX_PER_M;
  const narrow = box.w < 560;
  const S = narrow ? 2 : 3; // world pixel scale
  const tod = sky(shown);

  // vertical layout (px from the bottom)
  const inset = Math.max(0, Math.min(box.h - 160, floor ?? Math.round(box.h * floorFrac)));
  const avail = box.h - inset;
  const pathBottom = inset + Math.round(avail * 0.06);
  const pathH = 16 * S;
  const pathTop = pathBottom + pathH;
  const groundTop = inset + Math.round(avail * 0.44);
  const skyH = box.h - groundTop;
  const fieldBottom = (depth: number) => Math.round(pathTop + 6 + depth * Math.max(10, groundTop - pathTop - 30));

  const spacing = narrow ? 40 : 58;
  const leaderX = box.w * (narrow ? 0.44 : 0.42);
  // world x → screen x; the party leader stands exactly at the current distance
  const sx = (x: number) => x - cam + leaderX;
  const inView = (x: number, pad = 160) => sx(x) > -pad && sx(x) < box.w + pad;
  const stacks = [bi - 1, bi, bi + 1].filter((i) => i >= 0 && i < BIOMES.length);
  const posts = markers ? Array.from({ length: Math.ceil(MAX_METERS / 100) }, (_, i) => (i + 1) * 100).filter((m) => inView(m * PX_PER_M, 80)) : [];
  const layerTile = (l: { url: string; w: number; h: number }, k: number): CSSProperties => ({
    backgroundImage: l.url, backgroundRepeat: "repeat-x",
    backgroundSize: `${l.w * S}px ${l.h * S}px`, backgroundPositionX: `${-cam * k}px`,
  });

  return (
    <div ref={rootRef} className="relative w-full select-none overflow-hidden bg-navy" style={{ height }}>
      {/* sky, cross-fading between nearby biomes */}
      {stacks.map((i) => {
        const pal = BIOMES[i].pal;
        return (
          <div key={`sky${i}`} className="absolute inset-0 transition-opacity duration-700" style={{ opacity: i === bi ? 1 : 0 }}>
            <div className="absolute inset-0" style={{ background: `linear-gradient(${pal.sky[0]}, ${pal.sky[1]} 55%, ${pal.sky[2]})` }} />
          </div>
        );
      })}

      {/* stars, moon and sun move with the time of day */}
      <div className="absolute inset-x-0 top-0" style={{ height: skyH, opacity: tod.stars }}>
        {STARS.map((s, i) => (
          <span key={i} className="star absolute bg-white" style={{ left: `${s.x * 100}%`, top: `${s.y * 85}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />
        ))}
      </div>
      {tod.moon > 0 && (
        <div className="absolute" style={{ right: "14%", bottom: groundTop + skyH * 0.62, opacity: tod.moon }}>
          <div className="rounded-full" style={{ boxShadow: "0 0 40px 18px rgba(253,246,216,.18)" }}><PixelArt art={moonArt} scale={S} /></div>
        </div>
      )}
      {tod.sunVisible && (
        <div className="absolute" style={{ right: "22%", bottom: groundTop + 10 + skyH * (1 - tod.sunHeight) * 0.78 - 60, transform: `scale(${tod.sunSize})`, transformOrigin: "center" }}>
          <div className="rounded-full" style={{ boxShadow: `0 0 60px 26px ${tod.sunColor[2]}66` }}>
            <PixelArt art={sunArt(tod.sunColor[0], tod.sunColor[1], tod.sunColor[2])} scale={S} />
          </div>
        </div>
      )}

      {/* clouds, mountains, forest edge, field, fence, path */}
      {stacks.map((i) => {
        const L = biomeLayers(i);
        const pal = BIOMES[i].pal;
        return (
          <div key={`land${i}`} className="absolute inset-0 transition-opacity duration-700" style={{ opacity: i === bi ? 1 : 0 }}>
            {pal.clouds && (
              <>
                <div className="cloud" style={{ top: "7%", animationDuration: "70s", animationDelay: "-30s" }}><PixelArt art={cloudArt} scale={S} /></div>
                <div className="cloud" style={{ top: "18%", animationDuration: "95s", animationDelay: "-70s" }}><PixelArt art={cloudArt} scale={S - 1 || 1} /></div>
                <div className="cloud" style={{ top: "12%", animationDuration: "120s", animationDelay: "-15s" }}><PixelArt art={cloudArt} scale={S + 1} /></div>
              </>
            )}
            <div className="absolute inset-x-0" style={{ bottom: groundTop + 18, height: L.mountains.h * S, ...layerTile(L.mountains, 0.12) }} />
            <div className="absolute inset-x-0" style={{ bottom: groundTop - 8, height: L.treeline.h * S, ...layerTile(L.treeline, 0.35) }} />
            <div className="absolute inset-x-0 bottom-0" style={{ height: groundTop, ...layerTile(L.ground, 1), backgroundRepeat: "repeat" }} />
            <div className="absolute inset-x-0" style={{ bottom: pathTop - 5 * S, height: L.fence.h * S, ...layerTile(L.fence, 1) }} />
            <div className="absolute inset-x-0" style={{ bottom: pathBottom, height: pathH, ...layerTile(L.path, 1) }} />
          </div>
        );
      })}


      {/* scenery on the field, far to near */}
      {SCENERY.filter((s) => inView(s.x)).map((s) => s.kind === "grass" ? (
        <div key={`g${s.x}`} className="tuft absolute" style={{
          left: sx(s.x), bottom: fieldBottom(s.depth), width: 24 * S * (s.tiles ?? 2), height: 20 * S,
          backgroundImage: biomeLayers(s.biome).grass.url, backgroundSize: `${24 * S}px ${20 * S}px`, backgroundRepeat: "repeat-x",
          animationDelay: `${(s.x % 7) * -0.3}s`,
        }} />
      ) : (
        <div key={`p${s.x}`} className={`absolute ${s.kind === "flower" ? "tuft" : ""}`} style={{ left: sx(s.x), bottom: fieldBottom(s.depth) }}>
          <PixelArt art={propArt(s.kind, s.biome)} scale={s.kind === "flower" ? S - 1 || 1 : S} />
        </div>
      ))}

      {/* distance posts every 100 m, gold every 500 m */}
      {posts.map((m) => (
        <div key={m} className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: sx(m * PX_PER_M), bottom: pathBottom + pathH - 2 * S }}>
          <span className={`mb-0.5 rounded px-1 text-[10px] font-black leading-[14px] ${m % 500 === 0 ? "bg-gold text-navy" : "bg-navy/75 text-white"}`}>{m.toLocaleString()}</span>
          <span className="block border-2 border-[#3b2410] bg-[#d9c79c]" style={{ width: 3 * S, height: 6 * S }} />
        </div>
      ))}

      {/* biome signposts by the path */}
      {markers && BIOMES.slice(1).filter((b) => inView(b.from * PX_PER_M, 220)).map((b) => (
        <div key={b.name} className="absolute flex flex-col items-center" style={{ left: sx(b.from * PX_PER_M), bottom: pathTop - 6 }}>
          <span className="mb-1 whitespace-nowrap rounded-lg bg-navy/85 px-2 py-0.5 text-[12px] font-black text-white">{b.name} · {b.from.toLocaleString()} m</span>
          <PixelArt art={signArt} scale={S} />
        </div>
      ))}

      {/* night falls over the world (but not over your party) */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "#070a1e", opacity: tod.tint }} />
      {tod.lantern > 0.02 && (
        <div className="pointer-events-none absolute" style={{
          left: leaderX - spacing * Math.max(0, party.length - 1) / 2 - 220, width: 440 + spacing * Math.max(0, party.length - 1),
          bottom: pathBottom - 120, height: 320, opacity: tod.lantern,
          background: "radial-gradient(closest-side, rgba(255,214,140,.38), rgba(255,190,100,.12) 60%, transparent)",
        }} />
      )}
      {tod.lantern > 0.4 && FIREFLIES.map((f, i) => (
        <span key={i} className="firefly absolute rounded-full" style={{
          left: `${f.x * 100}%`, bottom: pathBottom + 20 + f.y * (groundTop - pathBottom + 80),
          animationDelay: `${f.d}s`, animationDuration: `${f.t}s`, opacity: tod.lantern,
        }} />
      ))}

      {/* Pokémon hanging around (title screen) */}
      {wanderers.map((w) => (
        <div key={w.id} className="absolute -translate-x-1/2" style={{ left: w.left, bottom: w.lane === "path" ? pathBottom + 6 : fieldBottom(0.35) }}>
          <div className="absolute bottom-0 left-1/2 h-2 w-12 -translate-x-1/2 rounded-[50%] bg-black/25" />
          <PmdSprite id={w.id} facing={w.facing} scale={w.scale ?? S} height={90} />
        </div>
      ))}

      {/* your party walks the path, leader in front */}
      {party.map((id, i) => (
        <div key={`${id}-${i}`} className="pop-in absolute" style={{ left: leaderX - i * spacing, bottom: pathBottom + 6, transform: "translateX(-50%)", zIndex: 10 - i }}>
          <div className="absolute bottom-0 left-1/2 h-2 w-12 -translate-x-1/2 rounded-[50%] bg-black/25" />
          <PmdSprite id={id} anim={walking ? "Walk" : "Idle"} facing="right" scale={S} height={90} />
        </div>
      ))}

      {/* the patch of tall grass ahead, where the encounter happens */}
      <div className="absolute z-20 -translate-x-1/2 transition-opacity duration-300" style={{ left: box.w * 0.74, bottom: pathBottom - 4 * S, opacity: walking || encounter === "gone" ? 0 : 1 }}>
        {encounter === "reveal" && pokemonId && (
          <div key={encounterKey} className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 8 * S }}>
            <div className="emerge flex items-end justify-center"><PmdSprite id={pokemonId} intro="Hop" anim="Idle" scale={S + 1} height={150} /></div>
            {tier === "shiny" && SPARKLES.map((s, i) => <span key={i} className="sparkle" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />)}
          </div>
        )}
        {encounter === "miss" && (
          <div key={encounterKey} className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 8 * S }}><div className="puff"><PixelArt art={PUFF} scale={S * 3} /></div></div>
        )}
        <div className={`tuft relative ${encounter === "rustle" ? "rustle" : ""}`} style={{
          width: 24 * S * 3, height: 20 * S, backgroundImage: biomeLayers(bi).grass.url,
          backgroundSize: `${24 * S}px ${20 * S}px`, backgroundRepeat: "repeat-x",
        }} />
      </div>

      {hud && (
        <div className="absolute inset-x-0 z-30 flex justify-center" style={{ top: readoutTop }}>
          <span className="chip h-9 gap-2 bg-navy/85 px-4 text-[15px] tabular-nums shadow-[0_3px_0_rgba(0,0,0,.3)]">
            📍 {BIOMES[bi].name} <span className="text-gold">{Math.round(shown).toLocaleString()} m</span>
          </span>
        </div>
      )}

      {banner && (
        <div key={banner.key} className="pointer-events-none absolute inset-x-0 z-30 flex justify-center" style={{ bottom: groundTop + skyH * 0.35 }}>
          <div className="rise rounded-2xl bg-navy/92 px-7 py-3 text-center shadow-[0_5px_0_rgba(0,0,0,.35)] ring-2 ring-gold/70">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-gold">Now entering</p>
            <p className="font-display text-3xl font-black sm:text-4xl">{banner.name}</p>
          </div>
        </div>
      )}
      {encounter === "reveal" && <div key={`f-${encounterKey}`} className={`screen-flash ${tier === "shiny" ? "gold" : ""}`} />}
    </div>
  );
}

// A slim bar showing every biome and how far you got.
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
