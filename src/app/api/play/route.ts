import { startGame } from '@/lib/server/game-service';
import { readJson, withPlayer } from '@/lib/server/http';

// POST { mode: 'daily' | 'practice' } → starts (or resumes today's) run.
export async function POST(request: Request) {
  const { mode } = await readJson(request);
  return withPlayer(true, player => startGame(player, mode === 'practice' ? 'practice' : 'daily'));
}
