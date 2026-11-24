import 'server-only';
import data from '@/data/pokemon.json';
import { buildCandidates, type Pokemon } from '../game';
import { buildNameIndex } from '../match';

export const DEX = data as unknown as Pokemon[];
export const BY_ID = new Map(DEX.map(p => [p.id, p]));
export const NAME_INDEX = buildNameIndex(DEX);
export const CANDIDATES = buildCandidates(DEX);
export const pokeRef = (id: number) => ({ id, name: BY_ID.get(id)?.name ?? `#${id}`, types: BY_ID.get(id)?.types ?? [] });
