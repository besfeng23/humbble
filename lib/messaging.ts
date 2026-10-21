import type { GetConversationListRow, MessageRow, SendMessageArgs, SendMessageResult } from '@/lib/database.contracts';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGE_PAGE_SIZE = 40;
export type MessageCursor = { created_at: string; id: string };
export type ChatMessage = MessageRow & { client_message_id: string | null };
export type ConversationSummary = {
  id: string;
  matchId: string;
  counterpartId: string;
  counterpartName: string;
  lastMessageAt: string | null;
  lastMessage: string;
};
export function compareMessageCursor(a: MessageCursor, b: MessageCursor): number {
  const byTime = a.created_at.localeCompare(b.created_at);
  return byTime || a.id.localeCompare(b.id);
}
export function isAfterMessageCursor(message: MessageCursor, cursor: MessageCursor): boolean {
  return compareMessageCursor(message, cursor) > 0;
}
export function isBeforeMessageCursor(message: MessageCursor, cursor: MessageCursor): boolean {
  return compareMessageCursor(message, cursor) < 0;
}

export class MessagingError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.name = 'MessagingError'; this.code = code; }
}
function fail(message: string, code?: string): never { throw new MessagingError(message, code); }

export function validateMessage(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) fail('Write a message before sending.', 'message_empty');
  if (trimmed.length > MESSAGE_MAX_LENGTH) fail(`Messages must be ${MESSAGE_MAX_LENGTH} characters or fewer.`, 'message_too_long');
  return trimmed;
}

const SAFETY_WARNING_PATTERNS: readonly RegExp[] = [
  /\b(?:send\s+me\s+(?:money|cash|funds|load)|(?:money|cash)\s+transfer|wire\s+transfer|gift\s*cards?|crypto(?:currency)?|bitcoin|usdt|investment\s+opportunit(?:y|ies))\b/i,
  // Payment apps and wallets commonly used in money requests.
  /\b(?:g\s*-?cash|venmo|paypal|pay\s*maya|maya\s+wallet|cash\s*app|zelle|western\s+union|remittance|padala)\b/i,
  // Off-platform messaging apps.
  /\b(?:whats\s*app|telegram|signal|viber|wechat|kik|snap\s*chat|line\s+app)\b/i,
  /\b(?:move\s+(?:this\s+)?(?:chat|conversation)\s+off(?:line|\s+platform)|contact\s+me\s+off(?:line|\s+platform)|(?:text|call|message)\s+me\s+(?:at|on)\b)/i,
  /\b(?:my|send\s+your)\s+(?:bank|paypal|gcash)\s+(?:account|details|number)|send\s+your\s+(?:bank|paypal|gcash)\b/i,
  // Phone numbers: PH mobile (09xx / +639xx) or any run of 10+ digits with common separators.
  /(?:\+?63|\b0)\s*9\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/,
  /\+?\(?\d(?:[\s.()-]*\d){9,}/,
];

/** Client-side only heuristic. Never logs or transmits the message text. */
export function hasSafetyWarning(body: string): boolean {
  return SAFETY_WARNING_PATTERNS.some(pattern => pattern.test(body));
}

export async function loadConversationList(): Promise<ConversationSummary[]> {
  if (!isSupabaseConfigured) fail('Messaging is unavailable in this build.');
  const { data, error } = await supabase.rpc('get_conversation_list');
  if (error) fail('Could not load conversations.', error.code);
  const rows = (data ?? []) as GetConversationListRow[];
  return rows.map(row => ({
    id: row.conversation_id,
    matchId: row.match_id,
    counterpartId: row.counterpart_id,
    counterpartName: row.counterpart_name,
    lastMessageAt: row.last_message_at,
    lastMessage: row.last_message,
  }));
}

export async function loadMessages(conversationId: string, cursor?: MessageCursor | null, limit = MESSAGE_PAGE_SIZE): Promise<{ messages: ChatMessage[]; nextCursor: MessageCursor | null }> {
  if (!isSupabaseConfigured) fail('Messaging is unavailable in this build.');
  let query = supabase.from('messages').select('id,conversation_id,sender_id,body,created_at,client_message_id')
    .eq('conversation_id', conversationId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
  const { data, error } = await query;
  if (error) fail('Could not load messages.', error.code);
  const rows = (data ?? []) as ChatMessage[];
  const messages = rows.reverse();
  const oldest = messages[0];
  return { messages, nextCursor: rows.length === limit && oldest ? { created_at: oldest.created_at, id: oldest.id } : null };
}

export async function catchUpMessages(conversationId: string, newest?: MessageCursor | null): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured) return [];
  let query = supabase.from('messages').select('id,conversation_id,sender_id,body,created_at,client_message_id')
    .eq('conversation_id', conversationId).order('created_at', { ascending: Boolean(newest) })
    .order('id', { ascending: Boolean(newest) }).limit(100);
  if (newest) query = query.or(`created_at.gt.${newest.created_at},and(created_at.eq.${newest.created_at},id.gt.${newest.id})`);
  const { data, error } = await query;
  if (error) fail('Could not reconnect to messages.', error.code);
  const rows = (data ?? []) as ChatMessage[];
  return newest ? rows : rows.reverse();
}

export async function sendMessage(conversationId: string, body: string, clientMessageId: string): Promise<ChatMessage> {
  if (!isSupabaseConfigured) fail('Messaging is unavailable in this build.');
  const cleanBody = validateMessage(body);
  const args: SendMessageArgs = { p_conversation_id: conversationId, p_body: cleanBody, p_client_message_id: clientMessageId };
  const { data, error } = await supabase.rpc('send_message', args);
  if (error) fail(error.message.includes('conversation_not_sendable') ? 'This conversation is no longer available.' : 'Message could not be sent. Try again.', error.code);
  const row = data?.[0];
  if (!row) fail('The server did not confirm this message.');
  return row as SendMessageResult as ChatMessage;
}
