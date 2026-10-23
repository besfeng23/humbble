# Trust & Safety moderation console (P5-01)

Screens: SCR-23 queue (`app/(admin)/moderation/index.tsx`), SCR-24 case (`app/(admin)/moderation/[reportId].tsx`). The console itself reads and writes **only** through four
SECURITY DEFINER RPCs from migration `20261024000130_moderation_console_rpcs.sql`; it makes no direct table reads.

**Scope of the audit claims (Themis N46-03, corrected).** The "every read is audited" statements below apply **only to the console RPC path**. They are **not** a database-level guarantee:
`audit_events` is closed to `authenticated`, but the pre-existing RLS policies `reports_select_trusted_moderator` and `moderation_cases_select_trusted_moderator`
(`20261020000004_rls_storage_and_hardened_rpcs.sql`) still let any user holding the moderator claim `SELECT` **all** `reports` (including `reporter_id` and the free-text `context_summary`)
and `moderation_cases` directly, with **no audit row** and no reason. Whether to drop those two policies (so the RPCs become the only path) or to accept and monitor direct reads is an
open decision tracked in `docs/operations/launch-blockers.md` (production-enable gates). Until it is decided, treat moderator access as broadly able to read report data, audited only when the console is used.

| RPC | Purpose | Audit row |
| --- | --- | --- |
| `moderation_list_queue(filter, limit, offset)` | Reports (with or without a case), underage always shown urgent; filters `active`, `unopened`, `open`, `in_review`, `resolved`, `appealed`, `closed`, `all` | none (list only; the queue is not audited) |
| `moderation_get_case(report_id)` | One report's case summary, member context and audit history | `moderation.case_viewed` (who looked, when; RPC path only, see scope note above) |
| `moderation_open_case(report_id, reason)` | Idempotently opens a case for a report (`submit_report` does not create one) | `moderation.case_opened` |
| `moderation_take_action(case_id, action, reason)` | `start_review`, `warn`, `suspend`, `dismiss`, `lift_suspension`, `close`; reuses `moderation_transition_case`; suspension flips `profiles.is_suspended` | `moderation.action` + `moderation.case_transition` (actor, reason, before/after) |

## Authorization
Database: `private.is_trusted_moderator()` = JWT `app_metadata.role = 'moderator'` (never `user_metadata`, never `admin`). Anyone else gets `moderator_required` (42501).
Client: `isModeratorRole` mirrors this and only decides whether to show the screen; the database re-checks every call. A moderator must be granted the claim by a project owner in Supabase Auth
(`app_metadata.role = "moderator"`); there is no in-app way to grant it, by design. The self-action guard is narrower than it may sound: a moderator cannot **suspend or lift the suspension of their own account**, but nothing stops a moderator from viewing, opening, starting review of, warning on, dismissing or closing a case in which they are the **reported** member (Themis N46-02, open; see the gates in `launch-blockers.md`). Until that is fixed, a conflicted moderator must recuse by policy, which needs at least two moderators.

## Known gaps (follow-ups, not in P5-01)
- **Suspension did not stop messaging, and the recipient was still pushed (Themis N46-01, HIGH).** `profiles.is_suspended` removes the member from discovery and swipes, but until the fix lands a suspended member can keep
  messaging existing matches through `send_message`/`private.can_send_message`, and `private.enqueue_message_push` then enqueues a push job for the recipient. The fix is a separate migration in PR #50
  (open, **not merged and not applied anywhere** at the time of writing). Do not rely on "suspend" for harassment cases, and do not enable the console in production, until it is merged, applied and proven by pgTAP.
- **A moderator can act on a case about themself** (N46-02): only suspend / lift_suspension are guarded (see Authorization). Open decision/fix before production enable.
- **Direct moderator reads of `reports` / `moderation_cases` are unaudited** (N46-03): see the scope note at the top. `moderation_list_queue` is also not audited.
- **`moderation_transition_case` (pre-existing) stays directly callable by moderators**, bypassing the reason length check, the self-suspend check and the `moderation.action` audit row (it still writes `case_transition`).
- No member-facing notice for warn/suspend, no appeals intake UI, no assignment UI, no legal-hold / evidence-artifact viewer, no session revocation on suspend.
- No human moderator is appointed yet (DEP-SAFE-01); SLA wording (urgent 4h, others 24h) is an internal pilot target pending counsel review.
- Reasons typed by moderators are stored permanently in immutable `audit_events`: record IDs and enums, no personal data beyond IDs (N46-10); retention for these rows is not yet confirmed.
