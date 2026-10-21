import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  authMessage: string | null;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  authMessage: null,
  signOut: async () => undefined,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const receivedAuthEvent = useRef(false);
  const intentionalSignOut = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      receivedAuthEvent.current = true;
      const previouslyHadSession = Boolean(sessionRef.current);
      sessionRef.current = nextSession;
      if (!alive || !mounted.current) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') setAuthMessage(null);
      if (event === 'SIGNED_OUT' && previouslyHadSession && !intentionalSignOut.current) {
        setAuthMessage('Please sign in again.');
      }
      setSession(nextSession);
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive || !mounted.current || receivedAuthEvent.current) return;
      if (error) {
        sessionRef.current = null;
        setSession(null);
        setAuthMessage(isSupabaseConfigured ? 'Please sign in again.' : null);
        if (isSupabaseConfigured) void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      } else {
        sessionRef.current = data.session;
        setSession(data.session);
      }
      setLoading(false);
    }).catch(() => {
      if (!alive || !mounted.current || receivedAuthEvent.current) return;
      sessionRef.current = null;
      setSession(null);
      setAuthMessage(isSupabaseConfigured ? 'Please sign in again.' : null);
      setLoading(false);
      if (isSupabaseConfigured) void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    });

    return () => {
      alive = false;
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    intentionalSignOut.current = true;
    sessionRef.current = null;
    setSession(null);
    setLoading(false);
    setAuthMessage(null);
    try {
      if (isSupabaseConfigured) {
        // Client state is cleared immediately above; keep navigation public even if the network fails.
        await supabase.auth.signOut();
      }
    } catch {
      // Never surface provider internals or leave the user on a protected screen.
    } finally {
      // The SIGNED_OUT callback may run before or after signOut resolves.
      intentionalSignOut.current = false;
    }
  }, []);

  return <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, authMessage, signOut }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => useContext(AuthContext);
