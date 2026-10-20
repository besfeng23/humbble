import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import {
  AppState,
  type AppStateStatus,
  type NativeEventSubscription,
  Platform,
} from 'react-native';

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const rawSupabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

const invalidUrl = (url: string): boolean => {
  if (!url || /placeholder\.supabase\.co|<project-ref>|your-project-ref|example\.supabase\.co/i.test(url)) return true;
  return !/^https?:\/\/[^/\s]+/i.test(url);
};
const invalidKey = (key: string): boolean =>
  !key || /^(placeholder-anon-key)$/i.test(key) || /<public-key>|<anon-key>|your-anon-key|your-publishable-key/i.test(key);

export const isSupabaseConfigured = !invalidUrl(rawSupabaseUrl) && !invalidKey(rawSupabaseKey);

const memory = new Map<string, string>();
const memoryStorage: SupportedStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => { memory.set(key, value); },
  removeItem: (key) => { memory.delete(key); },
};
const webStorage: SupportedStorage =
  typeof window !== 'undefined' && window.localStorage ? window.localStorage : memoryStorage;
const storage: SupportedStorage = Platform.OS === 'web' ? webStorage : AsyncStorage;
const failClosedFetch: typeof fetch = async () => {
  throw new Error('Sign-in is unavailable in this build');
};

export const supabase = createClient(
  isSupabaseConfigured ? rawSupabaseUrl : 'https://unconfigured.invalid',
  isSupabaseConfigured ? rawSupabaseKey : 'unconfigured-anon-key',
  {
    auth: {
      storage: isSupabaseConfigured ? storage : memoryStorage,
      persistSession: isSupabaseConfigured,
      autoRefreshToken: isSupabaseConfigured,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
    global: isSupabaseConfigured ? undefined : { fetch: failClosedFetch },
    realtime: {
      transport: typeof WebSocket !== 'undefined' ? WebSocket : (class {} as any),
    },
  },
);

let appStateSubscription: NativeEventSubscription | null = null;
const handleAppStateChange = (state: AppStateStatus) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
};
export function registerSupabaseAppStateListener(): NativeEventSubscription | null {
  if (Platform.OS === 'web') return null;
  if (appStateSubscription) return appStateSubscription;
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
  return appStateSubscription;
}
export function cleanupSupabaseAppStateListener(): void {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  if (Platform.OS !== 'web') supabase.auth.stopAutoRefresh();
}
registerSupabaseAppStateListener();
