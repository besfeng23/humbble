import React, { useState } from "react";
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type ImageSourcePropType,
  type NativeSyntheticEvent,
  type StyleProp,
  type TargetedEvent,
  type ViewStyle,
} from "react-native";

import { Colors } from "@/constants/Colors";
import {
  MotionTransforms,
  getMotionConfig,
  useReducedMotion,
} from "@/constants/Motion";
import { Radii } from "@/constants/Radii";
import { Spacing } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { shadow } from "@/constants/Shadows";

export type ProfileMediaSize = "small" | "large" | "deck";

export interface ProfileMediaProps {
  /** Display name of the profile */
  name: string;
  /** Age or age bucket to display next to the name */
  age?: number | string;
  /** Optional subtitle (e.g., city/region or relationship intention) */
  subtitle?: string;
  /** Whether the profile has server-verified status */
  verified?: boolean;
  /** Image URI string or React Native ImageSourcePropType */
  imageUri?: string | null;
  imageSource?: ImageSourcePropType;
  /** Size preset matching UserCard ("small" | "large") or PeopleCard ("deck") */
  size?: ProfileMediaSize;
  /** Optional press handler for opening profile details */
  onPress?: (event: GestureResponderEvent) => void;
  /** Disables interaction when `onPress` is provided */
  disabled?: boolean;
  /** Controlled focus state */
  focused?: boolean;
  /** Override system reduced-motion setting */
  reduceMotion?: boolean;
  /** Explicit accessibility label override */
  accessibilityLabel?: string;
  /** Optional accessibility hint */
  accessibilityHint?: string;
  /** Optional trailing action slot (e.g., like icon button) */
  actionSlot?: React.ReactNode;
  /** Style override */
  style?: StyleProp<ViewStyle>;
  /** Test identifier */
  testID?: string;
}

export function ProfileMedia({
  name,
  age,
  subtitle,
  verified = false,
  imageUri,
  imageSource,
  size = "large",
  onPress,
  disabled = false,
  focused: focusedProp,
  reduceMotion: reduceMotionProp,
  accessibilityLabel,
  accessibilityHint,
  actionSlot,
  style,
  testID = "profile-media",
}: ProfileMediaProps) {
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const reduceMotion = useReducedMotion(reduceMotionProp);
  const motion = getMotionConfig(reduceMotion);
  const [internalFocused, setInternalFocused] = useState(false);

  const isFocused = focusedProp ?? internalFocused;

  const headingText = age !== undefined && age !== "" ? `${name}, ${age}` : name;
  const computedLabel =
    accessibilityLabel ??
    [
      headingText,
      verified ? "Verified profile" : null,
      subtitle ?? null,
    ]
      .filter(Boolean)
      .join(", ");

  const resolvedSource: ImageSourcePropType | undefined =
    imageSource ?? (imageUri ? { uri: imageUri } : undefined);

  const dimensions = SIZE_DIMENSIONS[size];

  const renderMediaContent = () => (
    <View
      style={[
        styles.mediaFrame,
        dimensions,
        { backgroundColor: palette.surfaceMuted },
      ]}
    >
      {resolvedSource ? (
        <ImageBackground
          testID={`${testID}-image`}
          source={resolvedSource}
          style={styles.imageBackground}
          imageStyle={styles.imageRadius}
          accessibilityRole="image"
          accessibilityLabel={computedLabel}
        >
          {renderOverlay()}
        </ImageBackground>
      ) : (
        <View
          testID={`${testID}-placeholder`}
          style={[
            styles.placeholderContainer,
            { backgroundColor: palette.secondary },
          ]}
        >
          <Text
            style={[
              styles.placeholderInitial,
              { color: palette.onSecondary },
            ]}
          >
            {name.trim().charAt(0).toUpperCase() || "?"}
          </Text>
          {renderOverlay()}
        </View>
      )}
    </View>
  );

  const renderOverlay = () => (
    <View
      testID={`${testID}-overlay`}
      style={[
        styles.infoSection,
        { backgroundColor: palette.mediaOverlay },
      ]}
    >
      <View style={styles.infoTextColumn}>
        <View style={styles.titleRow}>
          <Text
            testID={`${testID}-title`}
            numberOfLines={1}
            style={[
              size === "small" ? styles.titleSmall : styles.titleLarge,
              { color: palette.onMediaOverlay },
            ]}
          >
            {headingText}
          </Text>
          {verified ? (
            <View
              testID={`${testID}-verified-badge`}
              accessibilityLabel="Verified"
              style={[
                styles.verifiedBadge,
                { backgroundColor: palette.primary },
              ]}
            >
              <Text
                style={[
                  styles.verifiedBadgeText,
                  { color: palette.onPrimary },
                ]}
              >
                ✓ Verified
              </Text>
            </View>
          ) : null}
        </View>

        {subtitle ? (
          <Text
            testID={`${testID}-subtitle`}
            numberOfLines={1}
            style={[styles.subtitle, { color: palette.onMediaOverlay }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {actionSlot ? <View style={styles.actionSlot}>{actionSlot}</View> : null}
    </View>
  );

  if (onPress) {
    const handleFocus = (e: NativeSyntheticEvent<TargetedEvent>) => {
      setInternalFocused(true);
    };

    const handleBlur = (e: NativeSyntheticEvent<TargetedEvent>) => {
      setInternalFocused(false);
    };

    return (
      <Pressable
        testID={testID}
        disabled={disabled}
        onPress={(e) => {
          if (!disabled) {
            onPress(e);
          }
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        accessibilityRole="button"
        accessibilityLabel={computedLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        style={({ pressed }) => {
          const isActivePress = pressed && !disabled;
          return [
            styles.cardContainer,
            {
              backgroundColor: palette.surface,
              borderColor: isFocused ? palette.focusRing : palette.border,
              borderWidth: isFocused ? 2 : 1,
            },
            disabled ? { opacity: 0.6 } : undefined,
            isActivePress
              ? {
                  opacity: MotionTransforms.pressedOpacity,
                  transform: [{ scale: motion.pressedScale }],
                }
              : undefined,
            style,
          ];
        }}
      >
        {renderMediaContent()}
      </Pressable>
    );
  }

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={computedLabel}
      accessibilityHint={accessibilityHint}
      style={[
        styles.cardContainer,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          borderWidth: 1,
        },
        style,
      ]}
    >
      {renderMediaContent()}
    </View>
  );
}

const SIZE_DIMENSIONS: Record<ProfileMediaSize, ViewStyle> = {
  small: {
    width: 180,
    height: 220,
  },
  large: {
    width: 240,
    height: 300,
  },
  deck: {
    width: "100%",
    minHeight: 380,
  },
};

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: Radii.lg,
    overflow: "hidden",
    ...shadow({ y: 2, opacity: 0.15, radius: 4, elevation: 3 }),
  },
  mediaFrame: {
    borderRadius: Radii.md,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  imageBackground: {
    width: "100%",
    height: "100%",
    justifyContent: "flex-end",
  },
  imageRadius: {
    borderRadius: Radii.md,
  },
  placeholderContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing["5xl"],
  },
  placeholderInitial: {
    ...Typography.display,
    fontSize: 48,
    lineHeight: 56,
  },
  infoSection: {
    width: "100%",
    minHeight: 64,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoTextColumn: {
    flex: 1,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  titleLarge: {
    ...Typography.h1,
    letterSpacing: 0,
  },
  titleSmall: {
    ...Typography.subtitle,
  },
  subtitle: {
    ...Typography.bodySmall,
    marginTop: Spacing.xxs,
  },
  verifiedBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xxs,
    borderRadius: Radii.pill,
  },
  verifiedBadgeText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  actionSlot: {
    marginLeft: Spacing.md,
  },
});

export default ProfileMedia;
