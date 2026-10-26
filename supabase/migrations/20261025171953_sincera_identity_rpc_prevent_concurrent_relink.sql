create or replace function public.sincera_activate_bubble_link(
  p_bubble_user_id text,
  p_supabase_user_id uuid,
  p_evidence_reference text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  existing private.bubble_identity_links%rowtype;
begin
  if p_supabase_user_id is null
     or p_bubble_user_id is null
     or p_bubble_user_id !~ '^[0-9]{13}x[0-9]{18}$'
     or p_evidence_reference is null
     or p_evidence_reference !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid identity link input' using errcode = '22023';
  end if;
  if not exists(select 1 from auth.users where id = p_supabase_user_id) then
    raise exception 'identity not present' using errcode = '22023';
  end if;
  select * into existing
    from private.bubble_identity_links
   where bubble_user_id = p_bubble_user_id
   for update;
  if found then
    if existing.supabase_user_id <> p_supabase_user_id or existing.state = 'revoked' then
      raise exception 'account link conflict' using errcode = '23505';
    end if;
    if existing.state = 'verified' then
      return true;
    end if;
  end if;
  insert into private.bubble_identity_links(
    bubble_user_id, supabase_user_id, state, verified_at,
    bubble_proof_verified_at, supabase_proof_verified_at,
    verification_method, evidence_reference, updated_at
  ) values (
    p_bubble_user_id, p_supabase_user_id, 'verified', now(),
    now(), now(), 'bubble_member_token_and_supabase_auth',
    p_evidence_reference, now()
  ) on conflict (bubble_user_id) do update
    set state = 'verified',
        verified_at = excluded.verified_at,
        bubble_proof_verified_at = excluded.bubble_proof_verified_at,
        supabase_proof_verified_at = excluded.supabase_proof_verified_at,
        verification_method = excluded.verification_method,
        evidence_reference = excluded.evidence_reference,
        updated_at = now()
  where private.bubble_identity_links.supabase_user_id = excluded.supabase_user_id
    and private.bubble_identity_links.state <> 'revoked';

  if not found then
    raise exception 'account link conflict' using errcode = '23505';
  end if;

  insert into private.bubble_identity_link_audit(
    bubble_user_id, supabase_user_id, event_type, evidence_reference
  ) values(
    p_bubble_user_id, p_supabase_user_id, 'linked', p_evidence_reference
  );
  return true;
end
$function$;
revoke all on function public.sincera_activate_bubble_link(text,uuid,text) from public, anon, authenticated;
grant execute on function public.sincera_activate_bubble_link(text,uuid,text) to service_role;
