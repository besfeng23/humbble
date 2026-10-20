/**
 * Spacing and touch-target tokens.
 * Uses a 4px base grid with intermediate 6px/10px tokens matching existing layouts,
 * plus WCAG 2.2 AA (2.5.8 Target Size Minimum >= 24x24pt) and mobile best-practice (>= 44x44pt) minimums.
 */

export const Spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  mdPlus: 10,
  lg: 12,
  xl: 16,
  "2xl": 20,
  "3xl": 24,
  "4xl": 30,
  "5xl": 40,
  "6xl": 50,
  "7xl": 60,
} as const;

export const HitSlop = {
  default: { top: 8, bottom: 8, left: 8, right: 8 },
  compact: { top: 4, bottom: 4, left: 4, right: 4 },
} as const;

export const TouchTargets = {
  /** WCAG 2.2 SC 2.5.8 minimum target size (24x24 CSS px / pt) */
  wcagMinimum: 24,
  /** Standard mobile interactive touch target (44x44 pt) */
  minimum: 44,
  /** Comfortable primary action touch target (48x48 pt) */
  comfortable: 48,
} as const;
