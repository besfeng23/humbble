/** Bubble Live member page grid: a single card on phones, two on tablets,
 * and three across on wide web. The 1120px content rail and 22px gutters
 * are read from Bubble's authenticated page tree (2026-10-31).
 */
export function getMemberColumns(viewportWidth: number): number {
  return viewportWidth >= 1020 ? 3 : viewportWidth >= 680 ? 2 : 1;
}
export function getMemberCardWidth(viewportWidth: number, columns = getMemberColumns(viewportWidth), gap = 16, gutter = 22): number {
  const rail = Math.max(0, Math.min(viewportWidth, 1120) - gutter * 2);
  return Math.max(0, (rail - gap * (columns - 1)) / columns);
}
