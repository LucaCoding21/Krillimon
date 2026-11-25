// Pure game rules: tiers, puzzle generation and rarity. No imports, so it runs
// the same on the server, in the browser and in tests.

export type Pokemon = {
  id: number; slug: string; name: string; gen: number; types: string[]; color: string | null;
  h: number | null; w: number | null; leg: boolean; myth: boolean; baby: boolean;
  from: number | null; stage: number; familySize: number; familyDepth: number;
  fam: number; meme: boolean;
  abilities: string[]; eggs: string[];
  stats: number[] | null;  // base hp, atk, def, spa, spd, spe
  gender: number;          // -1 genderless, 0 always male, 8 always female
  shape: string | null; genus: string | null;
  evo: string[];           // how it's reached by evolving: 'level', 'trade', 'friendship', 'fire-stone'…
  forms: string[];         // 'mega', 'gmax', 'alola', 'galar', 'hisui', 'paldea'
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
const an = (word: string) => `${/^[AEIOU]/i.test(word) ? 'an' : 'a'} ${word}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

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
  type: 3, dual: 1.5, gen: 1.5, letter: 1.5, ability: 2, stat: 1.5, group: 1.3, typegen: 1.2,
  weak: 1.2, stone: 1.1, color: 1, size: 1, ends: 1, forms: 1, evo: 1, genus: 1, shape: 0.8,
  mono: 0.8, starter: 0.8, contains: 0.7, wordplay: 0.6, length: 0.6, gender: 0.6, egg: 0.6,
  noevo: 0.5, threestage: 0.5, legendary: 0.4, baby: 0.3,
};

// Attacking type → defending types it hits harder (2) or softer (0.5, 0).
const CHART: Record<string, Record<string, number>> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};
export const damageMultiplier = (attack: string, types: string[]) => types.reduce((m, t) => m * (CHART[attack]?.[t] ?? 1), 1);

const STAT_PROMPTS: [key: string, text: string, test: (s: number[]) => boolean][] = [
  ['spe100', 'Name a Pokémon with a base Speed of 100 or more', s => s[5] >= 100],
  ['atk120', 'Name a Pokémon with a base Attack of 120 or more', s => s[1] >= 120],
  ['hp100', 'Name a Pokémon with a base HP of 100 or more', s => s[0] >= 100],
  ['def120', 'Name a Pokémon with a base Defense of 120 or more', s => s[2] >= 120],
  ['spa120', 'Name a Pokémon with a base Special Attack of 120 or more', s => s[3] >= 120],
  ['spd120', 'Name a Pokémon with a base Special Defense of 120 or more', s => s[4] >= 120],
  ['bst600', 'Name a Pokémon with a base stat total of 600 or more', s => s.reduce((a, b) => a + b, 0) >= 600],
  ['spe30', 'Name a Pokémon with a base Speed of 30 or less', s => s[5] <= 30],
  ['bst300', 'Name a Pokémon with a base stat total under 300', s => s.reduce((a, b) => a + b, 0) < 300],
];

const STONES = ['fire', 'water', 'thunder', 'leaf', 'moon', 'sun', 'shiny', 'dusk', 'dawn', 'ice'];

// Pokédex body shapes that read clearly as a prompt.
const SHAPES: Record<string, string> = {
  quadruped: 'Name a four-legged Pokémon (by its Pokédex body shape)',
  wings: 'Name a Pokémon with one pair of wings (by its Pokédex body shape)',
  'bug-wings': 'Name a Pokémon with two or more pairs of wings (by its Pokédex body shape)',
  squiggle: 'Name a snake-like, serpentine Pokémon (by its Pokédex body shape)',
  fish: 'Name a fish-shaped Pokémon (by its Pokédex body shape)',
  heads: 'Name a Pokémon made of several bodies, like Dugtrio (by its Pokédex body shape)',
  tentacles: 'Name a Pokémon with tentacles or many legs (by its Pokédex body shape)',
  ball: 'Name a Pokémon whose body is just a head (by its Pokédex body shape)',
  armor: 'Name a Pokémon with an insect-like body (by its Pokédex body shape)',
};

// Words from the "___ Pokémon" Pokédex category.
const GENUS_WORDS = [
  'Bird', 'Mouse', 'Snake', 'Fish', 'Fox', 'Cat', 'Monkey', 'Mushroom', 'Pig', 'Dragon', 'Sea', 'Tiny', 'Big',
  'Armor', 'Ball', 'Star', 'Iron', 'Rock', 'Poison', 'Fire', 'Water', 'Grass', 'Toxic',
];

const STARTERS = [[1, 9], [152, 160], [252, 260], [387, 395], [495, 503], [650, 658], [722, 730], [810, 818], [906, 914]];
const isStarter = (id: number) => STARTERS.some(([a, b]) => id >= a && id <= b);

// Hand-picked families (PokéAPI slugs).
const GROUPS: [key: string, text: string, slugs: string[]][] = [
  ['fossil', 'Name a fossil Pokémon or one of its evolutions', ['omanyte', 'omastar', 'kabuto', 'kabutops', 'aerodactyl', 'lileep', 'cradily', 'anorith', 'armaldo', 'cranidos', 'rampardos', 'shieldon', 'bastiodon', 'tirtouga', 'carracosta', 'archen', 'archeops', 'tyrunt', 'tyrantrum', 'amaura', 'aurorus', 'dracozolt', 'arctozolt', 'dracovish', 'arctovish']],
  ['pseudo', 'Name a pseudo-legendary or anything in its evolution line', ['dratini', 'dragonair', 'dragonite', 'larvitar', 'pupitar', 'tyranitar', 'bagon', 'shelgon', 'salamence', 'beldum', 'metang', 'metagross', 'gible', 'gabite', 'garchomp', 'deino', 'zweilous', 'hydreigon', 'goomy', 'sliggoo', 'goodra', 'jangmo-o', 'hakamo-o', 'kommo-o', 'dreepy', 'drakloak', 'dragapult', 'frigibax', 'arctibax', 'baxcalibur']],
  ['ultrabeast', 'Name an Ultra Beast', ['nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord', 'poipole', 'naganadel', 'stakataka', 'blacephalon']],
  ['paradox', 'Name a Paradox Pokémon', ['great-tusk', 'scream-tail', 'brute-bonnet', 'flutter-mane', 'slither-wing', 'sandy-shocks', 'roaring-moon', 'walking-wake', 'gouging-fire', 'raging-bolt', 'iron-treads', 'iron-bundle', 'iron-hands', 'iron-jugulis', 'iron-moth', 'iron-thorns', 'iron-valiant', 'iron-leaves', 'iron-boulder', 'iron-crown', 'koraidon', 'miraidon']],
  ['eevee', 'Name Eevee or any of its evolutions', ['eevee', 'vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon', 'leafeon', 'glaceon', 'sylveon']],
];
export const GROUP_SLUGS = GROUPS.flatMap(g => g[2]);

export function buildCandidates(dex: Pokemon[]): Candidate[] {
  const out: Candidate[] = [];
  const add = (kind: string, key: string, text: string, list: Pokemon[]) => {
    if (list.length >= MIN_ANSWERS) out.push({ kind, key, text, ids: list.map(p => p.id) });
  };
  const allTypes = [...new Set(dex.flatMap(p => p.types))].sort();

  for (const t of allTypes) {
    add('type', t, `Name ${an(cap(t))}-type Pokémon`, dex.filter(p => p.types.includes(t)));
    add('mono', t, `Name a pure ${cap(t)}-type Pokémon (no second type)`, dex.filter(p => p.types.length === 1 && p.types[0] === t));
    for (let g = 1; g <= 9; g++) {
      add('typegen', `${t}-${g}`, `Name ${an(cap(t))}-type Pokémon from ${REGIONS[g]} (Gen ${g})`, dex.filter(p => p.gen === g && p.types.includes(t)));
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
  add('size', 'heavy500', 'Name a Pokémon that weighs 500 kg or more', dex.filter(p => (p.w ?? 0) >= 5000));
  add('size', 'tall5', "Name a Pokémon that's at least 5 metres tall", dex.filter(p => (p.h ?? 0) >= 50));

  // Abilities (hidden abilities count).
  const abilities = [...new Set(dex.flatMap(p => p.abilities))].sort();
  for (const a of abilities) add('ability', slug(a), `Name a Pokémon that can have the ability ${a}`, dex.filter(p => p.abilities.includes(a)));

  // Base stats and type matchups.
  for (const [key, text, test] of STAT_PROMPTS) add('stat', key, text, dex.filter(p => p.stats && test(p.stats)));
  for (const t of allTypes) add('weak', t, `Name a Pokémon with a 4× weakness to ${cap(t)}`, dex.filter(p => damageMultiplier(t, p.types) === 4));

  // Evolution methods. "Part of" counts both the Pokémon that evolves and what it becomes.
  const kids = new Map<number, Pokemon[]>();
  for (const p of dex) if (p.from) kids.set(p.from, [...(kids.get(p.from) ?? []), p]);
  const partOf = (test: (tags: string[]) => boolean) =>
    dex.filter(p => test(p.evo) || (kids.get(p.id) ?? []).some(k => test(k.evo)));
  for (const stone of STONES) {
    add('stone', stone, `Name a Pokémon that's part of ${an(cap(stone))} Stone evolution`, partOf(tags => tags.includes(`${stone}-stone`)));
  }
  add('stone', 'any', "Name a Pokémon that's part of an evolution-stone evolution (any stone)",
    partOf(tags => STONES.some(st => tags.includes(`${st}-stone`))));
  add('evo', 'trade', "Name a Pokémon that's part of a trade evolution", partOf(tags => tags.includes('trade')));
  add('evo', 'friendship', "Name a Pokémon that's part of a friendship evolution", partOf(tags => tags.includes('friendship')));
  add('evo', 'branched', 'Name a Pokémon that can evolve into two or more different Pokémon', dex.filter(p => (kids.get(p.id)?.length ?? 0) >= 2));
  add('evo', 'middle', 'Name a middle-stage Pokémon (the 2nd of three stages)', dex.filter(p => p.familyDepth === 3 && p.stage === 2));
  add('evo', 'final3', 'Name the final stage of a three-stage evolution line', dex.filter(p => p.stage === 3));
  add('evo', 'canevolve', "Name a Pokémon that can still evolve", dex.filter(p => kids.has(p.id)));

  // Breeding, gender, body shape and Pokédex category.
  for (const e of [...new Set(dex.flatMap(p => p.eggs))]) {
    const note = e === 'Undiscovered' ? ' (the ones that can’t breed)' : '';
    add('egg', slug(e), `Name a Pokémon in the ${e} Egg Group${note}`, dex.filter(p => p.eggs.includes(e)));
  }
  add('gender', 'none', 'Name a genderless Pokémon', dex.filter(p => p.gender === -1));
  add('gender', 'male', 'Name a Pokémon that is always male', dex.filter(p => p.gender === 0));
  add('gender', 'female', 'Name a Pokémon that is always female', dex.filter(p => p.gender === 8));
  for (const [shape, text] of Object.entries(SHAPES)) add('shape', shape, text, dex.filter(p => p.shape === shape));
  for (const word of GENUS_WORDS) {
    add('genus', slug(word), `Name a Pokémon with “${word}” in its Pokédex category`,
      dex.filter(p => (p.genus ?? '').split(/[\s-]+/).includes(word)));
  }

  // Groups, starters and alternate forms.
  const bySlug = new Map(dex.map(p => [p.slug, p]));
  for (const [key, text, slugs] of GROUPS) add('group', key, text, slugs.map(s => bySlug.get(s)).filter((p): p is Pokemon => !!p));
  add('group', 'mythical', 'Name a Mythical Pokémon', dex.filter(p => p.myth));
  add('group', 'legendonly', 'Name a Legendary Pokémon (Mythicals don’t count)', dex.filter(p => p.leg && !p.myth));
  const starters = dex.filter(p => isStarter(p.id));
  add('starter', 'any', 'Name a starter Pokémon or one of its evolutions', starters);
  add('starter', 'first', 'Name a starter Pokémon (first stage only, like Bulbasaur)', starters.filter(p => p.stage === 1));
  for (const t of ['grass', 'fire', 'water']) add('starter', t, `Name a ${cap(t)}-type starter or one of its evolutions`, starters.filter(p => p.types.includes(t)));
  add('starter', 'final', 'Name the final evolution of a starter Pokémon', starters.filter(p => p.stage === 3));
  add('forms', 'mega', 'Name a Pokémon that has a Mega Evolution', dex.filter(p => p.forms.includes('mega')));
  add('forms', 'gmax', 'Name a Pokémon that can Gigantamax', dex.filter(p => p.forms.includes('gmax')));
  add('forms', 'alola', 'Name a Pokémon that has an Alolan form', dex.filter(p => p.forms.includes('alola')));
  add('forms', 'galar', 'Name a Pokémon that has a Galarian form', dex.filter(p => p.forms.includes('galar')));
  add('forms', 'hisui', 'Name a Pokémon that has a Hisuian form', dex.filter(p => p.forms.includes('hisui')));
  add('forms', 'regional', 'Name a Pokémon with a regional form (Alolan, Galarian, Hisuian or Paldean)',
    dex.filter(p => p.forms.some(f => ['alola', 'galar', 'hisui', 'paldea'].includes(f))));

  // Wordplay on names.
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const list = dex.filter(p => letters(p.name).endsWith(L.toLowerCase()));
    if (list.length >= 12) add('ends', L, `Name a Pokémon whose name ends with “${L}”`, list);
  }
  for (const L of 'JQVXZ') {
    const list = dex.filter(p => letters(p.name).includes(L.toLowerCase()));
    if (list.length >= 8) add('contains', L, `Name a Pokémon with a “${L}” anywhere in its name`, list);
  }
  add('wordplay', 'double', 'Name a Pokémon with a double letter in its name (like “tt” or “oo”)', dex.filter(p => /(.)\1/.test(letters(p.name))));
  add('wordplay', 'bookends', 'Name a Pokémon whose name starts and ends with the same letter', dex.filter(p => {
    const l = letters(p.name);
    return l[0] === l[l.length - 1];
  }));
  add('wordplay', 'punct', 'Name a Pokémon with a space, number, hyphen or punctuation mark in its name', dex.filter(p => /[^\p{L}♀♂]/u.test(p.name)));
  add('wordplay', 'long', 'Name a Pokémon with 11 or more letters in its name', dex.filter(p => letters(p.name).length >= 11));
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
