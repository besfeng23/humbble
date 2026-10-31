# Sincera entire-system parity and migration acceptance inventory

Source: inspected Bubble Live (`sincera`), October 30, 2026, compared against GitHub `besfeng23/humbble`, branch `feat/sincera-bubble-alignment-20261030`. This is **not a completed migration** or claim of pixel-perfect parity.

## Four-platform authority

| Environment | Current job | Authoritative records |
|---|---|---|
| Bubble Live, `sincera.chat` | Existing public and member product | Existing Bubble users, private photos, matches, messages, verification and operations |
| GitHub, `besfeng23/humbble` | Independent Expo web/native implementation under review | Source code, not existing Bubble member records |
| Vercel `humbble` | Git-linked Expo preview and secure backend bridge | Deployment artifacts; no Bubble member database |
| Supabase `bthfgwxgusizfjtmcacc` | Independent, RLS-protected Humbble schema and auth | New Supabase sessions and records; NOT Bubble Live identity |

## Live Bubble inventory

31 web pages, 38 backend workflows, 31 data types, 27 option sets, 5 reusables, 2 plugins (Google and API Connector). Live application also includes three mobile views.

**Latest addition (October 30, 2026):** `20261030000001_sincera_member_operations.sql` adds member-notification events and idempotent, rate-limited member support tickets with owner-only read policies. Remote migration applied to the separate `humbble` Supabase project (not Bubble Live). GitHub includes an isolated two-account pgTAP suite; consult exact-head CI for results.

**Status legend**: Implemented (route exists but no visual/functional certification), Partially aligned (design/copy revised in this PR but still requires side-by-side and dual-member tests), Missing (no equivalent independent screen), Security review (privileged or sensitive path requires independent acceptance). Status is intentionally conservative.

| Bubble Live page | GitHub Expo route / counterpart | Current parity |
|---|---|---|
| index | `app/(public)/index.tsx` | Partially aligned: all main public sections and illustrative media ported |
| join | `app/auth/signup.tsx` plus `app/(onboarding)/*` | Partially aligned: Bubble editorial masthead, display name, password confirmation and 12-character minimum implemented; date of birth is collected after email confirmation, not inside the original Bubble popup |
| reset_pw | `app/auth/recovery.tsx`, `app/auth/reset-password.tsx` | Implemented, flow and visuals unverified |
| 404 | `app/+not-found.tsx` | Implemented, visual parity unverified |
| discover | `app/(tabs)/people.tsx`, `components/discovery/DiscoveryGrid.tsx`, `components/discovery/DiscoveryFeed.tsx` | Partially aligned: Bubble-style responsive 1/2/3-column member grid, search, like/pass and safe profile links; unsupported full-country/intent/server filters remain non-equivalent |
| liked_you | `app/(tabs)/index.tsx` | Partially aligned; preview payment upsells cannot sell |
| matches | `app/(tabs)/matches.tsx` (list) plus `app/(tabs)/(chats)/match.tsx` (single match) | Partially aligned: dedicated mutual-match list, empty state and chat/safety links; source data is independent Supabase |
| messages | `app/(tabs)/(chats)/index.tsx` | Partially aligned; no cross-app inbox migration |
| conversation | `app/(tabs)/(chats)/[conversationId].tsx` | Implemented, private message safety and state tests pending |
| member_profile | `app/(tabs)/discover/[id].tsx` | Implemented, field/photo permissions and visuals unverified |
| my_profile | `app/(tabs)/profile.tsx` | Partially aligned: own signed photo URLs, profile trust checklist, completion guide and settings links; photo moderation and workflows need journey verification |
| preferences | `app/(tabs)/discover/filters.tsx` | Incomplete: current RPC supports age, Bubble has many more filters |
| account_settings | `app/(tabs)/account-settings.tsx` | Partially aligned: Bubble's three-section account hub and implemented links; detailed privacy/notification/billing settings remain separate |
| privacy_settings | `app/(tabs)/profile/settings.tsx` and data requests | Incomplete: do not claim unsupported consent or privacy options work |
| membership | `app/(paywall)/billing.tsx` and `upgrade.tsx` | Blocked by provider/legal acceptance; no Live Sincera charge |
| pricing | `app/(public)/pricing.tsx` | Partially aligned: Sincera brand, proposals, paid CTA disabled |
| notifications | `app/(tabs)/notifications.tsx` + notification settings | Partially aligned: owner-only events, read and mark-all-visible-as-read, accurate match links and empty state; Bubble history not migrated |
| verification | `app/(onboarding)/verify.tsx` | Security review: provider/manual selfie flow not identical |
| verification_review | `app/(admin)/moderation/*` | Security review: human reviewer-only authorization and evidence required |
| safety | `app/(public)/safety.tsx`, `app/(safety)/report-modal.tsx`, blocked users | Partially aligned: standalone safety center and report/block flows exist; full Bubble safety/admin workflows and rendered parity not certified |
| moderator_queue | `app/(admin)/moderation/*` | Security review: queues and reviewer decisions not equivalent |
| admin_dashboard | `app/(admin)/dashboard.tsx` plus moderation routes | Partially aligned: moderator-only read-only triage snapshot; account access, subscriptions, affiliates, and full audit dashboards remain missing |
| how_it_works | `app/(public)/how-it-works.tsx` | Partially aligned: 5-step explanation ported |
| faq_help | `app/(public)/faq.tsx` | Partially aligned: core FAQ ported |
| contact_support | `app/(public)/contact-support.tsx` and authenticated Supabase support RPC | Partially aligned: signed-in requests saved and rate-limited; public guest form and staff response workflow remain incomplete |
| community_guidelines | `app/(public)/legal/[slug].tsx` | Incomplete: legal copy differs and requires counsel approval |
| terms_of_service | `app/(public)/legal/[slug].tsx` | Incomplete: existing Humbble terms must **not** be represented as Sincera approved legal terms |
| privacy_policy | `app/(public)/legal/[slug].tsx` | Incomplete: legal policy + retention review required |
| cookie_tracking_notice | Attribution storage and signup consent only | Missing: Bubble's granular analytics/attribution notice and withdrawal control need equivalent, consent-gated implementation |
| affiliate_program | `app/(public)/affiliate-program.tsx` | Partially aligned: stand-alone program information and visible legal HOLD; applications deliberately disabled pending approved terms |
| referrals | `lib/attribution.ts` and signup-attribution data only | Missing: no individual member invitation code/dashboard or reward entitlement; do not fabricate a referral URL, counts or commissions |

## Existing backend surface and acceptance

Bubble's 38 backend workflows include member session and identity, likes, mutual matches, messages, block/unmatch, photo verification, account restrictions, deletion, moderator decisions, emails/notifications, subscriptions, payment events, referral attribution, commissions and affiliate conversions.

**Do not copy those workflow names into new mock endpoints and call it complete.** Every corresponding Supabase RPC/Vercel function must prove:

1. A standard member can read/change **only their own** profile, account preferences, consent and deletion requests.
2. A member cannot read a stranger's private photo original, conversations, messages, invoices, verification selfie or support case.
3. Block and unmatch immediately prevent subsequent messaging, notification or account-discovery access, including through old URLs.
4. Account status, adult eligibility, email verification and moderator roles are **server-enforced**, not just hidden in the UI.
5. Payments require approved provider, verified signatures, idempotency, no client grants of premium and verified cancellation/renewal.
6. Deletion/export requires a working, separately approved worker and legal hold/retention logic; no instant deletion claims.
7. An opt-in identity migration proves **two independently authenticated member sessions**; never match users by email alone or transfer passwords.
8. Photo verification labels only mean what the approved provider/manual reviewer actually verified.
9. Analytics/affiliate events require consent and must never expose member details or conversation content to partners.
10. Two real isolated test accounts must complete cross-account negative tests over HTTPS on web and mobile.

## Latest parity implementation and known divergence

- Shared public navigation now follows Bubble's cream Cormorant wordmark and How it works / Safety / Pricing / Log in / Join free links on desktop and phone; member desktop nav and five mobile tabs are Discover, Likes, Matches, Messages, Profile. The redundant Explore primary tab is hidden.
- Public pricing, How it works, Safety, FAQ and partner pages have Bubble-derived headings, colors and content. The partner legal review hold remains visible. No live payment, affiliate intake or reward is enabled.
- Registration now collects display name, password and matching password confirmation; enforces 12+ characters and keeps mandatory consent unchecked. Adult birth-date proof remains a separate server-validated post-email-confirmation step.
- New member Account settings hub reproduces the source site's three-section information architecture without implying missing workflows are complete. Member notifications have read receipts and a bounded Mark all as read action.
- **Verified product-policy mismatch:** Bubble Live advertises 20 free likes/day, while independent Supabase `public.record_swipe` currently enforces 15. Public preview accurately states 15, and underlying quota must be brought into alignment through reviewed migration and tests before claiming full parity.
- Authenticated browser screenshot diffs, private original-photo authorization probes, genuine two-member journeys, legal approval, complete administrative and affiliate systems, and Bubble-to-Supabase identity/data migration remain OPEN. Code compilation, route HTTP 200 and test PASS are not substitutes.

## Tracking consent and quiz launch guardrail (verified source decisions)

- Bubble Live displays an optional tracking-choice floating group with **Allow / No thanks**. Preview now uses the same wording and consent choice, persisted per device, with a **Tracking choices** link to reopen it.
- No optional click/sub ID or UTM attribution is stored, retrieved or forwarded from the landing-to-quiz-to-signup flow unless the user expressly opted in. A denial clears stored attribution; missing/unwritable consent fails closed.
- Anonymous quiz tracking is separately **OFF by default** behind `EXPO_PUBLIC_QUIZ_ANALYTICS`, and when enabled also requires the same affirmative choice; denial blocks event transport and local session ID creation. DNT / GPC and quiz-specific opt-out remain additive safeguards.
- The signup terms consent and marketing opt-in remain separate from optional analytics/affiliate attribution. Real Bubble consent rows are not migrated into the independent Supabase Preview.
- Source UI parity and code/unit tests do **not** certify provider-side logging, complete cookie classification, jurisdiction-specific consent legal approval, or a deletion/withdrawal worker. Review these independently before any production cutover.

## Product-model discrepancy: fictional entertainment

Owner's planned future model includes non-explicit AI and paid human-operated fictional profiles, separate from genuine member dating. **This feature is not yet implemented in either reviewed Live or Expo product.**

Bubble Live currently represents itself as a real-member dating product, and its draft Terms explicitly prohibit artificial matches. Do not insert fictional profiles, inflate genuine-member counts, route fictional messages to genuine dating, or monetize them while representing the chat as an available date. Future virtual characters must have a separate opt-in area, persistent "Fictional / AI / Human-operated / No physical meetings" labels, explicit pre-purchase consent, adult and content protections, vetted operator access boundaries, provider approval and revised approved Terms. Draft legal notices must remain visibly draft until approved.

## Release gate

**NO-GO for changing `sincera.chat` DNS, merging as a production replacement, bulk migrating members, enabling live payments, or enabling fictional human/AI operators** until the above rows and flows have actual evidence. A Vercel READY state, passing unit tests and 0 Bubble editor issues do not demonstrate full secure functional parity. Migration ledger versions for the connected `humbble` project also differ from the repository's numbered SQL filenames; reconcile history before using automated schema promotion.

Full parity requires desktop and phone screenshots from Bubble Live vs exact-head Expo Preview at identical viewport sizes; responsive screenshot diffs; all field labels and error states; accessibility/touch checks; QA using two authorized accounts; and approved data/identity cutover with rollback proof.
