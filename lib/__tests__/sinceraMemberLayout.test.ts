import { getMemberCardWidth, getMemberColumns, showCompactMemberPageIntro } from '../sinceraMemberLayout';
describe('Sincera Bubble authenticated three-column grid layout', () => {
  test.each([[390,1],[700,1],[760,2],[1020,2],[1024,3],[1440,3]])('at %ipx chooses %i columns', (width,expected) => {
    expect(getMemberColumns(width)).toBe(expected);
  });
  test.each([390,700,760,1020,1024,1440])('cards fit inside the member page rail at %ipx', width => {
    const columns=getMemberColumns(width);
    const card=getMemberCardWidth(width,columns);
    const rail=Math.min(width,1120)-44;
    expect(card).toBeGreaterThan(0);
    expect(card*columns+16*(columns-1)).toBeLessThanOrEqual(rail+0.001);
  });
});

describe('Bubble Live responsive member intro', () => {
  it.each([[320,false],[390,false],[759,false],[760,true],[1024,true],[1440,true]] as const)('shows introductory page chrome at %i px: %s', (width, visible) => {
    expect(showCompactMemberPageIntro(width)).toBe(visible);
  });
});
