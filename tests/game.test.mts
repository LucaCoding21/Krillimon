import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generatePuzzle, buildCandidates, ROUNDS, TIERS, type Pokemon } from '../src/lib/game.ts';
import { buildNameIndex, matchPokemon, suggestPokemon } from '../src/lib/match.ts';

const dex: Pokemon[] = JSON.parse(readFileSync(new URL('../src/data/pokemon.json', import.meta.url), 'utf8'));
const index = buildNameIndex(dex);
const byId = new Map(dex.map(p => [p.id, p]));
const nameOf = (input: string) => matchPokemon(input, index)?.map(id => byId.get(id)!.name);
const suggestions = (input: string) => suggestPokemon(input, index).map(id => byId.get(id)!.name);

test('matches exact names forgivingly', () => {
  assert.deepEqual(nameOf('pikachu'), ['Pikachu']);
  assert.deepEqual(nameOf('  PIKACHU! '), ['Pikachu']);
  assert.equal(nameOf('pikachoo'), undefined);                 // typos go to "Did you mean…?"
  assert.deepEqual(nameOf('Mr Mime'), ['Mr. Mime']);
  assert.deepEqual(nameOf('farfetchd'), ['Farfetch’d']);
  assert.deepEqual(nameOf('flabebe'), ['Flabébé']);
  assert.deepEqual(nameOf('type null'), ['Type: Null']);
  assert.deepEqual(nameOf('ho oh'), ['Ho-Oh']);
  assert.deepEqual(nameOf('nidoran'), ['Nidoran♀', 'Nidoran♂']);
  assert.deepEqual(nameOf('Nidoran♂'), ['Nidoran♂']);
  assert.deepEqual(nameOf('mew'), ['Mew']);
  assert.equal(matchPokemon('xyzzyq', index), null);
  assert.equal(matchPokemon('', index), null);
});

test('suggests close names for typos, best first', () => {
  assert.equal(suggestions('pikachoo')[0], 'Pikachu');
  assert.equal(suggestions('pikahcu')[0], 'Pikachu');           // swapped letters
  assert.equal(suggestions('charzard')[0], 'Charizard');
  assert.equal(suggestions('gyrados')[0], 'Gyarados');
  assert.equal(suggestions('mwe')[0], 'Mew');
  assert.deepEqual(suggestions('char'), ['Charizard', 'Charmander', 'Charmeleon']); // unfinished: best-known first
  assert.ok(suggestions('chomp').includes('Garchomp'));
  assert.ok(suggestions('lucareo').includes('Lucario'));
  assert.ok(suggestions('char').length <= 3);
  assert.deepEqual(suggestions('xyzzyq'), []);
  assert.deepEqual(suggestions(''), []);
});

test('puzzles are deterministic, varied and well-formed', () => {
  const candidates = buildCandidates(dex);
  const a = generatePuzzle(dex, 'daily-2026-11-24', candidates);
  const b = generatePuzzle(dex, 'daily-2026-11-24', candidates);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, generatePuzzle(dex, 'daily-2026-11-25', candidates));

  const kinds = new Set<string>();
  for (let day = 0; day < 200; day++) {
    const puzzle = generatePuzzle(dex, `seed-${day}`, candidates);
    assert.equal(puzzle.length, ROUNDS);
    assert.equal(new Set(puzzle.map(p => p.kind)).size, ROUNDS, 'six different kinds of prompt');
    puzzle.forEach(p => kinds.add(p.kind));
    for (const prompt of puzzle) {
      assert.ok(prompt.answers.length >= 6, prompt.text);
      assert.equal(prompt.answers.filter(x => x.tier === 'shiny').length, 1, `one shiny: ${prompt.text}`);
      assert.equal(prompt.answers[0].tier, 'common', 'most familiar answer is Common');
      for (const ans of prompt.answers) {
        assert.ok(TIERS[ans.tier] && ans.tier !== 'miss');
        if (ans.tier === 'meme') assert.ok(byId.get(ans.id)!.meme);
      }
    }
  }
  assert.ok(kinds.size >= 25, `lots of kinds of prompt show up (${kinds.size})`);
});

test('the prompt catalogue is big and its answers are right', () => {
  const candidates = buildCandidates(dex);
  assert.ok(candidates.length >= 450, `${candidates.length} prompts`);
  const ids = candidates.map(c => `${c.kind}-${c.key}`);
  assert.equal(new Set(ids).size, ids.length, 'prompt ids are unique');
  const answersFor = (text: string) => {
    const c = candidates.find(x => x.text === text);
    assert.ok(c, `missing prompt: ${text}`);
    return c.ids.map(id => byId.get(id)!.name);
  };
  assert.ok(answersFor('Name a Pokémon with a 4× weakness to Ice').includes('Dragonite'));
  assert.ok(!answersFor('Name a Pokémon with a 4× weakness to Ice').includes('Charizard'));
  assert.ok(answersFor('Name a Pokémon that can have the ability Levitate').includes('Gengar') === false);
  assert.ok(answersFor('Name a Pokémon that can have the ability Levitate').includes('Bronzong'));
  assert.ok(answersFor("Name a Pokémon that's part of a Fire Stone evolution").includes('Vulpix'));
  assert.ok(answersFor("Name a Pokémon that's part of a Fire Stone evolution").includes('Arcanine'));
  assert.ok(answersFor("Name a Pokémon that's part of a trade evolution").includes('Machamp'));
  assert.ok(answersFor('Name a Pokémon that has a Mega Evolution').includes('Charizard'));
  assert.ok(answersFor('Name a Pokémon that has an Alolan form').includes('Vulpix'));
  assert.ok(answersFor('Name a genderless Pokémon').includes('Magnemite'));
  assert.ok(answersFor('Name a Pokémon with a base Speed of 100 or more').includes('Alakazam'));
  assert.ok(answersFor('Name an Ultra Beast').includes('Nihilego'));
  assert.ok(answersFor('Name a Pokémon with “Mouse” in its Pokédex category').includes('Pikachu'));
  assert.ok(answersFor('Name an Ice-type Pokémon').includes('Lapras'));
});

test('preview: one puzzle with sample answers per tier', () => {
  for (const p of generatePuzzle(dex, 'daily-2026-11-24')) {
    const by = (t: string) => p.answers.filter(x => x.tier === t).slice(0, 4).map(x => byId.get(x.id)!.name).join(', ');
    console.log(`\n${p.text}  (${p.answers.length} answers)\n  common: ${by('common')}\n  uncommon: ${by('uncommon')}\n  rare: ${by('rare')}\n  ultra: ${by('ultra')}\n  shiny: ${by('shiny')}${by('meme') ? `\n  meme: ${by('meme')}` : ''}`);
  }
});
