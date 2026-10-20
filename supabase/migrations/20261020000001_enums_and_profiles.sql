-- P2-01: identity/profile domain.
-- V1.2 A1/A2 binding rules: owner-only profile reads, column-locked updates,
-- server-controlled verification/discovery flags, 18+ database enforcement,
-- and provider metadata only (never raw selfie or biometric artifacts).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.verification_state AS ENUM (
  'not_started',
  'pending',
  'verified',
  'failed',
  'requires_review'
);

CREATE TYPE public.relationship_intention AS ENUM (
  'serious_relationship',
  'long_term_dating',
  'cultural_connection_and_dating'
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  city_region TEXT,
  occupation TEXT,
  education_level TEXT,
  languages_spoken TEXT[] NOT NULL DEFAULT ARRAY['English']::TEXT[],
  shared_interests TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  relationship_intention public.relationship_intention NOT NULL
    DEFAULT 'serious_relationship'::public.relationship_intention,
  prompts JSONB NOT NULL DEFAULT '[]'::JSONB,
  is_incognito BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status public.verification_state NOT NULL
    DEFAULT 'not_started'::public.verification_state,
  is_discoverable BOOLEAN NOT NULL DEFAULT FALSE,
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_profiles_display_name_length CHECK (
    pg_catalog.char_length(pg_catalog.btrim(display_name)) BETWEEN 2 AND 40
  ),
  CONSTRAINT chk_profiles_display_name_charset CHECK (
    display_name = pg_catalog.btrim(display_name)
    AND display_name ~ '^[[:alpha:]][[:alnum:] .''_-]{1,39}$'
  ),
  CONSTRAINT chk_profiles_birth_date_floor CHECK (
    birth_date >= DATE '1900-01-01'
  ),
  CONSTRAINT chk_profiles_city_region_length CHECK (
    city_region IS NULL OR pg_catalog.char_length(pg_catalog.btrim(city_region)) BETWEEN 2 AND 80
  ),
  CONSTRAINT chk_profiles_occupation_length CHECK (
    occupation IS NULL OR pg_catalog.char_length(pg_catalog.btrim(occupation)) BETWEEN 1 AND 80
  ),
  CONSTRAINT chk_profiles_education_level_length CHECK (
    education_level IS NULL OR pg_catalog.char_length(pg_catalog.btrim(education_level)) BETWEEN 1 AND 60
  ),
  CONSTRAINT chk_profiles_prompts_is_array CHECK (
    pg_catalog.jsonb_typeof(prompts) = 'array'
  )
);

CREATE INDEX idx_profiles_discovery_eligibility
  ON public.profiles (is_discoverable, is_suspended, verification_status);

CREATE TABLE public.profile_photos (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  position SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_profile_photos_storage_path CHECK (
    storage_path = pg_catalog.btrim(storage_path)
    AND pg_catalog.char_length(storage_path) BETWEEN 1 AND 500
  ),
  CONSTRAINT chk_profile_photos_position_range CHECK (position BETWEEN 0 AND 5),
  CONSTRAINT uq_profile_photos_user_position UNIQUE (user_id, position)
);

CREATE INDEX idx_profile_photos_user_id
  ON public.profile_photos (user_id, position);

CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  min_age SMALLINT NOT NULL DEFAULT 18,
  max_age SMALLINT NOT NULL DEFAULT 99,
  max_distance_km INT NOT NULL DEFAULT 50,
  preferred_intentions public.relationship_intention[] NOT NULL DEFAULT ARRAY[
    'serious_relationship'::public.relationship_intention,
    'long_term_dating'::public.relationship_intention,
    'cultural_connection_and_dating'::public.relationship_intention
  ],
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_user_preferences_min_age CHECK (min_age BETWEEN 18 AND 99),
  CONSTRAINT chk_user_preferences_max_age CHECK (max_age BETWEEN 18 AND 99),
  CONSTRAINT chk_user_preferences_age_range CHECK (min_age <= max_age),
  CONSTRAINT chk_user_preferences_distance CHECK (max_distance_km BETWEEN 1 AND 20000)
);

-- Provider-side verification is represented only by status and opaque provider
-- references. Do not add raw selfie, artifact path, or biometric fields here.
CREATE TABLE public.verification_requests (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_session_id TEXT,
  status public.verification_state NOT NULL DEFAULT 'not_started'::public.verification_state,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT chk_verification_requests_provider CHECK (
    pg_catalog.char_length(pg_catalog.btrim(provider)) BETWEEN 1 AND 100
  ),
  CONSTRAINT chk_verification_requests_session_id_length CHECK (
    provider_session_id IS NULL OR pg_catalog.char_length(provider_session_id) <= 500
  ),
  CONSTRAINT chk_verification_requests_attempts CHECK (attempts >= 0)
);

CREATE INDEX idx_verification_requests_user_id
  ON public.verification_requests (user_id, created_at DESC);

-- All trigger functions use a fixed search_path and schema-qualified objects.
CREATE OR REPLACE FUNCTION public.set_row_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_profile_birth_date_18_plus()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.birth_date IS NULL THEN
    RAISE EXCEPTION 'birth_date is required'
      USING ERRCODE = '23502';
  END IF;

  IF NEW.birth_date > (CURRENT_DATE - INTERVAL '18 years')::DATE THEN
    RAISE EXCEPTION 'User must be at least 18 years old to create or hold a profile'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.birth_date < DATE '1900-01-01' THEN
    RAISE EXCEPTION 'birth_date must not be earlier than 1900-01-01'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

-- Grants are the primary protection. This trigger is defense in depth and also
-- prevents insert-time privilege escalation through the table-wide INSERT grant.
CREATE OR REPLACE FUNCTION public.enforce_profile_column_locks()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_is_privileged_role BOOLEAN;
BEGIN
  v_is_privileged_role := CURRENT_USER IN ('service_role', 'postgres');

  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_privileged_role THEN
      NEW.verification_status := 'not_started'::public.verification_state;
      NEW.is_discoverable := FALSE;
      NEW.is_suspended := FALSE;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT v_is_privileged_role THEN
    IF NEW.birth_date IS DISTINCT FROM OLD.birth_date THEN
      RAISE EXCEPTION 'Modifying birth_date is restricted to service_role'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
      RAISE EXCEPTION 'Modifying verification_status is restricted to service_role'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.is_discoverable IS DISTINCT FROM OLD.is_discoverable THEN
      RAISE EXCEPTION 'Modifying is_discoverable is restricted to service_role'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
      RAISE EXCEPTION 'Modifying is_suspended is restricted to service_role'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_max_profile_photos()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_photo_count INTEGER;
BEGIN
  -- Serialize photo inserts/owner changes per profile so concurrent uploads
  -- cannot race past the six-photo limit. Advisory locks avoid requiring a
  -- client-wide UPDATE grant on public.profiles just to lock its parent row.
  PERFORM pg_catalog.pg_advisory_xact_lock(64001, pg_catalog.hashtext(NEW.user_id::TEXT));

  SELECT pg_catalog.count(*)::INTEGER
    INTO v_photo_count
    FROM public.profile_photos AS pp
   WHERE pp.user_id = NEW.user_id
     AND (TG_OP = 'INSERT' OR pp.id <> NEW.id);

  IF v_photo_count >= 6 THEN
    RAISE EXCEPTION 'Maximum of 6 profile photos allowed per user'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_row_updated_at() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_profile_birth_date_18_plus() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_profile_column_locks() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_max_profile_photos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_row_updated_at() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_profile_birth_date_18_plus() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_profile_column_locks() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_max_profile_photos() TO authenticated, service_role;

CREATE TRIGGER trg_profiles_01_column_locks
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_column_locks();

CREATE TRIGGER trg_profiles_02_birth_date_18_plus
  BEFORE INSERT OR UPDATE OF birth_date ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_birth_date_18_plus();

CREATE TRIGGER trg_profiles_03_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

CREATE TRIGGER trg_profile_photos_01_max_six
  BEFORE INSERT OR UPDATE OF user_id ON public.profile_photos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_profile_photos();

CREATE TRIGGER trg_profile_photos_02_set_updated_at
  BEFORE UPDATE ON public.profile_photos
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

CREATE TRIGGER trg_user_preferences_01_set_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- RLS on every table in this migration; no cross-user profile projection exists
-- yet. Discovery must use a separately reviewed safe RPC/view in a later PR.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
REVOKE ALL ON TABLE
  public.profiles,
  public.profile_photos,
  public.user_preferences,
  public.verification_requests
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.profiles,
  public.profile_photos,
  public.user_preferences,
  public.verification_requests
TO service_role;

-- Profiles: owner-only SELECT; no direct cross-user profile or DOB reads.
GRANT SELECT, INSERT, DELETE ON TABLE public.profiles TO authenticated;
GRANT UPDATE (
  display_name,
  city_region,
  occupation,
  education_level,
  languages_spoken,
  shared_interests,
  relationship_intention,
  prompts,
  is_incognito
) ON TABLE public.profiles TO authenticated;

CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));
CREATE POLICY profiles_insert_own
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY profiles_delete_own
  ON public.profiles FOR DELETE TO authenticated
  USING (id = (SELECT auth.uid()));

-- Profile-photo metadata: users may manage only their own records.
GRANT SELECT, DELETE ON TABLE public.profile_photos TO authenticated;
GRANT INSERT (user_id, storage_path, position) ON TABLE public.profile_photos TO authenticated;
GRANT UPDATE (storage_path, position) ON TABLE public.profile_photos TO authenticated;
CREATE POLICY profile_photos_select_own
  ON public.profile_photos FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY profile_photos_insert_own
  ON public.profile_photos FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY profile_photos_update_own
  ON public.profile_photos FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY profile_photos_delete_own
  ON public.profile_photos FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Preferences: owner CRUD with both USING and WITH CHECK on UPDATE.
GRANT SELECT, DELETE ON TABLE public.user_preferences TO authenticated;
GRANT INSERT (user_id, min_age, max_age, max_distance_km, preferred_intentions)
  ON TABLE public.user_preferences TO authenticated;
GRANT UPDATE (min_age, max_age, max_distance_km, preferred_intentions)
  ON TABLE public.user_preferences TO authenticated;
CREATE POLICY user_preferences_select_own
  ON public.user_preferences FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY user_preferences_insert_own
  ON public.user_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY user_preferences_update_own
  ON public.user_preferences FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY user_preferences_delete_own
  ON public.user_preferences FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Verification requests are client read-only and owner-scoped. Service-side
-- provider callbacks are the only supported writers; no client INSERT/UPDATE.
GRANT SELECT ON TABLE public.verification_requests TO authenticated;
CREATE POLICY verification_requests_select_own
  ON public.verification_requests FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
