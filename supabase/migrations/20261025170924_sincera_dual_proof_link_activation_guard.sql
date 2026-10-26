-- Sincera: no existing links; require independent proof of both sides before activation.
alter table private.bubble_identity_links
  add column if not exists bubble_proof_verified_at timestamptz,
  add column if not exists supabase_proof_verified_at timestamptz,
  add column if not exists verification_method text,
  add column if not exists evidence_reference text;

alter table private.bubble_identity_links
  add constraint sincera_links_dual_proof_verified
  check (
    state <> 'verified'
    or (
      verified_at is not null
      and bubble_proof_verified_at is not null
      and supabase_proof_verified_at is not null
      and nullif(trim(verification_method), '') is not null
      and nullif(trim(evidence_reference), '') is not null
    )
  );

create table if not exists private.bubble_identity_link_audit (
  event_id uuid primary key default gen_random_uuid(),
  bubble_user_id text not null,
  supabase_user_id uuid not null,
  event_type text not null check (event_type in ('proof_started','bubble_verified','supabase_verified','linked','revoked','rejected')),
  evidence_reference text,
  occurred_at timestamptz not null default now()
);

alter table private.bubble_identity_link_audit enable row level security;
revoke all on table private.bubble_identity_link_audit from public, anon, authenticated;
grant select, insert on table private.bubble_identity_link_audit to service_role;
comment on table private.bubble_identity_link_audit is 'Append-only server-managed non-secret identity-link event log; do not store bearer tokens, personal messages, or passwords.';

-- Do not give clients any direct visibility into either private identity-link table.
