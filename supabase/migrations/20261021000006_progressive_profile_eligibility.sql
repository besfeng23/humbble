-- P3-02: use P2 tables/RLS/RPC and private Storage. No selfie or biometric payloads are retained.
-- Decision: because P2 has no moderation/approval state, this feed gate treats a matching,
-- private object with an allowed MIME/size as server-validated storage, NOT as human-reviewed approval.
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic']::text[]
WHERE id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C";

-- Reordering uses multiple REST updates. Preserve the existing unique (user_id,position)
-- constraint and reserve 6..11 as temporary slots; successful orders normalize to 0..n-1.
ALTER TABLE public.profile_photos DROP CONSTRAINT IF EXISTS chk_profile_photos_position_range;
ALTER TABLE public.profile_photos ADD CONSTRAINT chk_profile_photos_position_range CHECK (position BETWEEN 0 AND 11);

-- Preserve P2's canonical six-photo trigger/message. This separate trigger only scopes paths,
-- including storage_path changes (the old insert-only trigger missed UPDATE path attacks).
CREATE OR REPLACE FUNCTION public.enforce_profile_photo_path_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.storage_path IS NULL
     OR pg_catalog.left(NEW.storage_path, pg_catalog.length(NEW.user_id::TEXT) + 1) COLLATE "C"
        <> (NEW.user_id::TEXT || '/') COLLATE "C" THEN
    RAISE EXCEPTION 'profile_photo_path_must_be_user_scoped' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.enforce_profile_photo_path_scope() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_profile_photo_path_scope() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_profile_photos_03_path_scope ON public.profile_photos;
CREATE TRIGGER trg_profile_photos_03_path_scope
BEFORE INSERT OR UPDATE OF storage_path, user_id ON public.profile_photos
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_photo_path_scope();

-- A private object can only be read/signed or updated while its metadata row exists.
-- INSERT remains owner-folder scoped to allow object upload before metadata creation; DELETE remains
-- owner-folder scoped so a failed metadata insert can compensate by deleting the orphan object.
DROP POLICY IF EXISTS p2_04_profile_photos_select_owner ON storage.objects;
CREATE POLICY p2_04_profile_photos_select_owner ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"
  AND (storage.foldername(name))[1]::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
  AND owner_id::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
  AND EXISTS (SELECT 1 FROM public.profile_photos ph WHERE ph.user_id = (SELECT auth.uid()) AND ph.storage_path = storage.objects.name)
);
DROP POLICY IF EXISTS p2_04_profile_photos_update_owner ON storage.objects;
CREATE POLICY p2_04_profile_photos_update_owner ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"
  AND (storage.foldername(name))[1]::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
  AND owner_id::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
  AND EXISTS (SELECT 1 FROM public.profile_photos ph WHERE ph.user_id = (SELECT auth.uid()) AND ph.storage_path = storage.objects.name)
)
WITH CHECK (
  bucket_id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"
  AND (storage.foldername(name))[1]::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
  AND owner_id::TEXT COLLATE "C" = (SELECT auth.uid())::TEXT COLLATE "C"
  AND EXISTS (SELECT 1 FROM public.profile_photos ph WHERE ph.user_id = (SELECT auth.uid()) AND ph.storage_path = storage.objects.name)
);

CREATE OR REPLACE FUNCTION public.get_discovery_feed(
  p_limit INTEGER DEFAULT 20,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (profile_id UUID, display_name TEXT, age INTEGER, city_region TEXT,
  relationship_intention public.relationship_intention, shared_interests TEXT[], primary_photo_path TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_min_age SMALLINT := 18;
  v_max_age SMALLINT := 99;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit,20),1),50);
  v_today DATE := (pg_catalog.now() AT TIME ZONE 'UTC')::DATE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id=v_actor AND actor.verification_status='verified'::public.verification_state
      AND actor.is_discoverable AND NOT actor.is_suspended
      AND actor.birth_date <= (v_today - INTERVAL '18 years')::DATE
      AND actor.display_name IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(actor.display_name)) >= 2
      AND actor.city_region IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(actor.city_region)) >= 2
      AND actor.relationship_intention IS NOT NULL
      AND pg_catalog.jsonb_typeof(actor.prompts::jsonb)='array'
      AND (SELECT count(DISTINCT p->>'key') FROM pg_catalog.jsonb_array_elements(actor.prompts::jsonb) p
           WHERE pg_catalog.jsonb_typeof(p)='object'
             AND p->>'key' IN ('weekend','values','relationship_goal')
             AND pg_catalog.length(pg_catalog.btrim(COALESCE(p->>'answer',''))) > 0) = 3
      AND (SELECT count(*) FROM public.profile_photos ph JOIN storage.objects so
           ON so.bucket_id::TEXT COLLATE "C"='profile_photos'::TEXT COLLATE "C"
          AND so.name::TEXT COLLATE "C"=ph.storage_path::TEXT COLLATE "C"
          AND so.owner_id::TEXT COLLATE "C"=ph.user_id::TEXT COLLATE "C"
          AND so.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp','image/heic')
          AND CASE WHEN COALESCE(so.metadata->>'size','') ~ '^[0-9]+$'
                   THEN (so.metadata->>'size')::BIGINT BETWEEN 1 AND 5242880 ELSE FALSE END
           WHERE ph.user_id=actor.id) >= 2
  ) THEN RAISE EXCEPTION 'actor_not_eligible' USING ERRCODE='42501'; END IF;

  SELECT preferences.min_age, preferences.max_age INTO v_min_age,v_max_age
  FROM public.user_preferences preferences WHERE preferences.user_id=v_actor;
  v_min_age:=COALESCE(v_min_age,18); v_max_age:=COALESCE(v_max_age,99);
  RETURN QUERY
  SELECT candidate.id,
    candidate.display_name,
    EXTRACT(YEAR FROM pg_catalog.age(v_today,candidate.birth_date))::INTEGER,
    candidate.city_region,candidate.relationship_intention,candidate.shared_interests,
    (SELECT photo.storage_path FROM public.profile_photos photo JOIN storage.objects so
       ON so.bucket_id::TEXT COLLATE "C"='profile_photos'::TEXT COLLATE "C"
      AND so.name::TEXT COLLATE "C"=photo.storage_path::TEXT COLLATE "C"
      AND so.owner_id::TEXT COLLATE "C"=photo.user_id::TEXT COLLATE "C"
      AND so.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp','image/heic')
      AND CASE WHEN COALESCE(so.metadata->>'size','') ~ '^[0-9]+$'
               THEN (so.metadata->>'size')::BIGINT BETWEEN 1 AND 5242880 ELSE FALSE END
     WHERE photo.user_id=candidate.id ORDER BY photo.position,photo.created_at,photo.id LIMIT 1)
  FROM public.profiles candidate
  WHERE candidate.id<>v_actor AND candidate.verification_status='verified'::public.verification_state
    AND candidate.is_discoverable AND NOT candidate.is_suspended AND NOT candidate.is_incognito
    AND candidate.birth_date <= (v_today - INTERVAL '18 years')::DATE
    AND candidate.display_name IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(candidate.display_name)) >= 2
    AND candidate.city_region IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(candidate.city_region)) >= 2
    AND candidate.relationship_intention IS NOT NULL
    AND EXTRACT(YEAR FROM pg_catalog.age(v_today,candidate.birth_date))::INTEGER BETWEEN v_min_age AND v_max_age
    AND (p_cursor IS NULL OR candidate.created_at<p_cursor)
    AND pg_catalog.jsonb_typeof(candidate.prompts::jsonb)='array'
    AND (SELECT count(DISTINCT p->>'key') FROM pg_catalog.jsonb_array_elements(candidate.prompts::jsonb) p
         WHERE pg_catalog.jsonb_typeof(p)='object'
           AND p->>'key' IN ('weekend','values','relationship_goal')
           AND pg_catalog.length(pg_catalog.btrim(COALESCE(p->>'answer',''))) > 0) = 3
    AND (SELECT count(*) FROM public.profile_photos ph JOIN storage.objects so
         ON so.bucket_id::TEXT COLLATE "C"='profile_photos'::TEXT COLLATE "C"
        AND so.name::TEXT COLLATE "C"=ph.storage_path::TEXT COLLATE "C"
        AND so.owner_id::TEXT COLLATE "C"=ph.user_id::TEXT COLLATE "C"
        AND so.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp','image/heic')
        AND CASE WHEN COALESCE(so.metadata->>'size','') ~ '^[0-9]+$'
                 THEN (so.metadata->>'size')::BIGINT BETWEEN 1 AND 5242880 ELSE FALSE END
         WHERE ph.user_id=candidate.id) >= 2
    AND NOT EXISTS (SELECT 1 FROM public.swipes sw WHERE sw.actor_id=v_actor AND sw.target_id=candidate.id)
    AND NOT EXISTS (SELECT 1 FROM public.blocks b WHERE (b.blocker_id=v_actor AND b.blocked_id=candidate.id) OR (b.blocker_id=candidate.id AND b.blocked_id=v_actor))
  ORDER BY candidate.created_at DESC,candidate.id DESC LIMIT v_limit;
END;
$function$;

-- Preserve P2's reviewed ownership/grants for the existing public RPC.
ALTER FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) TO authenticated;
