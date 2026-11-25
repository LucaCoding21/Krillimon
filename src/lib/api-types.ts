// Shapes the API sends to the browser. The browser never receives answer lists
// until a run is finished.
import type { TierId } from './game';

export type PokeRef = { id: number; name: string; types: string[] };

export type RoundResult = {
  round: number; prompt: string; rawAnswer: string | null;
  pokemon: PokeRef | null; tier: TierId; score: number;
};

export type RunState = {
  runId: string;
  mode: 'daily' | 'practice';
  label: string;                 // "#1" for daily, "Practice" otherwise
  rounds: number;
  round: number;                 // index of the round being played
  completed: boolean;
  score: number;
  prompt: { text: string } | null;
  answeringOpensAt: number | null; // ms epoch, server clock
  deadline: number | null;         // ms epoch, server clock
  serverNow: number;
  results: RoundResult[];
};

export type GuessResult =
  | { status: 'accepted'; tier: TierId; score: number; pokemon: PokeRef; state: RunState }
  | { status: 'rejected'; reason: string }
  | { status: 'suggest'; typed: string; options: PokeRef[] } // not an exact name: "Did you mean…?"
  | { status: 'timeout'; state: RunState };

export type ResultsRound = {
  prompt: string;
  yours: RoundResult | null;
  shiny: PokeRef | null;
  totalAnswers: number;
  examples: Partial<Record<TierId, PokeRef[]>>;
};

export type ResultsPayload = {
  label: string;
  mode: 'daily' | 'practice';
  score: number;
  maxScore: number;
  title: { name: string; text: string };
  rounds: ResultsRound[];
  stats: { players: number; betterThan: number | null; buckets: number[]; yourBucket: number } | null;
  share: string;
};
