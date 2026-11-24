import 'server-only';
import { GameError } from './game-service';
import { playerId } from './player';

// Runs a route body with the player's id, turning GameErrors into clean JSON errors.
export async function withPlayer(create: boolean, body: (player: string) => Promise<unknown>) {
  try {
    const player = await playerId(create);
    if (!player) return Response.json({ error: 'Start a game first.' }, { status: 401 });
    return Response.json(await body(player), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof GameError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}
