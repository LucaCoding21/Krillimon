// Builds src/data/pokemon.json from PokéAPI's published CSV data
// (https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv).
// Run with: npm run data
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATION_BASE, STARS, MEME_PICKS } from './familiarity.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cacheDir = path.join(root, 'scripts', '.cache');
const outFile = path.join(root, 'src', 'data', 'pokemon.json');
const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const ENGLISH = '9';

// Simple CSV parser (handles quoted fields with commas).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter(r => r.length === header.length).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function csv(name) {
  const file = path.join(cacheDir, `${name}.csv`);
  if (!existsSync(file)) {
    const res = await fetch(BASE + `${name}.csv`);
    if (!res.ok) throw new Error(`Download failed for ${name}.csv: ${res.status}`);
    await writeFile(file, await res.text());
  }
  return parseCsv(await readFile(file, 'utf8'));
}

// Small deterministic wobble so Pokémon with the same default don't tie.
function jitter(slug) {
  let h = 2166136261;
  for (const ch of slug) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 7) - 3; // -3..+3
}

// Starter families (all three stages) for each generation.
const STARTER_RANGES = [[1, 9], [152, 160], [252, 260], [387, 395], [495, 503], [650, 658], [722, 730], [810, 818], [906, 914]];
const isStarter = id => STARTER_RANGES.some(([a, b]) => id >= a && id <= b);

await mkdir(cacheDir, { recursive: true });
await mkdir(path.dirname(outFile), { recursive: true });

const [
  species, names, pokemon, pokemonTypes, types, colors,
  pokemonAbilities, abilityNames, pokemonEggs, eggNames, pokemonStats, evolutions, items, shapes,
] = await Promise.all([
  csv('pokemon_species'), csv('pokemon_species_names'), csv('pokemon'),
  csv('pokemon_types'), csv('types'), csv('pokemon_colors'),
  csv('pokemon_abilities'), csv('ability_names'), csv('pokemon_egg_groups'), csv('egg_group_prose'),
  csv('pokemon_stats'), csv('pokemon_evolution'), csv('items'), csv('pokemon_shapes'),
]);

const typeName = Object.fromEntries(types.map(t => [t.id, t.identifier]));
const colorName = Object.fromEntries(colors.map(c => [c.id, c.identifier]));
const displayName = Object.fromEntries(names.filter(n => n.local_language_id === ENGLISH).map(n => [n.pokemon_species_id, n.name]));
const defaultForm = Object.fromEntries(pokemon.filter(p => p.is_default === '1').map(p => [p.species_id, p]));
const typesByPokemon = {};
for (const t of pokemonTypes) (typesByPokemon[t.pokemon_id] ??= []).push(t);

// Abilities (hidden ones included: "can have"), egg groups and base stats.
const abilityName = Object.fromEntries(abilityNames.filter(n => n.local_language_id === ENGLISH).map(n => [n.ability_id, n.name]));
const abilitiesByPokemon = {};
for (const a of pokemonAbilities.sort((x, y) => x.slot - y.slot)) {
  const name = abilityName[a.ability_id];
  const list = (abilitiesByPokemon[a.pokemon_id] ??= []);
  if (name && !list.includes(name)) list.push(name);
}
const eggName = Object.fromEntries(eggNames.filter(n => n.local_language_id === ENGLISH).map(n => [n.egg_group_id, n.name]));
const eggsBySpecies = {};
for (const e of pokemonEggs) (eggsBySpecies[e.species_id] ??= []).push(eggName[e.egg_group_id]);
const statsByPokemon = {};
for (const st of pokemonStats) (statsByPokemon[st.pokemon_id] ??= [0, 0, 0, 0, 0, 0])[Number(st.stat_id) - 1] = Number(st.base_stat);
const shapeName = Object.fromEntries(shapes.map(x => [x.id, x.identifier]));
const genus = Object.fromEntries(names.filter(n => n.local_language_id === ENGLISH).map(n => [n.pokemon_species_id, n.genus.replace(/\s*Pokémon$/, '')]));

// How each species is reached by evolving: 'level', 'trade', 'friendship', an item (e.g. 'fire-stone'), or 'other'.
const itemName = Object.fromEntries(items.map(i => [i.id, i.identifier]));
const evoBySpecies = {};
for (const e of evolutions) {
  const tags = (evoBySpecies[e.evolved_species_id] ??= new Set());
  if (e.evolution_trigger_id === '2') tags.add('trade');
  else if (e.evolution_trigger_id === '3' && itemName[e.trigger_item_id]) tags.add(itemName[e.trigger_item_id]);
  else if (e.evolution_trigger_id === '1' && e.minimum_happiness) tags.add('friendship');
  else if (e.evolution_trigger_id === '1') tags.add('level');
  else tags.add('other');
}

// Alternate forms: Mega Evolutions, Gigantamax and regional variants.
const FORM_TAGS = { mega: /-mega(-[xyz])?$/, gmax: /-gmax$/, alola: /-alola(-|$)/, galar: /-galar(-|$)/, hisui: /-hisui(-|$)/, paldea: /-paldea(-|$)/ };
const formsBySpecies = {};
for (const p of pokemon.filter(p => p.is_default !== '1')) {
  for (const [tag, re] of Object.entries(FORM_TAGS)) {
    const list = (formsBySpecies[p.species_id] ??= []);
    if (re.test(p.identifier) && !list.includes(tag)) list.push(tag);
  }
}

// Evolution-family facts: family size and longest chain.
const byId = Object.fromEntries(species.map(s => [s.id, s]));
const stageOf = s => (s.evolves_from_species_id ? 1 + stageOf(byId[s.evolves_from_species_id]) : 1);
const family = {};
for (const s of species) (family[s.evolution_chain_id] ??= []).push(s);

const unknownStars = Object.keys(STARS).filter(slug => !species.some(s => s.identifier === slug));
const unknownMemes = MEME_PICKS.filter(slug => !species.some(s => s.identifier === slug));
if (unknownStars.length || unknownMemes.length) {
  console.warn('Unknown slugs in familiarity.mjs:', [...unknownStars, ...unknownMemes].join(', '));
}

const out = species.map(s => {
  const id = Number(s.id);
  const form = defaultForm[s.id];
  const fam = family[s.evolution_chain_id];
  const leg = s.is_legendary === '1';
  const myth = s.is_mythical === '1';
  let familiarity = STARS[s.identifier];
  if (familiarity === undefined) {
    familiarity = GENERATION_BASE[s.generation_id] + jitter(s.identifier)
      + (isStarter(id) ? 14 : 0) + (leg ? 8 : 0) + (myth ? 4 : 0);
    familiarity = Math.max(5, Math.min(90, familiarity));
  }
  return {
    id,
    slug: s.identifier,
    name: displayName[s.id] ?? s.identifier,
    gen: Number(s.generation_id),
    types: (typesByPokemon[form?.id] ?? []).sort((a, b) => a.slot - b.slot).map(t => typeName[t.type_id]),
    color: colorName[s.color_id] ?? null,
    h: form ? Number(form.height) : null, // decimetres
    w: form ? Number(form.weight) : null, // hectograms
    leg, myth,
    baby: s.is_baby === '1',
    from: s.evolves_from_species_id ? Number(s.evolves_from_species_id) : null,
    stage: stageOf(s),
    familySize: fam.length,
    familyDepth: Math.max(...fam.map(stageOf)),
    fam: familiarity,
    meme: MEME_PICKS.includes(s.identifier),
    abilities: abilitiesByPokemon[form?.id] ?? [],
    eggs: (eggsBySpecies[s.id] ?? []).filter(Boolean),
    stats: statsByPokemon[form?.id] ?? null, // hp, atk, def, spa, spd, spe
    gender: Number(s.gender_rate), // -1 genderless, 0 always male, 8 always female
    shape: shapeName[s.shape_id] ?? null,
    genus: genus[s.id] ?? null,
    evo: [...(evoBySpecies[s.id] ?? [])],
    forms: formsBySpecies[s.id] ?? [],
  };
}).sort((a, b) => a.id - b.id);

await writeFile(outFile, JSON.stringify(out));
console.log(`Wrote ${out.length} Pokémon to ${path.relative(root, outFile)}`);
console.log('Sample:', out.filter(p => [25, 132, 399, 1000].includes(p.id)).map(p => `${p.name} (${p.types.join('/')}, fam ${p.fam}${p.meme ? ', meme' : ''})`).join('; '));
