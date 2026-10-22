-- Let authenticated members read (and therefore sign URLs for) the profile photos
-- of other members they are allowed to see. Previously the only SELECT policy on
-- profile_photos storage objects was owner-scoped, so discovery cards and profile
-- pages for other people always rendered "Photo unavailable".
--
-- Visibility mirrors the discovery eligibility rules in get_discovery_feed /
-- record_swipe plus the permanent block/exclusion model:
--   * viewer is authenticated, is not the owner (owner access stays on the owner policy)
--   * no block in either direction, no permanent pair exclusion, viewer has not reported owner
--   * owner is not suspended and is 18+
--   * AND either the pair has an active match, OR the owner is discovery-visible
--     (verified, discoverable, not incognito) and the viewer is themselves
--     discovery-eligible (verified, discoverable, not suspended, 18+)
--   * the object must be backed by a profile_photos metadata row owned by the object owner
-- anon receives no policy and no EXECUTE, so photos stay unreadable without a session.

CREATE OR REPLACE FUNCTION private.can_read_profile_photo_object(p_object_name TEXT, p_object_owner TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH viewer AS (SELECT (SELECT auth.uid()) AS id),
  photo AS (
    SELECT ph.user_id
      FROM public.profile_photos ph
     WHERE ph.storage_path::TEXT COLLATE "C" = p_object_name::TEXT COLLATE "C"
       AND ph.user_id::TEXT COLLATE "C" = p_object_owner::TEXT COLLATE "C"
       AND (pg_catalog.string_to_array(p_object_name, '/'))[1] COLLATE "C" = ph.user_id::TEXT COLLATE "C"
     LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
      FROM photo, viewer, public.profiles owner_profile
     WHERE viewer.id IS NOT NULL
       AND owner_profile.id = photo.user_id
       AND photo.user_id <> viewer.id
       AND NOT owner_profile.is_suspended
       AND owner_profile.birth_date <= ((pg_catalog.now() AT TIME ZONE 'UTC')::DATE - INTERVAL '18 years')::DATE
       AND NOT EXISTS (SELECT 1 FROM public.blocks b
                        WHERE (b.blocker_id = viewer.id AND b.blocked_id = photo.user_id)
                           OR (b.blocker_id = photo.user_id AND b.blocked_id = viewer.id))
       AND NOT private.is_pair_excluded(viewer.id, photo.user_id)
       AND NOT EXISTS (SELECT 1 FROM public.reports r
                        WHERE r.reporter_id = viewer.id AND r.reported_user_id = photo.user_id)
       AND (
         EXISTS (SELECT 1 FROM public.matches m
                  WHERE m.user_a_id = LEAST(viewer.id, photo.user_id)
                    AND m.user_b_id = GREATEST(viewer.id, photo.user_id)
                    AND m.status = 'active'::public.match_status)
         OR (
           owner_profile.verification_status = 'verified'::public.verification_state
           AND owner_profile.is_discoverable AND NOT owner_profile.is_incognito
           AND EXISTS (SELECT 1 FROM public.profiles actor
                        WHERE actor.id = viewer.id
                          AND actor.verification_status = 'verified'::public.verification_state
                          AND actor.is_discoverable AND NOT actor.is_suspended
                          AND actor.birth_date <= ((pg_catalog.now() AT TIME ZONE 'UTC')::DATE - INTERVAL '18 years')::DATE)
         )
       )
  );
$function$;
ALTER FUNCTION private.can_read_profile_photo_object(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.can_read_profile_photo_object(TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.can_read_profile_photo_object(TEXT, TEXT) TO authenticated;

DROP POLICY IF EXISTS p2_13_profile_photos_select_visible ON storage.objects;
CREATE POLICY p2_13_profile_photos_select_visible ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id::TEXT COLLATE "C" = 'profile_photos'::TEXT COLLATE "C"
  AND private.can_read_profile_photo_object(name::TEXT, owner_id::TEXT)
);
