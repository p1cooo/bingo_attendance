/** Format Malaysian mobile numbers for display without changing their meaning. */
export function formatMalaysianPhone(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';

  // Accept a Malaysian country code, but keep a familiar local display format.
  const local = digits.startsWith('60') && !digits.startsWith('600')
    ? `0${digits.slice(2)}`
    : digits;

  if (!local.startsWith('01')) return local.slice(0, 11);
  if (local.startsWith('011')) {
    return [local.slice(0, 3), local.slice(3, 7), local.slice(7, 11)]
      .filter(Boolean)
      .join('-');
  }
  return [local.slice(0, 3), local.slice(3, 6), local.slice(6, 10)]
    .filter(Boolean)
    .join('-');
}

export function isValidMalaysianMobile(value: string): boolean {
  return /^01(?:\d{8}|1\d{8})$/.test(String(value || '').replace(/\D/g, ''));
}
