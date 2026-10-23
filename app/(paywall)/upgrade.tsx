import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { AuthGuard } from "@/components/layout";
import { Button } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { usePremium } from "@/hooks/usePremium";
import { type BillingPlan, PAYMENTS_ARE_TEST_ONLY, TEST_PAYMENTS_NOTICE, countryHintFromLocale, deviceLocale, formatPrice, getBillingPlan, startCheckout } from "@/lib/billing";
import { toFriendlyMessage } from "@/lib/friendlyErrors";

const CHECKOUT_UNAVAILABLE = "Checkout is unavailable right now. Please try again.";
const BENEFITS = ["See who liked you", "Unlimited likes"];

export default function ReserveUpgradePaywallScreen() {
  return (
    <AuthGuard mode="protected" redirectTo="/auth/signin" testID="scr-20-guard">
      <UpgradeContent />
    </AuthGuard>
  );
}

function UpgradeContent() {
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? "light"];
  const premium = usePremium();
  const [hint] = useState(() => countryHintFromLocale(deviceLocale()));
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  useEffect(() => {
    let live = true;
    void getBillingPlan(hint).then((p) => { if (live) setPlan(p); });
    return () => { live = false; };
  }, [hint]);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checkout = async () => {
    if (!consent) { setMessage("Please confirm monthly renewal first."); return; }
    setBusy(true); setMessage(null);
    const result = await startCheckout(hint);
    setBusy(false);
    if ("error" in result) { setMessage(toFriendlyMessage(result.error, CHECKOUT_UNAVAILABLE)); return; }
    await Linking.openURL(result.approvalUrl);
    // Returning from PayPal never grants access by itself; Premium appears once the server confirms payment.
    setMessage("Finish in PayPal. Premium turns on once payment is confirmed.");
  };

  return (
    <View testID="scr-20-upgrade" style={[styles.screen, { backgroundColor: palette.background }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>Humbble Premium</Text>

      {premium.isPremium ? (
        <>
          <Text testID="scr-20-premium-active" style={[styles.price, { color: palette.text }]}>You’re Premium</Text>
          <Button testID="scr-20-to-billing-btn" label="Manage subscription" variant="secondary" size="lg" onPress={() => router.push("/(paywall)/billing" as any)} />
        </>
      ) : (
        <>
          <Text testID="scr-20-price" style={[styles.price, { color: palette.text }]}>{plan ? `${formatPrice(plan.amount, plan.currency)} / month` : " "}</Text>
          <View style={styles.benefits}>
            {BENEFITS.map((b) => (
              <Text key={b} style={[styles.benefit, { color: palette.textSecondary }]}>{b}</Text>
            ))}
          </View>
          <Pressable
            testID="scr-20-consent-checkbox"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            onPress={() => setConsent((c) => !c)}
            style={styles.consent}
          >
            <Text style={[styles.small, { color: palette.text }]}>{consent ? "☑" : "☐"}  Renews monthly until cancelled</Text>
          </Pressable>
          <Button testID="scr-20-checkout-btn" label={busy ? "Opening PayPal…" : "Continue with PayPal"} variant="primary" size="lg" disabled={busy || !plan} onPress={checkout} />
          {PAYMENTS_ARE_TEST_ONLY ? <Text testID="scr-20-test-payments-note" style={[styles.note, { color: palette.textSecondary }]}>{TEST_PAYMENTS_NOTICE}</Text> : null}
        </>
      )}
      {message ? <Text testID="scr-20-message" style={[styles.small, { color: palette.textSecondary }]}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing.xl, gap: Spacing.lg },
  title: { ...Typography.h2, textAlign: "center" },
  price: { ...Typography.subtitle, textAlign: "center" },
  benefits: { gap: Spacing.xs, alignItems: "center" },
  benefit: { ...Typography.body },
  consent: { paddingVertical: Spacing.sm },
  small: { ...Typography.bodySmall, textAlign: "center" },
  note: { ...Typography.bodySmall, textAlign: "center" },
});
