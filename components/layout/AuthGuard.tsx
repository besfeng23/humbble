import { Redirect, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

import { FailureState, PendingState } from "@/components/state";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";

import { isModeratorRole, navigateBackOrFallback } from "./navigation";

export type AuthGuardMode = "protected" | "guest-only" | "public" | "moderator";

export interface AuthGuardProps {
  /** Protection policy for the wrapped route/view */
  mode?: AuthGuardMode;
  /** Redirect destination when unauthenticated on a protected or moderator route */
  redirectTo?: string;
  /** Redirect destination when authenticated on a guest-only route */
  authenticatedRedirectTo?: string;
  /** Fallback route when a forbidden moderator route user presses Return */
  fallbackHref?: string;
  /** Override reduced motion for state indicators */
  reduceMotion?: boolean;
  /** Test identifier prefix */
  testID?: string;
  /** Protected content */
  children: React.ReactNode;
}

export function AuthGuard({
  mode = "protected",
  redirectTo = "/auth/signin",
  authenticatedRedirectTo = "/(tabs)/people",
  fallbackHref = "/(tabs)/people",
  reduceMotion,
  testID = "auth-guard",
  children,
}: AuthGuardProps) {
  const { session, user, loading } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];

  if (mode === "public") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <PendingState
        testID={`${testID}-loading`}
        fullScreen
        title="Checking session..."
        message="Verifying your account state."
        reduceMotion={reduceMotion}
      />
    );
  }

  if (mode === "guest-only") {
    if (session) {
      return <Redirect href={authenticatedRedirectTo as any} />;
    }
    return <>{children}</>;
  }

  // Both "protected" and "moderator" modes require an authenticated session first
  if (!session) {
    return <Redirect href={redirectTo as any} />;
  }

  if (mode === "moderator" && !isModeratorRole(user)) {
    return (
      <View
        testID={`${testID}-forbidden-container`}
        style={[
          styles.forbiddenContainer,
          { backgroundColor: palette.background },
        ]}
      >
        <FailureState
          testID={`${testID}-forbidden`}
          title="Moderator Access Required (403)"
          message="This Trust & Safety surface is restricted to authorized moderation staff."
          retryLabel="Return to App"
          onRetry={() => navigateBackOrFallback(router, fallbackHref)}
          reduceMotion={reduceMotion}
        />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  forbiddenContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["3xl"],
  },
});

export default AuthGuard;
