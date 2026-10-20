import type { User } from "@supabase/supabase-js";

export interface RouterLike {
  canGoBack?: () => boolean;
  back: () => void;
  replace: (href: any) => void;
  push: (href: any) => void;
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  accessibilityLabel?: string;
}

/**
 * Predictable back navigation helper across mobile stacks and web deep-links/refreshes.
 * When navigation history has a previous entry (`router.canGoBack() === true`), pops the stack;
 * otherwise replaces with a deterministic fallback route (`fallbackHref`) so the Back button is never inert.
 */
export function navigateBackOrFallback(
  router: RouterLike,
  fallbackHref: string = "/(tabs)/people"
): "back" | "fallback" {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return "back";
    }
  } catch {
    // Fallback if navigation state is not initialized
  }
  router.replace(fallbackHref as any);
  return "fallback";
}

/**
 * Checks whether a Supabase user holds a trusted `moderator` or `admin` role claim.
 * Fails closed (`false`) for unauthenticated or standard authenticated accounts.
 */
export function isModeratorRole(user: User | null | undefined): boolean {
  if (!user) {
    return false;
  }
  const appRole = user.app_metadata?.role;
  const userRole = user.user_metadata?.role;
  return (
    appRole === "moderator" ||
    appRole === "admin" ||
    userRole === "moderator" ||
    userRole === "admin"
  );
}

export const PUBLIC_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "public-home",
    label: "Overview",
    href: "/(public)",
    accessibilityLabel: "Humbble overview landing page",
  },
  {
    id: "public-pricing",
    label: "Pricing",
    href: "/(public)/pricing",
    accessibilityLabel: "Pricing and tier comparison",
  },
  {
    id: "public-terms",
    label: "Terms",
    href: "/(public)/legal/terms-of-service",
    accessibilityLabel: "Terms of Service",
  },
  {
    id: "public-privacy",
    label: "Privacy",
    href: "/(public)/legal/privacy-notice",
    accessibilityLabel: "Privacy Notice",
  },
] as const;

export const DATING_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "dating-people",
    label: "People",
    href: "/(tabs)/people",
    accessibilityLabel: "People swipe deck",
  },
  {
    id: "dating-discover",
    label: "Discover",
    href: "/(tabs)/discover",
    accessibilityLabel: "Discover recommendations",
  },
  {
    id: "dating-likes",
    label: "Liked You",
    href: "/(tabs)",
    accessibilityLabel: "Liked You incoming likes",
  },
  {
    id: "dating-chats",
    label: "Chats",
    href: "/(tabs)/(chats)",
    accessibilityLabel: "Chats and active matches",
  },
  {
    id: "dating-profile",
    label: "Profile",
    href: "/(tabs)/profile",
    accessibilityLabel: "Your profile and settings",
  },
] as const;

export const ONBOARDING_STEP_ITEMS: readonly (NavItem & { step: number })[] = [
  {
    id: "onboarding-basics",
    step: 1,
    label: "1. Basics",
    href: "/(onboarding)/basics",
    accessibilityLabel: "Onboarding Step 1: Basics",
  },
  {
    id: "onboarding-intentions",
    step: 2,
    label: "2. Intentions",
    href: "/(onboarding)/intentions",
    accessibilityLabel: "Onboarding Step 2: Relationship Intentions",
  },
  {
    id: "onboarding-photos",
    step: 3,
    label: "3. Photos & Prompts",
    href: "/(onboarding)/photos-prompts",
    accessibilityLabel: "Onboarding Step 3: Photos and Prompts",
  },
  {
    id: "onboarding-verify",
    step: 4,
    label: "4. Verification",
    href: "/(onboarding)/verify",
    accessibilityLabel: "Onboarding Step 4: Selfie Liveness Verification",
  },
] as const;

export const SETTINGS_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "settings-main",
    label: "Settings",
    href: "/(tabs)/profile/settings",
    accessibilityLabel: "Privacy, notification and safety settings",
  },
  {
    id: "settings-privacy-delete",
    label: "Data & Delete",
    href: "/(tabs)/profile/privacy-delete",
    accessibilityLabel: "Self-service data export and account deletion",
  },
  {
    id: "settings-upgrade",
    label: "Reserve Upgrade",
    href: "/(paywall)/upgrade",
    accessibilityLabel: "Humbble Reserve upgrade paywall",
  },
  {
    id: "settings-billing",
    label: "Billing",
    href: "/(paywall)/billing",
    accessibilityLabel: "Subscription billing and cancellation",
  },
  {
    id: "settings-report",
    label: "Safety Report",
    href: "/(safety)/report-modal",
    accessibilityLabel: "Block and report safety modal",
  },
] as const;

export const MODERATION_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "moderation-queue",
    label: "T&S Queue",
    href: "/(admin)/moderation",
    accessibilityLabel: "Trust and Safety moderation queue",
  },
  {
    id: "moderation-sample-case",
    label: "Case Inspector",
    href: "/(admin)/moderation/case-101",
    accessibilityLabel: "Moderation case detail inspector",
  },
] as const;
