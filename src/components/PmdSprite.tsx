"use client";

// Animated Pokémon sprites from the PMD Sprite Repository
// (https://github.com/PMDCollab/SpriteCollab, CC BY-NC 4.0, credit to its artists).
// Each Pokémon has <Anim>-Anim.png sheets: columns are frames, rows are the 8
// facing directions, and AnimData.xml gives frame size and per-frame durations
// (in 1/60 s ticks). We draw the frames onto a canvas with smoothing off.
import { useEffect, useRef, useState } from "react";

/* eslint-disable @next/next/no-img-element */

const BASE = "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite";

// Static fallback when a Pokémon has no PMD sprite yet.
export const spriteUrl = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
const TICK_MS = 1000 / 60;

export const DIRECTION = { down: 0, downRight: 1, right: 2, upRight: 3, up: 4, upLeft: 5, left: 6, downLeft: 7 } as const;
export type Direction = keyof typeof DIRECTION;

type Anim = { name: string; image: HTMLImageElement; fw: number; fh: number; durations: number[] };

const xmlCache = new Map<number, Promise<Document>>();
const animCache = new Map<string, Promise<Anim | null>>();

function animData(id: number) {
  if (!xmlCache.has(id)) {
    const dir = String(id).padStart(4, "0");
    xmlCache.set(id, fetch(`${BASE}/${dir}/AnimData.xml`).then(async (r) => {
      if (!r.ok) throw new Error("no anim data");
      return new DOMParser().parseFromString(await r.text(), "application/xml");
    }));
  }
  return xmlCache.get(id)!;
}

function loadAnim(id: number, name: string): Promise<Anim | null> {
  const key = `${id}:${name}`;
  if (!animCache.has(key)) {
    animCache.set(key, (async () => {
      const doc = await animData(id);
      const anims = [...doc.querySelectorAll("Anim")];
      let node = anims.find((a) => a.querySelector("Name")?.textContent === name);
      if (!node) return null;
      const copyOf = node.querySelector("CopyOf")?.textContent;
      if (copyOf) node = anims.find((a) => a.querySelector("Name")?.textContent === copyOf) ?? node;
      const sheetName = node.querySelector("Name")!.textContent!;
      const fw = Number(node.querySelector("FrameWidth")?.textContent);
      const fh = Number(node.querySelector("FrameHeight")?.textContent);
      const durations = [...node.querySelectorAll("Duration")].map((d) => Number(d.textContent) || 1);
      if (!fw || !fh || !durations.length) return null;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = `${BASE}/${String(id).padStart(4, "0")}/${sheetName}-Anim.png`;
      await image.decode();
      return { name: sheetName, image, fw, fh, durations };
    })().catch(() => null));
  }
  return animCache.get(key)!;
}

// Highest and lowest non-transparent rows across all frames of one direction.
const boxCache = new Map<string, { top: number; bottom: number }>();
function contentBox(a: Anim, row: number) {
  const key = `${a.image.src}:${row}`;
  const cached = boxCache.get(key);
  if (cached) return cached;
  let top = a.fh - 1, bottom = 0;
  try {
    const c = document.createElement("canvas");
    c.width = a.image.naturalWidth; c.height = a.fh;
    const cx = c.getContext("2d", { willReadFrequently: true })!;
    cx.drawImage(a.image, 0, row * a.fh, c.width, a.fh, 0, 0, c.width, a.fh);
    const px = cx.getImageData(0, 0, c.width, a.fh).data;
    for (let y = 0; y < a.fh; y++) {
      for (let x = 0; x < c.width; x++) {
        if (px[(y * c.width + x) * 4 + 3] > 0) { top = Math.min(top, y); bottom = Math.max(bottom, y); break; }
      }
    }
  } catch { top = 0; bottom = a.fh - 1; }
  if (bottom < top) { top = 0; bottom = a.fh - 1; }
  const box = { top, bottom };
  boxCache.set(key, box);
  return box;
}

/**
 * Plays `intro` once (if given and available), then loops `anim`.
 * `height` is the target on-screen height; the sprite is scaled by a whole number
 * so the pixels stay crisp.
 */
export function PmdSprite({ id, anim = "Idle", intro, facing = "down", height = 160, scale: fixedScale, className }: {
  id: number; anim?: string; intro?: string; facing?: Direction; height?: number; scale?: number; className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let raf = 0;
    let stopped = false;
    (async () => {
      const [loop, first] = await Promise.all([loadAnim(id, anim), intro ? loadAnim(id, intro) : Promise.resolve(null)]);
      if (stopped) return;
      if (!loop) { setFailed(id); return; }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const row = DIRECTION[facing];
      const rowOf = (a: Anim) => (row < Math.round(a.image.naturalHeight / a.fh) ? row : 0);
      // PMD frames have empty space around the character. Measure where the pixels
      // really are so the feet sit on the canvas bottom (on the shadow).
      const loopBox = contentBox(loop, rowOf(loop));
      const introBox = first ? contentBox(first, rowOf(first)) : null;
      const contentH = loopBox.bottom - loopBox.top + 1;
      const scale = fixedScale ?? Math.max(1, Math.min(6, Math.floor(height / contentH)));
      // Room for the taller of the two animations (a hop goes higher than idle).
      const fw = Math.max(loop.fw, first?.fw ?? 0);
      const fh = Math.max(contentH, introBox ? introBox.bottom - introBox.top + 1 : 0);
      canvas.width = fw; canvas.height = fh;
      setSize({ w: fw * scale, h: fh * scale });
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;

      let current = first ?? loop;
      let frame = 0;
      let nextAt = performance.now();
      const draw = (now: number) => {
        if (stopped) return;
        if (now >= nextAt) {
          ctx.clearRect(0, 0, fw, fh);
          const box = current === loop ? loopBox : introBox!;
          const dx = Math.floor((fw - current.fw) / 2);
          const dy = fh - 1 - box.bottom; // lowest pixel → canvas bottom
          ctx.drawImage(current.image, frame * current.fw, rowOf(current) * current.fh, current.fw, current.fh, dx, dy, current.fw, current.fh);
          nextAt = now + current.durations[frame] * TICK_MS;
          frame++;
          if (frame >= current.durations.length) {
            frame = 0;
            if (current !== loop) current = loop;
          }
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [id, anim, intro, facing, height, fixedScale]);

  if (failed === id) {
    // Fallback: the static PokéAPI sprite.
    return <img src={spriteUrl(id)} alt="" width={height} height={height} className={`sprite ${className ?? ""}`} style={{ width: height, height }} />;
  }
  return (
    <canvas ref={canvasRef} className={`sprite ${className ?? ""}`} aria-hidden
      style={{ width: size?.w ?? 1, height: size?.h ?? height, imageRendering: "pixelated" }} />
  );
}
