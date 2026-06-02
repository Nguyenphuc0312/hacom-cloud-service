/**
 * Vietnamese Unicode Normalization Utility
 *
 * JavaScript's URLSearchParams and string handling may not preserve the correct
 * Unicode Normalization Form for Vietnamese diacritical marks.
 *
 * Vietnamese characters like ậ (U+1EAD) composed form can be decomposed incorrectly,
 * transforming into ạ (U+1EA1) when combining marks are reordered or lost.
 *
 * Solution: Always use NFC (Canonical Decomposition, followed by Canonical Composition)
 * before sending strings in URLs or critical contexts.
 *
 * @see https://unicode.org/reports/tr15/
 */

/**
 * Normalize a string to NFC (Composed) form for proper Vietnamese character handling.
 * This ensures characters like ậ (a + circumflex + grave) remain properly composed.
 *
 * @param value - The string to normalize
 * @returns Normalized string in NFC form
 */
export function normalizeToNFC(value: string | undefined): string | undefined {
  if (!value) return value;
  // Use String.prototype.normalize() to convert to NFC form
  return value.normalize("NFC");
}

/**
 * Create URLSearchParams with NFC-normalized values.
 * Ensures Vietnamese text in query strings is encoded correctly.
 *
 * @param obj - Object with string values to encode
 * @returns URLSearchParams with normalized values
 */
export function createNormalizedURLSearchParams(
  obj: Record<string, string | undefined>
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(obj)) {
    if (value) {
      params.set(key, normalizeToNFC(value) || value);
    }
  }
  return params;
}

/**
 * Normalize all string values in an object.
 * Useful for API request payloads containing Vietnamese text.
 *
 * @param obj - Object with string values
 * @returns New object with normalized values
 */
export function normalizeObjectValues<T extends Record<string, any>>(
  obj: T
): T {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      normalized[key] = normalizeToNFC(value) || value;
    } else {
      normalized[key] = value;
    }
  }
  return normalized as T;
}
