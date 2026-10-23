-- Run this once in the Supabase SQL Editor.
--
-- The API keeps the existing JSON-shaped application state. This table stores
-- that state as a single JSONB document so the current routes and seed data do
-- not need to be rewritten. Only the server-side service role can access it.

create table if not exists public.app_state (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- No policies are added for anon/authenticated. The service role bypasses RLS
-- and is the only credential the API uses.
revoke all on table public.app_state from anon, authenticated;
grant all on table public.app_state to service_role;

comment on table public.app_state is 'Denning Nexus application state (single JSONB document).';
