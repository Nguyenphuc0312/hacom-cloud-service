import type { ReactNode } from 'react';
import { Button, Tooltip } from 'antd';

import { AppIcon } from '@/components/AppIcon/AppIcon';
import { StatusBadge } from '@/components/StatusBadge/StatusBadge';
import { formatDateTime } from '@/utils/date/date';
import { formatNumber } from '@/utils/formatters/formatters';

/**
 * Standard column types for admin tables
 */
export type ColumnTypeValue = 'text' | 'badge' | 'avatar' | 'datetime' | 'actions' | 'copy' | 'number';

/**
 * Render a text value
 */
export const renderText = (value: unknown, format?: 'number' | 'string'): ReactNode => {
  if (value === null || value === undefined) {
    return <span className="text-muted">-</span>;
  }
  if (format === 'number' && typeof value === 'number') {
    return formatNumber(value);
  }
  return String(value);
};

/**
 * Render a status badge
 */
export const renderBadge = (status: string | boolean | null | undefined): ReactNode => {
  return <StatusBadge status={status} />;
};

/**
 * Render an avatar with name
 */
export const renderAvatar = (
  avatar: { src?: string; name: string } | null | undefined,
): ReactNode => {
  if (!avatar) {
    return <span className="text-muted">-</span>;
  }

  const initials = avatar.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (avatar.src) {
    return (
      <div className="admin-avatar">
        <img src={avatar.src} alt={avatar.name} className="admin-avatar-img" />
        <span className="admin-avatar-name">{avatar.name}</span>
      </div>
    );
  }

  return (
    <div className="admin-avatar">
      <div className="admin-avatar-initials">{initials}</div>
      <span className="admin-avatar-name">{avatar.name}</span>
    </div>
  );
};

/**
 * Render a datetime value
 */
export const renderDateTime = (value: string | Date | null | undefined): ReactNode => {
  if (!value) {
    return <span className="text-muted">-</span>;
  }
  const dateValue = typeof value === 'string' ? value : value.toISOString();
  return (
    <Tooltip title={new Date(dateValue).toLocaleString('vi-VN')}>
      <span>{formatDateTime(dateValue)}</span>
    </Tooltip>
  );
};

/**
 * Render a copyable value
 */
export const renderCopyable = (
  value: string,
  onCopy?: () => void,
  maxLength = 50,
): ReactNode => {
  if (!value) {
    return <span className="text-muted">-</span>;
  }

  const displayValue = value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

  return (
    <div className="admin-copy-cell">
      <span className="admin-copy-value">{displayValue}</span>
      <Tooltip title="Sao chép">
        <Button
          type="text"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(value);
            onCopy?.();
          }}
          className="admin-copy-btn"
          icon={<AppIcon name="copy" size={12} />}
        />
      </Tooltip>
    </div>
  );
};

/**
 * Action item for row actions column
 */
export interface RowAction<T = unknown> {
  key: string;
  label: string;
  icon?: 'check' | 'alert' | 'lock' | 'unlock' | 'archive' | 'eye' | 'activity' | 'access' | 'messages' | 'user';
  danger?: boolean;
  disabled?: boolean;
  onClick: (record: T) => void;
}

/**
 * Render row actions as buttons
 */
export function renderRowActions<T extends object>(
  actions: RowAction<T>[],
): ReactNode {
  return (
    <div className="admin-row-actions">
      {actions.map((action) => (
        <Tooltip key={action.key} title={action.disabled ? undefined : action.label}>
          <Button
            type="text"
            size="small"
            danger={action.danger}
            disabled={action.disabled}
            icon={action.icon ? <AppIcon name={action.icon} size={14} /> : undefined}
            onClick={(e) => {
              e.stopPropagation();
              action.onClick(actions[0] as unknown as T);
            }}
          >
            {!action.icon && action.label}
          </Button>
        </Tooltip>
      ))}
    </div>
  );
}
