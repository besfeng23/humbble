-- P4 local pricing (owner decision OWN-PRICE-01, 2026-10-23): international
-- markets with local prices. Additive; earlier migrations are not edited.
--
-- ============================================================================
-- PRICE CONFIG: Mark can edit these numbers. Change prices only via a NEW
-- migration (UPDATE public.billing_plans SET amount = ... WHERE plan_key = ...)
-- and create a matching PayPal plan (PAYPAL_PLAN_ID_<CUR>) at the same price;
-- the webhook refuses to grant premium when PayPal's amount differs.
--   USD 29.99 | EUR 27.99 | GBP 23.99 | SEK 299.00 | NOK 329.00
--   CAD 39.99 | AUD 44.99 | NZD 49.99 | PHP 599.00
-- ============================================================================

-- One plan per currency; the old PH/US-only market check and uniqueness go away.
ALTER TABLE public.billing_plans DROP CONSTRAINT chk_billing_plans_market;
ALTER TABLE public.billing_plans DROP CONSTRAINT uq_billing_plans_market;
ALTER TABLE public.billing_plans
  ADD CONSTRAINT chk_billing_plans_currency_allowlist
    CHECK (currency IN ('PHP', 'USD', 'EUR', 'GBP', 'SEK', 'NOK', 'CAD', 'AUD', 'NZD')),
  ADD CONSTRAINT uq_billing_plans_currency UNIQUE (currency);
COMMENT ON COLUMN public.billing_plans.market IS 'Primary market label for the plan; country routing lives in public.billing_markets.';

UPDATE public.billing_plans SET is_enabled = TRUE WHERE plan_key = 'premium_monthly_us';
INSERT INTO public.billing_plans (plan_key, market, currency, amount, is_enabled) VALUES
  ('premium_monthly_eur', 'EU', 'EUR',  27.99, TRUE),
  ('premium_monthly_gbp', 'GB', 'GBP',  23.99, TRUE),
  ('premium_monthly_sek', 'SE', 'SEK', 299.00, TRUE),
  ('premium_monthly_nok', 'NO', 'NOK', 329.00, TRUE),
  ('premium_monthly_cad', 'CA', 'CAD',  39.99, TRUE),
  ('premium_monthly_aud', 'AU', 'AUD',  44.99, TRUE),
  ('premium_monthly_nzd', 'NZ', 'NZD',  49.99, TRUE);

-- Country (ISO 3166-1 alpha-2) -> plan routing. This is the allowlist for
-- client country hints; is_enabled is the per-market switch (no env gates).
CREATE TABLE public.billing_markets (
  country_code TEXT PRIMARY KEY,
  plan_key TEXT NOT NULL REFERENCES public.billing_plans(plan_key),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_billing_markets_country CHECK (country_code ~ '^[A-Z]{2}$')
);
ALTER TABLE public.billing_markets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_markets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.billing_markets TO service_role;

INSERT INTO public.billing_markets (country_code, plan_key) VALUES
  ('PH', 'premium_monthly_ph'),
  ('US', 'premium_monthly_us'),
  ('SE', 'premium_monthly_sek'),
  ('NO', 'premium_monthly_nok'),
  ('GB', 'premium_monthly_gbp'),
  ('CA', 'premium_monthly_cad'),
  ('AU', 'premium_monthly_aud'),
  ('NZ', 'premium_monthly_nzd'),
  ('FI', 'premium_monthly_eur'),
  ('IT', 'premium_monthly_eur'),
  ('DE', 'premium_monthly_eur'),
  ('NL', 'premium_monthly_eur'),
  ('BE', 'premium_monthly_eur'),
  ('LU', 'premium_monthly_eur'),
  ('IE', 'premium_monthly_eur');

-- Server-side plan resolution. The hint is only used if it is on the enabled
-- allowlist; anything else falls back to PH. Price always comes from here.
CREATE OR REPLACE FUNCTION private.resolve_billing_plan(p_country_hint TEXT)
RETURNS TABLE (country_code TEXT, plan_key TEXT, currency TEXT, amount NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT m.country_code, p.plan_key, p.currency, p.amount
    FROM public.billing_markets m
    JOIN public.billing_plans p ON p.plan_key = m.plan_key
   WHERE m.is_enabled AND p.is_enabled
     AND m.country_code = COALESCE(
       (SELECT m2.country_code FROM public.billing_markets m2
         WHERE m2.country_code = pg_catalog.upper(pg_catalog.btrim(COALESCE(p_country_hint, '')))
           AND m2.is_enabled),
       'PH');
$function$;

CREATE OR REPLACE FUNCTION public.get_billing_plan(p_country_hint TEXT DEFAULT NULL)
RETURNS TABLE (country_code TEXT, plan_key TEXT, currency TEXT, amount NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL
     AND COALESCE((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM private.resolve_billing_plan(p_country_hint);
END;
$function$;

ALTER FUNCTION private.resolve_billing_plan(TEXT) OWNER TO postgres;
ALTER FUNCTION public.get_billing_plan(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.resolve_billing_plan(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_billing_plan(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_plan(TEXT) TO authenticated, service_role;

-- ROLLBACK (manual; forward-fix preferred, never delete subscriptions/ledger rows):
--   DROP FUNCTION public.get_billing_plan(TEXT); DROP FUNCTION private.resolve_billing_plan(TEXT);
--   DROP TABLE public.billing_markets;
--   UPDATE public.billing_plans SET is_enabled = FALSE WHERE plan_key <> 'premium_monthly_ph';
--   (Rows referenced by subscriptions.plan_key must stay; only disable them.)
--   Restoring the old PH/US-only constraints requires deleting unreferenced new plan rows first.
