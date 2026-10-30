/** Bubble Live uses the member's own dark-mode setting, not device dark mode.
 * Until a preview member preference is implemented and verified, use Sincera's
 * light editorial presentation consistently across native and web.
 */
export function useColorScheme(): "light" { return "light"; }
