import { Redirect, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PendingState, FailureState } from '@/components/state';
import { Colors } from '@/constants/Colors';
import { Spacing } from '@/constants/Spacing';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/lib/AuthProvider';
import { isModeratorRole, navigateBackOrFallback } from './navigation';

export type AuthGuardMode = 'protected' | 'guest-only' | 'public' | 'moderator';
export interface AuthGuardProps {
  mode?: AuthGuardMode; redirectTo?: string; authenticatedRedirectTo?: string; fallbackHref?: string;
  reduceMotion?: boolean; testID?: string; children: React.ReactNode;
}
export function AuthGuard({ mode = 'protected', redirectTo = '/auth/signin', authenticatedRedirectTo = '/(tabs)/people', fallbackHref = '/(tabs)/people', reduceMotion, testID = 'auth-guard', children }: AuthGuardProps) {
  const { session, user, loading, authMessage } = useAuth();
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? 'light'];
  if (mode === 'public') return <>{children}</>;
  if (loading) return <PendingState testID={`${testID}-loading`} fullScreen title="Loading..." reduceMotion={reduceMotion} />;
  if (mode === 'guest-only') return session ? <Redirect href={authenticatedRedirectTo as any} /> : <>{children}</>;
  if (!session) {
    const href = authMessage === 'Please sign in again.' ? '/auth/signin?reason=reauth' : redirectTo;
    return <Redirect href={href as any} />;
  }
  if (mode === 'moderator' && !isModeratorRole(user)) {
    return <View style={[styles.forbidden, { backgroundColor: palette.background }]}><FailureState testID={`${testID}-forbidden`} title="Moderator Access Required (403)" message="This Trust & Safety surface is restricted to authorized moderation staff." retryLabel="Return to App" onRetry={() => navigateBackOrFallback(router, fallbackHref)} reduceMotion={reduceMotion} /></View>;
  }
  return <>{children}</>;
}
const styles = StyleSheet.create({ forbidden: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['3xl'] } });
export default AuthGuard;
