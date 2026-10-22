-- Funnel trust: signup consent, affiliate attribution, funnel events, postback outbox.
--
-- * user_consents: required terms+privacy acceptance and OPTIONAL marketing opt-in,
--   each with its own server timestamp. RLS: owner may read/insert own row only.
-- * signup_attributions: affiliate click ids / sub params / utm_*, bound ONCE per
--   account at signup (PK user_id). RLS: owner may insert own row; no client SELECT
--   (service_role only). Only an allowlisted set of keys is kept, values are length-
--   and charset-limited, and only the landing PATH is stored (never a query string),
--   so no PII leaks into stored URLs.
-- * funnel_events: server-written, unique per (user_id, event):
--   signup_completed, doi_confirmed, profile_completed. No client access.
-- * attribution_networks: per-network config (click-id param mapping, postback URL
--   template with {click_id} {event} {payout} {transaction_id} macros, postback_enabled
--   default false). Seeded only with generic 'direct' and 'unknown' sources.
-- * postback_outbox: unique (network, click_id, event). Intentionally left EMPTY and
--   nothing writes or sends from it yet.
--   TODO(postbacks): implement postback enqueue + delivery once the affiliate network's
--   postback spec (URL template, auth, retry semantics) is confirmed.
--
-- Consent and attribution are captured from auth signUp user metadata by a
-- SECURITY DEFINER trigger on auth.users, because email confirmation means there is
-- no client session at signup time.

CREATE TABLE public.user_consents (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_privacy_accepted_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  terms_version TEXT NOT NULL DEFAULT '2026-10',
  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  marketing_opt_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_user_consents_marketing_ts CHECK (marketing_opt_in = (marketing_opt_in_at IS NOT NULL)),
  CONSTRAINT chk_user_consents_terms_version CHECK (pg_catalog.char_length(terms_version) BETWEEN 1 AND 32)
);
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.user_consents TO authenticated;
GRANT ALL ON TABLE public.user_consents TO service_role;
CREATE POLICY user_consents_select_own ON public.user_consents FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY user_consents_insert_own ON public.user_consents FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Per-network configuration (data, not code): which params carry the click id, and the
-- postback URL template with macros {click_id}, {event}, {payout}, {transaction_id}.
-- Works for affiliate networks and self-run trackers (Voluum, RedTrack, ...). Sending is
-- disabled everywhere: postback_enabled defaults to false and no sender exists yet.
CREATE TABLE public.attribution_networks (
  slug TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  click_id_params TEXT[] NOT NULL DEFAULT ARRAY['aff_click_id','click_id','clickid','cid','rtkcid','subid','transaction_id']::TEXT[],
  postback_url_template TEXT,
  postback_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_attr_networks_slug CHECK (slug ~ '^[a-z0-9_.-]{1,64}$'),
  CONSTRAINT chk_attr_networks_template CHECK (postback_url_template IS NULL OR postback_url_template ~ '^https://'),
  CONSTRAINT chk_attr_networks_click_params CHECK (pg_catalog.cardinality(click_id_params) BETWEEN 1 AND 10)
);
ALTER TABLE public.attribution_networks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attribution_networks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.attribution_networks TO service_role;
-- Generic sources only; real networks/trackers are added as config rows by an operator.
INSERT INTO public.attribution_networks (slug, display_name) VALUES
  ('direct', 'Direct / own traffic'),
  ('unknown', 'Unrecognised network (click id present, no known network param)');

CREATE TABLE public.signup_attributions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  network TEXT NOT NULL DEFAULT 'direct',
  click_id TEXT,
  params JSONB NOT NULL DEFAULT '{}'::JSONB,
  landing_path TEXT,
  first_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_signup_attr_network CHECK (network ~ '^[a-z0-9_.-]{1,64}$'),
  CONSTRAINT chk_signup_attr_click_id CHECK (click_id IS NULL OR click_id ~ '^[A-Za-z0-9_.:~-]{1,128}$'),
  CONSTRAINT chk_signup_attr_params_obj CHECK (pg_catalog.jsonb_typeof(params) = 'object'),
  CONSTRAINT chk_signup_attr_landing_path CHECK (landing_path IS NULL OR (landing_path ~ '^/[^?#]{0,200}$'))
);
ALTER TABLE public.signup_attributions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.signup_attributions FROM PUBLIC, anon, authenticated;
GRANT INSERT ON TABLE public.signup_attributions TO authenticated;
GRANT ALL ON TABLE public.signup_attributions TO service_role;
CREATE POLICY signup_attributions_insert_own ON public.signup_attributions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE INDEX idx_signup_attributions_network_click ON public.signup_attributions (network, click_id);

CREATE TABLE public.funnel_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_funnel_events_event CHECK (event IN ('signup_completed','doi_confirmed','profile_completed')),
  CONSTRAINT uq_funnel_events_user_event UNIQUE (user_id, event)
);
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.funnel_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.funnel_events TO service_role;

CREATE TABLE public.postback_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  network TEXT NOT NULL,
  click_id TEXT NOT NULL,
  event TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transaction_id TEXT,
  payout NUMERIC(12,4),
  -- Snapshot of attribution_networks.postback_url_template at enqueue time (macros unresolved).
  url_template TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  sent_at TIMESTAMPTZ,
  CONSTRAINT chk_postback_outbox_event CHECK (event IN ('signup_completed','doi_confirmed','profile_completed')),
  CONSTRAINT chk_postback_outbox_template CHECK (url_template IS NULL OR url_template ~ '^https://'),
  CONSTRAINT chk_postback_outbox_status CHECK (status IN ('pending','sent','failed','skipped')),
  CONSTRAINT uq_postback_outbox_network_click_event UNIQUE (network, click_id, event)
);
ALTER TABLE public.postback_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.postback_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.postback_outbox TO service_role;

CREATE OR REPLACE FUNCTION private.record_funnel_event(p_user_id UUID, p_event TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  INSERT INTO public.funnel_events (user_id, event) VALUES (p_user_id, p_event)
  ON CONFLICT ON CONSTRAINT uq_funnel_events_user_event DO NOTHING;
$function$;
REVOKE ALL ON FUNCTION private.record_funnel_event(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Sanitise client-provided attribution metadata into an allowlisted JSON object.
CREATE OR REPLACE FUNCTION private.sanitize_attribution_params(p_raw JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_temp
AS $function$
  SELECT COALESCE(pg_catalog.jsonb_object_agg(kv.key, pg_catalog.left(kv.value #>> '{}', 128)), '{}'::JSONB)
    FROM pg_catalog.jsonb_each(CASE WHEN pg_catalog.jsonb_typeof(p_raw) = 'object' THEN p_raw ELSE '{}'::JSONB END) AS kv
   WHERE kv.key ~ '^(network|click_id|clickid|cid|rtkcid|subid|sub_id|aff_click_id|transaction_id|aff_id|offer_id|campaign_id|aff_sub[2-5]?|sub([1-9]|10)|s[1-5]|utm_[a-z_]{1,32})$'
     AND pg_catalog.jsonb_typeof(kv.value) = 'string'
     AND (kv.value #>> '{}') ~ '^[A-Za-z0-9_.:~ -]{1,128}$'
     AND (kv.value #>> '{}') !~ '@';
$function$;
REVOKE ALL ON FUNCTION private.sanitize_attribution_params(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.handle_auth_user_funnel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::JSONB);
  v_consent JSONB := v_meta -> 'consent';
  v_attr JSONB := v_meta -> 'attribution';
  v_params JSONB;
  v_network TEXT;
  v_click TEXT;
  v_path TEXT;
  v_first_seen TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.record_funnel_event(NEW.id, 'signup_completed');

    IF pg_catalog.jsonb_typeof(v_consent) = 'object' AND (v_consent ->> 'terms_privacy') = 'true' THEN
      INSERT INTO public.user_consents (user_id, marketing_opt_in, marketing_opt_in_at)
      VALUES (NEW.id, COALESCE((v_consent ->> 'marketing') = 'true', false),
              CASE WHEN (v_consent ->> 'marketing') = 'true' THEN pg_catalog.now() END)
      ON CONFLICT (user_id) DO NOTHING;
    END IF;

    -- Every account gets exactly one attribution row; no params => 'direct' (own traffic).
    v_params := CASE WHEN pg_catalog.jsonb_typeof(v_attr) = 'object' THEN private.sanitize_attribution_params(v_attr -> 'params') ELSE '{}'::JSONB END;
    v_network := pg_catalog.lower(v_params ->> 'network');
    IF v_network IS NULL OR NOT EXISTS (SELECT 1 FROM public.attribution_networks n WHERE n.slug = v_network) THEN
      v_network := NULL;
    END IF;
    SELECT v_params ->> p INTO v_click
      FROM public.attribution_networks n, pg_catalog.unnest(n.click_id_params) WITH ORDINALITY AS u(p, ord)
     WHERE n.slug = COALESCE(v_network, 'unknown') AND v_params ? p
     ORDER BY ord LIMIT 1;
    IF v_click IS NOT NULL AND v_click !~ '^[A-Za-z0-9_.:~-]{1,128}$' THEN v_click := NULL; END IF;
    v_network := COALESCE(v_network, CASE WHEN v_click IS NOT NULL THEN 'unknown' ELSE 'direct' END);
    IF pg_catalog.jsonb_typeof(v_attr) = 'object' THEN
      v_path := v_attr ->> 'landing_path';
      IF v_path IS NULL OR v_path !~ '^/[^?#@]{0,200}$' THEN v_path := NULL; END IF;
      BEGIN
        v_first_seen := (v_attr ->> 'first_seen_at')::TIMESTAMPTZ;
      EXCEPTION WHEN others THEN v_first_seen := NULL;
      END;
    END IF;
    INSERT INTO public.signup_attributions (user_id, network, click_id, params, landing_path, first_seen_at)
    VALUES (NEW.id, v_network, v_click, v_params, v_path, v_first_seen)
    ON CONFLICT (user_id) DO NOTHING;

    IF NEW.email_confirmed_at IS NOT NULL THEN
      PERFORM private.record_funnel_event(NEW.id, 'doi_confirmed');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
      PERFORM private.record_funnel_event(NEW.id, 'doi_confirmed');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.handle_auth_user_funnel() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_auth_user_funnel_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_auth_user_funnel();
CREATE TRIGGER trg_auth_user_funnel_confirm
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_auth_user_funnel();

CREATE OR REPLACE FUNCTION private.handle_profile_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.city_region IS NOT NULL AND pg_catalog.btrim(NEW.city_region) <> '' THEN
    PERFORM private.record_funnel_event(NEW.id, 'profile_completed');
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.handle_profile_completed() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_profiles_funnel_completed
  AFTER INSERT OR UPDATE OF city_region ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.handle_profile_completed();
