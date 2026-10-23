-- Privilege hardening for evidence / entitlement tables (Themis review of PR #35: N3, N4 and "Builder's noted gap").
-- Applies the payment_events pattern from 20261023000051 (revoke everything from PUBLIC, anon, authenticated and
-- service_role, then re-grant only what code needs) to:
--   * public.audit_events, public.consent_records, public.privacy_requests
--   * public.subscriptions, public.entitlements (service_role reduced to SELECT)
--   * public.payment_events (UPDATE column list narrowed from 5 to 4 columns: retention_until removed; N3)
-- and adds a statement-level BEFORE TRUNCATE guard (ENABLE ALWAYS) on audit_events, consent_records and payment_events.
--
-- Why: Supabase default privileges give service_role ALL (incl. DELETE, TRUNCATE, REFERENCES, TRIGGER) on new public
-- tables, and migrations 0003/0004 only revoked from PUBLIC/anon/authenticated. audit_events/consent_records had row
-- triggers for UPDATE/DELETE but TRUNCATE is not covered by row triggers, so a holder of the service-role key could wipe
-- the audit trail. subscriptions/entitlements were directly writable by service_role, bypassing billing_apply_readback.
--
-- Code-path enumeration (nothing legitimate loses a privilege):
--   * Every writer of these tables is a SECURITY DEFINER function owned by postgres (billing_record_event,
--     billing_finish_event, billing_flag_unresolved_event, billing_register_pending_subscription, billing_apply_readback,
--     request_privacy_action, submit_report, block_user, unblock_user, unmatch, moderation_transition_case). Owner
--     privileges are not affected by REVOKE ... FROM service_role.
--   * Edge Functions only call those RPCs, plus one SELECT on subscriptions (billingStore.latestSubscription). No Edge
--     Function writes any of these tables directly.
--   * Clients (authenticated) keep exactly: SELECT on all of them except audit_events; INSERT (cols) on consent_records
--     and privacy_requests. Re-granted verbatim below.
--   * Account deletion: FK actions (ON DELETE SET NULL on audit_events.actor_id, consent_records/privacy_requests/
--     payment_events/subscriptions.user_id; ON DELETE CASCADE on entitlements.user_id) are executed by PostgreSQL's
--     referential-integrity triggers with the privileges of the table owner (postgres), not service_role.
--   * Direct service_role writes that remain by design: INSERT on audit_events, consent_records, privacy_requests,
--     payment_events (append-only contract); column UPDATE on privacy_requests (workflow worker) and payment_events.
-- Idempotent: REVOKE/GRANT/CREATE OR REPLACE/DROP TRIGGER IF EXISTS. Does not touch data.

-- audit_events: append-only, service-readable. No client access. ---------------------------------------------------
REVOKE ALL ON TABLE public.audit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.audit_events TO service_role;

-- consent_records: owner-readable + owner-insertable (RLS) append-only evidence. -------------------------------------
REVOKE ALL ON TABLE public.consent_records FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.consent_records TO authenticated;
GRANT INSERT (user_id, consent_key, version, choice, source, metadata) ON public.consent_records TO authenticated;
GRANT SELECT, INSERT ON public.consent_records TO service_role;

-- privacy_requests: owner submits/reads; only trusted workers advance state (column-level UPDATE kept as designed). ----
REVOKE ALL ON TABLE public.privacy_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.privacy_requests TO authenticated;
GRANT INSERT (user_id, request_type, idempotency_key) ON public.privacy_requests TO authenticated;
GRANT SELECT, INSERT ON public.privacy_requests TO service_role;
GRANT UPDATE (status, completion_metadata, failure_code, completed_at, retention_until, legal_hold)
  ON public.privacy_requests TO service_role;

-- subscriptions / entitlements: state changes only through billing_register_pending_subscription / billing_apply_readback
-- (SECURITY DEFINER, owner postgres). service_role needs SELECT only (billingStore.latestSubscription, support reads). ---
REVOKE ALL ON TABLE public.subscriptions, public.entitlements FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.subscriptions, public.entitlements TO authenticated, service_role;

-- payment_events (N3): no code path updates this table directly as service_role (billing_finish_event and
-- billing_flag_unresolved_event are owner-run SECURITY DEFINER). retention_until is not written by any code or test as
-- service_role, so it is removed. status/provider_verified/processed_at/legal_hold stay because the existing pgTAP suites
-- (0003, 0022) exercise them as service_role; the guard trigger still enforces the state machine on status.
REVOKE ALL ON TABLE public.payment_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.payment_events TO service_role;
GRANT UPDATE (status, provider_verified, processed_at, legal_hold) ON public.payment_events TO service_role;

-- TRUNCATE guard (defence in depth; the privilege revocation above is the primary control) ---------------------------
-- Row triggers do not fire for TRUNCATE. This statement-level trigger refuses TRUNCATE for every role (ENABLE ALWAYS so
-- session_replication_role = replica does not bypass it). Reviewed maintenance that really must truncate has to
-- DISABLE the trigger explicitly (ALTER TABLE ... DISABLE TRIGGER), which is visible in the change record.
CREATE OR REPLACE FUNCTION private.prevent_evidence_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'TRUNCATE is not permitted on %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$function$;
ALTER FUNCTION private.prevent_evidence_truncate() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.prevent_evidence_truncate() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_audit_events_no_truncate ON public.audit_events;
CREATE TRIGGER trg_audit_events_no_truncate
  BEFORE TRUNCATE ON public.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION private.prevent_evidence_truncate();
ALTER TABLE public.audit_events ENABLE ALWAYS TRIGGER trg_audit_events_no_truncate;

DROP TRIGGER IF EXISTS trg_consent_records_no_truncate ON public.consent_records;
CREATE TRIGGER trg_consent_records_no_truncate
  BEFORE TRUNCATE ON public.consent_records
  FOR EACH STATEMENT EXECUTE FUNCTION private.prevent_evidence_truncate();
ALTER TABLE public.consent_records ENABLE ALWAYS TRIGGER trg_consent_records_no_truncate;

DROP TRIGGER IF EXISTS trg_payment_events_no_truncate ON public.payment_events;
CREATE TRIGGER trg_payment_events_no_truncate
  BEFORE TRUNCATE ON public.payment_events
  FOR EACH STATEMENT EXECUTE FUNCTION private.prevent_evidence_truncate();
ALTER TABLE public.payment_events ENABLE ALWAYS TRIGGER trg_payment_events_no_truncate;

-- ROLLBACK (manual; forward-fix preferred; never delete or truncate audit/consent/ledger rows):
--   1. Drop the guards (only if they block a reviewed operation):
--        DROP TRIGGER IF EXISTS trg_audit_events_no_truncate ON public.audit_events;
--        DROP TRIGGER IF EXISTS trg_consent_records_no_truncate ON public.consent_records;
--        DROP TRIGGER IF EXISTS trg_payment_events_no_truncate ON public.payment_events;
--        DROP FUNCTION IF EXISTS private.prevent_evidence_truncate();
--   2. Restore ONLY the privilege a legitimate workload proves it needs, e.g. a support tool that must write entitlements:
--        GRANT INSERT, UPDATE ON public.entitlements TO service_role;   -- widens the billing trust boundary; needs review
--      payment_events retention workflow: GRANT UPDATE (retention_until) ON public.payment_events TO service_role;
--      Previous (unsafe) state, NOT recommended: GRANT ALL ON public.audit_events, public.consent_records,
--      public.privacy_requests, public.subscriptions, public.entitlements TO service_role;
--   Client (authenticated) grants are unchanged by this migration, so no client rollback is needed.
