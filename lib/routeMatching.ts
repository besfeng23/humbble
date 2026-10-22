const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isConversationId(value: unknown): boolean {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * The (tabs)/(chats)/[conversationId] route sits at the URL root because route
 * groups are transparent, so any unknown path like /nonexistent-route matches it.
 * Treat such a match as an unknown URL instead of a chat that needs sign-in.
 */
export function isUnknownUrlMatch(segments: readonly string[], conversationId: unknown): boolean {
  return segments[segments.length - 1] === '[conversationId]' && !isConversationId(conversationId);
}
