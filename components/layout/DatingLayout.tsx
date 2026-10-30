import { usePathname, useRouter } from "expo-router";
import React, { useState } from "react";
import { useAuth } from "@/lib/AuthProvider";
import { FontFamilies } from "@/constants/Typography";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  MaxContentWidth,
  getBreakpointForWidth,
  isWidthAtLeast,
} from "@/constants/Breakpoints";
import { Colors } from "@/constants/Colors";
import {
  MotionTransforms,
  getMotionConfig,
  useReducedMotion,
} from "@/constants/Motion";
import { HitSlop, Spacing, TouchTargets } from "@/constants/Spacing";
import { Typography } from "@/constants/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";

import { AuthGuard } from "./AuthGuard";
import { DATING_NAV_ITEMS } from "./navigation";

export interface DatingLayoutProps {
  /** Active tab or route identifier */
  activeNavId?: string;
  /** Optional explicit viewport width override (useful for responsive testing) */
  viewportWidth?: number;
  /** Override reduced-motion setting */
  reduceMotion?: boolean;
  /** Test identifier prefix */
  testID?: string;
  /** Dating view content (e.g. Tabs or detail screen) */
  children: React.ReactNode;
  /** Explicitly bypass the guard only for __DEV__ preview routes. */
  skipAuthGuard?: boolean;
}

export function DatingLayout({
  activeNavId,
  viewportWidth,
  reduceMotion: reduceMotionProp,
  testID = "dating-layout",
  children,
  skipAuthGuard = false,
}: DatingLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut, user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const scheme = useColorScheme() ?? "light";
  const palette = Colors[scheme];
  const reduceMotion = useReducedMotion(reduceMotionProp);
  const motion = getMotionConfig(reduceMotion);
  const { width } = useWindowDimensions();
  const effectiveWidth = viewportWidth ?? (width || 375);
  const breakpoint = getBreakpointForWidth(effectiveWidth);
  const isWide = isWidthAtLeast(effectiveWidth, "md");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const activePath = activeNavId || pathname;
  const currentTab = (item: typeof DATING_NAV_ITEMS[number]) =>
    activePath === item.id || activePath === item.href ||
    (item.id === "dating-likes" && (activePath === "/" || activePath === "/(tabs)")) ||
    (item.id === "dating-chats" && (pathname.includes("/(chats)") || pathname.startsWith("/chats"))) ||
    (item.id === "dating-people" && (pathname.includes("/people") || pathname.includes("/discover"))) ||
    (item.id === "dating-matches" && pathname.includes("/matches")) ||
    (item.id === "dating-profile" && pathname.includes("/profile"));
  const logOut = async () => { setMoreOpen(false); await signOut(); router.replace("/auth/signin" as any); };

  return (
    <MaybeGuard
      skip={__DEV__ && skipAuthGuard}
      reduceMotion={reduceMotion}
      testID={`${testID}-guard`}
    >
      <SafeAreaView
        testID={testID}
        accessibilityValue={{ text: `breakpoint-${breakpoint}` }}
        style={[styles.safeArea, { backgroundColor: palette.background }]}
      >
        {isWide ? (
          <View
            testID={`${testID}-desktop-nav`}
            accessibilityRole="tablist"
            style={[
              styles.desktopNavBar,
              {
                backgroundColor: palette.surface,
                borderBottomColor: palette.border,
              },
            ]}
          >
            <View style={styles.desktopNavInner}>
              <Pressable accessibilityRole="link" accessibilityLabel="Sincera homepage" onPress={() => router.push("/(tabs)/people" as any)}>
                <Text style={[styles.brandTitle, { color: palette.text }]}>sincera</Text>
              </Pressable>
              <View style={styles.desktopNavLinks}>
                {DATING_NAV_ITEMS.map((item) => {
                  const isSelected = currentTab(item);
                  const isFocused = focusedId === item.id;

                  return (
                    <Pressable
                      key={item.id}
                      testID={`${testID}-nav-${item.id}`}
                      hitSlop={HitSlop.compact}
                      onPress={() => router.push(item.href as any)}
                      onFocus={() => setFocusedId(item.id)}
                      onBlur={() =>
                        setFocusedId((prev) =>
                          prev === item.id ? null : prev
                        )
                      }
                      accessibilityRole="tab"
                      accessibilityLabel={
                        item.accessibilityLabel ?? item.label
                      }
                      accessibilityState={{ selected: isSelected }}
                      style={({ pressed }) => [
                        styles.desktopNavPill,
                        {
                          backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                          borderBottomColor: isSelected ? "#BA9352" : (isFocused ? palette.focusRing : "transparent"),
                          borderBottomWidth: isSelected || isFocused ? 2 : 0,
                          opacity: pressed ? MotionTransforms.pressedOpacity : 1,
                          transform: [
                            { scale: pressed ? motion.pressedScale : 1 },
                          ],
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.desktopNavText,
                          {
                            color: isSelected ? "#17362D" : palette.textSecondary,
                            fontWeight: isSelected ? "700" : "500",
                          },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable testID="sincera-more-menu-toggle" accessibilityRole="button" accessibilityLabel="More account options" onPress={() => setMoreOpen(!moreOpen)} style={styles.moreToggle}>
                  <Text style={[styles.moreText,{color:palette.text}]}>More {moreOpen ? "▴" : "▾"}</Text>
                </Pressable>
              </View>
              {moreOpen ? (
                <View testID="sincera-more-menu" style={[styles.moreMenu,{backgroundColor:palette.surface,borderColor:palette.border}]}>
                  {[
                    ["Account settings","/(tabs)/profile/settings"],
                    ["Preferences","/(tabs)/discover/filters"],
                    ["Notifications","/(tabs)/notifications"],
                    ["Subscription","/(paywall)/billing"],
                    ["Safety","/(public)/safety"],
                    ["Help","/(public)/faq"],
                  ].map(([label,href])=><Pressable key={href} accessibilityRole="link" style={styles.moreItem} onPress={()=>{setMoreOpen(false);router.push(href as any);}}><Text style={[styles.moreText,{color:palette.text}]}>{label}</Text></Pressable>)}
                  {user?.app_metadata?.role==="moderator" ? <Pressable style={styles.moreItem} accessibilityRole="link" onPress={()=>{setMoreOpen(false);router.push("/(admin)/dashboard" as any)}}><Text style={[styles.moreText,{color:palette.text}]}>Admin</Text></Pressable> : null}
                  <Pressable style={styles.moreItem} accessibilityRole="button" onPress={()=>void logOut()}><Text style={[styles.moreText,{color:palette.text}]}>Log out</Text></Pressable>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View
          testID={`${testID}-content`}
          style={[styles.content, isWide ? styles.contentWide : undefined]}
        >
          {children}
        </View>
      </SafeAreaView>
    </MaybeGuard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  desktopNavBar: {
    width: "100%",
    zIndex: 10,
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 8,
  },
  desktopNavInner: {
    width: "100%",
    maxWidth: MaxContentWidth.page,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
  },
  brandTitle: {
    ...Typography.h2,
    fontFamily: FontFamilies.editorial,
    fontSize: 32,
    fontWeight: "600",
  },
  desktopNavLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 17,
  },
  moreToggle: { minHeight: 44, paddingHorizontal: 10, justifyContent: "center" },
  moreMenu: { position: "absolute", right: 0, top: 61, borderWidth: 1, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 8, minWidth: 195, zIndex: 20, elevation: 8 },
  moreItem: { minHeight: 43, paddingHorizontal: 12, justifyContent: "center" },
  moreText: { fontSize: 14, fontWeight: "600" },
  desktopNavPill: {
    minHeight: TouchTargets.minimum,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  desktopNavText: {
    ...Typography.bodySmall,
  },
  content: {
    flex: 1,
    width: "100%",
  },
  contentWide: {
    maxWidth: MaxContentWidth.page,
    alignSelf: "center",
  },
});

export default DatingLayout;

function MaybeGuard({ skip, reduceMotion, testID, children }: { skip: boolean; reduceMotion: boolean; testID: string; children: React.ReactNode }) {
  if (skip) return <>{children}</>;
  return <AuthGuard mode="protected" redirectTo="/auth/signin" reduceMotion={reduceMotion} testID={testID}>{children}</AuthGuard>;
}
