const SECRET_KEYS = ['password', 'pass', 'token', 'secret', 'authorization'];

const shouldMask = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return SECRET_KEYS.some((secretKey) => normalized.includes(secretKey));
};

export const maskSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(maskSecrets);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, itemValue]) => {
        acc[key] = shouldMask(key) ? '********' : maskSecrets(itemValue);
        return acc;
      },
      {},
    );
  }

  return value;
};
