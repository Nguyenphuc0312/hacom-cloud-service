import { useCallback, useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Hook to track unsaved changes and show browser warning when user tries to navigate away
 */
export function useUnsavedChangesWarning(isDirty: boolean, options?: {
  /** Custom message to show in browser confirmation */
  message?: string;
  /** Callback when navigation is blocked */
  onBlock?: () => void;
}) {
  const { message = 'Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời khỏi trang này?', onBlock } = options ?? {};
  const [showWarning, setShowWarning] = useState(false);

  // Use React Router's useBlocker for in-app navigation
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      onBlock?.();
      setShowWarning(true);
    }
  }, [blocker.state, onBlock]);

  // Handle browser back/refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, message]);

  const confirmNavigation = useCallback(() => {
    blocker.proceed?.();
    setShowWarning(false);
  }, [blocker]);

  const cancelNavigation = useCallback(() => {
    blocker.reset?.();
    setShowWarning(false);
  }, [blocker]);

  return {
    isBlocked: blocker.state === 'blocked',
    showWarning,
    confirmNavigation,
    cancelNavigation,
  };
}
