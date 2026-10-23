/**
 * Cryptographically strong random v4 UUID, used for the privacy-request idempotency key (Themis N45-06).
 *
 * Sources, in order (all CSPRNG-backed):
 *   1. `globalThis.crypto.randomUUID()` (web, Node/Jest).
 *   2. `globalThis.crypto.getRandomValues()` (web/Node; also any runtime that installs the polyfill).
 *   3. `globalThis.expo.uuidv4()`: the native generator that the Expo runtime installs on iOS/Android
 *      (`expo-modules-core`, shipped with `expo`; Swift `UUID()` / Java `UUID.randomUUID()`). No new package is imported.
 * There is deliberately NO `Math.random` fallback: when no CSPRNG exists this throws, and the caller must fail the
 * request closed rather than mint a predictable key.
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CryptoLike = { randomUUID?: () => string; getRandomValues?: <T extends ArrayBufferView>(a: T) => T };

export class SecureRandomUnavailableError extends Error {
  constructor() {
    super('secure_random_unavailable');
    this.name = 'SecureRandomUnavailableError';
  }
}

export function isUuidV4String(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

export function secureRandomUuid(): string {
  const g = globalThis as unknown as { crypto?: CryptoLike; expo?: { uuidv4?: () => string } };
  const c = g.crypto;
  if (typeof c?.randomUUID === 'function') {
    const id = c.randomUUID();
    if (isUuidV4String(id)) return id.toLowerCase();
  }
  if (typeof c?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  if (typeof g.expo?.uuidv4 === 'function') {
    const id = g.expo.uuidv4();
    if (isUuidV4String(id)) return id.toLowerCase();
  }
  throw new SecureRandomUnavailableError();
}
