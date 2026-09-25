-- Brainrot Arena update: participation conditions for giveaways.
-- Supabase → SQL Editor → paste → Run (safe to run more than once).
alter table public.contests add column if not exists conditions text;
notify pgrst, 'reload schema';
