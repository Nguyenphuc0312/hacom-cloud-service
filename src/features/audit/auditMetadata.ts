const sensitiveMetadataKey = /authorization|cookie|credential|password|secret|token|api[_-]?key/i;

export const sanitizeMetadataForDisplay = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizeMetadataForDisplay);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      sensitiveMetadataKey.test(key) ? '[REDACTED]' : sanitizeMetadataForDisplay(nestedValue),
    ]),
  );
};
