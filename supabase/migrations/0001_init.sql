-- Tall Grass: daily Pokémon rarity trivia.
-- Run this once in the Supabase SQL Editor (or with `supabase db push`).
--
-- Security model: every table has row-level security ON and NO policies, so the
-- publishable/anon key can read nothing. Only the server (secret key) touches the
-- database, which keeps answer lists hidden from players.

-- Every Pokémon the game knows about. Seeded from PokéAPI by `npm run seed`.
create table if not exists public.pokemon (
  id            int primary key,          -- National Pokédex number
  slug          text not null unique,     -- PokéAPI identifier, e.g. 'mr-mime'
  name          text not null,            -- display name, e.g. 'Mr. Mime'
  generation    int  not null,
  types         text[] not null,
  color         text,
  height_dm     int,
  weight_hg     int,
  is_legendary  boolean not null default false,
  is_mythical   boolean not null default false,
  is_baby       boolean not null default false,
  evolves_from  int,
  familiarity   int  not null check (familiarity between 1 and 100), -- how many people know it
  meme_pick     boolean not null default false -- the famous "obscure" picks everybody says
);

-- One row per puzzle. Daily puzzles use the date as id; practice ones get a random id.
-- prompts = [{ id, kind, text, answers: [{ id: <dex no>, tier }] }]
-- Tiers are frozen when the puzzle is generated, so later familiarity edits
-- never change a puzzle people have already played.
create table if not exists public.puzzles (
  id          text primary key,
  kind        text not null check (kind in ('daily', 'practice')),
  day_number  int,
  seed        text not null,
  prompts     jsonb not null,
  created_at  timestamptz not null default now()
);

-- One play-through of a puzzle by one player (anonymous cookie id).
create table if not exists public.runs (
  id                uuid primary key default gen_random_uuid(),
  player_id         text not null,
  puzzle_id         text not null references public.puzzles(id),
  mode              text not null check (mode in ('daily', 'practice')),
  next_round        int  not null default 0,
  round_started_at  timestamptz,
  score             int  not null default 0,
  completed         boolean not null default false,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);
create unique index if not exists runs_one_daily_per_player
  on public.runs (player_id, puzzle_id) where mode = 'daily';
create index if not exists runs_daily_scores
  on public.runs (puzzle_id, score) where mode = 'daily' and completed;
create index if not exists runs_player on public.runs (player_id, created_at desc);

-- One row per round of a run.
create table if not exists public.answers (
  run_id      uuid not null references public.runs(id) on delete cascade,
  round       int  not null,
  raw_answer  text,
  pokemon_id  int references public.pokemon(id),
  tier        text not null check (tier in ('common', 'meme', 'uncommon', 'rare', 'ultra', 'shiny', 'miss')),
  score       int  not null check (score in (0, 10, 15, 30, 60, 85, 100)),
  created_at  timestamptz not null default now(),
  primary key (run_id, round)
);
create index if not exists answers_pokemon on public.answers (pokemon_id);

alter table public.pokemon enable row level security;
alter table public.puzzles enable row level security;
alter table public.runs    enable row level security;
alter table public.answers enable row level security;

-- Records one round's result and advances the run in a single transaction.
-- Returns false if the round was already recorded (double submit) or the run is over.
create or replace function public.record_answer(
  p_run uuid, p_round int, p_raw text, p_pokemon int, p_tier text, p_score int, p_rounds int
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.runs
     set next_round       = next_round + 1,
         round_started_at = null,
         score            = score + p_score,
         completed        = (next_round + 1 >= p_rounds),
         completed_at     = case when next_round + 1 >= p_rounds then now() end
   where id = p_run and next_round = p_round and not completed;
  if not found then
    return false;
  end if;
  insert into public.answers (run_id, round, raw_answer, pokemon_id, tier, score)
  values (p_run, p_round, p_raw, p_pokemon, p_tier, p_score);
  return true;
end;
$$;

-- Score distribution for a daily puzzle: total players, how many scored below
-- p_score, and a histogram in 50-point buckets.
create or replace function public.daily_stats(p_puzzle text, p_score int)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'players', (select count(*) from public.runs
                 where puzzle_id = p_puzzle and mode = 'daily' and completed),
    'below',   (select count(*) from public.runs
                 where puzzle_id = p_puzzle and mode = 'daily' and completed and score < p_score),
    'buckets', coalesce((
      select jsonb_object_agg(bucket, players)
        from (select least(score / 50, 12) as bucket, count(*) as players
                from public.runs
               where puzzle_id = p_puzzle and mode = 'daily' and completed
               group by 1) b
    ), '{}'::jsonb)
  );
$$;

-- Only the server may call these.
revoke all on function public.record_answer(uuid, int, text, int, text, int, int) from public, anon, authenticated;
revoke all on function public.daily_stats(text, int) from public, anon, authenticated;
grant execute on function public.record_answer(uuid, int, text, int, text, int, int) to service_role;
grant execute on function public.daily_stats(text, int) to service_role;
