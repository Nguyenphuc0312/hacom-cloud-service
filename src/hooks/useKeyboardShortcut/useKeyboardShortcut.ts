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
  ignoreWhenTyping?: boolean;
  disallowModifiers?: boolean;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

export const useKeyboardShortcut = ({
  key,
  onTrigger,
  enabled = true,
  preventDefault = false,
  ctrlOrMeta = false,
  shift,
  alt,
  allowRepeat = false,
  ignoreWhenTyping = true,
  disallowModifiers = false,
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

      if (ignoreWhenTyping && isTypingTarget(event.target)) {
        return;
      }

      if (event.key.toLowerCase() !== lowerKey) {
        return;
      }

      if (disallowModifiers && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) {
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
  }, [
    allowRepeat,
    alt,
    ctrlOrMeta,
    disallowModifiers,
    enabled,
    ignoreWhenTyping,
    key,
    preventDefault,
    shift,
  ]);
};
