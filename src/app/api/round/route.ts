import { skipRound, startRound } from '@/lib/server/game-service';
import { readJson, withPlayer } from '@/lib/server/http';

// POST { runId, action: 'start' | 'skip' } → starts the round clock, or records a miss.
export async function POST(request: Request) {
  const { runId, action } = await readJson(request);
  return withPlayer(false, player =>
    action === 'skip' ? skipRound(String(runId), player) : startRound(String(runId), player));
}
