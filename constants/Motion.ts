import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Motion tokens and reduced-motion accessibility helpers (WCAG 2.2 SC 2.3.3 / system preferences).
 * When reduced motion is enabled, animations collapse to 0ms duration and non-scaling transitions.
 */

export const MotionDurations = {
  instant: 0,
  fast: 150,
  normal: 250,
  slow: 350,
  toastDefault: 4000,
} as const;

export const MotionEasings = {
  standard: "cubic-bezier(0.2, 0.0, 0.0, 1.0)",
  decelerate: "cubic-bezier(0.0, 0.0, 0.0, 1.0)",
  accelerate: "cubic-bezier(0.3, 0.0, 1.0, 1.0)",
} as const;

export const MotionTransforms = {
  pressedScale: 0.98,
  reducedMotionScale: 1,
  pressedOpacity: 0.82,
} as const;

export interface ResolvedMotionConfig {
  reduceMotion: boolean;
  durationFast: number;
  durationNormal: number;
  durationSlow: number;
  pressedScale: number;
  shouldAnimate: boolean;
}

/**
 * Computes motion parameters taking into account the user's reduced-motion setting.
 */
export function getMotionConfig(reduceMotion: boolean): ResolvedMotionConfig {
  if (reduceMotion) {
    return {
      reduceMotion: true,
      durationFast: MotionDurations.instant,
      durationNormal: MotionDurations.instant,
      durationSlow: MotionDurations.instant,
      pressedScale: MotionTransforms.reducedMotionScale,
      shouldAnimate: false,
    };
  }

  return {
    reduceMotion: false,
    durationFast: MotionDurations.fast,
    durationNormal: MotionDurations.normal,
    durationSlow: MotionDurations.slow,
    pressedScale: MotionTransforms.pressedScale,
    shouldAnimate: true,
  };
}

/**
 * Returns the effective animation duration in milliseconds, collapsing to 0ms when reduceMotion is true.
 */
export function resolveAnimationDuration(
  durationMs: number,
  reduceMotion: boolean
): number {
  return reduceMotion ? MotionDurations.instant : durationMs;
}

/**
 * Hook that queries and subscribes to `AccessibilityInfo.isReduceMotionEnabled()`.
 * Accepts an optional `override` prop for deterministic component testing.
 */
export function useReducedMotion(override?: boolean): boolean {
  const [systemReduceMotion, setSystemReduceMotion] = useState<boolean>(false);

  useEffect(() => {
    if (typeof override === "boolean") {
      return;
    }

    let isMounted = true;

    if (typeof AccessibilityInfo?.isReduceMotionEnabled === "function") {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((enabled) => {
          if (isMounted) {
            setSystemReduceMotion(Boolean(enabled));
          }
        })
        .catch(() => {
          // Fail safe to false if platform bridge is unavailable
        });
    }

    const subscription =
      typeof AccessibilityInfo?.addEventListener === "function"
        ? AccessibilityInfo.addEventListener(
            "reduceMotionChanged",
            (enabled: boolean) => {
              if (isMounted) {
                setSystemReduceMotion(Boolean(enabled));
              }
            }
          )
        : null;

    return () => {
      isMounted = false;
      if (subscription && typeof subscription.remove === "function") {
        subscription.remove();
      }
    };
  }, [override]);

  return typeof override === "boolean" ? override : systemReduceMotion;
}
