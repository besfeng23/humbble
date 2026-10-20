-- FAKE DEVELOPMENT SEED — NOT PRODUCTION DATA. Local `supabase db reset` only. Never run against a hosted project.
-- Hosted projects must never receive this file. It contains only synthetic users and fixture data.
DO $seed_guard$
DECLARE
  v_addr INET := inet_server_addr();
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Refusing fake development seed outside the local postgres database (database=%)', current_database();
  ELSIF v_addr IS NULL THEN
    -- A local Unix-domain connection reports NULL; this is permitted.
    NULL;
  ELSIF family(v_addr) = 4 AND (
    v_addr <<= INET '127.0.0.0/8'
    OR v_addr <<= INET '172.16.0.0/12' -- common Docker bridge range for local Supabase
  ) THEN
    NULL;
  ELSIF family(v_addr) = 6 AND host(v_addr) = '::1' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Refusing fake development seed from non-local server address %', v_addr;
  END IF;
END;
$seed_guard$;

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000901', 'authenticated', 'authenticated', 'seed-01@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000902', 'authenticated', 'authenticated', 'seed-02@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000903', 'authenticated', 'authenticated', 'seed-03@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000904', 'authenticated', 'authenticated', 'seed-04@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000905', 'authenticated', 'authenticated', 'seed-05@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000906', 'authenticated', 'authenticated', 'seed-06@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000907', 'authenticated', 'authenticated', 'seed-07@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000908', 'authenticated', 'authenticated', 'seed-08@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000909', 'authenticated', 'authenticated', 'seed-09@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000910', 'authenticated', 'authenticated', 'seed-10@example.test', now(), now());

INSERT INTO public.profiles
  (id, display_name, birth_date, city_region, relationship_intention,
   shared_interests, verification_status, is_discoverable, is_suspended)
VALUES
  ('00000000-0000-0000-0000-000000000901', 'Seed Aster', DATE '1991-03-14', 'Metro Manila', 'serious_relationship', ARRAY['reading','hiking'], 'verified', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000000902', 'Seed Bayani', DATE '1993-04-10', 'Cebu', 'long_term_dating', ARRAY['cooking','travel'], 'verified', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000000903', 'Seed Cedar', DATE '1990-06-18', 'Davao', 'cultural_connection_and_dating', ARRAY['music','food'], 'verified', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000000904', 'Seed Dalisay', DATE '1995-01-12', 'Metro Manila', 'serious_relationship', ARRAY['films','walking'], 'verified', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000000905', 'Seed Elara', DATE '1988-11-20', 'Cebu', 'long_term_dating', ARRAY['gardening','books'], 'verified', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000000906', 'Seed Fern', DATE '1994-08-22', 'Iloilo', 'cultural_connection_and_dating', ARRAY['art','coffee'], 'verified', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000000907', 'Seed Galen', DATE '1992-10-05', 'Metro Manila', 'serious_relationship', ARRAY['cycling','photography'], 'verified', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000000908', 'Seed Harbor', DATE '1997-09-13', 'Cebu', 'long_term_dating', ARRAY['beaches','food'], 'verified', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000000909', 'Seed Indigo', DATE '1993-03-03', 'Metro Manila', 'serious_relationship', ARRAY['music'], 'not_started', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000000910', 'Seed Juniper', DATE '1994-12-01', 'Cebu', 'cultural_connection_and_dating', ARRAY['reading'], 'verified', TRUE, TRUE);

INSERT INTO public.user_preferences (user_id, min_age, max_age, max_distance_km, preferred_intentions)
VALUES
  ('00000000-0000-0000-0000-000000000901', 25, 45, 100, ARRAY['serious_relationship','long_term_dating']::public.relationship_intention[]),
  ('00000000-0000-0000-0000-000000000902', 25, 45, 100, ARRAY['serious_relationship','long_term_dating']::public.relationship_intention[]),
  ('00000000-0000-0000-0000-000000000903', 25, 45, 100, ARRAY['cultural_connection_and_dating','long_term_dating']::public.relationship_intention[]),
  ('00000000-0000-0000-0000-000000000904', 25, 45, 100, ARRAY['serious_relationship']::public.relationship_intention[]),
  ('00000000-0000-0000-0000-000000000905', 25, 45, 100, ARRAY['long_term_dating']::public.relationship_intention[]),
  ('00000000-0000-0000-0000-000000000906', 25, 45, 100, ARRAY['cultural_connection_and_dating']::public.relationship_intention[]),
  ('00000000-0000-0000-0000-000000000907', 25, 45, 100, ARRAY['serious_relationship','cultural_connection_and_dating']::public.relationship_intention[]),
  ('00000000-0000-0000-0000-000000000908', 25, 45, 100, ARRAY['long_term_dating','cultural_connection_and_dating']::public.relationship_intention[]),
  ('00000000-0000-0000-0000-000000000909', 25, 45, 100, ARRAY['serious_relationship']::public.relationship_intention[]),
  ('00000000-0000-0000-0000-000000000910', 25, 45, 100, ARRAY['cultural_connection_and_dating']::public.relationship_intention[]);

-- Placeholder-only object paths for feed fixtures. No physical objects or storage.objects rows are created.
INSERT INTO public.profile_photos (user_id, storage_path, position)
VALUES
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000901/seed-placeholder.jpg', 0),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000902/seed-placeholder.jpg', 0),
  ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000903/seed-placeholder.jpg', 0),
  ('00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-000000000904/seed-placeholder.jpg', 0),
  ('00000000-0000-0000-0000-000000000905', '00000000-0000-0000-0000-000000000905/seed-placeholder.jpg', 0),
  ('00000000-0000-0000-0000-000000000906', '00000000-0000-0000-0000-000000000906/seed-placeholder.jpg', 0),
  ('00000000-0000-0000-0000-000000000907', '00000000-0000-0000-0000-000000000907/seed-placeholder.jpg', 0),
  ('00000000-0000-0000-0000-000000000908', '00000000-0000-0000-0000-000000000908/seed-placeholder.jpg', 0);

-- Two regular swipe inserts create one canonical mutual match and one conversation via existing triggers.
INSERT INTO public.swipes (actor_id, target_id, direction)
VALUES
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000902', 'like'),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000901', 'like');

INSERT INTO public.messages (conversation_id, sender_id, body)
SELECT c.id, x.sender_id, x.body
  FROM public.conversations AS c
  JOIN public.matches AS m ON m.id = c.match_id
 CROSS JOIN (VALUES
   ('00000000-0000-0000-0000-000000000901'::UUID, 'Seed greeting one.'::TEXT),
   ('00000000-0000-0000-0000-000000000902'::UUID, 'Seed greeting two.'::TEXT)
 ) AS x(sender_id, body)
 WHERE m.user_a_id = '00000000-0000-0000-0000-000000000901'
   AND m.user_b_id = '00000000-0000-0000-0000-000000000902';

INSERT INTO public.blocks (blocker_id, blocked_id)
VALUES ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000904');

INSERT INTO public.reports (reporter_id, reported_user_id, category, context_summary)
VALUES ('00000000-0000-0000-0000-000000000907', '00000000-0000-0000-0000-000000000909', 'safety', 'Synthetic development report; no real person or incident.');
