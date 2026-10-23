import { isUuidV4String, secureRandomUuid, SecureRandomUnavailableError } from '../secureUuid';

const g = globalThis as any;
const realCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const hadExpo = Object.getOwnPropertyDescriptor(globalThis, 'expo');
const setCrypto = (v: unknown) => Object.defineProperty(globalThis, 'crypto', { value: v, configurable: true, writable: true });
const setExpo = (v: unknown) => Object.defineProperty(globalThis, 'expo', { value: v, configurable: true, writable: true });

afterEach(() => {
  if (realCrypto) Object.defineProperty(globalThis, 'crypto', realCrypto); else delete g.crypto;
  if (hadExpo) Object.defineProperty(globalThis, 'expo', hadExpo); else delete g.expo;
  jest.restoreAllMocks();
});

describe('secureRandomUuid (Themis N45-06)', () => {
  test('uses the platform CSPRNG (crypto.randomUUID) and returns distinct v4 UUIDs', () => {
    const a = secureRandomUuid();
    const b = secureRandomUuid();
    expect(isUuidV4String(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  test('uses crypto.randomUUID when present', () => {
    const randomUUID = jest.fn(() => '11111111-2222-4333-8444-555555555555');
    setCrypto({ randomUUID });
    expect(secureRandomUuid()).toBe('11111111-2222-4333-8444-555555555555');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  test('falls back to getRandomValues and sets the v4 / variant bits', () => {
    setCrypto({ getRandomValues: (a: Uint8Array) => { a.fill(0xff); return a; } });
    const id = secureRandomUuid();
    expect(isUuidV4String(id)).toBe(true);
    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  test('falls back to the native Expo generator (globalThis.expo.uuidv4) when there is no crypto global', () => {
    setCrypto(undefined);
    setExpo({ uuidv4: () => '9f8e7d6c-1111-4222-8333-444455556666' });
    expect(secureRandomUuid()).toBe('9f8e7d6c-1111-4222-8333-444455556666');
  });

  test('rejects a malformed value from a generator instead of using it', () => {
    setCrypto(undefined);
    setExpo({ uuidv4: () => 'not-a-uuid' });
    expect(() => secureRandomUuid()).toThrow(SecureRandomUnavailableError);
  });

  test('NEVER falls back to Math.random: with no CSPRNG it throws', () => {
    const rnd = jest.spyOn(Math, 'random');
    setCrypto(undefined);
    setExpo(undefined);
    expect(() => secureRandomUuid()).toThrow(SecureRandomUnavailableError);
    expect(rnd).not.toHaveBeenCalled();
  });

  test('does not touch Math.random on the normal path either', () => {
    const rnd = jest.spyOn(Math, 'random');
    secureRandomUuid();
    expect(rnd).not.toHaveBeenCalled();
  });
});
