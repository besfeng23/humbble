-- privcheck4: READ-ONLY single SELECT. Run on dev/prod AFTER migration 20261023000090 is applied (and before, to see drift).
-- Rows: (1) table_acl   one per public table x API role holding anything: table-level privileges | column-level privileges | TRUNCATE guard state
--       (2) function_acl one per new billing RPC (six, incl. billing_purge_readbacks): which API roles can EXECUTE (NULL if the function does not exist)
--       (3) old_fn       must read 'absent' (the 7-argument caller-trusting billing_apply_readback is dropped)
--       (4) default_acl  default privileges for objects created by postgres in schema public (must show no anon/authenticated/service_role entry)
-- Compare against docs/operations/privilege-hardening.md ("Expected catalog state"). Any difference means a later migration or manual GRANT changed it.
SELECT section, name, detail FROM (
  SELECT 1 AS o, 'table_acl' AS section, c.relname::text || ' / ' || r.rolname::text AS name,
         coalesce((SELECT string_agg(DISTINCT p.privilege_type, ',' ORDER BY p.privilege_type) FROM aclexplode(c.relacl) p WHERE p.grantee = r.oid), '-')
         || ' | ' ||
         coalesce((SELECT string_agg(p.privilege_type || ':' || a.attname, ',' ORDER BY p.privilege_type, a.attname) FROM pg_attribute a, aclexplode(a.attacl) p WHERE a.attrelid = c.oid AND a.attacl IS NOT NULL AND p.grantee = r.oid), '-')
         || ' | guard=' || coalesce((SELECT string_agg(g.tgenabled::text, ',') FROM pg_trigger g WHERE g.tgrelid = c.oid AND g.tgname = 'trg_' || c.relname || '_no_truncate'), 'none') AS detail
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN pg_roles r
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND r.rolname IN ('anon','authenticated','service_role')
     AND (EXISTS (SELECT 1 FROM aclexplode(c.relacl) p WHERE p.grantee = r.oid)
          OR EXISTS (SELECT 1 FROM pg_attribute a, aclexplode(a.attacl) p WHERE a.attrelid = c.oid AND a.attacl IS NOT NULL AND p.grantee = r.oid))
  UNION ALL
  SELECT 2, 'function_acl', f.sig,
         CASE WHEN to_regprocedure(f.sig) IS NULL THEN 'MISSING'
              ELSE 'anon=' || has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE')::text
                || ' authenticated=' || has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE')::text
                || ' service_role=' || has_function_privilege('service_role', to_regprocedure(f.sig), 'EXECUTE')::text END
    FROM (VALUES ('public.billing_apply_readback(uuid)'), ('public.billing_record_readback(text,text,text,timestamptz,numeric,text,uuid)'),
                 ('public.billing_record_refund_readback(text,text,uuid)'), ('public.billing_list_pending_provider_cancels(text,integer)'),
                 ('public.billing_record_provider_cancel(text,text)'), ('public.billing_purge_readbacks(interval)')) f(sig)
  UNION ALL
  SELECT 3, 'old_fn', 'billing_apply_readback(7 args)',
         CASE WHEN to_regprocedure('public.billing_apply_readback(text,text,public.subscription_status,timestamptz,numeric,text,uuid)') IS NULL THEN 'absent' ELSE 'PRESENT (caller-trusting version still installed)' END
  UNION ALL
  SELECT 4, 'default_acl', pg_get_userbyid(d.defaclrole)::text || ' in ' || coalesce(d.defaclnamespace::regnamespace::text, 'all schemas') || ' objtype=' || d.defaclobjtype::text,
         coalesce((SELECT string_agg(pg_get_userbyid(x.grantee) || '=' || x.privilege_type, ',' ORDER BY x.grantee, x.privilege_type) FROM aclexplode(d.defaclacl) x
                    WHERE pg_get_userbyid(x.grantee) IN ('anon','authenticated','service_role')), 'no API-role entries')
    FROM pg_default_acl d WHERE d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace = 0
) s ORDER BY o, name;
