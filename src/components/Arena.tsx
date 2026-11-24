"use client";

// The battle arena. Your partner stands on the near pad (back sprite); something
// rustles in the tall grass on the far pad. Name a Pokémon and it pops out, then
// you throw a ball that matches how rare your answer was:
//   reveal → throw (arc + spin) → absorb (flash, shrink in) → shake (drop + wobbles) → caught (click + stars)
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TIERS, type TierId } from "@/lib/game";
import { sfx } from "@/lib/sfx";
import { Backdrop, BIOMES, biomeIndexAt } from "./Backdrop";
import { biomeLayers, padArt } from "./art";
import { PUFF, PixelArt, TypeChip } from "./pixel";
import { BallIcon, RARITY_LEVEL, Sprite, type BallId } from "./sprites";

export type Stage = "waiting" | "rustle" | "reveal" | "throw" | "absorb" | "shake" | "caught" | "fled" | "empty";
export type Mon = { id: number; name: string; types?: string[] };

const BURST = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  return { bx: Math.cos(a) * 70, by: Math.sin(a) * 70 };
});
const SPARKLES = [
  { left: "6%", top: "10%", delay: "0s" }, { left: "84%", top: "2%", delay: ".3s" },
  { left: "92%", top: "48%", delay: ".6s" }, { left: "-4%", top: "56%", delay: ".15s" }, { left: "44%", top: "-8%", delay: ".45s" },
];
const PAD_W = 64;
const PAD_H = 20;

export function Arena({
  meters, partner, partnerKey, wild, tier, ball, shakes = 1, stage, roundKey,
  floor = 0, top = 0, layout = "battle", showCards = true, children,
}: {
  meters: number;
  partner: Mon | null; partnerKey?: string | number;
  wild?: Mon | null; tier?: TierId | null; ball?: BallId; shakes?: number;
  stage: Stage; roundKey?: string | number;
  /** px reserved at the bottom (docked panel) and the top (HUD) */ floor?: number; top?: number;
  layout?: "battle" | "title"; showCards?: boolean; children?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1200, h: 800 });
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // "Now entering…" when your score carries you into a new biome.
  const bi = biomeIndexAt(meters);
  const lastBi = useRef(bi);
  const [banner, setBanner] = useState<{ name: string; key: number } | null>(null);
  useEffect(() => {
    if (bi === lastBi.current) return;
    const deeper = bi > lastBi.current;
    lastBi.current = bi;
    if (!deeper) return;
    setBanner({ name: BIOMES[bi].name, key: Date.now() });
    sfx.biome();
  }, [bi]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2400);
    return () => clearTimeout(t);
  }, [banner]);

  // ── layout (px, measured from the bottom) ──
  const { w, h } = box;
  const narrow = w < 640;
  const title = layout === "title";
  const S = narrow ? 2 : 3;
  const avail = Math.max(220, h - floor - top);
  const groundTop = floor + avail * (title ? 0.5 : 0.54);
  const enemy = { x: w * (title ? 0.8 : narrow ? 0.7 : 0.66), y: floor + avail * (title ? 0.36 : narrow ? 0.42 : 0.4) };
  const player = { x: w * (title ? 0.6 : narrow ? 0.27 : 0.3), y: floor + avail * (title ? 0.1 : narrow ? 0.09 : 0.08) };
  const padE = { w: PAD_W * S, h: PAD_H * S };
  const padP = { w: PAD_W * (S + 1), h: PAD_H * (S + 1) };
  const enemyFeet = enemy.y + padE.h * 0.1;
  const playerFeet = player.y + padP.h * 0.1;
  const enemyScale = narrow ? 1.7 : 2.3;
  const playerScale = narrow ? 2.1 : 2.9;
  const bs = narrow ? 46 : 68; // ball size (the item art has padding)
  const throwFrom = { x: player.x + (narrow ? 26 : 44), y: playerFeet + (narrow ? 120 : 190) };
  const impact = { x: enemy.x, y: enemyFeet + (narrow ? 70 : 100) };
  const rest = { x: enemy.x, y: enemyFeet - 4 };

  const revealed = stage === "reveal" || stage === "throw" || stage === "absorb" || stage === "shake" || stage === "caught";
  const wildVisible = wild && (stage === "reveal" || stage === "throw" || stage === "absorb");
  const shiny = tier === "shiny";
  const grass = biomeLayers(bi).grass;

  return (
    <div ref={rootRef} className="relative h-full w-full select-none overflow-hidden">
      <Backdrop meters={meters} groundTop={groundTop} width={w} height={h} scale={S} drift={meters * 1.5} />

      {/* far pad */}
      <div className="absolute" style={{ left: enemy.x - padE.w / 2, bottom: enemy.y - padE.h / 2 }}>
        <PixelArt art={padArt(bi)} scale={S} />
      </div>
      {/* near pad */}
      <div className="absolute" style={{ left: player.x - padP.w / 2, bottom: player.y - padP.h / 2 }}>
        <PixelArt art={padArt(bi)} scale={S + 1} />
      </div>

      {/* something in the grass */}
      {(stage === "waiting" || stage === "rustle" || stage === "fled") && (
        <div className={`absolute -translate-x-1/2 transition-opacity duration-500 ${stage === "fled" ? "opacity-0" : ""}`} style={{ left: enemy.x, bottom: enemyFeet - 6 * S }}>
          <div className={`tuft ${stage === "rustle" ? "rustle" : ""}`} style={{
            width: 24 * S * 2, height: 20 * S, backgroundImage: grass.url,
            backgroundSize: `${24 * S}px ${20 * S}px`, backgroundRepeat: "repeat-x",
          }} />
        </div>
      )}
      {(stage === "reveal" || stage === "fled") && (
        <div key={`puff-${roundKey}-${stage}`} className="pointer-events-none absolute -translate-x-1/2" style={{ left: enemy.x, bottom: enemyFeet }}>
          <div className="puff"><PixelArt art={PUFF} scale={S * 3} /></div>
        </div>
      )}

      {/* the wild Pokémon */}
      {wild && wildVisible && (
        <div key={`wild-${roundKey}`} className="absolute -translate-x-1/2" style={{ left: enemy.x, bottom: enemyFeet }}>
          <div className={stage === "absorb" ? "absorb" : "emerge"}>
            <Sprite id={wild.id} name={wild.name} shiny={shiny} scale={enemyScale} />
          </div>
          {shiny && stage === "reveal" && SPARKLES.map((s, i) => <span key={i} className="sparkle" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />)}
        </div>
      )}

      {/* your partner */}
      {partner && (
        <div key={`partner-${partnerKey}`} className="absolute -translate-x-1/2" style={{ left: player.x, bottom: playerFeet }}>
          <div className="sendout"><Sprite id={partner.id} name={partner.name} view="back" scale={playerScale} /></div>
          <div className="flash-ring pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
        </div>
      )}

      {/* the throw */}
      {stage === "throw" && ball && (
        <div key={`throw-${roundKey}`} className="pointer-events-none absolute z-30" style={{ left: throwFrom.x - bs / 2, bottom: throwFrom.y - bs / 2 }}>
          <div className="throw-x" style={{ "--dx": `${impact.x - throwFrom.x}px` } as CSSProperties}>
            <div className="throw-y" style={{ "--dy": `${-(impact.y - throwFrom.y)}px`, "--peak": `${-(impact.y - throwFrom.y) - (narrow ? 80 : 115)}px` } as CSSProperties}>
              <div className="spin"><BallIcon ball={ball} size={bs} /></div>
            </div>
          </div>
        </div>
      )}
      {stage === "absorb" && ball && (
        <div key={`open-${roundKey}`} className="pointer-events-none absolute z-30" style={{ left: impact.x - bs / 2, bottom: impact.y - bs / 2 }}>
          <div className="ball-open"><BallIcon ball={ball} size={bs} /></div>
          <div className="flash-ring absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: shiny ? "rgba(255,214,90,.85)" : "rgba(255,255,255,.85)" }} />
        </div>
      )}
      {(stage === "shake" || stage === "caught") && ball && (
        <div key={`rest-${roundKey}`} className="pointer-events-none absolute z-30" style={{ left: rest.x - bs / 2, bottom: rest.y }}>
          <div className="ball-drop" style={{ "--drop": `${-(impact.y - rest.y)}px` } as CSSProperties}>
            <div className={stage === "shake" ? "wiggle" : ""} style={stage === "shake" ? { animationIterationCount: shakes, animationDelay: ".45s" } : undefined}>
              <BallIcon ball={ball} size={bs} className={stage === "caught" ? "brightness-[.8] transition" : ""} />
            </div>
          </div>
          {stage === "caught" && BURST.map((b, i) => (
            <span key={i} className="burst absolute left-1/2 top-1/2 h-3 w-3 bg-gold" style={{
              "--bx": `${b.bx}px`, "--by": `${b.by}px`, clipPath: "polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)",
            } as CSSProperties} />
          ))}
          {stage === "caught" && shiny && <div className="flash-ring absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/70" />}
        </div>
      )}

      {/* info cards */}
      {showCards && (
        <div className="absolute z-20" style={{ left: narrow ? 10 : w * 0.05, top: top + (narrow ? 6 : 14) }}>
          <WildCard wild={revealed ? wild ?? null : null} tier={revealed ? tier ?? null : null} fled={stage === "fled"} narrow={narrow} />
        </div>
      )}
      {showCards && partner && !narrow && (
        <div className="absolute z-20" style={{ right: w >= 1100 ? 196 : 64, bottom: floor + avail * 0.2 }}>
          <div className="panel !rounded-2xl px-4 py-2.5">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted">Partner</p>
            <p className="font-display text-xl font-black leading-tight">{partner.name}</p>
            {partner.types && <div className="mt-1 flex gap-1">{partner.types.map((t) => <TypeChip key={t} type={t} />)}</div>}
          </div>
        </div>
      )}

      {(stage === "reveal" || stage === "absorb") && <div key={`flash-${roundKey}-${stage}`} className={`screen-flash ${shiny ? "gold" : ""}`} />}

      {banner && (
        <div key={banner.key} className="pointer-events-none absolute inset-x-0 z-30 flex justify-center" style={{ top: top + avail * 0.2 }}>
          <div className="rise rounded-2xl bg-navy/92 px-7 py-3 text-center shadow-[0_5px_0_rgba(0,0,0,.35)] ring-2 ring-gold/70">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-gold">Now entering</p>
            <p className="font-display text-3xl font-black sm:text-4xl">{banner.name}</p>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

function WildCard({ wild, tier, fled, narrow }: { wild: Mon | null; tier: TierId | null; fled: boolean; narrow: boolean }) {
  const level = tier ? RARITY_LEVEL[tier] : 0;
  const color = tier ? TIERS[tier].color : "#56609a";
  return (
    <div className={`panel !rounded-2xl ${narrow ? "min-w-[170px] px-3 py-2" : "min-w-[250px] px-4 py-3"}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted">{fled ? "Got away" : "Wild"}</p>
      <p key={wild?.id ?? "unknown"} className={`font-display font-black leading-tight ${narrow ? "text-lg" : "text-2xl"} ${wild ? "pop-in" : "text-white/50"}`}>
        {wild ? wild.name : "???"}
      </p>
      {wild?.types && <div className="mt-1 flex gap-1">{wild.types.map((t) => <TypeChip key={t} type={t} />)}</div>}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">Rarity</span>
        <div className="flex flex-1 gap-[3px]">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="h-2.5 flex-1 rounded-sm transition-colors duration-300"
              style={{ background: i < level ? color : "rgba(255,255,255,.1)", transitionDelay: `${300 + i * 140}ms`, boxShadow: i < level && tier === "shiny" ? "0 0 8px #ffc93c" : undefined }} />
          ))}
        </div>
      </div>
      {tier && <p className="mt-1 text-[12px] font-black" style={{ color }}>{TIERS[tier].name}</p>}
    </div>
  );
}
