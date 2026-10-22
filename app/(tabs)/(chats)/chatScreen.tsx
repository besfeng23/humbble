import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthGuard, ResponsiveNavHeader } from '@/components/layout';
import { FadeEdge } from '@/components/layout/FadeEdge';
import { MessageBubble } from '@/components/messaging/MessageBubble';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/lib/AuthProvider';
import { catchUpMessages, loadConversationList, loadMessages, sendMessage, validateMessage, type ChatMessage, type ConversationSummary, type MessageCursor } from '@/lib/messaging';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { setViewingConversation } from '@/lib/notificationFocus';

function makeClientMessageId(): string {
  // UUID v4 shape generated locally; the server's unique key makes retries idempotent.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  current.forEach(message => map.set(message.id, message));
  incoming.forEach(message => {
    if (message.client_message_id) {
      const optimistic = [...map.values()].find(item => item.client_message_id === message.client_message_id);
      if (optimistic) map.delete(optimistic.id);
    }
    map.set(message.id, message);
  });
  return [...map.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export default function ChatScreen() {
  const router = useRouter();
  const { conversationId: routeId, id: fallbackId } = useLocalSearchParams<{ conversationId?: string; id?: string }>();
  const conversationId = String(routeId ?? fallbackId ?? '');
  const { user } = useAuth();
  const palette = Colors[useColorScheme() ?? 'light'];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [canLoadOlder, setCanLoadOlder] = useState(false);
  const [clientMessageId, setClientMessageId] = useState(makeClientMessageId);
  const scrollRef = useRef<ScrollView>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // While this chat is open, foreground alerts for it are suppressed.
  useEffect(() => (conversationId ? setViewingConversation(conversationId) : undefined), [conversationId]);
  const newestCursor = useCallback((): MessageCursor | null => {
    const newest = messagesRef.current[messagesRef.current.length - 1];
    return newest ? { created_at: newest.created_at, id: newest.id } : null;
  }, []);

  const catchUp = useCallback(async () => {
    if (!conversationId || !user?.id || !isSupabaseConfigured) return;
    try {
      let cursor = newestCursor();
      const caughtUp: ChatMessage[] = [];
      // Drain catch-up pages so reconnecting after a long offline period does not stop at 100.
      for (let page = 0; page < 20; page++) {
        const rows = await catchUpMessages(conversationId, cursor);
        caughtUp.push(...rows);
        if (rows.length < 100) break;
        const last = rows[rows.length - 1];
        cursor = { created_at: last.created_at, id: last.id };
      }
      if (caughtUp.length) setMessages(current => mergeMessages(current, caughtUp));
    } catch {
      setError('Connection interrupted. New messages will retry when the connection returns.');
    }
  }, [conversationId, user?.id, newestCursor]);

  useEffect(() => {
    let active = true;
    if (conversationId && user?.id && isSupabaseConfigured) {
      void loadConversationList().then(rows => { if (active) setConversation(rows.find(row => row.id === conversationId) ?? null); }).catch(() => undefined);
    }
    if (!conversationId || !user?.id || !isSupabaseConfigured) {
      setLoading(false);
      setError('This conversation is unavailable.');
      return;
    }
    setLoading(true); setError('');
    void loadMessages(conversationId).then(page => {
      if (!active) return;
      setMessages(current => mergeMessages(current, page.messages));
      setCanLoadOlder(Boolean(page.nextCursor));
    }).catch(() => { if (active) setError('Messages could not be loaded. Check your connection and try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [conversationId, user?.id]);

  useEffect(() => {
    if (!conversationId || !user?.id || !isSupabaseConfigured) return;
    const channel = supabase.channel(`conversation:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, payload => {
        const row = payload.new as ChatMessage;
        if (row?.id && row.conversation_id === conversationId) setMessages(current => mergeMessages(current, [row]));
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') void catchUp();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setError('Reconnecting to messages…');
      });
    const appState = AppState.addEventListener('change', state => { if (state === 'active') void catchUp(); });
    return () => { appState.remove(); void supabase.removeChannel(channel); };
  }, [conversationId, user?.id, catchUp]);

  const loadOlder = async () => {
    if (loadingOlder || !messages.length) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0];
      const page = await loadMessages(conversationId, { created_at: oldest.created_at, id: oldest.id });
      setMessages(current => mergeMessages(page.messages, current));
      setCanLoadOlder(Boolean(page.nextCursor));
    } catch { setError('Earlier messages could not be loaded.'); }
    finally { setLoadingOlder(false); }
  };

  const onSend = async () => {
    if (sending) return;
    let clean: string;
    try { clean = validateMessage(draft); setDraftError(''); }
    catch (err) { setDraftError(err instanceof Error ? err.message : 'Message is invalid.'); return; }
    setSending(true);
    try {
      const sent = await sendMessage(conversationId, clean, clientMessageId);
      setMessages(current => mergeMessages(current, [sent]));
      setDraft(''); setClientMessageId(makeClientMessageId()); setDraftError(''); setError('');
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      // Keep clientMessageId unchanged: retrying the same send cannot create a duplicate.
      setDraftError(err instanceof Error ? err.message : 'Message could not be sent.');
    } finally { setSending(false); }
  };

  return <AuthGuard mode="protected" redirectTo="/auth/signin" testID="chatscreen-guard">
    <KeyboardAvoidingView testID="scr-16-chatscreen" style={[styles.root, { backgroundColor: palette.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ResponsiveNavHeader fadeEdge testID="scr-16-header" title={conversation?.counterpartName || 'Conversation'} subtitle="Free messaging for mutual matches" showBack fallbackHref="/(tabs)/(chats)" rightSlot={<Pressable testID="scr-16-shield-btn" accessibilityRole="button" accessibilityLabel="Safety: block, report, or unmatch" hitSlop={8} onPress={() => router.push({ pathname: '/(safety)/report-modal', params: { targetId: conversation?.counterpartId ?? '', targetName: conversation?.counterpartName ?? 'this person', source: 'chat', matched: '1' } } as any)}><Text style={styles.safetyLink}>Safety</Text></Pressable>} />
      {error ? <Pressable onPress={() => void catchUp()} style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Retry</Text></Pressable> : null}
      {loading ? <View style={styles.center}><ActivityIndicator /><Text style={{ color: palette.textSecondary }}>Loading messages…</Text></View> :
        <ScrollView ref={scrollRef} testID="chat-messages" style={styles.messages} contentContainerStyle={styles.messagesContent}>
          {canLoadOlder ? <Pressable disabled={loadingOlder} onPress={() => void loadOlder()} style={styles.older}><Text style={styles.olderText}>{loadingOlder ? 'Loading…' : 'Load earlier messages'}</Text></Pressable> : null}
          {messages.length === 0 ? <Text style={[styles.empty, { color: palette.textSecondary }]}>Say hello. Messaging is free when you both like each other.</Text> :
            messages.map(message => <MessageBubble key={message.id} message={message} own={message.sender_id === user?.id} />)}
        </ScrollView>}
      <View style={[styles.composer, { backgroundColor: palette.background }]}>
        <FadeEdge edge="bottom" color={palette.background} testID="scr-16-composer-fade" />
        <TextInput testID="scr-16-composer-input" accessibilityLabel="Write a message" value={draft} onChangeText={value => { setDraft(value); if (draftError) setDraftError(''); }} placeholder="Write a message…" placeholderTextColor={palette.textSecondary} multiline maxLength={2000} editable={!sending} style={[styles.input, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]} />
        <Pressable testID="scr-16-send-btn" accessibilityRole="button" accessibilityLabel="Send message" disabled={sending || !draft.trim()} onPress={() => void onSend()} style={[styles.send, (sending || !draft.trim()) && styles.sendDisabled]}><Text style={styles.sendText}>{sending ? 'Sending' : 'Send'}</Text></Pressable>
        {draftError ? <Text accessibilityRole="alert" testID="chat-send-error" style={styles.draftError}>{draftError}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  </AuthGuard>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, messages: { flex: 1 }, messagesContent: { paddingHorizontal: 16, paddingVertical: 14, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }, empty: { textAlign: 'center', marginTop: 30, lineHeight: 21, paddingHorizontal: 24 },
  composer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8, padding: 12 },
  input: { flex: 1, minHeight: 44, maxHeight: 110, borderWidth: 1, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10, fontSize: 15 },
  send: { minHeight: 44, paddingHorizontal: 17, justifyContent: 'center', alignItems: 'center', borderRadius: 22, backgroundColor: '#191919' },
  sendDisabled: { opacity: 0.45 }, sendText: { color: '#FFFFFF', fontWeight: '700' }, safetyLink: { color: '#9A702C', fontWeight: '700', padding: 10 },
  older: { alignSelf: 'center', padding: 10 }, olderText: { color: '#9A702C', fontWeight: '600' },
  errorBanner: { padding: 10, backgroundColor: '#FFF2D9', flexDirection: 'row', justifyContent: 'space-between' }, errorText: { color: '#5D3B0A', flex: 1 }, retry: { color: '#5D3B0A', fontWeight: '700' },
  draftError: { color: '#B42318', width: '100%', fontSize: 12 }, 
});
