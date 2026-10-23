-- PayPal sandbox billing gap fixes (review of main @ b88358c). Additive; earlier migrations are not edited.
--   G4: subscriptions record the REAL environment; live rows are refused by the RPC and by the existing CHECK.
--   G2/G3: quarantined payment events can be re-processed (-> processed) by a PayPal retry or the reconciler.
--   G1: unresolved refund/payment events can be flagged for operators (audit row) instead of silently ignored.
--   G3: service-role-only candidate queries for the paypal-reconcile Edge Function.
-- Deploy note: apply this migration and deploy the updated paypal-create-subscription function together.
-- The 4-argument billing_register_pending_subscription is dropped; until the new function is deployed,
-- checkout fails closed (502) rather than recording an environment-less row.

-- 1. G4: environment is an explicit, validated argument (no default, so callers cannot omit it).
DROP FUNCTION public.billing_register_pending_subscription(UUID, TEXT, TEXT, TEXT);
CREATE FUNCTION public.billing_register_pending_subscription(
  p_user_id UUID, p_plan_key TEXT, p_provider_subscription_id TEXT, p_provider_plan_id TEXT, p_environment TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_id UUID;
BEGIN
  IF p_environment IS NULL OR p_environment NOT IN ('sandbox', 'live') THEN
    RAISE EXCEPTION 'invalid_environment' USING ERRCODE = '22023';
  END IF;
  -- The database cannot see PAYPAL_ENV/PAYPAL_ALLOW_LIVE (the Edge Function enforces that pair before
  -- it ever calls PayPal). Independently of the function, no live row can be stored: this check and
  -- chk_subscriptions_environment both stay until a separate owner-approved live-launch migration.
  IF p_environment <> 'sandbox' THEN
    RAISE EXCEPTION 'live_environment_refused' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_key = p_plan_key AND is_enabled) THEN
    RAISE EXCEPTION 'unknown_plan' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.subscriptions (user_id, provider, provider_subscription_id, provider_plan_id, plan_key, status, environment)
  VALUES (p_user_id, 'paypal', p_provider_subscription_id, p_provider_plan_id, p_plan_key, 'approval_pending', p_environment)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- 2a. G2/G3: the ledger guard trigger treated quarantined as terminal. Allow exactly one extra transition,
--     quarantined -> processing (re-evaluation). Everything else in the function is unchanged from
--     20261020000003; provider facts stay immutable and processed stays terminal.
CREATE OR REPLACE FUNCTION private.guard_payment_event_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Permit only FK anonymization caused by a deletion-retention rule; do not
  -- let a provider callback rewrite either reference to a different identity.
  IF ((OLD.user_id IS NOT NULL AND NEW.user_id IS NULL)
      OR (OLD.subscription_id IS NOT NULL AND NEW.subscription_id IS NULL))
     AND (NEW.user_id IS NOT DISTINCT FROM OLD.user_id OR (OLD.user_id IS NOT NULL AND NEW.user_id IS NULL))
     AND (NEW.subscription_id IS NOT DISTINCT FROM OLD.subscription_id OR (OLD.subscription_id IS NOT NULL AND NEW.subscription_id IS NULL))
     AND NEW.provider IS NOT DISTINCT FROM OLD.provider
     AND NEW.provider_event_id IS NOT DISTINCT FROM OLD.provider_event_id
     AND NEW.event_type IS NOT DISTINCT FROM OLD.event_type
     AND NEW.resource_id IS NOT DISTINCT FROM OLD.resource_id
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.provider_verified IS NOT DISTINCT FROM OLD.provider_verified
     AND NEW.payload_sha256 IS NOT DISTINCT FROM OLD.payload_sha256
     AND NEW.occurred_at IS NOT DISTINCT FROM OLD.occurred_at
     AND NEW.received_at IS NOT DISTINCT FROM OLD.received_at
     AND NEW.processed_at IS NOT DISTINCT FROM OLD.processed_at
     AND NEW.retention_until IS NOT DISTINCT FROM OLD.retention_until
     AND NEW.legal_hold IS NOT DISTINCT FROM OLD.legal_hold THEN
    RETURN NEW;
  END IF;

  IF NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.payload_sha256 IS DISTINCT FROM OLD.payload_sha256
     OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
     OR NEW.received_at IS DISTINCT FROM OLD.received_at THEN
    RAISE EXCEPTION 'Payment event provider facts are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'received'::public.payment_event_status AND NEW.status IN (
        'verified'::public.payment_event_status, 'quarantined'::public.payment_event_status, 'failed'::public.payment_event_status
      ))
      OR (OLD.status = 'verified'::public.payment_event_status AND NEW.status IN (
        'processing'::public.payment_event_status, 'quarantined'::public.payment_event_status, 'failed'::public.payment_event_status
      ))
      OR (OLD.status = 'processing'::public.payment_event_status AND NEW.status IN (
        'processed'::public.payment_event_status, 'quarantined'::public.payment_event_status, 'failed'::public.payment_event_status
      ))
      OR (OLD.status = 'failed'::public.payment_event_status AND NEW.status = 'processing'::public.payment_event_status)
      -- G2/G3: quarantine is a holding state, not terminal. A PayPal redelivery or the reconciler may
      -- re-evaluate a quarantined event; it can then heal to processing -> processed (or be re-quarantined).
      OR (OLD.status = 'quarantined'::public.payment_event_status AND NEW.status = 'processing'::public.payment_event_status)
    ) THEN
      RAISE EXCEPTION 'Invalid payment event status transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2b. G2/G3: a quarantined event may be healed (quarantined -> processed) when a retry or the
--    reconciler re-reads PayPal and the state now applies cleanly. Previously only verified ->
--    processing -> processed was possible, so quarantined events were terminal.
CREATE OR REPLACE FUNCTION public.billing_finish_event(p_event_id UUID, p_status public.payment_event_status)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_status NOT IN ('processed'::public.payment_event_status, 'quarantined'::public.payment_event_status, 'failed'::public.payment_event_status) THEN
    RAISE EXCEPTION 'invalid_final_status' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'processed'::public.payment_event_status THEN
    UPDATE public.payment_events SET status = 'processing' WHERE id = p_event_id AND status IN ('verified', 'quarantined');
    UPDATE public.payment_events SET status = 'processed', processed_at = pg_catalog.now() WHERE id = p_event_id AND status = 'processing';
  ELSE
    UPDATE public.payment_events SET status = p_status WHERE id = p_event_id AND status IN ('received', 'verified', 'processing', 'quarantined');
  END IF;
END;
$function$;

-- 3. G1: an event that cannot be tied to a subscription (e.g. a refund whose sale PayPal could not
--    resolve) is quarantined and audited so it is visible to operators; it is never marked processed.
CREATE FUNCTION public.billing_flag_unresolved_event(p_event_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_event public.payment_events%ROWTYPE;
BEGIN
  SELECT * INTO v_event FROM public.payment_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status = 'processed'::public.payment_event_status THEN
    RETURN;
  END IF;
  UPDATE public.payment_events SET status = 'quarantined'
   WHERE id = p_event_id AND status IN ('received', 'verified', 'processing');
  -- One audit row per event, however many times a retry or the reconciler re-flags it.
  IF EXISTS (SELECT 1 FROM public.audit_events a
              WHERE a.action = 'billing.event.unresolved' AND a.target_type = 'payment_event' AND a.target_id = p_event_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (NULL, 'billing.event.unresolved', 'payment_event', p_event_id,
          pg_catalog.jsonb_build_object('reason', pg_catalog.left(COALESCE(p_reason, 'unknown'), 200),
                                        'event_type', v_event.event_type, 'resource_id', v_event.resource_id));
END;
$function$;

-- 4. G3: reconciler candidates. Subscriptions worth a fresh PayPal readback:
--    * approval_pending, created between 2 minutes and 48 hours ago (approved but webhook missed/late);
--    * active / past_due that were never verified, not verified for 6 hours, or renew within a day;
--    * any subscription referenced by a quarantined (72 h) or stuck (verified/processing > 10 min) event.
CREATE FUNCTION public.billing_list_reconcile_subscriptions(p_environment TEXT, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (provider_subscription_id TEXT, reason TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT c.provider_subscription_id, c.reason FROM (
    SELECT DISTINCT ON (x.provider_subscription_id) x.provider_subscription_id, x.reason, x.prio FROM (
      SELECT s.provider_subscription_id, 'pending'::TEXT AS reason, 1 AS prio
        FROM public.subscriptions s
       WHERE s.provider = 'paypal' AND s.environment = p_environment AND s.status = 'approval_pending'
         AND s.created_at <= pg_catalog.now() - interval '2 minutes'
         AND s.created_at >= pg_catalog.now() - interval '48 hours'
      UNION ALL
      SELECT s.provider_subscription_id, 'active_stale'::TEXT, 2
        FROM public.subscriptions s
       WHERE s.provider = 'paypal' AND s.environment = p_environment
         AND s.status IN ('active', 'past_due')
         AND (s.last_verified_at IS NULL
              OR s.last_verified_at < pg_catalog.now() - interval '6 hours'
              OR s.current_period_end < pg_catalog.now() + interval '1 day')
      UNION ALL
      SELECT s.provider_subscription_id, 'event_unsettled'::TEXT, 0
        FROM public.payment_events e
        JOIN public.subscriptions s ON s.provider = 'paypal' AND s.provider_subscription_id = e.resource_id
       WHERE e.provider = 'paypal' AND s.environment = p_environment
         AND ((e.status = 'quarantined' AND e.received_at >= pg_catalog.now() - interval '72 hours')
              OR (e.status IN ('verified', 'processing') AND e.received_at <= pg_catalog.now() - interval '10 minutes'
                  AND e.received_at >= pg_catalog.now() - interval '72 hours'))
    ) x
    ORDER BY x.provider_subscription_id, x.prio
  ) c
  ORDER BY (CASE c.reason WHEN 'event_unsettled' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END), c.provider_subscription_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$function$;

-- Events to re-process: quarantined (72 h window) or stuck in verified/processing for > 10 minutes.
CREATE FUNCTION public.billing_list_reprocessable_events(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (event_id UUID, provider_event_id TEXT, event_type TEXT, resource_id TEXT, event_status public.payment_event_status)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT e.id, e.provider_event_id, e.event_type, e.resource_id, e.status
    FROM public.payment_events e
   WHERE e.provider = 'paypal' AND e.provider_verified AND e.resource_id IS NOT NULL
     AND e.received_at >= pg_catalog.now() - interval '72 hours'
     AND (e.status = 'quarantined'
          OR (e.status IN ('verified', 'processing') AND e.received_at <= pg_catalog.now() - interval '10 minutes'))
   ORDER BY e.received_at ASC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$function$;

DO $grants$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.billing_register_pending_subscription(uuid,text,text,text,text)',
    'public.billing_finish_event(uuid,public.payment_event_status)',
    'public.billing_flag_unresolved_event(uuid,text)',
    'public.billing_list_reconcile_subscriptions(text,integer)',
    'public.billing_list_reprocessable_events(integer)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO postgres', fn);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$grants$;

-- ROLLBACK (manual; forward-fix preferred; never delete payment_events/audit rows):
--   DROP FUNCTION public.billing_list_reprocessable_events(INTEGER), public.billing_list_reconcile_subscriptions(TEXT, INTEGER),
--     public.billing_flag_unresolved_event(UUID, TEXT), public.billing_register_pending_subscription(UUID, TEXT, TEXT, TEXT, TEXT);
--   Recreate the 4-argument billing_register_pending_subscription and the earlier billing_finish_event body from
--   20261023000020_paypal_sandbox_entitlements.sql, then redeploy the previous Edge Functions.
