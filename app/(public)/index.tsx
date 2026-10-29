import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useAuth } from "@/lib/AuthProvider";
import { captureAttribution, extractAttributionParams } from "@/lib/attribution";

/**
 * Faithful public-page layout from Sincera Bubble Live index, inspected 2026-10-30.
 * Public editorial media is illustrative. No Bubble account, private member data,
 * messages, billing status or member verification is imported into this app.
 * This file changes only the separate Expo/Supabase frontend preview.
 */
const media = {
  hero: "https://2e0349a89f9baad1c16427dab8ebef56.cdn.bubble.io/f1793010812929x251192660270190180/sincera-hero-editorial-couple.jpg",
  portrait: "https://2e0349a89f9baad1c16427dab8ebef56.cdn.bubble.io/f1793010846844x419054617681776450/sincera-illustrative-profile-portrait.jpg",
  story: "https://2e0349a89f9baad1c16427dab8ebef56.cdn.bubble.io/f1793010839656x996345794277444500/sincera-editorial-story-couple.jpg",
  demo: "https://2e0349a89f9baad1c16427dab8ebef56.cdn.bubble.io/f1793010882477x271559654727654430/sincera-sample-profile-warm-portrait.jpg",
  privacy: "https://2e0349a89f9baad1c16427dab8ebef56.cdn.bubble.io/f1792797237575x789745354362047200/landing-4795769973ddc5a2.png",
  privacyPhone: "https://2e0349a89f9baad1c16427dab8ebef56.cdn.bubble.io/f1792797239325x423535557396793400/landing-f86cfddfdc1e6142.png",
} as const;

const GREEN = "#17362D";
const INK = "#193329";
const CREAM = "#FCF8F0";
const GOLD = "#E7B96A";

export const LANDING_TRUST_POINTS = [
  "18+ only.",
  "Profiles are reviewed by our team.",
  "Report or block anyone in one tap.",
  "We never ask you for money.",
] as const;

const steps = [
  { number: "01", title: "Show up as yourself", detail: "Create a profile that reflects your personality and what matters to you." },
  { number: "02", title: "Find your kind of person", detail: "Discover adults who share your intentions and interests." },
  { number: "03", title: "Say hello, together", detail: "Chat privately when you've both expressed interest." },
] as const;

const privacy = [
  { title: "Blur photos until matched", detail: "Reveal photos to mutual matches." },
  { title: "Hide your last-active status", detail: "Keep your activity status to yourself." },
  { title: "Control your profile visibility", detail: "Pause discovery whenever you choose." },
  { title: "Choose who can send you likes", detail: "Control who can express interest." },
] as const;

function GoldButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.goldButton, pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.goldButtonText}>{label}</Text>
    </Pressable>
  );
}

export default function ConversionLandingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const mobile = width < 760;
  const narrow = width < 430;
  const scroll = useRef<ScrollView>(null);
  const [howY, setHowY] = useState(0);
  const [previewY, setPreviewY] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [previewConsent, setPreviewConsent] = useState(false);

  useEffect(() => {
    void captureAttribution(params as Record<string, unknown>, "/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (session) return <Redirect href="/(tabs)/people" />;

  const join = () => router.push("/auth/signup" as any);
  const login = () => router.push("/auth/signin" as any);
  const goPricing = () => router.push("/(public)/pricing" as any);
  const goSafety = () => router.push("/(public)/legal/community-standards" as any);
  const goTerms = () => router.push("/(public)/legal/terms-of-service" as any);
  const goPrivacy = () => router.push("/(public)/legal/privacy-notice" as any);
  const jump = (y: number) => {
    scroll.current?.scrollTo({ y, animated: true });
    setMenuOpen(false);
  };
  const openQuiz = () => router.push({
    pathname: "/quiz",
    params: extractAttributionParams(params as Record<string, unknown>),
  } as any);

  const onHowLayout = (e: LayoutChangeEvent) => setHowY(e.nativeEvent.layout.y);
  const onPreviewLayout = (e: LayoutChangeEvent) => setPreviewY(e.nativeEvent.layout.y);

  const menuItems = (
    <>
      <Pressable accessibilityRole="button" onPress={() => jump(howY)} style={styles.navAction}>
        <Text style={styles.navActionText}>How it works</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={goSafety} style={styles.navAction}>
        <Text style={styles.navActionText}>Safety</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={goPricing} style={styles.navAction}>
        <Text style={styles.navActionText}>Pricing</Text>
      </Pressable>
      <Pressable testID="scr-01-signin-link" accessibilityRole="button" onPress={login} style={styles.navAction}>
        <Text style={styles.navActionText}>Log in</Text>
      </Pressable>
      <GoldButton label="Join free" onPress={join} />
    </>
  );

  return (
    <View testID="scr-01-landing" style={styles.page}>
      <View style={styles.topNav}>
        <View style={styles.navInner}>
          <Pressable onPress={() => jump(0)} accessibilityRole="link" accessibilityLabel="Sincera home" style={styles.brandTouch}>
            <Text style={styles.wordmark}>sincera<Text style={styles.brandDot}>·</Text></Text>
          </Pressable>
          {mobile ? (
            <Pressable accessibilityRole="button" accessibilityLabel={menuOpen ? "Close menu" : "Open menu"} onPress={() => setMenuOpen(v => !v)} style={styles.menuToggle}>
              <Text style={styles.navActionText}>{menuOpen ? "Close" : "Menu"}</Text>
            </Pressable>
          ) : (
            <View style={styles.desktopNav}>{menuItems}</View>
          )}
        </View>
        {mobile && menuOpen && <View style={styles.mobileNav}>{menuItems}</View>}
      </View>

      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.scrollBody}>
        <ImageBackground
          source={{ uri: media.hero }}
          resizeMode="cover"
          style={styles.masthead}
          accessibilityLabel="Illustrative photograph of an adult couple; not Sincera members"
          testID="sincera-editorial-photo"
        >
          <LinearGradient
            colors={mobile
              ? ["rgba(11,30,25,0.83)", "rgba(11,30,25,0.63)", "rgba(11,30,25,0.24)"]
              : ["rgba(11,30,25,0.85)", "rgba(11,30,25,0.52)", "rgba(11,30,25,0.15)"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.heroGradient}
          >
            <View style={[styles.heroInner, mobile && styles.heroInnerMobile]}>
              <Text style={styles.heroEyebrow}>INTENTIONAL DATING · FILIPINA & INTERNATIONAL SINGLES</Text>
              <Text testID="sincera-hero-heading" accessibilityRole="header" style={[styles.heroTitle, mobile && styles.heroTitleMobile, narrow && styles.heroTitleNarrow]}>
                Meet someone who{"\n"}<Text style={styles.heroItalic}>means it.</Text>
              </Text>
              <Text style={styles.heroSubtitle}>
                Meet Filipina singles and international men looking for something genuine. Connect when the interest is mutual.
              </Text>
              <View style={styles.heroButtons}>
                <GoldButton testID="scr-01-start-cta" label="Create my free profile" onPress={join} />
                <Pressable accessibilityRole="button" onPress={() => jump(howY)} style={styles.transparentLink}>
                  <Text style={styles.heroLinkText}>See how Sincera works ↓</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.photoCredit}>Illustrative editorial photography</Text>
          </LinearGradient>
        </ImageBackground>

        <View style={styles.trustBand}>
          <View style={[styles.maxContent, styles.trustRow]}>
            <Text style={styles.trustBandLabel}>01   YOUR STORY, YOUR PACE</Text>
            <Text style={styles.trustBandLabel}>02   MUTUAL INTEREST FIRST</Text>
            <Text style={styles.trustBandLabel}>03   PRIVACY IN YOUR HANDS</Text>
          </View>
        </View>

        <View style={styles.bentoSection}>
          <View style={[styles.maxContent, styles.bentoInner]}>
            <Text style={styles.goldEyebrow}>MORE THAN DATING</Text>
            <Text accessibilityRole="header" style={[styles.bentoHeading, mobile && styles.bentoHeadingMobile]}>
              People first. Possibilities everywhere.
            </Text>
            <Text style={styles.bentoLead}>
              It's not about collecting likes. It's about meeting someone whose values, stories, and intentions feel right to you.
            </Text>
            <View style={[styles.bentoGrid, mobile && styles.bentoGridMobile]}>
              <ImageBackground source={{ uri: media.portrait }} resizeMode="cover" style={[styles.bentoPortrait, mobile && styles.bentoPortraitMobile]} imageStyle={styles.roundedImage}>
                <LinearGradient colors={["rgba(9,27,22,0.10)", "rgba(9,27,22,0.94)"]} style={styles.bentoPortraitOverlay}>
                  <Text style={styles.portraitBig}>One great hello.{"\n"}A new possibility.</Text>
                  <Text style={styles.portraitCaption}>Get to know the person behind the photo. Illustrative portrait, not a Sincera member.</Text>
                </LinearGradient>
              </ImageBackground>
              <View style={styles.bentoSide}>
                <ImageBackground source={{ uri: media.story }} resizeMode="cover" style={styles.storyTile} imageStyle={styles.roundedImage}>
                  <LinearGradient colors={["rgba(15,46,38,.10)", "rgba(15,46,38,.92)"]} style={styles.storyOverlay}>
                    <Text style={styles.tileKicker}>02   /   GO DEEPER</Text>
                    <Text style={styles.tileHeading}>Look for more{"\n"}than a photo.</Text>
                    <Text style={styles.tileCopy}>Discover shared values, intentions, and a real reason to say hello.</Text>
                  </LinearGradient>
                </ImageBackground>
                <View style={styles.connectionTile}>
                  <Text style={styles.tileKicker}>03   /   YOUR CONNECTION</Text>
                  <Text style={styles.connectionHeading}>The right connection{"\n"}is a two-way choice.</Text>
                  <Text style={styles.tileCopy}>Chat begins when the interest is mutual. You're always in control.</Text>
                </View>
              </View>
            </View>
            <View style={[styles.bentoFoot, mobile && styles.bentoFootMobile]}>
              <Pressable accessibilityRole="button" onPress={() => jump(previewY)} style={styles.underlinedLink}>
                <Text style={styles.bentoFootAction}>Try the interactive preview ↗</Text>
              </Pressable>
              <Text style={styles.bentoFootCopy}>See the experience before you create a profile.</Text>
            </View>
          </View>
        </View>

        <View onLayout={onHowLayout} style={styles.howSection}>
          <View style={[styles.maxContent, styles.howInner]}>
            <Text style={styles.howKicker}>HOW SINCERA WORKS</Text>
            <Text accessibilityRole="header" style={[styles.howHeading, mobile && styles.howHeadingMobile]}>
              A little intention goes a long way.
            </Text>
            <View style={[styles.howGrid, mobile && styles.howGridMobile]}>
              {steps.map(s => (
                <View key={s.number} style={styles.howStep}>
                  <Text style={styles.howNumber}>{s.number}</Text>
                  <Text style={styles.howStepTitle}>{s.title}</Text>
                  <Text style={styles.howStepCopy}>{s.detail}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View onLayout={onPreviewLayout} style={styles.previewSection}>
          <View style={[styles.maxContent, styles.previewInner]}>
            <Text style={styles.goldEyebrow}>YOUR FIRST LOOK / THE SINCERA EXPERIENCE</Text>
            <Text accessibilityRole="header" style={[styles.previewHeading, mobile && styles.sectionHeadingMobile]}>
              See what happens when the feeling is mutual.
            </Text>
            <Text style={styles.previewNotice}>
              Take a 3-step guided look. Profiles and conversations here are fictional examples, never real members.
            </Text>
            <View style={styles.demoTabs}>
              {["01   Discover", "02   Connect", "03   Conversation"].map((name, index) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  accessibilityState={{ selected: index === demoStep }}
                  onPress={() => setDemoStep(index)}
                  style={[styles.demoTab, index === demoStep && styles.demoTabActive]}
                >
                  <Text style={[styles.demoTabText, index === demoStep && styles.demoTabTextActive]}>{name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.demoRow, mobile && styles.demoRowMobile]}>
              <View style={[styles.demoProfile, mobile && styles.demoProfileMobile]}>
                <Image source={{ uri: media.demo }} style={styles.demoPhoto} resizeMode="cover" accessibilityLabel="Illustrative example profile portrait" />
                <Text style={styles.exampleBadge}>EXAMPLE PROFILE</Text>
                <Text style={styles.demoName}>Maria, 29</Text>
                <Text style={styles.demoMeta}>Cebu, Philippines · Seeking something lasting</Text>
                <Text style={styles.demoMeta}>English · Cebuano · Tagalog</Text>
                <Text style={styles.demoMeta}>Cooking · coastal hikes · choir · travel</Text>
                <Text style={styles.demoQuote}>“Kindness, family, and something lasting.”</Text>
              </View>
              <View style={[styles.demoContent, mobile && styles.demoContentMobile]}>
                {demoStep === 0 ? (
                  <>
                    <Text style={styles.demoContentKicker}>DISCOVER WITH INTENTION</Text>
                    <Text style={styles.demoContentHeading}>Start with what{"\n"}really matters.</Text>
                    <Text style={styles.demoContentCopy}>Get to know the person behind the photos. Look for shared values, relationship intentions, and a genuine connection.</Text>
                    <Text style={styles.demoContentCopy}>You decide when to show interest. Every connection begins at your pace.</Text>
                    <GoldButton label="Show me the match" onPress={() => setDemoStep(1)} />
                  </>
                ) : demoStep === 1 ? (
                  <>
                    <Text style={styles.demoContentKicker}>02  /  MUTUAL INTEREST</Text>
                    <Text style={styles.demoContentHeading}>A spark is better when it's mutual.</Text>
                    <Text style={styles.demoContentCopy}>Your interest stays personal. A match happens when you both choose to connect — no pressure, no unwanted first message.</Text>
                    <Text style={styles.demoContentKicker}>YOU BOTH SAID YES</Text>
                    <Text style={styles.demoContentCopy}>A shared interest. An open door. This is an illustration of Sincera's mutual-like experience. No real member is involved.</Text>
                    <GoldButton label="See the conversation" onPress={() => setDemoStep(2)} />
                  </>
                ) : (
                  <>
                    <Text style={styles.demoContentKicker}>03  /  A FIRST HELLO</Text>
                    <Text style={styles.demoContentHeading}>Now the best part begins.</Text>
                    <Text style={styles.demoContentCopy}>Mutual interest unlocks the opportunity for a private conversation. The rest is yours to discover.</Text>
                    <View style={styles.sampleBubble}><Text style={styles.bubbleText}>Hello! I saw you enjoy hiking. What's a place you'd love to explore again?</Text></View>
                    <View style={[styles.sampleBubble, styles.sampleBubbleRight]}><Text style={styles.bubbleText}>A peaceful mountain trail — especially with great company. What about you?</Text></View>
                    <Text style={styles.demoDisclaimer}>Fictional demonstration. Actual messages are private between matched members.</Text>
                    <GoldButton label="Start over" onPress={() => setDemoStep(0)} />
                  </>
                )}
              </View>
            </View>
            <View style={[styles.signupPanel, mobile && styles.signupPanelMobile]}>
              <View style={styles.signupPanelCopy}>
                <Text style={styles.signupTitle}>Start a real conversation.</Text>
                <Text style={styles.signupDescription}>Start with a free profile. Discover at your pace. Private chat opens after mutual interest.</Text>
              </View>
              <GoldButton label="Create my free profile" onPress={join} />
            </View>
          </View>
        </View>

        <View style={styles.privacySection}>
          <View style={[styles.maxContent, styles.privacyGrid, mobile && styles.privacyGridMobile]}>
            <View style={styles.privacyCopy}>
              <Text style={styles.goldEyebrow}>PRIVACY, BY DEFAULT</Text>
              <Text style={[styles.privacyHeading, mobile && styles.sectionHeadingMobile]}>
                Your photos.{"\n"}<Text style={styles.privacyItalic}>Your choice.</Text>
              </Text>
              <Text style={styles.privacyLead}>Share on your terms. Manage photo visibility, block unwanted contact, and report behavior that concerns you.</Text>
              {privacy.map(p => (
                <View key={p.title} style={styles.privacyItem}>
                  <Text style={styles.privacyItemTitle}>✓  {p.title}</Text>
                  <Text style={styles.privacyItemCopy}>{p.detail}</Text>
                </View>
              ))}
            </View>
            <Image
              source={{ uri: mobile ? media.privacyPhone : media.privacy }}
              resizeMode="contain"
              style={[styles.privacyImage, mobile && styles.privacyImageMobile]}
              accessibilityLabel="Illustration of Sincera's photo privacy choices"
            />
          </View>
        </View>

        <View style={styles.closingSection}>
          <View style={[styles.maxContent, styles.closingInner]}>
            <Text style={styles.howKicker}>SOMETHING REAL COULD START HERE</Text>
            <Text accessibilityRole="header" style={[styles.closingHeading, mobile && styles.sectionHeadingMobile]}>
              Something meaningful{"\n"}starts with hello.
            </Text>
            <Text style={styles.closingCopy}>Make a little space for a genuine connection. Join Sincera free and take things at your own pace.</Text>
            <View style={styles.closingButtons}>
              <GoldButton label="Create my free profile" onPress={join} />
              <Pressable accessibilityRole="button" onPress={login} style={styles.transparentLink}>
                <Text style={styles.heroLinkText}>I already have an account</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={[styles.maxContent, styles.footerInner]}>
            <Text style={styles.footerWordmark}>sincera·</Text>
            <Text style={styles.footerIntro}>Intentional dating. Real conversations. At your pace.</Text>
            <View style={styles.footerLinks}>
              <Pressable accessibilityRole="link" onPress={goTerms}><Text style={styles.footerLink}>Terms</Text></Pressable>
              <Pressable accessibilityRole="link" onPress={goPrivacy}><Text style={styles.footerLink}>Privacy</Text></Pressable>
              <Pressable accessibilityRole="link" onPress={goSafety}><Text style={styles.footerLink}>Safety</Text></Pressable>
              <Pressable accessibilityRole="link" onPress={goPricing}><Text style={styles.footerLink}>Pricing</Text></Pressable>
              <Pressable accessibilityRole="link" onPress={openQuiz}><Text style={styles.footerLink}>Explore the experience</Text></Pressable>
            </View>
            <View testID="scr-01-trust-points" style={styles.footerSafety}>
              <Text style={styles.footerDisclaimer}>18+ only. {LANDING_TRUST_POINTS[1]} You can {LANDING_TRUST_POINTS[2].toLowerCase()}</Text>
              <Text style={styles.footerDisclaimer}>Our team will never ask you for money in private messages.</Text>
              <Text style={styles.footerDisclaimer}>This is an independent app preview. Existing Bubble Sincera accounts are not connected here.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: CREAM },
  scroll: { flex: 1 },
  scrollBody: { flexGrow: 1, backgroundColor: CREAM },
  maxContent: { width: "100%", maxWidth: 1160, alignSelf: "center" },
  topNav: { backgroundColor: CREAM, borderBottomColor: "#E9E0D3", borderBottomWidth: 1, zIndex: 5 },
  navInner: { width: "100%", maxWidth: 1160, alignSelf: "center", minHeight: 70, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandTouch: { paddingVertical: 8, paddingRight: 30 },
  wordmark: { fontSize: 32, lineHeight: 38, letterSpacing: -1.5, color: "#1A332B", fontWeight: "700" },
  brandDot: { color: "#C28A3B" },
  desktopNav: { flexDirection: "row", alignItems: "center", gap: 17 },
  navAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  navActionText: { fontSize: 14, color: "#31453F", fontWeight: "600" },
  menuToggle: { minWidth: 65, minHeight: 44, alignItems: "center", justifyContent: "center", borderColor: "#D8CCB8", borderWidth: 1, borderRadius: 10 },
  mobileNav: { padding: 15, gap: 3, borderTopColor: "#E9E0D3", borderTopWidth: 1 },
  goldButton: { backgroundColor: GOLD, borderRadius: 100, minHeight: 48, paddingVertical: 13, paddingHorizontal: 26, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  goldButtonText: { color: "#193128", fontSize: 16, lineHeight: 20, fontWeight: "700", textAlign: "center" },
  masthead: { width: "100%", minHeight: 525, backgroundColor: "#112D26" },
  heroGradient: { width: "100%", minHeight: 525, paddingTop: 42, paddingBottom: 18, paddingHorizontal: 22, justifyContent: "space-between" },
  heroInner: { width: "100%", maxWidth: 1160, alignSelf: "center", justifyContent: "center", minHeight: 430, gap: 19 },
  heroInnerMobile: { minHeight: 480, gap: 22 },
  heroEyebrow: { color: "#F9DCAE", fontSize: 12, letterSpacing: 2.1, fontWeight: "600", maxWidth: 600 },
  heroTitle: { color: "#FFFCF6", fontSize: 68, lineHeight: 77, fontWeight: "500", maxWidth: 730, letterSpacing: -2 },
  heroTitleMobile: { fontSize: 49, lineHeight: 58, letterSpacing: -1.2 },
  heroTitleNarrow: { fontSize: 41, lineHeight: 50 },
  heroItalic: { fontStyle: "italic", color: "#F2D49A" },
  heroSubtitle: { color: "#FFFFFF", fontSize: 18, lineHeight: 28, maxWidth: 600 },
  heroButtons: { flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "center" },
  transparentLink: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center" },
  heroLinkText: { color: "#FFFAF0", fontSize: 16, fontWeight: "600" },
  photoCredit: { alignSelf: "flex-end", maxWidth: 1160, width: "100%", fontSize: 12, color: "#F8EEE1", textAlign: "right" },
  trustBand: { backgroundColor: "#FFF8ED", minHeight: 60, paddingHorizontal: 20, justifyContent: "center" },
  trustRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 14 },
  trustBandLabel: { color: "#1F3C31", fontSize: 13, letterSpacing: 0.6, fontWeight: "600" },
  bentoSection: { backgroundColor: CREAM, paddingHorizontal: 22, paddingVertical: 78 },
  bentoInner: { gap: 22 },
  goldEyebrow: { color: "#966C28", fontSize: 12, fontWeight: "700", letterSpacing: 1.8 },
  bentoHeading: { color: INK, fontSize: 56, lineHeight: 63, maxWidth: 900, fontWeight: "600", letterSpacing: -1.4 },
  bentoHeadingMobile: { fontSize: 38, lineHeight: 46 },
  bentoLead: { color: "#5B6159", fontSize: 18, lineHeight: 28, maxWidth: 760 },
  bentoGrid: { flexDirection: "row", gap: 18, alignItems: "stretch" },
  bentoGridMobile: { flexDirection: "column" },
  bentoPortrait: { flex: 1.12, height: 480, borderRadius: 18, overflow: "hidden", minWidth: 260 },
  bentoPortraitMobile: { flex: 0, height: 455 },
  bentoPortraitOverlay: { flex: 1, padding: 26, justifyContent: "flex-end", gap: 12 },
  roundedImage: { borderRadius: 18 },
  portraitBig: { fontSize: 43, lineHeight: 49, color: "#FFF8ED", fontWeight: "600" },
  portraitCaption: { fontSize: 14, lineHeight: 20, color: "#F9EEDD" },
  bentoSide: { flex: 0.9, gap: 18 },
  storyTile: { minHeight: 230, borderRadius: 18, overflow: "hidden", backgroundColor: GREEN },
  storyOverlay: { flex: 1, padding: 25, justifyContent: "flex-end", gap: 10 },
  tileKicker: { color: "#F9DB9D", fontSize: 13, fontWeight: "700", letterSpacing: 1 },
  tileHeading: { fontSize: 36, lineHeight: 39, color: "#FFFFFF", fontWeight: "600" },
  tileCopy: { fontSize: 15, lineHeight: 23, color: "#F5F2E9" },
  connectionTile: { backgroundColor: "#1D4034", borderRadius: 18, flex: 1, minHeight: 230, padding: 25, justifyContent: "center", gap: 12 },
  connectionHeading: { fontSize: 34, lineHeight: 40, color: "#FFF9ED", fontWeight: "600" },
  bentoFoot: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 20, alignItems: "center", paddingTop: 4 },
  bentoFootMobile: { alignItems: "flex-start" },
  underlinedLink: { minHeight: 44, justifyContent: "center" },
  bentoFootAction: { color: GREEN, fontSize: 17, fontWeight: "700", textDecorationLine: "underline" },
  bentoFootCopy: { fontSize: 17, color: "#685E51" },
  howSection: { backgroundColor: GREEN, paddingVertical: 85, paddingHorizontal: 22 },
  howInner: { gap: 22 },
  howKicker: { color: "#E7C78C", fontSize: 12, fontWeight: "700", letterSpacing: 1.7 },
  howHeading: { fontSize: 46, lineHeight: 54, color: "#FFF9ED", fontWeight: "600", maxWidth: 900 },
  howHeadingMobile: { fontSize: 35, lineHeight: 43 },
  howGrid: { flexDirection: "row", flexWrap: "wrap", gap: 24, paddingTop: 12 },
  howGridMobile: { flexDirection: "column" },
  howStep: { flex: 1, minWidth: 205, gap: 11 },
  howNumber: { fontSize: 15, color: "#E7C78C", fontWeight: "700", marginBottom: 5 },
  howStepTitle: { color: "#FFFAF2", fontSize: 27, lineHeight: 33, fontWeight: "600" },
  howStepCopy: { color: "#EAE7DE", fontSize: 15, lineHeight: 24 },
  previewSection: { backgroundColor: "#FFFFFF", paddingVertical: 85, paddingHorizontal: 22 },
  previewInner: { gap: 20 },
  previewHeading: { color: INK, fontSize: 48, lineHeight: 56, fontWeight: "600", maxWidth: 840 },
  sectionHeadingMobile: { fontSize: 37, lineHeight: 44 },
  previewNotice: { color: "#706458", fontSize: 13, lineHeight: 22 },
  demoTabs: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  demoTab: { minHeight: 44, paddingHorizontal: 18, paddingVertical: 11, borderWidth: 1, borderRadius: 12, borderColor: "#D4CFC7" },
  demoTabActive: { backgroundColor: GREEN, borderColor: GREEN },
  demoTabText: { color: INK, fontSize: 14, fontWeight: "600" },
  demoTabTextActive: { color: "#FFF9ED" },
  demoRow: { flexDirection: "row", gap: 20 },
  demoRowMobile: { flexDirection: "column" },
  demoProfile: { flex: 0.84, borderRadius: 20, borderWidth: 1, borderColor: "#E6DCCA", overflow: "hidden", backgroundColor: CREAM, padding: 18, gap: 8 },
  demoProfileMobile: { flex: 0 },
  demoPhoto: { height: 330, width: "100%", borderRadius: 13 },
  exampleBadge: { color: "#886125", fontSize: 11, fontWeight: "800", letterSpacing: 1.5, paddingTop: 6 },
  demoName: { color: INK, fontSize: 27, fontWeight: "700" },
  demoMeta: { color: "#60594F", fontSize: 14, lineHeight: 21 },
  demoQuote: { color: "#454E40", fontSize: 16, fontStyle: "italic", lineHeight: 24, paddingTop: 7 },
  demoContent: { flex: 1.15, borderRadius: 20, backgroundColor: GREEN, padding: 35, gap: 20, justifyContent: "center", minHeight: 470, alignItems: "flex-start" },
  demoContentMobile: { flex: 0, padding: 25 },
  demoContentKicker: { color: "#E8CC92", fontSize: 12, fontWeight: "700", letterSpacing: 1.4 },
  demoContentHeading: { color: "#FFF9ED", fontSize: 39, lineHeight: 47, fontWeight: "600" },
  demoContentCopy: { color: "#E3D5BE", fontSize: 17, lineHeight: 26 },
  sampleBubble: { padding: 12, backgroundColor: "#FCF8F0", borderRadius: 14, maxWidth: "90%" },
  sampleBubbleRight: { alignSelf: "flex-end", backgroundColor: "#E5B96B" },
  bubbleText: { fontSize: 14, color: INK, lineHeight: 21 },
  demoDisclaimer: { color: "#E3D5BE", fontSize: 13, lineHeight: 19 },
  signupPanel: { flexDirection: "row", justifyContent: "space-between", gap: 24, alignItems: "center", backgroundColor: GREEN, borderRadius: 20, padding: 28 },
  signupPanelMobile: { flexDirection: "column", alignItems: "flex-start" },
  signupPanelCopy: { flex: 1, gap: 10 },
  signupTitle: { color: "#F9F1E5", fontSize: 28, lineHeight: 34, fontWeight: "600" },
  signupDescription: { color: "#EDE1D2", fontSize: 15, lineHeight: 23, maxWidth: 650 },
  privacySection: { backgroundColor: "#FBF8F2", paddingHorizontal: 22, paddingVertical: 90 },
  privacyGrid: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 56 },
  privacyGridMobile: { flexDirection: "column", gap: 28, alignItems: "flex-start" },
  privacyCopy: { flex: 1, gap: 16 },
  privacyHeading: { fontSize: 52, lineHeight: 59, fontWeight: "600", color: INK },
  privacyItalic: { color: "#896019", fontStyle: "italic" },
  privacyLead: { color: "#5D645B", fontSize: 18, lineHeight: 27, marginBottom: 8 },
  privacyItem: { gap: 4 },
  privacyItemTitle: { color: INK, fontSize: 17, fontWeight: "600" },
  privacyItemCopy: { color: "#5D645B", fontSize: 15, lineHeight: 21, paddingLeft: 23 },
  privacyImage: { flex: 0.85, width: "48%", minHeight: 420, maxHeight: 500 },
  privacyImageMobile: { flex: 0, alignSelf: "center", width: "100%", height: 360, minHeight: 350 },
  closingSection: { backgroundColor: "#17372D", paddingHorizontal: 22, paddingVertical: 90 },
  closingInner: { gap: 20, alignItems: "flex-start" },
  closingHeading: { fontSize: 62, lineHeight: 70, maxWidth: 920, color: "#FFF9ED", fontWeight: "500" },
  closingCopy: { color: "#E8E8DD", fontSize: 18, lineHeight: 28, maxWidth: 700 },
  closingButtons: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14 },
  footer: { backgroundColor: CREAM, paddingHorizontal: 22, paddingVertical: 45 },
  footerInner: { gap: 18 },
  footerWordmark: { color: GREEN, fontSize: 29, fontWeight: "700" },
  footerIntro: { color: "#625E53", fontSize: 14 },
  footerLinks: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  footerLink: { color: GREEN, fontSize: 14, fontWeight: "600" },
  footerSafety: { borderTopWidth: 1, borderTopColor: "#E6DDD1", paddingTop: 16, gap: 6 },
  footerDisclaimer: { color: "#777166", fontSize: 12, lineHeight: 19 },
});
