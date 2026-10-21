-- P3-04: server-backed, idempotent messaging and least-privilege user RPC access.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS client_message_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_sender_client_message_id
  ON public.messages(sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Direct client inserts cannot enforce idempotency; send_message is the only
-- authenticated client write path. Existing participant RLS continues to scope reads.
REVOKE INSERT ON TABLE public.messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.messages TO authenticated;

CREATE OR REPLACE FUNCTION public.send_message(
  p_conversation_id UUID,
  p_body TEXT,
  p_client_message_id UUID
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  sender_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ,
  client_message_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
-- RETURNS TABLE output names (id, sender_id, client_message_id, ...) would
-- otherwise be ambiguous with messages columns in ON CONFLICT.
#variable_conflict use_column
DECLARE
  v_sender UUID := auth.uid();
  v_body TEXT := pg_catalog.btrim(COALESCE(p_body, ''));
  v_existing public.messages%ROWTYPE;
BEGIN
  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_client_message_id IS NULL THEN
    RAISE EXCEPTION 'client_message_id_required' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(v_body) < 1 OR pg_catalog.char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'message_length_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT m.* INTO v_existing
    FROM public.messages m
   WHERE m.sender_id = v_sender AND m.client_message_id = p_client_message_id;
  IF FOUND THEN
    IF v_existing.conversation_id <> p_conversation_id OR v_existing.body <> v_body THEN
      RAISE EXCEPTION 'client_message_id_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.conversation_id, v_existing.sender_id,
      v_existing.body, v_existing.created_at, v_existing.client_message_id;
    RETURN;
  END IF;

  IF NOT private.can_send_message(p_conversation_id, v_sender) THEN
    RAISE EXCEPTION 'conversation_not_sendable' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.messages AS m (conversation_id, sender_id, body, client_message_id)
  VALUES (p_conversation_id, v_sender, v_body, p_client_message_id)
  ON CONFLICT (sender_id, client_message_id) WHERE client_message_id IS NOT NULL
  DO NOTHING
  RETURNING m.* INTO v_existing;

  -- Handles two simultaneous retries using the same idempotency key.
  IF NOT FOUND THEN
    SELECT m.* INTO v_existing FROM public.messages m
     WHERE m.sender_id = v_sender AND m.client_message_id = p_client_message_id;
    IF v_existing.conversation_id <> p_conversation_id OR v_existing.body <> v_body THEN
      RAISE EXCEPTION 'client_message_id_conflict' USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN QUERY SELECT v_existing.id, v_existing.conversation_id, v_existing.sender_id,
    v_existing.body, v_existing.created_at, v_existing.client_message_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_conversation_list()
RETURNS TABLE (
  conversation_id UUID,
  match_id UUID,
  counterpart_id UUID,
  counterpart_name TEXT,
  last_message_at TIMESTAMPTZ,
  last_message TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT c.id, c.match_id,
    CASE WHEN m.user_a_id = auth.uid() THEN m.user_b_id ELSE m.user_a_id END,
    COALESCE(other_profile.display_name, 'Humbble member'),
    latest.created_at,
    COALESCE(latest.body, 'Start a conversation')
  FROM public.conversation_participants cp
  JOIN public.conversations c ON c.id = cp.conversation_id
  JOIN public.matches m ON m.id = c.match_id AND m.status = 'active'::public.match_status
  JOIN public.profiles other_profile
    ON other_profile.id = CASE WHEN m.user_a_id = auth.uid() THEN m.user_b_id ELSE m.user_a_id END
  LEFT JOIN LATERAL (
    SELECT msg.body, msg.created_at FROM public.messages msg
    WHERE msg.conversation_id = c.id ORDER BY msg.created_at DESC, msg.id DESC LIMIT 1
  ) latest ON TRUE
  WHERE cp.user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = other_profile.id)
         OR (b.blocker_id = other_profile.id AND b.blocked_id = auth.uid())
    )
  ORDER BY latest.created_at DESC NULLS LAST, c.created_at DESC, c.id DESC;
$function$;

-- Function EXECUTE is otherwise PUBLIC by default. Never permit anon or
-- service_role to invoke end-user APIs as if they were authenticated clients.
REVOKE EXECUTE ON FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_discovery_feed(INTEGER, TIMESTAMPTZ) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_swipe(UUID, public.swipe_direction) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_swipe(UUID, public.swipe_direction) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.block_user(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.block_user(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.unblock_user(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.unblock_user(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_report(UUID, public.report_category, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_report(UUID, public.report_category, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_privacy_action(public.privacy_request_type, UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.request_privacy_action(public.privacy_request_type, UUID) TO authenticated;
-- moderation_transition_case keeps its P2-05 service_role grant: it explicitly
-- supports audited system transitions with no Auth subject (0005 test 129/130).
REVOKE EXECUTE ON FUNCTION public.moderation_transition_case(UUID, public.moderation_case_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderation_transition_case(UUID, public.moderation_case_status, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.send_message(UUID, TEXT, UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.send_message(UUID, TEXT, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_conversation_list() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_conversation_list() TO authenticated;

-- Realtime delivery remains subject to messages RLS. The client additionally
-- filters by conversation_id; a filter is not a substitute for RLS.
DO $publication$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END;
$publication$;
