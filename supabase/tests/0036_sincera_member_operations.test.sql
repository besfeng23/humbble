BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(10);

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

SELECT * FROM finish();
ROLLBACK;
