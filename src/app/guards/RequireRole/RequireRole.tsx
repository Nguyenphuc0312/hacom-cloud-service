import type { ReactNode } from 'react';

import { useCurrentUser } from '@/app/useCurrentUser/useCurrentUser';
import type { Role } from '@/api/types/auth/auth';
import { PermissionDeniedState } from '@/components/PermissionDeniedState/PermissionDeniedState';
import { LoadingState } from '@/components/QueryStates/QueryStates';
import { hasMinimumRole, hasSomeRole } from '@/utils/role/role';

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
