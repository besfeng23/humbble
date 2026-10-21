# P3-01 — Supabase Auth lifecycle and 18+ entry gate

## Scope and trust boundaries

`lib/AuthProvider.tsx` is the one client-side session authority. It subscribes to `supabase.auth.onAuthStateChange`, hydrates the persisted session once, exposes loading/session/user/sign-out state, and records a calm reauthentication message after an unexpected sign-out. The root layout renders a neutral pending state until this hydration settles. Protected route groups remain hidden while loading and unauthenticated visitors are redirected to `/auth/signin`. Web session storage uses the browser's persistent storage; native uses the existing AsyncStorage adapter. Auth sessions and tokens are never logged.

Supabase configuration remains environment-only: `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or the existing compatibility variable `EXPO_PUBLIC_SUPABASE_ANON_KEY`. `EXPO_PUBLIC_AUTH_REDIRECT_URL` is an optional *development callback URL*, not a secret. No service-role key belongs in the client. Auth uses PKCE; `detectSessionInUrl` is enabled only on web. Unconfigured builds fail closed without logging environment names and show the neutral notice `Sign-in is unavailable in this build` with submit controls disabled.

A client-entered DOB is an entry gate, not provider verification or proof of identity. The database trigger remains the final authority. Profile creation omits `verification_status`, `is_discoverable`, and `is_suspended`, allowing database defaults/column locks to control them. Existing `birth_date` is immutable to ordinary authenticated clients by the current schema; the screen does not attempt to bypass that rule. No verification fields are written by this UI.

## User flows and routes

| Flow | Route sequence | Expected states |
|---|---|---|
| Registration | `/auth/signup` → `/auth/check-email` → link `/auth/callback` → `/(onboarding)/basics` | Password validation; neutral check-email response; invalid/expired callback offers a new-link action. A duplicate address is never named in an error message. |
| Sign in | `/auth/signin` → existing profile `/(tabs)/people`, or new profile `/(onboarding)/basics` | Wrong credentials and unknown account use `Email or password is incorrect`; only Supabase code `email_not_confirmed` gets its own message. Network/429/5xx failures are retryable. |
| Recovery | `/auth/recovery` → `/auth/check-email` → `/auth/callback` → `/auth/reset-password` → `/auth/signin?reset=complete` | Request response is neutral even if provider errors; password/confirmation must match and meet the six-character client minimum. |
| Sign out | AuthProvider `signOut()` → `/auth/signin` | Session state is cleared before the UI returns to the public sign-in route. A routine user-initiated sign-out is not reported as an expired session. |
| Age gate | `/(onboarding)/basics` → DOB validation and profile insert → `/(onboarding)/verify` | Under-18 entry blocks without database writes and has a sign-out action. SQLSTATE `23514` or `P0001` age-policy rejection maps to the same block message. |
| Verification | `/(onboarding)/verify` | Renders `Verification not available yet.` No provider has been selected; there is no simulated pending/success state and no client write to verification fields. |

## Redirect allowlist and callback handling

`lib/auth/redirects.ts` allows only `humbble://auth/callback`, the local callback `http://localhost:8081/auth/callback`, and the exact callback URL in `EXPO_PUBLIC_AUTH_REDIRECT_URL` when set. No other web origin is accepted. Custom environment values must be the complete callback URL (for example, `https://your-dev-host/auth/callback`) and that same callback must be on the development project's Supabase redirect allowlist. Use generic development-project configuration only; no hosted production setup or credentials are part of this change.

Post-auth `next` values must exactly match one of these relative route paths: `/(onboarding)/basics`, `/auth/reset-password`, `/auth/signin`, or `/(tabs)/people`. Absolute URLs, protocol-relative values, backslash/traversal variants, query/hash-suffixed paths, and unknown paths are rejected. Callback handles either PKCE `code` exchange or Supabase `token_hash` verification, then sends a valid recovery flow to reset-password and confirmation to onboarding. In web, it removes the query string and fragment from browser history before processing and never logs callback parameters.

## States, accessibility, and preview

Auth screens are deliberately sparse: a single title, at most one short supporting line, labelled inputs, inline accessible errors, one primary action, and at most one secondary text link. Headers have no divider/shadow. Google and Facebook OAuth controls are absent until their providers are deliberately configured. Buttons expose disabled/busy states; password fields use platform password managers; forms accept keyboard submit; reduced motion is inherited from shared components where used.

In an Expo development build (`__DEV__` only), open `/auth/preview` to navigate to sign-in, sign-up, check-email, recovery, reset-password, callback failure, under-18 block, and verification-unavailable states without live Supabase credentials. The preview route redirects away in production; `preview=underage` and `preview=verify` bypass the onboarding route guard only in development builds, and the age-gate preview performs no database work. This preview state is not a test result and is not available in production output.

## Not implemented by P3-01

- A third-party identity/age-verification provider, provider session creation, or server-side verification outcomes.
- Any client-side write that sets `verification_status = 'verified'`, `is_discoverable = true`, or any other server-locked eligibility flag.
- Profile discovery activation, photo/prompt completion, moderation appeals, OAuth sign-in, custom CAPTCHA/rate-limit infrastructure, account deletion, billing, or paywall changes.
- Production redirect configuration or hosted database migration/application. Use only the local Supabase stack (`http://127.0.0.1:54321`) or a separate development project approved by the owner.

## Local validation

From the repository root, with Node dependencies installed and the local Supabase stack running as needed:

```sh
npm run lint
npm run typecheck
npm test
npx expo start --web
```

Use `/auth/preview` in the development web server for visual review at 390×844 and 1280×900. The integrator must capture every changed screen and state and obtain owner screenshot approval before merge. Auth configuration and redirect allowlists are managed in the separate development Supabase project; no production credentials are needed for UI preview or unit tests.
