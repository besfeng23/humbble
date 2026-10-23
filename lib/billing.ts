/**
 * P4 client billing boundary. The client never decides price or entitlement:
 * it asks the server for premium state and hands checkout to PayPal Sandbox.
 */
import { deviceLocale } from '@/lib/locale';
import { isSupabaseConfigured, supabase } from './supabase';

export { countryHintFromLocale, deviceLocale } from '@/lib/locale';

/**
 * Billing is PayPal Sandbox only today: the checkout function and the database both refuse live PayPal
 * (live_paypal_refused). Screens that take or manage a payment show this plain notice while it is true.
 * Flip the flag, and remove the notice, in the same change that enables live billing.
 */
export const PAYMENTS_ARE_TEST_ONLY = true;
export const TEST_PAYMENTS_NOTICE = 'Test payments only. No real money is charged.';

export type BillingPlan = { countryCode: string; planKey: string; currency: string; amount: number };

/** Local currency formatting; whole amounts drop the decimals (299 kr, ₱599, £23.99). */
export function formatPrice(amount: number, currency: string, locale: string = deviceLocale()): string {
  const whole = Number.isInteger(amount);
  const opts: Intl.NumberFormatOptions = { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 };
  try { return new Intl.NumberFormat(locale, opts).format(amount); }
  catch { return `${currency} ${whole ? amount.toFixed(0) : amount.toFixed(2)}`; }
}


/** Server-resolved plan for this device's country hint. Price never comes from the client. */
export async function getBillingPlan(countryHint: string | null): Promise<BillingPlan | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('get_billing_plan', { p_country_hint: countryHint ?? undefined });
  const row = (data as { country_code: string; plan_key: string; currency: string; amount: number }[] | null)?.[0];
  if (error || !row) return null;
  return { countryCode: row.country_code, planKey: row.plan_key, currency: row.currency, amount: Number(row.amount) };
}

export type PremiumStatus = {
  isPremium: boolean;
  validUntil: string | null;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
};
export const FREE_STATUS: PremiumStatus = { isPremium: false, validUntil: null, subscriptionStatus: null, cancelAtPeriodEnd: false };

type Row = { is_premium: boolean; valid_until: string | null; subscription_status: string | null; cancel_at_period_end: boolean };
export function toPremiumStatus(row: Row | null | undefined): PremiumStatus {
  if (!row) return FREE_STATUS;
  return { isPremium: row.is_premium === true, validUntil: row.valid_until, subscriptionStatus: row.subscription_status, cancelAtPeriodEnd: row.cancel_at_period_end === true };
}

export async function getPremiumStatus(): Promise<PremiumStatus> {
  if (!isSupabaseConfigured) return FREE_STATUS;
  const { data, error } = await supabase.rpc('get_my_premium_status');
  if (error) return FREE_STATUS; // fail closed
  return toPremiumStatus((data as Row[] | null)?.[0]);
}

export type LikedYouEntry = { profile_id: string; display_name: string; liked_at: string };
export async function getLikedYou(isPremium: boolean): Promise<{ count: number; people: LikedYouEntry[] }> {
  if (!isSupabaseConfigured) return { count: 0, people: [] };
  if (!isPremium) {
    const { data } = await supabase.rpc('get_liked_you_count');
    return { count: typeof data === 'number' ? data : 0, people: [] };
  }
  const { data, error } = await supabase.rpc('get_liked_you');
  if (error) return { count: 0, people: [] };
  const people = (data as LikedYouEntry[] | null) ?? [];
  return { count: people.length, people };
}

export async function startCheckout(countryHint: string | null): Promise<{ approvalUrl: string } | { error: string }> {
  if (!isSupabaseConfigured) return { error: 'not_configured' };
  const { data, error } = await supabase.functions.invoke('paypal-create-subscription', { body: { country: countryHint } });
  if (error || typeof data?.approvalUrl !== 'string') return { error: 'checkout_unavailable' };
  return { approvalUrl: data.approvalUrl };
}

export async function cancelSubscription(): Promise<{ ok: boolean }> {
  if (!isSupabaseConfigured) return { ok: false };
  const { error } = await supabase.functions.invoke('paypal-cancel-subscription', { body: {} });
  return { ok: !error };
}
