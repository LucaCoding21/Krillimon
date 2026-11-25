// Turns what a player typed into a Pokémon. Exact names (forgiving case,
// punctuation and accents) match straight away; anything else gets a short list
// of "Did you mean…?" suggestions. Pure, so it can be tested on its own.

type Named = { id: number; slug: string; name: string; fam?: number };

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

export type NameIndex = { byKey: Map<string, number[]>; keys: string[]; fame: Map<number, number> };

export function buildNameIndex(dex: Named[]): NameIndex {
  const byKey = new Map<string, number[]>();
  const add = (key: string, id: number) => {
    if (!key) return;
    const ids = byKey.get(key) ?? [];
    if (!ids.includes(id)) byKey.set(key, [...ids, id]);
  };
  for (const p of dex) { add(normalizeName(p.name), p.id); add(normalizeName(p.slug), p.id); }
  for (const [key, ids] of Object.entries(EXTRA_ALIASES)) ids.forEach(id => add(key, id));
  return { byKey, keys: [...byKey.keys()], fame: new Map(dex.map(p => [p.id, p.fam ?? 0])) };
}

// Edit distance where swapping two neighbouring letters counts as one edit
// ("pikahcu"), with an early exit once it's over the limit.
export function distance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], before[j - 2] + 1);
    }
    if (Math.min(...cur) > limit) return limit + 1;
    before = prev;
    prev = cur;
  }
  return prev[b.length];
}

// The Pokémon ids an exact name means (usually one; "Nidoran" means both), or null.
export function matchPokemon(input: string, index: NameIndex): number[] | null {
  const key = normalizeName(input);
  if (!key || key.length > 40) return null;
  return index.byKey.get(key) ?? null;
}

// Closest names to what was typed, best first. Only spelling counts, never the
// prompt, so a suggestion never hints at whether that Pokémon is an answer.
export function suggestPokemon(input: string, index: NameIndex, max = 3): number[] {
  const key = normalizeName(input);
  if (!key || key.length > 40) return [];
  const limit = key.length <= 4 ? 1 : key.length <= 7 ? 2 : 3;
  const best = new Map<number, number>();
  for (const k of index.keys) {
    let score = distance(key, k, limit);
    // Unfinished names ("char") and fragments ("chomp"): the best-known completions win.
    if (key.length >= 3 && k.startsWith(key)) score = Math.min(score, 0.7);
    else if (key.length >= 4 && k.includes(key)) score = Math.min(score, 0.9);
    if (score > limit) continue;
    for (const id of index.byKey.get(k)!) if (score < (best.get(id) ?? Infinity)) best.set(id, score);
  }
  return [...best]
    .sort((a, b) => a[1] - b[1] || (index.fame.get(b[0]) ?? 0) - (index.fame.get(a[0]) ?? 0))
    .slice(0, max)
    .map(([id]) => id);
}
