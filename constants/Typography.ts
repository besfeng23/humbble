import { Platform, type TextStyle } from "react-native";

/**
 * Editorial typography scale preserving Humbble's existing visual hierarchy:
 * - Display / hero titles: 32px bold (ThemedText.title, auth welcome headers)
 * - Section / card titles: 24px bold (PeopleCard name/age, form titles, Header logo)
 * - Subtitles / subheadings: 20px–22px semi-bold/bold (Profile name, Discover sections)
 * - Body / controls: 16px–18px regular/semi-bold/bold (inputs, buttons, body text)
 * - Secondary / alerts: 14px regular/medium (status banners, helper text)
 * - Captions / legal: 12px regular (terms & disclosures)
 */

export const FontFamilies = {
  editorial: Platform.select({
    web: \'"Cormorant Garamond", Georgia, serif\',
    ios: "Georgia",
    android: "serif",
    default: "serif",
  }),
  sans: Platform.select({
    ios: "System",
    android: "sans-serif",
    web: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    default: "System",
  }),
  mono: "SpaceMono",
} as const;

export const FontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  "2xl": 22,
  "3xl": 24,
  "4xl": 32,
} as const;

export const LineHeights = {
  xs: 18,
  sm: 20,
  md: 24,
  lg: 26,
  xl: 28,
  "2xl": 30,
  "3xl": 32,
  "4xl": 38,
} as const;

export const FontWeights = {
  light: "300" as const,
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  extrabold: "800" as const,
};

export const LetterSpacings = {
  tight: -0.2,
  normal: 0,
  wide: 0.5,
  wider: 1,
} as const;

export const Typography: Record<
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "subtitle"
  | "body"
  | "bodySemiBold"
  | "bodySmall"
  | "button"
  | "buttonLarge"
  | "label"
  | "caption"
  | "link",
  TextStyle
> = {
  display: {
    fontFamily: FontFamilies.editorial,
    fontSize: FontSizes["4xl"],
    lineHeight: LineHeights["4xl"],
    fontWeight: FontWeights.bold,
    letterSpacing: LetterSpacings.tight,
  },
  h1: {
    fontFamily: FontFamilies.editorial,
    fontSize: FontSizes["3xl"],
    lineHeight: LineHeights["3xl"],
    fontWeight: FontWeights.bold,
    letterSpacing: LetterSpacings.wider,
  },
  h2: {
    fontFamily: FontFamilies.editorial,
    fontSize: FontSizes["2xl"],
    lineHeight: LineHeights["2xl"],
    fontWeight: FontWeights.semibold,
    letterSpacing: LetterSpacings.normal,
  },
  h3: {
    fontFamily: FontFamilies.editorial,
    fontSize: FontSizes.xl,
    lineHeight: LineHeights.xl,
    fontWeight: FontWeights.bold,
    letterSpacing: LetterSpacings.normal,
  },
  subtitle: {
    fontFamily: FontFamilies.editorial,
    fontSize: FontSizes.lg,
    lineHeight: LineHeights.lg,
    fontWeight: FontWeights.extrabold,
    letterSpacing: LetterSpacings.normal,
  },
  body: {
    fontSize: FontSizes.md,
    lineHeight: LineHeights.md,
    fontWeight: FontWeights.regular,
  },
  bodySemiBold: {
    fontSize: FontSizes.md,
    lineHeight: LineHeights.md,
    fontWeight: FontWeights.semibold,
  },
  bodySmall: {
    fontSize: FontSizes.sm,
    lineHeight: LineHeights.sm,
    fontWeight: FontWeights.regular,
  },
  button: {
    fontSize: FontSizes.md,
    lineHeight: LineHeights.md,
    fontWeight: FontWeights.bold,
    letterSpacing: LetterSpacings.wide,
  },
  buttonLarge: {
    fontSize: FontSizes.lg,
    lineHeight: LineHeights.lg,
    fontWeight: FontWeights.bold,
    letterSpacing: LetterSpacings.wide,
  },
  label: {
    fontSize: FontSizes.sm,
    lineHeight: LineHeights.sm,
    fontWeight: FontWeights.semibold,
  },
  caption: {
    fontSize: FontSizes.xs,
    lineHeight: LineHeights.xs,
    fontWeight: FontWeights.regular,
  },
  link: {
    fontSize: FontSizes.md,
    lineHeight: LineHeights["2xl"],
    fontWeight: FontWeights.medium,
  },
};
