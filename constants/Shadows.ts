import { Platform, type TextStyle, type ViewStyle } from 'react-native';

type ShadowSpec = { color?: string; x?: number; y?: number; opacity: number; radius: number; elevation?: number };

function hexToRgba(color: string, opacity: number): string {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
}

/**
 * Platform-appropriate drop shadow. Web uses CSS `boxShadow` (react-native-web
 * deprecates the `shadow*` props); iOS uses `shadow*`; Android uses `elevation`.
 */
export function shadow({ color = '#000000', x = 0, y = 0, opacity, radius, elevation = 0 }: ShadowSpec): ViewStyle {
  return Platform.select<ViewStyle>({
    web: { boxShadow: `${x}px ${y}px ${radius * 2}px ${hexToRgba(color, opacity)}` } as ViewStyle,
    android: { elevation },
    default: { shadowColor: color, shadowOffset: { width: x, height: y }, shadowOpacity: opacity, shadowRadius: radius, elevation },
  }) as ViewStyle;
}

/** Platform-appropriate text shadow (CSS `textShadow` on web). */
export function textShadow(color: string, x: number, y: number, radius: number): TextStyle {
  return Platform.select<TextStyle>({
    web: { textShadow: `${x}px ${y}px ${radius}px ${color}` } as unknown as TextStyle,
    default: { textShadowColor: color, textShadowOffset: { width: x, height: y }, textShadowRadius: radius },
  }) as TextStyle;
}
