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

**Latest addition (October 30, 2026):** `20261030000001_sincera_member_operations.sql` adds member-notification events and idempotent, rate-limited member support tickets with owner-only read policies. Remote migration applied to the separate `humbble` Supabase project (not Bubble Live). GitHub includes an isolated two-account pgTAP suite; consult exact-head CI for results.\n\n**Status legend**: Implemented (route exists but no visual/functional certification), Partially aligned (design/copy revised in this PR but still requires side-by-side and dual-member tests), Missing (no equivalent independent screen), Security review (privileged or sensitive path requires independent acceptance). Status is intentionally conservative.

| Bubble Live page | GitHub Expo route / counterpart | Current parity |
|---|---|---|
| index | `app/(public)/index.tsx` | Partially aligned: all main public sections and illustrative media ported |
| join | `app/auth/signup.tsx` plus `app/(onboarding)/*` | Partially aligned: Sincera styling/identity; registration and adult proof differ |
| reset_pw | `app/auth/recovery.tsx`, `app/auth/reset-password.tsx` | Implemented, flow and visuals unverified |
| 404 | `app/+not-found.tsx` | Implemented, visual parity unverified |
| discover | `app/(tabs)/people.tsx`, `app/(tabs)/discover.tsx`, `components/discovery/DiscoveryFeed.tsx` | Partially aligned; live filter behavior not equivalent |
| liked_you | `app/(tabs)/index.tsx` | Partially aligned; preview payment upsells cannot sell |
| matches | `app/(tabs)/(chats)/match.tsx` | Implemented, dedicated match-list behavior unverified |
| messages | `app/(tabs)/(chats)/index.tsx` | Partially aligned; no cross-app inbox migration |
| conversation | `app/(tabs)/(chats)/[conversationId].tsx` | Implemented, private message safety and state tests pending |
| member_profile | `app/(tabs)/discover/[id].tsx` | Implemented, field/photo permissions and visuals unverified |
| my_profile | `app/(tabs)/profile.tsx` | Partially aligned: live Supabase profile state replaces demo avatar/identity, fake entitlements removed |
| preferences | `app/(tabs)/discover/filters.tsx` | Incomplete: current RPC supports age, Bubble has many more filters |
| account_settings | `app/(tabs)/profile/settings.tsx` | Partially aligned: unsupported switches explicitly disabled |
| privacy_settings | `app/(tabs)/profile/settings.tsx` and data requests | Incomplete: do not claim unsupported consent or privacy options work |
| membership | `app/(paywall)/billing.tsx` and `upgrade.tsx` | Blocked by provider/legal acceptance; no Live Sincera charge |
| pricing | `app/(public)/pricing.tsx` | Partially aligned: Sincera brand, proposals, paid CTA disabled |
| notifications | `app/(tabs)/notifications.tsx` + notification settings | Partially aligned: owner-only in-app activity and read state implemented; historic Bubble notifications not migrated |
| verification | `app/(onboarding)/verify.tsx` | Security review: provider/manual selfie flow not identical |
| verification_review | `app/(admin)/moderation/*` | Security review: human reviewer-only authorization and evidence required |
| safety | `app/(safety)/report-modal.tsx`, blocked users, legal guidance | Incomplete: report/block core exists; standalone safety center missing |
| moderator_queue | `app/(admin)/moderation/*` | Security review: queues and reviewer decisions not equivalent |
| admin_dashboard | `app/(admin)/dashboard.tsx` plus moderation routes | Partially aligned: moderator-only read-only triage snapshot; account access, subscriptions, affiliates, and full audit dashboards remain missing |
| how_it_works | `app/(public)/how-it-works.tsx` | Partially aligned: 5-step explanation ported |
| faq_help | `app/(public)/faq.tsx` | Partially aligned: core FAQ ported |
| contact_support | `app/(public)/contact-support.tsx` and authenticated Supabase support RPC | Partially aligned: signed-in requests saved and rate-limited; public guest form and staff response workflow remain incomplete |
| community_guidelines | `app/(public)/legal/[slug].tsx` | Incomplete: legal copy differs and requires counsel approval |
| terms_of_service | `app/(public)/legal/[slug].tsx` | Incomplete: existing Humbble terms must **not** be represented as Sincera approved legal terms |
| privacy_policy | `app/(public)/legal/[slug].tsx` | Incomplete: legal policy + retention review required |
| cookie_tracking_notice | No equivalent consent-managed notice | Missing |
| affiliate_program | No standalone vetted partner application/approval route | Missing |
| referrals | Attribution library and referral DB records exist, but no member invitation dashboard equivalent | Missing |

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

## Product-model discrepancy: fictional entertainment

Owner's planned future model includes non-explicit AI and paid human-operated fictional profiles, separate from genuine member dating. **This feature is not yet implemented in either reviewed Live or Expo product.**

Bubble Live currently represents itself as a real-member dating product, and its draft Terms explicitly prohibit artificial matches. Do not insert fictional profiles, inflate genuine-member counts, route fictional messages to genuine dating, or monetize them while representing the chat as an available date. Future virtual characters must have a separate opt-in area, persistent "Fictional / AI / Human-operated / No physical meetings" labels, explicit pre-purchase consent, adult and content protections, vetted operator access boundaries, provider approval and revised approved Terms. Draft legal notices must remain visibly draft until approved.

## Release gate

**NO-GO for changing `sincera.chat` DNS, merging as a production replacement, bulk migrating members, enabling live payments, or enabling fictional human/AI operators** until the above rows and flows have actual evidence. A Vercel READY state, passing unit tests and 0 Bubble editor issues do not demonstrate full secure functional parity. Migration ledger versions for the connected `humbble` project also differ from the repository's numbered SQL filenames; reconcile history before using automated schema promotion.

Full parity requires desktop and phone screenshots from Bubble Live vs exact-head Expo Preview at identical viewport sizes; responsive screenshot diffs; all field labels and error states; accessibility/touch checks; QA using two authorized accounts; and approved data/identity cutover with rollback proof.
