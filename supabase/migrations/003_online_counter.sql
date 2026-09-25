-- Brainrot Arena update: "online now" counter.
-- Supabase → SQL Editor → paste → Run (safe to run more than once).
create table if not exists public.site_presence (
  session_id uuid primary key,
  last_seen  timestamptz not null default now()
);
create index if not exists site_presence_seen_idx on public.site_presence (last_seen);
alter table public.site_presence enable row level security;
revoke all on public.site_presence from anon, authenticated;
grant all on public.site_presence to service_role;

-- visitor heartbeat: marks the session as online and returns how many are online (seen in the last 90 s)
create or replace function public.presence_ping(p_session uuid) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  insert into public.site_presence (session_id, last_seen) values (p_session, now())
  on conflict (session_id) do update set last_seen = now();
  if random() < 0.05 then
    delete from public.site_presence where last_seen < now() - interval '10 minutes';
  end if;
  select count(*)::integer into n from public.site_presence where last_seen > now() - interval '90 seconds';
  return n;
end $$;

create or replace function public.presence_leave(p_session uuid) returns void
language sql volatile security definer set search_path = public as $$
  delete from public.site_presence where session_id = p_session;
$$;

create or replace function public.presence_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.site_presence where last_seen > now() - interval '90 seconds';
$$;

grant execute on function public.presence_ping(uuid) to anon, authenticated, service_role;
grant execute on function public.presence_leave(uuid) to anon, authenticated, service_role;
grant execute on function public.presence_count() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
