import { getMemberCardWidth, getMemberColumns } from '../sinceraMemberLayout';
describe('Sincera Bubble authenticated three-column grid layout', () => {
  test.each([[390,1],[768,2],[1440,3]])('at %ipx chooses %i columns', (width,expected) => {
    expect(getMemberColumns(width)).toBe(expected);
  });
  test.each([390,768,1024,1440])('cards fit inside the member page rail at %ipx', width => {
    const columns=getMemberColumns(width);
    const card=getMemberCardWidth(width,columns);
    const rail=Math.min(width,1120)-44;
    expect(card).toBeGreaterThan(0);
    expect(card*columns+16*(columns-1)).toBeLessThanOrEqual(rail+0.001);
  });
});
