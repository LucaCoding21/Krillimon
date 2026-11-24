// Turns what a player typed into a Pokémon, forgiving case, punctuation,
// accents and small typos. Pure, so it can be tested on its own.

type Named = { id: number; slug: string; name: string };

export function normalizeName(input: string) {
  return String(input)
    .replace(/♀/g, 'f').replace(/♂/g, 'm')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

// Extra spellings people commonly type.
const EXTRA_ALIASES: Record<string, number[]> = {
  nidoran: [29, 32], nidoranfemale: [29], nidoranmale: [32], nidoranfem: [29],
  farfetched: [83], sirfetched: [865], mrmine: [122], typenull: [772], hooh: [250],
};

export type NameIndex = { byKey: Map<string, number[]>; keys: string[] };

export function buildNameIndex(dex: Named[]): NameIndex {
  const byKey = new Map<string, number[]>();
  const add = (key: string, id: number) => {
    if (!key) return;
    const ids = byKey.get(key) ?? [];
    if (!ids.includes(id)) byKey.set(key, [...ids, id]);
  };
  for (const p of dex) { add(normalizeName(p.name), p.id); add(normalizeName(p.slug), p.id); }
  for (const [key, ids] of Object.entries(EXTRA_ALIASES)) ids.forEach(id => add(key, id));
  return { byKey, keys: [...byKey.keys()] };
}

// Edit distance with an early exit once it's over the limit.
export function distance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    if (Math.min(...cur) > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Returns the candidate Pokémon ids (usually one) and whether it was a typo fix.
export function matchPokemon(input: string, index: NameIndex): { ids: number[]; corrected: boolean } | null {
  const key = normalizeName(input);
  if (!key || key.length > 40) return null;
  const exact = index.byKey.get(key);
  if (exact) return { ids: exact, corrected: false };

  const allowance = key.length <= 3 ? 0 : key.length <= 6 ? 1 : 2;
  if (!allowance) return null;
  let best: { d: number; ids: number[] } | null = null;
  let tied = false;
  for (const k of index.keys) {
    const d = distance(key, k, allowance);
    if (d > allowance) continue;
    const ids = index.byKey.get(k)!;
    if (!best || d < best.d) { best = { d, ids }; tied = false; }
    else if (d === best.d && ids.join() !== best.ids.join()) tied = true;
  }
  return best && !tied ? { ids: best.ids, corrected: true } : null;
}
