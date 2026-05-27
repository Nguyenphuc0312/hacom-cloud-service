/**
 * Hook to monitor token expiry and trigger re-authentication
 * before the token actually expires
 */
import { useEffect, useRef } from 'react';

import { useAuthStore } from '@/store/authStore/authStore';
import { getTokenExpiryInfo } from '@/utils/token.utils';

const TOKEN_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

export const useTokenExpiryMonitor = (onTokenExpiringSoon?: () => void) => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const hasWarnedRef = useRef(false);

  useEffect(() => {
    if (!accessToken) {
      hasWarnedRef.current = false;
      return;
    }

    const checkTokenExpiry = () => {
      const expiryInfo = getTokenExpiryInfo(accessToken);

      // Token already expired - force logout
      if (expiryInfo.isExpired) {
        console.warn('[TokenExpiry] Token expired, clearing auth');
        clearAuth();
        return;
      }

      // Token expiring soon - notify callback (debounced)
      if (expiryInfo.isExpiringSoon && !hasWarnedRef.current) {
        hasWarnedRef.current = true;
        console.info(
          `[TokenExpiry] Token expires in ${expiryInfo.expiresInMinutes} minutes`,
        );
        onTokenExpiringSoon?.();
      }

      // Reset warning flag when token is refreshed (new token)
      if (!expiryInfo.isExpiringSoon) {
        hasWarnedRef.current = false;
      }
    };

    // Check immediately
    checkTokenExpiry();

    // Then check periodically
    const intervalId = setInterval(checkTokenExpiry, TOKEN_CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [accessToken, clearAuth, onTokenExpiringSoon]);
};

/**
 * Get token expiry information for display purposes
 */
export const useTokenExpiry = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  return getTokenExpiryInfo(accessToken);
};
