/**
 * P4 client billing boundary. The client never decides price or entitlement:
 * it asks the server for premium state and hands checkout to PayPal Sandbox.
 */
import { isSupabaseConfigured, supabase } from './supabase';

export type Market = 'PH' | 'US';
export const PRICE_LABEL: Record<Market, string> = { PH: '₱599 / month', US: 'US$29.99 / month' };

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

export async function startCheckout(market: Market): Promise<{ approvalUrl: string } | { error: string }> {
  if (!isSupabaseConfigured) return { error: 'not_configured' };
  const { data, error } = await supabase.functions.invoke('paypal-create-subscription', { body: { market } });
  if (error || typeof data?.approvalUrl !== 'string') return { error: 'checkout_unavailable' };
  return { approvalUrl: data.approvalUrl };
}

export async function cancelSubscription(): Promise<{ ok: boolean }> {
  if (!isSupabaseConfigured) return { ok: false };
  const { error } = await supabase.functions.invoke('paypal-cancel-subscription', { body: {} });
  return { ok: !error };
}
