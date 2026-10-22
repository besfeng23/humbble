-- Supabase advisor: RLS disabled on private.discovery_cursors and private.pair_exclusions.
-- Both tables are only read/written by SECURITY DEFINER functions owned by postgres
-- (public.get_discovery_feed, public.record_swipe, private.is_pair_excluded,
-- private.record_pair_exclusion_on_block, private.guard_swipe_pair). The table owner
-- bypasses RLS (no FORCE), so enabling RLS with no policies denies all direct client
-- access while leaving those functions unchanged.

ALTER TABLE private.discovery_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.pair_exclusions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.discovery_cursors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.pair_exclusions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE private.discovery_cursor_token_seq FROM PUBLIC, anon, authenticated;
