// Pure game rules: tiers, puzzle generation and rarity. No imports, so it runs
// the same on the server, in the browser and in tests.

export type Pokemon = {
  id: number; slug: string; name: string; gen: number; types: string[]; color: string | null;
  h: number | null; w: number | null; leg: boolean; myth: boolean; baby: boolean;
  from: number | null; stage: number; familySize: number; familyDepth: number;
  fam: number; meme: boolean;
};

export type TierId = 'common' | 'meme' | 'uncommon' | 'rare' | 'ultra' | 'shiny' | 'miss';
export type PuzzleAnswer = { id: number; tier: TierId };
export type PuzzlePrompt = { id: string; kind: string; text: string; answers: PuzzleAnswer[] };

export const ROUNDS = 6;          // a full team
export const PREVIEW_MS = 0;      // the clock starts the moment the prompt shows; you can type right away
export const ROUND_MS = 25_000;   // time to answer
export const GRACE_MS = 1_500;    // network slack for the last-second submit
export const MAX_SCORE = ROUNDS * 100;
// Points are shown as depth: every point digs you 10 m deeper.
export const METERS_PER_POINT = 10;
export const metersFor = (score: number) => score * METERS_PER_POINT;
export const formatMeters = (m: number) => `${Math.round(m).toLocaleString('en-US')} m`;

export const TIERS: Record<TierId, { name: string; score: number; emoji: string; blurb: string; color: string }> = {
  common:   { name: 'Common',     score: 10,  emoji: '🌱', blurb: "Everyone's first thought.",            color: '#94a3b8' },
  meme:     { name: 'Meme Pick',  score: 15,  emoji: '🤡', blurb: 'The "obscure" one everybody says.',     color: '#fb923c' },
  uncommon: { name: 'Uncommon',   score: 30,  emoji: '🌿', blurb: 'A solid find.',                         color: '#22c55e' },
  rare:     { name: 'Rare',       score: 60,  emoji: '💎', blurb: 'Not many trainers think of this one.',  color: '#3b82f6' },
  ultra:    { name: 'Ultra Rare', score: 85,  emoji: '🔮', blurb: 'Deep in the tall grass.',               color: '#a855f7' },
  shiny:    { name: 'Shiny',      score: 100, emoji: '✨', blurb: "Today's hidden gem for this prompt.",   color: '#eab308' },
  miss:     { name: 'Got Away',   score: 0,   emoji: '💨', blurb: 'No catch this round.',                  color: '#475569' },
};

export const TITLES = [
  { min: 0,   name: 'Youngster',   text: 'Plenty of grass left to explore.' },
  { min: 120, name: 'Ace Trainer', text: 'You know your way around a Pokédex.' },
  { min: 220, name: 'Gym Leader',  text: 'Off the beaten path. Nice.' },
  { min: 320, name: 'Elite Four',  text: 'Seriously deep cuts.' },
  { min: 420, name: 'Champion',    text: 'Absurd. Do you have the Pokédex memorized?' },
];
export const titleFor = (score: number) => [...TITLES].reverse().find(t => score >= t.min) ?? TITLES[0];

const REGIONS: Record<number, string> = {
  1: 'Kanto', 2: 'Johto', 3: 'Hoenn', 4: 'Sinnoh', 5: 'Unova', 6: 'Kalos', 7: 'Alola', 8: 'Galar or Hisui', 9: 'Paldea',
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const letters = (name: string) => name.normalize('NFKD').toLowerCase().replace(/[^a-z]/g, '');

// ---------- seeded randomness ----------
export function rngFrom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- prompt catalogue ----------
type Candidate = { kind: string; key: string; text: string; ids: number[] };
const MIN_ANSWERS = 6;

// How often each kind of prompt shows up. Each puzzle uses six different kinds.
const KIND_WEIGHTS: Record<string, number> = {
  type: 4, dual: 2, gen: 2, letter: 2, color: 1.5, size: 1.5, typegen: 1.5, mono: 1,
  length: 1, noevo: 0.8, threestage: 0.8, legendary: 0.6, baby: 0.4,
};

export function buildCandidates(dex: Pokemon[]): Candidate[] {
  const out: Candidate[] = [];
  const add = (kind: string, key: string, text: string, list: Pokemon[]) => {
    if (list.length >= MIN_ANSWERS) out.push({ kind, key, text, ids: list.map(p => p.id) });
  };
  const allTypes = [...new Set(dex.flatMap(p => p.types))].sort();

  for (const t of allTypes) {
    add('type', t, `Name a ${cap(t)}-type Pokémon`, dex.filter(p => p.types.includes(t)));
    add('mono', t, `Name a pure ${cap(t)}-type Pokémon (no second type)`, dex.filter(p => p.types.length === 1 && p.types[0] === t));
    for (let g = 1; g <= 9; g++) {
      add('typegen', `${t}-${g}`, `Name a ${cap(t)}-type Pokémon from ${REGIONS[g]} (Gen ${g})`, dex.filter(p => p.gen === g && p.types.includes(t)));
    }
  }
  for (let i = 0; i < allTypes.length; i++) for (let j = i + 1; j < allTypes.length; j++) {
    const [a, b] = [allTypes[i], allTypes[j]];
    add('dual', `${a}-${b}`, `Name a Pokémon that's both ${cap(a)} and ${cap(b)} type`, dex.filter(p => p.types.includes(a) && p.types.includes(b)));
  }
  for (let g = 1; g <= 9; g++) {
    add('gen', String(g), `Name a Pokémon first discovered in ${REGIONS[g]} (Gen ${g})`, dex.filter(p => p.gen === g));
  }
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const list = dex.filter(p => letters(p.name)[0] === L.toLowerCase());
    if (list.length >= 12) add('letter', L, `Name a Pokémon whose name starts with “${L}”`, list);
  }
  for (let n = 4; n <= 10; n++) {
    add('length', String(n), `Name a Pokémon with exactly ${n} letters in its name`, dex.filter(p => letters(p.name).length === n));
  }
  for (const c of [...new Set(dex.map(p => p.color).filter(Boolean))] as string[]) {
    add('color', c, `Name a Pokémon whose official Pokédex color is ${c}`, dex.filter(p => p.color === c));
  }
  add('size', 'tall', "Name a Pokémon that's at least 2 metres tall", dex.filter(p => (p.h ?? 0) >= 20));
  add('size', 'heavy', 'Name a Pokémon that weighs 200 kg or more', dex.filter(p => (p.w ?? 0) >= 2000));
  add('size', 'tiny', "Name a Pokémon that's 30 cm tall or shorter", dex.filter(p => p.h !== null && p.h <= 3));
  add('size', 'light', 'Name a Pokémon that weighs 1 kg or less', dex.filter(p => p.w !== null && p.w <= 10));
  add('legendary', 'all', 'Name a Legendary or Mythical Pokémon', dex.filter(p => p.leg || p.myth));
  add('noevo', 'all', "Name a Pokémon that doesn't evolve (and doesn't evolve from anything)", dex.filter(p => p.familySize === 1));
  add('threestage', 'all', 'Name a Pokémon from a three-stage evolution family', dex.filter(p => p.familyDepth === 3));
  add('baby', 'all', 'Name a baby Pokémon (like Pichu or Cleffa)', dex.filter(p => p.baby && p.id !== 172 && p.id !== 173));
  return out;
}

// ---------- rarity ----------
// Rank the valid answers by familiarity: top 15% Common, next 25% Uncommon,
// next 30% Rare, the rest Ultra Rare. Meme picks are capped at "Meme Pick".
// One Ultra Rare answer (from its more-known half, so it's findable) is the Shiny.
export function tierAnswers(ids: number[], byId: Map<number, Pokemon>, rng: () => number): PuzzleAnswer[] {
  const list = ids.map(id => byId.get(id)!).sort((a, b) => b.fam - a.fam || a.id - b.id);
  const n = list.length;
  const answers: PuzzleAnswer[] = list.map((p, i) => {
    const q = i / n;
    let tier: TierId = i === 0 || q < 0.15 ? 'common' : q < 0.4 ? 'uncommon' : q < 0.7 ? 'rare' : 'ultra';
    if (p.meme && tier !== 'common') tier = 'meme';
    return { id: p.id, tier };
  });
  let pool = answers.filter(a => a.tier === 'ultra');
  if (!pool.length) pool = answers.filter(a => a.tier === 'rare');
  if (pool.length) pool[Math.floor(rng() * Math.ceil(pool.length / 2))].tier = 'shiny';
  return answers;
}

export function generatePuzzle(dex: Pokemon[], seed: string, candidates = buildCandidates(dex)): PuzzlePrompt[] {
  const rng = rngFrom(seed);
  const byId = new Map(dex.map(p => [p.id, p]));
  const byKind = new Map<string, Candidate[]>();
  for (const c of candidates) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);

  const kinds = [...byKind.keys()].filter(k => KIND_WEIGHTS[k]);
  const chosen: string[] = [];
  while (chosen.length < ROUNDS && chosen.length < kinds.length) {
    const left = kinds.filter(k => !chosen.includes(k));
    let r = rng() * left.reduce((s, k) => s + KIND_WEIGHTS[k], 0);
    const pick = left.find(k => (r -= KIND_WEIGHTS[k]) < 0) ?? left[left.length - 1];
    chosen.push(pick);
  }
  return chosen.map((kind, i) => {
    const options = byKind.get(kind)!;
    const c = options[Math.floor(rng() * options.length)];
    return { id: `r${i + 1}-${c.kind}-${c.key}`, kind: c.kind, text: c.text, answers: tierAnswers(c.ids, byId, rng) };
  });
}

export function shareText(label: string, score: number, tiers: TierId[]) {
  return `Tall Grass ${label}\n⛏️ ${formatMeters(metersFor(score))} deep · ${titleFor(score).name}\n${tiers.map(t => TIERS[t].emoji).join('')}`;
}
