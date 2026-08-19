/**
 * Normalizes a Nigerian phone number to E.164 (+234XXXXXXXXXX) so lookups
 * match regardless of which form the client typed — local format with the
 * leading 0 (08035550142), the bare national number (8035550142, which is
 * what the mobile login screen's "+234" chip implies the user should type),
 * or an already-international value (+2348035550142 / 2348035550142).
 *
 * Also covers the case of someone typing their local number *with* its
 * leading 0 into a field that already has +234 prepended (2340801234567,
 * 14 digits) — without this, that stray 0 right after the country code
 * would be taken at face value and never match the same account's
 * correctly-normalized +2348012345678.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('2340') && digits.length === 14) {
    return `+234${digits.slice(4)}`;
  }
  if (digits.startsWith('234') && digits.length === 13) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+234${digits}`;
  }
  return `+${digits}`;
}
