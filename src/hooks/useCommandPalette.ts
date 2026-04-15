import { useCallback, useState } from 'react';

import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';

export const useCommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);

  const openPalette = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setIsOpen(false);
  }, []);

  const togglePalette = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  useKeyboardShortcut({
    key: 'k',
    ctrlOrMeta: true,
    shift: false,
    preventDefault: true,
    onTrigger: openPalette,
  });

  useKeyboardShortcut({
    key: '/',
    preventDefault: true,
    disallowModifiers: true,
    onTrigger: openPalette,
  });

  return {
    isOpen,
    openPalette,
    closePalette,
    togglePalette,
  };
};
