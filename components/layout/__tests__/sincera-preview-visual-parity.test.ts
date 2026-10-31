import { Colors } from '@/constants/Colors';
import { getBubbleGridCardWidth } from '@/lib/sinceraMemberLayout';
import { useColorScheme } from '@/hooks/useColorScheme';
import { DATING_NAV_ITEMS } from '../navigation';

describe('Bubble Live member visual baseline in separate Sincera preview', () => {
  it('does not silently substitute device dark mode for the member setting', () => {
    expect(useColorScheme()).toBe('light');
    expect(Colors.light.background).toBe('#FCF8F0');
    expect(Colors.light.primary).toBe('#E7B96A');
  });
  it('preserves the five original member tabs', () => {
    expect(DATING_NAV_ITEMS.map(item=>item.label)).toEqual(['Discover','Likes','Matches','Messages','Profile']);
  });
  it('keeps Discover cards within the content area on phone, tablet and desktop widths', () => {
    for (const [width,columns] of [[390,1],[768,2],[1440,3]] as const) {
      const card=getBubbleGridCardWidth(width,columns);
      const usable=Math.min(width-36,1120)-32;
      expect(card).toBeGreaterThan(0);
      expect(card*columns+(columns-1)*14).toBeLessThanOrEqual(usable+0.001);
    }
  });
});
