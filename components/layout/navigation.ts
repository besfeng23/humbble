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
 * Checks whether a Supabase user holds the trusted `app_metadata.role = "moderator"` claim.
 * Fails closed (`false`) for unauthenticated or standard authenticated accounts.
 */
export function isModeratorRole(user: User | null | undefined): boolean {
  if (!user) {
    return false;
  }
  // Mirrors private.is_trusted_moderator(): only the server-assigned app_metadata claim counts. user_metadata is
  // member-editable and "admin" is not a moderation role. This is a UX gate only; every RPC re-checks in the database.
  return user.app_metadata?.role === "moderator";
}

export const PUBLIC_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "public-home",
    label: "Overview",
    href: "/(public)",
    accessibilityLabel: "Sincera overview landing page",
  },
  {
    id: "public-how",
    label: "How it works",
    href: "/(public)/how-it-works",
    accessibilityLabel: "How Sincera works",
  },
  {
    id: "public-contact",
    label: "Contact",
    href: "/(public)/contact-support",
    accessibilityLabel: "Sincera contact and support",
  },
  {
    id: "public-faq",
    label: "Help & FAQ",
    href: "/(public)/faq",
    accessibilityLabel: "Sincera help and frequently asked questions",
  },
  {
    id: "public-safety",
    label: "Safety",
    href: "/(public)/safety",
    accessibilityLabel: "Sincera safety guide",
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
    label: "Discover",
    href: "/(tabs)/people",
    accessibilityLabel: "People swipe deck",
  },
  {
    id: "dating-discover",
    label: "Explore",
    href: "/(tabs)/discover",
    accessibilityLabel: "Discover recommendations",
  },
  {
    id: "dating-likes",
    label: "Likes",
    href: "/(tabs)",
    accessibilityLabel: "Liked You incoming likes",
  },
  {
    id: "dating-chats",
    label: "Messages",
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
    label: "4. Verified badge (optional)",
    href: "/(onboarding)/verify",
    accessibilityLabel: "Onboarding Step 4 (optional): Get a Verified badge",
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
    id: "settings-blocked-users",
    label: "Blocked Users",
    href: "/(tabs)/profile/blocked-users",
    accessibilityLabel: "Review and unblock blocked accounts",
  },
  {
    id: "settings-privacy-delete",
    label: "Data requests",
    href: "/(tabs)/profile/privacy-delete",
    accessibilityLabel: "Request a data export or account deletion",
  },
  {
    id: "settings-upgrade",
    label: "Premium",
    href: "/(paywall)/upgrade",
    accessibilityLabel: "Sincera membership and proposed plans",
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
    id: "moderation-dashboard",
    label: "Overview",
    href: "/(admin)/dashboard",
    accessibilityLabel: "Trust and safety operations overview",
  },
  {
    id: "moderation-queue",
    label: "Moderation queue",
    href: "/(admin)/moderation",
    accessibilityLabel: "Trust and Safety moderation queue",
  },
] as const;
