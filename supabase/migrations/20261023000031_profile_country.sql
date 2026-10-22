-- Profile country (ISO 3166-1 alpha-2) and pricing precedence:
--   1. profiles.country_code (if it is an enabled billing market)
--   2. validated client locale hint (if it is an enabled billing market)
--   3. PH fallback
-- The country is user-editable (column-level UPDATE grant), but it only ever selects
-- one of the server-configured plans; amounts always come from public.billing_plans.

ALTER TABLE public.profiles ADD COLUMN country_code TEXT;
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_country_code_iso CHECK (country_code IS NULL OR country_code IN (
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
    'VN','VU','WF','WS','YE','YT','ZA','ZM','ZW'));
COMMENT ON COLUMN public.profiles.country_code IS 'ISO 3166-1 alpha-2, uppercase. Drives billing market (then locale hint, then PH).';

GRANT UPDATE (country_code) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION private.resolve_billing_plan_for_user(p_user_id UUID, p_country_hint TEXT)
RETURNS TABLE (country_code TEXT, plan_key TEXT, currency TEXT, amount NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT r.country_code, r.plan_key, r.currency, r.amount
    FROM private.resolve_billing_plan(
      COALESCE(
        (SELECT p.country_code FROM public.profiles p
           JOIN public.billing_markets m ON m.country_code = p.country_code AND m.is_enabled
           JOIN public.billing_plans bp ON bp.plan_key = m.plan_key AND bp.is_enabled
          WHERE p.id = p_user_id),
        p_country_hint)) r;
$function$;
ALTER FUNCTION private.resolve_billing_plan_for_user(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.resolve_billing_plan_for_user(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Client: resolves for the caller's own profile.
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
  RETURN QUERY SELECT * FROM private.resolve_billing_plan_for_user((SELECT auth.uid()), p_country_hint);
END;
$function$;

-- Edge (service_role): resolves for the authenticated checkout user.
CREATE OR REPLACE FUNCTION public.billing_resolve_plan_for_user(p_user_id UUID, p_country_hint TEXT DEFAULT NULL)
RETURNS TABLE (country_code TEXT, plan_key TEXT, currency TEXT, amount NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT * FROM private.resolve_billing_plan_for_user(p_user_id, p_country_hint);
$function$;
ALTER FUNCTION public.billing_resolve_plan_for_user(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.billing_resolve_plan_for_user(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_resolve_plan_for_user(UUID, TEXT) TO service_role;

-- ROLLBACK (manual; forward-fix preferred):
--   DROP FUNCTION public.billing_resolve_plan_for_user(UUID, TEXT);
--   re-create public.get_billing_plan from 20261023000021 (hint-only);
--   DROP FUNCTION private.resolve_billing_plan_for_user(UUID, TEXT);
--   REVOKE UPDATE (country_code) ON public.profiles FROM authenticated;
--   ALTER TABLE public.profiles DROP COLUMN country_code;  -- drops user-entered data
