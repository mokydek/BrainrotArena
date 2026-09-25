-- =====================================================================
--  Brainrot Arena — database schema for Supabase (Postgres 15+)
--  Idempotent: safe to run many times (SQL Editor -> New query -> Run).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
--  Streamers shown in the left / right leaderboards
-- ---------------------------------------------------------------------
create table if not exists public.streamers (
  id                 uuid primary key default gen_random_uuid(),
  side               text not null default 'left' check (side in ('left', 'right')),
  platform           text not null default 'tiktok'
                     check (platform in ('tiktok', 'youtube', 'twitch', 'kick', 'instagram', 'other')),
  handle             text not null,
  profile_url        text not null,
  display_name       text,
  avatar_url         text,
  verified           boolean not null default false,
  followers          bigint,
  is_live            boolean not null default false,
  live_url           text,
  viewers            integer,
  live_started_at    timestamptz,
  manual_live        boolean,                 -- null = auto detect, true/false = forced by admin
  live_checked_at    timestamptz,
  profile_checked_at timestamptz,
  fetch_error        text,
  sort_order         integer not null default 0,
  paid_until         timestamptz,             -- null = shown forever
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists streamers_side_idx on public.streamers (side, sort_order);

-- ---------------------------------------------------------------------
--  Players (unique nicknames). Token is stored only as sha256 hash.
-- ---------------------------------------------------------------------
create table if not exists public.players (
  id           uuid primary key default gen_random_uuid(),
  nickname     text not null,
  nickname_key text generated always as (lower(nickname)) stored,
  token_hash   text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists players_nickname_key_uidx on public.players (nickname_key);
create unique index if not exists players_token_hash_uidx on public.players (token_hash);

-- ---------------------------------------------------------------------
--  Contests (giveaways)
-- ---------------------------------------------------------------------
create table if not exists public.contests (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  title            text not null,
  prize            text,
  image_url        text,
  max_participants integer check (max_participants is null or max_participants > 0),
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz not null,
  status           text not null default 'active' check (status in ('active', 'finished', 'cancelled')),
  entries_count    integer not null default 0,
  server_seed_hash text not null,
  server_seed      text,          -- revealed only after the draw
  client_seed      text,
  winner_entry_id  uuid,
  winner_player_id uuid,
  winner_nickname  text,
  winner_index     integer,
  drawn_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- added later: participation conditions shown on the giveaway (one per line)
alter table public.contests add column if not exists conditions text;

create index if not exists contests_created_idx on public.contests (created_at desc);
create index if not exists contests_status_idx on public.contests (status, ends_at);

-- secret seeds are kept in a separate table that the public API cannot read
create table if not exists public.contest_secrets (
  contest_id  uuid primary key references public.contests (id) on delete cascade,
  server_seed text not null
);

create table if not exists public.contest_entries (
  id         uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  nickname   text not null,
  ticket     integer not null,
  created_at timestamptz not null default now(),
  unique (contest_id, player_id),
  unique (contest_id, ticket)
);

create index if not exists contest_entries_contest_idx on public.contest_entries (contest_id, ticket desc);

-- ---------------------------------------------------------------------
--  updated_at triggers
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists streamers_touch on public.streamers;
create trigger streamers_touch before update on public.streamers
  for each row execute function public.touch_updated_at();

drop trigger if exists contests_touch on public.contests;
create trigger contests_touch before update on public.contests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
--  Helpers
-- ---------------------------------------------------------------------
create or replace function public.server_now() returns timestamptz
language sql stable as $$ select now() $$;

create or replace function public.random_code(len integer default 10) returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  bytes bytea := extensions.gen_random_bytes(len);
  result text := '';
  i integer;
begin
  for i in 0 .. len - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end $$;

-- ---------------------------------------------------------------------
--  Create contest (seed commit happens atomically)
-- ---------------------------------------------------------------------
create or replace function public.create_contest(
  p_title text,
  p_prize text,
  p_image_url text,
  p_ends_at timestamptz,
  p_max_participants integer default null,
  p_starts_at timestamptz default null
) returns public.contests
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  seed text := encode(extensions.gen_random_bytes(32), 'hex');
  c public.contests;
  new_code text;
begin
  loop
    new_code := public.random_code(10);
    exit when not exists (select 1 from public.contests where code = new_code);
  end loop;

  insert into public.contests (code, title, prize, image_url, max_participants, starts_at, ends_at, server_seed_hash)
  values (
    new_code,
    p_title,
    nullif(p_prize, ''),
    nullif(p_image_url, ''),
    p_max_participants,
    coalesce(p_starts_at, now()),
    p_ends_at,
    encode(extensions.digest(seed, 'sha256'), 'hex')
  )
  returning * into c;

  insert into public.contest_secrets (contest_id, server_seed) values (c.id, seed);
  return c;
end $$;

-- ---------------------------------------------------------------------
--  Join contest (row lock -> no double tickets, capacity respected)
-- ---------------------------------------------------------------------
create or replace function public.join_contest(p_contest uuid, p_player uuid)
returns public.contest_entries
language plpgsql volatile security definer set search_path = public as $$
declare
  c public.contests;
  p public.players;
  e public.contest_entries;
begin
  select * into c from public.contests where id = p_contest for update;
  if not found then raise exception 'CONTEST_NOT_FOUND'; end if;
  if c.status <> 'active' or now() >= c.ends_at then raise exception 'CONTEST_CLOSED'; end if;
  if now() < c.starts_at then raise exception 'CONTEST_NOT_STARTED'; end if;

  select * into p from public.players where id = p_player;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  if exists (select 1 from public.contest_entries where contest_id = p_contest and player_id = p_player) then
    raise exception 'ALREADY_JOINED';
  end if;

  if c.max_participants is not null and c.entries_count >= c.max_participants then
    raise exception 'CONTEST_FULL';
  end if;

  insert into public.contest_entries (contest_id, player_id, nickname, ticket)
  values (p_contest, p_player, p.nickname, c.entries_count)
  returning * into e;

  update public.contests set entries_count = entries_count + 1 where id = p_contest;
  return e;
end $$;

-- ---------------------------------------------------------------------
--  Provably fair draw.
--    client_seed  = sha256( "ticket:nickname" lines joined by \n, ordered by ticket )
--    hash         = HMAC_SHA256( key = server_seed, message = code || ':' || client_seed )
--    winner_index = int(first 13 hex chars of hash) mod entries
--  Anyone can call it: it only finishes contests whose timer already ended,
--  and the result is fully determined by the seed committed at creation.
-- ---------------------------------------------------------------------
create or replace function public.draw_contest(p_contest uuid)
returns public.contests
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  c public.contests;
  seed text;
  cseed text;
  h text;
  n integer;
  idx integer;
  w public.contest_entries;
begin
  select * into c from public.contests where id = p_contest for update;
  if not found then raise exception 'CONTEST_NOT_FOUND'; end if;
  if c.status <> 'active' or now() < c.ends_at then
    return c; -- nothing to do (already drawn, cancelled or still running)
  end if;

  select server_seed into seed from public.contest_secrets where contest_id = c.id;
  select count(*)::integer into n from public.contest_entries where contest_id = c.id;

  select encode(extensions.digest(coalesce(string_agg(ticket::text || ':' || nickname, E'\n' order by ticket), ''), 'sha256'), 'hex')
    into cseed
    from public.contest_entries where contest_id = c.id;

  if n > 0 then
    h := encode(extensions.hmac(c.code || ':' || cseed, seed, 'sha256'), 'hex');
    idx := (('x' || lpad(substr(h, 1, 13), 16, '0'))::bit(64)::bigint % n)::integer;
    select * into w from public.contest_entries where contest_id = c.id order by ticket offset idx limit 1;
  end if;

  update public.contests set
    status           = 'finished',
    server_seed      = seed,
    client_seed      = cseed,
    winner_index     = idx,
    winner_entry_id  = w.id,
    winner_player_id = w.player_id,
    winner_nickname  = w.nickname,
    drawn_at         = now()
  where id = c.id
  returning * into c;

  return c;
end $$;

create or replace function public.draw_expired_contests()
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  cnt integer := 0;
begin
  for r in select id from public.contests where status = 'active' and ends_at <= now() loop
    perform public.draw_contest(r.id);
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;

-- ---------------------------------------------------------------------
--  Claim streamers whose live status is stale (used by the refresher)
-- ---------------------------------------------------------------------
create or replace function public.claim_stale_streamers(p_age_seconds integer default 60, p_limit integer default 8)
returns setof public.streamers
language plpgsql volatile security definer set search_path = public as $$
begin
  return query
  update public.streamers s
     set live_checked_at = now()
   where s.id in (
     select id from public.streamers
      where (paid_until is null or paid_until > now())
        and (live_checked_at is null or live_checked_at < now() - make_interval(secs => p_age_seconds))
      order by live_checked_at nulls first
      limit p_limit
      for update skip locked
   )
  returning s.*;
end $$;

-- ---------------------------------------------------------------------
--  Row level security & privileges
-- ---------------------------------------------------------------------
alter table public.streamers       enable row level security;
alter table public.players         enable row level security;
alter table public.contests        enable row level security;
alter table public.contest_secrets enable row level security;
alter table public.contest_entries enable row level security;

revoke all on public.streamers, public.players, public.contests, public.contest_secrets, public.contest_entries
  from anon, authenticated;

grant select on public.streamers, public.contests, public.contest_entries to anon, authenticated;
grant all on public.streamers, public.players, public.contests, public.contest_secrets, public.contest_entries
  to service_role;

drop policy if exists "public read streamers" on public.streamers;
create policy "public read streamers" on public.streamers for select to anon, authenticated using (true);

drop policy if exists "public read contests" on public.contests;
create policy "public read contests" on public.contests for select to anon, authenticated using (true);

drop policy if exists "public read entries" on public.contest_entries;
create policy "public read entries" on public.contest_entries for select to anon, authenticated using (true);

-- players & contest_secrets: no policies => not readable through the public API

revoke all on function public.create_contest(text, text, text, timestamptz, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.join_contest(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_stale_streamers(integer, integer) from public, anon, authenticated;
revoke all on function public.random_code(integer) from public, anon, authenticated;
grant execute on function public.create_contest(text, text, text, timestamptz, integer, timestamptz) to service_role;
grant execute on function public.join_contest(uuid, uuid) to service_role;
grant execute on function public.claim_stale_streamers(integer, integer) to service_role;
grant execute on function public.random_code(integer) to service_role;

grant execute on function public.server_now() to anon, authenticated, service_role;
grant execute on function public.draw_contest(uuid) to anon, authenticated, service_role;
grant execute on function public.draw_expired_contests() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
--  Realtime (live updates without page refresh)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['streamers', 'contests', 'contest_entries'] loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Storage bucket for avatars & brainrot images (public read)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('media', 'media', true)
    on conflict (id) do update set public = true;
  end if;
end $$;

-- tell PostgREST to reload its schema cache
notify pgrst, 'reload schema';
