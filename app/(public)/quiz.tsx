import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useReducer, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, CountryPicker } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing, TouchTargets } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAuth } from "@/lib/AuthProvider";
import { captureAttribution } from "@/lib/attribution";
import { countryName, defaultCountryFromLocale } from "@/lib/countries";
import {
  INITIAL_QUIZ_STATE,
  QUIZ_CHOICE_STEPS,
  QUIZ_STEP_IDS,
  QUIZ_TOTAL_STEPS,
  buildSignupParams,
  loadStoredAttributionParams,
  optionLabel,
  quizReducer,
  saveQuiz,
} from "@/lib/quiz";
import { collectQuizAttribution, trackQuizEvent } from "@/lib/quizAnalytics";

/** Mobile-first prelander quiz: one question per screen, one tap to answer, then a single signup CTA. */
export default function QuizScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { session } = useAuth();
  const palette = Colors[useColorScheme() ?? "light"];
  const [state, dispatch] = useReducer(quizReducer, INITIAL_QUIZ_STATE);
  const [pickingCountry, setPickingCountry] = useState(false);
  const detectedCountry = useMemo(() => defaultCountryFromLocale(), []);

  useEffect(() => {
    // The ad click may land straight on the quiz: keep first-touch attribution (30 days).
    void captureAttribution(params as Record<string, unknown>, "/quiz");
    // Anonymous funnel measurement (non-blocking, failures silent, no-op when analytics are off). Click params only.
    void collectQuizAttribution(params as Record<string, unknown>).then((attribution) => trackQuizEvent({ event: "quiz_started", attribution }));
    // Capture once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Object.keys(state.answers).length) void saveQuiz(state.answers);
  }, [state.answers]);

  if (session) return <Redirect href="/(tabs)/people" />;

  const done = state.step >= QUIZ_TOTAL_STEPS;
  const stepId = QUIZ_STEP_IDS[state.step];
  const choice = QUIZ_CHOICE_STEPS.find((s) => s.id === stepId);

  const goBack = () => {
    if (state.step === 0) router.replace("/" as any);
    else { setPickingCountry(false); dispatch({ type: "back" }); }
  };
  const answer = (value: string) => {
    setPickingCountry(false);
    dispatch({ type: "answer", stepId, value });
    // Only a value the reducer accepts counts as an answer. Analytics never blocks or delays the UI.
    const next = quizReducer(state, { type: "answer", stepId, value });
    if (next.step > state.step) {
      trackQuizEvent({ event: "quiz_step", step: state.step + 1, value });
      if (next.step >= QUIZ_TOTAL_STEPS) trackQuizEvent({ event: "quiz_completed" });
    }
  };

  const goSignup = async () => {
    trackQuizEvent({ event: "quiz_cta_clicked" });
    const stored = await loadStoredAttributionParams();
    router.push({ pathname: "/auth/signup", params: buildSignupParams(state.answers, params as Record<string, unknown>, stored) } as any);
  };

  const summary = [optionLabel("intent", state.answers.intent), optionLabel("age", state.answers.age), state.answers.country ? countryName(state.answers.country, "en") : null]
    .filter(Boolean)
    .join("  \u00b7  ");

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View testID={done ? "quiz-result" : `quiz-step-${state.step + 1}`} style={styles.content}>
          <View style={styles.topBar}>
            {state.step === 0 && !done ? (
              <Text accessibilityRole="header" style={[Typography.h3, { color: palette.text }]}>Humbble</Text>
            ) : (
              <Pressable testID="quiz-back" accessibilityRole="button" accessibilityLabel="Back" onPress={goBack} hitSlop={8} style={styles.back}>
                <Text style={[Typography.link, { color: palette.text }]}>{"\u2039  Back"}</Text>
              </Pressable>
            )}
            {done ? null : (
              <Text testID="quiz-progress" accessibilityLabel={`Step ${state.step + 1} of ${QUIZ_TOTAL_STEPS}`} style={[Typography.bodySmall, { color: palette.textSecondary }]}>
                {state.step + 1} of {QUIZ_TOTAL_STEPS}
              </Text>
            )}
          </View>

          {done ? (
            <>
              <View style={styles.block}>
                <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>You&apos;re ready to start</Text>
                <Text style={[Typography.body, { color: palette.textSecondary }]}>
                  Create a free account to meet adults looking for something real. We&apos;ll keep these answers with your account.
                </Text>
                {summary ? <Text testID="quiz-summary" style={[Typography.bodySemiBold, { color: palette.text }]}>{summary}</Text> : null}
              </View>
              <View style={styles.block}>
                <Button testID="quiz-signup-cta" label="Create your free account" variant="charcoal" size="lg" shape="pill" onPress={goSignup} />
                <Text style={[Typography.bodySmall, styles.center, { color: palette.textSecondary }]}>Free to join. 18+ only.</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.block}>
                <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>
                  {choice ? choice.title : "Where are you based?"}
                </Text>
                {choice?.subtitle ? <Text style={[Typography.body, { color: palette.textSecondary }]}>{choice.subtitle}</Text> : null}
                {!choice && detectedCountry && !pickingCountry ? (
                  <Text style={[Typography.body, { color: palette.textSecondary }]}>We read this from your device.</Text>
                ) : null}
              </View>
              <View style={styles.block}>
                {choice
                  ? choice.options.map((o) => (
                      <Button
                        key={o.value}
                        testID={`quiz-option-${choice.id}-${o.value}`}
                        label={o.label}
                        variant={state.answers[choice.id] === o.value ? "primary" : "outline"}
                        size="lg"
                        shape="pill"
                        onPress={() => answer(o.value)}
                      />
                    ))
                  : detectedCountry && !pickingCountry
                    ? (
                      <>
                        <Button testID={`quiz-option-country-${detectedCountry}`} label={countryName(detectedCountry, "en")} variant="outline" size="lg" shape="pill" onPress={() => answer(detectedCountry)} />
                        <Button testID="quiz-option-country-other" label="Somewhere else" variant="ghost" size="lg" shape="pill" onPress={() => setPickingCountry(true)} />
                      </>
                    )
                    : <CountryPicker testID="quiz-country-picker" label="Country" hideLabel value={state.answers.country ?? null} onChange={answer} />}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 440, alignSelf: "center", gap: Spacing["4xl"] },
  topBar: { minHeight: TouchTargets.minimum, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { minHeight: TouchTargets.minimum, justifyContent: "center" },
  block: { gap: Spacing.lg },
  title: { ...Typography.display },
  center: { textAlign: "center" },
});
