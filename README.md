# Tall Grass 🌿

Daily Pokémon rarity trivia. Six prompts, 25 seconds each. Any Pokémon that fits
counts, and the fewer people who'd think of it, the more it's worth.

Next.js 16 (App Router) + Supabase Postgres. Pokémon data from [PokéAPI](https://pokeapi.co).

## Run it

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + keys
npm run dev                  # http://localhost:3000
```

First-time database setup:

1. Run `supabase/migrations/0001_init.sql` in the Supabase SQL Editor.
2. `npm run data` downloads PokéAPI's CSVs and builds `src/data/pokemon.json` (already committed).
3. `npm run seed` copies the Pokémon into the `pokemon` table.

`npm test` checks the answer matcher and the puzzle generator.

## Scoring

| Tier | Points | Rule |
|---|---|---|
| 🌱 Common | 10 | Most familiar 15% of valid answers |
| 🤡 Meme Pick | 15 | Famous "obscure" picks (Bidoof, Shuckle, …), capped |
| 🌿 Uncommon | 30 | Next 25% |
| 💎 Rare | 60 | Next 30% |
| 🔮 Ultra Rare | 85 | Least familiar 30% |
| ✨ Shiny | 100 | One hidden gem per prompt (from the Ultra Rare group) |
| 💨 Got Away | 0 | Wrong, skipped or out of time |

Max 600. Titles: Youngster (0), Ace Trainer (120), Gym Leader (220), Elite Four (320), Champion (420).

Rarity comes from one **familiarity** number per Pokémon (1–100) in
`scripts/familiarity.mjs`: hand-set for well-known Pokémon, a per-generation default
for the rest. Edit it, then `npm run data && npm run seed`. New puzzles pick up the
change; puzzles already played keep their frozen tiers.

## The Expedition (the payoff animation)

Distance = score × 10 m. Each catch pops out of the tall grass, joins your party, and
the party walks the route through nine biomes (Sunny Meadow → Sky Sanctuary), with
signposts, "Now entering…" banners and footstep/jingle sounds. Results replay the whole
journey. World art is procedural pixel art in `src/components/art.ts` (shapes + per-biome
palettes, all original); `src/components/Trek.tsx` renders it. Preview every biome at
`/dev/biomes` while running `npm run dev`.

Animated Pokémon sprites come from the [PMD Sprite Repository](https://github.com/PMDCollab/SpriteCollab)
(CC BY-NC 4.0, credit to its artists), drawn frame by frame on a canvas (`PmdSprite.tsx`).

## How it fits together

```
Browser ──► /api/play     start or resume a run (anonymous cookie player id)
        ──► /api/round    start the round clock / give up
        ──► /api/guess    server matches the name, checks the deadline, scores it
        ──► /api/results  answers + score distribution, only after the last round
                │
                ▼
     Supabase (secret key, server only)
     pokemon · puzzles · runs · answers   (RLS on, no policies → public key reads nothing)
```

- **puzzles**: one row per day (`2026-11-24`) or practice game; `prompts` JSON holds each prompt's full answer list with tiers, generated once from a seeded RNG.
- **runs**: one per player per puzzle (a unique index enforces one daily play). Tracks the current round, when its clock started, and the running score.
- **answers**: one row per round. `record_answer()` writes it and advances the run in one transaction, so double submits and timeout races can't double-score.
- **daily_stats()**: the "better than X%" number and histogram.

## Not in the MVP

Accounts / cross-device sync, rate limiting, caching today's prompts at the edge, and
precomputing stats (worth doing before ~100k daily players). Sprites are hot-linked
from PokéAPI's sprite repo, which is fine locally but needs a look before a public launch.

Fan-made; not affiliated with Nintendo, Game Freak or The Pokémon Company.
