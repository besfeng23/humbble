BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(17);

SELECT is((SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('notification_events','support_requests') AND c.relrowsecurity),2,
  'new member tables enforce RLS');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname='public' AND tablename IN ('notification_events','support_requests')
  AND cmd='SELECT' AND roles='{authenticated}'),2,'each member table has a signed-in owner-only SELECT policy');
SELECT ok(has_table_privilege('authenticated','public.support_requests','SELECT'),'members can list their own support requests through RLS');
SELECT ok(NOT has_table_privilege('authenticated','public.support_requests','INSERT'),'member support inserts must use the validating RPC');
SELECT ok(has_table_privilege('authenticated','public.notification_events','SELECT'),'members can read their own activity through RLS');
SELECT ok(NOT has_table_privilege('authenticated','public.notification_events','UPDATE'),'member read receipts must use the validating RPC');
SELECT ok(NOT has_table_privilege('anon','public.support_requests','SELECT') AND NOT has_table_privilege('anon','public.notification_events','SELECT'),'guests cannot access member operations');
SELECT ok(has_function_privilege('authenticated','public.submit_support_request(text,text,uuid)','EXECUTE') AND
  has_function_privilege('authenticated','public.mark_my_notification_read(uuid)','EXECUTE'),'members may call only the reviewed write RPCs');
SELECT ok(NOT has_function_privilege('anon','public.submit_support_request(text,text,uuid)','EXECUTE') AND
  NOT has_function_privilege('anon','public.mark_my_notification_read(uuid)','EXECUTE'),'guests cannot execute member operations RPCs');
SELECT is((SELECT count(*)::integer FROM pg_trigger WHERE tgname IN ('trg_sincera_match_inbox','trg_sincera_message_inbox') AND NOT tgisinternal),2,
  'both match and message notification triggers exist');


-- Transaction-local fixtures for owner isolation; all data is rolled back.
INSERT INTO auth.users (id,aud,role,email,created_at,updated_at) VALUES
  ('00000000-0000-0000-0000-00000000f701','authenticated','authenticated','sincera-test-a@example.test',pg_catalog.now(),pg_catalog.now()),
  ('00000000-0000-0000-0000-00000000f702','authenticated','authenticated','sincera-test-b@example.test',pg_catalog.now(),pg_catalog.now());
INSERT INTO public.profiles (id,display_name,birth_date)
VALUES ('00000000-0000-0000-0000-00000000f701','Sincera Fixture A',DATE '1990-01-01'),
       ('00000000-0000-0000-0000-00000000f702','Sincera Fixture B',DATE '1990-01-01');
INSERT INTO public.notification_events(recipient_id,kind,source_id)
VALUES ('00000000-0000-0000-0000-00000000f701','match','00000000-0000-0000-0000-00000000f704');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000f701","role":"authenticated"}';
SELECT ok(public.submit_support_request('account','I need help accessing my account','00000000-0000-4000-8000-00000000f703') IS NOT NULL,
  'member can create an actual support ticket');
SELECT ok(public.submit_support_request('account','I need help accessing my account','00000000-0000-4000-8000-00000000f703') IS NOT NULL,
  'retry with same idempotency key returns a request without adding a duplicate');
SELECT is((SELECT count(*)::INTEGER FROM public.support_requests),1,'A sees only one ticket after a retry');
SELECT is((SELECT count(*)::INTEGER FROM public.notification_events),1,'A sees their own activity');

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000f702","role":"authenticated"}';
SELECT is((SELECT count(*)::INTEGER FROM public.support_requests),0,'B cannot read A support ticket');
SELECT is((SELECT count(*)::INTEGER FROM public.notification_events),0,'B cannot read A activity');
SELECT is(public.mark_my_notification_read((SELECT id FROM public.notification_events WHERE recipient_id='00000000-0000-0000-0000-00000000f702' LIMIT 1)),FALSE,
  'B cannot mark a foreign notification as read');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
