import type { ReactNode } from 'react';

import { useCurrentUser } from '@/app/useCurrentUser';
import type { Role } from '@/api/types';
import { PermissionDeniedState } from '@/components/PermissionDeniedState';
import { LoadingState } from '@/components/QueryStates';
import { hasMinimumRole, hasSomeRole } from '@/utils/role';

interface RequireRoleProps {
  children: ReactNode;
  minimumRole?: Role;
  roles?: Role[];
}

export const RequireRole = ({ children, minimumRole, roles }: RequireRoleProps) => {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return <LoadingState tip="Checking access..." />;
  }

  const allowed = minimumRole
    ? hasMinimumRole(user?.role, minimumRole)
    : roles
      ? hasSomeRole(user?.role, roles)
      : true;

  if (!allowed) {
    return <PermissionDeniedState />;
  }

  return children;
};
