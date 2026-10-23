import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SettingsLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card, TextField } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { SUPPORT_EMAIL } from "@/constants/Support";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";
import type { PrivacyRequestType } from "@/lib/database.contracts";
import {
  isOpenPrivacyRequest,
  loadMyPrivacyRequests,
  newPrivacyIdempotencyKey,
  privacyRequestTypeLabel,
  privacyStatusLabel,
  submitPrivacyRequest,
  type PrivacyRequestRow,
} from "@/lib/privacy";

const REQUIRED_CONFIRMATION = "DELETE MY ACCOUNT";

// Launch blocker LB-1: a request is only RECORDED today. There is no export/erasure worker yet,
// so no copy on this screen may say that data was exported or deleted. See lib/privacy.ts.
const NOT_AUTOMATED = "Nothing is exported or deleted automatically yet.";

function shortRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export default function PrivacyExportAndDeleteScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [confirmationText, setConfirmationText] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [statusTitle, setStatusTitle] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [requests, setRequests] = useState<PrivacyRequestRow[] | null>(null);
  const [busyType, setBusyType] = useState<PrivacyRequestType | null>(null);
  // One key per attempt: a retry after a network failure reuses it so it cannot create a duplicate request.
  const keys = useRef<Partial<Record<PrivacyRequestType, string>>>({});
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const rows = await loadMyPrivacyRequests();
    if (mounted.current) setRequests(rows);
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Signed out (or still resolving the session): nothing to list and no point calling the server.
    if (userId) void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh, userId]);

  const hasOpen = (type: PrivacyRequestType) =>
    (requests ?? []).some((row) => row.request_type === type && isOpenPrivacyRequest(row));

  const fail = (title: string, message: string) => {
    setStatusTitle(title);
    setStatusMessage(message);
    setStatus("failure");
  };

  const submit = async (type: PrivacyRequestType) => {
    if (inFlight.current) return;
    // Defence in depth: the route is behind AuthGuard, but never call the server (or mint a key) without a session.
    if (!userId) {
      if (authLoading) {
        fail("Checking your session", "We are still confirming you are signed in. Try again in a moment. Nothing was recorded.");
      } else {
        fail("Please sign in", "You need to be signed in to make a data request. Sign in and try again. Nothing was recorded.");
      }
      return;
    }
    if (hasOpen(type)) {
      fail(
        "You already have an open request",
        `Your ${privacyRequestTypeLabel(type).toLowerCase()} request is already recorded (see below). ${NOT_AUTOMATED} Contact ${SUPPORT_EMAIL} to follow up.`
      );
      return;
    }
    let key: string;
    try {
      key = keys.current[type] ??= newPrivacyIdempotencyKey();
    } catch {
      // No cryptographically secure random source on this device: fail closed instead of sending a guessable key.
      fail("We could not record your request", `This device cannot create a secure request reference, so nothing was recorded. Please contact ${SUPPORT_EMAIL}.`);
      return;
    }
    inFlight.current = true;
    setBusyType(type);
    setStatus("pending");
    const outcome = await submitPrivacyRequest(type, key);
    inFlight.current = false;
    if (!mounted.current) return;
    setBusyType(null);

    if (outcome.kind === "failed" && outcome.retryable) {
      // Keep the key: pressing the button again retries the same attempt.
      fail("We could not record your request", "Check your connection and try again. Nothing was changed on your account.");
      return;
    }
    delete keys.current[type];

    if (outcome.kind === "recorded") {
      setStatusTitle("Request recorded");
      setStatusMessage(
        type === "export"
          ? `Your data export request is recorded (reference ${shortRef(outcome.requestId)}). ${NOT_AUTOMATED} Contact ${SUPPORT_EMAIL} and quote the reference to follow up.`
          : `Your account deletion request is recorded (reference ${shortRef(outcome.requestId)}). ${NOT_AUTOMATED} Your account stays active and you stay signed in. Contact ${SUPPORT_EMAIL} and quote the reference to follow up.`
      );
      setConfirmationText("");
      setStatus("success");
      void refresh();
    } else if (outcome.kind === "already_open") {
      fail(
        "You already have an open request",
        `Your ${privacyRequestTypeLabel(type).toLowerCase()} request is already recorded. ${NOT_AUTOMATED}`
      );
      void refresh();
    } else if (outcome.kind === "profile_missing") {
      fail(
        "Finish setting up your profile first",
        `We could not record your request because your profile is not set up yet. Complete your profile, then try again, or contact ${SUPPORT_EMAIL}. Nothing was changed on your account.`
      );
    } else if (outcome.kind === "sign_in_required") {
      fail("Please sign in again", "Your session has ended, so the request was not recorded. Sign in and try again.");
    } else {
      fail("We could not record your request", `Please contact ${SUPPORT_EMAIL}.`);
    }
  };

  const handleRequestExport = () => {
    void submit("export");
  };

  const handleRequestDeletion = () => {
    if (confirmationText.trim() !== REQUIRED_CONFIRMATION) {
      fail(
        "Confirmation string mismatch",
        `Please type the exact phrase "${REQUIRED_CONFIRMATION}" to confirm your deletion request.`
      );
      return;
    }
    void submit("deletion");
  };

  return (
    <SettingsLayout
      testID="scr-19-privacy-delete"
      title="Data Export & Account Deletion"
      subtitle="Your privacy rights: ask for a copy of your data or ask us to delete it"
      fallbackHref="/(tabs)/profile/settings"
      activeNavId="settings-privacy-delete"
    >
      <FormStateView
        testID="scr-19-form-state"
        status={status}
        pendingTitle="Recording your request..."
        successTitle={statusTitle || "Request recorded"}
        successMessage={statusMessage}
        failureTitle={statusTitle || "Request not recorded"}
        failureMessage={statusMessage}
        onRetry={() => setStatus("idle")}
      >
        <Card testID="scr-19-export-card" variant="elevated">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.text }]}
            >
              1. Data export request
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              Ask for a copy of your profile information, preferences, and consent records. Your request is recorded here. Exports are not generated automatically yet.
            </Text>
            <Button
              testID="scr-19-export-btn"
              label="Request Data Export"
              variant="secondary"
              loading={busyType === "export"}
              disabled={busyType !== null}
              onPress={handleRequestExport}
            />
          </View>
        </Card>

        <Card testID="scr-19-delete-card" variant="outlined">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.danger }]}
            >
              2. Account deletion request
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              Your request is recorded here. Account and photo deletion is not automatic yet: until it is processed your account stays active and visible, and you stay signed in.
            </Text>

            <TextField
              testID="scr-19-confirm-input"
              label={`Type "${REQUIRED_CONFIRMATION}" to confirm`}
              placeholder={REQUIRED_CONFIRMATION}
              value={confirmationText}
              onChangeText={setConfirmationText}
              autoCapitalize="characters"
              required
            />

            <Button
              testID="scr-19-delete-btn"
              label="Request Account Deletion"
              variant="danger"
              loading={busyType === "deletion"}
              disabled={busyType !== null}
              onPress={handleRequestDeletion}
            />
          </View>
        </Card>

        <Card testID="scr-19-requests-card" variant="outlined">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.text }]}
            >
              Your requests
            </Text>
            {requests === null ? (
              <Text testID="scr-19-requests-unavailable" style={[styles.body, { color: palette.textSecondary }]}>
                Your earlier requests could not be loaded right now.
              </Text>
            ) : requests.length === 0 ? (
              <Text testID="scr-19-requests-empty" style={[styles.body, { color: palette.textSecondary }]}>
                You have not made a request yet.
              </Text>
            ) : (
              requests.map((row) => (
                <Text
                  key={row.id}
                  testID={`scr-19-request-${row.id}`}
                  style={[styles.body, { color: palette.text }]}
                >
                  {`${privacyRequestTypeLabel(row.request_type)} - ${privacyStatusLabel(row.status)} (ref ${shortRef(row.id)}, ${row.created_at.slice(0, 10)})`}
                </Text>
              ))
            )}
            <Button
              testID="scr-19-back-settings-btn"
              label="Back to Privacy Settings"
              variant="ghost"
              onPress={() => router.replace("/(tabs)/profile/settings" as any)}
            />
          </View>
        </Card>
      </FormStateView>
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.md,
  },
  heading: {
    ...Typography.h3,
  },
  body: {
    ...Typography.bodySmall,
  },
});
