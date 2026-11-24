import { submitGuess } from '@/lib/server/game-service';
import { readJson, withPlayer } from '@/lib/server/http';

// POST { runId, answer } → checks the answer on the server; answers never reach the browser.
export async function POST(request: Request) {
  const { runId, answer } = await readJson(request);
  return withPlayer(false, player => submitGuess(String(runId), player, answer));
}
