import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ModerationLayout } from "@/components/layout";
import { EmptyState, FormStateView, type FormStatus } from "@/components/state";
import { Button, Card } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

interface ModerationCaseSummary {
  id: string;
  category: string;
  severity: "critical" | "high" | "standard";
  status: "open" | "in_review" | "actioned";
  ageLabel: string;
}

const SYNTHETIC_CASES: readonly ModerationCaseSummary[] = [
  {
    id: "case-101",
    category: "underage_concern",
    severity: "critical",
    status: "open",
    ageLabel: "18m ago (4h SLA priority)",
  },
  {
    id: "case-102",
    category: "romance_scam_or_money_request",
    severity: "high",
    status: "in_review",
    ageLabel: "1h ago (24h SLA)",
  },
] as const;

export default function ModerationQueueScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [filterStatus, setFilterStatus] = useState<
    "all" | "open" | "in_review" | "actioned"
  >("all");
  const [status, setStatus] = useState<FormStatus>("idle");

  const visibleCases =
    filterStatus === "all"
      ? SYNTHETIC_CASES
      : SYNTHETIC_CASES.filter((item) => item.status === filterStatus);

  return (
    <ModerationLayout
      testID="scr-23-moderation-queue"
      title="Trust & Safety Moderation Queue"
      subtitle="Cases ordered by severity"
      fallbackHref="/(tabs)/profile"
      activeNavId="moderation-queue"
    >
      <FormStateView
        testID="scr-23-form-state"
        status={status}
        pendingTitle="Refreshing moderation queue..."
        successTitle="Queue refreshed"
        successMessage="Loaded active synthetic triage queue."
        onRetry={() => setStatus("idle")}
      >
        <View style={styles.filterRow}>
          {(["all", "open", "in_review", "actioned"] as const).map((key) => (
            <Button
              key={key}
              testID={`scr-23-filter-${key}`}
              label={`Filter: ${key}`}
              variant={filterStatus === key ? "primary" : "secondary"}
              size="sm"
              shape="pill"
              onPress={() => setFilterStatus(key)}
            />
          ))}
        </View>

        {visibleCases.length === 0 ? (
          <EmptyState
            testID="scr-23-empty-queue"
            title="Zero open cases in this filter"
            message="All matching Trust & Safety reports have been triaged."
            actionLabel="Show All Cases"
            onAction={() => setFilterStatus("all")}
          />
        ) : (
          <View style={styles.caseList}>
            {visibleCases.map((item) => (
              <Card
                key={item.id}
                testID={`scr-23-case-${item.id}`}
                variant="elevated"
              >
                <View style={styles.caseRow}>
                  <View style={styles.caseDetails}>
                    <Text
                      accessibilityRole="header"
                      style={[styles.caseTitle, { color: palette.text }]}
                    >
                      {item.id.toUpperCase()} • {item.category}
                    </Text>
                    <Text
                      style={[
                        styles.caseMeta,
                        { color: palette.textSecondary },
                      ]}
                    >
                      Severity: {item.severity.toUpperCase()} • Status:{" "}
                      {item.status} • {item.ageLabel}
                    </Text>
                  </View>
                  <Button
                    testID={`scr-23-inspect-${item.id}`}
                    label="Inspect Case"
                    variant="charcoal"
                    size="sm"
                    onPress={() =>
                      router.push(`/(admin)/moderation/${item.id}` as any)
                    }
                  />
                </View>
              </Card>
            ))}
          </View>
        )}
      </FormStateView>
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
