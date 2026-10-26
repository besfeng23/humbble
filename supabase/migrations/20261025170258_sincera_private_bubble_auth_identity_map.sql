create table if not exists private.bubble_identity_links (
 bubble_user_id text primary key,
 supabase_user_id uuid not null unique references auth.users(id) on delete restrict,
 state text not null default 'pending' check (state in ('pending','verified','revoked')),
 verified_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint verified_requires_timestamp check (state <> 'verified' or verified_at is not null),
 constraint bubble_id_is_nonempty check (length(trim(bubble_user_id)) between 10 and 128)
);
alter table private.bubble_identity_links enable row level security;
revoke all on private.bubble_identity_links from public, anon, authenticated;
grant select, insert, update on private.bubble_identity_links to service_role;
comment on table private.bubble_identity_links is 'Server-only account-ownership mapping. Never link by matching email or Bubble user ID alone. A verified Supabase login and independent proof of the corresponding Bubble session are required before changing state to verified.';
