import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { supabaseBillingStore } from '../_shared/billingStore.ts';
import { bearerMatches, ConfigError, json, loadPayPalConfig, PayPalClient } from '../_shared/paypal.ts';
import { handleReconcile } from './handler.ts';

// Invoked on a schedule (pg_cron + pg_net, see docs/operations/paypal-sandbox.md) with the service-role
// key as Bearer. Never callable by anon/authenticated users: handleReconcile compares it in constant time.
Deno.serve(async (req) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  // Order: method (405) -> service-role key present (500; the platform always injects it, so this only fires on a
  // broken deployment and reveals nothing an unauthenticated caller can use) -> Bearer match (401) -> PayPal config
  // (503). PayPal config is only loaded after the caller is authenticated, so unauthenticated callers never learn
  // which PayPal settings are missing. handleReconcile re-checks the Bearer (defence in depth).
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!serviceRoleKey) return json(500, { error: 'server_not_configured' });
  if (!bearerMatches(req.headers.get('authorization'), serviceRoleKey)) return json(401, { error: 'unauthorized' });
  let config;
  try { config = loadPayPalConfig((k) => Deno.env.get(k)); }
  catch (e) { return json(503, { error: e instanceof ConfigError ? e.message : 'unavailable' }); }
  if (!url || !serviceRoleKey) return json(500, { error: 'server_not_configured' });
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  try {
    return await handleReconcile(req, { paypal: new PayPalClient(config), store: supabaseBillingStore(db), serviceRoleKey, environment: config.environment });
  } catch { return json(500, { error: 'reconcile_failed' }); }
});
