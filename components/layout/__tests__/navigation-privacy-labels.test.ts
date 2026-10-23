import { SETTINGS_NAV_ITEMS } from '../navigation';

describe('settings nav labels for the privacy request screen (Themis N45-02)', () => {
  const item = SETTINGS_NAV_ITEMS.find((i) => i.id === 'settings-privacy-delete');

  test('the item still points at the privacy screen', () => {
    expect(item?.href).toBe('/(tabs)/profile/privacy-delete');
  });

  test('label and accessibility label describe a request, not self-service deletion', () => {
    const all = `${item?.label} | ${item?.accessibilityLabel}`;
    expect(all).not.toMatch(/self-service/i);
    expect(item?.label).toBe('Data requests');
    expect(item?.accessibilityLabel).toMatch(/^Request a data export or account deletion$/);
  });
});
