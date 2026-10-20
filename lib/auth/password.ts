export type PasswordValidation = 'too_short' | 'mismatch' | null;
export const MIN_PASSWORD_LENGTH = 8;
export function validatePasswordPair(password: string, confirmation: string): PasswordValidation {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too_short';
  if (password !== confirmation) return 'mismatch';
  return null;
}
