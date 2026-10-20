import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupportedStorage } from '@supabase/supabase-js';
import {
  AppState,
  AppStateStatus,
  NativeEventSubscription,
  Platform,
} from 'react-native';

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const rawSupabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  '';

const isInvalidOrPlaceholderUrl = (url: string): boolean => {
  if (!url) {
    return true;
  }
  const lower = url.toLowerCase();
  if (
    lower.includes('placeholder.supabase.co') ||
    lower.includes('<project-ref>') ||
    lower.includes('your-project-ref') ||
    lower.includes('example.supabase.co')
  ) {
    return true;
  }
  return !/^https?:\/\/[^/\s]+/i.test(url);
};

const isInvalidOrPlaceholderKey = (key: string): boolean => {
  if (!key) {
    return true;
  }
  const lower = key.toLowerCase();
  return (
    lower === 'placeholder-anon-key' ||
    lower.includes('<public-key>') ||
    lower.includes('<anon-key>') ||
    lower.includes('your-anon-key') ||
    lower.includes('your-publishable-key')
  );
};

export const isSupabaseConfigured = Boolean(
  !isInvalidOrPlaceholderUrl(rawSupabaseUrl) &&
    !isInvalidOrPlaceholderKey(rawSupabaseKey)
);

const UNCONFIGURED_ERROR_MESSAGE =
  'Supabase Auth is not configured. Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY / EXPO_PUBLIC_SUPABASE_ANON_KEY.';

if (!isSupabaseConfigured) {
  console.error(UNCONFIGURED_ERROR_MESSAGE);
}

const memoryStorage = new Map<string, string>();

const noopOrMemoryStorage: SupportedStorage = {
  getItem: (key: string) => memoryStorage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStorage.set(key, value);
  },
  removeItem: (key: string) => {
    memoryStorage.delete(key);
  },
};

const webStorage: SupportedStorage =
  typeof window !== 'undefined' && window.localStorage
    ? window.localStorage
    : noopOrMemoryStorage;

const storage: SupportedStorage =
  Platform.OS === 'web' ? webStorage : AsyncStorage;

const failClosedFetch: typeof fetch = async () => {
  throw new Error(UNCONFIGURED_ERROR_MESSAGE);
};

export const supabase = createClient(
  isSupabaseConfigured ? rawSupabaseUrl : 'https://unconfigured.invalid',
  isSupabaseConfigured ? rawSupabaseKey : 'unconfigured-anon-key',
  {
    auth: {
      storage: isSupabaseConfigured ? storage : noopOrMemoryStorage,
      persistSession: isSupabaseConfigured,
      autoRefreshToken: isSupabaseConfigured,
      detectSessionInUrl: isSupabaseConfigured && Platform.OS === 'web',
    },
    global: isSupabaseConfigured
      ? undefined
      : {
          fetch: failClosedFetch,
        },
    realtime: {
      transport:
        typeof WebSocket !== 'undefined' ? WebSocket : (class {} as any),
    },
  }
);

let appStateSubscription: NativeEventSubscription | null = null;

const handleAppStateChange = (state: AppStateStatus): void => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
};

export function registerSupabaseAppStateListener(): NativeEventSubscription | null {
  if (Platform.OS === 'web') {
    return null;
  }
  if (appStateSubscription) {
    return appStateSubscription;
  }
  appStateSubscription = AppState.addEventListener(
    'change',
    handleAppStateChange
  );
  return appStateSubscription;
}

export function cleanupSupabaseAppStateListener(): void {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  if (Platform.OS !== 'web') {
    supabase.auth.stopAutoRefresh();
  }
}

registerSupabaseAppStateListener();
