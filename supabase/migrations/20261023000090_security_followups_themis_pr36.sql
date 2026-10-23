-- Security follow-ups from the Themis reviews of PR #35 (N1..N7) and PR #36 (F-01..F-11). Idempotent; changes no business data
-- except the one-off backfill in section 2.
--
--   1. F-01  billing_apply_readback no longer trusts caller-supplied status/amount/currency. A grant is bound to a stored,
--            single-use, fresh PayPal read-back record (public.billing_readbacks) whose amount, currency and plan the DATABASE matches
--            against public.billing_plans. See docs/operations/billing-trust-model.md for the trust model and its residual limits.
--   2. F-05  A subscription that is refunded/revoked locally while PayPal still reports it ACTIVE is queued for a PayPal-side
--      /N1   cancel (provider_cancel_* columns + billing_list_pending_provider_cancels / billing_record_provider_cancel).
--   3. F-02  user_consents, reports, moderation_cases, verification_requests: evidence-table pattern (REVOKE ALL from every API role,
--   F-03     minimal re-grant) plus TRUNCATE guards. Trust anchors (billing_plans, billing_markets, attribution_networks,
--   F-04     postback_outbox, signup_attributions, funnel_events) become read-only for service_role. blocks and messages become
--            read-only for service_role (every writer is a SECURITY DEFINER function owned by postgres). profiles is deferred.
--   4. F-06  payment_events: no direct UPDATE for service_role at all (provider_verified/legal_hold can no longer be flipped by a key
--            holder); privacy_requests/reports lose the retention_until/legal_hold UPDATE columns.
--      F-07  ALTER DEFAULT PRIVILEGES: new tables created by postgres in public no longer grant anon/authenticated/service_role anything.
--      F-08  SET LOCAL lock_timeout; TRUNCATE guards also on privacy_requests, subscriptions, entitlements.
--
-- Writers per table (enumerated from pg_proc, migrations, seed.sql, app/ and supabase/functions; owner of every writer function is postgres):
--   user_consents          private.handle_auth_user_funnel (trigger on auth.users); clients: authenticated INSERT/SELECT under RLS (unchanged)
--   reports                public.submit_report; seed.sql (postgres)
--   moderation_cases       public.moderation_transition_case (UPDATE); nothing inserts (cases are opened by a trusted operator as postgres)
--   verification_requests  no writer exists yet (verification provider integration is not built)
--   billing_plans/markets  migrations only (20261023000020/21)
--   attribution_networks   migration seed rows only; postback_outbox: nothing writes (sender not built)
--   signup_attributions    private.handle_auth_user_funnel; funnel_events: private.record_funnel_event (via triggers)
--   blocks                 public.block_user (INSERT), public.unblock_user (DELETE); seed.sql
--   messages               public.send_message (INSERT)
-- No Edge Function (supabase/functions) and no client code writes any of them as service_role.

SET LOCAL lock_timeout = '5s';

-- =====================================================================================================================
-- 1. F-01: evidence-bound billing readback
-- =====================================================================================================================
-- The previous 7-argument function took status/amount/currency from the caller, so any service_role session could mint
-- an entitlement with arbitrary parameters. It is dropped; billing_apply_readback now takes only a readback id.
DROP FUNCTION IF EXISTS public.billing_apply_readback(TEXT, TEXT, public.subscription_status, TIMESTAMPTZ, NUMERIC, TEXT, UUID);

-- Deterministic mapping (kept identical to _shared/paypal.ts mapPayPalStatus). Unknown PayPal states fail closed.
CREATE OR REPLACE FUNCTION private.billing_map_paypal_status(p_status TEXT)
RETURNS public.subscription_status
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT CASE p_status
    WHEN 'ACTIVE' THEN 'active'::public.subscription_status
    WHEN 'SUSPENDED' THEN 'suspended'::public.subscription_status
    WHEN 'CANCELLED' THEN 'cancelled'::public.subscription_status
    WHEN 'EXPIRED' THEN 'expired'::public.subscription_status
    ELSE 'approval_pending'::public.subscription_status
  END;
$function$;
ALTER FUNCTION private.billing_map_paypal_status(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.billing_map_paypal_status(TEXT) FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.billing_readbacks (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  kind TEXT NOT NULL,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
  provider_subscription_id TEXT NOT NULL,
  provider_plan_id TEXT,
  provider_status TEXT,
  mapped_status public.subscription_status NOT NULL,
  period_end TIMESTAMPTZ,
  last_payment_amount NUMERIC,
  last_payment_currency TEXT,
  payment_event_id UUID REFERENCES public.payment_events(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  applied_at TIMESTAMPTZ,
  apply_outcome TEXT,
  CONSTRAINT chk_billing_readbacks_kind CHECK (kind IN ('subscription_read', 'refund_event')),
  CONSTRAINT chk_billing_readbacks_amount CHECK (last_payment_amount IS NULL OR last_payment_amount >= 0),
  CONSTRAINT chk_billing_readbacks_currency CHECK (last_payment_currency IS NULL OR last_payment_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT chk_billing_readbacks_amount_pair CHECK ((last_payment_amount IS NULL) = (last_payment_currency IS NULL)),
  CONSTRAINT chk_billing_readbacks_status_len CHECK (provider_status IS NULL OR pg_catalog.char_length(provider_status) BETWEEN 1 AND 64),
  CONSTRAINT chk_billing_readbacks_refund_shape CHECK (
    (kind = 'refund_event' AND payment_event_id IS NOT NULL AND mapped_status = 'refunded'::public.subscription_status)
    OR (kind = 'subscription_read' AND provider_status IS NOT NULL AND mapped_status NOT IN ('refunded'::public.subscription_status, 'revoked'::public.subscription_status))),
  CONSTRAINT chk_billing_readbacks_applied_pair CHECK ((applied_at IS NULL) = (apply_outcome IS NULL))
);
COMMENT ON TABLE public.billing_readbacks IS
  'Append-only evidence of PayPal read-backs. Written only by billing_record_readback / billing_record_refund_readback (SECURITY DEFINER); consumed once by billing_apply_readback. No direct DML for any API role.';
CREATE INDEX IF NOT EXISTS idx_billing_readbacks_subscription ON public.billing_readbacks (subscription_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION private.guard_billing_readback_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Billing readback evidence cannot be deleted' USING ERRCODE = '42501';
  END IF;
  -- Only the single consume step (applied_at / apply_outcome NULL -> value) is allowed.
  IF OLD.applied_at IS NULL AND NEW.applied_at IS NOT NULL AND NEW.apply_outcome IS NOT NULL
     AND NEW.id IS NOT DISTINCT FROM OLD.id AND NEW.kind IS NOT DISTINCT FROM OLD.kind
     AND NEW.subscription_id IS NOT DISTINCT FROM OLD.subscription_id
     AND NEW.provider_subscription_id IS NOT DISTINCT FROM OLD.provider_subscription_id
     AND NEW.provider_plan_id IS NOT DISTINCT FROM OLD.provider_plan_id
     AND NEW.provider_status IS NOT DISTINCT FROM OLD.provider_status
     AND NEW.mapped_status IS NOT DISTINCT FROM OLD.mapped_status
     AND NEW.period_end IS NOT DISTINCT FROM OLD.period_end
     AND NEW.last_payment_amount IS NOT DISTINCT FROM OLD.last_payment_amount
     AND NEW.last_payment_currency IS NOT DISTINCT FROM OLD.last_payment_currency
     AND NEW.payment_event_id IS NOT DISTINCT FROM OLD.payment_event_id
     AND NEW.recorded_at IS NOT DISTINCT FROM OLD.recorded_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Billing readback evidence is immutable' USING ERRCODE = '42501';
END;
$function$;
ALTER FUNCTION private.guard_billing_readback_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.guard_billing_readback_mutation() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_billing_readbacks_immutable ON public.billing_readbacks;
CREATE TRIGGER trg_billing_readbacks_immutable
  BEFORE UPDATE OR DELETE ON public.billing_readbacks
  FOR EACH ROW EXECUTE FUNCTION private.guard_billing_readback_mutation();
ALTER TABLE public.billing_readbacks ENABLE ALWAYS TRIGGER trg_billing_readbacks_immutable;

ALTER TABLE public.billing_readbacks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_readbacks FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.billing_readbacks TO service_role;

-- 1a. Records what PayPal reported for a subscription. The caller supplies PayPal's RAW status string; the database maps it.
--     Returns NULL when the subscription is unknown (the caller treats that as 'unknown_subscription', e.g. a webhook that
--     overtook the checkout registration). A webhook-derived read may reference its ledger row; that row must be provider-verified.
CREATE OR REPLACE FUNCTION public.billing_record_readback(
  p_provider_subscription_id TEXT, p_provider_plan_id TEXT, p_provider_status TEXT, p_period_end TIMESTAMPTZ,
  p_last_payment_amount NUMERIC, p_last_payment_currency TEXT, p_event_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_ev public.payment_events%ROWTYPE;
  v_id UUID;
BEGIN
  IF p_provider_status IS NULL OR pg_catalog.btrim(p_provider_status) = '' THEN
    RAISE EXCEPTION 'invalid_readback' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions s WHERE s.provider = 'paypal' AND s.provider_subscription_id = p_provider_subscription_id;
  IF NOT FOUND OR v_sub.user_id IS NULL THEN RETURN NULL; END IF;
  IF p_event_id IS NOT NULL THEN
    SELECT * INTO v_ev FROM public.payment_events e WHERE e.id = p_event_id;
    IF NOT FOUND OR v_ev.provider <> 'paypal' OR NOT v_ev.provider_verified THEN
      RAISE EXCEPTION 'readback_event_not_verified' USING ERRCODE = '22023';
    END IF;
    IF v_ev.resource_id LIKE 'I-%' AND v_ev.resource_id <> p_provider_subscription_id THEN
      RAISE EXCEPTION 'readback_event_subscription_mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO public.billing_readbacks (kind, subscription_id, provider_subscription_id, provider_plan_id, provider_status, mapped_status,
                                        period_end, last_payment_amount, last_payment_currency, payment_event_id)
  VALUES ('subscription_read', v_sub.id, v_sub.provider_subscription_id, p_provider_plan_id, p_provider_status,
          private.billing_map_paypal_status(p_provider_status), p_period_end, p_last_payment_amount, p_last_payment_currency, p_event_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- 1b. Records a refund/reversal. The only accepted evidence is a provider-verified ledger row of type PAYMENT.SALE.REFUNDED/REVERSED.
CREATE OR REPLACE FUNCTION public.billing_record_refund_readback(
  p_provider_subscription_id TEXT, p_provider_plan_id TEXT, p_event_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_ev public.payment_events%ROWTYPE;
  v_id UUID;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions s WHERE s.provider = 'paypal' AND s.provider_subscription_id = p_provider_subscription_id;
  IF NOT FOUND OR v_sub.user_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_ev FROM public.payment_events e WHERE e.id = p_event_id;
  IF p_event_id IS NULL OR NOT FOUND OR v_ev.provider <> 'paypal' OR NOT v_ev.provider_verified
     OR v_ev.event_type NOT IN ('PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED') THEN
    RAISE EXCEPTION 'refund_requires_verified_refund_event' USING ERRCODE = '22023';
  END IF;
  IF v_ev.resource_id LIKE 'I-%' AND v_ev.resource_id <> p_provider_subscription_id THEN
    RAISE EXCEPTION 'readback_event_subscription_mismatch' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.billing_readbacks (kind, subscription_id, provider_subscription_id, provider_plan_id, mapped_status, payment_event_id)
  VALUES ('refund_event', v_sub.id, v_sub.provider_subscription_id, p_provider_plan_id, 'refunded', p_event_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- 2 (DB part). Subscription columns that track the PayPal-side cancel of a locally refunded/revoked subscription (F-05/N1).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_cancel_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_cancel_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_cancel_last_attempt_at TIMESTAMPTZ;
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'chk_subscriptions_provider_cancel_status') THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT chk_subscriptions_provider_cancel_status
      CHECK (provider_cancel_status IS NULL OR provider_cancel_status IN ('pending', 'done', 'failed'));
  END IF;
END;
$c$;
-- One-off backfill: subscriptions that were refunded/revoked before this migration may still be billing at PayPal. The reconciler
-- reads each once and marks it done when PayPal already reports it inactive.
UPDATE public.subscriptions SET provider_cancel_status = 'pending'
 WHERE provider = 'paypal' AND status IN ('refunded', 'revoked') AND provider_cancel_status IS NULL;

-- 1c. Applies ONE stored readback. Nothing about status, amount, currency, plan or period comes from the caller.
--     Grants premium only when the stored PayPal read is ACTIVE, matches the plan row in billing_plans (amount, currency) and the
--     subscription's PayPal plan id, has a future period end, is fresh (15 minutes) and has not been consumed before.
CREATE OR REPLACE FUNCTION public.billing_apply_readback(p_readback_id UUID)
RETURNS TABLE (subscription_id UUID, granted BOOLEAN, outcome TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_rb public.billing_readbacks%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_plan public.billing_plans%ROWTYPE;
  v_granted BOOLEAN := FALSE;
  v_outcome TEXT;
BEGIN
  SELECT * INTO v_rb FROM public.billing_readbacks r WHERE r.id = p_readback_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'unknown_readback'::TEXT; RETURN;
  END IF;
  IF v_rb.applied_at IS NOT NULL THEN
    RETURN QUERY SELECT v_rb.subscription_id, FALSE, 'readback_already_applied'::TEXT; RETURN;
  END IF;
  -- Serialise per subscription, then read the subscription AFTER the lock (terminal-state guard relies on it).
  SELECT * INTO v_sub FROM public.subscriptions s WHERE s.id = v_rb.subscription_id FOR UPDATE;
  IF NOT FOUND OR v_sub.user_id IS NULL THEN
    v_outcome := 'unknown_subscription';
  ELSIF v_rb.recorded_at < pg_catalog.now() - interval '15 minutes' THEN
    v_outcome := 'readback_stale';
  ELSIF v_sub.status IN ('refunded'::public.subscription_status, 'revoked'::public.subscription_status)
        AND v_rb.mapped_status NOT IN ('refunded'::public.subscription_status, 'revoked'::public.subscription_status) THEN
    -- F3 terminal-state guard (unchanged semantics): a refunded/revoked subscription is never re-activated, re-cancelled or
    -- otherwise moved by a non-terminal readback. Terminal -> terminal stays allowed (idempotent revoke).
    IF v_rb.payment_event_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.audit_events a
          WHERE a.action = 'billing.subscription.terminal_state_ignored' AND a.target_type = 'subscription'
            AND a.target_id = v_sub.id AND a.metadata ->> 'event_id' = v_rb.payment_event_id::TEXT) THEN
      INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
      VALUES (NULL, 'billing.subscription.terminal_state_ignored', 'subscription', v_sub.id,
              pg_catalog.jsonb_build_object('status', v_rb.mapped_status, 'subscription_status', v_sub.status, 'event_id', v_rb.payment_event_id, 'readback_id', v_rb.id));
    END IF;
    v_outcome := 'terminal_state';
  ELSE
    SELECT * INTO v_plan FROM public.billing_plans bp WHERE bp.plan_key = v_sub.plan_key;
    IF NOT FOUND OR v_rb.provider_plan_id IS DISTINCT FROM v_sub.provider_plan_id THEN
      v_outcome := 'plan_mismatch';
    ELSIF v_rb.mapped_status = 'active'::public.subscription_status THEN
      IF v_rb.kind <> 'subscription_read' OR v_rb.last_payment_amount IS DISTINCT FROM v_plan.amount
         OR v_rb.last_payment_currency IS DISTINCT FROM v_plan.currency
         OR v_rb.period_end IS NULL OR v_rb.period_end <= pg_catalog.now() THEN
        v_outcome := 'settlement_mismatch';
      ELSE
        UPDATE public.subscriptions SET status = 'active', current_period_end = v_rb.period_end,
          current_period_start = COALESCE(current_period_start, LEAST(pg_catalog.now(), v_rb.period_end - interval '1 month')),
          last_verified_at = pg_catalog.now()
         WHERE id = v_sub.id;
        INSERT INTO public.entitlements (user_id, entitlement_key, status, source_subscription_id, valid_from, valid_until)
        VALUES (v_sub.user_id, v_plan.entitlement_key, 'active', v_sub.id, pg_catalog.now(), v_rb.period_end)
        ON CONFLICT ON CONSTRAINT uq_entitlements_user_key DO UPDATE
          SET status = 'active', source_subscription_id = EXCLUDED.source_subscription_id,
              valid_from = LEAST(public.entitlements.valid_from, pg_catalog.now()),
              valid_until = GREATEST(EXCLUDED.valid_until, COALESCE(public.entitlements.valid_until, EXCLUDED.valid_until));
        v_granted := TRUE; v_outcome := 'granted';
      END IF;
    ELSIF v_rb.mapped_status = 'cancelled'::public.subscription_status THEN
      UPDATE public.subscriptions SET status = 'cancelled', cancel_at_period_end = TRUE,
        cancelled_at = COALESCE(cancelled_at, pg_catalog.now()), last_verified_at = pg_catalog.now()
       WHERE id = v_sub.id;
      UPDATE public.entitlements SET valid_until = LEAST(COALESCE(valid_until, v_sub.current_period_end), COALESCE(v_sub.current_period_end, pg_catalog.now() + interval '1 second'))
       WHERE source_subscription_id = v_sub.id AND status = 'active';
      v_outcome := 'cancel_at_period_end';
    ELSIF v_rb.mapped_status IN ('suspended'::public.subscription_status, 'expired'::public.subscription_status,
                                 'refunded'::public.subscription_status, 'revoked'::public.subscription_status) THEN
      UPDATE public.subscriptions SET status = v_rb.mapped_status, last_verified_at = pg_catalog.now(),
        -- F-05/N1: a locally refunded/revoked subscription must also stop billing at PayPal (done by the Edge Function / reconciler).
        provider_cancel_status = CASE WHEN v_rb.mapped_status IN ('refunded'::public.subscription_status, 'revoked'::public.subscription_status)
                                       AND provider_cancel_status IS NULL THEN 'pending' ELSE provider_cancel_status END
       WHERE id = v_sub.id;
      UPDATE public.entitlements SET status = CASE WHEN v_rb.mapped_status IN ('refunded'::public.subscription_status, 'revoked'::public.subscription_status)
                                                   THEN 'revoked'::public.entitlement_status ELSE 'inactive'::public.entitlement_status END
       WHERE source_subscription_id = v_sub.id AND status = 'active';
      v_outcome := 'revoked';
    ELSE
      -- approval_pending: no grant.
      UPDATE public.subscriptions SET status = v_rb.mapped_status, last_verified_at = pg_catalog.now() WHERE id = v_sub.id;
      v_outcome := 'no_change';
    END IF;
    IF v_outcome IN ('granted', 'cancel_at_period_end', 'revoked', 'no_change') THEN
      INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
      VALUES (NULL, 'billing.subscription.' || v_outcome, 'subscription', v_sub.id,
              pg_catalog.jsonb_build_object('status', v_rb.mapped_status, 'event_id', v_rb.payment_event_id, 'environment', v_sub.environment, 'readback_id', v_rb.id));
    END IF;
  END IF;
  UPDATE public.billing_readbacks SET applied_at = pg_catalog.now(), apply_outcome = v_outcome WHERE id = v_rb.id;
  RETURN QUERY SELECT v_rb.subscription_id, v_granted, v_outcome;
END;
$function$;

-- 2 (RPCs). PayPal-side cancel queue for refunded/revoked subscriptions.
CREATE OR REPLACE FUNCTION public.billing_list_pending_provider_cancels(p_environment TEXT, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (provider_subscription_id TEXT, attempts INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT s.provider_subscription_id, s.provider_cancel_attempts
    FROM public.subscriptions s
   WHERE s.provider = 'paypal' AND s.environment = p_environment
     AND s.status IN ('refunded', 'revoked') AND s.provider_cancel_status = 'pending'
     AND (s.provider_cancel_last_attempt_at IS NULL OR s.provider_cancel_last_attempt_at <= pg_catalog.now() - interval '5 minutes')
   ORDER BY s.provider_cancel_last_attempt_at ASC NULLS FIRST, s.created_at ASC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$function$;

-- Records the outcome of a PayPal cancel attempt. Idempotent: only a 'pending' row changes. Failure keeps it pending (retried by
-- the reconciler every >= 5 minutes) until 20 attempts, then 'failed' (operator action). Never touches status/entitlements.
CREATE OR REPLACE FUNCTION public.billing_record_provider_cancel(p_provider_subscription_id TEXT, p_result TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_state TEXT;
BEGIN
  IF p_result IS NULL OR p_result NOT IN ('done', 'failed') THEN
    RAISE EXCEPTION 'invalid_cancel_result' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions s
   WHERE s.provider = 'paypal' AND s.provider_subscription_id = p_provider_subscription_id FOR UPDATE;
  IF NOT FOUND OR v_sub.status NOT IN ('refunded', 'revoked') THEN
    RETURN 'ignored';
  END IF;
  IF v_sub.provider_cancel_status IS DISTINCT FROM 'pending' THEN
    RETURN COALESCE(v_sub.provider_cancel_status, 'ignored');
  END IF;
  IF p_result = 'done' THEN
    v_state := 'done';
  ELSE
    v_state := CASE WHEN v_sub.provider_cancel_attempts + 1 >= 20 THEN 'failed' ELSE 'pending' END;
  END IF;
  UPDATE public.subscriptions SET provider_cancel_status = v_state,
         provider_cancel_attempts = provider_cancel_attempts + CASE WHEN p_result = 'failed' THEN 1 ELSE 0 END,
         provider_cancel_last_attempt_at = pg_catalog.now()
   WHERE id = v_sub.id;
  IF p_result = 'done' OR v_state = 'failed' THEN
    INSERT INTO public.audit_events (actor_id, action, target_type, target_id, metadata)
    VALUES (NULL, 'billing.subscription.provider_cancel_' || v_state, 'subscription', v_sub.id,
            pg_catalog.jsonb_build_object('attempts', v_sub.provider_cancel_attempts + CASE WHEN p_result = 'failed' THEN 1 ELSE 0 END, 'environment', v_sub.environment));
  END IF;
  RETURN v_state;
END;
$function$;

-- Candidate queries must ignore the new evidence table's effect: unchanged, but the F3 reconciler functions are re-asserted below.

-- Owners and EXECUTE for every new function (service_role only).
DO $grants$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.billing_record_readback(text,text,text,timestamptz,numeric,text,uuid)',
    'public.billing_record_refund_readback(text,text,uuid)',
    'public.billing_apply_readback(uuid)',
    'public.billing_list_pending_provider_cancels(text,integer)',
    'public.billing_record_provider_cancel(text,text)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO postgres', fn);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$grants$;

-- =====================================================================================================================
-- 3. F-02 / F-03 / F-04: evidence-table pattern and trust-anchor lock-down
-- =====================================================================================================================
-- user_consents: terms/privacy acceptance + marketing opt-in evidence. Written only by the auth.users trigger (definer).
REVOKE ALL ON TABLE public.user_consents FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.user_consents TO authenticated;   -- unchanged client contract (RLS: own row)
GRANT SELECT ON TABLE public.user_consents TO service_role;

-- reports: safety evidence. Writers: submit_report (definer), seed (postgres). Workflow columns kept; legal hold/retention are not
-- changeable by service_role (changed by a reviewed migration / postgres only).
REVOKE ALL ON TABLE public.reports FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.reports TO authenticated;
GRANT SELECT, INSERT ON TABLE public.reports TO service_role;
GRANT UPDATE (status, severity) ON TABLE public.reports TO service_role;

-- moderation_cases: transitions go through moderation_transition_case (definer, audited). service_role loses direct UPDATE.
REVOKE ALL ON TABLE public.moderation_cases FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.moderation_cases TO authenticated;
GRANT SELECT, INSERT ON TABLE public.moderation_cases TO service_role;

-- verification_requests: age/ID verification evidence. No writer exists yet; keep the minimal contract a provider webhook needs.
REVOKE ALL ON TABLE public.verification_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.verification_requests TO authenticated;
GRANT SELECT, INSERT ON TABLE public.verification_requests TO service_role;
GRANT UPDATE (status, attempts, decided_at, provider_session_id) ON TABLE public.verification_requests TO service_role;

-- Config / trust anchors: changeable through migrations (postgres) only.
REVOKE ALL ON TABLE public.billing_plans FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.billing_plans TO authenticated, service_role;
REVOKE ALL ON TABLE public.billing_markets FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.billing_markets TO service_role;
REVOKE ALL ON TABLE public.attribution_networks FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.attribution_networks TO service_role;
REVOKE ALL ON TABLE public.postback_outbox FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.postback_outbox TO service_role;

-- Attribution / funnel facts: written by definer triggers only.
REVOKE ALL ON TABLE public.signup_attributions FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE public.signup_attributions TO authenticated;   -- unchanged client contract (RLS: own row)
GRANT SELECT ON TABLE public.signup_attributions TO service_role;
REVOKE ALL ON TABLE public.funnel_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.funnel_events TO service_role;

-- blocks / messages: every writer is a postgres-owned SECURITY DEFINER function (block_user, unblock_user, send_message) or an RI action.
-- authenticated keeps exactly what it had (SELECT). profiles is deliberately NOT narrowed here (see docs: deferred).
REVOKE ALL ON TABLE public.blocks FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.blocks TO authenticated, service_role;
REVOKE ALL ON TABLE public.messages FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.messages TO authenticated, service_role;

-- =====================================================================================================================
-- 4. F-06: no direct UPDATE on the ledger / worker-less columns
-- =====================================================================================================================
-- Every payment_events UPDATE runs inside owner-owned SECURITY DEFINER functions (billing_finish_event, billing_flag_unresolved_event).
REVOKE ALL ON TABLE public.payment_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.payment_events TO service_role;
-- privacy_requests: workflow columns only (no code or worker sets retention_until/legal_hold; those are changed by postgres/migrations).
REVOKE ALL ON TABLE public.privacy_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.privacy_requests TO authenticated;
GRANT INSERT (user_id, request_type, idempotency_key) ON TABLE public.privacy_requests TO authenticated;
GRANT SELECT, INSERT ON TABLE public.privacy_requests TO service_role;
GRANT UPDATE (status, completion_metadata, failure_code, completed_at) ON TABLE public.privacy_requests TO service_role;

-- =====================================================================================================================
-- 5. TRUNCATE guards (ENABLE ALWAYS) for every append-only ledger / evidence table (function from 20261023000060)
-- =====================================================================================================================
DO $guards$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_consents', 'reports', 'moderation_cases', 'verification_requests', 'billing_readbacks',
                           'privacy_requests', 'subscriptions', 'entitlements'] LOOP
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS trg_%s_no_truncate ON public.%I', t, t);
    EXECUTE pg_catalog.format('CREATE TRIGGER trg_%s_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION private.prevent_evidence_truncate()', t, t);
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER trg_%s_no_truncate', t, t);
  END LOOP;
END;
$guards$;

-- =====================================================================================================================
-- 6. F-07: future tables created by postgres in public get NO privileges for the API roles (each migration must GRANT explicitly).
-- Tables created by other owners (e.g. supabase_admin via the dashboard) are not affected; see docs/operations/privilege-hardening.md.
-- =====================================================================================================================
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;

-- ROLLBACK (manual; forward-fix preferred; never delete or truncate audit/consent/ledger/readback rows):
--   * Guards: DROP TRIGGER IF EXISTS trg_<table>_no_truncate ON public.<table>; for the tables listed in section 5.
--   * Default privileges: ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;  (NOT recommended)
--   * Privileges: re-grant only what a proven workload needs, e.g. GRANT UPDATE (legal_hold) ON public.payment_events TO service_role;
--   * F-01 cannot be rolled back to the 7-argument function without re-opening the forged-grant path; restore it from
--     20261023000051 only with an explicit owner decision.
--   * Provider-cancel columns on subscriptions are additive and can stay.
