-- P2-04: consolidate explicit grants/RLS and establish private Storage controls.
-- No cross-user public profile projection is enabled here. Discovery must use a
-- separately reviewed safe RPC/projection; birth_date and private photos remain private.

-- All 19 application tables must retain RLS, regardless of client grants.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_swipe_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Start from an explicit client privilege baseline. Existing safe column-level
-- INSERT/UPDATE grants from migrations 0001-0003 are retained and restated below.
REVOKE ALL ON TABLE
  public.profiles,
  public.profile_photos,
  public.user_preferences,
  public.verification_requests,
  public.swipes,
  public.daily_swipe_quotas,
  public.matches,
  public.conversations,
  public.conversation_participants,
  public.messages,
  public.blocks,
  public.reports,
  public.moderation_cases,
  public.subscriptions,
  public.entitlements,
  public.payment_events,
  public.consent_records,
  public.privacy_requests,
  public.audit_events
FROM PUBLIC, anon, authenticated;

-- Profile domain: owner CRUD, except profile UPDATE remains column-locked by 0001.
GRANT SELECT, INSERT, DELETE ON public.profiles TO authenticated;
GRANT UPDATE (
  display_name, city_region, occupation, education_level, languages_spoken,
  shared_interests, relationship_intention, prompts, is_incognito
) ON public.profiles TO authenticated;
GRANT SELECT, DELETE ON public.profile_photos TO authenticated;
GRANT INSERT (user_id, storage_path, position) ON public.profile_photos TO authenticated;
GRANT UPDATE (storage_path, position) ON public.profile_photos TO authenticated;
GRANT SELECT, DELETE ON public.user_preferences TO authenticated;
GRANT INSERT (user_id, min_age, max_age, max_distance_km, preferred_intentions)
  ON public.user_preferences TO authenticated;
GRANT UPDATE (min_age, max_age, max_distance_km, preferred_intentions)
  ON public.user_preferences TO authenticated;
GRANT SELECT ON public.verification_requests TO authenticated;

-- Messaging domain: clients can read only policy-approved rows, insert messages
-- through the existing participant guard, and create/delete only their own blocks.
GRANT SELECT ON TABLE
  public.swipes, public.daily_swipe_quotas, public.matches, public.conversations,
  public.conversation_participants, public.messages, public.blocks
TO authenticated;
GRANT INSERT (conversation_id, sender_id, body) ON public.messages TO authenticated;
GRANT INSERT (blocker_id, blocked_id) ON public.blocks TO authenticated;
GRANT DELETE ON public.blocks TO authenticated;

-- Safety domain: reporter-scoped submissions and trusted moderator reads only.
GRANT SELECT ON public.reports TO authenticated;
GRANT INSERT (reporter_id, reported_user_id, category, context_summary)
  ON public.reports TO authenticated;
GRANT SELECT ON public.moderation_cases TO authenticated;

-- Billing and privacy: owners may read subscription/entitlement state, record
-- consent, and submit/read privacy requests. State changes stay server-owned.
GRANT SELECT ON public.subscriptions, public.entitlements TO authenticated;
GRANT SELECT ON public.consent_records, public.privacy_requests TO authenticated;
GRANT INSERT (user_id, consent_key, version, choice, source, metadata)
  ON public.consent_records TO authenticated;
GRANT INSERT (user_id, request_type, idempotency_key)
  ON public.privacy_requests TO authenticated;
-- payment_events and audit_events intentionally have no anon/authenticated grants.
-- moderation_cases client grant is SELECT only and is narrowed by its moderator policy.

-- Reassert trusted-service grants from 0001-0003 without widening the sensitive
-- append-only/payment grants established there.
GRANT ALL ON TABLE
  public.profiles, public.profile_photos, public.user_preferences, public.verification_requests,
  public.swipes, public.daily_swipe_quotas, public.matches, public.conversations,
  public.conversation_participants, public.messages, public.blocks
TO service_role;
GRANT SELECT, INSERT ON public.reports TO service_role;
GRANT UPDATE (status, severity, retention_until, legal_hold) ON public.reports TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.moderation_cases TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.subscriptions, public.entitlements TO service_role;
GRANT SELECT, INSERT ON public.payment_events TO service_role;
GRANT UPDATE (status, provider_verified, processed_at, retention_until, legal_hold)
  ON public.payment_events TO service_role;
GRANT SELECT, INSERT ON public.consent_records, public.privacy_requests, public.audit_events TO service_role;
GRANT UPDATE (status, completion_metadata, failure_code, completed_at, retention_until, legal_hold)
  ON public.privacy_requests TO service_role;

-- app_metadata is controlled by trusted Auth/server administration, unlike
-- user_metadata. This helper does not infer staff status from a profile column.
CREATE OR REPLACE FUNCTION private.is_trusted_moderator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(
    ((auth.jwt() -> 'app_metadata' ->> 'role')::TEXT COLLATE "C"
      = 'moderator'::TEXT COLLATE "C"),
    FALSE
  );
$function$;
REVOKE ALL ON FUNCTION private.is_trusted_moderator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_trusted_moderator() TO authenticated, service_role;

-- Reports are visible to the reporter (policy from 0003) and trusted moderators.
CREATE POLICY reports_select_trusted_moderator
  ON public.reports FOR SELECT TO authenticated
  USING (private.is_trusted_moderator());
CREATE POLICY moderation_cases_select_trusted_moderator
  ON public.moderation_cases FOR SELECT TO authenticated
  USING (private.is_trusted_moderator());
-- No client INSERT/UPDATE/DELETE policy is added for moderation cases.

-- Storage bucket definitions are private by default. Photos allow only common
-- raster formats up to 5 MiB. The verification bucket is reserved for approved
-- server-side provider workflows: no client policy permits upload or download.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'profile_photos', 'profile_photos', FALSE, 5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::TEXT[]
  ),
  (
    'verification_artifacts', 'verification_artifacts', FALSE, 10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::TEXT[]
  )
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Supabase owns Storage system tables and provisions RLS/ACLs. Do not ALTER/GRANT/REVOKE
-- storage.objects or storage.buckets here; migrations execute as postgres, not their owner.
-- The Storage API policies below are additive and scope object access.

-- Private photo keys must start with the caller's Auth UUID. owner_id is checked
-- as a second guard so a path prefix alone cannot claim another account's object.
DROP POLICY IF EXISTS p2_04_profile_photos_select_owner ON storage.objects;
DROP POLICY IF EXISTS p2_04_profile_photos_insert_owner ON storage.objects;
DROP POLICY IF EXISTS p2_04_profile_photos_update_owner ON storage.objects;
DROP POLICY IF EXISTS p2_04_profile_photos_delete_owner ON storage.objects;
DROP POLICY IF EXISTS p2_04_block_verification_artifacts_client_access ON storage.objects;

CREATE POLICY p2_04_profile_photos_select_owner
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"
    AND (storage.foldername(name))[1]::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
    AND owner_id::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
  );
CREATE POLICY p2_04_profile_photos_insert_owner
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"
    AND (storage.foldername(name))[1]::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
    AND owner_id::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
  );
CREATE POLICY p2_04_profile_photos_update_owner
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"
    AND (storage.foldername(name))[1]::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
    AND owner_id::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
  )
  WITH CHECK (
    bucket_id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"
    AND (storage.foldername(name))[1]::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
    AND owner_id::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
  );
CREATE POLICY p2_04_profile_photos_delete_owner
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"
    AND (storage.foldername(name))[1]::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
    AND owner_id::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
  );

-- Restrictive defense-in-depth: even if a broad permissive Storage policy is
-- added later, anon/authenticated can never access verification_artifacts.
-- There is deliberately no client upload or download policy for this bucket.
CREATE POLICY p2_04_block_verification_artifacts_client_access
  ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id::TEXT COLLATE "C" <> 'verification_artifacts'::TEXT COLLATE "C")
  WITH CHECK (bucket_id::TEXT COLLATE "C" <> 'verification_artifacts'::TEXT COLLATE "C");
