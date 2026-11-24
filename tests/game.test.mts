import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generatePuzzle, buildCandidates, ROUNDS, TIERS, type Pokemon } from '../src/lib/game.ts';
import { buildNameIndex, matchPokemon } from '../src/lib/match.ts';

const dex: Pokemon[] = JSON.parse(readFileSync(new URL('../src/data/pokemon.json', import.meta.url), 'utf8'));
const index = buildNameIndex(dex);
const byId = new Map(dex.map(p => [p.id, p]));
const nameOf = (input: string) => matchPokemon(input, index)?.ids.map(id => byId.get(id)!.name);

test('matches names forgivingly', () => {
  assert.deepEqual(nameOf('pikachu'), ['Pikachu']);
  assert.deepEqual(nameOf('  PIKACHU! '), ['Pikachu']);
  assert.deepEqual(nameOf('pikachoo'), ['Pikachu']);          // typo
  assert.deepEqual(nameOf('Mr Mime'), ['Mr. Mime']);
  assert.deepEqual(nameOf('farfetchd'), ['Farfetch’d']);
  assert.deepEqual(nameOf('flabebe'), ['Flabébé']);
  assert.deepEqual(nameOf('type null'), ['Type: Null']);
  assert.deepEqual(nameOf('ho oh'), ['Ho-Oh']);
  assert.deepEqual(nameOf('nidoran'), ['Nidoran♀', 'Nidoran♂']);
  assert.deepEqual(nameOf('Nidoran♂'), ['Nidoran♂']);
  assert.deepEqual(nameOf('mew'), ['Mew']);
  assert.equal(matchPokemon('mwe', index), null);               // too short to typo-fix
  assert.equal(matchPokemon('xyzzyq', index), null);
  assert.equal(matchPokemon('', index), null);
});

test('puzzles are deterministic, varied and well-formed', () => {
  const candidates = buildCandidates(dex);
  const a = generatePuzzle(dex, 'daily-2026-11-24', candidates);
  const b = generatePuzzle(dex, 'daily-2026-11-24', candidates);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, generatePuzzle(dex, 'daily-2026-11-25', candidates));

  for (let day = 0; day < 200; day++) {
    const puzzle = generatePuzzle(dex, `seed-${day}`, candidates);
    assert.equal(puzzle.length, ROUNDS);
    assert.equal(new Set(puzzle.map(p => p.kind)).size, ROUNDS, 'six different kinds of prompt');
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
});

test('preview: one puzzle with sample answers per tier', () => {
  for (const p of generatePuzzle(dex, 'daily-2026-11-24')) {
    const by = (t: string) => p.answers.filter(x => x.tier === t).slice(0, 4).map(x => byId.get(x.id)!.name).join(', ');
    console.log(`\n${p.text}  (${p.answers.length} answers)\n  common: ${by('common')}\n  uncommon: ${by('uncommon')}\n  rare: ${by('rare')}\n  ultra: ${by('ultra')}\n  shiny: ${by('shiny')}${by('meme') ? `\n  meme: ${by('meme')}` : ''}`);
  }
});
