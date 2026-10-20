import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AuthGuard, ResponsiveNavHeader } from "@/components/layout";
import { FormStateView, type FormStatus } from "@/components/state";
import { Button, Card, TextField } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

const ChatScreen = () => {
  const router = useRouter();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([
    "Hi there! Excited we matched on Humbble.",
  ]);
  const [status, setStatus] = useState<FormStatus>("idle");

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setStatus("failure");
      return;
    }
    setMessages((prev) => [...prev, trimmed]);
    setDraft("");
    setStatus("success");
  };

  return (
    <AuthGuard mode="protected" redirectTo="/auth/signin" testID="chatscreen-guard">
      <View
        testID="scr-16-chatscreen"
        style={[styles.root, { backgroundColor: palette.background }]}
      >
        <ResponsiveNavHeader
          testID="scr-16-header"
          title="Conversation"
          subtitle="SCR-16 • Free Mutual Messaging • chatscreen asfasdf"
          showBack
          fallbackHref="/(tabs)/(chats)"
          rightSlot={
            <Button
              testID="scr-16-shield-btn"
              label="Shield / Report"
              variant="danger"
              size="sm"
              shape="pill"
              onPress={() => router.push("/(safety)/report-modal" as any)}
            />
          }
        />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.legacyTag, { color: palette.textSecondary }]}>
            chatscreen asfasdf
          </Text>

          <FormStateView
            testID="scr-16-form-state"
            status={status}
            pendingTitle="Sending message..."
            successTitle="Message sent"
            successMessage="Delivered in free mutual conversation."
            failureTitle="Cannot send empty message"
            failureMessage="Please enter between 1 and 2000 characters."
            onRetry={() => setStatus("idle")}
          >
            <View style={styles.messagesList}>
              {messages.map((msg, index) => (
                <Card key={`${index}-${msg}`} variant="muted">
                  <Text style={[styles.messageText, { color: palette.text }]}>
                    {msg}
                  </Text>
                </Card>
              ))}
            </View>

            <View style={styles.composer}>
              <TextField
                testID="scr-16-composer-input"
                label="Message"
                placeholder="Write a respectful message..."
                value={draft}
                onChangeText={setDraft}
              />
              <Button
                testID="scr-16-send-btn"
                label="Send Message"
                variant="primary"
                onPress={handleSend}
              />
            </View>
          </FormStateView>
        </ScrollView>
      </View>
    </AuthGuard>
  );
};

export default ChatScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  legacyTag: {
    ...Typography.caption,
  },
  messagesList: {
    gap: Spacing.sm,
  },
  messageText: {
    ...Typography.body,
  },
  composer: {
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
});
