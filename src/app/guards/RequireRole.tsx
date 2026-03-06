import { Result } from 'antd';
import type { ReactNode } from 'react';

import { LoadingState } from '@/components/QueryStates';
import { useCurrentUser } from '@/app/useCurrentUser';
import type { Role } from '@/api/types';
import { hasMinimumRole, hasSomeRole } from '@/utils/role';

interface RequireRoleProps {
  children: ReactNode;
  minimumRole?: Role;
  roles?: Role[];
}

export const RequireRole = ({ children, minimumRole, roles }: RequireRoleProps) => {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return <LoadingState tip="Đang kiểm tra quyền truy cập..." />;
  }

  const allowed = minimumRole
    ? hasMinimumRole(user?.role, minimumRole)
    : roles
      ? hasSomeRole(user?.role, roles)
      : true;

  if (!allowed) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="Bạn không có quyền truy cập trang này."
      />
    );
  }

  return children;
};
