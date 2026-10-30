import { DATING_NAV_ITEMS } from '../navigation';

describe('Sincera Bubble Live member-navigation parity', () => {
  test('matches Bubble Live five primary destinations in order', () => {
    expect(DATING_NAV_ITEMS.map(item => item.label)).toEqual([
      'Discover', 'Likes', 'Matches', 'Messages', 'Profile',
    ]);
  });
  test('separates Matches from Messages and does not promote redundant Explore tab', () => {
    const paths = DATING_NAV_ITEMS.map(item => item.href);
    expect(new Set(paths).size).toBe(5);
    expect(paths).toContain('/(tabs)/matches');
    expect(paths).toContain('/(tabs)/(chats)');
    expect(DATING_NAV_ITEMS.some(item => item.label === 'Explore')).toBe(false);
  });
});
