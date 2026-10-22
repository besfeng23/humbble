import React from "react";
import { Pressable, Text } from "react-native";
import renderer, { act } from "react-test-renderer";

import AdminLayout from "@/app/(admin)/_layout";
import ModerationCaseDetailScreen from "@/app/(admin)/moderation/[caseId]";
import ModerationQueueScreen from "@/app/(admin)/moderation/index";
import OnboardingStackLayout from "@/app/(onboarding)/_layout";
import OnboardingBasicsScreen from "@/app/(onboarding)/basics";
import OnboardingIntentionsScreen from "@/app/(onboarding)/intentions";
import OnboardingPhotosPromptsScreen from "@/app/(onboarding)/photos-prompts";
import OnboardingVerifyScreen from "@/app/(onboarding)/verify";
import PaywallStackLayout from "@/app/(paywall)/_layout";
import SubscriptionBillingScreen from "@/app/(paywall)/billing";
import ReserveUpgradePaywallScreen from "@/app/(paywall)/upgrade";
import PublicStackLayout from "@/app/(public)/_layout";
import ConversionLandingScreen from "@/app/(public)/index";
import LegalDocumentScreen from "@/app/(public)/legal/[slug]";
import PricingScreen from "@/app/(public)/pricing";
import SafetyStackLayout from "@/app/(safety)/_layout";
import BlockAndReportModalScreen from "@/app/(safety)/report-modal";
import ChatsStackLayout from "@/app/(tabs)/(chats)/_layout";
import ConversationIdScreen from "@/app/(tabs)/(chats)/[conversationId]";
import ChatScreen from "@/app/(tabs)/(chats)/chatScreen";
import ChatsInboxScreen from "@/app/(tabs)/(chats)/index";
import TabLayout from "@/app/(tabs)/_layout";
import DiscoverScreen from "@/app/(tabs)/discover";
import ProfileInspectorScreen from "@/app/(tabs)/discover/[id]";
import DiscoveryFiltersScreen from "@/app/(tabs)/discover/filters";
import LikedYouScreen from "@/app/(tabs)/index";
import PeopleScreen from "@/app/(tabs)/people";
import ProfileScreen from "@/app/(tabs)/profile";
import PrivacyExportAndDeleteScreen from "@/app/(tabs)/profile/privacy-delete";
import PrivacyAndSafetySettingsScreen from "@/app/(tabs)/profile/settings";
import AuthStackLayout from "@/app/auth/_layout";
import PasswordRecoveryScreen from "@/app/auth/recovery";
import SigninScreen from "@/app/auth/signin";
import SignupScreen from "@/app/auth/signup";
import CharScreen from "@/app/charscreenf";
import {
  AuthGuard,
  AuthLayout,
  DatingLayout,
  ModerationLayout,
  OnboardingLayout,
  PublicLayout,
  ResponsiveNavHeader,
  SettingsLayout,
  isModeratorRole,
  navigateBackOrFallback,
} from "@/components/layout";
import {
  EmptyState,
  FailureState,
  FormStateView,
  PendingState,
  SuccessState,
} from "@/components/state";
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Mock expo-router deterministically without requiring a live navigation container
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = false;
let mockLocalSearchParams: Record<string, string> = {};

jest.mock("expo-router", () => {
  const ReactActual = require("react");
  const { View: RNView, Text: RNText } = require("react-native");

  const MockRedirect = ({ href }: { href: string }) =>
    ReactActual.createElement(
      RNView,
      { testID: "mock-redirect", accessibilityLabel: `redirect:${href}` },
      ReactActual.createElement(RNText, null, `Redirect:${href}`)
    );

  const MockStack = ({ children }: { children?: React.ReactNode }) =>
    ReactActual.createElement(RNView, { testID: "mock-stack" }, children);
  MockStack.Screen = ({
    name,
    options,
  }: {
    name: string;
    options?: Record<string, unknown>;
  }) =>
    ReactActual.createElement(RNView, {
      testID: `stack-screen-${name}`,
      accessibilityLabel: name,
      accessibilityHint: options?.href === null ? "hidden" : undefined,
    });

  const MockTabs = ({ children }: { children?: React.ReactNode }) =>
    ReactActual.createElement(RNView, { testID: "mock-tabs" }, children);
  MockTabs.Screen = ({
    name,
    options,
  }: {
    name: string;
    options?: Record<string, unknown>;
  }) =>
    ReactActual.createElement(RNView, {
      testID: `tabs-screen-${name}`,
      accessibilityLabel: name,
      accessibilityHint: options?.href === null ? "hidden" : "visible-tab",
    });

  const MockLink = ({
    href,
    children,
  }: {
    href: string;
    children?: React.ReactNode;
  }) =>
    ReactActual.createElement(
      RNView,
      { testID: `mock-link-${href}` },
      children
    );

  return {
    Redirect: MockRedirect,
    Stack: MockStack,
    Tabs: MockTabs,
    Link: MockLink,
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
      canGoBack: () => mockCanGoBack,
    }),
    useSegments: () => [],
    useLocalSearchParams: () => mockLocalSearchParams,
    useGlobalSearchParams: () => mockLocalSearchParams,
  };
});

// Mock AuthProvider hook so tests never require a live Supabase project
const mockSignOut = jest.fn(async () => {});
let mockAuthState: {
  session: any;
  user: any;
  loading: boolean;
  signOut: () => Promise<void>;
} = {
  session: null,
  user: null,
  loading: false,
  signOut: mockSignOut,
};

jest.mock("@expo/vector-icons", () => {
  const ReactActual = require("react");
  const { Text: RNText } = require("react-native");
  const createMockIcon = (family: string) => {
    const MockIcon = ({ name }: { name?: string }) =>
      ReactActual.createElement(
        RNText,
        { testID: `icon-${family}-${name ?? "default"}` },
        `${family}:${name ?? ""}`
      );
    MockIcon.displayName = `MockIcon(${family})`;
    return MockIcon;
  };
  return {
    AntDesign: createMockIcon("AntDesign"),
    EvilIcons: createMockIcon("EvilIcons"),
    FontAwesome: createMockIcon("FontAwesome"),
    FontAwesome6: createMockIcon("FontAwesome6"),
    Ionicons: createMockIcon("Ionicons"),
    MaterialCommunityIcons: createMockIcon("MaterialCommunityIcons"),
    MaterialIcons: createMockIcon("MaterialIcons"),
    Octicons: createMockIcon("Octicons"),
  };
});

jest.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: false,
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
  registerSupabaseAppStateListener: jest.fn(),
  cleanupSupabaseAppStateListener: jest.fn(),
}));

jest.mock("@/lib/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuthState,
}));

describe("PR P1-03 — Reusable Pending / Success / Failure / Empty / FormState Components", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders PendingState with progressbar role, busy state, and reduced-motion support", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PendingState
          testID="test-pending"
          title="Saving profile..."
          message="Syncing your draft."
          reduceMotion={true}
          fullScreen
        />
      );
    });

    const container = tree.root.find(
      (node) =>
        node.props.testID === "test-pending" &&
        node.props.accessibilityRole === "progressbar"
    );
    expect(container.props.accessibilityLiveRegion).toBe("polite");
    expect(container.props.accessibilityState).toEqual({ busy: true });
    expect(container.props.accessibilityValue).toEqual({
      text: "reduced-motion",
    });

    const spinner = tree.root.find(
      (node) => node.props.testID === "test-pending-spinner"
    );
    expect(spinner.props.animating).toBe(false);
  });

  it("renders SuccessState with polite alert role and avoids dead buttons when onAction is omitted", () => {
    const onAction = jest.fn();
    let tree!: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <SuccessState
          testID="test-success"
          title="Profile saved"
          message="Your changes are live."
          actionLabel="Unused label without handler"
          reduceMotion={true}
        />
      );
    });

    const alertNode = tree.root.find(
      (node) =>
        node.props.testID === "test-success" &&
        node.props.accessibilityRole === "alert"
    );
    expect(alertNode.props.accessibilityLiveRegion).toBe("polite");

    // Because `onAction` was not passed, no dead button is rendered
    const pressablesWithoutHandler = tree.root.findAllByType(Pressable);
    expect(pressablesWithoutHandler.length).toBe(0);

    // When `onAction` is provided, the CTA button renders and triggers callback
    act(() => {
      tree.update(
        <SuccessState
          testID="test-success"
          title="Profile saved"
          message="Your changes are live."
          actionLabel="Continue"
          onAction={onAction}
          reduceMotion={true}
        />
      );
    });

    const actionButton = tree.root.findByType(Pressable);
    act(() => {
      actionButton.props.onPress({} as any);
    });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("renders FailureState with assertive alert role and functional retry button", () => {
    const onRetry = jest.fn();
    let tree!: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <FailureState
          testID="test-failure"
          title="Connection lost"
          message="Unable to reach server."
          retryLabel="Retry Now"
          onRetry={onRetry}
          reduceMotion={true}
        />
      );
    });

    const alertNode = tree.root.find(
      (node) =>
        node.props.testID === "test-failure" &&
        node.props.accessibilityRole === "alert"
    );
    expect(alertNode.props.accessibilityLiveRegion).toBe("assertive");

    const retryPressable = tree.root.findByType(Pressable);
    act(() => {
      retryPressable.props.onPress({} as any);
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders EmptyState and transitions FormStateView across idle, pending, success, failure, and empty", () => {
    const onRetry = jest.fn();
    const onEmptyAction = jest.fn();
    let tree!: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <FormStateView
          testID="form-view"
          status="idle"
          onRetry={onRetry}
          emptyActionLabel="Reset Filters"
          onEmptyAction={onEmptyAction}
          reduceMotion={true}
        >
          <Text testID="form-child">Child Form Fields</Text>
        </FormStateView>
      );
    });

    expect(
      tree.root.find((n) => n.props.testID === "form-child")
    ).toBeDefined();

    act(() => {
      tree.update(
        <FormStateView
          testID="form-view"
          status="pending"
          pendingTitle="Submitting..."
          reduceMotion={true}
        >
          <Text testID="form-child">Child Form Fields</Text>
        </FormStateView>
      );
    });
    expect(
      tree.root.find((n) => n.props.testID === "form-view-pending")
    ).toBeDefined();

    act(() => {
      tree.update(
        <FormStateView
          testID="form-view"
          status="failure"
          failureMessage="Validation error"
          onRetry={onRetry}
          reduceMotion={true}
        />
      );
    });
    const failureNode = tree.root.find(
      (n) => n.props.testID === "form-view-failure"
    );
    expect(failureNode).toBeDefined();

    act(() => {
      tree.update(
        <FormStateView
          testID="form-view"
          status="success"
          successTitle="Done"
          reduceMotion={true}
        />
      );
    });
    expect(
      tree.root.find((n) => n.props.testID === "form-view-success")
    ).toBeDefined();

    act(() => {
      tree.update(
        <FormStateView
          testID="form-view"
          status="empty"
          emptyTitle="No results"
          emptyActionLabel="Reset Filters"
          onEmptyAction={onEmptyAction}
          reduceMotion={true}
        />
      );
    });
    expect(
      tree.root.find((n) => n.props.testID === "form-view-empty")
    ).toBeDefined();

    let emptyTree!: renderer.ReactTestRenderer;
    act(() => {
      emptyTree = renderer.create(
        <EmptyState
          testID="standalone-empty"
          title="No matches yet"
          message="Complete your prompts to get noticed."
          reduceMotion={true}
        />
      );
    });
    expect(emptyTree.root.findAllByType(Pressable).length).toBe(0);
  });
});

describe("PR P1-03 — AuthGuard & Protected-Route Redirects When Logged Out", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack = false;
    mockLocalSearchParams = {};
  });

  it("shows PendingState while auth session is loading and does not leak protected content", () => {
    mockAuthState = {
      session: null,
      user: null,
      loading: true,
      signOut: mockSignOut,
    };

    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AuthGuard testID="guard-test" reduceMotion={true}>
          <Text testID="secret-content">Secret Protected View</Text>
        </AuthGuard>
      );
    });

    expect(
      tree.root.find((n) => n.props.testID === "guard-test-loading")
    ).toBeDefined();
    expect(
      tree.root.findAll((n) => n.props.testID === "secret-content").length
    ).toBe(0);
  });

  it("redirects all protected route groups and screens to /auth/signin when logged out", () => {
    mockAuthState = {
      session: null,
      user: null,
      loading: false,
      signOut: mockSignOut,
    };

    const protectedElements = [
      { name: "TabLayout", element: <TabLayout /> },
      { name: "OnboardingStackLayout", element: <OnboardingStackLayout /> },
      { name: "OnboardingBasicsScreen", element: <OnboardingBasicsScreen /> },
      { name: "PaywallStackLayout", element: <PaywallStackLayout /> },
      {
        name: "ReserveUpgradePaywallScreen",
        element: <ReserveUpgradePaywallScreen />,
      },
      { name: "SafetyStackLayout", element: <SafetyStackLayout /> },
      {
        name: "BlockAndReportModalScreen",
        element: <BlockAndReportModalScreen />,
      },
      { name: "AdminLayout", element: <AdminLayout /> },
      { name: "ModerationQueueScreen", element: <ModerationQueueScreen /> },
      { name: "ChatsStackLayout", element: <ChatsStackLayout /> },
      { name: "ChatScreen", element: <ChatScreen /> },
      { name: "ProfileInspectorScreen", element: <ProfileInspectorScreen /> },
      { name: "DiscoveryFiltersScreen", element: <DiscoveryFiltersScreen /> },
      {
        name: "PrivacyAndSafetySettingsScreen",
        element: <PrivacyAndSafetySettingsScreen />,
      },
      {
        name: "PrivacyExportAndDeleteScreen",
        element: <PrivacyExportAndDeleteScreen />,
      },
      { name: "CharScreen", element: <CharScreen /> },
    ];

    for (const item of protectedElements) {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(item.element);
      });

      const redirectNode = tree.root.find(
        (node) => node.props.testID === "mock-redirect"
      );
      expect(redirectNode.props.accessibilityLabel).toBe(
        "redirect:/auth/signin"
      );
    }
  });

  it("blocks non-moderator authenticated users from ModerationLayout (403) and allows moderator role", () => {
    mockAuthState = {
      session: { access_token: "token-user" },
      user: {
        id: "user-1",
        email: "member@example.com",
        app_metadata: { role: "authenticated" },
        user_metadata: {},
      },
      loading: false,
      signOut: mockSignOut,
    };

    expect(isModeratorRole(mockAuthState.user)).toBe(false);

    let forbiddenTree!: renderer.ReactTestRenderer;
    act(() => {
      forbiddenTree = renderer.create(<ModerationQueueScreen />);
    });

    const forbiddenBanner = forbiddenTree.root.find(
      (node) =>
        node.props.testID === "scr-23-moderation-queue-guard-forbidden" &&
        node.props.accessibilityRole === "alert"
    );
    expect(forbiddenBanner).toBeDefined();

    // Clicking "Return to App" navigates back/fallback to /(tabs)/profile
    const returnBtn = forbiddenTree.root.findByType(Pressable);
    act(() => {
      returnBtn.props.onPress({} as any);
    });
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/profile");

    // Promote user to moderator role
    mockAuthState = {
      session: { access_token: "token-mod" },
      user: {
        id: "mod-1",
        email: "mod@example.com",
        app_metadata: { role: "moderator" },
        user_metadata: {},
      },
      loading: false,
      signOut: mockSignOut,
    };
    expect(isModeratorRole(mockAuthState.user)).toBe(true);

    let allowedTree!: renderer.ReactTestRenderer;
    act(() => {
      allowedTree = renderer.create(<ModerationQueueScreen />);
    });
    expect(
      allowedTree.root.find(
        (node) => node.props.testID === "scr-23-moderation-queue"
      )
    ).toBeDefined();
  });

  it("redirects guest-only routes (Signin, Signup, ConversionLanding) to /(tabs)/people when already authenticated", () => {
    mockAuthState = {
      session: { access_token: "valid-token" },
      user: { id: "user-1", email: "user@example.com" },
      loading: false,
      signOut: mockSignOut,
    };

    for (const el of [
      <SigninScreen key="signin" />,
      <SignupScreen key="signup" />,
      <ConversionLandingScreen key="landing" />,
    ]) {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(el);
      });
      const redirectNode = tree.root.find(
        (node) => node.props.testID === "mock-redirect"
      );
      expect(redirectNode.props.accessibilityLabel).toBe(
        "redirect:/(tabs)/people"
      );
    }
  });
});

describe("PR P1-03 — Predictable Back Behavior, Responsive Layouts & Keyboard/Touch Navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = {
      session: { access_token: "valid-token" },
      user: {
        id: "user-1",
        email: "user@example.com",
        app_metadata: { role: "moderator" },
      },
      loading: false,
      signOut: mockSignOut,
    };
  });

  it("pops navigation stack when canGoBack() is true and replaces with fallbackHref when false (deep-link/refresh)", () => {
    const fakeRouter = {
      canGoBack: () => true,
      back: jest.fn(),
      replace: jest.fn(),
      push: jest.fn(),
    };

    expect(navigateBackOrFallback(fakeRouter, "/(tabs)/people")).toBe("back");
    expect(fakeRouter.back).toHaveBeenCalledTimes(1);
    expect(fakeRouter.replace).not.toHaveBeenCalled();

    const deepLinkRouter = {
      canGoBack: () => false,
      back: jest.fn(),
      replace: jest.fn(),
      push: jest.fn(),
    };
    expect(navigateBackOrFallback(deepLinkRouter, "/(tabs)/profile")).toBe(
      "fallback"
    );
    expect(deepLinkRouter.back).not.toHaveBeenCalled();
    expect(deepLinkRouter.replace).toHaveBeenCalledWith("/(tabs)/profile");
  });

  it("supports keyboard focus rings and touch navigation on ResponsiveNavHeader", () => {
    mockCanGoBack = false;
    let tree!: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <ResponsiveNavHeader
          testID="header-test"
          title="Test Section"
          subtitle="Subtitle"
          showBack
          fallbackHref="/(tabs)/profile"
          navItems={[
            { id: "tab-1", label: "Tab One", href: "/(tabs)/people" },
            { id: "tab-2", label: "Tab Two", href: "/(tabs)/discover" },
          ]}
          activeNavId="tab-1"
          reduceMotion={true}
        />
      );
    });

    const backBtn = tree.root.find(
      (n) =>
        n.type === Pressable &&
        n.props.testID === "header-test-back-button"
    );
    act(() => {
      backBtn.props.onFocus({} as any);
      backBtn.props.onPress({} as any);
      backBtn.props.onBlur({} as any);
    });
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/profile");

    const secondTab = tree.root.find(
      (n) =>
        n.type === Pressable && n.props.testID === "header-test-nav-tab-2"
    );
    expect(secondTab.props.accessibilityRole).toBe("tab");
    expect(secondTab.props.accessibilityState).toEqual({ selected: false });

    act(() => {
      secondTab.props.onFocus({} as any);
      secondTab.props.onPress({} as any);
      secondTab.props.onBlur({} as any);
    });
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/discover");
  });

  it("adapts DatingLayout across mobile (sm) and desktop (lg) viewports", () => {
    // Mobile viewport (375px)
    let mobileTree!: renderer.ReactTestRenderer;
    act(() => {
      mobileTree = renderer.create(
        <DatingLayout
          testID="dating-mobile"
          viewportWidth={375}
          reduceMotion={true}
        >
          <Text>Mobile Content</Text>
        </DatingLayout>
      );
    });
    expect(
      mobileTree.root.findAll(
        (n) => n.props.testID === "dating-mobile-desktop-nav"
      ).length
    ).toBe(0);

    // Desktop viewport (1024px)
    let desktopTree!: renderer.ReactTestRenderer;
    act(() => {
      desktopTree = renderer.create(
        <DatingLayout
          testID="dating-desktop"
          viewportWidth={1024}
          activeNavId="dating-people"
          reduceMotion={true}
        >
          <Text>Desktop Content</Text>
        </DatingLayout>
      );
    });
    expect(
      desktopTree.root.find(
        (n) => n.props.testID === "dating-desktop-desktop-nav"
      )
    ).toBeDefined();
  });

  it("renders all 6 shared layouts (Public, Auth, Onboarding, Dating, Settings, Moderation)", () => {
    // Public, Onboarding, Dating, Settings, Moderation with authenticated moderator session
    const layouts = [
      <PublicLayout key="public" testID="layout-public" reduceMotion={true}>
        <Text>Public</Text>
      </PublicLayout>,
      <OnboardingLayout
        key="onboarding"
        testID="layout-onboarding"
        step={2}
        title="Intentions"
        reduceMotion={true}
      >
        <Text>Onboarding</Text>
      </OnboardingLayout>,
      <DatingLayout key="dating" testID="layout-dating" reduceMotion={true}>
        <Text>Dating</Text>
      </DatingLayout>,
      <SettingsLayout
        key="settings"
        testID="layout-settings"
        title="Settings"
        reduceMotion={true}
      >
        <Text>Settings</Text>
      </SettingsLayout>,
      <ModerationLayout
        key="moderation"
        testID="layout-moderation"
        title="Moderation"
        reduceMotion={true}
      >
        <Text>Moderation</Text>
      </ModerationLayout>,
    ];

    for (const layoutElement of layouts) {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(layoutElement);
      });
      expect(tree.toJSON()).not.toBeNull();
    }

    // AuthLayout with logged-out session
    mockAuthState = {
      session: null,
      user: null,
      loading: false,
      signOut: mockSignOut,
    };
    let authTree!: renderer.ReactTestRenderer;
    act(() => {
      authTree = renderer.create(
        <AuthLayout
          testID="layout-auth"
          heroTitle="Welcome"
          heroSubtitle="Subtitle"
          formTitle="LOGIN"
          reduceMotion={true}
        >
          <Text>Auth</Text>
        </AuthLayout>
      );
    });
    expect(
      authTree.root.find((n) => n.props.testID === "layout-auth-form-title")
    ).toBeDefined();
  });
});

describe("PR P1-03 — Route Smoke Tests & No Dead Buttons Verification (SCR-01..SCR-24)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack = false;
    mockLocalSearchParams = { slug: "terms-of-service", id: "1", caseId: "case-101" };
  });

  it("verifies ChatsStackLayout registers chatScreen (Amendment A4 casing fix) and [conversationId]", () => {
    mockAuthState = {
      session: { access_token: "token" },
      user: { id: "u1" },
      loading: false,
      signOut: mockSignOut,
    };

    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ChatsStackLayout />);
    });

    const chatScreenEntry = tree.root.find(
      (n) => n.props.testID === "stack-screen-chatScreen"
    );
    expect(chatScreenEntry).toBeDefined();
    expect(
      tree.root.findAll((n) => n.props.testID === "stack-screen-chatscreen")
        .length
    ).toBe(0);
    expect(
      tree.root.find((n) => n.props.testID === "stack-screen-[conversationId]")
    ).toBeDefined();
  });

  it("smoke-tests public and auth routes (SCR-01..SCR-06) with zero dead Pressables", () => {
    mockAuthState = {
      session: null,
      user: null,
      loading: false,
      signOut: mockSignOut,
    };

    const guestRoutes = [
      { id: "PublicStackLayout", element: <PublicStackLayout /> },
      { id: "SCR-01", element: <ConversionLandingScreen /> },
      { id: "SCR-02", element: <PricingScreen /> },
      { id: "SCR-03", element: <LegalDocumentScreen /> },
      { id: "AuthStackLayout", element: <AuthStackLayout /> },
      { id: "SCR-04", element: <SignupScreen /> },
      { id: "SCR-05", element: <SigninScreen /> },
      { id: "SCR-06", element: <PasswordRecoveryScreen /> },
    ];

    for (const route of guestRoutes) {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(route.element);
      });
      expect(tree.toJSON()).not.toBeNull();

      const pressables = tree.root.findAllByType(Pressable);
      for (const p of pressables) {
        expect(
          typeof p.props.onPress === "function" || p.props.disabled === true
        ).toBe(true);
      }
    }
  });

  it("smoke-tests authenticated onboarding, dating, settings, paywall, safety, and moderation routes (SCR-07..SCR-24) with zero dead Pressables", () => {
    mockAuthState = {
      session: { access_token: "token-mod" },
      user: {
        id: "mod-1",
        email: "mod@example.com",
        user_metadata: { full_name: "Suzzane" },
        app_metadata: { role: "moderator" },
      },
      loading: false,
      signOut: mockSignOut,
    };

    const authedRoutes = [
      { id: "OnboardingStackLayout", element: <OnboardingStackLayout /> },
      { id: "SCR-07", element: <OnboardingBasicsScreen /> },
      { id: "SCR-08", element: <OnboardingIntentionsScreen /> },
      { id: "SCR-09", element: <OnboardingPhotosPromptsScreen /> },
      { id: "SCR-10", element: <OnboardingVerifyScreen /> },
      { id: "TabLayout", element: <TabLayout /> },
      { id: "SCR-11-people", element: <PeopleScreen /> },
      { id: "SCR-11-discover", element: <DiscoverScreen /> },
      { id: "SCR-12", element: <ProfileInspectorScreen /> },
      { id: "SCR-13", element: <DiscoveryFiltersScreen /> },
      { id: "SCR-14", element: <LikedYouScreen /> },
      { id: "SCR-15", element: <ChatsInboxScreen /> },
      { id: "SCR-16-chatScreen", element: <ChatScreen /> },
      { id: "SCR-16-conversationId", element: <ConversationIdScreen /> },
      { id: "charscreenf", element: <CharScreen /> },
      { id: "SCR-17", element: <ProfileScreen /> },
      { id: "SCR-18", element: <PrivacyAndSafetySettingsScreen /> },
      { id: "SCR-19", element: <PrivacyExportAndDeleteScreen /> },
      { id: "PaywallStackLayout", element: <PaywallStackLayout /> },
      { id: "SCR-20", element: <ReserveUpgradePaywallScreen /> },
      { id: "SCR-21", element: <SubscriptionBillingScreen /> },
      { id: "SafetyStackLayout", element: <SafetyStackLayout /> },
      { id: "SCR-22", element: <BlockAndReportModalScreen /> },
      { id: "AdminLayout", element: <AdminLayout /> },
      { id: "SCR-23", element: <ModerationQueueScreen /> },
      { id: "SCR-24", element: <ModerationCaseDetailScreen /> },
    ];

    for (const route of authedRoutes) {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(route.element);
      });
      expect(tree.toJSON()).not.toBeNull();

      const pressables = tree.root.findAllByType(Pressable);
      for (const p of pressables) {
        expect(
          typeof p.props.onPress === "function" || p.props.disabled === true
        ).toBe(true);
      }
    }
  });
});

describe("SCR-03 Help & Appeals support contact", () => {
  it("shows tappable support email and phone plus operator details", async () => {
    const { Linking } = require("react-native");
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    mockLocalSearchParams = { slug: "complaints-handling" };
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<LegalDocumentScreen />);
    });
    const byId = (id: string) =>
      tree.root.find(
        (n) => n.props.testID === id && typeof n.props.onPress === "function",
      );
    await act(async () => {
      byId("scr-03-support-email").props.onPress();
      byId("scr-03-support-phone").props.onPress();
    });
    expect(openURL).toHaveBeenCalledWith(
      "mailto:markjohnsonbanatao888@gmail.com",
    );
    expect(openURL).toHaveBeenCalledWith("tel:+639681841001");
    const operator = tree.root.find(
      (n) => n.props.testID === "scr-03-operator" && n.type === Text,
    );
    expect(operator.props.children).toContain("JDR Blast Media");
    expect(operator.props.children).toContain("Muntinlupa City");
    expect(JSON.stringify(tree.toJSON())).not.toMatch(
      /support inbox is not configured/,
    );
    openURL.mockRestore();
    mockLocalSearchParams = {};
    await act(async () => tree.unmount());
  });

  it("hides the contact block on other policy documents", async () => {
    mockLocalSearchParams = { slug: "terms-of-service" };
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<LegalDocumentScreen />);
    });
    expect(
      tree.root.findAll((n) => n.props.testID === "scr-03-support-contact"),
    ).toHaveLength(0);
    mockLocalSearchParams = {};
    await act(async () => tree.unmount());
  });
});
