import 'server-only';
import { randomUUID } from 'node:crypto';
import { db } from './db';
import { BY_ID, CANDIDATES, DEX, NAME_INDEX, pokeRef } from './dex';
import {
  generatePuzzle, shareText, titleFor, GRACE_MS, MAX_SCORE, PREVIEW_MS, ROUND_MS, ROUNDS, TIERS,
  type PuzzlePrompt, type TierId,
} from '../game';
import { matchPokemon, suggestPokemon } from '../match';
import type { GuessResult, PokeRef, ResultsPayload, RoundResult, RunState } from '../api-types';

const LAUNCH_DATE = '2026-11-24';
const RUN_COLUMNS = 'id,player_id,puzzle_id,mode,next_round,round_started_at,score,completed';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Mode = 'daily' | 'practice';
type PuzzleRow = { id: string; kind: Mode; day_number: number | null; prompts: PuzzlePrompt[] };
type RunRow = {
  id: string; player_id: string; puzzle_id: string; mode: Mode; next_round: number;
  round_started_at: string | null; score: number; completed: boolean;
};
type AnswerRow = { round: number; raw_answer: string | null; pokemon_id: number | null; tier: TierId; score: number };

export class GameError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// The daily puzzle flips at midnight US Eastern.
export function todayId(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const dayNumber = (date: string) => Math.round((Date.parse(date) - Date.parse(LAUNCH_DATE)) / 86_400_000) + 1;

function check<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new Error(`Database error: ${result.error.message}`);
  return result.data;
}

async function getPuzzle(id: string) {
  return check(await db.from('puzzles').select('id,kind,day_number,prompts').eq('id', id).maybeSingle()) as PuzzleRow | null;
}

// Puzzles are generated once and stored, so everyone gets identical tiers.
async function ensurePuzzle(id: string, kind: Mode, seed: string, day: number | null): Promise<PuzzleRow> {
  const existing = await getPuzzle(id);
  if (existing) return existing;
  const prompts = generatePuzzle(DEX, seed, CANDIDATES);
  const { error } = await db.from('puzzles').insert({ id, kind, seed, day_number: day, prompts });
  if (error && error.code !== '23505') throw new Error(`Database error: ${error.message}`);
  return (await getPuzzle(id))!;
}

async function findDailyRun(player: string, date: string) {
  return check(await db.from('runs').select(RUN_COLUMNS)
    .eq('player_id', player).eq('puzzle_id', date).eq('mode', 'daily').maybeSingle()) as RunRow | null;
}

async function loadRun(runId: string, player: string): Promise<RunRow> {
  if (!UUID.test(runId)) throw new GameError('Unknown run.', 404);
  const run = check(await db.from('runs').select(RUN_COLUMNS).eq('id', runId).eq('player_id', player).maybeSingle()) as RunRow | null;
  if (!run) throw new GameError('Unknown run.', 404);
  return run;
}

async function getAnswers(runId: string) {
  return check(await db.from('answers').select('round,raw_answer,pokemon_id,tier,score').eq('run_id', runId).order('round')) as AnswerRow[];
}

const roundResult = (a: AnswerRow, puzzle: PuzzleRow): RoundResult => ({
  round: a.round, prompt: puzzle.prompts[a.round]?.text ?? '', rawAnswer: a.raw_answer,
  pokemon: a.pokemon_id ? pokeRef(a.pokemon_id) : null, tier: a.tier, score: a.score,
});

async function buildState(run: RunRow, puzzle: PuzzleRow): Promise<RunState> {
  const answers = await getAnswers(run.id);
  const startedAt = run.round_started_at ? Date.parse(run.round_started_at) : null;
  const prompt = run.completed ? null : puzzle.prompts[run.next_round];
  return {
    runId: run.id,
    mode: run.mode,
    label: run.mode === 'daily' ? `#${puzzle.day_number}` : 'Practice',
    rounds: ROUNDS,
    round: run.next_round,
    completed: run.completed,
    score: run.score,
    prompt: prompt ? { text: prompt.text } : null,
    answeringOpensAt: startedAt ? startedAt + PREVIEW_MS : null,
    deadline: startedAt ? startedAt + PREVIEW_MS + ROUND_MS : null,
    serverNow: Date.now(),
    results: answers.map(a => roundResult(a, puzzle)),
  };
}

async function stateFor(runId: string, player: string) {
  const run = await loadRun(runId, player);
  return buildState(run, (await getPuzzle(run.puzzle_id))!);
}

// Writes one round's result and advances the run atomically (see record_answer in SQL).
// Returns false if this round was already closed (e.g. the timeout won a race with a guess).
async function record(run: RunRow, raw: string | null, pokemonId: number | null, tier: TierId) {
  return check(await db.rpc('record_answer', {
    p_run: run.id, p_round: run.next_round, p_raw: raw, p_pokemon: pokemonId,
    p_tier: tier, p_score: TIERS[tier].score, p_rounds: ROUNDS,
  })) === true;
}

export async function startGame(player: string, mode: Mode): Promise<RunState> {
  if (mode === 'daily') {
    const date = todayId();
    const puzzle = await ensurePuzzle(date, 'daily', `daily-${date}`, dayNumber(date));
    let run = await findDailyRun(player, date);
    if (!run) {
      const { error } = await db.from('runs').insert({ player_id: player, puzzle_id: date, mode: 'daily' });
      if (error && error.code !== '23505') throw new Error(`Database error: ${error.message}`); // 23505 = already exists
      run = await findDailyRun(player, date);
    }
    return buildState(run!, puzzle);
  }
  const id = `practice-${randomUUID()}`;
  const puzzle = await ensurePuzzle(id, 'practice', id, null);
  const run = check(await db.from('runs').insert({ player_id: player, puzzle_id: id, mode: 'practice' }).select(RUN_COLUMNS).single()) as RunRow;
  return buildState(run, puzzle);
}

// Starts the clock for the current round. Calling it twice is harmless.
export async function startRound(runId: string, player: string): Promise<RunState> {
  const run = await loadRun(runId, player);
  if (!run.completed && !run.round_started_at) {
    check(await db.from('runs').update({ round_started_at: new Date().toISOString() })
      .eq('id', run.id).eq('next_round', run.next_round).is('round_started_at', null));
  }
  return stateFor(runId, player);
}

export async function submitGuess(runId: string, player: string, rawInput: unknown): Promise<GuessResult> {
  const run = await loadRun(runId, player);
  if (run.completed) throw new GameError('This run is already finished.', 409);
  if (!run.round_started_at) throw new GameError('This round has not started yet.', 409);
  const puzzle = (await getPuzzle(run.puzzle_id))!;
  const prompt = puzzle.prompts[run.next_round];
  const deadline = Date.parse(run.round_started_at) + PREVIEW_MS + ROUND_MS;
  const text = String(rawInput ?? '').trim().slice(0, 60);

  if (Date.now() > deadline + GRACE_MS) {
    await record(run, text || null, null, 'miss');
    return { status: 'timeout', state: await stateFor(runId, player) };
  }
  if (!text) return { status: 'rejected', reason: 'Type a Pokémon first.' };

  const ids = matchPokemon(text, NAME_INDEX);
  if (!ids) {
    // Not an exact name: ask "Did you mean…?" instead of guessing for the player.
    const close = suggestPokemon(text, NAME_INDEX);
    if (!close.length) return { status: 'rejected', reason: `“${text}” isn't a Pokémon we know.` };
    return { status: 'suggest', typed: text, options: close.map(pokeRef) };
  }
  const hit = ids.map(id => prompt.answers.find(a => a.id === id)).find(Boolean);
  if (!hit) return { status: 'rejected', reason: `${BY_ID.get(ids[0])?.name} doesn't fit this one.` };

  if (!(await record(run, text, hit.id, hit.tier))) {
    return { status: 'timeout', state: await stateFor(runId, player) };
  }
  return {
    status: 'accepted', tier: hit.tier, score: TIERS[hit.tier].score, pokemon: pokeRef(hit.id),
    state: await stateFor(runId, player),
  };
}

// Records a miss: used when time runs out or the player gives up on a round.
export async function skipRound(runId: string, player: string): Promise<RunState> {
  const run = await loadRun(runId, player);
  if (!run.completed && run.round_started_at) await record(run, null, null, 'miss');
  return stateFor(runId, player);
}

export async function getResults(runId: string, player: string): Promise<ResultsPayload> {
  const run = await loadRun(runId, player);
  if (!run.completed) throw new GameError('Finish all rounds to see the answers.', 409);
  const puzzle = (await getPuzzle(run.puzzle_id))!;
  const answers = await getAnswers(run.id);

  const rounds = puzzle.prompts.map((p, i) => {
    const mine = answers.find(a => a.round === i);
    const shiny = p.answers.find(a => a.tier === 'shiny');
    const examples: Partial<Record<TierId, PokeRef[]>> = {};
    for (const tier of ['common', 'uncommon', 'rare', 'ultra'] as TierId[]) {
      examples[tier] = p.answers.filter(a => a.tier === tier).slice(0, 3).map(a => pokeRef(a.id));
    }
    return {
      prompt: p.text,
      yours: mine ? roundResult(mine, puzzle) : null,
      shiny: shiny ? pokeRef(shiny.id) : null,
      totalAnswers: p.answers.length,
      examples,
    };
  });

  let stats: ResultsPayload['stats'] = null;
  if (run.mode === 'daily') {
    const s = check(await db.rpc('daily_stats', { p_puzzle: run.puzzle_id, p_score: run.score })) as
      { players: number; below: number; buckets: Record<string, number> };
    const others = s.players - 1;
    stats = {
      players: s.players,
      betterThan: others > 0 ? Math.round((s.below / others) * 100) : null,
      buckets: Array.from({ length: 13 }, (_, b) => s.buckets[String(b)] ?? 0),
      yourBucket: Math.min(Math.floor(run.score / 50), 12),
    };
  }

  const label = run.mode === 'daily' ? `#${puzzle.day_number}` : 'Practice';
  return {
    label, mode: run.mode, score: run.score, maxScore: MAX_SCORE,
    title: titleFor(run.score), rounds, stats,
    share: shareText(label, run.score, rounds.map(r => r.yours?.tier ?? 'miss')),
  };
}
