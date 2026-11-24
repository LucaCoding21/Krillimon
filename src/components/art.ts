// Procedural pixel art for the world. Every asset is drawn into a grid of colour
// *keys* (one char each), then gets a dark outline pass, which is what gives the
// classic handheld-RPG look. Palettes are separate from shapes, so each biome can
// recolour the same grass, trees and ground.
import { rngFrom } from "@/lib/game";

export type Art = { grid: string[]; palette: Record<string, string> };
type G = string[][];

const make = (w: number, h: number): G => Array.from({ length: h }, () => Array<string>(w).fill("."));
const W = (g: G) => g[0].length;
const H = (g: G) => g.length;

function set(g: G, x: number, y: number, c: string, wrap = false) {
  if (y < 0 || y >= H(g)) return;
  if (wrap) x = ((x % W(g)) + W(g)) % W(g);
  else if (x < 0 || x >= W(g)) return;
  g[y][x] = c;
}
function get(g: G, x: number, y: number, wrap = false) {
  if (y < 0 || y >= H(g)) return ".";
  if (wrap) x = ((x % W(g)) + W(g)) % W(g);
  else if (x < 0 || x >= W(g)) return ".";
  return g[y][x];
}

// Adds a 1px outline around every shape.
function outline(g: G, key = "k", wrap = false): G {
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
const fromRows = (rows: string[]): G => rows.map((r) => r.split(""));
const toArt = (g: G, palette: Record<string, string>): Art => ({ grid: g.map((r) => r.join("")), palette });

/* ───────────────────────── shapes ───────────────────────── */

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
        set(g, cx + dx, y, c, true);
      }
      if (gaps && hw > 0 && y < 15) { set(g, cx - hw - 1, y, "k", true); set(g, cx + hw + 1, y, "k", true); }
    }
  };
  for (let i = 0; i < 4; i++) blade(i * 6 + 3, 4 + Math.floor(rng() * 3), 3, "d", "m", false);
  for (let i = 0; i < 4; i++) blade(i * 6, 1 + Math.floor(rng() * 3), 3, "m", "l", true);
  return outline(g, "k", true);
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
    set(g, c.x + dx, y, col, true);
  }
  return outline(g, "k", true);
})();

// Distant mountains with snow caps, tileable.
const MOUNTAIN_SHAPE = (() => {
  const w = 160, h = 50, g = make(w, h), rng = rngFrom("mountains");
  const peaks = [{ x: 22, h: 44, w: 36 }, { x: 64, h: 30, w: 30 }, { x: 104, h: 48, w: 40 }, { x: 144, h: 28, w: 28 }];
  for (const p of peaks) for (let y = h - p.h; y < h; y++) {
    const half = Math.round(((y - (h - p.h)) / p.h) * p.w) + (rng() < 0.3 ? 1 : 0);
    for (let dx = -half; dx <= half; dx++) {
      const snowLine = h - p.h + 7 + ((dx + 40) % 4 === 0 ? 2 : 0);
      set(g, p.x + dx, y, y < snowLine ? "w" : dx < -half / 3 ? "a" : "b", true);
    }
  }
  return g;
})();

// Field texture: grass ticks and specks.
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

// Dirt path with ragged grassy edges and pebbles.
const PATH_SHAPE = (() => {
  const w = 32, h = 16, g = make(w, h), rng = rngFrom("path");
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y][x] = "p";
  for (let x = 0; x < w; x++) {
    const top = 1 + Math.floor(rng() * 2), bottom = 1 + Math.floor(rng() * 2);
    for (let y = 0; y < top; y++) g[y][x] = "g";
    g[top][x] = "e";
    for (let y = h - bottom; y < h; y++) g[y][x] = "g";
  }
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(rng() * w), y = 4 + Math.floor(rng() * (h - 8));
    set(g, x, y, "q", true); if (rng() < 0.5) set(g, x + 1, y, "q", true);
  }
  return g;
})();

const FENCE_SHAPE = outline(fromRows([
  "..............",
  ".lb...........",
  ".lb...........",
  ".lbbbbbbbbbbbb",
  ".lbddddddddddd",
  ".lb...........",
  ".lb...........",
  ".lbbbbbbbbbbbb",
  ".lbddddddddddd",
  ".lb...........",
  ".lb...........",
  ".lb...........",
]), "k", true);

const TREE_SHAPE = (() => {
  const w = 22, h = 28, g = make(w, h);
  const blobs = [{ x: 11, y: 9, r: 8 }, { x: 6, y: 13, r: 5 }, { x: 16, y: 13, r: 5 }];
  for (let y = 0; y < 19; y++) for (let x = 0; x < w; x++) {
    const b = blobs.find((c) => (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r);
    if (!b) continue;
    const s = (x - 11) + (y - 10);
    g[y][x] = s < -9 ? "h" : s < -4 ? "l" : s > 6 ? "d" : s > 2 && (x + y) % 2 === 0 ? "d" : "m";
  }
  for (let y = 18; y < 26; y++) for (let x = 9; x <= 12; x++) g[y][x] = x === 12 ? "c" : "b";
  for (let x = 7; x <= 14; x++) if (g[25][x] === ".") g[25][x] = "c";
  return outline(pad(g));
})();
const BERRY_SHAPE = (() => {
  const g = TREE_SHAPE.map((r) => [...r]);
  [[7, 6], [14, 5], [10, 11], [5, 13], [16, 12], [12, 15], [8, 16]].forEach(([x, y]) => { if (g[y][x] !== "k" && g[y][x] !== ".") g[y][x] = "r"; });
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

const FLOWER_SHAPE = outline(pad(fromRows([".r.r.", "rryrr", ".rrr.", "..g..", ".gg..", "..g.."])));

const ROCK_SHAPE = outline(pad(fromRows(["...aaaa...", "..alaabba.", ".allaabbbb", "alaabbbbbb", "aabbbbbbbc", ".bbbbbbccc"])));
const CRYSTAL_SHAPE = outline(pad(fromRows(["...l...", "..lcd..", "..lcd..", ".lccdd.", ".lccdd.", "lcccddd", "lcccddd", ".ccddd.", "..cdd.."])));
const PILLAR_SHAPE = outline(pad(fromRows(["aaaaaaaa", "lllbbbbb", ".lbbbbc.", ".lbbbbc.", ".lbbbcc.", ".lbbbbc.", ".lbbbbc.", ".lbbbbc.", ".lbbbbc.", "lllbbbbb", "cccccccc"])));
const LAVA_SHAPE = outline(pad(fromRows(["...aaaa...", "..aaooaa..", ".aaorroaa.", "aaorrrroaa", "aaaaaaaaaa"])));
const SIGN_SHAPE = outline(pad(fromRows(["bbbbbbbbbbbb", "bllllllllccb", "blcccccccccb", "bccccccccccb", "bbbbbbbbbbbb", ".....bb.....", ".....bb.....", ".....bb....."])));

const SUN_SHAPE = (() => {
  const r = 9, g = make(r * 2 + 3, r * 2 + 3);
  for (let y = 0; y < H(g); y++) for (let x = 0; x < W(g); x++) {
    const d = Math.hypot(x - r - 1, y - r - 1);
    if (d <= r) g[y][x] = d > r - 2 ? "b" : (x + y) % 5 === 0 && d < r - 3 ? "c" : "a";
  }
  return g;
})();
const MOON_SHAPE = (() => {
  const r = 8, g = make(r * 2 + 3, r * 2 + 3);
  for (let y = 0; y < H(g); y++) for (let x = 0; x < W(g); x++) {
    const d = Math.hypot(x - r - 1, y - r - 1);
    const bite = Math.hypot(x - r - 5, y - r - 3);
    if (d <= r && bite > r - 1) g[y][x] = (x === r - 2 && y === r) || (x === r - 4 && y === r + 4) ? "d" : "m";
  }
  return outline(g, "o");
})();

/* ───────────────────────── biomes ───────────────────────── */

type Palettes = {
  sky: [string, string, string]; mountain: { a: string; b: string; w: string };
  treeline: { k: string; d: string; m: string; l: string };
  grass: { k: string; d: string; m: string; l: string; h: string };
  ground: { g: string; t: string; l: string }; path: { p: string; q: string; e: string };
  tree: { k: string; d: string; m: string; l: string; h: string; b: string; c: string; r: string };
  flower: string; clouds: boolean; props: ("tree" | "berry" | "rock" | "crystal" | "pillar" | "lava" | "flower")[];
};

export type Biome = { from: number; name: string; flavor: [string, string]; pal: Palettes };

const MEADOW_TREE = { k: "#123d22", d: "#25703a", m: "#3a9a4c", l: "#5fbf5f", h: "#9be37f", b: "#8a5a2c", c: "#5e3a18", r: "#e2504b" };

// The route tells a story: the further you get, the later it gets. Morning in the
// meadow, golden hour at the river, sunset on Ember Peak, dusk on the ridge, night
// in the cave, midnight in the ruins... and only the best runs see dawn break over
// the Sky Sanctuary.
export const BIOMES: Biome[] = [
  { from: 0, name: "Sunny Meadow", flavor: ["Every trainer starts here.", "Rattata nap in the clover."], pal: {
    sky: ["#3ea6f5", "#8fd0ff", "#dff3ff"], mountain: { a: "#a9c8ea", b: "#8bb0dc", w: "#f4f9ff" },
    treeline: { k: "#16492b", d: "#246b3b", m: "#348a4a", l: "#4fa85c" },
    grass: { k: "#0e3f22", d: "#1f7a3a", m: "#35a84a", l: "#6fd25e", h: "#b6f08a" },
    ground: { g: "#86d66c", t: "#66b858", l: "#a8ea86" }, path: { p: "#ecd9a0", q: "#cdb072", e: "#c9ad6e" },
    tree: MEADOW_TREE, flower: "#ff6b6b", clouds: true, props: ["tree", "flower", "flower"] } },
  { from: 250, name: "Berry Orchard", flavor: ["Berries everywhere.", "Something nibbled these leaves."], pal: {
    sky: ["#47a8ef", "#9ad3fb", "#e8f6ff"], mountain: { a: "#b3cfe9", b: "#93b5db", w: "#f8fbff" },
    treeline: { k: "#1a4a26", d: "#2b6e36", m: "#3f8f45", l: "#5aad57" },
    grass: { k: "#14421f", d: "#2a8037", m: "#44ad46", l: "#7fd65a", h: "#c2f28a" },
    ground: { g: "#93d86a", t: "#73bd57", l: "#b4ec86" }, path: { p: "#e9d29a", q: "#c9a96a", e: "#c4a466" },
    tree: MEADOW_TREE, flower: "#ffd23f", clouds: true, props: ["berry", "berry", "flower"] } },
  { from: 600, name: "Whispering Woods", flavor: ["Bug Catchers lurk here.", "Do the trees whisper back?"], pal: {
    sky: ["#3f8f86", "#79b9a6", "#c4e6d4"], mountain: { a: "#5f9b8c", b: "#4c8576", w: "#8fc2b2" },
    treeline: { k: "#0b2e1c", d: "#174a2c", m: "#22623a", l: "#357d4a" },
    grass: { k: "#0a3019", d: "#1a5f2e", m: "#2b8a3e", l: "#55b852", h: "#9be07a" },
    ground: { g: "#5daa55", t: "#468f45", l: "#7cc46c" }, path: { p: "#c9a46a", q: "#a6834c", e: "#a47f4a" },
    tree: { ...MEADOW_TREE, k: "#0b2e1c", d: "#174a2c", m: "#2a6e3c", l: "#3f8f4c", h: "#6fbf6a" }, flower: "#c58cff", clouds: false, props: ["tree", "tree", "flower"] } },
  { from: 1000, name: "Rushing River", flavor: ["The river glows gold.", "Something big just splashed."], pal: {
    sky: ["#5a9ad8", "#f4c27e", "#ffe2a8"], mountain: { a: "#c9a6a0", b: "#a88a92", w: "#ffe9cf" },
    treeline: { k: "#1f3a24", d: "#3a5a2c", m: "#557a34", l: "#7a9a3c" },
    grass: { k: "#1f3a14", d: "#4a7a22", m: "#78a830", l: "#b8d04a", h: "#f2e88a" },
    ground: { g: "#a8c860", t: "#8aa84c", l: "#cce07a" }, path: { p: "#f0d48c", q: "#d0b06a", e: "#c9a862" },
    tree: { k: "#1f3a14", d: "#3e6422", m: "#5e8a2c", l: "#8ab43a", h: "#d8e070", b: "#8a5a2c", c: "#5e3a18", r: "#ff8a3d" }, flower: "#ff9a5a", clouds: true, props: ["rock", "flower", "tree"] } },
  { from: 1500, name: "Ember Peak", flavor: ["The sun sinks behind the peak.", "The ground is still warm."], pal: {
    sky: ["#4a1838", "#c8492e", "#ffaa5e"], mountain: { a: "#8f3a2b", b: "#6e2a20", w: "#ffb03d" },
    treeline: { k: "#2a0e0a", d: "#4a1a12", m: "#64251a", l: "#7e3324" },
    grass: { k: "#3a1a0c", d: "#8a4a1a", m: "#c07a2a", l: "#e8b04a", h: "#ffe08a" },
    ground: { g: "#6e3c2a", t: "#552d21", l: "#8a4e36" }, path: { p: "#946044", q: "#764a33", e: "#6e4430" },
    tree: MEADOW_TREE, flower: "#ffcf3d", clouds: false, props: ["lava", "rock", "lava"] } },
  { from: 2100, name: "Frostbite Ridge", flavor: ["First stars over the snow.", "Your breath turns to frost."], pal: {
    sky: ["#1b2450", "#4a5d9a", "#b0a8d8"], mountain: { a: "#b9c3e6", b: "#8f9ccc", w: "#e6ecff" },
    treeline: { k: "#141c3a", d: "#26346a", m: "#3a4c8a", l: "#6a7cb8" },
    grass: { k: "#18264a", d: "#3a5a8e", m: "#5f86b8", l: "#9fc0e4", h: "#e4f0ff" },
    ground: { g: "#b8c4e4", t: "#98a6cc", l: "#d8e0f6" }, path: { p: "#a8b4d6", q: "#8a96bc", e: "#8692b8" },
    tree: { k: "#141c3a", d: "#23406a", m: "#3a6488", l: "#7aa0c0", h: "#dce8ff", b: "#5a4060", c: "#3a2a44", r: "#ffffff" }, flower: "#bcd4ff", clouds: false, props: ["tree", "rock", "tree"] } },
  { from: 2800, name: "Echo Cave", flavor: ["Night falls. Zubat everywhere.", "Your footsteps echo back."], pal: {
    sky: ["#0e0b1c", "#1d1832", "#2f2849"], mountain: { a: "#342d50", b: "#272140", w: "#463e68" },
    treeline: { k: "#0a0815", d: "#1a162e", m: "#262040", l: "#342c56" },
    grass: { k: "#06252a", d: "#16575a", m: "#258787", l: "#4fcfc4", h: "#b8fff4" },
    ground: { g: "#433b5a", t: "#342e48", l: "#564e70" }, path: { p: "#5e5578", q: "#4b4364", e: "#463f5e" },
    tree: MEADOW_TREE, flower: "#7ff0ff", clouds: false, props: ["rock", "crystal", "crystal"] } },
  { from: 3600, name: "Phantom Ruins", flavor: ["Midnight. Something is watching.", "Strange glyphs glow on the walls."], pal: {
    sky: ["#05030f", "#100b26", "#211843"], mountain: { a: "#2a2148", b: "#1e1838", w: "#3d3366" },
    treeline: { k: "#06040e", d: "#140f28", m: "#1e1640", l: "#2b2052" },
    grass: { k: "#120a24", d: "#2e1f56", m: "#4a3488", l: "#7a5cc8", h: "#b8a2ff" },
    ground: { g: "#352c50", t: "#2a2342", l: "#463b68" }, path: { p: "#4f4570", q: "#3f375c", e: "#3c3458" },
    tree: MEADOW_TREE, flower: "#e07bff", clouds: false, props: ["pillar", "crystal", "pillar"] } },
  { from: 4500, name: "Sky Sanctuary", flavor: ["Dawn breaks. Only legends get here.", "The air hums with power."], pal: {
    sky: ["#ff9fa0", "#ffc9a8", "#fff3d6"], mountain: { a: "#ffffff", b: "#f6e4f2", w: "#ffffff" },
    treeline: { k: "#b98a3a", d: "#e8c27a", m: "#f6dca0", l: "#fff0c8" },
    grass: { k: "#6a4a10", d: "#c08a20", m: "#e8b83a", l: "#ffe07a", h: "#fff6c0" },
    ground: { g: "#f6e7c1", t: "#e8d29a", l: "#fff6dc" }, path: { p: "#fff4d8", q: "#ecd9a8", e: "#e6d2a0" },
    tree: MEADOW_TREE, flower: "#ff8fb0", clouds: true, props: ["crystal", "pillar", "flower"] } },
];

export const MAX_METERS = 6000;
export const biomeIndexAt = (m: number) => BIOMES.reduce((idx, b, i) => (m >= b.from ? i : idx), 0);
export const biomeAt = (m: number) => BIOMES[biomeIndexAt(m)];

/* ───────────────────────── assets per biome ───────────────────────── */

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

export function biomeLayers(i: number) {
  const p = BIOMES[i].pal;
  return {
    mountains: layer(`m${i}`, () => toArt(MOUNTAIN_SHAPE, p.mountain)),
    treeline: layer(`t${i}`, () => toArt(TREELINE_SHAPE, p.treeline)),
    ground: layer(`g${i}`, () => toArt(GROUND_SHAPE, p.ground)),
    path: layer(`p${i}`, () => toArt(PATH_SHAPE, { ...p.path, g: p.ground.g })),
    fence: layer(`f${i}`, () => toArt(FENCE_SHAPE, { k: "#3b2410", b: "#a8703a", d: "#7a4a22", l: "#d39a5a" })),
    grass: layer(`gr${i}`, () => toArt(TALL_GRASS_SHAPE, p.grass)),
  };
}

export const tallGrassArt = (i: number) => memo(`tga${i}`, () => toArt(TALL_GRASS_SHAPE, BIOMES[i].pal.grass));
export const sunArt = (core: string, rim: string, spot: string): Art => toArt(SUN_SHAPE, { a: core, b: rim, c: spot });
export const moonArt = memo("moon", () => toArt(MOON_SHAPE, { m: "#fdf6d8", d: "#d9cfa8", o: "#8a86a8" }));
export const cloudArt = memo("cloud", () => toArt(CLOUD_SHAPE, { w: "#ffffff", s: "#dbeaf6", o: "#a9c6de" }));
export const signArt = memo("sign", () => toArt(SIGN_SHAPE, { k: "#3b2410", b: "#7a4a22", l: "#e0b070", c: "#b9793c" }));

export function propArt(kind: Palettes["props"][number], i: number): Art {
  const p = BIOMES[i].pal;
  return memo(`prop-${kind}-${i}`, () => {
    switch (kind) {
      case "tree": return toArt(TREE_SHAPE, p.tree);
      case "berry": return toArt(BERRY_SHAPE, p.tree);
      case "flower": return toArt(FLOWER_SHAPE, { k: "#2a2a3a", r: p.flower, y: "#ffe45c", g: "#2f8a3f" });
      case "rock": return toArt(ROCK_SHAPE, { k: "#2a2c3c", a: "#c3c7d8", l: "#e4e7f2", b: "#9297ad", c: "#6b7088" });
      case "crystal": return toArt(CRYSTAL_SHAPE, i === 8 ? { k: "#7a5410", l: "#fff6c9", c: "#ffd65a", d: "#e09a10" } : { k: "#123a5a", l: "#e0f8ff", c: "#7fd9ff", d: "#3a8fc4" });
      case "pillar": return toArt(PILLAR_SHAPE, { k: "#1d1838", a: "#5b5578", l: "#c6c1dc", b: "#9690b6", c: "#6b6590" });
      case "lava": return toArt(LAVA_SHAPE, { k: "#1e0a08", a: "#3a1a16", o: "#ffb03d", r: "#e2502b" });
    }
  });
}
