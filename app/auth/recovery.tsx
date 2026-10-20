import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AuthLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, TextField } from "@/components/ui";
import { Spacing } from "@/constants/Spacing";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function PasswordRecoveryScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState(
    "Please enter a valid email address."
  );

  const handleRequestReset = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      setStatus("failure");
      return;
    }

    if (!isSupabaseConfigured) {
      // Safe unconfigured preview mode: show enumeration-safe confirmation banner
      setStatus("success");
      return;
    }

    setStatus("pending");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
      if (error) {
        setErrorMessage(error.message || "Could not send reset email.");
        setStatus("failure");
        return;
      }
      setStatus("success");
    } catch (err: any) {
      setErrorMessage(err?.message || "Could not send reset email.");
      setStatus("failure");
    }
  };

  return (
    <AuthLayout
      testID="scr-06-recovery"
      heroTitle="Account Recovery"
      heroSubtitle="SCR-06 • Request a password reset link"
      formTitle="RESET PASSWORD"
      fallbackHref="/auth/signin"
      backLabel="Sign In"
    >
      <FormStateView
        testID="recovery-form-state"
        status={status}
        pendingTitle="Sending recovery instructions..."
        pendingMessage="Contacting authentication service."
        successTitle="Check your inbox"
        successMessage="If an account exists for that email, a one-time password recovery link has been queued."
        successActionLabel="Return to Sign In"
        onSuccessAction={() => router.replace("/auth/signin" as any)}
        failureTitle="Recovery request failed"
        failureMessage={errorMessage}
        retryLabel="Try Again"
        onRetry={() => setStatus("idle")}
      >
        <View style={styles.formBody}>
          <TextField
            testID="recovery-email-field"
            label="Email Address"
            placeholder="you@example.com"
            helperText="We will send a one-time recovery link."
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            required
          />

          <Button
            testID="recovery-submit-btn"
            label="Send Recovery Link"
            variant="primary"
            size="lg"
            loading={status === "pending"}
            onPress={handleRequestReset}
          />

          <Button
            testID="recovery-back-signin-btn"
            label="Back to Sign In"
            variant="secondary"
            size="md"
            onPress={() => router.replace("/auth/signin" as any)}
          />
        </View>
      </FormStateView>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  formBody: {
    gap: Spacing.lg,
  },
});
