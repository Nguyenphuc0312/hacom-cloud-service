import React from 'react';

import { AppIcon } from '@/components/AppIcon';
import { IconActionButton } from '@/components/IconActionButton';
import { UserMenu } from '@/components/UserMenu';
import type { CurrentAdmin } from '@/api/types';

interface TopbarActionsProps {
  user: CurrentAdmin | null;
  environmentLabel?: string;
  systemTone: 'healthy' | 'degraded';
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export const TopbarActions: React.FC<TopbarActionsProps> = ({
  user,
  environmentLabel = 'Production',
  systemTone,
  onOpenNotifications,
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
          {systemTone === 'healthy' ? 'Ổn định' : 'Suy giảm'}
        </span>
      </div>
      <IconActionButton
        icon={<AppIcon name="bell" size={16} aria-hidden />}
        tooltip="Thông báo"
        onClick={onOpenNotifications}
      />
      <UserMenu
        user={user}
        onOpenProfile={onOpenProfile}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
      />
    </div>
  );
};
