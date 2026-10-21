BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = public, extensions, pg_temp;
SELECT plan(131);

-- P2-05 owns fixture IDs 0051-0120. All rows are synthetic and the transaction
-- rolls back, including the intentionally under-age candidate used to prove
-- the feed still filters defensively if legacy/bad data ever exists.
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
SELECT ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0'))::UUID,
       'authenticated', 'authenticated', 'p205-user-' || g || '@example.test',
       pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.generate_series(51, 120) AS series(g);

INSERT INTO public.profiles
  (id, display_name, birth_date, verification_status, is_discoverable, is_suspended)
SELECT ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0'))::UUID,
       'P5 User ' || g,
       DATE '1990-01-01',
       CASE WHEN g = 53 THEN 'not_started'::public.verification_state
            ELSE 'verified'::public.verification_state END,
       g <> 54,
       g = 55
  FROM pg_catalog.generate_series(51, 120) AS series(g);

-- The normal schema blocks under-age profiles. Temporarily disabling only that
-- trigger in this rollback-only test lets us confirm the feed independently
-- excludes any legacy/bypassed under-age row; it is re-enabled immediately.
ALTER TABLE public.profiles DISABLE TRIGGER trg_profiles_02_birth_date_18_plus;
UPDATE public.profiles SET birth_date = DATE '2012-01-01'
 WHERE id = '00000000-0000-0000-0000-000000000056';
ALTER TABLE public.profiles ENABLE TRIGGER trg_profiles_02_birth_date_18_plus;

UPDATE public.profiles SET birth_date = DATE '1992-07-02'
 WHERE id = '00000000-0000-0000-0000-000000000052';
UPDATE public.profiles SET created_at = pg_catalog.now() + INTERVAL '1 second'
 WHERE id = '00000000-0000-0000-0000-000000000052';
UPDATE public.profiles SET birth_date = DATE '1970-01-01'
 WHERE id = '00000000-0000-0000-0000-000000000060';

INSERT INTO public.user_preferences (user_id, min_age, max_age, max_distance_km)
VALUES ('00000000-0000-0000-0000-000000000051', 30, 40, 100);
INSERT INTO public.profile_photos (user_id, storage_path, position)
VALUES ('00000000-0000-0000-0000-000000000052',
        '00000000-0000-0000-0000-000000000052/p205-primary.jpg', 0);
-- P3-02 feed eligibility: three answered prompts and at least two photos.
UPDATE public.profiles
   SET city_region = 'Manila',
       prompts = '[{"key":"weekend","question":"A perfect weekend looks like","answer":"a"},{"key":"values","question":"What I value most","answer":"b"},{"key":"relationship_goal","question":"The relationship I hope to build","answer":"c"}]'::JSONB
 WHERE id BETWEEN '00000000-0000-0000-0000-000000000051' AND '00000000-0000-0000-0000-000000000120';
INSERT INTO public.profile_photos (user_id, storage_path, position)
SELECT ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0'))::UUID,
       '00000000-0000-0000-0000-' || pg_catalog.lpad(g::TEXT, 12, '0') || '/p302-' || n || '.jpg',
       CASE WHEN g = 52 THEN n ELSE n - 1 END
  FROM pg_catalog.generate_series(51, 120) AS series(g)
 CROSS JOIN pg_catalog.generate_series(1, 2) AS photos(n);
-- The discovery RPC requires the private Storage objects to exist and match photo metadata.
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
SELECT 'profile_photos', ph.storage_path, ph.user_id::TEXT, '{"mimetype":"image/jpeg","size":1024}'::JSONB
  FROM public.profile_photos ph
 WHERE ph.user_id BETWEEN '00000000-0000-0000-0000-000000000051'::UUID AND '00000000-0000-0000-0000-000000000120'::UUID
ON CONFLICT DO NOTHING;
INSERT INTO public.blocks (blocker_id, blocked_id) VALUES
 ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000057'),
 ('00000000-0000-0000-0000-000000000058', '00000000-0000-0000-0000-000000000051');
INSERT INTO public.swipes (actor_id, target_id, direction)
VALUES ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000059', 'pass');
INSERT INTO public.entitlements (user_id, entitlement_key, status, valid_from, valid_until)
VALUES ('00000000-0000-0000-0000-000000000077', 'p205-test-premium', 'active',
        pg_catalog.now() - INTERVAL '1 hour', pg_catalog.now() + INTERVAL '1 hour');

-- A separate pair is used to test reciprocal matching, block, and unblock.
-- The moderation case is associated with a different synthetic reporter so it
-- does not count against user 0051's report rate-limit fixture.
INSERT INTO public.reports (reporter_id, reported_user_id, category, context_summary)
VALUES ('00000000-0000-0000-0000-000000000098', '00000000-0000-0000-0000-000000000099',
        'safety', 'p205-moderation-case');
INSERT INTO public.moderation_cases (report_id, status)
SELECT r.id, 'open'::public.moderation_case_status
  FROM public.reports AS r
 WHERE r.context_summary::TEXT COLLATE "C" = 'p205-moderation-case'::TEXT COLLATE "C";

-- Function catalog/security contract: exists, SECURITY mode, search path, owner, and no PUBLIC/anon EXECUTE.
SELECT ok(pg_catalog.to_regprocedure('public.get_discovery_feed(integer,timestamp with time zone)') IS NOT NULL, 'get_discovery_feed exists');
SELECT ok((SELECT prosecdef = TRUE FROM pg_catalog.pg_proc WHERE oid = 'public.get_discovery_feed(integer,timestamp with time zone)'::REGPROCEDURE), 'get_discovery_feed SECURITY mode is intentional');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.unnest(p.proconfig) AS cfg(setting) WHERE p.oid = 'public.get_discovery_feed(integer,timestamp with time zone)'::REGPROCEDURE AND cfg.setting::TEXT COLLATE "C" = 'search_path=public, pg_temp'::TEXT COLLATE "C"), 'get_discovery_feed fixes search_path');
SELECT ok((SELECT p.proowner = (SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname::TEXT COLLATE "C" = 'postgres'::TEXT COLLATE "C") FROM pg_catalog.pg_proc AS p WHERE p.oid = 'public.get_discovery_feed(integer,timestamp with time zone)'::REGPROCEDURE), 'get_discovery_feed owner is postgres');
SELECT ok(NOT pg_catalog.has_function_privilege('anon', 'public.get_discovery_feed(integer,timestamp with time zone)', 'EXECUTE') AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl WHERE p.oid = 'public.get_discovery_feed(integer,timestamp with time zone)'::REGPROCEDURE AND acl.grantee = 0 AND acl.privilege_type::TEXT COLLATE "C" = 'EXECUTE'::TEXT COLLATE "C"), 'get_discovery_feed is not executable by anon or PUBLIC');
SELECT ok(pg_catalog.to_regprocedure('public.has_active_entitlement(uuid)') IS NOT NULL, 'has_active_entitlement exists');
SELECT ok((SELECT prosecdef = FALSE FROM pg_catalog.pg_proc WHERE oid = 'public.has_active_entitlement(uuid)'::REGPROCEDURE), 'has_active_entitlement SECURITY mode is intentional');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.unnest(p.proconfig) AS cfg(setting) WHERE p.oid = 'public.has_active_entitlement(uuid)'::REGPROCEDURE AND cfg.setting::TEXT COLLATE "C" = 'search_path=public, pg_temp'::TEXT COLLATE "C"), 'has_active_entitlement fixes search_path');
SELECT ok((SELECT p.proowner = (SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname::TEXT COLLATE "C" = 'postgres'::TEXT COLLATE "C") FROM pg_catalog.pg_proc AS p WHERE p.oid = 'public.has_active_entitlement(uuid)'::REGPROCEDURE), 'has_active_entitlement owner is postgres');
SELECT ok(NOT pg_catalog.has_function_privilege('anon', 'public.has_active_entitlement(uuid)', 'EXECUTE') AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl WHERE p.oid = 'public.has_active_entitlement(uuid)'::REGPROCEDURE AND acl.grantee = 0 AND acl.privilege_type::TEXT COLLATE "C" = 'EXECUTE'::TEXT COLLATE "C"), 'has_active_entitlement is not executable by anon or PUBLIC');
SELECT ok(pg_catalog.to_regprocedure('public.record_swipe(uuid,public.swipe_direction)') IS NOT NULL, 'record_swipe exists');
SELECT ok((SELECT prosecdef = TRUE FROM pg_catalog.pg_proc WHERE oid = 'public.record_swipe(uuid,public.swipe_direction)'::REGPROCEDURE), 'record_swipe SECURITY mode is intentional');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.unnest(p.proconfig) AS cfg(setting) WHERE p.oid = 'public.record_swipe(uuid,public.swipe_direction)'::REGPROCEDURE AND cfg.setting::TEXT COLLATE "C" = 'search_path=public, pg_temp'::TEXT COLLATE "C"), 'record_swipe fixes search_path');
SELECT ok((SELECT p.proowner = (SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname::TEXT COLLATE "C" = 'postgres'::TEXT COLLATE "C") FROM pg_catalog.pg_proc AS p WHERE p.oid = 'public.record_swipe(uuid,public.swipe_direction)'::REGPROCEDURE), 'record_swipe owner is postgres');
SELECT ok(NOT pg_catalog.has_function_privilege('anon', 'public.record_swipe(uuid,public.swipe_direction)', 'EXECUTE') AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl WHERE p.oid = 'public.record_swipe(uuid,public.swipe_direction)'::REGPROCEDURE AND acl.grantee = 0 AND acl.privilege_type::TEXT COLLATE "C" = 'EXECUTE'::TEXT COLLATE "C"), 'record_swipe is not executable by anon or PUBLIC');
SELECT ok(pg_catalog.to_regprocedure('public.block_user(uuid)') IS NOT NULL, 'block_user exists');
SELECT ok((SELECT prosecdef = TRUE FROM pg_catalog.pg_proc WHERE oid = 'public.block_user(uuid)'::REGPROCEDURE), 'block_user SECURITY mode is intentional');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.unnest(p.proconfig) AS cfg(setting) WHERE p.oid = 'public.block_user(uuid)'::REGPROCEDURE AND cfg.setting::TEXT COLLATE "C" = 'search_path=public, pg_temp'::TEXT COLLATE "C"), 'block_user fixes search_path');
SELECT ok((SELECT p.proowner = (SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname::TEXT COLLATE "C" = 'postgres'::TEXT COLLATE "C") FROM pg_catalog.pg_proc AS p WHERE p.oid = 'public.block_user(uuid)'::REGPROCEDURE), 'block_user owner is postgres');
SELECT ok(NOT pg_catalog.has_function_privilege('anon', 'public.block_user(uuid)', 'EXECUTE') AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl WHERE p.oid = 'public.block_user(uuid)'::REGPROCEDURE AND acl.grantee = 0 AND acl.privilege_type::TEXT COLLATE "C" = 'EXECUTE'::TEXT COLLATE "C"), 'block_user is not executable by anon or PUBLIC');
SELECT ok(pg_catalog.to_regprocedure('public.unblock_user(uuid)') IS NOT NULL, 'unblock_user exists');
SELECT ok((SELECT prosecdef = TRUE FROM pg_catalog.pg_proc WHERE oid = 'public.unblock_user(uuid)'::REGPROCEDURE), 'unblock_user SECURITY mode is intentional');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.unnest(p.proconfig) AS cfg(setting) WHERE p.oid = 'public.unblock_user(uuid)'::REGPROCEDURE AND cfg.setting::TEXT COLLATE "C" = 'search_path=public, pg_temp'::TEXT COLLATE "C"), 'unblock_user fixes search_path');
SELECT ok((SELECT p.proowner = (SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname::TEXT COLLATE "C" = 'postgres'::TEXT COLLATE "C") FROM pg_catalog.pg_proc AS p WHERE p.oid = 'public.unblock_user(uuid)'::REGPROCEDURE), 'unblock_user owner is postgres');
SELECT ok(NOT pg_catalog.has_function_privilege('anon', 'public.unblock_user(uuid)', 'EXECUTE') AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl WHERE p.oid = 'public.unblock_user(uuid)'::REGPROCEDURE AND acl.grantee = 0 AND acl.privilege_type::TEXT COLLATE "C" = 'EXECUTE'::TEXT COLLATE "C"), 'unblock_user is not executable by anon or PUBLIC');
SELECT ok(pg_catalog.to_regprocedure('public.submit_report(uuid,public.report_category,text)') IS NOT NULL, 'submit_report exists');
SELECT ok((SELECT prosecdef = TRUE FROM pg_catalog.pg_proc WHERE oid = 'public.submit_report(uuid,public.report_category,text)'::REGPROCEDURE), 'submit_report SECURITY mode is intentional');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.unnest(p.proconfig) AS cfg(setting) WHERE p.oid = 'public.submit_report(uuid,public.report_category,text)'::REGPROCEDURE AND cfg.setting::TEXT COLLATE "C" = 'search_path=public, pg_temp'::TEXT COLLATE "C"), 'submit_report fixes search_path');
SELECT ok((SELECT p.proowner = (SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname::TEXT COLLATE "C" = 'postgres'::TEXT COLLATE "C") FROM pg_catalog.pg_proc AS p WHERE p.oid = 'public.submit_report(uuid,public.report_category,text)'::REGPROCEDURE), 'submit_report owner is postgres');
SELECT ok(NOT pg_catalog.has_function_privilege('anon', 'public.submit_report(uuid,public.report_category,text)', 'EXECUTE') AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl WHERE p.oid = 'public.submit_report(uuid,public.report_category,text)'::REGPROCEDURE AND acl.grantee = 0 AND acl.privilege_type::TEXT COLLATE "C" = 'EXECUTE'::TEXT COLLATE "C"), 'submit_report is not executable by anon or PUBLIC');
SELECT ok(pg_catalog.to_regprocedure('public.request_privacy_action(public.privacy_request_type,uuid)') IS NOT NULL, 'request_privacy_action exists');
SELECT ok((SELECT prosecdef = TRUE FROM pg_catalog.pg_proc WHERE oid = 'public.request_privacy_action(public.privacy_request_type,uuid)'::REGPROCEDURE), 'request_privacy_action SECURITY mode is intentional');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.unnest(p.proconfig) AS cfg(setting) WHERE p.oid = 'public.request_privacy_action(public.privacy_request_type,uuid)'::REGPROCEDURE AND cfg.setting::TEXT COLLATE "C" = 'search_path=public, pg_temp'::TEXT COLLATE "C"), 'request_privacy_action fixes search_path');
SELECT ok((SELECT p.proowner = (SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname::TEXT COLLATE "C" = 'postgres'::TEXT COLLATE "C") FROM pg_catalog.pg_proc AS p WHERE p.oid = 'public.request_privacy_action(public.privacy_request_type,uuid)'::REGPROCEDURE), 'request_privacy_action owner is postgres');
SELECT ok(NOT pg_catalog.has_function_privilege('anon', 'public.request_privacy_action(public.privacy_request_type,uuid)', 'EXECUTE') AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl WHERE p.oid = 'public.request_privacy_action(public.privacy_request_type,uuid)'::REGPROCEDURE AND acl.grantee = 0 AND acl.privilege_type::TEXT COLLATE "C" = 'EXECUTE'::TEXT COLLATE "C"), 'request_privacy_action is not executable by anon or PUBLIC');
SELECT ok(pg_catalog.to_regprocedure('public.moderation_transition_case(uuid,public.moderation_case_status,text)') IS NOT NULL, 'moderation_transition_case exists');
SELECT ok((SELECT prosecdef = TRUE FROM pg_catalog.pg_proc WHERE oid = 'public.moderation_transition_case(uuid,public.moderation_case_status,text)'::REGPROCEDURE), 'moderation_transition_case SECURITY mode is intentional');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.unnest(p.proconfig) AS cfg(setting) WHERE p.oid = 'public.moderation_transition_case(uuid,public.moderation_case_status,text)'::REGPROCEDURE AND cfg.setting::TEXT COLLATE "C" = 'search_path=public, pg_temp'::TEXT COLLATE "C"), 'moderation_transition_case fixes search_path');
SELECT ok((SELECT p.proowner = (SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname::TEXT COLLATE "C" = 'postgres'::TEXT COLLATE "C") FROM pg_catalog.pg_proc AS p WHERE p.oid = 'public.moderation_transition_case(uuid,public.moderation_case_status,text)'::REGPROCEDURE), 'moderation_transition_case owner is postgres');
SELECT ok(NOT pg_catalog.has_function_privilege('anon', 'public.moderation_transition_case(uuid,public.moderation_case_status,text)', 'EXECUTE') AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl WHERE p.oid = 'public.moderation_transition_case(uuid,public.moderation_case_status,text)'::REGPROCEDURE AND acl.grantee = 0 AND acl.privilege_type::TEXT COLLATE "C" = 'EXECUTE'::TEXT COLLATE "C"), 'moderation_transition_case is not executable by anon or PUBLIC');

-- Anon cannot execute any RPC, even with otherwise valid argument shapes.
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';
SELECT throws_ok($$SELECT * FROM public.get_discovery_feed()$$, '42501', NULL, 'anon cannot call get_discovery_feed');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000052', 'like')$$, '42501', NULL, 'anon cannot call record_swipe');
SELECT throws_ok($$SELECT public.has_active_entitlement('00000000-0000-0000-0000-000000000051')$$, '42501', NULL, 'anon cannot call has_active_entitlement');
SELECT throws_ok($$SELECT public.block_user('00000000-0000-0000-0000-000000000052')$$, '42501', NULL, 'anon cannot call block_user');
SELECT throws_ok($$SELECT public.unblock_user('00000000-0000-0000-0000-000000000052')$$, '42501', NULL, 'anon cannot call unblock_user');
SELECT throws_ok($$SELECT public.submit_report('00000000-0000-0000-0000-000000000052', 'safety', NULL)$$, '42501', NULL, 'anon cannot call submit_report');
SELECT throws_ok($$SELECT public.request_privacy_action('export', 'f0000000-0000-0000-0000-000000000001')$$, '42501', NULL, 'anon cannot call request_privacy_action');
SELECT throws_ok($$SELECT public.moderation_transition_case('00000000-0000-0000-0000-000000000001', 'in_review', NULL)$$, '42501', NULL, 'anon cannot call moderation_transition_case');
RESET ROLE;
RESET "request.jwt.claims";

-- Discovery feed exposes only the safe projection and correctly filters candidates.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}';
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc AS p
  CROSS JOIN LATERAL pg_catalog.unnest(p.proargnames) AS arg(name)
  WHERE p.oid = 'public.get_discovery_feed(integer,timestamp with time zone)'::REGPROCEDURE
    AND arg.name::TEXT COLLATE "C" = 'birth_date'::TEXT COLLATE "C"
), 'discovery function output does not expose birth_date');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000051'$$, 'feed excludes caller');
SELECT is((SELECT age FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000052'), 34, 'feed computes age server-side');
SELECT is((SELECT primary_photo_path::TEXT COLLATE "C" FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000052'), '00000000-0000-0000-0000-000000000052/p205-primary.jpg'::TEXT COLLATE "C", 'feed returns only photo object path projection');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000053'$$, 'feed excludes unverified candidates');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000054'$$, 'feed excludes undiscoverable candidates');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000055'$$, 'feed excludes suspended candidates');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000056'$$, 'feed excludes under-age candidates defensively');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000057'$$, 'feed excludes a target blocked by caller');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000058'$$, 'feed excludes a caller blocked by target');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000059'$$, 'feed excludes previously swiped targets');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000060'$$, 'feed respects caller age preferences');
SELECT is((SELECT count(*)::INTEGER FROM public.get_discovery_feed(0, NULL)), 1, 'feed clamps minimum limit to one');
SELECT is((SELECT count(*)::INTEGER FROM public.get_discovery_feed(1000, NULL)), 50, 'feed clamps maximum limit to fifty');
RESET ROLE;
UPDATE public.profiles SET is_discoverable = FALSE WHERE id = '00000000-0000-0000-0000-000000000051';
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.get_discovery_feed()$$, '42501', 'actor_not_eligible', 'ineligible caller cannot obtain discovery feed');
RESET ROLE;
UPDATE public.profiles SET is_discoverable = TRUE WHERE id = '00000000-0000-0000-0000-000000000051';
RESET "request.jwt.claims";

-- Entitlement checks are derived only from active, in-window rows and cannot be probed cross-user.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}';
SELECT is(public.has_active_entitlement('00000000-0000-0000-0000-000000000051'), FALSE, 'user without an entitlement is not premium');
SELECT is(public.has_active_entitlement('00000000-0000-0000-0000-000000000077'), FALSE, 'authenticated user cannot probe another account entitlement');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000077","role":"authenticated"}';
SELECT is(public.has_active_entitlement('00000000-0000-0000-0000-000000000077'), TRUE, 'active in-window entitlement is recognized');
RESET ROLE;
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claims" = '{"role":"service_role"}';
SELECT is(public.has_active_entitlement('00000000-0000-0000-0000-000000000077'), TRUE, 'service_role can check another account without an Auth subject');
RESET ROLE;
RESET "request.jwt.claims";

-- Caller eligibility, target eligibility, self/duplicate/block checks, and pass/quota accounting.
UPDATE public.profiles SET verification_status = 'not_started' WHERE id = '00000000-0000-0000-0000-000000000051';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000061', 'like')$$, '42501', 'actor_not_eligible', 'unverified actor cannot swipe');
RESET ROLE;
UPDATE public.profiles SET verification_status = 'verified', is_discoverable = FALSE WHERE id = '00000000-0000-0000-0000-000000000051';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000061', 'like')$$, '42501', 'actor_not_eligible', 'undiscoverable actor cannot swipe');
RESET ROLE;
UPDATE public.profiles SET is_discoverable = TRUE, is_suspended = TRUE WHERE id = '00000000-0000-0000-0000-000000000051';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000061', 'like')$$, '42501', 'actor_not_eligible', 'suspended actor cannot swipe');
RESET ROLE;
UPDATE public.profiles SET is_suspended = FALSE WHERE id = '00000000-0000-0000-0000-000000000051';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000053', 'like')$$, '42501', 'target_not_eligible', 'unverified target cannot be swiped');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000054', 'like')$$, '42501', 'target_not_eligible', 'undiscoverable target cannot be swiped');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000055', 'like')$$, '42501', 'target_not_eligible', 'suspended target cannot be swiped');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000056', 'like')$$, '42501', 'target_not_eligible', 'under-age target cannot be swiped');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000051', 'like')$$, '23514', 'Self-swipes are not allowed', 'self-swipe is rejected');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000057', 'like')$$, '42501', 'blocked_pair', 'swipe is rejected when caller blocked target');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000058', 'like')$$, '42501', 'blocked_pair', 'swipe is rejected when target blocked caller');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.daily_swipe_quotas WHERE user_id = '00000000-0000-0000-0000-000000000051' AND quota_date = (pg_catalog.now() AT TIME ZONE 'UTC')::DATE), 'failed swipes do not create a quota row');
SELECT lives_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000052', 'pass')$$, 'pass succeeds without consuming a like');
SELECT is((SELECT COALESCE((SELECT q.likes_used FROM public.daily_swipe_quotas q WHERE q.user_id = '00000000-0000-0000-0000-000000000051' AND q.quota_date = (pg_catalog.now() AT TIME ZONE 'UTC')::DATE), 0)), 0, 'pass does not increment daily likes');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000052', 'like')$$, '23505', 'duplicate_swipe_direction_mismatch', 'conflicting duplicate swipe is rejected cleanly (same-direction retries are idempotent, see 0008)');
RESET ROLE;
RESET "request.jwt.claims";

-- Seed fourteen likes through the authenticated RPC; the 15th returns zero remaining and the 16th fails cleanly.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}';
SELECT lives_ok($$SELECT COUNT(*) FROM pg_catalog.generate_series(61, 74) AS g(n) CROSS JOIN LATERAL public.record_swipe(('00000000-0000-0000-0000-' || pg_catalog.lpad(g.n::TEXT, 12, '0'))::UUID, 'like')$$, 'fourteen likes succeed before free daily limit');
SELECT is((SELECT COUNT(*)::INTEGER FROM public.swipes WHERE actor_id = '00000000-0000-0000-0000-000000000051' AND target_id BETWEEN '00000000-0000-0000-0000-000000000061'::UUID AND '00000000-0000-0000-0000-000000000074'::UUID AND direction = 'like'), 14, 'fourteen initial like rows were committed');
SELECT is((SELECT likes_remaining FROM public.record_swipe('00000000-0000-0000-0000-000000000075', 'like')), 0, '15th free like succeeds with zero remaining');
SELECT throws_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000076', 'like')$$, 'P0001', 'quota_exceeded', '16th free like raises quota_exceeded');
SELECT is((SELECT likes_used FROM public.daily_swipe_quotas WHERE user_id = '00000000-0000-0000-0000-000000000051' AND quota_date = (pg_catalog.now() AT TIME ZONE 'UTC')::DATE), 15, 'daily quota counter stops at fifteen');
SELECT is((SELECT COUNT(*)::INTEGER FROM public.swipes WHERE actor_id = '00000000-0000-0000-0000-000000000051' AND target_id BETWEEN '00000000-0000-0000-0000-000000000061'::UUID AND '00000000-0000-0000-0000-000000000076'::UUID AND direction = 'like'), 15, 'exactly fifteen quota-limited likes persisted');
RESET ROLE;
RESET "request.jwt.claims";

-- Paid account makes sixteen likes without consuming a free quota row.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000077","role":"authenticated"}';
SELECT lives_ok($$SELECT COUNT(*) FROM pg_catalog.generate_series(78, 93) AS g(n) CROSS JOIN LATERAL public.record_swipe(('00000000-0000-0000-0000-' || pg_catalog.lpad(g.n::TEXT, 12, '0'))::UUID, 'like')$$, 'entitled user can like more than fifteen profiles');
SELECT is((SELECT COUNT(*)::INTEGER FROM public.swipes WHERE actor_id = '00000000-0000-0000-0000-000000000077' AND direction = 'like'), 16, 'entitled user persisted sixteen likes');
SELECT is((SELECT COUNT(*)::INTEGER FROM public.daily_swipe_quotas WHERE user_id = '00000000-0000-0000-0000-000000000077' AND quota_date = (pg_catalog.now() AT TIME ZONE 'UTC')::DATE), 0, 'entitled user bypasses the free quota row');
RESET ROLE;
RESET "request.jwt.claims";

-- Reciprocal like still relies on the existing 0002 trigger for one canonical match/conversation.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000094","role":"authenticated"}';
SELECT is((SELECT matched FROM public.record_swipe('00000000-0000-0000-0000-000000000095', 'like')), FALSE, 'first like is not yet a mutual match');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000095","role":"authenticated"}';
SELECT is((SELECT matched FROM public.record_swipe('00000000-0000-0000-0000-000000000094', 'like')), TRUE, 'reciprocal like returns matched true');
SELECT is((SELECT COUNT(*)::INTEGER FROM public.matches WHERE user_a_id = '00000000-0000-0000-0000-000000000094' AND user_b_id = '00000000-0000-0000-0000-000000000095' AND status = 'active'), 1, 'reciprocal like creates exactly one active canonical match');
SELECT is((SELECT COUNT(*)::INTEGER FROM public.conversations c JOIN public.matches m ON m.id = c.match_id WHERE m.user_a_id = '00000000-0000-0000-0000-000000000094' AND m.user_b_id = '00000000-0000-0000-0000-000000000095'), 1, 'reciprocal like creates exactly one conversation');
RESET ROLE;
SELECT is((SELECT COUNT(*)::INTEGER FROM public.conversation_participants cp JOIN public.conversations c ON c.id = cp.conversation_id JOIN public.matches m ON m.id = c.match_id WHERE m.user_a_id = '00000000-0000-0000-0000-000000000094' AND m.user_b_id = '00000000-0000-0000-0000-000000000095'), 2, 'match has exactly two participants');
RESET "request.jwt.claims";

-- block_user is idempotent; existing block triggers end the match; unblock never restores it.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000094","role":"authenticated"}';
SELECT is(public.block_user('00000000-0000-0000-0000-000000000095'), '00000000-0000-0000-0000-000000000095'::UUID, 'block_user returns target id');
SELECT is(public.block_user('00000000-0000-0000-0000-000000000095'), '00000000-0000-0000-0000-000000000095'::UUID, 'block_user is idempotent');
SELECT throws_ok($$SELECT public.block_user('00000000-0000-0000-0000-000000000094')$$, '23514', 'invalid_block_target', 'block_user rejects self-block');
SELECT is(public.block_user('00000000-0000-0000-0000-000000000096'), '00000000-0000-0000-0000-000000000096'::UUID, 'block_user also blocks an un-swiped target');
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000096'$$, 'blocker cannot discover a previously un-swiped blocked target');
RESET ROLE;
SELECT is((SELECT COUNT(*)::INTEGER FROM public.audit_events WHERE actor_id = '00000000-0000-0000-0000-000000000094' AND action::TEXT COLLATE "C" = 'block.created'::TEXT COLLATE "C" AND target_id = '00000000-0000-0000-0000-000000000095'), 1, 'block_user writes one audit event despite retry');
SET LOCAL ROLE authenticated;
SELECT is((SELECT status::TEXT COLLATE "C" FROM public.matches WHERE user_a_id = '00000000-0000-0000-0000-000000000094' AND user_b_id = '00000000-0000-0000-0000-000000000095'), 'ended'::TEXT COLLATE "C", 'block ends active match');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000095","role":"authenticated"}';
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000094'$$, 'blocked target cannot discover blocker');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000096","role":"authenticated"}';
SELECT is_empty($$SELECT profile_id FROM public.get_discovery_feed() WHERE profile_id = '00000000-0000-0000-0000-000000000094'$$, 'target blocked by caller cannot discover caller before any swipe');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000095","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.messages (conversation_id, sender_id, body) SELECT c.id, auth.uid(), 'blocked sender' FROM public.conversations c JOIN public.matches m ON m.id = c.match_id WHERE m.user_a_id = '00000000-0000-0000-0000-000000000094' AND m.user_b_id = '00000000-0000-0000-0000-000000000095'$$, '42501', NULL, 'blocked target cannot message blocker');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000094","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.messages (conversation_id, sender_id, body) SELECT c.id, auth.uid(), 'blocked sender' FROM public.conversations c JOIN public.matches m ON m.id = c.match_id WHERE m.user_a_id = '00000000-0000-0000-0000-000000000094' AND m.user_b_id = '00000000-0000-0000-0000-000000000095'$$, '42501', NULL, 'blocker cannot message blocked target');
SELECT is(public.unblock_user('00000000-0000-0000-0000-000000000095'), TRUE, 'unblock_user removes caller-owned block');
SELECT is(public.unblock_user('00000000-0000-0000-0000-000000000095'), FALSE, 'unblock_user returns false when no block remains');
SELECT is((SELECT status::TEXT COLLATE "C" FROM public.matches WHERE user_a_id = '00000000-0000-0000-0000-000000000094' AND user_b_id = '00000000-0000-0000-0000-000000000095'), 'ended'::TEXT COLLATE "C", 'unblocking never restores the prior match');
RESET ROLE;
RESET "request.jwt.claims";

-- submit_report derives reporter from auth.uid, limits abuse, and leaves reads reporter-scoped.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}';
SELECT lives_ok($$SELECT public.submit_report('00000000-0000-0000-0000-000000000052', 'safety', 'p205-test-report')$$, 'caller can submit a report about another account');
SELECT is((SELECT COUNT(*)::INTEGER FROM public.reports WHERE reporter_id = '00000000-0000-0000-0000-000000000051' AND context_summary::TEXT COLLATE "C" = 'p205-test-report'::TEXT COLLATE "C"), 1, 'report reporter is derived from caller');
SELECT throws_ok($$SELECT public.submit_report('00000000-0000-0000-0000-000000000051', 'safety', 'self')$$, '23514', 'self_report_not_allowed', 'self-report is rejected');
SELECT throws_ok($$SELECT public.submit_report('00000000-0000-0000-0000-000000000052', 'safety', pg_catalog.repeat('x', 1001))$$, '22001', 'report_context_too_long', 'report context obeys existing 1000-character schema limit');
SELECT lives_ok($$SELECT COUNT(*) FROM pg_catalog.generate_series(1, 9) AS g(n) CROSS JOIN LATERAL public.submit_report('00000000-0000-0000-0000-000000000052', 'safety', 'p205-rate-' || g.n::TEXT)$$, 'nine more submissions reach but do not exceed the rate limit');
SELECT is((SELECT COUNT(*)::INTEGER FROM public.reports WHERE reporter_id = '00000000-0000-0000-0000-000000000051' AND created_at >= pg_catalog.now() - INTERVAL '24 hours'), 10, 'reporter can submit at most ten reports in 24 hours');
SELECT throws_ok($$SELECT public.submit_report('00000000-0000-0000-0000-000000000052', 'safety', 'p205-rate-limit')$$, 'P0001', 'report_rate_limited', '11th report is rejected by rate limit');
RESET ROLE;
SELECT is((SELECT COUNT(*)::INTEGER FROM public.audit_events WHERE actor_id = '00000000-0000-0000-0000-000000000051' AND action::TEXT COLLATE "C" = 'report.submitted'::TEXT COLLATE "C"), 10, 'each accepted report has an audit event');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000052","role":"authenticated"}';
SELECT is_empty($$SELECT id FROM public.reports WHERE reporter_id = '00000000-0000-0000-0000-000000000051'$$, 'other account cannot read reporter records');
RESET ROLE;
RESET "request.jwt.claims";

-- Privacy request retries are idempotent; one open request per user/type.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}';
SELECT is(public.request_privacy_action('export', 'f0000000-0000-0000-0000-000000000001'), public.request_privacy_action('export', 'f0000000-0000-0000-0000-000000000001'), 'same idempotency key returns the same request id');
SELECT throws_ok($$SELECT public.request_privacy_action('export', 'f0000000-0000-0000-0000-000000000002')$$, 'P0001', 'privacy_request_already_open', 'second open request of same type is rejected');
SELECT lives_ok($$SELECT public.request_privacy_action('deletion', 'f0000000-0000-0000-0000-000000000003')$$, 'different privacy request type may be opened');
RESET ROLE;
SELECT is((SELECT COUNT(*)::INTEGER FROM public.audit_events WHERE actor_id = '00000000-0000-0000-0000-000000000051' AND action::TEXT COLLATE "C" = 'privacy.requested'::TEXT COLLATE "C"), 2, 'new privacy requests write audit events only once');
RESET "request.jwt.claims";

-- Moderator transition: app_metadata is trusted; users and user_metadata cannot grant the role.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}';
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM public.moderation_cases WHERE report_id = (SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p205-moderation-case'::TEXT COLLATE "C")), 'in_review', 'normal user attempt')$$, '42501', 'moderator_required', 'normal user cannot transition a moderation case');
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000097","role":"authenticated","user_metadata":{"role":"moderator"}}';
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM public.moderation_cases WHERE report_id = (SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p205-moderation-case'::TEXT COLLATE "C")), 'in_review', 'user metadata must not grant role')$$, '42501', 'moderator_required', 'user_metadata cannot grant moderator privileges');
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000097","role":"authenticated","app_metadata":{"role":"moderator"}}';
SELECT lives_ok($$SELECT public.moderation_transition_case((SELECT id FROM public.moderation_cases WHERE report_id = (SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p205-moderation-case'::TEXT COLLATE "C")), 'in_review', 'triage started')$$, 'trusted moderator may move open case to in_review');
SELECT throws_ok($$SELECT public.moderation_transition_case((SELECT id FROM public.moderation_cases WHERE report_id = (SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p205-moderation-case'::TEXT COLLATE "C")), 'open', 'reverse transition')$$, '23514', 'invalid_moderation_transition', 'invalid moderation transition is rejected');
SELECT is((SELECT status::TEXT COLLATE "C" FROM public.moderation_cases WHERE report_id = (SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p205-moderation-case'::TEXT COLLATE "C")), 'in_review'::TEXT COLLATE "C", 'moderation state changed only to allowed status');
RESET ROLE;
SELECT is((SELECT COUNT(*)::INTEGER FROM public.audit_events WHERE actor_id = '00000000-0000-0000-0000-000000000097' AND action::TEXT COLLATE "C" = 'moderation.case_transition'::TEXT COLLATE "C"), 1, 'moderator transition is audited with the authenticated actor');
RESET "request.jwt.claims";

SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claims" = '{"role":"service_role"}';
SELECT lives_ok($$SELECT public.moderation_transition_case((SELECT id FROM public.moderation_cases WHERE report_id = (SELECT id FROM public.reports WHERE context_summary::TEXT COLLATE "C" = 'p205-moderation-case'::TEXT COLLATE "C")), 'resolved', 'service closure')$$, 'service_role may perform a system transition without an Auth subject');
RESET ROLE;
SELECT is((SELECT COUNT(*)::INTEGER FROM public.audit_events WHERE actor_id IS NULL AND action::TEXT COLLATE "C" = 'moderation.case_transition'::TEXT COLLATE "C" AND (metadata ->> 'actor_principal')::TEXT COLLATE "C" = 'service_role'::TEXT COLLATE "C"), 1, 'service-role transition is audited as a system principal');
RESET "request.jwt.claims";

-- A malicious temporary helper with the same unqualified name cannot shadow a SECURITY DEFINER RPC.
CREATE TEMP TABLE p205_temp_schema_bootstrap (value INTEGER);
CREATE FUNCTION pg_temp.lock_user_pair(p_user_one UUID, p_user_two UUID)
RETURNS VOID LANGUAGE plpgsql AS $temp_function$
BEGIN
  RAISE EXCEPTION 'search_path_hijack';
END;
$temp_function$;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000099","role":"authenticated"}';
SELECT lives_ok($$SELECT * FROM public.record_swipe('00000000-0000-0000-0000-000000000100', 'pass')$$, 'temporary shadow function cannot hijack schema-qualified SECURITY DEFINER helper call');
RESET ROLE;
RESET "request.jwt.claims";

SELECT * FROM finish();
ROLLBACK;
