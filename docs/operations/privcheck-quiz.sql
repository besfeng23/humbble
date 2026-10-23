-- privcheck-quiz: READ-ONLY single SELECT. Run on dev AFTER migration 20261023000070 is applied (SQL editor, as postgres).
-- One row per object; `detail` is a JSON document. Compare each row with the EXPECTED block below; any difference is drift.
-- Covers: table privileges per role, RLS + policy count, relacl PUBLIC entries, function owner / SECURITY DEFINER /
-- search_path / EXECUTE grants, the private rate table, and the pg_cron job (guarded: it reports "pg_cron NOT installed"
-- instead of failing where the extension does not exist).
--
-- EXPECTED
--   table public.quiz_events:        owner postgres, rls_enabled true, policies 0, public_acl_entries 0,
--                                    anon "-", authenticated "-", service_role "SELECT"
--   table private.quiz_event_rate:   owner postgres, rls_enabled true, policies 0, public_acl_entries 0,
--                                    anon "-", authenticated "-", service_role "-"
--   function public.record_quiz_event(uuid,text,integer,text,text,text,text,text,text):
--                                    security_definer true, search_path ["search_path=\"\""], anon true, authenticated true,
--                                    service_role false, public_execute false
--   function public.purge_quiz_events(integer,integer,integer,integer):       security_definer true, search_path pinned,
--                                    anon false, authenticated false, service_role true, public_execute false
--   function public.quiz_funnel_summary(timestamptz,timestamptz):             same as purge
--   functions private.quiz_event_*:  anon/authenticated/service_role false (private schema is not exposed), public_execute false
--   cron purge-quiz-events:          one row, schedule "17 3 * * *", command "SELECT public.purge_quiz_events(90)", active true
--                                    (or "pg_cron NOT installed": then the purge is NOT scheduled; see docs/operations/quiz-funnel-events.md)
SELECT kind, object, detail FROM (
  SELECT 1 AS ord, 'table' AS kind, c.oid::regclass::text AS object,
         jsonb_build_object(
           'owner', pg_get_userbyid(c.relowner),
           'rls_enabled', c.relrowsecurity,
           'rls_forced', c.relforcerowsecurity,
           'policies', (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid),
           'public_acl_entries', (SELECT count(*) FROM aclexplode(c.relacl) x WHERE x.grantee = 0),
           'anon', (SELECT coalesce(string_agg(p, ',' ORDER BY p), '-') FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege('anon', c.oid, p)),
           'authenticated', (SELECT coalesce(string_agg(p, ',' ORDER BY p), '-') FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege('authenticated', c.oid, p)),
           'service_role', (SELECT coalesce(string_agg(p, ',' ORDER BY p), '-') FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege('service_role', c.oid, p)),
           'columns', (SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ', ' ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped)
         ) AS detail
    FROM pg_class c
   WHERE c.oid IN (to_regclass('public.quiz_events'), to_regclass('private.quiz_event_rate'))
  UNION ALL
  SELECT 2, 'function', p.oid::regprocedure::text,
         jsonb_build_object(
           'owner', pg_get_userbyid(p.proowner),
           'security_definer', p.prosecdef,
           'search_path', to_jsonb(p.proconfig),
           'volatility', p.provolatile,
           'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
           'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
           'service_role', has_function_privilege('service_role', p.oid, 'EXECUTE'),
           'public_execute', EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE')
         )
    FROM pg_proc p
   WHERE (p.pronamespace = 'public'::regnamespace AND p.proname IN ('record_quiz_event', 'purge_quiz_events', 'quiz_funnel_summary'))
      OR (p.pronamespace = 'private'::regnamespace AND p.proname LIKE 'quiz\_event\_%')
  UNION ALL
  SELECT 3, 'cron', 'purge-quiz-events',
         CASE WHEN to_regclass('cron.job') IS NULL
              THEN jsonb_build_object('pg_cron', 'NOT installed: the 90-day purge is NOT scheduled')
              ELSE coalesce(
                     (xpath('/row/j/text()', query_to_xml(
                        'SELECT coalesce(jsonb_agg(to_jsonb(j)), ''[]''::jsonb)::text AS j FROM (SELECT jobid, jobname, schedule, command, active, database, username FROM cron.job WHERE jobname = ''purge-quiz-events'') j',
                        false, true, '')))[1]::text::jsonb,
                     '[]'::jsonb)
         END
) r
ORDER BY ord, object;
