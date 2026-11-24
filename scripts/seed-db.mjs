// Copies src/data/pokemon.json into the Supabase `pokemon` table.
// Run with: npm run seed   (reads SUPABASE_URL / SUPABASE_SECRET_KEY from .env.local)
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const all = JSON.parse(await readFile(new URL('../src/data/pokemon.json', import.meta.url), 'utf8'));

const rows = all.map(p => ({
  id: p.id, slug: p.slug, name: p.name, generation: p.gen, types: p.types, color: p.color,
  height_dm: p.h, weight_hg: p.w, is_legendary: p.leg, is_mythical: p.myth, is_baby: p.baby,
  evolves_from: p.from, familiarity: p.fam, meme_pick: p.meme,
}));

for (let i = 0; i < rows.length; i += 500) {
  const { error } = await db.from('pokemon').upsert(rows.slice(i, i + 500));
  if (error) { console.error('Upsert failed:', error.message); process.exit(1); }
}
const { count, error } = await db.from('pokemon').select('id', { count: 'exact', head: true });
if (error) { console.error(error.message); process.exit(1); }
console.log(`Seeded ${rows.length} Pokémon; table now has ${count} rows.`);
