# Humbble Design System — Tokens & Accessibility Primitives (PR P1-02)

- **Work Package:** PR P1-02 (`docs/plan/Humbble_Execution_Build_Plan_v1.2.md` §3 Phase 1)
- **Standard:** WCAG 2.2 Level AA (`SC 1.4.3 Contrast (Minimum)`, `SC 1.4.11 Non-text Contrast`, `SC 2.3.3 Animation from Interactions`, `SC 2.4.7 Focus Visible`, `SC 2.5.8 Target Size (Minimum)`, `SC 4.1.2 Name, Role, Value`)
- **Design Direction:** Warm editorial bumble-gold (`#FFD600`) and spotlight amber (`#FFA600`) paired with high-contrast charcoal (`#0F0F0E`, `#11181C`, `#151718`, `#1A1A1A`) and crisp neutral surfaces (`#FFFFFF`, `#F8F9FA`, `#EBEBEB`).

---

## 1. Visual Direction & Baseline Remediation

Inspection of `constants/Colors.ts`, `components/`, and `app/` screens confirmed the established Humbble visual language:
1. **Brand Accents:** Warm yellow-gold (`#FFD600` in `app/auth/signin.tsx` and `app/auth/signup.tsx`) and warm spotlight amber (`#FFA600` in `app/(tabs)/discover.tsx` and `app/(tabs)/profile.tsx`).
2. **Dark Editorial Anchors:** Deep charcoal (`#0F0F0E` light tint, `#11181C` body text, `#151718` dark background, `#1A1A1A` primary pill buttons, `#1C1C1C` secondary pill text).
3. **Key Accessibility Remedies in Token System:**
   - **Gold Button Text Contrast:** In `app/auth/signin.tsx:322-329`, white text (`#FFFFFF`) on `#FFD600` yields only **1.41:1** contrast (fails WCAG 2.2 AA). Our `Colors.*.onPrimary` token pairs `#1A1A1A` text on `#FFD600` (**12.32:1**, passing AAA) while also providing a `"charcoal"` `Button` variant (`#FFFFFF` on `#1A1A1A`, **17.40:1**) matching `components/Button.jsx` and `app/(tabs)/index.tsx`.
   - **Placeholder & Muted Text Contrast:** Existing `#999999` placeholders on `#F8F9FA` inputs yield **2.70:1** (fails AA). `Colors.light.textMuted` uses `#5C646A` (**5.71:1** on `#F8F9FA`, **6.02:1** on `#FFFFFF`).

---

## 2. Color Tokens & Computed WCAG 2.2 AA Contrast Matrix

Relative luminance $L$ and contrast ratio $CR = \frac{L_{\text{lighter}} + 0.05}{L_{\text{darker}} + 0.05}$ are computed in `constants/Colors.ts` via `getRelativeLuminance()` and `getContrastRatio()` and asserted in `components/__tests__/ui-primitives-test.tsx`.

### 2.1 Light Theme Contrast Pairs (`Colors.light`)

| Pair ID | Foreground Token | Foreground Hex | Background Token | Background Hex | Computed Contrast Ratio | WCAG 2.2 AA Requirement | Status |
|---|---|---|---|---|---:|---:|---|
| `light.text-on-background` | `Colors.light.text` | `#11181C` | `Colors.light.background` | `#FFFFFF` | **17.93 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `light.textSecondary-on-background` | `Colors.light.textSecondary` | `#525860` | `Colors.light.background` | `#FFFFFF` | **7.18 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `light.textMuted-on-surfaceMuted` | `Colors.light.textMuted` | `#5C646A` | `Colors.light.surfaceMuted` | `#F8F9FA` | **5.71 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AA) |
| `light.onPrimary-on-primary` | `Colors.light.onPrimary` | `#1A1A1A` | `Colors.light.primary` | `#FFD600` | **12.32 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `light.onAccent-on-accent` | `Colors.light.onAccent` | `#1A1A1A` | `Colors.light.accent` | `#FFA600` | **8.87 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `light.onSecondary-on-secondary` | `Colors.light.onSecondary` | `#1C1C1C` | `Colors.light.secondary` | `#EBEBEB` | **14.30 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `light.textInverse-on-charcoal` | `Colors.light.textInverse` | `#FFFFFF` | `BrandPalette.charcoal750` | `#1A1A1A` | **17.40 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `light.link-on-background` | `Colors.light.link` | `#0A7EA4` | `Colors.light.background` | `#FFFFFF` | **4.63 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AA) |
| `light.errorText-on-errorSurface` | `Colors.light.errorText` | `#B71C1C` | `Colors.light.errorSurface` | `#FDECEA` | **5.74 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AA) |
| `light.danger-on-background` | `Colors.light.danger` | `#C62828` | `Colors.light.background` | `#FFFFFF` | **5.62 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AA) |
| `light.onDangerSolid-on-dangerSolid` | `Colors.light.onDangerSolid` | `#FFFFFF` | `Colors.light.dangerSolid` | `#C62828` | **5.62 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AA) |
| `light.successText-on-successSurface` | `Colors.light.successText` | `#1B5E20` | `Colors.light.successSurface` | `#E8F5E9` | **7.00 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `light.warningText-on-warningSurface` | `Colors.light.warningText` | `#7A4F01` | `Colors.light.warningSurface` | `#FFF8E1` | **6.71 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AA) |
| `light.infoText-on-infoSurface` | `Colors.light.infoText` | `#0D47A1` | `Colors.light.infoSurface` | `#E3F2FD` | **7.56 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |

### 2.2 Dark Theme Contrast Pairs (`Colors.dark`)

| Pair ID | Foreground Token | Foreground Hex | Background Token | Background Hex | Computed Contrast Ratio | WCAG 2.2 AA Requirement | Status |
|---|---|---|---|---|---:|---:|---|
| `dark.text-on-background` | `Colors.dark.text` | `#ECEDEE` | `Colors.dark.background` | `#151718` | **15.34 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `dark.text-on-surface` | `Colors.dark.text` | `#ECEDEE` | `Colors.dark.surface` | `#1E2022` | **13.94 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `dark.textSecondary-on-background` | `Colors.dark.textSecondary` | `#9BA1A6` | `Colors.dark.background` | `#151718` | **6.89 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AA) |
| `dark.textSecondary-on-surface` | `Colors.dark.textSecondary` | `#9BA1A6` | `Colors.dark.surface` | `#1E2022` | **6.26 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AA) |
| `dark.primary-on-background` | `Colors.dark.primary` | `#FFD600` | `Colors.dark.background` | `#151718` | **12.74 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `dark.errorText-on-errorSurface` | `Colors.dark.errorText` | `#FFB4AB` | `Colors.dark.errorSurface` | `#3B1214` | **9.64 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `dark.successText-on-successSurface` | `Colors.dark.successText` | `#A5D6A7` | `Colors.dark.successSurface` | `#0F2912` | **9.49 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `dark.warningText-on-warningSurface` | `Colors.dark.warningText` | `#FFD54F` | `Colors.dark.warningSurface` | `#2E2205` | **11.05 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |
| `dark.infoText-on-infoSurface` | `Colors.dark.infoText` | `#90CAF9` | `Colors.dark.infoSurface` | `#0D2137` | **9.31 : 1** | $\ge 4.5 : 1$ (Normal Text) | PASS (AAA) |

---

## 3. Typography Tokens (`constants/Typography.ts`)

| Variant | Font Size | Line Height | Font Weight | Letter Spacing | Primary Usage |
|---|---:|---:|---:|---:|---|
| `display` | `32px` | `38px` | `700` (Bold) | `-0.2px` | Auth welcome headers, hero titles (`ThemedText.title`) |
| `h1` | `24px` | `32px` | `700` (Bold) | `1.0px` | Screen headers (`Header`), swipe deck name/age (`PeopleCard`), form headings |
| `h2` | `22px` | `30px` | `600` (SemiBold) | `0px` | Profile name heading (`profile.tsx`) |
| `h3` | `20px` | `28px` | `700` (Bold) | `0px` | Dialog titles, primary section headings (`Recommendations for you`) |
| `subtitle` | `18px` | `26px` | `800` (ExtraBold) | `0px` | Compact profile card headings (`UserCard`), carousel titles |
| `body` | `16px` | `24px` | `400` (Regular) | `0px` | Default body copy, form inputs |
| `bodySemiBold` | `16px` | `24px` | `600` (SemiBold) | `0px` | Emphasized body text, match list headers |
| `bodySmall` | `14px` | `20px` | `400` (Regular) | `0px` | Toast/alert messages, secondary descriptions |
| `button` | `16px` | `24px` | `700` (Bold) | `0.5px` | Standard buttons (`md`) |
| `buttonLarge` | `18px` | `26px` | `700` (Bold) | `0.5px` | Primary CTA buttons (`lg`) |
| `label` | `14px` | `20px` | `600` (SemiBold) | `0px` | Form field labels, toast headings |
| `caption` | `12px` | `18px` | `400` (Regular) | `0px` | Helper text, legal disclosures, verified badge label |
| `link` | `16px` | `30px` | `500` (Medium) | `0px` | Inline text links |

---

## 4. Spacing, Radii, Breakpoints & Motion Tokens

### 4.1 Spacing & Touch Targets (`constants/Spacing.ts`)
- **Scale:** `none: 0`, `xxs: 2`, `xs: 4`, `sm: 6`, `md: 8`, `mdPlus: 10`, `lg: 12`, `xl: 16`, `2xl: 20`, `3xl: 24`, `4xl: 30`, `5xl: 40`, `6xl: 50`, `7xl: 60`.
- **Touch Targets:**
  - `TouchTargets.wcagMinimum`: `24pt` (WCAG 2.2 SC 2.5.8 Target Size Minimum)
  - `TouchTargets.minimum`: `44pt` (standard mobile button minimum height)
  - `TouchTargets.comfortable`: `48pt` (text inputs and large CTA buttons)

### 4.2 Border Radii (`constants/Radii.ts`)
- `none: 0`, `xs: 4`, `sm: 8` (toasts/alerts), `md: 10` (`PeopleCard` / media inner frames), `lg: 12` (inputs, `UserCard`, standard buttons), `xl: 16` (dialogs), `2xl: 20` (Spotlight/Premium upsell cards), `pill: 30` (pill buttons, auth sheet top corners), `full: 9999` (avatars, circular icon buttons).

### 4.3 Responsive Breakpoints (`constants/Breakpoints.ts`)
- `xs: 320` (compact mobile), `sm: 360` (mid-range mobile devices), `md: 768` (tablet / split view), `lg: 1024` (desktop web), `xl: 1280` (wide desktop).
- Container constraints (`MaxContentWidth`): `form: 480`, `cardDeck: 420`, `dialog: 440`, `page: 1024`.

### 4.4 Motion & Reduced-Motion (`constants/Motion.ts`)
- `MotionDurations`: `instant: 0`, `fast: 150`, `normal: 250`, `slow: 350`, `toastDefault: 4000`.
- `useReducedMotion()` subscribes to `AccessibilityInfo.isReduceMotionEnabled()` and `reduceMotionChanged`. When enabled:
  - All transition durations resolve to `0ms` via `resolveAnimationDuration()`.
  - Press scale transforms collapse from `0.98` to `1.0` (`getMotionConfig(true).pressedScale === 1`).
  - `Dialog` switches `Modal` `animationType` from `"fade"` to `"none"`.

---

## 5. Accessible UI Primitives (`components/ui/`)

| Component | File | Accessibility & State Contract |
|---|---|---|
| `Button` | `components/ui/Button.tsx` | `accessibilityRole="button"`, `accessibilityLabel` (resolved from `accessibilityLabel`, `label`, or string `children`), `accessibilityState={{ disabled, busy }}`, focus ring (`2px` `focusRing`), pressed opacity/scale respecting `useReducedMotion`, minimum 44pt height + 8pt hitSlop. |
| `TextField` | `components/ui/TextField.tsx` | Associates visible `<Text nativeID={labelId}>` with `<TextInput accessibilityLabelledBy={labelId}>`; exposes `accessibilityState={{ disabled }}`; renders validation errors with `accessibilityRole="alert"` and `accessibilityLiveRegion="polite"`. |
| `Card` | `components/ui/Card.tsx` | Supports static (`View`) and interactive (`Pressable`) modes across `elevated`, `outlined`, `muted`, and `accent` variants; interactive cards expose `accessibilityRole="button"`, `accessibilityState={{ disabled }}`, focus ring, and reduced-motion press feedback. |
| `Dialog` | `components/ui/Dialog.tsx` | Modal container with `accessibilityViewIsModal={true}`, header title (`accessibilityRole="header"`), accessible backdrop close button, primary/secondary `Button` actions, and reduced-motion `animationType="none"`. |
| `Toast` | `components/ui/Toast.tsx` | Status/error banner with `accessibilityRole="alert"`, `accessibilityLiveRegion` (`"assertive"` for errors, `"polite"` for info/success/warning), WCAG AA semantic surface/text pairs, and an accessible dismiss button. |
| `ProfileMedia` | `components/ui/ProfileMedia.tsx` | Unified profile photo surface for discovery carousels (`small`/`large`) and swipe cards (`deck`); computes screen-reader summary (`Name, Age, Verified profile, Subtitle`), renders dark scrim (`rgba(0,0,0,0.65)`) for white overlay text contrast, and provides an accessible initials fallback when `imageUri` is absent. |
