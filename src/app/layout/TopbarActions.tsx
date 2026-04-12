import React from 'react';
import { BellOutlined, PlusOutlined } from '@ant-design/icons';

import type { CurrentAdmin } from '@/api/types';
import { UserMenu } from '@/components/UserMenu';

interface TopbarActionsProps {
  user: CurrentAdmin | null;
  environmentLabel?: string;
  systemTone: 'healthy' | 'degraded';
  onOpenNotifications: () => void;
  onOpenQuickAction: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export const TopbarActions: React.FC<TopbarActionsProps> = ({
  user,
  environmentLabel = 'Production',
  systemTone,
  onOpenNotifications,
  onOpenQuickAction,
  onOpenProfile,
  onOpenSettings,
  onLogout,
}) => {
  return (
    <div className="ds-topbar-actions">
      <div className="ds-topbar-status" aria-label="Workspace status">
        <span className="ds-shell-chip">{environmentLabel}</span>
        <span
          className={`ds-shell-chip ${systemTone === 'healthy' ? 'ds-shell-chip--success' : 'ds-shell-chip--warning'}`}
        >
          {systemTone === 'healthy' ? 'Healthy' : 'Degraded'}
        </span>
      </div>
      <button
        type="button"
        className="ds-btn ds-btn--icon"
        aria-label="Notifications"
        onClick={onOpenNotifications}
      >
        <BellOutlined />
      </button>
      <button
        type="button"
        className="ds-btn ds-btn--icon"
        aria-label="Create quick action"
        onClick={onOpenQuickAction}
      >
        <PlusOutlined />
      </button>
      <UserMenu
        user={user}
        onOpenProfile={onOpenProfile}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
      />
    </div>
  );
};
