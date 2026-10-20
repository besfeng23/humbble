-- P2-05: hardened public RPCs and atomic invariants.
-- Reuses the pair lock, swipe guard/match trigger, block triggers, report guard,
-- and trusted-moderator helper established by migrations 0002-0004.
-- The migration intentionally does not modify Storage, Auth settings, or the
-- earlier schema. Retention deadlines/legal holds remain unassessed by default.

CREATE OR REPLACE FUNCTION public.get_discovery_feed(
  p_limit INTEGER DEFAULT 20,
  p_cursor TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  profile_id UUID,
  display_name TEXT,
  age INTEGER,
  city_region TEXT,
  relationship_intention public.relationship_intention,
  shared_interests TEXT[],
  primary_photo_path TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_min_age SMALLINT := 18;
  v_max_age SMALLINT := 99;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_today DATE := (pg_catalog.now() AT TIME ZONE 'UTC')::DATE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles AS actor
     WHERE actor.id = v_actor
       AND actor.verification_status = 'verified'::public.verification_state
       AND actor.is_discoverable
       AND NOT actor.is_suspended
       AND actor.birth_date <= (v_today - INTERVAL '18 years')::DATE
  ) THEN
    RAISE EXCEPTION 'actor_not_eligible' USING ERRCODE = '42501';
  END IF;

  SELECT preferences.min_age, preferences.max_age
    INTO v_min_age, v_max_age
    FROM public.user_preferences AS preferences
   WHERE preferences.user_id = v_actor;
  v_min_age := COALESCE(v_min_age, 18);
  v_max_age := COALESCE(v_max_age, 99);

  RETURN QUERY
  SELECT
    candidate.id,
    candidate.display_name,
    EXTRACT(YEAR FROM pg_catalog.age(v_today, candidate.birth_date))::INTEGER,
    candidate.city_region,
    candidate.relationship_intention,
    candidate.shared_interests,
    (
      SELECT photo.storage_path
        FROM public.profile_photos AS photo
       WHERE photo.user_id = candidate.id
       ORDER BY photo.position ASC, photo.created_at ASC, photo.id ASC
       LIMIT 1
    ) AS primary_photo_path
  FROM public.profiles AS candidate
  WHERE candidate.id <> v_actor
    AND candidate.verification_status = 'verified'::public.verification_state
    AND candidate.is_discoverable
    AND NOT candidate.is_suspended
    AND NOT candidate.is_incognito
    AND candidate.birth_date <= (v_today - INTERVAL '18 years')::DATE
    AND EXTRACT(YEAR FROM pg_catalog.age(v_today, candidate.birth_date))::INTEGER
        BETWEEN v_min_age AND v_max_age
    AND (p_cursor IS NULL OR candidate.created_at < p_cursor)
    AND NOT EXISTS (
      SELECT 1 FROM public.swipes AS sw
       WHERE sw.actor_id = v_actor AND sw.target_id = candidate.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks AS b
       WHERE (b.blocker_id = v_actor AND b.blocked_id = candidate.id)
          OR (b.blocker_id = candidate.id AND b.blocked_id = v_actor)
    )
  ORDER BY candidate.created_at DESC, candidate.id DESC
  LIMIT v_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_active_entitlement(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_jwt_role TEXT := (SELECT auth.jwt() ->> 'role');
BEGIN
  IF v_actor IS NULL
     AND COALESCE(v_jwt_role, '')::TEXT COLLATE "C" <> 'service_role'::TEXT COLLATE "C" THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required' USING ERRCODE = '22023';
  END IF;
  IF p_user_id IS DISTINCT FROM v_actor
     AND COALESCE(v_jwt_role, '')::TEXT COLLATE "C" <> 'service_role'::TEXT COLLATE "C" THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.entitlements AS e
     WHERE e.user_id = p_user_id
       AND e.status = 'active'::public.entitlement_status
       AND e.valid_from <= pg_catalog.now()
       AND (e.valid_until IS NULL OR e.valid_until > pg_catalog.now())
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_swipe(
  p_target_id UUID,
  p_direction public.swipe_direction
)
RETURNS TABLE (
  swipe_id UUID,
  matched BOOLEAN,
  match_id UUID,
  likes_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_target_id IS NULL OR p_direction IS NULL THEN
    RAISE EXCEPTION 'target_and_direction_required' USING ERRCODE = '22023';
  END IF;
  IF p_target_id = v_actor THEN
    RAISE EXCEPTION 'Self-swipes are not allowed' USING ERRCODE = '23514';
  END IF;

  PERFORM private.lock_user_pair(v_actor, p_target_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS actor
     WHERE actor.id = v_actor
       AND actor.verification_status = 'verified'::public.verification_state
       AND actor.is_discoverable
       AND NOT actor.is_suspended
       AND actor.birth_date <= ((pg_catalog.now() AT TIME ZONE 'UTC')::DATE - INTERVAL '18 years')::DATE
  ) THEN
    RAISE EXCEPTION 'actor_not_eligible' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS target
     WHERE target.id = p_target_id
       AND target.verification_status = 'verified'::public.verification_state
       AND target.is_discoverable
       AND NOT target.is_suspended
       AND target.birth_date <= ((pg_catalog.now() AT TIME ZONE 'UTC')::DATE - INTERVAL '18 years')::DATE
  ) THEN
    RAISE EXCEPTION 'target_not_eligible' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.blocks AS b
     WHERE (b.blocker_id = v_actor AND b.blocked_id = p_target_id)
        OR (b.blocker_id = p_target_id AND b.blocked_id = v_actor)
  ) THEN
    RAISE EXCEPTION 'blocked_pair' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.swipes AS existing_swipe
     WHERE existing_swipe.actor_id = v_actor
       AND existing_swipe.target_id = p_target_id
  ) THEN
    RAISE EXCEPTION 'duplicate_swipe' USING ERRCODE = '23505';
  END IF;

  v_has_entitlement := public.has_active_entitlement(v_actor);
  IF p_direction = 'like'::public.swipe_direction AND NOT v_has_entitlement THEN
    -- One atomic upsert is the quota lock: concurrent callers serialize on the
    -- (user_id, UTC date) key. If the row is already at 15, it returns no row.
    INSERT INTO public.daily_swipe_quotas (user_id, quota_date, likes_used, updated_at)
    VALUES (v_actor, v_today, 1, pg_catalog.now())
    ON CONFLICT (user_id, quota_date) DO UPDATE
      SET likes_used = daily_swipe_quotas.likes_used + 1,
          updated_at = pg_catalog.now()
      WHERE daily_swipe_quotas.likes_used < 15
    RETURNING likes_used INTO v_likes_used;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'quota_exceeded' USING ERRCODE = 'P0001';
    END IF;
    v_remaining := 15 - v_likes_used;
  ELSIF NOT v_has_entitlement THEN
    SELECT COALESCE(q.likes_used, 0)
      INTO v_likes_used
      FROM (SELECT 1) AS seed
      LEFT JOIN public.daily_swipe_quotas AS q
        ON q.user_id = v_actor AND q.quota_date = v_today;
    v_remaining := GREATEST(15 - COALESCE(v_likes_used, 0), 0);
  END IF;

  INSERT INTO public.swipes (actor_id, target_id, direction)
  VALUES (v_actor, p_target_id, p_direction)
  RETURNING id INTO v_swipe_id;

  SELECT m.id INTO v_match_id
    FROM public.matches AS m
   WHERE m.user_a_id = LEAST(v_actor, p_target_id)
     AND m.user_b_id = GREATEST(v_actor, p_target_id)
     AND m.status = 'active'::public.match_status;

  RETURN QUERY SELECT v_swipe_id, v_match_id IS NOT NULL, v_match_id, v_remaining;
END;
$function$;

CREATE OR REPLACE FUNCTION public.block_user(p_target_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_inserted INTEGER;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_target_id IS NULL OR p_target_id = v_actor THEN
    RAISE EXCEPTION 'invalid_block_target' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_target_id) THEN
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_user_pair(v_actor, p_target_id);
  INSERT INTO public.blocks (blocker_id, blocked_id)
  VALUES (v_actor, p_target_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
    VALUES (v_actor, 'block.created', 'profile', p_target_id, '{}'::JSONB);
  END IF;
  -- The blocks trigger from 0002 terminates any active match. Repeating this
  -- operation is safe and does not create duplicate block or audit rows.
  RETURN p_target_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unblock_user(p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_deleted INTEGER;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_target_id IS NULL OR p_target_id = v_actor THEN
    RAISE EXCEPTION 'invalid_unblock_target' USING ERRCODE = '23514';
  END IF;

  PERFORM private.lock_user_pair(v_actor, p_target_id);
  DELETE FROM public.blocks AS b
   WHERE b.blocker_id = v_actor AND b.blocked_id = p_target_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 1 THEN
    INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
    VALUES (v_actor, 'block.removed', 'profile', p_target_id, '{}'::JSONB);
  END IF;
  -- Removing a block intentionally never reactivates a match or conversation.
  RETURN v_deleted = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_report(
  p_reported_user_id UUID,
  p_category public.report_category,
  p_context_summary TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_report_id UUID;
  v_count INTEGER;
  v_context TEXT := NULLIF(pg_catalog.btrim(p_context_summary), '');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_reported_user_id IS NULL OR p_category IS NULL THEN
    RAISE EXCEPTION 'reported_user_and_category_required' USING ERRCODE = '22023';
  END IF;
  IF p_reported_user_id = v_actor THEN
    RAISE EXCEPTION 'self_report_not_allowed' USING ERRCODE = '23514';
  END IF;
  -- The existing reports.context_summary constraint is 1,000 characters.
  IF v_context IS NOT NULL AND pg_catalog.char_length(v_context) > 1000 THEN
    RAISE EXCEPTION 'report_context_too_long' USING ERRCODE = '22001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_reported_user_id) THEN
    RAISE EXCEPTION 'reported_user_not_found' USING ERRCODE = '22023';
  END IF;

  -- Serialize by reporter so concurrent submissions cannot bypass the limit.
  PERFORM pg_catalog.pg_advisory_xact_lock(65003, pg_catalog.hashtext(v_actor::TEXT));
  SELECT pg_catalog.count(*)::INTEGER INTO v_count
    FROM public.reports AS r
   WHERE r.reporter_id = v_actor
     AND r.created_at >= pg_catalog.now() - INTERVAL '24 hours';
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'report_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reports (reporter_id, reported_user_id, category, context_summary)
  VALUES (v_actor, p_reported_user_id, p_category, v_context)
  RETURNING id INTO v_report_id;
  INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'report.submitted', 'report', v_report_id,
          pg_catalog.jsonb_build_object('category', p_category::TEXT));
  RETURN v_report_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_privacy_action(
  p_request_type public.privacy_request_type,
  p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_existing_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_request_type IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'request_type_and_idempotency_key_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(65004, pg_catalog.hashtext(v_actor::TEXT));
  SELECT pr.id INTO v_existing_id
    FROM public.privacy_requests AS pr
   WHERE pr.user_id = v_actor AND pr.idempotency_key = p_idempotency_key;
  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.privacy_requests AS pr
     WHERE pr.user_id = v_actor
       AND pr.request_type = p_request_type
       AND pr.status IN ('requested'::public.privacy_request_status, 'in_progress'::public.privacy_request_status)
  ) THEN
    RAISE EXCEPTION 'privacy_request_already_open' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.privacy_requests (user_id, request_type, idempotency_key)
  VALUES (v_actor, p_request_type, p_idempotency_key)
  RETURNING id INTO v_existing_id;
  INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'privacy.requested', 'privacy_request', v_existing_id,
          pg_catalog.jsonb_build_object('request_type', p_request_type::TEXT));
  RETURN v_existing_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.moderation_transition_case(
  p_case_id UUID,
  p_new_status public.moderation_case_status,
  p_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_jwt_role TEXT := (SELECT auth.jwt() ->> 'role');
  v_old_status public.moderation_case_status;
  v_note TEXT := NULLIF(pg_catalog.btrim(p_note), '');
BEGIN
  -- User-initiated transitions require auth.uid(); a trusted service-role
  -- principal is the explicit system-actor exception and is recorded as such.
  IF v_actor IS NULL
     AND COALESCE(v_jwt_role, '')::TEXT COLLATE "C" <> 'service_role'::TEXT COLLATE "C" THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(v_jwt_role, '')::TEXT COLLATE "C" <> 'service_role'::TEXT COLLATE "C"
     AND NOT private.is_trusted_moderator() THEN
    RAISE EXCEPTION 'moderator_required' USING ERRCODE = '42501';
  END IF;
  IF p_case_id IS NULL OR p_new_status IS NULL THEN
    RAISE EXCEPTION 'case_and_status_required' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND pg_catalog.char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'moderation_note_too_long' USING ERRCODE = '22001';
  END IF;

  SELECT mc.status INTO v_old_status
    FROM public.moderation_cases AS mc
   WHERE mc.id = p_case_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'moderation_case_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_old_status = p_new_status THEN
    RAISE EXCEPTION 'invalid_moderation_transition' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (v_old_status = 'open'::public.moderation_case_status AND p_new_status = 'in_review'::public.moderation_case_status)
    OR (v_old_status = 'in_review'::public.moderation_case_status AND p_new_status IN (
      'resolved'::public.moderation_case_status, 'appealed'::public.moderation_case_status, 'closed'::public.moderation_case_status
    ))
    OR (v_old_status = 'resolved'::public.moderation_case_status AND p_new_status IN (
      'appealed'::public.moderation_case_status, 'closed'::public.moderation_case_status
    ))
    OR (v_old_status = 'appealed'::public.moderation_case_status AND p_new_status IN (
      'in_review'::public.moderation_case_status, 'resolved'::public.moderation_case_status, 'closed'::public.moderation_case_status
    ))
  ) THEN
    RAISE EXCEPTION 'invalid_moderation_transition' USING ERRCODE = '23514';
  END IF;

  UPDATE public.moderation_cases AS mc
     SET status = p_new_status,
         closed_at = CASE WHEN p_new_status IN ('resolved'::public.moderation_case_status, 'closed'::public.moderation_case_status)
                          THEN pg_catalog.now() ELSE NULL END,
         resolution_code = CASE WHEN v_note IS NOT NULL THEN pg_catalog.left(v_note, 100) ELSE mc.resolution_code END,
         updated_at = pg_catalog.now()
   WHERE mc.id = p_case_id;

  INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'moderation.case_transition', 'moderation_case', p_case_id,
          pg_catalog.jsonb_build_object(
            'from', v_old_status::TEXT,
            'to', p_new_status::TEXT,
            'note', v_note,
            'actor_principal', CASE WHEN v_actor IS NULL THEN 'service_role' ELSE 'authenticated_user' END
          ));
END;
$function$;

-- New functions are owned by postgres (the migration role). Fixed search_path
-- and schema-qualified references prevent temp/public object shadowing.
ALTER FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) OWNER TO postgres;
ALTER FUNCTION public.has_active_entitlement(UUID) OWNER TO postgres;
ALTER FUNCTION public.record_swipe(UUID, public.swipe_direction) OWNER TO postgres;
ALTER FUNCTION public.block_user(UUID) OWNER TO postgres;
ALTER FUNCTION public.unblock_user(UUID) OWNER TO postgres;
ALTER FUNCTION public.submit_report(UUID, public.report_category, TEXT) OWNER TO postgres;
ALTER FUNCTION public.request_privacy_action(public.privacy_request_type, UUID) OWNER TO postgres;
ALTER FUNCTION public.moderation_transition_case(UUID, public.moderation_case_status, TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_entitlement(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_swipe(UUID, public.swipe_direction) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.block_user(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unblock_user(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_report(UUID, public.report_category, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_privacy_action(public.privacy_request_type, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moderation_transition_case(UUID, public.moderation_case_status, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_entitlement(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_swipe(UUID, public.swipe_direction) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_report(UUID, public.report_category, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_privacy_action(public.privacy_request_type, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_transition_case(UUID, public.moderation_case_status, TEXT) TO authenticated, service_role;
