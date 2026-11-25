// Procedural pixel art for the world. Every asset is drawn into a grid of colour
// *keys* (one char each), then usually gets a dark outline pass, which is what gives
// the classic handheld-RPG look. Palettes are separate from shapes, so each layer of
// the dig can recolour the same rock, grass and props.
import { rngFrom } from "@/lib/game";

export type Art = { grid: string[]; palette: Record<string, string> };
type G = string[][];

const make = (w: number, h: number): G => Array.from({ length: h }, () => Array<string>(w).fill("."));
const W = (g: G) => g[0].length;
const H = (g: G) => g.length;
const mod = (v: number, n: number) => ((v % n) + n) % n;

// `wrap` makes the grid tile left-right ("x"), up-down ("y") or both.
type Wrap = boolean | "x" | "y";
const wx = (w: Wrap) => w === true || w === "x";
const wy = (w: Wrap) => w === true || w === "y";

function set(g: G, x: number, y: number, c: string, wrap: Wrap = false) {
  if (wy(wrap)) y = mod(y, H(g)); else if (y < 0 || y >= H(g)) return;
  if (wx(wrap)) x = mod(x, W(g)); else if (x < 0 || x >= W(g)) return;
  g[y][x] = c;
}
function get(g: G, x: number, y: number, wrap: Wrap = false) {
  if (wy(wrap)) y = mod(y, H(g)); else if (y < 0 || y >= H(g)) return ".";
  if (wx(wrap)) x = mod(x, W(g)); else if (x < 0 || x >= W(g)) return ".";
  return g[y][x];
}

// Adds a 1px outline around every shape.
function outline(g: G, key = "k", wrap: Wrap = false): G {
  const out = g.map((r) => [...r]);
  for (let y = 0; y < H(g); y++) for (let x = 0; x < W(g); x++) {
    if (g[y][x] !== ".") continue;
    const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const c = get(g, x + dx, y + dy, wrap);
      return c !== "." && c !== key;
    });
    if (touches) out[y][x] = key;
  }
  return out;
}

const pad = (g: G, n = 1): G => {
  const out = make(W(g) + n * 2, H(g) + n * 2);
  g.forEach((row, y) => row.forEach((c, x) => { out[y + n][x + n] = c; }));
  return out;
};
const toArt = (g: G, palette: Record<string, string>): Art => ({ grid: g.map((r) => r.join("")), palette });

// Smooth periodic noise, so edges tile seamlessly.
function wave(seed: string, period: number) {
  const rng = rngFrom(seed);
  const parts = [1, 2, 3, 5].map((k) => ({ k, a: 1 / k, p: rng() * Math.PI * 2 }));
  const norm = parts.reduce((s, q) => s + q.a, 0);
  return (i: number) => parts.reduce((s, q) => s + q.a * Math.sin((2 * Math.PI * q.k * i) / period + q.p), 0) / norm;
}

function blob(g: G, cx: number, cy: number, rx: number, ry: number, c: string, wrap: Wrap, dither = false) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (d > 1) continue;
    if (dither && d > 0.55 && (x + y) % 2) continue;
    set(g, x, y, c, wrap);
  }
}

function walk(g: G, rng: () => number, x: number, y: number, len: number, c: string, wrap: Wrap, dir: [number, number] = [0, 0]) {
  for (let i = 0; i < len; i++) {
    set(g, Math.round(x), Math.round(y), c, wrap);
    x += dir[0] + (rng() - 0.5) * 2;
    y += dir[1] + (rng() - 0.5) * 2;
  }
}

/* ───────────────────────── surface shapes ───────────────────────── */

// Tall grass, tileable left-right. Back blades are dark, front blades have a
// lit tip, a highlight on the left edge and dark gaps between them.
const TALL_GRASS_SHAPE = (() => {
  const w = 24, h = 20, g = make(w, h), rng = rngFrom("tall-grass");
  for (let y = 13; y < h; y++) for (let x = 0; x < w; x++) g[y][x] = y >= 17 ? "d" : "m";
  const blade = (cx: number, top: number, half: number, body: string, tip: string, gaps: boolean) => {
    for (let y = top; y < h; y++) {
      const t = Math.min(1, (y - top) / Math.max(1, h - 6 - top));
      const hw = Math.round(half * t);
      for (let dx = -hw; dx <= hw; dx++) {
        const c = y - top < 2 ? tip : dx === -hw && y - top < 8 ? "h" : body;
        set(g, cx + dx, y, c, "x");
      }
      if (gaps && hw > 0 && y < 15) { set(g, cx - hw - 1, y, "k", "x"); set(g, cx + hw + 1, y, "k", "x"); }
    }
  };
  for (let i = 0; i < 4; i++) blade(i * 6 + 3, 4 + Math.floor(rng() * 3), 3, "d", "m", false);
  for (let i = 0; i < 4; i++) blade(i * 6, 1 + Math.floor(rng() * 3), 3, "m", "l", true);
  return outline(g, "k", "x");
})();

// A tileable strip of rounded tree crowns (the forest edge).
const TREELINE_SHAPE = (() => {
  const w = 64, h = 34, g = make(w, h), rng = rngFrom("treeline");
  const crowns = [0, 13, 26, 39, 52].map((x) => ({ x: x + Math.floor(rng() * 4), y: 11 + Math.floor(rng() * 5), r: 8 + Math.floor(rng() * 3) }));
  for (const c of crowns) for (let y = 0; y < h; y++) for (let dx = -c.r; dx <= c.r; dx++) {
    const dy = y - c.y;
    const inside = dy >= 0 ? Math.abs(dx) <= c.r : dx * dx + dy * dy <= c.r * c.r;
    if (!inside) continue;
    const s = dx + dy;
    const col = s < -c.r * 0.75 ? "l" : s > c.r * 0.55 ? "d" : (s > c.r * 0.15 && (dx + y) % 2 === 0) ? "d" : "m";
    set(g, c.x + dx, y, col, "x");
  }
  return outline(g, "k", "x");
})();

// Distant mountains with snow caps, tileable.
const MOUNTAIN_SHAPE = (() => {
  const w = 160, h = 50, g = make(w, h), rng = rngFrom("mountains");
  const peaks = [{ x: 22, h: 44, w: 36 }, { x: 64, h: 30, w: 30 }, { x: 104, h: 48, w: 40 }, { x: 144, h: 28, w: 28 }];
  for (const p of peaks) for (let y = h - p.h; y < h; y++) {
    const half = Math.round(((y - (h - p.h)) / p.h) * p.w) + (rng() < 0.3 ? 1 : 0);
    for (let dx = -half; dx <= half; dx++) {
      const snowLine = h - p.h + 7 + ((dx + 40) % 4 === 0 ? 2 : 0);
      set(g, p.x + dx, y, y < snowLine ? "w" : dx < -half / 3 ? "a" : "b", "x");
    }
  }
  return g;
})();

// Floor texture: ticks and specks.
const GROUND_SHAPE = (() => {
  const s = 32, g = make(s, s), rng = rngFrom("ground");
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) g[y][x] = "g";
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(rng() * s), y = Math.floor(rng() * s);
    set(g, x, y, "t", true); set(g, x, y + 1, "t", true); set(g, x + 2, y + 1, "t", true);
  }
  for (let i = 0; i < 10; i++) set(g, Math.floor(rng() * s), Math.floor(rng() * s), "l", true);
  return g;
})();

const CLOUD_SHAPE = (() => {
  const w = 38, h = 16, g = make(w, h);
  const blobs = [[9, 10, 5], [16, 7, 6], [25, 7, 5], [31, 10, 4], [5, 12, 3]];
  for (let y = 0; y < 14; y++) for (let x = 0; x < w; x++) {
    const inside = blobs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r) || (y >= 10 && y <= 13 && x >= 5 && x <= 33);
    if (inside) g[y][x] = y >= 12 ? "s" : "w";
  }
  return outline(g, "o");
})();

const SUN_SHAPE = (() => {
  const r = 9, g = make(r * 2 + 3, r * 2 + 3);
  for (let y = 0; y < H(g); y++) for (let x = 0; x < W(g); x++) {
    const d = Math.hypot(x - r - 1, y - r - 1);
    if (d <= r) g[y][x] = d > r - 2 ? "b" : (x + y) % 5 === 0 && d < r - 3 ? "c" : "a";
  }
  return g;
})();

// A round battle pad: a raised disc of ground with a darker side and grass
// poking up along the back rim.
const PAD_SHAPE = (() => {
  const w = 60, h = 16, g = make(w, h), cx = 29.5, rx = 28.5, ry = 5.5, top = 6, depth = 4;
  const inE = (x: number, y: number, cy: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (inE(x, y, top)) {
      const dy = y - top, dx = x - cx;
      g[y][x] = dy <= -3 && dx < 8 ? "l" : dy >= 3 ? "t" : (dy >= 2 && (x + y) % 2 === 0) ? "t" : "g";
    } else if (inE(x, y, top + depth) || (y > top && y <= top + depth && Math.abs(x - cx) <= rx)) {
      g[y][x] = y >= top + depth + 2 ? "e" : "d";
    }
  }
  for (const x0 of [5, 12, 20, 37, 45, 52]) {
    const yb = Math.round(top - ry * Math.sqrt(Math.max(0, 1 - ((x0 - cx) / rx) ** 2)));
    set(g, x0, yb, "m"); set(g, x0 + 1, yb - 1, "m"); set(g, x0 + 1, yb, "m"); set(g, x0 + 2, yb, "m"); set(g, x0 + 2, yb - 2, "h");
  }
  return outline(pad(pad(g)));
})();

/* ───────────────────────── underground shapes ───────────────────────── */

type WallKind = "soil" | "roots" | "moss" | "crystal" | "stone" | "magma" | "fossil" | "brick" | "void";

// The back wall of the shaft: 48×48, tiles in both directions.
// Keys: a base · b dark · c light · d darkest · r accent · g glow.
function wallShape(kind: WallKind): G {
  const s = 48, g = make(s, s), rng = rngFrom(`wall-${kind}`);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) g[y][x] = "a";

  if (kind === "brick") {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const row = Math.floor(y / 8), off = row % 2 ? 8 : 0;
      const bx = mod(x + off, 16), by = y % 8;
      if (by === 7 || bx === 15) g[y][x] = "d";
      else if (by === 0) g[y][x] = "c";
      else if ((Math.floor((x + off) / 16) * 7 + row * 3) % 5 === 0) g[y][x] = "b";
    }
    for (let i = 0; i < 9; i++) walk(g, rng, rng() * s, rng() * s, 6, "d", true);
    // a few bricks carry glowing glyph strokes
    for (const [gx, gy] of [[4, 2], [26, 18], [10, 34]]) {
      for (let i = 0; i < 4; i++) set(g, gx + i, gy + 2, "g", true);
      set(g, gx + 1, gy + 1, "g", true); set(g, gx + 3, gy + 3, "g", true); set(g, gx + 1, gy + 4, "g", true);
    }
    return g;
  }

  // mottled rock
  for (let i = 0; i < 10; i++) blob(g, rng() * s, rng() * s, 3 + rng() * 6, 2 + rng() * 4, "b", true, true);
  for (let i = 0; i < 6; i++) blob(g, rng() * s, rng() * s, 2 + rng() * 4, 1.5 + rng() * 2, "c", true, true);
  if (kind !== "void") for (let i = 0; i < 5; i++) walk(g, rng, rng() * s, rng() * s, 9 + rng() * 10, "d", true, [rng() - 0.5, rng() - 0.5]);

  // stones
  if (kind !== "void" && kind !== "magma") for (let i = 0; i < 6; i++) {
    const cx = rng() * s, cy = rng() * s, rx = 2 + rng() * 2, ry = 1.2 + rng();
    blob(g, cx, cy, rx, ry, "b", true);
    blob(g, cx - 0.4, cy - 0.5, rx - 0.6, ry - 0.5, "c", true);
  }

  const dots = (n: number, c: string, size = 1) => {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rng() * s), y = Math.floor(rng() * s);
      for (let k = 0; k < size; k++) set(g, x + k, y, c, true);
    }
  };

  switch (kind) {
    case "soil":
      dots(14, "r", 2);
      dots(8, "d");
      break;
    case "roots":
      for (let i = 0; i < 4; i++) walk(g, rng, rng() * s, rng() * s, 22, "r", true, [0.15, 0.9]);
      dots(8, "r", 2);
      break;
    case "moss":
      for (let i = 0; i < 7; i++) blob(g, rng() * s, rng() * s, 2 + rng() * 3, 1 + rng(), "r", true, true);
      dots(5, "g");
      break;
    case "crystal":
      // little clusters of upright shards
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(rng() * s), y = Math.floor(rng() * s);
        for (const [dx, hgt] of [[-2, 2], [0, 4], [2, 3]]) {
          for (let k = 0; k < hgt; k++) set(g, x + dx, y - k, k === hgt - 1 ? "g" : "r", true);
          set(g, x + dx + 1, y, "d", true);
        }
      }
      break;
    case "stone":
      for (let i = 0; i < 4; i++) walk(g, rng, rng() * s, rng() * s, 8, "r", true, [0, 1]);
      break;
    case "magma":
      for (let i = 0; i < 3; i++) {
        let x = rng() * s, y = rng() * s;
        for (let k = 0; k < 16; k++) {
          set(g, Math.round(x), Math.round(y), "r", true);
          if (k % 3 === 1) set(g, Math.round(x), Math.round(y), "g", true);
          x += 1; y += (rng() - 0.5) * 2;
        }
      }
      dots(6, "d", 2);
      break;
    case "fossil":
      for (let i = 0; i < 3; i++) {
        const cx = Math.floor(rng() * s), cy = Math.floor(rng() * s);
        for (let t = 0; t < 14; t++) {
          const a = t * 0.9, rr = 0.6 + t * 0.22;
          set(g, Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), "r", true);
        }
      }
      dots(5, "g");
      break;
    case "void":
      for (let i = 0; i < 3; i++) walk(g, rng, rng() * s, rng() * s, 12, "r", true, [0.6, 0.6]);
      dots(10, "g");
      break;
  }
  return g;
}

// Side walls of the shaft: rock with a jagged inner edge (on the right), tiles up-down.
const SIDE_SHAPE = (() => {
  const w = 20, h = 64, g = make(w, h), rng = rngFrom("side");
  const edge = wave("side-edge", h);
  for (let y = 0; y < h; y++) {
    const e = Math.round(12 + edge(y) * 5);
    for (let x = 0; x < e; x++) g[y][x] = x >= e - 2 ? "c" : x >= e - 4 && (x + y) % 2 ? "c" : "a";
  }
  for (let i = 0; i < 8; i++) blob(g, rng() * 10, rng() * h, 2 + rng() * 3, 2 + rng() * 3, "b", "y", true);
  for (let i = 0; i < 5; i++) {
    const y = Math.floor(rng() * h);
    for (let x = 0; x < 8 + rng() * 4; x++) if (get(g, x, y, "y") !== ".") set(g, x, y, "b", "y");
  }
  return outline(g, "k", "y");
})();

// A crust of rock: the front face of a floor, and the ledges you smash through. Tiles left-right.
const CRUST_SHAPE = (() => {
  const w = 32, h = 12, g = make(w, h), rng = rngFrom("crust");
  const edge = wave("crust-edge", w);
  for (let x = 0; x < w; x++) {
    let bottom = Math.round(6 + edge(x) * 2.2);
    if (x % 11 === 4) bottom += 3; // little drips
    for (let y = 0; y <= bottom; y++) g[y][x] = y === 0 ? "c" : y === 1 && x % 2 ? "c" : "a";
  }
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(rng() * w), y = 2 + Math.floor(rng() * 4);
    if (get(g, x, y, "x") !== ".") { set(g, x, y, "b", "x"); set(g, x + 1, y, "b", "x"); }
  }
  return outline(g, "k", "x");
})();

// Rubble along the back edge of a cave floor. Tiles left-right.
const RUBBLE_SHAPE = (() => {
  const w = 32, h = 10, g = make(w, h), rng = rngFrom("rubble");
  for (let x = 0; x < w; x += 4 + Math.floor(rng() * 3)) {
    const r = 2 + rng() * 2.2, cx = x, cy = h - r + 0.5;
    for (let y = 0; y < h; y++) for (let dx = -4; dx <= 4; dx++) {
      const d = ((dx) / r) ** 2 + ((y - cy) / r) ** 2;
      if (d <= 1) set(g, cx + dx, y, dx + (y - cy) < -r * 0.5 ? "c" : d > 0.6 && dx > 0 ? "b" : "a", "x");
    }
  }
  return outline(g, "k", "x");
})();

/* ───────────────────────── props ───────────────────────── */
// Keys: a mid · b dark · c light · g glow/accent. Outlined with k.

function crystalShape() {
  const g = make(16, 18);
  const shard = (cx: number, top: number, half: number, bottom: number) => {
    for (let y = top; y <= bottom; y++) {
      const t = y - top;
      const hw = Math.min(half, Math.floor(t / 1.6));
      for (let dx = -hw; dx <= hw; dx++) set(g, cx + dx, y, dx < 0 ? "c" : dx === 0 && t > 1 ? "g" : "a");
    }
  };
  shard(4, 6, 2, 17); shard(11, 3, 3, 17); shard(8, 0, 2, 17);
  for (let x = 1; x < 15; x++) set(g, x, 17, "b");
  return outline(g);
}

function mushroomShape() {
  const g = make(18, 13);
  const shroom = (cx: number, capY: number, r: number) => {
    for (let y = capY + 1; y <= 12; y++) { set(g, cx, y, "c"); set(g, cx + 1, y, "a"); }
    for (let y = capY - r; y <= capY; y++) for (let dx = -r - 1; dx <= r + 1; dx++) {
      if ((dx / (r + 1.2)) ** 2 + ((y - capY) / (r + 0.3)) ** 2 > 1) continue;
      set(g, cx + dx, y, y === capY ? "b" : (dx + y) % 3 === 0 && y < capY - 1 ? "c" : "g");
    }
  };
  shroom(4, 6, 3); shroom(12, 4, 4); shroom(9, 9, 2);
  return outline(g);
}

function stalactiteShape() {
  const g = make(14, 26);
  const cone = (cx: number, len: number, half: number) => {
    for (let y = 0; y < len; y++) {
      const hw = Math.round(half * (1 - y / len));
      for (let dx = -hw; dx <= hw; dx++) set(g, cx + dx, y, dx < 0 ? "c" : dx > hw / 2 ? "b" : "a");
    }
  };
  cone(7, 25, 5); cone(2, 12, 2); cone(12, 16, 2);
  for (let x = 0; x < 14; x++) set(g, x, 0, "b");
  return outline(g);
}

function rootsShape() {
  const g = make(22, 24), rng = rngFrom("roots-prop");
  for (let x = 0; x < 22; x++) { set(g, x, 0, "a"); set(g, x, 1, "b"); }
  for (let i = 0; i < 5; i++) {
    let x = 2 + i * 4.3;
    for (let y = 1; y < 10 + rng() * 13; y++) {
      set(g, Math.round(x), y, y % 4 ? "a" : "c");
      if (y < 8) set(g, Math.round(x) + 1, y, "b");
      x += (rng() - 0.5) * 1.2;
      if (rng() < 0.12) set(g, Math.round(x) + (rng() < 0.5 ? -1 : 1), y + 1, "a");
    }
  }
  return outline(g);
}

function boulderShape() {
  const g = make(18, 12);
  blob(g, 7, 7, 6.5, 4.6, "a", false);
  blob(g, 13.5, 8.5, 3.6, 3, "b", false);
  blob(g, 6, 5.6, 4, 2.4, "c", false, true);
  for (let x = 2; x < 16; x++) if (get(g, x, 11) !== ".") set(g, x, 11, "b");
  return outline(g);
}

function fossilShape() {
  const g = make(16, 16);
  blob(g, 7.5, 7.5, 7, 7, "a", false);
  for (let t = 0; t < 46; t++) {
    const a = t * 0.38, rr = 0.6 + t * 0.12;
    set(g, Math.round(7.5 + Math.cos(a) * rr), Math.round(7.5 + Math.sin(a) * rr), "c");
  }
  for (let t = 0; t < 46; t += 5) {
    const a = t * 0.38, rr = 0.6 + t * 0.12;
    set(g, Math.round(7.5 + Math.cos(a) * (rr - 1)), Math.round(7.5 + Math.sin(a) * (rr - 1)), "b");
  }
  return outline(g);
}

function boneShape() {
  const g = make(20, 8);
  for (let x = 3; x < 17; x++) { set(g, x, 3, "c"); set(g, x, 4, "a"); }
  for (const cx of [2.5, 16.5]) { blob(g, cx, 2.2, 1.8, 1.6, "c", false); blob(g, cx, 5.4, 1.8, 1.6, "a", false); }
  return outline(g);
}

function tabletShape() {
  const g = make(16, 20);
  for (let y = 1; y < 20; y++) for (let x = 1; x < 15; x++) g[y][x] = x === 1 || y === 1 ? "c" : x === 14 || y === 19 ? "b" : "a";
  for (let x = 3; x < 13; x++) set(g, x, 0, "b");
  const rune = [[4, 4], [5, 4], [6, 4], [5, 5], [5, 6], [4, 7], [6, 7], [9, 5], [10, 4], [11, 5], [10, 6], [10, 7],
    [4, 11], [5, 12], [6, 11], [7, 12], [8, 11], [9, 12], [10, 11], [11, 12], [5, 15], [6, 15], [7, 15], [9, 15], [10, 15], [7, 16], [9, 16]];
  for (const [x, y] of rune) set(g, x, y, "g");
  return outline(g);
}

function lavaShape() {
  const g = make(28, 9), rng = rngFrom("lava");
  let y = 4;
  for (let x = 0; x < 28; x++) {
    const hw = x < 3 || x > 24 ? 0 : 1 + (x % 5 === 2 ? 1 : 0);
    for (let dy = -hw - 1; dy <= hw + 1; dy++) set(g, x, y + dy, Math.abs(dy) > hw ? "b" : dy === 0 ? "c" : "g");
    if (rng() < 0.3) y = Math.max(3, Math.min(5, y + (rng() < 0.5 ? -1 : 1)));
  }
  return outline(g);
}

function floaterShape() {
  const g = make(22, 16);
  for (let x = 1; x < 21; x++) { set(g, x, 2, "c"); set(g, x, 3, "a"); }
  for (let y = 4; y < 16; y++) {
    const hw = Math.round(10 * (1 - (y - 4) / 12));
    for (let dx = -hw; dx <= hw; dx++) set(g, 11 + dx, y, dx > hw / 3 ? "b" : "a");
  }
  for (const [x, y] of [[8, 5], [9, 6], [9, 7], [10, 8], [11, 9], [11, 10], [12, 11]]) set(g, x, y, "g");
  return outline(g);
}

// One clump of tall grass: blades fanning out from a base. Keys like TALL_GRASS_SHAPE.
function clumpShape(seed: string) {
  const w = 18, h = 22, g = make(w, h), rng = rngFrom(seed);
  const blade = (bx: number, len: number, lean: number, body: string, tip: string, edge: boolean) => {
    for (let t = 0; t < len; t++) {
      const y = h - 1 - t, f = t / len;
      const x = bx + lean * f * f * len * 0.5;
      const half = Math.max(0, Math.round(1.6 * (1 - f)));
      for (let dx = -half; dx <= half; dx++) set(g, Math.round(x + dx), y, t > len - 3 ? tip : edge && dx === -half && f < 0.6 ? "h" : body);
    }
  };
  const back = 3 + Math.floor(rng() * 2), front = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < back; i++) blade(4 + i * 3.4 + rng(), 12 + Math.floor(rng() * 6), (rng() - 0.5) * 1.6, "d", "m", false);
  for (let i = 0; i < front; i++) blade(3 + i * 2.9 + rng(), 9 + Math.floor(rng() * 9), (i - (front - 1) / 2) * 0.55 + (rng() - 0.5) * 0.5, "m", "l", true);
  for (let x = 3; x < w - 3; x++) { set(g, x, h - 1, "d"); if (x > 4 && x < w - 5) set(g, x, h - 2, "d"); }
  return outline(pad(g));
}
export const grassClumps = (i: number) => memo(`clumps${i}`, () =>
  ["a", "b", "c"].map((v) => toArt(clumpShape(`clump-${v}`), STRATA[i].grass)));

export type PropKind = "crystal" | "mushrooms" | "stalactite" | "roots" | "boulder" | "fossil" | "bone" | "tablet" | "lava" | "floater";
const PROP_SHAPES: Record<PropKind, () => G> = {
  crystal: crystalShape, mushrooms: mushroomShape, stalactite: stalactiteShape, roots: rootsShape, boulder: boulderShape,
  fossil: fossilShape, bone: boneShape, tablet: tabletShape, lava: lavaShape, floater: floaterShape,
};
// Props that hang from above instead of sitting on a ledge.
export const HANGING: Partial<Record<PropKind, true>> = { stalactite: true, roots: true };
// Props whose accent colour glows in the dark.
export const GLOWING: Partial<Record<PropKind, true>> = { crystal: true, mushrooms: true, tablet: true, lava: true, floater: true };

/* ───────────────────────── colour helpers ───────────────────────── */

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c: number[]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
export const mix = (a: string, b: string, t: number) => { const pa = rgb(a), pb = rgb(b); return hex(pa.map((v, i) => v + (pb[i] - v) * t)); };
export const shade = (c: string, t: number) => mix(c, "#000000", t);
export const tint = (c: string, t: number) => mix(c, "#ffffff", t);

/* ───────────────────────── the dig ───────────────────────── */

type Grass = { k: string; d: string; m: string; l: string; h: string };
export type Stratum = {
  from: number; name: string; flavor: string;
  wall: WallKind; rock: string; accent: string; glow: string | null; floor: string; grass: Grass;
  props: PropKind[]; dark: number;
  stadiums: string[];  // battle backgrounds (public/stadium/*.png) for floors in this layer
  grade: string;       // CSS filter that grades the stadium darker and stranger with depth
};

// Every point digs you 10 m deeper. The deeper you go, the darker and stranger it
// gets: soil and roots, glowing moss, crystals, echoing caves, magma, fossils,
// ruins, and at the very bottom the world turns inside out.
export const STRATA: Stratum[] = [
  { from: 0, name: "Tall Grass", flavor: "Every trainer starts here.", wall: "soil", rock: "#6e4c30", accent: "#a2825a", glow: null, floor: "#8c9a50",
    grass: { k: "#0e3f22", d: "#1f7a3a", m: "#35a84a", l: "#6fd25e", h: "#b6f08a" }, props: ["boulder", "roots"], dark: 0.12, stadiums: ["meadow", "route", "thunderplains"], grade: "" },
  { from: 250, name: "Root Tunnels", flavor: "Diglett dug these, probably.", wall: "roots", rock: "#4d3424", accent: "#93603a", glow: null, floor: "#6e5236",
    grass: { k: "#2a2a10", d: "#5a6a22", m: "#7d8f32", l: "#a8b84a", h: "#d6e08a" }, props: ["roots", "boulder"], dark: 0.24, stadiums: ["earthycave", "forest"], grade: "brightness(.93) saturate(.95)" },
  { from: 600, name: "Mossy Grotto", flavor: "The mushrooms glow when nobody's looking.", wall: "moss", rock: "#34443a", accent: "#5f9a3e", glow: "#9ff5d0", floor: "#47614a",
    grass: { k: "#0e2a18", d: "#1f5a32", m: "#2f8048", l: "#58b06a", h: "#a4e8a8" }, props: ["mushrooms", "roots", "boulder"], dark: 0.36, stadiums: ["forest", "river"], grade: "brightness(.8) saturate(1.1) hue-rotate(-8deg)" },
  { from: 1000, name: "Crystal Cavern", flavor: "Everything sparkles down here.", wall: "crystal", rock: "#2a3658", accent: "#4fc8f0", glow: "#8ff0ff", floor: "#37466e",
    grass: { k: "#062a3a", d: "#10607a", m: "#1c94b0", l: "#4fd0e8", h: "#b8f6ff" }, props: ["crystal", "boulder", "crystal"], dark: 0.44, stadiums: ["icecave"], grade: "brightness(.82) saturate(1.15)" },
  { from: 1500, name: "Echo Caverns", flavor: "Something blinked in the dark.", wall: "stone", rock: "#2d2943", accent: "#5c5482", glow: "#ffd84a", floor: "#3b3655",
    grass: { k: "#06252a", d: "#16575a", m: "#258787", l: "#4fcfc4", h: "#b8fff4" }, props: ["stalactite", "boulder"], dark: 0.56, stadiums: ["dampcave"], grade: "brightness(.66) saturate(.85)" },
  { from: 2100, name: "Magma Chamber", flavor: "The walls are warm to the touch.", wall: "magma", rock: "#3a1a1a", accent: "#ff6a2a", glow: "#ffb347", floor: "#4b2621",
    grass: { k: "#3a1a0c", d: "#8a3a12", m: "#c8601e", l: "#f0a040", h: "#ffe08a" }, props: ["lava", "boulder", "stalactite"], dark: 0.5, stadiums: ["volcanocave"], grade: "brightness(.8) saturate(1.25)" },
  { from: 2800, name: "Fossil Layer", flavor: "Older than any Pokédex.", wall: "fossil", rock: "#3e3125", accent: "#c9b78e", glow: "#ffb000", floor: "#554430",
    grass: { k: "#2e2410", d: "#6e5a2a", m: "#a08840", l: "#c8b060", h: "#f0e0a0" }, props: ["fossil", "bone", "boulder"], dark: 0.64, stadiums: ["desert", "mountain"], grade: "brightness(.66) sepia(.35) saturate(1.1)" },
  { from: 3600, name: "Ancient Ruins", flavor: "Someone built this. Long ago.", wall: "brick", rock: "#211f3c", accent: "#3b3768", glow: "#a497ff", floor: "#2b2852",
    grass: { k: "#120a24", d: "#2e1f56", m: "#4a3488", l: "#7a5cc8", h: "#b8a2ff" }, props: ["tablet", "boulder"], dark: 0.72, stadiums: ["earthycave", "mountain"], grade: "sepia(.6) hue-rotate(215deg) saturate(2.6) brightness(.52)" },
  { from: 4500, name: "The Rift", flavor: "The world turns inside out.", wall: "void", rock: "#170c26", accent: "#7430e0", glow: "#f06bff", floor: "#221236",
    grass: { k: "#1a0624", d: "#5a1670", m: "#9a2cb0", l: "#d860e8", h: "#ffb8ff" }, props: ["floater", "crystal"], dark: 0.78, stadiums: ["deepsea"], grade: "sepia(.5) hue-rotate(245deg) saturate(2.4) brightness(.6)" },
];

export const MAX_METERS = 6000;
export const stratumIndexAt = (m: number) => STRATA.reduce((idx, s, i) => (m >= s.from ? i : idx), 0);
export const stratumAt = (m: number) => STRATA[stratumIndexAt(m)];

// How dark the world is at a depth (0 = daylight).
export function darknessAt(m: number) {
  if (m <= 0) return 0;
  if (m < 60) return (m / 60) * STRATA[0].dark;
  const i = stratumIndexAt(m);
  const a = STRATA[i], b = STRATA[i + 1];
  if (!b) return a.dark;
  return a.dark + (b.dark - a.dark) * ((m - a.from) / (b.from - a.from));
}

// Colours used for the surface (the meadow under the morning sky).
export const SURFACE = {
  sky: ["#3ea6f5", "#8fd0ff", "#dff3ff"] as const,
  mountain: { a: "#a9c8ea", b: "#8bb0dc", w: "#f4f9ff" },
  treeline: { k: "#16492b", d: "#246b3b", m: "#348a4a", l: "#4fa85c" },
  ground: { g: "#86d66c", t: "#66b858", l: "#a8ea86" },
};

/* ───────────────────────── assets ───────────────────────── */

const cache = new Map<string, unknown>();
const memo = <T>(key: string, fn: () => T): T => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key) as T;
};

export function artUrl(art: Art) {
  const h = art.grid.length, w = art.grid[0].length;
  let rects = "";
  art.grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === "." || !art.palette[c]) continue;
      let run = 1;
      while (row[x + run] === c) run++;
      rects += `<rect x='${x}' y='${y}' width='${run}' height='1' fill='${art.palette[c]}'/>`;
      x += run - 1;
    }
  });
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export type Layer = { url: string; w: number; h: number };
const layer = (key: string, art: () => Art): Layer => memo(key, () => {
  const a = art();
  return { url: artUrl(a), w: a.grid[0].length, h: a.grid.length };
});

export const surfaceLayers = () => ({
  mountains: layer("s-mountains", () => toArt(MOUNTAIN_SHAPE, SURFACE.mountain)),
  treeline: layer("s-treeline", () => toArt(TREELINE_SHAPE, SURFACE.treeline)),
  ground: layer("s-ground", () => toArt(GROUND_SHAPE, SURFACE.ground)),
  grass: layer("s-grass", () => toArt(TALL_GRASS_SHAPE, STRATA[0].grass)),
});

// Everything a layer of the dig needs, recoloured from its few base colours.
export function strataLayers(i: number) {
  const s = STRATA[i], r = s.rock;
  return {
    wall: layer(`wall${i}`, () => toArt(wallShape(s.wall), {
      a: r, b: shade(r, 0.2), c: tint(r, 0.1), d: shade(r, 0.42), r: s.accent, g: s.glow ?? tint(s.accent, 0.2),
    })),
    side: layer(`side${i}`, () => toArt(SIDE_SHAPE, { a: tint(r, 0.1), b: shade(r, 0.05), c: tint(r, 0.3), k: shade(r, 0.6) })),
    crust: layer(`crust${i}`, () => toArt(CRUST_SHAPE, { a: tint(r, 0.16), b: r, c: tint(r, 0.4), k: shade(r, 0.55) })),
    rubble: layer(`rubble${i}`, () => toArt(RUBBLE_SHAPE, { a: tint(r, 0.12), b: shade(r, 0.1), c: tint(r, 0.34), k: shade(r, 0.55) })),
    floor: layer(`floor${i}`, () => toArt(GROUND_SHAPE, { g: s.floor, t: shade(s.floor, 0.16), l: tint(s.floor, 0.16) })),
    grass: layer(`grass${i}`, () => toArt(TALL_GRASS_SHAPE, s.grass)),
  };
}

// The surface: grass with a soil cut face beneath it.
export const surfaceCrust = () => layer("s-crust", () => toArt(CRUST_SHAPE, { a: "#7a5434", b: "#5e3f26", c: "#5fb84e", k: "#2e1d10" }));

export function propArt(kind: PropKind, i: number): Art {
  return memo(`prop-${kind}-${i}`, () => {
    const s = STRATA[i], base = tint(s.rock, kind === "bone" || kind === "fossil" ? 0.2 : 0.14);
    const pal: Record<string, string> = kind === "bone"
      ? { a: shade(s.accent, 0.12), b: shade(s.accent, 0.35), c: s.accent, g: s.accent, k: shade(s.rock, 0.6) }
      : kind === "crystal"
        ? { a: s.accent, b: shade(s.accent, 0.4), c: tint(s.accent, 0.5), g: s.glow ?? tint(s.accent, 0.6), k: shade(s.rock, 0.5) }
        : kind === "roots"
          ? { a: s.accent, b: shade(s.accent, 0.3), c: tint(s.accent, 0.2), g: s.accent, k: shade(s.rock, 0.6) }
          : { a: base, b: shade(s.rock, 0.12), c: tint(s.rock, 0.32), g: s.glow ?? s.accent, k: shade(s.rock, 0.6) };
    return toArt(PROP_SHAPES[kind](), pal);
  });
}

export const sunArt = (core: string, rim: string, spot: string): Art => toArt(SUN_SHAPE, { a: core, b: rim, c: spot });
export const cloudArt = memo("cloud", () => toArt(CLOUD_SHAPE, { w: "#ffffff", s: "#dbeaf6", o: "#a9c6de" }));

// Battle pad recoloured for each layer (the surface pad is meadow green).
export const padArt = (i: number, surface = false) => memo(`pad${i}${surface ? "s" : ""}`, () => {
  const s = STRATA[i];
  const g = surface ? SURFACE.ground : { g: s.floor, t: shade(s.floor, 0.16), l: tint(s.floor, 0.16) };
  return toArt(PAD_SHAPE, {
    g: g.g, l: g.l, t: g.t, d: shade(g.t, 0.25), e: shade(g.t, 0.45),
    m: s.grass.m, h: s.grass.l, k: s.grass.k,
  });
});
