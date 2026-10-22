-- Auto-discoverable complete profiles + member pause switch.
--
-- Owner decision (PR #33): complete 18+ profiles must actually appear in discovery
-- without a service_role step. profiles.is_discoverable stays a server-owned flag
-- (members still cannot write it: column grant + enforce_profile_column_locks), but it
-- is now DERIVED by SECURITY DEFINER code from the profile itself:
--
--   is_discoverable = complete AND NOT is_suspended AND NOT is_paused
--   complete        = 18+, display_name and city (>= 2 chars), relationship intention,
--                     3 distinct answered prompts (weekend / values / relationship_goal),
--                     >= 2 valid photo objects in storage.
--   country_code is NOT required (the column is optional; it only drives billing market).
--
-- New: profiles.is_paused (member-controlled "pause my profile / hide me" switch).
--
-- Recompute triggers:
--   * profiles  AFTER INSERT / UPDATE OF (birth_date, display_name, city_region, country_code,
--     prompts, relationship_intention, is_suspended, is_paused)
--   * profile_photos AFTER INSERT / DELETE / UPDATE OF (user_id, storage_path)
--   * public.refresh_my_discoverability(): member-callable, only re-derives the flag from the
--     member's own profile (cannot set it to an arbitrary value). Covers upload-order races.
--   * public.admin_sync_discoverability(uuid): service_role only.
-- Triggers fire for member (authenticated/anon) writes, so members get the derived value.
-- Calls made as postgres/service_role (fixtures, backfills, moderation tooling) are left
-- alone EXCEPT is_suspended / is_paused transitions, which are always enforced, so an
-- explicit privileged is_discoverable value is never silently overwritten.
--
-- The recompute runs as the function owner (postgres), which is the only reason the existing
-- column-lock trigger lets it write is_discoverable. Grants: nothing here is executable by
-- anon; the private.* functions are not executable by any API role.
--
-- Backfill: existing complete, unsuspended profiles are switched on. Nothing is switched off
-- by the backfill (so rows an operator enabled by hand are not changed); they are re-derived
-- on their next relevant change.
--
-- ROLLBACK (manual; forward-fix preferred):
--   DROP TRIGGER trg_profiles_sync_discoverable ON public.profiles;
--   DROP TRIGGER trg_profile_photos_sync_discoverable ON public.profile_photos;
--   DROP FUNCTION public.refresh_my_discoverability(), public.admin_sync_discoverability(UUID),
--     private.trg_profiles_sync_discoverable(), private.trg_profile_photos_sync_discoverable(),
--     private.sync_profile_discoverability(UUID), private.is_profile_complete(UUID),
--     private.is_privileged_writer();
--   restore private.is_profile_discovery_complete from 20261023000040;
--   ALTER TABLE public.profiles DROP COLUMN is_paused;  -- drops member pause choices

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN public.profiles.is_paused IS 'Member-controlled: hide my profile and pause discovery. Forces is_discoverable = false.';
GRANT UPDATE (is_paused) ON public.profiles TO authenticated;

-- Completeness only (no is_discoverable / paused requirement).
CREATE OR REPLACE FUNCTION private.is_profile_complete(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.id = p_user_id
       AND NOT pr.is_suspended
       AND pr.birth_date <= ((pg_catalog.now() AT TIME ZONE 'UTC')::DATE - INTERVAL '18 years')::DATE
       AND pr.display_name IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(pr.display_name)) >= 2
       AND pr.city_region IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(pr.city_region)) >= 2
       AND pr.relationship_intention IS NOT NULL
       AND pg_catalog.jsonb_typeof(pr.prompts::jsonb)='array'
       AND (SELECT count(DISTINCT p->>'key') FROM pg_catalog.jsonb_array_elements(pr.prompts::jsonb) p
            WHERE pg_catalog.jsonb_typeof(p)='object' AND p->>'key' IN ('weekend','values','relationship_goal')
              AND pg_catalog.length(pg_catalog.btrim(COALESCE(p->>'answer',''))) > 0) = 3
       AND (SELECT count(*) FROM public.profile_photos ph JOIN storage.objects so
            ON so.bucket_id::TEXT COLLATE "C"='profile_photos'::TEXT COLLATE "C"
           AND so.name::TEXT COLLATE "C"=ph.storage_path::TEXT COLLATE "C"
           AND so.owner_id::TEXT COLLATE "C"=ph.user_id::TEXT COLLATE "C"
           AND so.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp','image/heic')
           AND CASE WHEN COALESCE(so.metadata->>'size','') ~ '^[0-9]+$'
                    THEN (so.metadata->>'size')::BIGINT BETWEEN 1 AND 5242880 ELSE FALSE END
            WHERE ph.user_id=pr.id) >= 2
  );
$function$;
ALTER FUNCTION private.is_profile_complete(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_profile_complete(UUID) FROM PUBLIC, anon, authenticated, service_role;

-- Same contract as before (signature unchanged; used by the feed, photo RLS): complete AND live.
CREATE OR REPLACE FUNCTION private.is_profile_discovery_complete(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  SELECT private.is_profile_complete(p_user_id)
     AND EXISTS (SELECT 1 FROM public.profiles pr
                  WHERE pr.id = p_user_id AND pr.is_discoverable AND NOT pr.is_paused AND NOT pr.is_suspended);
$function$;
ALTER FUNCTION private.is_profile_discovery_complete(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_profile_discovery_complete(UUID) FROM PUBLIC, anon, authenticated, service_role;

-- Re-derives profiles.is_discoverable. Returns the derived value.
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
  RETURN v_derived;
END;
$function$;
ALTER FUNCTION private.sync_profile_discoverability(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.sync_profile_discoverability(UUID) FROM PUBLIC, anon, authenticated, service_role;

-- SECURITY DEFINER bodies always see current_user = owner, so the caller is identified by the
-- `role` setting (SET ROLE / PostgREST), falling back to session_user for a bare psql session.
CREATE OR REPLACE FUNCTION private.is_privileged_writer()
RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT CASE
    WHEN COALESCE(NULLIF(pg_catalog.current_setting('role', TRUE), ''), 'none') = 'none'
      THEN session_user IN ('postgres', 'supabase_admin', 'service_role')
    ELSE pg_catalog.current_setting('role', TRUE) IN ('postgres', 'supabase_admin', 'service_role')
  END;
$function$;
ALTER FUNCTION private.is_privileged_writer() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_privileged_writer() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.trg_profiles_sync_discoverable()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Privileged writers keep explicit control, except suspension / pause transitions.
  IF private.is_privileged_writer()
     AND NOT (TG_OP = 'UPDATE' AND (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
                                    OR NEW.is_paused IS DISTINCT FROM OLD.is_paused)) THEN
    RETURN NULL;
  END IF;
  PERFORM private.sync_profile_discoverability(NEW.id);
  RETURN NULL;
END;
$function$;
ALTER FUNCTION private.trg_profiles_sync_discoverable() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.trg_profiles_sync_discoverable() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.trg_profile_photos_sync_discoverable()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF private.is_privileged_writer() THEN
    RETURN NULL;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM private.sync_profile_discoverability(OLD.user_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    PERFORM private.sync_profile_discoverability(NEW.user_id);
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION private.trg_profile_photos_sync_discoverable() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.trg_profile_photos_sync_discoverable() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_profiles_sync_discoverable ON public.profiles;
CREATE TRIGGER trg_profiles_sync_discoverable
  AFTER INSERT OR UPDATE OF birth_date, display_name, city_region, country_code, prompts,
    relationship_intention, is_suspended, is_paused
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.trg_profiles_sync_discoverable();

DROP TRIGGER IF EXISTS trg_profile_photos_sync_discoverable ON public.profile_photos;
CREATE TRIGGER trg_profile_photos_sync_discoverable
  AFTER INSERT OR DELETE OR UPDATE OF user_id, storage_path
  ON public.profile_photos
  FOR EACH ROW EXECUTE FUNCTION private.trg_profile_photos_sync_discoverable();

-- Member-callable: re-derive MY flag. Cannot set arbitrary values.
CREATE OR REPLACE FUNCTION public.refresh_my_discoverability()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  RETURN private.sync_profile_discoverability(v_actor);
END;
$function$;
ALTER FUNCTION public.refresh_my_discoverability() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.refresh_my_discoverability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_my_discoverability() TO authenticated;

-- service_role only (operations / support tooling).
CREATE OR REPLACE FUNCTION public.admin_sync_discoverability(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN private.sync_profile_discoverability(p_user_id);
END;
$function$;
ALTER FUNCTION public.admin_sync_discoverability(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_sync_discoverability(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sync_discoverability(UUID) TO service_role;

-- Backfill: switch on existing complete profiles. Never switches anything off.
UPDATE public.profiles pr
   SET is_discoverable = TRUE
 WHERE NOT pr.is_discoverable AND NOT pr.is_paused AND NOT pr.is_suspended
   AND private.is_profile_complete(pr.id);
