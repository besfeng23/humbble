# P0-04: Environment Contract and Local Developer Setup

- **Status:** Implemented (`grok/p0-04-env`)
- **Plan Reference:** `docs/plan/Humbble_Execution_Build_Plan_v1.2.md` — §V1.2 Amendment A3, §3 PR P0-04, §7 Environments, infrastructure and approval boundaries
- **Baseline Commit:** `677e155e` (`main`)
- **Secret Policy:** Zero secret values are recorded in this document or in `.env.example`.

---

## 1. Environment Contract Overview

Humbble enforces a strict separation between **client-exposed public variables** (`EXPO_PUBLIC_*`) and **trusted server-only secrets**:

1. **Client Bundle Exposure (`EXPO_PUBLIC_*`):**
   - Expo inlines any environment variable prefixed with `EXPO_PUBLIC_` directly into compiled JavaScript bundles across Web, iOS, and Android.
   - Only public project URLs and publishable/anonymous Supabase keys (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) are permitted under `EXPO_PUBLIC_*`.
   - Security enforcement continues to rely on PostgreSQL Row-Level Security (RLS), column-level grants, and hardened server-side RPCs (`PR P2-01`–`PR P2-05`), never on the secrecy of `EXPO_PUBLIC_*` values.

2. **Server-Only Secrets (Never in `.env` or `EXPO_PUBLIC_*`):**
   - Privileged credentials must live exclusively in trusted server runtime environments (Vercel environment vault / Supabase Edge Function secrets / CI secret store) and must **never** be prefixed with `EXPO_PUBLIC_` or placed in local client `.env` files:
     - `SUPABASE_SERVICE_ROLE_KEY` (or restricted server DB role credentials)
     - PayPal REST client secret (`PAYPAL_CLIENT_SECRET`) and webhook verification ID (`PAYPAL_WEBHOOK_ID`)
     - Identity/age verification provider secret keys and webhook signing secrets
     - PostHog pseudonymization HMAC salt (`ANALYTICS_HMAC_SALT`)
     - Transactional email provider API keys
     - Android/iOS release signing credentials (`HUMBBLE_UPLOAD_*`, see `docs/security/P0-02-secrets-hygiene.md`)

3. **Git Ignore Enforcement (`.gitignore`):**
   - `.gitignore` (lines 37–40, hardened in `PR P0-02`) ignores `.env`, `.env.*`, and `.env*.local` while explicitly allowing `!.env.example`.
   - Developers must never force-add (`git add -f`) `.env` files or paste credential values into PR descriptions, issues, logs, or test snapshots.

---

## 2. Variable Reference

### 2.1 Client Public Variables (`.env.example`)

| Variable | Required | Scope | Description |
|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Client (`EXPO_PUBLIC_*`) | Base URL of the local Supabase CLI stack (`http://127.0.0.1:54321`) or isolated development/staging/production Supabase project (`https://<project-ref>.supabase.co`). |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes (or `ANON_KEY`) | Client (`EXPO_PUBLIC_*`) | Supabase publishable client key (`sb_publishable_...`). Checked first by `lib/supabase.ts`. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Fallback if `PUBLISHABLE_KEY` unset | Client (`EXPO_PUBLIC_*`) | Legacy/standard Supabase anonymous JWT public key (`eyJ...`). Used when `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is blank or unset. |

### 2.2 Future Server-Only Variables (Phase 4 & Phase 5 — Server Runtime Only)

These variables are **not** used by the Expo client and must **not** be added to `.env.example` under `EXPO_PUBLIC_*`. They will be validated by the server environment schema in `PR P4-01` and `PR P5-02`–`P5-04`:

| Variable (Planned) | Phase / PR | Runtime Boundary | Purpose |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `P4-01`, `P5-02` | Trusted server only | Privileged reconciliation, webhook ledger persistence, account deletion orchestration. |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | `P4-01` | Trusted server only | PayPal Subscriptions REST API authentication (**Sandbox only** until separate owner live approval). |
| `PAYPAL_WEBHOOK_ID` | `P4-02` | Trusted server only | Cryptographic verification of incoming PayPal webhook signatures. |
| `PAYPAL_ENV` | `P4-01` | Trusted server only | Locked to `sandbox` during development, staging, and pilot until explicit owner live authorization. |
| `ANALYTICS_HMAC_SALT` | `P5-03` | Trusted server only | HMAC-SHA256 salt for pseudonymous analytics distinct IDs. |

---

## 3. Fail-Closed Client Behavior (`lib/supabase.ts`)

1. **Missing or Placeholder Configuration Detection:**
   - `lib/supabase.ts` trims `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
   - `isSupabaseConfigured` evaluates to `false` if either the URL or key is missing, empty, malformed, or matches known placeholder patterns (such as `placeholder.supabase.co`, `<project-ref>`, `your-project-ref`, `placeholder-anon-key`, `<anon-key>`).
   - When `isSupabaseConfigured` is `false`:
     - A clear diagnostic error is logged (`Supabase Auth is not configured. Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY / EXPO_PUBLIC_SUPABASE_ANON_KEY.`) **without printing any variable values**.
     - `persistSession`, `autoRefreshToken`, and `detectSessionInUrl` are disabled (`false`), and in-memory storage is used instead of `AsyncStorage` / `localStorage`.
     - The client's `global.fetch` is replaced with `failClosedFetch`, which rejects immediately with the configuration error rather than contacting `https://placeholder.supabase.co` over the network.
     - Auth screens (`app/auth/signin.tsx`, `app/auth/signup.tsx`) check `isSupabaseConfigured` and display `'Auth is not configured'`.

2. **`AppState` Auto-Refresh Listener Lifecycle:**
   - On native platforms (`Platform.OS !== 'web'`), `lib/supabase.ts` registers an `AppState` `'change'` listener via `registerSupabaseAppStateListener()`.
   - The `NativeEventSubscription` handle is stored in module state (`appStateSubscription`) and guarded against duplicate registration across repeated calls.
   - `cleanupSupabaseAppStateListener()` is exported to call `appStateSubscription.remove()`, clear the stored subscription handle, and stop auto-refresh (`supabase.auth.stopAutoRefresh()`).

---

## 4. Local Developer Setup

1. **Create `.env` from the template:**
   ```bash
   cp .env.example .env
   ```
2. **Verify `.env` is ignored by Git:**
   ```bash
   git check-ignore -v .env
   # Expected output: .gitignore:37:.env	.env
   ```
3. **Populate `.env` with local or dedicated development credentials:**
   - **Option A — Local Supabase CLI (`PR P2-01+`):**
     Run `npx supabase start` and copy the local `API URL` (`http://127.0.0.1:54321`) and `anon key` into `.env`.
   - **Option B — Dedicated Humbble Development Project (once provisioned):**
     Copy the project URL and publishable/anon key from the dedicated Humbble development project.
   - **Prohibited projects:** Never point `.env` at `Pandora's Box`, `Pandora's Box Memory`, or production environments (Plan §0.2, §7).
4. **Start the Expo development server:**
   ```bash
   npx expo start --clear
   ```

---

## 5. Environment Separation & Redirect URLs

| Environment | Supabase Target | Data Policy | Allowed Auth Redirect Origins |
|---|---|---|---|
| **Local** | Local Supabase CLI (`http://127.0.0.1:54321`) or disposable dev project | Synthetic accounts & content only | `http://localhost:8081/auth/signin`, `http://localhost:19006/auth/signin` |
| **Development** | Dedicated Humbble Dev project (pending owner provisioning approval) | Synthetic accounts & content only | Preview/dev domain allowlist only |
| **Staging** | Isolated Humbble Staging project | Synthetic data + PayPal Sandbox | Staging canonical domain allowlist only |
| **Production** | Isolated Humbble Production project (after all 12 release gates) | Real users after legal/safety/security gates | Owner-approved canonical production domain & registered mobile deep-link scheme |

---

## 6. Route Guard Remediation (`app/charscreenf.tsx`)

- **Audit Finding:** `app/charscreenf.tsx` is a root-level stub route registered in `app/_layout.tsx:45` outside the `(tabs)` layout auth guard.
- **Linkage Analysis:** Inspection of the codebase confirmed that `app/(tabs)/(chats)/index.tsx:19` actively links to `/charscreenf` (`router.push("/charscreenf")` on the `"Your matches"` pressable), and `app.json:40` enables `"typedRoutes": true`.
- **Action Taken in P0-04:** Because `app/(tabs)/(chats)/index.tsx` is outside the P0-04 file scope and links to `/charscreenf`, deleting `app/charscreenf.tsx` in this PR would break navigation from the Chats screen. Instead, `app/charscreenf.tsx` has been placed behind the `useAuth()` session guard (rendering `ActivityIndicator` while `loading` and `<Redirect href="/auth/signin" />` when `!session`, matching `app/(tabs)/_layout.tsx:23-33`).
- **Follow-up:** Consolidate or remove `app/charscreenf.tsx` together with the `app/(tabs)/(chats)/index.tsx` caller and `chatScreen.tsx` casing fix in `PR P1-01` / `PR P1-03` / `PR P3-04`.

---

## 7. Items Flagged for Owner Decision

1. **App Bundle Identifier (`ios.bundleIdentifier` / `android.package`) and Custom URL Scheme (`scheme`) in `app.json`:**
   - **Status:** Decided and applied across `app.json` and native projects (`android/` and `ios/`).
   - **Canonical Identity:** iOS `bundleIdentifier` and Android `package` / `applicationId` / `namespace` are set to `com.banataosystems.humbble`, and the custom deep-link `scheme` is set to `humbble` across `app.json`, `android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/com/banataosystems/humbble/*.kt`, `ios/humbble/Info.plist`, and `ios/humbble.xcodeproj/project.pbxproj`.
2. **Dedicated Development Supabase Project & Canonical Web Domain / Redirect Allowlist:**
   - Confirm provisioning approval for the isolated Humbble development Supabase project (within the ₱10,000/month ceiling) and confirm the canonical Vercel domain + Supabase Auth redirect URL allowlist (Plan §0.2, §10).
