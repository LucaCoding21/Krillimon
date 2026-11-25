"use client";

// The dig: a vertical cross-section of the world. The surface (sky and meadow) is at
// 0 m; below it a shaft runs down through nine layers of rock, getting darker and
// stranger as you go. A camera (in metres) decides which part is on screen. It can be
// moved every frame through `ref.setCamera` without re-rendering anything.
import { useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { rngFrom } from "@/lib/game";
import {
  GLOWING, HANGING, MAX_METERS, STRATA, SURFACE, cloudArt, darknessAt, propArt, stratumIndexAt, strataLayers, sunArt,
  surfaceCrust, surfaceLayers, type PropKind,
} from "./art";
import { PixelArt } from "./pixel";

export { MAX_METERS, STRATA, stratumIndexAt };
export const stratumAt = (m: number) => STRATA[stratumIndexAt(m)];

// One colour per layer, for gauges and maps.
export const STRATUM_COLORS = ["#4fa85c", "#93603a", "#5f9a3e", "#4fc8f0", "#6c63a6", "#ff6a2a", "#c9b78e", "#a497ff", "#f06bff"];

/* ───────────────────────── layout ───────────────────────── */

export type Geo = {
  w: number; h: number; narrow: boolean; title: boolean;
  avail: number;      // px between the HUD and the floor's front edge
  S: number;          // pixel-art scale
  anchorY: number;    // screen y of the front edge of the floor you stand on
  T: number;          // how deep the floor looks (px above its front edge)
  roomH: number;      // height of a floor's stadium room (from its front edge up)
  PX: number;         // px per metre of depth
  F: number;          // thickness of a rock crust (px)
  side: number;       // side wall tile width (px)
  enemy: { x: number; y: number }; // pads; y is px above the floor's front edge
  player: { x: number; y: number };
};

export function geometry(w: number, h: number, opts: { bottom?: number; top?: number; title?: boolean } = {}): Geo {
  const narrow = w < 640;
  const title = !!opts.title;
  const S = narrow ? 2 : 3;
  const anchorY = h - (opts.bottom ?? 0);
  const avail = Math.max(220, anchorY - (opts.top ?? 0));
  const T = Math.round(avail * (title ? 0.5 : 0.54));
  const F = 12 * S;
  // Each floor is a stadium room that fills the screen above it while you play.
  const roomH = anchorY + 8;
  return {
    w, h, narrow, title, avail, S, anchorY, T, roomH, F,
    // A Common catch (100 m) must always fall clear of the room you were standing in.
    PX: Math.max(3.2, (roomH + F + 40) / 100),
    side: 20 * (narrow ? 1.6 : S),
    enemy: { x: w * (title ? 0.8 : narrow ? 0.7 : 0.66), y: avail * (title ? 0.36 : narrow ? 0.42 : 0.4) },
    player: { x: w * (title ? 0.6 : narrow ? 0.27 : 0.3), y: avail * (title ? 0.1 : narrow ? 0.09 : 0.08) },
  };
}

/* ───────────────────────── props along the shaft ───────────────────────── */

const PROP_STEP = 80; // metres between props
type Placed = { k: number; d: number; kind: PropKind; i: number; left: boolean; nudge: number };

function propsIn(from: number, to: number, holes: [number, number][]): Placed[] {
  const out: Placed[] = [];
  for (let k = Math.max(1, Math.floor(from / PROP_STEP)); k <= Math.ceil(to / PROP_STEP); k++) {
    const rng = rngFrom(`prop${k}`);
    const d = k * PROP_STEP + rng() * 40;
    if (d > MAX_METERS + 400) break;
    if (holes.some(([a, b]) => d > a - 30 && d < b + 30)) continue; // nothing hangs inside a room
    const i = stratumIndexAt(d);
    const list = STRATA[i].props;
    out.push({ k, d, i, kind: list[Math.floor(rng() * list.length)], left: rng() < 0.5, nudge: rng() });
  }
  return out;
}

function Prop({ p, geo }: { p: Placed; geo: Geo }) {
  const art = propArt(p.kind, p.i);
  const S = geo.S;
  const aw = art.grid[0].length * S, ah = art.grid.length * S;
  const y = p.d * geo.PX;
  const x = p.left ? geo.side * 0.55 + p.nudge * geo.w * 0.08 : geo.w - geo.side * 0.55 - aw - p.nudge * geo.w * 0.08;
  const hang = HANGING[p.kind];
  const crust = strataLayers(p.i).crust;
  const ledgeW = aw + 18 * S;
  return (
    <div className="absolute" style={{ left: x, top: hang ? y : y - ah, width: aw, height: ah }}>
      {/* a little outcrop to hang from or stand on */}
      <div className="absolute" style={{
        left: p.left ? -geo.side : -9 * S, width: ledgeW + (p.left ? geo.side - 9 * S : geo.side), height: 6 * S,
        top: hang ? -5 * S : ah - S, backgroundImage: crust.url, backgroundSize: `${crust.w * S}px ${crust.h * S}px`,
        backgroundRepeat: "repeat-x", transform: p.left ? undefined : "scaleX(-1)",
      }} />
      <PixelArt art={art} scale={S} className="relative" />
    </div>
  );
}

/* ───────────────────────── world ───────────────────────── */

export type WorldHandle = { setCamera: (m: number) => void };

const MOTES = (() => {
  const rng = rngFrom("motes");
  return Array.from({ length: 18 }, () => ({ x: rng() * 100, y: rng() * 100, s: rng() < 0.3 ? 4 : 3, d: 7 + rng() * 8, delay: -rng() * 15 }));
})();

export function World({ geo, camera, span, rooms, back, under, over, ref }: {
  geo: Geo;
  camera: number;            // metres; moved per frame through ref.setCamera
  span: [number, number];    // depth range (m) worth drawing
  rooms?: number[];          // depths of the floors whose stadium rooms are carved out of the shaft
  back?: ReactNode;          // world-anchored stadium rooms, drawn over the shaft walls
  under?: ReactNode;         // world-anchored content drawn under the darkness (floors, ledges)
  over?: ReactNode;          // world-anchored content drawn over it (labels, the falling ball)
  ref?: Ref<WorldHandle>;
}) {
  const backRef = useRef<HTMLDivElement>(null);
  const backEls = useRef<(HTMLDivElement | null)[]>([]);
  const underRef = useRef<HTMLDivElement>(null);
  const overRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  const motesRef = useRef<HTMLDivElement>(null);
  const lastStratum = useRef(-1);
  const roomsRef = useRef<number[]>([]);
  useLayoutEffect(() => { roomsRef.current = rooms ?? []; });
  const { w, h, S, PX, T, F, anchorY, side } = geo;

  const apply = useCallback((m: number) => {
    const y0 = anchorY - m * PX; // screen y of the surface line
    const t = `translate3d(0, ${y0}px, 0)`;
    if (underRef.current) underRef.current.style.transform = t;
    if (overRef.current) overRef.current.style.transform = t;
    if (backRef.current) backRef.current.style.clipPath = `inset(${Math.max(0, y0 + F)}px 0 0 0)`;

    // the layer you're in (just above your floor) decides the colours and the light
    const c = m - 12;
    const i = stratumIndexAt(c);
    const weights = STRATA.map(() => 0);
    const fade = 90;
    const intoThis = c - STRATA[i].from, toNext = STRATA[i + 1] ? STRATA[i + 1].from - c : Infinity;
    if (i > 0 && intoThis < fade) { weights[i] = 0.5 + intoThis / (2 * fade); weights[i - 1] = 1 - weights[i]; }
    else if (toNext < fade) { weights[i] = 0.5 + toNext / (2 * fade); weights[i + 1] = 1 - weights[i]; }
    else weights[i] = 1;
    backEls.current.forEach((el, j) => {
      if (!el) return;
      el.style.opacity = String(weights[j]);
      el.style.visibility = weights[j] > 0 ? "visible" : "hidden";
      if (weights[j] > 0) el.style.backgroundPositionY = `${y0 * 0.6}px`;
    });
    // The dark belongs to the shaft: it lifts as the camera settles into a stadium.
    const nearRoom = roomsRef.current.reduce((best, d) => Math.min(best, Math.abs(m - d)), Infinity);
    const inShaft = Math.min(1, (nearRoom * PX) / (h * 0.5));
    if (darkRef.current) darkRef.current.style.opacity = String(darknessAt(c) * inShaft);
    if (motesRef.current && lastStratum.current !== i) {
      lastStratum.current = i;
      const glow = STRATA[i].glow;
      motesRef.current.style.opacity = glow && c > 40 ? "1" : "0";
      if (glow) motesRef.current.style.setProperty("--mote", glow);
    }
  }, [anchorY, PX, F, h]);

  useImperativeHandle(ref, () => ({ setCamera: apply }), [apply]);
  useLayoutEffect(() => { apply(camera); }, [apply, camera]);

  const [from, to] = span;
  const roomKey = (rooms ?? []).join(",");
  const props = useMemo(() => {
    const holes = roomKey ? roomKey.split(",").map((d): [number, number] => [Number(d) - geo.roomH / PX, Number(d)]) : [];
    return propsIn(Math.max(0, from), to, holes);
  }, [from, to, roomKey, geo.roomH, PX]);
  const surface = surfaceLayers();
  const crust0 = surfaceCrust();
  const skyH = h + T + 160;
  const tile = (l: { url: string; w: number; h: number }, repeat = "repeat-x", k = S): CSSProperties => ({
    backgroundImage: l.url, backgroundRepeat: repeat, backgroundSize: `${l.w * k}px ${l.h * k}px`,
  });
  const strataShown = STRATA.map((s, i) => ({ s, i, end: STRATA[i + 1]?.from ?? MAX_METERS + 2000 }))
    .filter(({ s, end }) => end >= from - 50 && s.from <= to + 50);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#070812]">
      {/* the back wall of the shaft (parallax) */}
      <div ref={backRef} className="absolute inset-0">
        {STRATA.map((s, i) => {
          const L = strataLayers(i);
          return <div key={s.name} ref={(el) => { backEls.current[i] = el; }} className="absolute inset-0"
            style={{ ...tile(L.wall, "repeat"), backgroundColor: s.rock, opacity: 0, visibility: "hidden" }} />;
        })}
        {/* the shaft is darker towards the walls */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(0,0,0,.35), transparent 22%, transparent 78%, rgba(0,0,0,.35))" }} />
      </div>

      {/* world-anchored things under the darkness: sky, side walls, props, floors */}
      <div ref={underRef} className="absolute left-0 top-0 h-0 w-full will-change-transform">
        <div className="absolute inset-x-0" style={{ top: -skyH, height: skyH, background: `linear-gradient(${SURFACE.sky[0]}, ${SURFACE.sky[1]} 55%, ${SURFACE.sky[2]})` }}>
          <div className="absolute" style={{ left: "58%", bottom: T + Math.min(h * 0.42, 330) }}>
            <div className="rounded-full" style={{ boxShadow: "0 0 70px 30px #ffe9a066" }}>
              <PixelArt art={sunArt("#fff6b0", "#ffd23f", "#ffe9a0")} scale={S} />
            </div>
          </div>
          <div className="cloud" style={{ bottom: T + h * 0.55, animationDuration: "70s", animationDelay: "-30s" }}><PixelArt art={cloudArt} scale={S} /></div>
          <div className="cloud" style={{ bottom: T + h * 0.44, animationDuration: "95s", animationDelay: "-70s" }}><PixelArt art={cloudArt} scale={Math.max(1, S - 1)} /></div>
          <div className="cloud" style={{ bottom: T + h * 0.5, animationDuration: "130s", animationDelay: "-12s" }}><PixelArt art={cloudArt} scale={S + 1} /></div>
          <div className="absolute inset-x-0" style={{ bottom: T + 20, height: surface.mountains.h * S, ...tile(surface.mountains), backgroundPositionX: w * 0.13 }} />
          <div className="absolute inset-x-0" style={{ bottom: T - 6, height: surface.treeline.h * S, ...tile(surface.treeline), backgroundPositionX: w * 0.13 }} />
        </div>
        {/* the meadow, and the cut face of the soil beneath it */}
        <div className="absolute inset-x-0" style={{ top: -T, height: T, ...tile(surface.ground, "repeat") }}>
          <div className="absolute inset-0" style={{ background: "linear-gradient(rgba(0,0,0,.12), transparent 30%, transparent 70%, rgba(0,0,0,.18))" }} />
        </div>

        {props.map((p) => <Prop key={p.k} p={p} geo={geo} />)}

        {/* side walls, one band per layer */}
        {strataShown.map(({ s, i, end }) => {
          const L = strataLayers(i);
          const top = Math.max(0, s.from * PX), bottom = end * PX;
          const st: CSSProperties = { top, height: bottom - top, width: side, ...tile(L.side, "repeat-y", side / L.side.w), backgroundPositionY: -top };
          return (
            <div key={s.name}>
              <div className="absolute left-0" style={st} />
              <div className="absolute right-0" style={{ ...st, transform: "scaleX(-1)" }} />
            </div>
          );
        })}
        <div className="absolute inset-x-0" style={{ top: 0, height: F, ...tile(crust0) }} />
        {back}
        {under}
      </div>

      <div ref={darkRef} className="pointer-events-none absolute inset-0" style={{ opacity: 0, background: "radial-gradient(ellipse 85% 80% at 50% 50%, rgba(5,6,16,.12) 28%, rgba(5,6,16,.97) 100%)" }} />

      {/* drifting specks of light in the glowing layers */}
      <div ref={motesRef} className="pointer-events-none absolute inset-0 transition-opacity duration-700" style={{ opacity: 0 }}>
        {MOTES.map((p, i) => (
          <span key={i} className="mote absolute" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, animationDuration: `${p.d}s`, animationDelay: `${p.delay}s` }} />
        ))}
      </div>

      {/* world-anchored things over the darkness: glows, labels, the ball */}
      <div ref={overRef} className="pointer-events-none absolute left-0 top-0 h-0 w-full will-change-transform">
        {props.filter((p) => GLOWING[p.kind] && STRATA[p.i].glow).map((p) => {
          const art = propArt(p.kind, p.i);
          const aw = art.grid[0].length * S, ah = art.grid.length * S;
          const x = p.left ? geo.side * 0.55 + p.nudge * w * 0.08 : w - geo.side * 0.55 - aw - p.nudge * w * 0.08;
          const y = HANGING[p.kind] ? p.d * PX + ah / 2 : p.d * PX - ah / 2;
          return <div key={p.k} className="glow absolute rounded-full" style={{ left: x + aw / 2 - 70, top: y - 70, width: 140, height: 140, background: `radial-gradient(closest-side, ${STRATA[p.i].glow}55, transparent)` }} />;
        })}
        {props.filter((p) => p.i === 4 && p.nudge > 0.45).map((p) => (
          // eyes in the dark (Echo Caverns)
          <div key={`eyes${p.k}`} className="eyes absolute flex gap-[6px]" style={{ left: p.left ? w * 0.18 + p.nudge * 40 : w * 0.72 - p.nudge * 40, top: p.d * PX - 120, animationDelay: `${p.nudge * 4}s` }}>
            <span className="h-[5px] w-[7px] rounded-full bg-[#ffd84a] shadow-[0_0_8px_2px_#ffd84a]" />
            <span className="h-[5px] w-[7px] rounded-full bg-[#ffd84a] shadow-[0_0_8px_2px_#ffd84a]" />
          </div>
        ))}
        {over}
      </div>
    </div>
  );
}

/* ───────────────────────── stadiums ───────────────────────── */

const STADIUM_W = 753, STADIUM_H = 500;

/** Which stadium a floor at depth `D` gets: its layer's backgrounds, picked by depth. */
export function stadiumFor(D: number) {
  const i = stratumIndexAt(D);
  const list = STRATA[i].stadiums;
  const k = D <= 0 ? 0 : Math.floor(rngFrom(`room${Math.round(D)}`)() * list.length);
  return { src: `/stadium/${list[k]}.png`, grade: STRATA[i].grade, i };
}

/**
 * A battle background with its ground at the bottom. Like a Showdown battle it shows most
 * of the scene (sky or cave roof down to the ground) instead of zooming in until it covers a
 * wide screen; any extra width is filled with mirrored copies, which meet without a seam.
 */
export function StadiumBg({ D, w, h, visible = h, className, style }: {
  D: number; w: number; h: number; visible?: number; className?: string; style?: CSSProperties;
}) {
  const st = stadiumFor(D);
  // About 92% of the picture's height fits in the `visible` part of the box (the box may run
  // a little past the top of the screen); on tall, narrow screens it covers the height instead.
  const s = Math.max(h / STADIUM_H, Math.min(w / STADIUM_W, visible / (STADIUM_H * 0.92)));
  const iw = Math.ceil(STADIUM_W * s), ih = Math.ceil(STADIUM_H * s);
  const left = Math.round((w - iw) / 2);
  const n = left > 0 ? Math.ceil(left / iw) : 0;
  return (
    <div className={`overflow-hidden ${className ?? ""}`} style={{ filter: st.grade || undefined, ...style }}>
      {Array.from({ length: n * 2 + 1 }, (_, j) => j - n).map((k) => (
        <div key={k} className="absolute bottom-0" style={{
          left: left + k * iw, width: iw + 1, height: ih,
          backgroundImage: `url(${st.src})`, backgroundSize: "100% 100%", imageRendering: "pixelated",
          transform: k % 2 ? "scaleX(-1)" : undefined,
        }} />
      ))}
    </div>
  );
}

/* ───────────────────────── gauges ───────────────────────── */

/** Vertical depth gauge. Pass `markerRef` to move the marker every frame. */
export function DepthGauge({ meters, markerRef }: { meters: number; markerRef?: Ref<HTMLDivElement> }) {
  const pct = Math.min(100, (meters / MAX_METERS) * 100);
  return (
    <div className="relative h-full w-3">
      <div className="absolute inset-0 overflow-hidden rounded-full ring-2 ring-white/20">
        {STRATA.map((s, i) => {
          const end = STRATA[i + 1]?.from ?? MAX_METERS;
          return <div key={s.name} className="absolute inset-x-0" style={{ top: `${(s.from / MAX_METERS) * 100}%`, height: `${((end - s.from) / MAX_METERS) * 100}%`, background: STRATUM_COLORS[i] }} />;
        })}
      </div>
      <div ref={markerRef} className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: `${pct}%` }}>
        <div className="h-4 w-4 rounded-full border-[3px] border-navy bg-gold shadow-[0_0_10px_#ffc93c]" />
      </div>
    </div>
  );
}

/** Horizontal map of the layers, with each catch's share of the dig marked on it. */
export function JourneyMap({ meters, segments = [] }: { meters: number; segments?: { meters: number; color: string }[] }) {
  const pct = Math.min(100, (meters / MAX_METERS) * 100);
  const starts = segments.map((_, i) => segments.slice(0, i).reduce((sum, s) => sum + s.meters, 0));
  return (
    <div>
      <div className="relative h-6 overflow-hidden rounded-full ring-2 ring-white/15">
        <div className="absolute inset-0 flex">
          {STRATA.map((s, i) => {
            const end = STRATA[i + 1]?.from ?? MAX_METERS;
            return <div key={s.name} title={s.name} style={{ flex: end - s.from, background: STRATUM_COLORS[i] }} className="border-r border-black/30 opacity-45 last:border-0" />;
          })}
        </div>
        {segments.map((s, i) => {
          const left = (starts[i] / MAX_METERS) * 100;
          return <div key={i} className="absolute inset-y-1 rounded-sm" style={{ left: `${left}%`, width: `calc(${(s.meters / MAX_METERS) * 100}% - 2px)`, background: s.color }} />;
        })}
        <div className="absolute inset-y-0 w-1 bg-gold shadow-[0_0_8px_#ffc93c]" style={{ left: `calc(${pct}% - 2px)` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-extrabold text-muted">
        <span>Surface</span><span>The Rift · {MAX_METERS.toLocaleString()} m</span>
      </div>
    </div>
  );
}
