import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ModerationLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import {
  MODERATION_FILTERS,
  MODERATION_PAGE_SIZE,
  ageLabel,
  categoryLabel,
  isForbiddenError,
  moderationErrorMessage,
  severityLabel,
  statusLabel,
  triageClock,
  type ModerationFilterId,
} from "@/lib/moderation";
import { moderationListQueue, type ModerationQueueRow } from "@/lib/rpc";

/** Body is a child of ModerationLayout so nothing is fetched unless AuthGuard has admitted a moderator. */
function QueueBody() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [filter, setFilter] = useState<ModerationFilterId>("active");
  const [rows, setRows] = useState<ModerationQueueRow[]>([]);
  const [status, setStatus] = useState<FormStatus>("pending");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  // Ignore responses that arrive after a newer request (filter change / refresh).
  const requestId = useRef(0);

  const load = useCallback(async (nextFilter: ModerationFilterId, append: boolean, offset: number) => {
    const mine = ++requestId.current;
    if (append) setLoadingMore(true);
    else setStatus("pending");
    const { data, error } = await moderationListQueue({
      filter: nextFilter,
      limit: MODERATION_PAGE_SIZE,
      offset,
    });
    if (mine !== requestId.current) return;
    setLoadingMore(false);
    if (error) {
      setErrorMessage(
        isForbiddenError(error)
          ? "Your account does not have moderator access."
          : moderationErrorMessage(error),
      );
      setStatus("failure");
      return;
    }
    const page = data ?? [];
    setRows((prev) => (append ? [...prev, ...page] : page));
    setHasMore(page.length === MODERATION_PAGE_SIZE);
    setStatus(!append && page.length === 0 ? "empty" : "idle");
  }, []);

  // Reload whenever the screen regains focus (e.g. coming back from a case after an action) and when the filter changes.
  useFocusEffect(
    useCallback(() => {
      void load(filter, false, 0);
      return () => {
        requestId.current += 1;
      };
    }, [filter, load]),
  );

  return (
    <>
      <View style={styles.filterRow} accessibilityRole="tablist">
        {MODERATION_FILTERS.map((item) => (
          <Button
            key={item.id}
            testID={`scr-23-filter-${item.id}`}
            label={item.label}
            variant={filter === item.id ? "primary" : "secondary"}
            size="sm"
            shape="pill"
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === item.id }}
            onPress={() => setFilter(item.id)}
          />
        ))}
        <Button
          testID="scr-23-refresh"
          label="Refresh"
          variant="secondary"
          size="sm"
          shape="pill"
          onPress={() => void load(filter, false, 0)}
        />
      </View>

      <FormStateView
        testID="scr-23-form-state"
        status={status}
        preserveChildren={false}
        pendingTitle="Loading reports..."
        failureTitle="Couldn’t load the queue"
        failureMessage={errorMessage || "Something went wrong. Please try again."}
        retryLabel="Try again"
        onRetry={() => void load(filter, false, 0)}
        emptyTitle={
          filter === "active" || filter === "unopened"
            ? "No reports need attention"
            : "No cases in this view"
        }
        emptyMessage="Nothing matches this filter right now."
        emptyActionLabel={filter === "all" ? undefined : "Show all"}
        onEmptyAction={filter === "all" ? undefined : () => setFilter("all")}
      >
        <View style={styles.caseList}>
          {rows.map((item) => {
            const clock = triageClock(item);
            return (
              <Card
                key={item.report_id}
                testID={`scr-23-case-${item.report_id}`}
                variant="elevated"
              >
                <View style={styles.caseRow}>
                  <View style={styles.caseDetails}>
                    <Text
                      accessibilityRole="header"
                      style={[styles.caseTitle, { color: palette.text }]}
                    >
                      {categoryLabel(item.category)} • {item.reported_display_name || "Removed account"}
                    </Text>
                    <Text style={[styles.caseMeta, { color: palette.textSecondary }]}>
                      {severityLabel(item.severity)} severity • {statusLabel(item.case_status)} • reported{" "}
                      {ageLabel(item.reported_at)}
                      {item.reports_against_count > 1
                        ? ` • ${item.reports_against_count} reports on this member`
                        : ""}
                      {item.reported_is_suspended ? " • member suspended" : ""}
                    </Text>
                    {clock ? (
                      <Text
                        style={[
                          styles.caseMeta,
                          { color: clock.includes("overdue") ? palette.errorText : palette.textMuted },
                        ]}
                      >
                        {clock}
                      </Text>
                    ) : null}
                  </View>
                  <Button
                    testID={`scr-23-inspect-${item.report_id}`}
                    label="Inspect case"
                    variant="charcoal"
                    size="sm"
                    onPress={() =>
                      router.push(`/(admin)/moderation/${item.report_id}` as any)
                    }
                  />
                </View>
              </Card>
            );
          })}
          {hasMore ? (
            <Button
              testID="scr-23-load-more"
              label="Load more"
              variant="secondary"
              loading={loadingMore}
              onPress={() => void load(filter, true, rows.length)}
            />
          ) : null}
        </View>
      </FormStateView>
    </>
  );
}

export default function ModerationQueueScreen() {
  return (
    <ModerationLayout
      testID="scr-23-moderation-queue"
      title="Trust & Safety Moderation Queue"
      subtitle="Reports ordered by severity, oldest first"
      fallbackHref="/(tabs)/profile"
      activeNavId="moderation-queue"
    >
      <QueueBody />
    </ModerationLayout>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  caseList: {
    gap: Spacing.md,
  },
  caseRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  caseDetails: {
    flex: 1,
    minWidth: 220,
    gap: Spacing.xs,
  },
  caseTitle: {
    ...Typography.h3,
  },
  caseMeta: {
    ...Typography.bodySmall,
  },
});
