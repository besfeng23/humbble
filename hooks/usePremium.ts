import { useCallback, useEffect, useState } from 'react';
import { FREE_STATUS, getPremiumStatus, type PremiumStatus } from '@/lib/billing';

/** Server-derived premium state; defaults to free (fail closed) until loaded. */
export function usePremium() {
  const [status, setStatus] = useState<PremiumStatus>(FREE_STATUS);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setStatus(await getPremiumStatus()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { ...status, loading, refresh };
}
