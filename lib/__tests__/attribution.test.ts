import AsyncStorage from '@react-native-async-storage/async-storage';
import { ATTRIBUTION_TTL_MS, captureAttribution, extractAttributionParams, loadAttribution, sanitizeLandingPath, setTrackingConsent, readTrackingConsent } from '@/lib/attribution';
import { mailAppUrl, secondsUntilResend } from '@/lib/auth/resend';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

describe('affiliate attribution capture', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  it('keeps only allowlisted network/tracker params and drops PII-like values', () => {
    expect(extractAttributionParams('?aff_click_id=abc&clickid=c2&sub1=a&sub10=e&sub11=x&aff_sub=s&aff_sub3=t&transaction_id=t1&utm_source=fb&email=a@b.c&sub2=me@x.com&offer_id=9&aff_id=7&click_id=c1&cid=v1&rtkcid=r1&network=voluum'))
      .toEqual({ aff_click_id: 'abc', clickid: 'c2', sub1: 'a', sub10: 'e', aff_sub: 's', aff_sub3: 't', transaction_id: 't1', utm_source: 'fb', offer_id: '9', aff_id: '7', click_id: 'c1', cid: 'v1', rtkcid: 'r1', network: 'voluum' });
  });
  it('stores only the landing path, never a query string', () => {
    expect(sanitizeLandingPath('/?email=a@b.c')).toBe('/');
    expect(sanitizeLandingPath('/auth/signup#x')).toBe('/auth/signup');
  });
  it('first touch wins and expires after 30 days', async () => {
    const t0 = Date.parse('2026-10-01T00:00:00Z');
    await setTrackingConsent('allowed');
    await captureAttribution({ click_id: 'first' }, '/', t0);
    await captureAttribution({ click_id: 'second' }, '/', t0 + 1000);
    expect((await loadAttribution(t0 + 2000))?.params.click_id).toBe('first');
    expect(await loadAttribution(t0 + ATTRIBUTION_TTL_MS + 1)).toBeNull();
  });
  it('defaults to denied, allows only explicit consent, and clears attribution on withdrawal', async () => {
    expect(await readTrackingConsent()).toBeNull();
    expect(await captureAttribution({click_id:'silent'},'/')).toBeNull();
    expect(await loadAttribution()).toBeNull();
    await setTrackingConsent('allowed');
    expect(await readTrackingConsent()).toBe('allowed');
    await captureAttribution({click_id:'approved'},'/');
    expect((await loadAttribution())?.params.click_id).toBe('approved');
    await setTrackingConsent('denied');
    expect(await readTrackingConsent()).toBe('denied');
    expect(await loadAttribution()).toBeNull();
    expect(await captureAttribution({click_id:'blocked'},'/')).toBeNull();
  });
  it('ignores visits with no attribution params', async () => {
    expect(await captureAttribution({ foo: 'bar' }, '/')).toBeNull();
  });
});

describe('confirmation resend helpers', () => {
  it('enforces the cooldown', () => {
    expect(secondsUntilResend(null, 0)).toBe(0);
    expect(secondsUntilResend(0, 30_000)).toBe(30);
    expect(secondsUntilResend(0, 61_000)).toBe(0);
  });
  it('maps common providers to their inbox', () => {
    expect(mailAppUrl('a@gmail.com')).toContain('mail.google.com');
    expect(mailAppUrl('a@example.se')).toBe('mailto:');
  });
});
