import { useState, useCallback, useEffect } from 'react';

/**
 * Hook to persist state in localStorage
 */
export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
  options?: {
    /** If true, reads from localStorage on mount */
    sync?: boolean;
    /** Custom serializer */
    serialize?: (value: T) => string;
    /** Custom deserializer */
    deserialize?: (value: string) => T;
  },
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const { sync = true, serialize = JSON.stringify, deserialize = JSON.parse } = options ?? {};

  // Get initial value from localStorage or use provided initial value
  const getInitialValue = useCallback((): T => {
    if (!sync) return initialValue;

    try {
      const item = localStorage.getItem(key);
      if (item === null) return initialValue;
      return deserialize(item) as T;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  }, [key, initialValue, sync, deserialize]);

  const [state, setState] = useState<T>(getInitialValue);

  // Sync with localStorage on mount (for SSR/hydration)
  useEffect(() => {
    if (!sync) return;

    const item = localStorage.getItem(key);
    if (item !== null) {
      try {
        setState(deserialize(item) as T);
      } catch (error) {
        console.warn(`Error parsing localStorage key "${key}":`, error);
      }
    }
  }, [key, sync, deserialize]);

  // Update localStorage when state changes
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const newValue = value instanceof Function ? value(prev) : value;

        try {
          localStorage.setItem(key, serialize(newValue));
        } catch (error) {
          console.warn(`Error setting localStorage key "${key}":`, error);
        }

        return newValue;
      });
    },
    [key, serialize],
  );

  // Remove from localStorage
  const removeValue = useCallback(() => {
    try {
      localStorage.removeItem(key);
      setState(initialValue);
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  return [state, setValue, removeValue];
}

/**
 * Hook to persist state in sessionStorage
 */
export function useSessionStorageState<T>(
  key: string,
  initialValue: T,
  options?: {
    sync?: boolean;
    serialize?: (value: T) => string;
    deserialize?: (value: string) => T;
  },
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const { sync = true, serialize = JSON.stringify, deserialize = JSON.parse } = options ?? {};

  const getInitialValue = useCallback((): T => {
    if (!sync) return initialValue;

    try {
      const item = sessionStorage.getItem(key);
      if (item === null) return initialValue;
      return deserialize(item) as T;
    } catch (error) {
      console.warn(`Error reading sessionStorage key "${key}":`, error);
      return initialValue;
    }
  }, [key, initialValue, sync, deserialize]);

  const [state, setState] = useState<T>(getInitialValue);

  useEffect(() => {
    if (!sync) return;

    const item = sessionStorage.getItem(key);
    if (item !== null) {
      try {
        setState(deserialize(item) as T);
      } catch (error) {
        console.warn(`Error parsing sessionStorage key "${key}":`, error);
      }
    }
  }, [key, sync, deserialize]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const newValue = value instanceof Function ? value(prev) : value;

        try {
          sessionStorage.setItem(key, serialize(newValue));
        } catch (error) {
          console.warn(`Error setting sessionStorage key "${key}":`, error);
        }

        return newValue;
      });
    },
    [key, serialize],
  );

  const removeValue = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
      setState(initialValue);
    } catch (error) {
      console.warn(`Error removing sessionStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  return [state, setValue, removeValue];
}
