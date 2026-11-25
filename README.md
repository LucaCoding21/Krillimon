# Tall Grass 🌿

Daily Pokémon rarity trivia. Something rustles in the tall grass, you get a prompt and
25 seconds, and any Pokémon that fits pops out. Catch it and it drops down a shaft into
the earth: the fewer people who'd think of it, the deeper it digs.

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

Every point is 10 m of depth, and depth is what the game shows.

| Tier | Ball | Points | Depth | Rule |
|---|---|---|---|---|
| Common | Poké Ball | 10 | +100 m | Most familiar 15% of valid answers |
| Meme Pick | Premier Ball | 15 | +150 m | Famous "obscure" picks (Bidoof, Shuckle, …), capped |
| Uncommon | Great Ball | 30 | +300 m | Next 25% |
| Rare | Ultra Ball | 60 | +600 m | Next 30% |
| Ultra Rare | Luxury Ball | 85 | +850 m | Least familiar 30% |
| Shiny | Master Ball | 100 | +1,000 m | One hidden gem per prompt; revealed in its shiny colours at the bottom |
| Got Away | none | 0 | none | Wrong, skipped or out of time |

Max 600 points (6,000 m). Titles: Youngster (0), Ace Trainer (120), Gym Leader (220), Elite Four (320), Champion (420).

Rarity comes from one **familiarity** number per Pokémon (1–100) in
`scripts/familiarity.mjs`: hand-set for well-known Pokémon, a per-generation default
for the rest. Edit it, then `npm run data && npm run seed`. New puzzles pick up the
change; puzzles already played keep their frozen tiers.

## The dig (the payoff)

The answer box is live the moment the prompt appears (no read-ahead lock), and Enter gets
an instant response (the grass bursts) while the server checks the answer.

Each round is an encounter on a floor somewhere down the shaft (`src/components/Scene.tsx`):
your partner on the near pad, the grass rustling on the far pad (it twitches as you type and
shakes when time is short). Answer, and:

1. **Catch** (~1 s): the Pokémon pops out and one plain Poké Ball catches it. Nothing on
   screen gives away the tier, and a shiny still looks normal.
2. **Fall** (the reveal): the floor opens and the ball drops down the shaft. Below you are
   six ledges, one per tier (Common at +100 m … Shiny at +1,000 m). The ball smashes through
   every ledge your answer beats, with a rising note, a shake and an upgrade to the next ball
   at each one. It lands on the ledge of its tier. A Common drops one short ledge and lands with a dull
   thud; a Shiny breaks five ledges and lands as a Master Ball with a gold flash.
3. **Land**: a new floor forms, the ball opens, and your catch is your partner from then on.

The camera chases the ball through nine layers of rock, which get darker and stranger:
Tall Grass, Root Tunnels, Mossy Grotto, Crystal Cavern, Echo Caverns, Magma Chamber, Fossil
Layer, Ancient Ruins and The Rift. A banner marks each new layer. The world is a vertical
cross-section (`World.tsx`) moved by a camera every frame without re-rendering. All the art
is procedural pixel art in `art.ts`: original shapes recoloured per layer.

Preview every layer and fire test falls for any tier at `/dev/biomes` while running
`npm run dev`.

Each floor is a **stadium**: a battle background from Pokémon Showdown (`public/stadium/`,
self-hosted), picked per layer and colour-graded darker the deeper it is (`STRATA` in `art.ts`).
Falling takes the camera out of one stadium, down the rock shaft past the ledges, and the ball
crashes into the next one. The grass on the far pad is a patch of separate clumps that sway,
ripple, shed leaves and hide a pair of blinking eyes; it twitches as you type, thrashes when
time is short and bursts apart when you answer.

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
