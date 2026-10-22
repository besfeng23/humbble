// Tracks which chat or match landing screen is currently on screen so a
// foreground alert for that same item is not shown on top of it.
type Focus = { conversationId: string | null; matchId: string | null };
const focus: Focus = { conversationId: null, matchId: null };

export type PushData = { type?: string; conversationId?: string; matchId?: string } | null | undefined;

export function setViewingConversation(conversationId: string | null): () => void {
  focus.conversationId = conversationId || null;
  return () => { if (focus.conversationId === conversationId) focus.conversationId = null; };
}

export function setViewingMatch(matchId: string | null): () => void {
  focus.matchId = matchId || null;
  return () => { if (focus.matchId === matchId) focus.matchId = null; };
}

export function shouldPresentForegroundNotification(data: PushData): boolean {
  if (data?.type === 'message' && data.conversationId && data.conversationId === focus.conversationId) return false;
  if (data?.type === 'match' && data.matchId && data.matchId === focus.matchId) return false;
  return true;
}

export function foregroundBehavior(data: PushData) {
  const show = shouldPresentForegroundNotification(data);
  return { shouldShowAlert: show, shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
}
