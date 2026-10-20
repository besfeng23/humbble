/** Recursively flatten React Test Renderer children, including nested Text instances. */
export function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (value && typeof value === 'object') {
    const candidate = value as { children?: unknown };
    return candidate.children === undefined ? '' : textContent(candidate.children);
  }
  return '';
}
