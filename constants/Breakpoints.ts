/**
 * Responsive viewport breakpoints for mobile (mid-range phones), tablet, and web layouts.
 */

export const Breakpoints = {
  /** Compact mobile phones (e.g., 320px–359px) */
  xs: 320,
  /** Standard mid-range mobile phones (e.g., 360px–767px) */
  sm: 360,
  /** Tablets and small web viewports (768px–1023px) */
  md: 768,
  /** Desktop / wide web viewports (1024px–1279px) */
  lg: 1024,
  /** Large desktop viewports (1280px+) */
  xl: 1280,
} as const;

export type BreakpointKey = keyof typeof Breakpoints;

export const MaxContentWidth = {
  form: 480,
  cardDeck: 420,
  dialog: 440,
  page: 1024,
} as const;

/**
 * Returns the active breakpoint name for a given viewport width in points/pixels.
 */
export function getBreakpointForWidth(width: number): BreakpointKey {
  if (width >= Breakpoints.xl) return "xl";
  if (width >= Breakpoints.lg) return "lg";
  if (width >= Breakpoints.md) return "md";
  if (width >= Breakpoints.sm) return "sm";
  return "xs";
}

/**
 * Returns true when the viewport width is at least the specified breakpoint.
 */
export function isWidthAtLeast(width: number, breakpoint: BreakpointKey): boolean {
  return width >= Breakpoints[breakpoint];
}
