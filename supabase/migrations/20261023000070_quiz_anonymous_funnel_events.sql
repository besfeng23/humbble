-- Anonymous quiz funnel measurement (privacy-respecting, server-side drop-off).
--
-- Why a NEW table: public.funnel_events (20261023000030) is keyed by auth.users(id) and its CHECK allow-list is only
-- signup_completed / doi_confirmed / profile_completed, so anonymous /quiz steps could not be recorded. We do NOT loosen
-- it. public.quiz_events is a separate, deliberately non-personal table.
--
-- What is stored per row (and nothing else): a random client-generated v4 UUID session id (NOT a fingerprint; kept only
-- in the visitor's local storage, replaced after 30 days), an allow-listed event name, a step number, ONE allow-listed
-- answer enum value (or an ISO alpha-2 country on step 4), the ad network slug IF it is a slug configured in
-- public.attribution_networks, utm_source / utm_medium / utm_campaign IF they match ^[a-z0-9_-]{1,32}$ (and do not look
-- like a phone number or hash), and created_at ROUNDED DOWN TO THE HOUR (UTC).
-- NOT stored, by construction (no column exists): user_id, IP address, user agent, click id, sub ids, any free-form
-- attribution JSON, URL, exact time, row id. Because click_id / sub ids / exact timestamps are gone, no column of
-- quiz_events can be joined to signup_attributions, funnel_events or postback_outbox (pgTAP asserts this).
-- The session id is NEVER written to auth user metadata and rows are NEVER linked to an account
-- (consent decision: docs/operations/quiz-funnel-events.md).
--
-- Write path: public.record_quiz_event(...) only. SECURITY DEFINER, callable by anon + authenticated. Cheap checks run
-- first (text lengths, enums, regexes, rate peek), then idempotency on the primary key (session_id, event, step), then an
-- atomic per-minute counter (private.quiz_event_rate): global cap private.quiz_event_global_rate_per_minute() = 120/min.
-- The per-session row count is bounded by construction: at most 7 legal (event, step) combinations exist and they are the
-- primary key, so no separate per-session counter is needed.
-- Read path: service_role SELECT only (RLS enabled, no policies).
--
-- RETENTION: 90 days, delivered by public.purge_quiz_events (bounded batch loop) scheduled daily with pg_cron at the end of
-- this migration when pg_cron is available (otherwise a NOTICE is raised and docs/operations/quiz-funnel-events.md says what
-- to do). Verify on dev with docs/operations/privcheck-quiz.sql (one read-only SELECT).
--
-- PR #35 review lessons applied: REVOKE ALL FROM PUBLIC first and from every API role (Supabase default privileges would
-- otherwise hand anon/authenticated/service_role full table rights incl. DELETE/TRUNCATE), then re-grant only the narrow
-- contract; no UPDATE/DELETE/TRUNCATE for any API role; every SECURITY DEFINER function pins SET search_path.
--
-- Re-runnable: CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS for the superseded v1 signatures.

-- v1 of this change (never released) had different signatures; drop them so re-running over a dev database is clean.
DROP FUNCTION IF EXISTS public.record_quiz_event(UUID, TEXT, INTEGER, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.purge_quiz_events(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS private.quiz_event_session_cap();

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

-- Tunable limit as a function so an operator can change it with CREATE OR REPLACE (and tests can override it).
-- 120 rows/minute = 17 complete quiz sessions per minute (7 events each) = about 24k sessions/day, 15.5M rows per 90 days
-- worst case (see docs/operations/quiz-funnel-events.md for measured sizes). Raise it only together with an edge rate limit.
CREATE OR REPLACE FUNCTION private.quiz_event_global_rate_per_minute() RETURNS INTEGER
LANGUAGE sql IMMUTABLE SET search_path = '' AS $function$ SELECT 120; $function$;
REVOKE ALL ON FUNCTION private.quiz_event_global_rate_per_minute() FROM PUBLIC, anon, authenticated, service_role;

-- utm_* values: short slug only, and nothing that looks like free text, a phone number (>= 9 digits) or a hash (>= 24 hex).
CREATE OR REPLACE FUNCTION private.quiz_event_utm_valid(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(
    p_value ~ '^[a-z0-9_-]{1,32}$'
    AND p_value !~ '^[a-f0-9]{24,}$'
    AND pg_catalog.length(pg_catalog.regexp_replace(p_value, '[^0-9]', '', 'g')) < 9,
    FALSE);
$function$;
REVOKE ALL ON FUNCTION private.quiz_event_utm_valid(TEXT) FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.quiz_events (
  session_id UUID NOT NULL,
  event TEXT NOT NULL,
  step SMALLINT NOT NULL DEFAULT 0,
  answer TEXT,
  country_code TEXT,
  network TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  -- Rounded down to the hour (UTC) so rows cannot be matched to signup timestamps.
  created_at TIMESTAMPTZ NOT NULL DEFAULT ((pg_catalog.date_trunc('hour', pg_catalog.now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC'),
  CONSTRAINT pk_quiz_events PRIMARY KEY (session_id, event, step),
  CONSTRAINT chk_quiz_events_session_v4 CHECK (
    pg_catalog.substr(session_id::TEXT, 15, 1) = '4' AND pg_catalog.substr(session_id::TEXT, 20, 1) IN ('8','9','a','b')),
  CONSTRAINT chk_quiz_events_event CHECK (event IN ('quiz_started','quiz_step','quiz_completed','quiz_cta_clicked')),
  CONSTRAINT chk_quiz_events_step_range CHECK (step BETWEEN 0 AND 4),
  CONSTRAINT chk_quiz_events_country_shape CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT chk_quiz_events_network CHECK (network IS NULL OR network ~ '^[a-z0-9_.-]{1,64}$'),
  CONSTRAINT chk_quiz_events_utm_source CHECK (utm_source IS NULL OR private.quiz_event_utm_valid(utm_source)),
  CONSTRAINT chk_quiz_events_utm_medium CHECK (utm_medium IS NULL OR private.quiz_event_utm_valid(utm_medium)),
  CONSTRAINT chk_quiz_events_utm_campaign CHECK (utm_campaign IS NULL OR private.quiz_event_utm_valid(utm_campaign)),
  CONSTRAINT chk_quiz_events_hour CHECK (created_at = (pg_catalog.date_trunc('hour', created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')),
  CONSTRAINT chk_quiz_events_shape CHECK (private.quiz_event_shape_valid(event, step::INTEGER, answer, country_code))
);
COMMENT ON TABLE public.quiz_events IS 'Anonymous /quiz funnel events. Non-personal by design: random session UUID, allow-listed enums, utm slugs, hour-rounded created_at; no user_id/IP/UA/click id/free text; never linked to accounts. Retention 90 days (purge_quiz_events, pg_cron). service_role read only.';
CREATE INDEX IF NOT EXISTS idx_quiz_events_created_at ON public.quiz_events (created_at);

ALTER TABLE public.quiz_events ENABLE ROW LEVEL SECURITY;  -- no policies: API roles can never read or write rows directly
REVOKE ALL ON TABLE public.quiz_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.quiz_events TO service_role;  -- analytics reads only; writes/purge go through definer functions

-- Atomic global per-minute counter (one tiny row per minute; purged with the events). Not reachable by any API role.
CREATE TABLE IF NOT EXISTS private.quiz_event_rate (
  bucket TIMESTAMPTZ PRIMARY KEY,
  n INTEGER NOT NULL CHECK (n >= 0)
);
ALTER TABLE private.quiz_event_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.quiz_event_rate FROM PUBLIC, anon, authenticated, service_role;

-- Write path ------------------------------------------------------------------------------------------------------
-- Returns TRUE when a new row was recorded, FALSE for a duplicate (idempotent). Raises on invalid/oversize/over-limit input:
--   22023 invalid_parameter_value   unknown event, step, answer, country or session id
--   54000 program_limit_exceeded    any text argument longer than its limit (event/answer 32, country 2, network/utm 64)
--   53400 configuration_limit_exceeded  global per-minute circuit breaker (rate_limited)
-- Optional attribution arguments are NULLED, not rejected, when invalid: a bad utm value never costs us the funnel event.
-- The function never reads auth.uid(): an authenticated caller is recorded exactly like an anonymous one.
-- No IP is available inside Postgres and none is stored, so per-IP throttling is NOT possible here; the global breaker bounds
-- table growth during a flood (a flood can briefly stop legitimate events but never affects the quiz UI because the client
-- ignores failures). Put per-IP limits at the edge/WAF (docs/operations/quiz-funnel-events.md).
CREATE OR REPLACE FUNCTION public.record_quiz_event(
  p_session_id UUID,
  p_event TEXT,
  p_step INTEGER DEFAULT 0,
  p_answer TEXT DEFAULT NULL,
  p_country_code TEXT DEFAULT NULL,
  p_network TEXT DEFAULT NULL,
  p_utm_source TEXT DEFAULT NULL,
  p_utm_medium TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_network TEXT;
  v_minute TIMESTAMPTZ := pg_catalog.date_trunc('minute', pg_catalog.now());
  v_cap INTEGER := private.quiz_event_global_rate_per_minute();
  v_n INTEGER;
  v_rows INTEGER;
BEGIN
  -- 1. Cheapest checks first: no table access (F-06/F-12). Length limits before any regex or lookup.
  IF pg_catalog.length(p_event) > 32 OR pg_catalog.length(p_answer) > 32 OR pg_catalog.length(p_country_code) > 2
     OR pg_catalog.length(p_network) > 64 OR pg_catalog.length(p_utm_source) > 64
     OR pg_catalog.length(p_utm_medium) > 64 OR pg_catalog.length(p_utm_campaign) > 64 THEN
    RAISE EXCEPTION 'payload_too_large' USING ERRCODE = '54000';
  END IF;
  IF p_session_id IS NULL
     OR pg_catalog.substr(p_session_id::TEXT, 15, 1) <> '4'
     OR pg_catalog.substr(p_session_id::TEXT, 20, 1) NOT IN ('8','9','a','b') THEN
    RAISE EXCEPTION 'invalid_session_id' USING ERRCODE = '22023';
  END IF;
  IF NOT private.quiz_event_shape_valid(p_event, p_step, p_answer, p_country_code) THEN
    RAISE EXCEPTION 'invalid_quiz_event' USING ERRCODE = '22023';
  END IF;

  -- 2. Idempotency (one index-only primary-key probe): a retry of an already stored event is a no-op, answered even when the
  --    minute is full, and never consumes the limit.
  IF EXISTS (SELECT 1 FROM public.quiz_events q
              WHERE q.session_id = p_session_id AND q.event = p_event AND q.step = p_step) THEN
    RETURN FALSE;
  END IF;

  -- 3. Cheap rate peek (one primary-key lookup, no lock): over-limit callers are turned away before any heavier work and
  --    without touching the counter row, so a flood does not queue on its row lock.
  SELECT r.n INTO v_n FROM private.quiz_event_rate r WHERE r.bucket = v_minute;
  IF COALESCE(v_n, 0) >= v_cap THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '53400';
  END IF;

  -- 4. Attribution: only a network slug configured by an operator is stored; utm values only if they are clean slugs.
  IF p_network IS NOT NULL AND p_network ~ '^[a-z0-9_.-]{1,64}$'
     AND EXISTS (SELECT 1 FROM public.attribution_networks n WHERE n.slug = p_network) THEN
    v_network := p_network;
  END IF;

  -- 5. Atomic global counter (F-07): the WHERE guard makes the increment and the cap check one statement, so concurrent
  --    callers cannot overshoot. A losing caller gets no row back.
  v_n := NULL;
  INSERT INTO private.quiz_event_rate AS r (bucket, n) VALUES (v_minute, 1)
  ON CONFLICT (bucket) DO UPDATE SET n = r.n + 1 WHERE r.n < v_cap
  RETURNING r.n INTO v_n;
  IF v_n IS NULL OR v_cap <= 0 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '53400';
  END IF;

  INSERT INTO public.quiz_events (session_id, event, step, answer, country_code, network, utm_source, utm_medium, utm_campaign)
  VALUES (
    p_session_id, p_event, p_step, p_answer, p_country_code, v_network,
    CASE WHEN private.quiz_event_utm_valid(p_utm_source) THEN p_utm_source END,
    CASE WHEN private.quiz_event_utm_valid(p_utm_medium) THEN p_utm_medium END,
    CASE WHEN private.quiz_event_utm_valid(p_utm_campaign) THEN p_utm_campaign END
  )
  ON CONFLICT ON CONSTRAINT pk_quiz_events DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$function$;
ALTER FUNCTION public.record_quiz_event(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_quiz_event(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_quiz_event(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- Retention: delete rows older than p_retention_days (default 90, minimum 7 so a typo cannot wipe recent data) in a bounded
-- loop of batch deletes (ctid scan, so each batch is an index-ordered nested loop, not a join over the whole table).
-- Bounded per call by p_max_rows (default 2,000,000) AND a wall-clock budget (default 30 s); callers simply run it again.
-- Also removes rate-counter rows older than 2 days. Returns the number of quiz_events rows deleted. service_role only.
CREATE OR REPLACE FUNCTION public.purge_quiz_events(
  p_retention_days INTEGER DEFAULT 90,
  p_batch_size INTEGER DEFAULT 20000,
  p_max_rows INTEGER DEFAULT 2000000,
  p_time_budget_seconds INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cutoff TIMESTAMPTZ;
  v_batch INTEGER := LEAST(GREATEST(COALESCE(p_batch_size, 20000), 1), 100000);
  v_max INTEGER := LEAST(GREATEST(COALESCE(p_max_rows, 2000000), 1), 5000000);
  v_deadline TIMESTAMPTZ := pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => LEAST(GREATEST(COALESCE(p_time_budget_seconds, 30), 1), 300));
  v_total INTEGER := 0;
  v_rows INTEGER;
BEGIN
  IF p_retention_days IS NULL OR p_retention_days < 7 THEN
    RAISE EXCEPTION 'retention_too_short' USING ERRCODE = '22023';
  END IF;
  v_cutoff := pg_catalog.now() - pg_catalog.make_interval(days => p_retention_days);
  LOOP
    EXIT WHEN v_total >= v_max OR pg_catalog.clock_timestamp() >= v_deadline;
    DELETE FROM public.quiz_events q
     WHERE q.ctid = ANY (ARRAY(
       SELECT e.ctid FROM public.quiz_events e
        WHERE e.created_at < v_cutoff
        ORDER BY e.created_at
        LIMIT LEAST(v_batch, v_max - v_total)));
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
    EXIT WHEN v_rows = 0;
  END LOOP;
  DELETE FROM private.quiz_event_rate r WHERE r.bucket < pg_catalog.now() - INTERVAL '2 days';
  RETURN v_total;
END;
$function$;
ALTER FUNCTION public.purge_quiz_events(INTEGER, INTEGER, INTEGER, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.purge_quiz_events(INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_quiz_events(INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;

-- Drop-off report: distinct sessions per day (UTC, day of the session's first event) x network x utm_source x utm_campaign
-- x event x step. A session's network/utm are the first non-null values seen on any of its events (the client sends them on
-- quiz_started). Aggregates only; service_role only. Window is capped at 366 days. NOTE: no minimum cell size is applied
-- (service_role can read the raw rows anyway); suppress cells < 10 sessions if this ever feeds a non-admin dashboard.
-- Sessions per (event, step) = rows, because (session_id, event, step) is the primary key, so count(*) is exact and cheap.
-- Performance: one pass over the window plus a per-session group (about 1.2 s per 1M rows); roughly linear in rows (see docs for measurements).
DROP FUNCTION IF EXISTS public.quiz_funnel_summary(TIMESTAMPTZ, TIMESTAMPTZ);
CREATE FUNCTION public.quiz_funnel_summary(
  p_from TIMESTAMPTZ DEFAULT pg_catalog.now() - INTERVAL '30 days',
  p_to TIMESTAMPTZ DEFAULT pg_catalog.now()
)
RETURNS TABLE (day DATE, network TEXT, utm_source TEXT, utm_campaign TEXT, event TEXT, step SMALLINT, sessions BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH win AS (
    SELECT q.session_id, q.event, q.step, q.network, q.utm_source, q.utm_campaign, q.created_at
      FROM public.quiz_events q
     WHERE q.created_at >= GREATEST(p_from, p_to - INTERVAL '366 days') AND q.created_at < p_to
  ), sess AS (
    SELECT w.session_id,
           (pg_catalog.min(w.created_at) AT TIME ZONE 'UTC')::DATE AS first_day,
           (pg_catalog.array_agg(w.network ORDER BY w.created_at) FILTER (WHERE w.network IS NOT NULL))[1] AS network,
           (pg_catalog.array_agg(w.utm_source ORDER BY w.created_at) FILTER (WHERE w.utm_source IS NOT NULL))[1] AS utm_source,
           (pg_catalog.array_agg(w.utm_campaign ORDER BY w.created_at) FILTER (WHERE w.utm_campaign IS NOT NULL))[1] AS utm_campaign
      FROM win w GROUP BY w.session_id
  )
  SELECT s.first_day, COALESCE(s.network, 'direct'), COALESCE(s.utm_source, '(none)'), COALESCE(s.utm_campaign, '(none)'),
         w.event, w.step, pg_catalog.count(*)
    FROM win w JOIN sess s USING (session_id)
   GROUP BY s.first_day, COALESCE(s.network, 'direct'), COALESCE(s.utm_source, '(none)'), COALESCE(s.utm_campaign, '(none)'), w.event, w.step
   ORDER BY s.first_day, 2, 3, 4, w.step, w.event;
$function$;
ALTER FUNCTION public.quiz_funnel_summary(TIMESTAMPTZ, TIMESTAMPTZ) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.quiz_funnel_summary(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quiz_funnel_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- Retention schedule (F-02). Daily at 03:17 UTC. Guarded: where pg_cron cannot be enabled (or the migration role may not
-- create it) we raise a NOTICE and continue; the operator then enables pg_cron in the dashboard and runs the SELECT below.
-- cron.schedule with a job name is an upsert, so re-running this migration never creates a second job.
DO $cron$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'quiz_events retention: pg_cron could not be enabled here (%).', SQLERRM;
  END;
  IF pg_catalog.to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'quiz_events retention: pg_cron is NOT available, so the 90-day purge is NOT scheduled. Enable pg_cron and run: SELECT cron.schedule(''purge-quiz-events'', ''17 3 * * *'', ''SELECT public.purge_quiz_events(90)'');';
    RETURN;
  END IF;
  BEGIN
    PERFORM cron.schedule('purge-quiz-events', '17 3 * * *', 'SELECT public.purge_quiz_events(90)');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'quiz_events retention: pg_cron is present but scheduling failed (%). Schedule purge_quiz_events(90) manually.', SQLERRM;
  END;
END
$cron$;

-- ROLLBACK (manual; this is additive and not referenced by any other object):
--   SELECT cron.unschedule('purge-quiz-events');   -- only if pg_cron is installed
--   DROP FUNCTION public.quiz_funnel_summary(TIMESTAMPTZ, TIMESTAMPTZ);
--   DROP FUNCTION public.purge_quiz_events(INTEGER, INTEGER, INTEGER, INTEGER);
--   DROP FUNCTION public.record_quiz_event(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
--   DROP TABLE public.quiz_events; DROP TABLE private.quiz_event_rate;
--   DROP FUNCTION private.quiz_event_utm_valid(TEXT); DROP FUNCTION private.quiz_event_global_rate_per_minute();
--   DROP FUNCTION private.quiz_event_shape_valid(TEXT, INTEGER, TEXT, TEXT);
