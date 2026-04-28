import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { QueryStateView } from '@/components/QueryStates/QueryStates';
import { useAccessStatus } from '@/app/useAccessStatus/useAccessStatus';
import { useAuthStore } from '@/store/authStore/authStore';

interface RequireApprovedAccessProps {
  children: ReactElement;
}

export const RequireApprovedAccess = ({ children }: RequireApprovedAccessProps) => {
  const location = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const { access, isLoading } = useAccessStatus();

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (isLoading || !access) {
    return <QueryStateView kind="loading" title="Dang kiem tra quyen truy cap..." />;
  }

  if (access.status !== 'approved') {
    return <Navigate to="/access" replace state={{ from: location }} />;
  }

  return children;
};
