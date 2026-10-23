-- PR #35 security-review fixes (Themis, 2026-10-23). Additive follow-up to 20261023000050; idempotent.
--   F1: payment_events was protected only by an UPDATE guard trigger; Supabase default privileges give service_role
--       DELETE/TRUNCATE/UPDATE/REFERENCES/TRIGGER on new public tables. Revoke them and re-grant only the narrow
--       contract the ledger needs. The application writes the ledger exclusively through SECURITY DEFINER billing_*
--       RPCs (owner postgres), which are unaffected.
--   F3: terminal-state guard in billing_apply_readback + reconciler candidate queries skip terminal subscriptions.

-- F1 -------------------------------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.payment_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.payment_events TO service_role;
-- Same column-level UPDATE contract as 20261020000003/0004 (see tests 0003). Nothing else is updatable by a role.
GRANT UPDATE (status, provider_verified, processed_at, retention_until, legal_hold) ON public.payment_events TO service_role;

-- F3 -------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_apply_readback(
  p_provider_subscription_id TEXT,
  p_provider_plan_id TEXT,
  p_status public.subscription_status,
  p_period_end TIMESTAMPTZ,
  p_last_payment_amount NUMERIC,
  p_last_payment_currency TEXT,
  p_event_id UUID DEFAULT NULL
)
RETURNS TABLE (subscription_id UUID, granted BOOLEAN, outcome TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_plan public.billing_plans%ROWTYPE;
  v_granted BOOLEAN := FALSE;
  v_outcome TEXT;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions s
   WHERE s.provider = 'paypal' AND s.provider_subscription_id = p_provider_subscription_id
   FOR UPDATE;
  IF NOT FOUND OR v_sub.user_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'unknown_subscription'::TEXT; RETURN;
  END IF;
  -- F3 terminal-state guard: a refunded/revoked subscription is never re-activated, re-cancelled or otherwise
  -- moved by a non-terminal readback (PayPal's ACTIVE + last_payment does not reflect a refund, and a stale
  -- quarantined ACTIVATED event or a reconciler pass would otherwise re-grant premium). Terminal -> terminal
  -- (refunded/revoked) stays allowed so a repeated refund is an idempotent revoke. A new purchase is a new
  -- subscription row, so legitimate re-subscription is unaffected.
  IF v_sub.status IN ('refunded'::public.subscription_status, 'revoked'::public.subscription_status)
     AND p_status NOT IN ('refunded'::public.subscription_status, 'revoked'::public.subscription_status) THEN
    IF p_event_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.audit_events a
          WHERE a.action = 'billing.subscription.terminal_state_ignored' AND a.target_type = 'subscription'
            AND a.target_id = v_sub.id AND a.metadata ->> 'event_id' = p_event_id::TEXT) THEN
      INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
      VALUES (NULL, 'billing.subscription.terminal_state_ignored', 'subscription', v_sub.id,
              pg_catalog.jsonb_build_object('status', p_status, 'subscription_status', v_sub.status, 'event_id', p_event_id));
    END IF;
    RETURN QUERY SELECT v_sub.id, FALSE, 'terminal_state'::TEXT; RETURN;
  END IF;
  SELECT * INTO v_plan FROM public.billing_plans bp WHERE bp.plan_key = v_sub.plan_key;
  IF NOT FOUND OR p_provider_plan_id IS DISTINCT FROM v_sub.provider_plan_id THEN
    RETURN QUERY SELECT v_sub.id, FALSE, 'plan_mismatch'::TEXT; RETURN;
  END IF;

  IF p_status = 'active'::public.subscription_status THEN
    IF p_last_payment_amount IS DISTINCT FROM v_plan.amount
       OR p_last_payment_currency IS DISTINCT FROM v_plan.currency
       OR p_period_end IS NULL OR p_period_end <= pg_catalog.now() THEN
      RETURN QUERY SELECT v_sub.id, FALSE, 'settlement_mismatch'::TEXT; RETURN;
    END IF;
    UPDATE public.subscriptions SET status = 'active', current_period_end = p_period_end,
      current_period_start = COALESCE(current_period_start, LEAST(pg_catalog.now(), p_period_end - interval '1 month')),
      last_verified_at = pg_catalog.now()
     WHERE id = v_sub.id;
    INSERT INTO public.entitlements (user_id, entitlement_key, status, source_subscription_id, valid_from, valid_until)
    VALUES (v_sub.user_id, v_plan.entitlement_key, 'active', v_sub.id, pg_catalog.now(), p_period_end)
    ON CONFLICT ON CONSTRAINT uq_entitlements_user_key DO UPDATE
      SET status = 'active', source_subscription_id = EXCLUDED.source_subscription_id,
          valid_from = LEAST(public.entitlements.valid_from, pg_catalog.now()),
          valid_until = GREATEST(EXCLUDED.valid_until, COALESCE(public.entitlements.valid_until, EXCLUDED.valid_until));
    v_granted := TRUE; v_outcome := 'granted';
  ELSIF p_status = 'cancelled'::public.subscription_status THEN
    -- Cancel-renewal: premium lasts until the paid period end, then lapses.
    UPDATE public.subscriptions SET status = 'cancelled', cancel_at_period_end = TRUE,
      cancelled_at = COALESCE(cancelled_at, pg_catalog.now()), last_verified_at = pg_catalog.now()
     WHERE id = v_sub.id;
    UPDATE public.entitlements SET valid_until = LEAST(COALESCE(valid_until, v_sub.current_period_end), COALESCE(v_sub.current_period_end, pg_catalog.now() + interval '1 second'))
     WHERE source_subscription_id = v_sub.id AND status = 'active';
    v_outcome := 'cancel_at_period_end';
  ELSIF p_status IN ('suspended'::public.subscription_status, 'expired'::public.subscription_status,
                     'refunded'::public.subscription_status, 'revoked'::public.subscription_status) THEN
    UPDATE public.subscriptions SET status = p_status, last_verified_at = pg_catalog.now() WHERE id = v_sub.id;
    UPDATE public.entitlements SET status = CASE WHEN p_status IN ('refunded'::public.subscription_status, 'revoked'::public.subscription_status)
                                                 THEN 'revoked'::public.entitlement_status ELSE 'inactive'::public.entitlement_status END
     WHERE source_subscription_id = v_sub.id AND status = 'active';
    v_outcome := 'revoked';
  ELSE
    -- approval_pending / past_due: no grant. past_due keeps the current paid period only.
    UPDATE public.subscriptions SET status = p_status, last_verified_at = pg_catalog.now() WHERE id = v_sub.id;
    v_outcome := 'no_change';
  END IF;

  INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (NULL, 'billing.subscription.' || v_outcome, 'subscription', v_sub.id,
          pg_catalog.jsonb_build_object('status', p_status, 'event_id', p_event_id, 'environment', v_sub.environment));
  RETURN QUERY SELECT v_sub.id, v_granted, v_outcome;
END;
$function$;

-- Events to re-process: quarantined (72 h window) or stuck in verified/processing for > 10 minutes.
-- F3: non-refund events for an already refunded/revoked subscription are not re-applied (refund/reversal events are:
-- a repeated revoke is idempotent).
CREATE OR REPLACE FUNCTION public.billing_list_reprocessable_events(p_limit INTEGER DEFAULT 50)
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
     AND (e.event_type IN ('PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED')
          OR NOT EXISTS (SELECT 1 FROM public.subscriptions s
                          WHERE s.provider = 'paypal' AND s.provider_subscription_id = e.resource_id
                            AND s.status IN ('refunded', 'revoked')))
   ORDER BY e.received_at ASC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$function$;

-- Subscriptions worth a fresh PayPal readback. F3: the event_unsettled branch skips refunded/revoked subscriptions.
CREATE OR REPLACE FUNCTION public.billing_list_reconcile_subscriptions(p_environment TEXT, p_limit INTEGER DEFAULT 50)
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
         AND s.status NOT IN ('refunded', 'revoked')
         AND ((e.status = 'quarantined' AND e.received_at >= pg_catalog.now() - interval '72 hours')
              OR (e.status IN ('verified', 'processing') AND e.received_at <= pg_catalog.now() - interval '10 minutes'
                  AND e.received_at >= pg_catalog.now() - interval '72 hours'))
    ) x
    ORDER BY x.provider_subscription_id, x.prio
  ) c
  ORDER BY (CASE c.reason WHEN 'event_unsettled' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END), c.provider_subscription_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$function$;

-- CREATE OR REPLACE keeps owner and ACL; re-assert them so this file is safe to run on its own.
DO $grants$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.billing_apply_readback(text,text,public.subscription_status,timestamptz,numeric,text,uuid)',
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
--   Restore billing_apply_readback (no terminal guard) from 20261023000020 and the two list functions from 20261023000050.
--   The F1 grants are strictly narrower than before; to restore the previous (unsafe) state only if truly required:
--   GRANT DELETE, TRUNCATE, UPDATE, REFERENCES, TRIGGER ON public.payment_events TO service_role;  -- NOT recommended.
