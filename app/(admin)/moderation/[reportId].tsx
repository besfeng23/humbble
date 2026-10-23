import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ModerationLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card, Dialog, TextField } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import {
  ageLabel,
  availableActions,
  categoryLabel,
  isForbiddenError,
  moderationErrorMessage,
  parseHistory,
  severityLabel,
  shortId,
  statusLabel,
  validateReason,
  type ModerationActionSpec,
} from "@/lib/moderation";
import {
  moderationGetCase,
  moderationOpenCase,
  moderationTakeAction,
  type ModerationCaseDetailRow,
} from "@/lib/rpc";

type LoadState = "pending" | "ready" | "failure" | "forbidden" | "missing";

function CaseBody({ reportId }: { reportId: string }) {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [detail, setDetail] = useState<ModerationCaseDetailRow | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("pending");
  const [loadError, setLoadError] = useState("");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<FormStatus>("idle");
  const [actionMessage, setActionMessage] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<ModerationActionSpec | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (silent: boolean) => {
      const mine = ++requestId.current;
      if (!silent) setLoadState("pending");
      const { data, error } = await moderationGetCase(reportId);
      if (mine !== requestId.current) return;
      if (error) {
        if (isForbiddenError(error)) {
          setLoadState("forbidden");
        } else {
          setLoadError(moderationErrorMessage(error));
          setLoadState("failure");
        }
        return;
      }
      const row = data?.[0] ?? null;
      setDetail(row);
      setLoadState(row ? "ready" : "missing");
    },
    [reportId],
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
      return () => {
        requestId.current += 1;
      };
    }, [load]),
  );

  const run = useCallback(
    async (kind: "open" | ModerationActionSpec) => {
      if (!detail) return;
      const trimmed = reason.trim();
      setPendingConfirm(null);
      setActionStatus("pending");
      const result =
        kind === "open"
          ? await moderationOpenCase({ reportId, reason: trimmed })
          : await moderationTakeAction({
              caseId: detail.case_id,
              action: kind.id,
              reason: trimmed,
            });
      if (result.error) {
        setActionMessage(
          isForbiddenError(result.error)
            ? "Your account no longer has moderator access."
            : moderationErrorMessage(result.error),
        );
        setActionStatus("failure");
        return;
      }
      setActionMessage(kind === "open" ? "Case opened" : kind.successTitle);
      setActionStatus("success");
      setReason("");
      setReasonError(null);
      await load(true);
    },
    [detail, reason, reportId, load],
  );

  const request = (kind: "open" | ModerationActionSpec) => {
    const problem = validateReason(reason);
    if (problem) {
      setReasonError(problem);
      return;
    }
    setReasonError(null);
    if (kind !== "open" && kind.confirm) {
      setPendingConfirm(kind);
      return;
    }
    void run(kind);
  };

  if (loadState === "pending") {
    return (
      <FormStateView
        testID="scr-24-load-state"
        status="pending"
        preserveChildren={false}
        pendingTitle="Loading case..."
        pendingMessage="Opening this report is recorded in the audit log."
      />
    );
  }
  if (loadState === "forbidden") {
    return (
      <FormStateView
        testID="scr-24-load-state"
        status="failure"
        preserveChildren={false}
        failureTitle="Moderator access required"
        failureMessage="Your account does not have moderator access."
      />
    );
  }
  if (loadState === "failure") {
    return (
      <FormStateView
        testID="scr-24-load-state"
        status="failure"
        preserveChildren={false}
        failureTitle="Couldn’t load this case"
        failureMessage={loadError || "Something went wrong. Please try again."}
        retryLabel="Try again"
        onRetry={() => void load(false)}
      />
    );
  }
  if (loadState === "missing" || !detail) {
    return (
      <FormStateView
        testID="scr-24-load-state"
        status="empty"
        preserveChildren={false}
        emptyTitle="Report not found"
        emptyMessage="It may have been removed, or the link is wrong."
        emptyActionLabel="Back to queue"
        onEmptyAction={() => router.replace("/(admin)/moderation" as any)}
      />
    );
  }

  const history = parseHistory(detail.history);
  const actions = availableActions(detail);
  const busy = actionStatus === "pending";
  const hasCase = Boolean(detail.case_id);
  const closed = hasCase && actions.length === 0;

  return (
    <FormStateView
      testID="scr-24-form-state"
      status={actionStatus}
      pendingTitle="Recording audited moderation action..."
      successTitle={actionMessage}
      successMessage="Recorded in the audit log with your account and reason."
      failureTitle="Action not recorded"
      failureMessage={actionMessage}
      retryLabel="Dismiss"
      onRetry={() => setActionStatus("idle")}
    >
      <Card testID="scr-24-evidence-card" variant="elevated">
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.heading, { color: palette.text }]}>
            {categoryLabel(detail.category)} • {detail.reported_display_name || "Removed account"}
          </Text>
          <Text testID="scr-24-summary" style={[styles.body, { color: palette.textSecondary }]}>
            {severityLabel(detail.severity)} severity • {statusLabel(detail.case_status)} • reported{" "}
            {ageLabel(detail.reported_at)}
          </Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            Reported member {shortId(detail.reported_user_id)}
            {detail.reported_is_suspended ? " (currently suspended)" : ""} • reporter{" "}
            {shortId(detail.reporter_id)} • {detail.reports_against_count} report
            {detail.reports_against_count === 1 ? "" : "s"} and {detail.blocks_against_count} block
            {detail.blocks_against_count === 1 ? "" : "s"} against this member
          </Text>
          {detail.context_summary ? (
            <Text testID="scr-24-context" style={[styles.body, { color: palette.text }]}>
              {detail.context_summary}
            </Text>
          ) : (
            <Text style={[styles.body, { color: palette.textMuted }]}>
              The reporter added no extra details.
            </Text>
          )}
          <Text style={[styles.caption, { color: palette.textMuted }]}>
            Evidence is limited to this report. Viewing it and every action are recorded in the audit log.
          </Text>
        </View>
      </Card>

      <Card testID="scr-24-history-card" variant="outlined">
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.heading, { color: palette.text }]}>
            Audit history
          </Text>
          {history.length === 0 ? (
            <Text style={[styles.body, { color: palette.textMuted }]}>No recorded activity yet.</Text>
          ) : (
            history.map((entry, index) => (
              <View key={`${entry.at}-${index}`} testID={`scr-24-history-${index}`} style={styles.historyRow}>
                <Text style={[styles.body, { color: palette.text }]}>
                  {entry.summary}
                  {entry.actorId ? ` (${shortId(entry.actorId)})` : ""}
                </Text>
                <Text style={[styles.caption, { color: palette.textMuted }]}>
                  {entry.at ? `${ageLabel(entry.at)}` : ""}
                  {entry.reason ? ` • “${entry.reason}”` : ""}
                </Text>
              </View>
            ))
          )}
        </View>
      </Card>

      {closed ? (
        <Card testID="scr-24-closed-card" variant="outlined">
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            This case is {statusLabel(detail.case_status).toLowerCase()}. No further actions are available.
          </Text>
        </Card>
      ) : (
        <Card testID="scr-24-action-card" variant="elevated">
          <View style={styles.section}>
            <TextField
              testID="scr-24-reason-input"
              label="Reason (saved in the audit log)"
              helperText="Required for every action. Say what you saw and why you are acting."
              value={reason}
              onChangeText={(text) => {
                setReason(text);
                if (reasonError) setReasonError(null);
              }}
              error={reasonError}
              multiline
              required
              disabled={busy}
            />
            <View style={styles.actionsRow}>
              {!hasCase ? (
                <Button
                  testID="scr-24-open-btn"
                  label="Open case"
                  variant="primary"
                  disabled={busy}
                  onPress={() => request("open")}
                />
              ) : (
                actions.map((spec) => (
                  <Button
                    key={spec.id}
                    testID={`scr-24-${spec.id}-btn`}
                    label={spec.label}
                    variant={spec.variant}
                    disabled={busy}
                    onPress={() => request(spec)}
                  />
                ))
              )}
            </View>
          </View>
        </Card>
      )}

      <Dialog
        testID="scr-24-confirm-dialog"
        visible={pendingConfirm !== null}
        title={pendingConfirm ? `${pendingConfirm.label}?` : ""}
        description={pendingConfirm?.confirm}
        onClose={() => setPendingConfirm(null)}
        primaryAction={{
          testID: "scr-24-confirm-btn",
          label: pendingConfirm ? `Confirm: ${pendingConfirm.label}` : "Confirm",
          variant: pendingConfirm?.id === "suspend" ? "danger" : "primary",
          onPress: () => pendingConfirm && void run(pendingConfirm),
        }}
        secondaryAction={{
          testID: "scr-24-cancel-btn",
          label: "Cancel",
          onPress: () => setPendingConfirm(null),
        }}
      />
    </FormStateView>
  );
}

export default function ModerationCaseDetailScreen() {
  const params = useLocalSearchParams<{ reportId?: string }>();
  const reportId = typeof params.reportId === "string" ? params.reportId : "";
  return (
    <ModerationLayout
      testID="scr-24-moderation-case"
      title="Moderation case"
      subtitle="Case details and actions"
      fallbackHref="/(admin)/moderation"
      activeNavId="moderation-queue"
    >
      {reportId ? (
        <CaseBody key={reportId} reportId={reportId} />
      ) : (
        <FormStateView
          testID="scr-24-load-state"
          status="empty"
          preserveChildren={false}
          emptyTitle="No report selected"
          emptyMessage="Open a report from the moderation queue."
        />
      )}
    </ModerationLayout>
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
  caption: {
    ...Typography.caption,
  },
  historyRow: {
    gap: Spacing.xs,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
});
