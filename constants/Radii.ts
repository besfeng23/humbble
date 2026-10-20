/**
 * Border radius tokens matching existing Humbble surfaces:
 * - Alerts / compact chips: 8px
 * - PeopleCard / inner UserCard media: 10px
 * - Inputs / UserCard / auth buttons / feature tiles: 12px
 * - Dialogs / elevated cards: 16px
 * - Premium upsell cards / badges: 20px
 * - Pill buttons / auth bottom sheet: 30px
 * - Circular avatars / icon buttons: 9999px
 */

export const Radii = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  "2xl": 20,
  pill: 30,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof Radii;
