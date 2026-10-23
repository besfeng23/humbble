-- OWN-OPEN-01: open discovery to complete 18+ profiles.
-- Owner decision (Mark): members whose profile is complete and 18+ (DOB 18+,
-- >= 2 valid photos, all three prompts, display name/city/intention, not
-- suspended, discoverable) can use discovery, swipe, match and chat without ID
-- verification. 'verified' is no longer required for the viewer or the target
-- in get_discovery_feed, record_swipe, private.guard_swipe_pair or
-- private.can_read_profile_photo_object. Completeness remains enforced by the
-- feed and photo visibility (as before); record_swipe keeps its existing
-- 18+/discoverable/not-suspended gate (no new rule is added there). Every
-- other rule is unchanged:
-- blocks, permanent pair exclusions, reports, suspension, incognito, 18+,
-- age preferences and completeness.
--
-- The Verified badge is reserved for real verification: get_discovery_feed now
-- returns is_verified, true only when profiles.verification_status='verified'
-- AND a verification_requests row with status 'verified' and decided_at exists.
--
-- Rollback: re-run the function bodies from 20261022000010 and 20261023000013
-- (drop get_discovery_feed first because its return type changes), then
-- DROP FUNCTION private.is_profile_discovery_complete(UUID), private.has_verified_record(UUID).

CREATE OR REPLACE FUNCTION private.is_profile_discovery_complete(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
     WHERE pr.id = p_user_id
       AND pr.is_discoverable AND NOT pr.is_suspended
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
ALTER FUNCTION private.is_profile_discovery_complete(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_profile_discovery_complete(UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_verified_record(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
      JOIN public.verification_requests vr ON vr.user_id = pr.id
     WHERE pr.id = p_user_id
       AND pr.verification_status = 'verified'::public.verification_state
       AND vr.status = 'verified'::public.verification_state
       AND vr.decided_at IS NOT NULL
  );
$function$;
ALTER FUNCTION private.has_verified_record(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.has_verified_record(UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.guard_swipe_pair()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.actor_id = NEW.target_id THEN
    RAISE EXCEPTION 'Self-swipes are not allowed'
      USING ERRCODE = '23514';
  END IF;

  PERFORM private.lock_user_pair(NEW.actor_id, NEW.target_id);

  IF EXISTS (
    SELECT 1
      FROM public.blocks AS b
     WHERE (b.blocker_id = NEW.actor_id AND b.blocked_id = NEW.target_id)
        OR (b.blocker_id = NEW.target_id AND b.blocked_id = NEW.actor_id)
  ) OR private.is_pair_excluded(NEW.actor_id, NEW.target_id) THEN
    RAISE EXCEPTION 'Swipes are prohibited when either user has blocked the other'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles AS p
     WHERE p.id = NEW.actor_id
       AND p.is_discoverable
       AND NOT p.is_suspended
       AND p.birth_date <= (CURRENT_DATE - INTERVAL '18 years')::DATE
  ) THEN
    RAISE EXCEPTION 'Swipe actor is not eligible for discovery'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles AS p
     WHERE p.id = NEW.target_id
       AND p.is_discoverable
       AND NOT p.is_suspended
       AND p.birth_date <= (CURRENT_DATE - INTERVAL '18 years')::DATE
  ) THEN
    RAISE EXCEPTION 'Swipe target is not eligible for discovery'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_discovery_feed(INTEGER, TIMESTAMPTZ);
CREATE FUNCTION public.get_discovery_feed(
  p_limit INTEGER DEFAULT 20,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (profile_id UUID, display_name TEXT, age INTEGER, city_region TEXT,
  relationship_intention public.relationship_intention, shared_interests TEXT[], primary_photo_path TEXT,
  cursor_created_at TIMESTAMPTZ, is_verified BOOLEAN)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_min_age SMALLINT := 18;
  v_max_age SMALLINT := 99;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit,20),1),50);
  v_today DATE := (pg_catalog.now() AT TIME ZONE 'UTC')::DATE;
  v_after_created_at TIMESTAMPTZ;
  v_after_profile_id UUID;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  DELETE FROM private.discovery_cursors WHERE user_id = v_actor AND expires_at <= pg_catalog.now();
  IF p_cursor IS NOT NULL THEN
    SELECT c.last_created_at, c.last_profile_id INTO v_after_created_at, v_after_profile_id
      FROM private.discovery_cursors c
     WHERE c.cursor_token = p_cursor AND c.user_id = v_actor AND c.expires_at > pg_catalog.now();
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid_discovery_cursor' USING ERRCODE = '22023'; END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id=v_actor
      AND actor.is_discoverable AND NOT actor.is_suspended
      AND actor.birth_date <= (v_today - INTERVAL '18 years')::DATE
      AND actor.display_name IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(actor.display_name)) >= 2
      AND actor.city_region IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(actor.city_region)) >= 2
      AND actor.relationship_intention IS NOT NULL
      AND pg_catalog.jsonb_typeof(actor.prompts::jsonb)='array'
      AND (SELECT count(DISTINCT p->>'key') FROM pg_catalog.jsonb_array_elements(actor.prompts::jsonb) p
           WHERE pg_catalog.jsonb_typeof(p)='object' AND p->>'key' IN ('weekend','values','relationship_goal')
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

  SELECT preferences.min_age,preferences.max_age INTO v_min_age,v_max_age
  FROM public.user_preferences preferences WHERE preferences.user_id=v_actor;
  v_min_age:=COALESCE(v_min_age,18); v_max_age:=COALESCE(v_max_age,99);
  RETURN QUERY
  WITH page AS MATERIALIZED (
    SELECT candidate.id AS profile_id, candidate.display_name,
      EXTRACT(YEAR FROM pg_catalog.age(v_today,candidate.birth_date))::INTEGER AS age,
      candidate.city_region,candidate.relationship_intention,candidate.shared_interests,
      (SELECT photo.storage_path FROM public.profile_photos photo JOIN storage.objects so
         ON so.bucket_id::TEXT COLLATE "C"='profile_photos'::TEXT COLLATE "C"
        AND so.name::TEXT COLLATE "C"=photo.storage_path::TEXT COLLATE "C"
        AND so.owner_id::TEXT COLLATE "C"=photo.user_id::TEXT COLLATE "C"
        AND so.metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp','image/heic')
        AND CASE WHEN COALESCE(so.metadata->>'size','') ~ '^[0-9]+$'
                 THEN (so.metadata->>'size')::BIGINT BETWEEN 1 AND 5242880 ELSE FALSE END
       WHERE photo.user_id=candidate.id ORDER BY photo.position,photo.created_at,photo.id LIMIT 1) AS primary_photo_path,
      candidate.created_at AS candidate_created_at,
      private.has_verified_record(candidate.id) AS is_verified
    FROM public.profiles candidate
    WHERE candidate.id<>v_actor
      AND candidate.is_discoverable AND NOT candidate.is_suspended AND NOT candidate.is_incognito
      AND candidate.birth_date <= (v_today - INTERVAL '18 years')::DATE
      AND candidate.display_name IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(candidate.display_name)) >= 2
      AND candidate.city_region IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(candidate.city_region)) >= 2
      AND candidate.relationship_intention IS NOT NULL
      AND EXTRACT(YEAR FROM pg_catalog.age(v_today,candidate.birth_date))::INTEGER BETWEEN v_min_age AND v_max_age
      AND (v_after_created_at IS NULL OR (candidate.created_at,candidate.id) < (v_after_created_at,v_after_profile_id))
      AND pg_catalog.jsonb_typeof(candidate.prompts::jsonb)='array'
      AND (SELECT count(DISTINCT p->>'key') FROM pg_catalog.jsonb_array_elements(candidate.prompts::jsonb) p
           WHERE pg_catalog.jsonb_typeof(p)='object' AND p->>'key' IN ('weekend','values','relationship_goal')
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
      AND NOT private.is_pair_excluded(v_actor, candidate.id)
      AND NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.reporter_id=v_actor AND r.reported_user_id=candidate.id)
    ORDER BY candidate.created_at DESC,candidate.id DESC LIMIT v_limit
  ), last_row AS (
    SELECT candidate_created_at, profile_id FROM page ORDER BY candidate_created_at ASC,profile_id ASC LIMIT 1
  ), token AS (
    INSERT INTO private.discovery_cursors(cursor_token,user_id,last_created_at,last_profile_id,expires_at)
    SELECT pg_catalog.clock_timestamp() + pg_catalog.nextval('private.discovery_cursor_token_seq') * INTERVAL '1 microsecond',
           v_actor,last_row.candidate_created_at,last_row.profile_id,pg_catalog.now()+INTERVAL '30 minutes'
      FROM last_row WHERE (SELECT count(*) FROM page)=v_limit
    RETURNING cursor_token
  )
  SELECT page.profile_id,page.display_name,page.age,page.city_region,page.relationship_intention,
    page.shared_interests,page.primary_photo_path,(SELECT token.cursor_token FROM token),page.is_verified
  FROM page ORDER BY page.candidate_created_at DESC,page.profile_id DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_swipe(
  p_target_id UUID,
  p_direction public.swipe_direction
)
RETURNS TABLE (swipe_id UUID, matched BOOLEAN, match_id UUID, likes_remaining INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_today DATE := (pg_catalog.now() AT TIME ZONE 'UTC')::DATE;
  v_likes_used INTEGER := 0;
  v_remaining INTEGER := -1;
  v_swipe_id UUID;
  v_match_id UUID;
  v_has_entitlement BOOLEAN;
  v_existing_direction public.swipe_direction;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  IF p_target_id IS NULL OR p_direction IS NULL THEN RAISE EXCEPTION 'target_and_direction_required' USING ERRCODE = '22023'; END IF;
  IF p_target_id = v_actor THEN RAISE EXCEPTION 'Self-swipes are not allowed' USING ERRCODE = '23514'; END IF;
  PERFORM private.lock_user_pair(v_actor, p_target_id);
  -- Checked before the idempotent replay so no historical swipe can bypass it.
  IF private.is_pair_excluded(v_actor, p_target_id) THEN RAISE EXCEPTION 'blocked_pair' USING ERRCODE = '42501'; END IF;

  SELECT sw.id, sw.direction INTO v_swipe_id, v_existing_direction FROM public.swipes sw
    WHERE sw.actor_id = v_actor AND sw.target_id = p_target_id;
  IF FOUND THEN
    IF v_existing_direction IS DISTINCT FROM p_direction THEN
      RAISE EXCEPTION 'duplicate_swipe_direction_mismatch' USING ERRCODE = '23505';
    END IF;
    SELECT m.id INTO v_match_id FROM public.matches m
      WHERE m.user_a_id = LEAST(v_actor, p_target_id) AND m.user_b_id = GREATEST(v_actor, p_target_id)
        AND m.status = 'active'::public.match_status;
    IF NOT public.has_active_entitlement(v_actor) THEN
      SELECT GREATEST(15 - COALESCE(q.likes_used, 0), 0) INTO v_remaining FROM public.daily_swipe_quotas q
       WHERE q.user_id = v_actor AND q.quota_date = v_today;
      IF NOT FOUND THEN v_remaining := 15; END IF;
    END IF;
    RETURN QUERY SELECT v_swipe_id, v_match_id IS NOT NULL, v_match_id, v_remaining;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles a WHERE a.id = v_actor AND a.is_discoverable AND NOT a.is_suspended AND a.birth_date <= ((pg_catalog.now() AT TIME ZONE 'UTC')::DATE - INTERVAL '18 years')::DATE) THEN
    RAISE EXCEPTION 'actor_not_eligible' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles t WHERE t.id = p_target_id AND t.is_discoverable AND NOT t.is_suspended AND NOT t.is_incognito AND t.birth_date <= ((pg_catalog.now() AT TIME ZONE 'UTC')::DATE - INTERVAL '18 years')::DATE) THEN
    RAISE EXCEPTION 'target_not_eligible' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.blocks b WHERE (b.blocker_id = v_actor AND b.blocked_id = p_target_id) OR (b.blocker_id = p_target_id AND b.blocked_id = v_actor)) THEN RAISE EXCEPTION 'blocked_pair' USING ERRCODE = '42501'; END IF;

  v_has_entitlement := public.has_active_entitlement(v_actor);
  IF p_direction = 'like'::public.swipe_direction AND NOT v_has_entitlement THEN
    INSERT INTO public.daily_swipe_quotas (user_id, quota_date, likes_used, updated_at)
    VALUES (v_actor, v_today, 1, pg_catalog.now())
    ON CONFLICT (user_id, quota_date) DO UPDATE SET likes_used = daily_swipe_quotas.likes_used + 1, updated_at = pg_catalog.now()
      WHERE daily_swipe_quotas.likes_used < 15
    RETURNING likes_used INTO v_likes_used;
    IF NOT FOUND THEN RAISE EXCEPTION 'quota_exceeded' USING ERRCODE = 'P0001'; END IF;
    v_remaining := 15 - v_likes_used;
  ELSIF NOT v_has_entitlement THEN
    SELECT GREATEST(15 - COALESCE(q.likes_used, 0), 0) INTO v_remaining FROM (SELECT 1) seed
      LEFT JOIN public.daily_swipe_quotas q ON q.user_id = v_actor AND q.quota_date = v_today;
  END IF;

  INSERT INTO public.swipes (actor_id, target_id, direction) VALUES (v_actor, p_target_id, p_direction) RETURNING id INTO v_swipe_id;
  SELECT m.id INTO v_match_id FROM public.matches m
   WHERE m.user_a_id = LEAST(v_actor, p_target_id) AND m.user_b_id = GREATEST(v_actor, p_target_id) AND m.status = 'active'::public.match_status;
  RETURN QUERY SELECT v_swipe_id, v_match_id IS NOT NULL, v_match_id, v_remaining;
END;
$function$;

ALTER FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) TO authenticated;
ALTER FUNCTION public.record_swipe(UUID, public.swipe_direction) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.record_swipe(UUID, public.swipe_direction) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_swipe(UUID, public.swipe_direction) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_read_profile_photo_object(p_object_name TEXT, p_object_owner TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH viewer AS (SELECT (SELECT auth.uid()) AS id),
  photo AS (
    SELECT ph.user_id
      FROM public.profile_photos ph
     WHERE ph.storage_path::TEXT COLLATE "C" = p_object_name::TEXT COLLATE "C"
       AND ph.user_id::TEXT COLLATE "C" = p_object_owner::TEXT COLLATE "C"
       AND (pg_catalog.string_to_array(p_object_name, '/'))[1] COLLATE "C" = ph.user_id::TEXT COLLATE "C"
     LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
      FROM photo, viewer, public.profiles owner_profile
     WHERE viewer.id IS NOT NULL
       AND owner_profile.id = photo.user_id
       AND photo.user_id <> viewer.id
       AND NOT owner_profile.is_suspended
       AND owner_profile.birth_date <= ((pg_catalog.now() AT TIME ZONE 'UTC')::DATE - INTERVAL '18 years')::DATE
       AND NOT EXISTS (SELECT 1 FROM public.blocks b
                        WHERE (b.blocker_id = viewer.id AND b.blocked_id = photo.user_id)
                           OR (b.blocker_id = photo.user_id AND b.blocked_id = viewer.id))
       AND NOT private.is_pair_excluded(viewer.id, photo.user_id)
       AND NOT EXISTS (SELECT 1 FROM public.reports r
                        WHERE r.reporter_id = viewer.id AND r.reported_user_id = photo.user_id)
       AND (
         EXISTS (SELECT 1 FROM public.matches m
                  WHERE m.user_a_id = LEAST(viewer.id, photo.user_id)
                    AND m.user_b_id = GREATEST(viewer.id, photo.user_id)
                    AND m.status = 'active'::public.match_status)
         OR (
           owner_profile.is_discoverable
           AND private.is_profile_discovery_complete(owner_profile.id) AND NOT owner_profile.is_incognito
           AND EXISTS (SELECT 1 FROM public.profiles actor
                        WHERE actor.id = viewer.id
                          AND private.is_profile_discovery_complete(actor.id)
                          AND actor.is_discoverable AND NOT actor.is_suspended
                          AND actor.birth_date <= ((pg_catalog.now() AT TIME ZONE 'UTC')::DATE - INTERVAL '18 years')::DATE)
         )
       )
  );
$function$;
ALTER FUNCTION private.can_read_profile_photo_object(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.can_read_profile_photo_object(TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.can_read_profile_photo_object(TEXT, TEXT) TO authenticated;

DROP POLICY IF EXISTS p2_13_profile_photos_select_visible ON storage.objects;
CREATE POLICY p2_13_profile_photos_select_visible ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"
  AND private.can_read_profile_photo_object(name::TEXT, owner_id::TEXT)
);
