import React from "react";
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import renderer, { act } from "react-test-renderer";

import {
  AccessibleContrastPairs,
  Breakpoints,
  Colors,
  MotionDurations,
  MotionTransforms,
  Radii,
  Spacing,
  TouchTargets,
  Typography,
  getBreakpointForWidth,
  getContrastRatio,
  getMotionConfig,
  isWidthAtLeast,
  meetsWcagAA,
  resolveAnimationDuration,
  useReducedMotion,
} from "@/constants";
import {
  Button,
  Card,
  Dialog,
  ProfileMedia,
  TextField,
  Toast,
} from "@/components/ui";

describe("Design Tokens & WCAG 2.2 AA Contrast Verification", () => {
  it("computes accurate WCAG 2.2 relative luminance and contrast ratios", () => {
    expect(getContrastRatio("#FFFFFF", "#000000")).toBe(21);
    expect(getContrastRatio("#11181C", "#FFFFFF")).toBe(17.93);
    expect(getContrastRatio("#1A1A1A", "#FFD600")).toBe(12.32);
    expect(getContrastRatio("#1A1A1A", "#FFA600")).toBe(8.87);
  });

  it("verifies all declared AccessibleContrastPairs meet WCAG 2.2 AA thresholds", () => {
    expect(AccessibleContrastPairs.length).toBeGreaterThanOrEqual(20);

    for (const pair of AccessibleContrastPairs) {
      const ratio = getContrastRatio(pair.foreground, pair.background);
      expect(ratio).toBeGreaterThanOrEqual(pair.minRequiredRatio);
      expect(meetsWcagAA(pair.foreground, pair.background, pair.usage)).toBe(
        true
      );
    }
  });

  it("preserves existing Colors.light and Colors.dark keys used by useThemeColor", () => {
    const requiredKeys = [
      "text",
      "background",
      "tint",
      "icon",
      "tabIconDefault",
      "tabIconSelected",
    ] as const;

    for (const key of requiredKeys) {
      expect(typeof Colors.light[key]).toBe("string");
      expect(typeof Colors.dark[key]).toBe("string");
    }
  });

  it("exposes typography, spacing, radii, and responsive breakpoint helpers", () => {
    expect(Typography.display.fontSize).toBe(32);
    expect(Typography.h1.fontSize).toBe(24);
    expect(Typography.body.fontSize).toBe(16);
    expect(Spacing.xl).toBe(16);
    expect(TouchTargets.wcagMinimum).toBeGreaterThanOrEqual(24);
    expect(TouchTargets.minimum).toBeGreaterThanOrEqual(44);
    expect(Radii.pill).toBe(30);
    expect(Radii.lg).toBe(12);

    expect(getBreakpointForWidth(320)).toBe("xs");
    expect(getBreakpointForWidth(375)).toBe("sm");
    expect(getBreakpointForWidth(768)).toBe("md");
    expect(getBreakpointForWidth(1024)).toBe("lg");
    expect(getBreakpointForWidth(1440)).toBe("xl");
    expect(isWidthAtLeast(800, "md")).toBe(true);
    expect(isWidthAtLeast(350, "md")).toBe(false);
    expect(Breakpoints.md).toBe(768);
  });

  it("resolves reduced-motion config and animation durations", () => {
    const normalMotion = getMotionConfig(false);
    expect(normalMotion.shouldAnimate).toBe(true);
    expect(normalMotion.durationNormal).toBe(MotionDurations.normal);
    expect(normalMotion.pressedScale).toBe(MotionTransforms.pressedScale);
    expect(resolveAnimationDuration(250, false)).toBe(250);

    const reducedMotion = getMotionConfig(true);
    expect(reducedMotion.shouldAnimate).toBe(false);
    expect(reducedMotion.durationFast).toBe(0);
    expect(reducedMotion.durationNormal).toBe(0);
    expect(reducedMotion.durationSlow).toBe(0);
    expect(reducedMotion.pressedScale).toBe(1);
    expect(resolveAnimationDuration(250, true)).toBe(0);
  });
});

describe("Button primitive", () => {
  it("renders with default accessibilityRole, accessibilityLabel, and accessible contrast", () => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Button testID="primary-btn" onPress={onPress}>
          Continue
        </Button>
      );
    });

    const pressable = tree.root.findByType(Pressable);
    expect(pressable.props.accessibilityRole).toBe("button");
    expect(pressable.props.accessibilityLabel).toBe("Continue");
    expect(pressable.props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });

    act(() => {
      pressable.props.onPress({} as any);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("respects disabled and loading states and blocks onPress", () => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Button testID="disabled-btn" disabled onPress={onPress}>
          Submit
        </Button>
      );
    });

    const pressable = tree.root.findByType(Pressable);
    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.accessibilityState).toEqual({
      disabled: true,
      busy: false,
    });

    act(() => {
      pressable.props.onPress({} as any);
    });
    expect(onPress).not.toHaveBeenCalled();

    act(() => {
      tree.update(
        <Button testID="loading-btn" loading onPress={onPress}>
          Submit
        </Button>
      );
    });
    const loadingPressable = tree.root.findByType(Pressable);
    expect(loadingPressable.props.disabled).toBe(true);
    expect(loadingPressable.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
  });

  it("applies focus ring, pressed styles, and respects reduced motion", () => {
    let normalTree!: renderer.ReactTestRenderer;
    let reducedTree!: renderer.ReactTestRenderer;

    act(() => {
      normalTree = renderer.create(
        <Button testID="normal-btn" reduceMotion={false} focused>
          Normal Motion
        </Button>
      );
      reducedTree = renderer.create(
        <Button testID="reduced-btn" reduceMotion={true}>
          Reduced Motion
        </Button>
      );
    });

    const normalPressable = normalTree.root.findByType(Pressable);
    const normalPressedStyle = StyleSheet.flatten(
      normalPressable.props.style({ pressed: true })
    );
    expect(normalPressedStyle.borderWidth).toBe(2);
    expect(normalPressedStyle.borderColor).toBe(Colors.light.focusRing);
    expect(normalPressedStyle.transform).toEqual([
      { scale: MotionTransforms.pressedScale },
    ]);

    const reducedPressable = reducedTree.root.findByType(Pressable);
    const reducedPressedStyle = StyleSheet.flatten(
      reducedPressable.props.style({ pressed: true })
    );
    expect(reducedPressedStyle.transform).toEqual([{ scale: 1 }]);
  });
});

describe("TextField primitive", () => {
  it("renders label, associates input accessibilityLabelledBy, and handles helper text", () => {
    const onChangeText = jest.fn();
    let tree!: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <TextField
          testID="email-field"
          label="Email Address"
          helperText="We never share your email."
          required
          value=""
          onChangeText={onChangeText}
        />
      );
    });

    const input = tree.root.findByType(TextInput);
    expect(input.props.accessibilityLabel).toBe("Email Address");
    expect(input.props.accessibilityLabelledBy).toBe("email-field-label");
    expect(input.props.accessibilityHint).toBe("We never share your email.");
    expect(input.props.accessibilityState).toEqual({ disabled: false });

    const helper = tree.root.find(
      (node) =>
        node.type === Text && node.props.testID === "email-field-helper"
    );
    expect(helper.props.children).toBe("We never share your email.");
  });

  it("renders error message with accessibilityRole='alert' and polite live region", () => {
    let tree!: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <TextField
          testID="password-field"
          label="Password"
          error="Password must be at least 6 characters."
          disabled
        />
      );
    });

    const input = tree.root.findByType(TextInput);
    expect(input.props.editable).toBe(false);
    expect(input.props.accessibilityState).toEqual({ disabled: true });

    const errorNode = tree.root.find(
      (node) =>
        node.type === Text && node.props.testID === "password-field-error"
    );
    expect(errorNode.props.accessibilityRole).toBe("alert");
    expect(errorNode.props.accessibilityLiveRegion).toBe("polite");
    expect(errorNode.props.children).toBe(
      "Password must be at least 6 characters."
    );
  });
});

describe("Card primitive", () => {
  it("renders static and interactive cards with disabled and reduced-motion states", () => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <Card
          testID="interactive-card"
          onPress={onPress}
          accessibilityLabel="Spotlight feature card"
          reduceMotion={true}
        />
      );
    });

    const pressable = tree.root.findByType(Pressable);
    expect(pressable.props.accessibilityRole).toBe("button");
    expect(pressable.props.accessibilityLabel).toBe("Spotlight feature card");

    const pressedStyle = StyleSheet.flatten(
      pressable.props.style({ pressed: true })
    );
    expect(pressedStyle.transform).toEqual([{ scale: 1 }]);

    act(() => {
      pressable.props.onPress({} as any);
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    act(() => {
      tree.update(
        <Card
          testID="interactive-card"
          onPress={onPress}
          disabled
          accessibilityLabel="Spotlight feature card"
        />
      );
    });

    const disabledPressable = tree.root.findByType(Pressable);
    expect(disabledPressable.props.accessibilityState).toEqual({
      disabled: true,
    });
    act(() => {
      disabledPressable.props.onPress({} as any);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("Dialog primitive", () => {
  it("renders modal dialog with accessible header, modal props, and reduced-motion animationType", () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    let tree!: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <Dialog
          testID="confirm-dialog"
          visible={true}
          title="Block User?"
          description="They will no longer be able to see your profile or message you."
          onClose={onClose}
          reduceMotion={true}
          primaryAction={{
            label: "Block",
            variant: "danger",
            onPress: onConfirm,
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: onClose,
          }}
        />
      );
    });

    const modal = tree.root.findByType(Modal);
    expect(modal.props.animationType).toBe("none");

    const dialogView = tree.root.find(
      (node) =>
        node.props.testID === "confirm-dialog" &&
        node.props.accessibilityViewIsModal === true
    );
    expect(dialogView.props.accessibilityViewIsModal).toBe(true);
    expect(dialogView.props.accessibilityLabel).toBe("Block User?");

    const titleNode = tree.root.find(
      (node) =>
        node.type === Text && node.props.testID === "confirm-dialog-title"
    );
    expect(titleNode.props.accessibilityRole).toBe("header");
    expect(titleNode.props.children).toBe("Block User?");

    const primaryBtn = tree.root.find(
      (node) =>
        node.type === Button &&
        node.props.testID === "confirm-dialog-primary-action"
    );
    act(() => {
      primaryBtn.props.onPress();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not render when visible is false", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Dialog visible={false} title="Hidden Dialog" />
      );
    });
    expect(tree.toJSON()).toBeNull();
  });
});

describe("Toast primitive", () => {
  it("renders alert role, live region, and dismiss action", () => {
    const onDismiss = jest.fn();
    let tree!: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <Toast
          testID="error-toast"
          variant="error"
          title="Sign in failed"
          message="Please check your credentials."
          onDismiss={onDismiss}
          reduceMotion={true}
        />
      );
    });

    const toastRoot = tree.root.find(
      (node) =>
        node.props.testID === "error-toast" &&
        node.props.accessibilityRole === "alert"
    );
    expect(toastRoot.props.accessibilityRole).toBe("alert");
    expect(toastRoot.props.accessibilityLiveRegion).toBe("assertive");
    expect(toastRoot.props.accessibilityLabel).toBe(
      "Sign in failed. Please check your credentials."
    );
    expect(toastRoot.props.accessibilityValue).toEqual({
      text: "reduced-motion",
    });

    const dismissBtn = tree.root.findByType(Pressable);
    expect(dismissBtn.props.accessibilityRole).toBe("button");
    expect(dismissBtn.props.accessibilityLabel).toBe("Dismiss notification");

    act(() => {
      dismissBtn.props.onPress({} as any);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("ProfileMedia surface primitive", () => {
  it("renders profile name, age, verified badge, and accessible label", () => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <ProfileMedia
          testID="profile-card"
          name="Suhani"
          age={25}
          subtitle="Manila • Long-term partner"
          verified={true}
          onPress={onPress}
          reduceMotion={true}
        />
      );
    });

    const rootPressable = tree.root.findByType(Pressable);
    expect(rootPressable.props.accessibilityRole).toBe("button");
    expect(rootPressable.props.accessibilityLabel).toBe(
      "Suhani, 25, Verified profile, Manila • Long-term partner"
    );

    const badge = tree.root.find(
      (node) =>
        node.props.testID === "profile-card-verified-badge" &&
        node.props.accessibilityLabel === "Verified"
    );
    expect(badge.props.accessibilityLabel).toBe("Verified");

    const placeholder = tree.root.find(
      (node) => node.props.testID === "profile-card-placeholder"
    );
    expect(placeholder).toBeDefined();

    act(() => {
      rootPressable.props.onPress({} as any);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("queries AccessibilityInfo.isReduceMotionEnabled in useReducedMotion hook", async () => {
    const spy = jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValueOnce(true);

    let capturedValue = false;
    function Probe() {
      capturedValue = useReducedMotion();
      return null;
    }

    await act(async () => {
      renderer.create(<Probe />);
    });

    expect(spy).toHaveBeenCalled();
    expect(capturedValue).toBe(true);
    spy.mockRestore();
  });
});
