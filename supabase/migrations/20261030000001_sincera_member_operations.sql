-- Additive Sincera Preview member operations. Does not alter Bubble Live.
-- Distinct from the existing private push delivery queue; notifications exist
-- even when a member has disabled push notifications.
CREATE TABLE public.notification_events (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('match','message')),
  source_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT notification_events_unique UNIQUE (recipient_id, kind, source_id)
);
CREATE INDEX notification_events_member_feed ON public.notification_events(recipient_id, created_at DESC);
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notification_events TO authenticated;
CREATE POLICY notification_events_own_select ON public.notification_events FOR SELECT TO authenticated
  USING (recipient_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.mark_my_notification_read(p_notification_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $body$
DECLARE v_actor UUID := auth.uid(); v_count INTEGER;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  UPDATE public.notification_events
    SET read_at = COALESCE(read_at, pg_catalog.now())
    WHERE id = p_notification_id AND recipient_id = v_actor;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$body$;
ALTER FUNCTION public.mark_my_notification_read(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_my_notification_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_my_notification_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION private.record_match_inbox_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $body$
BEGIN
  IF NEW.status <> 'active' OR EXISTS (
    SELECT 1 FROM public.blocks b WHERE
    (b.blocker_id=NEW.user_a_id AND b.blocked_id=NEW.user_b_id)
    OR (b.blocker_id=NEW.user_b_id AND b.blocked_id=NEW.user_a_id)
  ) OR private.is_pair_excluded(NEW.user_a_id, NEW.user_b_id)
  THEN RETURN NEW; END IF;
  INSERT INTO public.notification_events(recipient_id,kind,source_id)
  VALUES (NEW.user_a_id,'match',NEW.id),(NEW.user_b_id,'match',NEW.id)
  ON CONFLICT (recipient_id,kind,source_id) DO NOTHING;
  RETURN NEW;
END;
$body$;
ALTER FUNCTION private.record_match_inbox_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.record_match_inbox_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_sincera_match_inbox AFTER INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION private.record_match_inbox_event();

CREATE OR REPLACE FUNCTION private.record_message_inbox_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $body$
DECLARE v_a UUID; v_b UUID; v_state public.match_status; v_recipient UUID;
BEGIN
  SELECT m.user_a_id,m.user_b_id,m.status INTO v_a,v_b,v_state
    FROM public.conversations c JOIN public.matches m ON m.id=c.match_id
    WHERE c.id=NEW.conversation_id;
  IF v_state IS DISTINCT FROM 'active' OR NEW.sender_id NOT IN (v_a,v_b)
    OR EXISTS (SELECT 1 FROM public.blocks b WHERE
      (b.blocker_id=v_a AND b.blocked_id=v_b)
      OR (b.blocker_id=v_b AND b.blocked_id=v_a))
    OR private.is_pair_excluded(v_a,v_b)
    THEN RETURN NEW;
  END IF;
  v_recipient := CASE WHEN NEW.sender_id=v_a THEN v_b ELSE v_a END;
  INSERT INTO public.notification_events(recipient_id,kind,source_id,conversation_id)
    VALUES (v_recipient,'message',NEW.id,NEW.conversation_id)
    ON CONFLICT (recipient_id,kind,source_id) DO NOTHING;
  RETURN NEW;
END;
$body$;
ALTER FUNCTION private.record_message_inbox_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.record_message_inbox_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_sincera_message_inbox AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.record_message_inbox_event();

-- Member support: authenticated submissions; never take caller-provided actor ID
-- or client-supplied verified email, and never permit public list access.
CREATE TABLE public.support_requests (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL CHECK (topic IN ('account','safety','billing','privacy','technical','other')),
  body TEXT NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(body)) BETWEEN 10 AND 4000),
  client_request_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','reviewing','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT support_requests_idempotency UNIQUE (user_id,client_request_id)
);
CREATE INDEX support_requests_member_date ON public.support_requests(user_id,created_at DESC);
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.support_requests TO authenticated;
CREATE POLICY support_requests_own_select ON public.support_requests FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.submit_support_request(p_topic TEXT,p_body TEXT,p_client_request_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $body$
DECLARE v_actor UUID := auth.uid(); v_existing UUID; v_id UUID;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  IF p_client_request_id IS NULL OR p_topic IS NULL OR p_topic NOT IN
    ('account','safety','billing','privacy','technical','other')
    OR p_body IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_body)) NOT BETWEEN 10 AND 4000
    THEN RAISE EXCEPTION 'invalid_support_request' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_existing FROM public.support_requests
    WHERE user_id=v_actor AND client_request_id=p_client_request_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  IF (SELECT pg_catalog.count(*) FROM public.support_requests
      WHERE user_id=v_actor AND created_at > pg_catalog.now() - INTERVAL '1 hour') >= 5
    THEN RAISE EXCEPTION 'support_rate_limited' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.support_requests (user_id,topic,body,client_request_id)
    VALUES (v_actor,p_topic,pg_catalog.btrim(p_body),p_client_request_id)
    ON CONFLICT (user_id,client_request_id) DO UPDATE
      SET client_request_id=EXCLUDED.client_request_id
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$body$;
ALTER FUNCTION public.submit_support_request(TEXT,TEXT,UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_support_request(TEXT,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_support_request(TEXT,TEXT,UUID) TO authenticated;

COMMENT ON TABLE public.notification_events IS 'Owner-readable activity only: event IDs, no message contents or private photos.';
COMMENT ON TABLE public.support_requests IS 'Member-only support submissions; no public guest access; operational responses require staff workflow.';
