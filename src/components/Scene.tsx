"use client";

// One encounter in the dig. Every floor is a stadium room carved into the shaft: your
// partner on the near pad, something hiding in the grass on the far pad. Name a Pokémon
// and it pops out; one Poké Ball catches it; then the floor gives way and the ball drops
// down the shaft. Under you are six rock ledges, one per tier (Common at +100 m … Shiny at
// +1,000 m). The ball smashes through every ledge your answer beats, upgrading to a better
// ball each time, and crashes into a new room on the ledge of its tier. Nothing tells you
// the tier before that: the fall *is* the reveal.
import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref, type RefObject } from "react";
import { METERS_PER_POINT, TIERS, formatMeters, rngFrom, type TierId } from "@/lib/game";
import { sfx } from "@/lib/sfx";
import { MAX_METERS, grassClumps, padArt, strataLayers } from "./art";
import { PUFF, PixelArt, TypeChip } from "./pixel";
import { BALLS, BALL_FOR_TIER, BallIcon, Sprite, type BallId } from "./sprites";
import { DepthGauge, STRATA, StadiumBg, World, geometry, stratumAt, stratumIndexAt, type Geo, type WorldHandle } from "./World";

export type Mon = { id: number; name: string; types?: string[]; shiny?: boolean };
export type Outcome =
  | { kind: "catch"; mon: Mon; tier: TierId; target: number } // target = depth (m) after this catch
  | { kind: "miss" };
export type SceneHandle = { skip: () => void };

type Phase = "idle" | "reveal" | "throw" | "absorb" | "snap" | "drop" | "landed" | "fled";
export const LEDGES: TierId[] = ["common", "meme", "uncommon", "rare", "ultra", "shiny"];
const BEFORE_DROP: Phase[] = ["reveal", "throw", "absorb", "snap"];

// The fall, in metres so it feels the same on every screen size.
const GRAVITY = 600;   // m/s²
const MAX_SPEED = 440; // m/s
const LANDING_SHAKE = [2, 3, 5, 8, 10, 14];

const BURST = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  return { bx: Math.cos(a) * 70, by: Math.sin(a) * 70 };
});
const SPARKLES = [
  { left: "6%", top: "10%", delay: "0s" }, { left: "84%", top: "2%", delay: ".3s" },
  { left: "92%", top: "48%", delay: ".6s" }, { left: "-4%", top: "56%", delay: ".15s" }, { left: "44%", top: "-8%", delay: ".45s" },
];

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function shake(el: HTMLElement | null, a: number, ms: number) {
  if (!el || reducedMotion()) return;
  el.animate([
    { transform: "translate(0, 0)" }, { transform: `translate(${-a}px, ${a * 0.6}px)` }, { transform: `translate(${a * 0.8}px, ${-a * 0.5}px)` },
    { transform: `translate(${-a * 0.4}px, ${a * 0.3}px)` }, { transform: "translate(0, 0)" },
  ], { duration: ms, easing: "ease-out" });
}
// A short-lived particle, added straight to the DOM (no re-render).
function spawn(parent: HTMLElement | null, cls: string, x: number, y: number, vars: Record<string, string>, color: string) {
  if (!parent || reducedMotion() || parent.childElementCount > 60) return;
  const el = document.createElement("span");
  el.className = cls;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.background = color;
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.addEventListener("animationend", () => el.remove());
  parent.appendChild(el);
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (p: number) => p * p * (3 - 2 * p);
const ledgeDepth = (floor: number, t: TierId) => floor + TIERS[t].score * METERS_PER_POINT;
const nextBall = (i: number) => BALL_FOR_TIER[LEDGES[Math.min(i + 1, LEDGES.length - 1)]];

// Pads, sprites and the throw, relative to a floor's front edge.
function layoutOf(g: Geo) {
  const S = g.S;
  const padE = { w: 64 * S, h: 20 * S }, padP = { w: 64 * (S + 1), h: 20 * (S + 1) };
  const enemyFeet = g.enemy.y + padE.h * 0.1, playerFeet = g.player.y + padP.h * 0.1;
  const bs = g.narrow ? 46 : 68; // ball size (the item art has padding)
  return {
    S, padE, padP, enemyFeet, playerFeet, bs,
    fall: Math.round(bs * 1.2), // the ball is a little bigger while it falls
    enemyScale: g.narrow ? 1.7 : 2.3, playerScale: g.narrow ? 2.1 : 2.9,
    throwFrom: { x: g.player.x + (g.narrow ? 26 : 44), y: playerFeet + (g.narrow ? 120 : 190) },
    impact: { x: g.enemy.x, y: enemyFeet + (g.narrow ? 70 : 100) },
    rest: { x: g.enemy.x, y: enemyFeet - 4 },
  };
}
type Lay = ReturnType<typeof layoutOf>;

/* ───────────────────────── the grass ───────────────────────── */

type Grass = "none" | "idle" | "urgent" | "burst" | "fled";

// Five clumps: two behind, three in front, with a pair of eyes peeking out between them.
const CLUMPS = [
  { x: -18, y: 5, back: true }, { x: 2, y: 6, back: true },
  { x: -27, y: 0 }, { x: -9, y: -1 }, { x: 9, y: 0 },
];
const LEAVES = [{ lx: "-34px", ly: "-46px", lr: "-200deg" }, { lx: "30px", ly: "-58px", lr: "240deg" }, { lx: "-6px", ly: "-70px", lr: "160deg" }];

function GrassPatch({ i, S, mode, clumpRefs, leafRef }: {
  i: number; S: number; mode: Grass; clumpRefs: RefObject<(HTMLDivElement | null)[]>; leafRef: RefObject<HTMLDivElement | null>;
}) {
  const arts = grassClumps(i);
  const g = STRATA[i].grass;
  const glow = STRATA[i].glow;
  return (
    <div className={`patch ${mode}`}>
      {CLUMPS.map((c, k) => (
        <div key={k} className={`clump absolute ${c.back ? "back" : ""}`}
          style={{ left: c.x * S, bottom: c.y * S, zIndex: c.back ? 0 : 2, "--k": k, "--dir": c.x < -5 ? -1 : 1 } as CSSProperties}>
          <div ref={(el) => { clumpRefs.current[k] = el; }} className="clump-inner">
            <div className="clump-sway"><PixelArt art={arts[k % arts.length]} scale={S} /></div>
          </div>
        </div>
      ))}
      {(mode === "idle" || mode === "urgent") && (
        <div className="peek absolute flex" style={{ left: -6 * S, bottom: 9 * S, gap: 3 * S, zIndex: 1 }}>
          {[0, 1].map((e) => (
            <span key={e} className="eye relative block rounded-full bg-white" style={{ width: 3.5 * S, height: 4 * S, boxShadow: glow ? `0 0 ${3 * S}px ${glow}` : "0 0 0 1px rgba(0,0,0,.5)" }}>
              <span className="absolute rounded-full bg-[#141a33]" style={{ width: 2 * S, height: 2.5 * S, left: 0.2 * S, top: 0.9 * S }} />
            </span>
          ))}
        </div>
      )}
      {mode !== "none" && mode !== "fled" && LEAVES.map((l, k) => (
        <span key={k} className="leaf absolute" style={{ left: (k - 1) * 8 * S, bottom: 10 * S, width: 2 * S, height: 2 * S, background: k % 2 ? g.l : g.m,
          "--lx": l.lx, "--ly": l.ly, "--lr": l.lr, animationDelay: `${k * 0.06}s` } as CSSProperties} />
      ))}
      <div ref={leafRef} className="absolute left-0" style={{ bottom: 10 * S }} />
    </div>
  );
}

/* ───────────────────────── a floor ───────────────────────── */

// The stadium room behind a floor (drawn behind the shaft walls).
function Room({ D, geo, fade, reveal }: { D: number; geo: Geo; fade: boolean; reveal?: { x: number } }) {
  const { PX, roomH, F, S, w } = geo;
  const L = strataLayers(stratumIndexAt(D));
  const crust: CSSProperties = { backgroundImage: L.crust.url, backgroundSize: `${L.crust.w * S}px ${L.crust.h * S}px`, backgroundRepeat: "repeat-x" };
  return (
    <div className={`absolute inset-x-0 transition-opacity duration-700 ${fade ? "opacity-0" : ""}`} style={{ top: D * PX - roomH, height: roomH + F }}>
      <div className={`absolute inset-0 ${reveal ? "room-in" : ""}`} style={reveal ? { "--ox": `${reveal.x}px`, "--oy": `${roomH}px` } as CSSProperties : undefined}>
        <StadiumBg D={D} w={w} h={roomH} className="absolute inset-x-0 top-0" style={{ height: roomH }} />
        {/* underground, a rock ceiling and the floor's cut face make the room read as a pocket in the shaft */}
        {D > 0 && (
          <>
            <div className="absolute inset-x-0 top-0" style={{ height: roomH * 0.22, background: "linear-gradient(rgba(0,0,0,.5), transparent)" }} />
            <div className="absolute inset-x-0 top-0" style={{ height: F, ...crust, transform: "scaleY(-1)" }} />
          </>
        )}
        <div className="absolute inset-x-0" style={{ top: roomH, height: F, ...crust }} />
      </div>
    </div>
  );
}

// What stands on a floor: pads, the grass, the Pokémon, the throw.
function Stage({ D, geo, lay, show, fade, partner, recall, grass, clumpRefs, leafRef, wild, stage, hole, roundKey }: {
  D: number; geo: Geo; lay: Lay; show: boolean; fade: boolean;
  partner: Mon | null; recall: boolean; grass: Grass; clumpRefs?: RefObject<(HTMLDivElement | null)[]>; leafRef?: RefObject<HTMLDivElement | null>;
  wild: Mon | null; stage: Phase; hole: boolean; roundKey: string | number;
}) {
  const { S, padE, padP, enemyFeet, playerFeet, bs, throwFrom, impact, rest } = lay;
  const { enemy, player, PX } = geo;
  const i = stratumIndexAt(D);
  const pad = padArt(i, D === 0);
  const wildOut = wild && (stage === "reveal" || stage === "throw" || stage === "absorb");

  return (
    <div className={`absolute inset-x-0 h-0 transition-opacity duration-700 ${fade ? "opacity-0" : ""}`} style={{ top: D * PX }}>
      {show && (
        <div className="materialize">
          <div className="absolute" style={{ left: enemy.x - padE.w / 2, bottom: enemy.y - padE.h / 2 }}><PixelArt art={pad} scale={S} /></div>
          <div className="absolute" style={{ left: player.x - padP.w / 2, bottom: player.y - padP.h / 2 }}><PixelArt art={pad} scale={S + 1} /></div>
        </div>
      )}

      {hole && (
        <div className="absolute" style={{ left: enemy.x - padE.w * 0.22, bottom: enemyFeet - padE.h * 0.32, width: padE.w * 0.44, height: padE.h * 0.5 }}>
          <div className="hole h-full w-full rounded-[50%]" />
        </div>
      )}

      {/* something in the grass */}
      {grass !== "none" && clumpRefs && leafRef && (
        <div key={`grass-${roundKey}`} className="absolute" style={{ left: enemy.x, bottom: enemyFeet - 3 * S }}>
          <div className="grow"><GrassPatch i={i} S={S} mode={grass} clumpRefs={clumpRefs} leafRef={leafRef} /></div>
        </div>
      )}
      {(stage === "reveal" || grass === "fled") && (
        <div key={`puff-${roundKey}-${stage}`} className="pointer-events-none absolute -translate-x-1/2" style={{ left: enemy.x, bottom: enemyFeet }}>
          <div className="puff"><PixelArt art={PUFF} scale={S * 3} /></div>
        </div>
      )}

      {/* the wild Pokémon (always in normal colours: a shiny only shows itself at the bottom) */}
      {wild && wildOut && (
        <div key={`wild-${roundKey}`} className="absolute -translate-x-1/2" style={{ left: enemy.x, bottom: enemyFeet }}>
          <div className={stage === "absorb" ? "absorb" : "emerge"}>
            <Sprite id={wild.id} name={wild.name} scale={lay.enemyScale} />
          </div>
        </div>
      )}

      {/* your partner */}
      {partner && (
        <div key={`p-${partner.id}-${partner.shiny ? "s" : ""}`} className="absolute -translate-x-1/2" style={{ left: player.x, bottom: playerFeet }}>
          <div className={recall ? "recall" : "sendout"}>
            <Sprite id={partner.id} name={partner.name} view="back" shiny={partner.shiny} scale={lay.playerScale} />
          </div>
          {!recall && <div className="flash-ring pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />}
          {!recall && partner.shiny && SPARKLES.map((s, k) => <span key={k} className="sparkle" style={{ left: s.left, top: s.top, animationDelay: s.delay }} />)}
        </div>
      )}

      {/* the throw: always a plain Poké Ball, so it gives nothing away */}
      {stage === "throw" && (
        <div key={`throw-${roundKey}`} className="pointer-events-none absolute z-30" style={{ left: throwFrom.x - bs / 2, bottom: throwFrom.y - bs / 2 }}>
          <div className="throw-x" style={{ "--dx": `${impact.x - throwFrom.x}px` } as CSSProperties}>
            <div className="throw-y" style={{ "--dy": `${-(impact.y - throwFrom.y)}px`, "--peak": `${-(impact.y - throwFrom.y) - (geo.narrow ? 80 : 115)}px` } as CSSProperties}>
              <div className="spin"><BallIcon ball="poke-ball" size={bs} /></div>
            </div>
          </div>
        </div>
      )}
      {stage === "absorb" && (
        <div key={`open-${roundKey}`} className="pointer-events-none absolute z-30" style={{ left: impact.x - bs / 2, bottom: impact.y - bs / 2 }}>
          <div className="ball-open"><BallIcon ball="poke-ball" size={bs} /></div>
          <div className="flash-ring absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85" />
        </div>
      )}
      {stage === "snap" && (
        <div key={`rest-${roundKey}`} className="pointer-events-none absolute z-30" style={{ left: rest.x - bs / 2, bottom: rest.y }}>
          <div className="ball-drop" style={{ "--drop": `${-(impact.y - rest.y)}px`, animationDuration: ".22s" } as CSSProperties}>
            <div className="wiggle" style={{ animationDuration: ".3s", animationDelay: ".2s" }}><BallIcon ball="poke-ball" size={bs} /></div>
          </div>
          {BURST.map((b, k) => (
            <span key={k} className="burst absolute left-1/2 top-1/2 h-3 w-3 bg-white" style={{
              "--bx": `${b.bx * 0.6}px`, "--by": `${b.by * 0.6}px`, animationDelay: ".2s", clipPath: "polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)",
            } as CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── debris and shouts ───────────────────────── */

type Debris = { key: string; x: number; y: number; color: string; big?: boolean };
type Shout = { key: string; x: number; y: number; text: string; color: string };

function Shards({ d }: { d: Debris }) {
  const rng = rngFrom(d.key);
  const n = d.big ? 18 : 13;
  return (
    <div className="absolute" style={{ left: d.x, top: d.y }}>
      {Array.from({ length: n }, (_, k) => {
        const a = Math.PI * (1.05 + rng() * 0.9) - (k % 2 ? Math.PI : 0) * (d.big ? 1 : 0.35);
        const dist = (d.big ? 70 : 50) + rng() * (d.big ? 120 : 80);
        const size = 4 + Math.floor(rng() * 8);
        return <span key={k} className="shard absolute" style={{
          width: size, height: size, background: k % 3 ? d.color : "#ffffff", boxShadow: `0 0 6px ${d.color}`,
          "--sx": `${Math.cos(a) * dist}px`, "--sy": `${Math.sin(a) * dist * 0.7 + 40 + rng() * 70}px`, "--r": `${(rng() - 0.5) * 540}deg`,
        } as CSSProperties} />;
      })}
      <div className="shock absolute rounded-[50%]" style={{ borderColor: d.color, width: d.big ? 260 : 170, height: d.big ? 70 : 46 }} />
      {d.big && <div className="flash-ring absolute h-40 w-40 rounded-full" style={{ left: 0, top: 0, background: `${d.color}cc` }} />}
    </div>
  );
}

/* ───────────────────────── the scene ───────────────────────── */

type Props = {
  floor: number;               // depth (m) of the floor you're standing on
  partner: Mon | null;
  outcome: Outcome | null;     // what happened this round (null while answering)
  roundKey: string | number;
  pending?: boolean;           // answer sent, waiting for the server
  typing?: number;             // bumps on every keystroke
  urgent?: boolean;            // last seconds on the clock
  layout?: "battle" | "title";
  bottom?: number;             // px covered by the docked panel
  top?: number;                // px reserved for the HUD
  hud?: boolean;               // show the depth readout and gauge
  onSettled?: () => void;      // the result is ready to show
  ref?: Ref<SceneHandle>;
};

function phaseFor(o: Outcome | null): Phase {
  return !o ? "idle" : o.kind === "miss" ? "fled" : "reveal";
}

function SceneImpl({ floor, partner, outcome, roundKey, pending, typing = 0, urgent, layout = "battle", bottom = 0, top = 0, hud, onSettled, ref }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldHandle>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const streakRef = useRef<HTMLDivElement>(null);
  const ghostRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sparkRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const clumpRefs = useRef<(HTMLDivElement | null)[]>([]);
  const leafRef = useRef<HTMLDivElement>(null);
  const depthEl = useRef<HTMLSpanElement>(null);
  const nameEl = useRef<HTMLSpanElement>(null);
  const markerEl = useRef<HTMLDivElement>(null);
  const skipRef = useRef(false);
  const settledRef = useRef(false);
  const onSettledRef = useRef(onSettled);
  useEffect(() => { onSettledRef.current = onSettled; });

  // measure ourselves
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
  const title = layout === "title";
  const geo = useMemo(() => geometry(box.w, box.h, { bottom, top, title }), [box.w, box.h, bottom, top, title]);
  const lay = useMemo(() => layoutOf(geo), [geo]);

  // per-encounter state, reset whenever the outcome changes
  const fall = outcome?.kind === "catch" ? outcome : null;
  const outcomeId = `${roundKey}|${fall ? `${fall.mon.id}-${fall.tier}-${fall.target}` : outcome?.kind ?? "none"}`;
  const [seen, setSeen] = useState(outcomeId);
  const [phase, setPhase] = useState<Phase>(() => phaseFor(outcome));
  const [broken, setBroken] = useState(0);
  const [ball, setBall] = useState<BallId>("poke-ball");
  const [contact, setContact] = useState(false);
  const [mat, setMat] = useState(false);
  const [sent, setSent] = useState(false);
  const [debris, setDebris] = useState<Debris[]>([]);
  const [shouts, setShouts] = useState<Shout[]>([]);
  const [banner, setBanner] = useState<{ i: number; key: number } | null>(null);
  if (seen !== outcomeId) {
    setSeen(outcomeId);
    setPhase(phaseFor(outcome));
    setBroken(0); setBall("poke-ball"); setContact(false); setMat(false); setSent(false); setDebris([]); setShouts([]);
  }

  const fallTier = fall?.tier, fallTarget = fall?.target;
  const landIdx = fallTier ? LEDGES.indexOf(fallTier) : -1;
  const settledCam = phase === "landed" && fallTarget !== undefined ? fallTarget : floor;

  const setHud = useCallback((m: number) => {
    if (depthEl.current) depthEl.current.textContent = formatMeters(m);
    if (nameEl.current) nameEl.current.textContent = stratumAt(m).name;
    if (markerEl.current) markerEl.current.style.top = `${Math.min(100, (m / MAX_METERS) * 100)}%`;
  }, []);
  useLayoutEffect(() => { if (phase !== "drop") setHud(settledCam); }, [phase, settledCam, setHud]);

  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettledRef.current?.();
  }, []);

  // the catch: reveal → throw → absorb → snap → drop
  useEffect(() => {
    skipRef.current = false;
    settledRef.current = false;
    const kind = seen.split("|")[1];
    if (kind === "none") return;
    if (kind === "miss") { sfx.miss(); settle(); return; }
    sfx.reveal();
    const at = (ms: number, fn: () => void) => setTimeout(() => { if (!skipRef.current) fn(); }, ms);
    const timers = [
      at(260, () => { setPhase("throw"); sfx.throw(); }),
      at(700, () => { setPhase("absorb"); sfx.pop(); }),
      at(960, () => { setPhase("snap"); sfx.click(); }),
      at(1240, () => setPhase("drop")),
    ];
    return () => timers.forEach(clearTimeout);
  }, [seen, settle]);

  // the fall
  useEffect(() => {
    if (phase !== "drop" || !fallTier || fallTarget === undefined) return;
    const world = worldRef.current, el = ballRef.current;
    if (!world || !el) return;
    const PX = geo.PX, r = lay.fall / 2;
    const line = floor * PX;
    const ledgeY = LEDGES.map((t) => ledgeDepth(floor, t) * PX);
    const li = LEDGES.indexOf(fallTier);
    const startX = lay.rest.x, startY = line - lay.rest.y - lay.bs / 2;
    const endX = geo.player.x;
    const fallTop = line + geo.F + r * 0.2;
    const yEnd = ledgeY[li] - r * 0.8;
    const lead = Math.max(0, (geo.anchorY - geo.h * 0.52) / PX);
    const maxBounces = li <= 1 ? 2 : 1;
    const g = GRAVITY * PX, vmax = MAX_SPEED * PX;
    const trail: { x: number; y: number }[] = [];
    let y = startY, x = startX, v = 0, next = 0, hold = 0, sink = 0, rot = 0, bounces = 0, squash = 0, sparkT = 0, pMax = 0;
    let falling = false, touched = false, landedAt = 0, cam = floor, lastIdx = stratumIndexAt(floor), lastShown = -1, bannerAt = 0;
    let color = TIERS.common.color;
    let last = performance.now(), raf = 0;

    const breakLedge = (i: number) => {
      const nb = nextBall(i);
      color = TIERS[LEDGES[i + 1]].color;
      setBroken(i + 1);
      setBall(nb);
      setDebris((d) => [...d, { key: `crack${i}`, x, y: ledgeY[i], color: TIERS[LEDGES[i]].color }]);
      setShouts((s) => [...s, { key: `shout${i}`, x: x - r - 14, y: ledgeY[i] - 10, text: `${BALLS[nb].name}!`, color }]);
      sfx.crack(i);
      shake(rootRef.current, 4 + i * 1.6, 180);
      squash = 0.14;
    };
    const touchDown = () => {
      touched = true;
      squash = 0.18;
      setContact(true);
      setDebris((d) => [...d, { key: "land", x, y: ledgeY[li], color: TIERS[fallTier].color, big: li >= 2 }]);
      sfx.land(fallTier);
      shake(rootRef.current, LANDING_SHAKE[li], 300);
      // Landing gets the stage to itself; a new layer is announced once the callout has faded.
      const si = stratumIndexAt(fallTarget);
      const announce = si > lastIdx || bannerAt > performance.now() - 2000;
      lastIdx = Math.max(lastIdx, si);
      setBanner(null);
      // (not cleared with the loop: it must outlive the switch to "landed")
      if (announce) setTimeout(() => { setBanner({ i: si, key: performance.now() }); sfx.biome(); }, li <= 1 ? 1300 : 2000);
    };
    const quiet = () => {
      if (linesRef.current) linesRef.current.style.opacity = "0";
      if (streakRef.current) streakRef.current.style.opacity = "0";
      ghostRefs.current.forEach((gEl) => { if (gEl) gEl.style.opacity = "0"; });
    };
    const finish = () => {
      quiet();
      world.setCamera(fallTarget);
      setHud(fallTarget);
      setPhase("landed");
    };

    sfx.hole();
    sfx.recall();
    const frame = (now: number) => {
      let dt = Math.min(0.034, (now - last) / 1000);
      last = now;
      if (skipRef.current) {
        if (next < li) { setBroken(li); setBall(BALL_FOR_TIER[fallTier]); }
        x = endX;
        if (!touched) touchDown();
        el.style.opacity = "1";
        el.style.transform = `translate3d(${endX - r}px, ${yEnd - r}px, 0)`;
        finish();
        return;
      }
      if (hold > 0) { hold -= dt; dt = 0; }
      let scale = 1;
      if (!falling) {
        // sink into the hole...
        sink += dt;
        const k = Math.min(1, sink / 0.18);
        scale = 1 - 0.55 * k;
        y = startY + k * 10;
        el.style.opacity = String(1 - 0.9 * k);
        if (k >= 1) { falling = true; y = fallTop; v = 55 * PX; el.style.opacity = "1"; scale = 1; }
      } else if (!landedAt) {
        // ...and fall out of the bottom of the floor
        v = Math.min(vmax, v + g * dt);
        y += v * dt;
        if (v > 0) while (next < li && y + r * 0.8 >= ledgeY[next]) { breakLedge(next); v *= 0.42; hold = 0.08; next++; }
        if (y >= yEnd) {
          y = yEnd;
          if (!touched) touchDown();
          if (v > 60 * PX && bounces < maxBounces) { v = -v * (bounces ? 0.18 : 0.3); bounces++; squash = 0.16; }
          else { v = 0; landedAt = now; }
        }
      }
      pMax = Math.max(pMax, falling ? clamp01((y - fallTop) / Math.max(1, yEnd - fallTop)) : 0);
      const speed = clamp01(Math.abs(v) / vmax); // 0..1
      const flying = falling && !landedAt;
      const sway = flying ? Math.sin(now / 150) * (li === 0 ? 16 : 8) * (1 - pMax) : 0;
      x = startX + (endX - startX) * smooth(pMax) + sway;
      rot += (v / PX) * dt * 1.8;

      // the ball stretches with speed and squashes on every hit
      squash = Math.max(0, squash - dt);
      const sq = squash / 0.16;
      const stretch = 1 + 0.32 * speed * (flying ? 1 : 0);
      el.style.transform = `translate3d(${x - r}px, ${y - r}px, 0) scale(${(1 + 0.36 * sq) * scale / stretch}, ${stretch * (1 - 0.32 * sq) * scale})`;
      if (spinRef.current) spinRef.current.style.transform = `rotate(${rot}deg)`;

      // afterimages, a light streak and sparks behind it
      trail.push({ x, y });
      if (trail.length > 14) trail.shift();
      ghostRefs.current.forEach((gEl, k) => {
        const p = trail[trail.length - 1 - (k + 1) * 2];
        if (!gEl || !p) return;
        gEl.style.opacity = String(flying ? (0.42 - k * 0.08) * speed : 0);
        gEl.style.transform = `translate3d(${p.x - r}px, ${p.y - r}px, 0) scale(${1 - k * 0.1})`;
      });
      if (streakRef.current) {
        const len = Math.min(geo.h * 0.45, Math.abs(v) * 0.12);
        streakRef.current.style.opacity = String(flying ? speed * 0.85 : 0);
        streakRef.current.style.height = `${len}px`;
        streakRef.current.style.transform = `translate3d(${x - 6}px, ${y - r * 0.6 - len}px, 0)`;
        streakRef.current.style.background = `linear-gradient(transparent, ${color})`;
      }
      sparkT -= dt;
      if (flying && sparkT <= 0 && speed > 0.15) {
        sparkT = 0.028;
        spawn(sparkRef.current, "spark", x + (Math.random() - 0.5) * r * 1.4, y + (Math.random() - 0.5) * r,
          { "--sx": `${(Math.random() - 0.5) * 90}px`, "--sy": `${-30 - Math.random() * 70}px` }, Math.random() < 0.35 ? "#ffffff" : color);
      }
      if (linesRef.current) linesRef.current.style.opacity = String(flying ? Math.max(0, speed - 0.25) * 1.2 : 0);

      // the camera chases the ball, keeping it near the middle of the screen, and rumbles at speed
      const ballM = y / PX;
      const want = touched ? fallTarget
        : falling ? Math.min(fallTarget, Math.max(floor, ballM + Math.min(lead, Math.max(0, fallTarget - ballM) * 0.9)))
        : floor;
      // stiff enough that at top speed the ball stays on screen (lag ≈ speed / 28)
      cam += (want - cam) * (1 - Math.exp(-dt * (touched ? 10 : 28)));
      const rumble = flying && !reducedMotion() ? ((Math.random() - 0.5) * 5 * speed) / PX : 0;
      world.setCamera(cam + rumble);

      const shown = Math.round(Math.max(floor, Math.min(fallTarget, ballM)));
      if (shown !== lastShown) { lastShown = shown; setHud(shown); }
      const si = stratumIndexAt(ballM);
      if (si > lastIdx && !touched) { lastIdx = si; bannerAt = now; setBanner({ i: si, key: now }); sfx.biome(); }

      if (landedAt && (Math.abs(fallTarget - cam) < 0.3 || now - landedAt > 900)) { finish(); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); quiet(); };
  }, [phase, geo, lay, floor, fallTier, fallTarget, setHud]);

  // after landing: the new room opens up, the ball opens, your catch is your new partner
  useEffect(() => {
    if (phase !== "landed") return;
    const fast = skipRef.current;
    const shiny = fallTier === "shiny";
    const timers = [
      setTimeout(() => setMat(true), fast ? 0 : 60),
      setTimeout(() => { setSent(true); sfx.sendout(); if (shiny) sfx.sparkle(); }, fast ? 40 : 520),
      setTimeout(settle, fast ? 80 : 700),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, fallTier, settle]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2400);
    return () => clearTimeout(t);
  }, [banner]);

  // the grass reacts as you type: one clump twitches and a leaf flies off
  useEffect(() => {
    if (!typing || reducedMotion()) return;
    const k = (typing * 3) % CLUMPS.length;
    clumpRefs.current[k]?.animate([
      { transform: "skewX(0) scaleY(1)" }, { transform: `skewX(${k % 2 ? -14 : 14}deg) scaleY(1.1)` }, { transform: `skewX(${k % 2 ? 7 : -7}deg) scaleY(.96)` }, { transform: "skewX(0) scaleY(1)" },
    ], { duration: 240, easing: "ease-out" });
    const g = STRATA[stratumIndexAt(floor)].grass;
    spawn(leafRef.current, "leaf-pop", (CLUMPS[k].x + 9) * geo.S, 0,
      { "--lx": `${(Math.random() - 0.5) * 60}px`, "--ly": `${-30 - Math.random() * 40}px`, "--lr": `${(Math.random() - 0.5) * 400}deg` }, Math.random() < 0.5 ? g.l : g.m);
  }, [typing, floor, geo.S]);

  // Enter (or a click) skips to the end of the animation
  useImperativeHandle(ref, () => ({
    skip: () => {
      if (BEFORE_DROP.includes(phase)) { skipRef.current = true; setPhase("drop"); }
      else if (phase === "drop") skipRef.current = true;
      else if (phase === "landed") { skipRef.current = true; setMat(true); if (!sent) { setSent(true); sfx.sendout(); } settle(); }
    },
  }), [phase, sent, settle]);

  /* ── render ── */
  const { PX, T, F, side, narrow, w, h, S } = geo;
  const showLedges = !!fall && (phase === "drop" || phase === "landed");
  const target = fallTarget ?? floor;
  const span: [number, number] = [Math.max(0, floor - h / PX), target + (h / PX) * 1.3];
  const grass: Grass = outcome?.kind === "miss" ? "fled" : outcome ? "none" : pending ? "burst" : urgent ? "urgent" : "idle";
  const startX = lay.rest.x - lay.fall / 2, startY = floor * PX - lay.rest.y - lay.bs / 2 - lay.fall / 2;
  const depths = [floor, ...(fall && contact ? [fall.target] : [])];
  const fallColor = fallTier ? TIERS[LEDGES[Math.min(broken, LEDGES.length - 1)]].color : "#fff";

  const rooms = (
    <>
      {depths.map((D) => {
        const current = D === floor;
        if (!current && !mat) return null;
        return <Room key={D} D={D} geo={geo} fade={current && phase === "landed"} reveal={current ? undefined : { x: geo.player.x }} />;
      })}
    </>
  );

  const floors = (
    <>
      {showLedges && LEDGES.map((t, i) => {
        const d = ledgeDepth(floor, t);
        const L = strataLayers(stratumIndexAt(d));
        const color = TIERS[t].color;
        const gone = i < broken || (i === landIdx && mat) || (contact && i > landIdx);
        return (
          <div key={t} className="ledge absolute inset-x-0" style={{ top: d * PX, height: F, animationDelay: `${i * 70}ms` }}>
            <div className={`h-full transition-opacity duration-300 ${gone ? (i < broken ? "invisible" : "opacity-0") : ""}`}>
              <div className="absolute inset-0" style={{ backgroundImage: L.crust.url, backgroundSize: `${L.crust.w * S}px ${L.crust.h * S}px`, backgroundRepeat: "repeat-x" }} />
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color, boxShadow: `0 0 14px 3px ${color}` }} />
            </div>
          </div>
        );
      })}
      {depths.map((D) => {
        const current = D === floor;
        return (
          <Stage key={D} D={D} geo={geo} lay={lay} roundKey={roundKey}
            show={current || mat} fade={current && phase === "landed"}
            partner={current ? partner : sent && fall ? { ...fall.mon, shiny: fall.tier === "shiny" } : null}
            recall={current && (phase === "drop" || phase === "landed")}
            grass={current ? grass : "none"} clumpRefs={current ? clumpRefs : undefined} leafRef={current ? leafRef : undefined}
            wild={current && fall ? fall.mon : null} stage={current ? phase : "idle"}
            hole={current && (phase === "drop" || phase === "landed")} />
        );
      })}
    </>
  );

  const overlay = (
    <>
      {showLedges && LEDGES.map((t, i) => {
        const d = ledgeDepth(floor, t);
        const state = i < broken ? (mat ? "gone" : "broken") : contact && i === landIdx ? "landed" : contact ? "gone" : "";
        return (
          <div key={t} className="ledge-label absolute" style={{ right: side + 10, top: d * PX - (narrow ? 30 : 36), animationDelay: `${120 + i * 70}ms` }}>
            <div className={`ledge-tag flex items-center gap-1.5 rounded-full bg-navy/75 py-1 pl-1 pr-3 ${state}`}>
              <BallIcon ball={BALL_FOR_TIER[t]} size={narrow ? 20 : 26} />
              <span className="font-display text-[13px] font-black uppercase tracking-wider sm:text-[15px]" style={{ color: TIERS[t].color }}>{TIERS[t].name}</span>
              <span className="text-[11px] font-extrabold text-white/60 sm:text-xs">+{(TIERS[t].score * METERS_PER_POINT).toLocaleString()} m</span>
            </div>
          </div>
        );
      })}
      {showLedges && !sent && (
        <>
          <div ref={streakRef} className="absolute left-0 top-0 w-3 rounded-full blur-[2px]" style={{ opacity: 0 }} />
          {[0, 1, 2, 3, 4].map((k) => (
            <div key={k} ref={(el) => { ghostRefs.current[k] = el; }} className="absolute left-0 top-0" style={{ opacity: 0 }}>
              <BallIcon ball={ball} size={lay.fall} />
            </div>
          ))}
          <div ref={ballRef} className="absolute left-0 top-0 z-10" style={{ transform: `translate3d(${startX}px, ${startY}px, 0)` }}>
            <div ref={spinRef}>
              <div key={ball} className={ball === "poke-ball" ? "" : "upgrade"} style={{ filter: `drop-shadow(0 0 ${6 + broken * 4}px ${fallColor})` }}>
                <BallIcon ball={ball} size={lay.fall} />
              </div>
            </div>
          </div>
        </>
      )}
      <div ref={sparkRef} className="absolute left-0 top-0" />
      {debris.map((d) => <Shards key={d.key} d={d} />)}
      {shouts.map((s) => (
        <div key={s.key} className="absolute" style={{ left: s.x, top: s.y }}>
          <div className="-translate-x-full -translate-y-1/2">
            <p className="shout outlined whitespace-nowrap text-[22px] leading-none sm:text-[28px]" style={{ color: s.color }}>{s.text}</p>
          </div>
        </div>
      ))}
      {fall && contact && (
        <div className="absolute left-1/2 z-20" style={{ top: fall.target * PX - T * 0.42 }}>
          <div className="-translate-x-1/2 -translate-y-full">
            {/* the payoff grows with the tier: a Common barely registers, a Shiny fills the screen */}
            <div className="callout flex flex-col items-center text-center" style={{ animationDuration: landIdx <= 1 ? "1.5s" : "2.3s" }}>
              {landIdx >= 2 && <BallIcon ball={BALL_FOR_TIER[fall.tier]} size={(narrow ? 40 : 52) + landIdx * 4} />}
              <p className="outlined whitespace-nowrap leading-none" style={{ color: TIERS[fall.tier].color, fontSize: (narrow ? 22 : 26) + landIdx * (narrow ? 4 : 5) }}>
                {TIERS[fall.tier].name}{landIdx >= 2 ? "!" : ""}
              </p>
              <p className="outlined mt-1 leading-none text-gold" style={{ fontSize: (narrow ? 16 : 18) + landIdx * 2.4 }}>+{(TIERS[fall.tier].score * METERS_PER_POINT).toLocaleString()} m</p>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const wildShown = fall && BEFORE_DROP.includes(phase);
  const bannerStratum = banner ? STRATA[banner.i] : null;

  return (
    <div ref={rootRef} className="relative h-full w-full select-none overflow-hidden">
      <World ref={worldRef} geo={geo} camera={settledCam} span={span} rooms={depths} back={rooms} under={floors} over={overlay} />

      <div ref={linesRef} className="speedlines pointer-events-none absolute inset-0 z-10" style={{ opacity: 0 }} />
      {fall && contact && landIdx >= 3 && <div key="flash" className={`screen-flash ${fall.tier === "shiny" ? "gold" : ""}`} />}
      {urgent && !outcome && <div className="urgent pointer-events-none absolute inset-0 z-10" />}

      {/* who popped out (the matched name, no rarity) */}
      {hud && wildShown && fall && (
        <div className="absolute z-20" style={{ left: narrow ? 10 : w * 0.05, top: top + (narrow ? 4 : 12) }}>
          <div className="panel pop-in !rounded-2xl px-4 py-2.5">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted">Wild</p>
            <p className="font-display text-xl font-black leading-tight sm:text-2xl">{fall.mon.name}</p>
            {fall.mon.types && <div className="mt-1 flex gap-1">{fall.mon.types.map((t) => <TypeChip key={t} type={t} />)}</div>}
          </div>
        </div>
      )}

      {hud && (
        <>
          {/* on phones it sits in the header row, next to the sound button */}
          <div className="pointer-events-none absolute z-30" style={{ top: narrow ? 12 : 66, right: narrow ? 62 : 12 }}>
            <div className={`pill !gap-2 !pl-2 !pr-4 ${narrow ? "!h-10" : "!h-11"}`}>
              <span className="pill-icon !h-8 !w-8 text-[15px]">⛏️</span>
              <span className="flex flex-col leading-none">
                <span ref={depthEl} className="font-display text-[17px] font-black tabular-nums" />
                <span ref={nameEl} className="mt-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted" />
              </span>
            </div>
          </div>
          {!narrow && (
            <div className="pointer-events-none absolute right-4 z-20" style={{ top: top + 16, bottom: bottom + 28 }}>
              <DepthGauge meters={settledCam} markerRef={markerEl} />
            </div>
          )}
        </>
      )}

      {bannerStratum && (
        <div key={banner!.key} className="banner-in pointer-events-none absolute inset-x-0 z-30 flex justify-center" style={{ top: top + 24 }}>
          <div className="rounded-2xl bg-navy/90 px-7 py-3 text-center shadow-[0_5px_0_rgba(0,0,0,.35)] ring-2 ring-gold/70">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-gold">Now entering</p>
            <p className="font-display text-3xl font-black sm:text-4xl">{bannerStratum.name}</p>
            <p className="mt-0.5 text-sm font-bold text-muted">{bannerStratum.flavor}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export const Scene = memo(SceneImpl);
