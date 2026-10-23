# Trust & Safety moderation console (P5-01)

Screens: SCR-23 queue (`app/(admin)/moderation/index.tsx`), SCR-24 case (`app/(admin)/moderation/[reportId].tsx`). Both read and write **only** through four
SECURITY DEFINER RPCs from migration `20261024000130_moderation_console_rpcs.sql`; there are no direct table reads, so `audit_events` and `reports` stay closed to `authenticated`.

| RPC | Purpose | Audit row |
| --- | --- | --- |
| `moderation_list_queue(filter, limit, offset)` | Reports (with or without a case), underage always shown urgent; filters `active/unopened/in_review/resolved/closed/all` | none (list only) |
| `moderation_get_case(report_id)` | One report's case summary, member context and audit history | `moderation.case_viewed` (who looked, when) |
| `moderation_open_case(report_id, reason)` | Idempotently opens a case for a report (`submit_report` does not create one) | `moderation.case_opened` |
| `moderation_take_action(case_id, action, reason)` | `start_review`, `warn`, `suspend`, `dismiss`, `lift_suspension`, `close`; reuses `moderation_transition_case`; suspension flips `profiles.is_suspended` | `moderation.action` + `moderation.case_transition` (actor, reason, before/after) |

## Authorization
Database: `private.is_trusted_moderator()` = JWT `app_metadata.role = 'moderator'` (never `user_metadata`, never `admin`). Anyone else gets `moderator_required` (42501).
Client: `isModeratorRole` mirrors this and only decides whether to show the screen; the database re-checks every call. A moderator must be granted the claim by a project owner in Supabase Auth
(`app_metadata.role = "moderator"`); there is no in-app way to grant it, by design. A moderator cannot suspend or restore their own account.

## Known gaps (follow-ups, not in P5-01)
- **Suspension does not stop messaging.** `profiles.is_suspended` removes the member from discovery and swipes, but `private.can_send_message` / `send_message` do not check it, so a suspended member can keep
  messaging existing matches. Close this before relying on "suspend" for harassment cases (separate migration touching the messaging path).
- No member-facing notice for warn/suspend, no appeals intake UI, no assignment UI, no legal-hold / evidence-artifact viewer, no session revocation on suspend.
- No human moderator is appointed yet (DEP-SAFE-01); SLA wording (urgent 4h, others 24h) is an internal pilot target pending counsel review.
