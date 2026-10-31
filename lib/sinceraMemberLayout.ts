/** Bubble Live member page grid: a single card on phones, two on tablets,
 * and three across on wide web. The 1120px content rail and 22px gutters
 * are read from Bubble's authenticated page tree (2026-10-31).
 */
export function getMemberColumns(viewportWidth: number): number {
  return viewportWidth >= 1024 ? 3 : viewportWidth >= 760 ? 2 : 1;
}
export function getMemberCardWidth(viewportWidth: number, columns = getMemberColumns(viewportWidth), gap = 16, gutter = 22): number {
  const rail = Math.max(0, Math.min(viewportWidth, 1120) - gutter * 2);
  return Math.max(0, (rail - gap * (columns - 1)) / columns);
}

/** Available profile-card width inside Bubble's 1120px content rail. */
export function getBubbleGridCardWidth(viewportWidth: number, columns: number): number {
  const available = Math.max(0, Math.min(viewportWidth - 36, 1120) - 32);
  return Math.max(0, (available - (columns - 1) * 14) / columns);
}

/** Bubble Live hides redundant section labels and introductory paragraphs on
 * mobile Discover, Likes, Matches and Messages. Full headers return at 760px.
 * Profile and other pages retain their own visibility decisions.
 */
export function showCompactMemberPageIntro(viewportWidth: number): boolean {
  return viewportWidth >= 760;
}
