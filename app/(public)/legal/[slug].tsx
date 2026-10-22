import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { PublicLayout } from "@/components/layout";
import { EmptyState } from "@/components/state";
import { Button, Card } from "@/components/ui";
import { Colors } from "@/constants/Colors";
import {
  LEGAL_ENTITY_ADDRESS,
  LEGAL_ENTITY_NAME,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_URL,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_URL,
} from "@/constants/Support";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

interface LegalDocumentContent {
  slug: string;
  title: string;
  shortLabel: string;
  effectiveDate: string;
  summary: string;
  sections: { heading: string; body: string }[];
  showSupportContact?: boolean;
}

const LEGAL_DOCUMENTS: Record<string, LegalDocumentContent> = {
  "terms-of-service": {
    slug: "terms-of-service",
    shortLabel: "Terms",
    title: "Terms of Service",
    effectiveDate: "Effective 20 October 2026",
    summary:
      "Governs use of Humbble for adults aged 18 and older in the Philippines initial launch market.",
    sections: [
      {
        heading: "1. Eligibility & 18+ Age Requirement",
        body: "You must be at least 18 years old to register, create a profile, or participate in discovery and messaging. Accounts suspected of underage use are immediately suspended.",
      },
      {
        heading: "2. Neutral Dating Platform Positioning",
        body: "Humbble is a mutual-consent adult dating application. It does not operate as a marriage broker or catalogue service.",
      },
      {
        heading: "3. Mutual Messaging & Safety Controls",
        body: "Mutual text messaging between matched users is free. Blocking and reporting tools are available on every profile and conversation at no cost.",
      },
    ],
  },
  "privacy-notice": {
    slug: "privacy-notice",
    shortLabel: "Privacy",
    title: "Privacy Notice (RA 10173 / Data Privacy Act)",
    effectiveDate: "Effective 20 October 2026",
    summary:
      "Explains how personal data, profile photos, verification status, and pseudonymous analytics are processed and how to exercise export and deletion rights.",
    sections: [
      {
        heading: "1. Data Minimization & Birth Date Privacy",
        body: "Your exact birth date is never disclosed to other users. Discovery views only display age or age range projections.",
      },
      {
        heading: "2. Liveness Verification Without Raw Biometric Retention",
        body: "Verification records only whether a check is not started, in progress, verified, unsuccessful, or under review, without retaining raw selfie images or biometric templates.",
      },
      {
        heading: "3. Self-Service Export & Account Deletion",
        body: "Authenticated users can request a portable data export or permanent account deletion from Privacy Settings at any time.",
      },
    ],
  },
  "community-standards": {
    slug: "community-standards",
    shortLabel: "Community standards",
    title: "Community Standards & Safety Guidelines",
    effectiveDate: "Effective 20 October 2026",
    summary:
      "Sets clear rules against harassment, financial solicitation/romance scams, impersonation, non-consensual content, and underage use.",
    sections: [
      {
        heading: "1. Zero Tolerance for Financial Solicitation & Scams",
        body: "Requests for money, off-platform financial transfers, or deceptive conduct trigger immediate anti-scam warnings and Trust & Safety review.",
      },
      {
        heading: "2. Reporting & 24-Hour Triage Target",
        body: "Use the Shield button on any profile or chat to block and report. Critical safety reports are prioritized by human moderators.",
      },
    ],
  },
  "complaints-handling": {
    slug: "complaints-handling",
    shortLabel: "Help & appeals",
    title: "Safety Help & Appeals",
    effectiveDate: "Effective 20 October 2026",
    summary: "How to report a safety concern or appeal a moderation decision.",
    sections: [
      {
        heading: "1. Report a safety concern",
        body: "Open Safety controls from a person's profile, match, or conversation to block, unmatch, or submit a private report. If your connection is unavailable, reports are saved on this device and retried with the same report identifier.",
      },
      {
        heading: "2. Appeal a moderation decision",
        body: "Contact us below with the case reference from your moderation or account-restriction notice.",
      },
    ],
    showSupportContact: true,
  },
  "refund-policy": {
    slug: "refund-policy",
    shortLabel: "Subscriptions",
    title: "Subscription, Renewal & Cancellation Disclosures",
    effectiveDate: "Effective 20 October 2026",
    summary:
      "Details monthly billing terms for Humbble Reserve (PH ₱599.00/month, US $29.99/month) and 2-click self-service cancellation.",
    sections: [
      {
        heading: "1. Server-Managed Monthly Plans",
        body: "Humbble Reserve is offered only as a monthly subscription (₱599.00/month in PH). No multi-month lock-in plans are sold.",
      },
      {
        heading: "2. Two-Click Cancellation",
        body: "Cancel renewal anytime in two clicks from the Billing screen. Entitlement remains active until the end of the paid period unless revoked for refund or abuse.",
      },
    ],
  },
};

export default function LegalDocumentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string }>();
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];

  const rawSlug =
    typeof params.slug === "string" && params.slug.trim().length > 0
      ? params.slug.trim()
      : "terms-of-service";
  const doc = LEGAL_DOCUMENTS[rawSlug];

  return (
    <PublicLayout
      testID="scr-03-legal"
      title={doc ? doc.title : "Policy Document"}
      subtitle="Policies & legal information"
      showBack
      fallbackHref="/(public)"
      activeNavId={
        rawSlug === "privacy-notice" ? "public-privacy" : "public-terms"
      }
    >
      <View style={styles.docSwitcher}>
        {Object.values(LEGAL_DOCUMENTS).map((item) => (
          <Button
            key={item.slug}
            testID={`scr-03-switch-${item.slug}`}
            label={item.shortLabel}
            variant={rawSlug === item.slug ? "primary" : "secondary"}
            size="sm"
            shape="pill"
            onPress={() =>
              router.replace(`/(public)/legal/${item.slug}` as any)
            }
          />
        ))}
      </View>

      {!doc ? (
        <EmptyState
          testID="scr-03-not-found"
          title="Policy document not found"
          message={`No policy document matched "${rawSlug}". Select Terms of Service below.`}
          actionLabel="View Terms of Service"
          onAction={() =>
            router.replace("/(public)/legal/terms-of-service" as any)
          }
        />
      ) : (
        <Card testID="scr-03-document-card" variant="elevated">
          <View style={styles.docBody}>
            <Text
              accessibilityRole="header"
              style={[styles.docTitle, { color: palette.text }]}
            >
              {doc.title}
            </Text>
            <Text
              testID="scr-03-effective-date"
              style={[styles.effectiveDate, { color: palette.warningText }]}
            >
              {doc.effectiveDate}
            </Text>
            <Text style={[styles.summary, { color: palette.textSecondary }]}>
              {doc.summary}
            </Text>

            {doc.sections.map((section) => (
              <View key={section.heading} style={styles.sectionBlock}>
                <Text
                  accessibilityRole="header"
                  style={[styles.sectionHeading, { color: palette.text }]}
                >
                  {section.heading}
                </Text>
                <Text
                  style={[styles.sectionText, { color: palette.textSecondary }]}
                >
                  {section.body}
                </Text>
              </View>
            ))}

            {doc.showSupportContact ? (
              <View testID="scr-03-support-contact" style={styles.contactBlock}>
                <Pressable
                  testID="scr-03-support-email"
                  accessibilityRole="link"
                  accessibilityLabel={`Email support at ${SUPPORT_EMAIL}`}
                  onPress={() => Linking.openURL(SUPPORT_EMAIL_URL)}
                  style={styles.contactRow}
                >
                  <Text style={[styles.contactLink, { color: palette.tint }]}>
                    {SUPPORT_EMAIL}
                  </Text>
                </Pressable>
                <Pressable
                  testID="scr-03-support-phone"
                  accessibilityRole="link"
                  accessibilityLabel={`Call support at ${SUPPORT_PHONE_DISPLAY}`}
                  onPress={() => Linking.openURL(SUPPORT_PHONE_URL)}
                  style={styles.contactRow}
                >
                  <Text style={[styles.contactLink, { color: palette.tint }]}>
                    {SUPPORT_PHONE_DISPLAY}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Text
              testID="scr-03-operator"
              style={[styles.operator, { color: palette.textSecondary }]}
            >
              {`Operated by ${LEGAL_ENTITY_NAME}, ${LEGAL_ENTITY_ADDRESS}`}
            </Text>
          </View>
        </Card>
      )}
    </PublicLayout>
  );
}

const styles = StyleSheet.create({
  docSwitcher: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  docBody: {
    gap: Spacing.lg,
  },
  docTitle: {
    ...Typography.h1,
  },
  effectiveDate: {
    ...Typography.label,
  },
  summary: {
    ...Typography.body,
  },
  sectionBlock: {
    gap: Spacing.xs,
  },
  sectionHeading: {
    ...Typography.h3,
  },
  sectionText: {
    ...Typography.bodySmall,
  },
  contactBlock: {
    gap: Spacing.xs,
  },
  contactRow: {
    minHeight: 44,
    justifyContent: "center",
  },
  contactLink: {
    ...Typography.body,
    textDecorationLine: "underline",
  },
  operator: {
    ...Typography.caption,
  },
});
