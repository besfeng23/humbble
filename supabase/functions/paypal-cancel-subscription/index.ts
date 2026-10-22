import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { supabaseBillingStore } from '../_shared/billingStore.ts';
import { ConfigError, json, loadPayPalConfig, PayPalClient } from '../_shared/paypal.ts';
import { handleCancel } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function authenticate(req: Request): Promise<string | null> {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const { data, error } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(header.slice(7));
  return error ? null : data.user?.id ?? null;
}

Deno.serve(async (req) => {
  let config;
  try { config = loadPayPalConfig((k) => Deno.env.get(k)); }
  catch (e) { return json(503, { error: e instanceof ConfigError ? e.message : 'unavailable' }); }
  const db = createClient(url, service, { auth: { persistSession: false } });
  try {
    return await handleCancel(req, {
      paypal: new PayPalClient(config), store: supabaseBillingStore(db), authenticate,
    });
  } catch { return json(502, { error: 'billing_unavailable' }); }
});
