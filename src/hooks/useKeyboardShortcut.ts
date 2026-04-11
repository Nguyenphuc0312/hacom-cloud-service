import { useEffect, useRef } from 'react';

interface UseKeyboardShortcutOptions {
  key: string;
  onTrigger: () => void;
  enabled?: boolean;
  preventDefault?: boolean;
  ctrlOrMeta?: boolean;
  shift?: boolean;
  alt?: boolean;
  allowRepeat?: boolean;
}

export const useKeyboardShortcut = ({
  key,
  onTrigger,
  enabled = true,
  preventDefault = false,
  ctrlOrMeta = false,
  shift,
  alt,
  allowRepeat = false,
}: UseKeyboardShortcutOptions) => {
  const triggerRef = useRef(onTrigger);

  useEffect(() => {
    triggerRef.current = onTrigger;
  }, [onTrigger]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const lowerKey = key.toLowerCase();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!allowRepeat && event.repeat) {
        return;
      }

      if (event.key.toLowerCase() !== lowerKey) {
        return;
      }

      if (ctrlOrMeta && !(event.ctrlKey || event.metaKey)) {
        return;
      }

      if (typeof shift === 'boolean' && event.shiftKey !== shift) {
        return;
      }

      if (typeof alt === 'boolean' && event.altKey !== alt) {
        return;
      }

      if (preventDefault) {
        event.preventDefault();
      }

      triggerRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allowRepeat, alt, ctrlOrMeta, enabled, key, preventDefault, shift]);
};
