-- privcheck2: READ-ONLY single SELECT. Run on dev/prod AFTER migration 20261023000060 is applied.
-- One row per table; each *_has column lists the privileges (of SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER)
-- that role holds at TABLE level. *_update_cols lists columns on which UPDATE is granted by column-level ACL only.
-- Compare the result against EXPECTED below; any difference means drift (e.g. a blanket GRANT or different default ACLs).
SELECT t AS table_name,
  (SELECT coalesce(string_agg(p, ',' ORDER BY p), '-') FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege('service_role','public.'||t,p)) AS service_role_has,
  (SELECT coalesce(string_agg(p, ',' ORDER BY p), '-') FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege('authenticated','public.'||t,p)) AS authenticated_has,
  (SELECT coalesce(string_agg(p, ',' ORDER BY p), '-') FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p WHERE has_table_privilege('anon','public.'||t,p)) AS anon_has,
  (SELECT coalesce(string_agg(a.attname, ',' ORDER BY a.attname), '-') FROM pg_attribute a WHERE a.attrelid=('public.'||t)::regclass AND a.attnum>0 AND NOT a.attisdropped AND NOT has_table_privilege('service_role','public.'||t,'UPDATE') AND has_column_privilege('service_role','public.'||t,a.attnum,'UPDATE')) AS service_role_update_cols,
  (SELECT count(*) FROM pg_class c, LATERAL aclexplode(c.relacl) x WHERE c.oid=('public.'||t)::regclass AND x.grantee=0) AS public_acl_entries,
  (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid=('public.'||t)::regclass AND g.tgname=replace('trg_X_no_truncate','X',t) AND g.tgenabled='A') AS truncate_guard_enabled
FROM unnest(ARRAY['audit_events','consent_records','privacy_requests','subscriptions','entitlements','payment_events']) AS t
ORDER BY t;
