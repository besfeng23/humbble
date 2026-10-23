-- profile_completed funnel event: fire when the WHOLE profile is complete, not when a city is typed.
--
-- Before: 20261023000030 recorded 'profile_completed' as soon as profiles.city_region was non-empty
-- (trg_profiles_funnel_completed, AFTER INSERT OR UPDATE OF city_region). That is the first onboarding
-- step, so the funnel (and any future affiliate postback) over-counted completed profiles.
--
-- Now: the event is recorded exactly once per user, the first time private.is_profile_complete(user)
-- (migration 20261023000041: 18+, name, city, intention, 3 distinct prompts, >= 2 valid stored photos,
-- not suspended) is true. Server-side only, consistent with how funnel_events is written today:
--   * the table stays service_role-only (no client grant, RLS on, no policy); clients cannot write it
--   * the write goes through the existing private.record_funnel_event (INSERT .. ON CONFLICT DO NOTHING
--     on uq_funnel_events_user_event), so it is idempotent: later edits, un-completing and
--     re-completing never produce a second row
--   * the event name is already in the chk_funnel_events_event allow-list (no allow-list change)
--
-- Where it is evaluated:
--   * profiles: AFTER INSERT / UPDATE OF the columns that feed is_profile_complete
--   * profile_photos: AFTER INSERT / UPDATE OF (user_id, storage_path)
--   * private.sync_profile_discoverability (also reached by refresh_my_discoverability and
--     admin_sync_discoverability), which covers the upload-order race the same way discoverability does
--   Unlike the discoverability triggers these are NOT skipped for privileged writers: completeness is
--   a fact about the profile, whoever wrote it.
--
-- Privileges (lessons of PR #35): Supabase default privileges hand EXECUTE on new functions to
-- anon/authenticated/service_role, so every new function REVOKEs from PUBLIC first and then from each API
-- role by name, and gets no grant at all (they are only ever called by SECURITY DEFINER code / triggers
-- running as the owner). All SECURITY DEFINER bodies pin search_path (pg_catalog first) and schema-qualify.
-- private.record_funnel_event is narrowed the same way (it was only revoked from PUBLIC/anon/authenticated).
--
-- No backfill: every profile that is complete today already has city_region set, so it already has the
-- (premature) event. Rows recorded early for still-incomplete profiles are NOT deleted here; that is an
-- analytics-data decision for the owner (see PR description for the query).
--
-- ROLLBACK (manual; forward-fix preferred). Order matters and it must be ONE transaction: the restored
-- sync_profile_discoverability must be in place BEFORE the recorder is dropped, because the version in this
-- migration calls private.record_profile_completed_if_complete and every member profile write goes through it.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   1. restore private.sync_profile_discoverability(UUID) from 20261023000041 (body without the recorder call);
--   2. DROP TRIGGER trg_profiles_funnel_completed ON public.profiles;
--      DROP TRIGGER trg_profile_photos_funnel_completed ON public.profile_photos;
--   3. restore private.handle_profile_completed() and its AFTER INSERT OR UPDATE OF city_region trigger from
--      20261023000030;
--   4. DROP FUNCTION private.handle_profile_photo_completed(), private.record_profile_completed_if_complete(UUID);
--   COMMIT;
-- (record_funnel_event stays owner-only: nothing outside SECURITY DEFINER code needs to call it.)
--
-- Apply in a quiet window: the DROP TRIGGER / CREATE TRIGGER statements below take ACCESS EXCLUSIVE locks on
-- public.profiles and public.profile_photos until the migration commits. The lock_timeout makes the migration
-- fail fast (and roll back, nothing applied) instead of queueing behind a long transaction and blocking reads.

SET LOCAL lock_timeout = '5s';

-- Tighten the existing writer: it is only called from SECURITY DEFINER code.
REVOKE ALL ON FUNCTION private.record_funnel_event(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.record_funnel_event(UUID, TEXT) FROM anon, authenticated, service_role;

-- Records profile_completed once, the first time the profile is complete. Cheap when already recorded.
CREATE OR REPLACE FUNCTION private.record_profile_completed_if_complete(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.funnel_events fe WHERE fe.user_id = p_user_id AND fe.event = 'profile_completed') THEN
    RETURN;
  END IF;
  IF private.is_profile_complete(p_user_id) THEN
    -- Analytics is best-effort: a failing funnel write must never abort the member's profile / photo write.
    -- Only this call is guarded. The write is idempotent, and any later profile write or
    -- refresh_my_discoverability retries it.
    BEGIN
      PERFORM private.record_funnel_event(p_user_id, 'profile_completed');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'profile_completed funnel write failed for %: % (%)', p_user_id, SQLERRM, SQLSTATE;
    END;
  END IF;
END;
$function$;
ALTER FUNCTION private.record_profile_completed_if_complete(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.record_profile_completed_if_complete(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.record_profile_completed_if_complete(UUID) FROM anon, authenticated, service_role;

-- profiles trigger function (replaces the city-only body from 20261023000030).
CREATE OR REPLACE FUNCTION private.handle_profile_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM private.record_profile_completed_if_complete(NEW.id);
  RETURN NULL;
END;
$function$;
ALTER FUNCTION private.handle_profile_completed() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.handle_profile_completed() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.handle_profile_completed() FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.handle_profile_photo_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM private.record_profile_completed_if_complete(NEW.user_id);
  RETURN NULL;
END;
$function$;
ALTER FUNCTION private.handle_profile_photo_completed() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.handle_profile_photo_completed() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.handle_profile_photo_completed() FROM anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_profiles_funnel_completed ON public.profiles;
CREATE TRIGGER trg_profiles_funnel_completed
  AFTER INSERT OR UPDATE OF birth_date, display_name, city_region, prompts, relationship_intention, is_suspended
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.handle_profile_completed();

DROP TRIGGER IF EXISTS trg_profile_photos_funnel_completed ON public.profile_photos;
CREATE TRIGGER trg_profile_photos_funnel_completed
  AFTER INSERT OR UPDATE OF user_id, storage_path
  ON public.profile_photos
  FOR EACH ROW EXECUTE FUNCTION private.handle_profile_photo_completed();

-- Same body as 20261023000041 plus the completion check, so refresh_my_discoverability /
-- admin_sync_discoverability also settle the event after an upload-order race.
CREATE OR REPLACE FUNCTION private.sync_profile_discoverability(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_paused BOOLEAN;
  v_derived BOOLEAN;
BEGIN
  SELECT pr.is_paused INTO v_paused FROM public.profiles pr WHERE pr.id = p_user_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  v_derived := NOT v_paused AND private.is_profile_complete(p_user_id);
  UPDATE public.profiles pr
     SET is_discoverable = v_derived
   WHERE pr.id = p_user_id AND pr.is_discoverable IS DISTINCT FROM v_derived;
  PERFORM private.record_profile_completed_if_complete(p_user_id);
  RETURN v_derived;
END;
$function$;
ALTER FUNCTION private.sync_profile_discoverability(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.sync_profile_discoverability(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_profile_discoverability(UUID) FROM anon, authenticated, service_role;
