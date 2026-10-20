/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * Preserves Humbble's warm editorial bumble-gold (#FFD600 / #FFA600) and deep charcoal (#1A1A1A / #11181C)
 * visual direction while enforcing WCAG 2.2 AA contrast ratios (>= 4.5:1 normal text, >= 3.0:1 large text & UI).
 */

const tintColorLight = "#0f0f0e";
const tintColorDark = "#fff";

export interface ThemeColorTokens {
  /** Primary body text color */
  text: string;
  /** Secondary / supporting text color (>= 4.5:1 on background and surface) */
  textSecondary: string;
  /** Muted / placeholder text color (>= 4.5:1 on background and surfaceMuted) */
  textMuted: string;
  /** Inverse text color (for dark surfaces in light mode or light surfaces in dark mode) */
  textInverse: string;
  /** Primary screen background */
  background: string;
  /** Elevated card or sheet surface */
  surface: string;
  /** Subtle input or secondary container surface */
  surfaceMuted: string;
  /** Elevated modal/dialog surface */
  surfaceElevated: string;
  /** Primary navigation and interactive tint */
  tint: string;
  /** Default icon color */
  icon: string;
  /** Unselected tab bar icon color */
  tabIconDefault: string;
  /** Selected tab bar icon color */
  tabIconSelected: string;
  /** Warm gold primary brand fill (#FFD600) */
  primary: string;
  /** Pressed state for primary brand fill */
  primaryPressed: string;
  /** Accessible foreground text/icon on primary gold (#1A1A1A -> 12.32:1 on #FFD600) */
  onPrimary: string;
  /** Warm amber spotlight/accent fill (#FFA600) */
  accent: string;
  /** Pressed state for accent fill */
  accentPressed: string;
  /** Accessible foreground text/icon on accent amber (#1A1A1A -> 8.87:1 on #FFA600) */
  onAccent: string;
  /** Secondary button/pill fill */
  secondary: string;
  /** Pressed state for secondary fill */
  secondaryPressed: string;
  /** Accessible foreground text on secondary fill */
  onSecondary: string;
  /** Subtle hairline border color */
  border: string;
  /** Stronger border for inputs and interactive controls (>= 3:1 where required) */
  borderStrong: string;
  /** High-visibility keyboard/accessibility focus ring color */
  focusRing: string;
  /** Disabled interactive surface background */
  disabledBackground: string;
  /** Disabled interactive foreground text */
  disabledText: string;
  /** Accessible inline link color (>= 4.5:1 on background) */
  link: string;
  /** Semantic danger/error foreground text on background */
  danger: string;
  /** Solid danger button fill */
  dangerSolid: string;
  /** Foreground text on solid danger button fill */
  onDangerSolid: string;
  /** Semantic error banner/toast surface */
  errorSurface: string;
  /** Semantic error banner/toast text (>= 4.5:1 on errorSurface) */
  errorText: string;
  /** Semantic error border */
  errorBorder: string;
  /** Semantic success banner/toast surface */
  successSurface: string;
  /** Semantic success banner/toast text (>= 4.5:1 on successSurface) */
  successText: string;
  /** Semantic success border */
  successBorder: string;
  /** Semantic warning banner/toast surface */
  warningSurface: string;
  /** Semantic warning banner/toast text (>= 4.5:1 on warningSurface) */
  warningText: string;
  /** Semantic warning border */
  warningBorder: string;
  /** Semantic info banner/toast surface */
  infoSurface: string;
  /** Semantic info banner/toast text (>= 4.5:1 on infoSurface) */
  infoText: string;
  /** Semantic info border */
  infoBorder: string;
  /** Semi-transparent modal backdrop scrim */
  scrim: string;
  /** Dark gradient/scrim overlay for profile media cards */
  mediaOverlay: string;
  /** Text rendered over mediaOverlay scrim */
  onMediaOverlay: string;
}

export const BrandPalette = {
  gold500: "#FFD600",
  gold600: "#E6C000",
  gold700: "#8A5A00",
  amber500: "#FFA600",
  amber600: "#E69500",
  charcoal900: "#0F0F0E",
  charcoal850: "#11181C",
  charcoal800: "#151718",
  charcoal750: "#1A1A1A",
  charcoal700: "#1C1C1C",
  charcoal600: "#333333",
  slate600: "#525860",
  slate550: "#5C646A",
  slate500: "#687076",
  slate400: "#9BA1A6",
  neutral200: "#E9ECEF",
  neutral150: "#EBEBEB",
  neutral100: "#F0EDED",
  neutral50: "#F8F9FA",
  white: "#FFFFFF",
} as const;

export const Colors: { light: ThemeColorTokens; dark: ThemeColorTokens } = {
  light: {
    text: "#11181C",
    textSecondary: "#525860",
    textMuted: "#5C646A",
    textInverse: "#FFFFFF",
    background: "#fff",
    surface: "#FFFFFF",
    surfaceMuted: "#F8F9FA",
    surfaceElevated: "#FFFFFF",
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
    primary: "#FFD600",
    primaryPressed: "#E6C000",
    onPrimary: "#1A1A1A",
    accent: "#FFA600",
    accentPressed: "#E69500",
    onAccent: "#1A1A1A",
    secondary: "#EBEBEB",
    secondaryPressed: "#DCDCDC",
    onSecondary: "#1C1C1C",
    border: "#E9ECEF",
    borderStrong: "#687076",
    focusRing: "#0A7EA4",
    disabledBackground: "#E9ECEF",
    disabledText: "#5C646A",
    link: "#0A7EA4",
    danger: "#C62828",
    dangerSolid: "#C62828",
    onDangerSolid: "#FFFFFF",
    errorSurface: "#FDECEA",
    errorText: "#B71C1C",
    errorBorder: "#D32F2F",
    successSurface: "#E8F5E9",
    successText: "#1B5E20",
    successBorder: "#2E7D32",
    warningSurface: "#FFF8E1",
    warningText: "#7A4F01",
    warningBorder: "#B27400",
    infoSurface: "#E3F2FD",
    infoText: "#0D47A1",
    infoBorder: "#1565C0",
    scrim: "rgba(15, 15, 14, 0.6)",
    mediaOverlay: "rgba(0, 0, 0, 0.65)",
    onMediaOverlay: "#FFFFFF",
  },
  dark: {
    text: "#ECEDEE",
    textSecondary: "#9BA1A6",
    textMuted: "#9BA1A6",
    textInverse: "#11181C",
    background: "#151718",
    surface: "#1E2022",
    surfaceMuted: "#26292C",
    surfaceElevated: "#26292C",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
    primary: "#FFD600",
    primaryPressed: "#E6C000",
    onPrimary: "#1A1A1A",
    accent: "#FFA600",
    accentPressed: "#E69500",
    onAccent: "#1A1A1A",
    secondary: "#2C3034",
    secondaryPressed: "#383D42",
    onSecondary: "#ECEDEE",
    border: "#2C3034",
    borderStrong: "#9BA1A6",
    focusRing: "#FFD600",
    disabledBackground: "#26292C",
    disabledText: "#9BA1A6",
    link: "#66C2E0",
    danger: "#FF8A80",
    dangerSolid: "#C62828",
    onDangerSolid: "#FFFFFF",
    errorSurface: "#3B1214",
    errorText: "#FFB4AB",
    errorBorder: "#FF8A80",
    successSurface: "#0F2912",
    successText: "#A5D6A7",
    successBorder: "#81C784",
    warningSurface: "#2E2205",
    warningText: "#FFD54F",
    warningBorder: "#FFB300",
    infoSurface: "#0D2137",
    infoText: "#90CAF9",
    infoBorder: "#64B5F6",
    scrim: "rgba(0, 0, 0, 0.75)",
    mediaOverlay: "rgba(0, 0, 0, 0.65)",
    onMediaOverlay: "#FFFFFF",
  },
};

export interface ContrastPairDefinition {
  id: string;
  description: string;
  foreground: string;
  background: string;
  usage: "normalText" | "largeText" | "uiComponent";
  minRequiredRatio: 4.5 | 3.0;
}

/**
 * Relative luminance per WCAG 2.2 formula:
 * https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 */
export function getRelativeLuminance(hex: string): number {
  const clean = hex.trim().replace(/^#/, "");
  const normalized =
    clean.length === 3
      ? clean
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : clean;

  if (normalized.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const toLinear = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Contrast ratio per WCAG 2.2 formula: (L1 + 0.05) / (L2 + 0.05), rounded to 2 decimals.
 */
export function getContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = getRelativeLuminance(foregroundHex);
  const l2 = getRelativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function meetsWcagAA(
  foregroundHex: string,
  backgroundHex: string,
  usage: "normalText" | "largeText" | "uiComponent" = "normalText"
): boolean {
  const ratio = getContrastRatio(foregroundHex, backgroundHex);
  const threshold = usage === "normalText" ? 4.5 : 3.0;
  return ratio >= threshold;
}

/**
 * Canonical accessible foreground/background contrast pairs across light & dark themes.
 * All pairs satisfy WCAG 2.2 AA (>= 4.5:1 for normal text, >= 3.0:1 for large text / UI).
 */
export const AccessibleContrastPairs: readonly ContrastPairDefinition[] = [
  {
    id: "light.text-on-background",
    description: "Light primary text (#11181C) on light background (#FFFFFF)",
    foreground: Colors.light.text,
    background: "#FFFFFF",
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.textSecondary-on-background",
    description: "Light secondary text (#525860) on light background (#FFFFFF)",
    foreground: Colors.light.textSecondary,
    background: "#FFFFFF",
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.textMuted-on-surfaceMuted",
    description: "Light muted/placeholder text (#5C646A) on input surface (#F8F9FA)",
    foreground: Colors.light.textMuted,
    background: Colors.light.surfaceMuted,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.onPrimary-on-primary",
    description: "Dark charcoal text (#1A1A1A) on primary bumble-gold (#FFD600)",
    foreground: Colors.light.onPrimary,
    background: Colors.light.primary,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.onAccent-on-accent",
    description: "Dark charcoal text (#1A1A1A) on spotlight amber (#FFA600)",
    foreground: Colors.light.onAccent,
    background: Colors.light.accent,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.onSecondary-on-secondary",
    description: "Secondary button text (#1C1C1C) on secondary pill (#EBEBEB)",
    foreground: Colors.light.onSecondary,
    background: Colors.light.secondary,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.textInverse-on-charcoal",
    description: "White text (#FFFFFF) on primary dark button (#1A1A1A)",
    foreground: Colors.light.textInverse,
    background: BrandPalette.charcoal750,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.link-on-background",
    description: "Inline link (#0A7EA4) on light background (#FFFFFF)",
    foreground: Colors.light.link,
    background: "#FFFFFF",
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.errorText-on-errorSurface",
    description: "Error alert text (#B71C1C) on error surface (#FDECEA)",
    foreground: Colors.light.errorText,
    background: Colors.light.errorSurface,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.danger-on-background",
    description: "Inline field error text (#C62828) on light background (#FFFFFF)",
    foreground: Colors.light.danger,
    background: "#FFFFFF",
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.onDangerSolid-on-dangerSolid",
    description: "White text (#FFFFFF) on solid danger button (#C62828)",
    foreground: Colors.light.onDangerSolid,
    background: Colors.light.dangerSolid,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.successText-on-successSurface",
    description: "Success alert text (#1B5E20) on success surface (#E8F5E9)",
    foreground: Colors.light.successText,
    background: Colors.light.successSurface,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.warningText-on-warningSurface",
    description: "Warning alert text (#7A4F01) on warning surface (#FFF8E1)",
    foreground: Colors.light.warningText,
    background: Colors.light.warningSurface,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "light.infoText-on-infoSurface",
    description: "Info alert text (#0D47A1) on info surface (#E3F2FD)",
    foreground: Colors.light.infoText,
    background: Colors.light.infoSurface,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "dark.text-on-background",
    description: "Dark primary text (#ECEDEE) on dark background (#151718)",
    foreground: Colors.dark.text,
    background: Colors.dark.background,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "dark.text-on-surface",
    description: "Dark primary text (#ECEDEE) on dark card surface (#1E2022)",
    foreground: Colors.dark.text,
    background: Colors.dark.surface,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "dark.textSecondary-on-background",
    description: "Dark secondary text (#9BA1A6) on dark background (#151718)",
    foreground: Colors.dark.textSecondary,
    background: Colors.dark.background,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "dark.textSecondary-on-surface",
    description: "Dark secondary text (#9BA1A6) on dark card surface (#1E2022)",
    foreground: Colors.dark.textSecondary,
    background: Colors.dark.surface,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "dark.primary-on-background",
    description: "Primary gold (#FFD600) on dark background (#151718)",
    foreground: Colors.dark.primary,
    background: Colors.dark.background,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "dark.errorText-on-errorSurface",
    description: "Dark error alert text (#FFB4AB) on dark error surface (#3B1214)",
    foreground: Colors.dark.errorText,
    background: Colors.dark.errorSurface,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "dark.successText-on-successSurface",
    description: "Dark success alert text (#A5D6A7) on dark success surface (#0F2912)",
    foreground: Colors.dark.successText,
    background: Colors.dark.successSurface,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "dark.warningText-on-warningSurface",
    description: "Dark warning alert text (#FFD54F) on dark warning surface (#2E2205)",
    foreground: Colors.dark.warningText,
    background: Colors.dark.warningSurface,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
  {
    id: "dark.infoText-on-infoSurface",
    description: "Dark info alert text (#90CAF9) on dark info surface (#0D2137)",
    foreground: Colors.dark.infoText,
    background: Colors.dark.infoSurface,
    usage: "normalText",
    minRequiredRatio: 4.5,
  },
];
