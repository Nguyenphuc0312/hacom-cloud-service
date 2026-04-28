import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';

import type { AuthorityListItem } from '@/api/types/authority/authority';
import type { Role } from '@/api/types/auth/auth';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { RowActionsDropdown } from '@/components/RowActionsDropdown/RowActionsDropdown';
import { formatDateTime } from '@/utils/date/date';
import { formatRoleLabel, formatSourceLabel, sourceTone } from '../utils/authorityPageFormatters';

export const useAuthorityColumns = (onOpenDetail: (userId: string) => void) =>
  useMemo<ColumnsType<AuthorityListItem>>(
    () => [
      {
        title: 'Tài khoản',
        key: 'account',
        render: (_, record) => (
          <div className="ds-table-primary-cell">
            <strong>{record.email}</strong>
            <span>{record.username ?? 'Chưa có username'}</span>
          </div>
        ),
      },
      {
        title: 'Vai trò chuẩn',
        dataIndex: 'role',
        width: 160,
        render: (value: Role | null) => (
          <span className="ds-shell-chip ds-shell-chip--ghost">{formatRoleLabel(value)}</span>
        ),
      },
      {
        title: 'Nguồn quyền',
        dataIndex: 'authoritySource',
        width: 160,
        render: (value: string | null) =>
          value ? (
            <span
              className={`ds-shell-chip ${
                sourceTone[value] === 'warning' ? 'ds-shell-chip--warning' : 'ds-shell-chip--ghost'
              }`}
            >
              {formatSourceLabel(value)}
            </span>
          ) : (
            '-'
          ),
      },
      {
        title: 'Quyền hiệu lực',
        key: 'permissions',
        width: 140,
        render: (_, record) => record.effectivePermissions.length,
      },
      {
        title: 'Override',
        dataIndex: 'overrideCount',
        width: 110,
      },
      {
        title: 'Khoảng hiệu lực',
        key: 'window',
        render: (_, record) => (
          <span>
            {record.effectiveFrom ? formatDateTime(record.effectiveFrom) : 'Ngay bây giờ'}
            {' → '}
            {record.effectiveUntil ? formatDateTime(record.effectiveUntil) : 'Không thời hạn'}
          </span>
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 72,
        render: (_, record) => (
          <RowActionsDropdown
            actions={[
              {
                key: 'detail',
                label: 'Mở chi tiết',
                icon: <AppIcon name="eye" size={14} aria-hidden />,
                onClick: () => onOpenDetail(record.userId),
              },
            ]}
          />
        ),
      },
    ],
    [onOpenDetail],
  );

