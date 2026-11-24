# Tall Grass 🌿

Daily Pokémon rarity trivia in a battle format. Something rustles in the tall grass,
you get a prompt and 25 seconds, and any Pokémon that fits pops out. The fewer people
who'd think of it, the rarer the ball you throw and the more it's worth.

Next.js 16 (App Router) + Supabase Postgres. Pokémon data from [PokéAPI](https://pokeapi.co).

## Run it

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + keys
npm run dev                  # http://localhost:3000

# or pull the env vars from the linked Vercel project:
vercel env pull .env.local --environment=development
```

First-time database setup:

1. Run `supabase/migrations/0001_init.sql` in the Supabase SQL Editor.
2. `npm run data` downloads PokéAPI's CSVs and builds `src/data/pokemon.json` (already committed).
3. `npm run seed` copies the Pokémon into the `pokemon` table.

`npm test` checks the answer matcher and the puzzle generator.

## Scoring

| Tier | Ball | Points | Wobbles | Rule |
|---|---|---|---|---|
| Common | Poké Ball | 10 | 1 | Most familiar 15% of valid answers |
| Meme Pick | Premier Ball | 15 | 1 | Famous "obscure" picks (Bidoof, Shuckle, …), capped |
| Uncommon | Great Ball | 30 | 2 | Next 25% |
| Rare | Ultra Ball | 60 | 3 | Next 30% |
| Ultra Rare | Luxury Ball | 85 | 3 | Least familiar 30% |
| Shiny | Master Ball | 100 | 3 | One hidden gem per prompt; appears in its shiny colors |
| Got Away | none | 0 | none | Wrong, skipped or out of time |

Max 600. Titles: Youngster (0), Ace Trainer (120), Gym Leader (220), Elite Four (320), Champion (420).

Rarity comes from one **familiarity** number per Pokémon (1–100) in
`scripts/familiarity.mjs`: hand-set for well-known Pokémon, a per-generation default
for the rest. Edit it, then `npm run data && npm run seed`. New puzzles pick up the
change; puzzles already played keep their frozen tiers.

## The battle (the payoff)

Each round is an encounter (`src/components/Arena.tsx`): your partner stands on the near
pad (an animated back sprite), and tall grass rustles on the far pad. Answer, and the catch
plays out in beats: **reveal** (the Pokémon bursts out, the wild card fills its rarity meter) →
**throw** (the tier's ball arcs and spins) → **absorb** (flash, the Pokémon shrinks in) →
**shake** (the ball drops and wobbles) → **caught** (click, star burst). Your catch is your
partner next round, and the results screen sends your whole team out one ball at a time.

Depth = score × 10 m. The arena moves through nine biomes as you score, and the time of
day moves with it: morning in Sunny Meadow, sunset on Ember Peak, midnight in Phantom
Ruins, dawn at the Sky Sanctuary. The depth gauge on the right tracks it, and a "Now
entering…" banner marks each new biome. World art is procedural pixel art in
`src/components/art.ts` (original shapes + per-biome palettes); `Backdrop.tsx` renders it.
Preview every biome's arena at `/dev/biomes` while running `npm run dev`.

Pokémon sprites are the [Pokémon Showdown](https://play.pokemonshowdown.com/sprites/) /
Smogon Sprite Project animated sprites, loaded from [PokéAPI's sprite mirror](https://github.com/PokeAPI/sprites)
(front, back and shiny), with Showdown's Gen 5-style sprites as a fallback for the 14
newest Pokémon. Ball art is PokéAPI's item sprites. See `src/components/sprites.tsx`.

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
from PokéAPI's sprite repo; self-host them before a big public launch.

Fan-made; not affiliated with Nintendo, Game Freak or The Pokémon Company.
