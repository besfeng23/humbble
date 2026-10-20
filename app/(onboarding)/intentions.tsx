import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { OnboardingLayout } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Radii } from "@/constants/Radii";
import { Spacing, TouchTargets } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

const INTENTIONS = [
  { id: "serious_relationship", label: "Serious relationship" },
  { id: "long_term_dating", label: "Long-term dating" },
  {
    id: "cultural_connection_and_dating",
    label: "Cultural connection & dating",
  },
] as const;

const INTEREST_TAGS = [
  "Coffee & Cafes",
  "Culinary Arts",
  "Live Music",
  "Weekend Roadtrips",
  "Book Clubs",
  "Fitness & Running",
] as const;

export default function OnboardingIntentionsScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [selectedIntention, setSelectedIntention] = useState<string>(
    "serious_relationship"
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([
    "Coffee & Cafes",
    "Culinary Arts",
    "Live Music",
  ]);
  const [status, setStatus] = useState<FormStatus>("idle");

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const handleContinue = () => {
    if (!selectedIntention || selectedTags.length < 3) {
      setStatus("failure");
      return;
    }
    setStatus("success");
    router.push("/(onboarding)/photos-prompts" as any);
  };

  return (
    <OnboardingLayout
      testID="scr-08-onboarding-intentions"
      step={2}
      totalSteps={4}
      title="Onboarding: Intentions"
      subtitle="SCR-08 • Relationship Intention & Shared Interests"
      fallbackHref="/(onboarding)/basics"
    >
      <FormStateView
        testID="scr-08-form-state"
        status={status}
        pendingTitle="Saving relationship intentions..."
        successTitle="Intentions saved"
        successMessage="Proceeding to Step 3: Photos & Prompts."
        failureTitle="Selection incomplete"
        failureMessage="Please select a relationship intention and at least 3 shared interests."
        onRetry={() => setStatus("idle")}
      >
        <Card testID="scr-08-card" variant="elevated">
          <View style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.text }]}
            >
              Relationship Intention (Alternative A Neutral Dating)
            </Text>
            <View style={styles.pillsWrap}>
              {INTENTIONS.map((item) => {
                const isSelected = selectedIntention === item.id;
                return (
                  <Pressable
                    key={item.id}
                    testID={`scr-08-intention-${item.id}`}
                    onPress={() => setSelectedIntention(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: isSelected }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSelected
                          ? palette.primary
                          : palette.surfaceMuted,
                        borderColor: isSelected
                          ? palette.primaryPressed
                          : palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: isSelected ? palette.onPrimary : palette.text,
                        fontWeight: isSelected ? "700" : "500",
                      }}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: palette.text }]}
            >
              Shared Interests (Select at least 3)
            </Text>
            <View style={styles.pillsWrap}>
              {INTEREST_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    testID={`scr-08-tag-${tag}`}
                    onPress={() => toggleTag(tag)}
                    accessibilityRole="button"
                    accessibilityLabel={tag}
                    accessibilityState={{ selected: isSelected }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSelected
                          ? palette.primary
                          : palette.surfaceMuted,
                        borderColor: isSelected
                          ? palette.primaryPressed
                          : palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: isSelected ? palette.onPrimary : palette.text,
                        fontWeight: isSelected ? "700" : "500",
                      }}
                    >
                      {tag}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.actions}>
              <Button
                testID="scr-08-continue-btn"
                label="Save & Continue to Photos"
                variant="primary"
                size="lg"
                onPress={handleContinue}
              />
              <Button
                testID="scr-08-back-btn"
                label="Back to Basics"
                variant="secondary"
                onPress={() => router.replace("/(onboarding)/basics" as any)}
              />
            </View>
          </View>
        </Card>
      </FormStateView>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.lg,
  },
  heading: {
    ...Typography.h3,
  },
  pillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    minHeight: TouchTargets.comfortable,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  actions: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
});
