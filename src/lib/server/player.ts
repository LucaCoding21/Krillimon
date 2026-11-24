import 'server-only';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';

const COOKIE = 'tg_player';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Players are anonymous: a random id in an HttpOnly cookie, like a browser-bound save file.
export async function playerId(create = false): Promise<string | null> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing && UUID.test(existing)) return existing;
  if (!create) return null;
  const id = randomUUID();
  store.set(COOKIE, id, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 400,
  });
  return id;
}
