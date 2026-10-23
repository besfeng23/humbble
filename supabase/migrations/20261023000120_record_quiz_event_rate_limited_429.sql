-- Themis LOW N41-04 (PR #41 follow-up): public.record_quiz_event raised rate_limited with SQLSTATE 53400
-- (configuration_limit_exceeded, class 53 "insufficient resources"). PostgREST maps that to HTTP 500, so anyone able to spend the
-- global 120/min cap (120 cheap requests a minute is enough) turned every later legitimate event in that minute, and every
-- further request, into a 5xx. That is a client-triggerable 5xx flood that hides real server errors in alerting, and it is the
-- wrong semantic: hitting a rate limit is a 429, not a server fault.
--
-- Change (this is the ONLY behavioural change): both rate_limited raises (the cheap peek and the atomic-counter loser) now use
-- SQLSTATE 'PT429', PostgREST's documented custom-status mechanism ('PT' + 3-digit HTTP status), so the response is
-- HTTP 429 Too Many Requests with body
--   {"code":"PT429","message":"rate_limited","details":"...","hint":null}
-- The message text stays `rate_limited`, so anything matching on the message keeps working. The new DETAIL is a fixed string; no
-- caller-supplied value is echoed. No Retry-After header (it would need the fragile PGRST raise form and the only client ignores it).
-- Everything else is byte-for-byte the body of migration 20261023000110: same signature, checks and order, caps, idempotency,
-- the oversize PT400 raise, attribution handling and insert. The rate cap itself is unchanged.
--
-- Client impact: none. lib/quizAnalytics.ts treats any non-ok response the same (silent session circuit breaker).
-- Operations: the cap-hit alert moves from "rate of 53400 / 5xx" to the 429 rate (see docs/operations/quiz-funnel-events.md).
--
-- Privileges: CREATE OR REPLACE keeps the existing owner, ACL and proconfig, but they are restated below to be explicit and
-- idempotent, then ASSERTED at the end of the file (the file aborts and rolls back if anything drifted). Final state, matching the
-- 0031 public-function-exposure allowlist: SECURITY DEFINER, owner postgres, search_path='' pinned, EXECUTE for anon +
-- authenticated only (not PUBLIC, not service_role).
-- No table, index, grant on any other object, or other function is touched. Additive and re-runnable.
--
-- Rollback (forward-fix preferred): re-run the CREATE OR REPLACE from 20261023000110 (it raises 53400 again), then the same
-- ALTER OWNER / REVOKE / GRANT block that follows it. Nothing else depends on the error code.

BEGIN;
SET LOCAL lock_timeout = '5s';

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
    RAISE EXCEPTION 'payload_too_large' USING ERRCODE = 'PT400', DETAIL = 'An argument exceeds its maximum length (event, answer 32; country 2; network, utm 64).';
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
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'PT429', DETAIL = 'The global per-minute event limit is reached; events are not recorded until the next minute.';
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
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'PT429', DETAIL = 'The global per-minute event limit is reached; events are not recorded until the next minute.';
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

-- Closing assertion: fail the whole migration (rolled back) if the pinned properties are not exactly as expected.
DO $assert$
DECLARE
  v_oid OID := 'public.record_quiz_event(uuid,text,integer,text,text,text,text,text,text)'::pg_catalog.regprocedure;
  v_p pg_catalog.pg_proc%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM pg_catalog.pg_proc p WHERE p.oid = v_oid;
  IF NOT v_p.prosecdef THEN RAISE EXCEPTION 'record_quiz_event must be SECURITY DEFINER'; END IF;
  IF pg_catalog.pg_get_userbyid(v_p.proowner) <> 'postgres' THEN RAISE EXCEPTION 'record_quiz_event must be owned by postgres'; END IF;
  IF v_p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::TEXT[] THEN RAISE EXCEPTION 'record_quiz_event search_path must be pinned to empty'; END IF;
  IF NOT (pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE') AND pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'record_quiz_event must stay executable by anon and authenticated';
  END IF;
  IF pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'record_quiz_event must not be executable by service_role'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.aclexplode(v_p.proacl) a WHERE a.grantee = 0) THEN RAISE EXCEPTION 'record_quiz_event must not be executable by PUBLIC'; END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.aclexplode(v_p.proacl) a) <> 3 THEN RAISE EXCEPTION 'record_quiz_event ACL must be exactly owner, anon, authenticated'; END IF;
END
$assert$;

COMMIT;
