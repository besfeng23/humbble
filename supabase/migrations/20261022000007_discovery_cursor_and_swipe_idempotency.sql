-- P3-03: expose the server cursor while preserving get_discovery_feed argument
-- signature, and make retries of record_swipe idempotent.
-- Opaque timestamp tokens map to the complete (created_at,id) key, so tied timestamps
-- cannot skip candidates. Tokens are actor-scoped and expire after 30 minutes.
CREATE TABLE IF NOT EXISTS private.discovery_cursors (
  cursor_token TIMESTAMPTZ PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_created_at TIMESTAMPTZ NOT NULL,
  last_profile_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_discovery_cursors_user_expiry
  ON private.discovery_cursors(user_id, expires_at);
CREATE SEQUENCE IF NOT EXISTS private.discovery_cursor_token_seq;
ALTER TABLE private.discovery_cursors OWNER TO postgres;
ALTER SEQUENCE private.discovery_cursor_token_seq OWNER TO postgres;

-- Keep the public RPC argument signature; only add a typed opaque cursor field to the return rows.
DROP FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ);
CREATE FUNCTION public.get_discovery_feed(
  p_limit INTEGER DEFAULT 20,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (profile_id UUID, display_name TEXT, age INTEGER, city_region TEXT,
  relationship_intention public.relationship_intention, shared_interests TEXT[], primary_photo_path TEXT,
  cursor_created_at TIMESTAMPTZ)
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
    WHERE actor.id=v_actor AND actor.verification_status='verified'::public.verification_state
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
      candidate.created_at AS candidate_created_at
    FROM public.profiles candidate
    WHERE candidate.id<>v_actor AND candidate.verification_status='verified'::public.verification_state
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
    page.shared_interests,page.primary_photo_path,(SELECT token.cursor_token FROM token)
  FROM page ORDER BY page.candidate_created_at DESC,page.profile_id DESC;
END;
$function$;
ALTER FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) TO authenticated;

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

  IF NOT EXISTS (SELECT 1 FROM public.profiles a WHERE a.id = v_actor AND a.verification_status = 'verified'::public.verification_state AND a.is_discoverable AND NOT a.is_suspended AND a.birth_date <= ((pg_catalog.now() AT TIME ZONE 'UTC')::DATE - INTERVAL '18 years')::DATE) THEN
    RAISE EXCEPTION 'actor_not_eligible' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles t WHERE t.id = p_target_id AND t.verification_status = 'verified'::public.verification_state AND t.is_discoverable AND NOT t.is_suspended AND NOT t.is_incognito AND t.birth_date <= ((pg_catalog.now() AT TIME ZONE 'UTC')::DATE - INTERVAL '18 years')::DATE) THEN
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
ALTER FUNCTION public.record_swipe(UUID, public.swipe_direction) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_swipe(UUID, public.swipe_direction) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_swipe(UUID, public.swipe_direction) TO authenticated;
