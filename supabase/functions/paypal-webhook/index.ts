import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { supabaseBillingStore } from '../_shared/billingStore.ts';
import { ConfigError, json, loadPayPalConfig, PayPalClient } from '../_shared/paypal.ts';
import { handleWebhook } from './handler.ts';

Deno.serve(async (req) => {
  let paypal: PayPalClient;
  try { paypal = new PayPalClient(loadPayPalConfig((k) => Deno.env.get(k))); }
  catch (e) { return json(503, { error: e instanceof ConfigError ? e.message : 'unavailable' }); }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try { return await handleWebhook(req, { paypal, store: supabaseBillingStore(db) }); }
  catch { return json(500, { error: 'processing_failed' }); } // PayPal retries; ledger stays idempotent.
});
