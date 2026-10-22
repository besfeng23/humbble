-- P4-01..P4-03: PayPal Sandbox plan catalogue, subscription/entitlement
-- reconciliation RPCs and premium gates. Additive only; never edits earlier
-- migrations. Writes to subscriptions/entitlements/payment_events stay
-- service_role only; clients read their own rows through existing RLS.

-- 1. Server-side plan catalogue. Exactly two monthly plans (Plan v1.2 A5).
--    Prices are never accepted from clients and are never FX-converted.
CREATE TABLE public.billing_plans (
  plan_key TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  billing_interval TEXT NOT NULL DEFAULT 'month',
  entitlement_key TEXT NOT NULL DEFAULT 'premium',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_billing_plans_market CHECK (market IN ('PH', 'US')),
  CONSTRAINT chk_billing_plans_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT chk_billing_plans_amount CHECK (amount > 0),
  CONSTRAINT chk_billing_plans_interval CHECK (billing_interval = 'month'),
  CONSTRAINT uq_billing_plans_market UNIQUE (market)
);
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.billing_plans TO authenticated, service_role;
CREATE POLICY billing_plans_select_enabled
  ON public.billing_plans FOR SELECT TO authenticated
  USING (is_enabled);

-- US is catalogued but disabled: Plan v1.2 A5 / v1.3 draft keep non-PH markets
-- disabled at PH-only launch pending owner decision OWN-PRICE-01.
INSERT INTO public.billing_plans (plan_key, market, currency, amount, is_enabled) VALUES
  ('premium_monthly_ph', 'PH', 'PHP', 599.00, TRUE),
  ('premium_monthly_us', 'US', 'USD', 29.99, FALSE);

-- 2. Subscription facts needed for exact-match reconciliation.
ALTER TABLE public.subscriptions
  ADD COLUMN plan_key TEXT REFERENCES public.billing_plans(plan_key),
  ADD COLUMN environment TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN last_verified_at TIMESTAMPTZ,
  ADD CONSTRAINT chk_subscriptions_environment CHECK (environment = 'sandbox');
COMMENT ON COLUMN public.subscriptions.environment IS 'Only sandbox is permitted until a separate owner-approved live launch migration.';

-- 3. Premium helpers for the client (actor derived from the session).
CREATE OR REPLACE FUNCTION public.get_my_premium_status()
RETURNS TABLE (is_premium BOOLEAN, valid_until TIMESTAMPTZ, subscription_status public.subscription_status, cancel_at_period_end BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1 FROM public.entitlements e
       WHERE e.user_id = v_actor AND e.entitlement_key = 'premium'
         AND e.status = 'active'::public.entitlement_status
         AND e.valid_from <= pg_catalog.now()
         AND (e.valid_until IS NULL OR e.valid_until > pg_catalog.now())),
    (SELECT e.valid_until FROM public.entitlements e
      WHERE e.user_id = v_actor AND e.entitlement_key = 'premium'
        AND e.status = 'active'::public.entitlement_status),
    (SELECT s.status FROM public.subscriptions s WHERE s.user_id = v_actor ORDER BY s.created_at DESC LIMIT 1),
    COALESCE((SELECT s.cancel_at_period_end FROM public.subscriptions s WHERE s.user_id = v_actor ORDER BY s.created_at DESC LIMIT 1), FALSE);
END;
$function$;

-- Liked You: free users see only a count; the list is premium-gated server-side.
-- Excludes people already swiped on, blocked pairs and suspended/undiscoverable profiles.
CREATE OR REPLACE FUNCTION private.incoming_likes(p_actor UUID)
RETURNS TABLE (profile_id UUID, display_name TEXT, liked_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT p.id, p.display_name, s.created_at
    FROM public.swipes s
    JOIN public.profiles p ON p.id = s.actor_id
   WHERE s.target_id = p_actor
     AND s.direction = 'like'::public.swipe_direction
     AND p.is_suspended IS NOT TRUE
     AND NOT EXISTS (SELECT 1 FROM public.swipes mine WHERE mine.actor_id = p_actor AND mine.target_id = s.actor_id)
     AND NOT EXISTS (SELECT 1 FROM public.blocks b
                      WHERE (b.blocker_id = p_actor AND b.blocked_id = s.actor_id)
                         OR (b.blocker_id = s.actor_id AND b.blocked_id = p_actor))
     AND NOT private.is_pair_excluded(p_actor, s.actor_id)
   ORDER BY s.created_at DESC, s.id DESC
   LIMIT 100;
$function$;
REVOKE ALL ON FUNCTION private.incoming_likes(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_liked_you_count()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT count(*)::INTEGER FROM private.incoming_likes(v_actor));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_liked_you()
RETURNS TABLE (profile_id UUID, display_name TEXT, liked_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_active_entitlement(v_actor) THEN
    RAISE EXCEPTION 'premium_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM private.incoming_likes(v_actor);
END;
$function$;

-- 4. Trusted reconciliation RPCs (service_role only, called by Edge Functions).

-- Idempotent ledger insert: returns is_new = FALSE for a replayed event id.
CREATE OR REPLACE FUNCTION public.billing_record_event(
  p_provider_event_id TEXT,
  p_event_type TEXT,
  p_resource_id TEXT,
  p_payload_sha256 TEXT,
  p_occurred_at TIMESTAMPTZ
)
RETURNS TABLE (event_id UUID, is_new BOOLEAN, event_status public.payment_event_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.payment_events (provider, provider_event_id, event_type, resource_id, payload_sha256, occurred_at, status, provider_verified)
  VALUES ('paypal', p_provider_event_id, p_event_type, p_resource_id, p_payload_sha256, p_occurred_at, 'verified', TRUE)
  ON CONFLICT ON CONSTRAINT uq_payment_events_provider_event DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, TRUE, 'verified'::public.payment_event_status;
  ELSE
    RETURN QUERY SELECT pe.id, FALSE, pe.status FROM public.payment_events pe
      WHERE pe.provider = 'paypal' AND pe.provider_event_id = p_provider_event_id;
  END IF;
END;
$function$;

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
    UPDATE public.payment_events SET status = 'processing' WHERE id = p_event_id AND status = 'verified';
    UPDATE public.payment_events SET status = 'processed', processed_at = pg_catalog.now() WHERE id = p_event_id AND status = 'processing';
  ELSE
    UPDATE public.payment_events SET status = p_status WHERE id = p_event_id AND status IN ('received', 'verified', 'processing');
  END IF;
END;
$function$;

-- Records a pending subscription created by the checkout function.
CREATE OR REPLACE FUNCTION public.billing_register_pending_subscription(
  p_user_id UUID, p_plan_key TEXT, p_provider_subscription_id TEXT, p_provider_plan_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_key = p_plan_key AND is_enabled) THEN
    RAISE EXCEPTION 'unknown_plan' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.subscriptions (user_id, provider, provider_subscription_id, provider_plan_id, plan_key, status)
  VALUES (p_user_id, 'paypal', p_provider_subscription_id, p_provider_plan_id, p_plan_key, 'approval_pending')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- Applies PayPal REST readback state. Grants premium only when the readback
-- status is ACTIVE and the verified last payment exactly matches the catalogue.
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

DO $grants$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_my_premium_status()', 'public.get_liked_you_count()', 'public.get_liked_you()',
    'private.incoming_likes(uuid)',
    'public.billing_record_event(text,text,text,text,timestamptz)',
    'public.billing_finish_event(uuid,public.payment_event_status)',
    'public.billing_register_pending_subscription(uuid,text,text,text)',
    'public.billing_apply_readback(text,text,public.subscription_status,timestamptz,numeric,text,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO postgres', fn);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END;
$grants$;
GRANT EXECUTE ON FUNCTION public.get_my_premium_status(), public.get_liked_you_count(), public.get_liked_you() TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.billing_record_event(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ),
  public.billing_finish_event(UUID, public.payment_event_status),
  public.billing_register_pending_subscription(UUID, TEXT, TEXT, TEXT),
  public.billing_apply_readback(TEXT, TEXT, public.subscription_status, TIMESTAMPTZ, NUMERIC, TEXT, UUID)
  TO service_role;

-- ROLLBACK (manual, forward-fix preferred; never delete payment_events/audit rows):
--   DROP FUNCTION public.billing_apply_readback(TEXT,TEXT,public.subscription_status,TIMESTAMPTZ,NUMERIC,TEXT,UUID),
--     public.billing_register_pending_subscription(UUID,TEXT,TEXT,TEXT), public.billing_finish_event(UUID,public.payment_event_status),
--     public.billing_record_event(TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ), public.get_liked_you(), public.get_liked_you_count(),
--     private.incoming_likes(UUID), public.get_my_premium_status();
--   ALTER TABLE public.subscriptions DROP CONSTRAINT chk_subscriptions_environment,
--     DROP COLUMN last_verified_at, DROP COLUMN environment, DROP COLUMN plan_key;
--   DROP TABLE public.billing_plans;
--   Disable checkout first (unset PAYPAL_PLAN_ID_*) so no new pending rows are created.
