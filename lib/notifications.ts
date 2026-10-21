import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type NotificationPreferences = { matches_enabled: boolean; messages_enabled: boolean };
const DEFAULT_PREFERENCES: NotificationPreferences = { matches_enabled: true, messages_enabled: true };

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  if (!isSupabaseConfigured) return DEFAULT_PREFERENCES;
  const { data, error } = await supabase.from('notification_preferences').select('matches_enabled,messages_enabled').maybeSingle();
  if (error) throw new Error('Notification settings could not be loaded.');
  return data ?? DEFAULT_PREFERENCES;
}

export async function saveNotificationPreferences(next: NotificationPreferences): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Notification settings are unavailable in this build.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to update notification settings.');
  const { error } = await supabase.from('notification_preferences').upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() });
  if (error) throw new Error('Notification settings could not be saved.');
}

export async function enablePushAndRegister(): Promise<boolean> {
  if (Platform.OS === 'web' || !isSupabaseConfigured) return false;
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Humbble', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) throw new Error('Push notifications are not configured for this app build yet.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS as 'ios' | 'android' });
  if (error) throw new Error('This device could not be registered for notifications.');
  return true;
}

export async function unregisterCurrentPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !isSupabaseConfigured) return;
  try {
    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase.rpc('unregister_push_token', { p_token: token });
  } catch { /* Settings remain usable if a stale device token cannot be removed. */ }
}
