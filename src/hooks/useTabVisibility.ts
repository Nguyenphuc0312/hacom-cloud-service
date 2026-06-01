/**
 * Hook to detect tab visibility and pause/resume operations
 * when the tab is hidden
 */
import { useEffect, useState } from 'react';

import { isTabActive, onTabVisibilityChange } from '@/api/axios/axios';

export const useTabVisibility = () => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Set initial state
    setIsVisible(isTabActive());

    // Subscribe to visibility changes
    const unsubscribe = onTabVisibilityChange((visible) => {
      setIsVisible(visible);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    isVisible,
    isHidden: !isVisible,
  };
};

/**
 * Hook to get the refetch interval based on tab visibility
 * Returns a shorter interval when tab is hidden to save resources
 */
export const useVisibilityAwareRefetchInterval = (
  activeInterval: number,
  backgroundInterval?: number,
): number => {
  const { isVisible } = useTabVisibility();

  if (!isVisible && backgroundInterval !== undefined) {
    return backgroundInterval;
  }

  return activeInterval;
};

/**
 * Hook to pause operations when tab is hidden
 */
export const usePauseWhenHidden = (
  enabled: boolean = true,
  onPause?: () => void,
  onResume?: () => void,
) => {
  const { isVisible } = useTabVisibility();
  const [wasHidden, setWasHidden] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    if (!isVisible) {
      setWasHidden(true);
      onPause?.();
    } else if (wasHidden) {
      onResume?.();
      setWasHidden(false);
    }
  }, [isVisible, enabled, onPause, onResume, wasHidden]);

  return {
    isVisible,
    isPaused: !isVisible && enabled,
    wasHidden,
  };
};
