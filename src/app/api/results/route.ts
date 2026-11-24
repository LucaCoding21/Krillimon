import { getResults } from '@/lib/server/game-service';
import { withPlayer } from '@/lib/server/http';

// GET ?runId=… → full answers and score distribution, only once the run is finished.
export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get('runId') ?? '';
  return withPlayer(false, player => getResults(runId, player));
}
