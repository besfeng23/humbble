/** Client-side cooldown for confirmation-email resends (Supabase also rate-limits server-side). */
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_RESENDS_PER_SESSION = 3;

export function secondsUntilResend(lastSentAt: number | null, now: number, cooldown = RESEND_COOLDOWN_SECONDS): number {
  if (lastSentAt === null) return 0;
  return Math.max(0, Math.ceil((lastSentAt + cooldown * 1000 - now) / 1000));
}

/** Best-effort webmail deep link for the user's provider; falls back to a generic mailto. */
export function mailAppUrl(email: string | null | undefined): string {
  const domain = (email ?? '').split('@')[1]?.toLowerCase() ?? '';
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'https://mail.google.com/mail/u/0/#inbox';
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) return 'https://outlook.live.com/mail/0/inbox';
  if (domain.startsWith('yahoo.')) return 'https://mail.yahoo.com/';
  if (domain === 'icloud.com' || domain === 'me.com') return 'https://www.icloud.com/mail';
  return 'mailto:';
}
