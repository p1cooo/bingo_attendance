/**
 * Utility functions for validating and standardizing phone numbers for WhatsApp Cloud API.
 * WhatsApp requires international E.164 format (e.g. +60123456789).
 */

export interface PhoneValidationResult {
  isValid: boolean;
  formattedNumber: string; // Standard E.164 format with leading +
  rawInput: string;
  error?: string;
}

export function sanitizeAndValidatePhone(phoneRaw?: string | null): PhoneValidationResult {
  const raw = (phoneRaw || '').trim();

  if (!raw) {
    return {
      isValid: false,
      formattedNumber: '',
      rawInput: '',
      error: 'Parent phone number is missing or empty',
    };
  }

  // Strip all whitespace, hyphens, brackets, parentheses, dots
  let cleaned = raw.replace(/[\s\-\(\)\.\,\/]/g, '');

  // Check for invalid characters
  if (!/^\+?[0-9]+$/.test(cleaned)) {
    return {
      isValid: false,
      formattedNumber: raw,
      rawInput: raw,
      error: 'Phone number contains invalid non-numeric characters',
    };
  }

  let standardized = cleaned;

  // Handle Malaysian Local Mobile Numbers (Academy Location: Malaysia)
  // Format: 010, 011, 012, 013, 014, 015, 016, 017, 018, 019
  if (cleaned.startsWith('01') && cleaned.length >= 10 && cleaned.length <= 11) {
    standardized = `+60${cleaned.substring(1)}`;
  } else if (cleaned.startsWith('601') && (cleaned.length === 11 || cleaned.length === 12)) {
    standardized = `+${cleaned}`;
  } else if (cleaned.startsWith('+601') && (cleaned.length === 12 || cleaned.length === 13)) {
    standardized = cleaned;
  } else if (cleaned.startsWith('+')) {
    // Other international number with explicit '+' (e.g. +65 91234567, +1 4155552671)
    const digitsOnly = cleaned.substring(1);
    if (digitsOnly.length < 8 || digitsOnly.length > 15) {
      return {
        isValid: false,
        formattedNumber: cleaned,
        rawInput: raw,
        error: `International phone length (${digitsOnly.length} digits) is outside valid E.164 range (8-15 digits)`,
      };
    }
    standardized = cleaned;
  } else if (cleaned.length >= 8 && cleaned.length <= 15) {
    // Numeric string without '+'. If starts with known country code e.g. 65 (Singapore) or other
    standardized = `+${cleaned}`;
  } else {
    return {
      isValid: false,
      formattedNumber: cleaned,
      rawInput: raw,
      error: 'Invalid phone number length for WhatsApp delivery',
    };
  }

  // Final check: must be '+<digits>' with 8 to 15 digits
  const digitCount = standardized.replace(/\D/g, '').length;
  if (digitCount < 8 || digitCount > 15) {
    return {
      isValid: false,
      formattedNumber: standardized,
      rawInput: raw,
      error: `Standardized number ${standardized} has invalid digit count (${digitCount})`,
    };
  }

  return {
    isValid: true,
    formattedNumber: standardized,
    rawInput: raw,
  };
}
