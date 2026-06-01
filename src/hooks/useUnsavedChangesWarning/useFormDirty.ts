import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to track form dirty state
 */
export function useFormDirty<T extends Record<string, unknown>>(
  initialValues: T,
  currentValues: T,
  options?: {
    /** Custom equality function */
    isEqual?: (a: T, b: T) => boolean;
    /** Debounce ms before marking as dirty */
    debounceMs?: number;
  },
) {
  const { isEqual, debounceMs = 0 } = options ?? {};

  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const checkDirty = () => {
      const equalFn = isEqual ?? ((a: T, b: T) => JSON.stringify(a) === JSON.stringify(b));
      const dirty = !equalFn(initialValues, currentValues);
      setIsDirty(dirty);
    };

    if (debounceMs > 0) {
      const timer = setTimeout(checkDirty, debounceMs);
      return () => clearTimeout(timer);
    } else {
      checkDirty();
    }
  }, [initialValues, currentValues, isEqual, debounceMs]);

  return isDirty;
}

/**
 * Hook to reset form to initial values
 */
export function useFormReset<T extends Record<string, unknown>>(
  initialValues: T,
  onReset: (values: T) => void,
) {
  return useCallback(() => {
    onReset(initialValues);
  }, [initialValues, onReset]);
}
