-- Anonymous quiz funnel measurement (privacy-respecting, server-side drop-off).
--
-- Why a NEW table: public.funnel_events (20261023000030) is keyed by auth.users(id) and its CHECK allow-list is only
-- signup_completed / doi_confirmed / profile_completed, so anonymous /quiz steps could not be recorded. We do NOT loosen
-- it. public.quiz_events is a separate, deliberately non-personal table.
--
-- What is stored per row (and nothing else): a random client-generated v4 UUID session id (NOT a fingerprint; kept only
-- in the visitor's local storage, rotated after 30 days), an allow-listed event name, a step number, ONE allow-listed
-- answer enum value (or an ISO alpha-2 country on step 4), and the visitor's allow-listed ad-click fields (network slug,
-- click id, sub ids, utm_* via private.sanitize_attribution_params: same rules as signup_attributions). NO user_id, NO IP
-- address, NO user agent, NO free text, NO URL. The session id is NEVER written to auth user metadata and rows are NEVER
-- linked to an account (consent decision: see docs/operations/quiz-funnel-events.md).
--
-- Write path: public.record_quiz_event(...) only. SECURITY DEFINER, callable by anon + authenticated, strict validation,
-- 1 KB payload cap, idempotent on (session_id, event, step), per-session cap and a global per-minute circuit breaker.
-- Read path: service_role SELECT only (RLS enabled, no policies). Purge: public.purge_quiz_events (service_role only).
--
-- RETENTION: 90 days. Suggested job (NOT scheduled here; pg_cron setup is an operator decision):
--   SELECT cron.schedule('purge-quiz-events', '17 3 * * *', $$SELECT public.purge_quiz_events(90)$$);
--
-- PR #35 review lessons applied: REVOKE ALL FROM PUBLIC first and from every API role (Supabase default privileges would
-- otherwise hand anon/authenticated/service_role full table rights incl. DELETE/TRUNCATE), then re-grant only the narrow
-- contract; no UPDATE/DELETE/TRUNCATE for any API role; every SECURITY DEFINER function pins SET search_path.

-- Single source of truth for which (event, step, answer, country) combinations are legal. Used by the table CHECK and by
-- record_quiz_event. Option values mirror lib/quiz.ts QUIZ_CHOICE_STEPS; country list mirrors chk_profiles_country_code_iso.
CREATE OR REPLACE FUNCTION private.quiz_event_shape_valid(p_event TEXT, p_step INTEGER, p_answer TEXT, p_country TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(CASE
    WHEN p_event IS NULL OR p_step IS NULL THEN FALSE
    WHEN p_event = 'quiz_step' THEN CASE p_step
      WHEN 1 THEN p_country IS NULL AND p_answer IN ('serious','marriage','friendship_first')
      WHEN 2 THEN p_country IS NULL AND p_answer IN ('18_29','30_39','40_49','50_plus')
      WHEN 3 THEN p_country IS NULL AND p_answer IN ('now','few_months','no_rush')
      WHEN 4 THEN p_answer IS NULL AND p_country IN (
    'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE',
    'BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD',
    'CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM',
    'DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF',
    'GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU',
    'ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN',
    'KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME',
    'MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA',
    'NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM',
    'PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI',
    'SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK',
    'TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI',
    'VN','VU','WF','WS','YE','YT','ZA','ZM','ZW')
      ELSE FALSE
    END
    WHEN p_event IN ('quiz_started','quiz_completed','quiz_cta_clicked') THEN p_step = 0 AND p_answer IS NULL AND p_country IS NULL
    ELSE FALSE
  END, FALSE);
$function$;
REVOKE ALL ON FUNCTION private.quiz_event_shape_valid(TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- Tunable limits as functions so an operator can change them with CREATE OR REPLACE (and tests can override them).
CREATE OR REPLACE FUNCTION private.quiz_event_session_cap() RETURNS INTEGER
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$ SELECT 7; $function$;      -- 1 started + 4 steps + 1 completed + 1 cta
CREATE OR REPLACE FUNCTION private.quiz_event_global_rate_per_minute() RETURNS INTEGER
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$ SELECT 1200; $function$;   -- circuit breaker, see record_quiz_event
REVOKE ALL ON FUNCTION private.quiz_event_session_cap() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.quiz_event_global_rate_per_minute() FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.quiz_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id UUID NOT NULL,
  event TEXT NOT NULL,
  step SMALLINT NOT NULL DEFAULT 0,
  answer TEXT,
  country_code TEXT,
  network TEXT,
  click_id TEXT,
  attribution JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT uq_quiz_events_session_event_step UNIQUE (session_id, event, step),
  CONSTRAINT chk_quiz_events_session_v4 CHECK (
    pg_catalog.substr(session_id::TEXT, 15, 1) = '4' AND pg_catalog.substr(session_id::TEXT, 20, 1) IN ('8','9','a','b')),
  CONSTRAINT chk_quiz_events_event CHECK (event IN ('quiz_started','quiz_step','quiz_completed','quiz_cta_clicked')),
  CONSTRAINT chk_quiz_events_step_range CHECK (step BETWEEN 0 AND 4),
  CONSTRAINT chk_quiz_events_country_shape CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT chk_quiz_events_network CHECK (network IS NULL OR network ~ '^[a-z0-9_.-]{1,64}$'),
  CONSTRAINT chk_quiz_events_click_id CHECK (click_id IS NULL OR click_id ~ '^[A-Za-z0-9_.:~-]{1,128}$'),
  CONSTRAINT chk_quiz_events_attribution_obj CHECK (pg_catalog.jsonb_typeof(attribution) = 'object'),
  CONSTRAINT chk_quiz_events_attribution_size CHECK (pg_catalog.octet_length(attribution::TEXT) <= 1024),
  CONSTRAINT chk_quiz_events_shape CHECK (private.quiz_event_shape_valid(event, step::INTEGER, answer, country_code))
);
COMMENT ON TABLE public.quiz_events IS 'Anonymous /quiz funnel events. Non-personal by design: random session UUID, allow-listed enums, no user_id/IP/UA/free text, never linked to accounts. Retention 90 days (purge_quiz_events). service_role read only.';
CREATE INDEX idx_quiz_events_created_at ON public.quiz_events (created_at);

ALTER TABLE public.quiz_events ENABLE ROW LEVEL SECURITY;  -- no policies: API roles can never read or write rows directly
REVOKE ALL ON TABLE public.quiz_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.quiz_events TO service_role;  -- analytics reads only; writes/purge go through definer functions
REVOKE ALL ON SEQUENCE public.quiz_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

-- Write path ------------------------------------------------------------------------------------------------------
-- Returns TRUE when a new row was recorded, FALSE for a duplicate (idempotent). Raises on invalid/oversize/over-cap input:
--   22023 invalid_parameter_value   unknown event, step, answer, country, session id or attribution shape
--   54000 program_limit_exceeded    attribution payload larger than 1 KB
--   53400 configuration_limit_exceeded  per-session cap or global per-minute circuit breaker
-- The function never reads auth.uid(): an authenticated caller is recorded exactly like an anonymous one.
-- No IP is available inside Postgres and none is stored, so per-IP throttling is NOT possible here; the global breaker only
-- bounds table growth during a flood (cost: a flood can briefly stop legitimate events, never affects the quiz UI because the
-- client ignores failures). Put per-IP limits at the edge/WAF if needed.
CREATE OR REPLACE FUNCTION public.record_quiz_event(
  p_session_id UUID,
  p_event TEXT,
  p_step INTEGER DEFAULT 0,
  p_answer TEXT DEFAULT NULL,
  p_country_code TEXT DEFAULT NULL,
  p_attribution JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_attr JSONB := COALESCE(p_attribution, '{}'::JSONB);
  v_params JSONB;
  v_network TEXT;
  v_click TEXT;
  v_rows INTEGER;
BEGIN
  IF p_session_id IS NULL
     OR pg_catalog.substr(p_session_id::TEXT, 15, 1) <> '4'
     OR pg_catalog.substr(p_session_id::TEXT, 20, 1) NOT IN ('8','9','a','b') THEN
    RAISE EXCEPTION 'invalid_session_id' USING ERRCODE = '22023';
  END IF;
  IF NOT private.quiz_event_shape_valid(p_event, p_step, p_answer, p_country_code) THEN
    RAISE EXCEPTION 'invalid_quiz_event' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_typeof(v_attr) <> 'object' THEN
    RAISE EXCEPTION 'invalid_attribution' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.octet_length(v_attr::TEXT) > 1024 THEN
    RAISE EXCEPTION 'payload_too_large' USING ERRCODE = '54000';
  END IF;

  -- Idempotency first: a retry of an already stored event is a cheap no-op and never counts against the limits.
  IF EXISTS (SELECT 1 FROM public.quiz_events q
              WHERE q.session_id = p_session_id AND q.event = p_event AND q.step = p_step) THEN
    RETURN FALSE;
  END IF;

  -- Serialise per session so concurrent calls cannot slip past the cap.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quiz_events:' || p_session_id::TEXT, 0));
  IF (SELECT pg_catalog.count(*) FROM public.quiz_events q WHERE q.session_id = p_session_id) >= private.quiz_event_session_cap() THEN
    RAISE EXCEPTION 'session_event_cap_exceeded' USING ERRCODE = '53400';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM public.quiz_events q WHERE q.created_at >= pg_catalog.now() - INTERVAL '1 minute')
       >= private.quiz_event_global_rate_per_minute() THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '53400';
  END IF;

  -- Same allow-list and network/click-id resolution as signup_attributions (see handle_auth_user_funnel).
  v_params := private.sanitize_attribution_params(v_attr);
  v_network := pg_catalog.lower(v_params ->> 'network');
  IF v_network IS NULL OR NOT EXISTS (SELECT 1 FROM public.attribution_networks n WHERE n.slug = v_network) THEN
    v_network := NULL;
  END IF;
  SELECT v_params ->> u.p INTO v_click
    FROM public.attribution_networks n, pg_catalog.unnest(n.click_id_params) WITH ORDINALITY AS u(p, ord)
   WHERE n.slug = COALESCE(v_network, 'unknown') AND v_params ? u.p
   ORDER BY u.ord LIMIT 1;
  IF v_click IS NOT NULL AND v_click !~ '^[A-Za-z0-9_.:~-]{1,128}$' THEN v_click := NULL; END IF;
  v_network := COALESCE(v_network, CASE WHEN v_click IS NOT NULL THEN 'unknown' END);

  INSERT INTO public.quiz_events (session_id, event, step, answer, country_code, network, click_id, attribution)
  VALUES (p_session_id, p_event, p_step, p_answer, p_country_code, v_network, v_click, v_params)
  ON CONFLICT ON CONSTRAINT uq_quiz_events_session_event_step DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$function$;
ALTER FUNCTION public.record_quiz_event(UUID, TEXT, INTEGER, TEXT, TEXT, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_quiz_event(UUID, TEXT, INTEGER, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_quiz_event(UUID, TEXT, INTEGER, TEXT, TEXT, JSONB) TO anon, authenticated;

-- Retention: delete rows older than p_retention_days (default 90, minimum 7 so a typo cannot wipe recent data), in bounded
-- batches. Returns the number of rows deleted. service_role only.
CREATE OR REPLACE FUNCTION public.purge_quiz_events(p_retention_days INTEGER DEFAULT 90, p_limit INTEGER DEFAULT 50000)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF p_retention_days IS NULL OR p_retention_days < 7 THEN
    RAISE EXCEPTION 'retention_too_short' USING ERRCODE = '22023';
  END IF;
  WITH doomed AS (
    SELECT q.id FROM public.quiz_events q
     WHERE q.created_at < pg_catalog.now() - pg_catalog.make_interval(days => p_retention_days)
     ORDER BY q.created_at
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50000), 1), 200000)
  )
  DELETE FROM public.quiz_events q USING doomed d WHERE q.id = d.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;
ALTER FUNCTION public.purge_quiz_events(INTEGER, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.purge_quiz_events(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_quiz_events(INTEGER, INTEGER) TO service_role;

-- Drop-off report: distinct sessions per day (UTC, day of the session's first event) x network x event x step.
-- A session's network is the first non-null network seen on any of its events (the client sends click params on
-- quiz_started). Aggregates only; service_role only. Window is capped at 366 days.
CREATE OR REPLACE FUNCTION public.quiz_funnel_summary(
  p_from TIMESTAMPTZ DEFAULT pg_catalog.now() - INTERVAL '30 days',
  p_to TIMESTAMPTZ DEFAULT pg_catalog.now()
)
RETURNS TABLE (day DATE, network TEXT, event TEXT, step SMALLINT, sessions BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH win AS (
    SELECT q.session_id, q.event, q.step, q.network, q.created_at
      FROM public.quiz_events q
     WHERE q.created_at >= GREATEST(p_from, p_to - INTERVAL '366 days') AND q.created_at < p_to
  ), sess AS (
    SELECT w.session_id,
           (pg_catalog.min(w.created_at) AT TIME ZONE 'UTC')::DATE AS first_day,
           (pg_catalog.array_agg(w.network ORDER BY w.created_at) FILTER (WHERE w.network IS NOT NULL))[1] AS network
      FROM win w GROUP BY w.session_id
  )
  SELECT s.first_day, COALESCE(s.network, 'direct'), w.event, w.step, pg_catalog.count(DISTINCT w.session_id)
    FROM win w JOIN sess s USING (session_id)
   GROUP BY s.first_day, COALESCE(s.network, 'direct'), w.event, w.step
   ORDER BY s.first_day, COALESCE(s.network, 'direct'), w.step, w.event;
$function$;
ALTER FUNCTION public.quiz_funnel_summary(TIMESTAMPTZ, TIMESTAMPTZ) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.quiz_funnel_summary(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quiz_funnel_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ROLLBACK (manual; this is additive and not referenced by any other object):
--   DROP FUNCTION public.quiz_funnel_summary(TIMESTAMPTZ, TIMESTAMPTZ);
--   DROP FUNCTION public.purge_quiz_events(INTEGER, INTEGER);
--   DROP FUNCTION public.record_quiz_event(UUID, TEXT, INTEGER, TEXT, TEXT, JSONB);
--   DROP TABLE public.quiz_events;
--   DROP FUNCTION private.quiz_event_global_rate_per_minute(); DROP FUNCTION private.quiz_event_session_cap();
--   DROP FUNCTION private.quiz_event_shape_valid(TEXT, INTEGER, TEXT, TEXT);
