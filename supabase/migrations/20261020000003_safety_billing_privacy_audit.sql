-- P2-03: safety, billing, consent, privacy, and audit domain.
-- Retention metadata is deliberately non-prescriptive: retention_until NULL means
-- no schedule has been approved/assigned, and legal_hold NULL means not assessed.
-- Counsel/owner approval is required before applying retention schedules or holds.

CREATE TYPE public.report_category AS ENUM (
  'safety', 'harassment', 'scam', 'underage', 'impersonation', 'other'
);
CREATE TYPE public.report_status AS ENUM (
  'submitted', 'under_review', 'actioned', 'dismissed', 'closed'
);
CREATE TYPE public.report_severity AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE public.moderation_case_status AS ENUM (
  'open', 'in_review', 'resolved', 'appealed', 'closed'
);
CREATE TYPE public.subscription_status AS ENUM (
  'approval_pending', 'active', 'past_due', 'suspended', 'cancelled', 'expired', 'refunded', 'revoked'
);
CREATE TYPE public.entitlement_status AS ENUM ('active', 'inactive', 'revoked');
CREATE TYPE public.payment_event_status AS ENUM (
  'received', 'verified', 'processing', 'processed', 'quarantined', 'failed'
);
CREATE TYPE public.consent_choice AS ENUM ('granted', 'denied', 'withdrawn');
CREATE TYPE public.privacy_request_type AS ENUM ('export', 'deletion');
CREATE TYPE public.privacy_request_status AS ENUM (
  'requested', 'in_progress', 'completed', 'failed', 'cancelled'
);

-- Reports remain after account deletion for safety/legal review, but direct user
-- references are nulled. No reporter's report list is exposed to other users.
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  category public.report_category NOT NULL,
  context_summary TEXT,
  status public.report_status NOT NULL DEFAULT 'submitted'::public.report_status,
  severity public.report_severity NOT NULL DEFAULT 'normal'::public.report_severity,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN DEFAULT NULL,
  CONSTRAINT chk_reports_not_self CHECK (
    reporter_id IS NULL OR reported_user_id IS NULL OR reporter_id <> reported_user_id
  ),
  CONSTRAINT chk_reports_context_length CHECK (
    context_summary IS NULL OR pg_catalog.char_length(context_summary) <= 1000
  ),
  CONSTRAINT chk_reports_retention_not_before_creation CHECK (
    retention_until IS NULL OR retention_until >= created_at
  )
);
COMMENT ON COLUMN public.reports.legal_hold IS 'NULL means legal-hold status has not been assessed; do not interpret as no hold.';
COMMENT ON COLUMN public.reports.retention_until IS 'NULL until an approved retention schedule sets a deadline.';
CREATE INDEX idx_reports_reporter_created_at ON public.reports (reporter_id, created_at DESC);
CREATE INDEX idx_reports_status_severity_created_at ON public.reports (status, severity DESC, created_at ASC);
CREATE INDEX idx_reports_reported_user_created_at ON public.reports (reported_user_id, created_at DESC);
CREATE INDEX idx_reports_retention_queue ON public.reports (retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX idx_reports_legal_hold_queue ON public.reports (created_at) WHERE legal_hold IS TRUE;

-- Staff-only case records; report deletion must not cascade away a moderation case.
CREATE TABLE public.moderation_cases (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  status public.moderation_case_status NOT NULL DEFAULT 'open'::public.moderation_case_status,
  assigned_moderator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  closed_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN DEFAULT NULL,
  CONSTRAINT chk_moderation_resolution_code_length CHECK (
    resolution_code IS NULL OR pg_catalog.char_length(pg_catalog.btrim(resolution_code)) BETWEEN 1 AND 100
  ),
  CONSTRAINT chk_moderation_case_closed_timestamp CHECK (
    (status IN ('resolved'::public.moderation_case_status, 'closed'::public.moderation_case_status) AND closed_at IS NOT NULL)
    OR status NOT IN ('resolved'::public.moderation_case_status, 'closed'::public.moderation_case_status)
  ),
  CONSTRAINT chk_moderation_case_retention_not_before_creation CHECK (
    retention_until IS NULL OR retention_until >= created_at
  )
);
COMMENT ON COLUMN public.moderation_cases.legal_hold IS 'NULL means legal-hold status has not been assessed; do not interpret as no hold.';
CREATE INDEX idx_moderation_cases_status_created_at ON public.moderation_cases (status, created_at ASC);
CREATE INDEX idx_moderation_cases_assigned_status ON public.moderation_cases (assigned_moderator_id, status, created_at ASC);
CREATE UNIQUE INDEX uq_moderation_cases_report_id ON public.moderation_cases (report_id) WHERE report_id IS NOT NULL;
CREATE INDEX idx_moderation_cases_retention_queue ON public.moderation_cases (retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX idx_moderation_cases_legal_hold_queue ON public.moderation_cases (created_at) WHERE legal_hold IS TRUE;

-- Provider identifiers are unique per provider. user_id uses SET NULL so deleting
-- an account does not erase subscription history needed for financial reconciliation.
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_subscription_id TEXT NOT NULL,
  provider_plan_id TEXT NOT NULL,
  status public.subscription_status NOT NULL DEFAULT 'approval_pending'::public.subscription_status,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN DEFAULT NULL,
  CONSTRAINT chk_subscriptions_provider CHECK (
    pg_catalog.char_length(pg_catalog.btrim(provider)) BETWEEN 1 AND 80
  ),
  CONSTRAINT chk_subscriptions_provider_subscription_id CHECK (
    pg_catalog.char_length(pg_catalog.btrim(provider_subscription_id)) BETWEEN 1 AND 255
  ),
  CONSTRAINT chk_subscriptions_provider_plan_id CHECK (
    pg_catalog.char_length(pg_catalog.btrim(provider_plan_id)) BETWEEN 1 AND 255
  ),
  CONSTRAINT chk_subscriptions_period_range CHECK (
    current_period_start IS NULL OR current_period_end IS NULL OR current_period_end > current_period_start
  ),
  CONSTRAINT chk_subscriptions_retention_not_before_creation CHECK (
    retention_until IS NULL OR retention_until >= created_at
  ),
  CONSTRAINT uq_subscriptions_provider_subscription UNIQUE (provider, provider_subscription_id)
);
COMMENT ON COLUMN public.subscriptions.legal_hold IS 'NULL means legal-hold status has not been assessed; do not interpret as no hold.';
CREATE INDEX idx_subscriptions_user_status ON public.subscriptions (user_id, status, created_at DESC);
CREATE INDEX idx_subscriptions_provider_plan ON public.subscriptions (provider, provider_plan_id, status);
CREATE INDEX idx_subscriptions_period_end ON public.subscriptions (current_period_end) WHERE status IN ('active'::public.subscription_status, 'past_due'::public.subscription_status);
CREATE INDEX idx_subscriptions_retention_queue ON public.subscriptions (retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX idx_subscriptions_legal_hold_queue ON public.subscriptions (created_at) WHERE legal_hold IS TRUE;

-- Entitlements are derived server-side from independently verified settlement and
-- subscription state. There is intentionally no trigger from subscriptions to here.
CREATE TABLE public.entitlements (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL,
  status public.entitlement_status NOT NULL DEFAULT 'inactive'::public.entitlement_status,
  source_subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT chk_entitlements_key CHECK (
    pg_catalog.char_length(pg_catalog.btrim(entitlement_key)) BETWEEN 1 AND 100
  ),
  CONSTRAINT chk_entitlements_period CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT uq_entitlements_user_key UNIQUE (user_id, entitlement_key)
);
CREATE INDEX idx_entitlements_user_status_period ON public.entitlements (user_id, status, valid_until);
CREATE INDEX idx_entitlements_source_subscription ON public.entitlements (source_subscription_id) WHERE source_subscription_id IS NOT NULL;

-- No raw webhook body is stored. provider_event_id is the idempotency key;
-- amount/currency are nullable only for non-financial events and must appear together.
CREATE TABLE public.payment_events (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2),
  currency TEXT,
  status public.payment_event_status NOT NULL DEFAULT 'received'::public.payment_event_status,
  provider_verified BOOLEAN NOT NULL DEFAULT FALSE,
  payload_sha256 TEXT,
  occurred_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  processed_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN DEFAULT NULL,
  CONSTRAINT chk_payment_events_provider CHECK (pg_catalog.char_length(pg_catalog.btrim(provider)) BETWEEN 1 AND 80),
  CONSTRAINT chk_payment_events_event_id CHECK (pg_catalog.char_length(pg_catalog.btrim(provider_event_id)) BETWEEN 1 AND 255),
  CONSTRAINT chk_payment_events_event_type CHECK (pg_catalog.char_length(pg_catalog.btrim(event_type)) BETWEEN 1 AND 160),
  CONSTRAINT chk_payment_events_amount_nonnegative CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT chk_payment_events_currency CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  CONSTRAINT chk_payment_events_amount_currency_pair CHECK ((amount IS NULL) = (currency IS NULL)),
  CONSTRAINT chk_payment_events_payload_hash CHECK (payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_payment_events_verified_state CHECK (
    status NOT IN ('verified'::public.payment_event_status, 'processing'::public.payment_event_status, 'processed'::public.payment_event_status) OR provider_verified
  ),
  CONSTRAINT chk_payment_events_processed_state CHECK (
    status <> 'processed'::public.payment_event_status OR (provider_verified AND processed_at IS NOT NULL)
  ),
  CONSTRAINT chk_payment_events_retention_not_before_creation CHECK (
    retention_until IS NULL OR retention_until >= received_at
  ),
  CONSTRAINT uq_payment_events_provider_event UNIQUE (provider, provider_event_id)
);
COMMENT ON COLUMN public.payment_events.legal_hold IS 'NULL means legal-hold status has not been assessed; do not interpret as no hold.';
CREATE INDEX idx_payment_events_user_received_at ON public.payment_events (user_id, received_at DESC);
CREATE INDEX idx_payment_events_subscription_received_at ON public.payment_events (subscription_id, received_at DESC);
CREATE INDEX idx_payment_events_status_received_at ON public.payment_events (status, received_at ASC);
CREATE INDEX idx_payment_events_financial_reconciliation ON public.payment_events (currency, occurred_at, provider_event_id) WHERE amount IS NOT NULL AND currency IS NOT NULL;
CREATE INDEX idx_payment_events_retention_queue ON public.payment_events (retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX idx_payment_events_legal_hold_queue ON public.payment_events (received_at) WHERE legal_hold IS TRUE;

-- Consent evidence is append-only for application/server roles; do not assume
-- purpose, lawful basis, retention period, or required consent until approved.
CREATE TABLE public.consent_records (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  consent_key TEXT NOT NULL,
  version TEXT NOT NULL,
  choice public.consent_choice NOT NULL,
  source TEXT NOT NULL DEFAULT 'app',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN DEFAULT NULL,
  CONSTRAINT chk_consent_key CHECK (pg_catalog.char_length(pg_catalog.btrim(consent_key)) BETWEEN 1 AND 120),
  CONSTRAINT chk_consent_version CHECK (pg_catalog.char_length(pg_catalog.btrim(version)) BETWEEN 1 AND 80),
  CONSTRAINT chk_consent_source CHECK (pg_catalog.char_length(pg_catalog.btrim(source)) BETWEEN 1 AND 80),
  CONSTRAINT chk_consent_metadata_object CHECK (pg_catalog.jsonb_typeof(metadata) = 'object'),
  CONSTRAINT chk_consent_retention_not_before_recorded CHECK (
    retention_until IS NULL OR retention_until >= recorded_at
  )
);
COMMENT ON COLUMN public.consent_records.legal_hold IS 'NULL means legal-hold status has not been assessed; do not interpret as no hold.';
CREATE INDEX idx_consent_records_user_recorded_at ON public.consent_records (user_id, recorded_at DESC);
CREATE INDEX idx_consent_records_key_version ON public.consent_records (consent_key, version, recorded_at DESC);
CREATE INDEX idx_consent_records_retention_queue ON public.consent_records (retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX idx_consent_records_legal_hold_queue ON public.consent_records (recorded_at) WHERE legal_hold IS TRUE;

-- User-submitted requests are owner-readable; only trusted workers advance state.
-- idempotency_key must be reused by a client retry to avoid duplicate requests.
CREATE TABLE public.privacy_requests (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_type public.privacy_request_type NOT NULL,
  status public.privacy_request_status NOT NULL DEFAULT 'requested'::public.privacy_request_status,
  idempotency_key UUID NOT NULL,
  completion_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  completed_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN DEFAULT NULL,
  CONSTRAINT uq_privacy_requests_user_idempotency UNIQUE (user_id, idempotency_key),
  CONSTRAINT chk_privacy_requests_completion_metadata CHECK (pg_catalog.jsonb_typeof(completion_metadata) = 'object'),
  CONSTRAINT chk_privacy_requests_failure_code CHECK (failure_code IS NULL OR pg_catalog.char_length(pg_catalog.btrim(failure_code)) BETWEEN 1 AND 100),
  CONSTRAINT chk_privacy_requests_completed_at CHECK (
    (status = 'completed'::public.privacy_request_status AND completed_at IS NOT NULL)
    OR (status <> 'completed'::public.privacy_request_status AND completed_at IS NULL)
  ),
  CONSTRAINT chk_privacy_requests_retention_not_before_creation CHECK (
    retention_until IS NULL OR retention_until >= created_at
  )
);
COMMENT ON COLUMN public.privacy_requests.legal_hold IS 'NULL means legal-hold status has not been assessed; do not interpret as no hold.';
CREATE INDEX idx_privacy_requests_user_created_at ON public.privacy_requests (user_id, created_at DESC);
CREATE INDEX idx_privacy_requests_status_created_at ON public.privacy_requests (status, created_at ASC);
CREATE INDEX idx_privacy_requests_retention_queue ON public.privacy_requests (retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX idx_privacy_requests_legal_hold_queue ON public.privacy_requests (created_at) WHERE legal_hold IS TRUE;

-- Append-only audit facts. actor_id is nulled on Auth deletion and target_id is
-- deliberately not an FK, so relevant history survives deletion of the target.
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  correlation_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN DEFAULT NULL,
  CONSTRAINT chk_audit_events_action CHECK (pg_catalog.char_length(pg_catalog.btrim(action)) BETWEEN 1 AND 160),
  CONSTRAINT chk_audit_events_target_type CHECK (target_type IS NULL OR pg_catalog.char_length(pg_catalog.btrim(target_type)) BETWEEN 1 AND 100),
  CONSTRAINT chk_audit_events_metadata_object CHECK (pg_catalog.jsonb_typeof(metadata) = 'object'),
  CONSTRAINT chk_audit_events_retention_not_before_creation CHECK (
    retention_until IS NULL OR retention_until >= created_at
  )
);
COMMENT ON COLUMN public.audit_events.legal_hold IS 'NULL means legal-hold status has not been assessed; do not interpret as no hold.';
CREATE INDEX idx_audit_events_actor_created_at ON public.audit_events (actor_id, created_at DESC);
CREATE INDEX idx_audit_events_target_created_at ON public.audit_events (target_type, target_id, created_at DESC);
CREATE INDEX idx_audit_events_action_created_at ON public.audit_events (action, created_at DESC);
CREATE UNIQUE INDEX uq_audit_events_correlation_id ON public.audit_events (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_audit_events_retention_queue ON public.audit_events (retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX idx_audit_events_legal_hold_queue ON public.audit_events (created_at) WHERE legal_hold IS TRUE;

-- Shared updated-at trigger was introduced in P2-01.
CREATE OR REPLACE FUNCTION private.guard_report_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.reporter_id IS NULL OR NEW.reported_user_id IS NULL THEN
    RAISE EXCEPTION 'A report requires a reporter and a reported account'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.reporter_id = NEW.reported_user_id THEN
    RAISE EXCEPTION 'A user cannot report their own account'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_report_submission() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.guard_report_submission() TO authenticated, service_role;
CREATE TRIGGER trg_reports_guard_submission
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION private.guard_report_submission();

CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER trg_moderation_cases_updated_at BEFORE UPDATE ON public.moderation_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
CREATE TRIGGER trg_entitlements_updated_at BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

CREATE OR REPLACE FUNCTION private.guard_privacy_request_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Referential-action anonymization is allowed when account deletion nulls the
  -- owning profile FK and leaves every other field unchanged.
  IF OLD.user_id IS NOT NULL AND NEW.user_id IS NULL
     AND (pg_catalog.to_jsonb(NEW) - 'user_id' - 'updated_at') =
         (pg_catalog.to_jsonb(OLD) - 'user_id' - 'updated_at') THEN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
  END IF;

  IF current_user::TEXT COLLATE "C" NOT IN ('service_role'::TEXT COLLATE "C", 'postgres'::TEXT COLLATE "C", 'supabase_admin'::TEXT COLLATE "C") THEN
    RAISE EXCEPTION 'Privacy request progress is worker-controlled'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.request_type IS DISTINCT FROM OLD.request_type
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Privacy request identity fields are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'requested'::public.privacy_request_status AND NEW.status IN (
        'in_progress'::public.privacy_request_status, 'failed'::public.privacy_request_status,
        'cancelled'::public.privacy_request_status
      ))
      OR (OLD.status = 'in_progress'::public.privacy_request_status AND NEW.status IN (
        'completed'::public.privacy_request_status, 'failed'::public.privacy_request_status,
        'cancelled'::public.privacy_request_status
      ))
      OR (OLD.status = 'failed'::public.privacy_request_status AND NEW.status = 'in_progress'::public.privacy_request_status)
    ) THEN
      RAISE EXCEPTION 'Invalid privacy request status transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'completed'::public.privacy_request_status AND NEW.completed_at IS NULL THEN
    NEW.completed_at := pg_catalog.now();
  ELSIF NEW.status <> 'completed'::public.privacy_request_status THEN
    NEW.completed_at := NULL;
  END IF;
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_privacy_request_transition() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_privacy_request_transition() TO service_role;
CREATE TRIGGER trg_privacy_requests_guard_transition
  BEFORE UPDATE ON public.privacy_requests
  FOR EACH ROW EXECUTE FUNCTION private.guard_privacy_request_transition();

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
    ) THEN
      RAISE EXCEPTION 'Invalid payment event status transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_payment_event_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_payment_event_update() TO service_role;
CREATE TRIGGER trg_payment_events_guard_update
  BEFORE UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION private.guard_payment_event_update();

CREATE OR REPLACE FUNCTION private.prevent_audit_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Auth deletion may clear the FK but must not change any stored audit/consent
  -- fact. This anonymization update is distinct from editing the record.
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME::TEXT COLLATE "C" = 'audit_events'::TEXT COLLATE "C"
     AND (pg_catalog.to_jsonb(OLD) ->> 'actor_id') IS NOT NULL
     AND (pg_catalog.to_jsonb(NEW) ->> 'actor_id') IS NULL
     AND (pg_catalog.to_jsonb(NEW) - 'actor_id') = (pg_catalog.to_jsonb(OLD) - 'actor_id') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME::TEXT COLLATE "C" = 'consent_records'::TEXT COLLATE "C"
     AND (pg_catalog.to_jsonb(OLD) ->> 'user_id') IS NOT NULL
     AND (pg_catalog.to_jsonb(NEW) ->> 'user_id') IS NULL
     AND (pg_catalog.to_jsonb(NEW) - 'user_id') = (pg_catalog.to_jsonb(OLD) - 'user_id') THEN
    RETURN NEW;
  END IF;

  IF current_user::TEXT COLLATE "C" IN ('postgres'::TEXT COLLATE "C", 'supabase_admin'::TEXT COLLATE "C") THEN
    -- Only privileged database maintenance may purge records after a reviewed
    -- retention decision; application and service roles remain append-only.
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Stored evidence is immutable for application roles'
    USING ERRCODE = '42501';
END;
$function$;
REVOKE ALL ON FUNCTION private.prevent_audit_event_mutation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_audit_event_mutation();

-- RLS is mandatory for each public relation, even where client access is absent.
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.reports, public.moderation_cases, public.subscriptions, public.entitlements,
  public.payment_events, public.consent_records, public.privacy_requests, public.audit_events
FROM PUBLIC, anon, authenticated;

-- Reporter can create and read only their own report. No client moderation actions.
GRANT SELECT ON public.reports TO authenticated;
GRANT INSERT (reporter_id, reported_user_id, category, context_summary)
  ON public.reports TO authenticated;
GRANT SELECT, INSERT ON public.reports TO service_role;
GRANT UPDATE (status, severity, retention_until, legal_hold) ON public.reports TO service_role;
CREATE POLICY reports_select_reporter
  ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()));
CREATE POLICY reports_insert_reporter
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()) AND reported_user_id IS DISTINCT FROM (SELECT auth.uid()));

-- Moderation cases never appear in the client API.
GRANT SELECT, INSERT, UPDATE ON public.moderation_cases TO service_role;

-- Subscriptions are owner-readable; only trusted reconciliation may change state.
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO service_role;
CREATE POLICY subscriptions_select_owner
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Users may read current entitlements but cannot mint or revoke them.
GRANT SELECT ON public.entitlements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.entitlements TO service_role;
CREATE POLICY entitlements_select_owner
  ON public.entitlements FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Payment events are server-only; only processing fields may be updated by the
-- trusted server role. Provider id/resource/user/amount/currency facts are fixed.
GRANT SELECT, INSERT ON public.payment_events TO service_role;
GRANT UPDATE (status, provider_verified, processed_at, retention_until, legal_hold)
  ON public.payment_events TO service_role;

-- Consent events are append-only and owner-readable. Account deletion nulls the
-- subject FK so a policy/legal retention decision can happen without dangling PII.
GRANT SELECT ON public.consent_records TO authenticated;
GRANT INSERT (user_id, consent_key, version, choice, source, metadata)
  ON public.consent_records TO authenticated;
GRANT SELECT, INSERT ON public.consent_records TO service_role;
CREATE POLICY consent_records_select_owner
  ON public.consent_records FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY consent_records_insert_owner
  ON public.consent_records FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE TRIGGER trg_consent_records_immutable
  BEFORE UPDATE OR DELETE ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION private.prevent_audit_event_mutation();

-- Privacy requests can be submitted/re-read by their owner; workflow state and
-- result metadata are writable only by trusted server workers.
GRANT SELECT ON public.privacy_requests TO authenticated;
GRANT INSERT (user_id, request_type, idempotency_key) ON public.privacy_requests TO authenticated;
GRANT SELECT, INSERT ON public.privacy_requests TO service_role;
GRANT UPDATE (status, completion_metadata, failure_code, completed_at, retention_until, legal_hold)
  ON public.privacy_requests TO service_role;
CREATE POLICY privacy_requests_select_owner
  ON public.privacy_requests FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY privacy_requests_insert_owner
  ON public.privacy_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'requested'::public.privacy_request_status);

-- Audit trail is service-readable and append-only; no client role has table access.
GRANT SELECT, INSERT ON public.audit_events TO service_role;
