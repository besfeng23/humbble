import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet } from "react-native";

/** Transparent version of a #RRGGBB colour so the gradient fades without greying. */
function transparent(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}00` : "transparent";
}

/**
 * Soft fade used instead of divider lines under top bars and above composers.
 * `edge="top"` hangs below a header; `edge="bottom"` sits above a bottom bar.
 * Absolutely positioned and non-interactive so it never shifts layout.
 */
export function FadeEdge({ color, edge, height = 16, testID }: { color: string; edge: "top" | "bottom"; height?: number; testID?: string }) {
  const colors: [string, string] = edge === "top" ? [color, transparent(color)] : [transparent(color), color];
  return (
    <LinearGradient
      testID={testID}
      pointerEvents="none"
      colors={colors}
      style={[styles.base, { height }, edge === "top" ? styles.belowParent : styles.aboveParent]}
    />
  );
}
const styles = StyleSheet.create({
  base: { position: "absolute", left: 0, right: 0, zIndex: 2 },
  belowParent: { top: "100%" },
  aboveParent: { bottom: "100%" },
});
